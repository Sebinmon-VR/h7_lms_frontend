import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { authApi } from '@/api/auth.api'
import { getAccessToken, loadStoredToken, onAuthEvent, setAccessToken } from '@/api/client'
import { ApiError } from '@/api/errors'
import type { LoginRequest, UserOut, UserRole } from '@/api/types'
import { STORAGE_KEYS } from '@/lib/constants'
import { hasProgram } from '@/lib/tuition'
import {
  firebaseAuthMessage,
  firebaseSendPasswordReset,
  firebaseSignInWithGoogle,
  firebaseSignInWithPassword,
  firebaseSignOut,
  isFirebaseReady,
  refreshIdToken,
  subscribeToIdToken,
} from '@/lib/firebase'

/**
 * Resolved once at module load: whether Firebase is configured AND initialised
 * successfully. A config-only check would leave the app booting forever if the
 * SDK failed to start, so this is the flag every branch below reads.
 */
const HAS_FIREBASE = isFirebaseReady()
import { decodeJwt, isExpired, lmsRole, msUntilExpiry } from '@/lib/jwt'

/**
 * Authentication is Firebase-first.
 *
 * The client signs in with the Firebase SDK and sends the resulting ID token
 * as a bearer token; the backend verifies it and resolves the Firestore
 * profile. Firebase refreshes the token roughly every hour on its own, and
 * `subscribeToIdToken` pushes each new one into the API client — so a session
 * no longer dies at the 60-minute mark the way it did against the old
 * backend-signed JWTs.
 *
 * When Firebase is not configured (`HAS_FIREBASE` false) we fall back to the
 * backend's `POST /auth/login` development helper, which exchanges a password
 * for an ID token server-side. That path cannot refresh, so the expiry warning
 * below still applies to it.
 *
 * `degraded` matters: a server error while validating the session must never
 * sign the user out.
 */
export type AuthStatus = 'booting' | 'authenticated' | 'anonymous' | 'degraded'

export type LogoutReason = 'manual' | 'expired' | 'inactive' | 'no-profile'

interface AuthContextValue {
  status: AuthStatus
  user: UserOut | null
  role: UserRole | null
  /** True when /auth/me failed but the token is still believed good. */
  profileDegraded: boolean
  /** True when sign-in runs through the Firebase SDK rather than the dev endpoint. */
  usesFirebase: boolean
  login: (credentials: LoginRequest) => Promise<UserOut | null>
  loginWithGoogle: () => Promise<UserOut | null>
  sendPasswordReset: (email: string) => Promise<void>
  logout: (reason?: LogoutReason) => void
  retryBoot: () => void
  /** Milliseconds until the token expires, or null when unknown. */
  expiresInMs: number | null
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

/**
 * What an interactive sign-in yields. `profileHint` is only present on the
 * dev-endpoint path, which returns role and name alongside the token; the
 * Firebase path has to ask `/auth/me` for those.
 */
interface SignInResult {
  token: string
  profileHint?: { user_id: number; full_name: string; role: UserRole }
}

/** Minimal user synthesized from the token if /auth/me is unavailable. */
function userFromToken(
  token: string,
  fallback?: { user_id: number; full_name: string; role: UserRole },
): UserOut | null {
  const claims = decodeJwt(token)
  const role = fallback?.role ?? lmsRole(token)
  // Without a role we cannot route or gate anything, so there is no usable
  // fallback profile — the caller must treat this as a failed sign-in.
  if (!role) return null

  return {
    id: fallback?.user_id ?? Number(claims?.lms_user_id ?? 0),
    full_name: fallback?.full_name ?? claims?.email ?? 'Account',
    email: claims?.email ?? '',
    role,
    is_active: true,
    created_at: new Date().toISOString(),
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = React.useState<AuthStatus>('booting')
  const [user, setUser] = React.useState<UserOut | null>(null)
  const [profileDegraded, setProfileDegraded] = React.useState(false)
  const [expiresInMs, setExpiresInMs] = React.useState<number | null>(null)
  const [bootNonce, setBootNonce] = React.useState(0)

  /**
   * Set while an interactive sign-in is running. The Firebase token listener
   * fires mid-flow, and without this it would race the login call and boot the
   * user twice — once from a bare token, once with the resolved profile.
   */
  const signingIn = React.useRef(false)

  const clearSession = React.useCallback(() => {
    setAccessToken(null)
    setUser(null)
    setProfileDegraded(false)
    setExpiresInMs(null)
    queryClient.clear()
    try {
      localStorage.removeItem(STORAGE_KEYS.session)
    } catch {
      /* private mode */
    }
  }, [queryClient])

  const logout = React.useCallback(
    (reason: LogoutReason = 'manual') => {
      clearSession()
      void firebaseSignOut()
      setStatus('anonymous')
      if (reason === 'expired') toast.info('Your session expired. Please sign in again.')
      if (reason === 'inactive') toast.error('This account has been deactivated.')
      if (reason === 'no-profile') {
        toast.error('No LMS profile is linked to that account.', {
          description: 'Ask an administrator to create your account, then sign in again.',
          duration: 10_000,
        })
      }
    },
    [clearSession],
  )

  /** Loads the authoritative profile for a token already set on the client. */
  const resolveProfile = React.useCallback(async (): Promise<UserOut | null> => {
    try {
      const me = await authApi.me()
      setUser(me)
      setProfileDegraded(false)
      setStatus('authenticated')
      return me
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null

      // A genuine, permanent rejection of this identity.
      if (apiError?.isUnauthorized || apiError?.isInactiveAccount || apiError?.isNoProfile) {
        throw error
      }

      // Server trouble only. Carry on with whatever the token itself says
      // rather than blocking a user whose credentials are fine.
      const token = getAccessToken()
      const fallback = token ? userFromToken(token) : null
      if (!fallback) throw error

      setUser(fallback)
      setProfileDegraded(true)
      setStatus('authenticated')
      return fallback
    }
  }, [])

  // ------------------------------------------------------------ boot
  React.useEffect(() => {
    let cancelled = false

    const boot = async () => {
      const token = loadStoredToken()

      // With Firebase configured, the SDK is the source of truth for whether a
      // session exists. A stored token only avoids a flash of the login screen
      // while `onIdTokenChanged` reports in; if it is already expired we drop
      // it and wait for the listener rather than guessing.
      if (!token || isExpired(token)) {
        if (token) setAccessToken(null)
        if (!cancelled && !HAS_FIREBASE) setStatus('anonymous')
        return
      }

      setExpiresInMs(msUntilExpiry(token))

      try {
        await resolveProfile()
      } catch (error) {
        if (cancelled) return
        const apiError = error instanceof ApiError ? error : null

        if (apiError?.isUnauthorized || apiError?.isInactiveAccount || apiError?.isNoProfile) {
          clearSession()
          setStatus('anonymous')
          return
        }
        // A 5xx or a dead server must not destroy a valid session.
        setStatus('degraded')
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [clearSession, resolveProfile, bootNonce])

  // ------------------------------------------- firebase token lifecycle
  /**
   * The refresh loop. Firebase re-issues the ID token before it expires and
   * this pushes each one into the API client, so requests never carry a stale
   * credential. It also fires with null when Firebase signs the user out or
   * the backend revokes the account's sessions.
   */
  React.useEffect(() => {
    if (!HAS_FIREBASE) return

    return subscribeToIdToken((token) => {
      if (signingIn.current) return

      if (!token) {
        // Only tear down a session we actually established through Firebase.
        // Under the dev-endpoint fallback this listener never carries state.
        if (getAccessToken()) {
          clearSession()
          setStatus('anonymous')
        } else {
          setStatus((prev) => (prev === 'booting' ? 'anonymous' : prev))
        }
        return
      }

      const hadSession = getAccessToken() !== null
      setAccessToken(token)
      setExpiresInMs(msUntilExpiry(token))

      // A refresh of an existing session: swap the token and stop there.
      if (hadSession) return

      // A restored session (reload, or another tab signed in): resolve it.
      void resolveProfile().catch((error) => {
        const apiError = error instanceof ApiError ? error : null
        if (apiError?.isNoProfile) logout('no-profile')
        else if (apiError?.isInactiveAccount) logout('inactive')
        else if (apiError?.isUnauthorized) logout('expired')
        else setStatus('degraded')
      })
    })
  }, [clearSession, resolveProfile, logout])

  // ------------------------------------------- interceptor -> provider
  React.useEffect(
    () =>
      onAuthEvent((event) => {
        if (event === 'unauthorized') {
          // Firebase may simply have a fresher token than the one that 401'd.
          // Try a forced refresh before ending the session.
          if (HAS_FIREBASE) {
            void refreshIdToken(true).then((token) => {
              if (token) {
                setAccessToken(token)
                setExpiresInMs(msUntilExpiry(token))
              } else {
                logout('expired')
              }
            })
          } else {
            logout('expired')
          }
        } else if (event === 'inactive') {
          logout('inactive')
        }
      }),
    [logout],
  )

  // ------------------------------------------------- expiry countdown
  React.useEffect(() => {
    if (status !== 'authenticated') return
    const initial = getAccessToken()
    if (!initial) return

    let warned = false
    const tick = () => {
      // Re-read every tick: Firebase swaps the token underneath us.
      const token = getAccessToken()
      if (!token) return

      const remaining = msUntilExpiry(token)
      setExpiresInMs(remaining)

      if (remaining <= 0) {
        // Under Firebase this should be unreachable — the SDK refreshes ahead
        // of expiry. If it does happen, ask for a token before giving up.
        if (HAS_FIREBASE) {
          void refreshIdToken(true).then((fresh) => {
            if (fresh) setAccessToken(fresh)
            else logout('expired')
          })
        } else {
          logout('expired')
        }
        return
      }

      // Only the non-refreshing fallback path needs an expiry warning.
      if (!HAS_FIREBASE && !warned && remaining <= 5 * 60_000) {
        warned = true
        toast.warning('Your session ends in under 5 minutes.', {
          description: 'Sessions cannot be extended on this server — save your work and sign in again.',
          duration: 10_000,
        })
      }
    }

    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [status, logout])

  // ------------------------------------------------- presence heartbeat
  // A sign of life once a minute while the tab is visible, so the office's
  // "who is online" stays true for somebody reading without clicking. Any
  // failure is swallowed: presence is never worth an error in the user's face.
  React.useEffect(() => {
    if (status !== 'authenticated') return
    const beat = () => {
      if (document.visibilityState !== 'visible') return
      void authApi.heartbeat().catch(() => undefined)
    }
    beat()
    const id = window.setInterval(beat, 60_000)
    document.addEventListener('visibilitychange', beat)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [status])

  // ------------------------------------------------------- cross-tab
  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEYS.token) return
      if (e.newValue === null) {
        clearSession()
        setStatus('anonymous')
      } else if (e.newValue !== getAccessToken()) {
        setAccessToken(e.newValue)
        setBootNonce((n) => n + 1)
        setStatus('booting')
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [clearSession])

  // ----------------------------------------------------------- login
  /**
   * Runs an interactive sign-in that yields a bearer token, then resolves the
   * LMS profile behind it. Shared by both password and Google flows so the
   * listener-suppression and failure handling stay identical.
   */
  const completeSignIn = React.useCallback(
    async (acquireToken: () => Promise<SignInResult>) => {
      signingIn.current = true
      try {
        const { token, profileHint } = await acquireToken()
        setAccessToken(token)
        setExpiresInMs(msUntilExpiry(token))

        try {
          return await resolveProfile()
        } catch (error) {
          const apiError = error instanceof ApiError ? error : null

          // Signed in with a real credential that the LMS does not know.
          // Leaving a Firebase session open behind a failed sign-in would let
          // the next reload silently retry it, so tear it down here.
          if (apiError?.isNoProfile || apiError?.isInactiveAccount || apiError?.isUnauthorized) {
            clearSession()
            void firebaseSignOut()
            setStatus('anonymous')
            throw error
          }

          const fallback = userFromToken(token, profileHint)
          if (!fallback) throw error

          setUser(fallback)
          setProfileDegraded(true)
          setStatus('authenticated')
          return fallback
        }
      } finally {
        signingIn.current = false
      }
    },
    [clearSession, resolveProfile],
  )

  const login = React.useCallback(
    async (credentials: LoginRequest) => {
      if (HAS_FIREBASE) {
        return completeSignIn(async () => ({
          token: await firebaseSignInWithPassword(credentials.email, credentials.password),
        }))
      }

      // Fallback: the backend's dev helper exchanges the password for an ID
      // token server-side. It also returns role and name, which lets sign-in
      // survive an unreachable /auth/me.
      return completeSignIn(async () => {
        const issued = await authApi.login(credentials)
        return { token: issued.access_token, profileHint: issued }
      })
    },
    [completeSignIn],
  )

  const loginWithGoogle = React.useCallback(
    () => completeSignIn(async () => ({ token: await firebaseSignInWithGoogle() })),
    [completeSignIn],
  )

  const sendPasswordReset = React.useCallback(async (email: string) => {
    if (!HAS_FIREBASE) {
      throw new Error(
        'Password resets are handled by Firebase, which is not configured for this deployment. Ask an administrator to reset your password.',
      )
    }
    try {
      await firebaseSendPasswordReset(email)
    } catch (error) {
      throw new Error(firebaseAuthMessage(error))
    }
  }, [])

  const retryBoot = React.useCallback(() => {
    setStatus('booting')
    setBootNonce((n) => n + 1)
  }, [])

  const value = React.useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      role: user?.role ?? null,
      profileDegraded,
      usesFirebase: HAS_FIREBASE,
      login,
      loginWithGoogle,
      sendPasswordReset,
      logout,
      retryBoot,
      expiresInMs,
    }),
    [status, user, profileDegraded, login, loginWithGoogle, sendPasswordReset, logout, retryBoot, expiresInMs],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Where each role lands after signing in. */
/**
 * Where this account lands, given both its role and its products.
 *
 * Takes the whole profile rather than a bare role because the two products are
 * separate front doors: a tuition-only student has no school dashboard to land
 * on, and sending them to one produces a redirect straight back out of it.
 *
 * The contract that matters is that this ALWAYS returns somewhere the caller
 * can actually reach — every route guard redirects here on refusal, so a home
 * the user is not allowed to open would be an infinite loop rather than an
 * error. `/profile` is the floor: it sits behind no role or programme guard.
 */
export function roleHome(user: Pick<UserOut, 'role' | 'programs'> | null): string {
  if (!user) return '/login'

  const lms = hasProgram(user, 'LMS')
  const tuition = hasProgram(user, 'TUITION')

  switch (user.role) {
    // Admins are never programme-scoped — one admin team runs both products,
    // and the backend takes the same view.
    case 'ADMIN':
      return '/admin'
    // A class teacher lands on the teacher portal like any other teacher. The
    // extra reach is inside those pages, not a separate section of the app.
    case 'CLASS_TEACHER':
    case 'TEACHER':
      if (lms) return '/teacher'
      return tuition ? '/tuition/teacher' : '/profile'
    case 'STUDENT':
      if (lms) return '/student'
      return tuition ? '/tuition/student' : '/profile'
    // A parent is never programme-scoped, unlike the two above: they have no
    // product of their own and reach whatever their children are part of. The
    // switcher is their home, and it is reachable whether they have one child
    // or six — including none, where it renders the "no children linked yet"
    // state rather than redirecting somewhere they can do even less.
    case 'PARENT':
      return '/parent'
    default:
      return '/login'
  }
}

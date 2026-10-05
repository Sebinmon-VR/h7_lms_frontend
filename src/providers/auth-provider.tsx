import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { authApi, type IssuedToken } from '@/api/auth.api'
import { getAccessToken, loadStoredToken, onAuthEvent, setAccessToken } from '@/api/client'
import { ApiError } from '@/api/errors'
import type { LoginRequest, MeOut, UserOut, UserRole } from '@/api/types'
import { STORAGE_KEYS } from '@/lib/constants'
import { hasProgram } from '@/lib/tuition'
import { setSchoolZone } from '@/lib/school-time'
import { decodeJwt, isExpired, lmsRole, msUntilExpiry } from '@/lib/jwt'

/**
 * Sign-in is owned by the backend.
 *
 * `POST /auth/login` checks the password and returns a session token, which
 * the API client sends as a bearer token. Tokens last a day; the countdown
 * below renews one through `POST /auth/refresh` when it has under
 * `REFRESH_AHEAD_MS` left, so somebody working all day is never signed out
 * mid-lesson. A password change, a deactivation or an admin reset revokes
 * every token on the server, and the next request's 401 ends the session here.
 *
 * `degraded` matters: a server error while validating the session must never
 * sign the user out.
 */
export type AuthStatus = 'booting' | 'authenticated' | 'anonymous' | 'degraded'

export type LogoutReason = 'manual' | 'expired' | 'inactive' | 'no-profile'

/** Renew a token once it has less than this left. */
const REFRESH_AHEAD_MS = 15 * 60_000

interface AuthContextValue {
  status: AuthStatus
  user: MeOut | null
  role: UserRole | null
  /** True when /auth/me failed but the token is still believed good. */
  profileDegraded: boolean
  login: (credentials: LoginRequest) => Promise<MeOut | null>
  /** Emails a reset link; resolves with the server's message to show. */
  sendPasswordReset: (email: string) => Promise<string>
  /** Changes the signed-in user's password and keeps this session signed in. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  logout: (reason?: LogoutReason) => void
  retryBoot: () => void
  /** Milliseconds until the token expires, or null when unknown. */
  expiresInMs: number | null
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

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
  const [user, setUser] = React.useState<MeOut | null>(null)
  const [profileDegraded, setProfileDegraded] = React.useState(false)
  const [expiresInMs, setExpiresInMs] = React.useState<number | null>(null)
  const [bootNonce, setBootNonce] = React.useState(0)

  const clearSession = React.useCallback(() => {
    setAccessToken(null)
    setSchoolZone(null)
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

  const adoptToken = React.useCallback((issued: IssuedToken) => {
    setAccessToken(issued.access_token)
    setExpiresInMs(msUntilExpiry(issued.access_token))
  }, [])

  /** Loads the authoritative profile for a token already set on the client. */
  const resolveProfile = React.useCallback(async (): Promise<MeOut | null> => {
    try {
      const me = await authApi.me()
      setSchoolZone(me.school_timezone)
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

      if (!token || isExpired(token)) {
        if (token) setAccessToken(null)
        if (!cancelled) setStatus('anonymous')
        return
      }

      setExpiresInMs(msUntilExpiry(token))

      try {
        await resolveProfile()
      } catch (error) {
        if (cancelled) return
        const apiError = error instanceof ApiError ? error : null

        // Includes a token from before sign-in moved off Firebase: the server
        // no longer accepts it, so the person simply signs in again.
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

  // ------------------------------------------- interceptor -> provider
  React.useEffect(
    () =>
      onAuthEvent((event) => {
        // A 401 on an ordinary request means the token was revoked (password
        // changed elsewhere, account reset) or has run out: either way, over.
        if (event === 'unauthorized') logout('expired')
        else if (event === 'inactive') logout('inactive')
      }),
    [logout],
  )

  // ------------------------------------------ expiry countdown + refresh
  React.useEffect(() => {
    if (status !== 'authenticated') return
    if (!getAccessToken()) return

    let refreshing = false
    const tick = () => {
      const token = getAccessToken()
      if (!token) return

      const remaining = msUntilExpiry(token)
      setExpiresInMs(remaining)

      if (remaining <= 0) {
        logout('expired')
        return
      }
      if (remaining > REFRESH_AHEAD_MS || refreshing) return

      refreshing = true
      authApi
        .refresh()
        .then((issued) => {
          // Another tab may have signed out meanwhile; do not resurrect it.
          if (getAccessToken()) adoptToken(issued)
        })
        .catch((error) => {
          const apiError = error instanceof ApiError ? error : null
          // Refused outright: the session is too old or was revoked. A network
          // blip is simply retried on the next tick.
          if (apiError?.isUnauthorized || apiError?.isInactiveAccount) logout('expired')
        })
        .finally(() => {
          refreshing = false
        })
    }

    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [status, logout, adoptToken])

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
  const login = React.useCallback(
    async (credentials: LoginRequest) => {
      const issued = await authApi.login(credentials)
      adoptToken(issued)

      try {
        return await resolveProfile()
      } catch (error) {
        const apiError = error instanceof ApiError ? error : null
        if (apiError?.isNoProfile || apiError?.isInactiveAccount || apiError?.isUnauthorized) {
          clearSession()
          setStatus('anonymous')
          throw error
        }

        // /auth/me is down but the login itself said who this is.
        const fallback = userFromToken(issued.access_token, issued)
        if (!fallback) throw error

        setUser(fallback)
        setProfileDegraded(true)
        setStatus('authenticated')
        return fallback
      }
    },
    [adoptToken, clearSession, resolveProfile],
  )

  const sendPasswordReset = React.useCallback(async (email: string) => {
    const { detail } = await authApi.requestPasswordReset(email)
    return detail
  }, [])

  const changePassword = React.useCallback(
    async (currentPassword: string, newPassword: string) => {
      const { token } = await authApi.changePassword(currentPassword, newPassword)
      adoptToken(token)
    },
    [adoptToken],
  )

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
      login,
      sendPasswordReset,
      changePassword,
      logout,
      retryBoot,
      expiresInMs,
    }),
    [status, user, profileDegraded, login, sendPasswordReset, changePassword, logout, retryBoot, expiresInMs],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/**
 * The IANA zone the school timetable is written in, from the profile. Null
 * until it has loaded, or when the server was down and the token stood in.
 */
export function useSchoolTimezone(): string | null {
  const { user } = useAuth()
  return user?.school_timezone ?? null
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

import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onIdTokenChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'

import type { UserRole } from '@/api/types'
import { FIREBASE_CONFIG, GOOGLE_WORKSPACE_DOMAIN, HAS_FIREBASE } from './env'

/**
 * Firebase Authentication, the backend's primary identity source.
 *
 * The backend never sees a password: the client signs in here, Firebase
 * returns an ID token, and every API call carries it as a bearer token. The
 * backend verifies it with the Admin SDK and resolves the Firestore profile.
 *
 * Everything is initialised lazily so that a deployment without Firebase
 * configured — which falls back to the backend's dev password endpoint —
 * never pays for the SDK or crashes at import time.
 */

let app: FirebaseApp | null = null
let auth: Auth | null = null
let initFailed = false

/**
 * Returns the Auth instance, or null when Firebase is unconfigured or its
 * initialisation failed.
 *
 * A malformed config (a typo'd `VITE_FIREBASE_*` value, say) must not leave
 * the app stuck on its boot screen, so a failure here is swallowed and
 * recorded. Callers treat null as "Firebase is unavailable" and fall back to
 * the backend's password endpoint.
 */
export function getFirebaseAuth(): Auth | null {
  if (!HAS_FIREBASE || initFailed) return null
  if (auth) return auth

  try {
    app ??= initializeApp(FIREBASE_CONFIG)
    auth = getAuth(app)
  } catch (error) {
    initFailed = true
    console.error('[auth] Firebase failed to initialise; falling back to password sign-in.', error)
    return null
  }

  // Survive a reload. Failure here is not fatal — the session just becomes
  // tab-scoped, which is the correct degradation in a locked-down browser.
  void setPersistence(auth, browserLocalPersistence).catch(() => {})

  return auth
}

/** True when Firebase is configured AND actually usable. */
export function isFirebaseReady(): boolean {
  return getFirebaseAuth() !== null
}

/**
 * Custom claims the backend mirrors onto the Firebase account. They exist for
 * the frontend's convenience only; the Firestore profile stays authoritative,
 * so these are used to render the shell early, never to grant access.
 */
export interface FirebaseLmsClaims {
  role?: UserRole
  lms_user_id?: number
}

const CLAIM_ROLES: readonly UserRole[] = [
  'ADMIN',
  'CLASS_TEACHER',
  'TEACHER',
  'STUDENT',
  'PARENT',
]

/**
 * The backend re-issues these claims and revokes the account's tokens whenever
 * a teacher is promoted to or demoted from `CLASS_TEACHER`, so the shell picks
 * up the change on the next token rather than at the end of the session.
 */
export async function readLmsClaims(user: User): Promise<FirebaseLmsClaims> {
  try {
    const result = await user.getIdTokenResult()
    const role = result.claims.role as UserRole | undefined
    const id = result.claims.lms_user_id
    return {
      role: role && CLAIM_ROLES.includes(role) ? role : undefined,
      lms_user_id: typeof id === 'number' ? id : Number(id) || undefined,
    }
  } catch {
    return {}
  }
}

// ------------------------------------------------------------- sign-in

export async function firebaseSignInWithPassword(email: string, password: string): Promise<string> {
  const instance = getFirebaseAuth()
  if (!instance) throw new Error('Firebase is not configured.')
  const credential = await signInWithEmailAndPassword(instance, email, password)
  return credential.user.getIdToken()
}

/**
 * Google sign-in. `hd` restricts the account chooser to the Workspace domain
 * when one is configured; Google treats it as a hint, so the backend remains
 * the only real gate.
 */
export async function firebaseSignInWithGoogle(): Promise<string> {
  const instance = getFirebaseAuth()
  if (!instance) throw new Error('Firebase is not configured.')

  const provider = new GoogleAuthProvider()
  if (GOOGLE_WORKSPACE_DOMAIN) provider.setCustomParameters({ hd: GOOGLE_WORKSPACE_DOMAIN })

  const credential = await signInWithPopup(instance, provider)
  return credential.user.getIdToken()
}

export async function firebaseSendPasswordReset(email: string): Promise<void> {
  const instance = getFirebaseAuth()
  if (!instance) throw new Error('Firebase is not configured.')
  await sendPasswordResetEmail(instance, email)
}

export async function firebaseSignOut(): Promise<void> {
  const instance = getFirebaseAuth()
  if (!instance) return
  await signOut(instance).catch(() => {})
}

/**
 * Subscribes to token changes. Firebase ID tokens last an hour and the SDK
 * refreshes them in the background, so this is what keeps a long session
 * alive — the old build had no refresh path at all and simply ended sessions
 * after 60 minutes.
 *
 * Fires with null when the user signs out or the account is disabled and its
 * tokens are revoked, which is exactly what the backend does on a soft delete.
 */
export function subscribeToIdToken(handler: (token: string | null, user: User | null) => void): () => void {
  const instance = getFirebaseAuth()
  if (!instance) return () => {}

  return onIdTokenChanged(instance, (user) => {
    if (!user) {
      handler(null, null)
      return
    }
    user
      .getIdToken()
      .then((token) => handler(token, user))
      .catch(() => handler(null, user))
  })
}

/** Forces a token refresh — used to pick up role claims after an admin change. */
export async function refreshIdToken(force = true): Promise<string | null> {
  const instance = getFirebaseAuth()
  const user = instance?.currentUser
  if (!user) return null
  try {
    return await user.getIdToken(force)
  } catch {
    return null
  }
}

// -------------------------------------------------------------- errors

/**
 * Maps Firebase's `auth/*` codes onto copy a person can act on. Firebase
 * deliberately collapses "no such user" and "wrong password" into
 * `invalid-credential` to avoid leaking which accounts exist, so we keep that
 * ambiguity rather than guessing.
 */
export function firebaseAuthMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? ''

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'That email and password combination is not recognised.'
    case 'auth/user-disabled':
      return 'This account has been deactivated. Contact an administrator.'
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Wait a few minutes, or reset your password.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Google sign-in was cancelled.'
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.'
    case 'auth/unauthorized-domain':
      return 'This site is not an authorised domain for the Firebase project. Add it under Authentication → Settings → Authorized domains.'
    case 'auth/operation-not-allowed':
      return 'This sign-in method is disabled for the Firebase project.'
    case 'auth/network-request-failed':
      return 'Could not reach Firebase. Check your connection and try again.'
    default:
      return (error as { message?: string })?.message ?? 'Sign in failed. Please try again.'
  }
}

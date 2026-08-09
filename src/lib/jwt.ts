import type { UserRole } from '@/api/types'

/**
 * Reads the bearer token's payload for UX purposes only — expiry countdowns
 * and discarding a stale token before the first network call. The signature is
 * never verified here; the server remains the only authority.
 *
 * Two token shapes reach this code:
 *
 *  - A **Firebase ID token**, the normal case. `sub` and `user_id` are the
 *    Firebase uid, and the LMS role arrives through custom claims the backend
 *    mirrors onto the account (`role`, `lms_user_id`).
 *  - A **legacy backend JWT**, accepted while `ALLOW_LEGACY_JWT_LOGIN` is on.
 *    Its `sub` is the numeric LMS user id.
 *
 * `lmsUserId` normalises across both so callers never branch on token origin.
 */
export interface JwtPayload {
  sub: string
  email?: string
  exp: number
  /** LMS role. A custom claim on Firebase tokens, a native claim on legacy ones. */
  role?: UserRole
  /** Firebase custom claim carrying the numeric LMS user id. */
  lms_user_id?: number | string
  /** Firebase-only: the uid, duplicated from `sub`. */
  user_id?: string
  /** Firebase-only: seconds since epoch at which the user authenticated. */
  auth_time?: number
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    )
    const payload = JSON.parse(json) as Partial<JwtPayload>
    if (typeof payload.exp !== 'number' || typeof payload.sub !== 'string') return null
    return payload as JwtPayload
  } catch {
    return null
  }
}

/**
 * The numeric LMS user id, from whichever claim carries it.
 * Returns null for a Firebase token whose claims have not been set yet — the
 * profile then has to come from `/auth/me`.
 */
export function lmsUserId(token: string): number | null {
  const payload = decodeJwt(token)
  if (!payload) return null

  const claim = payload.lms_user_id
  if (claim !== undefined) {
    const parsed = Number(claim)
    if (Number.isFinite(parsed)) return parsed
  }

  // Legacy tokens put the numeric id straight in `sub`; Firebase uids are not
  // numeric, so a failed parse correctly yields null.
  const fromSub = Number(payload.sub)
  return Number.isFinite(fromSub) ? fromSub : null
}

export function lmsRole(token: string): UserRole | null {
  const role = decodeJwt(token)?.role
  return role === 'ADMIN' || role === 'TEACHER' || role === 'STUDENT' ? role : null
}

/** Milliseconds until expiry; negative once expired. */
export function msUntilExpiry(token: string, now = Date.now()): number {
  const payload = decodeJwt(token)
  if (!payload) return Number.POSITIVE_INFINITY
  return payload.exp * 1000 - now
}

export function isExpired(token: string, now = Date.now()): boolean {
  return msUntilExpiry(token, now) <= 0
}

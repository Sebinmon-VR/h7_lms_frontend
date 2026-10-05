import type { UserRole } from '@/api/types'

/**
 * Reads the bearer token's payload for UX purposes only — expiry countdowns
 * and discarding a stale token before the first network call. The signature is
 * never verified here; the server remains the only authority.
 *
 * The token is the backend's own session token: `sub`, `user_id` and
 * `lms_user_id` all carry the numeric LMS user id, and `role` mirrors the
 * profile's role so the app can still route when `/auth/me` is unreachable.
 */
export interface JwtPayload {
  sub: string
  email?: string
  exp: number
  /** LMS role, mirrored from the profile when the token was issued. */
  role?: UserRole
  /** The numeric LMS user id. */
  lms_user_id?: number | string
  /** The LMS user id as a string, duplicated from `sub`. */
  user_id?: string
  /** Seconds since epoch at which the password was last typed. */
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
 */
export function lmsUserId(token: string): number | null {
  const payload = decodeJwt(token)
  if (!payload) return null

  const claim = payload.lms_user_id
  if (claim !== undefined) {
    const parsed = Number(claim)
    if (Number.isFinite(parsed)) return parsed
  }

  const fromSub = Number(payload.sub)
  return Number.isFinite(fromSub) ? fromSub : null
}

const KNOWN_ROLES: readonly UserRole[] = [
  'ADMIN',
  'CLASS_TEACHER',
  'TEACHER',
  'STUDENT',
  'PARENT',
]

/**
 * The role claim, or null when it is absent or unrecognised.
 *
 * A role missing from this list is treated as no role at all, which fails the
 * sign-in fallback outright — so a role added on the backend must be added here
 * too, or every user holding it is locked out the moment `/auth/me` is slow.
 */
export function lmsRole(token: string): UserRole | null {
  const role = decodeJwt(token)?.role
  return role && KNOWN_ROLES.includes(role) ? role : null
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

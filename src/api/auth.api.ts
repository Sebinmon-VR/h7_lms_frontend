import { get, post } from './client'
import type { LoginRequest, MeOut, TokenResponse } from './types'

/** A session token as the backend issues it: `expires_in` is its lifetime in seconds. */
export type IssuedToken = TokenResponse & { expires_in?: number | null }

/**
 * Sign-in is owned by the backend: `/auth/login` checks the password and
 * returns a session token, `/auth/refresh` renews it before it runs out, and
 * the password endpoints cover "forgot" and "change".
 *
 * There is no public registration. Accounts are provisioned by an
 * administrator, who generates credentials from the Users screen.
 */
export const authApi = {
  /** 401 here is a wrong password, not an expired session. */
  login: (body: LoginRequest) =>
    post<IssuedToken>('/auth/login', body, { meta: { skipAuthRedirect: true } }),

  /** A fresh token for the current, still-valid session. */
  refresh: () => post<IssuedToken>('/auth/refresh', undefined, { meta: { skipAuthRedirect: true } }),

  me: () => get<MeOut>('/auth/me'),

  /**
   * A sign of life for the office's "who is online". Sent once a minute while
   * a tab is visible; the caller swallows failures.
   */
  heartbeat: () => post<{ ok: boolean; online_window_seconds: number }>('/auth/heartbeat'),

  /** Emails a reset link. Answers the same whether or not the address has an account. */
  requestPasswordReset: (email: string) =>
    post<{ detail: string }>('/auth/password/reset-request', { email }, { meta: { skipAuthRedirect: true } }),

  /** Sets a new password from a reset link's token. */
  resetPassword: (token: string, newPassword: string) =>
    post<{ detail: string }>(
      '/auth/password/reset',
      { token, new_password: newPassword },
      { meta: { skipAuthRedirect: true } },
    ),

  /**
   * Changes the signed-in user's password. Every other session is signed out;
   * the token returned keeps this one signed in.
   */
  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ detail: string; token: IssuedToken }>(
      '/auth/password/change',
      { current_password: currentPassword, new_password: newPassword },
      { meta: { skipAuthRedirect: true } },
    ),
}

import { get, post } from './client'
import type { LoginRequest, TokenResponse, UserOut } from './types'

/**
 * There is no public registration. The backend exposes only `/auth/login`,
 * `/auth/token` and `/auth/me`; accounts are provisioned by an administrator,
 * who generates credentials from the Users screen. An earlier build offered a
 * sign-up form against `POST /auth/register`, which the backend no longer has.
 */
export const authApi = {
  /** 401 here is a wrong password, not an expired session. */
  login: (body: LoginRequest) =>
    post<TokenResponse>('/auth/login', body, { meta: { skipAuthRedirect: true } }),

  me: () => get<UserOut>('/auth/me'),

  /**
   * A sign of life for the office's "who is online". Sent once a minute while
   * a tab is visible; the caller swallows failures.
   */
  heartbeat: () => post<{ ok: boolean; online_window_seconds: number }>('/auth/heartbeat'),
}

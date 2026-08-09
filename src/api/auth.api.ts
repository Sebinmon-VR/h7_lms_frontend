import { get, post } from './client'
import type { LoginRequest, TokenResponse, UserCreate, UserOut } from './types'

export const authApi = {
  /** 401 here is a wrong password, not an expired session. */
  login: (body: LoginRequest) =>
    post<TokenResponse>('/auth/login', body, { meta: { skipAuthRedirect: true } }),

  /**
   * Public registration. The backend accepts role "ADMIN" from anonymous
   * callers — the UI only ever sends "STUDENT".
   */
  register: (body: UserCreate) =>
    post<UserOut>('/auth/register', body, { meta: { skipAuthRedirect: true } }),

  me: () => get<UserOut>('/auth/me'),
}

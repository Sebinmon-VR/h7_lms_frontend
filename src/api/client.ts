import axios, {
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'

import { API_BASE } from '@/lib/env'
import { STORAGE_KEYS } from '@/lib/constants'
import { toApiError } from './errors'

/** Per-request opt-outs from the global interceptor policy. */
export interface RequestMeta {
  /** Login/register: a 401 is an inline form error, not a session expiry. */
  skipAuthRedirect?: boolean
}

declare module 'axios' {
  export interface AxiosRequestConfig {
    meta?: RequestMeta
  }
}

// ---------------------------------------------------------------- token

let accessToken: string | null = null

export function getAccessToken() {
  return accessToken
}

export function setAccessToken(token: string | null) {
  accessToken = token
  try {
    if (token) localStorage.setItem(STORAGE_KEYS.token, token)
    else localStorage.removeItem(STORAGE_KEYS.token)
  } catch {
    /* private mode — session simply won't survive a reload */
  }
}

export function loadStoredToken(): string | null {
  try {
    accessToken = localStorage.getItem(STORAGE_KEYS.token)
  } catch {
    accessToken = null
  }
  return accessToken
}

// --------------------------------------------------------------- events

type AuthEvent = 'unauthorized' | 'inactive'
type AuthListener = (event: AuthEvent) => void

const listeners = new Set<AuthListener>()

/** AuthProvider subscribes; the interceptor publishes. Avoids a React import here. */
export function onAuthEvent(listener: AuthListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emitAuthEvent(event: AuthEvent) {
  listeners.forEach((l) => l(event))
}

// --------------------------------------------------------------- client

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
  headers: { Accept: 'application/json' },
})

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`)
  }
  // Let the browser set the multipart boundary itself.
  if (config.data instanceof FormData) {
    config.headers.delete('Content-Type')
  } else if (config.data !== undefined) {
    config.headers.set('Content-Type', 'application/json')
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = toApiError(error)
    const meta: RequestMeta | undefined = error?.config?.meta

    if (!meta?.skipAuthRedirect) {
      // A disabled account is a session-ending 403; a role 403 is not.
      if (apiError.isUnauthorized) emitAuthEvent('unauthorized')
      else if (apiError.isInactiveAccount) emitAuthEvent('inactive')
    }

    return Promise.reject(apiError)
  },
)

// ------------------------------------------------------------- helpers

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await apiClient.get<T>(url, config)
  return data
}

export async function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await apiClient.post<T>(url, body, config)
  return data
}

export async function put<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await apiClient.put<T>(url, body, config)
  return data
}

export async function del(url: string, config?: AxiosRequestConfig): Promise<void> {
  await apiClient.delete(url, config)
}

/** Strips undefined/null so we never send `?class_id=undefined`. */
export function cleanParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  )
}

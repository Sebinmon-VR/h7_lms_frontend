import axios from 'axios'

import { API_ORIGIN } from '@/lib/env'
import type { CacheHealth } from './types'

/**
 * Health endpoints live at the server ROOT, not under `/api/v1`, so they
 * cannot go through `apiClient` (whose baseURL carries the version prefix).
 * They are also unauthenticated, which is what makes them usable as a
 * connectivity probe before a session exists.
 */
const healthClient = axios.create({
  baseURL: API_ORIGIN || '/',
  timeout: 8_000,
  headers: { Accept: 'application/json' },
})

export interface ApiStatus {
  status: string
  project: string
  documentation: string
  api_v1: string
}

export const healthApi = {
  ping: async () => (await healthClient.get<ApiStatus>('/')).data,
  cache: async () => (await healthClient.get<CacheHealth>('/health/cache')).data,
}

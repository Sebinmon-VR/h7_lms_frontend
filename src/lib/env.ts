/**
 * Typed environment access.
 *
 * In development `VITE_API_BASE` is empty and Vite proxies `/api` and
 * `/uploads` to the FastAPI server, so everything is same-origin.
 * In production it must be the absolute origin of the API — the proxy is a
 * dev-server feature and does not exist in a build, so an empty value there
 * silently points every request at the static host instead. `vite.config.ts`
 * fails the build rather than let that ship.
 *
 * Note these are inlined by Vite at build time, so they must be set in the
 * environment that runs `npm run build` (for this app, the `env:` block on the
 * Build step in `.github/workflows/azure-static-web-apps-*.yml`). The Azure
 * Static Web App's portal "Environment variables" blade does NOT reach here —
 * it only configures the managed Functions runtime.
 */
const rawBase = (import.meta.env.VITE_API_BASE ?? '').trim().replace(/\/+$/, '')

/** Origin of the API server. Empty string means "same origin". */
export const API_ORIGIN = rawBase

/** Prefix for versioned API calls. */
export const API_BASE = `${API_ORIGIN}/api/v1`

export const IS_DEV = import.meta.env.DEV

export const APP_NAME = 'H7 LMS'

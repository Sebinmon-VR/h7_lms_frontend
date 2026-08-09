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

// ------------------------------------------------------------- firebase

/**
 * Firebase Web SDK configuration.
 *
 * The backend verifies Firebase ID tokens, so this is the real sign-in path:
 * the client authenticates against Firebase and sends the resulting ID token
 * as a bearer token. These values are not secrets — a Firebase web config is
 * public by design, and access is governed by Auth rules and the backend's
 * own RBAC, not by hiding the API key.
 *
 * When `VITE_FIREBASE_API_KEY` is absent the app falls back to the backend's
 * `POST /auth/login` development helper, so a local stack with no Firebase
 * project configured still works.
 */
export const FIREBASE_CONFIG = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY ?? '').trim(),
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '').trim(),
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '').trim(),
  appId: (import.meta.env.VITE_FIREBASE_APP_ID ?? '').trim(),
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '').trim() || undefined,
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '').trim() || undefined,
} as const

/** True when there is enough config to initialise the Firebase SDK. */
export const HAS_FIREBASE = Boolean(
  FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.authDomain && FIREBASE_CONFIG.projectId,
)

/**
 * Restricts the Google sign-in account chooser to one Workspace domain.
 * Advisory only — it is a UX hint, and the backend still decides who has a
 * profile. Leave empty to allow any Google account to attempt sign-in.
 */
export const GOOGLE_WORKSPACE_DOMAIN = (
  import.meta.env.VITE_GOOGLE_WORKSPACE_DOMAIN ?? ''
).trim()

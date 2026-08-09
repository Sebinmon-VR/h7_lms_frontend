import axios, { AxiosError } from 'axios'

/** FastAPI 422 validation entry. */
interface ValidationItem {
  loc: (string | number)[]
  msg: string
  type: string
}

/**
 * One blocking reference parsed out of a 409 delete-guard message, e.g.
 * `{ count: 2, label: 'student enrollment(s)' }`.
 */
export interface BlockingReference {
  count: number
  label: string
}

/**
 * The backend's 409 detail is prose, not structured data:
 *
 *   "Cannot delete ClassRoom because it is still referenced by: 1 student
 *    enrollment(s), 3 teacher mapping(s). Remove them first, or retry with
 *    ?force=true to cascade."
 *
 * We parse it so the confirm dialog can list what is actually in the way
 * instead of echoing a sentence with a query-string parameter in it at the
 * user. A parse failure degrades to an empty list, never a throw.
 */
function parseBlockingReferences(detail: unknown): BlockingReference[] {
  if (typeof detail !== 'string') return []
  const segment = detail.match(/referenced by:\s*([^.]+)\./i)?.[1]
  if (!segment) return []

  return segment
    .split(',')
    .map((part) => {
      const match = part.trim().match(/^(\d+)\s+(.+?)$/)
      if (!match) return null
      // "student enrollment(s)" -> "student enrollment"; the count decides plurality.
      const label = match[2].replace(/\(s\)$/, '').trim()
      return { count: Number(match[1]), label }
    })
    .filter((r): r is BlockingReference => r !== null && Number.isFinite(r.count))
}

export class ApiError extends Error {
  readonly status: number | null
  readonly detail: unknown
  readonly isNetwork: boolean
  readonly isTimeout: boolean
  readonly fieldErrors: Record<string, string>
  /** Non-empty only on a 409 raised by a delete dependency guard. */
  readonly blocking: BlockingReference[]

  constructor(init: {
    message: string
    status: number | null
    detail?: unknown
    isNetwork?: boolean
    isTimeout?: boolean
    fieldErrors?: Record<string, string>
    blocking?: BlockingReference[]
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.detail = init.detail
    this.isNetwork = init.isNetwork ?? false
    this.isTimeout = init.isTimeout ?? false
    this.fieldErrors = init.fieldErrors ?? {}
    this.blocking = init.blocking ?? []
  }

  get isServer() {
    return this.status !== null && this.status >= 500
  }

  get isUnauthorized() {
    return this.status === 401
  }

  get isForbidden() {
    return this.status === 403
  }

  /** A 403 caused by role, not by a disabled account or record ownership. */
  get isForbiddenRole() {
    return this.status === 403 && !this.isInactiveAccount && !this.isOwnershipViolation && !this.isNoProfile
  }

  get isInactiveAccount() {
    return this.status === 403 && /inactive user account/i.test(String(this.detail ?? ''))
  }

  /**
   * A teacher tried to edit or delete a record another teacher created.
   * Distinct from a role 403: the page is available, this one row is not.
   */
  get isOwnershipViolation() {
    return this.status === 403 && /you can only modify your own/i.test(String(this.detail ?? ''))
  }

  /**
   * Authenticated with Google against a real Firebase account, but no LMS
   * profile exists for it. Signing in again will never fix this — an admin
   * has to create the user.
   */
  get isNoProfile() {
    return this.status === 403 && /no lms profile exists/i.test(String(this.detail ?? ''))
  }

  get isNotFound() {
    return this.status === 404
  }

  /** A delete refused because other records still reference this one. */
  get isConflict() {
    return this.status === 409
  }

  get isValidation() {
    return this.status === 422
  }

  /**
   * `/auth/login` is a development helper that only works when the server has
   * `FIREBASE_WEB_API_KEY` set. Without it the correct client behaviour is to
   * sign in through the Firebase SDK instead, so this is a configuration
   * signal rather than a failure to report as-is.
   */
  get isPasswordLoginUnavailable() {
    return this.status === 501
  }
}

function flattenDetail(detail: unknown): { message: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {}

  if (typeof detail === 'string') return { message: detail, fieldErrors }

  if (Array.isArray(detail)) {
    // FastAPI 422 shape.
    const items = detail as ValidationItem[]
    for (const item of items) {
      if (!item?.loc) continue
      // loc is like ["body", "email"] — the last string segment is the field.
      const field = [...item.loc].reverse().find((p) => typeof p === 'string' && p !== 'body')
      if (typeof field === 'string') fieldErrors[field] = item.msg
    }
    const first = items[0]?.msg
    return { message: first ?? 'The submitted data was not valid.', fieldErrors }
  }

  if (detail && typeof detail === 'object') {
    const maybe = (detail as { msg?: string; message?: string }).msg ??
      (detail as { message?: string }).message
    if (maybe) return { message: maybe, fieldErrors }
  }

  return { message: 'Something went wrong.', fieldErrors }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (axios.isAxiosError(error)) {
    const axErr = error as AxiosError<{ detail?: unknown }>

    if (axErr.code === 'ECONNABORTED' || axErr.code === 'ETIMEDOUT') {
      return new ApiError({
        message: 'The server took too long to respond.',
        status: null,
        isNetwork: true,
        isTimeout: true,
      })
    }

    if (!axErr.response) {
      return new ApiError({
        message: 'Could not reach the server. Check that the API is running.',
        status: null,
        isNetwork: true,
      })
    }

    const status = axErr.response.status
    const detail = axErr.response.data?.detail ?? axErr.response.data
    const { message, fieldErrors } = flattenDetail(detail)

    return new ApiError({
      message: status >= 500 ? 'The server ran into an error handling this request.' : message,
      status,
      detail,
      fieldErrors,
      blocking: status === 409 ? parseBlockingReferences(detail) : [],
    })
  }

  return new ApiError({
    message: error instanceof Error ? error.message : 'Something went wrong.',
    status: null,
  })
}

/** Human-facing copy for an error, tuned per failure mode. */
export function errorTitle(error: ApiError): string {
  if (error.isNetwork) return error.isTimeout ? 'Request timed out' : 'Cannot reach the server'
  if (error.isServer) return 'Server error'
  if (error.isNoProfile) return 'No LMS profile'
  if (error.isOwnershipViolation) return 'Not your record'
  if (error.isForbiddenRole) return 'Not available for your role'
  if (error.isConflict) return 'Still in use'
  if (error.isNotFound) return 'Not found'
  return 'Something went wrong'
}

export function errorDescription(error: ApiError): string {
  if (error.isNetwork) {
    return error.isTimeout
      ? 'This endpoint is slow to compute. Try again, or narrow what you are asking for.'
      : 'The API server appears to be offline. Start it and try again.'
  }
  if (error.isNoProfile) {
    return 'Your Google account signed in successfully, but no LMS profile is linked to it. Ask an administrator to create your account.'
  }
  if (error.isOwnershipViolation) {
    return 'This record was created by another teacher. Only its author or an administrator can change it.'
  }
  if (error.isConflict) return describeBlocking(error)
  return error.message
}

/**
 * Renders a 409 as a plain sentence, dropping the backend's trailing
 * "retry with ?force=true" instruction — the UI offers that as a button.
 */
export function describeBlocking(error: ApiError): string {
  if (error.blocking.length === 0) {
    return String(error.detail ?? error.message).replace(/\s*Remove them first.*$/i, '')
  }
  const parts = error.blocking.map((b) => `${b.count} ${b.label}${b.count === 1 ? '' : 's'}`)
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `This is still referenced by ${list}.`
}

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
    return this.status === 403 && !this.isInactiveAccount && !this.isOwnershipViolation && !this.isNoProfile && !this.isDemoExpired
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
   * A valid sign-in with no LMS profile behind it. Signing in again will
   * never fix this — an admin has to create the user.
   */
  get isNoProfile() {
    return this.status === 403 && /no lms profile exists/i.test(String(this.detail ?? ''))
  }

  /** A demo account reaching a module the school has not unlocked for it. */
  get isDemoLocked() {
    return this.status === 403 && /locked on demo accounts/i.test(String(this.detail ?? ''))
  }

  /** A demo account past its end date. */
  get isDemoExpired() {
    return this.status === 403 && /demo account has expired/i.test(String(this.detail ?? ''))
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
}

/**
 * What a person reads when something fails.
 *
 * Every message in the app passes through here, so this is where they are
 * made plain: a standard sentence per kind of failure, and the server's own
 * sentence only when it is already one a student or parent can read
 * ("Incorrect email or password", "This class is cancelled"). Anything that
 * names the machinery — an endpoint, a token, a setting, a path, a stack
 * trace — is replaced by the standard sentence for its status. The raw detail
 * stays on `error.detail` for code that needs it, and for the developer box.
 */
export const STANDARD_MESSAGES = {
  network: "We couldn't connect. Check your internet connection and try again.",
  timeout: 'This is taking longer than usual. Please try again in a moment.',
  server:
    'Something went wrong on our side. Please try again in a moment. If it keeps happening, contact the school office.',
  unauthorized: 'Your session has ended. Please sign in again.',
  forbidden: "This isn't available for your account. If you think this is a mistake, contact the school office.",
  inactive: 'Your account has been deactivated. Please contact the school office.',
  noProfile: "You signed in, but your account hasn't been set up yet. Please contact the school office.",
  notFound: "We couldn't find what you were looking for. It may have been moved or removed.",
  validation: 'Some details need correcting. Please check the highlighted fields.',
  unavailable: 'The service is temporarily unavailable. Please try again in a minute.',
  fallback: 'Something went wrong. Please try again.',
} as const

/** Wording that belongs to the machinery rather than to the person using it. */
const TECHNICAL =
  /\b(api|apis|endpoint|endpoints|backend|frontend|token|tokens|jwt|traceback|exception|pydantic|sql|odbc|pyodbc|json|stack ?trace|nonetype|keyerror|valueerror|typeerror|attributeerror|undefined|null|http|https)\b|https?:\/\/|\/[a-z0-9_{}-]+\/[a-z0-9_{}-]+|[?&][a-z_]+=|\b[a-z][a-z0-9]*_[a-z0-9_]+\b|\{[a-z_]+\}|\[\s*'|Not Found$/i

export function isTechnical(text: string): boolean {
  return TECHNICAL.test(text)
}

function standardFor(status: number | null): string {
  if (status === null) return STANDARD_MESSAGES.network
  if (status === 401) return STANDARD_MESSAGES.unauthorized
  if (status === 403) return STANDARD_MESSAGES.forbidden
  if (status === 404) return STANDARD_MESSAGES.notFound
  if (status === 422) return STANDARD_MESSAGES.validation
  if (status === 503) return STANDARD_MESSAGES.unavailable
  if (status >= 500) return STANDARD_MESSAGES.server
  return STANDARD_MESSAGES.fallback
}

/** The server's sentence when it is a plain one, the standard sentence otherwise. */
function friendly(text: string | null | undefined, status: number | null): string {
  const cleaned = String(text ?? '')
    .replace(/^Value error,\s*/i, '')
    // The delete guards end with an instruction for the API ("Retry with &force=true…");
    // the screens offer that as a button, so the sentence stops before it.
    .replace(/\s*(Retry|Remove them first|Use the default soft delete)\b.*$/i, '')
    .trim()
  if (!cleaned || isTechnical(cleaned)) return standardFor(status)
  if (/inactive user account/i.test(cleaned)) return STANDARD_MESSAGES.inactive
  if (/no lms profile exists/i.test(cleaned)) return STANDARD_MESSAGES.noProfile
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

/** One form field's problem, in words. */
function friendlyFieldError(raw: string): string {
  const msg = String(raw ?? '').replace(/^Value error,\s*/i, '').trim()
  let m: RegExpMatchArray | null
  if (/field required|missing/i.test(msg)) return 'This field is required'
  if (/valid email|email address/i.test(msg)) return 'Enter a valid email address'
  if ((m = msg.match(/at least (\d+) characters?/i))) return `Must be at least ${m[1]} characters`
  if ((m = msg.match(/at most (\d+) characters?/i))) return `Must be ${m[1]} characters or fewer`
  if ((m = msg.match(/at least (\d+) items?/i))) return `Choose at least ${m[1]}`
  if ((m = msg.match(/greater than or equal to (-?[\d.]+)/i))) return `Must be ${m[1]} or more`
  if ((m = msg.match(/greater than (-?[\d.]+)/i))) return `Must be more than ${m[1]}`
  if ((m = msg.match(/less than or equal to (-?[\d.]+)/i))) return `Must be ${m[1]} or less`
  if ((m = msg.match(/less than (-?[\d.]+)/i))) return `Must be less than ${m[1]}`
  if (/valid (number|integer|decimal|float)|parse.*(number|integer|float)/i.test(msg)) return 'Enter a valid number'
  if (/valid date|date.*(format|parse|invalid)|invalid.*date/i.test(msg)) return 'Enter a valid date'
  if (/valid (time|datetime)/i.test(msg)) return 'Enter a valid time'
  if (/input should be|valid (enumeration|string|boolean|list|dictionary)/i.test(msg)) return 'Choose a valid option'
  if (!msg || isTechnical(msg)) return 'Please check this field'
  return msg.charAt(0).toUpperCase() + msg.slice(1)
}

function flattenDetail(
  detail: unknown,
  status: number,
): { message: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {}

  if (typeof detail === 'string') return { message: friendly(detail, status), fieldErrors }

  if (Array.isArray(detail)) {
    // FastAPI 422 shape.
    const items = detail as ValidationItem[]
    let general: string | null = null
    for (const item of items) {
      if (!item?.loc) continue
      // loc is like ["body", "email"] — the last string segment is the field.
      const field = [...item.loc].reverse().find((p) => typeof p === 'string' && p !== 'body')
      if (typeof field === 'string') fieldErrors[field] = friendlyFieldError(item.msg)
      // A rule about the whole form ("A demo account needs an expiry date") has no field;
      // its own sentence is the most useful thing to show.
      else if (!general) general = friendly(item.msg, status)
    }
    return { message: general ?? STANDARD_MESSAGES.validation, fieldErrors }
  }

  if (detail && typeof detail === 'object') {
    const maybe = (detail as { msg?: string; message?: string }).msg ??
      (detail as { message?: string }).message
    if (maybe) return { message: friendly(maybe, status), fieldErrors }
  }

  return { message: standardFor(status), fieldErrors }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (axios.isAxiosError(error)) {
    const axErr = error as AxiosError<{ detail?: unknown }>

    if (axErr.code === 'ECONNABORTED' || axErr.code === 'ETIMEDOUT') {
      return new ApiError({
        message: STANDARD_MESSAGES.timeout,
        status: null,
        isNetwork: true,
        isTimeout: true,
      })
    }

    if (!axErr.response) {
      return new ApiError({ message: STANDARD_MESSAGES.network, status: null, isNetwork: true })
    }

    const status = axErr.response.status
    const detail = axErr.response.data?.detail ?? axErr.response.data
    const { message, fieldErrors } = flattenDetail(detail, status)

    return new ApiError({
      // A 503 the server explains in plain words ("The service is temporarily unavailable")
      // keeps them; every other server fault reads the same.
      message: status >= 500 && status !== 503 ? STANDARD_MESSAGES.server : message,
      status,
      detail,
      fieldErrors,
      blocking: status === 409 ? parseBlockingReferences(detail) : [],
    })
  }

  return new ApiError({
    message: error instanceof Error && !isTechnical(error.message) ? error.message : STANDARD_MESSAGES.fallback,
    status: null,
  })
}

/** The heading over an error, per failure mode. */
export function errorTitle(error: ApiError): string {
  if (error.isNetwork) return error.isTimeout ? 'Taking longer than usual' : "Can't connect"
  if (error.status === 503) return 'Temporarily unavailable'
  if (error.isServer) return 'Something went wrong'
  // A 401 is also a wrong password at sign-in, which is not a session ending.
  if (error.isUnauthorized) return error.message === STANDARD_MESSAGES.unauthorized ? 'Your session has ended' : "Couldn't sign in"
  if (error.status === 429) return 'Too many attempts'
  if (error.isDemoLocked) return 'Locked on your demo'
  if (error.isDemoExpired) return 'Your demo has ended'
  if (error.isInactiveAccount) return 'Your account is turned off'
  if (error.isNoProfile) return 'Account not set up'
  if (error.isOwnershipViolation) return 'Not your record'
  if (error.isForbiddenRole) return "You don't have access to this"
  if (error.isConflict) return error.blocking.length ? 'Still in use' : "Can't do that right now"
  if (error.isNotFound) return 'Not found'
  if (error.isValidation) return 'Please check the form'
  return 'Something went wrong'
}

export function errorDescription(error: ApiError): string {
  if (error.isNetwork) return error.isTimeout ? STANDARD_MESSAGES.timeout : STANDARD_MESSAGES.network
  if (error.isNoProfile) return STANDARD_MESSAGES.noProfile
  if (error.isInactiveAccount) return STANDARD_MESSAGES.inactive
  if (error.isDemoLocked) {
    return 'This part of the app opens once the admission is complete. Ask the school office if you would like to try it during your demo.'
  }
  if (error.isDemoExpired) {
    return 'This demo account has expired. Please contact the school office to continue with the admission.'
  }
  if (error.isOwnershipViolation) {
    return 'This record was created by another teacher. Only its author or an administrator can change it.'
  }
  if (error.isConflict) return describeBlocking(error)
  return error.message
}

/**
 * Renders a 409 as a plain sentence, dropping the server's trailing
 * "retry with ?force=true" instruction — the UI offers that as a button.
 */
export function describeBlocking(error: ApiError): string {
  if (error.blocking.length === 0) return error.message
  const parts = error.blocking.map((b) => `${b.count} ${b.label}${b.count === 1 ? '' : 's'}`)
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `This is still linked to ${list}.`
}

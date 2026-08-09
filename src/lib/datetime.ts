/**
 * Date/time handling for this backend.
 *
 * Two distinct wire formats arrive from FastAPI and they must NOT be treated
 * the same way:
 *
 *  1. Instants  — `created_at`, `uploaded_at`, `scheduled_time`.
 *     Produced by `datetime.utcnow().isoformat()`, so they are UTC but carry
 *     no `Z` and no offset: "2026-08-08T14:32:11.482913".
 *     `new Date(that)` parses it as *local* time and is wrong by the viewer's
 *     offset, so we append "Z" before parsing.
 *
 *  2. Calendar dates — `attendance.date`, `topic.date_covered`, "2026-08-08".
 *     These are days on a calendar, not instants. Appending "Z" would shift
 *     them a day backwards for anyone west of UTC, so they are parsed as
 *     local midnight instead.
 *
 * Once the frontend starts writing `Z`-suffixed values the backend will hold a
 * mix of naive and aware strings, so the parsers accept both by construction.
 */
import {
  format,
  formatDistanceToNowStrict,
  isToday,
  isTomorrow,
  isYesterday,
} from 'date-fns'

const NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Parse an API instant (`created_at`, `scheduled_time`, ...). */
export function parseApiDateTime(value: string | null | undefined): Date | null {
  if (!value) return null
  let d: Date
  if (HAS_ZONE.test(value)) {
    d = new Date(value)
  } else if (NAIVE_DATETIME.test(value)) {
    d = new Date(`${value}Z`)
  } else if (DATE_ONLY.test(value)) {
    // A bare date used where an instant was expected: treat as local midnight.
    return parseApiDate(value)
  } else {
    return null
  }
  return Number.isNaN(d.getTime()) ? null : d
}

/** Parse an API calendar date ("YYYY-MM-DD") as local midnight. */
export function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const m = DATE_ONLY.exec(value)
  if (!m) return parseApiDateTime(value)
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Serialize a Date to the "YYYY-MM-DD" the backend expects.
 * Built from local getters on purpose — `toISOString().slice(0,10)` is the
 * classic off-by-one for anyone east/west of UTC late in the day.
 */
export function toApiDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Serialize a Date to an ISO instant. Pydantic accepts the `Z` suffix. */
export function toApiDateTime(d: Date): string {
  return d.toISOString()
}

/** Today as "YYYY-MM-DD" in the viewer's timezone. */
export function todayApiDate(): string {
  return toApiDate(new Date())
}

/**
 * Moves an API date string by whole days.
 *
 * Built by hand rather than via `new Date(apiDate)`, which parses a bare
 * "YYYY-MM-DD" as UTC midnight and lands on the previous day for anyone west of
 * it — the same off-by-one `toApiDate` avoids on the way out.
 */
export function shiftApiDate(apiDate: string, days: number): string {
  const [y, m, d] = apiDate.split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1, d ?? 1)
  date.setDate(date.getDate() + days)
  return toApiDate(date)
}

// ---------------------------------------------------------------- formatting

export function formatDate(value: string | Date | null | undefined, pattern = 'd MMM yyyy') {
  const d = value instanceof Date ? value : parseApiDate(value)
  return d ? format(d, pattern) : '—'
}

export function formatDateTime(
  value: string | Date | null | undefined,
  pattern = "d MMM yyyy 'at' h:mm a",
) {
  const d = value instanceof Date ? value : parseApiDateTime(value)
  return d ? format(d, pattern) : '—'
}

export function formatTime(value: string | Date | null | undefined) {
  const d = value instanceof Date ? value : parseApiDateTime(value)
  return d ? format(d, 'h:mm a') : '—'
}

/** "3 hours ago" / "in 2 days". */
export function formatRelative(value: string | Date | null | undefined) {
  const d = value instanceof Date ? value : parseApiDateTime(value)
  if (!d) return '—'
  return formatDistanceToNowStrict(d, { addSuffix: true })
}

/** "Today" / "Tomorrow" / "Yesterday" / "Mon, 8 Aug". */
export function formatDayLabel(value: string | Date | null | undefined) {
  const d = value instanceof Date ? value : parseApiDate(value)
  if (!d) return '—'
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'EEE, d MMM')
}

export function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export type MeetingPhase = 'live' | 'upcoming' | 'past'

/**
 * Meetings carry no duration, so "live" is a window around the start time:
 * from 10 minutes before to 90 minutes after.
 */
export function meetingPhase(scheduledTime: string | null | undefined, now = new Date()): MeetingPhase {
  const d = parseApiDateTime(scheduledTime)
  if (!d) return 'upcoming'
  const start = d.getTime() - 10 * 60_000
  const end = d.getTime() + 90 * 60_000
  const t = now.getTime()
  if (t < start) return 'upcoming'
  if (t <= end) return 'live'
  return 'past'
}

/** Countdown string for an upcoming instant, e.g. "2d 4h" / "18m". */
export function formatCountdown(value: string | Date | null | undefined, now = new Date()) {
  const d = value instanceof Date ? value : parseApiDateTime(value)
  if (!d) return '—'
  let ms = d.getTime() - now.getTime()
  if (ms <= 0) return 'now'
  const days = Math.floor(ms / 86_400_000)
  ms -= days * 86_400_000
  const hours = Math.floor(ms / 3_600_000)
  ms -= hours * 3_600_000
  const minutes = Math.floor(ms / 60_000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

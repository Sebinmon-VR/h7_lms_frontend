import type { DayOfWeek, ScheduledPeriod, TimetableEntryOut } from '@/api/types'

/**
 * Weekly timetable helpers.
 *
 * The central fact here: `start_time` and `end_time` are LOCAL WALL-CLOCK
 * strings in the school's timezone, not instants. A period is at 09:00 whether
 * or not the clocks changed last weekend. So nothing in this file converts them
 * through `Date` — parsing "09:00" into a Date would silently attach today's
 * date and the *browser's* timezone, which is a different thing entirely and
 * drifts from what the school means.
 *
 * When an absolute instant IS needed — a countdown, "is this happening now" —
 * the server resolves it and returns a `ScheduledPeriod`. Use that.
 */

export const DAYS: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]

export const DAY_LABEL: Record<DayOfWeek, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
}

export const DAY_SHORT: Record<DayOfWeek, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
}

/** The `DayOfWeek` a JS Date falls on, avoiding the Sunday=0 off-by-one. */
export function dayOfWeekFor(date: Date): DayOfWeek {
  // getDay() is 0=Sunday; DAYS is Monday-first.
  return DAYS[(date.getDay() + 6) % 7]
}

/**
 * Minutes since midnight, for ordering and overlap maths.
 *
 * Accepts "09:00" and "09:00:00" — the backend serialises `time` both ways
 * depending on whether seconds are zero.
 */
export function minutesOfDay(time: string | null | undefined): number {
  if (!time) return 0
  const [h, m] = time.split(':')
  return Number(h ?? 0) * 60 + Number(m ?? 0)
}

/** "09:00:00" → "09:00". Wall-clock, so this is a string trim, not a conversion. */
export function formatWallTime(time: string | null | undefined): string {
  if (!time) return ''
  const [h, m] = time.split(':')
  return `${(h ?? '').padStart(2, '0')}:${m ?? '00'}`
}

export function formatPeriodRange(entry: {
  start_time: string
  end_time: string
}): string {
  return `${formatWallTime(entry.start_time)}–${formatWallTime(entry.end_time)}`
}

/** Whole minutes a period lasts. */
export function periodLengthMinutes(entry: { start_time: string; end_time: string }): number {
  return Math.max(0, minutesOfDay(entry.end_time) - minutesOfDay(entry.start_time))
}

/**
 * Whether an entry applies on a given date.
 *
 * The server already filters by this, but the weekly grid renders entries
 * directly and would otherwise show a period from a term that has ended.
 */
export function isEffectiveOn(entry: TimetableEntryOut, date: string): boolean {
  if (entry.effective_from && date < entry.effective_from) return false
  if (entry.effective_to && date > entry.effective_to) return false
  return true
}

export type TimetableGrid = Record<DayOfWeek, TimetableEntryOut[]>

/** Groups entries by weekday, each day ordered by start time. */
export function groupByDay(entries: TimetableEntryOut[]): TimetableGrid {
  const grid = Object.fromEntries(DAYS.map((d) => [d, [] as TimetableEntryOut[]])) as TimetableGrid
  for (const entry of entries) {
    // Guard against a day value the enum does not cover rather than dropping
    // the row into a key that does not exist.
    if (grid[entry.day_of_week]) grid[entry.day_of_week].push(entry)
  }
  for (const day of DAYS) {
    grid[day].sort((a, b) => minutesOfDay(a.start_time) - minutesOfDay(b.start_time))
  }
  return grid
}

/**
 * Days worth rendering: those with at least one period, but never fewer than
 * Monday–Friday, so an empty Wednesday reads as a free day rather than a
 * missing column.
 */
export function visibleDays(grid: TimetableGrid): DayOfWeek[] {
  return DAYS.filter((day, i) => i < 5 || grid[day].length > 0)
}

/**
 * Overlapping periods within one day.
 *
 * The backend refuses a clashing write, but `?allow_conflicts=true` exists and
 * bulk uploads can use it — so a grid that never showed an overlap would be
 * hiding exactly the state someone chose to create and needs to find again.
 */
export function findOverlaps(dayEntries: TimetableEntryOut[]): Set<number> {
  const clashing = new Set<number>()
  const sorted = [...dayEntries].sort(
    (a, b) => minutesOfDay(a.start_time) - minutesOfDay(b.start_time),
  )
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      // Sorted by start, so once one starts after this ends, the rest do too.
      if (minutesOfDay(sorted[j].start_time) >= minutesOfDay(sorted[i].end_time)) break
      if (!sorted[i].is_active || !sorted[j].is_active) continue
      clashing.add(sorted[i].id)
      clashing.add(sorted[j].id)
    }
  }
  return clashing
}

/**
 * Human countdown from the server-computed `starts_in_minutes`.
 *
 * Negative means the period has already begun, which is a different sentence
 * rather than a negative number with a minus sign in front of it.
 */
export function formatStartsIn(period: ScheduledPeriod): string {
  const mins = period.starts_in_minutes
  if (mins === null) return ''
  if (period.is_current) return 'Happening now'
  if (mins < 0) return 'Started'
  if (mins === 0) return 'Starting now'
  if (mins < 60) return `in ${mins} min`
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  if (hours < 24) return rest ? `in ${hours}h ${rest}m` : `in ${hours}h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'tomorrow' : `in ${days} days`
}

/** Groups resolved periods by their date, preserving server ordering. */
export function groupByDate(periods: ScheduledPeriod[]): [string, ScheduledPeriod[]][] {
  const map = new Map<string, ScheduledPeriod[]>()
  for (const period of periods) {
    const list = map.get(period.on_date)
    if (list) list.push(period)
    else map.set(period.on_date, [period])
  }
  return [...map.entries()]
}

/**
 * Parses a pasted timetable into create bodies.
 *
 * Bulk upload is the difference between building a forty-period week in one
 * step and forty chances to leave a class half-scheduled, but the API takes
 * JSON and a school's timetable lives in a spreadsheet. This accepts CSV/TSV
 * with a header row and resolves names to ids through the supplied lookups.
 *
 * Rows that cannot be resolved are returned rather than thrown, so a single bad
 * line does not cost the other thirty-nine — the same contract the bulk
 * endpoint itself honours.
 */
export interface ParsedRow {
  line: number
  raw: string
  error?: string
  entry?: {
    class_id: number
    subject_id: number
    teacher_id?: number | null
    day_of_week: DayOfWeek
    start_time: string
    end_time: string
    room?: string | null
    period_label?: string | null
  }
}

export interface BulkLookups {
  classByName: Map<string, number>
  subjectByName: Map<string, number>
  teacherByName: Map<string, number>
}

const REQUIRED_COLUMNS = ['class', 'subject', 'day', 'start', 'end'] as const

export function parseTimetableRows(text: string, lookups: BulkLookups): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const split = (line: string) => line.split(delimiter).map((c) => c.trim())

  const header = split(lines[0]).map((c) => c.toLowerCase())
  const index = (name: string) => header.findIndex((h) => h === name || h.startsWith(name))

  const missing = REQUIRED_COLUMNS.filter((c) => index(c) === -1)
  if (missing.length > 0) {
    return [
      {
        line: 1,
        raw: lines[0],
        error: `Header is missing: ${missing.join(', ')}. Expected columns: class, subject, day, start, end, and optionally teacher, room, label.`,
      },
    ]
  }

  const col = {
    class: index('class'),
    subject: index('subject'),
    teacher: index('teacher'),
    day: index('day'),
    start: index('start'),
    end: index('end'),
    room: index('room'),
    label: index('label'),
  }

  const normalizeTime = (value: string): string | null => {
    const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
    if (!match) return null
    const h = Number(match[1])
    const m = Number(match[2])
    if (h > 23 || m > 59) return null
    return `${String(h).padStart(2, '0')}:${match[2]}`
  }

  return lines.slice(1).map((raw, i) => {
    const line = i + 2
    const cells = split(raw)
    const cell = (at: number) => (at >= 0 ? (cells[at] ?? '') : '')

    const className = cell(col.class)
    const subjectName = cell(col.subject)
    const teacherLabel = cell(col.teacher)
    const dayRaw = cell(col.day).toUpperCase()
    const startRaw = cell(col.start)
    const endRaw = cell(col.end)

    const classId = lookups.classByName.get(className.toLowerCase())
    if (!classId) return { line, raw, error: `Unknown class “${className}”` }

    const subjectId = lookups.subjectByName.get(subjectName.toLowerCase())
    if (!subjectId) return { line, raw, error: `Unknown subject “${subjectName}”` }

    const day = DAYS.find((d) => d === dayRaw || DAY_SHORT[d].toUpperCase() === dayRaw)
    if (!day) return { line, raw, error: `Unknown day “${cell(col.day)}”` }

    const start = normalizeTime(startRaw)
    if (!start) return { line, raw, error: `Invalid start time “${startRaw}” — use HH:MM` }

    const end = normalizeTime(endRaw)
    if (!end) return { line, raw, error: `Invalid end time “${endRaw}” — use HH:MM` }

    if (minutesOfDay(end) <= minutesOfDay(start)) {
      return { line, raw, error: `End time ${end} is not after start time ${start}` }
    }

    // An unresolvable teacher is NOT an error: omitting teacher_id tells the
    // backend to use whoever is mapped to that subject and class, which is the
    // right default. Only a name that was given and not found is a problem.
    let teacherId: number | null = null
    if (teacherLabel) {
      const found = lookups.teacherByName.get(teacherLabel.toLowerCase())
      if (!found) return { line, raw, error: `Unknown teacher “${teacherLabel}”` }
      teacherId = found
    }

    return {
      line,
      raw,
      entry: {
        class_id: classId,
        subject_id: subjectId,
        teacher_id: teacherId,
        day_of_week: day,
        start_time: start,
        end_time: end,
        room: cell(col.room) || null,
        period_label: cell(col.label) || null,
      },
    }
  })
}

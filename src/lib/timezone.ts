/**
 * Timezone maths the timetable needs, done through `Intl` rather than a library.
 *
 * date-fns has no zone support, and the app needs exactly three answers: what
 * a school wall-clock time reads as on the viewer's clock, what an instant
 * reads as on the school's clock, and what to call a zone ("GST", "IST") when
 * both clocks are on screen. `Intl.DateTimeFormat` answers all three.
 */

/** The browser's own zone, e.g. "Asia/Calcutta". Null in a locked-down runtime. */
export const BROWSER_ZONE: string | null = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
})()

const pad = (n: number) => String(n).padStart(2, '0')

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

// One formatter per zone: a weekly grid converts sixty-odd times per render,
// and constructing an Intl formatter is the expensive part of each.
const partFormatters = new Map<string, Intl.DateTimeFormat>()

/** The wall-clock reading of `at` in `zone`. Throws on an unknown zone. */
function partsIn(zone: string, at: Date): ZonedParts {
  let fmt = partFormatters.get(zone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partFormatters.set(zone, fmt)
  }
  const parts = fmt.formatToParts(at)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    // Some engines print midnight as "24" even under h23.
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
  }
}

/** Minutes east of UTC that `zone` sits at the instant `at`; null for an unknown zone. */
export function zoneOffsetMinutes(zone: string, at: Date = new Date()): number | null {
  try {
    const p = partsIn(zone, at)
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    // `at` carries milliseconds the parts do not; rounding absorbs them.
    return Math.round((asUtc - at.getTime()) / 60_000)
  } catch {
    return null
  }
}

/**
 * The instant at which `zone` reads `hour:minute` on a calendar date.
 *
 * Two passes: the offset is looked up at a first guess, then re-checked at
 * the instant that guess produced, which is what lands a time on the right
 * side of a DST switch on the day it happens.
 */
export function instantOfWallClock(
  zone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date | null {
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  const first = zoneOffsetMinutes(zone, new Date(naive))
  if (first === null) return null
  let instant = naive - first * 60_000
  const second = zoneOffsetMinutes(zone, new Date(instant))
  if (second !== null && second !== first) instant = naive - second * 60_000
  return new Date(instant)
}

export interface LocalWallClock {
  /** "HH:MM" on the viewer's clock. */
  time: string
  /** Calendar days the viewer's date sits from the school's: -1, 0 or 1. */
  dayShift: number
}

/**
 * A school wall-clock time ("09:00" in `zone`) as it reads on the viewer's own
 * clock, worked out for a concrete date so DST on either side is honoured.
 */
export function wallClockToLocal(time: string, zone: string, on: Date): LocalWallClock | null {
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const instant = instantOfWallClock(zone, on.getFullYear(), on.getMonth() + 1, on.getDate(), h, m)
  if (!instant) return null
  const localMidnight = Date.UTC(instant.getFullYear(), instant.getMonth(), instant.getDate())
  const schoolMidnight = Date.UTC(on.getFullYear(), on.getMonth(), on.getDate())
  return {
    time: `${pad(instant.getHours())}:${pad(instant.getMinutes())}`,
    dayShift: Math.round((localMidnight - schoolMidnight) / 86_400_000),
  }
}

/** An instant as "HH:MM" (24-hour) on `zone`'s clock; null for an unknown zone. */
export function formatWallClockInZone(value: Date, zone: string): string | null {
  try {
    const p = partsIn(zone, value)
    return `${pad(p.hour)}:${pad(p.minute)}`
  } catch {
    return null
  }
}

/**
 * An instant as "9:00 AM" on `zone`'s clock, or on the viewer's when zone is
 * null. Assembled from parts so it matches date-fns' `h:mm a` exactly: a
 * plain `format()` puts a narrow no-break space before "AM" on newer ICU.
 */
export function formatTimeInZone(value: Date, zone: string | null): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone ?? undefined,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).formatToParts(value)
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? ''
    return `${read('hour')}:${read('minute')} ${read('dayPeriod').toUpperCase()}`.trim()
  } catch {
    return `${pad(value.getHours())}:${pad(value.getMinutes())}`
  }
}

/**
 * Intl's own short names depend on the locale (en-US calls Dubai "GMT+4",
 * en-GB calls it "GST"), so the zones this school and its people actually
 * sit in are named here directly, and Intl only fills the gaps.
 */
const KNOWN_ABBREVIATIONS: Record<string, string> = {
  'Asia/Dubai': 'GST',
  'Asia/Muscat': 'GST',
  'Asia/Kolkata': 'IST',
  'Asia/Calcutta': 'IST',
  'Asia/Colombo': 'IST',
  'Asia/Riyadh': 'AST',
  'Asia/Qatar': 'AST',
  'Asia/Bahrain': 'AST',
  'Asia/Kuwait': 'AST',
  'Asia/Karachi': 'PKT',
  'Asia/Kathmandu': 'NPT',
  'Asia/Singapore': 'SGT',
  'Asia/Kuala_Lumpur': 'MYT',
  UTC: 'UTC',
  'Etc/UTC': 'UTC',
}

/** A short name for a zone: "GST", "IST", else whatever Intl offers ("GMT+4", "EDT"). */
export function zoneAbbreviation(zone: string, at: Date = new Date()): string {
  const known = KNOWN_ABBREVIATIONS[zone]
  if (known) return known
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'short',
    }).formatToParts(at)
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? zone
  } catch {
    return zone
  }
}

/**
 * Whether two zones read the same time right now, so that showing a second
 * clock would only repeat the first.
 */
export function sameClock(a: string, b: string, at: Date = new Date()): boolean {
  if (a === b) return true
  const oa = zoneOffsetMinutes(a, at)
  const ob = zoneOffsetMinutes(b, at)
  return oa !== null && ob !== null && oa === ob
}

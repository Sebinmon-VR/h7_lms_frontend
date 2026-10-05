import { parseApiDateTime } from './datetime'
import { BROWSER_ZONE, formatTimeInZone, sameClock, zoneAbbreviation } from './timezone'

/**
 * School class times, on the school's clock.
 *
 * A timetable period is a wall-clock fact ("Maths is at 09:00") written in the
 * school's zone, which comes from School Settings through `/auth/me`. Showing
 * it on each viewer's own clock made the same period read 09:00 on the admin's
 * timetable and 10:30 on a student's dashboard, so every class time is shown on
 * the school's clock instead, labelled ("9:00 AM IST") only for somebody whose
 * own clock reads differently.
 *
 * The zone is set by the auth provider as soon as the profile loads, and read
 * here rather than through a hook so plain helper functions can format too.
 */
let schoolZone: string | null = null

export function setSchoolZone(zone: string | null | undefined) {
  schoolZone = zone?.trim() || null
}

export function getSchoolZone(): string | null {
  return schoolZone
}

/** "9:00 AM", or "9:00 AM IST" when the viewer's clock is not the school's. */
export function formatSchoolTime(value: string | Date | null | undefined): string {
  const d = value instanceof Date ? value : parseApiDateTime(value ?? null)
  if (!d) return '—'
  const zone = schoolZone
  if (!zone) return formatTimeInZone(d, null)
  const shown = formatTimeInZone(d, zone)
  if (BROWSER_ZONE && sameClock(zone, BROWSER_ZONE, d)) return shown
  return `${shown} ${zoneAbbreviation(zone, d)}`
}

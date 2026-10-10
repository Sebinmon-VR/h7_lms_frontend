import type { DemoModuleKey, UserOut } from '@/api/types'
import { parseApiDate } from '@/lib/datetime'

/**
 * Demo accounts, on the screen side.
 *
 * The server is the authority: every request from a demo account outside its
 * unlocked modules answers 403 (app/core/demo.py). This file is the friendly
 * half of the same rule — which menu items get a padlock, and which pages show
 * the "locked on your demo" screen instead of a page full of refusals.
 *
 * The map below must name the same modules as the server's catalogue. Classes
 * (home, subjects or tutors, timetable, live classes, the call itself) are not
 * in it, because they are never locked.
 */

const MODULE_PATHS: Record<DemoModuleKey, string[]> = {
  attendance: ['/student/attendance', '/tuition/student/reports'],
  syllabus: ['/student/syllabus'],
  library: ['/student/materials', '/tuition/library'],
  exams: ['/student/exams', '/student/grades', '/student/homework', '/tuition/student/assessments'],
  report_cards: ['/student/report-cards', '/tuition/student/report-cards'],
  games: ['/student/arena', '/tuition/student/games'],
  fees: ['/student/fees', '/tuition/student/fees'],
  notices: ['/notices', '/tuition/notices'],
  calendar: ['/calendar'],
  support: ['/support'],
}

/** Longest prefix first, so a deeper path is never claimed by a shorter one. */
const PREFIXES = (Object.entries(MODULE_PATHS) as [DemoModuleKey, string[]][])
  .flatMap(([key, paths]) => paths.map((path) => [path, key] as const))
  .sort((a, b) => b[0].length - a[0].length)

export function isDemo(user: Pick<UserOut, 'is_demo'> | null | undefined): boolean {
  return !!user?.is_demo
}

/** The module a page belongs to, or null for the always-open ones. */
export function moduleForPath(pathname: string): DemoModuleKey | null {
  for (const [prefix, key] of PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return key
  }
  return null
}

/** The module this page belongs to when it is locked for this account; null otherwise. */
export function lockedModuleFor(
  user: Pick<UserOut, 'is_demo' | 'demo_modules'> | null | undefined,
  pathname: string,
): DemoModuleKey | null {
  if (!isDemo(user)) return null
  const key = moduleForPath(pathname)
  if (!key) return null
  return (user?.demo_modules ?? []).includes(key) ? null : key
}

/** Whole days left, counting today; 0 on the last day, negative once expired. */
export function demoDaysLeft(user: Pick<UserOut, 'demo_expires_on'> | null | undefined): number | null {
  const ends = parseApiDate(user?.demo_expires_on)
  if (!ends) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(ends)
  end.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - today.getTime()) / 86_400_000)
}

export const DEMO_MODULE_LABEL: Record<DemoModuleKey, string> = {
  attendance: 'Attendance',
  syllabus: 'What we learned',
  library: 'Library',
  exams: 'Homework & exams',
  report_cards: 'Report cards',
  games: 'Games',
  fees: 'Fees',
  notices: 'Notices',
  calendar: 'Calendar',
  support: 'Help & support',
}

import type { AttendanceStatus, UserRole } from '@/api/types'

/**
 * Roles an administrator may pick from directly.
 *
 * `CLASS_TEACHER` is deliberately absent: the backend maintains it *from* the
 * class-teacher mappings (`sync_class_teacher_role`), promoting on assign and
 * demoting when the last assignment goes. Offering it as a free choice would
 * let an admin set a role that says CLASS_TEACHER while no mapping says which
 * class — the exact drift the backend is written to prevent — and the next
 * assign or unassign would overwrite it anyway.
 */
export const ROLES: UserRole[] = ['ADMIN', 'TEACHER', 'STUDENT']

/**
 * Every role a user can actually hold — `ROLES` plus the one the backend
 * assigns on its own. Use this for filters and legends, which must be able to
 * describe what exists, not only what an admin may pick.
 */
export const ALL_ROLES: UserRole[] = ['ADMIN', 'CLASS_TEACHER', 'TEACHER', 'STUDENT']

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  CLASS_TEACHER: 'Class teacher',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
}

/**
 * A class teacher is a teacher first — they take periods, own subject mappings
 * and appear on the timetable exactly like a TEACHER. Mirrors `TEACHING_ROLES`
 * on the backend, and every check that used to read `role === 'TEACHER'`
 * belongs here instead: an equality test silently locks a promoted teacher out
 * of the job they were already doing.
 */
export const TEACHING_ROLES: UserRole[] = ['TEACHER', 'CLASS_TEACHER']

export function isTeachingRole(role: UserRole | null | undefined): boolean {
  return role === 'TEACHER' || role === 'CLASS_TEACHER'
}

/** The same set plus ADMIN, for the places an admin stands in for a teacher. */
export function isTeachingOrAdmin(role: UserRole | null | undefined): boolean {
  return isTeachingRole(role) || role === 'ADMIN'
}

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  EXCUSED: 'Excused',
}

/** Single-letter keys used by the attendance keyboard mode. */
export const ATTENDANCE_HOTKEY: Record<string, AttendanceStatus> = {
  p: 'PRESENT',
  a: 'ABSENT',
  l: 'LATE',
  e: 'EXCUSED',
}

/**
 * `material_type` is a free-form string on the backend. These are the values
 * the API docs suggest; the UI offers them as chips plus a free-text escape.
 */
export const MATERIAL_TYPE_PRESETS = ['NOTES', 'BOOK', 'ASSIGNMENT', 'SYLLABUS'] as const

/** `status` on meetings is likewise free-form. */
export const MEETING_STATUS_PRESETS = ['SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED'] as const

/** Below this attendance percentage a student is surfaced as at-risk. */
export const AT_RISK_ATTENDANCE = 75

/** Below this average grade percentage a student is surfaced as at-risk. */
export const AT_RISK_GRADE = 40

export const STORAGE_KEYS = {
  token: 'h7lms.token',
  session: 'h7lms.session',
  theme: 'h7lms.theme',
  sidebar: 'h7lms.sidebar',
  lastSeenMaterials: 'h7lms.lastSeenMaterials',
} as const

/** Seeded demo accounts, offered as quick-fill chips on the login screen. */
export const DEMO_ACCOUNTS = [
  { role: 'ADMIN' as const, email: 'admin@lms.com', password: 'admin123', label: 'Administrator' },
  { role: 'TEACHER' as const, email: 'teacher.math@lms.com', password: 'teacher123', label: 'Teacher' },
  { role: 'STUDENT' as const, email: 'student.alice@lms.com', password: 'student123', label: 'Student' },
]

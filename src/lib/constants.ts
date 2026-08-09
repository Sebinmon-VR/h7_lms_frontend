import type { AttendanceStatus, UserRole } from '@/api/types'

export const ROLES: UserRole[] = ['ADMIN', 'TEACHER', 'STUDENT']

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
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

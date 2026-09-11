import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Disc,
  FileBadge,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Layers,
  Library,
  LineChart,
  Link2,
  Plug,
  Receipt,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { UserOut, UserRole } from '@/api/types'
import { hasProgram } from '@/lib/tuition'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Marks the section landing page so highlighting uses exact matching. */
  end?: boolean
  description?: string
}

export interface NavSection {
  heading: string
  items: NavItem[]
}

const ADMIN_NAV: NavSection[] = [
  {
    heading: 'Overview',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, description: 'System overview and alerts' },
      { to: '/admin/reports', label: 'Reports', icon: BarChart3, description: 'Teacher activity and student performance' },
    ],
  },
  {
    heading: 'People',
    items: [{ to: '/admin/users', label: 'Users', icon: Users, description: 'Accounts and roles' }],
  },
  {
    heading: 'Academics',
    items: [
      { to: '/admin/classes', label: 'Classes', icon: Layers, description: 'Class sections' },
      { to: '/admin/subjects', label: 'Subjects', icon: BookOpen, description: 'Subject catalogue' },
      {
        to: '/admin/mappings',
        label: 'Teacher Mappings',
        icon: Link2,
        description: 'Subject mappings and class teachers',
      },
      {
        to: '/admin/enrollments',
        label: 'Enrollments',
        icon: GraduationCap,
        description: 'Enroll students into classes',
      },
      {
        to: '/admin/timetable',
        label: 'Timetable',
        icon: CalendarRange,
        description: 'Weekly periods for every class',
      },
    ],
  },
  {
    heading: 'Assessment',
    items: [
      {
        to: '/admin/exams',
        label: 'Exams',
        icon: ClipboardCheck,
        description: 'Every exam set by any teacher, and the marking behind it',
      },
      {
        to: '/admin/report-cards',
        label: 'Report Cards',
        icon: FileBadge,
        description: 'Consolidated results per student, per class',
      },
    ],
  },
  {
    heading: 'Content',
    items: [
      {
        to: '/admin/meetings',
        label: 'Meetings',
        icon: Video,
        description: 'Live sessions across every teacher',
      },
      {
        to: '/admin/materials',
        label: 'Materials',
        icon: Library,
        description: 'Every uploaded file, and where it is stored',
      },
    ],
  },
  {
    heading: 'System',
    items: [
      {
        to: '/admin/integrations',
        label: 'Integrations',
        icon: Plug,
        description: 'Drive, Storage, Meet and email health',
      },
      {
        to: '/admin/reminders',
        label: 'Reminders',
        icon: Bell,
        description: 'Class reminder emails and delivery log',
      },
      {
        to: '/admin/recordings',
        label: 'Recordings',
        icon: Disc,
        description: 'Where recorded classes were filed, and what is holding one up',
      },
    ],
  },
]

const TEACHER_NAV: NavSection[] = [
  {
    heading: 'Overview',
    items: [
      { to: '/teacher', label: 'Dashboard', icon: LayoutDashboard, end: true, description: 'Your day at a glance' },
      { to: '/teacher/classes', label: 'My Classes', icon: Layers, description: 'The classes and subjects you teach' },
      { to: '/teacher/timetable', label: 'Timetable', icon: CalendarRange, description: 'Your lessons this week' },
      { to: '/teacher/insights', label: 'Insights', icon: LineChart, description: 'How your classes are getting on' },
    ],
  },
  {
    heading: 'Classroom',
    items: [
      { to: '/teacher/attendance', label: 'Attendance', icon: CalendarCheck, description: 'Take the register' },
      { to: '/teacher/topics', label: 'Syllabus', icon: ClipboardList, description: 'Note down what you taught' },
      { to: '/teacher/meetings', label: 'Live Classes', icon: Video, description: 'Set up a session or share a recording' },
      { to: '/teacher/materials', label: 'Materials', icon: Library, description: 'Share notes and worksheets' },
      { to: '/teacher/gradebook', label: 'Gradebook', icon: FileText, description: 'Record and review test marks' },
    ],
  },
  {
    heading: 'Assessment',
    items: [
      { to: '/teacher/exams', label: 'Exams', icon: ClipboardCheck, description: 'Set an exam, mark scripts, release results' },
      {
        to: '/teacher/report-cards',
        label: 'Report Cards',
        icon: FileBadge,
        description: 'Issue term cards for the classes you lead',
      },
    ],
  },
]

const STUDENT_NAV: NavSection[] = [
  {
    heading: 'Your day',
    items: [
      { to: '/student', label: 'Home', icon: LayoutDashboard, end: true, description: 'Your day at a glance' },
      { to: '/student/classes', label: 'My Subjects', icon: Layers, description: 'What you learn and who teaches it' },
      { to: '/student/timetable', label: 'Timetable', icon: CalendarRange, description: 'When each class happens' },
    ],
  },
  {
    heading: 'Your work',
    items: [
      { to: '/student/attendance', label: 'My Days', icon: CalendarCheck, description: 'How often you were in class' },
      { to: '/student/syllabus', label: 'What We Learned', icon: ClipboardList, description: 'Topics your class has covered' },
      { to: '/student/meetings', label: 'Live Classes', icon: Video, description: 'Join a class or watch it back' },
      { to: '/student/materials', label: 'Notes & Books', icon: Library, description: 'Things your teachers shared' },
      { to: '/student/exams', label: 'Exams', icon: ClipboardCheck, description: 'Sit an exam or see how you did' },
      { to: '/student/grades', label: 'My Marks', icon: FileText, description: 'How you did in each test' },
      { to: '/student/report-cards', label: 'Report Cards', icon: FileBadge, description: 'How your term went' },
    ],
  },
]

/**
 * The online tuition product, as its own section rather than folded into the
 * lists above.
 *
 * A tuition class is not a school class with fewer people in it: it is one
 * student, one teacher, a recurring weekly slot, a countdown and an invoice.
 * Mixing its screens into "Classroom" would leave a teacher who does both jobs
 * unable to tell which set of students they were looking at.
 */
const ADMIN_TUITION_NAV: NavSection[] = [
  {
    heading: 'Online tuition',
    items: [
      {
        to: '/admin/tuition',
        label: 'Overview',
        icon: LayoutDashboard,
        end: true,
        description: 'Attendance, hours taught and what needs fixing',
      },
      {
        to: '/admin/tuition/enrollments',
        label: 'Arrangements',
        icon: GraduationCap,
        description: 'Who teaches which student, for which subject',
      },
      {
        to: '/admin/tuition/schedule',
        label: 'Schedule',
        icon: CalendarClock,
        description: 'Weekly class times, clashes and generated classes',
      },
      {
        to: '/admin/tuition/sessions',
        label: 'Classes',
        icon: Video,
        description: 'Every class, live or finished',
      },
      {
        to: '/admin/tuition/fees',
        label: 'Fees & Invoices',
        icon: Receipt,
        description: 'Fee plans, billing runs and payments',
      },
      {
        to: '/tuition/library',
        label: 'Library',
        icon: Library,
        description: 'Shared books, notes and recordings, and uploads awaiting approval',
      },
      {
        to: '/admin/tuition/access',
        label: 'People & Access',
        icon: ShieldCheck,
        description: 'Add tuition students and tutors, and grant access to existing accounts',
      },
      {
        to: '/admin/tuition/settings',
        label: 'Tuition Settings',
        icon: Settings2,
        description: 'Timezone, class length, reminders and lateness rules',
      },
    ],
  },
]

const TEACHER_TUITION_NAV: NavSection[] = [
  {
    heading: 'Online tuition',
    items: [
      {
        to: '/tuition/teacher',
        label: 'Tuition Home',
        icon: CalendarClock,
        end: true,
        description: 'Your next one-to-one classes',
      },
      {
        to: '/tuition/teacher/students',
        label: 'My Students',
        icon: UserRound,
        description: 'The students you teach one to one',
      },
      {
        to: '/tuition/teacher/sessions',
        label: 'Classes',
        icon: Video,
        description: 'Start a class, take the register, set the next one',
      },
      {
        to: '/tuition/teacher/assessments',
        label: 'Homework & Exams',
        icon: ClipboardCheck,
        description: 'Set work for one student and mark it',
      },
      {
        to: '/tuition/library',
        label: 'Library',
        icon: Library,
        description: 'Books, notes and recordings you share',
      },
      {
        to: '/tuition/teacher/reports',
        label: 'My Report',
        icon: BarChart3,
        description: 'Classes taught, hours and attendance',
      },
    ],
  },
]

const STUDENT_TUITION_NAV: NavSection[] = [
  {
    heading: 'Online tuition',
    items: [
      {
        to: '/tuition/student',
        label: 'Tuition Home',
        icon: CalendarClock,
        end: true,
        description: 'Your next one-to-one classes',
      },
      {
        to: '/tuition/student/subjects',
        label: 'My Tutors',
        icon: UserRound,
        description: 'What you learn one to one, and who teaches it',
      },
      {
        to: '/tuition/student/sessions',
        label: 'Classes',
        icon: Video,
        description: 'Join a class or look back at one',
      },
      {
        to: '/tuition/student/assessments',
        label: 'Homework & Exams',
        icon: ClipboardCheck,
        description: 'Work your tutor set you — homework, assignments and papers to sit',
      },
      {
        to: '/tuition/student/report-cards',
        label: 'Report Cards',
        icon: FileBadge,
        description: 'How your term went, subject by subject',
      },
      {
        to: '/tuition/library',
        label: 'Library',
        icon: Library,
        description: 'Books and notes your tutors shared',
      },
      {
        to: '/tuition/student/reports',
        label: 'My Attendance',
        icon: BarChart3,
        description: 'Classes attended and hours taught',
      },
    ],
  },
]

/**
 * Navigation for a signed-in user.
 *
 * Takes the whole profile, not just the role, because the tuition sections
 * depend on the `programs` list too — a teacher's menu differs from another
 * teacher's menu based on which products they are part of. Admins always see
 * the tuition section: one admin team runs both, matching the backend, which
 * does not programme-scope admins either.
 */
/**
 * Navigation for a signed-in user, scoped to the products they belong to.
 *
 * Each programme contributes its own sections and NEITHER is implied by the
 * other. A tuition-only student has no school timetable, no school attendance
 * and no school report cards — showing those menu items would advertise pages
 * that answer 403, which reads as a broken app rather than as a boundary.
 *
 * Absent `programs` means school-only, matching the backend: every account that
 * predates tuition was a school account. Admins get everything — one admin team
 * runs both, and the backend does not programme-scope them either.
 */
export function navigationFor(user: Pick<UserOut, 'role' | 'programs'> | null): NavSection[] {
  const role = user?.role ?? null
  if (role === 'ADMIN') return [...ADMIN_NAV, ...ADMIN_TUITION_NAV]

  const lms = hasProgram(user, 'LMS')
  const tuition = hasProgram(user, 'TUITION')
  const sections: NavSection[] = []

  switch (role) {
    // Same navigation for both teaching roles. What a class teacher may
    // additionally reach is decided per class inside these pages, and the
    // classes they lead appear under "My Classes" rather than as a new section.
    case 'CLASS_TEACHER':
    case 'TEACHER':
      if (lms) sections.push(...TEACHER_NAV)
      if (tuition) sections.push(...TEACHER_TUITION_NAV)
      break
    case 'STUDENT':
      if (lms) sections.push(...STUDENT_NAV)
      if (tuition) sections.push(...STUDENT_TUITION_NAV)
      break
    default:
      return []
  }

  return sections
}

export function allNavItems(user: Pick<UserOut, 'role' | 'programs'> | null): NavItem[] {
  return navigationFor(user).flatMap((section) => section.items)
}

export const PORTAL_LABEL: Record<UserRole, string> = {
  ADMIN: 'Administration',
  CLASS_TEACHER: 'Teaching',
  TEACHER: 'Teaching',
  STUDENT: 'Learning',
}

import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
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
  Users,
  Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { UserRole } from '@/api/types'

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

export function navigationFor(role: UserRole | null): NavSection[] {
  switch (role) {
    case 'ADMIN':
      return ADMIN_NAV
    // Same navigation for both teaching roles. What a class teacher may
    // additionally reach is decided per class inside these pages, and the
    // classes they lead appear under "My Classes" rather than as a new section.
    case 'CLASS_TEACHER':
    case 'TEACHER':
      return TEACHER_NAV
    case 'STUDENT':
      return STUDENT_NAV
    default:
      return []
  }
}

export function allNavItems(role: UserRole | null): NavItem[] {
  return navigationFor(role).flatMap((section) => section.items)
}

export const PORTAL_LABEL: Record<UserRole, string> = {
  ADMIN: 'Administration',
  CLASS_TEACHER: 'Teaching',
  TEACHER: 'Teaching',
  STUDENT: 'Learning',
}

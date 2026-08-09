import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarRange,
  ClipboardList,
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
        description: 'Map a teacher to a subject and class',
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
    ],
  },
]

const TEACHER_NAV: NavSection[] = [
  {
    heading: 'Overview',
    items: [
      { to: '/teacher', label: 'Dashboard', icon: LayoutDashboard, end: true, description: 'Today at a glance' },
      { to: '/teacher/classes', label: 'My Classes', icon: Layers, description: 'Assigned classes and subjects' },
      { to: '/teacher/timetable', label: 'Timetable', icon: CalendarRange, description: 'Your weekly periods' },
      { to: '/teacher/insights', label: 'Insights', icon: LineChart, description: 'Attendance and grade analytics' },
    ],
  },
  {
    heading: 'Classroom',
    items: [
      { to: '/teacher/attendance', label: 'Attendance', icon: CalendarCheck, description: 'Take or edit attendance' },
      { to: '/teacher/topics', label: 'Syllabus', icon: ClipboardList, description: 'Log topics covered' },
      { to: '/teacher/meetings', label: 'Meetings', icon: Video, description: 'Live sessions and recordings' },
      { to: '/teacher/materials', label: 'Materials', icon: Library, description: 'Upload study material' },
      { to: '/teacher/gradebook', label: 'Gradebook', icon: FileText, description: 'Exam marks' },
    ],
  },
]

const STUDENT_NAV: NavSection[] = [
  {
    heading: 'Overview',
    items: [
      { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true, description: 'Your day at a glance' },
      { to: '/student/classes', label: 'My Classes', icon: Layers, description: 'Subjects and teachers' },
      { to: '/student/timetable', label: 'Timetable', icon: CalendarRange, description: 'Your weekly classes' },
    ],
  },
  {
    heading: 'Learning',
    items: [
      { to: '/student/attendance', label: 'Attendance', icon: CalendarCheck, description: 'Your attendance record' },
      { to: '/student/syllabus', label: 'Syllabus', icon: ClipboardList, description: 'Topics covered' },
      { to: '/student/meetings', label: 'Meetings', icon: Video, description: 'Live classes and recordings' },
      { to: '/student/materials', label: 'Materials', icon: Library, description: 'Notes and resources' },
      { to: '/student/grades', label: 'Grades', icon: FileText, description: 'Exam results' },
    ],
  },
]

export function navigationFor(role: UserRole | null): NavSection[] {
  switch (role) {
    case 'ADMIN':
      return ADMIN_NAV
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
  TEACHER: 'Teaching',
  STUDENT: 'Learning',
}

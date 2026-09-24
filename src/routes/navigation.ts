import {
  BadgeCheck,
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Coins,
  Disc,
  FileBadge,
  FileText,
  GraduationCap,
  Home,
  Inbox,
  LayoutDashboard,
  Layers,
  LifeBuoy,
  Library,
  LineChart,
  Link2,
  Megaphone,
  NotebookPen,
  PlaneTakeoff,
  Plug,
  Receipt,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  UsersRound,
  Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { Program, UserOut, UserRole } from '@/api/types'
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
    items: [
      { to: '/admin/users', label: 'Users', icon: Users, description: 'Accounts and roles' },
      {
        to: '/admin/admission-requests',
        label: 'Admission Requests',
        icon: Inbox,
        description: 'Applications from the website: review, admit in one step, or decline',
      },
      {
        to: '/admin/families',
        label: 'Families',
        icon: UsersRound,
        description: 'Households for sibling billing, and the parent logins that reach them',
      },
    ],
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
      {
        to: '/admin/admissions',
        label: 'Admissions',
        icon: BadgeCheck,
        description: 'Session years and the categories students are admitted under',
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
    heading: 'Money',
    items: [
      {
        to: '/admin/finance',
        label: 'Fees & Invoices',
        icon: Coins,
        description: 'Fee heads, structures, instalments, concessions and what each student owes',
      },
    ],
  },
  {
    heading: 'Communication',
    items: [
      {
        to: '/admin/notices',
        label: 'Notice Board',
        icon: Megaphone,
        description: 'Write, schedule and publish notices, and see who has read them',
      },
      {
        to: '/admin/support',
        label: 'Support',
        icon: LifeBuoy,
        description: 'The ticket queue and the contact details people are given',
      },
    ],
  },
  {
    heading: 'Staff & scheduling',
    items: [
      {
        to: '/admin/extra-classes',
        label: 'Extra Classes',
        icon: CalendarPlus,
        description: 'Approve requests for classes outside the timetable, then schedule them',
      },
      {
        to: '/admin/leave',
        label: 'Staff Leave',
        icon: PlaneTakeoff,
        description: 'Applications to decide, balances, and who is away today',
      },
      {
        to: '/admin/oversight',
        label: 'Oversight',
        icon: ClipboardList,
        description: 'Exam and homework cadence, per-student counts, and parent digests',
      },
    ],
  },
  {
    heading: 'System',
    items: [
      {
        to: '/admin/settings',
        label: 'School Settings',
        icon: Settings2,
        description: 'Admission and staff number formats, the live-class clock, and library access',
      },
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
      {
        to: '/teacher/homework',
        label: 'Homework',
        icon: NotebookPen,
        description: 'Set work, see who has handed in, and mark it',
      },
    ],
  },
  {
    heading: 'Your time',
    items: [
      {
        to: '/teacher/extra-classes',
        label: 'Extra Classes',
        icon: CalendarPlus,
        description: 'Ask for a class outside the timetable',
      },
      {
        to: '/teacher/leave',
        label: 'My Leave',
        icon: PlaneTakeoff,
        description: 'Apply for leave and see what you have taken',
      },
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
      {
        to: '/student/homework',
        label: 'Homework',
        icon: NotebookPen,
        description: 'Work you have been set, and handing it in',
      },
    ],
  },
  {
    heading: 'Fees',
    items: [
      {
        to: '/student/fees',
        label: 'My Fees',
        icon: Receipt,
        description: 'What you owe, what it is made up of, and what has been paid',
      },
    ],
  },
]

/**
 * A guardian's portal.
 *
 * Short on purpose. A parent has no timetable, no register and no work of
 * their own — everything they see belongs to a child, and which child is the
 * first choice they make. So the switcher IS the home page rather than a
 * control bolted onto one, and the per-child screens hang off it.
 *
 * What a parent may open per child is decided by that child's link flags, not
 * by this list: `may_view_academics`, `may_view_attendance` and
 * `may_view_fees` arrive on `/parent/children`, and the child page hides what
 * a flag denies rather than rendering a tab that answers 403.
 */
const PARENT_NAV: NavSection[] = [
  {
    heading: 'Your family',
    items: [
      {
        to: '/parent',
        label: 'My Children',
        icon: Home,
        end: true,
        description: 'Everyone you can see, and how each of them is getting on',
      },
    ],
  },
]

/**
 * The screens that belong to no single role.
 *
 * All three are served by endpoints guarded with `require_any_authenticated`
 * and scoped per caller: a student's notice board, a teacher's calendar and a
 * parent's support thread come from the same routes, with the server deciding
 * what each contains. Appending one shared section is therefore honest as well
 * as short — there is genuinely one screen behind each of these, not four.
 */
const SHARED_NAV: NavSection = {
  // "Everyone" described who the section was FOR, which is reasoning about the
  // roles rather than a label a user reads. To the person looking at it these
  // are simply the general screens that belong to no one module.
  heading: 'General',
  items: [
    {
      to: '/calendar',
      label: 'Calendar',
      icon: CalendarDays,
      description: 'Lessons, live classes, exams and homework on one grid',
    },
    {
      to: '/notices',
      label: 'Notices',
      icon: Megaphone,
      description: 'Announcements addressed to you',
    },
    {
      to: '/support',
      label: 'Help & Support',
      icon: LifeBuoy,
      description: 'Raise a ticket, or find who to call',
    },
  ],
}

/**
 * The shared section for the tuition side of the menu.
 *
 * Calendar and support are genuinely one screen for both products. Notices
 * are not: the tuition board is its own route, and it already sits in each
 * tuition menu above — so it is left out here rather than listed twice, and
 * the school's `/notices` link, which would flip the sidebar back to the
 * school product the moment it was clicked, is not offered from tuition at all.
 */
const SHARED_TUITION_NAV: NavSection = {
  heading: SHARED_NAV.heading,
  items: SHARED_NAV.items.filter((item) => item.to !== '/notices'),
}

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
        to: '/admin/tuition/subjects',
        label: 'Student Subjects',
        icon: BookOpen,
        description: 'Add or drop a subject for one student, and see whether its classes run',
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
        description: 'Class packages, billing runs and payments',
      },
      {
        to: '/admin/tuition/admissions',
        label: 'Admissions',
        icon: BadgeCheck,
        description: 'Tuition session years and the categories students are admitted under',
      },
      {
        to: '/admin/tuition/notices',
        label: 'Notice Board',
        icon: Megaphone,
        description: 'Post to tuition students and tutors, schedule notices, and see who read them',
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
        to: '/tuition/notices',
        label: 'Notices',
        icon: Megaphone,
        description: 'Announcements from the tuition office',
      },
      {
        to: '/tuition/teacher/reports',
        label: 'My Report',
        icon: BarChart3,
        description: 'Classes taught, hours and attendance',
      },
    ],
  },
  {
    /**
     * The exam engine, reachable from the tuition menu.
     *
     * These are the SAME screens the school uses and the same `/teacher/...`
     * routes — a tuition assessment is an ordinary exam, and its routes are
     * mounted outside the LMS programme guard precisely so a tuition-only
     * tutor reaches them. Without these two entries the engine was reachable
     * only by opening one assessment, so nobody could browse their papers or
     * find report cards at all.
     */
    heading: 'Marking',
    items: [
      {
        to: '/teacher/exams',
        label: 'All Papers',
        icon: ClipboardCheck,
        description: 'Every paper you have set, across both products',
      },
      {
        to: '/teacher/report-cards',
        label: 'Report Cards',
        icon: FileBadge,
        description: 'Issue and review term cards',
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
        to: '/tuition/notices',
        label: 'Notices',
        icon: Megaphone,
        description: 'Announcements from the tuition office and your tutors',
      },
      {
        to: '/tuition/student/reports',
        label: 'My Attendance',
        icon: BarChart3,
        description: 'Classes attended and hours taught',
      },
      {
        to: '/tuition/student/fees',
        label: 'My Fees',
        icon: Receipt,
        description: 'What you have been billed for your classes, and what is still owed',
      },
    ],
  },
]

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
/**
 * Which product a path belongs to.
 *
 * Read from the URL rather than stored, so a deep link into the other product
 * switches the menu with it — a remembered preference would leave somebody
 * looking at a tuition screen with the school's navigation beside it.
 */
export function programForPath(pathname: string): Program {
  return pathname.startsWith('/tuition') || pathname.startsWith('/admin/tuition')
    ? 'TUITION'
    : 'LMS'
}

/**
 * The product whose menu to show, given what was asked for and what the
 * account actually has.
 *
 * A single-product user always gets their own product whatever the URL says:
 * they have no switcher, so an unrecognised path must not leave them with an
 * empty sidebar.
 */
function effectiveProgram(
  user: Pick<UserOut, 'role' | 'programs'> | null,
  requested: Program,
): Program {
  // Admins are never programme-scoped — one admin team runs both, and the
  // backend takes the same view.
  if (user?.role === 'ADMIN') return requested

  const lms = hasProgram(user, 'LMS')
  const tuition = hasProgram(user, 'TUITION')

  if (requested === 'TUITION' && tuition) return 'TUITION'
  if (requested === 'LMS' && lms) return 'LMS'
  return tuition && !lms ? 'TUITION' : 'LMS'
}

/**
 * Navigation for a signed-in user, scoped to ONE product at a time.
 *
 * Previously this concatenated both products' sections, which was tolerable
 * while nothing said which one you were in. With a product switcher above the
 * menu it became actively misleading: the control read "School" while the list
 * below it carried nine tuition entries. A switcher that does not change what
 * it sits above is not a switcher.
 *
 * The two products contribute entirely separate sections and NEITHER is
 * implied by the other — a tuition class is not a school class with fewer
 * people in it, and a tuition-only tutor has no register or school timetable.
 */
export function navigationFor(
  user: Pick<UserOut, 'role' | 'programs'> | null,
  program: Program = 'LMS',
): NavSection[] {
  const role = user?.role ?? null
  if (!role) return []

  // A parent has no product of their own: they reach whatever their children
  // are part of, resolved per child on every request. Scoping their menu to a
  // programme would hide the tuition half of a family whose child takes both.
  if (role === 'PARENT') return [...PARENT_NAV, SHARED_NAV]

  const active = effectiveProgram(user, program)
  const tuition = active === 'TUITION'
  const sections: NavSection[] = []

  switch (role) {
    case 'ADMIN':
      // ONE product at a time, the one the switcher above says. Listing both
      // was tried and read as a switcher that does not switch: "School" on the
      // control, nine tuition entries beneath it. The other product stays one
      // click away because the switcher always renders for an admin (it falls
      // back to the profile when /me/programs is unavailable), so scoping the
      // menu never hides the tuition half the way it did the first time this
      // shipped.
      sections.push(...(tuition ? ADMIN_TUITION_NAV : ADMIN_NAV))
      break
    // Same navigation for both teaching roles. What a class teacher may
    // additionally reach is decided per class inside these pages, and the
    // classes they lead appear under "My Classes" rather than as a new section.
    case 'CLASS_TEACHER':
    case 'TEACHER':
      sections.push(...(tuition ? TEACHER_TUITION_NAV : TEACHER_NAV))
      break
    case 'STUDENT':
      sections.push(...(tuition ? STUDENT_TUITION_NAV : STUDENT_NAV))
      break
    default:
      return []
  }

  // Appended rather than prepended: the shared screens are real, but they are
  // not what anybody signs in to do.
  sections.push(tuition ? SHARED_TUITION_NAV : SHARED_NAV)
  return sections
}

/**
 * Every SECTION the account can reach, across both products, deduplicated.
 *
 * The command palette groups by heading and wants the whole map — so "Everyone",
 * which both products contribute, is merged rather than listed twice.
 */
export function allNavSections(
  user: Pick<UserOut, 'role' | 'programs'> | null,
): NavSection[] {
  const merged = new Map<string, NavSection>()
  for (const section of [...navigationFor(user, 'LMS'), ...navigationFor(user, 'TUITION')]) {
    const existing = merged.get(section.heading)
    if (!existing) {
      merged.set(section.heading, { heading: section.heading, items: [...section.items] })
      continue
    }
    const seen = new Set(existing.items.map((i) => i.to))
    existing.items.push(...section.items.filter((i) => !seen.has(i.to)))
  }
  return [...merged.values()]
}

/**
 * Every item the account can reach, ACROSS both products.
 *
 * Deliberately not scoped, unlike the sidebar: this feeds the command palette
 * and the breadcrumb resolver, and both want the whole map. Being unable to
 * jump to a tuition screen from a school one — or having a tuition URL render
 * a blank breadcrumb — is exactly what a command palette exists to prevent.
 */
export function allNavItems(user: Pick<UserOut, 'role' | 'programs'> | null): NavItem[] {
  return allNavSections(user).flatMap((section) => section.items)
}

export const PORTAL_LABEL: Record<UserRole, string> = {
  ADMIN: 'Administration',
  CLASS_TEACHER: 'Teaching',
  TEACHER: 'Teaching',
  STUDENT: 'Learning',
  PARENT: 'Family',
}

import type { Program, UserRole } from '@/api/types'

/**
 * Which of the three tuition routers answered.
 *
 * `/admin/tuition/sessions`, `/tuition/teachers/sessions` and
 * `/tuition/students/sessions` return the same shape but a different slice —
 * everyone's, mine-as-teacher, mine-as-student. An admin who opens a teacher
 * screen would otherwise read the admin-wide cache and see other people's
 * classes, so the caller's viewpoint is part of the key.
 */
export type TuitionScope = 'admin' | 'teacher' | 'student'

/**
 * The filters that reach the server. `who` is whichever counterparty id the
 * endpoint accepts — a student for the teacher's list, a subject for the
 * student's, either for the admin's.
 */
/** Filters that reach `GET /admin/tuition/billing`. */
export interface TuitionBillingKey {
  student?: number
  status?: string
  from?: string
  to?: string
  unpaidOnly?: boolean
}

export interface TuitionSessionFilters {
  from?: string
  to?: string
  status?: string
  who?: number | string
}

/**
 * Query key factory.
 *
 * Teacher and student keys deliberately carry NO filter parameters: the
 * backend implements `?class_id`/`?subject_id` as Python list comprehensions
 * over the same full fetch, so filtering server-side buys nothing and costs a
 * refetch. One unfiltered cache entry gives instant filter switching and makes
 * cross-class analytics free.
 *
 * `/admin/users` keeps `role` because that one is a real Firestore `where`.
 */
export const qk = {
  auth: {
    root: ['auth'] as const,
    me: () => ['auth', 'me'] as const,
  },
  admin: {
    root: ['admin'] as const,
    users: (role?: UserRole) => ['admin', 'users', role ?? 'ALL'] as const,
    usersRoot: () => ['admin', 'users'] as const,
    classes: () => ['admin', 'classes'] as const,
    subjects: () => ['admin', 'subjects'] as const,
    mappings: () => ['admin', 'mappings'] as const,
    /**
     * The full class-teacher chart. Unfiltered for the same reason as the
     * lists above — it is small, and one entry filters instantly on the client
     * — even though `class_id` / `teacher_id` ARE real server-side queries here.
     */
    classTeachers: () => ['admin', 'class-teachers'] as const,
    enrollments: () => ['admin', 'enrollments'] as const,
    monitoring: () => ['admin', 'reports', 'monitoring'] as const,
    jobs: () => ['admin', 'jobs'] as const,
    job: (jobId: string) => ['admin', 'jobs', jobId] as const,
    /** System-wide lists — distinct from the teacher-scoped ones below. */
    meetings: () => ['admin', 'meetings'] as const,
    materials: () => ['admin', 'materials'] as const,
    /** Keyed by `probe` because the two views return genuinely different data. */
    integrations: (probe: boolean) => ['admin', 'integrations', probe] as const,
    integrationsRoot: () => ['admin', 'integrations'] as const,
    /**
     * `includeInactive` is a real server-side difference, unlike the other
     * timetable filters, so it belongs in the key.
     */
    timetable: (includeInactive: boolean) => ['admin', 'timetable', includeInactive] as const,
    timetableRoot: () => ['admin', 'timetable'] as const,
    reminderStatus: () => ['admin', 'reminders', 'status'] as const,
    reminderPreview: () => ['admin', 'reminders', 'preview'] as const,
    reminderLog: (limit: number) => ['admin', 'reminders', 'log', limit] as const,
    remindersRoot: () => ['admin', 'reminders'] as const,
    recordingStatus: () => ['admin', 'recordings', 'status'] as const,
    recordingPreview: () => ['admin', 'recordings', 'preview'] as const,
    recordingLog: (limit: number) => ['admin', 'recordings', 'log', limit] as const,
    recordingsRoot: () => ['admin', 'recordings'] as const,
  },
  health: {
    root: ['health'] as const,
    cache: () => ['health', 'cache'] as const,
    storage: () => ['health', 'storage'] as const,
  },
  teacher: {
    root: ['teacher'] as const,
    myClasses: () => ['teacher', 'my-classes'] as const,
    /** Classes led as class teacher — NOT the subject periods in `myClasses`. */
    myLedClasses: () => ['teacher', 'my-led-classes'] as const,
    classStudents: (classId: number) => ['teacher', 'class-students', classId] as const,
    classStudentsRoot: () => ['teacher', 'class-students'] as const,
    attendance: () => ['teacher', 'attendance'] as const,
    topics: () => ['teacher', 'topics'] as const,
    meetings: () => ['teacher', 'meetings'] as const,
    materials: () => ['teacher', 'materials'] as const,
    grades: () => ['teacher', 'grades'] as const,
    timetable: () => ['teacher', 'timetable'] as const,
    /** Keyed by date; undefined means "today per the school timezone". */
    timetableDay: (onDate?: string) => ['teacher', 'timetable', 'day', onDate ?? 'today'] as const,
    timetableUpcoming: () => ['teacher', 'timetable', 'upcoming'] as const,
  },
  student: {
    root: ['student'] as const,
    myClasses: () => ['student', 'my-classes'] as const,
    attendance: () => ['student', 'attendance'] as const,
    topics: () => ['student', 'topics'] as const,
    meetings: () => ['student', 'meetings'] as const,
    materials: () => ['student', 'materials'] as const,
    grades: () => ['student', 'grades'] as const,
    timetable: () => ['student', 'timetable'] as const,
    timetableDay: (onDate?: string) => ['student', 'timetable', 'day', onDate ?? 'today'] as const,
    timetableUpcoming: () => ['student', 'timetable', 'upcoming'] as const,
    /**
     * The exam module, student side. Each exam carries this student's own
     * state (can start, has handed in, personal deadline), so the list is
     * refetched after every write to a script rather than patched by hand.
     */
    exams: () => ['student', 'exams'] as const,
    exam: (examId: number) => ['student', 'exams', examId] as const,
    submission: (examId: number) => ['student', 'exams', examId, 'submission'] as const,
    reportCards: () => ['student', 'report-cards'] as const,
    reportCard: (cardId: string) => ['student', 'report-cards', cardId] as const,
  },
  /**
   * The exam module, staff side. Shared by the teacher and admin screens
   * because the backend serves both from the same endpoints — the only
   * difference is how much each caller is allowed to see, which the server
   * decides per request. Keys carry no filters for the usual reason.
   */
  exams: {
    root: ['exams'] as const,
    list: () => ['exams', 'list'] as const,
    detail: (examId: number) => ['exams', 'detail', examId] as const,
    stats: (examId: number) => ['exams', 'stats', examId] as const,
    submissions: (examId: number) => ['exams', 'submissions', examId] as const,
    submission: (examId: number, studentId: number) =>
      ['exams', 'submissions', examId, studentId] as const,
    reportCards: () => ['exams', 'report-cards'] as const,
    reportCard: (cardId: string) => ['exams', 'report-cards', cardId] as const,
  },
  /**
   * The online tuition product.
   *
   * Filters DO belong in these keys, unlike the LMS ones above. A tuition
   * session list is a real Firestore range query over a date window, so
   * `from`/`to` fetch genuinely different rows rather than re-slicing one
   * response — and the windows a user moves between (this week, last month)
   * are worth caching separately.
   *
   * `sessionsRoot()` is what mutations invalidate: starting, ending or
   * cancelling a class changes rows in windows we cannot name, so the whole
   * subtree goes rather than one entry.
   */
  tuition: {
    root: ['tuition'] as const,

    /** Also the cheapest "am I in the programme?" probe — it 403s if not. */
    me: () => ['tuition', 'me'] as const,
    settings: (program: Program) => ['tuition', 'settings', program] as const,
    settingsRoot: () => ['tuition', 'settings'] as const,

    /** `includeAll` is a real server-side difference: it widens past the programme. */
    users: (role: UserRole | 'ALL', includeAll: boolean) =>
      ['tuition', 'users', role, includeAll] as const,
    usersRoot: () => ['tuition', 'users'] as const,

    enrollments: (includeInactive: boolean) =>
      ['tuition', 'enrollments', includeInactive] as const,
    enrollmentsRoot: () => ['tuition', 'enrollments'] as const,
    enrollment: (enrollmentId: number) => ['tuition', 'enrollment', enrollmentId] as const,

    slots: () => ['tuition', 'slots'] as const,
    conflicts: () => ['tuition', 'conflicts'] as const,
    scheduleStatus: () => ['tuition', 'schedule', 'status'] as const,

    sessions: (scope: TuitionScope, filters: TuitionSessionFilters = {}) =>
      [
        'tuition',
        'sessions',
        scope,
        filters.from ?? 'any',
        filters.to ?? 'any',
        filters.status ?? 'any',
        filters.who ?? 'any',
      ] as const,
    sessionsRoot: () => ['tuition', 'sessions'] as const,
    session: (scope: TuitionScope, sessionId: string) =>
      ['tuition', 'session', scope, sessionId] as const,
    upcoming: (scope: TuitionScope) => ['tuition', 'upcoming', scope] as const,

    /** One entry, filtered on the client — the server has no text search. */
    library: () => ['tuition', 'library'] as const,
    libraryPending: () => ['tuition', 'library', 'pending'] as const,
    libraryItem: (itemId: number) => ['tuition', 'library', 'item', itemId] as const,

    assessments: (scope: TuitionScope) => ['tuition', 'assessments', scope] as const,
    assessmentsRoot: () => ['tuition', 'assessments'] as const,
    reportCards: () => ['tuition', 'report-cards'] as const,

    feePlans: () => ['tuition', 'fee-plans'] as const,
    invoices: (studentId?: number) => ['tuition', 'invoices', studentId ?? 'ALL'] as const,
    invoicesRoot: () => ['tuition', 'invoices'] as const,
    invoice: (invoiceId: string) => ['tuition', 'invoice', invoiceId] as const,
    feeSummary: (from?: string, to?: string) =>
      ['tuition', 'fees', 'summary', from ?? 'any', to ?? 'any'] as const,
    feesRoot: () => ['tuition', 'fees'] as const,

    /**
     * The billing screen. Every filter is in the key because the server
     * computes the summary from exactly the rows it returned — two filter sets
     * are two genuinely different answers, not one list sliced twice.
     */
    billing: (filters: TuitionBillingKey = {}) =>
      [
        'tuition',
        'billing',
        filters.student ?? 'ALL',
        filters.status ?? 'any',
        filters.from ?? 'any',
        filters.to ?? 'any',
        filters.unpaidOnly ? 'unpaid' : 'all',
      ] as const,
    billingRoot: () => ['tuition', 'billing'] as const,
    studentBilling: (studentId: number) => ['tuition', 'billing', 'student', studentId] as const,
    invoiceDetail: (invoiceId: string) => ['tuition', 'invoice', invoiceId, 'detail'] as const,

    overview: (from?: string, to?: string) =>
      ['tuition', 'reports', 'overview', from ?? 'any', to ?? 'any'] as const,
    studentReport: (scope: TuitionScope, studentId: number, from?: string, to?: string) =>
      ['tuition', 'reports', 'student', scope, studentId, from ?? 'any', to ?? 'any'] as const,
    teacherReport: (scope: TuitionScope, teacherId: number, from?: string, to?: string) =>
      ['tuition', 'reports', 'teacher', scope, teacherId, from ?? 'any', to ?? 'any'] as const,
    reportsRoot: () => ['tuition', 'reports'] as const,

    reminderStatus: () => ['tuition', 'reminders', 'status'] as const,
    reminderPreview: () => ['tuition', 'reminders', 'preview'] as const,
    remindersRoot: () => ['tuition', 'reminders'] as const,
  },
} as const

/**
 * Freshness tiers, matched to how expensive each endpoint actually is.
 *
 * The backend now batches its reads and caches reference documents for 60s,
 * so list endpoints are no longer punishingly slow. These tiers stay
 * conservative anyway: the remaining latency floor is the ~850 ms round trip
 * between the API and its Firestore region, which caching on our side avoids
 * entirely. Refetching more eagerly would buy freshness nobody asked for at a
 * cost the user feels.
 */
export const STALE = {
  /** Rarely-changing reference data; matches the server's own cache TTL. */
  reference: 5 * 60_000,
  /** Records teachers write during a session. */
  transactional: 60_000,
  /** The monitoring report — server-cached for MONITORING_REPORT_TTL_SECONDS. */
  expensive: 5 * 60_000,
  /** Background job state, polled while a job is in flight. */
  live: 0,
  /**
   * Resolved schedules — "today" and "what's next".
   *
   * Short, because these carry a countdown the server computed: a cached copy
   * keeps saying "in 12 minutes" long after it has become five. The underlying
   * timetable barely changes, so this is about the derived instants, not the
   * rules behind them.
   */
  schedule: 60_000,
} as const

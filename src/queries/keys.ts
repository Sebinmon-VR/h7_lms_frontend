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
 * Filters that reach `GET /admin/finance/invoices`.
 *
 * All of them are real server-side narrowing rather than a re-slice of one
 * response, so each belongs in the key — `overdue_only` in particular is
 * computed per instalment against the clock and cannot be derived from the
 * unfiltered list without redoing that arithmetic.
 */
export interface FinanceInvoiceKey {
  program?: Program
  academicYearId?: number
  status?: string
  studentId?: number
  overdueOnly?: boolean
}

/** Filters that reach the admin leave queue. */
export interface LeaveQueueKey {
  teacherId?: number
  status?: string
  leaveType?: string
  from?: string
  to?: string
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

    /**
     * Packages, and who is on which. The year and term ARE in the key because
     * they are server-side filters — but note they widen: an unscoped package
     * is returned for every year and every term.
     */
    packages: (academicYearId?: number, term?: string, includeInactive = true) =>
      ['tuition', 'packages', academicYearId ?? 'ALL', term ?? 'ALL', includeInactive] as const,
    packagesRoot: () => ['tuition', 'packages'] as const,
    package: (packageId: number) => ['tuition', 'package', packageId] as const,
    packageStudents: (packageId: number, includeEnded = false) =>
      ['tuition', 'package', packageId, 'students', includeEnded] as const,
    /** One student's standing on their package, as of a date. */
    studentPackage: (studentId: number, on?: string) =>
      ['tuition', 'student-package', studentId, on ?? 'today'] as const,
    studentPackageHistory: (studentId: number) =>
      ['tuition', 'student-package', studentId, 'history'] as const,
    studentPackageRoot: () => ['tuition', 'student-package'] as const,
    /** The student's OWN standing — a different endpoint, its own key. */
    myPackage: (on?: string) => ['tuition', 'my-package', on ?? 'today'] as const,
    invoices: (studentId?: number) => ['tuition', 'invoices', studentId ?? 'ALL'] as const,
    invoicesRoot: () => ['tuition', 'invoices'] as const,
    /** The student's OWN invoices — issued only, unlike the admin list above. */
    myInvoices: (status?: string) => ['tuition', 'my-invoices', status ?? 'ALL'] as const,
    myIntents: (invoiceId: string) => ['tuition', 'my-intents', invoiceId] as const,
    /**
     * The tuition payment page. Keyed by period AND currency: a tuition bill is
     * a count of classes over a window, and each currency carries its own tax
     * and convenience charge — so both are real differences, not re-slices.
     */
    myFees: (from: string, to: string, currency?: string) =>
      ['tuition', 'my-fees', from, to, currency ?? 'base'] as const,
    feeBreakdown: (studentId: number, from: string, to: string, currency?: string) =>
      ['tuition', 'fee-breakdown', studentId, from, to, currency ?? 'base'] as const,
    myInvoicesRoot: () => ['tuition', 'my-invoices'] as const,
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

    /** The student-first face of `enrollments`. Keyed by student, not filtered. */
    studentSubjects: (studentId: number) =>
      ['tuition', 'student-subjects', studentId] as const,
    studentSubjectsRoot: () => ['tuition', 'student-subjects'] as const,
  },

  /**
   * Session years and admission categories.
   *
   * `currentYear` is keyed by programme and read by nearly every finance and
   * enrolment screen, so it is the one entry here worth a long stale time —
   * it changes once a year, deliberately, from one screen.
   */
  admissions: {
    root: ['admissions'] as const,
    /** `tuitionBoard` marks the tuition-scoped route — a different list, not a re-slice. */
    years: (program?: Program, withCounts = false, tuitionBoard = false) =>
      ['admissions', 'years', program ?? 'ALL', withCounts, tuitionBoard] as const,
    yearsRoot: () => ['admissions', 'years'] as const,
    year: (yearId: number) => ['admissions', 'year', yearId] as const,
    currentYear: (program: Program) => ['admissions', 'current-year', program] as const,
    currentYearRoot: () => ['admissions', 'current-year'] as const,
    categories: (
      academicYearId?: number,
      includeInactive = false,
      withCounts = false,
      program?: Program,
      tuitionBoard = false,
    ) =>
      [
        'admissions',
        'categories',
        program ?? 'ALL',
        academicYearId ?? 'ALL',
        includeInactive,
        withCounts,
        tuitionBoard,
      ] as const,
    categoriesRoot: () => ['admissions', 'categories'] as const,
  },

  /**
   * Households and parent accounts.
   *
   * `search` stays OUT of the group key: the backend matches it with a Python
   * comprehension over the same full fetch, so it buys nothing server-side and
   * costs a refetch per keystroke. One unfiltered entry, filtered on the
   * client, is both faster and cheaper.
   */
  families: {
    root: ['families'] as const,
    groups: (includeInactive = false) => ['families', 'groups', includeInactive] as const,
    groupsRoot: () => ['families', 'groups'] as const,
    group: (groupId: number) => ['families', 'group', groupId] as const,
    studentGroup: (studentId: number) => ['families', 'student-group', studentId] as const,
    parents: () => ['families', 'parents'] as const,
    parentLinks: (parentId: number) => ['families', 'parent-links', parentId] as const,
    studentLinks: (studentId: number) => ['families', 'student-links', studentId] as const,
    linksRoot: () => ['families', 'links'] as const,
    /** What the guardian-details sweep sees for one student. */
    matches: (studentId: number) => ['families', 'matches', studentId] as const,
  },

  /** A parent's own side — every entry is scoped to the signed-in guardian. */
  parent: {
    root: ['parent'] as const,
    children: () => ['parent', 'children'] as const,
    child: (studentId: number) => ['parent', 'child', studentId] as const,
    childProfile: (studentId: number) => ['parent', 'child', studentId, 'profile'] as const,
    childFees: (studentId: number) => ['parent', 'child', studentId, 'fees'] as const,
    childInvoices: (studentId: number) =>
      ['parent', 'child', studentId, 'invoices'] as const,
  },

  /**
   * The notice board. The reader's feed and the author's listing are separate
   * subtrees on purpose: publishing invalidates both, but opening a notice
   * (which records a read receipt) must only touch the feed.
   */
  notices: {
    root: ['notices'] as const,
    /** `board` is which product's board: a tuition reader's unread count is its own number. */
    feed: (unreadOnly = false, board: Program = 'LMS') =>
      ['notices', 'feed', board, unreadOnly] as const,
    feedRoot: () => ['notices', 'feed'] as const,
    admin: (status?: string, audience?: string, withCounts = false, board: Program = 'LMS') =>
      ['notices', 'admin', board, status ?? 'ALL', audience ?? 'ALL', withCounts] as const,
    adminRoot: () => ['notices', 'admin'] as const,
    notice: (noticeId: number, board: Program = 'LMS') =>
      ['notices', 'notice', board, noticeId] as const,
  },

  /**
   * School finance.
   *
   * Every key carries `program` because the whole module is programme-scoped
   * server-side — the same endpoints answer for the school and for tuition's
   * charges-and-tax layer, and mixing the two caches would price one product
   * with the other's settings.
   *
   * `breakdown` is keyed by student AND year: it is a computation, not a
   * stored row, and the answer for last year is a different answer rather than
   * a stale one.
   */
  finance: {
    root: ['finance'] as const,
    settings: (program: Program) => ['finance', 'settings', program] as const,
    settingsRoot: () => ['finance', 'settings'] as const,

    currencies: (program: Program) => ['finance', 'currencies', program] as const,
    currenciesRoot: () => ['finance', 'currencies'] as const,
    /** The FX cache is process-wide on the server, so it is not keyed by programme. */
    fxStatus: () => ['finance', 'fx-status'] as const,

    heads: (program: Program, includeInactive = false) =>
      ['finance', 'heads', program, includeInactive] as const,
    headsRoot: () => ['finance', 'heads'] as const,

    structures: (program: Program, academicYearId?: number, includeInactive = false) =>
      ['finance', 'structures', program, academicYearId ?? 'ALL', includeInactive] as const,
    structuresRoot: () => ['finance', 'structures'] as const,
    structure: (structureId: number) => ['finance', 'structure', structureId] as const,

    plans: (program: Program, academicYearId?: number, includeInactive = false) =>
      ['finance', 'plans', program, academicYearId ?? 'ALL', includeInactive] as const,
    plansRoot: () => ['finance', 'plans'] as const,

    discounts: (program: Program, academicYearId?: number, includeInactive = false) =>
      ['finance', 'discounts', program, academicYearId ?? 'ALL', includeInactive] as const,
    discountsRoot: () => ['finance', 'discounts'] as const,

    breakdown: (
      studentId: number,
      academicYearId?: number,
      program: Program = 'LMS',
      currency?: string,
    ) =>
      [
        'finance',
        'breakdown',
        studentId,
        academicYearId ?? 'current',
        program,
        currency ?? 'base',
      ] as const,
    breakdownRoot: () => ['finance', 'breakdown'] as const,

    invoices: (filters: FinanceInvoiceKey = {}) =>
      [
        'finance',
        'invoices',
        filters.program ?? 'LMS',
        filters.academicYearId ?? 'ALL',
        filters.status ?? 'any',
        filters.studentId ?? 'ALL',
        filters.overdueOnly ? 'overdue' : 'all',
      ] as const,
    invoicesRoot: () => ['finance', 'invoices'] as const,
    invoice: (invoiceId: string) => ['finance', 'invoice', invoiceId] as const,
    intents: (invoiceId: string) => ['finance', 'invoice', invoiceId, 'intents'] as const,

    /** The signed-in student's own fees. */
    myFees: (program: Program, currency?: string) =>
      ['finance', 'me', program, currency ?? 'base'] as const,
    myInvoices: (program: Program) => ['finance', 'me', 'invoices', program] as const,
    /** The signed-in payer's own attempts on one invoice. */
    myIntents: (invoiceId: string) => ['finance', 'me', 'intents', invoiceId] as const,

    /** The fee reports. Every filter is in the key: the server sums exactly what it returns. */
    reportRoll: (academicYearId?: number, classId?: number, status?: string) =>
      ['finance', 'reports', 'students', academicYearId ?? 'current', classId ?? 'ALL', status ?? 'ALL'] as const,
    reportDues: (academicYearId?: number, classId?: number) =>
      ['finance', 'reports', 'dues', academicYearId ?? 'current', classId ?? 'ALL'] as const,
    reportCollections: (
      from: string, to: string, academicYearId?: number, classId?: number, method?: string, headId?: number,
    ) =>
      [
        'finance', 'reports', 'collections', from, to,
        academicYearId ?? 'ALL', classId ?? 'ALL', method ?? 'ALL', headId ?? 'ALL',
      ] as const,
    reportsRoot: () => ['finance', 'reports'] as const,

    /** Opening-balance receipts. */
    receipts: (program: Program, studentId?: number) =>
      ['finance', 'receipts', program, studentId ?? 'ALL'] as const,
    receiptsRoot: () => ['finance', 'receipts'] as const,
    meRoot: () => ['finance', 'me'] as const,
  },

  /**
   * Live classes, extra classes and the calendar.
   *
   * `timing` and `live` are deliberately near-zero stale: they carry a
   * countdown the server computed, and a cached copy keeps saying "in 12
   * minutes" long after it has become five.
   */
  classes: {
    root: ['classes'] as const,
    timing: (meetingId: number) => ['classes', 'timing', meetingId] as const,
    timingRoot: () => ['classes', 'timing'] as const,
    live: () => ['classes', 'live'] as const,

    extra: (status?: string, mineOnly = false) =>
      ['classes', 'extra', status ?? 'ALL', mineOnly] as const,
    extraRoot: () => ['classes', 'extra'] as const,
    extraRequest: (requestId: number) => ['classes', 'extra', 'request', requestId] as const,
  },

  /**
   * One key per window AND per shape: `groupByDay` changes what comes back,
   * not just how it is read, so two views of the same week are two entries.
   */
  calendar: {
    root: ['calendar'] as const,
    range: (from?: string, to?: string, kinds?: string[], groupByDay = false) =>
      [
        'calendar',
        from ?? 'today',
        to ?? 'default',
        kinds?.length ? [...kinds].sort().join(',') : 'ALL',
        groupByDay,
      ] as const,
  },

  /**
   * Homework. The list key carries no role: the server decides which half of
   * the shape it fills from the caller, and a user only ever has one role, so
   * there is nothing to collide.
   */
  homework: {
    root: ['homework'] as const,
    list: (classId?: number, from?: string, to?: string) =>
      ['homework', 'list', classId ?? 'ALL', from ?? 'any', to ?? 'any'] as const,
    listRoot: () => ['homework', 'list'] as const,
    assignment: (assignmentId: number) => ['homework', 'assignment', assignmentId] as const,
    submissions: (assignmentId: number) =>
      ['homework', 'submissions', assignmentId] as const,
    submissionsRoot: () => ['homework', 'submissions'] as const,
  },

  leave: {
    root: ['leave'] as const,
    mine: (status?: string) => ['leave', 'mine', status ?? 'ALL'] as const,
    mineRoot: () => ['leave', 'mine'] as const,
    myBalance: (academicYearId?: number) =>
      ['leave', 'my-balance', academicYearId ?? 'current'] as const,
    queue: (filters: LeaveQueueKey = {}) =>
      [
        'leave',
        'queue',
        filters.teacherId ?? 'ALL',
        filters.status ?? 'any',
        filters.leaveType ?? 'any',
        filters.from ?? 'any',
        filters.to ?? 'any',
      ] as const,
    queueRoot: () => ['leave', 'queue'] as const,
    onDay: (day: string) => ['leave', 'on-day', day] as const,
    onDayRoot: () => ['leave', 'on-day'] as const,
    balance: (teacherId: number, academicYearId?: number) =>
      ['leave', 'balance', teacherId, academicYearId ?? 'current'] as const,
    balanceRoot: () => ['leave', 'balance'] as const,
  },

  support: {
    root: ['support'] as const,
    tickets: (status?: string, category?: string, mineOnly = false) =>
      ['support', 'tickets', status ?? 'ALL', category ?? 'ALL', mineOnly] as const,
    ticketsRoot: () => ['support', 'tickets'] as const,
    ticket: (ticketId: number) => ['support', 'ticket', ticketId] as const,
    contact: (program: Program) => ['support', 'contact', program] as const,
    contactRoot: () => ['support', 'contact'] as const,
    queue: (program?: Program) => ['support', 'queue', program ?? 'ALL'] as const,
    queueRoot: () => ['support', 'queue'] as const,
    /** The product switcher — a read of one's own profile. */
    myPrograms: () => ['support', 'my-programs'] as const,
  },

  /** Admin-only oversight reports. Expensive; see `STALE.expensive`. */
  oversight: {
    root: ['oversight'] as const,
    cadence: (classId?: number, teacherId?: number, overdueOnly = true) =>
      ['oversight', 'cadence', classId ?? 'ALL', teacherId ?? 'ALL', overdueOnly] as const,
    examCounts: (classId?: number, from?: string, to?: string) =>
      ['oversight', 'exam-counts', classId ?? 'ALL', from ?? 'default', to ?? 'default'] as const,
    homeworkCounts: (classId?: number, from?: string, to?: string) =>
      [
        'oversight',
        'homework-counts',
        classId ?? 'ALL',
        from ?? 'default',
        to ?? 'default',
      ] as const,
    parentPreview: (studentId: number, period: string) =>
      ['oversight', 'parent-preview', studentId, period] as const,
    parentPreviewRoot: () => ['oversight', 'parent-preview'] as const,
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

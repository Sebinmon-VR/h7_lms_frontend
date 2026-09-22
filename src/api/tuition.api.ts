import { apiClient, cleanParams, del, delWithBody, get, post, put } from './client'
import type {
  ApiDate,
  AttendanceStatus,
  AcademicTerm,
  ExamOut,
  InvoiceBatchGenerate,
  InvoiceBatchResult,
  InvoiceGenerate,
  InvoiceOut,
  InvoiceStatus,
  LibraryItemOut,
  LibraryItemUpdate,
  LibraryLinkCreate,
  LibraryModeration,
  LibraryUploadForm,
  MeetingLinkUpdate,
  PackageAssignmentCreate,
  PackageAssignmentOut,
  PackageStatusOut,
  PaymentIntentCreate,
  PaymentIntentOut,
  PaymentRecord,
  Program,
  ProgramAccessUpdate,
  ProgramSettings,
  ProgramSettingsUpdate,
  ProgrammeReport,
  SlotAvailabilityQuery,
  SlotAvailabilityResult,
  StudentAttendanceReport,
  TeacherAttendanceReport,
  TimezoneUpdate,
  TimezoneUpdated,
  BillingExportView,
  InvoiceDetail,
  InvoiceExportView,
  ReportExportView,
  StudentBillingAccount,
  TuitionAssessmentCategory,
  TuitionBillingOverview,
  TuitionAssessmentCreate,
  TuitionAttendanceMark,
  TuitionConflictReport,
  TuitionDeleteResult,
  TuitionEnrollmentCreate,
  TuitionEnrollmentOut,
  TuitionEnrollmentUpdate,
  TuitionFeeBreakdownOut,
  TuitionFeeSummary,
  TuitionPackageCreate,
  TuitionPackageOut,
  TuitionPackageUpdate,
  TuitionGenerateResult,
  TuitionMaintenanceSummary,
  TuitionProfile,
  TuitionReportCardCreate,
  TuitionReportCardOut,
  TuitionReportCardResult,
  TuitionScheduleStatus,
  TuitionSchedulerStatus,
  TuitionSessionCancel,
  TuitionSessionCreate,
  TuitionSessionEnd,
  TuitionSessionOut,
  TuitionSessionReschedule,
  TuitionSessionStatus,
  StudentSubjectAdd,
  StudentSubjectOut,
  TuitionSlotCreate,
  TuitionSlotOut,
  TuitionSlotUpdate,
  TuitionStudentCreate,
  TuitionTeacherCreate,
  TuitionSweepSummary,
  TuitionUserSummary,
  UserRole,
} from './types'

/**
 * The online tuition product.
 *
 * Four routers behind one login: `/admin/tuition` for the people who run the
 * programme, `/tuition/teachers` and `/tuition/students` for the two sides of
 * a class, and `/tuition` for the library and personal preferences everybody
 * shares.
 *
 * Access needs BOTH checks to pass. The role guard answers "may a teacher do
 * this?"; the programme guard answers "is this teacher one of ours?" — so a
 * perfectly valid school teacher gets a 403 from every route below unless
 * `TUITION` is on their profile. That is the intended behaviour, not a bug to
 * work around: grant access on the admin's Programme access screen.
 *
 * A session id is a STRING here. Generated classes are keyed by document id,
 * ad-hoc ones sometimes by number, and the backend accepts either as a path
 * segment — so callers pass `String(session.id)` and never do arithmetic on it.
 */

/** Session ids come back as `string | number`; every path wants the string. */
const sid = (sessionId: string | number) => encodeURIComponent(String(sessionId))

/**
 * Downloads a CSV the server generated.
 *
 * Fetched as a blob and saved from memory rather than opened as a link: the
 * endpoint needs the Authorization header, and a bare `<a href>` or
 * `window.open` sends no headers at all — it would arrive as a 401 rendered
 * into a downloaded file called something like "export.csv".
 *
 * The filename comes from the server's `Content-Disposition` when it is
 * readable. It frequently is not: the header is only exposed to JS when the
 * server sets `Access-Control-Expose-Headers`, and cross-origin it is hidden
 * by default. So the caller supplies a fallback rather than the download being
 * named after a random blob id.
 */
export async function downloadCsv(url: string, fallbackName: string, params?: Record<string, unknown>) {
  const response = await apiClient.get<Blob>(url, {
    params: params ? cleanParams(params) : undefined,
    responseType: 'blob',
    // A month of sessions is a large CSV to assemble server-side.
    timeout: 120_000,
  })

  const disposition = String(response.headers?.['content-disposition'] ?? '')
  const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1]
  const filename = named ? decodeURIComponent(named) : fallbackName

  const href = URL.createObjectURL(response.data)
  try {
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    // Revoking synchronously can cancel the download in some browsers, so let
    // the click settle first.
    setTimeout(() => URL.revokeObjectURL(href), 10_000)
  }
  return filename
}

// =====================================================================
// Admin — /admin/tuition
// =====================================================================

export const tuitionAdminApi = {
  // ------------------------------------------------------- settings

  /**
   * Runtime configuration for one product.
   *
   * `LMS` is a legitimate argument: the reminder lead time and timezone are
   * shared settings, and this is where the school's are edited too. The
   * tuition-only fields are ignored on that program.
   */
  settings: (program: Program) => get<ProgramSettings>(`/admin/tuition/settings/${program}`),

  /** Partial — omitted fields are left alone, so send only what changed. */
  updateSettings: (program: Program, body: ProgramSettingsUpdate) =>
    put<ProgramSettings>(`/admin/tuition/settings/${program}`, body),

  // -------------------------------------------------- programme access

  /**
   * Tuition participants.
   *
   * `includeAll` widens this to accounts WITHOUT tuition access — which is how
   * you find somebody in order to grant it. Leave it off to see the programme
   * as it stands.
   */
  users: (role?: UserRole, includeAll = false) =>
    get<TuitionUserSummary[]>('/admin/tuition/users', {
      params: cleanParams({ role, include_all: includeAll }),
    }),

  /** Replaces product access outright. Sending `['LMS']` revokes tuition. */
  setUserPrograms: (userId: number, body: ProgramAccessUpdate) =>
    put<TuitionUserSummary>(`/admin/tuition/users/${userId}/programs`, body),

  /**
   * Creates a NEW tuition student — login, profile and tuition access in one
   * call.
   *
   * Distinct from `POST /admin/users`: a tuition student is not the school's
   * pupil borrowed, and this grants TUITION only unless `also_lms` is set.
   * Use `setUserPrograms` instead when the person already has an account.
   */
  createStudent: (body: TuitionStudentCreate) =>
    post<TuitionUserSummary>('/admin/tuition/students', body),

  /** The same, for a tutor. `subject_ids` records what they can take. */
  createTeacher: (body: TuitionTeacherCreate) =>
    post<TuitionUserSummary>('/admin/tuition/teachers', body),

  // ---------------------------------------------------- enrollments

  /** 409 when the student already has an active teacher for that subject. */
  createEnrollment: (body: TuitionEnrollmentCreate) =>
    post<TuitionEnrollmentOut>('/admin/tuition/enrollments', body),

  listEnrollments: (params?: {
    studentId?: number
    teacherId?: number
    subjectId?: number
    includeInactive?: boolean
  }) =>
    get<TuitionEnrollmentOut[]>('/admin/tuition/enrollments', {
      params: cleanParams({
        student_id: params?.studentId,
        teacher_id: params?.teacherId,
        subject_id: params?.subjectId,
        include_inactive: params?.includeInactive,
      }),
    }),

  enrollment: (enrollmentId: number) =>
    get<TuitionEnrollmentOut>(`/admin/tuition/enrollments/${enrollmentId}`),

  /** Changing `teacher_id` re-points the slots and every class still to come. */
  updateEnrollment: (enrollmentId: number, body: TuitionEnrollmentUpdate) =>
    put<TuitionEnrollmentOut>(`/admin/tuition/enrollments/${enrollmentId}`, body),

  /**
   * Removes the arrangement and the schedule hanging off it, and reports what
   * went — an enrollment owns slots and future classes, so the count matters.
   *
   * Ending it (a PUT with `status: COMPLETED`) is almost always what you want
   * instead: it keeps the history, the materials and the invoices explicable.
   * Classes already taught survive either way.
   */
  deleteEnrollment: (enrollmentId: number) =>
    delWithBody<TuitionDeleteResult>(`/admin/tuition/enrollments/${enrollmentId}`),

  // ------------------------------------------- subjects, student-first

  /**
   * The SAME records as the enrollments above, shaped the way the office
   * thinks about them: one student, the subjects they take, who teaches each
   * and how many classes have actually run.
   *
   * `session_count` paired with `conducted_count` is the useful figure — it is
   * what tells an admin whether an arrangement is running or merely exists.
   */
  studentSubjects: (studentId: number) =>
    get<StudentSubjectOut[]>(`/admin/tuition/students/${studentId}/subjects`),

  /**
   * Adds a subject. 409 when that subject already has a teacher for this
   * student — a duplicate arrangement, not a second one.
   *
   * Adding a subject SCHEDULES NOTHING. Create slots afterwards or the student
   * is enrolled with no classes, which looks identical to a working
   * arrangement until the first week goes by empty.
   */
  addStudentSubject: (studentId: number, body: StudentSubjectAdd) =>
    post<StudentSubjectOut>(`/admin/tuition/students/${studentId}/subjects`, body),

  /**
   * CANCELS the arrangement by default, keeping its history; `hardDelete`
   * removes the record and the schedule with it. Answers with the enrollment
   * as it now stands rather than 204.
   */
  removeStudentSubject: (studentId: number, subjectId: number, hardDelete = false) =>
    delWithBody<StudentSubjectOut>(
      `/admin/tuition/students/${studentId}/subjects/${subjectId}`,
      { params: cleanParams({ hard_delete: hardDelete || undefined }) },
    ),

  // ----------------------------------------------------------- slots

  /**
   * A recurring weekly class time.
   *
   * 409 with a conflict list when either party is already committed then.
   * `allowConflicts` books anyway — the clash comes back on `conflicts` and is
   * stored, so an override stays visible rather than becoming invisible.
   */
  createSlot: (body: TuitionSlotCreate, allowConflicts = false) =>
    post<TuitionSlotOut>('/admin/tuition/slots', body, {
      params: cleanParams({ allow_conflicts: allowConflicts }),
    }),

  listSlots: (params?: { enrollmentId?: number; studentId?: number; teacherId?: number }) =>
    get<TuitionSlotOut[]>('/admin/tuition/slots', {
      params: cleanParams({
        enrollment_id: params?.enrollmentId,
        student_id: params?.studentId,
        teacher_id: params?.teacherId,
      }),
    }),

  updateSlot: (slotId: number, body: TuitionSlotUpdate, allowConflicts = false) =>
    put<TuitionSlotOut>(`/admin/tuition/slots/${slotId}`, body, {
      params: cleanParams({ allow_conflicts: allowConflicts }),
    }),

  /** Removes the class time and its untouched future classes, and says how many. */
  deleteSlot: (slotId: number) =>
    delWithBody<TuitionDeleteResult>(`/admin/tuition/slots/${slotId}`),

  /**
   * "Can I put a class here?", asked before the admin commits.
   *
   * Pass `exclude_slot_id` when editing an existing slot, or it reports a
   * clash with itself.
   */
  checkSlotAvailability: (body: SlotAvailabilityQuery) =>
    post<SlotAvailabilityResult>('/admin/tuition/slots/check-availability', body),

  /**
   * Every clash currently sitting in the timetable, from both diaries.
   *
   * Nothing here blocks anything — it is where an overridden booking, or a
   * teacher reassignment that moved a slot into an occupied evening, ends up.
   * The list of things to go and fix.
   */
  conflicts: () => get<TuitionConflictReport>('/admin/tuition/conflicts'),

  // -------------------------------------------------------- schedule

  scheduleStatus: () => get<TuitionScheduleStatus>('/admin/tuition/schedule/status'),

  /**
   * Extends the generated-class horizon.
   *
   * Runs on its own with the reminder sweep; exposed because the counts this
   * produces are what the invoices are priced from, and an admin about to bill
   * the month reasonably wants it done first.
   */
  generateSessions: (horizonDays?: number) =>
    post<TuitionGenerateResult>('/admin/tuition/schedule/generate', undefined, {
      params: cleanParams({ horizon_days: horizonDays }),
    }),

  // -------------------------------------------------------- sessions

  listSessions: (params?: {
    studentId?: number
    teacherId?: number
    enrollmentId?: number
    fromDate?: ApiDate
    toDate?: ApiDate
    status?: TuitionSessionStatus
  }) =>
    get<TuitionSessionOut[]>('/admin/tuition/sessions', {
      params: cleanParams({
        student_id: params?.studentId,
        teacher_id: params?.teacherId,
        enrollment_id: params?.enrollmentId,
        from_date: params?.fromDate,
        to_date: params?.toDate,
        status: params?.status,
      }),
    }),

  /** A one-off extra class outside the weekly pattern. */
  createSession: (body: TuitionSessionCreate, allowConflicts = false) =>
    post<TuitionSessionOut>('/admin/tuition/sessions', body, {
      params: cleanParams({ allow_conflicts: allowConflicts }),
    }),

  session: (sessionId: string | number) =>
    get<TuitionSessionOut>(`/admin/tuition/sessions/${sid(sessionId)}`),

  /** Moves one class; the recurring slot behind it is untouched. */
  rescheduleSession: (
    sessionId: string | number,
    body: TuitionSessionReschedule,
    allowConflicts = false,
  ) =>
    post<TuitionSessionOut>(`/admin/tuition/sessions/${sid(sessionId)}/reschedule`, body, {
      params: cleanParams({ allow_conflicts: allowConflicts }),
    }),

  cancelSession: (sessionId: string | number, body: TuitionSessionCancel) =>
    post<TuitionSessionOut>(`/admin/tuition/sessions/${sid(sessionId)}/cancel`, body),

  /** Swaps in a link from another provider — Zoom, Teams, a standing room. */
  setSessionMeetingLink: (sessionId: string | number, body: MeetingLinkUpdate) =>
    put<TuitionSessionOut>(`/admin/tuition/sessions/${sid(sessionId)}/meeting-link`, body),

  /**
   * Overrides whether this class counts on the invoice.
   *
   * `billable` is a query parameter, not a body — the backend declares it that
   * way, and sending it as JSON silently leaves the default in place.
   */
  setSessionBillable: (sessionId: string | number, billable: boolean) =>
    post<TuitionSessionOut>(`/admin/tuition/sessions/${sid(sessionId)}/billable`, undefined, {
      params: { billable },
    }),

  // --------------------------------------------------------- reports

  overview: (fromDate?: ApiDate, toDate?: ApiDate) =>
    get<ProgrammeReport>('/admin/tuition/reports/overview', {
      params: cleanParams({ from_date: fromDate, to_date: toDate }),
    }),

  studentReport: (studentId: number, fromDate?: ApiDate, toDate?: ApiDate) =>
    get<StudentAttendanceReport>(`/admin/tuition/reports/students/${studentId}`, {
      params: cleanParams({ from_date: fromDate, to_date: toDate }),
    }),

  teacherReport: (teacherId: number, fromDate?: ApiDate, toDate?: ApiDate) =>
    get<TeacherAttendanceReport>(`/admin/tuition/reports/teachers/${teacherId}`, {
      params: cleanParams({ from_date: fromDate, to_date: toDate }),
    }),

  // ------------------------------------------------------- packages

  /**
   * The office's preview of one student's tuition fees for a period.
   *
   * The SAME computation the student's page and the invoice generator use, so
   * the three cannot disagree. Bills nothing — it counts what the period
   * accrued against the student's package.
   */
  feeBreakdown: (
    studentId: number,
    params: { periodStart: ApiDate; periodEnd: ApiDate; currency?: string },
  ) =>
    get<TuitionFeeBreakdownOut>(`/admin/tuition/students/${studentId}/fee-breakdown`, {
      params: cleanParams({
        period_start: params.periodStart,
        period_end: params.periodEnd,
        currency: params.currency,
      }),
    }),

  /**
   * Creates a package — so many classes for so much, on any subjects. The
   * per-class rate is derived from `amount / classes_included`.
   */
  createPackage: (body: TuitionPackageCreate) =>
    post<TuitionPackageOut>('/admin/tuition/packages', body),

  /**
   * Packages on offer, optionally narrowed to a year or term.
   *
   * An UNSCOPED package — no year, no term — appears in every year's and every
   * term's list, because that is what it is: the offer that stands unless a
   * narrower one is made. So filtering widens rather than narrows the answer.
   */
  packages: (
    params: { academicYearId?: number; term?: AcademicTerm; includeInactive?: boolean } = {},
  ) =>
    get<TuitionPackageOut[]>('/admin/tuition/packages', {
      params: cleanParams({
        academic_year_id: params.academicYearId,
        term: params.term,
        include_inactive: params.includeInactive,
      }),
    }),

  package: (packageId: number) => get<TuitionPackageOut>(`/admin/tuition/packages/${packageId}`),

  updatePackage: (packageId: number, body: TuitionPackageUpdate) =>
    put<TuitionPackageOut>(`/admin/tuition/packages/${packageId}`, body),

  /** 409 while students are on it — mark it inactive instead, or reassign them. */
  deletePackage: (packageId: number) => del(`/admin/tuition/packages/${packageId}`),

  /** Who is on a package, current assignments first. */
  packageStudents: (packageId: number, includeEnded = false) =>
    get<PackageAssignmentOut[]>(`/admin/tuition/packages/${packageId}/students`, {
      params: cleanParams({ include_ended: includeEnded || undefined }),
    }),

  /**
   * Where a student stands on their package: what they are on and how much of
   * it they have used this term. `assignment` and `package` are null — not a
   * 404 — when nothing is assigned yet.
   */
  studentPackage: (studentId: number, on?: ApiDate) =>
    get<PackageStatusOut>(`/admin/tuition/students/${studentId}/package`, {
      params: cleanParams({ on }),
    }),

  /**
   * Puts a student on a package for a term. Only `package_id` is required;
   * the year, term and dates default from the package and the calendar.
   * Assigning again for the same year and term replaces the earlier one.
   */
  assignPackage: (studentId: number, body: PackageAssignmentCreate) =>
    put<PackageAssignmentOut>(`/admin/tuition/students/${studentId}/package`, body),

  /** Every package a student has been on, newest first. */
  studentPackageHistory: (studentId: number, includeEnded = true) =>
    get<PackageAssignmentOut[]>(`/admin/tuition/students/${studentId}/packages`, {
      params: cleanParams({ include_ended: includeEnded }),
    }),

  /**
   * Takes a student off a package. Ended rather than deleted, so an invoice
   * already raised against it still reads back to the package that priced it.
   */
  endPackageAssignment: (studentId: number, assignmentId: number) =>
    delWithBody<PackageAssignmentOut>(
      `/admin/tuition/students/${studentId}/packages/${assignmentId}`,
    ),

  // -------------------------------------------------------- invoices

  /** Counts the period's classes against the package. Refuses to overwrite an issued invoice. */
  generateInvoice: (body: InvoiceGenerate) =>
    post<InvoiceOut>('/admin/tuition/invoices/generate', body),

  /** Everyone with classes in the period. Issued invoices are skipped, not failed. */
  generateInvoiceBatch: (body: InvoiceBatchGenerate) =>
    post<InvoiceBatchResult>('/admin/tuition/invoices/generate-batch', body),

  invoices: (params?: {
    studentId?: number
    status?: string
    fromDate?: ApiDate
    toDate?: ApiDate
  }) =>
    get<InvoiceOut[]>('/admin/tuition/invoices', {
      params: cleanParams({
        student_id: params?.studentId,
        status: params?.status,
        from_date: params?.fromDate,
        to_date: params?.toDate,
      }),
    }),

  invoice: (invoiceId: string) => get<InvoiceOut>(`/admin/tuition/invoices/${invoiceId}`),

  /** Freezes the numbers. A bill that changes after it was sent is not a bill. */
  issueInvoice: (invoiceId: string) =>
    post<InvoiceOut>(`/admin/tuition/invoices/${invoiceId}/issue`),

  recordPayment: (invoiceId: string, body: PaymentRecord) =>
    post<InvoiceOut>(`/admin/tuition/invoices/${invoiceId}/payments`, body),

  /** `reason` is a query parameter here, unlike the session cancel above. */
  cancelInvoice: (invoiceId: string, reason?: string) =>
    post<InvoiceOut>(`/admin/tuition/invoices/${invoiceId}/cancel`, undefined, {
      params: cleanParams({ reason }),
    }),

  feeSummary: (fromDate?: ApiDate, toDate?: ApiDate) =>
    get<TuitionFeeSummary>('/admin/tuition/fees/summary', {
      params: cleanParams({ from_date: fromDate, to_date: toDate }),
    }),

  // ---------------------------------------------------------- billing

  /**
   * The billing screen: matching invoices AND their totals in one response.
   *
   * Prefer this over `invoices` + `feeSummary` on any screen showing both. The
   * server computes the summary from exactly the rows it returns, so the
   * figures at the top cannot disagree with the rows underneath — which is how
   * a billing summary loses an administrator's trust fastest.
   */
  billing: (params?: {
    studentId?: number
    status?: string
    fromDate?: ApiDate
    toDate?: ApiDate
    unpaidOnly?: boolean
  }) =>
    get<TuitionBillingOverview>('/admin/tuition/billing', {
      params: cleanParams({
        student_id: params?.studentId,
        status: params?.status,
        from_date: params?.fromDate,
        to_date: params?.toDate,
        unpaid_only: params?.unpaidOnly,
      }),
    }),

  /** One student's whole history — the screen to open when a parent calls. */
  studentBilling: (studentId: number) =>
    get<StudentBillingAccount>(`/admin/tuition/billing/students/${studentId}`),

  /**
   * One invoice down to the individual classes behind every line.
   *
   * Distinct from `invoice`, which returns the bill alone. This is the audit
   * trail: each line carries the sessions it was priced from, and each
   * session's `is_billable` explains a class that happened but is not counted.
   */
  invoiceDetail: (invoiceId: string) =>
    get<InvoiceDetail>(`/admin/tuition/invoices/${invoiceId}/detail`),

  // ---------------------------------------------------------- exports

  /** Saves a billing CSV. Returns the filename that was written. */
  exportBilling: (
    view: BillingExportView = 'summary',
    params?: { studentId?: number; status?: string; fromDate?: ApiDate; toDate?: ApiDate },
  ) =>
    downloadCsv('/admin/tuition/billing/export', `tuition-billing-${view}.csv`, {
      view,
      student_id: params?.studentId,
      status: params?.status,
      from_date: params?.fromDate,
      to_date: params?.toDate,
    }),

  exportInvoice: (invoiceId: string, view: InvoiceExportView = 'lines') =>
    downloadCsv(
      `/admin/tuition/invoices/${invoiceId}/export`,
      `invoice-${invoiceId}-${view}.csv`,
      { view },
    ),

  exportReports: (view: ReportExportView = 'students', fromDate?: ApiDate, toDate?: ApiDate) =>
    downloadCsv('/admin/tuition/reports/export', `tuition-report-${view}.csv`, {
      view,
      from_date: fromDate,
      to_date: toDate,
    }),

  // ------------------------------------------------- reminders & ops

  reminderStatus: () => get<TuitionSchedulerStatus>('/admin/tuition/reminders/status'),

  /** A dry run. Claims nothing and delivers nothing, so it is safe to repeat. */
  reminderPreview: () => get<TuitionSweepSummary>('/admin/tuition/reminders/preview'),

  runReminders: () => post<TuitionSweepSummary>('/admin/tuition/reminders/run'),

  /** Extends the horizon and closes classes nobody ended. Run before billing. */
  runMaintenance: () => post<TuitionMaintenanceSummary>('/admin/tuition/maintenance/run'),
}

// =====================================================================
// Teacher — /tuition/teachers
// =====================================================================

export const tuitionTeacherApi = {
  myStudents: (includeInactive = false) =>
    get<TuitionEnrollmentOut[]>('/tuition/teachers/my-students', {
      params: cleanParams({ include_inactive: includeInactive }),
    }),

  /** The recurring weekly grid — rules, not instances. */
  timetable: () => get<TuitionSlotOut[]>('/tuition/teachers/timetable'),

  sessions: (params?: {
    fromDate?: ApiDate
    toDate?: ApiDate
    status?: TuitionSessionStatus
    studentId?: number
  }) =>
    get<TuitionSessionOut[]>('/tuition/teachers/sessions', {
      params: cleanParams({
        from_date: params?.fromDate,
        to_date: params?.toDate,
        status: params?.status,
        student_id: params?.studentId,
      }),
    }),

  /** Carries the server's countdown, so it goes stale fast by design. */
  upcoming: (limit = 10) =>
    get<TuitionSessionOut[]>('/tuition/teachers/sessions/upcoming', { params: { limit } }),

  session: (sessionId: string | number) =>
    get<TuitionSessionOut>(`/tuition/teachers/sessions/${sid(sessionId)}`),

  /** Records the teacher as present and starts the clock. */
  startSession: (sessionId: string | number) =>
    post<TuitionSessionOut>(`/tuition/teachers/sessions/${sid(sessionId)}/start`),

  /**
   * Closes the class. Permitted before the effective end — connections drop —
   * but an early finish is recorded, not refused.
   */
  endSession: (sessionId: string | number, body: TuitionSessionEnd) =>
    post<TuitionSessionOut>(`/tuition/teachers/sessions/${sid(sessionId)}/end`, body),

  /** Overrides what the join timestamps imply. The teacher has the last word. */
  markAttendance: (sessionId: string | number, body: TuitionAttendanceMark) =>
    post<TuitionSessionOut>(`/tuition/teachers/sessions/${sid(sessionId)}/attendance`, body),

  /**
   * With a body, sets an explicit link. WITHOUT one, asks the backend to
   * create a Google Meet for this class — which is why the argument is
   * optional rather than required.
   */
  setMeetingLink: (sessionId: string | number, body?: MeetingLinkUpdate) =>
    post<TuitionSessionOut>(`/tuition/teachers/sessions/${sid(sessionId)}/meeting-link`, body),

  createSession: (body: TuitionSessionCreate) =>
    post<TuitionSessionOut>('/tuition/teachers/sessions', body),

  rescheduleSession: (sessionId: string | number, body: TuitionSessionReschedule) =>
    post<TuitionSessionOut>(`/tuition/teachers/sessions/${sid(sessionId)}/reschedule`, body),

  cancelSession: (sessionId: string | number, body: TuitionSessionCancel) =>
    post<TuitionSessionOut>(`/tuition/teachers/sessions/${sid(sessionId)}/cancel`, body),

  /**
   * Homework, an assignment or an exam for one student. The response is an
   * ordinary `ExamOut` — the engine underneath is the LMS exam engine, so the
   * existing exam screens read these without changes.
   */
  createAssessment: (body: TuitionAssessmentCreate) =>
    post<ExamOut>('/tuition/teachers/assessments', body),

  assessments: (params?: {
    category?: TuitionAssessmentCategory
    studentId?: number
    status?: string
  }) =>
    get<ExamOut[]>('/tuition/teachers/assessments', {
      params: cleanParams({
        category: params?.category,
        student_id: params?.studentId,
        status: params?.status,
      }),
    }),

  assessment: (examId: number) => get<ExamOut>(`/tuition/teachers/assessments/${examId}`),

  createReportCard: (body: TuitionReportCardCreate) =>
    post<TuitionReportCardResult>('/tuition/teachers/report-cards', body),

  publishReportCard: (cardId: string) =>
    post<TuitionReportCardResult>(`/tuition/teachers/report-cards/${cardId}/publish`),

  myReport: (fromDate?: ApiDate, toDate?: ApiDate) =>
    get<TeacherAttendanceReport>('/tuition/teachers/reports/me', {
      params: cleanParams({ from_date: fromDate, to_date: toDate }),
    }),

  /** One of my students. Refused for a student I do not teach. */
  studentReport: (studentId: number, fromDate?: ApiDate, toDate?: ApiDate) =>
    get<StudentAttendanceReport>(`/tuition/teachers/reports/students/${studentId}`, {
      params: cleanParams({ from_date: fromDate, to_date: toDate }),
    }),
}

// =====================================================================
// Student — /tuition/students
// =====================================================================

export const tuitionStudentApi = {
  mySubjects: () => get<TuitionEnrollmentOut[]>('/tuition/students/my-subjects'),

  /**
   * My own tuition invoices, newest period first.
   *
   * DRAFTS ARE EXCLUDED server-side. A draft is the office's working copy — it
   * is re-priced on every regeneration and nothing on it is owed yet — so a
   * student only ever sees an invoice once it has been issued. That means an
   * empty list is a real answer ("you have not been billed yet"), not a
   * missing-data state.
   */
  myInvoices: (status?: InvoiceStatus) =>
    get<InvoiceOut[]>('/tuition/students/invoices', { params: cleanParams({ status }) }),

  /** 404 — not 403 — for an invoice belonging to somebody else. */
  myInvoice: (invoiceId: string) =>
    get<InvoiceOut>(`/tuition/students/invoices/${encodeURIComponent(invoiceId)}`),

  /**
   * THE PAY BUTTON, for a tuition invoice. See `myFeesApi.createIntent` for
   * what each `method` produces — the rules are the same, on this biller.
   */
  createIntent: (invoiceId: string, body: PaymentIntentCreate) =>
    post<PaymentIntentOut>(
      `/tuition/students/invoices/${encodeURIComponent(invoiceId)}/intents`,
      body,
    ),

  /** My attempts on this invoice, newest first. */
  intents: (invoiceId: string) =>
    get<PaymentIntentOut[]>(`/tuition/students/invoices/${encodeURIComponent(invoiceId)}/intents`),

  /**
   * The package I am on, and how many of its classes I have used this term.
   * The header of the fee page. Nulls, not an error, when nothing is assigned.
   */
  myPackage: (on?: ApiDate) =>
    get<PackageStatusOut>('/tuition/students/package/me', { params: cleanParams({ on }) }),

  /**
   * THE PAYMENT PAGE. What I owe for a period, fully derived.
   *
   * The same computation the office's preview and the invoice generator use,
   * so this cannot disagree with the bill that follows. The one line carries
   * the classes it was priced from — "14 classes at 500: 6 English, 5 Maths,
   * 3 Science" — which is what makes a tuition bill explicable months later.
   *
   * The period is REQUIRED: a tuition bill is a count of classes over a window,
   * so there is no such thing as "what I owe" without saying over what.
   *
   * `currency` switches the figures. It is more than a conversion — each
   * currency carries its own tax and convenience charge, so the total moves by
   * more than the rate.
   */
  myFees: (params: { periodStart: ApiDate; periodEnd: ApiDate; currency?: string }) =>
    get<TuitionFeeBreakdownOut>('/tuition/students/fees/me', {
      params: cleanParams({
        period_start: params.periodStart,
        period_end: params.periodEnd,
        currency: params.currency,
      }),
    }),

  timetable: () => get<TuitionSlotOut[]>('/tuition/students/timetable'),

  sessions: (params?: {
    fromDate?: ApiDate
    toDate?: ApiDate
    status?: TuitionSessionStatus
    subjectId?: number
  }) =>
    get<TuitionSessionOut[]>('/tuition/students/sessions', {
      params: cleanParams({
        from_date: params?.fromDate,
        to_date: params?.toDate,
        status: params?.status,
        subject_id: params?.subjectId,
      }),
    }),

  upcoming: (limit = 10) =>
    get<TuitionSessionOut[]>('/tuition/students/sessions/upcoming', { params: { limit } }),

  session: (sessionId: string | number) =>
    get<TuitionSessionOut>(`/tuition/students/sessions/${sid(sessionId)}`),

  /**
   * Records the student as arrived and returns the link to open.
   *
   * Call it and then open `meeting_link` from the response, rather than
   * opening a link the list already had: the join timestamp is what decides
   * lateness, and a student who clicked an old link is invisible to it.
   */
  joinSession: (sessionId: string | number) =>
    post<TuitionSessionOut>(`/tuition/students/sessions/${sid(sessionId)}/join`),

  assessments: (params?: { category?: TuitionAssessmentCategory; subjectId?: number }) =>
    get<ExamOut[]>('/tuition/students/assessments', {
      params: cleanParams({ category: params?.category, subject_id: params?.subjectId }),
    }),

  /**
   * Published cards only. A card a tutor generated but has not released is
   * a working draft, and handing every draft to the family it is about
   * would make the review step pointless.
   */
  reportCards: () => get<TuitionReportCardOut[]>('/tuition/students/report-cards'),

  myReport: (fromDate?: ApiDate, toDate?: ApiDate) =>
    get<StudentAttendanceReport>('/tuition/students/reports/me', {
      params: cleanParams({ from_date: fromDate, to_date: toDate }),
    }),
}

// =====================================================================
// Library & preferences — /tuition
// Open to every tuition user, whatever their role.
// =====================================================================

/** Comma-separated is what the multipart form expects; empty stays absent. */
function joinList(values: (string | number)[] | undefined): string | undefined {
  if (!values?.length) return undefined
  return values.join(',')
}

export const tuitionLibraryApi = {
  /**
   * Share a file.
   *
   * Multipart, because a file cannot carry a JSON body alongside it: the
   * metadata goes as form fields and the lists go comma-separated.
   *
   * A STUDENT's upload to anything wider than PRIVATE comes back
   * `approval_status: PENDING` and reaches nobody until a teacher approves it.
   * A `storage_warning` on the response means the file IS saved, just on local
   * disk rather than the configured provider.
   */
  upload: (form: LibraryUploadForm, file: File, onProgress?: (percent: number) => void) => {
    const body = new FormData()
    body.append('file', file)
    body.append('title', form.title)
    if (form.description) body.append('description', form.description)
    if (form.material_type) body.append('material_type', form.material_type)
    if (form.subject_id != null) body.append('subject_id', String(form.subject_id))
    if (form.enrollment_id != null) body.append('enrollment_id', String(form.enrollment_id))
    if (form.visibility) body.append('visibility', form.visibility)
    const tags = joinList(form.tags)
    if (tags) body.append('tags', tags)
    const shared = joinList(form.shared_with_user_ids)
    if (shared) body.append('shared_with_user_ids', shared)

    return post<LibraryItemOut>('/tuition/library/upload', body, {
      // Uploads are the one place in the app where 30s is genuinely too short.
      timeout: 120_000,
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return
        onProgress(Math.round((event.loaded / event.total) * 100))
      },
    })
  },

  /**
   * Share a link instead of a copy. Preferred for anything already on the web:
   * a copy goes stale, costs storage and loses the source.
   */
  createLink: (body: LibraryLinkCreate) => post<LibraryItemOut>('/tuition/library/links', body),

  /**
   * What I can see. The server decides that from visibility, my enrollments
   * and my role — there is nothing to filter for reach on our side.
   */
  browse: (params?: {
    subjectId?: number
    enrollmentId?: number
    materialType?: string
    search?: string
  }) =>
    get<LibraryItemOut[]>('/tuition/library', {
      params: cleanParams({
        subject_id: params?.subjectId,
        enrollment_id: params?.enrollmentId,
        material_type: params?.materialType,
        search: params?.search,
      }),
    }),

  /** Student uploads awaiting review. Empty for a student. */
  pending: () => get<LibraryItemOut[]>('/tuition/library/pending'),

  moderate: (itemId: number, body: LibraryModeration) =>
    post<LibraryItemOut>(`/tuition/library/${itemId}/moderate`, body),

  item: (itemId: number) => get<LibraryItemOut>(`/tuition/library/${itemId}`),

  /**
   * Counts a download and returns the item with a URL to open.
   *
   * A POST because it records something. Call it, then open the `file_url` or
   * `external_url` it returns.
   */
  download: (itemId: number) => post<LibraryItemOut>(`/tuition/library/${itemId}/download`),

  update: (itemId: number, body: LibraryItemUpdate) =>
    put<LibraryItemOut>(`/tuition/library/${itemId}`, body),

  remove: (itemId: number) => del(`/tuition/library/${itemId}`),

  // --------------------------------------------------------------- me

  /**
   * Who I am in the programme, and the zone my times render in.
   *
   * `effective_timezone` is what to LABEL times with. It is also, in practice,
   * the cheapest way to ask "am I in the tuition programme at all?" — this
   * endpoint 403s for an account without it.
   */
  me: () => get<TuitionProfile>('/tuition/me'),

  /** Self-service: the person who knows where a student sits is the student. */
  setTimezone: (body: TimezoneUpdate) => put<TimezoneUpdated>('/tuition/me/timezone', body),
}

/**
 * Attendance a teacher may record on a tuition class.
 *
 * EXCUSED is offered here even though the backend's suggestion never proposes
 * it: a one-to-one class cancelled by a parent the night before is exactly the
 * case it exists for, and only the teacher knows.
 */
export const TUITION_ATTENDANCE_OPTIONS: AttendanceStatus[] = [
  'PRESENT',
  'LATE',
  'ABSENT',
  'EXCUSED',
]

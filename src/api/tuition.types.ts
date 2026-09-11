import type {
  ApiDate,
  ApiDateTime,
  ApiTime,
  AttendanceStatus,
  DayOfWeek,
  ExamMode,
  ExamStatus,
  GradingScheme,
  ReportCardOut,
  SubjectOut,
} from './types'

/**
 * Online tuition.
 *
 * A second product sharing this application's login, user table and subject
 * catalogue. It is NOT a filtered view of the LMS: a tuition class is one
 * student and one teacher, scheduled from a recurring weekly slot, conducted
 * on a countdown the server owns, counted for attendance and then billed —
 * none of which the class-based LMS models express.
 *
 * Split out of `types.ts` only for size; everything here is re-exported from
 * there, so keep importing from `@/api/types` like the rest of the app.
 *
 * Two conventions run through every shape below.
 *
 * **Participants are never sent.** A slot, a session and an assessment all
 * name an `enrollment_id`; the student, teacher and subject are read from that
 * arrangement server-side. The ids in a response are for display, never for us
 * to choose.
 *
 * **Times arrive twice.** Every instant comes back as stored UTC and again as
 * `<field>_local`, already rendered into the reader's zone, with
 * `viewer_timezone` naming which zone that was. Prefer the `_local` field when
 * showing a wall-clock time — the server knows the reader's timezone and the
 * browser only knows its own.
 */

// ---------------------------------------------------------------- enums

/**
 * Which product a user, or a record, belongs to.
 *
 * Carried as a list because an admin runs both and a teacher may genuinely do
 * both jobs. Absent means LMS — every account that predates tuition was a
 * school account, and defaulting the other way would hand a whole school a
 * product it never bought.
 */
export type Program = 'LMS' | 'TUITION'

export type TuitionEnrollmentStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'

/**
 * Where one one-to-one class got to.
 *
 * The two no-shows are separate from CANCELLED because billing counts them
 * differently: a class the teacher missed is not chargeable, a class the
 * student missed generally is.
 */
export type TuitionSessionStatus =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW_TEACHER'
  | 'NO_SHOW_STUDENT'

/** Who a shared book, note or recording reaches. */
export type LibraryVisibility = 'PRIVATE' | 'ENROLLMENT' | 'SUBJECT' | 'PROGRAM'

export type LibraryApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type TuitionMaterialType =
  | 'NOTES'
  | 'BOOK'
  | 'RECORDING'
  | 'LINK'
  | 'WORKSHEET'
  | 'QUESTION_PAPER'

export type FeeBasis = 'PER_SESSION' | 'HOURLY' | 'MONTHLY'

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED'

export type TuitionAssessmentCategory = 'HOMEWORK' | 'ASSIGNMENT' | 'EXAM' | 'TEST' | 'PROJECT'

// ------------------------------------------------------- program access

/** PUT /admin/tuition/users/{id}/programs — replaces the list outright. */
export interface ProgramAccessUpdate {
  programs: Program[]
}

/** A participant, trimmed to what a tuition screen shows and picks from. */
export interface TuitionUserSummary {
  id: number
  full_name: string
  email: string
  role: string
  is_active: boolean
  programs: Program[]
  admission_number?: string | null
  employee_id?: string | null
  phone?: string | null
  /** A zone this person explicitly PINNED. Null means they are on detection. */
  timezone?: string | null
  /** Where their browser last reported being, via the `X-Timezone` header. */
  detected_timezone?: string | null
  /**
   * Subjects a teacher can take.
   *
   * A hint for the enrollment screen's candidate list, not an assignment — the
   * assignment IS the enrollment, and treating this as one would give two
   * answers to "who teaches this?".
   */
  subject_ids: number[]
  photo_url?: string | null
}

/**
 * Adds a NEW person to the tuition programme.
 * `POST /admin/tuition/students` and `/admin/tuition/teachers`.
 *
 * A fresh account, not a school pupil borrowed from the LMS: the two user
 * bases overlap only sometimes, and requiring an LMS profile first would mean
 * every tuition family had to be enrolled in a school they may have nothing to
 * do with.
 *
 * Almost everything is optional because an admin onboarding thirty students
 * has partial data for most of them. `email` is derived from the name when
 * omitted; `password` is issued later with
 * `POST /admin/users/{id}/generate-credentials`, which emails it.
 */
export interface TuitionAccountCreate {
  full_name: string
  email?: string | null
  password?: string | null
  phone?: string | null
  /**
   * Also grant school LMS access. OFF by default, deliberately: an account
   * added through the tuition module that silently also reached the school's
   * classes and marks would be a privacy problem, not a convenience.
   */
  also_lms?: boolean
  /** Left unset, it is detected from their browser on their first request. */
  timezone?: string | null
}

export interface TuitionStudentCreate extends TuitionAccountCreate {
  /** Generated as `TUI-<year>-0001` when omitted, so nobody has to invent one. */
  admission_number?: string | null
}

export interface TuitionTeacherCreate extends TuitionAccountCreate {
  /** Generated as `TUT-<year>-0001` when omitted. */
  employee_id?: string | null
  /** What this teacher can take. Records a capability; assigns nobody. */
  subject_ids?: number[]
}

// ---------------------------------------------------------- enrollments

/**
 * One (student, subject) arrangement, and the teacher who owns it.
 *
 * A second ACTIVE enrollment for the same student and subject is refused with
 * 409 — one subject has one teacher, which is the rule the whole scheduling
 * model rests on.
 */
export interface TuitionEnrollmentCreate {
  student_id: number
  subject_id: number
  teacher_id: number
  syllabus?: string | null
  goals?: string | null
  grade_level?: string | null
  /** Class length for this arrangement; falls back to the programme default. */
  default_duration_minutes?: number | null
  fee_plan_id?: number | null
  start_date?: ApiDate | null
  end_date?: ApiDate | null
  notes?: string | null
}

/** Partial. Changing `teacher_id` re-points the slots and every future class. */
export interface TuitionEnrollmentUpdate {
  teacher_id?: number
  status?: TuitionEnrollmentStatus
  syllabus?: string | null
  goals?: string | null
  grade_level?: string | null
  default_duration_minutes?: number | null
  fee_plan_id?: number | null
  start_date?: ApiDate | null
  end_date?: ApiDate | null
  notes?: string | null
}

export interface TuitionEnrollmentOut {
  id: number
  student_id: number
  teacher_id: number
  subject_id: number
  status: TuitionEnrollmentStatus
  /** Hydrated server-side; absent only if the referenced account vanished. */
  student?: TuitionUserSummary | null
  teacher?: TuitionUserSummary | null
  subject?: SubjectOut | null

  syllabus?: string | null
  goals?: string | null
  grade_level?: string | null
  default_duration_minutes?: number | null
  fee_plan_id?: number | null
  start_date?: ApiDate | null
  end_date?: ApiDate | null
  notes?: string | null
  created_by?: number | null
  created_at?: ApiDateTime | null
  updated_at?: ApiDateTime | null
}

// ---------------------------------------------------------------- slots

/**
 * A recurring weekly class time.
 *
 * Refused with 409 and a list of conflicts when either party is already
 * committed then — checked from BOTH diaries, because two tuition teachers
 * have no other way of knowing about each other. `allow_conflicts` books
 * anyway and records the clash rather than hiding it.
 */
export interface TuitionSlotCreate {
  enrollment_id: number
  day_of_week: DayOfWeek
  /** Local wall-clock start in programme time, e.g. "17:00". */
  start_time: ApiTime
  duration_minutes?: number | null
  effective_from?: ApiDate | null
  effective_to?: ApiDate | null
  is_active?: boolean
  /** A standing room. Omitted, each class gets its own Meet on demand. */
  meeting_link?: string | null
  auto_create_meet?: boolean
}

export interface TuitionSlotUpdate {
  day_of_week?: DayOfWeek
  start_time?: ApiTime
  duration_minutes?: number | null
  effective_from?: ApiDate | null
  effective_to?: ApiDate | null
  is_active?: boolean
  meeting_link?: string | null
  auto_create_meet?: boolean
}

export interface TuitionSlotOut {
  id: number
  enrollment_id: number
  student_id: number
  teacher_id: number
  subject_id: number
  day_of_week: DayOfWeek
  start_time: ApiTime
  end_time: ApiTime
  duration_minutes: number
  effective_from?: ApiDate | null
  effective_to?: ApiDate | null
  is_active: boolean
  meeting_link?: string | null
  auto_create_meet: boolean
  timezone?: string | null

  student?: TuitionUserSummary | null
  teacher?: TuitionUserSummary | null
  subject?: SubjectOut | null

  /** Non-empty after an override: the clash was a decision, not an accident. */
  conflicts: string[]
  sessions_generated?: number | null
  sessions_removed?: number | null
  created_at?: ApiDateTime | null
  updated_at?: ApiDateTime | null
}

/** Asked before committing to a time, so a picker can grey out what cannot work. */
export interface SlotAvailabilityQuery {
  enrollment_id: number
  day_of_week: DayOfWeek
  start_time: ApiTime
  duration_minutes?: number
  effective_from?: ApiDate | null
  effective_to?: ApiDate | null
  /** Ignore this slot — set when editing it, or it collides with itself. */
  exclude_slot_id?: number | null
}

export interface SlotAvailabilityResult {
  available: boolean
  conflicts: string[]
}

// ------------------------------------------------------------- sessions

/** A one-off extra class outside the weekly pattern: revision, or a catch-up. */
export interface TuitionSessionCreate {
  enrollment_id: number
  /** Absolute instant — send with a timezone offset. */
  scheduled_start_at: ApiDateTime
  duration_minutes?: number | null
  title?: string | null
  meeting_link?: string | null
  auto_create_meet?: boolean
}

/** Moves one class without touching the recurring slot behind it. */
export interface TuitionSessionReschedule {
  scheduled_start_at: ApiDateTime
  duration_minutes?: number | null
  reason?: string | null
}

export interface TuitionSessionCancel {
  reason?: string | null
}

/**
 * Closes a class. Allowed before the effective end — connections drop and
 * students leave — but an early finish is recorded as `ended_early` and
 * `short_by_minutes`, which is what the admin's report reads.
 */
export interface TuitionSessionEnd {
  topic?: string | null
  notes?: string | null
  recording_url?: string | null
}

/** Overrides whatever the join timestamps imply. The teacher has the last word. */
export interface TuitionAttendanceMark {
  status: AttendanceStatus
  remarks?: string | null
}

export interface MeetingLinkUpdate {
  meeting_link: string
}

/**
 * The countdown, resolved server-side.
 *
 * Returned rather than derived here so the teacher's screen and the student's
 * cannot disagree about when a class ends — which, given one of them may stop
 * it and the other may stay, is the disagreement worth designing out.
 */
export interface SessionTiming {
  now: ApiDateTime
  starts_in_minutes?: number | null
  minutes_remaining?: number | null
  effective_end_at?: ApiDateTime | null
  extension_minutes: number
  /**
   * The two lateness figures are measured against DIFFERENT references, and
   * that asymmetry is the rule, not an inconsistency.
   *
   * The teacher is late against the TIMETABLE — they promised 17:00, and being
   * late is what earns the student extra time at the end. The student is late
   * against the class ACTUALLY STARTING — you cannot be late for something
   * that has not begun.
   */
  teacher_late_minutes: number
  student_late_minutes: number
  /** True once the teacher is entitled to stop. The one flag their UI needs. */
  may_end_now: boolean
  is_live: boolean

  /** Whether the programme opens classes on the timetable without the teacher. */
  auto_start: boolean
  /**
   * When the class actually began — NOT the scheduled start, and conflating
   * the two is unfair to the student in a way that reaches their bill.
   *
   * Under automatic starts this is the timetabled slot. Under teacher-start it
   * is `max(scheduled, started_at)`: a teacher who opens the room five minutes
   * early has not thereby made a punctual student five minutes late.
   */
  class_started_at?: ApiDateTime | null
  class_has_started: boolean
  /**
   * What a student's screen should say while nothing is happening.
   *
   * A student sitting in a class the teacher has not opened is WAITING, not
   * late — telling them otherwise is how a fair rule reads as an unfair one.
   * True only past the scheduled time, and only in teacher-start mode.
   */
  waiting_for_teacher: boolean
}

export interface TuitionSessionOut {
  /** String for generated classes, numeric for some ad-hoc ones. Never do arithmetic on it. */
  id: string | number
  enrollment_id: number
  slot_id?: number | null
  student_id: number
  teacher_id: number
  subject_id: number

  session_date?: ApiDate | null
  scheduled_start_at?: ApiDateTime | null
  scheduled_end_at?: ApiDateTime | null
  /** Scheduled end plus any extension a late teacher earned. */
  effective_end_at?: ApiDateTime | null
  duration_minutes: number
  status: TuitionSessionStatus
  title?: string | null
  topic?: string | null
  teacher_notes?: string | null

  teacher_joined_at?: ApiDateTime | null
  student_joined_at?: ApiDateTime | null
  started_at?: ApiDateTime | null
  /** When the class began, as the lateness rules reckon it. See `SessionTiming`. */
  class_started_at?: ApiDateTime | null
  /**
   * Opened by the scheduled sweep rather than by the teacher pressing start.
   *
   * The sweep moves the status only — it never invents a `teacher_joined_at`,
   * because who actually turned up is a fact about people, and marking a
   * teacher present for a class they slept through would corrupt both the
   * attendance record and the no-show rule that makes such a class unbillable.
   * So an auto-started class can be IN_PROGRESS with nobody in it.
   */
  auto_started?: boolean
  ended_at?: ApiDateTime | null
  teacher_late_minutes: number
  student_late_minutes: number
  extension_minutes: number
  actual_duration_minutes?: number | null
  ended_early?: boolean | null
  short_by_minutes?: number | null

  attendance_status?: AttendanceStatus | null
  attendance_remarks?: string | null
  attendance_marked_by?: number | null
  attendance_marked_at?: ApiDateTime | null
  /** What the join times imply, offered to the teacher as a default. */
  suggested_attendance?: AttendanceStatus | null

  meeting_link?: string | null
  meet_status?: string | null
  meet_error?: string | null
  recording_url?: string | null

  is_ad_hoc: boolean
  is_billable?: boolean | null
  cancelled_by?: number | null
  cancellation_reason?: string | null
  rescheduled_from?: ApiDateTime | null

  student?: TuitionUserSummary | null
  teacher?: TuitionUserSummary | null
  subject?: SubjectOut | null
  /** The countdown. Present on single reads and the live lists. */
  timing?: SessionTiming | null
  conflicts: string[]

  // Pre-rendered in the reader's own zone — see the module note above.
  scheduled_start_at_local?: ApiDateTime | null
  scheduled_end_at_local?: ApiDateTime | null
  effective_end_at_local?: ApiDateTime | null
  teacher_joined_at_local?: ApiDateTime | null
  student_joined_at_local?: ApiDateTime | null
  started_at_local?: ApiDateTime | null
  class_started_at_local?: ApiDateTime | null
  ended_at_local?: ApiDateTime | null
  viewer_timezone?: string | null

  created_at?: ApiDateTime | null
  updated_at?: ApiDateTime | null
}

// -------------------------------------------------------------- library

export interface LibraryLinkCreate {
  title: string
  description?: string | null
  material_type?: TuitionMaterialType
  subject_id?: number | null
  /** Required for ENROLLMENT visibility — it is what "this arrangement" means. */
  enrollment_id?: number | null
  visibility?: LibraryVisibility
  shared_with_user_ids?: number[]
  tags?: string[]
  external_url: string
}

/**
 * Metadata for a file upload. Sent as multipart form fields, not JSON — a file
 * cannot carry a JSON body alongside it. `tags` and `shared_with_user_ids` go
 * over the wire comma-separated.
 */
export interface LibraryUploadForm {
  title: string
  description?: string | null
  material_type?: TuitionMaterialType
  subject_id?: number | null
  enrollment_id?: number | null
  visibility?: LibraryVisibility
  tags?: string[]
  shared_with_user_ids?: number[]
}

/**
 * Partial. Widening an already-approved STUDENT upload re-opens it for review
 * — otherwise approval would be bypassed by uploading narrow and editing wide.
 */
export interface LibraryItemUpdate {
  title?: string
  description?: string | null
  material_type?: TuitionMaterialType
  subject_id?: number | null
  visibility?: LibraryVisibility
  shared_with_user_ids?: number[]
  tags?: string[]
  external_url?: string | null
}

export interface LibraryModeration {
  approve: boolean
  /** Required in practice when rejecting — the uploader is told why. */
  reason?: string | null
}

export interface LibraryItemOut {
  id: number
  title: string
  description?: string | null
  material_type: TuitionMaterialType
  subject_id?: number | null
  enrollment_id?: number | null
  visibility: LibraryVisibility
  approval_status: LibraryApprovalStatus
  approved_by?: number | null
  approved_at?: ApiDateTime | null
  rejection_reason?: string | null

  file_url?: string | null
  external_url?: string | null
  file_name?: string | null
  storage_provider?: string | null
  /** Set when the file fell back to local disk. It IS saved — just not where expected. */
  storage_warning?: string | null
  tags: string[]
  shared_with_user_ids: number[]

  uploaded_by: number
  uploader_role?: string | null
  uploader?: TuitionUserSummary | null
  subject?: SubjectOut | null
  download_count: number
  uploaded_at?: ApiDateTime | null
  updated_at?: ApiDateTime | null
}

// ---------------------------------------------------------- assessments

export interface TuitionGradeBand {
  grade: string
  min_percentage: number
}

/**
 * Homework, an assignment or an exam, set for one student.
 *
 * Everything but `enrollment_id` and `category` is the LMS exam form
 * unchanged, because the engine behind it is the LMS exam engine unchanged —
 * question types, timed windows, auto-marking and publishing all behave here
 * exactly as they do for a class. The response is an ordinary `ExamOut`.
 */
export interface TuitionAssessmentCreate {
  enrollment_id: number
  category?: TuitionAssessmentCategory
  title: string
  description?: string | null
  instructions?: string | null
  mode?: ExamMode
  status?: ExamStatus

  starts_at: ApiDateTime
  ends_at: ApiDateTime
  duration_minutes?: number | null
  upload_grace_minutes?: number
  late_submission_allowed?: boolean

  grading_scheme?: GradingScheme
  /** Defaults to the questions' total when omitted. */
  max_marks?: number | null
  pass_marks?: number | null
  grade_bands?: TuitionGradeBand[]

  questions?: unknown[]
  shuffle_questions?: boolean
  auto_grade_objective?: boolean
  max_upload_files?: number
}

/**
 * Consolidates a student's tuition work onto one card.
 *
 * No rank and no class size: a one-to-one student has no cohort, and ranking
 * them against other people's private students would be meaningless as well as
 * intrusive.
 */
export interface TuitionReportCardCreate {
  student_id: number
  title: string
  from_date?: ApiDate | null
  to_date?: ApiDate | null
  /**
   * Average unsat papers in as zero. Off by default — an absence is not a
   * mark, and averaging one in unasked misreports the student.
   */
  count_missing_as_zero?: boolean
  remarks?: string | null
}

/**
 * A tuition report card.
 *
 * Structurally the LMS card — same per-subject blocks, same per-exam lines, so
 * the same components render it — with three differences that matter.
 *
 * `rank` and `class_size` are ALWAYS null. A one-to-one student has no cohort,
 * and ranking them against other people's private students would be
 * meaningless as well as intrusive. Screens should hide the rank slot rather
 * than show an empty one, which advertises a number that will never arrive.
 *
 * `class_id` and `class_room` are null for the same reason: there is no class.
 *
 * It carries the tuition attendance counts alongside the marks, because in this
 * product "how much did they turn up" is half of how a term went.
 */
export interface TuitionReportCardOut
  extends Omit<ReportCardOut, 'class_id' | 'class_room' | 'rank' | 'class_size'> {
  program: Program
  class_id: null
  class_room: null
  rank: null
  class_size: null
  classes_conducted?: number
  classes_attended?: number
}

/**
 * What generating a card answers with.
 *
 * Loosely typed on purpose: the create and publish endpoints return the stored
 * document, and the field naming the card has been `id` on some paths and
 * `card_id` on others. Callers read whichever is present rather than assuming.
 */
export interface TuitionReportCardResult {
  id?: string
  card_id?: string
  student_id?: number
  title?: string
  is_published?: boolean
  [key: string]: unknown
}

// ----------------------------------------------------------------- fees

export interface FeePlanCreate {
  name: string
  basis?: FeeBasis
  amount: number
  currency?: string | null
  /** Scopes the plan to one subject; null is the programme default plan. */
  subject_id?: number | null
  /** Charged for a class the student missed. Null bills it in full. */
  no_show_amount?: number | null
  charge_teacher_no_show?: boolean
  is_active?: boolean
  notes?: string | null
}

export type FeePlanUpdate = Partial<FeePlanCreate>

export interface FeePlanOut {
  id: number
  name: string
  basis: FeeBasis
  amount: number
  currency: string
  subject_id?: number | null
  no_show_amount?: number | null
  charge_teacher_no_show: boolean
  is_active: boolean
  notes?: string | null
  created_at?: ApiDateTime | null
}

/** Builds a bill from counted classes. Refuses to overwrite one already issued. */
export interface InvoiceGenerate {
  student_id: number
  period_start: ApiDate
  period_end: ApiDate
  discount_amount?: number
  tax_amount?: number
  due_date?: ApiDate | null
  notes?: string | null
}

/** Bills everyone with classes in a period. Issued invoices are skipped, not failed. */
export interface InvoiceBatchGenerate {
  period_start: ApiDate
  period_end: ApiDate
}

export interface PaymentRecord {
  amount: number
  method?: string | null
  reference?: string | null
  paid_at?: ApiDateTime | null
}

/** One priced row on an invoice. Its shape follows the fee basis, so it stays loose. */
export interface InvoiceLineItem {
  description?: string
  subject?: string
  subject_id?: number
  quantity?: number
  unit_amount?: number
  amount?: number
  basis?: FeeBasis
  [key: string]: unknown
}

export interface InvoicePayment {
  amount?: number
  method?: string | null
  reference?: string | null
  paid_at?: ApiDateTime | null
  recorded_by?: number | null
  [key: string]: unknown
}

export interface InvoiceOut {
  id: string
  student_id: number
  student_name?: string | null
  admission_number?: string | null
  period_start: ApiDate
  period_end: ApiDate
  status: InvoiceStatus
  currency: string
  line_items: InvoiceLineItem[]
  subtotal: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  amount_paid: number
  payments: InvoicePayment[]
  issued_at?: ApiDateTime | null
  due_date?: ApiDate | null
  notes?: string | null
  created_at?: ApiDateTime | null
  updated_at?: ApiDateTime | null
}

/**
 * Headline figures for the billing screen.
 *
 * Computed by the server from exactly the invoices it returned alongside them,
 * not from a separate query — so the totals at the top can never disagree with
 * the rows underneath. Never recompute these from a filtered client-side list:
 * that reintroduces precisely the disagreement the server went out of its way
 * to prevent.
 */
export interface TuitionBillingSummary {
  currency: string
  invoice_count: number
  total_billed: number
  total_collected: number
  outstanding: number
  /**
   * Issued, past its due date, unsettled. A DRAFT is NEVER overdue however
   * old — nobody has been asked to pay it, so counting it would put unbilled
   * work on an aged-debt report.
   */
  overdue_count: number
  overdue_amount: number
  classes_billed: number
  classes_conducted: number
  classes_attended: number
  classes_missed: number
  by_status: Record<string, { count: number; total: number; paid: number }>
}

export interface TuitionBillingFilters {
  student_id?: number | null
  status?: string | null
  from_date?: ApiDate | null
  to_date?: ApiDate | null
  unpaid_only?: boolean
}

/** GET /admin/tuition/billing — the invoices and their own totals, together. */
export interface TuitionBillingOverview {
  filters: TuitionBillingFilters
  summary: TuitionBillingSummary
  invoices: InvoiceOut[]
}

/**
 * One student's whole billing history — the screen to open when a parent calls.
 *
 * Carries the contact details beside the figures because the question is
 * almost always "what do they owe right now, and for what?", and answering it
 * should not need a second lookup.
 */
export interface StudentBillingAccount {
  student_id: number
  student_name?: string | null
  admission_number?: string | null
  email?: string | null
  phone?: string | null
  guardian_name?: string | null
  guardian_phone?: string | null
  invoice_count: number
  invoices: InvoiceOut[]
  summary: TuitionBillingSummary
}

/** An invoice line with the individual classes it was priced from. */
export interface InvoiceLineDetail extends InvoiceLineItem {
  sessions: TuitionSessionOut[]
}

/**
 * GET /admin/tuition/invoices/{id}/detail — the full audit trail.
 *
 * The bill, its lines with the counts each was priced from, and then the
 * actual classes behind them with dates, attendance and lateness. That is what
 * turns "why is this 4,000?" from an argument into a lookup.
 *
 * The sessions are read back from the session records, not stored on the
 * invoice: the invoice keeps the COUNTS it was priced from, and copying every
 * session onto every invoice would give the truth two places to live. So a
 * session's `is_billable` is what explains a class that happened but is not in
 * the total.
 */
export interface InvoiceDetail extends Omit<InvoiceOut, 'line_items'> {
  line_items: InvoiceLineDetail[]
  outstanding: number
  session_count: number
}

/**
 * Which CSV to build. Four views because four different people ask for the
 * file: `summary` reconciles against the ledger, `lines` explains a bill,
 * `payments` chases what is owed, `sessions` answers "which classes?".
 */
export type BillingExportView = 'summary' | 'lines' | 'payments' | 'sessions'

/** `lines` = the invoice's subjects; `sessions` = the classes behind them. */
export type InvoiceExportView = 'lines' | 'sessions'

export type ReportExportView = 'students' | 'teachers' | 'sessions'

export interface TuitionFeeSummary {
  from_date?: ApiDate
  to_date?: ApiDate
  currency?: string
  invoiced?: number
  collected?: number
  outstanding?: number
  [key: string]: unknown
}

/** POST /admin/tuition/invoices/generate-batch. */
export interface InvoiceBatchResult {
  generated?: number
  skipped?: number
  invoices?: InvoiceOut[]
  warnings?: string[]
  [key: string]: unknown
}

// -------------------------------------------------------------- reports

/**
 * The counts every tuition report is built from.
 *
 * `attendance_percentage` is measured against classes actually CONDUCTED, not
 * scheduled: a student whose teacher missed two classes has 100% attendance,
 * not 60%. Since these counts also price the invoices, the distinction is
 * money as well as fairness.
 */
export interface TuitionAttendanceTotals {
  total_sessions: number
  conducted: number
  attended: number
  late: number
  missed: number
  cancelled: number
  teacher_no_show: number
  upcoming: number
  billable_sessions: number
  attendance_percentage?: number | null
  scheduled_minutes: number
  taught_minutes: number
}

/** A per-subject or per-counterparty breakdown row: totals-shaped, plus a label. */
export interface TuitionReportBreakdown extends Partial<TuitionAttendanceTotals> {
  subject_id?: number
  subject?: string
  student_id?: number
  student_name?: string
  teacher_id?: number
  teacher_name?: string
  [key: string]: unknown
}

export interface StudentAttendanceReport {
  student_id: number
  student_name?: string | null
  admission_number?: string | null
  from_date: ApiDate
  to_date: ApiDate
  totals: TuitionAttendanceTotals
  subjects: TuitionReportBreakdown[]
}

export interface TeacherAttendanceReport {
  teacher_id: number
  teacher_name?: string | null
  employee_id?: string | null
  from_date: ApiDate
  to_date: ApiDate
  totals: TuitionAttendanceTotals
  students: TuitionReportBreakdown[]
}

export interface ProgrammeReport {
  from_date: ApiDate
  to_date: ApiDate
  totals: TuitionAttendanceTotals
  students: TuitionReportBreakdown[]
  teachers: TuitionReportBreakdown[]
}

// ------------------------------------------------------------- settings

/**
 * Runtime configuration for one product, editable by an admin.
 *
 * Omitted fields are LEFT ALONE — the UI renders only part of this, and a PUT
 * that dropped the rest would reset behaviour nobody meant to touch. The
 * tuition-only fields are ignored when the program is LMS.
 */
export interface ProgramSettingsUpdate {
  /** IANA zone, e.g. "Asia/Dubai". */
  timezone?: string | null
  reminders_enabled?: boolean
  /** Several values send several nudges before the same class. */
  reminder_minutes_before?: number[]
  remind_teachers?: boolean
  reminder_max_lateness_minutes?: number

  default_session_minutes?: number
  /**
   * Open classes on their timetabled slot whether or not the teacher has
   * arrived.
   *
   * Changes what student lateness is measured from, so it is a policy
   * decision rather than a convenience: ON, a student is late against the
   * timetable; OFF, they are late only once the teacher opens the class, and
   * until then they are simply waiting.
   */
  auto_start_class?: boolean
  /** Cap on how far a late teacher may push a class past its scheduled end. */
  max_teacher_late_extension_minutes?: number
  teacher_no_show_minutes?: number
  student_late_grace_minutes?: number
  /** Minimum breathing room between one person's classes. */
  min_gap_minutes?: number
  session_horizon_days?: number
  student_uploads_need_approval?: boolean
  currency?: string
  default_session_fee?: number
  auto_create_meet?: boolean
}

/** GET /admin/tuition/settings/{program}. LMS reads back only the shared half. */
export interface ProgramSettings extends ProgramSettingsUpdate {
  timezone: string
  reminders_enabled: boolean
  reminder_minutes_before: number[]
  [key: string]: unknown
}

/**
 * Where a person's times come from.
 *
 * EXPLICIT beats DETECTED beats PROGRAMME. The distinction is what lets the UI
 * offer "you seem to be in Europe/London — switch?" instead of moving somebody's
 * schedule under them without being asked.
 */
export type TimezoneSource = 'EXPLICIT' | 'DETECTED' | 'PROGRAMME'

/** GET /tuition/me — who I am in the programme, and in what zone times render. */
export interface TuitionProfile {
  user: TuitionUserSummary
  programme_timezone: string
  /** What times ARE rendered in. Label times with this, never a bare hour. */
  effective_timezone: string
  timezone_source: TimezoneSource
  /** Where the browser last said this person was. May disagree with a pin. */
  detected_timezone?: string | null
  currency?: string
  default_session_minutes: number
  reminder_minutes_before: number[]
  server_timezone: string
}

export interface TimezoneUpdate {
  /**
   * IANA zone to PIN times to. Null unpins and returns to automatic detection
   * from the browser — which is the right default, so clearing is a real
   * action rather than an absence.
   */
  timezone: string | null
}

export interface TimezoneUpdated {
  user_id: number
  timezone: string | null
  detected_timezone?: string | null
  effective_timezone: string
  timezone_source: TimezoneSource
  detail: string
}

// ------------------------------------------------------- schedule & ops

export interface TuitionScheduleStatus {
  horizon_days?: number
  generated_through?: ApiDate | null
  active_slots?: number
  scheduled_sessions?: number
  [key: string]: unknown
}

export interface TuitionGenerateResult {
  created?: number
  removed?: number
  detail?: string
  [key: string]: unknown
}

/** One clash the programme is carrying, seen from either party's diary. */
export interface TuitionConflict {
  detail?: string
  slot_id?: number
  enrollment_id?: number
  [key: string]: unknown
}

/** GET /admin/tuition/conflicts — a count and the findings, not a bare list. */
export interface TuitionConflictReport {
  conflict_count: number
  conflicts: TuitionConflict[]
}

/**
 * What a tuition delete actually removed.
 *
 * These two deletes answer with a body rather than a 204: an enrollment or a
 * slot owns future classes, and how many went with it is the part the admin
 * needs to see. Classes already taught are never removed by either.
 */
export interface TuitionDeleteResult {
  enrollment_id?: number
  slot_id?: number
  removed?: number
  sessions_removed?: number
  detail?: string
  [key: string]: unknown
}

/**
 * Whether the background sweep is actually running.
 *
 * Worth surfacing because a stopped scheduler fails silently: classes still
 * happen, they simply stop being reminded about and stop being settled, and
 * the first symptom is an invoice that undercounts a month later.
 */
export interface TuitionSchedulerStatus {
  running: boolean
  timezone: string
  reminders_enabled: boolean
  offsets_minutes: number[]
  remind_teachers: boolean
  /** False means every reminder will fail at the SMTP step, however healthy the sweep. */
  mail_configured: boolean
  started_at?: ApiDateTime | null
  last_run_at?: ApiDateTime | null
  run_count: number
  last_error?: string | null
  last_result?: TuitionSweepSummary | null
  last_maintenance?: TuitionMaintenanceSummary | null
  server_time_utc: ApiDateTime
}

export interface TuitionSweepSummary {
  dry_run?: boolean
  detail?: string
  due_sessions?: number
  recipients?: number
  sent?: number
  failed?: number
  skipped_already_sent?: number
  [key: string]: unknown
}

export interface TuitionMaintenanceSummary {
  sessions_generated?: number
  sessions_closed?: number
  detail?: string
  [key: string]: unknown
}

/**
 * Wire types, mirroring the FastAPI Pydantic schemas exactly.
 *
 * Traps encoded here deliberately:
 *  - `id` values are 13-digit epoch-millisecond integers, not small counters.
 *  - `TeacherMappingOut` / `StudentEnrollmentOut` carry ONLY nested objects,
 *    no flat `class_id` / `teacher_id`. Read `mapping.class_room.id`.
 *  - `AttendanceOut` has `teacher_id` but NO `teacher` object.
 *  - Nested objects are nullable on Attendance/Topic/Meeting/Material/Grade
 *    and non-nullable on Mapping/Enrollment.
 *  - `LiveMeetingOut.status` and `StudyMaterialOut.material_type` are
 *    free-form strings, not enums.
 *  - All datetimes are naive UTC strings (no `Z`); all dates are "YYYY-MM-DD".
 *    Never call `new Date()` on them — use `lib/datetime`.
 *  - Every `*Update` model is PARTIAL and the backend rejects an entirely
 *    empty body with 400, so callers must diff before sending. The backend
 *    also applies `exclude_none`, meaning a field cannot be cleared back to
 *    null through an update — only overwritten with a new value.
 */

/**
 * `CLASS_TEACHER` is a TEACHER with extra reach, not a separate kind of user.
 * They take periods, own subject mappings and appear on the timetable exactly
 * like a TEACHER, so anything asking "may this user own a teaching record?"
 * must accept both — see `TEACHING_ROLES` in `lib/constants`. Testing
 * `role === 'TEACHER'` is the bug this role introduces.
 */
export type UserRole = 'ADMIN' | 'CLASS_TEACHER' | 'TEACHER' | 'STUDENT'

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'

/** UNDISCLOSED is the value a profile carries when no answer was given. */
export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED'

/**
 * Named rather than numbered, matching the backend — ISO weekday numbering
 * (Monday=1) versus JS `getDay()` (Sunday=0) is a reliable off-by-one.
 */
export type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY'

/** Local wall-clock time of day: "09:00" or "09:00:00". */
export type ApiTime = string

/** ISO instant, naive UTC: "2026-08-08T14:32:11.482913". */
export type ApiDateTime = string
/** Calendar date: "2026-08-08". */
export type ApiDate = string

// ------------------------------------------------------------------- auth

export interface LoginRequest {
  email: string
  password: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  role: UserRole
  user_id: number
  full_name: string
}

/**
 * Optional profile detail, shared by read, create and update.
 *
 * None of it is required and none is enforced per-role — the backend groups
 * these by who they usually apply to but accepts any of them on anyone, and
 * leaves it to us to decide which sections a given role sees.
 *
 * `admission_number` and `employee_id` are unique per school; a collision comes
 * back as a 400 naming the field.
 */
export interface UserProfileFields {
  phone?: string | null
  alternate_phone?: string | null
  date_of_birth?: ApiDate | null
  gender?: Gender | null
  photo_url?: string | null

  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null

  /** Unique per school. */
  admission_number?: string | null
  /** Unique within a class, not globally. */
  roll_number?: string | null
  admission_date?: ApiDate | null
  blood_group?: string | null
  guardian_name?: string | null
  guardian_phone?: string | null
  guardian_email?: string | null
  guardian_relation?: string | null

  /** Unique per school. */
  employee_id?: string | null
  designation?: string | null
  qualification?: string | null
  specialization?: string | null
  date_of_joining?: ApiDate | null
  experience_years?: number | null

  /** Internal admin notes. Never shown to the user they describe. */
  notes?: string | null
  /**
   * Timetable reminder emails. Opt-OUT: the backend defaults it to true on
   * creation, so null means "never set" and should be read as enabled.
   */
  reminder_opt_in?: boolean | null
}

export interface UserOut extends UserProfileFields {
  id: number
  full_name: string
  email: string
  role: UserRole
  is_active: boolean
  created_at: ApiDateTime
  /**
   * Links the profile to its Firebase Auth account. Null on profiles created
   * before the Firebase migration — the backend backfills it on that user's
   * first authenticated request.
   */
  firebase_uid?: string | null
  updated_at?: ApiDateTime | null
}

/**
 * `full_name` is the only required field.
 *
 * Omit `email` and the backend generates `firstname.lastname@<domain>` from
 * the name, appending a number on collision. Omit `password` — which the admin
 * UI always does — and the account is provisioned with no way to sign in until
 * `POST /admin/users/{id}/generate-credentials` issues one.
 *
 * Admins never choose a password here: it is generated server-side, returned
 * exactly once, and emailed to the user.
 */
export interface UserCreate extends UserProfileFields {
  full_name: string
  email?: string | null
  password?: string | null
  role: UserRole
}

/** Options for POST /admin/users/{id}/generate-credentials. */
export interface GenerateCredentialsRequest {
  /** Off when the user has no working mailbox — the admin relays it by hand. */
  send_email?: boolean
  /** Signs the user out everywhere. Leave on for a password reset. */
  revoke_sessions?: boolean
}

/**
 * The one and only time the generated password exists outside Firebase.
 *
 * The backend does not store it and cannot return it again, so the UI must
 * treat this response as the single opportunity to show or copy it — and must
 * never log, persist, or report it anywhere.
 */
export interface CredentialsIssued {
  user_id: number
  full_name: string
  email: string
  role: UserRole
  password: string
  /**
   * False is a WARNING, not an error: the credentials are valid either way and
   * only delivery failed. `detail` explains which case it was.
   */
  email_sent: boolean
  detail: string
}

/**
 * PUT /admin/users/{id} — every field optional, merge semantics.
 *
 * Sending an explicit `null` does NOT clear a field: the backend treats omitted
 * and null alike, precisely so a partial form that defaults untouched inputs to
 * null cannot wipe data the editor never saw. Clearing a value is not something
 * this endpoint supports.
 */
export interface UserUpdate extends UserProfileFields {
  full_name?: string
  email?: string
  is_active?: boolean
  /**
   * SIGNS THE USER OUT. Changing a role re-issues Firebase claims and revokes
   * every existing token — otherwise a stale token leaves them looking at the
   * wrong navigation until it expires. Always confirm before sending this.
   */
  role?: UserRole
}

/**
 * DELETE /admin/users/{id} — 200 with this body, NOT the 204 it used to return.
 *
 * `deleted_records` is empty for a soft delete. `firebase_auth_deleted: false`
 * on a permanent delete means an orphaned login may still exist and needs
 * clearing by hand.
 */
export interface UserDeleted {
  user_id: number
  email: string | null
  full_name: string | null
  mode: 'SOFT' | 'PERMANENT'
  firebase_auth_deleted: boolean
  /** Collection label → number of records removed. */
  deleted_records: Record<string, number>
  detail: string
}

// --------------------------------------------------------------- academic

export interface ClassRoomOut {
  id: number
  name: string
  code: string
  description: string | null
}

export interface ClassRoomCreate {
  name: string
  code: string
  description?: string | null
}

export interface SubjectOut {
  id: number
  name: string
  code: string
  description: string | null
}

export interface SubjectCreate {
  name: string
  code: string
  description?: string | null
}

/** PUT /admin/classes/{id} — partial; a duplicate `code` is rejected with 400. */
export interface ClassRoomUpdate {
  name?: string
  code?: string
  description?: string
}

/** PUT /admin/subjects/{id} — partial; a duplicate `code` is rejected with 400. */
export interface SubjectUpdate {
  name?: string
  code?: string
  description?: string
}

/** Nested objects are REQUIRED here — there are no flat ids. */
export interface TeacherMappingOut {
  id: number
  teacher: UserOut
  subject: SubjectOut
  class_room: ClassRoomOut
}

export interface TeacherMappingCreate {
  teacher_id: number
  subject_id: number
  class_id: number
}

/**
 * Names the teacher answerable for a class as a whole.
 *
 * Deliberately has NO `subject` — that is the entire difference from
 * `TeacherMappingOut`. A subject mapping grants one period; this grants sight
 * of, and power to correct, everything every teacher files against the class.
 *
 * Authority is per class, never global: leading 9-A confers nothing over 10-B.
 * A class may have several (joint or relief arrangements), and re-posting an
 * assignment that exists returns it unchanged rather than duplicating it.
 */
export interface ClassTeacherMappingOut {
  id: number
  teacher: UserOut
  class_room: ClassRoomOut
  /** Null on rows written before the field existed. */
  assigned_at: ApiDateTime | null
}

/**
 * POST /admin/mappings/class-teacher.
 *
 * SIGNS THE TEACHER OUT. Assigning promotes them to `CLASS_TEACHER` and
 * re-issues their Firebase claims, which revokes every existing token so the
 * new navigation appears immediately instead of after the old one expires.
 * Removing their last assignment demotes them back to `TEACHER` the same way.
 */
export interface ClassTeacherMappingCreate {
  teacher_id: number
  class_id: number
}

export interface StudentEnrollmentOut {
  id: number
  student: UserOut
  class_room: ClassRoomOut
}

export interface StudentEnrollmentCreate {
  student_id: number
  class_id: number
}

// ------------------------------------------------------------- attendance

export interface AttendanceOut {
  id: number
  student_id: number
  student: UserOut | null
  class_id: number
  class_room: ClassRoomOut | null
  subject_id: number
  subject: SubjectOut | null
  /** No `teacher` object exists on this model — resolve via the directory. */
  teacher_id: number
  date: ApiDate
  status: AttendanceStatus
  remarks: string | null
  created_at: ApiDateTime
}

export interface StudentAttendanceItem {
  student_id: number
  status: AttendanceStatus
  remarks?: string | null
}

/**
 * POST /teachers/attendance is an UPSERT keyed on
 * (student_id, class_id, subject_id, date) — re-submitting a date edits it.
 */
export interface BatchAttendanceCreate {
  class_id: number
  subject_id: number
  date: ApiDate
  attendance_list: StudentAttendanceItem[]
}

/**
 * PUT /teachers/attendance/{id} — partial, and ownership-scoped: a teacher may
 * only edit records they marked themselves. `class_id` and `subject_id` are
 * NOT editable; re-post the batch to move a record.
 */
export interface AttendanceUpdate {
  status?: AttendanceStatus
  remarks?: string
  date?: ApiDate
}

// ------------------------------------------------------------------ topic

export interface TopicOut {
  id: number
  class_id: number
  class_room: ClassRoomOut | null
  subject_id: number
  subject: SubjectOut | null
  teacher_id: number
  teacher: UserOut | null
  topic_title: string
  description: string | null
  date_covered: ApiDate
  completion_percentage: number
  created_at: ApiDateTime
}

export interface TopicCreate {
  class_id: number
  subject_id: number
  topic_title: string
  description?: string | null
  date_covered?: ApiDate | null
  completion_percentage: number
}

/** PUT /teachers/topics/{id} — partial, ownership-scoped. */
export interface TopicUpdate {
  topic_title?: string
  description?: string
  date_covered?: ApiDate
  completion_percentage?: number
}

// ---------------------------------------------------------------- meeting

export interface LiveMeetingOut {
  id: number
  class_id: number
  class_room: ClassRoomOut | null
  subject_id: number
  subject: SubjectOut | null
  teacher_id: number
  teacher: UserOut | null
  title: string
  /**
   * NULL IS EXPECTED ON A 201. Meet generation is best-effort: if delegation
   * has not propagated, the teacher is outside the Workspace domain, or quota
   * is exhausted, the meeting is still persisted with no link.
   */
  meeting_link: string | null
  recording_url: string | null
  scheduled_time: ApiDateTime
  /** Free-form string, not an enum. */
  status: string
  created_at: ApiDateTime
  /** Present only when a real Google Calendar event backs this meeting. */
  google_event_id?: string | null
  google_calendar_id?: string | null
  /** Echoed back only on records created since the Meet integration landed. */
  duration_minutes?: number | null
  /**
   * Outcome of Meet link generation, so a missing link is explainable rather
   * than silent. Null on rows written before the field existed — treat that as
   * "unknown", not as a failure.
   */
  meet_status?: MeetStatus | string | null
  /** Why generation failed. Only meaningful alongside `meet_status: 'FAILED'`. */
  meet_error?: string | null
}

/**
 * MANUAL — a link was supplied by hand; SKIPPED — generation was not requested;
 * CREATED — a Meet link was generated; FAILED — generation was attempted and
 * did not work, and `meet_error` says why.
 */
export type MeetStatus = 'CREATED' | 'FAILED' | 'MANUAL' | 'SKIPPED'

export interface LiveMeetingCreate {
  class_id: number
  subject_id: number
  title: string
  /** Supplying this manually SKIPS Google Meet generation entirely. */
  meeting_link?: string | null
  recording_url?: string | null
  scheduled_time: ApiDateTime
  status: string
  /** Create a Calendar event with an attached Meet link. Backend default: true. */
  auto_create_meet?: boolean
  /** Calendar event length. Backend default: 60. */
  duration_minutes?: number
  /** Add enrolled students as attendees so they get invitations. Default: true. */
  invite_students?: boolean
}

/**
 * POST /admin/meetings — the same body plus attribution.
 *
 * `teacher_id` names the teacher the session is filed under AND whose calendar
 * the event is created on; omitting it schedules under the acting admin. That
 * second effect is the reason this is not merely a bookkeeping field: an admin
 * without Calendar delegation who leaves it blank gets a meeting with no link.
 */
export interface AdminLiveMeetingCreate extends LiveMeetingCreate {
  teacher_id?: number | null
}

/**
 * PUT /teachers/meetings/{id} — partial, ownership-scoped. Changing `title` or
 * `scheduled_time` propagates to the backing Calendar event, so invited
 * students see the change on their own calendars.
 */
export interface LiveMeetingUpdate {
  title?: string
  meeting_link?: string
  recording_url?: string
  scheduled_time?: ApiDateTime
  status?: string
  duration_minutes?: number
}

// --------------------------------------------------------------- material

export interface StudyMaterialOut {
  id: number
  class_id: number
  class_room: ClassRoomOut | null
  subject_id: number
  subject: SubjectOut | null
  teacher_id: number
  teacher: UserOut | null
  title: string
  /** Free-form string, not an enum. */
  material_type: string
  /** Absolute GCS/Drive URL or root-relative "/uploads/..." — use resolveFileUrl. */
  file_url: string
  uploaded_at: ApiDateTime
  /**
   * Which backend stored this file. Recorded per-material so GCS-era and
   * Drive-era uploads coexist and delete correctly. Null on rows written
   * before the three-way storage switch landed.
   */
  storage_provider?: StorageProvider | string | null
  /**
   * Set when the configured provider could not be used and the file landed
   * somewhere else — in practice, a cloud upload that fell back to local disk.
   * Its presence means `storage_provider` is NOT what the server was asked for.
   */
  storage_warning?: string | null
}

/** `STORAGE_PROVIDER` switch on the backend. */
export type StorageProvider = 'GCS' | 'DRIVE' | 'LOCAL'

/**
 * PUT /teachers/materials/{id} — metadata only, ownership-scoped. Replacing
 * the file itself means deleting the material and uploading again.
 */
export interface StudyMaterialUpdate {
  title?: string
  material_type?: string
}

/** multipart/form-data; the file field is named exactly `file`. */
export interface StudyMaterialCreate {
  class_id: number
  subject_id: number
  title: string
  material_type: string
  file: File
}

/**
 * POST /admin/materials — the same multipart body plus attribution.
 * Omitting `teacher_id` files the upload under the acting admin.
 */
export interface AdminStudyMaterialCreate extends StudyMaterialCreate {
  teacher_id?: number | null
}

// ------------------------------------------------------------------ grade

export interface ExamGradeOut {
  id: number
  student_id: number
  student: UserOut | null
  class_id: number
  class_room: ClassRoomOut | null
  subject_id: number
  subject: SubjectOut | null
  teacher_id: number
  teacher: UserOut | null
  exam_name: string
  marks_obtained: number
  max_marks: number
  remarks: string | null
  created_at: ApiDateTime
}

export interface GradeEntryCreate {
  student_id: number
  class_id: number
  subject_id: number
  exam_name: string
  marks_obtained: number
  max_marks: number
  remarks?: string | null
}

/**
 * PUT /teachers/grades/{id} — partial, ownership-scoped. The backend validates
 * against the MERGED record, so sending only `marks_obtained` is still checked
 * against the stored `max_marks` and 400s if it exceeds it.
 */
export interface GradeEntryUpdate {
  exam_name?: string
  marks_obtained?: number
  max_marks?: number
  remarks?: string
}

// ---------------------------------------------------------------- reports

export interface OverallStats {
  total_students: number
  total_teachers: number
  total_classes: number
  total_subjects: number
  total_materials_uploaded: number
  total_attendance_logs: number
}

export interface TeacherActivityReport {
  teacher_id: number
  teacher_name: string
  /** Counts mapping rows, not distinct classes. */
  assigned_classes_count: number
  topics_covered_count: number
  materials_uploaded_count: number
  attendance_marked_count: number
}

export interface StudentPerformanceReport {
  student_id: number
  student_name: string
  /** Falls back to the literal "Unassigned". */
  class_name: string
  /** 0–100 float; 0 also means "no records". */
  attendance_percentage: number
  /** 0–100 float; 0 also means "no exams". */
  average_grade_percentage: number
  total_exams_taken: number
}

export interface SystemMonitoringReport {
  overall_stats: OverallStats
  teacher_activity: TeacherActivityReport[]
  student_performance: StudentPerformanceReport[]
}

// ------------------------------------------------------------------- jobs

export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'

/**
 * A background job on the server.
 *
 * Job state lives in the API process's memory, which has two consequences the
 * UI must handle rather than hide: it does not survive a restart, and with
 * multiple workers a poll can land on a worker that never saw the job. Both
 * surface as a 404 from `GET /admin/jobs/{id}` — meaning "lost", not "failed".
 * Every job is a recomputation of derived data, so losing one is safe.
 */
export interface JobOut {
  job_id: string
  name: string
  status: JobStatus
  /** 0–100. Meaningful only while RUNNING. */
  percent: number
  /** Human-readable stage, e.g. "Grouping attendance". */
  message: string | null
  /** Populated only when status is FAILED. */
  error: string | null
  created_at: ApiDateTime
  started_at: ApiDateTime | null
  finished_at: ApiDateTime | null
  duration_seconds: number | null
}

/** 202 response from POST /admin/reports/monitoring/refresh. */
export interface JobAccepted extends JobOut {
  poll_url: string
}

// ------------------------------------------------------------------ health

/** GET /health/cache — reference-cache effectiveness. */
export interface CacheHealth {
  reference_cache: {
    entries: number
    hits: number
    misses: number
    /** 0–1. Below ~0.5 under real traffic means excess Firestore round trips. */
    hit_rate: number
  }
  ttl_seconds: number
  query_concurrency: number
}

// ---------------------------------------------------------------- storage

export interface StorageUploadResponse {
  filename: string | null
  content_type: string | null
  access_url: string
  /** Where the bytes ACTUALLY landed. */
  storage_provider: StorageProvider | string
  /** What the server was configured to use. A mismatch means a fallback happened. */
  requested_provider?: StorageProvider | string | null
  /** Present only on a mismatch, naming the reason the cloud upload failed. */
  warning?: string | null
}

/**
 * True when an upload silently landed somewhere other than the configured
 * provider. Older responses omit `requested_provider` entirely, and an absent
 * field must not be read as a fallback.
 */
export function didFallBack(
  result: Pick<StorageUploadResponse, 'storage_provider' | 'requested_provider'>,
): boolean {
  return (
    !!result.requested_provider && result.requested_provider !== result.storage_provider
  )
}

// ------------------------------------------------------------- timetable

/**
 * One RECURRING weekly period, not one calendar day's lesson: "7A does Maths
 * with Mr Rahman on Tuesdays, 09:00–09:45, Room 12".
 *
 * `start_time` / `end_time` are local wall-clock values in the school's
 * timezone, deliberately NOT instants — a period is at 09:00 whether or not the
 * clocks changed last weekend. Never feed them through `new Date()` expecting
 * a correct absolute time; use `ScheduledPeriod` for that.
 */
export interface TimetableEntryOut {
  id: number
  class_id: number
  class_room: ClassRoomOut | null
  subject_id: number
  subject: SubjectOut | null
  /** Null when no teacher is mapped to the subject and class. */
  teacher_id: number | null
  teacher: UserOut | null
  day_of_week: DayOfWeek
  start_time: ApiTime
  end_time: ApiTime
  room: string | null
  period_label: string | null
  /** Window the period applies over. Null `effective_to` is open-ended. */
  effective_from: ApiDate | null
  effective_to: ApiDate | null
  is_active: boolean
  created_at?: ApiDateTime | null
  updated_at?: ApiDateTime | null
}

export interface TimetableEntryCreate {
  class_id: number
  subject_id: number
  /** Omit to use whoever is already mapped to this subject and class. */
  teacher_id?: number | null
  day_of_week: DayOfWeek
  start_time: ApiTime
  end_time: ApiTime
  room?: string | null
  period_label?: string | null
  effective_from?: ApiDate | null
  effective_to?: ApiDate | null
  is_active?: boolean
}

/** Partial update. Clash detection re-runs against the merged result. */
export type TimetableEntryUpdate = Partial<TimetableEntryCreate>

export interface TimetableBulkCreate {
  /** 1–500 entries. */
  entries: TimetableEntryCreate[]
  /**
   * Wipes the existing timetable for every class named in `entries` before
   * inserting, which makes re-uploading a corrected week idempotent rather than
   * doubling it up. Destructive by design.
   */
  replace_existing?: boolean
}

/**
 * A bulk upload is deliberately partial-success: one bad row does not cost you
 * the other thirty-nine, so `skipped` must always be shown, never assumed empty.
 */
export interface TimetableBulkResult {
  created: TimetableEntryOut[]
  replaced: number
  skipped: { index: number; reason: string }[]
  detail: string
}

/**
 * A recurring entry resolved against one calendar date, with the concrete
 * instants it maps to — so the client never redoes weekday or timezone maths.
 */
export interface ScheduledPeriod {
  entry: TimetableEntryOut
  on_date: ApiDate
  starts_at: ApiDateTime
  ends_at: ApiDateTime
  /** Negative once the period has begun. Null when not computable. */
  starts_in_minutes: number | null
  is_current: boolean
}

// ------------------------------------------------------------- reminders

/**
 * GET /admin/reminders/status.
 *
 * `server_time_local` is the first thing to check when reminders arrive at the
 * wrong hour — it is the server's idea of school-local time, so a misconfigured
 * SCHOOL_TIMEZONE shows up here immediately.
 */
export interface ReminderStatus {
  enabled: boolean
  running: boolean
  timezone: string
  offsets_minutes: number[]
  scan_interval_seconds: number
  /** Anything overdue by more than this is dropped rather than sent late. */
  max_lateness_minutes: number
  remind_teachers: boolean
  mail_configured: boolean
  started_at: ApiDateTime | null
  last_run_at: ApiDateTime | null
  run_count: number
  last_error: string | null
  last_result: ReminderSweepSummary | null
  server_time_local: ApiDateTime
}

/** Result of a sweep, real or dry-run. */
export interface ReminderSweepSummary {
  due_periods: number
  recipients: number
  sent: number
  /** Claimed by an earlier sweep — the duplicate-suppression working. */
  skipped_already_sent: number
  failed: number
  dry_run: boolean
  mail_configured: boolean
  reference: ApiDateTime
  offsets: number[]
  details: {
    timetable_entry_id: number
    class: string
    subject: string
    starts_at: ApiDateTime
    minutes_before: number
    recipients: number
    sent: number
  }[]
  detail: string
  duration_seconds?: number
}

/** A row of GET /admin/reminders/log. */
export interface ReminderLogEntry {
  timetable_entry_id: number
  user_id: number
  email: string
  class_id: number
  subject_id: number
  on_date: ApiDate
  minutes_before: number
  starts_at: ApiDateTime
  claimed_at: ApiDateTime
  completed_at?: ApiDateTime | null
  status: 'SENDING' | 'SENT' | 'FAILED' | string
}

// ----------------------------------------------------------- integrations

/**
 * Shared shape of every probe in `GET /admin/integrations`.
 *
 * `detail` is written by the backend for a human to act on — it names the exact
 * misconfiguration — so the UI shows it verbatim rather than substituting a
 * generic message of its own.
 */
export interface HealthProbe {
  ok: boolean
  detail?: string | null
  /** Configuration faults found without touching the network. */
  problems?: string[] | null
}

/** GET /storage/status, and the `storage` section of the admin view. */
export interface StorageHealth extends HealthProbe {
  provider: StorageProvider | string
  /** Present for GCS. */
  bucket?: string | null
  /** Present for Drive — the nested Drive configuration is spread in. */
  destination?: 'SHARED_DRIVE' | 'FOLDER' | null
  target_name?: string | null
  local_dir?: string | null
  strict?: boolean
}

export interface DriveHealth extends HealthProbe {
  configured: boolean
  destination: 'SHARED_DRIVE' | 'FOLDER' | null
  shared_drive_id: string | null
  folder_id: string | null
  root_folder_name: string | null
  impersonating: string | null
  link_sharing: boolean
  credentials_file: string | null
  /** Set only by the live probe. */
  target_name?: string | null
}

export interface MeetHealth extends HealthProbe {
  enabled: boolean
  calendar_id: string | null
  timezone: string | null
  impersonation: boolean
  workspace_domain: string | null
  impersonation_fallback: string | null
  invite_attendees: boolean
  credentials_file: string | null
  /** Set only by the live probe. */
  acting_as?: string | null
  calendar_summary?: string | null
}

/** SMTP is reported from settings only — there is no live probe for it. */
export interface EmailHealth {
  enabled: boolean
  configured: boolean
  smtp_host: string | null
  smtp_user: string | null
}

export interface IntegrationsHealth {
  storage: StorageHealth
  /**
   * Set when USE_LOCAL_STORAGE and STORAGE_PROVIDER disagree. The backend
   * refuses to guess and reports the conflict instead of silently applying one.
   */
  storage_config_conflict: string | null
  drive: DriveHealth
  google_meet: MeetHealth
  email: EmailHealth
  /** False when `?probe=false` asked for a settings-only view. */
  probed: boolean
}

/** POST /admin/integrations/storage/test-upload — a real round trip. */
export interface StorageProbeResult {
  /** True only when the file reached the configured provider. */
  ok: boolean
  requested_provider: StorageProvider | string
  actual_provider: StorageProvider | string
  url: string
  warning?: string | null
  /** Null when `cleanup=false`; false when the probe file could not be removed. */
  cleaned_up: boolean | null
  detail: string
}

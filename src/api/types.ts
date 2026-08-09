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

export type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT'

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'

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

export interface UserOut {
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
export interface UserCreate {
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

/** PUT /admin/users/{id} — every field optional, merge semantics. */
export interface UserUpdate {
  full_name?: string
  email?: string
  is_active?: boolean
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
}

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
  storage_provider: StorageProvider | string
}

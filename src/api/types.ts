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
 * The online tuition product's shapes live next door for size only, and are
 * re-exported here so `@/api/types` stays the single import surface for the
 * whole app. See `tuition.types.ts` for the two conventions that module runs
 * on — participants are never sent, and every instant arrives twice.
 */
export * from './tuition.types'
import type { Program, TuitionAssessmentCategory } from './tuition.types'

/**
 * The school modules added in the September release — admissions, families,
 * notices, finance, live-class timing, extra classes, the calendar, homework,
 * leave, support and oversight. Next door for size, re-exported here for the
 * same reason as the tuition types: one import surface for the whole app.
 */
export * from './school.types'

/**
 * `CLASS_TEACHER` is a TEACHER with extra reach, not a separate kind of user.
 * They take periods, own subject mappings and appear on the timetable exactly
 * like a TEACHER, so anything asking "may this user own a teaching record?"
 * must accept both — see `TEACHING_ROLES` in `lib/constants`. Testing
 * `role === 'TEACHER'` is the bug this role introduces.
 *
 * `PARENT` is a guardian's OWN login, linked to one or more student profiles
 * rather than being one of them. It reaches almost nothing directly: a parent's
 * home is `GET /parent/children`, and what they may see of each child is
 * decided by that link's per-aspect flags, not by the role. The bug this one
 * introduces is an exhaustive switch — a role picker, a badge colour map, a
 * navigation table — with no branch for it, which lands every parent on
 * whatever the default case happens to do.
 */
export type UserRole = 'ADMIN' | 'CLASS_TEACHER' | 'TEACHER' | 'STUDENT' | 'PARENT'

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
  /**
   * IANA zone used to render this person's times, e.g. "Asia/Dubai".
   *
   * Only the tuition module reads it: classes there are stored as absolute
   * instants and rendered per reader, so a student in London and their teacher
   * in Dubai each see the same class on their own clock. Null means they see
   * programme time, which is right for the majority who are in it.
   */
  timezone?: string | null

  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null

  /**
   * Unique per school.
   *
   * Under the default `admission_id_mode: AUTO`, leaving this blank on
   * `POST /admin/users` gets one issued (`ADM-2026-0001`) — the same is true of
   * `employee_id`. A value you send is always kept, so a migration carrying
   * historical numbers is unaffected. Either way the RESPONSE carries what was
   * assigned: read it back rather than assuming the field is still empty.
   */
  admission_number?: string | null
  /** Unique within a class, not globally. */
  roll_number?: string | null
  admission_date?: ApiDate | null
  blood_group?: string | null
  guardian_name?: string | null
  guardian_phone?: string | null
  guardian_email?: string | null
  guardian_relation?: string | null

  /**
   * Which intake this student belongs to. Ids into the admissions module, both
   * optional — a school that has not set admissions up must still be able to
   * enroll. `POST /admin/users` fills `academic_year_id` with the current year
   * when a student is created without one, so read the response back rather
   * than assuming it stayed empty.
   */
  academic_year_id?: number | null
  /** Carries any standing fee concession — see `AdmissionCategoryOut`. */
  admission_category_id?: number | null
  /**
   * The year the student FIRST joined. Set on admission and left alone by
   * promotion, unlike `academic_year_id`. The one-time admission charge is
   * billed in this year only.
   */
  admission_year_id?: number | null

  /**
   * What the student is studying. Free text rather than an id: schools name
   * these inconsistently ("CBSE", "State Board Plus Two") and a reference
   * table nobody maintains is worse than a label. Drives the tuition library's
   * syllabus filter when that setting is on.
   */
  syllabus?: string | null
  /** e.g. Science, Commerce, Humanities. */
  academic_stream?: string | null
  /** Language of instruction. */
  medium?: string | null

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
  /**
   * Which products this account may reach. A role says what someone may do; a
   * program says where, and the backend checks both on every tuition route.
   *
   * Absent on profiles created before the tuition module existed, which read as
   * LMS-only — so treat a missing value as `['LMS']` rather than as "all".
   */
  programs?: Program[]
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
  /**
   * Defaults to `['LMS']` server-side when omitted. A tuition teacher or
   * student must be created with `['TUITION']` (or both) — without it their
   * login works and every tuition endpoint refuses them.
   */
  programs?: Program[]
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
  /** Replaces product access outright — a merge would make revoking impossible. */
  programs?: Program[]
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

  /**
   * Whether this session was asked to record itself. Null on rows written
   * before automatic recording landed, and always false-ish for a hand-entered
   * `meeting_link` — that conference is not one the LMS owns.
   */
  auto_record?: boolean | null
  /**
   * Where the recording is in its lifecycle. Null means "unknown", i.e. a row
   * written before the field existed — not a failure.
   */
  recording_status?: RecordingStatus | string | null
  /** Why the status is anything other than STORED. */
  recording_error?: string | null
  recording_drive_file_id?: string | null
  recording_stored_at?: ApiDateTime | null
  /**
   * Every segment filed for this session. `recording_url` points at the first
   * of them; a class recorded in several parts keeps the rest here.
   */
  recording_files?: RecordingFile[] | null
}

/**
 * MANUAL — a link was supplied by hand; SKIPPED — generation was not requested;
 * CREATED — a Meet link was generated; FAILED — generation was attempted and
 * did not work, and `meet_error` says why.
 */
export type MeetStatus = 'CREATED' | 'FAILED' | 'MANUAL' | 'SKIPPED'

/**
 * Lifecycle of a session's recording.
 *
 * NOT_REQUESTED — recording was switched off, or the link was pasted in by
 * hand; ARMED — Meet will record the conference on its own; ARM_FAILED —
 * arming did not work, but the session is still swept in case the teacher
 * records it manually; WAITING — the class is over and Meet has not published
 * the file yet; STORED — the video is in the school Drive and `recording_url`
 * points at it; UNAVAILABLE — nothing was ever published and the backend has
 * stopped looking; FAILED — a recording exists but could not be filed, and
 * `recording_error` says why.
 */
export type RecordingStatus =
  | 'NOT_REQUESTED'
  | 'ARMED'
  | 'ARM_FAILED'
  | 'WAITING'
  | 'STORED'
  | 'UNAVAILABLE'
  | 'FAILED'

/** One filed segment of a session's recording. */
export interface RecordingFile {
  drive_file_id: string | null
  web_view_link: string | null
  name: string | null
  size_bytes: number | null
  started_at: ApiDateTime | null
  ended_at: ApiDateTime | null
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
  /**
   * Arm the generated Meet conference to record itself, and file the video into
   * the school Drive once the class is over. Backend default: true.
   *
   * Ignored when `meeting_link` is supplied: a hand-entered link belongs to a
   * conference the LMS cannot configure.
   */
  auto_record?: boolean
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
  /** Null on a tuition record, which belongs to one student, not a class. */
  class_id: number | null
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

// ------------------------------------------------------------ recordings

/**
 * GET /admin/recordings/status.
 *
 * `meet_problems` is the first thing to read when a finished class has no
 * video: it names the missing piece of the Meet setup without touching the
 * network. Recording rides on its own delegation grant, so Meet links can work
 * perfectly while this is broken.
 */
export interface RecordingSchedulerStatus {
  enabled: boolean
  running: boolean
  /** MOVE into the Shared Drive, COPY there, or LINK the teacher's original. */
  transfer_mode: 'MOVE' | 'COPY' | 'LINK' | string
  destination_folder: string
  share_with_students: boolean
  /** Meet needs minutes to publish a file, so the sweep waits this long. */
  harvest_delay_minutes: number
  scan_interval_seconds: number
  /** A session with no recording after this is marked UNAVAILABLE. */
  give_up_after_hours: number
  drive_configured: boolean
  meet_problems: string[]
  started_at: ApiDateTime | null
  last_run_at: ApiDateTime | null
  run_count: number
  last_error: string | null
  last_result: RecordingSweepSummary | null
}

/** Result of a sweep, real or dry-run. */
export interface RecordingSweepSummary {
  due_meetings: number
  /** Recordings filed — or, on a dry run, that would be filed. */
  stored: number
  waiting: number
  unavailable: number
  failed: number
  dry_run: boolean
  transfer_mode: string
  reference: ApiDateTime
  details: RecordingSweepDetail[]
  detail: string
}

/**
 * One session's outcome inside a sweep. `status` is a `RecordingStatus` except
 * on a dry run, which reports `WOULD_STORE` for anything ready to file.
 */
export interface RecordingSweepDetail {
  meeting_id: number
  title: string
  status: RecordingStatus | 'WOULD_STORE' | string | null
  detail: string
  recording_url?: string | null
  /** Segments filed for this session by this sweep. */
  transferred: number
}

/**
 * A row of GET /admin/recordings/log — one claimed (meeting, Meet recording)
 * pair. The claim is written BEFORE the transfer, so a row with no
 * `finished_at` is a move that never completed rather than one that never ran.
 */
export interface RecordingLogEntry {
  meeting_id: number
  /** Meet's own resource name for the recording — the deduplication key. */
  recording_name: string
  claimed_at: ApiDateTime
  finished_at?: ApiDateTime | null
  status: 'CLAIMED' | 'STORED' | 'FAILED' | string
  mode?: string | null
  drive_file_id?: string | null
  web_view_link?: string | null
  /** How many students were granted read access. */
  shared_with?: number | null
  /** Filed, but not the way that was asked for — e.g. copied instead of moved. */
  warning?: string | null
  error?: string | null
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

/**
 * The `meet_recording` section of `GET /admin/integrations`.
 *
 * Reported separately from `google_meet` because it depends on its own API and
 * its own delegation scopes: a school can create perfectly good Meet links and
 * still be unable to record a single class.
 */
export interface MeetRecordingHealth extends HealthProbe {
  enabled: boolean
  transfer_mode: string
  destination_folder: string
  share_with_students: boolean
  harvest_delay_minutes: number
  scan_interval_seconds: number
  give_up_after_hours: number
  credentials_file: string | null
  /** Email and numeric client ID — the value the delegation form asks for. */
  service_account?: { client_email?: string | null; client_id?: string | null } | null
  required_scopes: string[]
  /** Which scope set actually authenticated, per purpose. Live probe only. */
  granted_scopes?: Record<string, string[]> | null
  /** Set only by the live probe. */
  acting_as?: string | null
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
  /**
   * Automatic class recording — its own API and its own delegation grant.
   *
   * Optional because a backend older than the recording feature omits the
   * section entirely, and a diagnostics page that white-screens against a
   * lagging deployment is worse than one that shows a card less.
   */
  meet_recording?: MeetRecordingHealth
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

// ------------------------------------------------------------------- exams

/**
 * The exam module. Mirrors `app/schemas/exam.py` and
 * `app/schemas/report_card.py`.
 *
 * Three audiences read an exam and they are NOT served the same document:
 * staff get `ExamOut` (answer key included), a student sitting the paper gets
 * `StudentExamOut` with the key blanked, and a student reading a published
 * result gets the same type with `correct_answer` / `answer_explanation`
 * filled in. Never render an `ExamOut` on a student screen.
 */

/** Fixed at creation — it decides what a submission even is. */
export type ExamMode = 'ONLINE' | 'OFFLINE'

/** The lifecycle a teacher controls by hand. Separate from the clock. */
export type ExamStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED'

/** Where the clock sits. Computed server-side, never stored. */
export type ExamWindowState = 'NOT_OPEN' | 'OPEN' | 'GRACE' | 'CLOSED'

export type QuestionType =
  | 'MCQ'
  | 'MULTI_SELECT'
  | 'TRUE_FALSE'
  | 'SHORT_ANSWER'
  | 'LONG_ANSWER'
  | 'NUMERIC'
  | 'FILE_UPLOAD'

export type GradingScheme = 'MARKS' | 'GRADE'

export type SubmissionStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'EVALUATED' | 'MISSED'

/** One letter grade and the percentage at which it starts. Only the floor is stored. */
export interface GradeBand {
  grade: string
  min_percentage: number
  description?: string | null
}

export interface QuestionOption {
  /** "A", "B", ... or "TRUE"/"FALSE". Compared case-insensitively server-side. */
  key: string
  text: string
}

/**
 * The answer key value, shaped by question type: an option key (or a list of
 * keys for MULTI_SELECT) for choice questions, a string or list of accepted
 * wordings for SHORT_ANSWER, a number for NUMERIC, null where no key applies.
 */
export type AnswerValue = string | number | string[] | null

/** A question as the setter writes it. Send `id` back to keep an existing question. */
export interface ExamQuestionIn {
  id?: number | null
  order?: number | null
  question_type: QuestionType
  text: string
  marks: number
  options?: QuestionOption[]
  correct_answer?: AnswerValue
  tolerance?: number | null
  answer_explanation?: string | null
  required?: boolean
  allow_attachments?: boolean
}

/** A question as staff see it: the key included. */
export interface ExamQuestionOut {
  id: number
  order: number
  question_type: QuestionType
  text: string
  marks: number
  options: QuestionOption[]
  correct_answer: AnswerValue
  tolerance: number | null
  answer_explanation: string | null
  required: boolean
  allow_attachments: boolean
}

/** A question as a student sees it. Key fields are null until results are published. */
export interface StudentQuestionOut {
  id: number
  order: number
  question_type: QuestionType
  text: string
  marks: number
  options: QuestionOption[]
  required: boolean
  allow_attachments: boolean
  correct_answer: AnswerValue
  answer_explanation: string | null
}

interface ExamRules {
  grading_scheme?: GradingScheme
  max_marks?: number | null
  pass_marks?: number | null
  grade_bands?: GradeBand[]
  duration_minutes?: number | null
  /** Minutes past the deadline a hand-in is still accepted, flagged late. */
  upload_grace_minutes?: number
  late_submission_allowed?: boolean
  shuffle_questions?: boolean
  auto_grade_objective?: boolean
  max_upload_files?: number
}

/** POST /exams. `teacher_id` is for an admin filing on a teacher's behalf. */
export interface ExamCreate extends ExamRules {
  class_id: number
  subject_id: number
  title: string
  mode: ExamMode
  starts_at: ApiDateTime
  ends_at: ApiDateTime
  description?: string | null
  instructions?: string | null
  status?: ExamStatus
  teacher_id?: number | null
  questions?: ExamQuestionIn[]
}

/**
 * PUT /exams/{id} — partial. `mode` cannot change; questions go through their
 * own endpoint. `grading_scheme`, `max_marks` and `pass_marks` are refused
 * with 409 once any script has been handed in.
 */
export interface ExamUpdate {
  title?: string
  description?: string | null
  instructions?: string | null
  status?: ExamStatus
  teacher_id?: number
  starts_at?: ApiDateTime
  ends_at?: ApiDateTime
  duration_minutes?: number
  upload_grace_minutes?: number
  late_submission_allowed?: boolean
  grading_scheme?: GradingScheme
  max_marks?: number
  pass_marks?: number
  grade_bands?: GradeBand[]
  shuffle_questions?: boolean
  auto_grade_objective?: boolean
  max_upload_files?: number
}

/** PUT /exams/{id}/questions — replaces the whole form. Refused once scripts are in. */
export interface QuestionFormUpdate {
  questions: ExamQuestionIn[]
}

export interface AnswerKeyItem {
  question_id: number
  correct_answer?: AnswerValue
  tolerance?: number | null
  answer_explanation?: string | null
}

/** PUT /exams/{id}/answer-key. `regrade` re-marks every handed-in script. */
export interface AnswerKeyUpdate {
  answers: AnswerKeyItem[]
  regrade?: boolean
}

/** POST /exams/{id}/concessions. Zero minutes withdraws a concession. */
export interface TimeConcessionGrant {
  student_id: number
  extra_minutes: number
  reason?: string | null
}

/** The staff view. Carries the answer key. */
export interface ExamOut {
  id: number
  /**
   * Which product set this paper: `LMS` for a class exam, `TUITION` for one
   * set for a single student on a one-to-one arrangement. Papers written
   * before tuition existed carry no value server-side and read as `LMS`,
   * which is what they are.
   */
  program: Program
  category: TuitionAssessmentCategory
  /**
   * The one student a tuition assessment is set for. Null on a class exam,
   * whose roster comes from the class instead.
   */
  student_id: number | null
  enrollment_id: number | null
  /**
   * Null on a tuition assessment — it is set for a student, not a class.
   * `ExamCreate` still requires one, because the LMS route that takes it
   * genuinely does.
   */
  class_id: number | null
  class_room: ClassRoomOut | null
  subject_id: number
  subject: SubjectOut | null
  teacher_id: number
  teacher: UserOut | null
  created_by: number | null
  title: string
  description: string | null
  instructions: string | null
  mode: ExamMode
  status: ExamStatus
  window_state: ExamWindowState
  grading_scheme: GradingScheme
  max_marks: number
  pass_marks: number | null
  grade_bands: GradeBand[]
  starts_at: ApiDateTime
  ends_at: ApiDateTime
  duration_minutes: number | null
  upload_grace_minutes: number
  late_submission_allowed: boolean
  /** student id (as a string key) -> extra minutes. */
  time_concessions: Record<string, number>
  questions: ExamQuestionOut[]
  question_count: number
  /** What the form adds up to — shown beside `max_marks` so a mismatch is visible. */
  questions_total_marks: number
  answer_key_complete: boolean
  shuffle_questions: boolean
  auto_grade_objective: boolean
  question_paper_url: string | null
  question_paper_provider: string | null
  question_paper_warning: string | null
  max_upload_files: number
  results_published: boolean
  results_published_at: ApiDateTime | null
  created_at: ApiDateTime
  updated_at: ApiDateTime | null
}

/** The student view, with the timing resolved for THIS student. */
export interface StudentExamOut {
  id: number
  program: Program
  category: TuitionAssessmentCategory
  enrollment_id: number | null
  /** Null on a tuition assessment — set for this student, not for a class. */
  class_id: number | null
  class_room: ClassRoomOut | null
  subject_id: number
  subject: SubjectOut | null
  teacher: UserOut | null
  title: string
  description: string | null
  instructions: string | null
  mode: ExamMode
  status: ExamStatus
  window_state: ExamWindowState
  grading_scheme: GradingScheme
  max_marks: number
  pass_marks: number | null
  starts_at: ApiDateTime
  ends_at: ApiDateTime
  /** The last moment a hand-in of theirs is accepted: ends_at + concession + grace. */
  closes_at: ApiDateTime
  duration_minutes: number | null
  extra_time_minutes: number
  upload_grace_minutes: number
  late_submission_allowed: boolean
  question_paper_url: string | null
  max_upload_files: number
  /** Empty in a listing and before the window opens. */
  questions: StudentQuestionOut[]
  question_count: number
  results_published: boolean
  submission_status: SubmissionStatus | null
  submitted_at: ApiDateTime | null
  expires_at: ApiDateTime | null
  can_start: boolean
  can_submit: boolean
}

export interface AnswerIn {
  question_id: number
  answer?: AnswerValue
  attachments?: string[]
}

export interface AnswerSaveIn {
  answers: AnswerIn[]
}

export interface SubmitIn {
  answers?: AnswerIn[]
}

export interface AnswerOut {
  question_id: number
  answer: AnswerValue
  attachments: string[]
}

export interface AttachmentOut {
  file_url: string
  filename: string | null
  provider: string | null
  storage_warning: string | null
  uploaded_at: ApiDateTime | null
  question_id: number | null
}

export interface QuestionScoreOut {
  question_id: number
  marks_awarded: number
  max_marks: number | null
  /** True when the answer key decided this line rather than a person. */
  auto: boolean
  remarks: string | null
}

/** One script, as staff read it during valuation. */
export interface SubmissionOut {
  id: string
  exam_id: number
  student_id: number
  student: UserOut | null
  /** Null when the script is for a tuition assessment. */
  class_id: number | null
  subject_id: number
  status: SubmissionStatus
  started_at: ApiDateTime | null
  submitted_at: ApiDateTime | null
  expires_at: ApiDateTime | null
  is_late: boolean
  late_by_minutes: number
  answers: AnswerOut[]
  attachments: AttachmentOut[]
  question_scores: QuestionScoreOut[]
  marks_obtained: number | null
  percentage: number | null
  grade: string | null
  passed: boolean | null
  auto_graded_marks: number | null
  evaluator_remarks: string | null
  evaluated_by: number | null
  evaluator: UserOut | null
  evaluated_at: ApiDateTime | null
  created_at: ApiDateTime | null
  updated_at: ApiDateTime | null
}

/** A student's own script. Valuation fields are null until results are published. */
export interface StudentSubmissionOut {
  id: string
  exam_id: number
  status: SubmissionStatus
  started_at: ApiDateTime | null
  submitted_at: ApiDateTime | null
  expires_at: ApiDateTime | null
  is_late: boolean
  answers: AnswerOut[]
  attachments: AttachmentOut[]
  results_published: boolean
  marks_obtained: number | null
  max_marks: number | null
  percentage: number | null
  grade: string | null
  passed: boolean | null
  evaluator_remarks: string | null
  question_scores: QuestionScoreOut[]
}

export interface QuestionScoreIn {
  question_id: number
  marks_awarded: number
  remarks?: string | null
}

/**
 * POST /exams/{id}/submissions/{student}/evaluate. Under MARKS send
 * `question_scores` (totalled server-side) or a flat `marks_obtained`; under
 * GRADE send `grade`, which must be one of the exam's own bands.
 */
export interface EvaluationIn {
  question_scores?: QuestionScoreIn[]
  marks_obtained?: number | null
  grade?: string | null
  remarks?: string | null
}

export interface ResultsPublished {
  exam_id: number
  published: number
  skipped_unevaluated: number
  grade_rows_written: number
  message: string
}

export interface ExamStats {
  exam_id: number
  title: string
  /** Null on a tuition assessment. */
  class_id: number | null
  /** Students entitled to sit it: the class roster, or 1 for tuition. */
  enrolled_students: number
  started: number
  submitted: number
  evaluated: number
  missing: number
  late: number
  average_percentage: number | null
  highest_percentage: number | null
  lowest_percentage: number | null
  pass_count: number | null
  fail_count: number | null
  results_published: boolean
}

// ------------------------------------------------------------ report cards

export interface ReportCardExamLine {
  exam_id: number
  title: string
  mode: string | null
  conducted_on: ApiDateTime | null
  grading_scheme: string | null
  marks_obtained: number | null
  max_marks: number | null
  percentage: number | null
  grade: string | null
  passed: boolean | null
  /** The student never handed in. Zeroed only if the card counts missing as zero. */
  missed: boolean
  remarks: string | null
}

export interface ReportCardSubjectLine {
  subject_id: number
  subject_name: string | null
  subject_code: string | null
  exams: ReportCardExamLine[]
  total_marks: number
  total_max_marks: number
  percentage: number | null
  grade: string | null
  exams_counted: number
  exams_missed: number
  teacher_remarks: string | null
}

/** POST /report-cards/generate. `include_rank` needs the whole class (empty `student_ids`). */
export interface ReportCardGenerate {
  class_id: number
  title: string
  student_ids?: number[]
  exam_ids?: number[]
  from_date?: ApiDateTime | null
  to_date?: ApiDateTime | null
  published_results_only?: boolean
  count_missing_as_zero?: boolean
  grade_bands?: GradeBand[]
  include_attendance?: boolean
  include_rank?: boolean
  remarks?: string | null
  publish?: boolean
}

/** PUT /report-cards/{id} — the parts a human owns. Marks are a snapshot. */
export interface ReportCardUpdate {
  remarks?: string
  title?: string
  is_published?: boolean
  /** Keyed by subject id as a string. */
  subject_remarks?: Record<string, string>
}

export interface ReportCardOut {
  id: string
  student_id: number
  student: UserOut | null
  /**
   * `LMS` for a class card, `TUITION` for one spanning a student's one-to-one
   * subjects. A tuition card carries no rank or class size — a one-to-one
   * student has no cohort.
   */
  program: Program
  /**
   * Null on a tuition card: a one-to-one student is in no class. School cards
   * always carry one, so a screen that groups by class should filter these out
   * rather than bucket them under "null".
   */
  class_id: number | null
  class_room: ClassRoomOut | null
  title: string
  generated_by: number | null
  generated_at: ApiDateTime
  from_date: ApiDateTime | null
  to_date: ApiDateTime | null
  subjects: ReportCardSubjectLine[]
  total_marks: number
  total_max_marks: number
  overall_percentage: number
  overall_grade: string | null
  exams_counted: number
  exams_missed: number
  attendance_percentage: number | null
  rank: number | null
  class_size: number | null
  remarks: string | null
  is_published: boolean
  published_at: ApiDateTime | null
}

export interface ReportCardBatch {
  class_id: number
  generated: number
  skipped: number
  published: boolean
  cards: ReportCardOut[]
  warnings: string[]
}

import { cleanParams, del, delWithBody, get, post, put } from './client'
import type {
  AdminLiveMeetingCreate,
  AdminStudyMaterialCreate,
  ApiDate,
  ClassRoomCreate,
  ClassRoomOut,
  ClassRoomUpdate,
  CredentialsIssued,
  GenerateCredentialsRequest,
  IntegrationsHealth,
  JobAccepted,
  JobOut,
  LiveMeetingOut,
  LiveMeetingUpdate,
  ReminderLogEntry,
  ReminderStatus,
  ReminderSweepSummary,
  ScheduledPeriod,
  StorageProbeResult,
  StudentEnrollmentCreate,
  StudentEnrollmentOut,
  StudyMaterialOut,
  StudyMaterialUpdate,
  SubjectCreate,
  SubjectOut,
  SubjectUpdate,
  SystemMonitoringReport,
  TeacherMappingCreate,
  TeacherMappingOut,
  TimetableBulkCreate,
  TimetableBulkResult,
  TimetableEntryCreate,
  TimetableEntryOut,
  TimetableEntryUpdate,
  UserCreate,
  UserDeleted,
  UserOut,
  UserRole,
  UserUpdate,
} from './types'

export const adminApi = {
  listUsers: (role?: UserRole) =>
    get<UserOut[]>('/admin/users', { params: cleanParams({ role }) }),

  /**
   * `email` may be omitted — the server derives it from `full_name`. The UI
   * never sends a password; credentials come from `generateCredentials`.
   */
  createUser: (body: UserCreate) => post<UserOut>('/admin/users', body),

  /**
   * Issues a fresh password, emails it to the user, and returns it once.
   *
   * Also reactivates a deactivated account — fresh credentials on a disabled
   * user would otherwise still be unable to sign in — so callers must refetch
   * the row rather than assume `is_active` is unchanged.
   *
   * A 503 means Firebase Auth was unreachable and nothing was modified, so a
   * retry is safe.
   */
  generateCredentials: (userId: number, options: GenerateCredentialsRequest = {}) =>
    post<CredentialsIssued>(`/admin/users/${userId}/generate-credentials`, {
      send_email: options.send_email ?? true,
      revoke_sessions: options.revoke_sessions ?? true,
    }),

  /** Merge semantics — only the keys sent are written. */
  updateUser: (userId: number, body: UserUpdate) => put<UserOut>(`/admin/users/${userId}`, body),

  /**
   * Soft delete — sets `is_active: false`, disables the linked Firebase account
   * and revokes its sessions. History keeps resolving, and `reactivateUser`
   * fully reverses it.
   *
   * Returns 200 WITH A BODY. This used to be a bare 204, so anything branching
   * on the status code rather than the response needs to read `mode` instead.
   */
  deactivateUser: (userId: number) => delWithBody<UserDeleted>(`/admin/users/${userId}`),

  /**
   * Irreversible. Erases the profile AND the Firebase Auth account.
   *
   * Refuses with 409 while any record still references the user, listing what
   * and how many. `force` deletes those records too — enrollments, attendance,
   * grades, meetings, materials, timetable entries — which leaves real gaps in
   * historical reports. That is why it is neither the default nor silent.
   *
   * Also 400s on deleting your own account, and 409s on the last active admin.
   */
  deleteUserPermanently: (userId: number, force = false) =>
    delWithBody<UserDeleted>(`/admin/users/${userId}`, {
      params: cleanParams({ permanent: true, force: force || undefined }),
    }),

  /** Re-enables a deactivated account and its Firebase credential. */
  reactivateUser: (userId: number) => post<UserOut>(`/admin/users/${userId}/reactivate`),

  listClasses: () => get<ClassRoomOut[]>('/admin/classes'),
  createClass: (body: ClassRoomCreate) => post<ClassRoomOut>('/admin/classes', body),
  updateClass: (classId: number, body: ClassRoomUpdate) =>
    put<ClassRoomOut>(`/admin/classes/${classId}`, body),

  /**
   * Hard delete, guarded. Without `force` a referenced class 409s and the
   * error carries the blocking counts. With `force` every enrollment,
   * mapping, attendance record, topic, meeting, material and grade that
   * points at the class is deleted first — irreversible.
   */
  deleteClass: (classId: number, force = false) =>
    del(`/admin/classes/${classId}`, { params: cleanParams({ force: force || undefined }) }),

  listSubjects: () => get<SubjectOut[]>('/admin/subjects'),
  createSubject: (body: SubjectCreate) => post<SubjectOut>('/admin/subjects', body),
  updateSubject: (subjectId: number, body: SubjectUpdate) =>
    put<SubjectOut>(`/admin/subjects/${subjectId}`, body),

  /** Same 409-then-`force` contract as `deleteClass`. */
  deleteSubject: (subjectId: number, force = false) =>
    del(`/admin/subjects/${subjectId}`, { params: cleanParams({ force: force || undefined }) }),

  listMappings: () => get<TeacherMappingOut[]>('/admin/mappings/teacher-subject-class'),
  /** Duplicates return the EXISTING row, still with status 201. */
  createMapping: (body: TeacherMappingCreate) =>
    post<TeacherMappingOut>('/admin/mappings/teacher-subject-class', body),

  /** Unguarded — records the teacher already logged are left intact. */
  deleteMapping: (mappingId: number) =>
    del(`/admin/mappings/teacher-subject-class/${mappingId}`),

  listEnrollments: () => get<StudentEnrollmentOut[]>('/admin/enrollments'),
  /** Duplicates return the EXISTING row, still with status 201. */
  createEnrollment: (body: StudentEnrollmentCreate) =>
    post<StudentEnrollmentOut>('/admin/enrollments', body),

  /** Unguarded — attendance and grade history for the student is preserved. */
  deleteEnrollment: (enrollmentId: number) => del(`/admin/enrollments/${enrollmentId}`),

  // ------------------------------------------------------------- meetings
  //
  // The teacher endpoints filter on `teacher_id == current_user.id`, so an
  // admin calling those legitimately sees nothing. These are the system-wide
  // equivalents, and they can act on any teacher's records.

  /**
   * Every meeting across all teachers, newest first.
   *
   * The filter params are server-side list comprehensions over the same full
   * fetch, exactly as on the teacher routes, so we never send them — one
   * unfiltered cache entry filters instantly on the client.
   */
  listMeetings: () => get<LiveMeetingOut[]>('/admin/meetings'),

  /**
   * `teacher_id` files the session under that teacher AND creates the Calendar
   * event on THEIR calendar. Omitting it schedules under the acting admin,
   * whose calendar may not be delegated — which is the usual reason an admin's
   * own meeting comes back with `meet_status: 'FAILED'`.
   *
   * As on the teacher route, a 201 with a null `meeting_link` is a success.
   */
  createMeeting: (body: AdminLiveMeetingCreate) => post<LiveMeetingOut>('/admin/meetings', body),

  updateMeeting: (meetingId: number, body: LiveMeetingUpdate) =>
    put<LiveMeetingOut>(`/admin/meetings/${meetingId}`, body),

  /**
   * Retries Meet generation for a meeting saved without a link — the repair
   * path for sessions scheduled while Calendar was misconfigured.
   *
   * 400 if the meeting already has a link or has no scheduled time; 502 if
   * generation failed again, with the reason as the detail. The 502 still
   * writes `meet_status: 'FAILED'` server-side, so refetch either way.
   */
  regenerateMeetingLink: (meetingId: number) =>
    post<LiveMeetingOut>(`/admin/meetings/${meetingId}/regenerate-link`),

  /** Also deletes the Calendar event, which notifies invited students. */
  deleteMeeting: (meetingId: number) => del(`/admin/meetings/${meetingId}`),

  // ------------------------------------------------------------ materials

  listMaterials: () => get<StudyMaterialOut[]>('/admin/materials'),

  /** multipart/form-data; the file field must be named exactly `file`. */
  uploadMaterial: (body: AdminStudyMaterialCreate, onProgress?: (percent: number) => void) => {
    const form = new FormData()
    form.append('class_id', String(body.class_id))
    form.append('subject_id', String(body.subject_id))
    form.append('title', body.title)
    form.append('material_type', body.material_type)
    if (body.teacher_id != null) form.append('teacher_id', String(body.teacher_id))
    form.append('file', body.file)

    return post<StudyMaterialOut>('/admin/materials', form, {
      timeout: 120_000,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
      },
    })
  },

  /** Metadata only — the stored file cannot be swapped, only re-uploaded. */
  updateMaterial: (materialId: number, body: StudyMaterialUpdate) =>
    put<StudyMaterialOut>(`/admin/materials/${materialId}`, body),

  /** Same `keep_file` escape hatch as the teacher route. */
  deleteMaterial: (materialId: number, keepFile = false) =>
    del(`/admin/materials/${materialId}`, {
      params: cleanParams({ keep_file: keepFile || undefined }),
    }),

  // ------------------------------------------------------------ timetable

  /**
   * Every period, ordered the way a printed timetable reads: weekday, then
   * start time. Filters are applied client-side for the same reason as
   * everywhere else, but `include_inactive` is a real server-side difference —
   * paused periods are omitted unless asked for.
   */
  listTimetable: (includeInactive = false) =>
    get<TimetableEntryOut[]>('/admin/timetable', {
      params: cleanParams({ include_inactive: includeInactive || undefined }),
    }),

  /**
   * 409 if the period double-books the class or the teacher, with the clashing
   * entries named in the detail. Rooms are deliberately NOT checked — schools
   * reuse room labels loosely — so a room clash will not stop a write.
   *
   * `allowConflicts` overrides the refusal and schedules anyway.
   */
  createTimetableEntry: (body: TimetableEntryCreate, allowConflicts = false) =>
    post<TimetableEntryOut>('/admin/timetable', body, {
      params: cleanParams({ allow_conflicts: allowConflicts || undefined }),
    }),

  /**
   * A whole week or term in one request, with per-row partial success: rows
   * that fail come back in `skipped` and the rest are still created.
   *
   * `replace_existing` wipes the current timetable for every class named in the
   * payload first, which is what makes re-uploading a corrected schedule
   * idempotent instead of doubling it.
   */
  bulkCreateTimetable: (body: TimetableBulkCreate, allowConflicts = false) =>
    post<TimetableBulkResult>('/admin/timetable/bulk', body, {
      params: cleanParams({ allow_conflicts: allowConflicts || undefined }),
      timeout: 120_000,
    }),

  /** Clash detection ignores the entry being edited, so nudging it is fine. */
  updateTimetableEntry: (entryId: number, body: TimetableEntryUpdate, allowConflicts = false) =>
    put<TimetableEntryOut>(`/admin/timetable/${entryId}`, body, {
      params: cleanParams({ allow_conflicts: allowConflicts || undefined }),
    }),

  /** Hard delete. To pause a period instead, update it with `is_active: false`. */
  deleteTimetableEntry: (entryId: number) => del(`/admin/timetable/${entryId}`),

  /** One class's periods resolved against a date, with absolute instants. */
  classDaySchedule: (classId: number, onDate?: ApiDate) =>
    get<ScheduledPeriod[]>(`/admin/timetable/class/${classId}/day`, {
      params: cleanParams({ on_date: onDate }),
    }),

  // ------------------------------------------------------------ reminders

  reminderStatus: () => get<ReminderStatus>('/admin/reminders/status'),

  /**
   * What the next sweep WOULD send. Claims nothing and delivers nothing, so it
   * is safe to call repeatedly — the way to check a timetable edit before the
   * scheduler acts on it.
   */
  previewReminders: () => get<ReminderSweepSummary>('/admin/reminders/preview', { timeout: 60_000 }),

  /**
   * Runs a sweep now instead of waiting for the next tick. Returns a job to
   * poll at `job()`.
   *
   * Cannot double-email: every reminder is claimed by an atomic Firestore
   * create keyed on (entry, date, offset, recipient), so an already-sent one is
   * skipped whoever triggers it.
   */
  runReminders: () => post<JobAccepted>('/admin/reminders/run'),

  reminderLog: (limit = 50, userId?: number) =>
    get<ReminderLogEntry[]>('/admin/reminders/log', {
      params: cleanParams({ limit, user_id: userId }),
    }),

  // --------------------------------------------------------- integrations

  /**
   * Health of Drive, Storage, Meet and SMTP. Every section carries a `detail`
   * naming the exact misconfiguration; no secrets are returned.
   *
   * `probe: false` skips the live reachability checks and reports settings
   * only — much faster, and the right choice for a background refresh.
   */
  integrations: (probe = true) =>
    get<IntegrationsHealth>('/admin/integrations', {
      params: cleanParams({ probe: probe ? undefined : false }),
      timeout: 30_000,
    }),

  /**
   * Writes a probe file, reports where it landed, then deletes it.
   *
   * This is the difference between "Drive is visible" and "Drive accepts our
   * uploads" — `integrations` only proves the former.
   */
  storageTestUpload: (cleanup = true) =>
    post<StorageProbeResult>('/admin/integrations/storage/test-upload', undefined, {
      params: cleanParams({ cleanup: cleanup ? undefined : false }),
      timeout: 60_000,
    }),

  /**
   * Served from a server-side cache (default 5 minutes), so the common case is
   * a few milliseconds. `refresh` bypasses the cache and recomputes inline —
   * still fast now that the report reads each collection once, but it is the
   * slowest endpoint in the API, hence the longer timeout.
   *
   * For a recompute that should not block the user, prefer
   * `startMonitoringRefresh` and poll the job.
   */
  monitoringReport: (refresh = false) =>
    get<SystemMonitoringReport>('/admin/reports/monitoring', {
      params: cleanParams({ refresh: refresh || undefined }),
      timeout: 60_000,
    }),

  /**
   * Rebuilds the report in the background. Returns 202 immediately.
   *
   * Asking for a refresh while one is already running returns that SAME job
   * rather than starting a second one, so a caller cannot stampede the server
   * by clicking twice.
   */
  startMonitoringRefresh: () =>
    post<JobAccepted>('/admin/reports/monitoring/refresh'),

  /** 404 here means the job was lost (restart or another worker), not that it failed. */
  job: (jobId: string) => get<JobOut>(`/admin/jobs/${jobId}`),

  recentJobs: (limit = 20) => get<JobOut[]>('/admin/jobs', { params: cleanParams({ limit }) }),
}

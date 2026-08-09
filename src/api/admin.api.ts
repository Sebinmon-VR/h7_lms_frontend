import { cleanParams, del, get, post, put } from './client'
import type {
  ClassRoomCreate,
  ClassRoomOut,
  ClassRoomUpdate,
  CredentialsIssued,
  GenerateCredentialsRequest,
  JobAccepted,
  JobOut,
  StudentEnrollmentCreate,
  StudentEnrollmentOut,
  SubjectCreate,
  SubjectOut,
  SubjectUpdate,
  SystemMonitoringReport,
  TeacherMappingCreate,
  TeacherMappingOut,
  UserCreate,
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
   * 204. Soft delete only — sets `is_active: false`, disables the linked
   * Firebase account and revokes its sessions. History keeps resolving, and
   * `reactivateUser` fully reverses it.
   */
  deactivateUser: (userId: number) => del(`/admin/users/${userId}`),

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

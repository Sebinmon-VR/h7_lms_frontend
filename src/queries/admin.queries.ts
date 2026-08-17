import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { adminApi } from '@/api/admin.api'
import { storageApi } from '@/api/storage.api'
import { ApiError } from '@/api/errors'
import type {
  AdminLiveMeetingCreate,
  AdminStudyMaterialCreate,
  ClassRoomCreate,
  ClassRoomOut,
  ClassRoomUpdate,
  ClassTeacherMappingCreate,
  GenerateCredentialsRequest,
  JobStatus,
  LiveMeetingOut,
  LiveMeetingUpdate,
  StudentEnrollmentCreate,
  StudentEnrollmentOut,
  StudyMaterialOut,
  StudyMaterialUpdate,
  SubjectCreate,
  SubjectOut,
  SubjectUpdate,
  TeacherMappingCreate,
  TeacherMappingOut,
  TimetableBulkCreate,
  TimetableEntryCreate,
  TimetableEntryUpdate,
  UserCreate,
  UserOut,
  UserRole,
  UserUpdate,
} from '@/api/types'
import { ROLE_LABEL, isTeachingRole } from '@/lib/constants'
import { STALE, qk } from './keys'
import { markMonitoringStale } from './query-client'

// ------------------------------------------------------------------ reads

export function useUsers(role?: UserRole) {
  return useQuery({
    queryKey: qk.admin.users(role),
    queryFn: () => adminApi.listUsers(role),
    staleTime: STALE.reference,
  })
}

/**
 * Everyone who may own a teaching record — both `TEACHER` and `CLASS_TEACHER`.
 *
 * This exists because `/admin/users?role=` is a real Firestore `==` query, so
 * asking for `TEACHER` returns only the plain ones. Every teacher picker in the
 * app used to do exactly that, which meant promoting someone to class teacher
 * silently removed them from the subject-mapping, timetable, meeting and
 * material forms — they would appear to have been deleted. Fetching the
 * directory once and filtering here also shares a cache entry with the users
 * page and the dashboard rather than adding a second round trip.
 */
export function useTeachingStaff(enabled = true) {
  return useQuery({
    queryKey: qk.admin.users(),
    queryFn: () => adminApi.listUsers(),
    staleTime: STALE.reference,
    enabled,
    // `select` rather than a filtered fetch, so this shares the one unfiltered
    // cache entry with the users page and the dashboard.
    select: (users: UserOut[]) => users.filter((u) => isTeachingRole(u.role)),
  })
}

export function useClasses(enabled = true) {
  return useQuery({
    queryKey: qk.admin.classes(),
    queryFn: adminApi.listClasses,
    staleTime: STALE.reference,
    enabled,
  })
}

export function useSubjects(enabled = true) {
  return useQuery({
    queryKey: qk.admin.subjects(),
    queryFn: adminApi.listSubjects,
    staleTime: STALE.reference,
    enabled,
  })
}

export function useMappings(enabled = true) {
  return useQuery({
    queryKey: qk.admin.mappings(),
    queryFn: adminApi.listMappings,
    staleTime: STALE.reference,
    enabled,
  })
}

export function useEnrollments(enabled = true) {
  return useQuery({
    queryKey: qk.admin.enrollments(),
    queryFn: adminApi.listEnrollments,
    staleTime: STALE.reference,
    enabled,
  })
}

/** Every meeting in the system, across all teachers. */
export function useAdminMeetings(enabled = true) {
  return useQuery({
    queryKey: qk.admin.meetings(),
    queryFn: adminApi.listMeetings,
    staleTime: STALE.transactional,
    enabled,
  })
}

/** Every uploaded material in the system, across all teachers. */
export function useAdminMaterials(enabled = true) {
  return useQuery({
    queryKey: qk.admin.materials(),
    queryFn: adminApi.listMaterials,
    staleTime: STALE.transactional,
    enabled,
  })
}

/**
 * Integration health.
 *
 * The probing variant makes real network calls to Google, so it is neither
 * refetched on focus nor treated as fresh for long — an admin opens this page
 * precisely when they suspect something has changed, and a stale "all healthy"
 * would be worse than a short wait.
 */
export function useIntegrations(probe = true, enabled = true) {
  return useQuery({
    queryKey: qk.admin.integrations(probe),
    queryFn: () => adminApi.integrations(probe),
    enabled,
    staleTime: probe ? 30_000 : STALE.reference,
    refetchOnWindowFocus: false,
    retry: false,
  })
}

/**
 * Storage health alone. Teacher-accessible, so this is what a non-admin sees
 * when an upload lands somewhere unexpected.
 */
export function useStorageStatus(enabled = true) {
  return useQuery({
    queryKey: qk.health.storage(),
    queryFn: storageApi.status,
    enabled,
    staleTime: 60_000,
    retry: false,
  })
}

/**
 * Writes a probe file and deletes it again.
 *
 * Deliberately a mutation rather than a query: it has a side effect on the
 * storage backend, and must never fire on mount, refocus or retry.
 */
export function useStorageTestUpload() {
  const qc = useQueryClient()
  return useMutation({
    // `cleanup` is required rather than defaulted: leaving a probe file behind
    // is a deliberate choice, never something a caller should fall into.
    mutationFn: (cleanup: boolean) => adminApi.storageTestUpload(cleanup),
    onSuccess: (result) => {
      // The probe is a stronger signal than the reachability check, so let the
      // health panel re-read rather than leave a stale "ok" beside a failure.
      void qc.invalidateQueries({ queryKey: qk.admin.integrationsRoot() })
      void qc.invalidateQueries({ queryKey: qk.health.storage() })
      if (result.ok) toast.success('Storage round trip succeeded', { description: result.detail })
      else toast.warning('Upload did not reach the configured provider', { description: result.detail })
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'The storage probe failed.')
    },
  })
}

// ------------------------------------------------------------- timetable

export function useTimetable(includeInactive = false, enabled = true) {
  return useQuery({
    queryKey: qk.admin.timetable(includeInactive),
    queryFn: () => adminApi.listTimetable(includeInactive),
    staleTime: STALE.reference,
    enabled,
  })
}

/**
 * Clash-aware create.
 *
 * A 409 is the EXPECTED outcome of a double-booking, not a failure to report as
 * a crash: the caller catches it, shows the clashing entries the server named,
 * and offers to retry with `allowConflicts`. So no toast fires on error here.
 */
export function useCreateTimetableEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ body, allowConflicts }: { body: TimetableEntryCreate; allowConflicts?: boolean }) =>
      adminApi.createTimetableEntry(body, allowConflicts),
    onSuccess: () => {
      invalidateTimetable(qc)
      toast.success('Period added')
    },
  })
}

export function useUpdateTimetableEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      entryId,
      body,
      allowConflicts,
    }: {
      entryId: number
      body: TimetableEntryUpdate
      allowConflicts?: boolean
    }) => adminApi.updateTimetableEntry(entryId, body, allowConflicts),
    onSuccess: () => {
      invalidateTimetable(qc)
      toast.success('Period updated')
    },
  })
}

export function useDeleteTimetableEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entryId: number) => adminApi.deleteTimetableEntry(entryId),
    onSuccess: () => {
      invalidateTimetable(qc)
      toast.success('Period removed')
    },
  })
}

/**
 * Bulk upload.
 *
 * Partial success is the normal case, so this never reports a plain "done":
 * skipped rows are surfaced with their count, and the caller renders the
 * per-row reasons the server returned.
 */
export function useBulkCreateTimetable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ body, allowConflicts }: { body: TimetableBulkCreate; allowConflicts?: boolean }) =>
      adminApi.bulkCreateTimetable(body, allowConflicts),
    onSuccess: (result) => {
      invalidateTimetable(qc)
      if (result.skipped.length > 0) {
        toast.warning(`${result.skipped.length} row(s) skipped`, {
          description: result.detail,
          duration: 10_000,
        })
      } else {
        toast.success(result.detail)
      }
    },
  })
}

/**
 * A timetable change moves what everyone's day and "what's next" panels show,
 * and drives which reminders the next sweep considers due — so the resolved
 * views and the preview are dropped alongside the rules themselves.
 */
function invalidateTimetable(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: qk.admin.timetableRoot() })
  void qc.invalidateQueries({ queryKey: qk.teacher.timetable() })
  void qc.invalidateQueries({ queryKey: qk.student.timetable() })
  void qc.invalidateQueries({ queryKey: qk.admin.reminderPreview() })
}

// ------------------------------------------------------------- reminders

export function useReminderStatus(enabled = true) {
  return useQuery({
    queryKey: qk.admin.reminderStatus(),
    queryFn: adminApi.reminderStatus,
    enabled,
    staleTime: 15_000,
    // The sweep runs on its own interval, so the panel goes stale on its own.
    refetchInterval: 30_000,
  })
}

/**
 * Deliberately NOT auto-fetched.
 *
 * A preview is a question an admin asks after editing a timetable, not
 * background data — and it walks the whole schedule to answer, so firing it on
 * every mount and refocus would be wasteful for something nobody was reading.
 */
export function useReminderPreview() {
  return useQuery({
    queryKey: qk.admin.reminderPreview(),
    queryFn: adminApi.previewReminders,
    enabled: false,
    staleTime: 30_000,
    retry: false,
  })
}

export function useReminderLog(limit = 50, enabled = true) {
  return useQuery({
    queryKey: qk.admin.reminderLog(limit),
    queryFn: () => adminApi.reminderLog(limit),
    enabled,
    staleTime: STALE.transactional,
  })
}

/**
 * Triggers a sweep now. Safe to press twice — the Firestore claim means an
 * already-sent reminder is skipped no matter who asks for the sweep.
 */
export function useRunReminders() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => adminApi.runReminders(),
    onSuccess: (job) => {
      qc.setQueryData(qk.admin.job(job.job_id), job)
      void qc.invalidateQueries({ queryKey: qk.admin.jobs() })
      toast.success('Reminder sweep started', {
        description: 'Already-sent reminders are skipped, so nobody is emailed twice.',
      })
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not start the sweep.')
    },
  })
}

export function useMonitoringReport() {
  return useQuery({
    queryKey: qk.admin.monitoring(),
    queryFn: () => adminApi.monitoringReport(),
    staleTime: STALE.expensive,
    gcTime: 60 * 60_000,
  })
}

// ----------------------------------------------------------- background jobs

/** Terminal states — a job in one of these will never change again. */
const JOB_SETTLED: JobStatus[] = ['SUCCEEDED', 'FAILED']

export function isJobSettled(status: JobStatus | undefined): boolean {
  return status !== undefined && JOB_SETTLED.includes(status)
}

/**
 * Polls a single job until it settles, then stops.
 *
 * Two stop conditions beyond success, both mapped to "give up" rather than
 * "retry forever":
 *
 *  - **404** — the job is *lost*, not failed. Job state is per-process and
 *    in-memory, so a server restart or a poll hitting a different worker
 *    erases it. Retrying cannot resurrect it.
 *  - **A hard cap** on elapsed polling, so a job that somehow never reports a
 *    terminal state cannot leave a request firing every second forever.
 */
export function useJob(jobId: string | null) {
  const startedAt = React.useRef<number>(0)

  React.useEffect(() => {
    startedAt.current = jobId ? Date.now() : 0
  }, [jobId])

  return useQuery({
    queryKey: qk.admin.job(jobId ?? ''),
    queryFn: () => adminApi.job(jobId as string),
    enabled: !!jobId,
    staleTime: STALE.live,
    retry: false,
    refetchInterval: (query) => {
      if (isJobSettled(query.state.data?.status)) return false
      // A 404 means the job is gone; nothing to wait for.
      if (query.state.error instanceof ApiError && query.state.error.isNotFound) return false
      if (startedAt.current && Date.now() - startedAt.current > JOB_POLL_TIMEOUT_MS) return false
      return JOB_POLL_INTERVAL_MS
    },
  })
}

const JOB_POLL_INTERVAL_MS = 1_000
const JOB_POLL_TIMEOUT_MS = 5 * 60_000

/**
 * Recent jobs for the notifications panel.
 *
 * Polls only while something is actually in flight — an idle admin should not
 * generate a request every few seconds for a list that cannot change.
 */
export function useRecentJobs(enabled = true) {
  return useQuery({
    queryKey: qk.admin.jobs(),
    queryFn: () => adminApi.recentJobs(20),
    enabled,
    staleTime: 5_000,
    refetchInterval: (query) => {
      const jobs = query.state.data
      if (!jobs) return false
      return jobs.some((job) => !isJobSettled(job.status)) ? 2_000 : false
    },
  })
}

/**
 * Kicks off a background rebuild of the monitoring report.
 *
 * The server returns the in-flight job when one already exists, so double
 * clicking is harmless and deliberately not guarded against here.
 */
export function useRefreshMonitoring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => adminApi.startMonitoringRefresh(),
    onSuccess: (job) => {
      // Seed the job cache so the progress UI has data before the first poll.
      qc.setQueryData(qk.admin.job(job.job_id), job)
      void qc.invalidateQueries({ queryKey: qk.admin.jobs() })
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : 'Could not start the refresh.',
      )
    },
  })
}

// -------------------------------------------------------------- mutations

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UserCreate) => adminApi.createUser(body),
    onSuccess: (created) => {
      // Seed the server's actual response rather than inventing a row: it
      // carries the server-assigned id and created_at we could not know.
      qc.setQueryData<UserOut[]>(qk.admin.users(), (prev) => (prev ? [created, ...prev] : prev))
      qc.setQueryData<UserOut[]>(qk.admin.users(created.role), (prev) => (prev ? [created, ...prev] : prev))
      void qc.invalidateQueries({ queryKey: qk.admin.usersRoot() })
      markMonitoringStale()
      toast.success(`${created.full_name} added`)
    },
  })
}

/**
 * Optimistic — renaming and the active toggle are where latency is felt.
 *
 * A role change is a much heavier operation than the rest of this body: the
 * backend re-issues Firebase claims and revokes every token, signing the user
 * out wherever they are. Callers must confirm before including `role`; this
 * hook reports it plainly afterwards rather than letting it pass as an
 * ordinary field edit.
 *
 * The optimistic patch is also wrong in one specific way for a role change —
 * `qk.admin.users(role)` lists are keyed BY role, so a patched-in-place row
 * would sit in the wrong list until the refetch lands. `onSettled` invalidates
 * every user list, which corrects it.
 */
export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, body }: { userId: number; body: UserUpdate }) =>
      adminApi.updateUser(userId, body),
    onMutate: async ({ userId, body }) => {
      await qc.cancelQueries({ queryKey: qk.admin.usersRoot() })
      const snapshot = qc.getQueriesData<UserOut[]>({ queryKey: qk.admin.usersRoot() })
      qc.setQueriesData<UserOut[]>({ queryKey: qk.admin.usersRoot() }, (prev) =>
        prev?.map((u) => (u.id === userId ? { ...u, ...body } : u)),
      )
      return { snapshot }
    },
    onError: (_error, _vars, context) => {
      context?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
    },
    onSuccess: (updated, { body }) => {
      // Mappings and enrollments embed a full UserOut copy.
      void qc.invalidateQueries({ queryKey: qk.admin.mappings() })
      void qc.invalidateQueries({ queryKey: qk.admin.enrollments() })
      markMonitoringStale()

      if (body.role) {
        toast.success(`${updated.full_name} is now ${ROLE_LABEL[body.role]}`, {
          description:
            'They have been signed out everywhere. Signing back in gives them the new navigation.',
          duration: 8_000,
        })
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.admin.usersRoot() })
    },
  })
}

/** The backend only sets `is_active: false`; nothing is ever deleted. */
export function useDeactivateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => adminApi.deactivateUser(userId),
    onMutate: async (userId) => {
      await qc.cancelQueries({ queryKey: qk.admin.usersRoot() })
      const snapshot = qc.getQueriesData<UserOut[]>({ queryKey: qk.admin.usersRoot() })
      qc.setQueriesData<UserOut[]>({ queryKey: qk.admin.usersRoot() }, (prev) =>
        prev?.map((u) => (u.id === userId ? { ...u, is_active: false } : u)),
      )
      return { snapshot }
    },
    onError: (_error, _vars, context) => {
      context?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
    },
    onSuccess: (result) => {
      // Class rosters exclude inactive students.
      void qc.invalidateQueries({ queryKey: qk.teacher.classStudentsRoot() })
      markMonitoringStale()
      // The endpoint now returns a body rather than a bare 204; its `detail`
      // is more specific than anything we would write here.
      toast.success('Account deactivated', { description: result.detail })
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.admin.usersRoot() })
    },
  })
}

/**
 * Irreversible hard delete.
 *
 * Not optimistic, and deliberately quiet on error: without `force` a 409 is the
 * EXPECTED first response — it lists what still references the user — and the
 * caller turns that into a confirmation step before retrying with `force`.
 *
 * A forced delete removes records across enrollments, attendance, grades,
 * meetings, materials and the timetable, so the safe move afterwards is to drop
 * the whole cache rather than reason about what the server touched.
 */
export function usePermanentlyDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, force }: { userId: number; force?: boolean }) =>
      adminApi.deleteUserPermanently(userId, force),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: qk.admin.root })
      void qc.invalidateQueries({ queryKey: qk.teacher.root })
      void qc.invalidateQueries({ queryKey: qk.student.root })
      markMonitoringStale()

      // An orphaned Firebase login is a real operational loose end, not a
      // detail to bury — say so instead of reporting a clean success.
      if (!result.firebase_auth_deleted) {
        toast.warning('Profile deleted, but the login may remain', {
          description: `${result.detail} The Firebase account could not be removed and may need clearing by hand.`,
          duration: 12_000,
        })
        return
      }
      toast.success(`${result.full_name ?? 'User'} permanently deleted`, {
        description: result.detail,
        duration: 8_000,
      })
    },
  })
}

/**
 * Issues login credentials for a user.
 *
 * The returned password is deliberately NOT written into the query cache: the
 * cache is long-lived, inspectable through devtools, and shared across the
 * app, none of which suits a secret shown once. The caller holds it in local
 * component state and drops it when the reveal modal closes.
 *
 * The call reactivates a deactivated user server-side, so the user list is
 * invalidated rather than patched.
 */
export function useGenerateCredentials() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, options }: { userId: number; options?: GenerateCredentialsRequest }) =>
      adminApi.generateCredentials(userId, options),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.admin.usersRoot() })
      // A reactivated student reappears on class rosters.
      void qc.invalidateQueries({ queryKey: qk.teacher.classStudentsRoot() })
      markMonitoringStale()
    },
  })
}

/** Mirrors the backend's soft delete — the account and its history come back intact. */
export function useReactivateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => adminApi.reactivateUser(userId),
    onMutate: async (userId) => {
      await qc.cancelQueries({ queryKey: qk.admin.usersRoot() })
      const snapshot = qc.getQueriesData<UserOut[]>({ queryKey: qk.admin.usersRoot() })
      qc.setQueriesData<UserOut[]>({ queryKey: qk.admin.usersRoot() }, (prev) =>
        prev?.map((u) => (u.id === userId ? { ...u, is_active: true } : u)),
      )
      return { snapshot }
    },
    onError: (_error, _vars, context) => {
      context?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
    },
    onSuccess: (user) => {
      // Rosters exclude inactive students, so this user reappears in them.
      void qc.invalidateQueries({ queryKey: qk.teacher.classStudentsRoot() })
      markMonitoringStale()
      toast.success(`${user.full_name} reactivated`)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.admin.usersRoot() })
    },
  })
}

export function useCreateClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ClassRoomCreate) => adminApi.createClass(body),
    onSuccess: (created) => {
      qc.setQueryData<ClassRoomOut[]>(qk.admin.classes(), (prev) => (prev ? [...prev, created] : prev))
      void qc.invalidateQueries({ queryKey: qk.admin.classes() })
      markMonitoringStale()
      toast.success(`Class “${created.name}” created`)
    },
  })
}

export function useUpdateClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ classId, body }: { classId: number; body: ClassRoomUpdate }) =>
      adminApi.updateClass(classId, body),
    onSuccess: (updated) => {
      qc.setQueryData<ClassRoomOut[]>(qk.admin.classes(), (prev) =>
        prev?.map((c) => (c.id === updated.id ? updated : c)),
      )
      // Mappings and enrollments embed a full ClassRoomOut copy.
      void qc.invalidateQueries({ queryKey: qk.admin.mappings() })
      void qc.invalidateQueries({ queryKey: qk.admin.enrollments() })
      markMonitoringStale()
      toast.success(`Class “${updated.name}” updated`)
    },
  })
}

/**
 * Not optimistic on purpose: without `force` this call is expected to fail
 * with a 409, and the caller re-runs it with `force: true` after confirming.
 * Removing the row up front and putting it back would read as a glitch.
 *
 * A forced delete cascades across every academic collection, so the safe move
 * afterwards is to drop the whole admin and teacher cache rather than try to
 * reason about what the server removed.
 */
export function useDeleteClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ classId, force }: { classId: number; force?: boolean }) =>
      adminApi.deleteClass(classId, force),
    onSuccess: (_data, { force }) => {
      void qc.invalidateQueries({ queryKey: qk.admin.root })
      if (force) void qc.invalidateQueries({ queryKey: qk.teacher.root })
      markMonitoringStale()
      toast.success(force ? 'Class and all linked records deleted' : 'Class deleted')
    },
  })
}

export function useCreateSubject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SubjectCreate) => adminApi.createSubject(body),
    onSuccess: (created) => {
      qc.setQueryData<SubjectOut[]>(qk.admin.subjects(), (prev) => (prev ? [...prev, created] : prev))
      void qc.invalidateQueries({ queryKey: qk.admin.subjects() })
      markMonitoringStale()
      toast.success(`Subject “${created.name}” created`)
    },
  })
}

export function useUpdateSubject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subjectId, body }: { subjectId: number; body: SubjectUpdate }) =>
      adminApi.updateSubject(subjectId, body),
    onSuccess: (updated) => {
      qc.setQueryData<SubjectOut[]>(qk.admin.subjects(), (prev) =>
        prev?.map((s) => (s.id === updated.id ? updated : s)),
      )
      void qc.invalidateQueries({ queryKey: qk.admin.mappings() })
      markMonitoringStale()
      toast.success(`Subject “${updated.name}” updated`)
    },
  })
}

/** Same 409-then-force contract as `useDeleteClass`. */
export function useDeleteSubject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subjectId, force }: { subjectId: number; force?: boolean }) =>
      adminApi.deleteSubject(subjectId, force),
    onSuccess: (_data, { force }) => {
      void qc.invalidateQueries({ queryKey: qk.admin.root })
      if (force) void qc.invalidateQueries({ queryKey: qk.teacher.root })
      markMonitoringStale()
      toast.success(force ? 'Subject and all linked records deleted' : 'Subject deleted')
    },
  })
}

/**
 * A duplicate POST returns the EXISTING row, still with status 201, so the
 * status code cannot tell us whether anything was created. Callers compare
 * the returned id against the cache to report honestly.
 */
export function useCreateMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TeacherMappingCreate) => adminApi.createMapping(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.admin.mappings() })
      markMonitoringStale()
    },
  })
}

/**
 * Unguarded on the backend, so this one is optimistic: removing an assignment
 * only unlinks the teacher, it never touches records they already logged.
 */
export function useDeleteMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (mappingId: number) => adminApi.deleteMapping(mappingId),
    onMutate: async (mappingId) => {
      await qc.cancelQueries({ queryKey: qk.admin.mappings() })
      const snapshot = qc.getQueryData<TeacherMappingOut[]>(qk.admin.mappings())
      qc.setQueryData<TeacherMappingOut[]>(qk.admin.mappings(), (prev) =>
        prev?.filter((m) => m.id !== mappingId),
      )
      return { snapshot }
    },
    onError: (_error, _mappingId, context) => {
      if (context?.snapshot) qc.setQueryData(qk.admin.mappings(), context.snapshot)
    },
    onSuccess: () => {
      // The affected teacher's own /my-classes list changes too.
      void qc.invalidateQueries({ queryKey: qk.teacher.myClasses() })
      markMonitoringStale()
      toast.success('Assignment removed')
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.admin.mappings() })
    },
  })
}

// ------------------------------------------------------- class teachers

export function useClassTeachers(enabled = true) {
  return useQuery({
    queryKey: qk.admin.classTeachers(),
    queryFn: () => adminApi.listClassTeachers(),
    staleTime: STALE.reference,
    enabled,
  })
}

/**
 * Assigning promotes the teacher to `CLASS_TEACHER` server-side, so the users
 * cache is invalidated alongside the chart — otherwise the directory keeps
 * showing the old role until it goes stale, and every teacher picker built on
 * it disagrees with the badge on this page.
 */
export function useAssignClassTeacher() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ClassTeacherMappingCreate) => adminApi.assignClassTeacher(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.admin.classTeachers() })
      void qc.invalidateQueries({ queryKey: qk.admin.usersRoot() })
      void qc.invalidateQueries({ queryKey: qk.teacher.myLedClasses() })
      markMonitoringStale()
    },
  })
}

/**
 * Not optimistic, unlike `useDeleteMapping`. Removing the teacher's LAST
 * assignment also demotes them back to `TEACHER`, and whether this was the last
 * one is something only the server knows — showing the row gone before that
 * resolves would leave the role badge elsewhere on the page contradicting it.
 */
export function useDeleteClassTeacher() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (mappingId: number) => adminApi.deleteClassTeacher(mappingId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.admin.classTeachers() })
      void qc.invalidateQueries({ queryKey: qk.admin.usersRoot() })
      void qc.invalidateQueries({ queryKey: qk.teacher.myLedClasses() })
      markMonitoringStale()
    },
  })
}

// -------------------------------------------------- meetings (system-wide)

/**
 * Both caches are invalidated after every write below.
 *
 * An admin acting on behalf of a teacher changes a record that teacher's own
 * `/teachers/meetings` list also returns. That list is keyed separately, so
 * without this the teacher's tab would keep serving a copy the admin has
 * already changed. The same applies to materials.
 */
function invalidateMeetings(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: qk.admin.meetings() })
  void qc.invalidateQueries({ queryKey: qk.teacher.meetings() })
  void qc.invalidateQueries({ queryKey: qk.student.meetings() })
}

/**
 * Reports the outcome of Meet generation honestly.
 *
 * A meeting saved without a link is a SUCCESS on the backend — the schedule is
 * kept either way — so this never surfaces as an error. `meet_error` carries
 * the real cause, which beats any message we could invent.
 */
function reportMeetOutcome(created: LiveMeetingOut) {
  if (created.meet_status === 'FAILED' || (!created.meeting_link && created.meet_status !== 'MANUAL' && created.meet_status !== 'SKIPPED')) {
    toast.warning('Scheduled without a Meet link', {
      description:
        created.meet_error ??
        'Google Meet could not generate a link. The meeting is saved — check Admin → Integrations, then use “Retry Meet link”.',
      duration: 10_000,
    })
    return
  }
  if (created.google_event_id) {
    toast.success('Meeting scheduled', {
      description: 'A Google Calendar invitation has been sent to the enrolled students.',
    })
    return
  }
  toast.success('Meeting scheduled')
}

export function useAdminCreateMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AdminLiveMeetingCreate) => adminApi.createMeeting(body),
    onSuccess: (created) => {
      qc.setQueryData<LiveMeetingOut[]>(qk.admin.meetings(), (prev) => (prev ? [created, ...prev] : prev))
      invalidateMeetings(qc)
      reportMeetOutcome(created)
    },
  })
}

export function useAdminUpdateMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ meetingId, body }: { meetingId: number; body: LiveMeetingUpdate }) =>
      adminApi.updateMeeting(meetingId, body),
    onSuccess: (updated) => {
      qc.setQueryData<LiveMeetingOut[]>(qk.admin.meetings(), (prev) =>
        prev?.map((m) => (m.id === updated.id ? updated : m)),
      )
      invalidateMeetings(qc)
      toast.success('Meeting updated', {
        description: updated.google_event_id
          ? 'The Google Calendar event was updated for every invited student.'
          : undefined,
      })
    },
  })
}

/**
 * Retries Meet generation for a meeting saved without a link.
 *
 * A 502 here means the retry failed for the same class of reason as the
 * original attempt, and the server has already recorded that on the meeting —
 * so the list is refetched on error too, not just on success.
 */
export function useRegenerateMeetingLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (meetingId: number) => adminApi.regenerateMeetingLink(meetingId),
    onSuccess: (updated) => {
      qc.setQueryData<LiveMeetingOut[]>(qk.admin.meetings(), (prev) =>
        prev?.map((m) => (m.id === updated.id ? updated : m)),
      )
      toast.success('Meet link created', {
        description: 'The session now has a link and the class has been invited.',
      })
    },
    onError: (error) => {
      toast.error('Still could not create a Meet link', {
        description:
          error instanceof ApiError
            ? error.message
            : 'Check Admin → Integrations for the underlying cause.',
        duration: 10_000,
      })
    },
    onSettled: () => {
      invalidateMeetings(qc)
    },
  })
}

export function useAdminDeleteMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (meetingId: number) => adminApi.deleteMeeting(meetingId),
    onMutate: async (meetingId) => {
      await qc.cancelQueries({ queryKey: qk.admin.meetings() })
      const snapshot = qc.getQueryData<LiveMeetingOut[]>(qk.admin.meetings())
      qc.setQueryData<LiveMeetingOut[]>(qk.admin.meetings(), (prev) =>
        prev?.filter((m) => m.id !== meetingId),
      )
      return { snapshot, removed: snapshot?.find((m) => m.id === meetingId) }
    },
    onError: (_error, _meetingId, context) => {
      if (context?.snapshot) qc.setQueryData(qk.admin.meetings(), context.snapshot)
    },
    onSuccess: (_data, _meetingId, context) => {
      toast.success('Meeting cancelled', {
        description: context?.removed?.google_event_id
          ? 'The Google Calendar event was deleted and attendees were notified.'
          : undefined,
      })
    },
    onSettled: () => {
      invalidateMeetings(qc)
    },
  })
}

// ------------------------------------------------- materials (system-wide)

function invalidateMaterials(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: qk.admin.materials() })
  void qc.invalidateQueries({ queryKey: qk.teacher.materials() })
  void qc.invalidateQueries({ queryKey: qk.student.materials() })
}

export function useAdminUploadMaterial(onProgress?: (percent: number) => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AdminStudyMaterialCreate) => adminApi.uploadMaterial(body, onProgress),
    onSuccess: (created) => {
      qc.setQueryData<StudyMaterialOut[]>(qk.admin.materials(), (prev) =>
        prev ? [created, ...prev] : prev,
      )
      invalidateMaterials(qc)
      markMonitoringStale()

      // A fallback to local disk is not a failure, but it is not what was asked
      // for either, and it is invisible unless we say so.
      if (created.storage_warning) {
        toast.warning(`“${created.title}” was stored on the server disk`, {
          description: created.storage_warning,
          duration: 10_000,
        })
      } else {
        toast.success(`“${created.title}” uploaded`)
      }
    },
  })
}

export function useAdminUpdateMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ materialId, body }: { materialId: number; body: StudyMaterialUpdate }) =>
      adminApi.updateMaterial(materialId, body),
    onSuccess: (updated) => {
      qc.setQueryData<StudyMaterialOut[]>(qk.admin.materials(), (prev) =>
        prev?.map((m) => (m.id === updated.id ? updated : m)),
      )
      invalidateMaterials(qc)
      toast.success(`“${updated.title}” updated`)
    },
  })
}

export function useAdminDeleteMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ materialId, keepFile }: { materialId: number; keepFile?: boolean }) =>
      adminApi.deleteMaterial(materialId, keepFile),
    onMutate: async ({ materialId }) => {
      await qc.cancelQueries({ queryKey: qk.admin.materials() })
      const snapshot = qc.getQueryData<StudyMaterialOut[]>(qk.admin.materials())
      qc.setQueryData<StudyMaterialOut[]>(qk.admin.materials(), (prev) =>
        prev?.filter((m) => m.id !== materialId),
      )
      return { snapshot }
    },
    onError: (_error, _vars, context) => {
      if (context?.snapshot) qc.setQueryData(qk.admin.materials(), context.snapshot)
    },
    onSuccess: () => {
      markMonitoringStale()
      toast.success('Material deleted')
    },
    onSettled: () => {
      invalidateMaterials(qc)
    },
  })
}

export function useCreateEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: StudentEnrollmentCreate) => adminApi.createEnrollment(body),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: qk.admin.enrollments() })
      void qc.invalidateQueries({ queryKey: qk.teacher.classStudents(created.class_room.id) })
      markMonitoringStale()
    },
  })
}

/** Un-enrolls a student. Their attendance and grade history is preserved. */
export function useDeleteEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (enrollmentId: number) => adminApi.deleteEnrollment(enrollmentId),
    onMutate: async (enrollmentId) => {
      await qc.cancelQueries({ queryKey: qk.admin.enrollments() })
      const snapshot = qc.getQueryData<StudentEnrollmentOut[]>(qk.admin.enrollments())
      qc.setQueryData<StudentEnrollmentOut[]>(qk.admin.enrollments(), (prev) =>
        prev?.filter((e) => e.id !== enrollmentId),
      )
      return { snapshot, removed: snapshot?.find((e) => e.id === enrollmentId) }
    },
    onError: (_error, _enrollmentId, context) => {
      if (context?.snapshot) qc.setQueryData(qk.admin.enrollments(), context.snapshot)
    },
    onSuccess: (_data, _enrollmentId, context) => {
      const classId = context?.removed?.class_room.id
      if (classId != null) void qc.invalidateQueries({ queryKey: qk.teacher.classStudents(classId) })
      markMonitoringStale()
      toast.success('Student un-enrolled')
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.admin.enrollments() })
    },
  })
}

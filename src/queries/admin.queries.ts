import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { adminApi } from '@/api/admin.api'
import { ApiError } from '@/api/errors'
import type {
  ClassRoomCreate,
  ClassRoomOut,
  ClassRoomUpdate,
  GenerateCredentialsRequest,
  JobStatus,
  StudentEnrollmentCreate,
  StudentEnrollmentOut,
  SubjectCreate,
  SubjectOut,
  SubjectUpdate,
  TeacherMappingCreate,
  TeacherMappingOut,
  UserCreate,
  UserOut,
  UserRole,
  UserUpdate,
} from '@/api/types'
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

/** Optimistic — renaming and the active toggle are where latency is felt. */
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
    onSuccess: () => {
      // Mappings and enrollments embed a full UserOut copy.
      void qc.invalidateQueries({ queryKey: qk.admin.mappings() })
      void qc.invalidateQueries({ queryKey: qk.admin.enrollments() })
      markMonitoringStale()
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
    onSuccess: () => {
      // Class rosters exclude inactive students.
      void qc.invalidateQueries({ queryKey: qk.teacher.classStudentsRoot() })
      markMonitoringStale()
      toast.success('Account deactivated')
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.admin.usersRoot() })
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

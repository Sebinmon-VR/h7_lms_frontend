import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { ApiError } from '@/api/errors'
import { examApi } from '@/api/exam.api'
import {
  tuitionAdminApi,
  tuitionLibraryApi,
  tuitionStudentApi,
  tuitionTeacherApi,
} from '@/api/tuition.api'
import type {
  ApiDate,
  BillingExportView,
  FeePlanCreate,
  FeePlanOut,
  FeePlanUpdate,
  InvoiceBatchGenerate,
  InvoiceExportView,
  InvoiceGenerate,
  InvoiceOut,
  LibraryItemOut,
  LibraryItemUpdate,
  LibraryLinkCreate,
  LibraryModeration,
  LibraryUploadForm,
  MeetingLinkUpdate,
  PaymentRecord,
  Program,
  ProgramAccessUpdate,
  ProgramSettingsUpdate,
  ReportExportView,
  TuitionAssessmentCategory,
  TuitionAssessmentCreate,
  TuitionAttendanceMark,
  TuitionEnrollmentCreate,
  TuitionEnrollmentOut,
  TuitionEnrollmentUpdate,
  TuitionReportCardCreate,
  TuitionSessionCancel,
  TuitionSessionCreate,
  TuitionSessionEnd,
  TuitionSessionOut,
  TuitionSessionReschedule,
  TuitionSessionStatus,
  TuitionSlotCreate,
  TuitionSlotOut,
  StudentSubmissionOut,
  TuitionSlotUpdate,
  TuitionStudentCreate,
  TuitionTeacherCreate,
  TuitionUserSummary,
  UserRole,
} from '@/api/types'
import { STALE, qk } from './keys'
import type { TuitionBillingKey, TuitionScope, TuitionSessionFilters } from './keys'

/**
 * Hooks for the online tuition product.
 *
 * Three things are worth knowing before reading further.
 *
 * **Scope is not a filter.** The admin, teacher and student session endpoints
 * return the same shape over different rows. Every session hook takes a
 * `scope`, and it is part of the cache key — an admin opening a teacher screen
 * must not read the programme-wide cache and see other people's classes.
 *
 * **Live classes invalidate broadly.** Starting, ending or cancelling a class
 * changes rows inside date windows we cannot enumerate, so those mutations
 * drop `sessionsRoot()` rather than patching one entry. The cost is a refetch
 * of one list; the alternative is a console that lies about whether a class is
 * running.
 *
 * **The countdown is the server's.** `timing.minutes_remaining` was computed
 * when the response was built, so anything showing it refetches on an interval
 * rather than counting down locally — see `useTuitionUpcoming`.
 */

const KEEP_LIVE = 60_000

// =====================================================================
// Me & settings
// =====================================================================

/**
 * The signed-in user's tuition profile, and the zone their times render in.
 *
 * Doubles as the programme-membership probe: this endpoint 403s for an account
 * without TUITION access, which is exactly what `useIsTuitionUser` reads. It
 * retries nothing on 403 for that reason — a refused answer is the answer.
 */
export function useTuitionProfile(enabled = true) {
  return useQuery({
    queryKey: qk.tuition.me(),
    queryFn: tuitionLibraryApi.me,
    staleTime: STALE.reference,
    enabled,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && (error.status === 403 || error.status === 401)) return false
      return failureCount < 2
    },
  })
}

export function useSetMyTimezone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (timezone: string | null) => tuitionLibraryApi.setTimezone({ timezone }),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.me() })
      // Every rendered instant on every tuition screen was resolved into the
      // OLD zone server-side, so they are all wrong now, not merely stale.
      void qc.invalidateQueries({ queryKey: qk.tuition.sessionsRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.upcoming('teacher') })
      void qc.invalidateQueries({ queryKey: qk.tuition.upcoming('student') })
      toast.success(result.detail)
    },
  })
}

export function useProgramSettings(program: Program, enabled = true) {
  return useQuery({
    queryKey: qk.tuition.settings(program),
    queryFn: () => tuitionAdminApi.settings(program),
    staleTime: STALE.reference,
    enabled,
  })
}

/** Partial by design — send only what changed, or you reset what you did not render. */
export function useUpdateProgramSettings(program: Program) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ProgramSettingsUpdate) => tuitionAdminApi.updateSettings(program, body),
    onSuccess: (settings) => {
      qc.setQueryData(qk.tuition.settings(program), settings)
      toast.success('Settings saved')
    },
  })
}

// =====================================================================
// Programme access
// =====================================================================

/**
 * Tuition participants. With `includeAll`, everyone — which is how an admin
 * finds a school account in order to grant it tuition access.
 */
export function useTuitionUsers(role?: UserRole, includeAll = false, enabled = true) {
  return useQuery({
    queryKey: qk.tuition.users(role ?? 'ALL', includeAll),
    queryFn: () => tuitionAdminApi.users(role, includeAll),
    staleTime: STALE.reference,
    enabled,
  })
}

/**
 * Adds a brand-new person to the programme.
 *
 * `POST /admin/users` is the wrong call for this: it creates a school account
 * and would need the tuition box ticked afterwards, and it does not issue the
 * `TUI-`/`TUT-` identifiers these endpoints generate.
 */
export function useCreateTuitionAccount(role: 'STUDENT' | 'TEACHER') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TuitionStudentCreate | TuitionTeacherCreate) =>
      role === 'STUDENT'
        ? tuitionAdminApi.createStudent(body as TuitionStudentCreate)
        : tuitionAdminApi.createTeacher(body as TuitionTeacherCreate),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.usersRoot() })
      void qc.invalidateQueries({ queryKey: qk.admin.usersRoot() })
      toast.success(`${created.full_name} added`, {
        description:
          'No password yet — issue credentials from Users to email them a sign-in.',
      })
    },
  })
}

export function useSetUserPrograms() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, body }: { userId: number; body: ProgramAccessUpdate }) =>
      tuitionAdminApi.setUserPrograms(userId, body),
    onSuccess: (updated: TuitionUserSummary) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.usersRoot() })
      // The LMS user list shows the same `programs` field.
      void qc.invalidateQueries({ queryKey: qk.admin.usersRoot() })
      const hasTuition = updated.programs.includes('TUITION')
      toast.success(
        hasTuition
          ? `${updated.full_name} can now use online tuition`
          : `${updated.full_name} no longer has tuition access`,
      )
    },
  })
}

// =====================================================================
// Enrollments
// =====================================================================

/** Admin-wide. The teacher's and student's own lists are further down. */
export function useTuitionEnrollments(includeInactive = false, enabled = true) {
  return useQuery({
    queryKey: qk.tuition.enrollments(includeInactive),
    queryFn: () => tuitionAdminApi.listEnrollments({ includeInactive }),
    staleTime: STALE.reference,
    enabled,
  })
}

export function useTuitionEnrollment(enrollmentId: number | null) {
  return useQuery({
    queryKey: qk.tuition.enrollment(enrollmentId ?? 0),
    queryFn: () => tuitionAdminApi.enrollment(enrollmentId as number),
    staleTime: STALE.reference,
    enabled: enrollmentId != null,
  })
}

/**
 * No error toast: a 409 here means the student already has a teacher for that
 * subject, which the form explains in place alongside who that teacher is.
 */
export function useCreateTuitionEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TuitionEnrollmentCreate) => tuitionAdminApi.createEnrollment(body),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.enrollmentsRoot() })
      toast.success(
        `${created.student?.full_name ?? 'Student'} enrolled for ${created.subject?.name ?? 'the subject'}`,
      )
    },
  })
}

export function useUpdateTuitionEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ enrollmentId, body }: { enrollmentId: number; body: TuitionEnrollmentUpdate }) =>
      tuitionAdminApi.updateEnrollment(enrollmentId, body),
    onSuccess: (updated, { body }) => {
      qc.setQueryData(qk.tuition.enrollment(updated.id), updated)
      void qc.invalidateQueries({ queryKey: qk.tuition.enrollmentsRoot() })
      // A teacher change re-points the slots and every future class.
      if (body.teacher_id != null) {
        void qc.invalidateQueries({ queryKey: qk.tuition.slots() })
        void qc.invalidateQueries({ queryKey: qk.tuition.sessionsRoot() })
      }
      toast.success('Arrangement updated')
    },
  })
}

/**
 * Deletes the arrangement outright. Ending it — a status change to COMPLETED —
 * is nearly always the right call instead, and the confirm dialog says so.
 */
export function useDeleteTuitionEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (enrollmentId: number) => tuitionAdminApi.deleteEnrollment(enrollmentId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.enrollmentsRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.slots() })
      void qc.invalidateQueries({ queryKey: qk.tuition.sessionsRoot() })
      toast.success('Enrollment deleted', { description: result.detail })
    },
  })
}

// =====================================================================
// Slots — the recurring weekly timetable
// =====================================================================

export function useTuitionSlots(enabled = true) {
  return useQuery({
    queryKey: qk.tuition.slots(),
    queryFn: () => tuitionAdminApi.listSlots(),
    staleTime: STALE.reference,
    enabled,
  })
}

/**
 * Booking a weekly class time.
 *
 * A 409 is a normal outcome, not a failure: the caller shows the conflicts and
 * offers to book anyway with `allowConflicts`. So nothing is toasted on error.
 */
export function useCreateTuitionSlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ body, allowConflicts }: { body: TuitionSlotCreate; allowConflicts?: boolean }) =>
      tuitionAdminApi.createSlot(body, allowConflicts),
    onSuccess: (slot) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.slots() })
      void qc.invalidateQueries({ queryKey: qk.tuition.sessionsRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.scheduleStatus() })
      if (slot.conflicts.length) {
        void qc.invalidateQueries({ queryKey: qk.tuition.conflicts() })
        toast.warning('Booked over a clash', { description: slot.conflicts[0] })
        return
      }
      toast.success('Weekly class time added', {
        description: slot.sessions_generated
          ? `${slot.sessions_generated} classes scheduled.`
          : undefined,
      })
    },
  })
}

export function useUpdateTuitionSlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      slotId,
      body,
      allowConflicts,
    }: {
      slotId: number
      body: TuitionSlotUpdate
      allowConflicts?: boolean
    }) => tuitionAdminApi.updateSlot(slotId, body, allowConflicts),
    onSuccess: (slot) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.slots() })
      void qc.invalidateQueries({ queryKey: qk.tuition.sessionsRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.conflicts() })
      if (slot.conflicts.length) {
        toast.warning('Saved over a clash', { description: slot.conflicts[0] })
        return
      }
      toast.success('Class time updated')
    },
  })
}

export function useDeleteTuitionSlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slotId: number) => tuitionAdminApi.deleteSlot(slotId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.slots() })
      void qc.invalidateQueries({ queryKey: qk.tuition.sessionsRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.conflicts() })
      toast.success('Class time removed', {
        description:
          result.sessions_removed != null
            ? `${result.sessions_removed} upcoming classes cancelled. Past ones were kept.`
            : undefined,
      })
    },
  })
}

/**
 * Asked before committing to a time, so the form can warn rather than reject.
 *
 * Deliberately a mutation and not a query: it is a POST, it is asked
 * imperatively as the admin edits a time, and caching yesterday's answer about
 * a diary that has since changed would be worse than not asking.
 */
export function useCheckSlotAvailability() {
  return useMutation({ mutationFn: tuitionAdminApi.checkSlotAvailability })
}

export function useTuitionConflicts(enabled = true) {
  return useQuery({
    queryKey: qk.tuition.conflicts(),
    queryFn: tuitionAdminApi.conflicts,
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useTuitionScheduleStatus(enabled = true) {
  return useQuery({
    queryKey: qk.tuition.scheduleStatus(),
    queryFn: tuitionAdminApi.scheduleStatus,
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useGenerateTuitionSessions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (horizonDays?: number) => tuitionAdminApi.generateSessions(horizonDays),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.sessionsRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.scheduleStatus() })
      toast.success('Schedule extended', {
        description: result.detail ?? `${result.created ?? 0} classes scheduled.`,
      })
    },
  })
}

// =====================================================================
// Sessions
// =====================================================================

/**
 * One list of classes, from whichever router matches the caller.
 *
 * The three endpoints take slightly different filters — the teacher's accepts
 * a student, the student's a subject, the admin's either — so `who` carries
 * whichever one this scope understands.
 */
export function useTuitionSessions(
  scope: TuitionScope,
  filters: TuitionSessionFilters = {},
  enabled = true,
) {
  return useQuery({
    queryKey: qk.tuition.sessions(scope, filters),
    queryFn: () => {
      const common = {
        fromDate: filters.from,
        toDate: filters.to,
        status: filters.status as TuitionSessionStatus | undefined,
      }
      if (scope === 'admin') {
        return tuitionAdminApi.listSessions({ ...common, studentId: Number(filters.who) || undefined })
      }
      if (scope === 'teacher') {
        return tuitionTeacherApi.sessions({
          ...common,
          studentId: Number(filters.who) || undefined,
        })
      }
      return tuitionStudentApi.sessions({
        ...common,
        subjectId: Number(filters.who) || undefined,
      })
    },
    staleTime: STALE.transactional,
    enabled,
  })
}

/**
 * The next few classes, with the server's countdown attached.
 *
 * Refetched on an interval because that countdown is the whole point: a panel
 * frozen at "in 12 minutes" through a class that started ten minutes ago is
 * worse than no panel.
 */
export function useTuitionUpcoming(scope: Exclude<TuitionScope, 'admin'>, limit = 10, enabled = true) {
  return useQuery({
    queryKey: qk.tuition.upcoming(scope),
    queryFn: () =>
      scope === 'teacher' ? tuitionTeacherApi.upcoming(limit) : tuitionStudentApi.upcoming(limit),
    staleTime: STALE.schedule,
    refetchInterval: KEEP_LIVE,
    enabled,
  })
}

/**
 * One class, refetched while it is live.
 *
 * `refetchInterval` is conditional on the timing the server sent: polling a
 * class that finished last Tuesday is pure waste, and polling one that is
 * running is what keeps "may end now" honest.
 */
export function useTuitionSession(scope: TuitionScope, sessionId: string | null) {
  return useQuery({
    queryKey: qk.tuition.session(scope, sessionId ?? ''),
    queryFn: () => {
      const id = sessionId as string
      if (scope === 'admin') return tuitionAdminApi.session(id)
      if (scope === 'teacher') return tuitionTeacherApi.session(id)
      return tuitionStudentApi.session(id)
    },
    enabled: sessionId != null,
    staleTime: STALE.live,
    refetchInterval: (query) => {
      const data = query.state.data as TuitionSessionOut | undefined
      if (!data) return false
      const live = data.status === 'IN_PROGRESS' || data.timing?.is_live
      const soon = (data.timing?.starts_in_minutes ?? Infinity) < 30
      return live || soon ? 30_000 : false
    },
  })
}

/** Every write to a class can move it between date windows we cannot name. */
function useSessionMutation<TVars>(
  mutationFn: (vars: TVars) => Promise<TuitionSessionOut>,
  onDone?: (session: TuitionSessionOut) => void,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (session) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.sessionsRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.upcoming('teacher') })
      void qc.invalidateQueries({ queryKey: qk.tuition.upcoming('student') })
      void qc.invalidateQueries({ queryKey: ['tuition', 'session'] })
      onDone?.(session)
    },
  })
}

/** Records the teacher as present and starts the clock. */
export function useStartTuitionSession() {
  return useSessionMutation(
    (sessionId: string) => tuitionTeacherApi.startSession(sessionId),
    (session) => {
      if (session.teacher_late_minutes > 0) {
        toast.warning(`Class started ${Math.round(session.teacher_late_minutes)} min late`, {
          description:
            session.extension_minutes > 0
              ? `It now runs ${Math.round(session.extension_minutes)} min past the scheduled end.`
              : undefined,
        })
        return
      }
      toast.success('Class started')
    },
  )
}

/**
 * Closes the class. An early finish is recorded rather than refused — the
 * warning below is what the admin's report will show.
 */
export function useEndTuitionSession() {
  return useSessionMutation(
    ({ sessionId, body }: { sessionId: string; body: TuitionSessionEnd }) =>
      tuitionTeacherApi.endSession(sessionId, body),
    (session) => {
      if (session.ended_early && session.short_by_minutes) {
        toast.warning(`Ended ${Math.round(session.short_by_minutes)} min early`, {
          description: 'This is recorded on the attendance report.',
        })
        return
      }
      toast.success('Class ended')
    },
  )
}

export function useMarkTuitionAttendance() {
  return useSessionMutation(
    ({ sessionId, body }: { sessionId: string; body: TuitionAttendanceMark }) =>
      tuitionTeacherApi.markAttendance(sessionId, body),
    (session) => toast.success(`Marked ${session.attendance_status?.toLowerCase() ?? 'attendance'}`),
  )
}

/**
 * With a body, sets an explicit link. Without one, asks the backend to create
 * a Google Meet for this class — which is why `body` is optional.
 */
export function useSetTuitionMeetingLink(scope: Exclude<TuitionScope, 'student'>) {
  return useSessionMutation(
    ({ sessionId, body }: { sessionId: string; body?: MeetingLinkUpdate }) =>
      scope === 'admin'
        ? tuitionAdminApi.setSessionMeetingLink(sessionId, body as MeetingLinkUpdate)
        : tuitionTeacherApi.setMeetingLink(sessionId, body),
    (session) => {
      if (session.meet_error) {
        toast.error('Could not create the meeting', { description: session.meet_error })
        return
      }
      toast.success('Meeting link ready')
    },
  )
}

export function useCreateTuitionSession(scope: Exclude<TuitionScope, 'student'>) {
  return useSessionMutation(
    ({ body, allowConflicts }: { body: TuitionSessionCreate; allowConflicts?: boolean }) =>
      scope === 'admin'
        ? tuitionAdminApi.createSession(body, allowConflicts)
        : tuitionTeacherApi.createSession(body),
    (session) => {
      if (session.conflicts.length) {
        toast.warning('Extra class booked over a clash', { description: session.conflicts[0] })
        return
      }
      toast.success('Extra class scheduled')
    },
  )
}

export function useRescheduleTuitionSession(scope: Exclude<TuitionScope, 'student'>) {
  return useSessionMutation(
    ({
      sessionId,
      body,
      allowConflicts,
    }: {
      sessionId: string
      body: TuitionSessionReschedule
      allowConflicts?: boolean
    }) =>
      scope === 'admin'
        ? tuitionAdminApi.rescheduleSession(sessionId, body, allowConflicts)
        : tuitionTeacherApi.rescheduleSession(sessionId, body),
    () => toast.success('Class moved'),
  )
}

export function useCancelTuitionSession(scope: Exclude<TuitionScope, 'student'>) {
  return useSessionMutation(
    ({ sessionId, body }: { sessionId: string; body: TuitionSessionCancel }) =>
      scope === 'admin'
        ? tuitionAdminApi.cancelSession(sessionId, body)
        : tuitionTeacherApi.cancelSession(sessionId, body),
    () => toast.success('Class cancelled'),
  )
}

/** Overrides whether this class counts on the invoice. */
export function useSetSessionBillable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, billable }: { sessionId: string; billable: boolean }) =>
      tuitionAdminApi.setSessionBillable(sessionId, billable),
    onSuccess: (session) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.sessionsRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.feesRoot() })
      toast.success(session.is_billable ? 'Class will be billed' : 'Class will not be billed')
    },
  })
}

/**
 * Records the student as arrived and returns the link to open.
 *
 * Callers must open the link from the RESPONSE, not one the list already had:
 * the join timestamp is what decides lateness, and a student who clicked a
 * stale link is invisible to it.
 */
export function useJoinTuitionSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => tuitionStudentApi.joinSession(sessionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tuition.sessionsRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.upcoming('student') })
    },
  })
}

// =====================================================================
// My side of the arrangement
// =====================================================================

export function useMyTuitionStudents(includeInactive = false, enabled = true) {
  return useQuery({
    queryKey: [...qk.tuition.enrollmentsRoot(), 'teacher', includeInactive] as const,
    queryFn: () => tuitionTeacherApi.myStudents(includeInactive),
    staleTime: STALE.reference,
    enabled,
  })
}

export function useMyTuitionSubjects(enabled = true) {
  return useQuery({
    queryKey: [...qk.tuition.enrollmentsRoot(), 'student'] as const,
    queryFn: tuitionStudentApi.mySubjects,
    staleTime: STALE.reference,
    enabled,
  })
}

/** The recurring weekly grid for whichever side is asking. */
export function useMyTuitionTimetable(scope: Exclude<TuitionScope, 'admin'>, enabled = true) {
  return useQuery({
    queryKey: [...qk.tuition.slots(), scope] as const,
    queryFn: () =>
      scope === 'teacher' ? tuitionTeacherApi.timetable() : tuitionStudentApi.timetable(),
    staleTime: STALE.reference,
    enabled,
  })
}

// =====================================================================
// Assessments & report cards
// =====================================================================

export function useTuitionAssessments(
  scope: Exclude<TuitionScope, 'admin'>,
  filters: { category?: TuitionAssessmentCategory; studentId?: number; subjectId?: number } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [
      ...qk.tuition.assessments(scope),
      filters.category ?? 'any',
      filters.studentId ?? filters.subjectId ?? 'any',
    ] as const,
    queryFn: () =>
      scope === 'teacher'
        ? tuitionTeacherApi.assessments({
            category: filters.category,
            studentId: filters.studentId,
          })
        : tuitionStudentApi.assessments({
            category: filters.category,
            subjectId: filters.subjectId,
          }),
    staleTime: STALE.transactional,
    enabled,
  })
}

/**
 * Sets homework, an assignment or an exam for one student.
 *
 * The response is an ordinary `ExamOut`, so the existing exam screens open it
 * without changes — the engine underneath is the LMS exam engine.
 */
export function useCreateTuitionAssessment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TuitionAssessmentCreate) => tuitionTeacherApi.createAssessment(body),
    onSuccess: (exam) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.assessmentsRoot() })
      // It is a real exam, so the exam module's own lists are stale too.
      void qc.invalidateQueries({ queryKey: qk.exams.list() })
      toast.success(`“${exam.title}” set`)
    },
  })
}

/**
 * The student's own marks for tuition work, keyed by exam id.
 *
 * Fetched only for papers whose results are actually out: an unmarked script
 * has nothing to show, and asking for one per row would multiply the requests
 * on a page where most rows are still open homework.
 *
 * The submissions come from the SHARED exam endpoints, not a tuition one —
 * `/students/exams/{id}/submission` is guarded by `require_student` with no
 * programme check, which is what lets a tuition-only student read a result at
 * all. A 404 there is the ordinary "never started it" case, not an error.
 */
export function useMyTuitionMarks(examIds: number[]) {
  return useQueries({
    queries: examIds.map((examId) => ({
      queryKey: qk.student.submission(examId),
      queryFn: async (): Promise<StudentSubmissionOut | null> => {
        try {
          return await examApi.mySubmission(examId)
        } catch (error) {
          if (error instanceof ApiError && error.isNotFound) return null
          throw error
        }
      },
      staleTime: STALE.transactional,
    })),
    combine: (results) => ({
      isPending: results.some((r) => r.isPending),
      byExam: Object.fromEntries(
        examIds.map((id, i) => [id, (results[i]?.data ?? null) as StudentSubmissionOut | null]),
      ) as Record<number, StudentSubmissionOut | null>,
    }),
  })
}

export function useTuitionReportCards(enabled = true) {
  return useQuery({
    queryKey: qk.tuition.reportCards(),
    queryFn: tuitionStudentApi.reportCards,
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useCreateTuitionReportCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TuitionReportCardCreate) => tuitionTeacherApi.createReportCard(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tuition.reportCards() })
      toast.success('Report card generated', {
        description: 'It stays private to you until you publish it.',
      })
    },
  })
}

export function usePublishTuitionReportCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cardId: string) => tuitionTeacherApi.publishReportCard(cardId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tuition.reportCards() })
      toast.success('Report card published', { description: 'The student can now see it.' })
    },
  })
}

// =====================================================================
// Reports
// =====================================================================

export function useTuitionOverview(from?: ApiDate, to?: ApiDate, enabled = true) {
  return useQuery({
    queryKey: qk.tuition.overview(from, to),
    queryFn: () => tuitionAdminApi.overview(from, to),
    staleTime: STALE.expensive,
    enabled,
  })
}

export function useTuitionStudentReport(
  scope: TuitionScope,
  studentId: number | null,
  from?: ApiDate,
  to?: ApiDate,
) {
  return useQuery({
    queryKey: qk.tuition.studentReport(scope, studentId ?? 0, from, to),
    queryFn: () => {
      const id = studentId as number
      if (scope === 'admin') return tuitionAdminApi.studentReport(id, from, to)
      if (scope === 'teacher') return tuitionTeacherApi.studentReport(id, from, to)
      return tuitionStudentApi.myReport(from, to)
    },
    staleTime: STALE.expensive,
    // The student's own report needs no id: the server knows who is asking.
    enabled: scope === 'student' || studentId != null,
  })
}

export function useTuitionTeacherReport(
  scope: Exclude<TuitionScope, 'student'>,
  teacherId: number | null,
  from?: ApiDate,
  to?: ApiDate,
) {
  return useQuery({
    queryKey: qk.tuition.teacherReport(scope, teacherId ?? 0, from, to),
    queryFn: () =>
      scope === 'admin'
        ? tuitionAdminApi.teacherReport(teacherId as number, from, to)
        : tuitionTeacherApi.myReport(from, to),
    staleTime: STALE.expensive,
    enabled: scope === 'teacher' || teacherId != null,
  })
}

// =====================================================================
// Fees & invoices
// =====================================================================

export function useFeePlans(enabled = true) {
  return useQuery({
    queryKey: qk.tuition.feePlans(),
    queryFn: tuitionAdminApi.feePlans,
    staleTime: STALE.reference,
    enabled,
  })
}

export function useCreateFeePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: FeePlanCreate) => tuitionAdminApi.createFeePlan(body),
    onSuccess: (plan) => {
      qc.setQueryData<FeePlanOut[]>(qk.tuition.feePlans(), (prev) => (prev ? [...prev, plan] : prev))
      void qc.invalidateQueries({ queryKey: qk.tuition.feePlans() })
      toast.success(`Fee plan “${plan.name}” created`)
    },
  })
}

export function useUpdateFeePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ planId, body }: { planId: number; body: FeePlanUpdate }) =>
      tuitionAdminApi.updateFeePlan(planId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tuition.feePlans() })
      toast.success('Fee plan updated')
    },
  })
}

/**
 * Removing a plan does not re-price invoices already issued — those froze
 * their numbers when they were issued, which is the point of issuing them.
 */
export function useDeleteFeePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (planId: number) => tuitionAdminApi.deleteFeePlan(planId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tuition.feePlans() })
      toast.success('Fee plan removed')
    },
  })
}

export function useTuitionInvoices(studentId?: number, enabled = true) {
  return useQuery({
    queryKey: qk.tuition.invoices(studentId),
    queryFn: () => tuitionAdminApi.invoices({ studentId }),
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useTuitionInvoice(invoiceId: string | null) {
  return useQuery({
    queryKey: qk.tuition.invoice(invoiceId ?? ''),
    queryFn: () => tuitionAdminApi.invoice(invoiceId as string),
    staleTime: STALE.transactional,
    enabled: !!invoiceId,
  })
}

/**
 * The billing screen in one call: matching invoices and their own totals.
 *
 * Preferred over pairing `useTuitionInvoices` with `useTuitionFeeSummary` —
 * two queries can resolve against different data and leave the headline
 * figures contradicting the rows below them.
 */
export function useTuitionBilling(filters: TuitionBillingKey = {}, enabled = true) {
  return useQuery({
    queryKey: qk.tuition.billing(filters),
    queryFn: () =>
      tuitionAdminApi.billing({
        studentId: filters.student,
        status: filters.status,
        fromDate: filters.from,
        toDate: filters.to,
        unpaidOnly: filters.unpaidOnly,
      }),
    staleTime: STALE.transactional,
    enabled,
  })
}

/** One student's whole history. Opened when a parent rings up. */
export function useStudentBilling(studentId: number | null) {
  return useQuery({
    queryKey: qk.tuition.studentBilling(studentId ?? 0),
    queryFn: () => tuitionAdminApi.studentBilling(studentId as number),
    staleTime: STALE.transactional,
    enabled: studentId != null,
  })
}

/** One invoice down to the classes behind every line. The audit trail. */
export function useInvoiceDetail(invoiceId: string | null) {
  return useQuery({
    queryKey: qk.tuition.invoiceDetail(invoiceId ?? ''),
    queryFn: () => tuitionAdminApi.invoiceDetail(invoiceId as string),
    staleTime: STALE.transactional,
    enabled: !!invoiceId,
  })
}

/**
 * CSV downloads.
 *
 * Mutations rather than queries: each one writes a file to the user's disk,
 * which is a side effect that must happen when asked and exactly once — a
 * query would cache it, refetch it on focus, and save the file again.
 */
export function useTuitionExport() {
  const billing = useMutation({
    mutationFn: ({
      view,
      filters,
    }: {
      view: BillingExportView
      filters?: { studentId?: number; status?: string; fromDate?: ApiDate; toDate?: ApiDate }
    }) => tuitionAdminApi.exportBilling(view, filters),
    onSuccess: (filename) => toast.success('Export saved', { description: filename }),
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not build the export.')
    },
  })

  const invoice = useMutation({
    mutationFn: ({ invoiceId, view }: { invoiceId: string; view: InvoiceExportView }) =>
      tuitionAdminApi.exportInvoice(invoiceId, view),
    onSuccess: (filename) => toast.success('Export saved', { description: filename }),
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not build the export.')
    },
  })

  const reports = useMutation({
    mutationFn: ({
      view,
      from,
      to,
    }: {
      view: ReportExportView
      from?: ApiDate
      to?: ApiDate
    }) => tuitionAdminApi.exportReports(view, from, to),
    onSuccess: (filename) => toast.success('Export saved', { description: filename }),
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not build the export.')
    },
  })

  return { billing, invoice, reports }
}

export function useTuitionFeeSummary(from?: ApiDate, to?: ApiDate, enabled = true) {
  return useQuery({
    queryKey: qk.tuition.feeSummary(from, to),
    queryFn: () => tuitionAdminApi.feeSummary(from, to),
    staleTime: STALE.expensive,
    enabled,
  })
}

/** A DRAFT is recomputed from session counts every time it is regenerated. */
export function useGenerateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: InvoiceGenerate) => tuitionAdminApi.generateInvoice(body),
    onSuccess: (invoice) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.invoicesRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.billingRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.feesRoot() })
      toast.success(`Draft invoice for ${invoice.student_name ?? 'the student'} ready`, {
        description: `${invoice.currency} ${invoice.total_amount.toFixed(2)} across ${invoice.line_items.length} line(s).`,
      })
    },
  })
}

export function useGenerateInvoiceBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: InvoiceBatchGenerate) => tuitionAdminApi.generateInvoiceBatch(body),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.invoicesRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.billingRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.feesRoot() })
      toast.success(`${result.generated ?? 0} invoices drafted`, {
        description: result.skipped
          ? `${result.skipped} skipped — already issued.`
          : undefined,
      })
    },
  })
}

/** Freezes the numbers. A bill that changes after it was sent is not a bill. */
export function useIssueInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (invoiceId: string) => tuitionAdminApi.issueInvoice(invoiceId),
    onSuccess: (invoice: InvoiceOut) => {
      qc.setQueryData(qk.tuition.invoice(invoice.id), invoice)
      void qc.invalidateQueries({ queryKey: qk.tuition.invoicesRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.billingRoot() })
      toast.success('Invoice issued', { description: 'The amounts are now fixed.' })
    },
  })
}

export function useRecordPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceId, body }: { invoiceId: string; body: PaymentRecord }) =>
      tuitionAdminApi.recordPayment(invoiceId, body),
    onSuccess: (invoice) => {
      qc.setQueryData(qk.tuition.invoice(invoice.id), invoice)
      void qc.invalidateQueries({ queryKey: qk.tuition.invoicesRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.billingRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.feesRoot() })
      const owed = invoice.total_amount - invoice.amount_paid
      toast.success('Payment recorded', {
        description:
          owed > 0.005 ? `${invoice.currency} ${owed.toFixed(2)} still outstanding.` : 'Paid in full.',
      })
    },
  })
}

export function useCancelInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceId, reason }: { invoiceId: string; reason?: string }) =>
      tuitionAdminApi.cancelInvoice(invoiceId, reason),
    onSuccess: (invoice) => {
      qc.setQueryData(qk.tuition.invoice(invoice.id), invoice)
      void qc.invalidateQueries({ queryKey: qk.tuition.invoicesRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.billingRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.feesRoot() })
      toast.success('Invoice cancelled')
    },
  })
}

// =====================================================================
// Reminders & maintenance
// =====================================================================

export function useTuitionReminderStatus(enabled = true) {
  return useQuery({
    queryKey: qk.tuition.reminderStatus(),
    queryFn: tuitionAdminApi.reminderStatus,
    staleTime: STALE.transactional,
    enabled,
  })
}

/** A dry run: claims nothing, delivers nothing, safe to press repeatedly. */
export function useTuitionReminderPreview(enabled = true) {
  return useQuery({
    queryKey: qk.tuition.reminderPreview(),
    queryFn: tuitionAdminApi.reminderPreview,
    staleTime: STALE.live,
    enabled,
  })
}

export function useRunTuitionReminders() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: tuitionAdminApi.runReminders,
    onSuccess: (summary) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.remindersRoot() })
      toast.success('Reminder sweep run', {
        description: summary.detail ?? `${summary.sent ?? 0} sent.`,
      })
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not run the sweep.')
    },
  })
}

/** Extends the horizon and closes classes nobody ended. Run before billing. */
export function useRunTuitionMaintenance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: tuitionAdminApi.runMaintenance,
    onSuccess: (summary) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.sessionsRoot() })
      void qc.invalidateQueries({ queryKey: qk.tuition.scheduleStatus() })
      void qc.invalidateQueries({ queryKey: qk.tuition.reportsRoot() })
      toast.success('Maintenance run', {
        description:
          summary.detail ??
          `${summary.sessions_generated ?? 0} scheduled, ${summary.sessions_closed ?? 0} settled.`,
      })
    },
  })
}

// =====================================================================
// Library
// =====================================================================

/**
 * Everything I can see, unfiltered.
 *
 * One cache entry filtered on the client: the server's `search` is a
 * post-fetch scan of the same rows, so asking it to filter costs a round trip
 * and buys nothing. Reach is decided server-side and is not ours to filter.
 */
export function useTuitionLibrary(enabled = true) {
  return useQuery({
    queryKey: qk.tuition.library(),
    queryFn: () => tuitionLibraryApi.browse(),
    staleTime: STALE.transactional,
    enabled,
  })
}

/** Student uploads awaiting review. Empty for a student, by design. */
export function useTuitionLibraryPending(enabled = true) {
  return useQuery({
    queryKey: qk.tuition.libraryPending(),
    queryFn: tuitionLibraryApi.pending,
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useUploadLibraryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      form,
      file,
      onProgress,
    }: {
      form: LibraryUploadForm
      file: File
      onProgress?: (percent: number) => void
    }) => tuitionLibraryApi.upload(form, file, onProgress),
    onSuccess: (item) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.library() })
      void qc.invalidateQueries({ queryKey: qk.tuition.libraryPending() })
      if (item.storage_warning) {
        toast.warning('Saved, but not where expected', { description: item.storage_warning })
      } else if (item.approval_status === 'PENDING') {
        toast.success('Uploaded — awaiting approval', {
          description: 'A teacher has to approve it before anyone else can see it.',
        })
      } else {
        toast.success(`“${item.title}” shared`)
      }
    },
  })
}

export function useShareLibraryLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: LibraryLinkCreate) => tuitionLibraryApi.createLink(body),
    onSuccess: (item) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.library() })
      void qc.invalidateQueries({ queryKey: qk.tuition.libraryPending() })
      toast.success(
        item.approval_status === 'PENDING' ? 'Link shared — awaiting approval' : 'Link shared',
      )
    },
  })
}

export function useModerateLibraryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, body }: { itemId: number; body: LibraryModeration }) =>
      tuitionLibraryApi.moderate(itemId, body),
    onSuccess: (item) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.library() })
      void qc.invalidateQueries({ queryKey: qk.tuition.libraryPending() })
      toast.success(item.approval_status === 'APPROVED' ? 'Approved' : 'Rejected')
    },
  })
}

export function useUpdateLibraryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, body }: { itemId: number; body: LibraryItemUpdate }) =>
      tuitionLibraryApi.update(itemId, body),
    onSuccess: (item) => {
      void qc.invalidateQueries({ queryKey: qk.tuition.library() })
      void qc.invalidateQueries({ queryKey: qk.tuition.libraryPending() })
      if (item.approval_status === 'PENDING') {
        toast.warning('Sent back for approval', {
          description: 'Widening who can see a student upload re-opens it for review.',
        })
        return
      }
      toast.success('Updated')
    },
  })
}

export function useDeleteLibraryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: number) => tuitionLibraryApi.remove(itemId),
    onMutate: async (itemId) => {
      await qc.cancelQueries({ queryKey: qk.tuition.library() })
      const snapshot = qc.getQueryData<LibraryItemOut[]>(qk.tuition.library())
      qc.setQueryData<LibraryItemOut[]>(qk.tuition.library(), (prev) =>
        prev?.filter((i) => i.id !== itemId),
      )
      return { snapshot }
    },
    onError: (_error, _itemId, context) => {
      if (context?.snapshot) qc.setQueryData(qk.tuition.library(), context.snapshot)
    },
    onSuccess: () => toast.success('Removed from the library'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.tuition.library() })
      void qc.invalidateQueries({ queryKey: qk.tuition.libraryPending() })
    },
  })
}

/**
 * Counts a download and hands back a URL to open.
 *
 * A mutation, not a query — it records something, and the count is what tells
 * a teacher whether the worksheet they shared was ever opened.
 */
export function useDownloadLibraryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: number) => tuitionLibraryApi.download(itemId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tuition.library() })
    },
  })
}

/** Convenience over the enrollment lists, for pickers that need one name. */
export function enrollmentLabel(enrollment: TuitionEnrollmentOut): string {
  const subject = enrollment.subject?.name ?? `Subject ${enrollment.subject_id}`
  const student = enrollment.student?.full_name ?? `Student ${enrollment.student_id}`
  return `${student} · ${subject}`
}

/** Same, for a weekly slot: who, what, and when it recurs. */
export function slotLabel(slot: TuitionSlotOut): string {
  const subject = slot.subject?.name ?? `Subject ${slot.subject_id}`
  return `${subject} · ${slot.day_of_week} ${slot.start_time}`
}

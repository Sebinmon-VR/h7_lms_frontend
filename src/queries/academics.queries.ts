import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { homeworkApi, leaveApi, oversightApi, parentReportApi } from '@/api/academics.api'
import type {
  ApiDate,
  HomeworkCreate,
  HomeworkGrade,
  HomeworkSubmit,
  HomeworkUpdate,
  LeaveApply,
  LeaveDecision,
  LeaveStatus,
  LeaveType,
  ParentReportPeriod,
} from '@/api/types'
import { STALE, qk } from './keys'

// ==================================================================== homework

/**
 * One endpoint, two shapes, decided server-side by the caller's role: a
 * student's rows carry `my_status` and `my_marks`, a teacher's carry
 * `submission_count` and `expected_count`.
 *
 * `MISSED` is derived from the due date rather than stored, so the list is
 * correct the morning after with no sweep having run — but that also means it
 * changes at midnight with no write to invalidate on. Hence the ordinary
 * transactional freshness rather than a long one.
 */
export function useHomework(
  params: { classId?: number; fromDate?: ApiDate; toDate?: ApiDate } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: qk.homework.list(params.classId, params.fromDate, params.toDate),
    queryFn: () => homeworkApi.list(params),
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useHomeworkAssignment(assignmentId: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.homework.assignment(assignmentId ?? 0),
    queryFn: () => homeworkApi.get(assignmentId as number),
    staleTime: STALE.transactional,
    enabled: enabled && assignmentId != null,
  })
}

/**
 * The marking list, including the students who filed nothing — they arrive as
 * rows with no `submitted_at`. That is the point: a teacher needs the gaps
 * more than the hand-ins, so never filter them out before rendering.
 */
export function useHomeworkSubmissions(assignmentId: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.homework.submissions(assignmentId ?? 0),
    queryFn: () => homeworkApi.submissions(assignmentId as number),
    staleTime: STALE.transactional,
    enabled: enabled && assignmentId != null,
  })
}

/**
 * Homework feeds the calendar (as an all-day due-date event) and the admin's
 * homework-count report, so both go with it.
 */
function invalidateHomework(qc: QueryClient, assignmentId?: number) {
  void qc.invalidateQueries({ queryKey: qk.homework.root })
  void qc.invalidateQueries({ queryKey: qk.calendar.root })
  void qc.invalidateQueries({ queryKey: qk.oversight.root })
  if (assignmentId) {
    void qc.invalidateQueries({ queryKey: qk.homework.assignment(assignmentId) })
  }
}

export function useSetHomework() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: HomeworkCreate) => homeworkApi.create(body),
    onSuccess: (hw) => {
      invalidateHomework(qc)
      toast.success(`"${hw.title}" set`, {
        description: `Due ${hw.due_date}${
          hw.expected_count != null ? ` for ${hw.expected_count} students` : ''
        }.`,
      })
    },
  })
}

export function useUpdateHomework() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ assignmentId, body }: { assignmentId: number; body: HomeworkUpdate }) =>
      homeworkApi.update(assignmentId, body),
    onSuccess: (hw) => {
      invalidateHomework(qc, hw.id)
      toast.success('Homework updated')
    },
  })
}

export function useDeleteHomework() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assignmentId: number) => homeworkApi.remove(assignmentId),
    onSuccess: () => {
      invalidateHomework(qc)
      toast.success('Homework deleted')
    },
  })
}

/**
 * Resubmitting UPDATES the existing submission rather than adding a second,
 * so a student may hand in again freely — until it is graded, at which point
 * only a teacher's reopen unlocks it.
 */
export function useSubmitHomework() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ assignmentId, body }: { assignmentId: number; body: HomeworkSubmit }) =>
      homeworkApi.submit(assignmentId, body),
    onSuccess: (submission) => {
      invalidateHomework(qc, submission.assignment_id)
      void qc.invalidateQueries({ queryKey: qk.homework.submissions(submission.assignment_id) })
      toast.success(submission.is_late ? 'Handed in, marked late' : 'Handed in', {
        description: submission.is_late
          ? 'It was after the due date, so your teacher will see it flagged.'
          : undefined,
      })
    },
  })
}

export function useGradeHomework() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ submissionId, body }: { submissionId: string; body: HomeworkGrade }) =>
      homeworkApi.grade(submissionId, body),
    onSuccess: (submission) => {
      invalidateHomework(qc, submission.assignment_id)
      void qc.invalidateQueries({ queryKey: qk.homework.submissions(submission.assignment_id) })
      toast.success('Marked')
    },
  })
}

/** Clears the mark so the student can hand in again. */
export function useReopenSubmission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (submissionId: string) => homeworkApi.reopen(submissionId),
    onSuccess: (submission) => {
      invalidateHomework(qc, submission.assignment_id)
      void qc.invalidateQueries({ queryKey: qk.homework.submissions(submission.assignment_id) })
      toast.success('Reopened for resubmission')
    },
  })
}

// ================================================================= staff leave

export function useMyLeave(status?: LeaveStatus, enabled = true) {
  return useQuery({
    queryKey: qk.leave.mine(status),
    queryFn: () => leaveApi.mine(status),
    staleTime: STALE.transactional,
    enabled,
  })
}

/**
 * My leave, totalled by type.
 *
 * `taken_days` and `pending_days` are separate maps and BOTH must be rendered:
 * one combined figure is how two teachers get approved for the same week.
 */
export function useMyLeaveBalance(academicYearId?: number, enabled = true) {
  return useQuery({
    queryKey: qk.leave.myBalance(academicYearId),
    queryFn: () => leaveApi.myBalance(academicYearId),
    staleTime: STALE.transactional,
    enabled,
  })
}

/** The admin queue, pending first. */
export function useLeaveQueue(
  params: {
    teacherId?: number
    status?: LeaveStatus
    leaveType?: LeaveType
    fromDate?: ApiDate
    toDate?: ApiDate
  } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: qk.leave.queue({
      teacherId: params.teacherId,
      status: params.status,
      leaveType: params.leaveType,
      from: params.fromDate,
      to: params.toDate,
    }),
    queryFn: () => leaveApi.list(params),
    staleTime: STALE.transactional,
    enabled,
  })
}

/** The daily cover sheet: who is away, and what they were timetabled to take. */
export function useLeaveOnDay(day: ApiDate | null, enabled = true) {
  return useQuery({
    queryKey: qk.leave.onDay(day ?? ''),
    queryFn: () => leaveApi.onDay(day as ApiDate),
    staleTime: STALE.transactional,
    enabled: enabled && !!day,
  })
}

export function useTeacherLeaveBalance(
  teacherId: number | null,
  academicYearId?: number,
  enabled = true,
) {
  return useQuery({
    queryKey: qk.leave.balance(teacherId ?? 0, academicYearId),
    queryFn: () => leaveApi.balanceFor(teacherId as number, academicYearId),
    staleTime: STALE.transactional,
    enabled: enabled && teacherId != null,
  })
}

/**
 * Any decision moves a balance — the applicant's, and possibly a substitute's
 * timetable — so the whole leave subtree goes rather than one list.
 */
function invalidateLeave(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.leave.root })
}

export function useApplyForLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: LeaveApply) => leaveApi.apply(body),
    onSuccess: (request) => {
      invalidateLeave(qc)
      const periods = request.affected_periods.length
      toast.success('Leave requested', {
        description: periods
          ? `${periods} timetabled period${periods === 1 ? '' : 's'} will need cover.`
          : 'You were not timetabled on those dates.',
      })
    },
  })
}

/** Approve or reject; may name a substitute. A rejection needs a note. */
export function useDecideLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ requestId, body }: { requestId: number; body: LeaveDecision }) =>
      leaveApi.decide(requestId, body),
    onSuccess: (request) => {
      invalidateLeave(qc)
      toast.success(request.status === 'REJECTED' ? 'Leave rejected' : 'Leave approved', {
        description: request.substitute_teacher_name
          ? `${request.substitute_teacher_name} is covering.`
          : request.status === 'APPROVED' && request.affected_periods.length
            ? 'No substitute named — those periods are uncovered.'
            : undefined,
      })
    },
  })
}

export function useWithdrawLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (requestId: number) => leaveApi.withdraw(requestId),
    onSuccess: () => {
      invalidateLeave(qc)
      toast.success('Leave request withdrawn')
    },
  })
}

// ============================================================ admin oversight

/**
 * Cadence compliance per (class, subject) pair.
 *
 * Expensive: the server walks the mappings, the exams and the homework. It
 * also changes slowly — a pair that is overdue today is overdue in ten
 * minutes — so it is cached like the monitoring report rather than refetched
 * eagerly.
 */
export function useCadenceReport(
  params: { classId?: number; teacherId?: number; overdueOnly?: boolean } = {},
  enabled = true,
) {
  const overdueOnly = params.overdueOnly ?? true
  return useQuery({
    queryKey: qk.oversight.cadence(params.classId, params.teacherId, overdueOnly),
    queryFn: () => oversightApi.cadence({ ...params, overdueOnly }),
    staleTime: STALE.expensive,
    enabled,
  })
}

export function useExamCounts(
  params: { classId?: number; fromDate?: ApiDate; toDate?: ApiDate } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: qk.oversight.examCounts(params.classId, params.fromDate, params.toDate),
    queryFn: () => oversightApi.examCounts(params),
    staleTime: STALE.expensive,
    enabled,
  })
}

export function useHomeworkCounts(
  params: { classId?: number; fromDate?: ApiDate; toDate?: ApiDate } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: qk.oversight.homeworkCounts(params.classId, params.fromDate, params.toDate),
    queryFn: () => oversightApi.homeworkCounts(params),
    staleTime: STALE.expensive,
    enabled,
  })
}

/** The digest a parent would receive, built on demand and sending nothing. */
export function useParentReportPreview(
  studentId: number | null,
  period: ParentReportPeriod = 'WEEKLY',
  enabled = true,
) {
  return useQuery({
    queryKey: qk.oversight.parentPreview(studentId ?? 0, period),
    queryFn: () => parentReportApi.preview(studentId as number, { period }),
    staleTime: STALE.expensive,
    enabled: enabled && studentId != null,
  })
}

/**
 * Sends one child's digest. Idempotent per recipient per period, so a repeat
 * reports "already sent" rather than mailing twice — which is a SUCCESS, and
 * the message should say what actually happened rather than a flat "sent".
 */
export function useSendParentReport() {
  return useMutation({
    mutationFn: ({
      studentId,
      period,
      force,
    }: {
      studentId: number
      period?: ParentReportPeriod
      force?: boolean
    }) => parentReportApi.send(studentId, { period, force }),
    onSuccess: (result) => {
      const sent = result.sent ?? 0
      toast.success(
        sent > 0 ? `Sent to ${sent} ${sent === 1 ? 'parent' : 'parents'}` : 'Nothing was sent',
        { description: result.detail },
      )
    },
  })
}

/**
 * The whole school. Answers 202 — accepted, not finished — so the message says
 * it has started rather than that it is done.
 */
export function useSweepParentReports() {
  return useMutation({
    mutationFn: (params: {
      period?: ParentReportPeriod
      classId?: number
      force?: boolean
    }) => parentReportApi.sweep(params),
    onSuccess: (result) => {
      toast.success('Digest run started', { description: result.detail })
    },
  })
}

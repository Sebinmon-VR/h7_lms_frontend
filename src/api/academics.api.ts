import { cleanParams, del, get, post, put } from './client'
import type {
  ApiDate,
  CadenceReport,
  ExamCountsReport,
  HomeworkCountsReport,
  HomeworkCreate,
  HomeworkGrade,
  HomeworkOut,
  HomeworkSubmissionOut,
  HomeworkSubmit,
  HomeworkUpdate,
  LeaveApply,
  LeaveBalanceOut,
  LeaveDecision,
  LeaveRequestOut,
  LeaveStatus,
  LeaveType,
  ParentReportPeriod,
  ParentReportPreview,
  ParentReportSendResult,
  ParentReportSweepResult,
} from './types'

/**
 * Homework.
 *
 * One list endpoint serves both sides and the server decides which: a STUDENT
 * gets their class's assignments carrying `my_status` and `my_marks`; a
 * TEACHER gets what they set, carrying `submission_count` and
 * `expected_count`. Never assume which pair is populated — check the role.
 *
 * `MISSED` is derived from the due date having passed with nothing filed. It
 * is never stored, so it is correct the morning after with no sweep having
 * run, and it cannot be "fixed" by a write.
 */
export const homeworkApi = {
  list: (params: { classId?: number; fromDate?: ApiDate; toDate?: ApiDate } = {}) =>
    get<HomeworkOut[]>('/homework', {
      params: cleanParams({
        class_id: params.classId,
        from_date: params.fromDate,
        to_date: params.toDate,
      }),
    }),

  get: (assignmentId: number) => get<HomeworkOut>(`/homework/${assignmentId}`),

  create: (body: HomeworkCreate) => post<HomeworkOut>('/homework', body),

  update: (assignmentId: number, body: HomeworkUpdate) =>
    put<HomeworkOut>(`/homework/${assignmentId}`, body),

  remove: (assignmentId: number) => del(`/homework/${assignmentId}`),

  /**
   * The student hands in. Resubmitting UPDATES the existing submission rather
   * than creating a second one, so a "submit" button need not become "resubmit"
   * — but a graded piece is locked until a teacher reopens it.
   *
   * Needs either written work or an attachment; both empty is a 422.
   */
  submit: (assignmentId: number, body: HomeworkSubmit) =>
    post<HomeworkSubmissionOut>(`/homework/${assignmentId}/submit`, body),

  /**
   * The marking list, INCLUDING non-submitters — they come back as synthetic
   * rows with `status: 'ASSIGNED'` or `'MISSED'` and no `submitted_at`. That
   * is the point: a teacher needs the gaps more than the hand-ins.
   */
  submissions: (assignmentId: number) =>
    get<HomeworkSubmissionOut[]>(`/homework/${assignmentId}/submissions`),

  grade: (submissionId: string, body: HomeworkGrade) =>
    post<HomeworkSubmissionOut>(`/homework/submissions/${submissionId}/grade`, body),

  /** Clears the mark so the student can hand in again. */
  reopen: (submissionId: string) =>
    post<HomeworkSubmissionOut>(`/homework/submissions/${submissionId}/reopen`),
}

/**
 * Staff leave.
 *
 * A request carries `affected_periods` — the periods the applicant was
 * timetabled to take across those dates, snapshotted at application time.
 * Show it on the approval screen: it is what the approver is actually
 * agreeing to cover, and it stays answerable later even if the timetable
 * changes.
 */
export const leaveApi = {
  /**
   * A half-day request covers ONE date: `start_date` and `end_date` must
   * match, or the backend refuses it.
   */
  apply: (body: LeaveApply) => post<LeaveRequestOut>('/leave', body),

  mine: (status?: LeaveStatus) =>
    get<LeaveRequestOut[]>('/leave/me', { params: cleanParams({ status }) }),

  /**
   * My totals by type. `taken_days` and `pending_days` are SEPARATE maps and
   * both must be shown — one combined figure is how two teachers get approved
   * for the same week.
   */
  myBalance: (academicYearId?: number) =>
    get<LeaveBalanceOut>('/leave/me/balance', {
      params: cleanParams({ academic_year_id: academicYearId }),
    }),

  /** The admin queue, pending first. */
  list: (
    params: {
      teacherId?: number
      status?: LeaveStatus
      leaveType?: LeaveType
      fromDate?: ApiDate
      toDate?: ApiDate
    } = {},
  ) =>
    get<LeaveRequestOut[]>('/leave', {
      params: cleanParams({
        teacher_id: params.teacherId,
        status: params.status,
        leave_type: params.leaveType,
        from_date: params.fromDate,
        to_date: params.toDate,
      }),
    }),

  /** The daily cover sheet: who is away on this date, and what they were taking. */
  onDay: (day: ApiDate) => get<LeaveRequestOut[]>(`/leave/on/${day}`),

  /** Approve or reject; may name a substitute. A rejection needs a note. */
  decide: (requestId: number, body: LeaveDecision) =>
    post<LeaveRequestOut>(`/leave/${requestId}/decide`, body),

  /** The applicant taking it back — distinct from the approver rejecting it. */
  withdraw: (requestId: number) => post<LeaveRequestOut>(`/leave/${requestId}/withdraw`),

  balanceFor: (teacherId: number, academicYearId?: number) =>
    get<LeaveBalanceOut>(`/leave/balance/${teacherId}`, {
      params: cleanParams({ academic_year_id: academicYearId }),
    }),
}

/**
 * Academic oversight, admin only.
 *
 * Cadence REPORTS; it never blocks. Nothing stops a teacher taking a class
 * with last week's exam missing, so present these as the management lists they
 * are — worst first, subjects never examined above merely overdue.
 */
export const oversightApi = {
  /**
   * One row per (class, subject) pair, built from the teacher mappings — so it
   * reports on pairs that SHOULD have had an exam, not only on the teachers
   * already complying.
   *
   * The seven days are a rolling gap between consecutive exams, not a calendar
   * week: a calendar week lets a teacher set exams on a Friday and the next
   * Monday, miss eleven days in between, and appear compliant in both.
   */
  cadence: (params: { classId?: number; teacherId?: number; overdueOnly?: boolean } = {}) =>
    get<CadenceReport>('/admin/academics/cadence', {
      params: cleanParams({
        class_id: params.classId,
        teacher_id: params.teacherId,
        // The server defaults this to TRUE, so `false` has to survive
        // `cleanParams` — which it does, since only null/undefined/'' are cut.
        overdue_only: params.overdueOnly,
      }),
    }),

  /**
   * Exams sat against exams set. Show BOTH: 3 of 8 and 3 of 3 are the same
   * count and opposite problems. Defaults to the last four weeks.
   */
  examCounts: (params: { classId?: number; fromDate?: ApiDate; toDate?: ApiDate } = {}) =>
    get<ExamCountsReport>('/admin/academics/exam-counts', {
      params: cleanParams({
        class_id: params.classId,
        from_date: params.fromDate,
        to_date: params.toDate,
      }),
    }),

  /** Submitted, late and missed per student. Defaults to the last week. */
  homeworkCounts: (params: { classId?: number; fromDate?: ApiDate; toDate?: ApiDate } = {}) =>
    get<HomeworkCountsReport>('/admin/academics/homework-counts', {
      params: cleanParams({
        class_id: params.classId,
        from_date: params.fromDate,
        to_date: params.toDate,
      }),
    }),
}

/**
 * Parent digests.
 *
 * OFF by default (`ENABLE_PARENT_REPORTS`). These endpoints work on demand,
 * but the background sweep sends nothing until it is turned on — say so on the
 * screen rather than letting an admin think a silent sweep is running.
 *
 * Sending is idempotent per recipient per period: a second call reports
 * "already sent" rather than mailing twice, and a period in which nothing
 * happened is skipped rather than mailed as a digest of zeros.
 */
export const parentReportApi = {
  /**
   * The digest without sending it. The fee section is omitted here — it is
   * decided per recipient by their own link's `may_view_fees`, so a preview
   * cannot honestly show one.
   */
  preview: (
    studentId: number,
    params: { period?: ParentReportPeriod; fromDate?: ApiDate; toDate?: ApiDate } = {},
  ) =>
    get<ParentReportPreview>(`/admin/reports/parent-preview/${studentId}`, {
      params: cleanParams({
        period: params.period,
        from_date: params.fromDate,
        to_date: params.toDate,
      }),
    }),

  /** Emails one child's digest to every parent entitled to it. */
  send: (
    studentId: number,
    params: { period?: ParentReportPeriod; force?: boolean } = {},
  ) =>
    post<ParentReportSendResult>(
      `/admin/reports/parent-send/${studentId}`,
      undefined,
      { params: cleanParams({ period: params.period, force: params.force }) },
    ),

  /**
   * Every active student. Covers the last COMPLETE week or month, not the
   * current partial one — a Monday digest covering the week that started that
   * morning reports nothing.
   *
   * Answers 202: the work is accepted, not finished, so report it as started.
   */
  sweep: (
    params: { period?: ParentReportPeriod; classId?: number; force?: boolean } = {},
  ) =>
    post<ParentReportSweepResult>('/admin/reports/parent-sweep', undefined, {
      params: cleanParams({
        period: params.period,
        class_id: params.classId,
        force: params.force,
      }),
      timeout: 120_000,
    }),
}

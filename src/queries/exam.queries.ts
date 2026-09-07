import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { examApi } from '@/api/exam.api'
import { ApiError } from '@/api/errors'
import type {
  AnswerKeyUpdate,
  AnswerSaveIn,
  EvaluationIn,
  ExamCreate,
  ExamOut,
  ExamUpdate,
  QuestionFormUpdate,
  ReportCardGenerate,
  ReportCardOut,
  ReportCardUpdate,
  StudentSubmissionOut,
  SubmissionOut,
  SubmitIn,
  TimeConcessionGrant,
} from '@/api/types'
import { STALE, qk } from './keys'
import { markMonitoringStale } from './query-client'

function describe(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong.'
}

// =====================================================================
// Staff — exams
// =====================================================================

/**
 * Every exam this user may act on. Fetched unfiltered: `class_id` is the only
 * real server-side filter and the list is small, so one cache entry filters
 * instantly on the client and stays consistent after every write.
 */
export function useExams(enabled = true) {
  return useQuery({
    queryKey: qk.exams.list(),
    queryFn: () => examApi.list(),
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useExam(examId: number | null) {
  return useQuery({
    queryKey: qk.exams.detail(examId ?? 0),
    queryFn: () => examApi.get(examId as number),
    staleTime: STALE.transactional,
    enabled: examId != null,
  })
}

/**
 * Where the class has got to. Short-lived: it counts scripts that students
 * are handing in right now, and a stale "3 submitted" during an exam is
 * exactly the number the teacher is watching.
 */
export function useExamStats(examId: number | null, live = false) {
  return useQuery({
    queryKey: qk.exams.stats(examId ?? 0),
    queryFn: () => examApi.stats(examId as number),
    staleTime: live ? 15_000 : STALE.transactional,
    refetchInterval: live ? 30_000 : false,
    enabled: examId != null,
  })
}

export function useExamSubmissions(examId: number | null, live = false) {
  return useQuery({
    queryKey: qk.exams.submissions(examId ?? 0),
    queryFn: () => examApi.listSubmissions(examId as number),
    staleTime: live ? 15_000 : STALE.transactional,
    refetchInterval: live ? 30_000 : false,
    enabled: examId != null,
  })
}

export function useExamSubmission(examId: number | null, studentId: number | null) {
  return useQuery({
    queryKey: qk.exams.submission(examId ?? 0, studentId ?? 0),
    queryFn: () => examApi.getSubmission(examId as number, studentId as number),
    staleTime: STALE.transactional,
    enabled: examId != null && studentId != null,
  })
}

/** Writes the returned exam into every cache that holds it. */
function useExamWriter() {
  const qc = useQueryClient()
  return (exam: ExamOut) => {
    qc.setQueryData<ExamOut>(qk.exams.detail(exam.id), exam)
    qc.setQueryData<ExamOut[]>(qk.exams.list(), (prev) => {
      if (!prev) return prev
      const exists = prev.some((e) => e.id === exam.id)
      return exists ? prev.map((e) => (e.id === exam.id ? exam : e)) : [exam, ...prev]
    })
    void qc.invalidateQueries({ queryKey: qk.exams.list() })
  }
}

/** Errors are left to the form, which shows them inline next to the fields. */
export function useCreateExam() {
  const write = useExamWriter()
  return useMutation({
    mutationFn: (body: ExamCreate) => examApi.create(body),
    onSuccess: (created) => {
      write(created)
      markMonitoringStale()
      toast.success(`“${created.title}” created as a draft`)
    },
  })
}

export function useUpdateExam() {
  const write = useExamWriter()
  return useMutation({
    mutationFn: ({ examId, body }: { examId: number; body: ExamUpdate }) =>
      examApi.update(examId, body),
    onSuccess: (updated) => {
      write(updated)
      toast.success('Exam updated')
    },
  })
}

export function useDeleteExam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ examId, force }: { examId: number; force?: boolean }) =>
      examApi.remove(examId, force),
    onSuccess: (_void, { examId }) => {
      qc.setQueryData<ExamOut[]>(qk.exams.list(), (prev) => prev?.filter((e) => e.id !== examId))
      qc.removeQueries({ queryKey: qk.exams.detail(examId) })
      qc.removeQueries({ queryKey: qk.exams.submissions(examId) })
      qc.removeQueries({ queryKey: qk.exams.stats(examId) })
      void qc.invalidateQueries({ queryKey: qk.exams.list() })
      // Cascading deletes take published marks with them.
      void qc.invalidateQueries({ queryKey: qk.teacher.grades() })
      markMonitoringStale()
      toast.success('Exam deleted')
    },
  })
}

export function useReplaceQuestions() {
  const write = useExamWriter()
  return useMutation({
    mutationFn: ({ examId, body }: { examId: number; body: QuestionFormUpdate }) =>
      examApi.replaceQuestions(examId, body),
    onSuccess: (updated) => {
      write(updated)
      toast.success(`Question paper saved — ${updated.question_count} question${updated.question_count === 1 ? '' : 's'}`)
    },
  })
}

/**
 * Re-marking touches every handed-in script, so the submissions list and the
 * stats are invalidated as well as the exam itself.
 */
export function useSetAnswerKey() {
  const qc = useQueryClient()
  const write = useExamWriter()
  return useMutation({
    mutationFn: ({ examId, body }: { examId: number; body: AnswerKeyUpdate }) =>
      examApi.setAnswerKey(examId, body),
    onSuccess: (updated, { body }) => {
      write(updated)
      void qc.invalidateQueries({ queryKey: qk.exams.submissions(updated.id) })
      void qc.invalidateQueries({ queryKey: qk.exams.stats(updated.id) })
      toast.success(
        body.regrade === false
          ? 'Answer key saved'
          : 'Answer key saved and handed-in scripts re-marked',
      )
    },
  })
}

export function useUploadPaper(onProgress?: (percent: number) => void) {
  const write = useExamWriter()
  return useMutation({
    mutationFn: ({ examId, file }: { examId: number; file: File }) =>
      examApi.uploadPaper(examId, file, onProgress),
    onSuccess: (updated) => {
      write(updated)
      if (updated.question_paper_warning) {
        toast.warning('Question paper stored on the server disk', {
          description: updated.question_paper_warning,
          duration: 10_000,
        })
      } else {
        toast.success('Question paper uploaded')
      }
    },
  })
}

export function usePublishExam() {
  const write = useExamWriter()
  return useMutation({
    mutationFn: (examId: number) => examApi.publish(examId),
    onSuccess: (updated) => {
      write(updated)
      toast.success(`“${updated.title}” is now visible to the class`)
    },
    onError: (error) => toast.error('Could not publish the exam', { description: describe(error) }),
  })
}

export function useGrantConcession() {
  const write = useExamWriter()
  return useMutation({
    mutationFn: ({ examId, body }: { examId: number; body: TimeConcessionGrant }) =>
      examApi.grantConcession(examId, body),
    onSuccess: (updated, { body }) => {
      write(updated)
      toast.success(body.extra_minutes > 0 ? `${body.extra_minutes} extra minutes granted` : 'Extra time withdrawn')
    },
    onError: (error) => toast.error('Could not change the concession', { description: describe(error) }),
  })
}

/** Writes one script into the per-student cache and the exam's list. */
function useSubmissionWriter() {
  const qc = useQueryClient()
  return (submission: SubmissionOut) => {
    qc.setQueryData<SubmissionOut>(
      qk.exams.submission(submission.exam_id, submission.student_id),
      submission,
    )
    qc.setQueryData<SubmissionOut[]>(qk.exams.submissions(submission.exam_id), (prev) =>
      prev?.map((s) => (s.id === submission.id ? submission : s)),
    )
    void qc.invalidateQueries({ queryKey: qk.exams.stats(submission.exam_id) })
  }
}

/** Errors are shown inline by the grading screen. */
export function useEvaluateSubmission() {
  const qc = useQueryClient()
  const write = useSubmissionWriter()
  return useMutation({
    mutationFn: ({ examId, studentId, body }: { examId: number; studentId: number; body: EvaluationIn }) =>
      examApi.evaluate(examId, studentId, body),
    onSuccess: (valued) => {
      write(valued)
      // A correction to an already-published result also rewrites its grade row.
      void qc.invalidateQueries({ queryKey: qk.teacher.grades() })
      toast.success(`Marked ${valued.student?.full_name ?? 'the script'}`)
    },
  })
}

export function useReopenSubmission() {
  const qc = useQueryClient()
  const write = useSubmissionWriter()
  return useMutation({
    mutationFn: ({ examId, studentId }: { examId: number; studentId: number }) =>
      examApi.reopen(examId, studentId),
    onSuccess: (reopened) => {
      write(reopened)
      void qc.invalidateQueries({ queryKey: qk.teacher.grades() })
      toast.success('Script handed back to the student')
    },
    onError: (error) => toast.error('Could not reopen the script', { description: describe(error) }),
  })
}

export function usePublishResults() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (examId: number) => examApi.publishResults(examId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: qk.exams.detail(result.exam_id) })
      void qc.invalidateQueries({ queryKey: qk.exams.list() })
      void qc.invalidateQueries({ queryKey: qk.exams.stats(result.exam_id) })
      void qc.invalidateQueries({ queryKey: qk.exams.submissions(result.exam_id) })
      // Results are mirrored into the grades collection the gradebook reads.
      void qc.invalidateQueries({ queryKey: qk.teacher.grades() })
      markMonitoringStale()
      if (result.skipped_unevaluated > 0) {
        toast.warning(`Released ${result.published} result${result.published === 1 ? '' : 's'}`, {
          description: `${result.skipped_unevaluated} script${result.skipped_unevaluated === 1 ? ' is' : 's are'} still unmarked and stay hidden. Mark them and publish again.`,
          duration: 10_000,
        })
      } else {
        toast.success(result.message)
      }
    },
    onError: (error) => toast.error('Could not publish results', { description: describe(error) }),
  })
}

// =====================================================================
// Staff — report cards
// =====================================================================

export function useReportCards(enabled = true) {
  return useQuery({
    queryKey: qk.exams.reportCards(),
    queryFn: () => examApi.listReportCards(),
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useReportCard(cardId: string | null) {
  return useQuery({
    queryKey: qk.exams.reportCard(cardId ?? ''),
    queryFn: () => examApi.getReportCard(cardId as string),
    staleTime: STALE.transactional,
    enabled: !!cardId,
  })
}

function useCardWriter() {
  const qc = useQueryClient()
  return (card: ReportCardOut) => {
    qc.setQueryData<ReportCardOut>(qk.exams.reportCard(card.id), card)
    qc.setQueryData<ReportCardOut[]>(qk.exams.reportCards(), (prev) =>
      prev?.map((c) => (c.id === card.id ? card : c)),
    )
  }
}

/** Errors are shown inline by the generate dialog. */
export function useGenerateReportCards() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ReportCardGenerate) => examApi.generateReportCards(body),
    onSuccess: (batch) => {
      // Same-title cards are overwritten server-side, so a merge by id is right.
      qc.setQueryData<ReportCardOut[]>(qk.exams.reportCards(), (prev) => {
        if (!prev) return prev
        const incoming = new Map(batch.cards.map((c) => [c.id, c]))
        const kept = prev.filter((c) => !incoming.has(c.id))
        return [...batch.cards, ...kept]
      })
      void qc.invalidateQueries({ queryKey: qk.exams.reportCards() })
      toast.success(
        `Issued ${batch.generated} report card${batch.generated === 1 ? '' : 's'}${batch.published ? ' and released them' : ''}`,
      )
    },
  })
}

export function useUpdateReportCard() {
  const write = useCardWriter()
  return useMutation({
    mutationFn: ({ cardId, body }: { cardId: string; body: ReportCardUpdate }) =>
      examApi.updateReportCard(cardId, body),
    onSuccess: (updated, { body }) => {
      write(updated)
      if (body.is_published === true) toast.success('Report card released to the student')
      else if (body.is_published === false) toast.success('Report card withdrawn from the student')
      else toast.success('Report card updated')
    },
    onError: (error) => toast.error('Could not update the report card', { description: describe(error) }),
  })
}

export function useDeleteReportCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cardId: string) => examApi.deleteReportCard(cardId),
    onSuccess: (_void, cardId) => {
      qc.setQueryData<ReportCardOut[]>(qk.exams.reportCards(), (prev) => prev?.filter((c) => c.id !== cardId))
      qc.removeQueries({ queryKey: qk.exams.reportCard(cardId) })
      void qc.invalidateQueries({ queryKey: qk.exams.reportCards() })
      toast.success('Report card deleted')
    },
    onError: (error) => toast.error('Could not delete the report card', { description: describe(error) }),
  })
}

// =====================================================================
// Student
// =====================================================================

/**
 * Every released exam with this student's own state. Refetched on a short
 * interval while any exam is open, because `can_start`, `window_state` and
 * `closes_at` are the server's clock and the list is the screen a student
 * watches while waiting for one to open.
 */
export function useMyExams(enabled = true, live = false) {
  return useQuery({
    queryKey: qk.student.exams(),
    queryFn: () => examApi.myExams(),
    staleTime: live ? 30_000 : STALE.transactional,
    refetchInterval: live ? 60_000 : false,
    enabled,
  })
}

export function useMyExam(examId: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.student.exam(examId ?? 0),
    queryFn: () => examApi.myExam(examId as number),
    staleTime: STALE.transactional,
    enabled: enabled && examId != null,
  })
}

/**
 * The student's own script. A 404 is the ordinary "not started yet" case, so
 * it is treated as `null` rather than an error.
 */
export function useMySubmission(examId: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.student.submission(examId ?? 0),
    queryFn: async (): Promise<StudentSubmissionOut | null> => {
      try {
        return await examApi.mySubmission(examId as number)
      } catch (error) {
        if (error instanceof ApiError && error.isNotFound) return null
        throw error
      }
    },
    staleTime: STALE.transactional,
    enabled: enabled && examId != null,
  })
}

/** Writes a script into its cache and marks the exam views stale. */
function useMyScriptWriter() {
  const qc = useQueryClient()
  return (submission: StudentSubmissionOut) => {
    qc.setQueryData<StudentSubmissionOut | null>(qk.student.submission(submission.exam_id), submission)
    void qc.invalidateQueries({ queryKey: qk.student.exam(submission.exam_id) })
    void qc.invalidateQueries({ queryKey: qk.student.exams() })
  }
}

export function useStartExam() {
  const write = useMyScriptWriter()
  return useMutation({
    mutationFn: (examId: number) => examApi.startExam(examId),
    onSuccess: write,
    onError: (error) => toast.error('Could not start the exam', { description: describe(error) }),
  })
}

/**
 * Autosave. Silent on success — a toast per keystroke would be unbearable —
 * and the page shows the failure state itself, because a student needs to
 * know their answers are not landing far more than they need a red toast.
 */
export function useSaveAnswers() {
  const write = useMyScriptWriter()
  return useMutation({
    mutationFn: ({ examId, body }: { examId: number; body: AnswerSaveIn }) =>
      examApi.saveAnswers(examId, body),
    onSuccess: write,
  })
}

export function useUploadAnswerSheet(onProgress?: (percent: number) => void) {
  const write = useMyScriptWriter()
  return useMutation({
    mutationFn: ({ examId, file, questionId }: { examId: number; file: File; questionId?: number }) =>
      examApi.uploadAnswerSheet(examId, file, questionId, onProgress),
    onSuccess: (updated, { file }) => {
      write(updated)
      const stored = updated.attachments[updated.attachments.length - 1]
      if (stored?.storage_warning) {
        toast.warning(`“${file.name}” was stored on the server disk`, { description: stored.storage_warning })
      } else {
        toast.success(`“${file.name}” uploaded`)
      }
    },
    onError: (error) => toast.error('Upload failed', { description: describe(error) }),
  })
}

export function useSubmitExam() {
  const qc = useQueryClient()
  const write = useMyScriptWriter()
  return useMutation({
    mutationFn: ({ examId, body }: { examId: number; body?: SubmitIn }) =>
      examApi.submitExam(examId, body),
    onSuccess: (submitted) => {
      write(submitted)
      void qc.invalidateQueries({ queryKey: qk.student.grades() })
    },
    onError: (error) => toast.error('Could not submit the exam', { description: describe(error) }),
  })
}

export function useMyReportCards(enabled = true) {
  return useQuery({
    queryKey: qk.student.reportCards(),
    queryFn: examApi.myReportCards,
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useMyReportCard(cardId: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.student.reportCard(cardId ?? ''),
    queryFn: () => examApi.myReportCard(cardId as string),
    staleTime: STALE.transactional,
    enabled: enabled && !!cardId,
  })
}

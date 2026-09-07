import { cleanParams, del, get, patch, post, put } from './client'
import type {
  AnswerKeyUpdate,
  AnswerSaveIn,
  EvaluationIn,
  ExamCreate,
  ExamMode,
  ExamOut,
  ExamStats,
  ExamStatus,
  ExamUpdate,
  QuestionFormUpdate,
  ReportCardBatch,
  ReportCardGenerate,
  ReportCardOut,
  ReportCardUpdate,
  ResultsPublished,
  StudentExamOut,
  StudentSubmissionOut,
  SubmissionOut,
  SubmissionStatus,
  SubmitIn,
  TimeConcessionGrant,
} from './types'

/** Multipart helper shared by the two file endpoints. */
function fileForm(file: File, extra: Record<string, string | number | undefined> = {}) {
  const form = new FormData()
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null) form.append(key, String(value))
  }
  form.append('file', file)
  return form
}

function progressConfig(onProgress?: (percent: number) => void) {
  return {
    timeout: 120_000,
    onUploadProgress: (e: { loaded: number; total?: number }) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    },
  }
}

/**
 * The exam module.
 *
 * Three routers on the backend, split by who is talking rather than by
 * resource. `/exams` and `/report-cards` accept teachers, class teachers and
 * admins; `/students/exams` accepts students. Authority on the staff side is
 * the usual rule — a teacher owns what they set, a class teacher may act on
 * every exam filed against a class they lead, an admin on anything — so the
 * same calls serve the teacher and admin screens.
 *
 * Report cards are stricter: only the CLASS TEACHER of a class (or an admin)
 * may issue or read them. A subject teacher gets a 403 there even for a class
 * they teach in.
 */
export const examApi = {
  // ------------------------------------------------------------ staff

  /**
   * Exams this user set plus every exam in a class they lead; everything for
   * an admin. The filters are real server-side `where`s for `class_id` only
   * — the rest are post-fetch list comprehensions — so we fetch unfiltered and
   * narrow on the client, which gives one cache entry per user.
   */
  list: (params: { class_id?: number; subject_id?: number; status?: ExamStatus; mode?: ExamMode } = {}) =>
    get<ExamOut[]>('/exams', { params: cleanParams(params) }),

  /** One exam in full, answer key included. */
  get: (examId: number) => get<ExamOut>(`/exams/${examId}`),

  /**
   * Created as a DRAFT unless told otherwise, so the form and the key can be
   * finished before the class can see anything. `max_marks` defaults to what
   * the questions add up to.
   */
  create: (body: ExamCreate) => post<ExamOut>('/exams', body),

  /**
   * Partial. A 409 means the caller tried to change what the exam is worth
   * after scripts were handed in. A 400 on `status: PUBLISHED` means there is
   * nothing to answer yet.
   */
  update: (examId: number, body: ExamUpdate) => put<ExamOut>(`/exams/${examId}`, body),

  /** 409 while scripts reference it; `force` cascades and discards their work. */
  remove: (examId: number, force = false) =>
    del(`/exams/${examId}`, { params: cleanParams({ force: force || undefined }) }),

  /**
   * Replaces the whole form. A question sent back with its existing `id`
   * keeps its answers; anything else is new. Refused with 409 once any
   * script has been handed in.
   */
  replaceQuestions: (examId: number, body: QuestionFormUpdate) =>
    put<ExamOut>(`/exams/${examId}/questions`, body),

  /** Sets or corrects the key at any point; `regrade` re-marks handed-in scripts. */
  setAnswerKey: (examId: number, body: AnswerKeyUpdate) =>
    put<ExamOut>(`/exams/${examId}/answer-key`, body),

  /** The OFFLINE question paper. Stored like a study material. */
  uploadPaper: (examId: number, file: File, onProgress?: (percent: number) => void) =>
    post<ExamOut>(`/exams/${examId}/paper`, fileForm(file), progressConfig(onProgress)),

  /** DRAFT → PUBLISHED. 400 if the exam has nothing to answer. */
  publish: (examId: number) => post<ExamOut>(`/exams/${examId}/publish`),

  /** Extra minutes for one student. Zero withdraws. */
  grantConcession: (examId: number, body: TimeConcessionGrant) =>
    post<ExamOut>(`/exams/${examId}/concessions`, body),

  stats: (examId: number) => get<ExamStats>(`/exams/${examId}/stats`),

  listSubmissions: (examId: number, status?: SubmissionStatus) =>
    get<SubmissionOut[]>(`/exams/${examId}/submissions`, { params: cleanParams({ status }) }),

  /** 404 when the student has not started. */
  getSubmission: (examId: number, studentId: number) =>
    get<SubmissionOut>(`/exams/${examId}/submissions/${studentId}`),

  /** 409 if the script has not been handed in yet. */
  evaluate: (examId: number, studentId: number, body: EvaluationIn) =>
    post<SubmissionOut>(`/exams/${examId}/submissions/${studentId}/evaluate`, body),

  /** Hands the script back. Discards the valuation and withdraws a published mark. */
  reopen: (examId: number, studentId: number) =>
    post<SubmissionOut>(`/exams/${examId}/submissions/${studentId}/reopen`),

  /**
   * Releases valued scripts to the class and mirrors them into the grades
   * collection. Unmarked scripts are reported back, never released as zeros.
   */
  publishResults: (examId: number) => post<ResultsPublished>(`/exams/${examId}/results/publish`),

  // ----------------------------------------------------- report cards

  /** One card per enrolled student. Re-issuing with the same title overwrites. */
  generateReportCards: (body: ReportCardGenerate) =>
    post<ReportCardBatch>('/report-cards/generate', body, { timeout: 120_000 }),

  listReportCards: (params: { class_id?: number; student_id?: number } = {}) =>
    get<ReportCardOut[]>('/report-cards', { params: cleanParams(params) }),

  getReportCard: (cardId: string) => get<ReportCardOut>(`/report-cards/${cardId}`),

  updateReportCard: (cardId: string, body: ReportCardUpdate) =>
    put<ReportCardOut>(`/report-cards/${cardId}`, body),

  deleteReportCard: (cardId: string) => del(`/report-cards/${cardId}`),

  // ----------------------------------------------------------- student

  /**
   * Every released exam for the student's classes, each carrying their own
   * state so a list screen needs no further call. Questions are withheld.
   */
  myExams: (params: { subject_id?: number; upcoming_only?: boolean } = {}) =>
    get<StudentExamOut[]>('/students/exams', {
      params: cleanParams({ ...params, upcoming_only: params.upcoming_only || undefined }),
    }),

  /** The paper, served only once the window has opened. 404 for a draft. */
  myExam: (examId: number) => get<StudentExamOut>(`/students/exams/${examId}`),

  /** Stamps the clock. Idempotent — a second call returns the script in progress. */
  startExam: (examId: number) => post<StudentSubmissionOut>(`/students/exams/${examId}/start`),

  /** Merged by question id, so one question at a time is fine. */
  saveAnswers: (examId: number, body: AnswerSaveIn) =>
    patch<StudentSubmissionOut>(`/students/exams/${examId}/answers`, body),

  /** An answer sheet for the script, or a file answering one question. */
  uploadAnswerSheet: (
    examId: number,
    file: File,
    questionId?: number,
    onProgress?: (percent: number) => void,
  ) =>
    post<StudentSubmissionOut>(
      `/students/exams/${examId}/attachments`,
      fileForm(file, { question_id: questionId }),
      progressConfig(onProgress),
    ),

  /** Final. Any answers sent along are saved first. */
  submitExam: (examId: number, body: SubmitIn = {}) =>
    post<StudentSubmissionOut>(`/students/exams/${examId}/submit`, body),

  /** 404 when the student has not started. Marks are null until published. */
  mySubmission: (examId: number) => get<StudentSubmissionOut>(`/students/exams/${examId}/submission`),

  /** Published cards only. */
  myReportCards: () => get<ReportCardOut[]>('/students/report-cards'),
  myReportCard: (cardId: string) => get<ReportCardOut>(`/students/report-cards/${cardId}`),
}

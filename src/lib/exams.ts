import type {
  AnswerValue,
  ExamMode,
  ExamQuestionOut,
  ExamStatus,
  ExamWindowState,
  GradeBand,
  GradingScheme,
  QuestionOption,
  QuestionType,
  StudentExamOut,
  StudentQuestionOut,
  SubmissionStatus,
} from '@/api/types'
import { parseApiDateTime } from './datetime'

/**
 * Exam-module vocabulary and the small pieces of arithmetic the screens
 * share. Nothing here touches the network. Where a rule is mirrored from the
 * backend (grade bands, key matching) the server stays the authority — these
 * exist so a screen can preview the outcome before the round trip, never to
 * decide it.
 */

// ---------------------------------------------------------------- labels

export const EXAM_MODE_LABEL: Record<ExamMode, string> = {
  ONLINE: 'Online',
  OFFLINE: 'Offline',
}

export const EXAM_MODE_HELP: Record<ExamMode, string> = {
  ONLINE: 'Students answer a question form in the LMS. Objective questions can be marked automatically.',
  OFFLINE: 'Students write on paper and upload a scan or photo of their answer sheet, or answer a form you set.',
}

export const EXAM_STATUS_LABEL: Record<ExamStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  CANCELLED: 'Cancelled',
}

export const WINDOW_STATE_LABEL: Record<ExamWindowState, string> = {
  NOT_OPEN: 'Not open yet',
  OPEN: 'Open',
  GRACE: 'Grace period',
  CLOSED: 'Closed',
}

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  EVALUATED: 'Marked',
  MISSED: 'Missed',
}

export const GRADING_SCHEME_LABEL: Record<GradingScheme, string> = {
  MARKS: 'Marks',
  GRADE: 'Letter grade',
}

export interface QuestionTypeMeta {
  label: string
  short: string
  description: string
  /** The answer is one or more option keys. */
  choice: boolean
  /** The answer key can settle it without a human. */
  objective: boolean
}

export const QUESTION_TYPE_META: Record<QuestionType, QuestionTypeMeta> = {
  MCQ: {
    label: 'Multiple choice',
    short: 'MCQ',
    description: 'One correct option.',
    choice: true,
    objective: true,
  },
  MULTI_SELECT: {
    label: 'Multiple select',
    short: 'Multi',
    description: 'Several correct options; all of them are needed for the mark.',
    choice: true,
    objective: true,
  },
  TRUE_FALSE: {
    label: 'True or false',
    short: 'T/F',
    description: 'Options are filled in for you.',
    choice: true,
    objective: true,
  },
  SHORT_ANSWER: {
    label: 'Short answer',
    short: 'Short',
    description: 'A word or a line, matched against accepted wordings ignoring case and spacing.',
    choice: false,
    objective: true,
  },
  LONG_ANSWER: {
    label: 'Long answer',
    short: 'Essay',
    description: 'An essay. Always marked by a person.',
    choice: false,
    objective: false,
  },
  NUMERIC: {
    label: 'Numeric',
    short: 'Number',
    description: 'A number, compared within an optional tolerance.',
    choice: false,
    objective: true,
  },
  FILE_UPLOAD: {
    label: 'File upload',
    short: 'File',
    description: 'The answer is an attached file — a diagram, a worked sheet.',
    choice: false,
    objective: false,
  },
}

export const QUESTION_TYPES: QuestionType[] = [
  'MCQ',
  'MULTI_SELECT',
  'TRUE_FALSE',
  'SHORT_ANSWER',
  'LONG_ANSWER',
  'NUMERIC',
  'FILE_UPLOAD',
]

export function isChoiceType(type: QuestionType): boolean {
  return QUESTION_TYPE_META[type].choice
}

export function isObjectiveType(type: QuestionType): boolean {
  return QUESTION_TYPE_META[type].objective
}

// ----------------------------------------------------------------- bands

/** A common school scale, offered as a one-click preset. */
export const DEFAULT_GRADE_BANDS: GradeBand[] = [
  { grade: 'A+', min_percentage: 90, description: 'Outstanding' },
  { grade: 'A', min_percentage: 80, description: 'Excellent' },
  { grade: 'B', min_percentage: 70, description: 'Very good' },
  { grade: 'C', min_percentage: 60, description: 'Good' },
  { grade: 'D', min_percentage: 50, description: 'Satisfactory' },
  { grade: 'E', min_percentage: 35, description: 'Needs improvement' },
]

export function sortBands(bands: GradeBand[]): GradeBand[] {
  return [...bands].sort((a, b) => b.min_percentage - a.min_percentage)
}

/**
 * The highest band the percentage reaches, or null when below every floor —
 * a scale starting at 35 means "below this is ungraded", not "the lowest
 * grade". Mirrors `grade_for` on the backend.
 */
export function gradeForPercentage(percentage: number | null | undefined, bands: GradeBand[]): string | null {
  if (percentage == null || !Number.isFinite(percentage)) return null
  for (const band of sortBands(bands)) {
    if (percentage >= band.min_percentage) return band.grade
  }
  return null
}

// ------------------------------------------------------------- questions

/** "A", "B", ... "Z", then "AA". */
export function optionKey(index: number): string {
  let n = index
  let key = ''
  do {
    key = String.fromCharCode(65 + (n % 26)) + key
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return key
}

export function questionsTotal(questions: { marks: number }[]): number {
  return Math.round(questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0) * 100) / 100
}

/** Numbers that print cleanly: 5 → "5", 2.5 → "2.5", 1.333 → "1.33". */
export function formatMark(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

/** Every value a choice answer might arrive as, as an uppercase set of keys. */
export function choiceSet(value: AnswerValue | undefined): Set<string> {
  if (value == null) return new Set()
  const values = Array.isArray(value) ? value : [value]
  return new Set(values.map((v) => String(v).trim().toUpperCase()).filter(Boolean))
}

function optionLabel(options: QuestionOption[], key: string): string {
  const match = options.find((o) => o.key.toUpperCase() === key.toUpperCase())
  return match ? `${match.key}. ${match.text}` : key
}

/**
 * A choice, text or number answer as a person would read it. Returns null
 * for "nothing given" so callers can render an honest blank.
 */
export function formatAnswer(
  question: Pick<ExamQuestionOut, 'question_type' | 'options'>,
  answer: AnswerValue | undefined,
): string | null {
  if (answer == null || (typeof answer === 'string' && answer.trim() === '')) return null
  if (Array.isArray(answer) && answer.length === 0) return null

  if (isChoiceType(question.question_type)) {
    const keys = [...choiceSet(answer)]
    if (keys.length === 0) return null
    return keys.map((k) => optionLabel(question.options, k)).join(', ')
  }

  if (Array.isArray(answer)) return answer.join(' / ')
  return String(answer)
}

/** The key for a question as a person would read it, or null when unset. */
export function formatAnswerKey(
  question: Pick<ExamQuestionOut, 'question_type' | 'options' | 'correct_answer'>,
): string | null {
  return formatAnswer(question, question.correct_answer)
}

export function hasAnswerKey(question: Pick<ExamQuestionOut, 'correct_answer'>): boolean {
  const key = question.correct_answer
  if (key == null) return false
  if (typeof key === 'string') return key.trim().length > 0
  if (Array.isArray(key)) return key.length > 0
  return true
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/**
 * Whether an answer matches the key. `null` means "cannot be decided here":
 * no key, or a type only a person can mark. Mirrors `_matches_key`, and is
 * used to preview the verdict on the grading screen — the server's own
 * `question_scores` win wherever they exist.
 */
export function answerMatchesKey(
  question: Pick<ExamQuestionOut, 'question_type' | 'options' | 'correct_answer' | 'tolerance'>,
  answer: AnswerValue | undefined,
): boolean | null {
  if (!hasAnswerKey(question) || !isObjectiveType(question.question_type)) return null
  const key = question.correct_answer

  if (isChoiceType(question.question_type)) {
    const given = choiceSet(answer)
    const expected = choiceSet(key)
    if (given.size === 0) return false
    if (given.size !== expected.size) return false
    for (const k of given) if (!expected.has(k)) return false
    return true
  }

  if (question.question_type === 'NUMERIC') {
    const given = Number(String(answer ?? '').trim())
    const expected = Number(key)
    if (!Number.isFinite(given) || !Number.isFinite(expected)) return false
    return Math.abs(given - expected) <= (question.tolerance ?? 0)
  }

  const accepted = Array.isArray(key) ? key : [key]
  const normalized = normalizeText(answer)
  return normalized.length > 0 && accepted.some((a) => normalizeText(a) === normalized)
}

/** True when the student left this question blank. */
export function isBlankAnswer(answer: AnswerValue | undefined, attachments: string[] = []): boolean {
  if (attachments.length > 0) return false
  if (answer == null) return true
  if (typeof answer === 'string') return answer.trim() === ''
  if (Array.isArray(answer)) return answer.length === 0
  return false
}

export function sortQuestions<T extends { order: number }>(questions: T[]): T[] {
  return [...questions].sort((a, b) => a.order - b.order)
}

// --------------------------------------------------------- student state

/**
 * What the student can do with an exam right now, folded into one word so a
 * card can pick its verb. Derived from the server's own flags — never from
 * the client's clock — so it agrees with what the API will accept.
 */
export type StudentExamPhase =
  | 'cancelled'
  | 'not_open'
  | 'ready'
  | 'in_progress'
  | 'submitted'
  | 'marked'
  | 'missed'
  | 'closed'

export function studentExamPhase(exam: StudentExamOut): StudentExamPhase {
  if (exam.status === 'CANCELLED') return 'cancelled'
  if (exam.submission_status === 'EVALUATED' && exam.results_published) return 'marked'
  if (exam.submission_status === 'EVALUATED' || exam.submission_status === 'SUBMITTED') return 'submitted'
  if (exam.submission_status === 'MISSED') return 'missed'
  if (exam.window_state === 'NOT_OPEN') return 'not_open'
  if (exam.window_state === 'CLOSED') return exam.submission_status === 'IN_PROGRESS' ? 'missed' : 'closed'
  if (exam.submission_status === 'IN_PROGRESS') return 'in_progress'
  return exam.can_start ? 'ready' : 'closed'
}

export const STUDENT_PHASE_LABEL: Record<StudentExamPhase, string> = {
  cancelled: 'Cancelled',
  not_open: 'Coming up',
  ready: 'Ready to start',
  in_progress: 'In progress',
  submitted: 'Handed in',
  marked: 'Marked',
  missed: 'Missed',
  closed: 'Closed',
}

/** Milliseconds until an API instant, or null when it cannot be parsed. */
export function msUntil(iso: string | null | undefined, now = new Date()): number | null {
  const d = parseApiDateTime(iso)
  return d ? d.getTime() - now.getTime() : null
}

/** "1:04:09" for a running clock; "0:00" when time is up. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

/** Question count wording that tolerates a paper-only OFFLINE exam. */
export function describePaper(exam: { mode: ExamMode; question_count: number; question_paper_url: string | null }): string {
  if (exam.question_count > 0) {
    return `${exam.question_count} question${exam.question_count === 1 ? '' : 's'}`
  }
  if (exam.mode === 'OFFLINE' && exam.question_paper_url) return 'Question paper attached'
  return 'No questions yet'
}

export type StudentQuestion = StudentQuestionOut

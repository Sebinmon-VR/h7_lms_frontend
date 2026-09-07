import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  ExternalLink,
  Hourglass,
  KeyRound,
  Lightbulb,
  Paperclip,
  RotateCcw,
  Save,
  Sparkles,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ApiError } from '@/api/errors'
import type { AnswerOut, AttachmentOut, EvaluationIn, ExamOut, ExamQuestionOut, SubmissionOut } from '@/api/types'
import {
  useEvaluateSubmission,
  useExam,
  useExamSubmission,
  useExamSubmissions,
  useReopenSubmission,
} from '@/queries/exam.queries'
import { cn } from '@/lib/cn'
import { formatDateTime, formatRelative } from '@/lib/datetime'
import {
  QUESTION_TYPE_META,
  answerMatchesKey,
  choiceSet,
  formatAnswer,
  formatAnswerKey,
  formatMark,
  gradeForPercentage,
  hasAnswerKey,
  isBlankAnswer,
  isObjectiveType,
  sortQuestions,
} from '@/lib/exams'
import { fileKind, fileNameFromUrl, resolveFileUrl } from '@/lib/files'
import { formatPercent, performanceTone } from '@/lib/format'
import { className as classLabel, subjectName } from '@/lib/select'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SubmissionStatusBadge } from '@/components/domain/badges'
import { FileTypeIcon } from '@/components/domain/file-type-icon'
import { ErrorState } from '@/components/feedback/states'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { useExamScope } from './exam-scope'

/**
 * Marking one script.
 *
 * Two columns that scroll independently: what the student wrote on the
 * left, the answer key and the marks on the right. They are the same list of
 * questions in the same order, and each side can jump the other to the same
 * question, so the marker's eye never has to hunt — read the answer, glance
 * right at the key, type a mark, move on.
 *
 * Every mark the key already decided is shown as such and can be overridden;
 * the backend records which lines a person settled and which the key did.
 * Nothing here reaches the student until the exam's results are published.
 */

interface LineState {
  marks: string
  remarks: string
}

type Verdict = 'correct' | 'incorrect' | 'blank' | 'needs_marking' | 'marked'

const PERCENT_TONE: Record<ReturnType<typeof performanceTone>, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  muted: 'text-muted-foreground',
}

const VERDICT_LOOK: Record<Verdict, { label: string; tone: 'success' | 'danger' | 'neutral' | 'warning' | 'info'; Icon: typeof Check }> = {
  correct: { label: 'Correct', tone: 'success', Icon: CheckCircle2 },
  incorrect: { label: 'Incorrect', tone: 'danger', Icon: XCircle },
  blank: { label: 'No answer', tone: 'neutral', Icon: CircleDashed },
  needs_marking: { label: 'Needs marking', tone: 'warning', Icon: Hourglass },
  marked: { label: 'Marked', tone: 'info', Icon: Check },
}

function verdictFor(question: ExamQuestionOut, answer: AnswerOut | undefined, line: LineState | undefined, auto: boolean): Verdict {
  const blank = isBlankAnswer(answer?.answer, answer?.attachments ?? [])
  if (isObjectiveType(question.question_type) && hasAnswerKey(question)) {
    if (blank) return 'blank'
    const matches = answerMatchesKey(question, answer?.answer)
    if (matches === true) return 'correct'
    if (matches === false) return 'incorrect'
  }
  if (line && line.marks.trim() !== '' && !auto) return 'marked'
  if (blank) return 'blank'
  return 'needs_marking'
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

// ----------------------------------------------------------- attachments

function AttachmentPreview({ attachment }: { attachment: AttachmentOut }) {
  const url = resolveFileUrl(attachment.file_url)
  const kind = fileKind(attachment.filename ?? attachment.file_url)
  const name = attachment.filename ?? fileNameFromUrl(attachment.file_url)
  const [expanded, setExpanded] = React.useState(kind === 'image')

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-3 px-3 py-2">
        <FileTypeIcon url={name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-2xs text-muted-foreground">
            {attachment.uploaded_at ? `Uploaded ${formatRelative(attachment.uploaded_at)}` : ''}
            {attachment.storage_warning ? ' · stored on the server disk' : ''}
          </p>
        </div>
        {(kind === 'image' || kind === 'pdf') && (
          <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Hide' : 'Preview'}
          </Button>
        )}
        {url && (
          <Button asChild variant="outline" size="sm" icon={<ExternalLink />}>
            <a href={url} target="_blank" rel="noreferrer">
              Open
            </a>
          </Button>
        )}
      </div>
      {expanded && url && kind === 'image' && (
        <a href={url} target="_blank" rel="noreferrer" className="block border-t border-border bg-muted/40">
          <img src={url} alt={name} className="mx-auto max-h-[70vh] w-auto max-w-full object-contain" loading="lazy" />
        </a>
      )}
      {expanded && url && kind === 'pdf' && (
        <iframe src={url} title={name} className="h-[70vh] w-full border-t border-border bg-white" />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- answer

function StudentAnswer({ question, answer }: { question: ExamQuestionOut; answer: AnswerOut | undefined }) {
  const type = question.question_type
  const blank = isBlankAnswer(answer?.answer, [])

  if (QUESTION_TYPE_META[type].choice) {
    const chosen = choiceSet(answer?.answer)
    return (
      <ul className="space-y-1.5">
        {question.options.map((option) => {
          const picked = chosen.has(option.key.toUpperCase())
          return (
            <li
              key={option.key}
              className={cn(
                'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm',
                picked ? 'border-primary bg-primary/8 font-medium' : 'border-border/70 text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold',
                  picked ? 'bg-primary text-primary-foreground' : 'bg-muted',
                )}
              >
                {option.key}
              </span>
              <span className="min-w-0 flex-1">{option.text}</span>
              {picked && <Badge tone="primary" size="sm">Chosen</Badge>}
            </li>
          )
        })}
        {chosen.size === 0 && <li className="text-xs italic text-muted-foreground">Nothing selected.</li>}
      </ul>
    )
  }

  if (blank) {
    return <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm italic text-muted-foreground">No answer written.</p>
  }

  const text = formatAnswer(question, answer?.answer) ?? ''
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface/60 px-3.5 py-3 text-sm leading-relaxed',
        type === 'LONG_ANSWER' ? 'whitespace-pre-wrap' : 'font-medium',
        type === 'NUMERIC' && 'font-mono text-base',
      )}
    >
      {text}
    </div>
  )
}

// --------------------------------------------------------------- key row

function KeyRow({
  question,
  index,
  line,
  verdict,
  auto,
  scheme,
  onChange,
}: {
  question: ExamQuestionOut
  index: number
  line: LineState
  verdict: Verdict
  auto: boolean
  scheme: 'MARKS' | 'GRADE'
  onChange: (patch: Partial<LineState>) => void
}) {
  const key = formatAnswerKey(question)
  const look = VERDICT_LOOK[verdict]
  const marks = Number(line.marks)
  const invalid = line.marks.trim() !== '' && (!Number.isFinite(marks) || marks < 0 || marks > question.marks)

  return (
    <div id={`key-${question.id}`} className={cn('rounded-lg border p-3 transition-colors', invalid ? 'border-danger/50' : 'border-border/80')}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => scrollTo(`answer-${question.id}`)}
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-2xs font-bold text-primary hover:bg-primary/20"
          aria-label={`Show answer to question ${index + 1}`}
        >
          {index + 1}
        </button>
        <span className="text-2xs text-muted-foreground">{QUESTION_TYPE_META[question.question_type].short}</span>
        <Badge tone={look.tone} size="sm" className="ml-auto">
          <look.Icon />
          {look.label}
        </Badge>
      </div>

      <div className="mt-2 flex items-start gap-2 text-sm">
        <KeyRound className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        {key ? (
          <p className="min-w-0 break-words">
            <span className="font-medium">{key}</span>
            {question.question_type === 'NUMERIC' && question.tolerance ? (
              <span className="text-muted-foreground"> ± {formatMark(question.tolerance)}</span>
            ) : null}
          </p>
        ) : (
          <p className="text-muted-foreground">
            {isObjectiveType(question.question_type) ? 'No key set.' : 'Marked by hand.'}
          </p>
        )}
      </div>
      {question.answer_explanation && (
        <p className="mt-1.5 flex items-start gap-2 text-xs text-muted-foreground">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <span>{question.answer_explanation}</span>
        </p>
      )}

      {scheme === 'MARKS' && (
        <div className="mt-2.5 flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={question.marks}
            step="any"
            inputMode="decimal"
            value={line.marks}
            invalid={invalid}
            aria-label={`Marks for question ${index + 1}`}
            className="h-8 w-20 text-right font-semibold"
            onChange={(e) => onChange({ marks: e.target.value })}
          />
          <span className="text-xs text-muted-foreground">/ {formatMark(question.marks)}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="xs" onClick={() => onChange({ marks: String(question.marks) })}>
              Full
            </Button>
            <Button variant="ghost" size="xs" onClick={() => onChange({ marks: '0' })}>
              Zero
            </Button>
          </div>
        </div>
      )}
      {auto && line.marks.trim() !== '' && (
        <p className="mt-1 flex items-center gap-1 text-2xs text-muted-foreground">
          <Sparkles className="size-3" />
          Decided by the key — edit to override.
        </p>
      )}
      {invalid && (
        <p className="mt-1 text-2xs text-danger" role="alert">
          Between 0 and {formatMark(question.marks)}.
        </p>
      )}
      <Input
        value={line.remarks}
        placeholder="Remark for this question (optional)"
        aria-label={`Remark for question ${index + 1}`}
        className="mt-2 h-8 text-xs"
        onChange={(e) => onChange({ remarks: e.target.value })}
      />
    </div>
  )
}

// ----------------------------------------------------------------- page

function seedLines(exam: ExamOut, submission: SubmissionOut): Record<number, LineState> {
  const lines: Record<number, LineState> = {}
  const byQuestion = new Map(submission.question_scores.map((s) => [s.question_id, s]))
  for (const q of exam.questions) {
    const score = byQuestion.get(q.id)
    lines[q.id] = {
      marks: score ? String(score.marks_awarded) : '',
      remarks: score?.remarks ?? '',
    }
  }
  return lines
}

export default function GradingPage() {
  const scope = useExamScope()
  const navigate = useNavigate()
  const params = useParams<{ examId: string; studentId: string }>()
  const examId = Number(params.examId)
  const studentId = Number(params.studentId)

  const examQuery = useExam(Number.isFinite(examId) ? examId : null)
  const submissionQuery = useExamSubmission(examId, Number.isFinite(studentId) ? studentId : null)
  const submissionsQuery = useExamSubmissions(examId)
  const evaluate = useEvaluateSubmission()
  const reopen = useReopenSubmission()

  const exam = examQuery.data
  const submission = submissionQuery.data

  const [lines, setLines] = React.useState<Record<number, LineState>>({})
  const [flatMarks, setFlatMarks] = React.useState('')
  const [grade, setGrade] = React.useState<string>('')
  const [remarks, setRemarks] = React.useState('')
  const [seeded, setSeeded] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmReopen, setConfirmReopen] = React.useState(false)

  // Seed once per script (keyed by id + last update), never over live edits.
  React.useEffect(() => {
    if (!exam || !submission) return
    const stamp = `${submission.id}:${submission.updated_at ?? ''}`
    if (seeded === stamp) return
    setLines(seedLines(exam, submission))
    setFlatMarks(submission.marks_obtained != null ? String(submission.marks_obtained) : '')
    setGrade(submission.grade ?? '')
    setRemarks(submission.evaluator_remarks ?? '')
    setSeeded(stamp)
    setError(null)
  }, [exam, submission, seeded])

  const questions = React.useMemo(() => (exam ? sortQuestions(exam.questions) : []), [exam])
  const answers = React.useMemo(() => new Map((submission?.answers ?? []).map((a) => [a.question_id, a])), [submission])
  /** question id -> the mark the key awarded, for lines the key decided. */
  const autoMarks = React.useMemo(
    () => new Map((submission?.question_scores ?? []).filter((s) => s.auto).map((s) => [s.question_id, s.marks_awarded])),
    [submission],
  )
  const isAuto = React.useCallback(
    (questionId: number, marks: string) => autoMarks.has(questionId) && marks === String(autoMarks.get(questionId)),
    [autoMarks],
  )

  // Marking order: everyone handed in, by name, so "next" is predictable.
  const order = React.useMemo(
    () =>
      (submissionsQuery.data ?? [])
        .filter((s) => s.status === 'SUBMITTED' || s.status === 'EVALUATED')
        .sort((a, b) => (a.student?.full_name ?? '').localeCompare(b.student?.full_name ?? '')),
    [submissionsQuery.data],
  )
  const position = order.findIndex((s) => s.student_id === studentId)
  const prev = position > 0 ? order[position - 1] : null
  const next = position >= 0 && position < order.length - 1 ? order[position + 1] : null
  const nextUnmarked = order.find((s, i) => i !== position && s.status === 'SUBMITTED') ?? null
  const markedCount = order.filter((s) => s.status === 'EVALUATED').length

  const usesLines = questions.length > 0
  const total = React.useMemo(() => {
    if (!usesLines) {
      const n = Number(flatMarks)
      return flatMarks.trim() === '' || !Number.isFinite(n) ? null : n
    }
    let sum = 0
    let any = false
    for (const q of questions) {
      const v = lines[q.id]?.marks ?? ''
      if (v.trim() === '') continue
      const n = Number(v)
      if (!Number.isFinite(n)) continue
      sum += n
      any = true
    }
    return any ? Math.round(sum * 100) / 100 : null
  }, [usesLines, flatMarks, lines, questions])

  const maxMarks = exam?.max_marks ?? 0
  const percentage = total != null && maxMarks > 0 ? (total / maxMarks) * 100 : null
  const derivedGrade = exam ? gradeForPercentage(percentage, exam.grade_bands) : null
  const passed = exam?.pass_marks != null && total != null ? total >= exam.pass_marks : null

  const lineErrors = questions.filter((q) => {
    const v = lines[q.id]?.marks ?? ''
    if (v.trim() === '') return false
    const n = Number(v)
    return !Number.isFinite(n) || n < 0 || n > q.marks
  })
  const unmarkedLines = questions.filter((q) => (lines[q.id]?.marks ?? '').trim() === '')
  const overTotal = total != null && maxMarks > 0 && total > maxMarks
  const flatInvalid = !usesLines && flatMarks.trim() !== '' && (!Number.isFinite(Number(flatMarks)) || Number(flatMarks) < 0)

  const isGrade = exam?.grading_scheme === 'GRADE'
  const ready =
    !!submission &&
    submission.status !== 'IN_PROGRESS' &&
    lineErrors.length === 0 &&
    !overTotal &&
    !flatInvalid &&
    (isGrade ? grade !== '' : total != null)

  const buildPayload = (): EvaluationIn => {
    const body: EvaluationIn = { remarks: remarks.trim() || null }
    if (usesLines) {
      body.question_scores = questions
        .filter((q) => (lines[q.id]?.marks ?? '').trim() !== '')
        .map((q) => ({
          question_id: q.id,
          marks_awarded: Number(lines[q.id].marks),
          remarks: lines[q.id].remarks.trim() || null,
        }))
    } else if (flatMarks.trim() !== '') {
      body.marks_obtained = Number(flatMarks)
    }
    if (isGrade) body.grade = grade
    return body
  }

  const save = async (then: 'stay' | 'next') => {
    if (!exam || !ready) return
    setError(null)
    try {
      await evaluate.mutateAsync({ examId: exam.id, studentId, body: buildPayload() })
      if (then === 'next') {
        const target = nextUnmarked ?? next
        if (target) navigate(scope.gradePath(exam.id, target.student_id))
        else navigate(`${scope.examPath(exam.id)}?tab=submissions`)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the marks.')
    }
  }

  if (examQuery.isPending || submissionQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_28rem]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    )
  }
  if (examQuery.isError || !exam) return <ErrorState error={examQuery.error} onRetry={() => examQuery.refetch()} />
  if (submissionQuery.isError || !submission) {
    return (
      <>
        <Link to={`${scope.examPath(examId)}?tab=submissions`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Back to scripts
        </Link>
        <div className="mt-4">
          <ErrorState error={submissionQuery.error ?? new ApiError({ message: 'This student has not started the exam.', status: 404 })} onRetry={() => submissionQuery.refetch()} />
        </div>
      </>
    )
  }

  const studentName = submission.student?.full_name ?? `Student #${String(submission.student_id).slice(-6)}`
  const scriptAttachments = submission.attachments.filter((a) => a.question_id == null)
  const byQuestionAttachments = new Map<number, AttachmentOut[]>()
  for (const a of submission.attachments) {
    if (a.question_id == null) continue
    const list = byQuestionAttachments.get(a.question_id)
    if (list) list.push(a)
    else byQuestionAttachments.set(a.question_id, [a])
  }
  const inProgress = submission.status === 'IN_PROGRESS'

  return (
    <>
      <Link
        to={`${scope.examPath(exam.id)}?tab=submissions`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {exam.title}
      </Link>

      {/* ------------------------------------------------------ header */}
      <div className="mt-3 mb-5 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={studentName} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight">{studentName}</h1>
              <SubmissionStatusBadge status={submission.status} size="sm" />
              {submission.is_late && (
                <Badge tone="warning" size="sm">
                  <Hourglass />
                  {submission.late_by_minutes > 0 ? `${Math.round(submission.late_by_minutes)} min late` : 'Late'}
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {classLabel(exam)} · {subjectName(exam)}
              {submission.submitted_at ? ` · handed in ${formatDateTime(submission.submitted_at)}` : ''}
              {submission.evaluated_at && submission.evaluator
                ? ` · marked by ${submission.evaluator.full_name} ${formatRelative(submission.evaluated_at)}`
                : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {position >= 0 ? `${position + 1} of ${order.length}` : ''} · {markedCount} marked
          </span>
          {prev ? (
            <Button asChild variant="outline" size="icon-sm" aria-label="Previous student">
              <Link to={scope.gradePath(exam.id, prev.student_id)}>
                <ChevronLeft />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon-sm" disabled aria-label="Previous student">
              <ChevronLeft />
            </Button>
          )}
          {next ? (
            <Button asChild variant="outline" size="icon-sm" aria-label="Next student">
              <Link to={scope.gradePath(exam.id, next.student_id)}>
                <ChevronRight />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon-sm" disabled aria-label="Next student">
              <ChevronRight />
            </Button>
          )}
        </div>
      </div>

      {inProgress && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-info/30 bg-info/8 p-4 text-sm">
          <Hourglass className="mt-0.5 size-4 shrink-0 text-info" />
          <p>
            <span className="font-medium">Not handed in yet.</span>{' '}
            <span className="text-muted-foreground">
              {studentName} started {submission.started_at ? formatRelative(submission.started_at) : ''} and is still
              working. You can read what they have saved so far, but marks can only be recorded once they submit.
            </span>
          </p>
        </div>
      )}

      {/* --------------------------------------------------- split view */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] xl:grid-cols-[minmax(0,1fr)_minmax(24rem,32rem)]">
        {/* ----------------------------------------------- answers */}
        <section aria-label="Student's answers" className="min-w-0 space-y-4">
          {scriptAttachments.length > 0 && (
            <Card className="p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Paperclip className="size-4 text-primary" />
                <h2 className="text-sm font-semibold">Answer sheets</h2>
                <span className="text-xs text-muted-foreground">
                  {scriptAttachments.length} file{scriptAttachments.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {scriptAttachments.map((a) => (
                  <AttachmentPreview key={a.file_url} attachment={a} />
                ))}
              </div>
            </Card>
          )}

          {questions.length === 0 && scriptAttachments.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Nothing was written or uploaded on this script.
            </Card>
          )}

          {questions.map((q, index) => {
            const answer = answers.get(q.id)
            const line = lines[q.id]
            const auto = isAuto(q.id, line?.marks ?? '')
            const verdict = verdictFor(q, answer, line, auto)
            const look = VERDICT_LOOK[verdict]
            const questionFiles = [
              ...(byQuestionAttachments.get(q.id) ?? []),
              ...(answer?.attachments ?? [])
                .filter((url) => !(byQuestionAttachments.get(q.id) ?? []).some((a) => a.file_url === url))
                .map<AttachmentOut>((url) => ({ file_url: url, filename: null, provider: null, storage_warning: null, uploaded_at: null, question_id: q.id })),
            ]
            return (
              <Card key={q.id} id={`answer-${q.id}`} className="scroll-mt-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  <Badge tone="outline" size="sm">
                    {QUESTION_TYPE_META[q.question_type].label}
                  </Badge>
                  <Badge tone={look.tone} size="sm">
                    <look.Icon />
                    {look.label}
                  </Badge>
                  <span className="ml-auto text-sm font-semibold tabular-nums">
                    {exam.grading_scheme === 'MARKS' && line?.marks.trim() ? (
                      <span className={cn(Number(line.marks) === q.marks ? 'text-success' : Number(line.marks) === 0 ? 'text-danger' : 'text-foreground')}>
                        {formatMark(Number(line.marks))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    <span className="text-muted-foreground"> / {formatMark(q.marks)}</span>
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Go to the key for this question" onClick={() => scrollTo(`key-${q.id}`)}>
                        <KeyRound />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Jump to the answer key and marks</TooltipContent>
                  </Tooltip>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm font-medium leading-relaxed">{q.text}</p>
                <div className="mt-3">
                  <StudentAnswer question={q} answer={answer} />
                </div>
                {questionFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {questionFiles.map((a) => (
                      <AttachmentPreview key={a.file_url} attachment={a} />
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </section>

        {/* ----------------------------------------------- marking */}
        <aside
          aria-label="Answer key and marks"
          className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto"
        >
          <Card className="overflow-hidden">
            <div className="border-b border-border bg-surface/60 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Total</p>
                  <p className="text-2xl font-semibold tabular-nums leading-tight">
                    {isGrade && grade ? (
                      grade
                    ) : (
                      <>
                        {total != null ? formatMark(total) : '—'}
                        <span className="text-base font-normal text-muted-foreground"> / {formatMark(maxMarks)}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {percentage != null && (
                    <p className={cn('text-base font-semibold', PERCENT_TONE[performanceTone(percentage)])}>{formatPercent(percentage, 1)}</p>
                  )}
                  {!isGrade && derivedGrade && <p>Grade {derivedGrade}</p>}
                  {passed != null && (
                    <p className={passed ? 'text-success' : 'text-danger'}>{passed ? 'Pass' : 'Below pass mark'}</p>
                  )}
                </div>
              </div>
              {usesLines && unmarkedLines.length > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-2xs text-warning">
                  <TriangleAlert className="size-3" />
                  {unmarkedLines.length} question{unmarkedLines.length === 1 ? '' : 's'} without a mark — they count as nothing.
                </p>
              )}
              {overTotal && (
                <p className="mt-2 flex items-center gap-1.5 text-2xs text-danger">
                  <TriangleAlert className="size-3" />
                  The total exceeds what the exam is out of.
                </p>
              )}
            </div>

            <div className="space-y-2.5 p-4">
              {usesLines ? (
                questions.map((q, index) => {
                  const line = lines[q.id] ?? { marks: '', remarks: '' }
                  const auto = isAuto(q.id, line.marks)
                  return (
                    <KeyRow
                      key={q.id}
                      question={q}
                      index={index}
                      line={line}
                      verdict={verdictFor(q, answers.get(q.id), line, auto)}
                      auto={auto}
                      scheme={exam.grading_scheme}
                      onChange={(patch) => setLines((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] ?? { marks: '', remarks: '' }), ...patch } }))}
                    />
                  )
                })
              ) : (
                <div className="rounded-lg border border-border/80 p-3">
                  <p className="text-sm font-medium">Marks for the whole paper</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    This exam has no question form, so record the total you awarded on the answer sheet.
                  </p>
                  {exam.grading_scheme === 'MARKS' && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={maxMarks}
                        step="any"
                        inputMode="decimal"
                        value={flatMarks}
                        invalid={flatInvalid || overTotal}
                        aria-label="Total marks"
                        className="h-9 w-28 text-right text-base font-semibold"
                        onChange={(e) => setFlatMarks(e.target.value)}
                      />
                      <span className="text-sm text-muted-foreground">/ {formatMark(maxMarks)}</span>
                    </div>
                  )}
                </div>
              )}

              {isGrade && (
                <div className="rounded-lg border border-border/80 p-3">
                  <p className="text-sm font-medium">Grade awarded</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">One of this exam&rsquo;s own bands.</p>
                  <Select value={grade} onValueChange={setGrade}>
                    <SelectTrigger className="mt-2" aria-label="Grade">
                      <SelectValue placeholder="Choose a grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {exam.grade_bands.map((b) => (
                        <SelectItem key={b.grade} value={b.grade}>
                          {b.grade}
                          {b.description ? ` — ${b.description}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {derivedGrade && derivedGrade !== grade && total != null && (
                    <p className="mt-1.5 text-2xs text-muted-foreground">
                      The marks entered would put this at {derivedGrade}.{' '}
                      <button type="button" className="text-primary hover:underline" onClick={() => setGrade(derivedGrade)}>
                        Use that
                      </button>
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs font-medium" htmlFor="evaluator-remarks">
                  Remarks to the student
                </label>
                <Textarea
                  id="evaluator-remarks"
                  rows={3}
                  value={remarks}
                  placeholder="Shown with their result once it is published."
                  className="mt-1"
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>

              {error && (
                <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger" role="alert">
                  {error}
                </p>
              )}
            </div>

            <div className="sticky bottom-0 space-y-2 border-t border-border bg-card/95 p-4 backdrop-blur">
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" icon={<Save />} disabled={!ready} loading={evaluate.isPending} onClick={() => save('stay')}>
                  Save
                </Button>
                <Button variant="primary" className="flex-1" icon={<ChevronRight />} disabled={!ready} loading={evaluate.isPending} onClick={() => save('next')}>
                  Save &amp; next
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-2xs text-muted-foreground">
                  {exam.results_published ? 'Results are published — saving updates the student’s mark.' : 'Hidden from the student until results are published.'}
                </p>
                {!inProgress && (
                  <Button variant="ghost" size="xs" icon={<RotateCcw />} className="text-danger hover:bg-danger/10" onClick={() => setConfirmReopen(true)}>
                    Hand back
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmReopen}
        onOpenChange={setConfirmReopen}
        title="Hand this script back?"
        description={`${studentName} can edit and hand in again with whatever is left of their original time. Any marks on it are discarded${exam.results_published ? ', and the published result is withdrawn' : ''}.`}
        confirmLabel="Hand back"
        destructive
        loading={reopen.isPending}
        onConfirm={() =>
          reopen.mutate(
            { examId: exam.id, studentId },
            {
              onSuccess: () => navigate(`${scope.examPath(exam.id)}?tab=submissions`),
              onSettled: () => setConfirmReopen(false),
            },
          )
        }
      />
    </>
  )
}

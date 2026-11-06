import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Hourglass,
  KeyRound,
  Lightbulb,
  PenLine,
  RotateCcw,
  Save,
  Sparkles,
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
import { formatRelative } from '@/lib/datetime'
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
import { fileKind, fileNameFromUrl } from '@/lib/files'
import { examApi } from '@/api/exam.api'
import { InlineFileRow } from '@/components/domain/document-viewer'
import { formatPercent, performanceTone } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Band } from '@/components/layout/workspace'
import { tidyName as tidy } from '@/lib/names'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/feedback/states'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { MarkingEditor } from './marking-editor'
import { useExamScope } from './exam-scope'

/**
 * Marking one script.
 *
 * One question at a time: the question and the student's answer, with the
 * answer key and the marks box beside it, and every question as a numbered
 * button along the top that turns green once it has a mark. The total, the
 * remark and Save sit in one bar pinned to the bottom.
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

function AttachmentPreview({
  attachment,
  examId,
  studentId,
  index,
}: {
  attachment: AttachmentOut
  examId: number
  studentId: number
  /** Position in the student's full list of uploads, which is how the file is fetched. */
  index: number
}) {
  const kind = fileKind(attachment.filename ?? attachment.file_url)
  const name = attachment.filename ?? fileNameFromUrl(attachment.file_url)
  const meta = [
    attachment.uploaded_at ? `Uploaded ${formatRelative(attachment.uploaded_at)}` : '',
    attachment.storage_warning ? 'saved' : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <InlineFileRow
      name={name}
      meta={meta || undefined}
      cacheKey={`submission-${examId}-${studentId}-${index}-${attachment.file_url}`}
      load={() => examApi.submissionFile(examId, studentId, index)}
      defaultOpen={kind === 'image' || kind === 'pdf'}
      height="70vh"
    />
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
    return <p className="text-sm italic text-muted-foreground">No answer written.</p>
  }

  const text = formatAnswer(question, answer?.answer) ?? ''
  return (
    <div
      className={cn(
        'border-l-2 border-border bg-muted/30 px-3.5 py-2.5 text-sm leading-relaxed',
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
    <div id={`key-${question.id}`} className={cn('border-b border-l-2 py-3 pl-3 transition-colors', invalid ? 'border-l-danger' : 'border-l-transparent')}>
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
  const [markingOpen, setMarkingOpen] = React.useState(false)
  // One question at a time; back to the first when the marker moves to another script.
  const [qIndex, setQIndex] = React.useState(0)
  React.useEffect(() => setQIndex(0), [studentId])

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
    (isGrade ? grade !== '' || total != null : total != null)

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
    if (isGrade && grade) body.grade = grade
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
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_28rem]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
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
  // A paper exam with uploaded sheets is marked on the sheet itself, right here.
  const sheetMode = !usesLines && scriptAttachments.length > 0 && !inProgress
  const qi = Math.min(qIndex, Math.max(0, questions.length - 1))
  const current = questions[qi] ?? null

  const filesFor = (q: ExamQuestionOut): AttachmentOut[] => [
    ...(byQuestionAttachments.get(q.id) ?? []),
    ...(answers.get(q.id)?.attachments ?? [])
      .filter((url) => !(byQuestionAttachments.get(q.id) ?? []).some((a) => a.file_url === url))
      .map<AttachmentOut>((url) => ({ file_url: url, filename: null, provider: null, storage_warning: null, uploaded_at: null, question_id: q.id })),
  ]

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------ header */}
      <Band className="-mt-6 border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="min-w-0">
            <Link
              to={`${scope.examPath(exam.id)}?tab=submissions`}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              {exam.title}
            </Link>
            <h1 className="mt-1 truncate text-xl font-medium tracking-tight text-foreground">
              {tidy(studentName)}
              {submission.is_late && <span className="ml-2 align-middle text-xs font-medium text-warning">late</span>}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Script {position >= 0 ? position + 1 : '—'} of {order.length} · {markedCount} marked
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
      </Band>

      {sheetMode ? (
        <div className="!mt-0">
          <Band className="border-b border-border">
            <div className="-mx-4 h-[calc(100vh-11.5rem)] min-h-[32rem] sm:-mx-6 lg:-mx-8">
              <MarkingEditor
                inline
                exam={exam}
                submission={submission}
                onRecordTotal={async (sheetTotal) => {
                  setFlatMarks(String(sheetTotal))
                  // On a graded exam the grade is left out, so the server gives the band the marks reach.
                  await evaluate.mutateAsync({
                    examId: exam.id,
                    studentId,
                    body: { marks_obtained: sheetTotal, remarks: remarks.trim() || null },
                  })
                }}
                asideFooter={
                  <div className="space-y-2 border-t border-border px-3 py-3">
                    <Input
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Remark to the student (optional)"
                      aria-label="Remarks to the student"
                      className="h-8 text-sm"
                    />
                    <div className="flex items-center justify-between">
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-danger" onClick={() => setConfirmReopen(true)}>
                        <RotateCcw />
                        Hand back
                      </Button>
                      {(nextUnmarked ?? next) && (
                        <Button asChild variant="outline" size="sm">
                          <Link to={scope.gradePath(exam.id, (nextUnmarked ?? next)!.student_id)}>
                            Next script
                            <ChevronRight />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                }
              />
            </div>
          </Band>
        </div>
      ) : (
      <div className="!mt-0">
        {inProgress && (
          <Band className="border-b border-border bg-info/[0.05]">
            <p className="py-2.5 text-sm text-foreground">
              Not handed in yet. {tidy(studentName)} is still writing; you can read what is saved, but marks can be recorded once they submit.
            </p>
          </Band>
        )}

        {/* The answer sheets, when the student uploaded any for the whole paper. */}
        {scriptAttachments.length > 0 && (
          <Band className="border-b border-border">
            <div className="space-y-2 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">
                  Answer sheets <span className="font-normal text-muted-foreground">· {scriptAttachments.length}</span>
                  {submission.marking_total != null && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      marked on the sheet: {formatMark(submission.marking_total)} / {formatMark(maxMarks)}
                    </span>
                  )}
                </p>
                {!inProgress && (
                  <Button size="sm" icon={<PenLine />} onClick={() => setMarkingOpen(true)}>
                    Mark on the answer sheet
                  </Button>
                )}
              </div>
              {scriptAttachments.map((a) => (
                <AttachmentPreview
                  key={a.file_url}
                  attachment={a}
                  examId={submission.exam_id}
                  studentId={submission.student_id}
                  index={submission.attachments.findIndex((x) => x.file_url === a.file_url)}
                />
              ))}
            </div>
          </Band>
        )}

        {/* --------------------------------------------- one question */}
        {current ? (
          <Band className="border-b border-border">
            {/* Every question as a number: green once it has a mark, red if the mark is wrong. */}
            <div className="flex flex-wrap gap-1.5 border-b border-border py-3">
              {questions.map((q, i) => {
                const v = lines[q.id]?.marks ?? ''
                const bad = lineErrors.some((e) => e.id === q.id)
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setQIndex(i)}
                    aria-current={i === qi ? 'true' : undefined}
                    aria-label={`Question ${i + 1}`}
                    className={cn(
                      'flex size-8 items-center justify-center rounded-md border text-xs font-medium tabular-nums transition-colors',
                      i === qi
                        ? 'border-primary bg-primary text-primary-foreground'
                        : bad
                          ? 'border-danger bg-danger/10 text-danger'
                          : v.trim() !== ''
                            ? 'border-success/40 bg-success/10 text-success'
                            : 'border-border text-muted-foreground hover:border-primary/50',
                    )}
                  >
                    {i + 1}
                  </button>
                )
              })}
            </div>

            <div className="grid gap-x-10 py-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="min-w-0 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Question {qi + 1} of {questions.length} · {QUESTION_TYPE_META[current.question_type].label} · {formatMark(current.marks)} mark{current.marks === 1 ? '' : 's'}
                </p>
                <p className="whitespace-pre-wrap text-base font-medium leading-relaxed text-foreground">{current.text}</p>
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Answer</p>
                  <StudentAnswer question={current} answer={answers.get(current.id)} />
                </div>
                {filesFor(current).map((a) => (
                  <AttachmentPreview
                    key={a.file_url}
                    attachment={a}
                    examId={submission.exam_id}
                    studentId={submission.student_id}
                    index={submission.attachments.findIndex((x) => x.file_url === a.file_url)}
                  />
                ))}
              </div>

              <div className="mt-5 lg:mt-0">
                <KeyRow
                  question={current}
                  index={qi}
                  line={lines[current.id] ?? { marks: '', remarks: '' }}
                  verdict={verdictFor(current, answers.get(current.id), lines[current.id], isAuto(current.id, lines[current.id]?.marks ?? ''))}
                  auto={isAuto(current.id, lines[current.id]?.marks ?? '')}
                  scheme={exam.grading_scheme}
                  onChange={(patch) => setLines((prev) => ({ ...prev, [current.id]: { ...(prev[current.id] ?? { marks: '', remarks: '' }), ...patch } }))}
                />
                <div className="mt-3 flex items-center justify-between">
                  <Button variant="ghost" size="sm" disabled={qi === 0} onClick={() => setQIndex(qi - 1)}>
                    <ChevronLeft />
                    Q{qi}
                  </Button>
                  <Button variant="outline" size="sm" disabled={qi >= questions.length - 1} onClick={() => setQIndex(qi + 1)}>
                    Q{qi + 2}
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </div>
          </Band>
        ) : (
          // No question form: one mark for the whole paper.
          <Band className="border-b border-border">
            <div className="flex flex-wrap items-center gap-3 py-5">
              <p className="text-sm text-foreground">Marks for the whole paper</p>
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
              {scriptAttachments.length === 0 && <span className="text-sm text-muted-foreground">· nothing was uploaded on this script</span>}
            </div>
          </Band>
        )}

        {/* ------------------------------------------- the total, and save */}
        <Band className="sticky bottom-0 z-10 border-b border-t border-border bg-card/95 backdrop-blur">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3">
            <p className="text-sm">
              <span className="text-muted-foreground">Total </span>
              <span className="text-lg font-medium tabular-nums text-foreground">
                {isGrade && grade ? grade : total != null ? formatMark(total) : '—'}
              </span>
              {!(isGrade && grade) && <span className="text-muted-foreground"> / {formatMark(maxMarks)}</span>}
              {percentage != null && <span className={cn('ml-2 font-medium', PERCENT_TONE[performanceTone(percentage)])}>{formatPercent(percentage, 0)}</span>}
              {!isGrade && derivedGrade && <span className="ml-2 text-muted-foreground">grade {derivedGrade}</span>}
              {passed != null && <span className={cn('ml-2', passed ? 'text-success' : 'text-danger')}>{passed ? 'pass' : 'below pass'}</span>}
            </p>
            {usesLines && unmarkedLines.length > 0 && <span className="text-xs text-warning">{unmarkedLines.length} without a mark</span>}
            {overTotal && <span className="text-xs text-danger">More than the exam is out of</span>}
            {isGrade && (
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger className="h-8 w-32" aria-label="Grade">
                  <SelectValue placeholder="Grade" />
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
            )}
            <Input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Remark to the student (optional)"
              aria-label="Remarks to the student"
              className="h-8 min-w-48 flex-1 text-sm"
            />
            <div className="ml-auto flex items-center gap-2">
              {!inProgress && (
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-danger" onClick={() => setConfirmReopen(true)}>
                  <RotateCcw />
                  Hand back
                </Button>
              )}
              <Button variant="outline" size="sm" icon={<Save />} disabled={!ready} loading={evaluate.isPending} onClick={() => save('stay')}>
                Save
              </Button>
              <Button size="sm" icon={<ChevronRight />} disabled={!ready} loading={evaluate.isPending} onClick={() => save('next')}>
                Save &amp; next
              </Button>
            </div>
            {error && (
              <p className="w-full text-sm text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        </Band>
      </div>
      )}

      {!sheetMode && exam && submission && submission.status !== 'IN_PROGRESS' && (
        <MarkingEditor
          open={markingOpen}
          onOpenChange={setMarkingOpen}
          exam={exam}
          submission={submission}
          onRecordTotal={async (sheetTotal) => {
            setFlatMarks(String(sheetTotal))
            // On a graded exam the grade is left out, so the server gives the band the marks reach.
            await evaluate.mutateAsync({
              examId: exam.id,
              studentId,
              body: { marks_obtained: sheetTotal, remarks: remarks.trim() || null },
            })
          }}
        />
      )}

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
    </div>
  )
}

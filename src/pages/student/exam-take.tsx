import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  CloudOff,
  CloudUpload,
  ExternalLink,
  FileText,
  Hourglass,
  Lightbulb,
  Paperclip,
  Play,
  Send,
  Timer,
  XCircle,
} from 'lucide-react'
import * as React from 'react'
import { Link, useParams } from 'react-router-dom'

import type { AnswerIn, AnswerValue, StudentExamOut, StudentQuestionOut, StudentSubmissionOut } from '@/api/types'
import {
  useMyExam,
  useMySubmission,
  useSaveAnswers,
  useStartExam,
  useSubmitExam,
  useUploadAnswerSheet,
} from '@/queries/exam.queries'
import { cn } from '@/lib/cn'
import { formatCountdown, formatDateTime } from '@/lib/datetime'
import {
  QUESTION_TYPE_META,
  choiceSet,
  formatAnswer,
  formatClock,
  formatMark,
  formatMinutes,
  isBlankAnswer,
  msUntil,
  studentExamPhase,
} from '@/lib/exams'
import { MAX_UPLOAD_BYTES, fileNameFromUrl, formatFileSize, resolveFileUrl } from '@/lib/files'
import { useNow } from '@/lib/hooks'
import { subjectName } from '@/lib/select'
import { subjectLook, toneStyle } from '@/lib/subjects'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { ProgressBar } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useCelebration } from '@/components/fun/celebrate'
import { FunPageHeader, ProgressRing, SubjectTile } from '@/components/fun/fun-ui'
import { FileTypeIcon } from '@/components/domain/file-type-icon'
import { ErrorState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { AdminStudentNotice, useEnrollmentStatus } from './student-guard'

/**
 * Sitting an exam, and reading the result afterwards.
 *
 * Three screens behind one route, chosen by the state the server reports:
 *
 *  1. The lobby — the rules, the clock, and a Start button that only appears
 *     when the API would accept a start.
 *  2. The paper — answers autosave a moment after each change, one question
 *     at a time, and the header says plainly whether the last save landed.
 *     Time runs from the server's own `expires_at`; when it reaches zero the
 *     paper hands itself in with whatever was saved.
 *  3. The result — nothing but "handed in" until the teacher publishes, then
 *     the marks, the key and the explanations, question by question.
 */

// --------------------------------------------------------------- helpers

function answeredCount(questions: StudentQuestionOut[], answers: Map<number, AnswerValue>, files: Map<number, number>) {
  return questions.filter((q) => !isBlankAnswer(answers.get(q.id), files.get(q.id) ? ['x'] : [])).length
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

// --------------------------------------------------------------- inputs

function ChoiceInput({
  question,
  value,
  onChange,
  disabled,
}: {
  question: StudentQuestionOut
  value: AnswerValue
  onChange: (next: AnswerValue) => void
  disabled?: boolean
}) {
  const multi = question.question_type === 'MULTI_SELECT'
  const chosen = choiceSet(value)

  const toggle = (key: string) => {
    const k = key.toUpperCase()
    if (multi) {
      const next = new Set(chosen)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      onChange(next.size ? [...next] : null)
    } else {
      onChange(chosen.has(k) ? null : k)
    }
  }

  return (
    <div role={multi ? 'group' : 'radiogroup'} className="grid gap-2 sm:grid-cols-2">
      {question.options.map((option) => {
        const picked = chosen.has(option.key.toUpperCase())
        return (
          <button
            key={option.key}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={picked}
            disabled={disabled}
            onClick={() => toggle(option.key)}
            className={cn(
              'flex items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left text-sm font-medium transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60',
              picked ? 'border-[hsl(var(--tile))] bg-[hsl(var(--tile)/0.14)]' : 'border-border bg-card hover:border-[hsl(var(--tile)/0.6)]',
            )}
          >
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center text-xs font-bold',
                multi ? 'rounded-lg' : 'rounded-full',
                picked ? 'tile-solid' : 'bg-muted text-muted-foreground',
              )}
            >
              {picked ? <Check className="size-4" /> : option.key}
            </span>
            <span className="min-w-0 flex-1">{option.text}</span>
          </button>
        )
      })}
    </div>
  )
}

function QuestionFiles({
  examId,
  question,
  attachments,
  disabled,
  max,
  total,
}: {
  examId: number
  question: StudentQuestionOut
  attachments: { file_url: string; filename: string | null }[]
  disabled?: boolean
  max: number
  total: number
}) {
  const [progress, setProgress] = React.useState(0)
  const upload = useUploadAnswerSheet(setProgress)
  const full = total >= max

  return (
    <div className="space-y-2">
      {attachments.map((a) => {
        const url = resolveFileUrl(a.file_url)
        const name = a.filename ?? fileNameFromUrl(a.file_url)
        return (
          <div key={a.file_url} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
            <FileTypeIcon url={name} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
            {url && (
              <a href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">
                Open
              </a>
            )}
          </div>
        )
      })}
      {upload.isPending ? (
        <div className="space-y-1.5 rounded-lg border border-border px-3 py-2">
          <p className="text-xs text-muted-foreground">Uploading… {progress}%</p>
          <ProgressBar value={progress} size="sm" />
        </div>
      ) : (
        !disabled && (
          <label
            className={cn(
              'flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground',
              full && 'pointer-events-none opacity-50',
            )}
          >
            <Paperclip className="size-3.5" />
            {question.question_type === 'FILE_UPLOAD' ? 'Upload your answer' : 'Attach a file to this answer'}
            {full ? ` (limit of ${max} reached)` : ''}
            <input
              type="file"
              className="sr-only"
              disabled={full}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                if (file.size > MAX_UPLOAD_BYTES) return
                setProgress(0)
                upload.mutate({ examId, file, questionId: question.id })
              }}
            />
          </label>
        )
      )}
    </div>
  )
}

function AnswerSheetUploads({
  exam,
  submission,
  disabled,
}: {
  exam: StudentExamOut
  submission: StudentSubmissionOut
  disabled?: boolean
}) {
  const [progress, setProgress] = React.useState(0)
  const [dragging, setDragging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const upload = useUploadAnswerSheet(setProgress)
  const sheets = submission.attachments.filter((a) => a.question_id == null)
  const full = submission.attachments.length >= exam.max_upload_files

  const choose = (file: File | null) => {
    setError(null)
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That file is ${formatFileSize(file.size)}; the limit is ${formatFileSize(MAX_UPLOAD_BYTES)}.`)
      return
    }
    setProgress(0)
    upload.mutate({ examId: exam.id, file })
  }

  return (
    <div style={toneStyle(subjectLook(subjectName(exam)).tone)} className="sticker p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <CloudUpload className="size-5" style={{ color: 'hsl(var(--tile))' }} />
        <h2 className="text-base font-bold">Your answer sheets</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {submission.attachments.length} of {exam.max_upload_files} files
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Write on paper, then take a clear photo or scan of every page and upload them here. Then press Hand in.
      </p>

      {sheets.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {sheets.map((a) => {
            const url = resolveFileUrl(a.file_url)
            const name = a.filename ?? fileNameFromUrl(a.file_url)
            return (
              <li key={a.file_url} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                <FileTypeIcon url={name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                {url && (
                  <a href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">
                    Open
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!disabled && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (!full) choose(e.dataTransfer.files?.[0] ?? null)
          }}
          className={cn(
            'mt-3 rounded-xl border-2 border-dashed bg-card/60 p-5 text-center text-sm transition-colors',
            dragging ? 'border-primary bg-primary/8' : 'border-border',
            full && 'opacity-60',
          )}
        >
          {upload.isPending ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Uploading… {progress}%</p>
              <ProgressBar value={progress} size="sm" />
            </div>
          ) : full ? (
            <p className="text-xs text-muted-foreground">You have uploaded the maximum of {exam.max_upload_files} files.</p>
          ) : (
            <>
              <p>
                Drop a photo or PDF here, or{' '}
                <label className="cursor-pointer font-bold text-primary hover:underline">
                  choose a file
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={(e) => {
                      choose(e.target.files?.[0] ?? null)
                      e.target.value = ''
                    }}
                  />
                </label>
              </p>
              <p className="mt-1 text-2xs text-muted-foreground">Up to {formatFileSize(MAX_UPLOAD_BYTES)} each</p>
            </>
          )}
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

// ----------------------------------------------------------------- lobby

function Lobby({ exam, onStart, starting }: { exam: StudentExamOut; onStart: () => void; starting: boolean }) {
  const now = useNow(1000)
  const phase = studentExamPhase(exam)
  const subject = subjectName(exam)
  const look = subjectLook(subject)

  const rules: { icon: typeof Timer; label: string; value: string }[] = [
    {
      icon: Timer,
      label: 'Your time',
      value: exam.duration_minutes
        ? `${formatMinutes(exam.duration_minutes + exam.extra_time_minutes)} from when you start${exam.extra_time_minutes > 0 ? ' (includes your extra time)' : ''}`
        : 'Until the exam closes',
    },
    { icon: Play, label: 'Opens', value: formatDateTime(exam.starts_at) },
    { icon: Hourglass, label: 'Last hand-in', value: formatDateTime(exam.closes_at) },
    { icon: FileText, label: 'Paper', value: `${exam.question_count} question${exam.question_count === 1 ? '' : 's'} · out of ${formatMark(exam.max_marks)}` },
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div style={toneStyle(look.tone)} className="sticker p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <SubjectTile subject={subject} size="lg" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{subject}</p>
            <h1 className="text-2xl font-extrabold tracking-tight">{exam.title}</h1>
            {exam.teacher && <p className="text-xs text-muted-foreground">Set by {exam.teacher.full_name}</p>}
          </div>
        </div>
        {exam.description && <p className="mt-4 text-sm leading-relaxed">{exam.description}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {rules.map((rule) => (
          <div key={rule.label} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <rule.icon className="size-4" />
            </span>
            <div>
              <p className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">{rule.label}</p>
              <p className="text-sm font-semibold">{rule.value}</p>
            </div>
          </div>
        ))}
      </div>

      {exam.instructions && (
        <div className="rounded-xl border border-warning/30 bg-warning/8 p-4">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Lightbulb className="size-4 text-warning" />
            Read this first
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{exam.instructions}</p>
        </div>
      )}

      {exam.mode === 'OFFLINE' && exam.question_paper_url && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <FileTypeIcon url={exam.question_paper_url} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Question paper</p>
            <p className="text-xs text-muted-foreground">You can open it once you start.</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border-2 border-primary/25 bg-primary/5 p-5 text-center">
        {phase === 'ready' ? (
          <>
            <p className="text-sm text-muted-foreground">
              {exam.duration_minutes
                ? 'The clock starts the moment you press this and does not pause.'
                : 'You can save and come back until the exam closes.'}
            </p>
            <Button variant="primary" size="lg" className="mt-3" icon={<Play />} loading={starting} onClick={onStart}>
              Start the exam
            </Button>
          </>
        ) : phase === 'not_open' ? (
          <>
            <p className="text-sm font-bold">Opens in {formatCountdown(exam.starts_at, now)}</p>
            <p className="mt-1 text-xs text-muted-foreground">This page will let you start at {formatDateTime(exam.starts_at)}.</p>
          </>
        ) : phase === 'cancelled' ? (
          <p className="text-sm font-bold">This exam was cancelled.</p>
        ) : (
          <>
            <p className="text-sm font-bold">This exam has closed.</p>
            <p className="mt-1 text-xs text-muted-foreground">It stopped accepting work at {formatDateTime(exam.closes_at)}.</p>
          </>
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- paper

function Paper({ exam, submission }: { exam: StudentExamOut; submission: StudentSubmissionOut }) {
  const now = useNow(1000)
  const save = useSaveAnswers()
  const submit = useSubmitExam()

  // Served in the order the server chose; `order` is authoritative.
  const questions = React.useMemo(() => [...exam.questions].sort((a, b) => a.order - b.order), [exam.questions])

  const [answers, setAnswers] = React.useState<Map<number, AnswerValue>>(
    () => new Map(submission.answers.map((a) => [a.question_id, a.answer])),
  )
  // The debounced flush fires from a timer set on an earlier render, so it
  // must read the answers through a ref or it would send what was typed
  // before the last keystroke.
  const answersRef = React.useRef(answers)
  answersRef.current = answers
  const dirty = React.useRef(new Set<number>())
  const timer = React.useRef<number>()
  const [saveState, setSaveState] = React.useState<SaveState>('idle')
  const [confirming, setConfirming] = React.useState(false)
  const [timeUp, setTimeUp] = React.useState(false)
  const autoSubmitted = React.useRef(false)

  const filesByQuestion = React.useMemo(() => {
    const map = new Map<number, number>()
    for (const a of submission.attachments) {
      if (a.question_id != null) map.set(a.question_id, (map.get(a.question_id) ?? 0) + 1)
    }
    return map
  }, [submission.attachments])

  const buildDirty = React.useCallback((): AnswerIn[] => {
    const ids = [...dirty.current]
    return ids.map((id) => ({ question_id: id, answer: answersRef.current.get(id) ?? null }))
  }, [])

  const flush = React.useCallback(async () => {
    if (dirty.current.size === 0) return
    const batch = buildDirty()
    const ids = new Set(dirty.current)
    setSaveState('saving')
    try {
      await save.mutateAsync({ examId: exam.id, body: { answers: batch } })
      for (const id of ids) dirty.current.delete(id)
      setSaveState(dirty.current.size === 0 ? 'saved' : 'saving')
    } catch {
      setSaveState('failed')
    }
  }, [buildDirty, exam.id, save])

  const change = (questionId: number, value: AnswerValue) => {
    setAnswers((prev) => {
      const next = new Map(prev)
      next.set(questionId, value)
      return next
    })
    dirty.current.add(questionId)
    setSaveState('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), 1200)
  }

  React.useEffect(() => () => window.clearTimeout(timer.current), [])

  // Flush on unmount and when the tab goes to the background.
  React.useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [flush])

  React.useEffect(() => {
    if (dirty.current.size === 0) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saveState])

  const remaining = msUntil(submission.expires_at, now)
  const urgent = remaining != null && remaining <= 5 * 60_000

  const handIn = React.useCallback(async () => {
    window.clearTimeout(timer.current)
    const pending = buildDirty()
    await submit.mutateAsync({ examId: exam.id, body: { answers: pending } })
    dirty.current.clear()
  }, [buildDirty, exam.id, submit])

  // Time's up: hand in whatever is saved, once.
  React.useEffect(() => {
    if (remaining == null || remaining > 0 || autoSubmitted.current) return
    autoSubmitted.current = true
    setTimeUp(true)
    void handIn().catch(() => {
      /* the banner explains; the grace rules decide */
    })
  }, [remaining, handIn])

  const answered = answeredCount(questions, answers, filesByQuestion)
  const requiredMissing = questions.filter(
    (q) => q.required && isBlankAnswer(answers.get(q.id), filesByQuestion.get(q.id) ? ['x'] : []),
  )
  const offlineWithoutWork =
    exam.mode === 'OFFLINE' && questions.length === 0 && submission.attachments.length === 0
  const paperUrl = resolveFileUrl(exam.question_paper_url)
  const subject = subjectName(exam)
  const look = subjectLook(subject)

  return (
    <div style={toneStyle(look.tone)} className="space-y-4">
      {/* --------------------------------------------------- header */}
      <div className="sticky top-0 z-30 -mx-1 rounded-2xl border-2 border-[hsl(var(--tile)/0.35)] bg-card/95 px-4 py-3 shadow-md backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <SubjectTile subject={subject} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{exam.title}</p>
            <p className="text-2xs text-muted-foreground">
              {questions.length > 0 ? `${answered} of ${questions.length} answered` : `${submission.attachments.length} file${submission.attachments.length === 1 ? '' : 's'} uploaded`}
              {' · '}
              {saveState === 'saving' ? (
                <span className="inline-flex items-center gap-1">
                  <CloudUpload className="size-3 animate-pulse" />
                  Saving…
                </span>
              ) : saveState === 'failed' ? (
                <button type="button" className="inline-flex items-center gap-1 font-bold text-danger hover:underline" onClick={() => void flush()}>
                  <CloudOff className="size-3" />
                  Not saved — tap to retry
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-success">
                  <Check className="size-3" />
                  {saveState === 'saved' ? 'All saved' : 'Saved'}
                </span>
              )}
            </p>
          </div>
          {remaining != null && (
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-sm font-bold tabular-nums',
                urgent ? 'animate-pulse bg-danger text-danger-foreground' : 'tile-soft',
              )}
              aria-live={urgent ? 'polite' : 'off'}
            >
              <Timer className="size-4" />
              {formatClock(remaining)}
            </div>
          )}
          <Button variant="primary" icon={<Send />} disabled={timeUp || submit.isPending} onClick={() => setConfirming(true)}>
            Hand in
          </Button>
        </div>
        {questions.length > 0 && (
          <ProgressBar value={(answered / questions.length) * 100} size="sm" className="mt-2.5" tone="success" />
        )}
      </div>

      {timeUp && (
        <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/8 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
          <div>
            <p className="font-bold">Time is up</p>
            <p className="text-muted-foreground">
              {submit.isPending
                ? 'Handing in what you saved…'
                : submit.isError
                  ? 'Your paper could not be handed in automatically. Ask your teacher.'
                  : 'Your paper has been handed in with everything you saved.'}
            </p>
          </div>
        </div>
      )}

      {exam.instructions && (
        <details className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <summary className="cursor-pointer font-bold">Instructions</summary>
          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{exam.instructions}</p>
        </details>
      )}

      {exam.mode === 'OFFLINE' && (
        <>
          {paperUrl && (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <FileTypeIcon url={exam.question_paper_url} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Question paper</p>
                <p className="truncate text-xs text-muted-foreground">{fileNameFromUrl(exam.question_paper_url)}</p>
              </div>
              <Button asChild variant="primary" size="sm" icon={<ExternalLink />}>
                <a href={paperUrl} target="_blank" rel="noreferrer">
                  Open paper
                </a>
              </Button>
            </div>
          )}
          <AnswerSheetUploads exam={exam} submission={submission} disabled={timeUp} />
        </>
      )}

      {/* ------------------------------------------------ questions */}
      {questions.map((q, index) => {
        const value = answers.get(q.id) ?? null
        const meta = QUESTION_TYPE_META[q.question_type]
        const questionFiles = submission.attachments.filter((a) => a.question_id === q.id)
        const done = !isBlankAnswer(value, questionFiles.length ? ['x'] : [])
        return (
          <div key={q.id} id={`q-${q.id}`} className={cn('sticker p-4 sm:p-5', done && 'border-[hsl(var(--tile)/0.55)]')}>
            <div className="flex items-center gap-2">
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold', done ? 'tile-solid' : 'bg-muted text-muted-foreground')}>
                {done ? <Check className="size-4" /> : index + 1}
              </span>
              <span className="text-xs font-bold text-muted-foreground">
                Question {index + 1} · {meta.label}
              </span>
              <span className="ml-auto text-xs font-bold tabular-nums">
                {formatMark(q.marks)} {q.marks === 1 ? 'mark' : 'marks'}
              </span>
              {!q.required && <Badge tone="neutral" size="sm">Optional</Badge>}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-base font-semibold leading-relaxed">{q.text}</p>

            <div className="mt-4">
              {meta.choice ? (
                <ChoiceInput question={q} value={value} onChange={(v) => change(q.id, v)} disabled={timeUp} />
              ) : q.question_type === 'SHORT_ANSWER' ? (
                <Input
                  value={typeof value === 'string' ? value : value != null ? String(value) : ''}
                  disabled={timeUp}
                  placeholder="Type your answer"
                  className="h-11 text-base"
                  onChange={(e) => change(q.id, e.target.value || null)}
                />
              ) : q.question_type === 'LONG_ANSWER' ? (
                <Textarea
                  value={typeof value === 'string' ? value : ''}
                  disabled={timeUp}
                  rows={6}
                  placeholder="Write your answer here…"
                  className="text-base leading-relaxed"
                  onChange={(e) => change(q.id, e.target.value || null)}
                />
              ) : q.question_type === 'NUMERIC' ? (
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={value != null ? String(value) : ''}
                  disabled={timeUp}
                  placeholder="Enter a number"
                  className="h-11 max-w-xs font-mono text-base"
                  onChange={(e) => change(q.id, e.target.value === '' ? null : e.target.value)}
                />
              ) : null}
            </div>

            {(q.question_type === 'FILE_UPLOAD' || q.allow_attachments) && (
              <div className="mt-3">
                <QuestionFiles
                  examId={exam.id}
                  question={q}
                  attachments={questionFiles}
                  disabled={timeUp}
                  max={exam.max_upload_files}
                  total={submission.attachments.length}
                />
              </div>
            )}
          </div>
        )
      })}

      {questions.length > 0 && !timeUp && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border p-5 text-center">
          <p className="text-sm font-bold">
            {answered === questions.length ? 'Every question answered.' : `${questions.length - answered} left to answer.`}
          </p>
          <p className="text-xs text-muted-foreground">Check your answers, then hand in. You cannot change them afterwards.</p>
          <Button variant="primary" size="lg" icon={<Send />} onClick={() => setConfirming(true)}>
            Hand in
          </Button>
        </div>
      )}

      <Dialog open={confirming} onOpenChange={(v) => !submit.isPending && setConfirming(v)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Hand in your exam?</DialogTitle>
            <DialogDescription>Once handed in, you cannot change your answers. Only your teacher can reopen it.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {requiredMissing.length > 0 && (
              <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  <span className="font-bold">
                    {requiredMissing.length} question{requiredMissing.length === 1 ? '' : 's'} not answered.
                  </span>{' '}
                  You can still hand in, but they will score nothing.
                </span>
              </p>
            )}
            {offlineWithoutWork && (
              <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                Upload your answer sheet before handing in.
              </p>
            )}
            {submit.isError && (
              <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger" role="alert">
                {submit.error.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {questions.length > 0 ? `${answered} of ${questions.length} answered` : ''}
              {submission.attachments.length > 0 ? ` · ${submission.attachments.length} file${submission.attachments.length === 1 ? '' : 's'} uploaded` : ''}
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={submit.isPending}>
              Keep working
            </Button>
            <Button
              variant="primary"
              icon={<Send />}
              disabled={offlineWithoutWork}
              loading={submit.isPending}
              onClick={() => void handIn().then(() => setConfirming(false)).catch(() => undefined)}
            >
              Hand in
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------- result

function Result({ exam, submission }: { exam: StudentExamOut; submission: StudentSubmissionOut }) {
  const [confetti, celebrate] = useCelebration()
  const published = submission.results_published
  const subject = subjectName(exam)
  const look = subjectLook(subject)
  const questions = React.useMemo(() => [...exam.questions].sort((a, b) => a.order - b.order), [exam.questions])
  const answers = React.useMemo(() => new Map(submission.answers.map((a) => [a.question_id, a])), [submission.answers])
  const scores = React.useMemo(() => new Map(submission.question_scores.map((s) => [s.question_id, s])), [submission.question_scores])

  React.useEffect(() => {
    if (published && submission.percentage != null && submission.percentage >= 75) celebrate()
    // Fire once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [published])

  const verdict = (pct: number | null) => {
    if (pct == null) return { emoji: '📬', text: 'Your result is in.' }
    if (pct >= 90) return { emoji: '🏆', text: 'Outstanding!' }
    if (pct >= 75) return { emoji: '🌟', text: 'Really strong. Well done!' }
    if (pct >= 60) return { emoji: '👍', text: 'Solid work.' }
    if (pct >= 40) return { emoji: '💪', text: 'Getting there. Keep going!' }
    return { emoji: '🌱', text: 'A tough one. Read the answers below — that is how it clicks.' }
  }

  return (
    <div style={toneStyle(look.tone)} className="mx-auto max-w-3xl space-y-5">
      {confetti}
      <div className="sticker p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <SubjectTile subject={subject} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{subject}</p>
            <h1 className="text-2xl font-extrabold tracking-tight">{exam.title}</h1>
            <p className="text-xs text-muted-foreground">
              Handed in {submission.submitted_at ? formatDateTime(submission.submitted_at) : ''}
              {submission.is_late ? ' · late' : ''}
            </p>
          </div>
        </div>

        {published ? (
          <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
            <ProgressRing value={submission.percentage ?? 0} size={132} tone={look.tone} animate label="score" />
            <div className="text-center sm:text-left">
              <p className="text-3xl font-extrabold tabular-nums">
                {exam.grading_scheme === 'GRADE' && submission.grade ? (
                  submission.grade
                ) : (
                  <>
                    {formatMark(submission.marks_obtained)}
                    <span className="text-lg text-muted-foreground"> / {formatMark(submission.max_marks ?? exam.max_marks)}</span>
                  </>
                )}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {submission.grade && exam.grading_scheme === 'MARKS' && (
                  <span className="tile-solid rounded-full px-2.5 py-0.5 text-xs font-bold">Grade {submission.grade}</span>
                )}
                {submission.passed === true && (
                  <Badge tone="success">
                    <CheckCircle2 />
                    Passed
                  </Badge>
                )}
                {submission.passed === false && (
                  <Badge tone="danger">
                    <XCircle />
                    Below the pass mark
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-sm font-bold">
                {verdict(submission.percentage).emoji} {verdict(submission.percentage).text}
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex items-start gap-3 rounded-xl bg-card/70 p-4">
            <Hourglass className="mt-0.5 size-5 shrink-0" style={{ color: 'hsl(var(--tile))' }} />
            <div>
              <p className="text-sm font-bold">Handed in. Your teacher is marking it.</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your marks and the answers will appear here once results are published.
              </p>
            </div>
          </div>
        )}

        {published && submission.evaluator_remarks && (
          <p className="mt-4 rounded-xl bg-[hsl(var(--tile)/0.10)] px-4 py-3 text-sm">
            <span className="font-bold">Teacher said:</span> {submission.evaluator_remarks}
          </p>
        )}
      </div>

      {questions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold">{published ? 'Question by question' : 'What you handed in'}</h2>
          {questions.map((q, index) => {
            const answer = answers.get(q.id)
            const score = scores.get(q.id)
            const given = formatAnswer(q, answer?.answer)
            const key = published ? formatAnswer(q, q.correct_answer) : null
            const correct = score ? score.marks_awarded >= q.marks : null
            return (
              <div key={q.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-extrabold">{index + 1}</span>
                  <span className="text-xs text-muted-foreground">{QUESTION_TYPE_META[q.question_type].label}</span>
                  <span className="ml-auto text-sm font-bold tabular-nums">
                    {published && score ? (
                      <span className={correct ? 'text-success' : score.marks_awarded === 0 ? 'text-danger' : ''}>{formatMark(score.marks_awarded)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    <span className="text-muted-foreground"> / {formatMark(q.marks)}</span>
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold">{q.text}</p>
                <div className="mt-2 rounded-lg bg-surface px-3 py-2 text-sm">
                  <span className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">Your answer</span>
                  <p className={cn('mt-0.5 whitespace-pre-wrap', !given && 'italic text-muted-foreground')}>{given ?? 'Left blank'}</p>
                  {(answer?.attachments.length ?? 0) > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {answer?.attachments.length} file{answer?.attachments.length === 1 ? '' : 's'} attached
                    </p>
                  )}
                </div>
                {published && key && (
                  <div className="mt-2 rounded-lg bg-success/10 px-3 py-2 text-sm">
                    <span className="text-2xs font-bold uppercase tracking-wide text-success">Correct answer</span>
                    <p className="mt-0.5">{key}</p>
                  </div>
                )}
                {published && q.answer_explanation && (
                  <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                    <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warning" />
                    {q.answer_explanation}
                  </p>
                )}
                {published && score?.remarks && (
                  <p className="mt-2 text-xs">
                    <span className="font-bold">Teacher:</span> {score.remarks}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {submission.attachments.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-bold">Files you uploaded</p>
          <ul className="mt-2 space-y-1.5">
            {submission.attachments.map((a) => {
              const url = resolveFileUrl(a.file_url)
              const name = a.filename ?? fileNameFromUrl(a.file_url)
              return (
                <li key={a.file_url} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                  <FileTypeIcon url={name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                  {url && (
                    <a href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">
                      Open
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------- page

export default function StudentExamTakePage() {
  const enrollment = useEnrollmentStatus()
  const params = useParams<{ examId: string }>()
  const examId = Number(params.examId)
  const examQuery = useMyExam(Number.isFinite(examId) ? examId : null, !enrollment.isAdmin)
  const submissionQuery = useMySubmission(Number.isFinite(examId) ? examId : null, !enrollment.isAdmin)
  const start = useStartExam()

  if (enrollment.isAdmin) {
    return (
      <>
        <PageHeader title="Exam" />
        <AdminStudentNotice />
      </>
    )
  }

  const back = (
    <Link to="/student/exams" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" />
      My exams
    </Link>
  )

  if (examQuery.isPending || submissionQuery.isPending) {
    return (
      <>
        {back}
        <div className="mx-auto max-w-2xl space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </>
    )
  }
  if (examQuery.isError || !examQuery.data) {
    return (
      <>
        {back}
        <ErrorState error={examQuery.error} onRetry={() => examQuery.refetch()} />
      </>
    )
  }

  const exam = examQuery.data
  const submission = submissionQuery.data ?? null
  const handedIn = submission?.status === 'SUBMITTED' || submission?.status === 'EVALUATED'
  // `can_submit` needs the server to have seen the script; right after /start
  // the exam is still being refetched, so `can_start` covers that gap.
  const open = exam.can_submit || exam.can_start
  const sitting = submission?.status === 'IN_PROGRESS' && open

  if (handedIn && submission) {
    return (
      <>
        {back}
        <Result exam={exam} submission={submission} />
      </>
    )
  }

  if (sitting && submission) {
    return (
      <>
        <Paper exam={exam} submission={submission} />
      </>
    )
  }

  if (submission?.status === 'IN_PROGRESS' && !open) {
    return (
      <>
        {back}
        <FunPageHeader emoji="⌛" tone={2} title={exam.title} description="This exam closed before you handed in." />
        <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          What you saved is kept, but it was not handed in. If this was a mistake, ask your teacher — they can reopen the exam for you.
        </div>
      </>
    )
  }

  return (
    <>
      {back}
      <Lobby exam={exam} starting={start.isPending} onStart={() => start.mutate(exam.id)} />
    </>
  )
}

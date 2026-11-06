import {
  ArrowLeft,
  Ban,
  Eye,
  MoreHorizontal,
  PencilLine,
  Play,
  RotateCcw,
  Send,
  Video,
  Timer,
  Trash2,
  TriangleAlert,
  UploadCloud,
} from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import type { ExamOut, SubmissionOut, UserOut } from '@/api/types'
import {
  useDeleteExam,
  useExam,
  useExamSubmissions,
  useGrantConcession,
  usePublishExam,
  usePublishResults,
  useReopenSubmission,
  useReplaceQuestions,
  useSetAnswerKey,
  useUpdateExam,
  useUploadPaper,
} from '@/queries/exam.queries'
import { useClassStudents } from '@/queries/teacher.queries'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/datetime'
import {
  GRADING_SCHEME_LABEL,
  describePaper,
  formatMark,
  formatMinutes,
  sortBands,
} from '@/lib/exams'
import { MAX_UPLOAD_BYTES, fileNameFromUrl, formatFileSize, resolveFileUrl, storageLabel } from '@/lib/files'
import { examApi } from '@/api/exam.api'
import { InlineFileRow } from '@/components/domain/document-viewer'
import { formatPercent } from '@/lib/format'
import { className as classLabel, subjectName } from '@/lib/select'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input, Textarea } from '@/components/ui/input'
import { ProgressBar } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { FiledBy } from '@/components/domain/filed-by'
import { ErrorState } from '@/components/feedback/states'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { DeleteResourceDialog } from '@/components/forms/delete-resource-dialog'
import { Field } from '@/components/forms/field'
import { tidyName as tidy } from '@/lib/names'
import { Band, TabStrip, TONE_FILL, TONE_TEXT, type Tone } from '@/components/layout/workspace'
import { useExamScope } from './exam-scope'
import { QuestionBuilder } from './question-builder'

/**
 * One exam: what it is, the paper, who has handed in, and the levers that
 * move it along — publish, mark, release results.
 *
 * The tab is kept in the URL so "open this exam on its questions" is a link
 * the create form can hand over to, and so a refresh mid-marking lands back
 * on the submissions list rather than the overview.
 */

type Tab = 'submissions' | 'questions' | 'details'
const TABS: Tab[] = ['submissions', 'questions', 'details']

// ------------------------------------------------------------- overview

/** The question paper on file, and a drop zone to upload or replace it. */
function PaperUpload({ exam }: { exam: ExamOut }) {
  const [progress, setProgress] = React.useState(0)
  const upload = useUploadPaper(setProgress)
  const [dragging, setDragging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const choose = (file: File | null) => {
    setError(null)
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That file is ${formatFileSize(file.size)}; the limit is ${formatFileSize(MAX_UPLOAD_BYTES)}.`)
      return
    }
    setProgress(0)
    upload.mutate({ examId: exam.id, file }, { onError: (e) => setError(e.message) })
  }

  const url = resolveFileUrl(exam.question_paper_url)

  return (
    <div className="grid gap-x-10 gap-y-3 py-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <div>
        <h3 className="text-sm font-medium text-foreground">Question paper</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {exam.mode === 'OFFLINE'
            ? 'Students download this, answer it, and upload their answers as a PDF, Word document or photos'
            : 'Optional: a printable version of the paper for reference'}
        </p>
      </div>
      <div className="max-w-2xl space-y-2">
        {url && (
          <InlineFileRow
            name={fileNameFromUrl(exam.question_paper_url) ?? 'Question paper'}
            meta={`Stored on ${storageLabel(exam.question_paper_provider)}`}
            cacheKey={`paper-${exam.id}-${exam.question_paper_url}`}
            load={() => examApi.paperFile(exam.id)}
          />
        )}
        {exam.question_paper_warning && (
          <p className="flex items-start gap-2 text-xs text-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            {exam.question_paper_warning}
          </p>
        )}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            choose(e.dataTransfer.files?.[0] ?? null)
          }}
          className={cn('flex items-center gap-3 border-y border-dashed px-1 py-3 text-sm transition-colors', dragging ? 'border-primary bg-primary/5' : 'border-border')}
        >
          {upload.isPending ? (
            <div className="w-full space-y-1.5">
              <p className="text-xs text-muted-foreground">Uploading… {progress}%</p>
              <ProgressBar value={progress} size="sm" />
            </div>
          ) : (
            <>
              <UploadCloud className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                Drop a PDF, document or image here, or{' '}
                <label className="cursor-pointer font-medium text-primary hover:underline">
                  browse
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.doc,.docx,.odt,.rtf,image/*"
                    onChange={(e) => {
                      choose(e.target.files?.[0] ?? null)
                      e.target.value = ''
                    }}
                  />
                </label>
                <span className="block text-xs text-muted-foreground">{url ? 'Uploading again replaces the current paper' : `Up to ${formatFileSize(MAX_UPLOAD_BYTES)}`}</span>
              </span>
            </>
          )}
        </div>
        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

/** A group of details: its name on the left, label/value lines on the right. */
function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-1 py-4 md:grid-cols-[10rem_minmax(0,1fr)]">
      <h3 className="pt-1.5 text-sm font-medium text-foreground">{title}</h3>
      <dl className="max-w-2xl divide-y divide-border">{children}</dl>
    </section>
  )
}

function FactLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{children}</dd>
    </div>
  )
}

/** Everything about the exam that is not a script: when, how it is marked, the paper, extra time. */
function DetailsTab({ exam, roster, onGoTo }: { exam: ExamOut; roster: UserOut[]; onGoTo: (tab: Tab) => void }) {
  const bands = sortBands(exam.grade_bands)
  return (
    <>
      <Band className="border-b border-border">
        <div className="divide-y divide-border">
          <DetailGroup title="Schedule">
            <FactLine label="Opens">{formatDateTime(exam.starts_at)}</FactLine>
            <FactLine label="Closes">{formatDateTime(exam.ends_at)}</FactLine>
            <FactLine label="Time per student">{exam.duration_minutes ? formatMinutes(exam.duration_minutes) : 'Whole window'}</FactLine>
            <FactLine label="Upload grace time">{exam.upload_grace_minutes > 0 ? formatMinutes(exam.upload_grace_minutes) : 'None'}</FactLine>
            <FactLine label="Late work">{exam.late_submission_allowed ? 'Accepted, flagged late' : 'Not accepted'}</FactLine>
          </DetailGroup>
          <DetailGroup title="Marking">
            <FactLine label="Scheme">{GRADING_SCHEME_LABEL[exam.grading_scheme]}</FactLine>
            <FactLine label="Out of">
              {formatMark(exam.max_marks)}
              {exam.question_count > 0 && Math.abs(exam.questions_total_marks - exam.max_marks) > 0.001 && (
                <span className="ml-1 text-xs font-normal text-warning">(paper adds to {formatMark(exam.questions_total_marks)})</span>
              )}
            </FactLine>
            <FactLine label="Pass mark">{exam.pass_marks != null ? formatMark(exam.pass_marks) : 'None'}</FactLine>
            <FactLine label="Auto-marking">{exam.auto_grade_objective ? 'On' : 'Off'}</FactLine>
            {bands.length > 0 && (
              <FactLine label="Grades">
                <span className="font-normal text-muted-foreground">
                  {bands.map((b, i) => (
                    <span key={b.grade} title={b.description ?? undefined}>
                      {i > 0 && ' · '}
                      <span className="font-medium text-foreground">{b.grade}</span> {b.min_percentage}%+
                    </span>
                  ))}
                </span>
              </FactLine>
            )}
          </DetailGroup>
          <DetailGroup title="Paper">
            <FactLine label="Paper">
              <button type="button" onClick={() => onGoTo('questions')} className="hover:text-primary hover:underline">
                {describePaper(exam)}
              </button>
            </FactLine>
            {exam.question_count > 0 && (
              <FactLine label="Answer key">
                <span className={exam.answer_key_complete ? undefined : 'text-warning'}>{exam.answer_key_complete ? 'Complete' : 'Incomplete'}</span>
              </FactLine>
            )}
            <FactLine label="Question order">{exam.shuffle_questions ? 'Shuffled per student' : 'As written'}</FactLine>
          </DetailGroup>
          {(exam.description || exam.instructions) && (
            <DetailGroup title="For students">
              {exam.description && <FactLine label="Description">{exam.description}</FactLine>}
              {exam.instructions && <FactLine label="Instructions">{exam.instructions}</FactLine>}
            </DetailGroup>
          )}
        </div>
      </Band>
      {exam.mode === 'OFFLINE' && (
        <Band className="border-b border-border">
          <PaperUpload exam={exam} />
        </Band>
      )}
      <ConcessionsTab exam={exam} roster={roster} />
    </>
  )
}

// ---------------------------------------------------------- submissions

/**
 * Someone we have an id for but no profile: a student who has left the class
 * and whose script still needs marking, or the student a tuition assessment is
 * set for before they have started it and hydrated themselves onto a script.
 */
function placeholderStudent(studentId: number): UserOut {
  return {
    id: studentId,
    full_name: `Student #${String(studentId).slice(-6)}`,
    email: '',
    role: 'STUDENT',
    is_active: true,
    created_at: '',
  } as UserOut
}

interface RosterRow {
  student: UserOut
  submission: SubmissionOut | null
}

function SubmissionsTab({
  exam,
  submissions,
  roster,
  rosterPending,
  onReopen,
}: {
  exam: ExamOut
  submissions: SubmissionOut[]
  roster: UserOut[]
  rosterPending: boolean
  onReopen: (submission: SubmissionOut) => void
}) {
  const scope = useExamScope()

  const rows = React.useMemo<RosterRow[]>(() => {
    const byStudent = new Map(submissions.map((s) => [s.student_id, s]))
    const seen = new Set<number>()
    const list: RosterRow[] = []
    for (const student of roster) {
      seen.add(student.id)
      list.push({ student, submission: byStudent.get(student.id) ?? null })
    }
    // A script from someone no longer on the roster still needs marking.
    for (const s of submissions) {
      if (!seen.has(s.student_id)) {
        list.push({ student: s.student ?? placeholderStudent(s.student_id), submission: s })
      }
    }
    return list.sort((a, b) => a.student.full_name.localeCompare(b.student.full_name))
  }, [submissions, roster])

  const counts = React.useMemo(() => {
    const c = { ALL: rows.length, TO_MARK: 0, MARKED: 0, NOT_IN: 0 }
    for (const r of rows) {
      const status = r.submission?.status
      if (status === 'SUBMITTED') c.TO_MARK += 1
      else if (status === 'EVALUATED') c.MARKED += 1
      else c.NOT_IN += 1
    }
    return c
  }, [rows])


  if (rosterPending && submissions.length === 0) {
    return (
      <Band className="border-b border-border py-4">
        <Skeleton className="h-48 w-full" />
      </Band>
    )
  }

  if (rows.length === 0) {
    return (
      <Band className="border-b border-border">
        <p className="py-14 text-center text-sm text-muted-foreground">Nobody is enrolled in this class yet</p>
      </Band>
    )
  }

  const firstToMark = rows.find((r) => r.submission?.status === 'SUBMITTED')

  return (
    <Band className="border-b border-border">
      {/* One line that says where marking stands, and the one thing to do next. */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {counts.TO_MARK + counts.MARKED} of {counts.ALL}
          </span>{' '}
          handed in · <span className="font-medium text-foreground">{counts.MARKED}</span> marked
          {counts.TO_MARK > 0 && (
            <>
              {' '}
              · <span className="font-medium text-warning">{counts.TO_MARK} to mark</span>
            </>
          )}
        </p>
        {firstToMark && (
          <Button asChild size="sm" icon={<Play />}>
            <Link to={scope.gradePath(exam.id, firstToMark.student.id)}>Start marking</Link>
          </Button>
        )}
      </div>

      <div className="-mx-4 overflow-x-auto border-t border-border sm:-mx-6 lg:-mx-8">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 pl-4 text-left font-medium sm:pl-6 lg:pl-8">Student</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
              <th className="px-3 py-2 pr-4 text-right font-medium sm:pr-6 lg:pr-8">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ student, submission: sub }) => {
              const status = sub?.status
              const handedIn = status === 'SUBMITTED' || status === 'EVALUATED'
              const look: { label: string; tone: Tone } =
                status === 'EVALUATED'
                  ? { label: 'Marked', tone: 'success' }
                  : status === 'SUBMITTED'
                    ? { label: 'To mark', tone: 'warning' }
                    : status === 'IN_PROGRESS'
                      ? { label: 'Writing now', tone: 'info' }
                      : { label: 'Not handed in', tone: 'neutral' }
              return (
                <tr key={student.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 pl-4 sm:pl-6 lg:pl-8">
                    <span className={cn('font-medium', student.is_active ? 'text-foreground' : 'text-muted-foreground line-through')}>{tidy(student.full_name)}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', TONE_TEXT[look.tone])}>
                      <span className={cn('size-2 rounded-full', TONE_FILL[look.tone])} aria-hidden />
                      {look.label}
                    </span>
                    {sub?.is_late && <span className="ml-2 text-xs text-warning">late</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {status === 'EVALUATED' ? (
                      <span className="font-medium text-foreground">
                        {exam.grading_scheme === 'GRADE' && sub!.grade ? sub!.grade : `${formatMark(sub!.marks_obtained)} / ${formatMark(exam.max_marks)}`}
                        {sub!.percentage != null && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{formatPercent(sub!.percentage, 0)}</span>}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 pr-4 text-right sm:pr-6 lg:pr-8">
                    {handedIn && (
                      <span className="inline-flex items-center gap-1">
                        <Button asChild size="sm" variant={status === 'SUBMITTED' ? 'primary' : 'outline'}>
                          <Link to={scope.gradePath(exam.id, student.id)}>{status === 'SUBMITTED' ? 'Mark' : 'Review'}</Link>
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Hand back to the student" title="Hand back to the student" onClick={() => onReopen(sub!)}>
                          <RotateCcw />
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Band>
  )
}

// ---------------------------------------------------------- concessions

function ConcessionsTab({ exam, roster }: { exam: ExamOut; roster: UserOut[] }) {
  const grant = useGrantConcession()
  const [studentId, setStudentId] = React.useState<string | null>(null)
  const [minutes, setMinutes] = React.useState('15')
  const [reason, setReason] = React.useState('')

  const byId = new Map(roster.map((s) => [s.id, s]))
  const existing = Object.entries(exam.time_concessions ?? {})
    .map(([id, mins]) => ({ id: Number(id), minutes: mins, student: byId.get(Number(id)) ?? null }))
    .sort((a, b) => (a.student?.full_name ?? '').localeCompare(b.student?.full_name ?? ''))

  const mins = Number(minutes)
  const valid = studentId != null && Number.isInteger(mins) && mins > 0 && mins <= 1440

  return (
    <Band className="border-b border-border">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:divide-x lg:divide-border">
        <section className="min-w-0 py-5 lg:pr-8">
          <h3 className="text-sm font-medium text-foreground">Extra time granted</h3>
          <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Added to that student&rsquo;s deadline and personal duration, and nobody else&rsquo;s. Their work is not flagged late for using it. A
            student already sitting keeps the deadline they started with.
          </p>
          {existing.length === 0 ? (
            <p className="mt-4 border-y border-border py-8 text-center text-sm text-muted-foreground">No extra time on this exam</p>
          ) : (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {existing.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{c.student ? tidy(c.student.full_name) : `Student #${String(c.id).slice(-6)}`}</span>
                  <span className="inline-flex items-center gap-1 text-sm font-medium tabular-nums text-info">
                    <Timer className="size-3.5" />+{formatMinutes(c.minutes)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={grant.isPending}
                    onClick={() => grant.mutate({ examId: exam.id, body: { student_id: c.id, extra_minutes: 0 } })}
                  >
                    Withdraw
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3 border-t border-border py-5 lg:border-t-0 lg:pl-8">
          <h3 className="text-sm font-medium text-foreground">Grant extra time</h3>
          <Field id="concession-student" label="Student" required className="space-y-1">
            <Combobox
              id="concession-student"
              value={studentId}
              onChange={setStudentId}
              placeholder="Choose a student"
              emptyMessage="Nobody is enrolled in this class."
              className="h-9"
              options={roster.map((st) => ({ value: String(st.id), label: tidy(st.full_name), hint: st.email }))}
            />
          </Field>
          <Field id="concession-minutes" label="Extra minutes" required hint="Up to 1440" className="space-y-1">
            <Input id="concession-minutes" type="number" min={1} max={1440} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="h-9" />
          </Field>
          <Field id="concession-reason" label="Reason" hint="For the record only. Not shown to the student" className="space-y-1">
            <Textarea id="concession-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Access arrangement" className="text-sm" />
          </Field>
          <Button
            size="sm"
            icon={<Timer />}
            disabled={!valid}
            loading={grant.isPending}
            onClick={() =>
              grant.mutate(
                { examId: exam.id, body: { student_id: Number(studentId), extra_minutes: mins, reason: reason.trim() || null } },
                { onSuccess: () => setReason('') },
              )
            }
          >
            Grant extra time
          </Button>
        </section>
      </div>
    </Band>
  )
}

// ----------------------------------------------------------------- page

export default function ExamDetailPage() {
  const scope = useExamScope()
  const navigate = useNavigate()
  const params = useParams<{ examId: string }>()
  const examId = Number(params.examId)
  const [searchParams, setSearchParams] = useSearchParams()

  const examQuery = useExam(Number.isFinite(examId) ? examId : null)
  const exam = examQuery.data
  const live = exam?.status === 'PUBLISHED' && (exam.window_state === 'OPEN' || exam.window_state === 'GRACE')
  const submissionsQuery = useExamSubmissions(exam ? examId : null, live)
  const rosterQuery = useClassStudents(exam?.class_id ?? null)

  const publishExam = usePublishExam()
  const publishResults = usePublishResults()
  const updateExam = useUpdateExam()
  const deleteExam = useDeleteExam()
  const replaceQuestions = useReplaceQuestions()
  const setAnswerKey = useSetAnswerKey()
  const reopen = useReopenSubmission()

  // Scripts first once the exam is out; the paper first while it is a draft.
  // Old links (?tab=overview, ?tab=concessions) open the details.
  const rawTab = searchParams.get('tab')
  const defaultTab: Tab = exam?.status === 'DRAFT' ? 'questions' : 'submissions'
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : rawTab === 'overview' || rawTab === 'concessions' ? 'details' : defaultTab
  const goTo = (next: Tab) => {
    const sp = new URLSearchParams(searchParams)
    sp.set('tab', next)
    setSearchParams(sp, { replace: true })
  }

  const [confirm, setConfirm] = React.useState<'publish' | 'results' | 'cancel' | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [reopening, setReopening] = React.useState<SubmissionOut | null>(null)

  const submissions = React.useMemo(() => submissionsQuery.data ?? [], [submissionsQuery.data])

  const roster = React.useMemo<UserOut[]>(() => {
    // An LMS exam is sat by a class; a tuition assessment by the one student it
    // was set for. `class_id` is null on the latter, so the class roster query
    // never runs and this is where its roster of one comes from.
    if (exam?.program !== 'TUITION') return rosterQuery.data ?? []
    if (exam.student_id == null) return []
    const known = submissions.find((sub) => sub.student_id === exam.student_id)?.student
    return [known ?? placeholderStudent(exam.student_id)]
  }, [exam?.program, exam?.student_id, rosterQuery.data, submissions])
  const handedIn = submissions.filter((s) => s.status === 'SUBMITTED' || s.status === 'EVALUATED')
  const toMark = handedIn.filter((s) => s.status === 'SUBMITTED').length
  const evaluated = handedIn.length - toMark

  if (examQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (examQuery.isError || !exam) {
    return <ErrorState error={examQuery.error} onRetry={() => examQuery.refetch()} />
  }

  const canPublish =
    exam.status === 'DRAFT' && (exam.question_count > 0 || (exam.mode === 'OFFLINE' && !!exam.question_paper_url))
  const foreign = scope.userId != null && exam.teacher_id !== scope.userId

  // One plain line of where the exam stands.
  const standing =
    exam.status === 'DRAFT'
      ? canPublish
        ? 'Draft, ready to publish'
        : 'Draft, needs its paper before publishing'
      : exam.status === 'CANCELLED'
        ? 'Cancelled'
        : `${exam.window_state === 'OPEN' ? 'Open now' : exam.window_state === 'GRACE' ? 'Closing' : exam.window_state === 'NOT_OPEN' ? 'Not open yet' : 'Closed'} · ${exam.results_published ? 'results released' : 'results hidden'}`

  return (
    <div className="space-y-6">
      <Band className="-mt-6 border-b border-border">
        <div className="flex flex-col gap-3 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Link to={scope.examsPath} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" />
              All exams
            </Link>
            <h1 className="mt-1.5 text-2xl font-medium tracking-tight text-foreground">{exam.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {classLabel(exam)} · {tidy(subjectName(exam))} · {formatDateTime(exam.starts_at)} → {formatDateTime(exam.ends_at)} ·{' '}
              <span className="font-medium text-foreground">{standing}</span>
            </p>
            {foreign && !scope.isAdmin && (
              <div className="mt-2">
                <FiledBy teacherId={exam.teacher_id} teacher={exam.teacher} size="md" />
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {exam.status === 'DRAFT' && (
              <Button size="sm" icon={<Send />} disabled={!canPublish} title={canPublish ? undefined : 'Add questions or upload a question paper first'} onClick={() => setConfirm('publish')}>
                Publish to class
              </Button>
            )}
            {exam.status === 'PUBLISHED' && (
              <Button
                size="sm"
                variant={exam.results_published ? 'outline' : 'primary'}
                icon={<Eye />}
                disabled={evaluated === 0}
                title={evaluated === 0 ? 'Mark at least one script first' : undefined}
                loading={publishResults.isPending}
                onClick={() => setConfirm('results')}
              >
                {exam.results_published ? 'Publish again' : 'Publish results'}
              </Button>
            )}
            <Button asChild variant="outline" size="sm" icon={<PencilLine />}>
              <Link to={scope.editExamPath(exam.id)}>Edit</Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {exam.live_invigilation && exam.status === 'PUBLISHED' && (
                  <DropdownMenuItem asChild>
                    <Link to={`/call/exam/${exam.id}`}>
                      <Video className="size-4" />
                      Open exam room
                    </Link>
                  </DropdownMenuItem>
                )}
                {exam.status !== 'CANCELLED' && (
                  <DropdownMenuItem onSelect={() => setConfirm('cancel')}>
                    <Ban className="size-4" />
                    Cancel exam
                  </DropdownMenuItem>
                )}
                {exam.status === 'CANCELLED' && (
                  <DropdownMenuItem onSelect={() => updateExam.mutate({ examId: exam.id, body: { status: 'DRAFT' } })}>
                    <RotateCcw className="size-4" />
                    Restore as draft
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => setDeleting(true)}>
                  <Trash2 className="size-4" />
                  Delete exam
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <TabStrip
          label="Exam"
          idPrefix="exam-tab"
          value={tab}
          onChange={goTo}
          tabs={[
            { key: 'submissions', label: 'Scripts', count: toMark || undefined, alert: true },
            { key: 'questions', label: 'Paper', count: exam.question_count },
            { key: 'details', label: 'Details' },
          ]}
        />
      </Band>

      <div className="!mt-0" role="tabpanel" id="exam-tab-panel" aria-labelledby={`exam-tab-${tab}`}>
        {tab === 'submissions' &&
          (submissionsQuery.isError ? (
            <Band className="border-b border-border py-5">
              <ErrorState error={submissionsQuery.error} onRetry={() => submissionsQuery.refetch()} compact />
            </Band>
          ) : (
            <SubmissionsTab
              exam={exam}
              submissions={submissions}
              roster={roster}
              // A disabled query reports `isPending` forever, and the class
              // roster query is disabled on a tuition assessment — which has
              // no class to fetch. Nothing is loading there.
              rosterPending={exam.program !== 'TUITION' && rosterQuery.isPending}
              onReopen={setReopening}
            />
          ))}

        {tab === 'questions' && (
          <Band className="border-b border-border">
            <div className="py-5">
              <QuestionBuilder
                exam={exam}
                locked={handedIn.length > 0}
                lockedReason={`${handedIn.length} script${handedIn.length === 1 ? ' has' : 's have'} been handed in.`}
                saving={replaceQuestions.isPending || setAnswerKey.isPending}
                onSaveForm={(questions) => replaceQuestions.mutateAsync({ examId: exam.id, body: { questions } })}
                onSaveKey={(answers, regrade) => setAnswerKey.mutateAsync({ examId: exam.id, body: { answers, regrade } })}
              />
            </div>
          </Band>
        )}

        {tab === 'details' && <DetailsTab exam={exam} roster={roster} onGoTo={goTo} />}
      </div>

      <ConfirmDialog
        open={confirm === 'publish'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={exam.program === 'TUITION' ? 'Set this work for your student?' : 'Publish this exam to the class?'}
        description={
          exam.program === 'TUITION'
            ? `Your student will see it and can start once the window opens at ${formatDateTime(exam.starts_at)}. The question paper is fixed once they hand in.`
            : `Every student in ${classLabel(exam)} will see it and can start once the window opens at ${formatDateTime(exam.starts_at)}. The question paper is fixed once anyone hands in.`
        }
        confirmLabel="Publish"
        loading={publishExam.isPending}
        onConfirm={() => publishExam.mutate(exam.id, { onSettled: () => setConfirm(null) })}
      />

      <ConfirmDialog
        open={confirm === 'results'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={
          exam.results_published
            ? 'Re-publish results?'
            : exam.program === 'TUITION'
              ? 'Release results to your student?'
              : 'Release results to the class?'
        }
        description={
          <>
            {evaluated} marked script{evaluated === 1 ? '' : 's'} will be released. Students then see their marks, the
            answer key and your remarks, and each result appears in the student’s marks.
            {toMark > 0 && (
              <>
                {' '}
                <strong>{toMark} unmarked script{toMark === 1 ? ' is' : 's are'} held back</strong> — not released as zero.
                Mark {toMark === 1 ? 'it' : 'them'} and publish again.
              </>
            )}
          </>
        }
        confirmLabel="Publish results"
        loading={publishResults.isPending}
        onConfirm={() => publishResults.mutate(exam.id, { onSettled: () => setConfirm(null) })}
      />

      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Cancel this exam?"
        description="It stays visible to students as cancelled and accepts nothing. Scripts already handed in are kept. You can restore it as a draft later."
        confirmLabel="Cancel exam"
        destructive
        loading={updateExam.isPending}
        onConfirm={() =>
          updateExam.mutate({ examId: exam.id, body: { status: 'CANCELLED' } }, { onSettled: () => setConfirm(null) })
        }
      />

      <DeleteResourceDialog
        open={deleting}
        onOpenChange={setDeleting}
        resourceLabel="exam"
        resourceName={exam.title}
        description="Scripts students have handed in, and any marks already published from them, are what stands in the way."
        onDelete={async (force) => {
          await deleteExam.mutateAsync({ examId: exam.id, force })
          navigate(scope.examsPath, { replace: true })
        }}
      />

      <ConfirmDialog
        open={!!reopening}
        onOpenChange={(v) => !v && setReopening(null)}
        title="Hand this script back?"
        description={
          reopening
            ? `${reopening.student?.full_name ?? 'The student'} can edit and hand in again with whatever is left of their original time. Any marks on it are discarded${exam.results_published ? ', and a published result is withdrawn' : ''}.`
            : undefined
        }
        confirmLabel="Hand back"
        destructive
        loading={reopen.isPending}
        onConfirm={() => {
          if (!reopening) return
          reopen.mutate({ examId: exam.id, studentId: reopening.student_id }, { onSettled: () => setReopening(null) })
        }}
      />
    </div>
  )
}

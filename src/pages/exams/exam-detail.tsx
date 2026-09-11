import {
  ArrowLeft,
  Ban,
  CalendarClock,
  CheckCheck,
  ClipboardList,
  ExternalLink,
  Eye,
  FileText,
  Hourglass,
  KeyRound,
  ListChecks,
  MoreHorizontal,
  PencilLine,
  Play,
  RotateCcw,
  Send,
  Timer,
  Trash2,
  TriangleAlert,
  UploadCloud,
  UserRoundCog,
  Users,
} from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import type { ExamOut, ExamStats, SubmissionOut, UserOut } from '@/api/types'
import {
  useDeleteExam,
  useExam,
  useExamStats,
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
import { formatDateTime, formatRelative } from '@/lib/datetime'
import {
  GRADING_SCHEME_LABEL,
  describePaper,
  formatMark,
  formatMinutes,
  sortBands,
} from '@/lib/exams'
import { MAX_UPLOAD_BYTES, fileNameFromUrl, formatFileSize, resolveFileUrl, storageLabel } from '@/lib/files'
import { formatPercent, performanceTone } from '@/lib/format'
import { className as classLabel, subjectName } from '@/lib/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ExamModeBadge,
  ExamStatusBadge,
  ExamWindowBadge,
  ResultsBadge,
  SubmissionStatusBadge,
} from '@/components/domain/badges'
import { FiledBy } from '@/components/domain/filed-by'
import { FileTypeIcon } from '@/components/domain/file-type-icon'
import { UserCell } from '@/components/domain/user-cell'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { DeleteResourceDialog } from '@/components/forms/delete-resource-dialog'
import { Field } from '@/components/forms/field'
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

type Tab = 'overview' | 'questions' | 'submissions' | 'concessions'
const TABS: Tab[] = ['overview', 'questions', 'submissions', 'concessions']

// ------------------------------------------------------------- overview

function Tile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: React.ReactNode
  hint?: string
  icon: typeof Users
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'primary'
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          tone === 'default' && 'bg-muted text-muted-foreground',
          tone === 'primary' && 'bg-primary/12 text-primary',
          tone === 'success' && 'bg-success/12 text-success',
          tone === 'warning' && 'bg-warning/15 text-warning',
          tone === 'danger' && 'bg-danger/12 text-danger',
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums leading-tight">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

function StatTiles({ stats, exam }: { stats: ExamStats | undefined; exam: ExamOut }) {
  if (!stats) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    )
  }
  const toMark = stats.submitted - stats.evaluated
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        icon={Users}
        label="Handed in"
        value={
          <>
            {stats.submitted}
            <span className="text-sm font-normal text-muted-foreground"> / {stats.enrolled_students}</span>
          </>
        }
        hint={`${stats.missing} not yet${stats.late > 0 ? `, ${stats.late} late` : ''}`}
        tone="primary"
      />
      <Tile
        icon={ListChecks}
        label="Marked"
        value={stats.evaluated}
        hint={toMark > 0 ? `${toMark} waiting for you` : stats.submitted > 0 ? 'Everything handed in is marked' : 'Nothing to mark yet'}
        tone={toMark > 0 ? 'warning' : stats.evaluated > 0 ? 'success' : 'default'}
      />
      <Tile
        icon={CheckCheck}
        label="Class average"
        value={stats.average_percentage != null ? formatPercent(stats.average_percentage, 0) : '—'}
        hint={
          stats.highest_percentage != null
            ? `${formatPercent(stats.lowest_percentage, 0)} – ${formatPercent(stats.highest_percentage, 0)}`
            : 'Once scripts are marked'
        }
        tone={stats.average_percentage != null ? (performanceTone(stats.average_percentage) as 'success') : 'default'}
      />
      <Tile
        icon={Eye}
        label={exam.pass_marks != null ? 'Passed' : 'Results'}
        value={
          exam.pass_marks != null && stats.pass_count != null ? (
            <>
              {stats.pass_count}
              <span className="text-sm font-normal text-muted-foreground"> / {stats.pass_count + (stats.fail_count ?? 0)}</span>
            </>
          ) : exam.results_published ? (
            'Out'
          ) : (
            'Hidden'
          )
        }
        hint={
          exam.results_published
            ? `Released ${exam.results_published_at ? formatRelative(exam.results_published_at) : ''}`
            : 'Students see no marks until you publish'
        }
        tone={exam.results_published ? 'success' : 'default'}
      />
    </div>
  )
}

function PaperCard({ exam }: { exam: ExamOut }) {
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
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Question paper</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {exam.mode === 'OFFLINE'
              ? 'Students download this, write on paper and upload their answer sheet.'
              : 'Optional — a printable version of the paper for reference.'}
          </p>
        </div>
        <FileText className="size-4 text-muted-foreground" />
      </div>

      {url ? (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
          <FileTypeIcon url={exam.question_paper_url} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{fileNameFromUrl(exam.question_paper_url)}</p>
            <p className="text-2xs text-muted-foreground">Stored on {storageLabel(exam.question_paper_provider)}</p>
          </div>
          <Button asChild variant="outline" size="sm" icon={<ExternalLink />}>
            <a href={url} target="_blank" rel="noreferrer">
              Open
            </a>
          </Button>
        </div>
      ) : null}

      {exam.question_paper_warning && (
        <p className="mt-2 flex items-start gap-2 text-xs text-warning">
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
        className={cn(
          'mt-3 rounded-lg border-2 border-dashed p-4 text-center text-sm transition-colors',
          dragging ? 'border-primary bg-primary/8' : 'border-border',
        )}
      >
        {upload.isPending ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Uploading… {progress}%</p>
            <ProgressBar value={progress} size="sm" />
          </div>
        ) : (
          <>
            <UploadCloud className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-1.5">
              Drop a PDF, document or image here, or{' '}
              <label className="cursor-pointer font-medium text-primary hover:underline">
                browse
                <input
                  type="file"
                  className="sr-only"
                  accept=".pdf,.doc,.docx,image/*"
                  onChange={(e) => {
                    choose(e.target.files?.[0] ?? null)
                    e.target.value = ''
                  }}
                />
              </label>
            </p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {url ? 'Uploading again replaces the current paper.' : `Up to ${formatFileSize(MAX_UPLOAD_BYTES)}`}
            </p>
          </>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </Card>
  )
}

function Readiness({ exam }: { exam: ExamOut }) {
  const hasPaper = exam.question_count > 0 || (exam.mode === 'OFFLINE' && !!exam.question_paper_url)
  const objective = exam.questions.filter((q) => ['MCQ', 'MULTI_SELECT', 'TRUE_FALSE', 'SHORT_ANSWER', 'NUMERIC'].includes(q.question_type))
  const items: { ok: boolean; label: string; optional?: boolean }[] = [
    {
      ok: hasPaper,
      label: exam.mode === 'ONLINE' ? 'At least one question on the paper' : 'A question form or an uploaded question paper',
    },
    {
      ok: exam.answer_key_complete || objective.length === 0,
      label: objective.length === 0 ? 'No objective questions to key' : 'Answer key set for every objective question',
      optional: true,
    },
    {
      ok: Math.abs(exam.questions_total_marks - exam.max_marks) < 0.001 || exam.question_count === 0,
      label: `Questions add up to what the exam is out of (${formatMark(exam.max_marks)})`,
      optional: true,
    },
  ]
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-2 text-sm">
          <span
            className={cn(
              'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
              item.ok ? 'bg-success text-success-foreground' : item.optional ? 'bg-warning/20 text-warning' : 'bg-danger/15 text-danger',
            )}
          >
            {item.ok ? '✓' : '!'}
          </span>
          <span className={cn(!item.ok && !item.optional && 'text-danger')}>
            {item.label}
            {!item.ok && item.optional && <span className="text-muted-foreground"> — recommended</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function OverviewTab({ exam, stats, onGoTo }: { exam: ExamOut; stats: ExamStats | undefined; onGoTo: (tab: Tab) => void }) {
  const bands = sortBands(exam.grade_bands)
  return (
    <div className="space-y-5">
      {exam.status === 'PUBLISHED' && <StatTiles stats={stats} exam={exam} />}

      {exam.status === 'DRAFT' && (
        <Card className="border-primary/30 bg-primary/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold">Before you publish</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Students see nothing until this exam is published. Here is what it still needs.
              </p>
              <div className="mt-3">
                <Readiness exam={exam} />
              </div>
            </div>
            <Button variant="outline" size="sm" icon={<ClipboardList />} onClick={() => onGoTo('questions')}>
              Open the paper
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Schedule</h3>
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Opens</dt>
              <dd className="text-right font-medium">{formatDateTime(exam.starts_at)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Closes</dt>
              <dd className="text-right font-medium">{formatDateTime(exam.ends_at)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Time per student</dt>
              <dd className="font-medium">{exam.duration_minutes ? formatMinutes(exam.duration_minutes) : 'Whole window'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Uploading concession</dt>
              <dd className="font-medium">{exam.upload_grace_minutes > 0 ? formatMinutes(exam.upload_grace_minutes) : 'None'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Late work</dt>
              <dd className="font-medium">{exam.late_submission_allowed ? 'Accepted, flagged late' : 'Not accepted'}</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Marking</h3>
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Scheme</dt>
              <dd className="font-medium">{GRADING_SCHEME_LABEL[exam.grading_scheme]}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Out of</dt>
              <dd className="font-medium tabular-nums">
                {formatMark(exam.max_marks)}
                {exam.question_count > 0 && Math.abs(exam.questions_total_marks - exam.max_marks) > 0.001 && (
                  <span className="ml-1 text-xs text-warning">(paper adds to {formatMark(exam.questions_total_marks)})</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Pass mark</dt>
              <dd className="font-medium tabular-nums">{exam.pass_marks != null ? formatMark(exam.pass_marks) : 'None'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Auto-marking</dt>
              <dd className="font-medium">{exam.auto_grade_objective ? 'On' : 'Off'}</dd>
            </div>
          </dl>
          {bands.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {bands.map((b) => (
                <Tooltip key={b.grade}>
                  <TooltipTrigger asChild>
                    <Badge tone="outline" size="sm">
                      <span className="font-bold">{b.grade}</span> ≥ {b.min_percentage}%
                    </Badge>
                  </TooltipTrigger>
                  {b.description && <TooltipContent>{b.description}</TooltipContent>}
                </Tooltip>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <ListChecks className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Paper</h3>
            </div>
            <p className="mt-3 text-sm">
              <span className="font-medium">{describePaper(exam)}</span>
              {exam.question_count > 0 && (
                <span className="text-muted-foreground"> · {formatMark(exam.questions_total_marks)} marks</span>
              )}
            </p>
            {exam.question_count > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {exam.answer_key_complete ? 'Answer key complete.' : 'Answer key incomplete — objective answers without a key wait for you.'}
                {exam.shuffle_questions ? ' Questions are shuffled per student.' : ''}
              </p>
            )}
            <Button variant="outline" size="sm" className="mt-3" icon={<PencilLine />} onClick={() => onGoTo('questions')}>
              {exam.question_count > 0 ? 'Edit the paper' : 'Write the paper'}
            </Button>
          </Card>
        </div>
      </div>

      {exam.mode === 'OFFLINE' && <PaperCard exam={exam} />}

      {(exam.description || exam.instructions) && (
        <div className="grid gap-4 md:grid-cols-2">
          {exam.description && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold">Description</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{exam.description}</p>
            </Card>
          )}
          {exam.instructions && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold">Instructions to students</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{exam.instructions}</p>
            </Card>
          )}
        </div>
      )}
    </div>
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

type SubmissionFilter = 'ALL' | 'TO_MARK' | 'MARKED' | 'NOT_IN'

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
  const [filter, setFilter] = React.useState<SubmissionFilter>('ALL')

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

  const visible = rows.filter((r) => {
    const status = r.submission?.status
    if (filter === 'TO_MARK') return status === 'SUBMITTED'
    if (filter === 'MARKED') return status === 'EVALUATED'
    if (filter === 'NOT_IN') return status !== 'SUBMITTED' && status !== 'EVALUATED'
    return true
  })

  if (rosterPending && submissions.length === 0) return <Skeleton className="h-64 rounded-xl" />

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title="Nobody is enrolled in this class"
        description="Once students are enrolled, their scripts appear here as they are handed in."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<SubmissionFilter>
          layoutId="submission-filter"
          size="sm"
          value={filter}
          onChange={setFilter}
          aria-label="Filter scripts"
          options={[
            { value: 'ALL', label: `All ${counts.ALL}` },
            { value: 'TO_MARK', label: `To mark ${counts.TO_MARK}` },
            { value: 'MARKED', label: `Marked ${counts.MARKED}` },
            { value: 'NOT_IN', label: `Not handed in ${counts.NOT_IN}` },
          ]}
        />
        {counts.TO_MARK > 0 && (
          <Button
            asChild
            variant="primary"
            size="sm"
            icon={<Play />}
          >
            <Link to={scope.gradePath(exam.id, rows.find((r) => r.submission?.status === 'SUBMITTED')?.student.id ?? 0)}>
              Start marking
            </Link>
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <Table containerClassName="max-h-[65vh]">
          <TableHeader sticky>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-56">Student</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Handed in</TableHead>
              <TableHead align="right">Score</TableHead>
              <TableHead>Marked by</TableHead>
              <TableHead align="right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(({ student, submission }) => {
              const s = submission
              const handedIn = s?.status === 'SUBMITTED' || s?.status === 'EVALUATED'
              return (
                <TableRow key={student.id}>
                  <TableCell>
                    <UserCell name={student.full_name} email={student.email || undefined} inactive={!student.is_active} size="xs" />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SubmissionStatusBadge status={s?.status ?? null} size="sm" />
                      {s?.is_late && (
                        <Badge tone="warning" size="sm">
                          <Hourglass />
                          {s.late_by_minutes > 0 ? `${Math.round(s.late_by_minutes)} min late` : 'Late'}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s?.submitted_at ? formatDateTime(s.submitted_at) : s?.started_at ? `Started ${formatRelative(s.started_at)}` : '—'}
                  </TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {s?.status === 'EVALUATED' ? (
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-semibold">
                          {exam.grading_scheme === 'GRADE' && s.grade ? s.grade : `${formatMark(s.marks_obtained)} / ${formatMark(exam.max_marks)}`}
                        </span>
                        <span className="text-2xs text-muted-foreground">
                          {s.percentage != null ? formatPercent(s.percentage, 0) : ''}
                          {s.grade && exam.grading_scheme === 'MARKS' ? ` · ${s.grade}` : ''}
                          {s.passed === false ? ' · Fail' : s.passed === true ? ' · Pass' : ''}
                        </span>
                      </div>
                    ) : s?.status === 'SUBMITTED' && s.auto_graded_marks != null ? (
                      <span className="text-xs text-muted-foreground">auto {formatMark(s.auto_graded_marks)} so far</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s?.evaluator ? (
                      <span className="inline-flex items-center gap-1">
                        {s.evaluated_by !== scope.userId && <UserRoundCog className="size-3 text-warning" />}
                        {s.evaluator.full_name}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {handedIn ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant={s.status === 'SUBMITTED' ? 'solid' : 'outline'} size="sm">
                          <Link to={scope.gradePath(exam.id, student.id)}>{s.status === 'SUBMITTED' ? 'Mark' : 'Review'}</Link>
                        </Button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Hand back to student" onClick={() => onReopen(s)}>
                              <RotateCcw />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Hand the script back so the student can change it</TooltipContent>
                        </Tooltip>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">Extra time granted</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Added to that student&rsquo;s deadline and personal duration, and nobody else&rsquo;s. Their work is not flagged
            late for using it. A student already sitting keeps the deadline they started with.
          </p>
        </div>
        {existing.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No concessions on this exam.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {existing.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                <UserCell name={c.student?.full_name ?? `Student #${String(c.id).slice(-6)}`} email={c.student?.email} size="xs" className="flex-1" />
                <Badge tone="info">
                  <Timer />+{formatMinutes(c.minutes)}
                </Badge>
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
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Grant extra time</h3>
        <div className="mt-3 space-y-3">
          <Field id="concession-student" label="Student" required>
            <Combobox
              id="concession-student"
              value={studentId}
              onChange={setStudentId}
              placeholder="Select a student"
              emptyMessage="Nobody is enrolled in this class."
              options={roster.map((s) => ({ value: String(s.id), label: s.full_name, hint: s.email }))}
            />
          </Field>
          <Field id="concession-minutes" label="Extra minutes" required hint="Up to 1440.">
            <Input
              id="concession-minutes"
              type="number"
              min={1}
              max={1440}
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </Field>
          <Field id="concession-reason" label="Reason" hint="For the record only. Not shown to the student.">
            <Textarea id="concession-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Access arrangement" />
          </Field>
          <Button
            variant="primary"
            block
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
            Grant
          </Button>
        </div>
      </Card>
    </div>
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
  const statsQuery = useExamStats(exam?.status === 'PUBLISHED' ? examId : null, live)
  const submissionsQuery = useExamSubmissions(exam ? examId : null, live)
  const rosterQuery = useClassStudents(exam?.class_id ?? null)

  const publishExam = usePublishExam()
  const publishResults = usePublishResults()
  const updateExam = useUpdateExam()
  const deleteExam = useDeleteExam()
  const replaceQuestions = useReplaceQuestions()
  const setAnswerKey = useSetAnswerKey()
  const reopen = useReopenSubmission()

  const rawTab = searchParams.get('tab')
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : 'overview'
  const goTo = (next: Tab) => {
    const sp = new URLSearchParams(searchParams)
    if (next === 'overview') sp.delete('tab')
    else sp.set('tab', next)
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
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }
  if (examQuery.isError || !exam) {
    return <ErrorState error={examQuery.error} onRetry={() => examQuery.refetch()} />
  }

  const canPublish =
    exam.status === 'DRAFT' && (exam.question_count > 0 || (exam.mode === 'OFFLINE' && !!exam.question_paper_url))
  const foreign = scope.userId != null && exam.teacher_id !== scope.userId

  return (
    <>
      <Link
        to={scope.examsPath}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All exams
      </Link>

      <div className="mt-3 mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{exam.title}</h1>
            <ExamModeBadge mode={exam.mode} size="md" />
            <ExamStatusBadge status={exam.status} />
            {exam.status === 'PUBLISHED' && <ExamWindowBadge state={exam.window_state} />}
            {exam.status === 'PUBLISHED' && <ResultsBadge published={exam.results_published} size="md" />}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {classLabel(exam)} · {subjectName(exam)}
            {exam.teacher ? ` · set by ${exam.teacher.full_name}` : ''}
            {' · '}
            {formatDateTime(exam.starts_at)} → {formatDateTime(exam.ends_at)}
          </p>
          {foreign && !scope.isAdmin && (
            <div className="mt-2">
              <FiledBy teacherId={exam.teacher_id} teacher={exam.teacher} size="md" />
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {exam.status === 'DRAFT' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="primary" icon={<Send />} disabled={!canPublish} onClick={() => setConfirm('publish')}>
                    Publish to class
                  </Button>
                </span>
              </TooltipTrigger>
              {!canPublish && <TooltipContent>Add questions or upload a question paper first.</TooltipContent>}
            </Tooltip>
          )}
          {exam.status === 'PUBLISHED' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant={exam.results_published ? 'outline' : 'primary'}
                    icon={<Eye />}
                    disabled={evaluated === 0}
                    loading={publishResults.isPending}
                    onClick={() => setConfirm('results')}
                  >
                    {exam.results_published ? 'Re-publish results' : 'Publish results'}
                  </Button>
                </span>
              </TooltipTrigger>
              {evaluated === 0 && <TooltipContent>Mark at least one script first.</TooltipContent>}
            </Tooltip>
          )}
          <Button asChild variant="outline" icon={<PencilLine />}>
            <Link to={scope.editExamPath(exam.id)}>Edit</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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

      {exam.status === 'PUBLISHED' && toMark > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-warning/30 bg-warning/8 px-4 py-3 text-sm">
          <ListChecks className="size-4 shrink-0 text-warning" />
          <span>
            <span className="font-medium">{toMark} script{toMark === 1 ? '' : 's'}</span> waiting to be marked.
          </span>
          <Button asChild variant="solid" size="sm" className="ml-auto">
            <Link to={scope.gradePath(exam.id, handedIn.find((s) => s.status === 'SUBMITTED')?.student_id ?? 0)}>Start marking</Link>
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => goTo(v as Tab)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="questions">
            Paper
            <Badge tone="neutral" size="sm" className="ml-1">
              {exam.question_count}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="submissions">
            Scripts
            {toMark > 0 && (
              <Badge tone="warning" size="sm" className="ml-1">
                {toMark}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="concessions">Extra time</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab exam={exam} stats={statsQuery.data} onGoTo={goTo} />
        </TabsContent>

        <TabsContent value="questions">
          <QuestionBuilder
            exam={exam}
            locked={handedIn.length > 0}
            lockedReason={`${handedIn.length} script${handedIn.length === 1 ? ' has' : 's have'} been handed in.`}
            saving={replaceQuestions.isPending || setAnswerKey.isPending}
            onSaveForm={(questions) => replaceQuestions.mutateAsync({ examId: exam.id, body: { questions } })}
            onSaveKey={(answers, regrade) => setAnswerKey.mutateAsync({ examId: exam.id, body: { answers, regrade } })}
          />
        </TabsContent>

        <TabsContent value="submissions">
          {submissionsQuery.isError ? (
            <ErrorState error={submissionsQuery.error} onRetry={() => submissionsQuery.refetch()} compact />
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
          )}
        </TabsContent>

        <TabsContent value="concessions">
          <ConcessionsTab exam={exam} roster={roster} />
        </TabsContent>
      </Tabs>

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
            answer key and your remarks, and each result appears in the gradebook.
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
    </>
  )
}

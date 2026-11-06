import type { ColumnDef } from '@tanstack/react-table'
import { BarChart3, ChevronRight, Info, RefreshCw, TriangleAlert } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import type { StudentPerformanceReport, TeacherActivityReport } from '@/api/types'
import {
  isJobSettled,
  useJob,
  useMonitoringReport,
  useRefreshMonitoring,
} from '@/queries/admin.queries'
import { AT_RISK_ATTENDANCE, AT_RISK_GRADE } from '@/lib/constants'
import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/datetime'
import { formatNumber, formatPercent } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DataTable } from '@/components/data/data-table'
import { UserCell } from '@/components/domain/user-cell'
import { ErrorState } from '@/components/feedback/states'
import { SlowOperation } from '@/components/feedback/slow-operation'
import { PageHeader } from '@/components/layout/page-header'
import { Band, Figure, Figures, TabStrip, WorkspaceHeader } from '@/components/layout/workspace'

/*
 * Reports read like a register, not a dashboard of cards, and each view fits
 * on about one screen: a row of figures, then the one list that view is for.
 * White bands run edge to edge with hairlines between them; indigo marks
 * only the selected tab, and red is kept for who is below the line. Every
 * attendance and grade bar carries the same threshold tick (75% and 40%).
 *
 * Direction from the unslop pass by Damir Sokolovsky (@heydamir), CC BY 4.0.
 */

type ReportTab = 'overview' | 'teachers' | 'students'

const REPORT_TABS: { key: ReportTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'teachers', label: 'Teachers' },
  { key: 'students', label: 'Students' },
]

type TeacherFilter = 'all' | 'idle' | 'noTopics' | 'noClass'
type StudentFilter = 'all' | 'atRisk' | 'lowAttendance' | 'lowGrade' | 'noExams'

const UNASSIGNED = 'Unassigned'

/** Low attendance, or a low average once there is at least one exam to average. */
function isAtRisk(s: StudentPerformanceReport): boolean {
  return (
    s.attendance_percentage < AT_RISK_ATTENDANCE ||
    (s.total_exams_taken > 0 && s.average_grade_percentage < AT_RISK_GRADE)
  )
}

function teacherActions(t: TeacherActivityReport): number {
  return t.topics_covered_count + t.materials_uploaded_count + t.attendance_marked_count
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

const TEACHER_TESTS: Record<TeacherFilter, (t: TeacherActivityReport) => boolean> = {
  all: () => true,
  idle: (t) => teacherActions(t) === 0,
  noTopics: (t) => t.assigned_classes_count > 0 && t.topics_covered_count === 0,
  noClass: (t) => t.assigned_classes_count === 0,
}

const STUDENT_TESTS: Record<StudentFilter, (s: StudentPerformanceReport) => boolean> = {
  all: () => true,
  atRisk: isAtRisk,
  lowAttendance: (s) => s.attendance_percentage < AT_RISK_ATTENDANCE,
  lowGrade: (s) => s.total_exams_taken > 0 && s.average_grade_percentage < AT_RISK_GRADE,
  noExams: (s) => s.total_exams_taken === 0,
}

/**
 * A percentage against its threshold: a hairline track, a grey fill, and the
 * tick where "enough" begins. Below the tick the fill and the figure turn red.
 */
function RegisterBar({ value, threshold }: { value: number | null; threshold: number }) {
  if (value === null) return <span className="text-xs text-muted-foreground">No exams</span>
  const below = value < threshold
  return (
    <span className="flex items-center gap-3">
      <span className="relative h-1.5 w-20 shrink-0 rounded-full bg-muted">
        <span
          className={cn('absolute inset-y-0 left-0 rounded-full', below ? 'bg-danger' : 'bg-foreground/40')}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
        <span
          className="absolute -inset-y-1 w-px bg-foreground/70"
          style={{ left: `${threshold}%` }}
          title={`Threshold ${threshold}%`}
          aria-hidden
        />
      </span>
      <span className={cn('w-10 text-right text-sm tabular-nums', below ? 'font-medium text-danger' : 'text-foreground')}>
        {formatPercent(value, 0)}
      </span>
    </span>
  )
}

function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-4">
      <h2 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {title}
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground transition-colors hover:text-foreground" aria-label="How this is worked out">
                <Info className="size-4" strokeWidth={1.5} />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs leading-relaxed">{hint}</TooltipContent>
          </Tooltip>
        )}
      </h2>
      {action}
    </div>
  )
}

/** One of the three short lists in the overview's bottom band. */
function ShortList({
  title,
  empty,
  action,
  items,
}: {
  title: string
  empty: string
  action?: React.ReactNode
  items: { key: string | number; name: string; meta?: string; value: string; tone?: 'danger' }[]
}) {
  return (
    <section className="min-w-0 py-4 lg:px-6 lg:first:pl-0 lg:last:pr-0">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {action}
      </div>
      {items.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((i) => (
            <li key={i.key} className="flex h-9 items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-sm">{i.name}</span>
              {i.meta && <span className="shrink-0 text-xs text-muted-foreground">{i.meta}</span>}
              <span
                className={cn(
                  'shrink-0 text-right text-sm tabular-nums',
                  i.tone === 'danger' ? 'font-medium text-danger' : 'text-foreground',
                )}
              >
                {i.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** White, ruled above and below: where a list sits on the grey page. */
function Sheet({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('border-y border-border bg-card', className)}>{children}</div>
}

function TextLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="shrink-0 text-sm text-primary transition-colors hover:text-primary/80">
      {children}
    </button>
  )
}

/**
 * Quick filters above a list: each says how many it would show, and the ones
 * that are a problem show their count in red. A segmented control, so it reads
 * as one choice rather than a row of tags.
 */
function QuickFilter<K extends string>({
  value,
  onChange,
  options,
}: {
  value: K
  onChange: (key: K) => void
  options: { key: K; label: string; count: number; problem?: boolean }[]
}) {
  return (
    <div role="radiogroup" aria-label="Show" className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map((o) => {
        const active = value === o.key
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.key)}
            className={cn(
              'inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors',
              active ? 'bg-card font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
            <span
              className={cn(
                'text-xs tabular-nums',
                o.problem && o.count > 0 ? 'font-medium text-danger' : 'text-muted-foreground',
              )}
            >
              {formatNumber(o.count)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function AdminReportsPage() {
  const reportQuery = useMonitoringReport()
  const startRefresh = useRefreshMonitoring()
  const [searchParams, setSearchParams] = useSearchParams()
  const [teacherFilter, setTeacherFilter] = React.useState<TeacherFilter>('all')
  const [studentFilter, setStudentFilter] = React.useState<StudentFilter>('all')
  const [classMetric, setClassMetric] = React.useState<'attendance' | 'grade'>('attendance')
  const navigate = useNavigate()
  const requested = searchParams.get('tab') as ReportTab | null
  const tab: ReportTab = requested && REPORT_TABS.some((t) => t.key === requested) ? requested : 'overview'
  // In the address, so a refresh or a shared link opens the same view. A
  // search rides along when a class row opens its students.
  const openTab = (key: ReportTab, search?: string) => {
    const next = new URLSearchParams(searchParams)
    if (key === 'overview') next.delete('tab')
    else next.set('tab', key)
    if (search) next.set('q', search)
    else next.delete('q')
    setSearchParams(next, { replace: true })
  }

  /**
   * The report is served from a server-side cache, so "Refresh" has to mean
   * *recompute*, not re-fetch — a plain refetch would hand back the same cached
   * figures and look broken. We start a background job instead and follow it.
   */
  const [jobId, setJobId] = React.useState<string | null>(null)
  const jobQuery = useJob(jobId)
  const job = jobQuery.data
  const rebuilding = !!jobId && !isJobSettled(job?.status)

  // When the job finishes, pull the freshly-cached report. The job itself
  // returns no data — it only repopulates the server's cache.
  React.useEffect(() => {
    if (!job || !isJobSettled(job.status)) return
    if (job.status === 'SUCCEEDED') void reportQuery.refetch()
    setJobId(null)
    // reportQuery is intentionally omitted: including it re-runs on every
    // fetch-state change and would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.job_id])

  // A lost job (server restart, or a poll hitting another worker) is a 404.
  // Stop tracking rather than spinning forever on something that is gone.
  React.useEffect(() => {
    if (jobQuery.isError) setJobId(null)
  }, [jobQuery.isError])

  const rebuild = async () => {
    const started = await startRefresh.mutateAsync().catch(() => null)
    if (started) setJobId(started.job_id)
  }

  const report = reportQuery.data

  // The busiest teacher sets the scale for everyone's activity bar.
  const maxActions = React.useMemo(
    () => Math.max(1, ...(report?.teacher_activity ?? []).map(teacherActions)),
    [report],
  )

  const teacherColumns = React.useMemo<ColumnDef<TeacherActivityReport, unknown>[]>(
    () => [
      {
        id: 'teacher',
        header: 'Teacher',
        accessorFn: (row) => row.teacher_name,
        cell: ({ row }) => <UserCell name={row.original.teacher_name} size="xs" />,
      },
      {
        id: 'assignments',
        header: 'Classes',
        accessorFn: (row) => row.assigned_classes_count,
        meta: { align: 'right' },
        cell: ({ row }) =>
          row.original.assigned_classes_count === 0 ? (
            <span className="text-sm text-muted-foreground">None</span>
          ) : (
            <span className="tabular-nums">{row.original.assigned_classes_count}</span>
          ),
      },
      {
        id: 'attendance',
        header: 'Attendance marks',
        accessorFn: (row) => row.attendance_marked_count,
        meta: { align: 'right' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.attendance_marked_count}</span>,
      },
      {
        id: 'topics',
        header: 'Topics',
        accessorFn: (row) => row.topics_covered_count,
        meta: { align: 'right' },
        cell: ({ row }) =>
          row.original.assigned_classes_count > 0 && row.original.topics_covered_count === 0 ? (
            <span className="font-medium tabular-nums text-danger">0</span>
          ) : (
            <span className="tabular-nums">{row.original.topics_covered_count}</span>
          ),
      },
      {
        id: 'materials',
        header: 'Materials',
        accessorFn: (row) => row.materials_uploaded_count,
        meta: { align: 'right' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.materials_uploaded_count}</span>,
      },
      {
        id: 'activity',
        header: 'Activity',
        accessorFn: (row) => teacherActions(row),
        cell: ({ row }) => {
          const total = teacherActions(row.original)
          if (total === 0) return <span className="text-sm font-medium text-danger">Nothing recorded</span>
          return (
            <span className="flex items-center gap-3">
              <span className="h-1.5 w-24 shrink-0 rounded-full bg-muted">
                <span className="block h-full rounded-full bg-foreground/40" style={{ width: `${(total / maxActions) * 100}%` }} />
              </span>
              <span className="text-sm tabular-nums">{formatNumber(total)}</span>
            </span>
          )
        },
      },
    ],
    [maxActions],
  )

  const studentColumns = React.useMemo<ColumnDef<StudentPerformanceReport, unknown>[]>(
    () => [
      {
        id: 'student',
        header: 'Student',
        accessorFn: (row) => row.student_name,
        cell: ({ row }) => <UserCell name={row.original.student_name} size="xs" />,
      },
      {
        id: 'class',
        header: 'Class',
        accessorFn: (row) => row.class_name,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => (
          <span className={cn('text-sm', row.original.class_name === UNASSIGNED ? 'text-muted-foreground' : 'text-foreground')}>
            {row.original.class_name}
          </span>
        ),
      },
      {
        id: 'attendance',
        header: 'Attendance',
        accessorFn: (row) => row.attendance_percentage,
        cell: ({ row }) => <RegisterBar value={row.original.attendance_percentage} threshold={AT_RISK_ATTENDANCE} />,
      },
      {
        id: 'grade',
        header: 'Average grade',
        accessorFn: (row) => row.average_grade_percentage,
        cell: ({ row }) => (
          <RegisterBar
            value={row.original.total_exams_taken > 0 ? row.original.average_grade_percentage : null}
            threshold={AT_RISK_GRADE}
          />
        ),
      },
      {
        id: 'exams',
        header: 'Exams',
        accessorFn: (row) => row.total_exams_taken,
        meta: { align: 'right' },
        cell: ({ row }) =>
          row.original.total_exams_taken === 0 ? (
            <span className="text-sm text-muted-foreground">None</span>
          ) : (
            <span className="text-sm tabular-nums">{row.original.total_exams_taken}</span>
          ),
      },
      {
        id: 'risk',
        header: 'Status',
        accessorFn: (row) => (isAtRisk(row) ? 'At risk' : 'On track'),
        // Only the exception is marked. "On track" on every row is noise.
        cell: ({ getValue }) =>
          getValue() === 'At risk' ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-danger">
              <TriangleAlert className="size-4" strokeWidth={1.5} />
              At risk
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">On track</span>
          ),
      },
    ],
    [],
  )

  /**
   * The student figures rolled up per class. The average grade counts only
   * students who have sat an exam, so a class with none yet reads as "No
   * exams" rather than as 0%.
   */
  const classRows = React.useMemo(() => {
    const byClass = new Map<string, StudentPerformanceReport[]>()
    for (const s of report?.student_performance ?? []) {
      byClass.set(s.class_name, [...(byClass.get(s.class_name) ?? []), s])
    }
    return [...byClass.entries()]
      .map(([name, list]) => ({
        name,
        students: list.length,
        attendance: mean(list.map((s) => s.attendance_percentage)) ?? 0,
        grade: mean(list.filter((s) => s.total_exams_taken > 0).map((s) => s.average_grade_percentage)),
        atRisk: list.filter(isAtRisk).length,
      }))
      .sort((a, b) =>
        a.name === UNASSIGNED ? 1 : b.name === UNASSIGNED ? -1 : a.name.localeCompare(b.name, undefined, { numeric: true }),
      )
  }, [report])

  /** The students most worth a call today: at risk, lowest attendance first. */
  const needsAttention = React.useMemo(
    () =>
      (report?.student_performance ?? [])
        .filter(isAtRisk)
        .sort((a, b) => a.attendance_percentage - b.attendance_percentage)
        .slice(0, 5),
    [report],
  )

  const classOptions = React.useMemo(
    () =>
      [...new Set((report?.student_performance ?? []).map((s) => s.class_name))]
        .sort()
        .map((v) => ({ value: v, label: v })),
    [report],
  )

  if (reportQuery.isPending) {
    return (
      <>
        <PageHeader title="Reports & Analytics" description="Which classes, students and teachers need attention" />
        <SlowOperation label="Building the monitoring report" />
      </>
    )
  }

  if (reportQuery.isError || !report) {
    return (
      <>
        <PageHeader title="Reports & Analytics" description="Which classes, students and teachers need attention" />
        <ErrorState error={reportQuery.error} onRetry={() => reportQuery.refetch()} />
      </>
    )
  }

  const stats = report.overall_stats
  const teachers = report.teacher_activity
  const students = report.student_performance
  const examined = students.filter((s) => s.total_exams_taken > 0)
  const atRisk = students.filter(isAtRisk).length
  const lowAttendance = students.filter(STUDENT_TESTS.lowAttendance).length
  const lowGrade = students.filter(STUDENT_TESTS.lowGrade).length
  const avgAttendance = mean(students.map((s) => s.attendance_percentage))
  const avgGrade = mean(examined.map((s) => s.average_grade_percentage))
  const idle = teachers.filter(TEACHER_TESTS.idle)
  const noTopics = teachers.filter(TEACHER_TESTS.noTopics).length
  const noClass = teachers.filter(TEACHER_TESTS.noClass).length
  const share = (n: number, of: number) => (of > 0 ? formatPercent((n / of) * 100, 0) : '0%')

  // Overview: classes ranked weakest first on the chosen measure.
  const threshold = classMetric === 'attendance' ? AT_RISK_ATTENDANCE : AT_RISK_GRADE
  const rankedClasses = classRows
    .filter((c) => classMetric === 'attendance' || c.grade !== null)
    .sort((a, b) =>
      classMetric === 'attendance' ? a.attendance - b.attendance : (a.grade ?? 0) - (b.grade ?? 0),
    )
  const classesUnderAttendance = classRows.filter((c) => c.attendance < AT_RISK_ATTENDANCE).length
  const classesUnderGrade = classRows.filter((c) => c.grade !== null && c.grade < AT_RISK_GRADE).length
  const topStudents = [...examined].sort((a, b) => b.average_grade_percentage - a.average_grade_percentage).slice(0, 5)
  const followUp = [...idle, ...teachers.filter(TEACHER_TESTS.noTopics).filter((t) => !idle.includes(t))].slice(0, 5)
  const unassignedStudents = students.filter((s) => s.class_name === UNASSIGNED).length

  /** What needs doing, biggest problems first; only lines with something in them. */
  const todo = [
    {
      label: 'students at risk',
      count: atRisk,
      problem: true,
      go: () => {
        setStudentFilter('atRisk')
        openTab('students')
      },
    },
    {
      label: `classes under ${AT_RISK_ATTENDANCE}% attendance`,
      count: classesUnderAttendance,
      problem: true,
      go: () => setClassMetric('attendance'),
    },
    {
      label: 'teachers with nothing recorded',
      count: idle.length,
      problem: true,
      go: () => {
        setTeacherFilter('idle')
        openTab('teachers')
      },
    },
    {
      label: 'teachers with classes but no topics',
      count: noTopics,
      problem: true,
      go: () => {
        setTeacherFilter('noTopics')
        openTab('teachers')
      },
    },
    { label: 'students not in a class', count: unassignedStudents, problem: false, go: () => navigate('/admin/classes') },
    { label: 'teachers without a class', count: noClass, problem: false, go: () => navigate('/admin/mappings') },
    {
      label: 'students without an exam',
      count: students.length - examined.length,
      problem: false,
      go: () => {
        setStudentFilter('noExams')
        openTab('students')
      },
    },
  ].filter((item) => item.count > 0)

  const shownTeachers = teachers.filter(TEACHER_TESTS[teacherFilter])
  const shownStudents = students.filter(STUDENT_TESTS[studentFilter])

  return (
    <div className="space-y-6">
      {/* --------------------------------------------- header and tabs band */}
      <WorkspaceHeader
        title="Reports & Analytics"
        description="Which classes, students and teachers need attention"
        icon={BarChart3}
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className={rebuilding ? 'animate-spin' : undefined} />}
            disabled={rebuilding}
            loading={startRefresh.isPending}
            onClick={rebuild}
          >
            {rebuilding ? 'Rebuilding' : 'Rebuild'}
          </Button>
        }
        tabs={
          <TabStrip
            label="Report"
            idPrefix="report-tab"
            value={tab}
            onChange={(key) => openTab(key)}
            tabs={REPORT_TABS.map((t) => ({
              key: t.key,
              label: t.label,
              count: t.key === 'teachers' ? teachers.length : t.key === 'students' ? students.length : undefined,
            }))}
            trailing={
              reportQuery.dataUpdatedAt > 0 && !rebuilding
                ? `Updated ${formatRelative(new Date(reportQuery.dataUpdatedAt))}`
                : undefined
            }
          />
        }
      >
        {rebuilding && (
          <div className="max-w-xl pb-4">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span>{job?.message ?? 'Rebuilding the report'}</span>
              <span className="tabular-nums text-muted-foreground">{Math.round(job?.percent ?? 0)}%</span>
            </div>
            <ProgressBar value={job?.percent ?? 0} size="sm" className="mt-2" />
          </div>
        )}
        {job?.status === 'FAILED' && (
          <p className="flex items-start gap-2 pb-4 text-sm text-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            The rebuild failed{job.error ? `: ${job.error}` : ''}. These are the last figures that completed.
          </p>
        )}
      </WorkspaceHeader>

      <div role="tabpanel" id="report-tab-panel" aria-labelledby={`report-tab-${tab}`} className="!mt-0 space-y-6">
        {/* -------------------------------------------------------- overview */}
        {tab === 'overview' && (
          <>
            <Figures>
              <Figure label="Students" value={formatNumber(stats.total_students)} context={`in ${formatNumber(stats.total_classes)} classes`} />
              <Figure label="Teachers" value={formatNumber(stats.total_teachers)} context={`${formatNumber(idle.length)} with nothing recorded`} />
              <Figure
                label="Average attendance"
                value={avgAttendance === null ? '—' : formatPercent(avgAttendance, 0)}
                context={`${formatNumber(lowAttendance)} under ${AT_RISK_ATTENDANCE}%`}
              />
              <Figure
                label="Average grade"
                value={avgGrade === null ? '—' : formatPercent(avgGrade, 0)}
                context={`${formatNumber(lowGrade)} under ${AT_RISK_GRADE}%`}
              />
              <Figure label="At risk" value={formatNumber(atRisk)} context={`${share(atRisk, students.length)} of students`} alert={atRisk > 0} />
            </Figures>

            <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              {/* -------------------------------- classes, worst first */}
              <section className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <SectionTitle
                    title="Classes, weakest first"
                    hint={`The tick on each bar is the line: ${AT_RISK_ATTENDANCE}% for attendance, ${AT_RISK_GRADE}% for grades. Bars under it are red. Click a class to open its students.`}
                  />
                  <QuickFilter
                    value={classMetric}
                    onChange={setClassMetric}
                    options={[
                      { key: 'attendance', label: 'Attendance', count: classesUnderAttendance, problem: true },
                      { key: 'grade', label: 'Grade', count: classesUnderGrade, problem: true },
                    ]}
                  />
                </div>
                <Sheet className="max-h-[19rem] overflow-auto px-4 py-2">
                  {rankedClasses.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {classRows.length === 0 ? 'No students yet' : 'No exams marked in any class yet'}
                    </p>
                  ) : (
                    <ul>
                      {rankedClasses.map((c) => {
                        const value = classMetric === 'attendance' ? c.attendance : (c.grade ?? 0)
                        const below = value < threshold
                        return (
                          <li key={c.name}>
                            <button
                              type="button"
                              onClick={() => openTab('students', c.name)}
                              className="grid h-9 w-full grid-cols-[7rem_minmax(0,1fr)_3rem_4.5rem] items-center gap-4 rounded-md px-2 text-left text-sm transition-colors hover:bg-muted/50"
                            >
                              <span className={cn('truncate font-medium', c.name === UNASSIGNED && 'text-muted-foreground')}>
                                {c.name}
                              </span>
                              <span className="relative h-2 rounded-full bg-muted">
                                <span
                                  className={cn('absolute inset-y-0 left-0 rounded-full', below ? 'bg-danger' : 'bg-foreground/40')}
                                  style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                                />
                                <span className="absolute -inset-y-1 w-px bg-foreground/70" style={{ left: `${threshold}%` }} aria-hidden />
                              </span>
                              <span className={cn('text-right tabular-nums', below ? 'font-medium text-danger' : 'text-foreground')}>
                                {formatPercent(value, 0)}
                              </span>
                              <span className="text-right text-xs text-muted-foreground">
                                {c.atRisk > 0 ? <span className="text-danger">{c.atRisk} at risk</span> : `${c.students} students`}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </Sheet>
              </section>

              {/* ----------------------------------------------- to do */}
              <section className="min-w-0">
                <SectionTitle title="To do" hint="What needs someone's attention, from the figures in this report. Each line opens the list behind it." />
                <Sheet>
                  {todo.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">Nothing needs attention right now</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {todo.map((item) => (
                        <li key={item.label}>
                          <button
                            type="button"
                            onClick={item.go}
                            className="group flex h-11 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-muted/40"
                          >
                            <span
                              className={cn(
                                'w-8 shrink-0 text-right text-base font-medium tabular-nums',
                                item.problem ? 'text-danger' : 'text-foreground',
                              )}
                            >
                              {formatNumber(item.count)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                            <ChevronRight
                              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                              strokeWidth={1.5}
                            />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Sheet>
              </section>
            </div>

            {/* ------------------------------- three short lists, one band */}
            <Band className="border-y border-border">
              <div className="grid divide-y divide-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
                <ShortList
                  title="Needs a call"
                  empty="Nobody is below the line"
                  action={
                    atRisk > needsAttention.length ? (
                      <TextLink
                        onClick={() => {
                          setStudentFilter('atRisk')
                          openTab('students')
                        }}
                      >
                        All {atRisk}
                      </TextLink>
                    ) : undefined
                  }
                  items={needsAttention.map((s) => ({
                    key: s.student_id,
                    name: s.student_name,
                    meta: s.class_name,
                    value: formatPercent(s.attendance_percentage, 0),
                    tone: 'danger' as const,
                  }))}
                />
                <ShortList
                  title="Top students"
                  empty="No exams marked yet"
                  items={topStudents.map((s) => ({
                    key: s.student_id,
                    name: s.student_name,
                    meta: s.class_name,
                    value: formatPercent(s.average_grade_percentage, 0),
                  }))}
                />
                <ShortList
                  title="Teachers to follow up"
                  empty="Every teacher is recording their classes"
                  action={
                    followUp.length > 0 ? (
                      <TextLink
                        onClick={() => {
                          setTeacherFilter(idle.length > 0 ? 'idle' : 'noTopics')
                          openTab('teachers')
                        }}
                      >
                        Teachers
                      </TextLink>
                    ) : undefined
                  }
                  items={followUp.map((t) => ({
                    key: t.teacher_id,
                    name: t.teacher_name,
                    value: teacherActions(t) === 0 ? 'Nothing recorded' : 'No topics',
                    tone: 'danger' as const,
                  }))}
                />
              </div>
            </Band>
          </>
        )}

        {/* -------------------------------------------------------- teachers */}
        {tab === 'teachers' && (
          <>
            <Figures>
              <Figure label="Teachers" value={formatNumber(teachers.length)} />
              <Figure label="Nothing recorded" value={formatNumber(idle.length)} alert={idle.length > 0} />
              <Figure label="Classes but no topics" value={formatNumber(noTopics)} alert={noTopics > 0} />
              <Figure label="No class assigned" value={formatNumber(noClass)} />
            </Figures>

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <QuickFilter
                  value={teacherFilter}
                  onChange={setTeacherFilter}
                  options={[
                    { key: 'all', label: 'All', count: teachers.length },
                    { key: 'idle', label: 'Nothing recorded', count: idle.length, problem: true },
                    { key: 'noTopics', label: 'Classes but no topics', count: noTopics, problem: true },
                    { key: 'noClass', label: 'No class assigned', count: noClass },
                  ]}
                />
                <span className="text-xs text-muted-foreground">Activity bars are scaled to the busiest teacher</span>
              </div>
              <DataTable
                key={teacherFilter}
                columns={teacherColumns}
                data={shownTeachers}
                getRowId={(row) => String(row.teacher_id)}
                searchPlaceholder="Search"
                searchValues={(row) => [row.teacher_name]}
                initialSorting={[{ id: 'activity', desc: teacherFilter === 'all' }]}
                pageSize={10}
                flat
                csv={{
                  filename: 'teacher-activity',
                  columns: [
                    { header: 'Teacher', value: (t) => t.teacher_name },
                    { header: 'Classes', value: (t) => t.assigned_classes_count },
                    { header: 'Attendance marks', value: (t) => t.attendance_marked_count },
                    { header: 'Topics', value: (t) => t.topics_covered_count },
                    { header: 'Materials', value: (t) => t.materials_uploaded_count },
                  ],
                }}
              />
            </section>
          </>
        )}

        {/* -------------------------------------------------------- students */}
        {tab === 'students' && (
          <>
            <Figures>
              <Figure label="Students" value={formatNumber(students.length)} context={`in ${formatNumber(classRows.length)} classes`} />
              <Figure
                label="Average attendance"
                value={avgAttendance === null ? '—' : formatPercent(avgAttendance, 0)}
                context={`${formatNumber(lowAttendance)} under ${AT_RISK_ATTENDANCE}%`}
              />
              <Figure
                label="Average grade"
                value={avgGrade === null ? '—' : formatPercent(avgGrade, 0)}
                context={`${formatNumber(lowGrade)} under ${AT_RISK_GRADE}%`}
              />
              <Figure label="At risk" value={formatNumber(atRisk)} context={`${share(atRisk, students.length)} of students`} alert={atRisk > 0} />
            </Figures>

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <QuickFilter
                  value={studentFilter}
                  onChange={setStudentFilter}
                  options={[
                    { key: 'all', label: 'All', count: students.length },
                    { key: 'atRisk', label: 'At risk', count: atRisk, problem: true },
                    { key: 'lowAttendance', label: `Attendance under ${AT_RISK_ATTENDANCE}%`, count: lowAttendance, problem: true },
                    { key: 'lowGrade', label: `Grade under ${AT_RISK_GRADE}%`, count: lowGrade, problem: true },
                    { key: 'noExams', label: 'No exams', count: students.length - examined.length },
                  ]}
                />
                <SectionTitle
                  title="How it is worked out"
                  hint="Attendance is the share of records marked Present. The average grade is the mean of each exam's marks divided by its maximum. A student with no records shows 0%, which cannot be told apart from a real zero."
                />
              </div>
              <DataTable
                key={studentFilter}
                columns={studentColumns}
                data={shownStudents}
                getRowId={(row) => String(row.student_id)}
                searchPlaceholder="Search"
                searchValues={(row) => [row.student_name, row.class_name]}
                searchParamKey="q"
                initialSorting={[{ id: 'attendance', desc: false }]}
                pageSize={10}
                flat
                facets={[{ columnId: 'class', label: 'Class', options: classOptions }]}
                csv={{
                  filename: 'student-performance',
                  columns: [
                    { header: 'Student', value: (s) => s.student_name },
                    { header: 'Class', value: (s) => s.class_name },
                    { header: 'Attendance %', value: (s) => s.attendance_percentage },
                    { header: 'Average grade %', value: (s) => s.average_grade_percentage },
                    { header: 'Exams taken', value: (s) => s.total_exams_taken },
                  ],
                }}
              />
            </section>
          </>
        )}
      </div>
    </div>
  )
}

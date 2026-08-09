import type { ColumnDef } from '@tanstack/react-table'
import {
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  Layers,
  Library,
  RefreshCw,
  TriangleAlert,
  Users,
} from 'lucide-react'
import * as React from 'react'

import type { StudentPerformanceReport, TeacherActivityReport } from '@/api/types'
import {
  isJobSettled,
  useJob,
  useMonitoringReport,
  useRefreshMonitoring,
} from '@/queries/admin.queries'
import { AT_RISK_ATTENDANCE, AT_RISK_GRADE } from '@/lib/constants'
import { formatRelative } from '@/lib/datetime'
import { formatPercent, performanceTone } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BarSeries, PerformanceScatter } from '@/components/charts/charts'
import { ChartCard, useChartPalette } from '@/components/charts/chart-card'
import { DataTable } from '@/components/data/data-table'
import { StatCard } from '@/components/domain/stat-card'
import { UserCell } from '@/components/domain/user-cell'
import { ErrorState } from '@/components/feedback/states'
import { SlowOperation } from '@/components/feedback/slow-operation'
import { PageHeader } from '@/components/layout/page-header'

function PercentCell({ value }: { value: number }) {
  const tone = performanceTone(value)
  return (
    <div className="flex items-center gap-2">
      <ProgressBar value={value} tone={tone} size="sm" className="w-16" />
      <span className="w-12 text-right text-sm tabular-nums">{formatPercent(value, 0)}</span>
    </div>
  )
}

export default function AdminReportsPage() {
  const reportQuery = useMonitoringReport()
  const startRefresh = useRefreshMonitoring()
  const palette = useChartPalette()

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
        header: 'Assignments',
        accessorFn: (row) => row.assigned_classes_count,
        meta: { align: 'right' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.assigned_classes_count}</span>,
      },
      {
        id: 'topics',
        header: 'Topics',
        accessorFn: (row) => row.topics_covered_count,
        meta: { align: 'right' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.topics_covered_count}</span>,
      },
      {
        id: 'materials',
        header: 'Materials',
        accessorFn: (row) => row.materials_uploaded_count,
        meta: { align: 'right' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.materials_uploaded_count}</span>,
      },
      {
        id: 'attendance',
        header: 'Attendance marks',
        accessorFn: (row) => row.attendance_marked_count,
        meta: { align: 'right' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.attendance_marked_count}</span>,
      },
      {
        id: 'activity',
        header: 'Activity',
        accessorFn: (row) =>
          row.topics_covered_count + row.materials_uploaded_count + row.attendance_marked_count,
        cell: ({ row }) => {
          const total =
            row.original.topics_covered_count +
            row.original.materials_uploaded_count +
            row.original.attendance_marked_count
          return total === 0 ? (
            <Badge tone="warning" size="sm">
              <TriangleAlert />
              No activity
            </Badge>
          ) : (
            <Badge tone="success" size="sm" dot>
              {total} actions
            </Badge>
          )
        },
      },
    ],
    [],
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
          <Badge tone={row.original.class_name === 'Unassigned' ? 'warning' : 'outline'} size="sm">
            {row.original.class_name}
          </Badge>
        ),
      },
      {
        id: 'attendance',
        header: 'Attendance',
        accessorFn: (row) => row.attendance_percentage,
        cell: ({ row }) => <PercentCell value={row.original.attendance_percentage} />,
      },
      {
        id: 'grade',
        header: 'Average grade',
        accessorFn: (row) => row.average_grade_percentage,
        cell: ({ row }) => <PercentCell value={row.original.average_grade_percentage} />,
      },
      {
        id: 'exams',
        header: 'Exams',
        accessorFn: (row) => row.total_exams_taken,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="tabular-nums text-sm">
            {row.original.total_exams_taken === 0 ? (
              <span className="text-muted-foreground">None</span>
            ) : (
              row.original.total_exams_taken
            )}
          </span>
        ),
      },
      {
        id: 'risk',
        header: 'Risk',
        accessorFn: (row) => {
          const hasAttendanceRisk = row.attendance_percentage < AT_RISK_ATTENDANCE
          const hasGradeRisk = row.total_exams_taken > 0 && row.average_grade_percentage < AT_RISK_GRADE
          return hasAttendanceRisk || hasGradeRisk ? 'At risk' : 'On track'
        },
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) =>
          getValue() === 'At risk' ? (
            <Badge tone="danger" size="sm">
              <TriangleAlert />
              At risk
            </Badge>
          ) : (
            <Badge tone="success" size="sm" dot>
              On track
            </Badge>
          ),
      },
    ],
    [],
  )

  const teacherChartData = React.useMemo(
    () =>
      (report?.teacher_activity ?? [])
        .map((t) => ({
          name: t.teacher_name,
          Topics: t.topics_covered_count,
          Materials: t.materials_uploaded_count,
          Attendance: t.attendance_marked_count,
        }))
        .sort(
          (a, b) =>
            b.Topics + b.Materials + b.Attendance - (a.Topics + a.Materials + a.Attendance),
        )
        .slice(0, 12),
    [report],
  )

  const scatterData = React.useMemo(
    () =>
      (report?.student_performance ?? []).map((s) => ({
        name: s.student_name,
        attendance: s.attendance_percentage,
        grade: s.average_grade_percentage,
        exams: Math.max(1, s.total_exams_taken),
      })),
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
        <PageHeader title="Reports" description="System-wide activity and performance." />
        <SlowOperation label="Building the monitoring report" />
      </>
    )
  }

  if (reportQuery.isError || !report) {
    return (
      <>
        <PageHeader title="Reports" description="System-wide activity and performance." />
        <ErrorState error={reportQuery.error} onRetry={() => reportQuery.refetch()} />
      </>
    )
  }

  const stats = report.overall_stats

  return (
    <>
      <PageHeader
        title="Reports"
        description="Cached by the server and rebuilt on demand."
        actions={
          <div className="flex items-center gap-3">
            {reportQuery.dataUpdatedAt > 0 && !rebuilding && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Updated {formatRelative(new Date(reportQuery.dataUpdatedAt))}
              </span>
            )}
            <Button
              variant="outline"
              icon={<RefreshCw className={rebuilding ? 'animate-spin' : undefined} />}
              disabled={rebuilding}
              loading={startRefresh.isPending}
              onClick={rebuild}
            >
              {rebuilding ? 'Rebuilding…' : 'Rebuild'}
            </Button>
          </div>
        }
      >
        {rebuilding && (
          <div className="rounded-xl border border-info/30 bg-info/8 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">
                {job?.message ?? 'Rebuilding the monitoring report…'}
              </p>
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.round(job?.percent ?? 0)}%
              </span>
            </div>
            <ProgressBar value={job?.percent ?? 0} tone="info" size="sm" className="mt-2" />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Running on the server — you can leave this page and it will keep going.
            </p>
          </div>
        )}

        {job?.status === 'FAILED' && (
          <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/8 px-4 py-3 text-sm text-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              The rebuild failed{job.error ? `: ${job.error}` : '.'} The figures below are the last
              ones that completed successfully.
            </span>
          </div>
        )}
      </PageHeader>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="teachers">Teachers</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
        </TabsList>

        {/* --------------------------------------------------------- overview */}
        <TabsContent value="overview" className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard index={0} label="Students" value={stats.total_students} icon={GraduationCap} tone="primary" />
            <StatCard index={1} label="Teachers" value={stats.total_teachers} icon={Users} tone="info" />
            <StatCard index={2} label="Classes" value={stats.total_classes} icon={Layers} tone="accent" />
            <StatCard index={3} label="Subjects" value={stats.total_subjects} icon={BookOpen} tone="success" />
            <StatCard index={4} label="Materials" value={stats.total_materials_uploaded} icon={Library} tone="warning" />
            <StatCard
              index={5}
              label="Attendance logs"
              value={stats.total_attendance_logs}
              icon={ClipboardCheck}
              tone="danger"
            />
          </div>

          <ChartCard
            title="Attendance against grades"
            description="Each point is a student. Bubble size reflects how many exams they have taken."
          >
            {scatterData.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">No student data yet.</p>
            ) : (
              <PerformanceScatter data={scatterData} />
            )}
          </ChartCard>
        </TabsContent>

        {/* --------------------------------------------------------- teachers */}
        <TabsContent value="teachers" className="space-y-5">
          <ChartCard title="Most active teachers" description="Top 12 by combined recorded activity.">
            {teacherChartData.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">No teacher activity yet.</p>
            ) : (
              <BarSeries
                data={teacherChartData}
                xKey="name"
                layout="horizontal"
                height={Math.max(240, teacherChartData.length * 34)}
                series={[
                  { key: 'Attendance', label: 'Attendance marks', color: palette.series[0] },
                  { key: 'Topics', label: 'Topics', color: palette.series[1] },
                  { key: 'Materials', label: 'Materials', color: palette.series[2] },
                ]}
                stacked
              />
            )}
          </ChartCard>

          <DataTable
            columns={teacherColumns}
            data={report.teacher_activity}
            getRowId={(row) => String(row.teacher_id)}
            searchPlaceholder="Search teachers…"
            searchValues={(row) => [row.teacher_name]}
            initialSorting={[{ id: 'activity', desc: true }]}
            csv={{
              filename: 'teacher-activity',
              columns: [
                { header: 'Teacher', value: (t) => t.teacher_name },
                { header: 'Assignments', value: (t) => t.assigned_classes_count },
                { header: 'Topics', value: (t) => t.topics_covered_count },
                { header: 'Materials', value: (t) => t.materials_uploaded_count },
                { header: 'Attendance marks', value: (t) => t.attendance_marked_count },
              ],
            }}
          />
        </TabsContent>

        {/* --------------------------------------------------------- students */}
        <TabsContent value="students" className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">How these numbers are calculated</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Attendance is the share of records marked <strong>Present</strong>. The average grade is the
              mean of each exam's <code>marks ÷ maximum</code>. A student with no records shows 0%, which is
              not distinguishable from a genuine zero.
            </CardContent>
          </Card>

          <DataTable
            columns={studentColumns}
            data={report.student_performance}
            getRowId={(row) => String(row.student_id)}
            searchPlaceholder="Search students…"
            searchValues={(row) => [row.student_name, row.class_name]}
            initialSorting={[{ id: 'attendance', desc: false }]}
            facets={[
              { columnId: 'class', label: 'Class', options: classOptions },
              {
                columnId: 'risk',
                label: 'Risk',
                options: [
                  { value: 'At risk', label: 'At risk' },
                  { value: 'On track', label: 'On track' },
                ],
              },
            ]}
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
        </TabsContent>
      </Tabs>
    </>
  )
}

import type { ColumnDef } from '@tanstack/react-table'
import { Info, LineChart, TriangleAlert } from 'lucide-react'
import * as React from 'react'

import type { AttendanceOut } from '@/api/types'
import {
  useClassRosters,
  useMyClasses,
  useTeacherAttendance,
  useTeacherGrades,
  useTeacherTopics,
} from '@/queries/teacher.queries'
import {
  atRiskStudents,
  attendanceRate,
  attendanceTrend,
  averageGradePercentage,
  countByStatus,
  gradeDistribution,
  summarizeAttendanceByStudent,
  syllabusProgress,
  type AtRiskStudent,
  type StudentAttendanceSummary,
} from '@/lib/derive'
import { AT_RISK_ATTENDANCE, AT_RISK_GRADE, ATTENDANCE_LABEL, ATTENDANCE_STATUSES } from '@/lib/constants'
import { formatPercent, performanceTone } from '@/lib/format'
import { subjectName } from '@/lib/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { AreaTrend, BarSeries, DonutBreakdown } from '@/components/charts/charts'
import { ChartCard, useChartPalette } from '@/components/charts/chart-card'
import { DataTable } from '@/components/data/data-table'
import { UserCell } from '@/components/domain/user-cell'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { AdminTeacherNotice, useIsAdminViewingTeacher } from './teacher-guard'

export default function TeacherInsightsPage() {
  const isAdmin = useIsAdminViewingTeacher()
  const palette = useChartPalette()

  const mappingsQuery = useMyClasses(!isAdmin)
  const attendanceQuery = useTeacherAttendance(!isAdmin)
  const gradesQuery = useTeacherGrades(!isAdmin)
  const topicsQuery = useTeacherTopics(!isAdmin)

  const mappings = React.useMemo(() => mappingsQuery.data ?? [], [mappingsQuery.data])
  const classIds = React.useMemo(() => [...new Set(mappings.map((m) => m.class_room.id))], [mappings])
  const rosters = useClassRosters(isAdmin ? [] : classIds)

  const attendance = React.useMemo(() => attendanceQuery.data ?? [], [attendanceQuery.data])
  const grades = React.useMemo(() => gradesQuery.data ?? [], [gradesQuery.data])

  /** id -> name, assembled from rosters plus names embedded in records. */
  const nameFor = React.useCallback(
    (studentId: number, sample?: AttendanceOut) => {
      for (const list of Object.values(rosters.byClass)) {
        const found = list.find((s) => s.id === studentId)
        if (found) return found.full_name
      }
      if (sample?.student?.full_name) return sample.student.full_name
      const fromGrade = grades.find((g) => g.student_id === studentId)?.student?.full_name
      return fromGrade ?? `Student ${String(studentId).slice(-6)}`
    },
    [rosters.byClass, grades],
  )

  const summaries = React.useMemo(
    () => summarizeAttendanceByStudent(attendance, (id, sample) => nameFor(id, sample)),
    [attendance, nameFor],
  )

  const atRisk = React.useMemo(
    () => atRiskStudents(attendance, grades, (id) => nameFor(id)),
    [attendance, grades, nameFor],
  )

  const trend = React.useMemo(() => attendanceTrend(attendance, 30), [attendance])
  const statusCounts = React.useMemo(() => countByStatus(attendance), [attendance])
  const distribution = React.useMemo(() => gradeDistribution(grades), [grades])
  const syllabus = React.useMemo(
    () => syllabusProgress(topicsQuery.data ?? [], (t) => subjectName(t)),
    [topicsQuery.data],
  )

  const overallAttendance = React.useMemo(() => attendanceRate(attendance), [attendance])
  const overallGrade = React.useMemo(() => averageGradePercentage(grades), [grades])

  const perSubject = React.useMemo(() => {
    const map = new Map<number, AttendanceOut[]>()
    for (const record of attendance) {
      const list = map.get(record.subject_id)
      if (list) list.push(record)
      else map.set(record.subject_id, [record])
    }
    return [...map.entries()].map(([subjectId, records]) => ({
      subject: subjectName(records[0]),
      Attendance: Number(attendanceRate(records).toFixed(1)),
      subjectId,
    }))
  }, [attendance])

  const statusDonut = React.useMemo(
    () =>
      ATTENDANCE_STATUSES.map((status) => ({
        name: ATTENDANCE_LABEL[status],
        value: statusCounts[status],
        color: palette.status[status],
      })).filter((d) => d.value > 0),
    [statusCounts, palette],
  )

  const summaryColumns = React.useMemo<ColumnDef<StudentAttendanceSummary, unknown>[]>(
    () => [
      {
        id: 'student',
        header: 'Student',
        accessorFn: (row) => row.name,
        cell: ({ row }) => <UserCell name={row.original.name} size="xs" />,
      },
      {
        id: 'rate',
        header: 'Attendance',
        accessorFn: (row) => row.rate,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <ProgressBar
              value={row.original.rate}
              tone={performanceTone(row.original.rate)}
              size="sm"
              className="w-20"
            />
            <span className="w-12 text-right text-sm tabular-nums">{formatPercent(row.original.rate, 0)}</span>
          </div>
        ),
      },
      ...ATTENDANCE_STATUSES.map<ColumnDef<StudentAttendanceSummary, unknown>>((status) => ({
        id: status.toLowerCase(),
        header: ATTENDANCE_LABEL[status],
        accessorFn: (row) => row.counts[status],
        meta: { align: 'right' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.counts[status]}</span>,
      })),
      {
        id: 'total',
        header: 'Records',
        accessorFn: (row) => row.total,
        meta: { align: 'right' },
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.total}</span>,
      },
    ],
    [],
  )

  const atRiskColumns = React.useMemo<ColumnDef<AtRiskStudent, unknown>[]>(
    () => [
      {
        id: 'student',
        header: 'Student',
        accessorFn: (row) => row.name,
        cell: ({ row }) => <UserCell name={row.original.name} size="xs" />,
      },
      {
        id: 'reasons',
        header: 'Why',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            {row.original.reasons.map((reason) => (
              <Badge key={reason} tone="danger" size="sm">
                {reason}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: 'attendance',
        header: 'Attendance',
        accessorFn: (row) => row.attendanceRate,
        meta: { align: 'right' },
        cell: ({ row }) => <span className="tabular-nums">{formatPercent(row.original.attendanceRate, 0)}</span>,
      },
      {
        id: 'grade',
        header: 'Average grade',
        accessorFn: (row) => row.averageGrade,
        meta: { align: 'right' },
        cell: ({ row }) => <span className="tabular-nums">{formatPercent(row.original.averageGrade, 0)}</span>,
      },
    ],
    [],
  )

  if (isAdmin) {
    return (
      <>
        <PageHeader title="Insights" description="Analytics across the classes you teach." />
        <AdminTeacherNotice />
      </>
    )
  }

  if (attendanceQuery.isError || gradesQuery.isError) {
    return (
      <>
        <PageHeader title="Insights" description="Analytics across the classes you teach." />
        <ErrorState
          error={attendanceQuery.error ?? gradesQuery.error}
          onRetry={() => {
            void attendanceQuery.refetch()
            void gradesQuery.refetch()
          }}
        />
      </>
    )
  }

  const loading = attendanceQuery.isPending || gradesQuery.isPending

  return (
    <>
      <PageHeader
        title="Insights"
        description="Computed in your browser from records already loaded — no extra requests, and no waiting on the server."
      >
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Attendance counts records marked <strong>Present</strong>. Grade averages use each exam's own
            maximum — the same formula the administrator report uses, so the two always agree.
          </span>
        </div>
      </PageHeader>

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : attendance.length === 0 && grades.length === 0 ? (
        <EmptyState
          icon={<LineChart />}
          title="Nothing to analyse yet"
          description="Take attendance and record some exam marks, and this page will fill with trends and at-risk alerts."
        />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Overall attendance</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{formatPercent(overallAttendance, 1)}</p>
              <ProgressBar value={overallAttendance} tone={performanceTone(overallAttendance)} className="mt-3" />
            </Card>
            <Card className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Average grade</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{formatPercent(overallGrade, 1)}</p>
              <ProgressBar value={overallGrade} tone={performanceTone(overallGrade)} className="mt-3" />
            </Card>
            <Card className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Students tracked</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{summaries.length}</p>
              <p className="mt-3 text-xs text-muted-foreground">{attendance.length} attendance records</p>
            </Card>
            <Card className={atRisk.length > 0 ? 'border-danger/30 p-5' : 'p-5'}>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Needing attention</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{atRisk.length}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                Below {AT_RISK_ATTENDANCE}% attendance or {AT_RISK_GRADE}% average
              </p>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <ChartCard
              className="lg:col-span-2"
              title="Attendance over time"
              description="Rate per recorded day, most recent 30 days."
            >
              {trend.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">No attendance recorded yet.</p>
              ) : (
                <AreaTrend data={trend} xKey="label" yKey="rate" yLabel="Attendance" percent height={260} />
              )}
            </ChartCard>

            <ChartCard title="How marks break down" description="Every attendance record you have entered.">
              {statusDonut.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">No attendance recorded yet.</p>
              ) : (
                <DonutBreakdown
                  data={statusDonut}
                  centerValue={attendance.length}
                  centerLabel="records"
                  height={240}
                />
              )}
            </ChartCard>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title="Attendance by subject" description="Present rate for each subject you teach.">
              {perSubject.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">No data yet.</p>
              ) : (
                <BarSeries
                  data={perSubject}
                  xKey="subject"
                  layout="horizontal"
                  height={Math.max(200, perSubject.length * 44)}
                  series={[{ key: 'Attendance', label: 'Attendance %' }]}
                />
              )}
            </ChartCard>

            <ChartCard title="Grade distribution" description={`Across ${grades.length} recorded marks.`}>
              {grades.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">No grades recorded yet.</p>
              ) : (
                <BarSeries
                  data={distribution.map((b) => ({ band: b.label, Marks: b.count }))}
                  xKey="band"
                  series={[{ key: 'Marks', label: 'Marks' }]}
                  height={260}
                />
              )}
            </ChartCard>
          </div>

          {syllabus.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Syllabus progress</CardTitle>
                <CardDescription>Mean completion across the topics you logged for each subject.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {syllabus.map((subject) => (
                  <div key={subject.subjectId}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">{subject.subjectName}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatPercent(subject.completion, 0)} · {subject.topicCount} topics
                      </span>
                    </div>
                    <ProgressBar value={subject.completion} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {atRisk.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <TriangleAlert className="size-4 text-danger" />
                <h2 className="text-base font-semibold">Students needing attention</h2>
              </div>
              <DataTable
                columns={atRiskColumns}
                data={atRisk}
                getRowId={(row) => String(row.studentId)}
                searchPlaceholder="Search students…"
                searchValues={(row) => [row.name]}
                initialSorting={[{ id: 'attendance', desc: false }]}
                pageSize={10}
                csv={{
                  filename: 'students-at-risk',
                  columns: [
                    { header: 'Student', value: (s) => s.name },
                    { header: 'Attendance %', value: (s) => s.attendanceRate.toFixed(1) },
                    { header: 'Average grade %', value: (s) => s.averageGrade.toFixed(1) },
                    { header: 'Reasons', value: (s) => s.reasons.join('; ') },
                  ],
                }}
              />
            </div>
          )}

          {summaries.length > 0 && (
            <div>
              <h2 className="mb-3 text-base font-semibold">Attendance by student</h2>
              <DataTable
                columns={summaryColumns}
                data={summaries}
                getRowId={(row) => String(row.studentId)}
                searchPlaceholder="Search students…"
                searchValues={(row) => [row.name]}
                initialSorting={[{ id: 'rate', desc: false }]}
                csv={{
                  filename: 'attendance-by-student',
                  columns: [
                    { header: 'Student', value: (s) => s.name },
                    { header: 'Attendance %', value: (s) => s.rate.toFixed(1) },
                    { header: 'Present', value: (s) => s.counts.PRESENT },
                    { header: 'Absent', value: (s) => s.counts.ABSENT },
                    { header: 'Late', value: (s) => s.counts.LATE },
                    { header: 'Excused', value: (s) => s.counts.EXCUSED },
                    { header: 'Total records', value: (s) => s.total },
                  ],
                }}
              />
            </div>
          )}
        </div>
      )}
    </>
  )
}

import type { ColumnDef } from '@tanstack/react-table'
import { FileText, Info } from 'lucide-react'
import * as React from 'react'

import type { ExamGradeOut } from '@/api/types'
import { useStudentGrades } from '@/queries/student.queries'
import { averageGradePercentage } from '@/lib/derive'
import { formatDate, formatDateTime, parseApiDateTime } from '@/lib/datetime'
import { formatMarks, formatPercent, gradePercentage, performanceTone } from '@/lib/format'
import { subjectName } from '@/lib/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ProgressBar, ProgressRing } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { AreaTrend, BarSeries } from '@/components/charts/charts'
import { ChartCard } from '@/components/charts/chart-card'
import { DataTable } from '@/components/data/data-table'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { AdminStudentNotice, NotEnrolledState, useEnrollmentStatus } from './student-guard'

export default function StudentGradesPage() {
  const enrollment = useEnrollmentStatus()
  const gradesQuery = useStudentGrades(!enrollment.isAdmin)

  const grades = React.useMemo(() => gradesQuery.data ?? [], [gradesQuery.data])

  const overall = React.useMemo(() => averageGradePercentage(grades), [grades])

  const bySubject = React.useMemo(() => {
    const map = new Map<number, ExamGradeOut[]>()
    for (const g of grades) {
      const list = map.get(g.subject_id)
      if (list) list.push(g)
      else map.set(g.subject_id, [g])
    }
    return [...map.entries()]
      .map(([subjectId, list]) => ({
        subjectId,
        name: subjectName(list[0]),
        average: averageGradePercentage(list),
        count: list.length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [grades])

  /** Chronological trend of each exam percentage. */
  const trend = React.useMemo(
    () =>
      [...grades]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((g) => ({
          label: g.exam_name.length > 14 ? `${g.exam_name.slice(0, 13)}…` : g.exam_name,
          percent: Number(gradePercentage(g.marks_obtained, g.max_marks).toFixed(1)),
          date: parseApiDateTime(g.created_at)?.getTime() ?? 0,
        })),
    [grades],
  )

  const columns = React.useMemo<ColumnDef<ExamGradeOut, unknown>[]>(
    () => [
      {
        id: 'exam',
        header: 'Exam',
        accessorFn: (row) => row.exam_name,
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium">{row.original.exam_name}</p>
            <p className="text-xs text-muted-foreground">{formatDate(row.original.created_at)}</p>
          </div>
        ),
      },
      {
        id: 'subject',
        header: 'Subject',
        accessorFn: (row) => subjectName(row),
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) => (
          <Badge tone="accent" size="sm">
            {String(getValue())}
          </Badge>
        ),
      },
      {
        id: 'marks',
        header: 'Marks',
        accessorFn: (row) => row.marks_obtained,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {formatMarks(row.original.marks_obtained, row.original.max_marks)}
          </span>
        ),
      },
      {
        id: 'percent',
        header: 'Percentage',
        accessorFn: (row) => gradePercentage(row.marks_obtained, row.max_marks),
        cell: ({ row }) => {
          const percent = gradePercentage(row.original.marks_obtained, row.original.max_marks)
          return (
            <div className="flex items-center gap-2">
              <ProgressBar value={percent} tone={performanceTone(percent)} size="sm" className="w-20" />
              <span className="w-12 text-right text-sm tabular-nums">{formatPercent(percent, 0)}</span>
            </div>
          )
        },
      },
      {
        id: 'remarks',
        header: 'Remarks',
        enableSorting: false,
        accessorFn: (row) => row.remarks ?? '',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.remarks || '—'}</span>
        ),
      },
    ],
    [],
  )

  const subjectOptions = React.useMemo(
    () => [...new Set(grades.map((g) => subjectName(g)))].sort().map((v) => ({ value: v, label: v })),
    [grades],
  )

  if (enrollment.isAdmin) {
    return (
      <>
        <PageHeader title="Grades" description="Your exam results." />
        <AdminStudentNotice />
      </>
    )
  }

  if (enrollment.notEnrolled) {
    return (
      <>
        <PageHeader title="Grades" description="Your exam results." />
        <NotEnrolledState />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Grades" description="Every exam mark your teachers have recorded.">
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Averages are the mean of each exam's own percentage, so exams marked out of different totals
            count equally.
          </span>
        </div>
      </PageHeader>

      {gradesQuery.isPending ? (
        <div className="grid gap-5 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : gradesQuery.isError ? (
        <ErrorState error={gradesQuery.error} onRetry={() => gradesQuery.refetch()} />
      ) : grades.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No grades yet"
          description="When your teachers record exam marks, they will appear here."
        />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="flex flex-col items-center justify-center p-6">
              <ProgressRing value={overall} tone={performanceTone(overall)} size={140} strokeWidth={12}>
                <span className="text-3xl font-semibold tabular-nums">{formatPercent(overall, 0)}</span>
                <span className="text-xs text-muted-foreground">average</span>
              </ProgressRing>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Across {grades.length} {grades.length === 1 ? 'exam' : 'exams'}
              </p>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Subject averages</CardTitle>
                <CardDescription>How you are doing in each subject.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {bySubject.map((subject) => (
                  <div key={subject.subjectId}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="truncate font-medium">{subject.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatPercent(subject.average, 0)} · {subject.count}{' '}
                        {subject.count === 1 ? 'exam' : 'exams'}
                      </span>
                    </div>
                    <ProgressBar value={subject.average} tone={performanceTone(subject.average)} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {trend.length > 1 && (
            <ChartCard title="Progress over time" description="Each exam as a percentage, in the order they were recorded.">
              <AreaTrend data={trend} xKey="label" yKey="percent" yLabel="Score" percent height={240} />
            </ChartCard>
          )}

          {bySubject.length > 1 && (
            <ChartCard title="Subject comparison" description="Average percentage per subject.">
              <BarSeries
                data={bySubject.map((s) => ({ subject: s.name, Average: Number(s.average.toFixed(1)) }))}
                xKey="subject"
                layout="horizontal"
                height={Math.max(200, bySubject.length * 44)}
                series={[{ key: 'Average', label: 'Average %' }]}
              />
            </ChartCard>
          )}

          <DataTable
            columns={columns}
            data={grades}
            getRowId={(row) => String(row.id)}
            searchPlaceholder="Search exams…"
            searchValues={(row) => [row.exam_name, subjectName(row), row.remarks]}
            initialSorting={[{ id: 'exam', desc: false }]}
            facets={[{ columnId: 'subject', label: 'Subject', options: subjectOptions }]}
            csv={{
              filename: 'my-grades',
              columns: [
                { header: 'Exam', value: (g) => g.exam_name },
                { header: 'Subject', value: (g) => subjectName(g) },
                { header: 'Marks', value: (g) => g.marks_obtained },
                { header: 'Out of', value: (g) => g.max_marks },
                { header: 'Percentage', value: (g) => gradePercentage(g.marks_obtained, g.max_marks).toFixed(1) },
                { header: 'Recorded', value: (g) => formatDateTime(g.created_at) },
                { header: 'Remarks', value: (g) => g.remarks ?? '' },
              ],
            }}
          />
        </div>
      )}
    </>
  )
}

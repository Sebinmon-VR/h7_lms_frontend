import { BarChart3 } from 'lucide-react'

import { useTuitionTeacherReport } from '@/queries/tuition.queries'
import { formatDate } from '@/lib/datetime'
import { hours } from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AttendanceTotalsGrid } from '@/components/domain/tuition'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'
import { PeriodPicker, useReportPeriod } from '@/pages/admin/tuition/period'

/**
 * The tutor's own record: classes taught, hours, and how each student attended.
 *
 * The percentages here are measured against classes CONDUCTED, not scheduled.
 * A class this teacher missed is not counted against the student — and since
 * those same counts price the invoices, the distinction is money, not just
 * bookkeeping.
 */
export default function TuitionTeacherReportsPage() {
  const { from, to, setPeriod } = useReportPeriod()
  const report = useTuitionTeacherReport('teacher', null, from, to)

  return (
    <>
      <PageHeader
        title="My teaching record"
        description="Classes conducted, hours taught, and how each student attended."
        actions={<PeriodPicker from={from} to={to} onChange={setPeriod} />}
      />

      <QueryBoundary
        query={report}
        loading={
          <div className="space-y-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-64" />
          </div>
        }
      >
        {(data) => (
          <div className="space-y-5">
            <Card className="p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="size-4 text-primary" />
                {formatDate(data.from_date)} – {formatDate(data.to_date)}
              </h2>
              <AttendanceTotalsGrid totals={data.totals} />
              <p className="mt-3 text-xs text-muted-foreground">
                Attendance is measured against classes that were actually conducted. A class you
                could not make is not counted against the student, and is not billed to them.
              </p>
            </Card>

            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">By student</h2>
              {data.students.length === 0 ? (
                <EmptyState
                  title="No classes in this period"
                  description="Widen the dates to see further back."
                />
              ) : (
                <ul className="space-y-1.5">
                  {data.students.map((line, index) => {
                    const rate =
                      line.attendance_percentage != null
                        ? Number(line.attendance_percentage)
                        : line.conducted
                          ? (Number(line.attended ?? 0) / Number(line.conducted)) * 100
                          : null

                    return (
                      <li
                        key={index}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {String(line.student_name ?? `Student ${line.student_id}`)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {line.conducted ?? 0} conducted · {hours(line.taught_minutes)} h taught
                          </p>
                        </div>
                        {rate != null && (
                          <Badge
                            tone={rate >= 85 ? 'success' : rate >= 70 ? 'warning' : 'danger'}
                            size="sm"
                          >
                            {rate.toFixed(0)}% attended
                          </Badge>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          </div>
        )}
      </QueryBoundary>
    </>
  )
}

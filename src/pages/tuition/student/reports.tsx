import { BarChart3, FileBadge } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useTuitionReportCards, useTuitionStudentReport } from '@/queries/tuition.queries'
import { formatDate } from '@/lib/datetime'
import { hours } from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AttendanceTotalsGrid } from '@/components/domain/tuition'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'
import { PeriodPicker, useReportPeriod } from '@/pages/admin/tuition/period'

/**
 * The student's own attendance record, and any report cards their tutor has
 * published.
 *
 * There is no rank and no class position, because a one-to-one student has no
 * cohort. Comparing them against other people's private students would be
 * meaningless as well as intrusive.
 */
export default function TuitionStudentReportsPage() {
  const { from, to, setPeriod } = useReportPeriod()
  const report = useTuitionStudentReport('student', null, from, to)
  const cards = useTuitionReportCards()

  return (
    <>
      <PageHeader
        title="My attendance"
        description="Classes you attended, hours taught, and the reports your tutors have shared."
        actions={<PeriodPicker from={from} to={to} onChange={setPeriod} />}
      />

      <div className="space-y-5">
        <QueryBoundary
          query={report}
          loading={<Skeleton className="h-40" />}
        >
          {(data) => (
            <Card className="p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="size-4 text-primary" />
                {formatDate(data.from_date)} – {formatDate(data.to_date)}
              </h2>
              <AttendanceTotalsGrid totals={data.totals} />
              <p className="mt-3 text-xs text-muted-foreground">
                Measured against classes that actually went ahead. A class your tutor could not
                make does not count against you.
              </p>

              {data.subjects.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {data.subjects.map((line, index) => (
                    <li
                      key={index}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {line.subject_name ?? `Subject ${line.subject_id}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {line.attended ?? 0} of {line.conducted ?? 0} attended ·{' '}
                          {hours(line.taught_minutes)} h
                        </p>
                      </div>
                      {line.missed ? (
                        <Badge tone="warning" size="sm">
                          {line.missed} missed
                        </Badge>
                      ) : (
                        <Badge tone="success" size="sm">
                          None missed
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </QueryBoundary>

        {/* The cards themselves live on their own screen — they are a
            document a parent reads, not a panel on an attendance page. This
            just says whether there are any. */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <FileBadge className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <h2 className="text-sm font-semibold">Report cards</h2>
                <QueryBoundary query={cards} loading={<Skeleton className="mt-1 h-4 w-40" />}>
                  {(data) => (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {data.length === 0
                        ? 'Your tutor has not published one yet.'
                        : `${data.length} published — the most recent is “${data[0]?.title ?? ''}”.`}
                    </p>
                  )}
                </QueryBoundary>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/tuition/student/report-cards">Open</Link>
            </Button>
          </div>
        </Card>
      </div>
    </>
  )
}

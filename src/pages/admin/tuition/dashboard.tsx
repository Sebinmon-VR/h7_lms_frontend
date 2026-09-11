import { AlertTriangle, BarChart3, CalendarClock, Download, RefreshCw, Wrench } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { ReportExportView } from '@/api/types'
import {
  useRunTuitionMaintenance,
  useTuitionConflicts,
  useTuitionExport,
  useTuitionOverview,
  useTuitionScheduleStatus,
} from '@/queries/tuition.queries'
import { formatDate } from '@/lib/datetime'
import { countLabel } from '@/lib/format'
import { AttendanceTotalsGrid } from '@/components/domain/tuition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'
import { PeriodPicker, useReportPeriod } from './period'

/**
 * The online tuition programme at a glance.
 *
 * Leads with attendance and hours because those are what the invoices are
 * priced from — this page is the last thing an admin reads before a billing
 * run, and the maintenance button is here for exactly that reason: the counts
 * are only correct once the horizon has been extended and the classes nobody
 * closed have been settled.
 */
export default function AdminTuitionDashboardPage() {
  const { from, to, setPeriod } = useReportPeriod()
  const overview = useTuitionOverview(from, to)
  const conflicts = useTuitionConflicts()
  const schedule = useTuitionScheduleStatus()
  const runMaintenance = useRunTuitionMaintenance()
  const exports = useTuitionExport()

  /**
   * Three views because three different questions get asked of the same
   * period: how each student did, how each tutor did, and — when either of
   * the first two is disputed — which individual classes are behind them.
   */
  const REPORT_EXPORTS: { view: ReportExportView; label: string }[] = [
    { view: 'students', label: 'Students' },
    { view: 'teachers', label: 'Tutors' },
    { view: 'sessions', label: 'Classes' },
  ]

  const conflictCount = conflicts.data?.conflict_count ?? 0

  return (
    <>
      <PageHeader
        title="Online tuition"
        description="One-to-one classes: who is being taught, how much of it happened, and what it comes to."
        actions={
          <>
            <PeriodPicker from={from} to={to} onChange={setPeriod} />
            {REPORT_EXPORTS.map((item) => (
              <Button
                key={item.view}
                variant="outline"
                title={`Export the ${item.label.toLowerCase()} report for this period as CSV`}
                loading={exports.reports.isPending && exports.reports.variables?.view === item.view}
                onClick={() => exports.reports.mutate({ view: item.view, from, to })}
              >
                <Download />
                {item.label}
              </Button>
            ))}
            <Button
              variant="outline"
              onClick={() => runMaintenance.mutate()}
              disabled={runMaintenance.isPending}
            >
              <Wrench className={runMaintenance.isPending ? 'animate-spin' : undefined} />
              Run maintenance
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        {/* Nothing here blocks anything — it is the list of things to go and
            fix, and it belongs above the numbers because an unresolved clash
            is why two of them will look wrong. */}
        {conflictCount > 0 && (
          <Card className="border-warning/40 bg-warning/[0.05] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
                <div>
                  <h3 className="text-sm font-semibold">
                    {countLabel(conflictCount, 'timetable clash', 'timetable clashes')}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    A student or teacher is booked twice at the same time. Classes still run —
                    somebody has to choose which.
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/tuition/schedule">Review the schedule</Link>
              </Button>
            </div>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-4 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="size-4 text-primary" />
                {formatDate(from)} – {formatDate(to)}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void overview.refetch()}
                disabled={overview.isFetching}
              >
                <RefreshCw className={overview.isFetching ? 'animate-spin' : undefined} />
                Refresh
              </Button>
            </div>

            <QueryBoundary
              query={overview}
              loading={
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              }
            >
              {(report) => <AttendanceTotalsGrid totals={report.totals} />}
            </QueryBoundary>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="size-4 text-primary" />
              Generated schedule
            </h2>
            <QueryBoundary query={schedule} loading={<Skeleton className="h-24" />}>
              {(status) => (
                <dl className="space-y-2 text-sm">
                  <Row label="Classes scheduled" value={status.scheduled_sessions ?? '—'} />
                  <Row label="Active weekly times" value={status.active_slots ?? '—'} />
                  <Row
                    label="Generated through"
                    value={status.generated_through ? formatDate(status.generated_through) : '—'}
                  />
                  <Row label="Horizon" value={status.horizon_days ? `${status.horizon_days} days` : '—'} />
                </dl>
              )}
            </QueryBoundary>
            <p className="mt-3 text-xs text-muted-foreground">
              Classes are generated ahead of time from the weekly slots. Nothing past the horizon
              exists yet, so it cannot be billed.
            </p>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <BreakdownCard
            title="Students"
            query={overview}
            rows={(report) => report.students}
            nameOf={(row) => String(row.student_name ?? row.name ?? `Student ${row.student_id}`)}
            hrefOf={(row) => `/admin/tuition/sessions?student=${row.student_id}`}
          />
          <BreakdownCard
            title="Teachers"
            query={overview}
            rows={(report) => report.teachers}
            nameOf={(row) => String(row.teacher_name ?? row.name ?? `Teacher ${row.teacher_id}`)}
            hrefOf={(row) => `/admin/tuition/sessions?teacher=${row.teacher_id}`}
          />
        </div>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

/**
 * A per-person slice of the programme report.
 *
 * The rows are loosely typed on purpose: the backend builds them as plain
 * dicts and its exact keys vary between the student and teacher breakdowns, so
 * the caller says which field is the name rather than this component guessing.
 */
function BreakdownCard({
  title,
  query,
  rows,
  nameOf,
  hrefOf,
}: {
  title: string
  query: ReturnType<typeof useTuitionOverview>
  rows: (report: NonNullable<ReturnType<typeof useTuitionOverview>['data']>) => Record<string, unknown>[]
  nameOf: (row: Record<string, unknown>) => string
  hrefOf: (row: Record<string, unknown>) => string
}) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <QueryBoundary
        query={query}
        loading={
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        }
        isEmpty={(report) => rows(report).length === 0}
        empty={
          <EmptyState
            title={`No ${title.toLowerCase()} in this period`}
            description="Nothing was scheduled between these dates."
          />
        }
      >
        {(report) => (
          <ul className="space-y-1.5">
            {rows(report).map((row, index) => {
              const conducted = Number(row.conducted ?? 0)
              const attended = Number(row.attended ?? 0)
              const percentage =
                row.attendance_percentage != null
                  ? Number(row.attendance_percentage)
                  : conducted
                    ? (attended / conducted) * 100
                    : null

              return (
                <li key={index}>
                  <Link
                    to={hrefOf(row)}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-primary/40"
                  >
                    <span className="truncate font-medium">{nameOf(row)}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{conducted} conducted</span>
                      {percentage != null && (
                        <Badge
                          tone={percentage >= 85 ? 'success' : percentage >= 70 ? 'warning' : 'danger'}
                          size="sm"
                        >
                          {percentage.toFixed(0)}%
                        </Badge>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </QueryBoundary>
    </Card>
  )
}

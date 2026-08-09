import type { ColumnDef } from '@tanstack/react-table'
import { CalendarCheck, Flame } from 'lucide-react'
import * as React from 'react'

import type { AttendanceOut } from '@/api/types'
import { useStudentAttendance } from '@/queries/student.queries'
import { attendanceRate, attendanceStreak, countByStatus } from '@/lib/derive'
import { ATTENDANCE_LABEL, ATTENDANCE_STATUSES } from '@/lib/constants'
import { cn } from '@/lib/cn'
import { formatDate, formatDayLabel, toApiDate } from '@/lib/datetime'
import { formatPercent, performanceTone } from '@/lib/format'
import { subjectName } from '@/lib/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ProgressBar, ProgressRing } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DonutBreakdown } from '@/components/charts/charts'
import { ChartCard, useChartPalette } from '@/components/charts/chart-card'
import { DataTable } from '@/components/data/data-table'
import { AttendanceStatusPill } from '@/components/domain/badges'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { AdminStudentNotice, NotEnrolledState, useEnrollmentStatus } from './student-guard'

const STATUS_CELL: Record<string, string> = {
  PRESENT: 'bg-success',
  ABSENT: 'bg-danger',
  LATE: 'bg-warning',
  EXCUSED: 'bg-info',
}

/**
 * Calendar heatmap over the last ~18 weeks. Recharts cannot do this, so it is
 * a plain CSS grid keyed by local calendar dates.
 */
function AttendanceHeatmap({ records }: { records: AttendanceOut[] }) {
  const byDate = React.useMemo(() => {
    const map = new Map<string, AttendanceOut[]>()
    for (const r of records) {
      const list = map.get(r.date)
      if (list) list.push(r)
      else map.set(r.date, [r])
    }
    return map
  }, [records])

  const weeks = React.useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // Wind back to the most recent Sunday so columns line up as weeks.
    const end = new Date(today)
    end.setDate(end.getDate() + (6 - end.getDay()))

    const days: Date[] = []
    for (let i = 18 * 7 - 1; i >= 0; i -= 1) {
      const d = new Date(end)
      d.setDate(end.getDate() - i)
      days.push(d)
    }

    const grouped: Date[][] = []
    for (let i = 0; i < days.length; i += 7) grouped.push(days.slice(i, i + 7))
    return grouped
  }, [])

  const today = toApiDate(new Date())

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day) => {
              const key = toApiDate(day)
              const dayRecords = byDate.get(key)
              const isFuture = key > today

              if (!dayRecords || dayRecords.length === 0) {
                return (
                  <span
                    key={key}
                    className={cn('size-3 rounded-sm', isFuture ? 'bg-transparent' : 'bg-muted')}
                    aria-hidden
                  />
                )
              }

              // Worst status of the day wins, so a single absence is visible.
              const status =
                dayRecords.find((r) => r.status === 'ABSENT')?.status ??
                dayRecords.find((r) => r.status === 'LATE')?.status ??
                dayRecords.find((r) => r.status === 'EXCUSED')?.status ??
                'PRESENT'

              return (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <span className={cn('size-3 cursor-default rounded-sm', STATUS_CELL[status])} />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">{formatDate(key)}</p>
                    {dayRecords.map((r) => (
                      <p key={r.id} className="text-muted-foreground">
                        {subjectName(r)} — {ATTENDANCE_LABEL[r.status]}
                      </p>
                    ))}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {ATTENDANCE_STATUSES.map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('size-2.5 rounded-sm', STATUS_CELL[status])} aria-hidden />
            {ATTENDANCE_LABEL[status]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2.5 rounded-sm bg-muted" aria-hidden />
          No class
        </span>
      </div>
    </div>
  )
}

export default function StudentAttendancePage() {
  const enrollment = useEnrollmentStatus()
  const attendanceQuery = useStudentAttendance(!enrollment.isAdmin)
  const palette = useChartPalette()

  const records = React.useMemo(() => attendanceQuery.data ?? [], [attendanceQuery.data])

  const rate = React.useMemo(() => attendanceRate(records), [records])
  const counts = React.useMemo(() => countByStatus(records), [records])
  const streak = React.useMemo(() => attendanceStreak(records), [records])

  const bySubject = React.useMemo(() => {
    const map = new Map<number, AttendanceOut[]>()
    for (const r of records) {
      const list = map.get(r.subject_id)
      if (list) list.push(r)
      else map.set(r.subject_id, [r])
    }
    return [...map.entries()]
      .map(([subjectId, list]) => ({
        subjectId,
        name: subjectName(list[0]),
        rate: attendanceRate(list),
        total: list.length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [records])

  const donut = React.useMemo(
    () =>
      ATTENDANCE_STATUSES.map((status) => ({
        name: ATTENDANCE_LABEL[status],
        value: counts[status],
        color: palette.status[status],
      })).filter((d) => d.value > 0),
    [counts, palette],
  )

  const columns = React.useMemo<ColumnDef<AttendanceOut, unknown>[]>(
    () => [
      {
        id: 'date',
        header: 'Date',
        accessorFn: (row) => row.date,
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium">{formatDayLabel(row.original.date)}</p>
            <p className="text-xs text-muted-foreground">{formatDate(row.original.date)}</p>
          </div>
        ),
        sortingFn: (a, b) => String(a.getValue('date')).localeCompare(String(b.getValue('date'))),
      },
      {
        id: 'subject',
        header: 'Subject',
        accessorFn: (row) => subjectName(row),
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) => <span className="text-sm">{String(getValue())}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) => row.status,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => <AttendanceStatusPill status={row.original.status} size="sm" />,
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
    () => [...new Set(records.map((r) => subjectName(r)))].sort().map((v) => ({ value: v, label: v })),
    [records],
  )

  if (enrollment.isAdmin) {
    return (
      <>
        <PageHeader title="Attendance" description="Your attendance record." />
        <AdminStudentNotice />
      </>
    )
  }

  if (enrollment.notEnrolled) {
    return (
      <>
        <PageHeader title="Attendance" description="Your attendance record." />
        <NotEnrolledState />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Every class your teachers have marked you for."
      />

      {attendanceQuery.isPending ? (
        <div className="grid gap-5 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : attendanceQuery.isError ? (
        <ErrorState error={attendanceQuery.error} onRetry={() => attendanceQuery.refetch()} />
      ) : records.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck />}
          title="No attendance recorded yet"
          description="Once your teachers start marking attendance, your record will appear here."
        />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="flex flex-col items-center justify-center p-6">
              <ProgressRing value={rate} tone={performanceTone(rate)} size={140} strokeWidth={12}>
                <span className="text-3xl font-semibold tabular-nums">{formatPercent(rate, 0)}</span>
                <span className="text-xs text-muted-foreground">attended</span>
              </ProgressRing>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                {counts.PRESENT} present out of {records.length} records
              </p>
              {streak > 1 && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-warning">
                  <Flame className="size-4" />
                  {streak}-day full attendance streak
                </p>
              )}
            </Card>

            <ChartCard title="Breakdown" description="Every record, by status.">
              <DonutBreakdown data={donut} centerValue={records.length} centerLabel="records" height={220} />
            </ChartCard>

            <Card>
              <CardHeader>
                <CardTitle>By subject</CardTitle>
                <CardDescription>Where you are strongest and weakest.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {bySubject.map((subject) => (
                  <div key={subject.subjectId}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="truncate font-medium">{subject.name}</span>
                      <span className="tabular-nums text-muted-foreground">{formatPercent(subject.rate, 0)}</span>
                    </div>
                    <ProgressBar value={subject.rate} tone={performanceTone(subject.rate)} size="sm" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Your year so far</CardTitle>
              <CardDescription>The last 18 weeks. Hover any day for detail.</CardDescription>
            </CardHeader>
            <CardContent>
              <AttendanceHeatmap records={records} />
            </CardContent>
          </Card>

          <DataTable
            columns={columns}
            data={records}
            getRowId={(row) => String(row.id)}
            searchPlaceholder="Search by subject or remark…"
            searchValues={(row) => [subjectName(row), row.remarks, row.status]}
            initialSorting={[{ id: 'date', desc: true }]}
            facets={[
              { columnId: 'subject', label: 'Subject', options: subjectOptions },
              {
                columnId: 'status',
                label: 'Status',
                options: ATTENDANCE_STATUSES.map((s) => ({ value: s, label: ATTENDANCE_LABEL[s] })),
              },
            ]}
            csv={{
              filename: 'my-attendance',
              columns: [
                { header: 'Date', value: (r) => r.date },
                { header: 'Subject', value: (r) => subjectName(r) },
                { header: 'Status', value: (r) => r.status },
                { header: 'Remarks', value: (r) => r.remarks ?? '' },
              ],
            }}
          />
        </div>
      )}
    </>
  )
}

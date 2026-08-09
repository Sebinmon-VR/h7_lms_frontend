import * as React from 'react'

import type { AttendanceOut } from '@/api/types'
import { useStudentAttendance } from '@/queries/student.queries'
import { attendanceRate, attendanceStreak, countByStatus } from '@/lib/derive'
import { ATTENDANCE_LABEL, ATTENDANCE_STATUSES } from '@/lib/constants'
import { cn } from '@/lib/cn'
import { formatDate, formatDayLabel, toApiDate } from '@/lib/datetime'
import { subjectName } from '@/lib/select'
import { subjectLook, toneStyle } from '@/lib/subjects'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ErrorState } from '@/components/feedback/states'
import {
  FunChip,
  FunEmpty,
  FunPageHeader,
  FunSection,
  FunStat,
  ProgressRing,
  StreakCard,
  SubjectTile,
} from '@/components/fun/fun-ui'
import { PageHeader } from '@/components/layout/page-header'
import { AdminStudentNotice, NotEnrolledState, useEnrollmentStatus } from './student-guard'

/**
 * Plain words for each status.
 *
 * Used everywhere on this page — chips, legend and rows — so the same day is
 * never "Here" in one place and "Present" in another.
 */
const FRIENDLY_STATUS: Record<
  string,
  { label: string; emoji: string; tone: 'success' | 'danger' | 'warning' | 'info' }
> = {
  PRESENT: { label: 'Here', emoji: '✅', tone: 'success' },
  ABSENT: { label: 'Away', emoji: '❌', tone: 'danger' },
  LATE: { label: 'Late', emoji: '⏰', tone: 'warning' },
  EXCUSED: { label: 'Excused', emoji: '📝', tone: 'info' },
}

const STATUS_CELL: Record<string, string> = {
  PRESENT: 'bg-success',
  ABSENT: 'bg-danger',
  LATE: 'bg-warning',
  EXCUSED: 'bg-info',
}

/**
 * Calendar heatmap over the last ~18 weeks.
 *
 * Cells are deliberately larger than the GitHub-style original: this is tapped
 * on a tablet by someone with smaller hands, and a 12px square is not a target.
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
      <div className="flex gap-1.5">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1.5">
            {week.map((day) => {
              const key = toApiDate(day)
              const dayRecords = byDate.get(key)
              const isFuture = key > today

              if (!dayRecords || dayRecords.length === 0) {
                return (
                  <span
                    key={key}
                    className={cn('size-4 rounded-md', isFuture ? 'bg-transparent' : 'bg-muted')}
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
                    <span className={cn('size-4 cursor-default rounded-md', STATUS_CELL[status])} />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">{formatDate(key)}</p>
                    {dayRecords.map((r) => (
                      <p key={r.id} className="text-muted-foreground">
                        {subjectName(r)} — {FRIENDLY_STATUS[r.status]?.label ?? r.status}
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
          <span
            key={status}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span className={cn('size-3 rounded-md', STATUS_CELL[status])} aria-hidden />
            {FRIENDLY_STATUS[status]?.label ?? ATTENDANCE_LABEL[status]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-3 rounded-md bg-muted" aria-hidden />
          No class
        </span>
      </div>
    </div>
  )
}

export default function StudentAttendancePage() {
  const enrollment = useEnrollmentStatus()
  const attendanceQuery = useStudentAttendance(!enrollment.isAdmin)
  const [statusFilter, setStatusFilter] = React.useState<string | null>(null)

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

  /** Most recent first, capped — the full history is the heatmap's job. */
  const recent = React.useMemo(() => {
    const list = statusFilter ? records.filter((r) => r.status === statusFilter) : records
    return [...list].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)
  }, [records, statusFilter])

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
        <FunPageHeader emoji="🙋" title="My days" />
        <NotEnrolledState />
      </>
    )
  }

  return (
    <>
      <FunPageHeader
        emoji="🙋"
        tone={5}
        title="My days"
        description="How often you have been in class."
      />

      {attendanceQuery.isPending ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : attendanceQuery.isError ? (
        <ErrorState error={attendanceQuery.error} onRetry={() => attendanceQuery.refetch()} />
      ) : records.length === 0 ? (
        <FunEmpty
          mood="sleepy"
          title="Nothing marked yet"
          description="Once your teachers start taking the register, your days will show up here."
        />
      ) : (
        <div className="space-y-6">
          {/* ------------------------------------------------ the big number */}
          <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
            <div style={toneStyle(5)} className="sticker flex flex-col items-center p-6">
              <ProgressRing value={rate ?? 0} tone={5} size={132} />
              <p className="mt-3 text-sm font-bold">
                You were here {counts.PRESENT} of {records.length} times
              </p>
              {rate !== null && rate >= 90 && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  🎉 That is a brilliant record!
                </p>
              )}
            </div>

            <div className="grid content-start gap-4 sm:grid-cols-2">
              {streak > 0 ? (
                <StreakCard days={streak} />
              ) : (
                <FunStat
                  value={counts.PRESENT}
                  label="Days you were here"
                  emoji="✅"
                  tone={5}
                />
              )}
              <FunStat
                value={counts.ABSENT}
                label="Days you missed"
                hint={counts.ABSENT === 0 ? 'Not a single one!' : undefined}
                emoji={counts.ABSENT === 0 ? '🌟' : '📅'}
                tone={counts.ABSENT === 0 ? 5 : 1}
              />
              <FunStat value={counts.LATE} label="Times you were late" emoji="⏰" tone={2} />
              <FunStat value={counts.EXCUSED} label="Excused days" emoji="📝" tone={7} />
            </div>
          </div>

          {/* ------------------------------------------------------- by subject */}
          {bySubject.length > 1 && (
            <FunSection emoji="📘" title="How you did in each subject">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {bySubject.map((subject) => (
                  <div
                    key={subject.subjectId}
                    style={toneStyle(subjectLook(subject.name).tone)}
                    className="sticker flex items-center gap-3 p-3"
                  >
                    <ProgressRing
                      value={subject.rate ?? 0}
                      tone={subjectLook(subject.name).tone}
                      size={56}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{subject.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {subject.total} {subject.total === 1 ? 'class' : 'classes'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </FunSection>
          )}

          {/* --------------------------------------------------------- heatmap */}
          <FunSection emoji="🗓️" title="Your year so far">
            <div className="rounded-2xl border-2 border-border bg-card p-4">
              <p className="mb-3 text-xs text-muted-foreground">
                Each square is one day. Tap a coloured one to see what happened.
              </p>
              <AttendanceHeatmap records={records} />
            </div>
          </FunSection>

          {/* ---------------------------------------------------- recent days */}
          <FunSection emoji="📋" title="Recent days">
            <div className="mb-3 flex flex-wrap gap-2">
              <FunChip active={!statusFilter} onClick={() => setStatusFilter(null)}>
                All days
              </FunChip>
              {ATTENDANCE_STATUSES.filter((s) => counts[s] > 0).map((status) => (
                <FunChip
                  key={status}
                  active={statusFilter === status}
                  onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                >
                  {FRIENDLY_STATUS[status].emoji} {FRIENDLY_STATUS[status].label} ({counts[status]})
                </FunChip>
              ))}
            </div>

            <ul className="space-y-2">
              {recent.map((record) => {
                const subject = subjectName(record)
                return (
                  <li
                    key={record.id}
                    style={toneStyle(subjectLook(subject).tone)}
                    className="sticker flex items-center gap-3 p-3"
                  >
                    <SubjectTile subject={subject} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{formatDayLabel(record.date)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {subject}
                        {record.remarks ? ` · ${record.remarks}` : ''}
                      </p>
                    </div>
                    <Badge
                      tone={FRIENDLY_STATUS[record.status]?.tone ?? 'neutral'}
                      size="sm"
                      className="shrink-0"
                    >
                      {FRIENDLY_STATUS[record.status]?.label ?? record.status}
                    </Badge>
                  </li>
                )
              })}
            </ul>

            {recent.length === 0 && (
              <FunEmpty
                mood="happy"
                title="None of those"
                description="There are no days with that mark — which is usually good news!"
              />
            )}

            {records.length > 30 && !statusFilter && (
              <p className="mt-3 text-xs text-muted-foreground">
                Showing your latest 30 days. The squares above cover the whole year.
              </p>
            )}
          </FunSection>
        </div>
      )}
    </>
  )
}

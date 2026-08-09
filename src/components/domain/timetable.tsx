import { CalendarClock, CalendarOff, Clock, MapPin, TriangleAlert, User } from 'lucide-react'
import * as React from 'react'

import type { DayOfWeek, ScheduledPeriod, TimetableEntryOut } from '@/api/types'
import { cn } from '@/lib/cn'
import { formatDayLabel, formatTime } from '@/lib/datetime'
import { subjectName, className as classNameOf, teacherName } from '@/lib/select'
import {
  DAY_LABEL,
  DAY_SHORT,
  findOverlaps,
  formatPeriodRange,
  formatStartsIn,
  groupByDate,
  groupByDay,
  periodLengthMinutes,
  visibleDays,
} from '@/lib/timetable'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmptyState } from '@/components/feedback/states'

/**
 * Shared timetable rendering for all three roles.
 *
 * What each role shows differs only in which labels are redundant — a student's
 * grid need not repeat their own class on every card, a teacher's need not
 * repeat their own name — so that is a prop rather than three components.
 */

export type TimetableScope = 'admin' | 'teacher' | 'student'

function PeriodCard({
  entry,
  scope,
  clashing,
  onClick,
}: {
  entry: TimetableEntryOut
  scope: TimetableScope
  clashing?: boolean
  onClick?: (entry: TimetableEntryOut) => void
}) {
  const interactive = !!onClick
  const Wrapper = interactive ? 'button' : 'div'

  return (
    <Wrapper
      {...(interactive ? { type: 'button' as const, onClick: () => onClick?.(entry) } : {})}
      className={cn(
        'w-full rounded-lg border p-2.5 text-left transition-colors',
        entry.is_active
          ? 'border-border bg-card'
          : // A paused period is still on the timetable; showing it faded is
            // more honest than hiding it and letting someone re-create it.
            'border-dashed border-border bg-surface opacity-60',
        clashing && 'border-danger/50 bg-danger/8',
        interactive && 'hover:border-primary/50',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium">{subjectName(entry)}</p>
        {clashing && (
          <Tooltip>
            <TooltipTrigger asChild>
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-danger" />
            </TooltipTrigger>
            <TooltipContent>
              This period overlaps another on the same day. It was saved with clash checking
              overridden.
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="size-3" />
        {formatPeriodRange(entry)}
        <span className="text-muted-foreground/60">· {periodLengthMinutes(entry)}m</span>
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {scope !== 'student' && (
          <Badge tone="outline" size="sm">
            {classNameOf(entry)}
          </Badge>
        )}
        {scope !== 'teacher' && entry.teacher_id !== null && (
          <Badge tone="neutral" size="sm">
            <User />
            {teacherName({ teacher: entry.teacher, teacher_id: entry.teacher_id })}
          </Badge>
        )}
        {/* Null means no teacher is mapped to this subject and class — a real
            gap someone has to fill, not merely an absent label. */}
        {entry.teacher_id === null && (
          <Badge tone="warning" size="sm">
            <TriangleAlert />
            No teacher
          </Badge>
        )}
        {entry.room && (
          <Badge tone="neutral" size="sm">
            <MapPin />
            {entry.room}
          </Badge>
        )}
        {!entry.is_active && (
          <Badge tone="neutral" size="sm">
            Paused
          </Badge>
        )}
      </div>

      {entry.period_label && (
        <p className="mt-1 text-2xs uppercase tracking-wide text-muted-foreground">
          {entry.period_label}
        </p>
      )}
    </Wrapper>
  )
}

/** The weekly grid, one column per day. */
export function TimetableWeek({
  entries,
  scope,
  today,
  onSelect,
  emptyDescription,
}: {
  entries: TimetableEntryOut[]
  scope: TimetableScope
  /** Highlights the current column. */
  today?: DayOfWeek
  onSelect?: (entry: TimetableEntryOut) => void
  emptyDescription?: string
}) {
  const grid = React.useMemo(() => groupByDay(entries), [entries])
  const days = React.useMemo(() => visibleDays(grid), [grid])
  const clashes = React.useMemo(() => {
    const all = new Set<number>()
    for (const day of days) for (const id of findOverlaps(grid[day])) all.add(id)
    return all
  }, [grid, days])

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<CalendarOff />}
        title="Nothing scheduled"
        description={emptyDescription ?? 'No periods have been added to the timetable yet.'}
      />
    )
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div
        className="grid min-w-[52rem] gap-3"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(9.5rem, 1fr))` }}
      >
        {days.map((day) => (
          <div key={day} className="min-w-0">
            <div
              className={cn(
                'mb-2 rounded-lg border px-2.5 py-1.5 text-center',
                day === today ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-surface',
              )}
            >
              <p className="text-xs font-semibold">
                <span className="hidden sm:inline">{DAY_LABEL[day]}</span>
                <span className="sm:hidden">{DAY_SHORT[day]}</span>
              </p>
              <p className="text-2xs text-muted-foreground">
                {grid[day].length === 0
                  ? 'Free'
                  : `${grid[day].length} period${grid[day].length === 1 ? '' : 's'}`}
              </p>
            </div>

            <div className="space-y-2">
              {grid[day].map((entry) => (
                <PeriodCard
                  key={entry.id}
                  entry={entry}
                  scope={scope}
                  clashing={clashes.has(entry.id)}
                  onClick={onSelect}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * One resolved period.
 *
 * Times here come from `starts_at` / `ends_at`, which ARE instants — unlike the
 * wall-clock strings on the entry itself — so they render through the normal
 * date formatting.
 */
export function ScheduledPeriodRow({
  period,
  scope,
  showDate,
}: {
  period: ScheduledPeriod
  scope: TimetableScope
  showDate?: boolean
}) {
  const { entry } = period

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3',
        period.is_current ? 'border-primary/50 bg-primary/8' : 'border-border bg-card',
      )}
    >
      <div className="w-16 shrink-0 text-center">
        <p className="text-sm font-semibold tabular-nums">{formatTime(period.starts_at)}</p>
        <p className="text-2xs text-muted-foreground tabular-nums">{formatTime(period.ends_at)}</p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{subjectName(entry)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {scope !== 'student' && (
            <Badge tone="outline" size="sm">
              {classNameOf(entry)}
            </Badge>
          )}
          {scope !== 'teacher' && entry.teacher_id !== null && (
            <Badge tone="neutral" size="sm">
              {teacherName({ teacher: entry.teacher, teacher_id: entry.teacher_id })}
            </Badge>
          )}
          {entry.room && (
            <Badge tone="neutral" size="sm">
              <MapPin />
              {entry.room}
            </Badge>
          )}
          {showDate && (
            <span className="text-xs text-muted-foreground">{formatDayLabel(period.on_date)}</span>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        {period.is_current ? (
          <Badge tone="primary" className="animate-pulse">
            Now
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">{formatStartsIn(period)}</span>
        )}
      </div>
    </div>
  )
}

/** A single date's periods, in order. */
export function DaySchedule({
  periods,
  scope,
  emptyTitle = 'No classes',
  emptyDescription = 'Nothing is scheduled for this day.',
}: {
  periods: ScheduledPeriod[]
  scope: TimetableScope
  emptyTitle?: string
  emptyDescription?: string
}) {
  if (periods.length === 0) {
    return <EmptyState icon={<CalendarOff />} title={emptyTitle} description={emptyDescription} />
  }
  return (
    <div className="space-y-2">
      {periods.map((period) => (
        <ScheduledPeriodRow key={`${period.entry.id}-${period.on_date}`} period={period} scope={scope} />
      ))}
    </div>
  )
}

/**
 * "What's next", grouped by date.
 *
 * Grouped rather than a flat list because the endpoint looks across days: the
 * next lesson in a subject may not be until next week, and a flat list would
 * put it directly under today's without saying so.
 */
export function UpcomingPeriods({
  periods,
  scope,
  className,
}: {
  periods: ScheduledPeriod[]
  scope: TimetableScope
  className?: string
}) {
  const grouped = React.useMemo(() => groupByDate(periods), [periods])

  if (periods.length === 0) {
    return (
      <Card className={cn('p-5', className)}>
        <p className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="size-4 text-primary" />
          What&rsquo;s next
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing scheduled in the coming week.
        </p>
      </Card>
    )
  }

  return (
    <Card className={cn('p-5', className)}>
      <p className="flex items-center gap-2 text-sm font-medium">
        <CalendarClock className="size-4 text-primary" />
        What&rsquo;s next
      </p>
      <div className="mt-3 space-y-4">
        {grouped.map(([date, dayPeriods]) => (
          <div key={date}>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{formatDayLabel(date)}</p>
            <div className="space-y-2">
              {dayPeriods.map((period) => (
                <ScheduledPeriodRow
                  key={`${period.entry.id}-${period.on_date}`}
                  period={period}
                  scope={scope}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

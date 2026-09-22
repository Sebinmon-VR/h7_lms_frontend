import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import * as React from 'react'

import type { CalendarDay, CalendarEvent, CalendarKind } from '@/api/types'
import { useCalendar } from '@/queries/classes.queries'
import { cn } from '@/lib/cn'
import { formatDate, formatTime, parseApiDate, toApiDate, todayApiDate } from '@/lib/datetime'
import {
  CALENDAR_KINDS,
  CALENDAR_KIND_LABEL,
  calendarKindChip,
  calendarKindLabel,
  calendarKindTone,
  sortDayEvents,
} from '@/lib/school'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Segmented } from '@/components/ui/segmented'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * One calendar for every role — as a grid, not a list of days.
 *
 * The endpoint flattens timetable periods, live classes, tuition, exams and
 * homework into a single event shape and decides what to gather from the
 * caller's role, so this page never asks who is looking. A parent gets the
 * union of their children's events, each tagged with `student_name`, and the
 * only thing the UI does with `kind` is pick a colour.
 *
 * Three behaviours belong to the server and are not second-guessed here:
 *
 *  - `group_by_day=true` returns EVERY date in the range including empty ones,
 *    which is what lets the month grid render straight through with no
 *    gap-filling of our own. The request is padded to whole weeks so the first
 *    and last rows are complete;
 *  - `meeting_link` is present only when the viewer may join RIGHT NOW, so the
 *    calendar cannot be used to walk into a room early;
 *  - the range is capped at 90 days. A padded month is at most 42, so every
 *    view here is comfortably inside it.
 */

type View = 'month' | 'week' | 'agenda'

/** Monday-first, matching the school week and the backend's ISO weekdays. */
const WEEK_OPTS = { weekStartsOn: 1 } as const
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** The window to ask for, given the view and where the user has navigated to. */
function rangeFor(view: View, anchor: Date): { from: Date; to: Date } {
  if (view === 'month') {
    // Padded to whole weeks: a month grid needs the tail of the previous month
    // and the head of the next, or the first row starts mid-week.
    return {
      from: startOfWeek(startOfMonth(anchor), WEEK_OPTS),
      to: endOfWeek(endOfMonth(anchor), WEEK_OPTS),
    }
  }
  if (view === 'week') {
    return { from: startOfWeek(anchor, WEEK_OPTS), to: endOfWeek(anchor, WEEK_OPTS) }
  }
  return { from: anchor, to: addDays(anchor, 13) }
}

function shift(view: View, anchor: Date, direction: 1 | -1): Date {
  if (view === 'month') return addMonths(anchor, direction)
  if (view === 'week') return addDays(anchor, direction * 7)
  return addDays(anchor, direction * 14)
}

function rangeLabel(view: View, from: Date, to: Date, anchor: Date): string {
  if (view === 'month') return formatDate(anchor, 'MMMM yyyy')
  return `${formatDate(from, 'd MMM')} — ${formatDate(to, 'd MMM yyyy')}`
}

// ===================================================================== pieces

/** One event inside a grid cell. Full width with a leading colour bar. */
function EventChip({
  event,
  onClick,
}: {
  event: CalendarEvent
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={event.title}
      className={cn(
        'w-full truncate rounded-sm border-l-2 px-1.5 py-1 text-left text-2xs font-medium transition-opacity hover:opacity-80',
        calendarKindChip(event.kind),
        event.is_cancelled && 'line-through opacity-60',
      )}
    >
      {/* Homework has no time of day, so leading with one would invent a
          precision the record does not have. */}
      {!event.all_day && event.start_at && (
        <span className="mr-1 tabular-nums opacity-80">{formatTime(event.start_at)}</span>
      )}
      {event.title}
    </button>
  )
}

/** The detail behind a chip — everything a cell had no room for. */
function EventRow({ event }: { event: CalendarEvent }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={calendarKindTone(event.kind)} size="sm">
            {calendarKindLabel(event.kind)}
          </Badge>
          <span className={cn('text-sm font-medium', event.is_cancelled && 'line-through opacity-60')}>
            {event.title}
          </span>
          {event.is_cancelled && (
            <Badge tone="danger" size="sm">
              Cancelled
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {event.all_day
            ? 'All day'
            : [formatTime(event.start_at), formatTime(event.end_at)].filter(Boolean).join(' – ')}
          {event.subject_name ? ` · ${event.subject_name}` : ''}
          {event.class_name ? ` · ${event.class_name}` : ''}
          {event.teacher_name ? ` · ${event.teacher_name}` : ''}
          {/* Only a parent's calendar carries this — whose event it is. */}
          {event.student_name ? ` · for ${event.student_name}` : ''}
        </p>
      </div>

      {/* Present only when the server says this viewer may join now. */}
      {event.meeting_link && (
        <Button size="sm" asChild>
          <a href={event.meeting_link} target="_blank" rel="noreferrer">
            <ExternalLink />
            Join
          </a>
        </Button>
      )}
    </li>
  )
}

const MAX_CHIPS = 3

function DayCell({
  day,
  inMonth,
  onOpen,
  compact,
}: {
  day: CalendarDay
  inMonth: boolean
  onOpen: () => void
  compact: boolean
}) {
  const events = React.useMemo(() => sortDayEvents(day.events), [day.events])
  const isToday = day.date === todayApiDate()
  const shown = compact ? events.slice(0, MAX_CHIPS) : events
  const hidden = events.length - shown.length

  return (
    <div
      className={cn(
        'flex min-h-28 flex-col gap-1 border-b border-r border-border p-1.5',
        // Dimmed rather than hidden: the padding days are real dates and can
        // hold real classes, which is exactly why the grid shows them.
        !inMonth && 'bg-muted/30',
        isToday && 'bg-primary/[0.04]',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center justify-between gap-1 text-left"
      >
        <span
          className={cn(
            'flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
            isToday && 'bg-primary text-primary-foreground',
            !isToday && !inMonth && 'text-muted-foreground/60',
            !isToday && inMonth && 'text-foreground',
          )}
        >
          {formatDate(day.date, 'd')}
        </span>
        {day.count > 0 && (
          <span className="text-2xs tabular-nums text-muted-foreground">{day.count}</span>
        )}
      </button>

      <div className="flex flex-col gap-1">
        {shown.map((event, i) => (
          <EventChip
            key={`${event.kind}-${event.reference_id ?? i}`}
            event={event}
            onClick={onOpen}
          />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={onOpen}
            className="px-1.5 text-left text-2xs font-medium text-muted-foreground hover:text-foreground"
          >
            +{hidden} more
          </button>
        )}
      </div>
    </div>
  )
}

/** The month grid, and the week grid — the same cells, a different row count. */
function CalendarGrid({
  days,
  anchorMonth,
  onOpenDay,
  compact,
}: {
  days: CalendarDay[]
  /** Which month is "in" — null for the week view, where every day is. */
  anchorMonth: number | null
  onOpenDay: (day: CalendarDay) => void
  compact: boolean
}) {
  return (
    <div className="overflow-hidden rounded-xl border-l border-t border-border">
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((label) => (
          <div
            key={label}
            className="border-b border-r border-border bg-muted/40 px-2 py-2 text-center text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const parsed = parseApiDate(day.date)
          const inMonth = anchorMonth === null || (parsed ? parsed.getMonth() === anchorMonth : true)
          return (
            <DayCell
              key={day.date}
              day={day}
              inMonth={inMonth}
              compact={compact}
              onOpen={() => onOpenDay(day)}
            />
          )
        })}
      </div>
    </div>
  )
}

/** The agenda: the old list, kept because it is the only readable view on a phone. */
function AgendaList({ days }: { days: CalendarDay[] }) {
  const withEvents = days.filter((d) => d.events.length > 0)

  if (withEvents.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays />}
        title="Nothing in this window"
        description="Try a different range, or clear the filters above."
      />
    )
  }

  return (
    <div className="space-y-3">
      {withEvents.map((day) => (
        <Card key={day.date} className="p-4">
          <h3 className="text-sm font-semibold">
            {formatDate(day.date, 'EEEE d MMMM')}
            {day.date === todayApiDate() && (
              <span className="ml-2 text-xs font-normal text-primary">Today</span>
            )}
          </h3>
          <ul className="mt-1 divide-y divide-border">
            {sortDayEvents(day.events).map((event, i) => (
              <EventRow key={`${event.kind}-${event.reference_id ?? i}`} event={event} />
            ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}

// ====================================================================== page

export default function CalendarPage() {
  const [view, setView] = React.useState<View>('month')
  const [anchor, setAnchor] = React.useState<Date>(() => new Date())
  const [kinds, setKinds] = React.useState<CalendarKind[]>([])
  const [openDay, setOpenDay] = React.useState<CalendarDay | null>(null)

  const { from, to } = rangeFor(view, anchor)

  const calendar = useCalendar({
    fromDate: toApiDate(from),
    toDate: toApiDate(to),
    kinds: kinds.length ? kinds : undefined,
    groupByDay: true,
  })

  const anchorMonth = view === 'month' ? anchor.getMonth() : null

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Lessons, live classes, tuition, exams and homework on one grid."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            layoutId="calendar-view"
            value={view}
            onChange={(next) => {
              setView(next)
              // Re-anchor to today: an offset that meant "three weeks on" in
              // one view means something else in another.
              setAnchor(new Date())
            }}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
              { value: 'agenda', label: 'Agenda' },
            ]}
          />

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous"
              onClick={() => setAnchor((a) => shift(view, a, -1))}
            >
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
              Today
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next"
              onClick={() => setAnchor((a) => shift(view, a, 1))}
            >
              <ChevronRight />
            </Button>
          </div>

          <span className="text-sm font-medium">{rangeLabel(view, from, to, anchor)}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          {CALENDAR_KINDS.map((kind) => (
            <label key={kind} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={kinds.length === 0 || kinds.includes(kind)}
                onCheckedChange={(checked) =>
                  setKinds((prev) => {
                    // An empty list means "everything" to the endpoint, so the
                    // first unticking has to expand to the explicit set rather
                    // than removing from nothing.
                    const current = prev.length === 0 ? [...CALENDAR_KINDS] : prev
                    return checked ? [...current, kind] : current.filter((k) => k !== kind)
                  })
                }
              />
              <Badge tone={calendarKindTone(kind)} size="sm">
                {CALENDAR_KIND_LABEL[kind]}
              </Badge>
            </label>
          ))}
        </div>
      </PageHeader>

      <QueryBoundary
        query={calendar}
        loading={<Skeleton className="h-[34rem] w-full rounded-xl" />}
      >
        {(data) => {
          const days = data.days ?? []
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {Object.entries(data.counts_by_kind).map(([kind, count]) => (
                  <Badge key={kind} tone={calendarKindTone(kind)} size="sm">
                    {calendarKindLabel(kind)} · {count}
                  </Badge>
                ))}
                {data.count === 0 && (
                  <span className="text-sm text-muted-foreground">Nothing in this window.</span>
                )}
              </div>

              {view === 'agenda' ? (
                <AgendaList days={days} />
              ) : (
                <>
                  {/* The grid needs seven columns to mean anything, and seven
                      columns below ~640px is four characters wide. The agenda
                      is the same data in the shape a phone can read, so it
                      stands in rather than the grid shrinking into nonsense. */}
                  <div className="hidden md:block">
                    <CalendarGrid
                      days={days}
                      anchorMonth={anchorMonth}
                      compact={view === 'month'}
                      onOpenDay={setOpenDay}
                    />
                  </div>
                  <div className="md:hidden">
                    <AgendaList days={days} />
                  </div>
                </>
              )}
            </div>
          )
        }}
      </QueryBoundary>

      <Sheet open={!!openDay} onOpenChange={(v) => !v && setOpenDay(null)}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{openDay && formatDate(openDay.date, 'EEEE d MMMM yyyy')}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {openDay && openDay.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
            ) : (
              <ul className="divide-y divide-border">
                {openDay &&
                  sortDayEvents(openDay.events).map((event, i) => (
                    <EventRow key={`${event.kind}-${event.reference_id ?? i}`} event={event} />
                  ))}
              </ul>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  )
}

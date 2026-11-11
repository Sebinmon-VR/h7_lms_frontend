import { CalendarOff, Check, ChevronLeft, ChevronRight, Globe, Repeat } from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

import type { ScheduledPeriod, TimetableEntryOut } from '@/api/types'
import { useAuth } from '@/providers/auth-provider'
import { useTeacherDaySchedule, useTeacherTimetable } from '@/queries/teacher.queries'
import { cn } from '@/lib/cn'
import { formatDate, parseApiDate, shiftApiDate, toApiDate, todayApiDate } from '@/lib/datetime'
import { formatSchoolTime } from '@/lib/school-time'
import { subjectName } from '@/lib/select'
import { subjectStyle } from '@/lib/subjects'
import { useMediaQuery, useNow } from '@/lib/hooks'
import { DAYS, DAY_LABEL, DAY_SHORT, groupByDay, isEffectiveOn, minutesOfDay, visibleDays } from '@/lib/timetable'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { JoinRoomButtonFor } from '@/components/domain/class-room'
import { useClockView } from '@/components/domain/timetable'
import { formatWallClockInZone } from '@/lib/timezone'
import { WorkspaceHeader } from '@/components/layout/workspace'
import { AdminTeacherNotice, useIsAdminViewingTeacher } from './teacher-guard'

/*
 * Today first, then the week. Today's class on now (or next) is shown large,
 * with how far through it is and the way in; the week below is one column per
 * day with the periods stacked in time order, so an empty day takes no room and
 * a long period does not stretch the page. Every day is the server's resolved
 * schedule for its date, so cover and substitutions show.
 */

function hoursText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  if (h === 0) return `${m} min`
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

/** The Monday of the week a date falls in. */
function mondayOf(apiDate: string): string {
  const d = parseApiDate(apiDate) ?? new Date()
  return shiftApiDate(toApiDate(d), -((d.getDay() + 6) % 7))
}

const periodMinutes = (e: { start_time: string; end_time: string }) =>
  Math.max(0, minutesOfDay(e.end_time) - minutesOfDay(e.start_time))
const instantMinutes = (p: ScheduledPeriod) =>
  Math.round((new Date(p.ends_at).getTime() - new Date(p.starts_at).getTime()) / 60_000)
const className = (e: TimetableEntryOut) => e.class_room?.name ?? `Class ${e.class_id}`

function coverText(p: ScheduledPeriod, myId: number | undefined): { text: string; mine: boolean } | null {
  const sub = p.entry.substitution
  if (!sub) return null
  return sub.substitute_teacher_id === myId
    ? { text: `Cover for ${sub.original_teacher?.full_name ?? 'a colleague'}`, mine: true }
    : { text: `Covered by ${sub.substitute_teacher?.full_name ?? 'another teacher'}`, mine: false }
}

// ------------------------------------------------------------------- today

/** "09:40:00" → "9:40 AM", for a recurring period's wall-clock time. */
function wallTime12(time: string): string {
  const m = minutesOfDay(time)
  const h = Math.floor(m / 60)
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

function hourLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
  return `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`
}

type NextDay = { label: string; entry: TimetableEntryOut; count: number }

/**
 * Today as one timeline: the school day hour by hour, each period a segment
 * in its subject's colour, the class on now filling up as it runs, and a red
 * line at the time. Above it, one line saying what is on and the way in.
 */
function TodayTimeline({
  periods,
  now,
  nowMinutes,
  myId,
  nextDay,
}: {
  periods: ScheduledPeriod[]
  now: Date
  nowMinutes: number
  myId: number | undefined
  nextDay: NextDay | null
}) {
  const nowMs = now.getTime()
  const current = periods.find(
    (p) => p.is_current || (new Date(p.starts_at).getTime() <= nowMs && nowMs < new Date(p.ends_at).getTime()),
  )
  const next = periods.find((p) => new Date(p.starts_at).getTime() > nowMs)
  const spot = current ?? next

  // The span the bar covers: the day's first start to its last end, to whole hours.
  const span = React.useMemo(() => {
    if (periods.length === 0) return null
    const starts = periods.map((p) => minutesOfDay(p.entry.start_time))
    const ends = periods.map((p) => minutesOfDay(p.entry.end_time))
    return { from: Math.floor(Math.min(...starts) / 60) * 60, to: Math.ceil(Math.max(...ends) / 60) * 60 }
  }, [periods])
  const pct = (m: number) => (span ? ((m - span.from) / (span.to - span.from)) * 100 : 0)
  const hours: number[] = []
  if (span) for (let m = span.from; m <= span.to; m += 60) hours.push(m)

  let status: React.ReactNode
  if (spot) {
    const starts = new Date(spot.starts_at).getTime()
    const ends = new Date(spot.ends_at).getTime()
    const cover = coverText(spot, myId)
    status = (
      <>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider',
            current ? 'text-success' : 'text-primary',
          )}
        >
          {current && (
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
          )}
          {current ? 'On now' : `Next · in ${hoursText((starts - nowMs) / 60_000)}`}
        </span>
        <span className="text-lg font-semibold text-foreground">
          {className(spot.entry)}
          <span className="font-normal text-muted-foreground"> · {subjectName(spot.entry)}</span>
        </span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatSchoolTime(spot.starts_at)} – {formatSchoolTime(spot.ends_at)}
          {current && <strong className="ml-2 font-semibold text-foreground">{hoursText((ends - nowMs) / 60_000)} left</strong>}
          {spot.entry.room && ` · ${spot.entry.room}`}
        </span>
        {cover && (
          <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', cover.mine ? 'text-info' : 'text-warning')}>
            <Repeat className="size-3.5" />
            {cover.text}
          </span>
        )}
      </>
    )
  } else {
    status = (
      <>
        <span className="inline-flex items-center gap-1.5 text-lg font-semibold text-foreground">
          <Check className="size-5 text-success" />
          {periods.length ? 'All done for today' : 'No classes today'}
        </span>
        {nextDay && (
          <span className="text-sm text-muted-foreground">
            {nextDay.label} starts at <strong className="font-semibold text-foreground">{wallTime12(nextDay.entry.start_time)}</strong>{' '}
            with <strong className="font-semibold text-foreground">{className(nextDay.entry)}</strong> · {subjectName(nextDay.entry)}
            {' '}({nextDay.count} {nextDay.count === 1 ? 'period' : 'periods'})
          </span>
        )}
      </>
    )
  }

  return (
    <div className="border-y border-border py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">{status}</div>
        {spot && <JoinRoomButtonFor classId={spot.entry.class_id} size="sm" />}
      </div>

      {span && (
        <div className="mt-4">
          {/* The bar */}
          <div className="relative h-14 rounded-md bg-muted/50">
            {periods.map((p) => {
              const start = minutesOfDay(p.entry.start_time)
              const end = minutesOfDay(p.entry.end_time)
              const done = new Date(p.ends_at).getTime() <= nowMs
              const live = p === current
              const subject = subjectName(p.entry)
              const fill = live ? Math.min(Math.max((nowMinutes - start) / (end - start), 0), 1) * 100 : 0
              return (
                <div
                  key={`${p.entry.id}-${p.starts_at}`}
                  style={{ ...subjectStyle(subject), left: `${pct(start)}%`, width: `calc(${pct(end) - pct(start)}% - 3px)` }}
                  className={cn(
                    'absolute inset-y-1 overflow-hidden rounded border-l-[3px] border-[hsl(var(--tile))] bg-[hsl(var(--tile)/0.16)]',
                    done && !live && 'opacity-50',
                    live && 'ring-2 ring-[hsl(var(--tile))]',
                  )}
                  title={`${className(p.entry)} · ${subject} · ${formatSchoolTime(p.starts_at)} – ${formatSchoolTime(p.ends_at)}`}
                >
                  {live && <div className="absolute inset-y-0 left-0 bg-[hsl(var(--tile)/0.28)]" style={{ width: `${fill}%` }} />}
                  <div className="relative px-2 py-1">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {className(p.entry)} <span className="font-normal text-foreground/70">· {subject}</span>
                    </p>
                    <p className="truncate text-[11px] tabular-nums text-foreground/60">
                      {wallTime12(p.entry.start_time).replace(/ (AM|PM)$/, '')}–{wallTime12(p.entry.end_time).replace(/ (AM|PM)$/, '')}
                    </p>
                  </div>
                </div>
              )
            })}
            {/* Now */}
            {nowMinutes > span.from && nowMinutes < span.to && (
              <div className="pointer-events-none absolute -inset-y-1 z-10 w-0.5 bg-danger" style={{ left: `${pct(nowMinutes)}%` }}>
                <span className="absolute -left-[3px] -top-1 size-2 rounded-full bg-danger" />
              </div>
            )}
          </div>
          {/* Hour scale */}
          <div className="relative mt-1 h-4">
            {hours.map((m, i) => (
              <span
                key={m}
                className={cn(
                  'absolute whitespace-nowrap text-[11px] tabular-nums text-muted-foreground',
                  i === 0 ? '' : i === hours.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
                  // A phone has room for every other hour only.
                  i % 2 === 1 && i !== hours.length - 1 && 'max-sm:hidden',
                )}
                style={{ left: `${pct(m)}%` }}
              >
                {hourLabel(m)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------------- week

function WeekBlock({ p, past, now, myId }: { p: ScheduledPeriod; past: boolean; now: Date; myId: number | undefined }) {
  const subject = subjectName(p.entry)
  const nowMs = now.getTime()
  const live = p.is_current || (new Date(p.starts_at).getTime() <= nowMs && nowMs < new Date(p.ends_at).getTime())
  const cover = coverText(p, myId)
  return (
    <div
      style={subjectStyle(subject)}
      className={cn(
        'rounded-md border-l-[3px] border-[hsl(var(--tile))] bg-[hsl(var(--tile)/0.12)] px-2.5 py-2',
        live && 'bg-[hsl(var(--tile)/0.22)] ring-1 ring-[hsl(var(--tile))]',
        past && !live && 'opacity-60',
      )}
    >
      <p className="flex items-center justify-between gap-2 text-[11px] font-medium tabular-nums text-foreground/70">
        <span>
          {formatSchoolTime(p.starts_at)} – {formatSchoolTime(p.ends_at)}
        </span>
        {live && <span className="rounded bg-success px-1 text-[10px] font-bold uppercase text-success-foreground">Now</span>}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{className(p.entry)}</p>
      <p className="truncate text-xs text-foreground/70">
        {subject}
        {p.entry.room && ` · ${p.entry.room}`}
      </p>
      {cover && (
        <p className={cn('mt-0.5 flex items-center gap-1 truncate text-[11px] font-semibold', cover.mine ? 'text-info' : 'text-warning')}>
          <Repeat className="size-3 shrink-0" />
          {cover.text}
        </p>
      )}
    </div>
  )
}

/** One day's column: heading, then its periods stacked in time order. */
function WeekDay({
  day,
  date,
  fallback,
  today,
  now,
  myId,
  single,
}: {
  day: (typeof DAYS)[number]
  date: string
  fallback: TimetableEntryOut[]
  today: string
  now: Date
  myId: number | undefined
  single?: boolean
}) {
  const query = useTeacherDaySchedule(date)
  const periods = React.useMemo(
    () => [...(query.data ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [query.data],
  )
  const isToday = date === today
  // Until the date's schedule arrives, the heading counts from the recurring timetable.
  const counted = query.data ? periods.map((p) => p.entry) : fallback
  const minutes = counted.reduce((n, e) => n + periodMinutes(e), 0)

  return (
    <div className={cn('min-w-0', !single && 'border-l border-border first:border-l-0', isToday && 'bg-primary/[0.03]')}>
      <div className={cn('flex items-center gap-2 border-b border-border px-3 py-2.5', isToday && 'border-b-2 border-b-primary')}>
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full text-base font-semibold tabular-nums',
            isToday ? 'bg-primary text-primary-foreground' : 'text-foreground',
          )}
        >
          {formatDate(parseApiDate(date), 'd')}
        </span>
        <div className="min-w-0">
          <p className={cn('text-xs font-semibold uppercase tracking-wide', isToday ? 'text-primary' : 'text-foreground')}>
            {single ? DAY_LABEL[day] : DAY_SHORT[day]}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {counted.length ? `${counted.length} ${counted.length === 1 ? 'period' : 'periods'} · ${hoursText(minutes)}` : 'Free'}
          </p>
        </div>
      </div>
      <div className="space-y-2 p-2">
        {query.isPending ? (
          fallback.map((e) => <Skeleton key={e.id} className="h-[68px] rounded-md" />)
        ) : periods.length === 0 ? (
          <p className="flex items-center justify-center gap-1.5 py-6 text-xs text-muted-foreground/70">
            <CalendarOff className="size-3.5" />
            No classes
          </p>
        ) : (
          periods.map((p) => (
            <WeekBlock key={`${p.entry.id}-${p.starts_at}`} p={p} past={date < today || (isToday && new Date(p.ends_at) <= now)} now={now} myId={myId} />
          ))
        )}
      </div>
    </div>
  )
}

// -------------------------------------------------------------------- page

export default function TeacherTimetablePage() {
  const isAdmin = useIsAdminViewingTeacher()
  const myId = useAuth().user?.id
  const now = useNow(30_000)
  const today = todayApiDate()
  const clock = useClockView('teacher')
  const narrow = useMediaQuery('(max-width: 767px)')
  const [phoneDay, setPhoneDay] = React.useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const weekParam = params.get('week')
  const thisMonday = mondayOf(today)
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(weekParam ?? '') ? (weekParam as string) : today)
  const goWeek = (m: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (m === thisMonday) p.delete('week')
        else p.set('week', m)
        return p
      },
      { replace: true },
    )

  const weekQuery = useTeacherTimetable(!isAdmin)
  const todayQuery = useTeacherDaySchedule(today, !isAdmin)

  // The recurring week as it stands: ended and paused periods off.
  const entries = React.useMemo(
    () => (weekQuery.data ?? []).filter((e) => e.is_active && (!e.effective_to || e.effective_to >= today)),
    [weekQuery.data, today],
  )
  const grid = React.useMemo(() => groupByDay(entries), [entries])
  const days = React.useMemo(
    () =>
      visibleDays(grid).map((d) => {
        const date = shiftApiDate(monday, DAYS.indexOf(d))
        return { day: d, date, entries: grid[d].filter((e) => isEffectiveOn(e, date)) }
      }),
    [grid, monday],
  )
  // The next school day with periods, for when today's are over.
  const nextDay = React.useMemo<NextDay | null>(() => {
    for (let i = 1; i <= 7; i += 1) {
      const date = shiftApiDate(today, i)
      const d = parseApiDate(date)
      if (!d) continue
      const day = DAYS[(d.getDay() + 6) % 7]
      const list = (grid[day] ?? [])
        .filter((e) => isEffectiveOn(e, date))
        .sort((a, b) => minutesOfDay(a.start_time) - minutesOfDay(b.start_time))
      if (list.length) return { label: i === 1 ? 'Tomorrow' : DAY_LABEL[day], entry: list[0], count: list.length }
    }
    return null
  }, [grid, today])
  // "Now" on the school's clock, since the timetable is written in it.
  const nowMinutes = React.useMemo(() => {
    const wall = clock.schoolZone ? formatWallClockInZone(now, clock.schoolZone) : null
    return wall ? minutesOfDay(wall) : now.getHours() * 60 + now.getMinutes()
  }, [now, clock.schoolZone])
  const todayPeriods = React.useMemo(
    () => [...(todayQuery.data ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [todayQuery.data],
  )

  const load = React.useMemo(() => {
    const map = new Map<string, { cls: string; subject: string; count: number }>()
    for (const e of entries) {
      const key = `${e.class_id}|${e.subject_id}`
      const row = map.get(key) ?? { cls: className(e), subject: subjectName(e), count: 0 }
      row.count += 1
      map.set(key, row)
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.cls.localeCompare(b.cls))
  }, [entries])

  if (isAdmin) {
    return (
      <>
        <WorkspaceHeader title="Timetable" description="The periods you are scheduled to take." />
        <div className="pt-6">
          <AdminTeacherNotice area="timetable" />
        </div>
      </>
    )
  }

  const weekMinutes = entries.reduce((n, e) => n + periodMinutes(e), 0)
  const isThisWeek = monday === thisMonday
  const todayMinutes = todayPeriods.reduce((n, p) => n + instantMinutes(p), 0)
  const pickedDay = days.find((d) => d.date === phoneDay) ?? days.find((d) => d.date === today) ?? days[0]
  const shown = narrow && pickedDay ? [pickedDay] : days

  return (
    <>
      <WorkspaceHeader
        title="Timetable"
        description={
          weekQuery.data
            ? `${entries.length} ${entries.length === 1 ? 'period' : 'periods'} a week · ${hoursText(weekMinutes)} of teaching`
            : 'The periods you are scheduled to take.'
        }
      />

      <div className="space-y-8 pt-6">
        {/* ------------------------------------------------------------ today */}
        <section>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Today
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {formatDate(now, 'EEEE, d MMMM')}
                {todayPeriods.length > 0 && ` · ${todayPeriods.length} ${todayPeriods.length === 1 ? 'period' : 'periods'} · ${hoursText(todayMinutes)}`}
              </span>
            </h2>
            {clock.differs && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Globe className="size-3.5" />
                Times are school time ({clock.schoolLabel}). Your device is on {clock.localLabel}.
              </p>
            )}
          </div>
          {todayQuery.isPending ? (
            <Skeleton className="h-32 rounded-lg" />
          ) : (
            <TodayTimeline periods={todayPeriods} now={now} nowMinutes={nowMinutes} myId={myId} nextDay={nextDay} />
          )}
        </section>

        {/* ------------------------------------------------------------- week */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {isThisWeek ? 'This week' : 'Week'}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {formatDate(parseApiDate(monday), 'd MMM')} – {formatDate(parseApiDate(shiftApiDate(monday, 4)), 'd MMM yyyy')}
              </span>
            </h2>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" onClick={() => goWeek(shiftApiDate(monday, -7))} aria-label="Previous week">
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="sm" onClick={() => goWeek(thisMonday)} disabled={isThisWeek}>
                This week
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => goWeek(shiftApiDate(monday, 7))} aria-label="Next week">
                <ChevronRight />
              </Button>
            </div>
          </div>

          {narrow && days.length > 0 && (
            <div className="mb-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
              {days.map((d) => {
                const on = d.date === pickedDay?.date
                return (
                  <button
                    key={d.day}
                    type="button"
                    onClick={() => setPhoneDay(d.date)}
                    className={cn(
                      'rounded-md border py-1.5 text-center',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground',
                    )}
                  >
                    <span className="block text-[10px] font-semibold uppercase">{DAY_SHORT[d.day]}</span>
                    <span className="block text-base font-semibold leading-tight tabular-nums">{formatDate(parseApiDate(d.date), 'd')}</span>
                    {d.date === today && !on && <span className="mx-auto mt-0.5 block size-1 rounded-full bg-primary" />}
                  </button>
                )
              })}
            </div>
          )}

          {weekQuery.isPending ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : weekQuery.isError ? (
            <p className="border-y border-border py-10 text-center text-sm text-muted-foreground">
              The timetable could not be loaded. Reload the page to try again.
            </p>
          ) : entries.length === 0 ? (
            <p className="border-y border-border py-10 text-center text-sm text-muted-foreground">
              You have no periods on the timetable. The office schedules these.
            </p>
          ) : (
            <div
              className="grid overflow-hidden rounded-lg border border-border"
              style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}
            >
              {shown.map((d) => (
                <WeekDay
                  key={`${d.day}-${d.date}`}
                  day={d.day}
                  date={d.date}
                  fallback={d.entries}
                  today={today}
                  now={now}
                  myId={myId}
                  single={narrow}
                />
              ))}
            </div>
          )}

          {load.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Each week</span>
              {load.map((r) => (
                <span key={`${r.cls}-${r.subject}`} style={subjectStyle(r.subject)} className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-[hsl(var(--tile))]" />
                  <span className="font-medium text-foreground">{r.cls}</span>
                  <span className="text-muted-foreground">{r.subject}</span>
                  <span className="font-semibold tabular-nums text-foreground">×{r.count}</span>
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}

import { Check, Copy, MonitorPlay, Radio, RefreshCw, Video } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import type { ClassRoomAttendanceOut, ClassRoomEventOut, LiveClassBoardRow, ScheduledPeriod } from '@/api/types'
import { ApiError } from '@/api/errors'
import {
  useClassRoomAttendance,
  useClassRoomEvents,
  useJoinClassRoom,
  useLiveBoard,
  useSyncClassRoomAttendance,
} from '@/queries/classes.queries'
import { ROLE_LABEL } from '@/lib/constants'
import { cn } from '@/lib/cn'
import { ARRIVAL_TONE, arrivalText, formatMinutes } from '@/components/domain/class-room'
import { formatDateTime, formatRelative, parseApiDateTime } from '@/lib/datetime'
import { formatSchoolTime } from '@/lib/school-time'
import { countLabel } from '@/lib/format'
import { useCopyToClipboard } from '@/lib/hooks'
import { shareableLink, startJoin } from '@/lib/meeting-links'
import { tidyName as tidy } from '@/lib/names'
import { subjectName } from '@/lib/select'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/feedback/states'
import { Band, Figure, Figures, TabStrip, TONE_FILL, TONE_TEXT, WorkspaceHeader, type Tone } from '@/components/layout/workspace'

/**
 * The office's live board: every class room right now.
 *
 * Laid out like the other admin workspaces — white bands, no cards. Classes
 * on the left, each with what is on and who is in; the chosen class on the
 * right with the period running, the day's periods and when each teacher came
 * in, and the room's log and attendance as tabs.
 *
 * Classes happen inside the LMS (Azure Communication Services). The board
 * shows no video itself — "Preview" opens the class room in a compact pop-out
 * beside this page. "In now" is whoever's last word in the room log today was
 * a join; attendance is each person's join and leave times from the same log.
 */

type Filter = 'LIVE' | 'TODAY' | 'ALL'
type DetailTab = 'periods' | 'log' | 'attendance'

const ACTION_LABEL: Record<string, string> = {
  JOINED_ROOM: 'joined the room',
  LEFT_ROOM: 'left the room',
  JOINED_SESSION: 'joined a session',
  STARTED: 'opened the period',
  ENDED: 'ended the period',
  ROOM_CREATED: 'created the room',
  ROOM_REPLACED: 'replaced the room',
  ROOM_LINK_SET: 'set the room link',
  ROOM_CLEARED: 'removed the room',
}

function serverNow(row: LiveClassBoardRow): Date {
  return /[zZ]$|[+-]\d\d:\d\d$/.test(row.now) ? new Date(row.now) : new Date(`${row.now}Z`)
}

function minutesLeft(period: ScheduledPeriod, now: Date): number {
  return Math.max(0, Math.round((new Date(period.ends_at).getTime() - now.getTime()) / 60_000))
}

/** How far through the period we are, 0–100. */
function periodProgress(period: ScheduledPeriod, now: Date): number {
  const start = new Date(period.starts_at).getTime()
  const end = new Date(period.ends_at).getTime()
  if (end <= start) return 0
  return Math.min(100, Math.max(0, ((now.getTime() - start) / (end - start)) * 100))
}

function periodTeacher(period: ScheduledPeriod): string {
  return period.entry.teacher?.full_name ? tidy(period.entry.teacher.full_name) : 'Teacher to be confirmed'
}

/** One word for where the class is in its day, and its colour. */
function statusOf(row: LiveClassBoardRow): { label: string; tone: Tone } {
  if (row.is_live) return row.current_period && !row.teacher_present ? { label: 'Teacher not in', tone: 'warning' } : { label: 'In session', tone: 'success' }
  if (row.periods_today.length === 0) return { label: 'No classes today', tone: 'neutral' }
  if (row.next_period) return { label: 'Break', tone: 'info' }
  return { label: 'Done for today', tone: 'neutral' }
}

function StatusTag({ row }: { row: LiveClassBoardRow }) {
  const status = statusOf(row)
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', TONE_TEXT[status.tone])}>
      <span className={cn('size-2 rounded-full', TONE_FILL[status.tone])} aria-hidden />
      {status.label}
    </span>
  )
}

/**
 * Opens the class room in a compact pop-out window.
 *
 * The window is opened synchronously on the click — a window opened after an
 * await is what popup blockers exist to stop — and pointed at the link once
 * the join call has recorded it.
 */
function usePreviewWindow() {
  const join = useJoinClassRoom()
  return (row: LiveClassBoardRow) => {
    const handle = window.open('', `h7-room-${row.class_id}`, 'popup=yes,width=980,height=640,menubar=no,toolbar=no,location=no,status=no')
    join.mutate(row.class_id, {
      onSuccess: (result) => {
        if (result.room_link) {
          if (handle) handle.location.href = shareableLink(result.room_link)
          else window.open(result.room_link, '_blank', 'noopener')
        } else {
          handle?.close()
          toast.warning('This class has no room link yet')
        }
      },
      onError: (error) => {
        handle?.close()
        toast.error(error instanceof ApiError ? error.message : 'Could not open the room.')
      },
    })
  }
}

// ==================================================================== list

/** Which group a class sits in on the list, most urgent first. */
const GROUPS: { key: string; label: string; tone: Tone; test: (r: LiveClassBoardRow) => boolean }[] = [
  { key: 'attention', label: 'Needs attention', tone: 'warning', test: (r) => r.is_live && !!r.current_period && !r.teacher_present },
  { key: 'live', label: 'In session', tone: 'success', test: (r) => r.is_live },
  { key: 'later', label: 'Later today', tone: 'info', test: (r) => !!r.next_period },
  { key: 'done', label: 'Done or no classes', tone: 'neutral', test: () => true },
]

function ClassList({
  rows,
  value,
  onChange,
}: {
  rows: LiveClassBoardRow[]
  value: number | null
  onChange: (id: number) => void
}) {
  // Each class in the first group it passes.
  const placed = new Set<number>()
  const groups = GROUPS.map((g) => {
    const items = rows.filter((r) => !placed.has(r.class_id) && g.test(r))
    items.forEach((r) => placed.add(r.class_id))
    return { ...g, items }
  }).filter((g) => g.items.length > 0)

  return (
    <div className="max-h-80 overflow-y-auto lg:h-full lg:max-h-none">
      {groups.map((g) => (
        <section key={g.key}>
          <h3 className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-muted/80 py-1.5 pl-4 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur sm:pl-6 lg:pl-8">
            <span className="flex items-center gap-1.5">
              <span className={cn('size-1.5 rounded-full', TONE_FILL[g.tone])} aria-hidden />
              {g.label}
            </span>
            <span className="tabular-nums">{g.items.length}</span>
          </h3>
          <ul className="divide-y divide-border">
            {g.items.map((row) => {
              const active = value === row.class_id
              const current = row.current_period ?? null
              const session = row.live_sessions.find((x) => x.timing.is_live) ?? null
              const line = current
                ? `${subjectName(current.entry)} · ${periodTeacher(current)}`
                : session
                  ? `${session.title ?? session.subject_name ?? 'Live session'} · ${session.teacher_name ? tidy(session.teacher_name) : 'Teacher'}`
                  : row.next_period
                    ? `${formatSchoolTime(row.next_period.starts_at)} · ${subjectName(row.next_period.entry)}`
                    : statusOf(row).label
              return (
                <li key={row.class_id}>
                  <button
                    type="button"
                    onClick={() => onChange(row.class_id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'relative flex w-full items-center gap-3 py-2.5 pl-4 pr-4 text-left transition-colors sm:pl-6 lg:pl-8',
                      active ? 'bg-primary/5' : 'hover:bg-muted/40',
                    )}
                  >
                    {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm font-medium', active ? 'text-primary' : 'text-foreground')}>{row.class_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{line}</span>
                    </span>
                    {row.is_live ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground" title="Students in the room now">
                        <span className={cn('size-1.5 animate-pulse rounded-full', TONE_FILL[g.tone])} aria-hidden />
                        {row.students_in_now.length}
                      </span>
                    ) : (
                      !row.has_room && <span className="shrink-0 text-[10px] text-warning">No room</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Minutes left as a small ring: the arc is the part of the period still to go. */
function TimeRing({ percentGone, minutes, tone }: { percentGone: number; minutes: number; tone: Tone }) {
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <span className="relative inline-flex size-16 shrink-0 items-center justify-center">
      <svg viewBox="0 0 52 52" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="26" cy="26" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={(c * percentGone) / 100}
          className={tone === 'warning' ? 'stroke-warning' : 'stroke-success'}
        />
      </svg>
      <span className="text-center leading-none">
        <span className="block text-base font-medium tabular-nums text-foreground">{minutes}</span>
        <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">min left</span>
      </span>
    </span>
  )
}

/**
 * The class's school day as one strip: each period a block, past ones grey,
 * the running one green, a line where "now" is. A block with a coloured top
 * edge is a period the teacher came in late to, or never did.
 */
function DayStrip({ row, now }: { row: LiveClassBoardRow; now: Date }) {
  const periods = row.periods_today
  if (periods.length === 0) return null
  const start = new Date(periods[0].starts_at).getTime()
  const end = new Date(periods[periods.length - 1].ends_at).getTime()
  const span = Math.max(1, end - start)
  const at = (t: number) => ((t - start) / span) * 100
  const nowPos = at(now.getTime())
  const currentId = row.current_period?.entry.id

  return (
    <div>
      <div className="relative h-9">
        {periods.map((p) => {
          const a = new Date(p.starts_at).getTime()
          const b = new Date(p.ends_at).getTime()
          const past = b <= now.getTime()
          const isNow = p.entry.id === currentId
          const arrival = arrivalText(p)
          return (
            <span
              key={p.entry.id}
              title={`${formatSchoolTime(p.starts_at)}–${formatSchoolTime(p.ends_at)} · ${subjectName(p.entry)} · ${periodTeacher(p)}${arrival ? ` · ${arrival.text}` : ''}`}
              className={cn(
                'absolute inset-y-0 flex items-center overflow-hidden rounded-sm border-t-2 px-1.5 text-[10px] font-medium',
                isNow ? 'bg-success/15 text-success' : past ? 'bg-muted text-muted-foreground' : 'bg-primary/[0.07] text-foreground/70',
                arrival?.tone === 'danger' ? 'border-t-danger' : arrival?.tone === 'warning' ? 'border-t-warning' : 'border-t-transparent',
              )}
              style={{ left: `${at(a)}%`, width: `calc(${at(b) - at(a)}% - 2px)` }}
            >
              <span className="truncate">{subjectName(p.entry)}</span>
            </span>
          )
        })}
        {nowPos > 0 && nowPos < 100 && (
          <span className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground" style={{ left: `${nowPos}%` }} aria-label="Now" />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>{formatSchoolTime(periods[0].starts_at)}</span>
        <span>{formatSchoolTime(periods[periods.length - 1].ends_at)}</span>
      </div>
    </div>
  )
}

// ================================================================== detail

function PeriodsTable({ row, now }: { row: LiveClassBoardRow; now: Date }) {
  const current = row.current_period ?? null
  if (row.periods_today.length === 0) {
    return <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">Nothing on the timetable today</p>
  }
  return (
    <div className="overflow-x-auto border-y border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Time</th>
            <th className="px-3 py-2 text-left font-medium">Subject</th>
            <th className="px-3 py-2 text-left font-medium">Teacher</th>
            <th className="px-3 py-2 text-left font-medium">Teacher arrived</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {row.periods_today.map((period) => {
            const isNow = period.entry.id === current?.entry.id
            const past = new Date(period.ends_at) <= now
            // When the teacher came in, and how long the students waited.
            const arrival = arrivalText(period)
            return (
              <tr key={period.entry.id} className={cn(isNow && 'bg-success/[0.06]', past && !isNow && 'text-muted-foreground')}>
                <td className="relative whitespace-nowrap px-3 py-1.5 tabular-nums">
                  {isNow && <span className="absolute inset-y-0 left-0 w-0.5 bg-success" aria-hidden />}
                  {formatSchoolTime(period.starts_at)}–{formatSchoolTime(period.ends_at)}
                </td>
                <td className="px-3 py-1.5 font-medium">
                  {subjectName(period.entry)}
                  {isNow && <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-success">Now</span>}
                </td>
                <td className="px-3 py-1.5">{periodTeacher(period)}</td>
                <td className={cn('px-3 py-1.5 text-xs', arrival ? ARRIVAL_TONE[arrival.tone] : 'text-muted-foreground')}>
                  {arrival?.text ?? (past ? '—' : 'Later today')}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RoomLog({ classId }: { classId: number }) {
  const [todayOnly, setTodayOnly] = React.useState(true)
  const events = useClassRoomEvents(classId, todayOnly, true)
  const rows = events.data ?? []

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Segmented
          size="sm"
          layoutId="live-log-range"
          aria-label="Range"
          value={todayOnly ? 'today' : 'all'}
          onChange={(v) => setTodayOnly(v === 'today')}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'all', label: 'Everything' },
          ]}
        />
      </div>
      {events.isPending ? (
        <Skeleton className="h-40" />
      ) : events.isError ? (
        <ErrorState error={events.error} onRetry={() => events.refetch()} compact />
      ) : rows.length === 0 ? (
        <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">{todayOnly ? 'Nothing recorded today' : 'Nothing recorded yet'}</p>
      ) : (
        <ol className="divide-y divide-border border-y border-border">
          {rows.map((event: ClassRoomEventOut, index) => {
            const tone: Tone = event.action === 'JOINED_ROOM' || event.action === 'JOINED_SESSION' || event.action === 'STARTED' ? 'success' : event.action === 'LEFT_ROOM' || event.action === 'ENDED' ? 'neutral' : 'info'
            return (
              <li key={event.id ?? `${event.at}-${index}`} className="flex items-center gap-3 px-1 py-1.5 text-sm">
                <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground" title={formatDateTime(event.at)}>
                  {todayOnly ? formatSchoolTime(event.at) : formatDateTime(event.at)}
                </span>
                <span className={cn('size-1.5 shrink-0 rounded-full', TONE_FILL[tone])} aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-foreground">{event.user_name ? tidy(event.user_name) : 'System'}</span>
                  {event.role && <span className="text-xs text-muted-foreground"> · {ROLE_LABEL[event.role as keyof typeof ROLE_LABEL] ?? event.role}</span>}{' '}
                  <span className="text-muted-foreground">{ACTION_LABEL[event.action] ?? event.action.toLowerCase()}</span>
                  {event.detail && <span className="text-muted-foreground"> · {event.detail}</span>}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function attendanceWho(entry: ClassRoomAttendanceOut): string {
  if (entry.matched_role) return ROLE_LABEL[entry.matched_role as keyof typeof ROLE_LABEL] ?? entry.matched_role
  if (entry.user_kind === 'LMS') return 'Signed in'
  if (entry.user_kind === 'ANONYMOUS') return 'Guest'
  if (entry.user_kind === 'PHONE') return 'Dialled in'
  return 'Not matched'
}

/**
 * Who was in the room today: each person with their join and leave times,
 * built from the join/leave log the in-LMS call writes on connect and hang-up.
 */
function AttendanceTable({ row }: { row: LiveClassBoardRow }) {
  const attendance = useClassRoomAttendance(row.class_id)
  const sync = useSyncClassRoomAttendance()
  const rows = attendance.data ?? []
  const inNow = rows.filter((r) => r.still_in).length

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {rows.length > 0 && `${countLabel(rows.length, 'person', 'people')} today${inNow ? ` · ${inNow} still in` : ''} · `}
          {row.room_attendance_synced_at ? `updated ${formatRelative(row.room_attendance_synced_at)}` : 'not updated yet'}
        </span>
        <Button size="sm" variant="outline" loading={sync.isPending} onClick={() => sync.mutate({ classId: row.class_id })}>
          <RefreshCw />
          Update now
        </Button>
      </div>
      {row.room_attendance_error && <p className="border-l-2 border-warning bg-warning/5 px-3 py-2 text-xs text-foreground">{row.room_attendance_error}</p>}
      {attendance.isPending ? (
        <Skeleton className="h-40" />
      ) : attendance.isError ? (
        <ErrorState error={attendance.error} onRetry={() => attendance.refetch()} compact />
      ) : rows.length === 0 ? (
        <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">Nobody has joined yet. People appear here as they join the class room</p>
      ) : (
        <div className="overflow-x-auto border-y border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Role</th>
                <th className="px-3 py-2 text-left font-medium">Joined</th>
                <th className="px-3 py-2 text-left font-medium">Left</th>
                <th className="px-3 py-2 text-right font-medium">Minutes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((entry, index) => (
                <tr key={entry.id ?? `${entry.participant ?? entry.display_name}-${index}`}>
                  <td className="px-3 py-1.5 font-medium text-foreground">
                    {tidy(entry.matched_user_name ?? entry.display_name ?? 'Participant')}
                    {entry.sessions.length > 1 && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">in and out {entry.sessions.length}×</span>}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{attendanceWho(entry)}</td>
                  <td className="px-3 py-1.5 tabular-nums">{entry.first_joined_at ? formatSchoolTime(entry.first_joined_at) : '—'}</td>
                  <td className="px-3 py-1.5 tabular-nums">
                    {entry.still_in ? <span className="font-medium text-success">Still in</span> : entry.last_left_at ? formatSchoolTime(entry.last_left_at) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{Math.round(entry.minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ClassDetail({ row }: { row: LiveClassBoardRow }) {
  const join = useJoinClassRoom()
  const openPreview = usePreviewWindow()
  const { copied, copy } = useCopyToClipboard()
  const [tab, setTab] = React.useState<DetailTab>('periods')
  const now = serverNow(row)
  const current = row.current_period ?? null
  const session = row.live_sessions.find((s) => s.timing.is_live) ?? row.live_sessions[0] ?? null
  const share = row.enrolled_count > 0 ? Math.round((row.students_joined_today / row.enrolled_count) * 100) : 0

  const joinNow = () => {
    const tab = startJoin()
    join.mutate(row.class_id, {
      onSuccess: (result) => {
        if (result.room_link) tab.go(result.room_link)
        else {
          tab.cancel()
          toast.warning('This class has no room link yet')
        }
      },
      onError: (error) => {
        tab.cancel()
        toast.error(error instanceof ApiError ? error.message : 'Could not open the room.')
      },
    })
  }

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'periods', label: `Today's periods (${row.periods_today.length})` },
    { key: 'log', label: 'Room log' },
    { key: 'attendance', label: 'Attendance' },
  ]

  return (
    <div className="space-y-5">
      {/* ----------------------------------------------------------- head */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-medium tracking-tight text-foreground">{row.class_name}</h2>
            <StatusTag row={row} />
            {!row.has_room && (
              <span className={cn('text-xs font-medium', row.room_status === 'FAILED' ? 'text-danger' : 'text-warning')}>
                {row.room_status === 'FAILED' ? 'Room failed' : 'No room yet'}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {row.room_link && (
            <Button variant="ghost" size="icon-sm" aria-label="Copy the room link" onClick={() => void copy(shareableLink(row.room_link))}>
              {copied ? <Check className="text-success" /> : <Copy />}
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={!row.has_room} onClick={() => openPreview(row)}>
            <MonitorPlay />
            Preview
          </Button>
          <Button size="sm" loading={join.isPending} onClick={joinNow}>
            <Video />
            Join room
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------ now */}
      {current ? (
        <div className="flex items-center gap-4">
          <TimeRing
            percentGone={periodProgress(current, now)}
            minutes={minutesLeft(current, now)}
            tone={row.teacher_present || row.teachers_in_now.length > 0 ? 'success' : 'warning'}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Now · {formatSchoolTime(current.starts_at)}–{formatSchoolTime(current.ends_at)}
            </p>
            <p className="truncate text-xl font-medium text-foreground">{subjectName(current.entry)}</p>
            <p className="mt-0.5 flex min-w-0 items-center gap-2 text-sm">
              <Avatar name={current.entry.teacher?.full_name ?? '?'} size="xs" />
              <span className="truncate text-foreground">{periodTeacher(current)}</span>
              {row.teachers_in_now.length > 0 || row.teacher_present ? (
                <span className="shrink-0 text-success">
                  in the room
                  {current.waiting_minutes != null && current.waiting_minutes >= 1 ? ` · came ${formatMinutes(current.waiting_minutes)} late` : ''}
                </span>
              ) : (
                <span className="shrink-0 font-medium text-warning">
                  not in yet{current.waiting_minutes != null ? ` · ${formatMinutes(current.waiting_minutes)} waiting` : ''}
                </span>
              )}
            </p>
          </div>
        </div>
      ) : session ? (
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Live session</p>
          <p className="truncate text-xl font-medium text-foreground">{session.title ?? session.subject_name ?? 'Live class'}</p>
          <p className="text-sm text-muted-foreground">
            {session.teacher_name ? tidy(session.teacher_name) : 'Teacher'}
            {session.timing.minutes_remaining != null ? ` · ${Math.max(0, Math.round(session.timing.minutes_remaining))} min left` : ''}
          </p>
        </div>
      ) : row.next_period ? (
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Up next · {formatSchoolTime(row.next_period.starts_at)}</p>
          <p className="truncate text-xl font-medium text-foreground">{subjectName(row.next_period.entry)}</p>
          <p className="text-sm text-muted-foreground">{periodTeacher(row.next_period)}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{row.periods_today.length === 0 ? 'Nothing on the timetable today.' : 'The last period of the day has finished.'}</p>
      )}

      <DayStrip row={row} now={now} />

      {/* ---------------------------------------------------------- facts */}
      <div className="grid grid-cols-3 divide-x divide-border border-y border-border">
        <div className="px-4 py-2.5 first:pl-0">
          <p className="text-xs text-muted-foreground">In the room now</p>
          <p className={cn('text-lg font-medium tabular-nums', row.students_in_now.length > 0 ? 'text-success' : 'text-foreground')}>{row.students_in_now.length}</p>
        </div>
        <div className="px-4 py-2.5">
          <p className="text-xs text-muted-foreground">Joined today</p>
          <p className="text-lg font-medium tabular-nums text-foreground">
            {row.students_joined_today}
            <span className="text-xs font-normal text-muted-foreground"> / {row.enrolled_count} · {share}%</span>
          </p>
        </div>
        <div className="min-w-0 px-4 py-2.5">
          <p className="text-xs text-muted-foreground">Last activity</p>
          <p className="truncate text-sm text-foreground" title={row.last_event ? formatDateTime(row.last_event.at) : undefined}>
            {row.last_event ? `${formatRelative(row.last_event.at)} · ${row.last_event.user_name ? tidy(row.last_event.user_name) : 'System'}` : 'None today'}
          </p>
        </div>
      </div>

      {/* ----------------------------------------------------------- tabs */}
      <div role="tablist" aria-label={row.class_name} className="flex items-stretch gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'relative inline-flex h-9 shrink-0 items-center px-3 text-sm transition-colors',
              tab === t.key ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {tab === t.key && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" aria-hidden />}
          </button>
        ))}
      </div>

      {tab === 'periods' && <PeriodsTable row={row} now={now} />}
      {tab === 'log' && <RoomLog classId={row.class_id} />}
      {tab === 'attendance' && <AttendanceTable row={row} />}
    </div>
  )
}

// ==================================================================== page

export default function AdminLiveClassesPage() {
  const board = useLiveBoard()
  const [filter, setFilter] = React.useState<Filter>('LIVE')
  const [selectedId, setSelectedId] = React.useState<number | null>(null)

  const rows = React.useMemo(() => board.data ?? [], [board.data])
  const live = React.useMemo(() => rows.filter((r) => r.is_live), [rows])
  const today = React.useMemo(() => rows.filter((r) => r.periods_today.length > 0), [rows])
  // Classes where students are waiting for the teacher come first.
  const shown = React.useMemo(() => {
    const list = filter === 'LIVE' ? live : filter === 'TODAY' ? today : rows
    const rank = (r: LiveClassBoardRow) => (r.is_live ? (r.current_period && !r.teacher_present ? 0 : 1) : r.next_period ? 2 : 3)
    return [...list].sort((a, b) => rank(a) - rank(b) || a.class_name.localeCompare(b.class_name, undefined, { numeric: true }))
  }, [filter, live, today, rows])

  const waiting = live.filter((r) => r.current_period && !r.teacher_present).length
  const studentsInNow = rows.reduce((n, r) => n + r.students_in_now.length, 0)
  const joinedToday = rows.reduce((n, r) => n + r.students_joined_today, 0)
  const enrolled = rows.reduce((n, r) => n + r.enrolled_count, 0)
  const refreshedAt = parseApiDateTime(rows[0]?.now ?? null)

  // Land on whichever list has something in it.
  React.useEffect(() => {
    if (!board.data) return
    if (filter === 'LIVE' && live.length === 0) setFilter(today.length > 0 ? 'TODAY' : 'ALL')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.data])

  // The selection follows refreshes; with none, the first class in the list.
  const selected = shown.find((r) => r.class_id === selectedId) ?? shown[0] ?? null

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title="Live Class Monitor"
        description="Every class room right now. Refreshes every 30 seconds"
        icon={Radio}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw />} loading={board.isFetching && !board.isPending} onClick={() => board.refetch()}>
            Refresh
          </Button>
        }
        tabs={
          <TabStrip
            label="Which classes"
            idPrefix="live-tab"
            value={filter}
            onChange={(f) => {
              setFilter(f)
              setSelectedId(null)
            }}
            tabs={[
              { key: 'LIVE', label: 'In session', count: live.length, tone: 'success' },
              { key: 'TODAY', label: 'Classes today', count: today.length, tone: 'info' },
              { key: 'ALL', label: 'All classes', count: rows.length },
            ]}
            trailing={refreshedAt ? `As of ${formatSchoolTime(refreshedAt)}` : undefined}
          />
        }
      />

      <div className="!mt-0">
        <Figures>
          <Figure label="In session" value={board.data ? String(live.length) : '—'} context={`of ${countLabel(today.length, 'class', 'classes')} today`} tone="success" />
          <Figure label="Teacher not in" value={board.data ? String(waiting) : '—'} context="students waiting" alert={waiting > 0} tone="warning" />
          <Figure label="In rooms now" value={board.data ? String(studentsInNow) : '—'} context="students" tone="primary" />
          <Figure
            label="Joined today"
            value={board.data ? String(joinedToday) : '—'}
            context={enrolled ? `of ${enrolled} · ${Math.round((joinedToday / enrolled) * 100)}%` : undefined}
            tone="info"
          />
        </Figures>

        <Band className="border-b border-border">
          {board.isPending ? (
            <div className="grid gap-4 py-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
              <Skeleton className="h-72 w-full" />
              <Skeleton className="h-72 w-full" />
            </div>
          ) : board.isError ? (
            <div className="py-6">
              <ErrorState error={board.error} onRetry={() => board.refetch()} />
            </div>
          ) : shown.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-base font-medium text-foreground">
                {filter === 'LIVE' ? 'No class is in session right now' : filter === 'TODAY' ? 'No class has lessons today' : 'No classes yet'}
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {filter === 'LIVE'
                  ? 'A class appears here while one of its timetabled periods is running, or a scheduled session is live.'
                  : 'Timetabled periods decide which classes are on today. Set them up under Timetable.'}
              </p>
              {filter !== 'ALL' && rows.length > 0 && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setFilter('ALL')}>
                  Show every class
                </Button>
              )}
            </div>
          ) : (
            <div className="grid lg:h-[calc(100vh-20rem)] lg:min-h-[26rem] lg:grid-cols-[19rem_minmax(0,1fr)] lg:divide-x lg:divide-border">
              <div className="-mx-4 border-b border-border sm:-mx-6 lg:mx-0 lg:-ml-8 lg:min-h-0 lg:border-b-0">
                <ClassList rows={shown} value={selected?.class_id ?? null} onChange={setSelectedId} />
              </div>
              <section className="min-w-0 py-5 lg:min-h-0 lg:overflow-y-auto lg:pl-8 lg:pr-1">
                {selected && <ClassDetail key={selected.class_id} row={selected} />}
              </section>
            </div>
          )}
        </Band>

      </div>
    </div>
  )
}

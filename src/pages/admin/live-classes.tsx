import {
  Activity,
  Check,
  Copy,
  DoorOpen,
  ExternalLink,
  Hourglass,
  Link as LinkIcon,
  LogIn,
  LogOut,
  MonitorPlay,
  Play,
  Radio,
  RefreshCw,
  Square,
  UserCheck,
  UserRound,
  Users,
  Video,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import type {
  ClassRoomAttendanceOut,
  ClassRoomEventOut,
  LiveClassBoardRow,
  ScheduledPeriod,
} from '@/api/types'
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
import { formatDateTime, formatRelative, formatTime, parseApiDateTime } from '@/lib/datetime'
import { countLabel } from '@/lib/format'
import { useCopyToClipboard } from '@/lib/hooks'
import { subjectName } from '@/lib/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'

/**
 * The office's live board: every class room right now.
 *
 * What it can and cannot show is worth being clear about. Google Meet refuses
 * to be embedded in another page and offers no video feed, so there is no
 * picture of the class here — the "Preview window" button opens the Meet
 * itself in a compact pop-out beside this page, which is the closest thing.
 *
 * Two records of who was in. The LMS's own log: a join it handed a link for,
 * a leave the person pressed, a period a teacher opened — "in now" on a card
 * is whoever's last word today was a join. And Google Meet's: every
 * participant of every call in the room with their true join and leave
 * times, copied every few minutes once the school has authorised the Meet
 * read scope. The activity drawer shows both.
 */

type Filter = 'LIVE' | 'TODAY' | 'ALL'
type ActivityView = 'LOG' | 'ATTENDANCE'

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

function ActionIcon({ action }: { action: string }) {
  const cls = 'size-3.5'
  switch (action) {
    case 'JOINED_ROOM':
    case 'JOINED_SESSION':
      return <LogIn className={cls} />
    case 'LEFT_ROOM':
      return <LogOut className={cls} />
    case 'STARTED':
      return <Play className={cls} />
    case 'ENDED':
      return <Square className={cls} />
    case 'ROOM_CLEARED':
      return <DoorOpen className={cls} />
    default:
      return <LinkIcon className={cls} />
  }
}

function serverNow(row: LiveClassBoardRow): Date {
  return /[zZ]$|[+-]\d\d:\d\d$/.test(row.now) ? new Date(row.now) : new Date(`${row.now}Z`)
}

function minutesLeft(period: ScheduledPeriod, now: Date): number {
  return Math.max(0, Math.round((new Date(period.ends_at).getTime() - now.getTime()) / 60_000))
}

function periodTeacher(period: ScheduledPeriod): string {
  return period.entry.teacher?.full_name ?? 'Teacher to be confirmed'
}

/**
 * Opens the Meet in a compact pop-out window.
 *
 * The window is opened synchronously on the click — a window opened after an
 * await is what popup blockers exist to stop — and pointed at the link once
 * the join call has recorded it. Meet loads in a top-level window; it is
 * only an iframe it refuses.
 */
function usePreviewWindow() {
  const join = useJoinClassRoom()
  return (row: LiveClassBoardRow) => {
    const handle = window.open(
      '',
      `h7-room-${row.class_id}`,
      'popup=yes,width=980,height=640,menubar=no,toolbar=no,location=no,status=no',
    )
    join.mutate(row.class_id, {
      onSuccess: (result) => {
        if (result.room_link) {
          if (handle) handle.location.href = result.room_link
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

function LiveClassCard({
  row,
  onActivity,
}: {
  row: LiveClassBoardRow
  onActivity: (row: LiveClassBoardRow) => void
}) {
  const join = useJoinClassRoom()
  const openPreview = usePreviewWindow()
  const { copied, copy } = useCopyToClipboard()
  const now = serverNow(row)
  const current = row.current_period ?? null
  const liveSession = row.live_sessions.find((s) => s.timing.is_live) ?? row.live_sessions[0] ?? null

  const status = row.is_live
    ? { label: 'In session', tone: 'success' as const }
    : row.periods_today.length === 0
      ? { label: 'No classes today', tone: 'neutral' as const }
      : row.next_period
        ? { label: 'Break', tone: 'info' as const }
        : { label: 'Done for today', tone: 'neutral' as const }

  const share = row.enrolled_count > 0 ? (row.students_joined_today / row.enrolled_count) * 100 : 0

  const joinNow = () => {
    join.mutate(row.class_id, {
      onSuccess: (result) => {
        if (result.room_link) window.open(result.room_link, '_blank', 'noopener')
        else toast.warning('This class has no room link yet')
      },
      onError: (error) => {
        toast.error(error instanceof ApiError ? error.message : 'Could not open the room.')
      },
    })
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border bg-card',
        row.is_live ? 'border-success/40 shadow-glow' : 'border-border',
      )}
    >
      {/* The "monitor": what is happening in the room this minute. Dark so a
          wall of these reads at a glance from across the office. */}
      <div className="bg-slate-950 p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {row.is_live ? (
                <Badge tone="success" size="sm" dot>
                  Live
                </Badge>
              ) : (
                <Badge tone={status.tone} size="sm">
                  {status.label}
                </Badge>
              )}
              {!row.has_room && (
                <Badge tone={row.room_status === 'FAILED' ? 'danger' : 'warning'} size="sm">
                  {row.room_status === 'FAILED' ? 'Room failed' : 'No room yet'}
                </Badge>
              )}
            </div>
            <h3 className="mt-1.5 truncate text-lg font-semibold">{row.class_name}</h3>
          </div>
          <MonitorPlay className="size-5 shrink-0 text-white/40" />
        </div>

        <div className="mt-3 min-h-14">
          {current ? (
            <>
              <p className="text-xs uppercase tracking-wider text-white/50">Now teaching</p>
              <p className="mt-0.5 truncate text-xl font-bold">{subjectName(current.entry)}</p>
              <p className="truncate text-sm text-white/70">
                {periodTeacher(current)} · ends {formatTime(current.ends_at)} ·{' '}
                {minutesLeft(current, now)} min left
              </p>
            </>
          ) : liveSession ? (
            <>
              <p className="text-xs uppercase tracking-wider text-white/50">Live session</p>
              <p className="mt-0.5 truncate text-xl font-bold">
                {liveSession.title ?? liveSession.subject_name ?? 'Live class'}
              </p>
              <p className="truncate text-sm text-white/70">
                {liveSession.teacher_name ?? 'Teacher'}
                {liveSession.timing.minutes_remaining != null
                  ? ` · ${Math.max(0, Math.round(liveSession.timing.minutes_remaining))} min left`
                  : ''}
              </p>
            </>
          ) : row.next_period ? (
            <>
              <p className="text-xs uppercase tracking-wider text-white/50">Up next</p>
              <p className="mt-0.5 truncate text-xl font-bold">{subjectName(row.next_period.entry)}</p>
              <p className="truncate text-sm text-white/70">
                {periodTeacher(row.next_period)} · {formatTime(row.next_period.starts_at)}
              </p>
            </>
          ) : (
            <p className="text-sm text-white/60">
              {row.periods_today.length === 0
                ? 'Nothing on the timetable today.'
                : 'The last period of the day has finished.'}
            </p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant={row.is_live ? 'primary' : 'solid'} loading={join.isPending} onClick={joinNow}>
            <Video />
            Join
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-white/20 bg-white/5 text-white hover:bg-white/15"
            disabled={!row.has_room}
            onClick={() => openPreview(row)}
          >
            <MonitorPlay />
            Preview window
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-white/80 hover:bg-white/10 hover:text-white"
            onClick={() => onActivity(row)}
          >
            <Activity />
            Activity
          </Button>
          {row.room_link && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Copy the room link"
              onClick={() => void copy(row.room_link as string)}
            >
              {copied ? <Check className="text-success" /> : <Copy />}
            </Button>
          )}
        </div>
      </div>

      {/* Who is in, as far as the LMS saw: joins it handed out, leaves people pressed. */}
      <div className="space-y-3 p-4">
        <div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4 text-muted-foreground" />
              <span className={cn('font-medium', row.students_in_now.length > 0 && 'text-success')}>
                {row.students_in_now.length} in now
              </span>
              <span className="text-muted-foreground">
                · {row.students_joined_today} of {countLabel(row.enrolled_count, 'student')} joined today
              </span>
            </span>
            <span className="text-xs text-muted-foreground">{Math.round(share)}%</span>
          </div>
          <ProgressBar value={share} size="sm" className="mt-1.5" />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <UserRound className="size-4 text-muted-foreground" />
            {row.teachers_in_now.length > 0 ? (
              <span className="text-success">In now: {row.teachers_in_now.join(', ')}</span>
            ) : current ? (
              row.teacher_present ? (
                <span className="text-success">
                  Teacher is in
                  {current.waiting_minutes != null && current.waiting_minutes >= 1
                    ? ` · students waited ${formatMinutes(current.waiting_minutes)}`
                    : ''}
                </span>
              ) : (
                <span className="text-warning">
                  Teacher not in yet
                  {current.waiting_minutes != null
                    ? ` · students waiting ${formatMinutes(current.waiting_minutes)}`
                    : ''}
                </span>
              )
            ) : row.teachers_joined_today.length > 0 ? (
              <span className="text-muted-foreground">
                Taught today by {row.teachers_joined_today.join(', ')}
              </span>
            ) : (
              <span className="text-muted-foreground">No teacher in yet today</span>
            )}
          </span>
        </div>

        {row.last_event ? (
          <p className="text-xs text-muted-foreground">
            Last: {row.last_event.user_name ?? 'System'}{' '}
            {ACTION_LABEL[row.last_event.action] ?? row.last_event.action.toLowerCase()}{' '}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="underline decoration-dotted">{formatRelative(row.last_event.at)}</span>
              </TooltipTrigger>
              <TooltipContent>{formatDateTime(row.last_event.at)}</TooltipContent>
            </Tooltip>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">No activity recorded today.</p>
        )}

        {row.periods_today.length > 0 && (
          <ol className="flex flex-wrap gap-1.5 border-t border-border pt-3">
            {row.periods_today.map((period) => {
              const isNow = period.entry.id === current?.entry.id
              const past = new Date(period.ends_at) <= now
              // Per subject: when the teacher came in, and how long the
              // students sat waiting for them.
              const arrival = arrivalText(period)
              return (
                <li
                  key={period.entry.id}
                  className={cn(
                    'rounded-md border px-2 py-1 text-xs',
                    isNow
                      ? 'border-success/40 bg-success/10 text-foreground'
                      : past
                        ? 'border-border text-muted-foreground/70'
                        : 'border-border text-muted-foreground',
                    arrival?.tone === 'danger' && 'border-danger/40',
                    arrival?.tone === 'warning' && 'border-warning/50',
                  )}
                  title={`${subjectName(period.entry)} · ${periodTeacher(period)}${arrival ? ` · ${arrival.text}` : ''}`}
                >
                  <span className={cn(past && !isNow && 'line-through')}>
                    {formatTime(period.starts_at)} {subjectName(period.entry)}
                  </span>
                  {arrival && (
                    <span className={cn('block text-[10px] leading-tight', ARRIVAL_TONE[arrival.tone])}>
                      {arrival.text}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}

function attendanceWho(entry: ClassRoomAttendanceOut): string {
  if (entry.matched_role) {
    return ROLE_LABEL[entry.matched_role as keyof typeof ROLE_LABEL] ?? entry.matched_role
  }
  if (entry.user_kind === 'ANONYMOUS') return 'guest, not signed in'
  if (entry.user_kind === 'PHONE') return 'dialled in'
  return 'not matched to an account'
}

/**
 * Google Meet's own record for the room today: each participant with their
 * join and leave times. The one place the office can see who really sat
 * through the day rather than who took a link.
 */
function AttendanceList({ row }: { row: LiveClassBoardRow }) {
  const attendance = useClassRoomAttendance(row.class_id)
  const sync = useSyncClassRoomAttendance()
  const rows = attendance.data ?? []
  const inNow = rows.filter((r) => r.still_in).length

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm">
        <div className="min-w-0">
          <p className="font-medium">From Google Meet</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {row.room_attendance_synced_at
              ? `Last checked ${formatRelative(row.room_attendance_synced_at)}; refreshed every few minutes.`
              : 'Not checked yet.'}{' '}
            Meet names people by display name, so a row is matched to an account by name when it can be.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          loading={sync.isPending}
          onClick={() => sync.mutate({ classId: row.class_id })}
        >
          <RefreshCw />
          Ask Meet now
        </Button>
      </div>

      {row.room_attendance_error && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-xs">
          <p className="font-medium text-warning">Meet is not sharing attendance yet</p>
          <p className="mt-1 text-muted-foreground">{row.room_attendance_error}</p>
        </div>
      )}

      {attendance.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : attendance.isError ? (
        <ErrorState error={attendance.error} onRetry={() => attendance.refetch()} compact />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<UserCheck />}
          title="Nobody on Meet's record yet"
          description="Meet reports who was in a call a few minutes after they join. The LMS log shows what it handed out in the meantime."
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {countLabel(rows.length, 'participant')} today
            {inNow > 0 ? ` · ${inNow} in the call right now` : ''}
          </p>
          <ol className="space-y-1.5">
            {rows.map((entry, index) => (
              <li
                key={entry.id ?? `${entry.participant ?? entry.display_name}-${index}`}
                className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
                    entry.still_in ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <UserRound className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p>
                    <span className="font-medium">
                      {entry.matched_user_name ?? entry.display_name ?? 'Participant'}
                    </span>
                    <span className="text-xs text-muted-foreground"> · {attendanceWho(entry)}</span>
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    Joined {entry.first_joined_at ? formatTime(entry.first_joined_at) : '—'}
                    {' · '}
                    {entry.still_in ? (
                      <span className="font-medium text-success">still in</span>
                    ) : (
                      `left ${entry.last_left_at ? formatTime(entry.last_left_at) : '—'}`
                    )}
                    {' · '}
                    {Math.round(entry.minutes)} min
                    {entry.sessions.length > 1 ? ` · in and out ${entry.sessions.length} times` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}

function ActivitySheet({ row, onClose }: { row: LiveClassBoardRow | null; onClose: () => void }) {
  const [todayOnly, setTodayOnly] = React.useState(true)
  const [view, setView] = React.useState<ActivityView>('LOG')
  const events = useClassRoomEvents(row?.class_id ?? null, todayOnly, !!row && view === 'LOG')

  React.useEffect(() => {
    setTodayOnly(true)
    setView('LOG')
  }, [row?.class_id])

  return (
    <Sheet open={!!row} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold">
            {row?.class_name} · room activity
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            The LMS log is what this app saw: joins it handed a link for, leaves people pressed,
            periods opened and closed. Attendance is Google Meet's own record of who was in the
            call, and when.
          </p>
        </SheetHeader>
        <SheetBody className="space-y-4">
          <Segmented
            layoutId="live-activity-view"
            size="sm"
            value={view}
            onChange={setView}
            aria-label="Which record to show"
            options={[
              { value: 'LOG', label: 'LMS log' },
              { value: 'ATTENDANCE', label: 'Attendance (Meet)' },
            ]}
          />

          {row && view === 'ATTENDANCE' && <AttendanceList row={row} />}

          {view === 'LOG' && (
          <label className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3 text-sm">
            <span className="font-medium">Today only</span>
            <Switch checked={todayOnly} onCheckedChange={setTodayOnly} />
          </label>
          )}

          {view !== 'LOG' ? null : events.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : events.isError ? (
            <ErrorState error={events.error} onRetry={() => events.refetch()} compact />
          ) : (events.data ?? []).length === 0 ? (
            <EmptyState
              icon={<Activity />}
              title={todayOnly ? 'Nothing recorded today' : 'Nothing recorded yet'}
              description="Joins, opened periods and room changes appear here as they happen."
            />
          ) : (
            <ol className="space-y-1.5">
              {(events.data ?? []).map((event: ClassRoomEventOut, index) => (
                <li
                  key={event.id ?? `${event.at}-${index}`}
                  className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span
                    className={cn(
                      'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
                      event.role === 'STUDENT'
                        ? 'bg-accent/12 text-accent'
                        : event.action.startsWith('ROOM_')
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-primary/12 text-primary',
                    )}
                  >
                    <ActionIcon action={event.action} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="font-medium">{event.user_name ?? 'System'}</span>
                      {event.role && (
                        <span className="text-xs text-muted-foreground">
                          {' '}
                          · {ROLE_LABEL[event.role as keyof typeof ROLE_LABEL] ?? event.role}
                        </span>
                      )}{' '}
                      <span className="text-muted-foreground">
                        {ACTION_LABEL[event.action] ?? event.action.toLowerCase()}
                      </span>
                      {event.detail && <span className="text-muted-foreground"> · {event.detail}</span>}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {todayOnly ? formatTime(event.at) : formatDateTime(event.at)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{formatDateTime(event.at)}</TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ol>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

export default function AdminLiveClassesPage() {
  const board = useLiveBoard()
  const [filter, setFilter] = React.useState<Filter>('LIVE')
  const [activityFor, setActivityFor] = React.useState<LiveClassBoardRow | null>(null)

  const rows = React.useMemo(() => board.data ?? [], [board.data])
  const live = React.useMemo(() => rows.filter((r) => r.is_live), [rows])
  const today = React.useMemo(() => rows.filter((r) => r.periods_today.length > 0), [rows])
  const shown = filter === 'LIVE' ? live : filter === 'TODAY' ? today : rows
  const studentsIn = rows.reduce((n, r) => n + r.students_joined_today, 0)
  const studentsInNow = rows.reduce((n, r) => n + r.students_in_now.length, 0)
  const roomsReady = rows.filter((r) => r.has_room).length

  // Keep the activity drawer on the live row, so it follows refreshes.
  const activityRow = activityFor
    ? (rows.find((r) => r.class_id === activityFor.class_id) ?? activityFor)
    : null

  // Land on whichever list has something in it.
  React.useEffect(() => {
    if (!board.data) return
    if (filter === 'LIVE' && live.length === 0) setFilter(today.length > 0 ? 'TODAY' : 'ALL')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.data])

  const refreshedAt = parseApiDateTime(rows[0]?.now ?? null)

  return (
    <>
      <PageHeader
        title="Live Classes"
        description="Every class room right now: who is teaching, how long is left, who has come in. Join a room, or open it in a preview window beside this page. Refreshes every 30 seconds."
        actions={
          <Button
            variant="outline"
            icon={<RefreshCw />}
            loading={board.isFetching && !board.isPending}
            onClick={() => board.refetch()}
          >
            Refresh
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={live.length > 0 ? 'success' : 'neutral'}>
            <Radio />
            {live.length} in session
          </Badge>
          <Badge tone={studentsInNow > 0 ? 'success' : 'accent'}>
            <Users />
            {studentsInNow} in rooms now · {countLabel(studentsIn, 'student')} joined today
          </Badge>
          <Badge tone="neutral">
            {roomsReady} of {countLabel(rows.length, 'room')} ready
          </Badge>
          {refreshedAt && (
            <span className="text-xs text-muted-foreground">
              as of {formatTime(refreshedAt)}
            </span>
          )}
        </div>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          layoutId="live-classes-filter"
          size="sm"
          value={filter}
          onChange={setFilter}
          aria-label="Which classes to show"
          options={[
            { value: 'LIVE', label: `In session (${live.length})` },
            { value: 'TODAY', label: `Classes today (${today.length})` },
            { value: 'ALL', label: `All (${rows.length})` },
          ]}
        />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Hourglass className="size-3.5" />
          Rooms are managed under{' '}
          <Link to="/admin/classes" className="font-medium text-primary hover:underline">
            Classes
          </Link>
          ; sessions under{' '}
          <Link to="/admin/meetings" className="font-medium text-primary hover:underline">
            Meetings
          </Link>
          .
        </p>
      </div>

      {board.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : board.isError ? (
        <ErrorState error={board.error} onRetry={() => board.refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Video />}
          title={
            filter === 'LIVE'
              ? 'No class is in session right now'
              : filter === 'TODAY'
                ? 'No class has lessons today'
                : 'No classes yet'
          }
          description={
            filter === 'LIVE'
              ? 'A class appears here while one of its timetabled periods is running, or a scheduled session is live.'
              : 'Timetabled periods decide which classes are on today. Set them up under Timetable.'
          }
          action={
            filter !== 'ALL' && rows.length > 0 ? (
              <Button variant="outline" onClick={() => setFilter('ALL')}>
                Show every class
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {shown.map((row) => (
            <LiveClassCard key={row.class_id} row={row} onActivity={setActivityFor} />
          ))}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <ExternalLink className="mr-1.5 inline size-3.5" />
        Google Meet cannot be shown inside this page; the preview window is the live Meet
        itself, opened beside it. "In now" counts are the LMS's own record — a join it handed
        out, a leave the person pressed. Meet's true join and leave times for everyone in a
        room are under Activity → Attendance.
      </div>

      <ActivitySheet row={activityRow} onClose={() => setActivityFor(null)} />
    </>
  )
}

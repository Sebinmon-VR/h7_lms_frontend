import {
  Check,
  Copy,
  DoorOpen,
  ExternalLink,
  Hourglass,
  LogOut,
  Radio,
  Users,
  Video,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import type { ClassRoomAccessOut, ScheduledPeriod } from '@/api/types'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/providers/auth-provider'
import {
  useClassRoomAccess,
  useJoinClassRoom,
  useLeaveClassRoom,
  useRoomPresence,
} from '@/queries/classes.queries'
import { cn } from '@/lib/cn'
import { formatTime } from '@/lib/datetime'
import { useCopyToClipboard } from '@/lib/hooks'
import { subjectName } from '@/lib/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * The class room: ONE standing Google Meet link per class.
 *
 * A student joins it ONCE, when the day's first class starts, sits through the
 * breaks and leaves after the last; each subject teacher joins the same room
 * when their period comes round. So the join button here belongs to the
 * CLASS, not to a session — it is bound to `access.may_join`, which the
 * server derives from today's timetable and any live session, and the link is
 * fetched through `POST /classes/rooms/{id}/join` rather than held in the
 * list, so a bookmarked link cannot get anybody in early.
 *
 * Joining is recorded by that call. Leaving cannot be seen — a closed Meet
 * tab tells nobody — so it is recorded by the person pressing Leave. Google's
 * own record of who was in the call, and when, is what the office sees on the
 * live board once Meet shares it.
 */

/** A timetable entry may have no teacher mapped yet; say so rather than invent one. */
function teacherName(entry: ScheduledPeriod['entry']): string {
  return entry.teacher?.full_name ?? 'Teacher to be confirmed'
}

/**
 * The server stamps `now` in the school's zone with an offset; a bare value
 * would be one of this codebase's naive-UTC strings.
 */
function serverNow(access: ClassRoomAccessOut): Date {
  return /[zZ]$|[+-]\d\d:\d\d$/.test(access.now)
    ? new Date(access.now)
    : new Date(`${access.now}Z`)
}

export function minutesBetween(from: string | Date, to: Date): number {
  const start = from instanceof Date ? from : new Date(from)
  return Math.max(0, Math.round((to.getTime() - start.getTime()) / 60_000))
}

export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes)
  if (m < 1) return 'under a minute'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} h ${rest} min` : `${h} h`
}

export type ArrivalTone = 'success' | 'warning' | 'danger' | 'neutral'

export const ARRIVAL_TONE: Record<ArrivalTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-muted-foreground',
}

/**
 * How the period's teacher turned up, in words, from the server's stamps:
 * "in since 10:18 · students waited 3 min", "not in yet · students waiting
 * 4 min", "teacher did not join". Null for a period that has not started.
 */
export function arrivalText(period: ScheduledPeriod): { text: string; tone: ArrivalTone } | null {
  const waited = period.waiting_minutes ?? null
  const late = waited != null && waited >= 1
  switch (period.teacher_status) {
    case 'IN':
      return {
        text: `in since ${formatTime(period.teacher_joined_at ?? null)}${
          late ? ` · students waited ${formatMinutes(waited)}` : ' · on time'
        }`,
        tone: waited != null && waited >= 5 ? 'warning' : 'success',
      }
    case 'LEFT':
      return {
        text: `${formatTime(period.teacher_joined_at ?? null)} – ${formatTime(period.teacher_left_at ?? null)}${
          late ? ` · students waited ${formatMinutes(waited)}` : ''
        }`,
        tone: 'neutral',
      }
    case 'NOT_YET':
      return { text: `not in yet · students waiting ${formatMinutes(waited ?? 0)}`, tone: 'warning' }
    case 'ABSENT':
      return { text: 'teacher did not join', tone: 'danger' }
    default:
      return null
  }
}

function roomJoinState(access: ClassRoomAccessOut) {
  // A teacher's window is their own period; a student's is the day; an
  // admin's is always. The class teacher looks in on the whole day.
  const teacher = access.is_host && !access.is_admin && !access.leads_class
  if (access.may_join) {
    const live = teacher
      ? !!access.my_current_period || access.live_meeting_ids.length > 0
      : !!access.current_period || access.live_meeting_ids.length > 0
    const label = access.in_room ? 'Back to the class' : live ? 'Join the class' : 'Open the room'
    return { canJoin: true, label, live }
  }
  const opensAt = access.window_opens_at ?? access.day_opens_at ?? null
  const opensLater = opensAt != null && new Date(opensAt) > serverNow(access)
  const label =
    !access.has_room && !access.class_room_mode
      ? 'No room yet'
      : opensLater
        ? `Opens at ${formatTime(opensAt)}`
        : teacher
          ? access.periods_today.length === 0
            ? 'No class today'
            : 'Not your period'
          : access.has_room
            ? 'Closed for today'
            : 'Opens before class'
  return { canJoin: false, label, live: false }
}

/** Join button for one class's room. `access` may come from any of the room queries. */
export function JoinRoomButton({
  access,
  size = 'md',
  className,
}: {
  access: ClassRoomAccessOut
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const join = useJoinClassRoom()
  const state = roomJoinState(access)

  const open = () => {
    join.mutate(access.class_id, {
      onSuccess: (result) => {
        if (result.room_link) {
          window.open(result.room_link, '_blank', 'noopener')
        } else {
          toast.warning('This class has no room link yet', {
            description: 'Ask the office to set one up under Classes.',
          })
        }
      },
      onError: (error) => {
        toast.error(
          error instanceof ApiError ? error.message : 'The room is not open right now.',
        )
      },
    })
  }

  if (!state.canJoin) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button variant="outline" size={size} disabled className={className}>
              <DoorOpen />
              {state.label}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {access.join_blocked_reason ?? 'The room is not open for joining right now.'}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Button
      variant={state.live ? 'primary' : 'solid'}
      size={size}
      loading={join.isPending}
      onClick={open}
      className={cn(state.live && 'animate-pulse-ring', className)}
    >
      <Video />
      {state.label}
    </Button>
  )
}

/**
 * The other half of the record: the person saying they have left. Rendered
 * only while their last word today was a join, so it never shows to somebody
 * who has not been in.
 */
export function LeaveRoomButton({
  access,
  size = 'md',
  className,
}: {
  access: ClassRoomAccessOut
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const leave = useLeaveClassRoom()
  if (!access.in_room) return null
  return (
    <Button
      variant="outline"
      size={size}
      loading={leave.isPending}
      onClick={() => leave.mutate(access.class_id)}
      className={className}
    >
      <LogOut />
      Leave the class
    </Button>
  )
}

/** "You joined at 9:02" — this person's own record for today, if there is one. */
export function PresenceNote({
  access,
  className,
}: {
  access: ClassRoomAccessOut
  className?: string
}) {
  if (!access.my_last_at) return null
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      {access.in_room ? (
        <>
          <span className="font-medium text-success">You joined at {formatTime(access.my_last_at)}.</span>{' '}
          Press Leave when you are done, so your leaving time is recorded too.
        </>
      ) : (
        <>You left at {formatTime(access.my_last_at)}.</>
      )}
    </p>
  )
}

/** Join button that fetches its own access, for a place that only knows the class id. */
export function JoinRoomButtonFor({
  classId,
  size = 'md',
  enabled = true,
}: {
  classId: number
  size?: 'sm' | 'md' | 'lg'
  enabled?: boolean
}) {
  const access = useClassRoomAccess(classId, enabled)
  if (access.isPending) return <Skeleton className="h-9 w-32 rounded-lg" />
  if (!access.data) return null
  return <JoinRoomButton access={access.data} size={size} />
}

/**
 * Who is in the room right now, by name. For a teacher's panel and the
 * office; polled while shown. The students in come first, in green.
 */
export function RoomPresenceList({
  classId,
  compact = false,
  className,
}: {
  classId: number
  compact?: boolean
  className?: string
}) {
  const presence = useRoomPresence(classId)
  const [expanded, setExpanded] = React.useState(false)

  if (presence.isPending) return <Skeleton className={cn('h-12 rounded-xl', className)} />
  if (!presence.data) return null

  const { students, in_count, enrolled_count, teachers_in } = presence.data
  const inRoom = students.filter((s) => s.in_room)
  const out = students.filter((s) => !s.in_room)
  const limit = compact ? 8 : 16
  const shown = expanded ? students : inRoom.slice(0, limit)
  const hidden = students.length - shown.length

  return (
    <div className={cn('rounded-xl border border-border bg-surface/50 p-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Users className="size-4 text-muted-foreground" />
          <span className={cn(in_count > 0 && 'text-success')}>{in_count}</span>
          <span className="text-muted-foreground">of {enrolled_count} students in the room</span>
        </span>
        {teachers_in.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Teachers in: {teachers_in.map((t) => t.name).join(', ')}
          </span>
        )}
      </div>

      {students.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">No students are enrolled in this class.</p>
      ) : shown.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">Nobody has joined yet.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {shown.map((s) => (
            <li
              key={s.user_id}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs',
                s.in_room ? 'border-success/40 bg-success/10 text-foreground' : 'border-border text-muted-foreground',
              )}
              title={
                s.last_at
                  ? `${s.in_room ? 'Joined' : s.last_action === 'LEFT_ROOM' ? 'Left' : 'Last seen'} at ${formatTime(s.last_at)}`
                  : 'Has not joined today'
              }
            >
              <span className={cn('size-1.5 rounded-full', s.in_room ? 'bg-success' : 'bg-muted-foreground/40')} />
              {s.name}
              {s.last_at && (
                <span className="tabular-nums text-muted-foreground">{formatTime(s.last_at)}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {students.length > 0 && (hidden > 0 || expanded) && (
        <button
          type="button"
          className="mt-2 text-xs font-medium text-primary hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? 'Show only those in'
            : `Show all ${students.length}${out.length > 0 ? ` (${out.length} not in)` : ''}`}
        </button>
      )}
    </div>
  )
}

function PeriodRow({
  period,
  mine,
  now,
  showArrival = false,
}: {
  period: ScheduledPeriod
  mine: boolean
  now: Date
  showArrival?: boolean
}) {
  const starts = new Date(period.starts_at)
  const ends = new Date(period.ends_at)
  const isCurrent = period.is_current || (starts <= now && now < ends)
  const isPast = ends <= now
  const arrival = showArrival ? arrivalText(period) : null
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm',
        isCurrent && 'bg-success/10',
        isPast && 'opacity-60',
      )}
    >
      <span className="w-24 shrink-0 tabular-nums text-xs text-muted-foreground">
        {formatTime(period.starts_at)} – {formatTime(period.ends_at)}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className={cn('font-medium', mine && 'text-primary')}>
          {subjectName(period.entry)}
        </span>
        <span className="text-muted-foreground"> · {teacherName(period.entry)}</span>
      </span>
      {arrival && (
        <span className={cn('hidden max-w-[45%] truncate text-xs sm:inline', ARRIVAL_TONE[arrival.tone])} title={arrival.text}>
          {arrival.text}
        </span>
      )}
      {isCurrent && (
        <Badge tone="success" size="sm" dot>
          Now
        </Badge>
      )}
      {mine && !isCurrent && !isPast && (
        <Badge tone="primary" size="sm">
          Yours
        </Badge>
      )}
    </li>
  )
}

/**
 * One class's room as a card: status, the join button, and today's periods.
 *
 * `variant` only changes the wording — a student is told to stay in the room,
 * a teacher which periods are theirs and that they rejoin for each.
 */
export function ClassRoomPanel({
  access,
  variant,
  className,
  compact = false,
}: {
  access: ClassRoomAccessOut
  variant: 'student' | 'teacher'
  className?: string
  compact?: boolean
}) {
  const { user } = useAuth()
  const { copied, copy } = useCopyToClipboard()
  const now = serverNow(access)
  const mine = (period: ScheduledPeriod) =>
    variant === 'teacher' && user != null && period.entry.teacher_id === user.id

  const myPeriods = access.periods_today.filter(mine)
  const nextOfMine = myPeriods.find((p) => new Date(p.ends_at) > now) ?? null
  const live = !!access.current_period || access.live_meeting_ids.length > 0

  return (
    <div
      className={cn(
        'rounded-2xl border bg-card p-5',
        live ? 'border-success/40 shadow-glow' : 'border-border',
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {variant === 'student' ? 'Your classroom' : 'Class room'}
            </p>
            {live && (
              <Badge tone="success" size="sm">
                <Radio />
                In session
              </Badge>
            )}
            {!access.has_room && access.room_status !== 'FAILED' && access.class_room_mode && (
              <Badge tone="neutral" size="sm">
                Created before the first class
              </Badge>
            )}
            {!access.has_room && access.room_status === 'FAILED' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Badge tone="danger" size="sm">
                      Room not created
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{access.room_error ?? 'Google Meet refused to create it.'}</TooltipContent>
              </Tooltip>
            )}
            {access.room_provider === 'MANUAL' && (
              <Badge tone="neutral" size="sm">
                External link
              </Badge>
            )}
          </div>
          <h3 className="mt-1 text-lg font-semibold">{access.class_name}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {variant === 'student'
              ? access.day_opens_at && access.day_closes_at
                ? `One link for the whole day. Join when the first class starts, stay through the breaks, and press Leave after the last one ends at ${formatTime(access.day_closes_at)}. Your teachers come to you.`
                : 'One link for the whole day. Join it and stay — your teachers come to you for each period.'
              : myPeriods.length > 0
                ? `You have ${myPeriods.length} period${myPeriods.length === 1 ? '' : 's'} here today. Rejoin the same room for each one, and press Leave at the end of it.`
                : 'Every period of this class happens in the same room. You rejoin it at your period.'}
          </p>
          <PresenceNote access={access} className="mt-1.5" />

          {variant === 'teacher' && access.my_current_period && (() => {
            const own = access.my_current_period
            const started = new Date(own.starts_at) <= now
            const arrival = arrivalText(own)
            return (
              <p className="mt-2 text-sm">
                <span className="font-medium">Your period:</span> {subjectName(own.entry)} ·{' '}
                {started
                  ? `started ${formatTime(own.starts_at)} · ${formatMinutes(minutesBetween(own.starts_at, now))} in`
                  : `starts at ${formatTime(own.starts_at)}, in ${formatMinutes(minutesBetween(now, new Date(own.starts_at)))}`}{' '}
                · ends {formatTime(own.ends_at)}
                {arrival && (
                  <span className={cn('block text-xs', ARRIVAL_TONE[arrival.tone])}>{arrival.text}</span>
                )}
              </p>
            )
          })()}

          {access.current_period ? (
            <p className="mt-2 text-sm">
              <span className="font-medium">Now:</span> {subjectName(access.current_period.entry)} with{' '}
              {teacherName(access.current_period.entry)} until {formatTime(access.current_period.ends_at)}
            </p>
          ) : access.next_period ? (
            <p className="mt-2 text-sm text-muted-foreground">
              <Hourglass className="mr-1 inline size-3.5" />
              Next: {subjectName(access.next_period.entry)} at {formatTime(access.next_period.starts_at)}
              {variant === 'teacher' && nextOfMine && nextOfMine !== access.next_period
                ? ` · yours at ${formatTime(nextOfMine.starts_at)}`
                : ''}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No more periods today.</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <JoinRoomButton access={access} size={live ? 'lg' : 'md'} />
          <LeaveRoomButton access={access} size={live ? 'lg' : 'md'} />
          {access.room_link && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy the room link"
              onClick={() => void copy(access.room_link as string)}
            >
              {copied ? <Check className="text-success" /> : <Copy />}
            </Button>
          )}
          {access.room_link && variant === 'teacher' && (
            <Button asChild variant="ghost" size="icon-sm" aria-label="Open the link directly">
              <a href={access.room_link} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* The teacher standing in front of the class wants to know who is
          actually there; shown while their window is open or they are in. */}
      {variant === 'teacher' && !compact && (access.may_join || access.in_room) && (
        <RoomPresenceList classId={access.class_id} className="mt-4" />
      )}

      {!compact && access.periods_today.length > 0 && (
        <ul className="mt-4 space-y-0.5 border-t border-border pt-3">
          {access.periods_today.map((period) => (
            <PeriodRow
              key={period.entry.id}
              period={period}
              mine={mine(period)}
              now={now}
              showArrival={variant === 'teacher'}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

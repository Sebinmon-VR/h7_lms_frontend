import { Hourglass, Play, Square, Video } from 'lucide-react'
import { toast } from 'sonner'

import type { ClassTimingOut } from '@/api/types'
import { ApiError } from '@/api/errors'
import { useClassTiming, useEndClass, useJoinClass, useStartClass } from '@/queries/classes.queries'
import { joinState } from '@/lib/school'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * The class clock, as a control.
 *
 * This exists because deriving "can I join yet?" on the client is the bug the
 * backend's timing endpoint was added to remove. A link rendered straight from
 * `meeting.meeting_link` lets a student walk into a room before it opens, and
 * a phase computed from `scheduled_time` disagrees with the server the moment
 * a teacher starts late or a grace period applies.
 *
 * So: the button is bound to `timing.may_join` and NOTHING else, the link is
 * fetched from `POST /classes/{id}/join` rather than held in the list, and the
 * refusal text is the server's own sentence.
 */

/** Minutes, as a person would say them. */
function minutesLabel(minutes: number): string {
  const whole = Math.max(Math.round(minutes), 0)
  if (whole < 1) return 'less than a minute'
  if (whole < 60) return `${whole} minute${whole === 1 ? '' : 's'}`
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

/**
 * The live countdown.
 *
 * `starts_in_minutes` and `minutes_remaining` were computed when the response
 * was built, so a cached copy keeps saying "in 12 minutes" long after it has
 * become five. `useClassTiming` refetches on an interval; this only renders
 * what the last response said, and never counts down locally — a local clock
 * and the server's would drift apart exactly when it matters.
 */
export function ClassCountdown({ timing }: { timing: ClassTimingOut }) {
  if (timing.is_closed || timing.is_expired) {
    return (
      <Badge tone="neutral" size="sm">
        Ended
      </Badge>
    )
  }

  if (timing.is_live) {
    return (
      <Badge tone="success" size="sm" dot>
        {timing.minutes_remaining != null
          ? `${minutesLabel(timing.minutes_remaining)} left`
          : 'Live now'}
      </Badge>
    )
  }

  // A student here is WAITING, not late. The wording matters: with
  // `auto_start_class` off, the class simply has not been opened yet.
  if (timing.waiting_for_teacher) {
    return (
      <Badge tone="info" size="sm">
        <Hourglass />
        Waiting for the teacher
      </Badge>
    )
  }

  if (timing.starts_in_minutes != null && timing.starts_in_minutes > 0) {
    return (
      <Badge tone="neutral" size="sm">
        Starts in {minutesLabel(timing.starts_in_minutes)}
      </Badge>
    )
  }

  return null
}

/**
 * The join button.
 *
 * `enabled` gates the polling, not the permission — pass false for a class
 * that has obviously finished so a long list does not open one request per
 * row per interval.
 */
export function JoinClassButton({
  meetingId,
  size = 'sm',
  enabled = true,
}: {
  meetingId: number
  size?: 'sm' | 'md' | 'lg'
  enabled?: boolean
}) {
  const timing = useClassTiming(meetingId, enabled)
  const join = useJoinClass()

  if (timing.isPending) return <Skeleton className="h-8 w-24 rounded-lg" />

  // A timing call that fails should not hide the class. Say nothing rather
  // than render a button whose state we cannot vouch for.
  if (!timing.data) return null

  const state = joinState(timing.data)

  const open = () => {
    join.mutate(meetingId, {
      onSuccess: (result) => {
        if (result.meeting_link) {
          window.open(result.meeting_link, '_blank', 'noopener')
        } else {
          // A class with no Meet link is a real, non-error state: generation
          // is best-effort and the schedule is saved either way.
          toast.warning('This class has no meeting link yet', {
            description: 'Your teacher has not attached one. Check back shortly.',
          })
        }
      },
      onError: (error) => {
        // 409 is the expected outcome of pressing a button that went stale
        // between renders — the window closed, or the class ended. Refetch and
        // show the server's reason rather than reporting a crash.
        void timing.refetch()
        const message =
          error instanceof ApiError ? error.message : 'That class is not open right now.'
        toast.error(message)
      },
    })
  }

  if (!state.canJoin) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button variant="outline" size={size} disabled>
              <Video />
              {state.label}
            </Button>
          </span>
        </TooltipTrigger>
        {/* Verbatim, because it distinguishes "opens at 09:55" from "waiting
            for the teacher" from "this class has ended" — which the flags
            alone cannot. */}
        <TooltipContent>
          {state.reason ?? 'This class is not open for joining yet.'}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Button size={size} loading={join.isPending} onClick={open}>
      <Video />
      {state.label}
    </Button>
  )
}

/**
 * The teacher's own control: open the class, then close it.
 *
 * Hidden entirely when `auto_start_class` is on — the class opens on its
 * timetabled slot with no teacher action, and a Start button that does nothing
 * is worse than none.
 */
export function TeacherClassControls({
  meetingId,
  enabled = true,
}: {
  meetingId: number
  enabled?: boolean
}) {
  const timing = useClassTiming(meetingId, enabled)
  const start = useStartClass()
  const end = useEndClass()

  if (timing.isPending || !timing.data) return null
  const t = timing.data

  if (t.is_closed || t.is_expired) {
    return (
      <Badge tone="neutral" size="sm">
        Ended
      </Badge>
    )
  }

  if (t.class_has_started) {
    return (
      <div className="flex items-center gap-2">
        <ClassCountdown timing={t} />
        <Button
          variant="outline"
          size="sm"
          loading={end.isPending}
          onClick={() => end.mutate(meetingId)}
        >
          <Square />
          End class
        </Button>
      </div>
    )
  }

  if (t.auto_start) {
    return (
      <div className="flex items-center gap-2">
        <ClassCountdown timing={t} />
        <Badge tone="info" size="sm">
          Opens automatically
        </Badge>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <ClassCountdown timing={t} />
      <Button size="sm" loading={start.isPending} onClick={() => start.mutate(meetingId)}>
        <Play />
        Open the class
      </Button>
    </div>
  )
}

/** Countdown only, for a row that already has its own action elsewhere. */
export function ClassTimingBadge({
  meetingId,
  enabled = true,
}: {
  meetingId: number
  enabled?: boolean
}) {
  const timing = useClassTiming(meetingId, enabled)
  if (!timing.data) return null
  return <ClassCountdown timing={timing.data} />
}

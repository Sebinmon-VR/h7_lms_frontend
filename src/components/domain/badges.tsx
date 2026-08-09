import {
  CalendarClock,
  CheckCircle2,
  CircleSlash,
  Clock,
  GraduationCap,
  Link as LinkIcon,
  Radio,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  XCircle,
} from 'lucide-react'

import type { AttendanceStatus, UserRole } from '@/api/types'
import { cn } from '@/lib/cn'
import { ATTENDANCE_LABEL, ROLE_LABEL } from '@/lib/constants'
import { humanize } from '@/lib/format'
import { Badge } from '@/components/ui/badge'

const ROLE_TONE = {
  ADMIN: 'primary',
  TEACHER: 'info',
  STUDENT: 'accent',
} as const

const ROLE_ICON = {
  ADMIN: ShieldCheck,
  TEACHER: GraduationCap,
  STUDENT: UserRound,
} as const

export function RoleBadge({ role, size = 'md' }: { role: UserRole; size?: 'sm' | 'md' }) {
  const Icon = ROLE_ICON[role]
  return (
    <Badge tone={ROLE_TONE[role]} size={size}>
      <Icon />
      {ROLE_LABEL[role]}
    </Badge>
  )
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? 'success' : 'neutral'} dot>
      {active ? 'Active' : 'Inactive'}
    </Badge>
  )
}

const STATUS_STYLE: Record<AttendanceStatus, { tone: 'success' | 'danger' | 'warning' | 'info'; Icon: typeof CheckCircle2 }> = {
  PRESENT: { tone: 'success', Icon: CheckCircle2 },
  ABSENT: { tone: 'danger', Icon: XCircle },
  LATE: { tone: 'warning', Icon: Clock },
  EXCUSED: { tone: 'info', Icon: CircleSlash },
}

/** Always icon + text, never colour alone — readable without colour vision. */
export function AttendanceStatusPill({
  status,
  size = 'md',
}: {
  status: AttendanceStatus
  size?: 'sm' | 'md'
}) {
  const { tone, Icon } = STATUS_STYLE[status]
  return (
    <Badge tone={tone} size={size}>
      <Icon />
      {ATTENDANCE_LABEL[status]}
    </Badge>
  )
}

/**
 * Meeting phase is computed from `scheduled_time`, not from the free-form
 * `status` string the backend stores — that field is never updated after
 * creation, so it cannot be trusted to say whether a meeting is over.
 */
export function MeetingPhaseBadge({ phase }: { phase: 'live' | 'upcoming' | 'past' }) {
  if (phase === 'live') {
    return (
      <Badge tone="danger" className="animate-pulse">
        <Radio />
        Live now
      </Badge>
    )
  }
  if (phase === 'upcoming') {
    return (
      <Badge tone="primary">
        <CalendarClock />
        Upcoming
      </Badge>
    )
  }
  return <Badge tone="neutral">Ended</Badge>
}

/**
 * Why a meeting does or does not have a Meet link.
 *
 * Only rendered when the link is genuinely missing or genuinely failed —
 * `CREATED` needs no badge (the join button says it), and `MANUAL` is the
 * ordinary case of someone pasting a Zoom URL. Records written before the
 * field existed report null, which is unknown rather than broken, so callers
 * fall back to their previous "No link" wording there.
 */
export function MeetStatusBadge({ status }: { status: string }) {
  if (status === 'FAILED') {
    return (
      <Badge tone="danger" size="sm">
        <TriangleAlert />
        Meet link failed
      </Badge>
    )
  }
  if (status === 'SKIPPED') {
    return (
      <Badge tone="neutral" size="sm">
        <CircleSlash />
        No link requested
      </Badge>
    )
  }
  if (status === 'MANUAL') {
    return (
      <Badge tone="neutral" size="sm">
        <LinkIcon />
        Manual link
      </Badge>
    )
  }
  return null
}

/** `material_type` and meeting `status` are free-form strings from the API. */
export function FreeformBadge({ value, className }: { value: string; className?: string }) {
  return (
    <Badge tone="outline" size="sm" className={cn('uppercase tracking-wide', className)}>
      {humanize(value)}
    </Badge>
  )
}

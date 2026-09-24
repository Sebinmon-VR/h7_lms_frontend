import {
  Ban,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  CircleSlash,
  Clock,
  Disc,
  Eye,
  EyeOff,
  Film,
  GraduationCap,
  Hourglass,
  Link as LinkIcon,
  LockKeyhole,
  Monitor,
  PenLine,
  PencilRuler,
  Radio,
  Send,
  ShieldCheck,
  Timer,
  TriangleAlert,
  UserRound,
  UserRoundCog,
  Users,
  VideoOff,
  XCircle,
} from 'lucide-react'

import type {
  AttendanceStatus,
  ExamMode,
  ExamStatus,
  ExamWindowState,
  RecordingStatus,
  SubmissionStatus,
  UserRole,
} from '@/api/types'
import { cn } from '@/lib/cn'
import { ATTENDANCE_LABEL, ROLE_LABEL } from '@/lib/constants'
import {
  EXAM_MODE_LABEL,
  EXAM_STATUS_LABEL,
  SUBMISSION_STATUS_LABEL,
  WINDOW_STATE_LABEL,
} from '@/lib/exams'
import { humanize } from '@/lib/format'
import { recordingLabel } from '@/lib/recordings'
import { Badge } from '@/components/ui/badge'

const ROLE_TONE = {
  ADMIN: 'primary',
  CLASS_TEACHER: 'warning',
  TEACHER: 'info',
  STUDENT: 'accent',
  // Deliberately the quiet one. A parent is a guest in the building: they
  // appear all over the family and notice screens, and a loud badge on every
  // row of them reads as a warning rather than as a fact.
  PARENT: 'neutral',
} as const

const ROLE_ICON = {
  ADMIN: ShieldCheck,
  CLASS_TEACHER: UserRoundCog,
  TEACHER: GraduationCap,
  STUDENT: UserRound,
  PARENT: Users,
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
  if (status === 'CLASS_ROOM') {
    return (
      <Badge tone="primary" size="sm">
        <Users />
        Class room
      </Badge>
    )
  }
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

const RECORDING_TONE: Record<
  RecordingStatus,
  { tone: 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'primary'; Icon: typeof CheckCircle2 }
> = {
  NOT_REQUESTED: { tone: 'neutral', Icon: VideoOff },
  ARMED: { tone: 'info', Icon: Disc },
  ARM_FAILED: { tone: 'warning', Icon: TriangleAlert },
  WAITING: { tone: 'warning', Icon: Hourglass },
  STORED: { tone: 'success', Icon: Film },
  UNAVAILABLE: { tone: 'neutral', Icon: CircleSlash },
  FAILED: { tone: 'danger', Icon: TriangleAlert },
}

/**
 * Where a session's recording has got to.
 *
 * Every stage here is a legitimate outcome — a class nobody joined is never
 * recorded, and a finished one takes minutes to publish — so the neutral tones
 * are as important as the red one. Null status means the row predates the
 * feature, which is unknown rather than broken: nothing is rendered.
 */
export function RecordingStatusBadge({
  status,
  size = 'sm',
}: {
  status: string | null | undefined
  size?: 'sm' | 'md'
}) {
  if (!status) return null
  const look = RECORDING_TONE[status as RecordingStatus]
  if (!look) return null
  const { tone, Icon } = look
  return (
    <Badge tone={tone} size={size}>
      <Icon />
      {recordingLabel(status)}
    </Badge>
  )
}

/** `material_type` and meeting `status` are free-form strings from the API. */
export function FreeformBadge({ value, className }: { value: string; className?: string }) {
  return (
    <Badge tone="outline" size="sm" className={cn('uppercase tracking-wide', className)}>
      {humanize(value)}
    </Badge>
  )
}

// ------------------------------------------------------------------ exams

const EXAM_STATUS_LOOK: Record<ExamStatus, { tone: 'neutral' | 'success' | 'danger'; Icon: typeof CheckCircle2 }> = {
  DRAFT: { tone: 'neutral', Icon: PencilRuler },
  PUBLISHED: { tone: 'success', Icon: Eye },
  CANCELLED: { tone: 'danger', Icon: Ban },
}

/** The lifecycle a teacher controls by hand — separate from the clock. */
export function ExamStatusBadge({ status, size = 'md' }: { status: ExamStatus; size?: 'sm' | 'md' }) {
  const { tone, Icon } = EXAM_STATUS_LOOK[status]
  return (
    <Badge tone={tone} size={size}>
      <Icon />
      {EXAM_STATUS_LABEL[status]}
    </Badge>
  )
}

const WINDOW_LOOK: Record<
  ExamWindowState,
  { tone: 'info' | 'success' | 'warning' | 'neutral'; Icon: typeof CheckCircle2; pulse?: boolean }
> = {
  NOT_OPEN: { tone: 'info', Icon: CalendarClock },
  OPEN: { tone: 'success', Icon: Radio, pulse: true },
  GRACE: { tone: 'warning', Icon: Hourglass },
  CLOSED: { tone: 'neutral', Icon: LockKeyhole },
}

/** Where the clock sits, as computed by the server for this viewer. */
export function ExamWindowBadge({ state, size = 'md' }: { state: ExamWindowState; size?: 'sm' | 'md' }) {
  const { tone, Icon, pulse } = WINDOW_LOOK[state]
  return (
    <Badge tone={tone} size={size} className={pulse ? 'animate-pulse' : undefined}>
      <Icon />
      {WINDOW_STATE_LABEL[state]}
    </Badge>
  )
}

export function ExamModeBadge({ mode, size = 'sm' }: { mode: ExamMode; size?: 'sm' | 'md' }) {
  return (
    <Badge tone="outline" size={size}>
      {mode === 'ONLINE' ? <Monitor /> : <PenLine />}
      {EXAM_MODE_LABEL[mode]}
    </Badge>
  )
}

const SUBMISSION_LOOK: Record<
  SubmissionStatus,
  { tone: 'info' | 'primary' | 'success' | 'danger'; Icon: typeof CheckCircle2 }
> = {
  IN_PROGRESS: { tone: 'info', Icon: Timer },
  SUBMITTED: { tone: 'primary', Icon: Send },
  EVALUATED: { tone: 'success', Icon: CheckCheck },
  MISSED: { tone: 'danger', Icon: XCircle },
}

/** Where one student's script has got to. */
export function SubmissionStatusBadge({
  status,
  size = 'md',
}: {
  status: SubmissionStatus | null | undefined
  size?: 'sm' | 'md'
}) {
  if (!status) {
    return (
      <Badge tone="neutral" size={size}>
        Not started
      </Badge>
    )
  }
  const { tone, Icon } = SUBMISSION_LOOK[status]
  return (
    <Badge tone={tone} size={size}>
      <Icon />
      {SUBMISSION_STATUS_LABEL[status]}
    </Badge>
  )
}

/** Whether the class can see their marks yet. */
export function ResultsBadge({ published, size = 'sm' }: { published: boolean; size?: 'sm' | 'md' }) {
  return published ? (
    <Badge tone="success" size={size}>
      <Eye />
      Results out
    </Badge>
  ) : (
    <Badge tone="neutral" size={size}>
      <EyeOff />
      Results hidden
    </Badge>
  )
}

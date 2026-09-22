import { AlertTriangle, CalendarClock, Clock, Globe, Hourglass, Radio, Video } from 'lucide-react'
import * as React from 'react'

import type {
  LibraryItemOut,
  TuitionAttendanceTotals,
  TuitionEnrollmentOut,
  TuitionSessionOut,
} from '@/api/types'
import { cn } from '@/lib/cn'
import { formatDateTime, formatRelative } from '@/lib/datetime'
import { formatPercent } from '@/lib/format'
import {
  APPROVAL_TONE,
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_TONE,
  SESSION_STATUS_LABEL,
  SESSION_STATUS_TONE,
  VISIBILITY_SHORT,
  attendanceRate,
  displayEnd,
  displayStart,
  hours,
  isLive,
  isWaitingForTeacher,
  remainingLabel,
  startedAutomatically,
  sessionAnomalies,
  sessionTitle,
} from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

/**
 * Shared pieces for the online tuition screens.
 *
 * The session card is the one that matters. A tuition class is a live thing
 * with a countdown the server owns, and every screen that lists classes — the
 * teacher's console, the student's home, the admin's monitor — has to say the
 * same thing about the same class. One component, three callers.
 */

export function SessionStatusBadge({
  session,
  size = 'sm',
}: {
  session: TuitionSessionOut
  size?: 'sm' | 'md'
}) {
  // Checked before "live": the class window is open but nobody has opened it,
  // and "Live now" would be a lie the student is sitting through.
  if (isWaitingForTeacher(session)) {
    return (
      <Badge tone="warning" size={size}>
        <Hourglass />
        Waiting for the tutor
      </Badge>
    )
  }

  if (isLive(session)) {
    return (
      <Badge tone="success" size={size} className="animate-pulse">
        <Radio />
        Live now
      </Badge>
    )
  }
  return (
    <Badge tone={SESSION_STATUS_TONE[session.status]} size={size}>
      {SESSION_STATUS_LABEL[session.status]}
    </Badge>
  )
}

export function EnrollmentStatusBadge({
  enrollment,
  size = 'sm',
}: {
  enrollment: TuitionEnrollmentOut
  size?: 'sm' | 'md'
}) {
  return (
    <Badge tone={ENROLLMENT_STATUS_TONE[enrollment.status]} size={size}>
      {ENROLLMENT_STATUS_LABEL[enrollment.status]}
    </Badge>
  )
}

/**
 * Names the zone the times on this page are in.
 *
 * Worth the line of chrome: a tuition student and their teacher are routinely
 * in different countries, the server renders every instant into the reader's
 * own zone, and a bare "17:00" with no zone attached is how people miss
 * classes. Shown only once a zone is actually known.
 */
export function TimezoneNote({
  timezone,
  className,
}: {
  timezone: string | null | undefined
  className?: string
}) {
  if (!timezone) return null
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <Globe className="size-3.5" />
      Times shown in {timezone}
    </span>
  )
}

/**
 * One class, as it appears in every list.
 *
 * `viewerIsTeacher` decides whose name is shown beside the subject — the
 * reader knows who they are and wants to see the other person.
 */
export function SessionCard({
  session,
  viewerIsTeacher,
  actions,
  onClick,
  className,
}: {
  session: TuitionSessionOut
  viewerIsTeacher: boolean
  actions?: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  const live = isLive(session)
  const countdown = remainingLabel(session)
  const anomalies = sessionAnomalies(session)
  const start = displayStart(session)
  const end = displayEnd(session)

  return (
    <Card
      interactive={!!onClick}
      onClick={onClick}
      className={cn('p-4', live && 'border-success/40 bg-success/[0.04]', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold">
              {sessionTitle(session, viewerIsTeacher)}
            </h3>
            <SessionStatusBadge session={session} />
            {session.is_ad_hoc && (
              <Badge tone="accent" size="sm">
                Extra class
              </Badge>
            )}
            {startedAutomatically(session) && (
              <Badge tone="warning" size="sm">
                Opened automatically
              </Badge>
            )}
            {/* Only ever shown as a negative claim: `is_billable` is null until
                somebody overrides it, and null means "as the package says". */}
            {session.is_billable === false && (
              <Badge tone="neutral" size="sm">
                Not billed
              </Badge>
            )}
          </div>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-3.5" />
              {formatDateTime(start)}
            </span>
            {end && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5" />
                until {formatDateTime(end, 'HH:mm')}
              </span>
            )}
            <span>{session.duration_minutes} min</span>
          </p>

          {countdown && (
            <p
              className={cn(
                'mt-1.5 text-xs font-medium',
                live ? 'text-success' : 'text-muted-foreground',
              )}
            >
              {countdown}
            </p>
          )}

          {session.topic && (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Covered:</span> {session.topic}
            </p>
          )}

          {session.cancellation_reason && (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Reason:</span>{' '}
              {session.cancellation_reason}
            </p>
          )}

          {anomalies.length > 0 && (
            <ul className="mt-2 space-y-1">
              {anomalies.map((note) => (
                <li key={note} className="flex items-start gap-1.5 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {note}
                </li>
              ))}
            </ul>
          )}

          {session.meet_error && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-danger">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Meeting link could not be created: {session.meet_error}
            </p>
          )}
        </div>

        {actions && (
          // Contained so a button inside never also triggers the row click.
          <div
            className="flex shrink-0 flex-wrap items-center gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            {actions}
          </div>
        )}
      </div>

      {session.attendance_status && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-xs">
          <span className="text-muted-foreground">Register:</span>
          <Badge
            tone={
              session.attendance_status === 'PRESENT'
                ? 'success'
                : session.attendance_status === 'LATE'
                  ? 'warning'
                  : session.attendance_status === 'EXCUSED'
                    ? 'info'
                    : 'danger'
            }
            size="sm"
          >
            {session.attendance_status}
          </Badge>
          {session.attendance_remarks && (
            <span className="text-muted-foreground">{session.attendance_remarks}</span>
          )}
        </div>
      )}

      {session.recording_url && (
        <a
          href={session.recording_url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <Video className="size-3.5" />
          Watch the recording
        </a>
      )}
    </Card>
  )
}

/**
 * The counts every tuition report is built from.
 *
 * Attendance is shown against CONDUCTED classes, never scheduled ones — a
 * student whose teacher missed two classes has 100% attendance, not 60%. The
 * caption says so, because the number is otherwise quietly surprising.
 */
export function AttendanceTotalsGrid({
  totals,
  className,
}: {
  totals: TuitionAttendanceTotals
  className?: string
}) {
  const rate = attendanceRate(totals)

  const cells: { label: string; value: React.ReactNode; tone?: string; hint?: string }[] = [
    {
      label: 'Attendance',
      value: rate == null ? '—' : formatPercent(rate, 0),
      tone: rate == null ? undefined : rate >= 85 ? 'text-success' : rate >= 70 ? 'text-warning' : 'text-danger',
      hint: 'Of classes actually conducted',
    },
    { label: 'Conducted', value: totals.conducted },
    { label: 'Attended', value: totals.attended, tone: 'text-success' },
    { label: 'Missed', value: totals.missed, tone: totals.missed ? 'text-danger' : undefined },
    { label: 'Late', value: totals.late, tone: totals.late ? 'text-warning' : undefined },
    {
      label: 'Teacher absent',
      value: totals.teacher_no_show,
      tone: totals.teacher_no_show ? 'text-danger' : undefined,
      hint: 'Not chargeable',
    },
    { label: 'Cancelled', value: totals.cancelled },
    { label: 'Upcoming', value: totals.upcoming },
    { label: 'Hours taught', value: hours(totals.taught_minutes) },
    { label: 'Billable classes', value: totals.billable_sessions, hint: 'What the invoice counts' },
  ]

  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5', className)}>
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-lg border border-border bg-surface px-3 py-2.5">
          <p className={cn('text-lg font-semibold tabular-nums', cell.tone)}>{cell.value}</p>
          <p className="text-xs text-muted-foreground">{cell.label}</p>
          {cell.hint && <p className="mt-0.5 text-2xs text-muted-foreground/80">{cell.hint}</p>}
        </div>
      ))}
    </div>
  )
}

/** Who a library item reaches, and whether anybody may see it yet. */
export function LibraryBadges({ item }: { item: LibraryItemOut }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone="outline" size="sm">
        {VISIBILITY_SHORT[item.visibility]}
      </Badge>
      {item.approval_status !== 'APPROVED' && (
        <Badge tone={APPROVAL_TONE[item.approval_status]} size="sm">
          {item.approval_status === 'PENDING' ? 'Awaiting approval' : 'Rejected'}
        </Badge>
      )}
      {item.storage_warning && (
        <Badge tone="warning" size="sm">
          <AlertTriangle />
          Stored locally
        </Badge>
      )}
    </div>
  )
}

/** One arrangement, as a summary line. Used by the two "my people" screens. */
export function EnrollmentSummary({
  enrollment,
  viewerIsTeacher,
  actions,
}: {
  enrollment: TuitionEnrollmentOut
  viewerIsTeacher: boolean
  actions?: React.ReactNode
}) {
  const other = viewerIsTeacher ? enrollment.student : enrollment.teacher

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold">
              {enrollment.subject?.name ?? `Subject ${enrollment.subject_id}`}
            </h3>
            <EnrollmentStatusBadge enrollment={enrollment} />
            {enrollment.grade_level && (
              <Badge tone="outline" size="sm">
                {enrollment.grade_level}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {viewerIsTeacher ? 'Student' : 'Tutor'}: {other?.full_name ?? '—'}
          </p>
          {enrollment.goals && (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Goal:</span> {enrollment.goals}
            </p>
          )}
          {enrollment.syllabus && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Syllabus:</span> {enrollment.syllabus}
            </p>
          )}
          {enrollment.start_date && (
            <p className="mt-2 text-2xs text-muted-foreground/80">
              Started {formatRelative(enrollment.start_date)}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </Card>
  )
}

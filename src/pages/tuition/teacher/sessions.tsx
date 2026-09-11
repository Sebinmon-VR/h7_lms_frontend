import {
  Ban,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Link2,
  PlayCircle,
  Square,
  Video,
} from 'lucide-react'
import * as React from 'react'

import type { AttendanceStatus, TuitionSessionOut, TuitionSessionStatus } from '@/api/types'
import { TUITION_ATTENDANCE_OPTIONS } from '@/api/tuition.api'
import {
  useCancelTuitionSession,
  useCreateTuitionSession,
  useEndTuitionSession,
  useMarkTuitionAttendance,
  useMyTuitionStudents,
  useSetTuitionMeetingLink,
  useStartTuitionSession,
  useTuitionProfile,
  useTuitionSessions,
} from '@/queries/tuition.queries'
import { shiftApiDate, todayApiDate } from '@/lib/datetime'
import { ATTENDANCE_LABEL } from '@/lib/constants'
import {
  CLASS_LENGTH_HINT,
  MAX_CLASS_MINUTES,
  MIN_CLASS_MINUTES,
  SESSION_STATUS_LABEL,
  classLengthError,
  isClosed,
  isLive,
} from '@/lib/tuition'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { DatePicker, DateTimePicker } from '@/components/ui/date-picker'
import { Input, Textarea } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field } from '@/components/forms/field'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { RescheduleDialog } from '@/components/domain/tuition-reschedule'
import { SessionCard, TimezoneNote } from '@/components/domain/tuition'
import { PageHeader } from '@/components/layout/page-header'

/**
 * The teacher's class console.
 *
 * Starting a class is not a formality: it records the teacher as present, and
 * arriving late earns the student an extension so a one-to-one class they paid
 * for is not simply shorter. Ending it early is allowed — connections drop —
 * but is recorded as `ended_early`, which is what the admin's report reads.
 *
 * The register is a separate action from ending, because the join timestamps
 * only imply attendance. A student whose connection failed and who phoned in
 * is present, however the log reads, and only the teacher knows that.
 */

const STATUS_OPTIONS: (TuitionSessionStatus | 'ALL')[] = [
  'ALL',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW_TEACHER',
  'NO_SHOW_STUDENT',
]

function EndClassDialog({
  session,
  onOpenChange,
}: {
  session: TuitionSessionOut | null
  onOpenChange: (open: boolean) => void
}) {
  const end = useEndTuitionSession()
  const [topic, setTopic] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [recording, setRecording] = React.useState('')

  React.useEffect(() => {
    if (!session) return
    setTopic(session.topic ?? '')
    setNotes(session.teacher_notes ?? '')
    setRecording(session.recording_url ?? '')
  }, [session])

  const early = session?.timing && !session.timing.may_end_now
  const remaining = session?.timing?.minutes_remaining

  return (
    <ConfirmDialog
      open={!!session}
      onOpenChange={onOpenChange}
      title="End this class"
      confirmLabel="End class"
      loading={end.isPending}
      description={
        early && remaining != null && remaining > 0
          ? `There are still ${Math.round(remaining)} minutes to run. Ending now is recorded as an early finish on the attendance report.`
          : 'What was covered is shown to the student and appears on their report card.'
      }
      onConfirm={() => {
        if (!session) return
        end.mutate(
          {
            sessionId: String(session.id),
            body: {
              topic: topic.trim() || null,
              notes: notes.trim() || null,
              recording_url: recording.trim() || null,
            },
          },
          { onSuccess: () => onOpenChange(false) },
        )
      }}
    >
      <div className="space-y-3">
        <Field id="topic" label="What was covered" hint="Shown to the student.">
          <Input
            id="topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Quadratic equations — completing the square"
            autoFocus
          />
        </Field>
        <Field id="notes" label="Your notes" hint="Private to you and the admin.">
          <Textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
        <Field id="recording" label="Recording link" hint="Optional.">
          <Input
            id="recording"
            value={recording}
            onChange={(event) => setRecording(event.target.value)}
            placeholder="https://…"
          />
        </Field>
      </div>
    </ConfirmDialog>
  )
}

function AttendanceDialog({
  session,
  onOpenChange,
}: {
  session: TuitionSessionOut | null
  onOpenChange: (open: boolean) => void
}) {
  const mark = useMarkTuitionAttendance()
  const [status, setStatus] = React.useState<AttendanceStatus>('PRESENT')
  const [remarks, setRemarks] = React.useState('')

  // The server's suggestion is a default, not an answer: it is derived from
  // the join timestamps, and the teacher is entitled to disagree with them.
  React.useEffect(() => {
    if (!session) return
    setStatus(session.attendance_status ?? session.suggested_attendance ?? 'PRESENT')
    setRemarks(session.attendance_remarks ?? '')
  }, [session])

  const suggested = session?.suggested_attendance

  return (
    <ConfirmDialog
      open={!!session}
      onOpenChange={onOpenChange}
      title="Mark the register"
      confirmLabel="Save register"
      loading={mark.isPending}
      description={
        suggested
          ? `The join times suggest ${ATTENDANCE_LABEL[suggested].toLowerCase()}. Change it if you know better — a student who phoned in was there.`
          : 'Your record of whether the student attended.'
      }
      onConfirm={() => {
        if (!session) return
        mark.mutate(
          { sessionId: String(session.id), body: { status, remarks: remarks.trim() || null } },
          { onSuccess: () => onOpenChange(false) },
        )
      }}
    >
      <div className="space-y-3">
        <Segmented
          layoutId="tuition-attendance"
          aria-label="Attendance"
          value={status}
          onChange={setStatus}
          options={TUITION_ATTENDANCE_OPTIONS.map((value) => ({
            value,
            label: ATTENDANCE_LABEL[value],
          }))}
        />
        <Field id="remarks" label="Remarks" hint="Optional. Shown on the attendance report.">
          <Input
            id="remarks"
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            placeholder="Joined by phone — connection dropped"
          />
        </Field>
      </div>
    </ConfirmDialog>
  )
}

function ExtraClassDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const enrollments = useMyTuitionStudents(false, open)
  const create = useCreateTuitionSession('teacher')

  const [enrollmentId, setEnrollmentId] = React.useState<string | null>(null)
  const [startsAt, setStartsAt] = React.useState<string | null>(null)
  const [duration, setDuration] = React.useState('')
  const [title, setTitle] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setEnrollmentId(null)
    setStartsAt(null)
    setDuration('')
    setTitle('')
  }, [open])

  const lengthError = classLengthError(duration)

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Schedule an extra class"
      confirmLabel="Schedule"
      loading={create.isPending}
      description="A one-off outside the weekly pattern — revision, or a catch-up for a class that was missed."
      onConfirm={() => {
        if (!enrollmentId || !startsAt || lengthError) return
        create.mutate(
          {
            body: {
              enrollment_id: Number(enrollmentId),
              scheduled_start_at: startsAt,
              duration_minutes: duration ? Number(duration) : null,
              title: title.trim() || null,
            },
          },
          { onSuccess: () => onOpenChange(false) },
        )
      }}
    >
      <div className="space-y-3">
        <Field id="extra-student" label="Student and subject" required>
          <Combobox
            id="extra-student"
            value={enrollmentId}
            onChange={setEnrollmentId}
            options={(enrollments.data ?? []).map((e) => ({
              value: String(e.id),
              label: `${e.student?.full_name ?? 'Student'} · ${e.subject?.name ?? 'Subject'}`,
            }))}
            placeholder="Choose…"
            emptyMessage="You have no active students."
          />
        </Field>
        <Field id="extra-when" label="Starts" required hint="Your local time. Sent with its offset.">
          <DateTimePicker id="extra-when" value={startsAt} onChange={setStartsAt} />
        </Field>
        <Field
          id="extra-mins"
          label="Length"
          hint={CLASS_LENGTH_HINT}
          error={lengthError ?? undefined}
        >
          <Input
            id="extra-mins"
            type="number"
            min={MIN_CLASS_MINUTES}
            max={MAX_CLASS_MINUTES}
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            placeholder="60"
          />
        </Field>
        <Field id="extra-title" label="Title" hint="Optional. Shown to the student.">
          <Input
            id="extra-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Revision — past paper 2"
          />
        </Field>
      </div>
    </ConfirmDialog>
  )
}

export default function TuitionTeacherSessionsPage() {
  const profile = useTuitionProfile()
  const students = useMyTuitionStudents()

  const today = todayApiDate()
  const [from, setFrom] = React.useState(() => shiftApiDate(today, -7))
  const [to, setTo] = React.useState(() => shiftApiDate(today, 14))
  const [status, setStatus] = React.useState<TuitionSessionStatus | 'ALL'>('ALL')
  const [studentId, setStudentId] = React.useState<string | null>(null)

  const sessions = useTuitionSessions('teacher', {
    from,
    to,
    status: status === 'ALL' ? undefined : status,
    who: studentId ? Number(studentId) : undefined,
  })

  const start = useStartTuitionSession()
  const setLink = useSetTuitionMeetingLink('teacher')
  const cancel = useCancelTuitionSession('teacher')

  const [ending, setEnding] = React.useState<TuitionSessionOut | null>(null)
  const [marking, setMarking] = React.useState<TuitionSessionOut | null>(null)
  const [cancelling, setCancelling] = React.useState<TuitionSessionOut | null>(null)
  const [cancelReason, setCancelReason] = React.useState('')
  const [moving, setMoving] = React.useState<TuitionSessionOut | null>(null)
  const [extraOpen, setExtraOpen] = React.useState(false)

  /**
   * Joining goes through the server, not the stored link.
   *
   * `POST .../meeting-link` with no body asks the backend to create the Meet
   * on demand, and returns the class with a link to open. Opening a link we
   * already had would skip the record of the teacher having arrived.
   */
  const openMeeting = (session: TuitionSessionOut) => {
    if (session.meeting_link) {
      window.open(session.meeting_link, '_blank', 'noopener')
      return
    }
    setLink.mutate(
      { sessionId: String(session.id) },
      {
        onSuccess: (updated) => {
          if (updated.meeting_link) window.open(updated.meeting_link, '_blank', 'noopener')
        },
      },
    )
  }

  return (
    <>
      <PageHeader
        title="Tuition classes"
        description="Start a class, mark the register, and set up the next one."
        actions={
          <Button onClick={() => setExtraOpen(true)}>
            <CalendarPlus />
            Extra class
          </Button>
        }
      >
        <TimezoneNote timezone={profile.data?.effective_timezone} />
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-48">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Student</label>
          <Combobox
            value={studentId}
            onChange={(v) => setStudentId(v || null)}
            options={[
              { value: '', label: 'All students' },
              ...Array.from(
                new Map(
                  (students.data ?? []).map((e) => [
                    e.student_id,
                    { value: String(e.student_id), label: e.student?.full_name ?? 'Student' },
                  ]),
                ).values(),
              ),
            ]}
            placeholder="All students"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Status</label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === 'ALL' ? 'Any status' : SESSION_STATUS_LABEL[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">From</label>
          <DatePicker value={from} onChange={(v) => v && setFrom(v)} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">To</label>
          <DatePicker value={to} onChange={(v) => v && setTo(v)} />
        </div>
      </div>

      <QueryBoundary
        query={sessions}
        loading={
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        }
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={<CalendarClock />}
            title="No classes in this window"
            description="Widen the dates, or ask an administrator to extend the generated schedule."
          />
        }
      >
        {(data) => (
          <div className="space-y-3">
            {data.map((session) => {
              const live = isLive(session)
              const closed = isClosed(session)
              /**
               * The teacher still has to register their arrival on a class the
               * sweep opened.
               *
               * Automatic start moves the STATUS only — it never records a
               * `teacher_joined_at`, because who turned up is a fact about
               * people. So a live class with no arrival on it is one the
               * no-show rule will eventually mark the teacher absent for,
               * making it unchargeable. Hiding the button once the class went
               * live would leave them no way to say they are here.
               */
              const needsArrival = !closed && !session.teacher_joined_at

              return (
                <SessionCard
                  key={String(session.id)}
                  session={session}
                  viewerIsTeacher
                  actions={
                    <>
                      {needsArrival && (
                        <Button
                          size="sm"
                          variant={live ? 'outline' : 'solid'}
                          loading={start.isPending}
                          onClick={() => start.mutate(String(session.id))}
                          title={
                            live
                              ? 'This class opened on its timetable. Confirm you are here so it is not recorded as a no-show.'
                              : undefined
                          }
                        >
                          <PlayCircle />
                          {live ? "I'm here" : 'Start'}
                        </Button>
                      )}

                      {live && (
                        <Button size="sm" variant="danger" onClick={() => setEnding(session)}>
                          <Square />
                          End class
                        </Button>
                      )}

                      {!closed && (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={setLink.isPending}
                          onClick={() => openMeeting(session)}
                        >
                          {session.meeting_link ? <Video /> : <Link2 />}
                          {session.meeting_link ? 'Join' : 'Create link'}
                        </Button>
                      )}

                      {/* The register stays available after the class: a
                          teacher who ended in a hurry comes back to it. */}
                      <Button size="sm" variant="outline" onClick={() => setMarking(session)}>
                        <CheckCircle2 />
                        {session.attendance_status ? 'Edit register' : 'Register'}
                      </Button>

                      {/* Moving one class is offered before cancelling it:
                          a clash is nearly always a reschedule, and a
                          cancelled class is one the student does not get. */}
                      {!closed && (
                        <Button size="sm" variant="outline" onClick={() => setMoving(session)}>
                          <CalendarClock />
                          Move
                        </Button>
                      )}

                      {!closed && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setCancelling(session)
                            setCancelReason('')
                          }}
                        >
                          <Ban />
                          Cancel
                        </Button>
                      )}
                    </>
                  }
                />
              )
            })}
          </div>
        )}
      </QueryBoundary>

      <EndClassDialog session={ending} onOpenChange={(open) => !open && setEnding(null)} />
      <AttendanceDialog session={marking} onOpenChange={(open) => !open && setMarking(null)} />
      <ExtraClassDialog open={extraOpen} onOpenChange={setExtraOpen} />
      <RescheduleDialog
        session={moving}
        scope="teacher"
        onOpenChange={(open) => !open && setMoving(null)}
      />

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(v) => !v && setCancelling(null)}
        title="Cancel this class?"
        destructive
        confirmLabel="Cancel class"
        loading={cancel.isPending}
        description="The student is told. A cancelled class is not counted as conducted and is not billed."
        onConfirm={() => {
          if (!cancelling) return
          cancel.mutate(
            { sessionId: String(cancelling.id), body: { reason: cancelReason.trim() || null } },
            { onSuccess: () => setCancelling(null) },
          )
        }}
      >
        <Input
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          placeholder="Reason (shown to the student)"
          autoFocus
        />
      </ConfirmDialog>
    </>
  )
}

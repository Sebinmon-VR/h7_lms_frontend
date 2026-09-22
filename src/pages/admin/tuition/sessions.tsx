import { Ban, CalendarClock, Link2, Receipt, Video } from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

import type { TuitionSessionOut, TuitionSessionStatus } from '@/api/types'
import {
  useCancelTuitionSession,
  useSetSessionBillable,
  useSetTuitionMeetingLink,
  useTuitionSessions,
  useTuitionUsers,
} from '@/queries/tuition.queries'
import { shiftApiDate, todayApiDate } from '@/lib/datetime'
import { SESSION_STATUS_LABEL, isClosed } from '@/lib/tuition'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { RescheduleDialog } from '@/components/domain/tuition-reschedule'
import { SessionCard } from '@/components/domain/tuition'
import { PageHeader } from '@/components/layout/page-header'

/**
 * Every one-to-one class, live or finished.
 *
 * The admin's job on this screen is exception handling, not teaching: find the
 * class the teacher never closed, the one booked over a clash, the one that
 * should not be billed. So the actions here are the ones a teacher does not
 * have — override the billing flag, replace a broken meeting link, cancel on
 * somebody's behalf.
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

export default function AdminTuitionSessionsPage() {
  const [params, setParams] = useSearchParams()

  // The dashboard links here with a person already chosen, so the URL is the
  // source of truth for the filter rather than local state.
  const studentParam = params.get('student')
  const teacherParam = params.get('teacher')

  const today = todayApiDate()
  const [from, setFrom] = React.useState(() => shiftApiDate(today, -7))
  const [to, setTo] = React.useState(() => shiftApiDate(today, 14))
  const [status, setStatus] = React.useState<TuitionSessionStatus | 'ALL'>('ALL')
  const [linkFor, setLinkFor] = React.useState<TuitionSessionOut | null>(null)
  const [linkValue, setLinkValue] = React.useState('')
  const [cancelling, setCancelling] = React.useState<TuitionSessionOut | null>(null)
  const [cancelReason, setCancelReason] = React.useState('')
  const [moving, setMoving] = React.useState<TuitionSessionOut | null>(null)

  const students = useTuitionUsers('STUDENT')
  const teachers = useTuitionUsers('TEACHER')

  const sessions = useTuitionSessions('admin', {
    from,
    to,
    status: status === 'ALL' ? undefined : status,
    who: studentParam ? Number(studentParam) : undefined,
  })

  const setBillable = useSetSessionBillable()
  const setLink = useSetTuitionMeetingLink('admin')
  const cancel = useCancelTuitionSession('admin')

  /**
   * The teacher filter is applied here, not sent.
   *
   * `/admin/tuition/sessions` takes a student OR a teacher, and sending both
   * narrows to their intersection — which is not what "show me this teacher's
   * classes" means when a student is also selected. One goes to the server and
   * the other filters the result.
   */
  const rows = React.useMemo(() => {
    const all = sessions.data ?? []
    if (!teacherParam) return all
    return all.filter((s) => s.teacher_id === Number(teacherParam))
  }, [sessions.data, teacherParam])

  const setPerson = (key: 'student' | 'teacher', value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Tuition classes"
        description="Every one-to-one class in the window, and the overrides only an admin can make."
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-48">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Student</label>
          <Combobox
            value={studentParam}
            onChange={(v) => setPerson('student', v || null)}
            options={[
              { value: '', label: 'All students' },
              ...(students.data ?? []).map((u) => ({
                value: String(u.id),
                label: u.full_name,
                hint: u.admission_number ?? u.email,
              })),
            ]}
            placeholder="All students"
          />
        </div>

        <div className="min-w-48">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Teacher</label>
          <Combobox
            value={teacherParam}
            onChange={(v) => setPerson('teacher', v || null)}
            options={[
              { value: '', label: 'All teachers' },
              ...(teachers.data ?? []).map((u) => ({
                value: String(u.id),
                label: u.full_name,
                hint: u.employee_id ?? u.email,
              })),
            ]}
            placeholder="All teachers"
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
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        }
        isEmpty={() => rows.length === 0}
        empty={
          <EmptyState
            icon={<CalendarClock />}
            title="No classes in this window"
            description="Widen the dates, or extend the generated schedule if the horizon stops before them."
          />
        }
      >
        {() => (
          <div className="space-y-3">
            {rows.map((session) => (
              <SessionCard
                key={String(session.id)}
                session={session}
                viewerIsTeacher={false}
                actions={
                  <>
                    {/* Only ever an override. `is_billable` is null until
                        somebody sets it, and null means "as the package says". */}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={setBillable.isPending}
                      onClick={() =>
                        setBillable.mutate({
                          sessionId: String(session.id),
                          billable: session.is_billable === false,
                        })
                      }
                    >
                      <Receipt />
                      {session.is_billable === false ? 'Bill this class' : "Don't bill"}
                    </Button>

                    {!isClosed(session) && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setLinkFor(session)
                            setLinkValue(session.meeting_link ?? '')
                          }}
                        >
                          <Link2 />
                          Link
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setMoving(session)}>
                          <CalendarClock />
                          Move
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCancelling(session)
                            setCancelReason('')
                          }}
                        >
                          <Ban />
                          Cancel
                        </Button>
                      </>
                    )}

                    {session.meeting_link && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={session.meeting_link} target="_blank" rel="noreferrer">
                          <Video />
                          Open
                        </a>
                      </Button>
                    )}
                  </>
                }
              />
            ))}
          </div>
        )}
      </QueryBoundary>

      <ConfirmDialog
        open={!!linkFor}
        onOpenChange={(v) => !v && setLinkFor(null)}
        title="Replace the meeting link"
        confirmLabel="Save link"
        loading={setLink.isPending}
        description="Use a room from another provider — Zoom, Teams, or a standing link the tutor already shares."
        onConfirm={() => {
          if (!linkFor || !linkValue.trim()) return
          setLink.mutate(
            { sessionId: String(linkFor.id), body: { meeting_link: linkValue.trim() } },
            { onSuccess: () => setLinkFor(null) },
          )
        }}
      >
        <Input
          value={linkValue}
          onChange={(event) => setLinkValue(event.target.value)}
          placeholder="https://…"
          autoFocus
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(v) => !v && setCancelling(null)}
        title="Cancel this class?"
        destructive
        confirmLabel="Cancel class"
        loading={cancel.isPending}
        description="Both people are told. A cancelled class is not counted as conducted and is not billed."
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
          placeholder="Reason (shown to both)"
          autoFocus
        />
      </ConfirmDialog>

      <RescheduleDialog
        session={moving}
        scope="admin"
        onOpenChange={(open) => !open && setMoving(null)}
      />
    </>
  )
}

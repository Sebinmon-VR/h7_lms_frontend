import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  RefreshCw,
  Undo2,
  XCircle,
} from 'lucide-react'
import * as React from 'react'

import type { ExtraClassOut, ExtraClassStatus } from '@/api/types'
import {
  useCancelExtraClass,
  useDecideExtraClass,
  useExtraClasses,
  useRequestExtraClass,
  useScheduleExtraClass,
} from '@/queries/classes.queries'
import { useMyClasses } from '@/queries/teacher.queries'
import { useAuth } from '@/providers/auth-provider'
import { formatDateTime } from '@/lib/datetime'
import {
  EXTRA_CLASS_STATUS_LABEL,
  EXTRA_CLASS_STATUS_TONE,
  awaitingScheduling,
} from '@/lib/school'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Segmented } from '@/components/ui/segmented'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FormError } from '@/components/forms/field'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * Extra classes — classes held outside the timetable.
 *
 * The thing this screen exists to make visible: approving and scheduling are
 * two separate calls, because creating the class can fail on a clash or a Meet
 * error AFTER a human has already approved it. An `APPROVED` request with no
 * created class is a real, recoverable state, and it gets its own banner and a
 * retry rather than being rendered as done.
 *
 * When `extra_class_needs_approval` is off, requests arrive already APPROVED
 * and the flow is one step — which the request toast says at the time.
 */

function RequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const request = useRequestExtraClass()
  const myClasses = useMyClasses()

  const [pair, setPair] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [when, setWhen] = React.useState('')
  const [duration, setDuration] = React.useState('45')
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setPair('')
    setTitle('')
    setWhen('')
    setDuration('45')
    setReason('')
    setError(null)
  }, [open])

  const pairs = React.useMemo(() => {
    const seen = new Set<string>()
    return (myClasses.data ?? [])
      .map((m) => ({
        classId: m.class_room.id,
        className: m.class_room.name,
        subjectId: m.subject.id,
        subjectName: m.subject.name,
      }))
      .filter((p) => {
        const key = `${p.classId}:${p.subjectId}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }, [myClasses.data])

  const submit = async () => {
    if (!pair) return setError('Pick the class and subject this is for.')
    if (!title.trim()) return setError('Give the class a title.')
    if (!when) return setError('Pick when it should happen.')
    setError(null)

    const [classId, subjectId] = pair.split(':')
    try {
      await request.mutateAsync({
        title: title.trim(),
        // A school request needs BOTH of these and no enrollment; the backend
        // refuses any other combination.
        class_id: Number(classId),
        subject_id: Number(subjectId),
        scheduled_time: `${when}:00`,
        duration_minutes: Number(duration) || 45,
        reason: reason.trim() || null,
      })
      onOpenChange(false)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not send the request.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request an extra class</DialogTitle>
          <DialogDescription>
            An administrator reviews it, then creates the class. The reason you give is what
            they read.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />

          <Field id="extra_pair" label="Class and subject" required>
            <Select value={pair} onValueChange={setPair}>
              <SelectTrigger id="extra_pair">
                <SelectValue placeholder="Pick one you teach…" />
              </SelectTrigger>
              <SelectContent>
                {pairs.map((p) => (
                  <SelectItem key={`${p.classId}:${p.subjectId}`} value={`${p.classId}:${p.subjectId}`}>
                    {p.className} · {p.subjectName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="extra_title" label="Title" required>
            <Input
              id="extra_title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Revision before the unit test"
            />
          </Field>

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field id="extra_when" label="When" required>
              <Input
                id="extra_when"
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </Field>
            <Field id="extra_duration" label="Minutes">
              <Input
                id="extra_duration"
                type="number"
                min={5}
                max={480}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </Field>
          </div>

          <Field id="extra_reason" label="Why it is needed">
            <Textarea
              id="extra_reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={request.isPending}>
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DecideDialog({
  request,
  approve,
  onClose,
}: {
  request: ExtraClassOut | null
  approve: boolean
  onClose: () => void
}) {
  const decide = useDecideExtraClass()
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setNote('')
    setError(null)
  }, [request, approve])

  const submit = async () => {
    if (!request) return
    if (!approve && !note.trim()) {
      setError('A rejection needs a reason the teacher can read.')
      return
    }
    setError(null)
    try {
      await decide.mutateAsync({
        requestId: request.id,
        body: { approve, note: note.trim() || null },
      })
      onClose()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not record the decision.')
    }
  }

  return (
    <Dialog open={!!request} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{approve ? 'Approve this request' : 'Reject this request'}</DialogTitle>
          <DialogDescription>
            {approve
              ? 'Approving does not create the class — you schedule it as a second step, so a clash or a Meet failure does not lose the approval.'
              : 'The teacher sees the reason you give.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />
          <Field id="extra_note" label="Note" required={!approve}>
            <Textarea
              id="extra_note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={approve ? 'solid' : 'danger'} onClick={submit} loading={decide.isPending}>
            {approve ? 'Approve' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RequestCard({
  request,
  isAdmin,
  isMine,
  onDecide,
  onSchedule,
  onCancel,
  scheduling,
}: {
  request: ExtraClassOut
  isAdmin: boolean
  isMine: boolean
  onDecide: (approve: boolean) => void
  onSchedule: () => void
  onCancel: () => void
  scheduling: boolean
}) {
  const stuck = awaitingScheduling(request)

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{request.title}</h3>
            <Badge tone={EXTRA_CLASS_STATUS_TONE[request.status]} size="sm">
              {EXTRA_CLASS_STATUS_LABEL[request.status]}
            </Badge>
          </div>
          <p className="mt-1 text-sm">
            {formatDateTime(request.scheduled_time)}
            <span className="text-muted-foreground"> · {request.duration_minutes} minutes</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {[request.class_name, request.subject_name].filter(Boolean).join(' · ')}
            {request.teacher_name ? ` · asked by ${request.teacher_name}` : ''}
          </p>
          {request.reason && (
            <p className="mt-2 text-sm text-muted-foreground">{request.reason}</p>
          )}
          {request.decision_note && (
            <p className="mt-2 text-xs text-muted-foreground">
              {request.decided_by_name ?? 'Decided'}: {request.decision_note}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isAdmin && request.status === 'PENDING' && (
            <>
              <Button size="sm" onClick={() => onDecide(true)}>
                <CheckCircle2 />
                Approve
              </Button>
              <Button variant="outline" size="sm" onClick={() => onDecide(false)}>
                <XCircle />
                Reject
              </Button>
            </>
          )}
          {isAdmin && stuck && (
            <Button size="sm" loading={scheduling} onClick={onSchedule}>
              <CalendarPlus />
              Create the class
            </Button>
          )}
          {isMine && (request.status === 'PENDING' || request.status === 'APPROVED') && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <Undo2 />
              Withdraw
            </Button>
          )}
        </div>
      </div>

      {/* The state the two-step flow leaves behind. Without this it reads as
          "approved, done" and the class silently never happens. */}
      {stuck && (
        <div className="mt-3 flex gap-2 rounded-lg border border-warning/30 bg-warning/8 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Approved, but the class does not exist yet.</strong>{' '}
            {isAdmin
              ? 'Creating it can fail on a timetable clash or a Meet error — press "Create the class" to try again.'
              : 'An administrator still has to create it.'}
          </p>
        </div>
      )}

      {request.status === 'SCHEDULED' && (
        <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-success">
          <RefreshCw className="size-3.5" />
          The class has been created and is on the calendar.
        </p>
      )}
    </Card>
  )
}

export default function ExtraClassesPage() {
  const { role, user } = useAuth()
  const isAdmin = role === 'ADMIN'

  const [status, setStatus] = React.useState<'ALL' | ExtraClassStatus>(
    isAdmin ? 'PENDING' : 'ALL',
  )
  const requests = useExtraClasses({
    status: status === 'ALL' ? undefined : status,
    mineOnly: !isAdmin,
  })

  const schedule = useScheduleExtraClass()
  const cancel = useCancelExtraClass()
  const [requestOpen, setRequestOpen] = React.useState(false)
  const [deciding, setDeciding] = React.useState<{
    request: ExtraClassOut
    approve: boolean
  } | null>(null)

  return (
    <div>
      <PageHeader
        title="Extra classes"
        description={
          isAdmin
            ? 'Requests for classes outside the timetable. Approving and creating the class are two steps, so a clash never loses the approval.'
            : 'Ask for a class outside the timetable.'
        }
        actions={
          !isAdmin ? (
            <Button onClick={() => setRequestOpen(true)}>
              <CalendarPlus />
              Request a class
            </Button>
          ) : undefined
        }
      >
        <Segmented
          layoutId="extra-class-status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'PENDING', label: 'Awaiting' },
            { value: 'APPROVED', label: 'Approved' },
            { value: 'SCHEDULED', label: 'Created' },
            { value: 'ALL', label: 'All' },
          ]}
        />
      </PageHeader>

      <QueryBoundary
        query={requests}
        loading={
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            icon={<CalendarPlus />}
            title={status === 'PENDING' ? 'Nothing waiting' : 'No extra classes'}
            description={
              isAdmin
                ? 'Teachers request these when they need a session outside the timetable.'
                : 'Ask for one when you need a session outside the timetable — revision before a test, or catching up a missed lesson.'
            }
            action={
              !isAdmin ? (
                <Button onClick={() => setRequestOpen(true)}>
                  <CalendarPlus />
                  Request a class
                </Button>
              ) : undefined
            }
          />
        }
      >
        {(rows) => (
          <div className="space-y-3">
            {rows.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                isAdmin={isAdmin}
                isMine={request.requested_by === user?.id}
                onDecide={(approve) => setDeciding({ request, approve })}
                onSchedule={() => schedule.mutate(request.id)}
                onCancel={() => cancel.mutate(request.id)}
                scheduling={schedule.isPending && schedule.variables === request.id}
              />
            ))}
          </div>
        )}
      </QueryBoundary>

      <RequestDialog open={requestOpen} onOpenChange={setRequestOpen} />
      <DecideDialog
        request={deciding?.request ?? null}
        approve={deciding?.approve ?? true}
        onClose={() => setDeciding(null)}
      />
    </div>
  )
}

import { AlertTriangle, CalendarPlus, CheckCircle2, Undo2, X, XCircle } from 'lucide-react'
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
import { cn } from '@/lib/cn'
import { formatDate, parseApiDateTime } from '@/lib/datetime'
import { tidyName as tidy } from '@/lib/names'
import { formatSchoolTime } from '@/lib/school-time'
import { EXTRA_CLASS_STATUS_LABEL, awaitingScheduling } from '@/lib/school'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FormError } from '@/components/forms/field'
import { ErrorState } from '@/components/feedback/states'
import { Band, Figure, Figures, TabStrip, TONE_FILL, TONE_TEXT, WorkspaceHeader, type Tone } from '@/components/layout/workspace'

/**
 * Additional classes — classes held outside the timetable.
 *
 * Laid out like the other admin workspaces: white bands, no cards. Requests on
 * the left, the chosen one on the right with its decision in place.
 *
 * The thing this screen exists to make visible: approving and scheduling are
 * two separate calls, because creating the class can fail on a clash or a room
 * error AFTER a human has already approved it. An `APPROVED` request with no
 * created class is a real, recoverable state, and it gets its own tab and a
 * retry rather than being rendered as done.
 *
 * When `extra_class_needs_approval` is off, requests arrive already APPROVED
 * and the flow is one step.
 */

type TabKey = 'PENDING' | 'TO_CREATE' | 'SCHEDULED' | 'CLOSED' | 'ALL'

const STATUS_DOT: Record<ExtraClassStatus, Tone> = {
  PENDING: 'warning',
  APPROVED: 'info',
  SCHEDULED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
}

const TAB_TEST: Record<TabKey, (r: ExtraClassOut) => boolean> = {
  PENDING: (r) => r.status === 'PENDING',
  TO_CREATE: (r) => awaitingScheduling(r),
  SCHEDULED: (r) => r.status === 'SCHEDULED' || (r.status === 'APPROVED' && !awaitingScheduling(r)),
  CLOSED: (r) => r.status === 'REJECTED' || r.status === 'CANCELLED',
  ALL: () => true,
}

const COMPACT_INPUT = 'h-8 px-3 py-1 text-sm'
const COMPACT_FIELD = 'space-y-1'

const whenOf = (r: ExtraClassOut) => parseApiDateTime(r.scheduled_time) ?? new Date(r.scheduled_time)

function StatusTag({ request }: { request: ExtraClassOut }) {
  const stuck = awaitingScheduling(request)
  const tone: Tone = stuck ? 'warning' : STATUS_DOT[request.status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', TONE_TEXT[tone])}>
      <span className={cn('size-2 rounded-full', TONE_FILL[tone])} aria-hidden />
      {stuck ? 'Approved, not created' : EXTRA_CLASS_STATUS_LABEL[request.status]}
    </span>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-2.5 first:pl-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-foreground">{children}</p>
    </div>
  )
}

// ==================================================================== form

/** A teacher's request, in the right-hand pane. */
function RequestForm({ onClose }: { onClose: () => void }) {
  const request = useRequestExtraClass()
  const myClasses = useMyClasses()
  const [pair, setPair] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [when, setWhen] = React.useState('')
  const [duration, setDuration] = React.useState('45')
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const pairs = React.useMemo(() => {
    const seen = new Set<string>()
    return (myClasses.data ?? [])
      .map((m) => ({ classId: m.class_room.id, className: m.class_room.name, subjectId: m.subject.id, subjectName: m.subject.name }))
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
      onClose()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not send the request.')
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-foreground">Request an additional class</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">An administrator reviews it, then creates the class. The reason is what they read</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close the form">
          <X />
        </Button>
      </div>
      <FormError message={error} />
      <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
        <Field id="extra_pair" label="Class and subject" required className={COMPACT_FIELD}>
          <Select value={pair} onValueChange={setPair}>
            <SelectTrigger id="extra_pair" className={COMPACT_INPUT}>
              <SelectValue placeholder="Pick one you teach" />
            </SelectTrigger>
            <SelectContent>
              {pairs.map((p) => (
                <SelectItem key={`${p.classId}:${p.subjectId}`} value={`${p.classId}:${p.subjectId}`}>
                  {p.className} · {tidy(p.subjectName)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="extra_title" label="Title" required className={COMPACT_FIELD}>
          <Input id="extra_title" className={COMPACT_INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Revision before the unit test" />
        </Field>
        <Field id="extra_when" label="When" required className={COMPACT_FIELD}>
          <Input id="extra_when" type="datetime-local" className={COMPACT_INPUT} value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field id="extra_duration" label="Minutes" className={COMPACT_FIELD}>
          <Input id="extra_duration" type="number" min={5} max={480} className={COMPACT_INPUT} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </Field>
        <Field id="extra_reason" label="Why it is needed" className={cn(COMPACT_FIELD, 'sm:col-span-2')}>
          <Textarea id="extra_reason" rows={2} className="text-sm" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} loading={request.isPending}>
          Send request
        </Button>
      </div>
    </div>
  )
}

// ================================================================== detail

/** Approve or reject, under the request. A rejection needs a reason. */
function DecisionPanel({ request }: { request: ExtraClassOut }) {
  const decide = useDecideExtraClass()
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const submit = async (approve: boolean) => {
    if (!approve && !note.trim()) {
      setError('A rejection needs a reason the teacher can read.')
      return
    }
    setError(null)
    try {
      await decide.mutateAsync({ requestId: request.id, body: { approve, note: note.trim() || null } })
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not record the decision.')
    }
  }

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Decision</h3>
      <FormError message={error} />
      <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the teacher (needed when rejecting)" aria-label="Decision note" className="text-sm" />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={decide.isPending && decide.variables?.body.approve} onClick={() => void submit(true)}>
          <CheckCircle2 />
          Approve
        </Button>
        <Button size="sm" variant="outline" loading={decide.isPending && !decide.variables?.body.approve} onClick={() => void submit(false)}>
          <XCircle />
          Reject
        </Button>
        <span className="text-xs text-muted-foreground">Approving does not create the class yet. That is the next step, so a clash never loses the approval</span>
      </div>
    </div>
  )
}

function RequestDetail({ request, isAdmin, isMine }: { request: ExtraClassOut; isAdmin: boolean; isMine: boolean }) {
  const schedule = useScheduleExtraClass()
  const cancel = useCancelExtraClass()
  const stuck = awaitingScheduling(request)
  const start = whenOf(request)
  const end = new Date(start.getTime() + request.duration_minutes * 60_000)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <StatusTag request={request} />
          <h2 className="mt-1 text-2xl font-medium tracking-tight text-foreground">{request.title}</h2>
          <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
            {formatDate(start, 'EEEE d MMMM')} · {formatSchoolTime(start)}–{formatSchoolTime(end)} · {request.duration_minutes} min
          </p>
        </div>
        {isMine && (request.status === 'PENDING' || request.status === 'APPROVED') && (
          <Button variant="outline" size="sm" loading={cancel.isPending} onClick={() => cancel.mutate(request.id)}>
            <Undo2 />
            Withdraw
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 border-y border-border sm:grid-cols-4 sm:divide-x sm:divide-border">
        <Fact label="Class">{request.class_name ?? '—'}</Fact>
        <Fact label="Subject">{request.subject_name ? tidy(request.subject_name) : '—'}</Fact>
        <Fact label="Requested by">{request.teacher_name ? tidy(request.teacher_name) : '—'}</Fact>
        <Fact label="Requested on">{request.created_at ? formatDate(request.created_at, 'd MMM') : '—'}</Fact>
      </div>

      {request.reason && (
        <div className="space-y-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Why it is needed</h3>
          <p className="text-sm text-foreground">{request.reason}</p>
        </div>
      )}

      {request.decision_note && (
        <div className="border-l-2 border-border pl-3">
          <p className="text-xs text-muted-foreground">
            {request.decided_by_name ? tidy(request.decided_by_name) : 'Decided'}
            {request.decided_at ? ` · ${formatDate(request.decided_at, 'd MMM')}` : ''}
          </p>
          <p className="text-sm text-foreground">{request.decision_note}</p>
        </div>
      )}

      {/* The state the two-step flow leaves behind. Without this it reads as
          "approved, done" and the class silently never happens. */}
      {stuck && (
        <div className="flex flex-wrap items-center gap-3 border-l-2 border-warning bg-warning/5 px-3 py-2.5 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1">
            <span className="font-medium text-foreground">Approved, but the class does not exist yet.</span>{' '}
            <span className="text-muted-foreground">
              {isAdmin ? 'Creating it can fail on a timetable clash or a room error. Try again.' : 'An administrator still has to create it.'}
            </span>
          </p>
          {isAdmin && (
            <Button size="sm" loading={schedule.isPending} onClick={() => schedule.mutate(request.id)}>
              <CalendarPlus />
              Create the class
            </Button>
          )}
        </div>
      )}

      {request.status === 'SCHEDULED' && (
        <p className="flex items-center gap-1.5 text-sm text-success">
          <CheckCircle2 className="size-4" />
          The class has been created and is on the calendar.
        </p>
      )}

      {isAdmin && request.status === 'PENDING' && <DecisionPanel key={request.id} request={request} />}
    </div>
  )
}

// ==================================================================== page

export default function ExtraClassesPage() {
  const { role, user } = useAuth()
  const isAdmin = role === 'ADMIN'
  const requests = useExtraClasses({ mineOnly: !isAdmin })
  const [tab, setTab] = React.useState<TabKey>(isAdmin ? 'PENDING' : 'ALL')
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [requesting, setRequesting] = React.useState(false)

  const all = React.useMemo(() => [...(requests.data ?? [])].sort((a, b) => whenOf(b).getTime() - whenOf(a).getTime()), [requests.data])
  const count = (k: TabKey) => all.filter(TAB_TEST[k]).length
  const shown = all.filter(TAB_TEST[tab])
  const selected = shown.find((r) => r.id === selectedId) ?? shown[0] ?? null
  const now = Date.now()
  const comingUp = all.filter((r) => TAB_TEST.SCHEDULED(r) && whenOf(r).getTime() > now).length

  const tabs: { key: TabKey; label: string; count: number; tone?: Tone; alert?: boolean }[] = [
    ...(isAdmin ? [] : [{ key: 'ALL' as const, label: 'All', count: all.length }]),
    { key: 'PENDING', label: 'Awaiting approval', count: count('PENDING'), tone: 'warning', alert: isAdmin },
    { key: 'TO_CREATE', label: 'Approved, not created', count: count('TO_CREATE'), tone: 'info', alert: true },
    { key: 'SCHEDULED', label: 'Created', count: count('SCHEDULED'), tone: 'success' },
    { key: 'CLOSED', label: 'Rejected or withdrawn', count: count('CLOSED'), tone: 'neutral' },
    ...(isAdmin ? [{ key: 'ALL' as const, label: 'All', count: all.length }] : []),
  ]

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title="Additional Classes"
        description={isAdmin ? 'Requests for classes outside the timetable. Approve, then create the class' : 'Ask for a class outside the timetable'}
        icon={CalendarPlus}
        actions={
          !isAdmin ? (
            <Button size="sm" onClick={() => setRequesting(true)}>
              <CalendarPlus />
              Request a class
            </Button>
          ) : undefined
        }
        tabs={
          <TabStrip
            label="Requests"
            idPrefix="extra-tab"
            value={tab}
            onChange={(t) => {
              setTab(t)
              setSelectedId(null)
              setRequesting(false)
            }}
            tabs={tabs}
          />
        }
      />

      <div className="!mt-0">
        <Figures>
          <Figure label="Awaiting approval" value={requests.data ? String(count('PENDING')) : '—'} context="requests" alert={isAdmin && count('PENDING') > 0} tone="warning" />
          <Figure label="Not created yet" value={requests.data ? String(count('TO_CREATE')) : '—'} context="approved" alert={count('TO_CREATE') > 0} tone="info" />
          <Figure label="Coming up" value={requests.data ? String(comingUp) : '—'} context="classes created" tone="success" />
          <Figure label="All requests" value={requests.data ? String(all.length) : '—'} context={isAdmin ? 'from teachers' : 'yours'} tone="neutral" />
        </Figures>

        <Band className="border-b border-border">
          {requests.isPending ? (
            <div className="grid gap-4 py-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
              <Skeleton className="h-72 w-full" />
              <Skeleton className="h-72 w-full" />
            </div>
          ) : requests.isError ? (
            <div className="py-6">
              <ErrorState error={requests.error} onRetry={() => requests.refetch()} />
            </div>
          ) : (
            <div className="grid lg:h-[calc(100vh-20rem)] lg:min-h-[26rem] lg:grid-cols-[22rem_minmax(0,1fr)] lg:divide-x lg:divide-border">
              <div className="-mx-4 border-b border-border sm:-mx-6 lg:mx-0 lg:-ml-8 lg:min-h-0 lg:border-b-0">
                {shown.length === 0 ? (
                  <p className="px-6 py-10 text-center text-sm text-muted-foreground lg:pl-8">
                    {tab === 'PENDING' ? 'Nothing waiting for a decision' : tab === 'TO_CREATE' ? 'Every approved class has been created' : 'No requests here'}
                  </p>
                ) : (
                  <ul className="max-h-80 divide-y divide-border overflow-y-auto lg:h-full lg:max-h-none">
                    {shown.map((r) => {
                      const active = !requesting && selected?.id === r.id
                      const start = whenOf(r)
                      const stuck = awaitingScheduling(r)
                      return (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(r.id)
                              setRequesting(false)
                            }}
                            aria-current={active ? 'true' : undefined}
                            className={cn(
                              'relative flex w-full items-start gap-3 py-2.5 pl-4 pr-4 text-left transition-colors sm:pl-6 lg:pl-8',
                              active ? 'bg-primary/5' : 'hover:bg-muted/40',
                            )}
                          >
                            {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
                            <span className="w-12 shrink-0 text-center">
                              <span className="block text-[10px] uppercase text-muted-foreground">{formatDate(start, 'MMM')}</span>
                              <span className="block text-lg font-medium leading-tight tabular-nums text-foreground">{formatDate(start, 'd')}</span>
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={cn('block truncate text-sm font-medium', active ? 'text-primary' : 'text-foreground')}>{r.title}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {formatSchoolTime(start)} · {[r.class_name, r.subject_name && tidy(r.subject_name)].filter(Boolean).join(' · ')}
                              </span>
                              {isAdmin && r.teacher_name && <span className="block truncate text-xs text-muted-foreground">{tidy(r.teacher_name)}</span>}
                            </span>
                            <span
                              className={cn('mt-1.5 size-2 shrink-0 rounded-full', TONE_FILL[stuck ? 'warning' : STATUS_DOT[r.status]])}
                              aria-label={stuck ? 'Approved, not created' : EXTRA_CLASS_STATUS_LABEL[r.status]}
                            />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <section className="min-w-0 py-5 lg:min-h-0 lg:overflow-y-auto lg:pl-8 lg:pr-1">
                {requesting ? (
                  <RequestForm onClose={() => setRequesting(false)} />
                ) : selected ? (
                  <RequestDetail key={selected.id} request={selected} isAdmin={isAdmin} isMine={selected.requested_by === user?.id} />
                ) : (
                  <div className="py-12 text-center">
                    <p className="text-sm text-muted-foreground">
                      {isAdmin
                        ? 'Teachers request these when they need a session outside the timetable.'
                        : 'Ask for one when you need a session outside the timetable: revision before a test, or a missed lesson.'}
                    </p>
                    {!isAdmin && (
                      <Button size="sm" className="mt-4" onClick={() => setRequesting(true)}>
                        <CalendarPlus />
                        Request a class
                      </Button>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </Band>
      </div>
    </div>
  )
}

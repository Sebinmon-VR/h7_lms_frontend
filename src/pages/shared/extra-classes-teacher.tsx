import { CalendarPlus, Check, Undo2, X } from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import type { ExtraClassOut } from '@/api/types'
import { useCancelExtraClass, useExtraClasses, useRequestExtraClass } from '@/queries/classes.queries'
import { useMyClasses } from '@/queries/teacher.queries'
import { cn } from '@/lib/cn'
import { formatDate, parseApiDateTime } from '@/lib/datetime'
import { tidyName as tidy } from '@/lib/names'
import { formatSchoolTime } from '@/lib/school-time'
import { awaitingScheduling } from '@/lib/school'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FormError } from '@/components/forms/field'
import { JoinClassButton, TeacherClassControls } from '@/components/domain/live-class'
import { Band, Figure, Figures, WorkspaceHeader } from '@/components/layout/workspace'
import {
  DetailHeader,
  DetailSection,
  Fact,
  Facts,
  ListEmpty,
  ListItem,
  ListPane,
  ListSearch,
  SplitView,
} from '@/components/layout/split-view'

/**
 * Extra classes, as a teacher sees them: the classes they asked for outside the timetable on
 * the left - coming up, waiting, past - and the one picked on the right, with where it has
 * got to, what the office said, and the way into it once it exists.
 *
 * The same List + detail layout as My classes and Homework, flat: ruled rows and plain
 * coloured words. The admin's approval screen is the other half of
 * pages/shared/extra-classes.tsx and is not touched by this one.
 */

type Group = 'coming' | 'waiting' | 'past'

const whenOf = (r: ExtraClassOut) => parseApiDateTime(r.scheduled_time) ?? new Date(r.scheduled_time)
const endOf = (r: ExtraClassOut) => new Date(whenOf(r).getTime() + r.duration_minutes * 60_000)

/** Where a request stands, for a teacher. "Created" is the office having made the class. */
function stage(r: ExtraClassOut, now: number): { group: Group; label: string; className: string } {
  if (r.status === 'REJECTED') return { group: 'past', label: 'Turned down', className: 'font-medium text-danger' }
  if (r.status === 'CANCELLED') return { group: 'past', label: 'Withdrawn', className: 'text-muted-foreground' }
  if (r.status === 'PENDING') return { group: 'waiting', label: 'Waiting for approval', className: 'font-medium text-warning' }
  if (awaitingScheduling(r)) return { group: 'waiting', label: 'Approved, being set up', className: 'font-medium text-info' }
  if (endOf(r).getTime() < now) return { group: 'past', label: 'Held', className: 'text-muted-foreground' }
  if (whenOf(r).getTime() <= now) return { group: 'coming', label: 'On now', className: 'font-semibold text-success' }
  return { group: 'coming', label: 'Coming up', className: 'text-success' }
}

/** "today", "tomorrow", "in 3 days", "2 days ago". */
function relative(date: Date, now: number): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(date) - day(new Date(now))) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${-days} days ago`
}

const GROUP_LABEL: Record<Group, string> = { coming: 'Coming up', waiting: 'Waiting', past: 'Past' }

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-border bg-muted/40 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  )
}

// ================================================================== request

function RequestForm({ onClose, onSent }: { onClose: () => void; onSent: (r: ExtraClassOut) => void }) {
  const request = useRequestExtraClass()
  const myClasses = useMyClasses()
  const [pair, setPair] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [when, setWhen] = React.useState('')
  const [duration, setDuration] = React.useState('45')
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  // Only the class and subject pairs this teacher takes: the backend refuses any other.
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
      const sent = await request.mutateAsync({
        title: title.trim(),
        class_id: Number(classId),
        subject_id: Number(subjectId),
        scheduled_time: `${when}:00`,
        duration_minutes: Number(duration) || 45,
        reason: reason.trim() || null,
      })
      onSent(sent)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not send the request.')
    }
  }

  return (
    <>
      <DetailHeader
        title="Request a class"
        sub="The office reviews it and makes the class. The reason is what they read."
        actions={
          <Button variant="ghost" size="sm" icon={<X />} onClick={onClose} aria-label="Close the form" />
        }
      />
      <div className="max-w-2xl space-y-4 px-5 py-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="extra_pair" label="Class and subject" required>
            <Select value={pair} onValueChange={setPair}>
              <SelectTrigger id="extra_pair">
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
          <Field id="extra_title" label="Title" required>
            <Input id="extra_title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Revision before the unit test" />
          </Field>
          <Field id="extra_when" label="When" required>
            <Input id="extra_when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field id="extra_duration" label="Minutes">
            <Input id="extra_duration" type="number" min={5} max={480} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
          <Field id="extra_reason" label="Why it is needed" className="sm:col-span-2">
            <Textarea
              id="extra_reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Two lessons were lost to sports day; the unit test is on Monday."
            />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} loading={request.isPending}>
            Send request
          </Button>
        </div>
      </div>
    </>
  )
}

// =================================================================== detail

/** Requested, approved, created: where it has got to, in one line. A turn-down stops it. */
function Progress({ request }: { request: ExtraClassOut }) {
  const rejected = request.status === 'REJECTED'
  const withdrawn = request.status === 'CANCELLED'
  const approved = request.status === 'APPROVED' || request.status === 'SCHEDULED'
  const created = !!(request.created_meeting_id || request.created_session_id) || request.status === 'SCHEDULED'
  const steps: { label: string; state: 'done' | 'now' | 'todo' | 'stopped' }[] = [
    { label: 'Requested', state: 'done' },
    {
      label: rejected ? 'Turned down' : withdrawn ? 'Withdrawn' : 'Approved',
      state: rejected || withdrawn ? 'stopped' : approved ? 'done' : 'now',
    },
    { label: 'Class created', state: rejected || withdrawn ? 'todo' : created ? 'done' : approved ? 'now' : 'todo' },
  ]
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-5 py-3 text-sm" aria-label="Progress">
      {steps.map((step, i) => (
        <li key={step.label} className="flex items-center gap-2">
          {i > 0 && <span className={cn('h-px w-6', step.state === 'todo' ? 'bg-border' : 'bg-muted-foreground/40')} aria-hidden />}
          <span
            className={cn(
              'grid size-4 place-items-center rounded-full text-[10px]',
              step.state === 'done' && 'bg-success text-white',
              step.state === 'now' && 'border-2 border-primary',
              step.state === 'todo' && 'border border-border',
              step.state === 'stopped' && 'bg-danger text-white',
            )}
            aria-hidden
          >
            {step.state === 'done' && <Check className="size-2.5" strokeWidth={3} />}
            {step.state === 'stopped' && <X className="size-2.5" strokeWidth={3} />}
          </span>
          <span
            className={cn(
              step.state === 'todo' && 'text-muted-foreground',
              step.state === 'now' && 'font-medium text-primary',
              step.state === 'stopped' && 'font-medium text-danger',
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

function RequestDetail({ request, now }: { request: ExtraClassOut; now: number }) {
  const cancel = useCancelExtraClass()
  const start = whenOf(request)
  const end = endOf(request)
  const s = stage(request, now)
  const canWithdraw = request.status === 'PENDING' || request.status === 'APPROVED'
  const meetingId = request.created_meeting_id ?? null
  // The class's controls only near its time: "Open the class" starts it there and then, which
  // three days early would open a class nobody is coming to.
  const soon = start.getTime() - now <= 30 * 60_000
  const live = meetingId != null && s.group === 'coming' && soon
  const madeNotYet = meetingId != null && s.group === 'coming' && !soon

  return (
    <>
      <DetailHeader
        title={request.title}
        badges={<span className={cn('text-xs', s.className)}>{s.label}</span>}
        sub={
          <>
            {[request.class_name, request.subject_name && tidy(request.subject_name)].filter(Boolean).join(' · ')} ·{' '}
            <span className="text-foreground">
              {formatDate(start, 'EEE d MMM')} · {formatSchoolTime(start)}–{formatSchoolTime(end)}
            </span>{' '}
            ({relative(start, now)})
          </>
        }
        actions={
          canWithdraw ? (
            <Button
              variant="outline"
              size="sm"
              icon={<Undo2 />}
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(request.id, {
                  onError: (error) => toast.error((error as { message?: string })?.message ?? 'It could not be withdrawn.'),
                })
              }
            >
              Withdraw
            </Button>
          ) : undefined
        }
      />

      <Progress request={request} />

      {/* Once the office has made it: the clock and the way in, as on Live classes. */}
      {live && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-success/5 px-5 py-3">
          <span className="text-sm font-medium text-foreground">Your class</span>
          <TeacherClassControls meetingId={meetingId} />
          <JoinClassButton meetingId={meetingId} />
        </div>
      )}
      {madeNotYet && (
        <p className="border-b border-border px-5 py-3 text-sm text-muted-foreground">
          The class is made and on your calendar. Its <span className="text-foreground">Open</span> and{' '}
          <span className="text-foreground">Join</span> buttons appear here 30 minutes before it starts.
        </p>
      )}

      <Facts>
        <Fact label="Class">{request.class_name ?? '—'}</Fact>
        <Fact label="Subject">{request.subject_name ? tidy(request.subject_name) : '—'}</Fact>
        <Fact label="Length">{request.duration_minutes} minutes</Fact>
        <Fact label="Asked on">{request.created_at ? formatDate(request.created_at, 'd MMM yyyy') : '—'}</Fact>
        <Fact label="Decided">
          {request.decided_at ? (
            <>
              {formatDate(request.decided_at, 'd MMM')}
              {request.decided_by_name && <span className="text-muted-foreground"> · {tidy(request.decided_by_name)}</span>}
            </>
          ) : (
            <span className="text-muted-foreground">Not yet</span>
          )}
        </Fact>
        <Fact label="Starts">{formatSchoolTime(start)}, {relative(start, now)}</Fact>
      </Facts>

      {request.reason && (
        <DetailSection title="Why it is needed">
          <p className="whitespace-pre-wrap px-5 py-3 text-sm text-foreground">{request.reason}</p>
        </DetailSection>
      )}

      <DetailSection title="The office's reply">
        {request.decision_note ? (
          <p className={cn('whitespace-pre-wrap px-5 py-3 text-sm', request.status === 'REJECTED' ? 'text-danger' : 'text-foreground')}>
            {request.decision_note}
          </p>
        ) : (
          <p className="px-5 py-3 text-sm text-muted-foreground">
            {request.status === 'PENDING'
              ? 'Nothing yet. You will see their decision here.'
              : awaitingScheduling(request)
                ? 'Approved. The office still has to make the class; it appears on your calendar when they do.'
                : 'No note.'}
          </p>
        )}
      </DetailSection>
    </>
  )
}

// ===================================================================== page

export function TeacherExtraClasses() {
  const requests = useExtraClasses({ mineOnly: true })
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = React.useState('')
  const [requesting, setRequesting] = React.useState(false)
  const now = Date.now()

  const all = requests.data ?? []
  const staged = all.map((r) => ({ r, s: stage(r, now) }))
  const counts = {
    coming: staged.filter((x) => x.s.group === 'coming').length,
    waiting: staged.filter((x) => x.s.group === 'waiting').length,
    held: staged.filter((x) => x.s.label === 'Held').length,
    turnedDown: staged.filter((x) => x.r.status === 'REJECTED').length,
  }

  const q = search.trim().toLowerCase()
  const visible = staged.filter(
    ({ r }) => !q || [r.title, r.class_name, r.subject_name, r.reason].some((v) => v?.toLowerCase().includes(q)),
  )
  // Coming up and waiting soonest first; the past newest first.
  const groups: Group[] = ['coming', 'waiting', 'past']
  const ordered = groups.map((g) => ({
    group: g,
    rows: visible
      .filter((x) => x.s.group === g)
      .sort((a, b) =>
        g === 'past' ? whenOf(b.r).getTime() - whenOf(a.r).getTime() : whenOf(a.r).getTime() - whenOf(b.r).getTime(),
      ),
  }))
  const flat = ordered.flatMap((g) => g.rows)

  const picked = Number(params.get('request'))
  const selected = flat.find((x) => x.r.id === picked)?.r ?? flat[0]?.r ?? null
  const pick = (id: number) => {
    setRequesting(false)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('request', String(id))
        return next
      },
      { replace: true },
    )
  }

  return (
    <>
      <WorkspaceHeader
        title="Extra Classes"
        description="Classes you asked for outside the timetable: revision, a missed lesson, catch-up."
        actions={
          <Button size="sm" icon={<CalendarPlus />} onClick={() => setRequesting(true)}>
            Request a class
          </Button>
        }
      />

      <Figures>
        <Figure label="Coming up" value={requests.isPending ? '…' : String(counts.coming)} context="classes made" tone="success" />
        <Figure label="Waiting" value={requests.isPending ? '…' : String(counts.waiting)} context="for the office" tone="warning" />
        <Figure label="Held" value={requests.isPending ? '…' : String(counts.held)} tone="neutral" />
        <Figure label="Turned down" value={requests.isPending ? '…' : String(counts.turnedDown)} tone="danger" />
      </Figures>

      <Band className="border-b border-border px-0 sm:px-0 lg:px-0">
        <div className="max-lg:[&>div]:grid-cols-1 lg:h-[calc(100vh-16rem)] lg:min-h-[30rem]">
          <SplitView
            list={
              <ListPane
                toolbar={<ListSearch value={search} onChange={setSearch} placeholder="Search title, class or reason" />}
                footer={`${all.length} ${all.length === 1 ? 'request' : 'requests'}`}
              >
                {requests.isPending ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 rounded" />
                    ))}
                  </div>
                ) : requests.isError ? (
                  <ListEmpty>Your requests could not be loaded. Try again in a moment.</ListEmpty>
                ) : flat.length === 0 ? (
                  <ListEmpty>{q ? 'Nothing matches that search.' : 'You have not asked for an extra class yet.'}</ListEmpty>
                ) : (
                  ordered.map(
                    ({ group, rows }) =>
                      rows.length > 0 && (
                        <React.Fragment key={group}>
                          <GroupLabel>{GROUP_LABEL[group]}</GroupLabel>
                          {rows.map(({ r, s }) => {
                            const start = whenOf(r)
                            return (
                              <ListItem
                                key={r.id}
                                active={!requesting && selected?.id === r.id}
                                onClick={() => pick(r.id)}
                                title={r.title}
                                sub={`${formatDate(start, 'EEE d MMM')} · ${formatSchoolTime(start)} · ${r.class_name ?? ''}`}
                                muted={group === 'past'}
                                right={<span className={s.className}>{group === 'coming' ? relative(start, now) : s.label}</span>}
                              />
                            )
                          })}
                        </React.Fragment>
                      ),
                  )
                )}
              </ListPane>
            }
            detail={
              requesting ? (
                <RequestForm
                  onClose={() => setRequesting(false)}
                  onSent={(sent) => {
                    setRequesting(false)
                    pick(sent.id)
                  }}
                />
              ) : requests.isPending ? (
                <div className="space-y-3 p-5">
                  <Skeleton className="h-10 w-64 rounded" />
                  <Skeleton className="h-24 rounded" />
                </div>
              ) : selected ? (
                <RequestDetail key={selected.id} request={selected} now={now} />
              ) : (
                <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                  <p className="max-w-md text-sm text-muted-foreground">
                    Ask for one when you need a session outside the timetable: revision before a test, or a lesson that
                    was missed.
                  </p>
                  <Button size="sm" icon={<CalendarPlus />} onClick={() => setRequesting(true)}>
                    Request a class
                  </Button>
                </div>
              )
            }
          />
        </div>
      </Band>
    </>
  )
}

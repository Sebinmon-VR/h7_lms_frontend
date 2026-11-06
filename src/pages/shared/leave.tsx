import {
  CalendarOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  PlaneTakeoff,
  Undo2,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react'
import * as React from 'react'

import type {
  AffectedPeriod,
  TeacherSummaryOut,
  LeaveDayPart,
  LeaveRequestOut,
  LeaveStatus,
  LeaveType,
  ScheduledPeriod,
} from '@/api/types'
import {
  useAffectedPeriods,
  useApplyForLeave,
  useDecideLeave,
  useLeaveOnDay,
  useLeaveQueue,
  useMyLeave,
  useMyLeaveBalance,
  useWithdrawLeave,
} from '@/queries/academics.queries'
import { useCoverDay, useCoverMutations, useCoverStaff } from '@/queries/cover.queries'
import { useAuth } from '@/providers/auth-provider'
import { cn } from '@/lib/cn'
import { formatDate, shiftApiDate, todayApiDate } from '@/lib/datetime'
import { countLabel } from '@/lib/format'
import {
  DAY_PARTS,
  DAY_PART_LABEL,
  LEAVE_STATUS_LABEL,
  LEAVE_TYPES,
  LEAVE_TYPE_LABEL,
  leaveTypeRows,
} from '@/lib/school'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Field, FormError } from '@/components/forms/field'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import {
  Band,
  Figure,
  Figures,
  TabStrip,
  TONE_FILL,
  WorkspaceHeader,
  type Tone,
} from '@/components/layout/workspace'

/**
 * Staff leave and substitutes — applying, deciding, and covering the day.
 *
 * The field that makes this screen worth having is `affected_periods`: the
 * periods the applicant was timetabled to take across those dates, snapshotted
 * when they applied. It is what an approver is actually agreeing to cover, and
 * it is listed in full beside every request rather than hidden behind a click.
 *
 * `taken_days` and `pending_days` are rendered as two figures and never summed.
 * One combined figure is how two teachers get approved for the same week.
 *
 * Laid out like the other admin workspaces: white bands edge to edge, a list
 * on the left and the selected item on the right, forms inside the page.
 */

type TabKey = 'requests' | 'cover' | 'mine'

const STATUS_DOT: Record<LeaveStatus, Tone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
  CANCELLED: 'neutral',
}

/** Shorter controls for the in-page forms, which are read and filled at a glance. */
const COMPACT_INPUT = 'h-8 px-3 py-1 text-sm'
const COMPACT_FIELD = 'space-y-1'

function StatusTag({ status }: { status: LeaveStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn('size-2 shrink-0 rounded-full', TONE_FILL[STATUS_DOT[status]])} aria-hidden />
      {LEAVE_STATUS_LABEL[status]}
    </span>
  )
}

function dateRange(request: LeaveRequestOut, pattern = 'd MMM') {
  return request.end_date === request.start_date
    ? formatDate(request.start_date, pattern)
    : `${formatDate(request.start_date, pattern)} – ${formatDate(request.end_date, pattern)}`
}

function daysLabel(request: LeaveRequestOut) {
  const days = `${request.total_days} ${request.total_days === 1 ? 'day' : 'days'}`
  return request.day_part === 'FULL_DAY' ? days : `${days}, ${DAY_PART_LABEL[request.day_part].toLowerCase()}`
}

function periodTime(p: ScheduledPeriod) {
  return new Date(p.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** The periods of a day whose teacher is on approved leave and nobody has taken over. */
function uncovered(periods: ScheduledPeriod[], away: LeaveRequestOut[]) {
  const awayIds = new Set(away.map((r) => r.teacher_id))
  return periods.filter(
    (p) => !p.entry.substitution && p.entry.teacher_id != null && awayIds.has(p.entry.teacher_id),
  )
}

/** A heading inside a pane: small, ruled off from what is above it. */
function PaneHeading({ children, trailing }: { children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</h3>
      {trailing}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 first:pl-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-foreground">{children}</p>
    </div>
  )
}

/** A flat line of quiet text standing in for an empty list. */
function EmptyLine({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** The filter row at the top of a tab: status choice on the left, a count on the right. */
function FilterBar({ children, trailing }: { children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <Band className="border-b border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 py-2.5">
        {children}
        {trailing && <span className="text-xs text-muted-foreground">{trailing}</span>}
      </div>
    </Band>
  )
}

// ============================================================ request panes

/** Every period the leave takes away, with who is taking it. */
function PeriodsTable({ request }: { request: LeaveRequestOut }) {
  const subFor = (p: AffectedPeriod) =>
    request.cover_plan?.find((c) => c.timetable_entry_id === p.timetable_entry_id)

  if (request.affected_periods.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Not timetabled on those dates, so nothing needs covering.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto border-y border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Date</th>
            <th className="px-3 py-2 text-left font-medium">Time</th>
            <th className="px-3 py-2 text-left font-medium">Class</th>
            <th className="px-3 py-2 text-left font-medium">Subject</th>
            <th className="px-3 py-2 text-left font-medium">Substitute</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {request.affected_periods.map((period, i) => {
            const plan = subFor(period)
            return (
              <tr key={i}>
                <td className="whitespace-nowrap px-3 py-2">{formatDate(period.date, 'EEE d MMM')}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                  {[period.start_time, period.end_time].filter(Boolean).join('–') || '—'}
                </td>
                <td className="px-3 py-2">{period.class_name ?? '—'}</td>
                <td className="px-3 py-2">{period.subject_name ?? '—'}</td>
                <td className="px-3 py-2">
                  {plan?.substitute_teacher_name ? (
                    <span className="inline-flex items-center gap-1.5 text-foreground">
                      <UserCheck className="size-3.5 text-success" />
                      {plan.substitute_teacher_name}
                    </span>
                  ) : plan ? (
                    <span className="text-warning">Not chosen yet</span>
                  ) : (
                    <span className="text-muted-foreground">No cover asked</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Approve or reject, right under the request. A rejection needs a reason. */
function DecisionPanel({ request }: { request: LeaveRequestOut }) {
  const decide = useDecideLeave()
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setNote('')
    setError(null)
  }, [request.id])

  const submit = async (approve: boolean) => {
    // The backend requires a note on a rejection, and rightly: the applicant
    // has to be able to read why.
    if (!approve && !note.trim()) {
      setError('A rejection needs a reason the applicant can read.')
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
    <div className="space-y-3 border-t border-border pt-4">
      <PaneHeading>Decision</PaneHeading>
      <FormError message={error} />
      <Textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note for the applicant (needed when rejecting)"
        aria-label="Decision note"
        className="text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={decide.isPending && decide.variables?.body.approve} onClick={() => submit(true)}>
          <CheckCircle2 />
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={decide.isPending && !decide.variables?.body.approve}
          onClick={() => submit(false)}
        >
          <XCircle />
          Reject
        </Button>
        <span className="text-xs text-muted-foreground">
          Approving commits the school to covering {countLabel(request.affected_periods.length, 'period')}
        </span>
      </div>
    </div>
  )
}

/** The selected request in full: dates, reason, every period it takes away, the decision. */
function RequestDetail({
  request,
  showTeacher,
  actions,
  footer,
}: {
  request: LeaveRequestOut
  showTeacher: boolean
  actions?: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <section className="min-w-0 space-y-5 py-5 lg:pl-8" aria-label="Leave request">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-medium tracking-tight text-foreground">
              {showTeacher ? (request.teacher_name ?? `Teacher ${request.teacher_id}`) : LEAVE_TYPE_LABEL[request.leave_type]}
            </h2>
            <StatusTag status={request.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {dateRange(request, 'EEE d MMM yyyy')} · {daysLabel(request)}
          </p>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      <div className="grid grid-cols-2 gap-y-3 border-y border-border py-3 sm:grid-cols-4 sm:divide-x sm:divide-border">
        <Fact label="Kind">{LEAVE_TYPE_LABEL[request.leave_type]}</Fact>
        <Fact label="Periods">{request.affected_periods.length}</Fact>
        <Fact label="Applied">{request.created_at ? formatDate(request.created_at, 'd MMM') : '—'}</Fact>
        <Fact label="Contact">{request.contact_during_leave || '—'}</Fact>
      </div>

      {request.reason && (
        <div className="space-y-1">
          <PaneHeading>Reason</PaneHeading>
          <p className="text-sm text-foreground">{request.reason}</p>
        </div>
      )}

      {request.decision_note && (
        <div className="border-l-2 border-border pl-3">
          <p className="text-xs text-muted-foreground">
            {request.decided_by_name ?? 'Decided'}
            {request.decided_at ? ` · ${formatDate(request.decided_at, 'd MMM')}` : ''}
          </p>
          <p className="text-sm text-foreground">{request.decision_note}</p>
        </div>
      )}

      <div className="space-y-2">
        <PaneHeading>Periods to cover</PaneHeading>
        <PeriodsTable request={request} />
      </div>

      {(request.cover_gaps?.length ?? 0) > 0 && (
        <div className="border-l-2 border-warning bg-warning/5 px-3 py-2 text-sm">
          <p className="font-medium text-foreground">Still needs a substitute</p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {request.cover_gaps!.map((gap, i) => (
              <li key={i}>
                {formatDate(gap.date, 'EEE d MMM')} · {gap.class_name ?? 'Class'} — {gap.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {footer}
    </section>
  )
}

/**
 * Requests on the left, the chosen one on the right. `editor`, when set,
 * takes the right-hand pane instead, like the in-page forms elsewhere.
 */
function RequestMasterDetail({
  rows,
  showTeacher,
  actions,
  footer,
  editor,
  empty,
}: {
  rows: LeaveRequestOut[]
  showTeacher: boolean
  actions?: (request: LeaveRequestOut) => React.ReactNode
  footer?: (request: LeaveRequestOut) => React.ReactNode
  editor?: React.ReactNode
  empty: React.ReactNode
}) {
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null

  return (
    <Band className="border-b border-border">
      <div className="grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:divide-x lg:divide-border">
        <ul className="-mx-4 divide-y divide-border border-b border-border sm:-mx-6 lg:mx-0 lg:-ml-8 lg:border-b-0">
          {rows.length === 0 ? (
            <li>{empty}</li>
          ) : (
            rows.map((request) => {
              const active = !editor && selected?.id === request.id
              return (
                <li key={request.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(request.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'relative flex w-full items-center gap-3 px-6 py-3 text-left transition-colors lg:pl-8',
                      active ? 'bg-primary/5' : 'hover:bg-muted/40',
                    )}
                  >
                    {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
                    <span className={cn('size-2 shrink-0 rounded-full', TONE_FILL[STATUS_DOT[request.status]])} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm font-medium', active ? 'text-primary' : 'text-foreground')}>
                        {showTeacher ? (request.teacher_name ?? `Teacher ${request.teacher_id}`) : LEAVE_TYPE_LABEL[request.leave_type]}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {showTeacher && `${LEAVE_TYPE_LABEL[request.leave_type]} · `}
                        {dateRange(request)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm tabular-nums text-foreground">{request.total_days}d</span>
                      <span className="block text-xs tabular-nums text-muted-foreground">
                        {request.affected_periods.length} per.
                      </span>
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>

        {editor ? (
          <section className="min-w-0 py-5 lg:pl-8">{editor}</section>
        ) : selected ? (
          <RequestDetail
            key={selected.id}
            request={selected}
            showTeacher={showTeacher}
            actions={actions?.(selected)}
            footer={footer?.(selected)}
          />
        ) : (
          <div className="hidden items-center justify-center py-16 text-sm text-muted-foreground lg:flex">
            Nothing selected
          </div>
        )}
      </div>
    </Band>
  )
}

function MasterDetailSkeleton() {
  return (
    <Band className="border-b border-border py-4">
      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </Band>
  )
}

// ================================================================= applying

/**
 * The classes this leave takes away, one row each. Ticked rows need a substitute, and the
 * applicant can choose who takes each one. The choice applies to the leave's own days once it
 * is approved; until then the timetable is unchanged.
 */
function CoverClasses({
  periods,
  loading,
  value,
  onChange,
  substitutes,
  onSubstituteChange,
  staff,
  selfId,
}: {
  periods: AffectedPeriod[]
  loading: boolean
  value: number[]
  onChange: (ids: number[]) => void
  substitutes: Record<number, string>
  onSubstituteChange: (entryId: number, teacherId: string) => void
  staff: TeacherSummaryOut[]
  selfId: number | undefined
}) {
  const groups = React.useMemo(() => {
    const map = new Map<number, { id: number; label: string; count: number }>()
    for (const period of periods) {
      if (period.timetable_entry_id == null) continue
      const existing = map.get(period.timetable_entry_id)
      if (existing) {
        existing.count += 1
      } else {
        map.set(period.timetable_entry_id, {
          id: period.timetable_entry_id,
          label: `${period.class_name ?? 'Class'} · ${period.subject_name ?? 'Period'}`,
          count: 1,
        })
      }
    }
    return [...map.values()]
  }, [periods])

  const options = staff.filter((t) => t.id !== selfId)

  if (loading) return <Skeleton className="h-16 w-full" />
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">You have no periods on these dates, so there is nothing to cover.</p>
  }

  return (
    <ul className="divide-y divide-border border-y border-border">
      {groups.map((group) => {
        const ticked = value.includes(group.id)
        return (
          <li key={group.id} className="flex flex-col gap-2 py-2 text-sm sm:flex-row sm:items-center">
            <label className="flex flex-1 items-center gap-3">
              <Checkbox
                checked={ticked}
                onCheckedChange={(checked) =>
                  onChange(checked === true ? [...value, group.id] : value.filter((id) => id !== group.id))
                }
              />
              <span className="flex-1">{group.label}</span>
              <span className="text-xs text-muted-foreground">{countLabel(group.count, 'period')}</span>
            </label>
            {ticked && (
              <Select value={substitutes[group.id] || undefined} onValueChange={(v) => onSubstituteChange(group.id, v)}>
                <SelectTrigger className={cn(COMPACT_INPUT, 'sm:w-52')} aria-label={`Who covers ${group.label}`}>
                  <SelectValue placeholder="Choose substitute" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((teacher) => (
                    <SelectItem key={teacher.id} value={String(teacher.id)}>
                      {teacher.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** A labelled group of the form: what it is on the left, its fields on the right. */
function FormGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-6 gap-y-2 border-t border-border pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  )
}

function ApplyForm({ onClose }: { onClose: () => void }) {
  const apply = useApplyForLeave()
  const [leaveType, setLeaveType] = React.useState<LeaveType>('CASUAL')
  const [dayPart, setDayPart] = React.useState<LeaveDayPart>('FULL_DAY')
  const [startDate, setStartDate] = React.useState(todayApiDate())
  const [endDate, setEndDate] = React.useState(todayApiDate())
  const [reason, setReason] = React.useState('')
  const [contact, setContact] = React.useState('')
  const [coverIds, setCoverIds] = React.useState<number[]>([])
  const [substitutes, setSubstitutes] = React.useState<Record<number, string>>({})
  const [error, setError] = React.useState<string | null>(null)
  const { role, user } = useAuth()
  const { staff } = useCoverStaff(role === 'ADMIN')

  /**
   * A half-day request covers ONE date, and the backend refuses anything else.
   * Rather than validating it after the fact, picking a half-day collapses the
   * range — the dates then say what the request means.
   */
  const halfDay = dayPart !== 'FULL_DAY'
  React.useEffect(() => {
    if (halfDay) setEndDate(startDate)
  }, [halfDay, startDate])

  // Every class the teacher has in these dates starts ticked; they untick what needs no cover.
  const coverEnd = halfDay ? startDate : endDate
  const affected = useAffectedPeriods(startDate, coverEnd)
  React.useEffect(() => {
    const ids = new Set<number>()
    for (const period of affected.data ?? []) {
      if (period.timetable_entry_id != null) ids.add(period.timetable_entry_id)
    }
    setCoverIds([...ids])
  }, [affected.data])

  const submit = async () => {
    if (endDate < startDate) {
      setError('The last day cannot fall before the first.')
      return
    }
    setError(null)
    try {
      await apply.mutateAsync({
        leave_type: leaveType,
        start_date: startDate,
        end_date: halfDay ? startDate : endDate,
        day_part: dayPart,
        reason: reason.trim() || null,
        contact_during_leave: contact.trim() || null,
        cover_plan: coverIds.map((id) => ({
          timetable_entry_id: id,
          substitute_teacher_id: substitutes[id] ? Number(substitutes[id]) : null,
        })),
      })
      onClose()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not submit the request.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-foreground">Apply for leave</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Your periods on these dates are attached, so whoever approves it sees what needs covering
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close the form">
          <X />
        </Button>
      </div>

      <FormError message={error} />

      <FormGroup title="Leave" hint={halfDay ? 'A half day covers one date' : undefined}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="leave_type" label="Kind of leave" required className={COMPACT_FIELD}>
            <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
              <SelectTrigger id="leave_type" className={COMPACT_INPUT}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {LEAVE_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="day_part" label="How much" className={COMPACT_FIELD}>
            <Select value={dayPart} onValueChange={(v) => setDayPart(v as LeaveDayPart)}>
              <SelectTrigger id="day_part" className={COMPACT_INPUT}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_PARTS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {DAY_PART_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="leave_start" label="From" required className={COMPACT_FIELD}>
            <Input
              id="leave_start"
              type="date"
              className={COMPACT_INPUT}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field id="leave_end" label="To" required className={COMPACT_FIELD}>
            <Input
              id="leave_end"
              type="date"
              className={COMPACT_INPUT}
              value={halfDay ? startDate : endDate}
              disabled={halfDay}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>
      </FormGroup>

      <FormGroup title="Details" hint="The contact number is optional">
        <Field id="leave_reason" label="Reason" className={COMPACT_FIELD}>
          <Textarea id="leave_reason" rows={2} className="text-sm" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Field id="leave_contact" label="Contact while away" className={COMPACT_FIELD}>
          <Input id="leave_contact" className={COMPACT_INPUT} value={contact} onChange={(e) => setContact(e.target.value)} />
        </Field>
      </FormGroup>

      <FormGroup
        title="Cover"
        hint="Untick a class that needs no cover. A substitute takes over only on your leave days, once approved"
      >
        <CoverClasses
          periods={affected.data ?? []}
          loading={affected.isPending && !!startDate}
          value={coverIds}
          onChange={setCoverIds}
          substitutes={substitutes}
          onSubstituteChange={(entryId, teacherId) => setSubstitutes((prev) => ({ ...prev, [entryId]: teacherId }))}
          staff={staff}
          selfId={user?.id}
        />
      </FormGroup>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} loading={apply.isPending}>
          Submit request
        </Button>
      </div>
    </div>
  )
}

// ===================================================================== tabs

function RequestsTab() {
  const [status, setStatus] = React.useState<'ALL' | LeaveStatus>('PENDING')
  const requests = useLeaveQueue({ status: status === 'ALL' ? undefined : status })

  return (
    <>
      <FilterBar trailing={requests.data ? countLabel(requests.data.length, 'request') : undefined}>
        <Segmented
          size="sm"
          layoutId="leave-queue-status"
          aria-label="Show requests"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'PENDING', label: 'Awaiting decision' },
            { value: 'APPROVED', label: 'Approved' },
            { value: 'REJECTED', label: 'Rejected' },
            { value: 'ALL', label: 'All' },
          ]}
        />
      </FilterBar>

      <QueryBoundary query={requests} loading={<MasterDetailSkeleton />}>
        {(rows) => (
          <RequestMasterDetail
            key={status}
            rows={rows}
            showTeacher
            footer={(request) => (request.status === 'PENDING' ? <DecisionPanel request={request} /> : null)}
            empty={
              <EmptyLine
                title={status === 'PENDING' ? 'Nothing waiting' : 'No requests here'}
                hint={status === 'PENDING' ? 'Every leave request has been decided' : 'Try a different filter'}
              />
            }
          />
        )}
      </QueryBoundary>
    </>
  )
}

/** The applicant's year so far: days taken and days pending for each kind, never summed. */
function BalanceStrip() {
  const balance = useMyLeaveBalance()
  if (!balance.data) return null
  const rows = leaveTypeRows(balance.data)
  if (rows.length === 0) return null

  return (
    <Band className="border-b border-border">
      <div className="flex items-stretch gap-0 overflow-x-auto py-2.5 text-sm [scrollbar-width:none]">
        <span className="flex shrink-0 items-center pr-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          This year
        </span>
        <div className="flex divide-x divide-border border-l border-border">
          {rows.map((row) => (
            <span key={row.type} className="shrink-0 px-4">
              <span className="text-muted-foreground">{row.label}</span>{' '}
              <span className="font-medium tabular-nums text-foreground">{row.taken}</span>
              {row.pending > 0 && <span className="tabular-nums text-warning"> +{row.pending} pending</span>}
            </span>
          ))}
        </div>
      </div>
    </Band>
  )
}

function MyLeaveTab({ applying, setApplying }: { applying: boolean; setApplying: (v: boolean) => void }) {
  const [status, setStatus] = React.useState<'ALL' | LeaveStatus>('ALL')
  const requests = useMyLeave(status === 'ALL' ? undefined : status)
  const withdraw = useWithdrawLeave()

  return (
    <>
      <BalanceStrip />
      <FilterBar trailing={requests.data ? countLabel(requests.data.length, 'request') : undefined}>
        <Segmented
          size="sm"
          layoutId="my-leave-status"
          aria-label="Show my requests"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'PENDING', label: 'Awaiting' },
            { value: 'APPROVED', label: 'Approved' },
            { value: 'REJECTED', label: 'Rejected' },
          ]}
        />
      </FilterBar>

      <QueryBoundary query={requests} loading={<MasterDetailSkeleton />}>
        {(rows) => (
          <RequestMasterDetail
            key={status}
            rows={rows}
            showTeacher={false}
            editor={applying ? <ApplyForm onClose={() => setApplying(false)} /> : undefined}
            actions={(request) =>
              request.status === 'PENDING' ? (
                <Button
                  variant="outline"
                  size="sm"
                  loading={withdraw.isPending}
                  onClick={() => withdraw.mutate(request.id)}
                >
                  <Undo2 />
                  Withdraw
                </Button>
              ) : null
            }
            empty={
              <EmptyLine
                title="No leave requests"
                hint="Applying attaches the periods you were timetabled for, so whoever approves it knows what needs covering"
              />
            }
          />
        )}
      </QueryBoundary>
    </>
  )
}

/**
 * The substitute form: one period, one date, one teacher. Separate from the leave form, because
 * a substitute is not always for leave - a trip, a meeting, an exam duty. Only the chosen date
 * changes; every other day keeps the usual timetable.
 */
function SubstituteForm({
  isAdmin,
  preset,
  onClose,
}: {
  isAdmin: boolean
  preset: { day: string; entryId: number } | null
  onClose: () => void
}) {
  const [day, setDay] = React.useState(preset?.day ?? todayApiDate())
  const [entryId, setEntryId] = React.useState(preset ? String(preset.entryId) : '')
  const [substitute, setSubstitute] = React.useState('')
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const { assign } = useCoverMutations(isAdmin)
  const { staff } = useCoverStaff(isAdmin)

  const periods = useCoverDay(day, isAdmin)
  const openPeriods = (periods.data ?? []).filter((p) => !p.entry.substitution)
  const chosen = openPeriods.find((p) => String(p.entry.id) === entryId)
  const options = staff.filter((t) => t.id !== chosen?.entry.teacher_id)

  const label = (p: ScheduledPeriod) => {
    const parts = [periodTime(p), p.entry.class_room?.name ?? 'Class', p.entry.subject?.name ?? 'Period']
    if (isAdmin && p.entry.teacher?.full_name) parts.push(p.entry.teacher.full_name)
    return parts.join(' · ')
  }

  const submit = async () => {
    if (!chosen || !substitute) {
      setError('Choose a period and the teacher who will take it.')
      return
    }
    setError(null)
    try {
      await assign.mutateAsync({
        timetable_entry_id: chosen.entry.id,
        on_date: day,
        substitute_teacher_id: Number(substitute),
        note: note.trim() || null,
      })
      onClose()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not set the substitute.')
    }
  }

  return (
    <Band className="border-b border-border bg-primary/[0.03]">
      <div className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-foreground">Arrange a substitute</h2>
            <p className="text-xs text-muted-foreground">
              Another teacher takes the period on this date only. Every other day keeps the usual timetable
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close the form">
            <X />
          </Button>
        </div>
        <FormError message={error} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[10rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <Field id="sub_day" label="Date" required className={COMPACT_FIELD}>
            <Input
              id="sub_day"
              type="date"
              className={COMPACT_INPUT}
              value={day}
              onChange={(e) => {
                setDay(e.target.value)
                setEntryId('')
              }}
            />
          </Field>
          <Field id="sub_period" label="Period" required className={COMPACT_FIELD}>
            <Select
              value={entryId || undefined}
              onValueChange={(v) => {
                setEntryId(v)
                setSubstitute('')
              }}
              disabled={openPeriods.length === 0}
            >
              <SelectTrigger id="sub_period" className={COMPACT_INPUT}>
                <SelectValue
                  placeholder={
                    !periods.isPending && openPeriods.length === 0 ? 'Nothing left to cover' : 'Choose a period'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {openPeriods.map((p) => (
                  <SelectItem key={p.entry.id} value={String(p.entry.id)}>
                    {label(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="sub_teacher" label="Substitute" required className={COMPACT_FIELD}>
            <Select value={substitute || undefined} onValueChange={setSubstitute} disabled={!chosen}>
              <SelectTrigger id="sub_teacher" className={COMPACT_INPUT}>
                <SelectValue placeholder={chosen ? 'Choose a teacher' : 'Choose a period first'} />
              </SelectTrigger>
              <SelectContent>
                {options.map((teacher) => (
                  <SelectItem key={teacher.id} value={String(teacher.id)}>
                    {teacher.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="sub_note" label="Note" className={COMPACT_FIELD}>
            <Input
              id="sub_note"
              className={COMPACT_INPUT}
              placeholder="What the class should work on"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <Button size="sm" onClick={submit} loading={assign.isPending}>
            Set substitute
          </Button>
        </div>
      </div>
    </Band>
  )
}

/** One period on the day: who has it, whether they are away, and who takes it. */
function PeriodRow({
  period,
  away,
  isAdmin,
  onArrange,
}: {
  period: ScheduledPeriod
  away: boolean
  isAdmin: boolean
  onArrange: (period: ScheduledPeriod) => void
}) {
  const { clear } = useCoverMutations(isAdmin)
  const sub = period.entry.substitution
  const teacher = sub?.original_teacher?.full_name ?? period.entry.teacher?.full_name ?? 'Nobody yet'
  const coveredBy = sub?.substitute_teacher?.full_name
  const gap = away && !sub

  return (
    <tr className={cn(gap && 'bg-danger/[0.04]')}>
      <td className="relative whitespace-nowrap px-3 py-2 tabular-nums lg:pl-8">
        {gap && <span className="absolute inset-y-0 left-0 w-0.5 bg-danger" aria-hidden />}
        {periodTime(period)}
      </td>
      <td className="px-3 py-2 font-medium text-foreground">{period.entry.class_room?.name ?? 'Class'}</td>
      <td className="px-3 py-2">{period.entry.subject?.name ?? 'Period'}</td>
      <td className="px-3 py-2">
        <span className={cn(away && 'text-muted-foreground line-through decoration-muted-foreground/50')}>{teacher}</span>
        {away && <span className="ml-1.5 text-xs text-danger">away</span>}
      </td>
      <td className="px-3 py-2">
        {coveredBy ? (
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <span className="size-2 rounded-full bg-success" aria-hidden />
            {coveredBy}
          </span>
        ) : gap ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-danger">
            <span className="size-2 rounded-full bg-danger" aria-hidden />
            Needs cover
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right">
        {sub ? (
          <Button
            variant="ghost"
            size="sm"
            loading={clear.isPending}
            onClick={() => clear.mutate({ entryId: period.entry.id, day: period.on_date })}
          >
            <Undo2 />
            Take back
          </Button>
        ) : (
          <Button variant={gap ? 'primary' : 'ghost'} size="sm" onClick={() => onArrange(period)}>
            <UserCheck />
            Arrange
          </Button>
        )}
      </td>
    </tr>
  )
}

/**
 * Who is away on a day, and who takes each of its periods. A substitute applies to that date
 * only; the timetable is unchanged for every other day.
 */
function CoverTab({
  isAdmin,
  arranging,
  onArrange,
  onCloseArrange,
}: {
  isAdmin: boolean
  arranging: { preset: { day: string; entryId: number } | null; key: number } | null
  onArrange: (period?: ScheduledPeriod) => void
  onCloseArrange: () => void
}) {
  const today = todayApiDate()
  const [day, setDay] = React.useState(today)
  const away = useLeaveOnDay(day)
  const periods = useCoverDay(day, isAdmin)

  const awayRows = away.data ?? []
  const awayIds = new Set(awayRows.map((r) => r.teacher_id))
  const sorted = [...(periods.data ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const gaps = uncovered(sorted, awayRows).length
  const covered = sorted.filter((p) => p.entry.substitution).length

  return (
    <>
      <FilterBar
        trailing={
          periods.data
            ? `${countLabel(sorted.length, 'period')} · ${covered} covered${gaps ? ` · ${gaps} need cover` : ''}`
            : undefined
        }
      >
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" aria-label="Previous day" onClick={() => setDay(shiftApiDate(day, -1))}>
            <ChevronLeft />
          </Button>
          <Input
            type="date"
            aria-label="Day"
            className={cn(COMPACT_INPUT, 'w-40')}
            value={day}
            onChange={(e) => e.target.value && setDay(e.target.value)}
          />
          <Button variant="outline" size="sm" aria-label="Next day" onClick={() => setDay(shiftApiDate(day, 1))}>
            <ChevronRight />
          </Button>
          {day !== today && (
            <Button variant="ghost" size="sm" onClick={() => setDay(today)}>
              Today
            </Button>
          )}
          <span className="ml-2 hidden text-sm font-medium text-foreground sm:inline">{formatDate(day, 'EEEE d MMMM')}</span>
        </div>
      </FilterBar>

      {arranging && (
        <SubstituteForm key={arranging.key} isAdmin={isAdmin} preset={arranging.preset} onClose={onCloseArrange} />
      )}

      <Band className="border-b border-border">
        <div className="grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:divide-x lg:divide-border">
          {/* ---------------------------------------------- who is away */}
          <div className="-mx-4 border-b border-border sm:-mx-6 lg:mx-0 lg:-ml-8 lg:border-b-0">
            <div className="flex items-center justify-between px-6 py-2.5 lg:pl-8">
              <PaneHeading>Away</PaneHeading>
              <span className="text-xs tabular-nums text-muted-foreground">{awayRows.length}</span>
            </div>
            <QueryBoundary query={away} loading={<Skeleton className="mx-6 mb-3 h-16 lg:ml-8" />}>
              {(rows) =>
                rows.length === 0 ? (
                  <p className="border-t border-border px-6 py-4 text-sm text-muted-foreground lg:pl-8">
                    Everybody is in
                  </p>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {rows.map((r) => (
                      <li key={r.id} className="px-6 py-2.5 lg:pl-8">
                        <p className="truncate text-sm font-medium text-foreground">
                          {r.teacher_name ?? `Teacher ${r.teacher_id}`}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {LEAVE_TYPE_LABEL[r.leave_type]}
                          {r.day_part !== 'FULL_DAY' && ` · ${DAY_PART_LABEL[r.day_part]}`} · until{' '}
                          {formatDate(r.end_date, 'd MMM')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )
              }
            </QueryBoundary>
          </div>

          {/* ------------------------------------------- the day's periods */}
          <div className="-mx-4 min-w-0 sm:-mx-6 lg:mx-0 lg:-mr-8">
            <QueryBoundary query={periods} loading={<Skeleton className="m-4 h-32" />}>
              {(rows) =>
                rows.length === 0 ? (
                  <EmptyLine
                    title="No periods"
                    hint={isAdmin ? 'Nothing is timetabled on this day' : 'You have no periods on this day'}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium lg:pl-8">Time</th>
                          <th className="px-3 py-2 text-left font-medium">Class</th>
                          <th className="px-3 py-2 text-left font-medium">Subject</th>
                          <th className="px-3 py-2 text-left font-medium">Teacher</th>
                          <th className="px-3 py-2 text-left font-medium">Substitute</th>
                          <th className="px-3 py-2 text-right font-medium">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {sorted.map((period) => (
                          <PeriodRow
                            key={period.entry.id}
                            period={period}
                            away={period.entry.teacher_id != null && awayIds.has(period.entry.teacher_id)}
                            isAdmin={isAdmin}
                            onArrange={onArrange}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </QueryBoundary>
          </div>
        </div>
      </Band>
    </>
  )
}

// ===================================================================== page

/** Today at a glance, for the office: what is waiting and what is not covered. */
function AdminFigures({ pending }: { pending: number | undefined }) {
  const today = todayApiDate()
  const away = useLeaveOnDay(today)
  const periods = useCoverDay(today, true)
  const awayRows = away.data ?? []
  const dayPeriods = periods.data ?? []
  const gaps = uncovered(dayPeriods, awayRows).length
  const covered = dayPeriods.filter((p) => p.entry.substitution).length

  return (
    <Figures>
      <Figure label="Awaiting decision" value={pending == null ? '—' : String(pending)} context="leave requests" tone="warning" />
      <Figure label="Away today" value={away.data ? String(awayRows.length) : '—'} context="on approved leave" tone="info" />
      <Figure
        label="Need cover today"
        value={periods.data && away.data ? String(gaps) : '—'}
        context="periods with nobody"
        alert={gaps > 0}
        tone="danger"
      />
      <Figure label="Covered today" value={periods.data ? String(covered) : '—'} context="by a substitute" tone="success" />
      <Figure label="Periods today" value={periods.data ? String(dayPeriods.length) : '—'} context="on the timetable" tone="neutral" />
    </Figures>
  )
}

/** The teacher's own year and day. Taken and pending stay separate figures. */
function TeacherFigures() {
  const today = todayApiDate()
  const balance = useMyLeaveBalance()
  const periods = useCoverDay(today, false)
  const mine = periods.data ?? []
  const covered = mine.filter((p) => p.entry.substitution).length

  return (
    <Figures>
      <Figure label="Days taken" value={balance.data ? String(balance.data.total_taken) : '—'} context="this year" tone="success" />
      <Figure
        label="Days pending"
        value={balance.data ? String(balance.data.total_pending) : '—'}
        context="awaiting a decision"
        tone="warning"
      />
      <Figure label="Requests" value={balance.data ? String(balance.data.request_count) : '—'} context="this year" tone="primary" />
      <Figure label="My periods today" value={periods.data ? String(mine.length) : '—'} context={`${covered} with a substitute`} tone="info" />
    </Figures>
  )
}

/**
 * Leave and substitutes in one workspace. The office decides requests and
 * covers the day; a teacher applies and arranges cover for their own periods.
 */
export default function LeavePage() {
  const { role } = useAuth()
  const isAdmin = role === 'ADMIN'
  const pending = useLeaveQueue({ status: 'PENDING' }, isAdmin)
  const [tab, setTab] = React.useState<TabKey>(isAdmin ? 'requests' : 'mine')
  const [applying, setApplying] = React.useState(false)
  const [arranging, setArranging] = React.useState<{
    preset: { day: string; entryId: number } | null
    key: number
  } | null>(null)

  const arrange = (period?: ScheduledPeriod) => {
    setArranging({ preset: period ? { day: period.on_date, entryId: period.entry.id } : null, key: Date.now() })
    setTab('cover')
  }
  const apply = () => {
    setApplying(true)
    setTab('mine')
  }

  const tabs: { key: TabKey; label: string; count?: number; alert?: boolean; tone?: Tone }[] = [
    ...(isAdmin
      ? [{ key: 'requests' as const, label: 'Leave requests', count: pending.data?.length, alert: true, tone: 'warning' as const }]
      : []),
    { key: 'cover', label: 'Daily cover', tone: 'info' },
    { key: 'mine', label: 'My leave', tone: 'primary' },
  ]

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title="Leave & Substitutes"
        description={
          isAdmin
            ? 'Decide leave requests, see who is away on a day, and arrange who takes each period'
            : 'Apply for leave, and arrange a substitute for any of your periods, for leave or anything else'
        }
        icon={CalendarOff}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => arrange()}>
              <UserCheck />
              Arrange substitute
            </Button>
            <Button size="sm" onClick={apply}>
              <PlaneTakeoff />
              Apply for leave
            </Button>
          </>
        }
        tabs={<TabStrip label="Leave" idPrefix="leave-tab" value={tab} onChange={setTab} tabs={tabs} />}
      />

      <div className="!mt-0" role="tabpanel" id="leave-tab-panel" aria-labelledby={`leave-tab-${tab}`}>
        {isAdmin ? <AdminFigures pending={pending.data?.length} /> : <TeacherFigures />}

        {tab === 'requests' && isAdmin && <RequestsTab />}
        {tab === 'mine' && <MyLeaveTab applying={applying} setApplying={setApplying} />}
        {tab === 'cover' && (
          <CoverTab
            isAdmin={isAdmin}
            arranging={arranging}
            onArrange={arrange}
            onCloseArrange={() => setArranging(null)}
          />
        )}
      </div>
    </div>
  )
}

import {
  CalendarOff,
  CheckCircle2,
  PlaneTakeoff,
  Undo2,
  UserCheck,
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
  useApplyForLeave,
  useDecideLeave,
  useLeaveOnDay,
  useLeaveQueue,
  useMyLeave,
  useMyLeaveBalance,
  useWithdrawLeave,
} from '@/queries/academics.queries'
import { useCoverDay, useCoverMutations, useCoverStaff } from '@/queries/cover.queries'
import { useAffectedPeriods } from '@/queries/academics.queries'
import { Checkbox } from '@/components/ui/checkbox'
import { useAuth } from '@/providers/auth-provider'
import { formatDate, todayApiDate } from '@/lib/datetime'
import { countLabel } from '@/lib/format'
import {
  DAY_PARTS,
  DAY_PART_LABEL,
  LEAVE_STATUS_LABEL,
  LEAVE_STATUS_TONE,
  LEAVE_TYPES,
  LEAVE_TYPE_LABEL,
  leaveTypeRows,
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
 * Staff leave — applying, and deciding.
 *
 * The field that makes this screen worth having is `affected_periods`: the
 * periods the applicant was timetabled to take across those dates, snapshotted
 * when they applied. It is what an approver is actually agreeing to cover, and
 * it is shown on every approval card rather than hidden behind a click.
 *
 * `taken_days` and `pending_days` are rendered as two columns and never summed.
 * One combined figure is how two teachers get approved for the same week.
 */

// =================================================================== applying

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

  if (loading) return <Skeleton className="h-16 w-full rounded-xl" />
  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You have no periods on these dates, so there is nothing to cover.
      </p>
    )
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Classes that need a substitute</legend>
      <p className="text-xs text-muted-foreground">
        Choose who takes each class while you are away. Untick a class that needs no cover. The
        substitute takes over only on your leave days, once the leave is approved.
      </p>
      {groups.map((group) => {
        const ticked = value.includes(group.id)
        return (
          <div
            key={group.id}
            className="flex flex-col gap-3 rounded-lg border border-border p-3 text-sm sm:flex-row sm:items-center"
          >
            <label className="flex flex-1 items-center gap-3">
              <Checkbox
                checked={ticked}
                onCheckedChange={(checked) =>
                  onChange(
                    checked === true
                      ? [...value, group.id]
                      : value.filter((id) => id !== group.id),
                  )
                }
              />
              <span className="flex-1">{group.label}</span>
              <span className="text-xs text-muted-foreground">{countLabel(group.count, 'period')}</span>
            </label>
            {ticked && (
              <Select
                value={substitutes[group.id] || undefined}
                onValueChange={(v) => onSubstituteChange(group.id, v)}
              >
                <SelectTrigger className="sm:w-52" aria-label={`Who covers ${group.label}`}>
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
          </div>
        )
      })}
    </fieldset>
  )
}

function ApplyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
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

  React.useEffect(() => {
    if (!open) return
    setLeaveType('CASUAL')
    setDayPart('FULL_DAY')
    setStartDate(todayApiDate())
    setEndDate(todayApiDate())
    setReason('')
    setContact('')
    setCoverIds([])
    setSubstitutes({})
    setError(null)
  }, [open])

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
  const affected = useAffectedPeriods(startDate, coverEnd, open)
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
      onOpenChange(false)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not submit the request.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply for leave</DialogTitle>
          <DialogDescription>
            The periods you were timetabled to take across these dates are attached
            automatically, so whoever approves it can see what needs covering.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field id="leave_type" label="Kind of leave" required>
              <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
                <SelectTrigger id="leave_type">
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
            <Field
              id="day_part"
              label="How much"
              hint={halfDay ? 'A half day covers one date.' : undefined}
            >
              <Select value={dayPart} onValueChange={(v) => setDayPart(v as LeaveDayPart)}>
                <SelectTrigger id="day_part">
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
          </div>

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field id="leave_start" label="From" required>
              <Input
                id="leave_start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field id="leave_end" label="To" required>
              <Input
                id="leave_end"
                type="date"
                value={halfDay ? startDate : endDate}
                disabled={halfDay}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          </div>

          <Field id="leave_reason" label="Reason">
            <Textarea
              id="leave_reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>

          <Field
            id="leave_contact"
            label="Contact while away"
            hint="Optional — a number the office can reach you on."
          >
            <Input
              id="leave_contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </Field>

          <CoverClasses
            periods={affected.data ?? []}
            loading={affected.isPending && !!startDate}
            value={coverIds}
            onChange={setCoverIds}
            substitutes={substitutes}
            onSubstituteChange={(entryId, teacherId) =>
              setSubstitutes((prev) => ({ ...prev, [entryId]: teacherId }))
            }
            staff={staff}
            selfId={user?.id}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={apply.isPending}>
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The periods an approval commits somebody to covering. */
function AffectedPeriods({ request }: { request: LeaveRequestOut }) {
  if (request.affected_periods.length === 0) {
    return (
      <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
        They were not timetabled on those dates — nothing needs covering.
      </p>
    )
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {countLabel(request.affected_periods.length, 'period')} needing cover
      </p>
      <ul className="mt-2 space-y-1">
        {request.affected_periods.map((period, i) => (
          <li key={i} className="text-xs text-muted-foreground">
            {formatDate(period.date, 'EEE d MMM')} ·{' '}
            {[period.start_time, period.end_time].filter(Boolean).join('–')} ·{' '}
            {[period.class_name, period.subject_name].filter(Boolean).join(' ')}
          </li>
        ))}
      </ul>
    </div>
  )
}

function RequestCard({
  request,
  children,
}: {
  request: LeaveRequestOut
  children?: React.ReactNode
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              {request.teacher_name ?? `Teacher ${request.teacher_id}`}
            </h3>
            <Badge tone={LEAVE_STATUS_TONE[request.status]} size="sm">
              {LEAVE_STATUS_LABEL[request.status]}
            </Badge>
            <Badge tone="outline" size="sm">
              {LEAVE_TYPE_LABEL[request.leave_type]}
            </Badge>
          </div>

          <p className="mt-1 text-sm">
            {formatDate(request.start_date)}
            {request.end_date !== request.start_date && ` — ${formatDate(request.end_date)}`}
            <span className="text-muted-foreground">
              {' '}
              · {request.total_days} {request.total_days === 1 ? 'day' : 'days'}
              {request.day_part !== 'FULL_DAY' && ` (${DAY_PART_LABEL[request.day_part]})`}
            </span>
          </p>

          {request.reason && (
            <p className="mt-2 text-sm text-muted-foreground">{request.reason}</p>
          )}

          {request.decision_note && (
            <p className="mt-2 text-xs text-muted-foreground">
              {request.decided_by_name ?? 'Decided'}: {request.decision_note}
            </p>
          )}

          {(request.cover_plan?.length ?? 0) > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {request.cover_plan!.map((item) => {
                const period = request.affected_periods.find(
                  (p) => p.timetable_entry_id === item.timetable_entry_id,
                )
                const label = `${period?.class_name ?? 'Class'} · ${period?.subject_name ?? 'Period'}`
                return (
                  <li key={item.timetable_entry_id} className="flex items-center gap-1.5">
                    <UserCheck className="size-3.5" />
                    {label}:{' '}
                    {item.substitute_teacher_name ? (
                      <span className="font-medium text-foreground">{item.substitute_teacher_name}</span>
                    ) : (
                      'nobody chosen yet'
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {(request.cover_gaps?.length ?? 0) > 0 && (
            <div className="mt-2 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs">
              <p className="font-medium">Still needs a substitute:</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {request.cover_gaps!.map((gap, i) => (
                  <li key={i}>
                    {formatDate(gap.date)} · {gap.class_name ?? 'Class'} — {gap.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
      </div>

      <AffectedPeriods request={request} />
    </Card>
  )
}

// =================================================================== deciding

function DecideDialog({
  request,
  approve,
  onClose,
}: {
  request: LeaveRequestOut | null
  approve: boolean
  onClose: () => void
}) {
  const decide = useDecideLeave()
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setNote('')
    setError(null)
  }, [request, approve])

  const submit = async () => {
    if (!request) return
    // The backend requires a note on a rejection, and rightly: the applicant
    // has to be able to read why.
    if (!approve && !note.trim()) {
      setError('A rejection needs a reason the applicant can read.')
      return
    }
    setError(null)
    try {
      await decide.mutateAsync({
        requestId: request.id,
        body: {
          approve,
          note: note.trim() || null,
        },
      })
      onClose()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not record the decision.')
    }
  }

  return (
    <Dialog open={!!request} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{approve ? 'Approve this leave' : 'Reject this leave'}</DialogTitle>
          <DialogDescription>
            {approve
              ? `${request?.teacher_name ?? 'The applicant'} was timetabled for ${countLabel(
                  request?.affected_periods.length ?? 0,
                  'period',
                )} across those dates.`
              : 'The applicant sees the reason you give.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />

          <Field id="decision_note" label="Note" required={!approve}>
            <Textarea
              id="decision_note"
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
          <Button
            variant={approve ? 'solid' : 'danger'}
            onClick={submit}
            loading={decide.isPending}
          >
            {approve ? 'Approve' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BalanceCard() {
  const balance = useMyLeaveBalance()

  return (
    <QueryBoundary query={balance} loading={<Skeleton className="h-40 w-full rounded-xl" />}>
      {(data) => {
        const rows = leaveTypeRows(data)
        return (
          <Card className="p-5">
            <h3 className="text-sm font-semibold">Your leave so far</h3>
            {rows.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                You have not taken or requested any leave this year.
              </p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Type</th>
                    <th className="pb-2 text-right font-medium">Taken</th>
                    {/* Kept apart deliberately — a request awaiting a decision
                        is neither granted nor free. */}
                    <th className="pb-2 text-right font-medium">Pending</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.type}>
                      <td className="py-2">{row.label}</td>
                      <td className="py-2 text-right tabular-nums">{row.taken}</td>
                      <td className="py-2 text-right tabular-nums text-warning">
                        {row.pending || '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-right tabular-nums">{data.total_taken}</td>
                    <td className="py-2 text-right tabular-nums text-warning">
                      {data.total_pending || '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </Card>
        )
      }}
    </QueryBoundary>
  )
}

// ===================================================================== pages

function MyLeaveTab() {
  const [status, setStatus] = React.useState<'ALL' | LeaveStatus>('ALL')
  const requests = useMyLeave(status === 'ALL' ? undefined : status)
  const withdraw = useWithdrawLeave()
  const [applyOpen, setApplyOpen] = React.useState(false)

  return (
    <div className="space-y-5">
      <BalanceCard />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          layoutId="my-leave-status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'PENDING', label: 'Awaiting' },
            { value: 'APPROVED', label: 'Approved' },
            { value: 'REJECTED', label: 'Rejected' },
          ]}
        />
        <Button onClick={() => setApplyOpen(true)}>
          <PlaneTakeoff />
          Apply for leave
        </Button>
      </div>

      <QueryBoundary
        query={requests}
        loading={<Skeleton className="h-32 w-full rounded-xl" />}
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            icon={<PlaneTakeoff />}
            title="No leave requests"
            description="Applying attaches the periods you were timetabled for, so whoever approves it knows what needs covering."
            action={
              <Button onClick={() => setApplyOpen(true)}>
                <PlaneTakeoff />
                Apply for leave
              </Button>
            }
          />
        }
      >
        {(rows) => (
          <div className="space-y-3">
            {rows.map((request) => (
              <RequestCard key={request.id} request={request}>
                {request.status === 'PENDING' && (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={withdraw.isPending}
                    onClick={() => withdraw.mutate(request.id)}
                  >
                    <Undo2 />
                    Withdraw
                  </Button>
                )}
              </RequestCard>
            ))}
          </div>
        )}
      </QueryBoundary>

      <ApplyDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </div>
  )
}

function QueueTab() {
  const [status, setStatus] = React.useState<'ALL' | LeaveStatus>('PENDING')
  const requests = useLeaveQueue({ status: status === 'ALL' ? undefined : status })
  const [deciding, setDeciding] = React.useState<{
    request: LeaveRequestOut
    approve: boolean
  } | null>(null)

  return (
    <div className="space-y-4">
      <Segmented
        layoutId="leave-queue-status"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'PENDING', label: 'Awaiting decision' },
          { value: 'APPROVED', label: 'Approved' },
          { value: 'REJECTED', label: 'Rejected' },
          { value: 'ALL', label: 'All' },
        ]}
      />

      <QueryBoundary
        query={requests}
        loading={
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            icon={<CheckCircle2 />}
            title={status === 'PENDING' ? 'Nothing waiting' : 'Nothing here'}
            description={
              status === 'PENDING'
                ? 'Every leave request has been decided.'
                : 'Try a different filter.'
            }
          />
        }
      >
        {(rows) => (
          <div className="space-y-3">
            {rows.map((request) => (
              <RequestCard key={request.id} request={request}>
                {request.status === 'PENDING' && (
                  <>
                    <Button size="sm" onClick={() => setDeciding({ request, approve: true })}>
                      <CheckCircle2 />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeciding({ request, approve: false })}
                    >
                      <XCircle />
                      Reject
                    </Button>
                  </>
                )}
              </RequestCard>
            ))}
          </div>
        )}
      </QueryBoundary>

      <DecideDialog
        request={deciding?.request ?? null}
        approve={deciding?.approve ?? true}
        onClose={() => setDeciding(null)}
      />
    </div>
  )
}

/** The daily cover sheet: who is away today, and what they were taking. */
/** One period on the day: who has it, and whether a substitute takes it on this date. */
function PeriodCoverRow({
  period,
  isAdmin,
  onArrange,
}: {
  period: ScheduledPeriod
  isAdmin: boolean
  onArrange: (period: ScheduledPeriod) => void
}) {
  const { clear } = useCoverMutations(isAdmin)
  const sub = period.entry.substitution
  const originalName = sub?.original_teacher?.full_name ?? period.entry.teacher?.full_name ?? 'Nobody yet'
  const coveredBy = sub?.substitute_teacher?.full_name
  const className = period.entry.class_room?.name ?? 'Class'
  const subjectName = period.entry.subject?.name ?? 'Period'
  const time = new Date(period.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold">
          {className} · {subjectName}
        </p>
        <p className="text-sm text-muted-foreground">
          {time} · {originalName}
          {coveredBy ? (
            <>
              {' '}
              → <span className="font-medium text-primary">{coveredBy} is covering</span>
            </>
          ) : null}
        </p>
      </div>

      {sub ? (
        <Button
          variant="outline"
          loading={clear.isPending}
          onClick={() => clear.mutate({ entryId: period.entry.id, day: period.on_date })}
        >
          <Undo2 />
          Take the cover back
        </Button>
      ) : (
        <Button variant="outline" onClick={() => onArrange(period)}>
          <UserCheck />
          Arrange substitute
        </Button>
      )}
    </div>
  )
}

/**
 * The substitute form: one period, one date, one teacher. Separate from the leave form, because
 * a substitute is not always for leave - a trip, a meeting, an exam duty. Only the chosen date
 * changes; every other day keeps the usual timetable.
 */
function SubstituteDialog({
  open,
  onOpenChange,
  isAdmin,
  preset,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  isAdmin: boolean
  preset: { day: string; entryId: number } | null
}) {
  const [day, setDay] = React.useState(todayApiDate())
  const [entryId, setEntryId] = React.useState('')
  const [substitute, setSubstitute] = React.useState('')
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const { assign } = useCoverMutations(isAdmin)
  const { staff } = useCoverStaff(isAdmin)

  React.useEffect(() => {
    if (!open) return
    setDay(preset?.day ?? todayApiDate())
    setEntryId(preset ? String(preset.entryId) : '')
    setSubstitute('')
    setNote('')
    setError(null)
  }, [open, preset])

  const periods = useCoverDay(day, isAdmin, open)
  const openPeriods = (periods.data ?? []).filter((p) => !p.entry.substitution)
  const chosen = openPeriods.find((p) => String(p.entry.id) === entryId)
  const options = staff.filter((t) => t.id !== chosen?.entry.teacher_id)

  const label = (p: ScheduledPeriod) => {
    const time = new Date(p.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    const parts = [time, p.entry.class_room?.name ?? 'Class', p.entry.subject?.name ?? 'Period']
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
      onOpenChange(false)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not set the substitute.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Arrange a substitute</DialogTitle>
          <DialogDescription>
            Another teacher takes the period on this date only. Every other day keeps the usual
            timetable, for the students and for you.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />

          <Field id="sub_day" label="Date" required>
            <Input
              id="sub_day"
              type="date"
              className="max-w-xs"
              value={day}
              onChange={(e) => {
                setDay(e.target.value)
                setEntryId('')
              }}
            />
          </Field>

          <Field
            id="sub_period"
            label="Period"
            required
            hint={
              !periods.isPending && openPeriods.length === 0
                ? isAdmin
                  ? 'Nothing left to cover on this day.'
                  : 'You have no periods left to cover on this day.'
                : undefined
            }
          >
            <Select
              value={entryId || undefined}
              onValueChange={(v) => {
                setEntryId(v)
                setSubstitute('')
              }}
              disabled={openPeriods.length === 0}
            >
              <SelectTrigger id="sub_period">
                <SelectValue placeholder="Choose a period" />
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

          <Field id="sub_teacher" label="Substitute teacher" required>
            <Select
              value={substitute || undefined}
              onValueChange={setSubstitute}
              disabled={!chosen}
            >
              <SelectTrigger id="sub_teacher">
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

          <Field id="sub_note" label="Note" hint="Optional — for example, what the class should work on.">
            <Textarea id="sub_note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={assign.isPending}>
            Set substitute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Who is away on a day, and who takes each of its periods. A substitute applies to that date
 * only; the timetable is unchanged for every other day.
 */
function AwayAndCover({
  isAdmin,
  onArrange,
}: {
  isAdmin: boolean
  onArrange: (period: ScheduledPeriod) => void
}) {
  const [day, setDay] = React.useState(todayApiDate())
  const away = useLeaveOnDay(day)
  const periods = useCoverDay(day, isAdmin)

  return (
    <div className="space-y-6">
      <Field id="cover_day" label="Date">
        <Input
          id="cover_day"
          type="date"
          className="max-w-xs"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
      </Field>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Away on {formatDate(day)}</h3>
        <QueryBoundary
          query={away}
          loading={<Skeleton className="h-32 w-full rounded-xl" />}
          isEmpty={(rows) => rows.length === 0}
          empty={
            <EmptyState
              icon={<CalendarOff />}
              title="Everybody is in"
              description={`No approved leave on ${formatDate(day)}.`}
            />
          }
        >
          {(rows) => (
            <div className="space-y-3">
              {rows.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </QueryBoundary>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">
          {isAdmin ? 'Periods' : 'Your periods'} on {formatDate(day)}
        </h3>
        <QueryBoundary
          query={periods}
          loading={<Skeleton className="h-32 w-full rounded-xl" />}
          isEmpty={(rows) => rows.length === 0}
          empty={
            <EmptyState
              icon={<CalendarOff />}
              title="No periods"
              description={isAdmin ? 'Nothing is timetabled on this day.' : 'You have no periods on this day.'}
            />
          }
        >
          {(rows) => (
            <div className="space-y-3">
              {rows.map((period) => (
                <PeriodCoverRow
                  key={period.entry.id}
                  period={period}
                  isAdmin={isAdmin}
                  onArrange={onArrange}
                />
              ))}
            </div>
          )}
        </QueryBoundary>
      </div>
    </div>
  )
}

/**
 * Leave and substitutes on one page, with a form for each: applying for leave, and arranging a
 * substitute (with or without leave). Nothing is hidden behind a tab.
 */
export default function LeavePage() {
  const { role } = useAuth()
  const isAdmin = role === 'ADMIN'
  const [subOpen, setSubOpen] = React.useState(false)
  const [preset, setPreset] = React.useState<{ day: string; entryId: number } | null>(null)

  const arrange = (period?: ScheduledPeriod) => {
    setPreset(period ? { day: period.on_date, entryId: period.entry.id } : null)
    setSubOpen(true)
  }

  return (
    <div className="space-y-10">
      <PageHeader
        title="Leave & substitutes"
        description={
          isAdmin
            ? 'Requests to decide, who is away on a day, and who takes each period.'
            : 'Apply for leave, and arrange a substitute for any of your periods — for leave or for anything else.'
        }
        actions={
          <Button variant="outline" onClick={() => arrange()}>
            <UserCheck />
            Arrange a substitute
          </Button>
        }
      />

      {isAdmin && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <CheckCircle2 className="size-4" />
            To decide
          </h2>
          <QueueTab />
        </section>
      )}

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <PlaneTakeoff className="size-4" />
          My leave
        </h2>
        <MyLeaveTab />
      </section>

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <UserCheck className="size-4" />
          Substitutes by day
        </h2>
        <AwayAndCover isAdmin={isAdmin} onArrange={arrange} />
      </section>

      <SubstituteDialog open={subOpen} onOpenChange={setSubOpen} isAdmin={isAdmin} preset={preset} />
    </div>
  )
}

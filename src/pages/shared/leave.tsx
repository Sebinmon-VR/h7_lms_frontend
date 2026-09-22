import {
  CalendarOff,
  CheckCircle2,
  PlaneTakeoff,
  Undo2,
  UserCheck,
  XCircle,
} from 'lucide-react'
import * as React from 'react'

import type { LeaveDayPart, LeaveRequestOut, LeaveStatus, LeaveType } from '@/api/types'
import {
  useApplyForLeave,
  useDecideLeave,
  useLeaveOnDay,
  useLeaveQueue,
  useMyLeave,
  useMyLeaveBalance,
  useWithdrawLeave,
} from '@/queries/academics.queries'
import { useTeachingStaff } from '@/queries/admin.queries'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

function ApplyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const apply = useApplyForLeave()
  const [leaveType, setLeaveType] = React.useState<LeaveType>('CASUAL')
  const [dayPart, setDayPart] = React.useState<LeaveDayPart>('FULL_DAY')
  const [startDate, setStartDate] = React.useState(todayApiDate())
  const [endDate, setEndDate] = React.useState(todayApiDate())
  const [reason, setReason] = React.useState('')
  const [contact, setContact] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setLeaveType('CASUAL')
    setDayPart('FULL_DAY')
    setStartDate(todayApiDate())
    setEndDate(todayApiDate())
    setReason('')
    setContact('')
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

          {request.substitute_teacher_name && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
              <UserCheck className="size-3.5" />
              {request.substitute_teacher_name} is covering
            </p>
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
  const staff = useTeachingStaff(!!request && approve)
  const [note, setNote] = React.useState('')
  const [substitute, setSubstitute] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setNote('')
    setSubstitute('')
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
          substitute_teacher_id: substitute ? Number(substitute) : null,
        },
      })
      onClose()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not record the decision.')
    }
  }

  const uncovered = (request?.affected_periods.length ?? 0) > 0 && !substitute

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

          {approve && (
            <Field
              id="substitute"
              label="Who covers"
              hint="Optional, but the periods stay uncovered without it."
            >
              <Select
                value={substitute || 'NONE'}
                onValueChange={(v) => setSubstitute(v === 'NONE' ? '' : v)}
              >
                <SelectTrigger id="substitute">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Nobody yet</SelectItem>
                  {(staff.data ?? [])
                    .filter((t) => t.id !== request?.teacher_id)
                    .map((teacher) => (
                      <SelectItem key={teacher.id} value={String(teacher.id)}>
                        {teacher.full_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {approve && uncovered && (
            <p className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-muted-foreground">
              Nobody is named, so those periods will have no teacher. You can approve anyway
              and name a substitute later.
            </p>
          )}

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
function CoverTab() {
  const [day, setDay] = React.useState(todayApiDate())
  const away = useLeaveOnDay(day)

  return (
    <div className="space-y-4">
      <Field id="cover_day" label="Date">
        <Input
          id="cover_day"
          type="date"
          className="max-w-xs"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
      </Field>

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
  )
}

export default function LeavePage() {
  const { role } = useAuth()
  const isAdmin = role === 'ADMIN'

  // An admin opens this to decide, a teacher to apply — so the first tab
  // differs rather than both landing on the same list.
  return (
    <div>
      <PageHeader
        title={isAdmin ? 'Staff leave' : 'My leave'}
        description={
          isAdmin
            ? 'Requests to decide, and who is away on a given day. Each request carries the periods it leaves uncovered.'
            : 'Apply for leave and see what you have taken.'
        }
      />

      <Tabs defaultValue={isAdmin ? 'queue' : 'mine'}>
        <TabsList>
          {isAdmin && (
            <TabsTrigger value="queue">
              <CheckCircle2 className="size-4" />
              To decide
            </TabsTrigger>
          )}
          <TabsTrigger value="mine">
            <PlaneTakeoff className="size-4" />
            My requests
          </TabsTrigger>
          <TabsTrigger value="cover">
            <CalendarOff className="size-4" />
            Who is away
          </TabsTrigger>
        </TabsList>

        {isAdmin && (
          <TabsContent value="queue">
            <QueueTab />
          </TabsContent>
        )}
        <TabsContent value="mine">
          <MyLeaveTab />
        </TabsContent>
        <TabsContent value="cover">
          <CoverTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

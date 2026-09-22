import { BarChart3, Download, History, Receipt, Trash2, Users } from 'lucide-react'
import * as React from 'react'

import type {
  FeeCollectionRow,
  FeeReportView,
  FeeRollRow,
  FeeRollStatus,
  PaymentMethod,
} from '@/api/types'
import {
  useDeleteFeeReceipt,
  useFeeCollectionsReport,
  useFeeDuesReport,
  useFeeHeads,
  useFeeReportExport,
  useFeeRollReport,
  useRecordFeeReceipt,
} from '@/queries/finance.queries'
import { useClasses, useUsers } from '@/queries/admin.queries'
import { formatDate, formatDateTime, todayApiDate } from '@/lib/datetime'
import { formatMoney } from '@/lib/tuition'
import { PAYMENT_METHOD_LABEL } from '@/lib/school'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PeriodPicker, useReportPeriod } from './tuition/period'

/**
 * Fee reports: the roll, the dues, the collections.
 *
 * Three questions the office asks in that order - where does everyone stand,
 * who do I chase, what came in - answered from the same invoices the Invoices
 * tab shows, so a figure here is never a different figure from that screen.
 * Every summary is computed server-side from exactly the rows listed, and
 * each view has a CSV twin for the accountant.
 */

type Tone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'outline'

const STATUS_LABEL: Record<FeeRollStatus, string> = {
  NOT_BILLED: 'Not billed',
  DRAFT: 'Draft',
  ISSUED: 'Unpaid',
  PARTIALLY_PAID: 'Part paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
}

const STATUS_TONE: Record<FeeRollStatus, Tone> = {
  NOT_BILLED: 'neutral',
  DRAFT: 'outline',
  ISSUED: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  OVERDUE: 'danger',
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Everyone' },
  { value: 'DUE', label: 'Anything owed' },
  { value: 'NOT_BILLED', label: 'Not billed yet' },
  { value: 'ISSUED', label: 'Unpaid' },
  { value: 'PARTIALLY_PAID', label: 'Part paid' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'PAID', label: 'Paid in full' },
]

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: React.ReactNode
  tone?: string
  hint?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <p className={`text-lg font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {hint && <p className="text-2xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ExportButton({
  view,
  params,
}: {
  view: FeeReportView
  params: Record<string, unknown>
}) {
  const exporter = useFeeReportExport()
  return (
    <Button
      variant="outline"
      size="sm"
      loading={exporter.isPending}
      onClick={() => exporter.mutate({ view, params })}
    >
      <Download />
      Download CSV
    </Button>
  )
}

// ------------------------------------------------------------------ roll

function StudentCell({ row }: { row: FeeRollRow }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">{row.full_name ?? `Student ${row.student_id}`}</p>
      <p className="truncate text-xs text-muted-foreground">
        {[row.admission_number, row.admission_category_name].filter(Boolean).join(' · ')}
      </p>
    </div>
  )
}

function RollTable({ rows, currency }: { rows: FeeRollRow[]; currency: string }) {
  return (
    <Table containerClassName="max-h-[70vh]">
      <TableHeader sticky>
        <TableRow className="hover:bg-transparent">
          <TableHead className="min-w-52">Student</TableHead>
          <TableHead>Class</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Invoice</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Paid</TableHead>
          <TableHead className="text-right">Due</TableHead>
          <TableHead>Next due</TableHead>
          <TableHead>Last payment</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.student_id}>
            <TableCell>
              <StudentCell row={row} />
            </TableCell>
            <TableCell className="text-sm">{row.class_name ?? '—'}</TableCell>
            <TableCell>
              <Badge tone={STATUS_TONE[row.status] ?? 'neutral'} size="sm">
                {STATUS_LABEL[row.status] ?? row.status}
              </Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {row.invoice_number ?? (row.invoice_id ? 'Draft' : '—')}
            </TableCell>
            <TableCell className="text-right text-sm tabular-nums">
              {row.invoice_id
                ? formatMoney(row.total_amount, row.currency || currency)
                : row.expected_total != null
                  ? <span className="text-muted-foreground">{formatMoney(row.expected_total, currency)}</span>
                  : '—'}
            </TableCell>
            <TableCell className="text-right text-sm tabular-nums text-success">
              {row.amount_paid > 0 ? formatMoney(row.amount_paid, row.currency || currency) : '—'}
            </TableCell>
            <TableCell
              className={`text-right text-sm font-medium tabular-nums ${
                row.amount_overdue > 0 ? 'text-danger' : row.amount_due > 0 ? 'text-warning' : 'text-success'
              }`}
            >
              {row.amount_due > 0 ? formatMoney(row.amount_due, row.currency || currency) : 'Nil'}
            </TableCell>
            <TableCell className="text-xs">
              {row.next_due ? (
                <>
                  <span className="font-medium">{row.next_due.label}</span>
                  <span className="text-muted-foreground">
                    {row.next_due.due_date ? ` · ${formatDate(row.next_due.due_date)}` : ''}
                    {' · '}
                    {formatMoney(row.next_due.amount, row.currency || currency)}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {row.last_payment_at
                ? `${formatDate(row.last_payment_at)} · ${formatMoney(row.last_payment_amount ?? 0, row.currency || currency)}`
                : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function DuesTable({ rows, currency }: { rows: FeeRollRow[]; currency: string }) {
  const cell = (value: number) =>
    value > 0 ? formatMoney(value, currency) : <span className="text-muted-foreground">—</span>
  return (
    <Table containerClassName="max-h-[70vh]">
      <TableHeader sticky>
        <TableRow className="hover:bg-transparent">
          <TableHead className="min-w-52">Student</TableHead>
          <TableHead>Class</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Due</TableHead>
          <TableHead className="text-right">Not yet due</TableHead>
          <TableHead className="text-right">0–30 days</TableHead>
          <TableHead className="text-right">31–60</TableHead>
          <TableHead className="text-right">61–90</TableHead>
          <TableHead className="text-right">90+</TableHead>
          <TableHead>Next due</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.student_id}>
            <TableCell>
              <StudentCell row={row} />
            </TableCell>
            <TableCell className="text-sm">{row.class_name ?? '—'}</TableCell>
            <TableCell>
              <Badge tone={STATUS_TONE[row.status] ?? 'neutral'} size="sm">
                {STATUS_LABEL[row.status] ?? row.status}
              </Badge>
            </TableCell>
            <TableCell className="text-right text-sm font-medium tabular-nums">
              {formatMoney(row.amount_due, row.currency || currency)}
            </TableCell>
            <TableCell className="text-right text-sm tabular-nums">{cell(row.ageing.not_due)}</TableCell>
            <TableCell className="text-right text-sm tabular-nums text-warning">{cell(row.ageing.d0_30)}</TableCell>
            <TableCell className="text-right text-sm tabular-nums text-warning">{cell(row.ageing.d31_60)}</TableCell>
            <TableCell className="text-right text-sm tabular-nums text-danger">{cell(row.ageing.d61_90)}</TableCell>
            <TableCell className="text-right text-sm tabular-nums text-danger">{cell(row.ageing.over_90)}</TableCell>
            <TableCell className="text-xs">
              {row.next_due ? (
                <>
                  <span className="font-medium">{row.next_due.label}</span>
                  <span className="text-muted-foreground">
                    {row.next_due.due_date ? ` · ${formatDate(row.next_due.due_date)}` : ''}
                    {row.next_due.is_overdue ? ` · ${row.next_due.days_overdue} days late` : ''}
                  </span>
                </>
              ) : row.status === 'NOT_BILLED' ? (
                <span className="text-muted-foreground">Not billed yet</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function CollectionsTable({ rows, currency }: { rows: FeeCollectionRow[]; currency: string }) {
  const remove = useDeleteFeeReceipt()
  return (
    <Table containerClassName="max-h-[70vh]">
      <TableHeader sticky>
        <TableRow className="hover:bg-transparent">
          <TableHead>Received</TableHead>
          <TableHead className="min-w-52">Student</TableHead>
          <TableHead>Class</TableHead>
          <TableHead>Invoice</TableHead>
          <TableHead>Against</TableHead>
          <TableHead className="min-w-44">Fees settled</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Recorded by</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={`${row.invoice_id ?? row.receipt_id}-${index}`}>
            <TableCell className="text-xs tabular-nums">{formatDateTime(row.paid_at)}</TableCell>
            <TableCell>
              <p className="truncate text-sm font-medium">{row.student_name ?? `Student ${row.student_id}`}</p>
              <p className="truncate text-xs text-muted-foreground">{row.admission_number ?? ''}</p>
            </TableCell>
            <TableCell className="text-sm">{row.class_name ?? '—'}</TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {row.source === 'OPENING_BALANCE' ? (
                <Badge tone="neutral" size="sm" title={row.note ?? undefined}>
                  <History />
                  Before this system
                </Badge>
              ) : (
                row.invoice_number ?? row.invoice_id
              )}
            </TableCell>
            <TableCell className="text-xs">
              {row.instalment_label ??
                (row.instalments_settled.length > 0 ? row.instalments_settled.join(', ') : 'Oldest first')}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {row.heads.length === 0 ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  row.heads.map((head) => (
                    <Badge
                      key={`${head.fee_head_id ?? 'x'}-${head.name}`}
                      tone={head.is_admission_charge ? 'accent' : 'outline'}
                      size="sm"
                    >
                      {head.name} · {formatMoney(head.amount, row.currency || currency)}
                    </Badge>
                  ))
                )}
              </div>
            </TableCell>
            <TableCell className="text-xs">
              {PAYMENT_METHOD_LABEL[row.method as PaymentMethod] ?? row.method}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">{row.reference ?? '—'}</TableCell>
            <TableCell className="text-right text-sm font-medium tabular-nums text-success">
              {formatMoney(row.amount, row.currency || currency)}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-2">
                <span>{row.recorded_by_name ?? (row.recorded_by ? `#${row.recorded_by}` : '—')}</span>
                {row.source === 'OPENING_BALANCE' && row.receipt_id != null && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove this receipt"
                    title="Remove this receipt"
                    loading={remove.isPending && remove.variables === row.receipt_id}
                    onClick={() => {
                      if (window.confirm('Remove this receipt? It is erased, not reversed.')) {
                        remove.mutate(row.receipt_id as number)
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * Money received before this system existed, entered after the fact.
 *
 * One fee, one amount, one date. It goes into the collections report and
 * nowhere else: it never changes what the student owes, because their
 * admission category already says the charge does not apply to them.
 */
function PastPaymentDialog({
  open,
  onOpenChange,
  academicYearId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  academicYearId: number | null
}) {
  const students = useUsers('STUDENT')
  const heads = useFeeHeads({ includeInactive: true }, open)
  const record = useRecordFeeReceipt()

  const [studentId, setStudentId] = React.useState('')
  const [headId, setHeadId] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [paidOn, setPaidOn] = React.useState(todayApiDate())
  const [method, setMethod] = React.useState<PaymentMethod>('CASH')
  const [reference, setReference] = React.useState('')
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  // The admission fee is what this is for nine times out of ten: preselect it,
  // and its amount, the first time the heads arrive.
  React.useEffect(() => {
    if (headId || !heads.data?.length) return
    const admission = heads.data.find((h) => h.is_admission_charge) ?? heads.data[0]
    setHeadId(String(admission.id))
    setAmount(String(admission.default_amount ?? ''))
  }, [heads.data, headId])

  const reset = () => {
    setStudentId('')
    setAmount('')
    setReference('')
    setNote('')
    setError(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    const value = Number(amount)
    if (!studentId) return setError('Choose the student.')
    if (!headId) return setError('Choose the fee.')
    if (!Number.isFinite(value) || value <= 0) return setError('Enter the amount received.')
    try {
      await record.mutateAsync({
        student_id: Number(studentId),
        fee_head_id: Number(headId),
        amount: value,
        paid_at: paidOn,
        method,
        reference: reference.trim() || null,
        note: note.trim() || null,
        academic_year_id: academicYearId ?? null,
      })
      reset()
      onOpenChange(false)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not record the payment.')
    }
  }

  const studentOptions = (students.data ?? []).map((u) => ({
    value: String(u.id),
    label: u.full_name ?? `Student ${u.id}`,
    hint: u.admission_number ?? u.email ?? undefined,
  }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Record a past payment</DialogTitle>
            <DialogDescription>
              Money received before this system was in use, such as the admission fee a
              student paid when they joined. It is added to the collections report and
              changes nothing about what the student owes.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="past_student">Student</Label>
              <Combobox
                id="past_student"
                value={studentId}
                onChange={setStudentId}
                options={studentOptions}
                placeholder={students.isPending ? 'Loading students…' : 'Search by name or admission number'}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="past_head">Fee</Label>
                <Select
                  value={headId}
                  onValueChange={(v) => {
                    setHeadId(v)
                    const head = heads.data?.find((h) => String(h.id) === v)
                    if (head?.default_amount != null) setAmount(String(head.default_amount))
                  }}
                >
                  <SelectTrigger id="past_head">
                    <SelectValue placeholder="Choose a fee" />
                  </SelectTrigger>
                  <SelectContent>
                    {(heads.data ?? []).map((head) => (
                      <SelectItem key={head.id} value={String(head.id)}>
                        {head.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="past_amount">Amount received</Label>
                <Input
                  id="past_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Received on</Label>
                <DatePicker value={paidOn} onChange={(v) => v && setPaidOn(v)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="past_method">Method</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                  <SelectTrigger id="past_method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="past_reference">Reference</Label>
                <Input
                  id="past_reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Old receipt number, ledger page…"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="past_note">Note</Label>
                <Textarea
                  id="past_note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Anything the next person should know about this entry"
                />
              </div>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={record.isPending}>
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------------- tab

export function FinanceReportsTab({
  academicYearId,
  academicYearStart,
}: {
  academicYearId: number | null
  /** The session year's first day: the collections window opens on it, not on the month. */
  academicYearStart?: string | null
}) {
  const [view, setView] = React.useState<FeeReportView>('students')
  const [pastOpen, setPastOpen] = React.useState(false)
  const [classId, setClassId] = React.useState('')
  const [status, setStatus] = React.useState('ALL')
  const [method, setMethod] = React.useState('ALL')
  const [headId, setHeadId] = React.useState('ALL')
  const { from, to, setPeriod } = useReportPeriod('month')
  const classes = useClasses()

  // The cash book of a school runs by the academic year, not the calendar
  // month: money entered from before this system carries the date it was
  // actually received, which "this month" would never show. Seeded once,
  // when the year is known, and never re-applied over a choice the admin made.
  const seeded = React.useRef(false)
  React.useEffect(() => {
    if (seeded.current || !academicYearStart) return
    seeded.current = true
    const today = todayApiDate()
    if (academicYearStart <= today) {
      setPeriod({ preset: 'custom', from: academicYearStart, to: today })
    }
  }, [academicYearStart, setPeriod])
  // Inactive heads included: a fee retired last year still has payments this year.
  const heads = useFeeHeads({ includeInactive: true }, view === 'collections')

  const classFilter = classId ? Number(classId) : undefined
  const roll = useFeeRollReport(
    { academicYearId: academicYearId ?? undefined, classId: classFilter, status: status === 'ALL' ? undefined : status },
    view === 'students',
  )
  const dues = useFeeDuesReport(
    { academicYearId: academicYearId ?? undefined, classId: classFilter },
    view === 'dues',
  )
  const collections = useFeeCollectionsReport(
    {
      academicYearId: academicYearId ?? undefined,
      classId: classFilter,
      fromDate: from,
      toDate: to,
      method: method === 'ALL' ? undefined : method,
      headId: headId === 'ALL' ? undefined : Number(headId),
    },
    view === 'collections',
  )

  const classOptions = [
    { value: '', label: 'Every class' },
    ...(classes.data ?? []).map((c) => ({ value: String(c.id), label: c.name, hint: c.code })),
  ]

  const exportParams = {
    academic_year_id: academicYearId ?? undefined,
    class_id: classFilter,
    status: view === 'students' && status !== 'ALL' ? status : undefined,
    from_date: view === 'collections' ? from : undefined,
    to_date: view === 'collections' ? to : undefined,
    method: view === 'collections' && method !== 'ALL' ? method : undefined,
    head_id: view === 'collections' && headId !== 'ALL' ? Number(headId) : undefined,
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Segmented
            layoutId="fee-report-view"
            value={view}
            onChange={setView}
            options={[
              { value: 'students', label: 'Students', icon: <Users /> },
              { value: 'dues', label: 'Dues', icon: <BarChart3 /> },
              { value: 'collections', label: 'Collections', icon: <Receipt /> },
            ]}
          />
          <div className="min-w-44">
            <Combobox
              value={classId}
              onChange={(v) => setClassId(v ?? '')}
              options={classOptions}
              placeholder="Every class"
            />
          </div>
          {view === 'students' && (
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {view === 'collections' && (
            <>
              <PeriodPicker from={from} to={to} onChange={setPeriod} />
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Every method</SelectItem>
                  {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={headId} onValueChange={setHeadId}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Every fee</SelectItem>
                  {(heads.data ?? []).map((head) => (
                    <SelectItem key={head.id} value={String(head.id)}>
                      {head.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view === 'collections' && (
            <Button variant="outline" size="sm" onClick={() => setPastOpen(true)}>
              <History />
              Record past payment
            </Button>
          )}
          <ExportButton view={view} params={exportParams} />
        </div>
      </div>
      <PastPaymentDialog open={pastOpen} onOpenChange={setPastOpen} academicYearId={academicYearId} />

      {view === 'students' && (
        <QueryBoundary query={roll} loading={<Skeleton className="h-96 w-full rounded-xl" />}>
          {(data) => (
            <>
              <Card className="p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Stat label="Students" value={data.summary.students} hint={data.academic_year_name ?? undefined} />
                  <Stat label="Paid in full" value={data.summary.paid} tone="text-success" />
                  <Stat label="Part paid" value={data.summary.partially_paid} tone="text-warning" />
                  <Stat label="Overdue" value={data.summary.overdue} tone={data.summary.overdue > 0 ? 'text-danger' : undefined} />
                  <Stat label="Unpaid" value={data.summary.unpaid} />
                  <Stat label="Not billed yet" value={data.summary.not_billed} tone="text-muted-foreground" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 sm:grid-cols-4">
                  <Stat label="Billed" value={formatMoney(data.summary.total_billed, data.currency)} />
                  <Stat label="Collected" value={formatMoney(data.summary.total_collected, data.currency)} tone="text-success" />
                  <Stat label="Outstanding on invoices" value={formatMoney(data.summary.total_outstanding, data.currency)} tone={data.summary.total_outstanding > 0 ? 'text-warning' : undefined} />
                  <Stat
                    label="Expected from unbilled"
                    value={formatMoney(data.summary.expected_unbilled, data.currency)}
                    hint="What the rules would bill students with no invoice yet"
                  />
                </div>
              </Card>
              {data.rows.length === 0 ? (
                <EmptyState
                  icon={<Users />}
                  title="Nobody matches"
                  description="No student in this year fits the class and status chosen. Students appear here once they are assigned to the session year under Admissions."
                />
              ) : (
                <RollTable rows={data.rows} currency={data.currency} />
              )}
            </>
          )}
        </QueryBoundary>
      )}

      {view === 'dues' && (
        <QueryBoundary query={dues} loading={<Skeleton className="h-96 w-full rounded-xl" />}>
          {(data) => (
            <>
              <Card className="p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Stat label="Total due" value={formatMoney(data.summary.total_due, data.currency)} tone="text-warning" hint={`${data.summary.students} student${data.summary.students === 1 ? '' : 's'}`} />
                  <Stat label="Not yet due" value={formatMoney(data.summary.ageing.not_due, data.currency)} />
                  <Stat label="0–30 days late" value={formatMoney(data.summary.ageing.d0_30, data.currency)} tone="text-warning" />
                  <Stat label="31–60 days" value={formatMoney(data.summary.ageing.d31_60, data.currency)} tone="text-warning" />
                  <Stat label="61–90 days" value={formatMoney(data.summary.ageing.d61_90, data.currency)} tone="text-danger" />
                  <Stat label="Over 90 days" value={formatMoney(data.summary.ageing.over_90, data.currency)} tone="text-danger" />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  As of {formatDate(data.as_of)}. Overdue amounts are aged from each instalment's
                  due date; students not billed yet are counted under “not yet due” at what the
                  rules would charge them.
                </p>
              </Card>
              {data.rows.length === 0 ? (
                <EmptyState icon={<BarChart3 />} title="Nothing owed" description="Every student in this year is settled." />
              ) : (
                <DuesTable rows={data.rows} currency={data.currency} />
              )}
            </>
          )}
        </QueryBoundary>
      )}

      {view === 'collections' && (
        <QueryBoundary query={collections} loading={<Skeleton className="h-96 w-full rounded-xl" />}>
          {(data) => (
            <>
              <Card className="p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {data.summary.head ? (
                    <Stat
                      label={`${data.summary.head.name} collected`}
                      value={formatMoney(data.summary.head.total, data.currency)}
                      tone="text-success"
                      hint={`${data.summary.head.count} payment${data.summary.head.count === 1 ? '' : 's'} totalling ${formatMoney(data.summary.total, data.currency)}`}
                    />
                  ) : (
                    <Stat
                      label="Collected"
                      value={formatMoney(data.summary.total, data.currency)}
                      tone="text-success"
                      hint={`${formatDate(data.from_date)} – ${formatDate(data.to_date)}`}
                    />
                  )}
                  <Stat
                    label="Admission fees"
                    value={formatMoney(data.summary.admission_fees, data.currency)}
                    tone={data.summary.admission_fees > 0 ? 'text-accent' : 'text-muted-foreground'}
                    hint="Share of the above that settled the admission fee"
                  />
                  <Stat
                    label="Tuition & other fees"
                    value={formatMoney(data.summary.other_fees, data.currency)}
                  />
                  <Stat label="Payments" value={data.summary.count} />
                </div>
                {(data.summary.by_head.length > 0 || Object.keys(data.summary.by_method).length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                    {data.summary.by_head.map((head) => (
                      <Badge
                        key={`${head.fee_head_id ?? 'x'}-${head.name}`}
                        tone={head.is_admission_charge ? 'accent' : 'neutral'}
                        size="sm"
                      >
                        {head.name} · {formatMoney(head.total, data.currency)}
                      </Badge>
                    ))}
                    {Object.entries(data.summary.by_method)
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([key, bucket]) => (
                        <Badge key={key} tone="outline" size="sm">
                          {PAYMENT_METHOD_LABEL[key as PaymentMethod] ?? key} · {formatMoney(bucket.total, data.currency)}
                        </Badge>
                      ))}
                  </div>
                )}
                {data.summary.by_day.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {data.summary.by_day.map((day) => (
                      <Badge key={day.date} tone="outline" size="sm">
                        {formatDate(day.date)} · {formatMoney(day.total, data.currency)}
                      </Badge>
                    ))}
                  </div>
                )}
              </Card>
              {data.rows.length === 0 ? (
                <EmptyState
                  icon={<Receipt />}
                  title="Nothing received in this period"
                  description="Payments recorded at the counter or online appear here the moment they are recorded. Fees paid before this system can be entered with “Record past payment”."
                />
              ) : (
                <CollectionsTable rows={data.rows} currency={data.currency} />
              )}
            </>
          )}
        </QueryBoundary>
      )}
    </div>
  )
}

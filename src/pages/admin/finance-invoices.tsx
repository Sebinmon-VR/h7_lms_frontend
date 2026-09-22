import {
  AlertTriangle,
  Ban,
  Calculator,
  Check,
  CircleDollarSign,
  FileText,
  HandCoins,
  Receipt,
  Send,
  TimerReset,
} from 'lucide-react'
import * as React from 'react'

import type {
  FeeInvoiceOut,
  InvoiceStatus,
  PaymentMethod,
} from '@/api/types'
import {
  useApplyLateFees,
  useCancelInvoice,
  useCollectFee,
  useFeeBreakdown,
  useFeeInvoices,
  useGenerateInvoice,
  useIssueInvoice,
  useRecordPayment,
  useWaiveInstalment,
} from '@/queries/finance.queries'
import { useUsers } from '@/queries/admin.queries'
import { formatDate } from '@/lib/datetime'
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, formatMoney } from '@/lib/tuition'
import {
  INSTALMENT_STATUS_LABEL,
  OFFLINE_PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  nextDueInstalment,
} from '@/lib/school'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
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
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { FeeBreakdownView } from './finance-breakdown'

/**
 * Invoices, and the one-student preview that precedes them.
 *
 * The lifecycle has two halves and the screen keeps them apart:
 *
 *  - a DRAFT is a computation. Rebuilding it re-prices it against whatever the
 *    rules now say, and nothing about it is owed yet;
 *  - an ISSUED invoice has a number and FROZEN figures. Changing a fee head
 *    afterwards does not move it, which is the point.
 *
 * Two refusals are expected rather than exceptional, and are explained in place
 * rather than toasted: cancelling an invoice money has been taken against, and
 * previewing a student no structure matches.
 */

function PaymentDialog({
  invoice,
  onClose,
}: {
  invoice: FeeInvoiceOut | null
  onClose: () => void
}) {
  const record = useRecordPayment()
  const [amount, setAmount] = React.useState('')
  const [method, setMethod] = React.useState<PaymentMethod>('CASH')
  const [reference, setReference] = React.useState('')
  const [label, setLabel] = React.useState<string>('')
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!invoice) return
    const due = nextDueInstalment(invoice.instalments)
    setAmount(due ? String(due.outstanding ?? due.amount - due.amount_paid) : String(invoice.amount_outstanding))
    setLabel(due?.label ?? '')
    setMethod('CASH')
    setReference('')
    setNote('')
    setError(null)
  }, [invoice])

  const submit = async () => {
    if (!invoice) return
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    setError(null)
    try {
      await record.mutateAsync({
        invoiceId: invoice.id,
        body: {
          amount: value,
          method,
          reference: reference.trim() || null,
          // Omitted rather than blank: the backend settles oldest-first when
          // no label is given, which is what a clerk taking a lump sum wants.
          instalment_label: label || null,
          note: note.trim() || null,
        },
      })
      onClose()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not record the payment.')
    }
  }

  return (
    <Dialog open={!!invoice} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            Money the office already has. Online payment is a separate flow and no gateway is
            connected yet.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />

          {invoice && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              {invoice.student_name} owes{' '}
              <strong className="tabular-nums">
                {formatMoney(invoice.amount_outstanding, invoice.currency)}
              </strong>
            </p>
          )}

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field id="pay_amount" label="Amount" required>
              <Input
                id="pay_amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field id="pay_method" label="How it arrived">
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger id="pay_method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OFFLINE_PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field
            id="pay_instalment"
            label="Against"
            hint="Leave on “oldest first” unless the payer named an instalment."
          >
            <Select value={label || 'AUTO'} onValueChange={(v) => setLabel(v === 'AUTO' ? '' : v)}>
              <SelectTrigger id="pay_instalment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AUTO">Oldest unpaid first</SelectItem>
                {(invoice?.instalments ?? []).map((i) => (
                  <SelectItem key={i.label} value={i.label}>
                    {i.label} — {formatMoney(i.amount, invoice?.currency ?? 'INR')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            id="pay_reference"
            label="Reference"
            hint="Cheque number, UTR or receipt number."
          >
            <Input
              id="pay_reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>

          <Field id="pay_note" label="Note">
            <Textarea id="pay_note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={record.isPending}>
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The counter.
 *
 * "A parent is here with the money" is the office's commonest fee task, and it
 * used to take three screens: preview, build the draft, issue, then record.
 * This is one dialog: pick the student, see what they owe this year, take the
 * money. The backend builds and issues the invoice on the way if it has to.
 */
function CollectFeeDialog({
  open,
  onOpenChange,
  academicYearId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  academicYearId: number | null
}) {
  const students = useUsers('STUDENT')
  const collect = useCollectFee()

  const [studentId, setStudentId] = React.useState<number | null>(null)
  const [amount, setAmount] = React.useState('')
  const [method, setMethod] = React.useState<PaymentMethod>('CASH')
  const [label, setLabel] = React.useState('')
  const [reference, setReference] = React.useState('')
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [receipt, setReceipt] = React.useState<FeeInvoiceOut | null>(null)

  // What this student owes this year: the live invoice when there is one, else
  // the computed breakdown, which is exactly what the invoice will be built from.
  const invoices = useFeeInvoices(
    { studentId: studentId ?? undefined, academicYearId: academicYearId ?? undefined },
    open && studentId != null,
  )
  const breakdown = useFeeBreakdown(
    studentId,
    { academicYearId: academicYearId ?? undefined },
    open && studentId != null,
  )
  const live = (invoices.data ?? []).find((i) => i.status !== 'CANCELLED') ?? null
  const currency = live?.currency ?? breakdown.data?.currency ?? 'INR'
  const instalments = live ? live.instalments : (breakdown.data?.instalments ?? [])
  const owed = live ? live.amount_outstanding : (breakdown.data?.total_amount ?? 0)
  const nothingToBill = !live && breakdown.data != null && breakdown.data.total_amount <= 0
  const loading = studentId != null && (invoices.isPending || breakdown.isPending)

  React.useEffect(() => {
    if (!open) {
      setStudentId(null)
      setReceipt(null)
      setError(null)
    }
  }, [open])

  // Defaults follow the student: the next unpaid instalment, oldest first.
  React.useEffect(() => {
    if (studentId == null || loading) return
    const due = nextDueInstalment(instalments)
    setAmount(due ? String(due.outstanding ?? due.amount - due.amount_paid) : String(owed))
    setLabel(due?.label ?? '')
    setMethod('CASH')
    setReference('')
    setNote('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, loading, live?.id])

  const options = (students.data ?? []).map((s) => ({
    value: String(s.id),
    label: s.full_name,
    description: s.admission_number ?? s.email,
  }))

  const submit = async () => {
    if (studentId == null) return setError('Pick a student.')
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) return setError('Enter an amount greater than zero.')
    setError(null)
    try {
      const invoice = await collect.mutateAsync({
        studentId,
        body: {
          amount: value,
          method,
          reference: reference.trim() || null,
          instalment_label: label || null,
          note: note.trim() || null,
          academic_year_id: academicYearId,
        },
      })
      setReceipt(invoice)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not record the payment.')
    }
  }

  const lastPayment = receipt?.payments[receipt.payments.length - 1]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{receipt ? 'Payment recorded' : 'Collect a fee'}</DialogTitle>
          <DialogDescription>
            {receipt
              ? 'Give the payer the receipt number. The invoice updates on their fee page immediately.'
              : 'Money received at the counter. If the student has not been billed for the year yet, the invoice is built and issued as part of this.'}
          </DialogDescription>
        </DialogHeader>

        {receipt ? (
          <DialogBody className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/8 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success text-white">
                <Check className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {formatMoney(lastPayment?.amount ?? 0, receipt.currency)} from{' '}
                  {receipt.student_name ?? 'the student'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {lastPayment?.method ? PAYMENT_METHOD_LABEL[lastPayment.method as PaymentMethod] ?? lastPayment.method : ''}
                  {lastPayment?.reference ? ` · ${lastPayment.reference}` : ''}
                  {lastPayment?.instalment_label ? ` · ${lastPayment.instalment_label}` : ''}
                </p>
              </div>
            </div>
            <dl className="space-y-1.5 rounded-xl border border-border p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Invoice</dt>
                <dd className="font-medium">{receipt.invoice_number ?? receipt.id}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Invoice total</dt>
                <dd className="tabular-nums">{formatMoney(receipt.total_amount, receipt.currency)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Paid so far</dt>
                <dd className="tabular-nums text-success">{formatMoney(receipt.amount_paid, receipt.currency)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-border pt-1.5 font-semibold">
                <dt>Still owed</dt>
                <dd className={receipt.amount_outstanding > 0 ? 'tabular-nums text-warning' : 'tabular-nums text-success'}>
                  {receipt.amount_outstanding > 0
                    ? formatMoney(receipt.amount_outstanding, receipt.currency)
                    : 'Nothing — settled'}
                </dd>
              </div>
            </dl>
            {receipt.instalments.length > 0 && (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {receipt.instalments.map((i) => (
                  <li key={i.label} className="flex justify-between gap-3">
                    <span>
                      {i.label}
                      {i.due_date ? ` · due ${formatDate(i.due_date)}` : ''}
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(i.amount_paid, receipt.currency)} of {formatMoney(i.amount, receipt.currency)}
                      {' · '}
                      {INSTALMENT_STATUS_LABEL[i.status] ?? i.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DialogBody>
        ) : (
          <DialogBody className="space-y-5">
            <FormError message={error} />

            <Field id="collect_student" label="Student" required>
              <Combobox
                options={options}
                value={studentId ? String(studentId) : ''}
                onChange={(v) => setStudentId(Number(v))}
                placeholder="Search students…"
              />
            </Field>

            {studentId != null && (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
                {loading ? (
                  <Skeleton className="h-5 w-48" />
                ) : nothingToBill ? (
                  <span className="flex gap-2 text-warning">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Nothing to bill: no fee structure matches this student for the year, so
                      no payment can be taken against them yet.
                    </span>
                  </span>
                ) : (
                  <>
                    <span>
                      Owes <strong className="tabular-nums">{formatMoney(owed, currency)}</strong>
                      {live
                        ? ` on invoice ${live.invoice_number ?? live.id}`
                        : ' this year — the invoice will be built and issued now.'}
                    </span>
                    {instalments.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                        {instalments.map((i) => (
                          <li key={i.label} className="flex justify-between gap-3">
                            <span>
                              {i.label}
                              {i.due_date ? ` · due ${formatDate(i.due_date)}` : ''}
                              {i.components?.length
                                ? ` · ${i.components.map((c) => `${c.name} ${formatMoney(c.amount, currency)}`).join(' + ')}`
                                : ''}
                            </span>
                            <span className="tabular-nums">
                              {formatMoney(i.outstanding ?? i.amount - i.amount_paid, currency)}
                              {i.amount_paid > 0 ? ' left' : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field id="collect_amount" label="Amount received" required>
                <Input
                  id="collect_amount"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={studentId == null || nothingToBill}
                />
              </Field>
              <Field id="collect_method" label="How it arrived">
                <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                  <SelectTrigger id="collect_method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OFFLINE_PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field
              id="collect_instalment"
              label="Against"
              hint="Leave on “oldest first” unless the payer named a term."
            >
              <Select value={label || 'AUTO'} onValueChange={(v) => setLabel(v === 'AUTO' ? '' : v)}>
                <SelectTrigger id="collect_instalment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO">Oldest unpaid first</SelectItem>
                  {instalments.map((i) => (
                    <SelectItem key={i.label} value={i.label}>
                      {i.label} — {formatMoney(i.outstanding ?? i.amount - i.amount_paid, currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field id="collect_reference" label="Receipt or reference" hint="Receipt book number, cheque number, UTR.">
                <Input
                  id="collect_reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </Field>
              <Field id="collect_note" label="Note">
                <Input id="collect_note" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
          </DialogBody>
        )}

        <DialogFooter>
          {receipt ? (
            <>
              <Button variant="outline" onClick={() => setReceipt(null)}>
                Collect another
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={submit}
                loading={collect.isPending}
                disabled={studentId == null || loading || nothingToBill}
              >
                <HandCoins />
                Record {Number(amount) > 0 ? formatMoney(Number(amount), currency) : 'payment'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WaiveDialog({
  invoice,
  onClose,
}: {
  invoice: FeeInvoiceOut | null
  onClose: () => void
}) {
  const waive = useWaiveInstalment()
  const [label, setLabel] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!invoice) return
    setLabel(nextDueInstalment(invoice.instalments)?.label ?? '')
    setReason('')
    setError(null)
  }, [invoice])

  const submit = async () => {
    if (!invoice) return
    if (!label) return setError('Pick the instalment to write off.')
    if (!reason.trim()) {
      // The backend requires this, and so it should: a waiver with no stated
      // cause cannot be audited afterwards.
      return setError('A reason is required — a write-off with no stated cause cannot be audited.')
    }
    setError(null)
    try {
      await waive.mutateAsync({ invoiceId: invoice.id, body: { label, reason: reason.trim() } })
      onClose()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not write off the instalment.')
    }
  }

  return (
    <Dialog open={!!invoice} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Write off an instalment</DialogTitle>
          <DialogDescription>
            The amount stops being owed and the reason is kept on the record permanently.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />
          <Field id="waive_label" label="Instalment" required>
            <Select value={label} onValueChange={setLabel}>
              <SelectTrigger id="waive_label">
                <SelectValue placeholder="Pick one…" />
              </SelectTrigger>
              <SelectContent>
                {(invoice?.instalments ?? []).map((i) => (
                  <SelectItem key={i.label} value={i.label}>
                    {i.label} — {formatMoney(i.amount, invoice?.currency ?? 'INR')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="waive_reason" label="Reason" required>
            <Textarea
              id="waive_reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Hardship approved by the principal on 12 March"
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={waive.isPending}>
            Write it off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InvoiceRow({
  invoice,
  onOpen,
  onIssue,
  onPay,
  onWaive,
  onLateFees,
  onCancel,
}: {
  invoice: FeeInvoiceOut
  onOpen: () => void
  onIssue: () => void
  onPay: () => void
  onWaive: () => void
  onLateFees: () => void
  onCancel: () => void
}) {
  const isDraft = invoice.status === 'DRAFT'
  const settled = invoice.status === 'PAID' || invoice.status === 'CANCELLED'

  /**
   * A zero-total invoice cannot be issued — the backend refuses it with a 400,
   * because it means no fee structure matched the student and sending a parent
   * a bill for nothing is a support call rather than a courtesy.
   *
   * Surfaced here rather than left to the refusal: a disabled button with the
   * reason beside it tells the bursar what to go and fix, where a toast on
   * click only tells them they wasted one.
   */
  const nothingToBill = invoice.total_amount <= 0

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" className="min-w-0 text-left" onClick={onOpen}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              {invoice.student_name ?? `Student ${invoice.student_id}`}
            </h3>
            <Badge tone={INVOICE_STATUS_TONE[invoice.status]} size="sm">
              {INVOICE_STATUS_LABEL[invoice.status]}
            </Badge>
            {invoice.is_overdue && (
              <Badge tone="danger" size="sm">
                Overdue
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {/* Null until issued — that IS the distinction between a draft and
                a real invoice, so it is said rather than hidden. */}
            {invoice.invoice_number ?? 'Not yet issued'}
            {invoice.admission_number ? ` · ${invoice.admission_number}` : ''}
            {invoice.due_date ? ` · due ${formatDate(invoice.due_date)}` : ''}
          </p>
          {isDraft && nothingToBill && (
            <p className="mt-1.5 flex gap-2 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>
                <strong className="text-foreground">Nothing to bill.</strong> No fee structure
                matches this student's class or category for the year, so this cannot be
                issued. Build one under <strong>Structures</strong>, then rebuild the draft.
              </span>
            </p>
          )}

          <p className="mt-1 text-sm">
            <span className="font-medium tabular-nums">
              {formatMoney(invoice.total_amount, invoice.currency)}
            </span>
            {invoice.amount_paid > 0 && (
              <span className="text-muted-foreground">
                {' '}
                · {formatMoney(invoice.amount_paid, invoice.currency)} paid
              </span>
            )}
            {invoice.amount_outstanding > 0 && (
              <span className="text-warning">
                {' '}
                · {formatMoney(invoice.amount_outstanding, invoice.currency)} outstanding
              </span>
            )}
          </p>
        </button>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isDraft && (
            <Button size="sm" onClick={onIssue} disabled={nothingToBill}>
              <Send />
              Issue
            </Button>
          )}
          {!isDraft && !settled && (
            <>
              <Button size="sm" onClick={onPay}>
                <CircleDollarSign />
                Record payment
              </Button>
              {invoice.is_overdue && (
                <Button variant="outline" size="sm" onClick={onLateFees}>
                  <TimerReset />
                  Late fees
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onWaive}>
                Write off
              </Button>
            </>
          )}
          {!settled && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <Ban />
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

/** Preview a student's fees without billing them. Computes, stores nothing. */
function PreviewPanel({ academicYearId }: { academicYearId: number | null }) {
  const students = useUsers('STUDENT')
  const [studentId, setStudentId] = React.useState<number | null>(null)
  const breakdown = useFeeBreakdown(studentId, { academicYearId: academicYearId ?? undefined })
  const generate = useGenerateInvoice()

  const options = (students.data ?? []).map((s) => ({
    value: String(s.id),
    label: s.full_name,
    description: s.admission_number ?? s.email,
  }))

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Field
            id="preview_student"
            label="Preview a student's fees"
            hint="Nothing is billed — this computes what they would owe from the current rules."
          >
            <Combobox
              options={options}
              value={studentId ? String(studentId) : ''}
              onChange={(v) => setStudentId(Number(v))}
              placeholder="Search students…"
            />
          </Field>
        </div>
        {studentId && (
          <Button
            variant="outline"
            loading={generate.isPending}
            onClick={() =>
              generate.mutate({
                studentId,
                academicYearId: academicYearId ?? undefined,
              })
            }
          >
            <Calculator />
            Build the draft invoice
          </Button>
        )}
      </div>

      {studentId && (
        <QueryBoundary
          query={breakdown}
          loading={<Skeleton className="h-64 w-full rounded-xl" />}
        >
          {(data) => <FeeBreakdownView breakdown={data} showSkippedDiscounts />}
        </QueryBoundary>
      )}
    </Card>
  )
}

type Filter = 'ALL' | 'OVERDUE' | InvoiceStatus

/**
 * No `currency` prop: every invoice and breakdown carries its own, and the
 * school's setting can change between one being issued and being read. Taking
 * it from the row is the only way a historic invoice keeps rendering in the
 * currency it was actually billed in.
 */
export function FinanceInvoicesTab({
  academicYearId,
}: {
  academicYearId: number | null
}) {
  const [filter, setFilter] = React.useState<Filter>('ALL')
  const invoices = useFeeInvoices({
    academicYearId: academicYearId ?? undefined,
    status: filter === 'ALL' || filter === 'OVERDUE' ? undefined : filter,
    overdueOnly: filter === 'OVERDUE',
  })

  const issue = useIssueInvoice()
  const lateFees = useApplyLateFees()
  const cancel = useCancelInvoice()

  const [paying, setPaying] = React.useState<FeeInvoiceOut | null>(null)
  const [waiving, setWaiving] = React.useState<FeeInvoiceOut | null>(null)
  const [cancelling, setCancelling] = React.useState<FeeInvoiceOut | null>(null)
  const [opened, setOpened] = React.useState<FeeInvoiceOut | null>(null)
  const [collecting, setCollecting] = React.useState(false)

  return (
    <div className="space-y-5">
      {/* The counter first: taking money is the commonest thing this tab is
          opened for, and it must not depend on an invoice already existing. */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Collect a fee</h3>
          <p className="text-xs text-muted-foreground">
            Cash, cheque, transfer or card received at the office. The student's invoice is
            built and issued on the way if they have not been billed yet.
          </p>
        </div>
        <Button onClick={() => setCollecting(true)}>
          <HandCoins />
          Collect fee
        </Button>
      </Card>

      <PreviewPanel academicYearId={academicYearId} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          layoutId="invoice-filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'DRAFT', label: 'Drafts' },
            { value: 'ISSUED', label: 'Issued' },
            { value: 'OVERDUE', label: 'Arrears' },
            { value: 'PAID', label: 'Settled' },
          ]}
        />
      </div>

      <QueryBoundary
        query={invoices}
        loading={
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            icon={<Receipt />}
            title={filter === 'ALL' ? 'No invoices yet' : 'Nothing matches that filter'}
            description={
              filter === 'ALL'
                ? 'Preview a student above, then build their draft invoice from it.'
                : 'Try a different view.'
            }
          />
        }
      >
        {(rows) => (
          <div className="space-y-3">
            {rows.map((invoice) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                onOpen={() => setOpened(invoice)}
                onIssue={() => issue.mutate({ invoiceId: invoice.id })}
                onPay={() => setPaying(invoice)}
                onWaive={() => setWaiving(invoice)}
                onLateFees={() => lateFees.mutate({ invoiceId: invoice.id })}
                onCancel={() => setCancelling(invoice)}
              />
            ))}
          </div>
        )}
      </QueryBoundary>

      <CollectFeeDialog open={collecting} onOpenChange={setCollecting} academicYearId={academicYearId} />
      <PaymentDialog invoice={paying} onClose={() => setPaying(null)} />
      <WaiveDialog invoice={waiving} onClose={() => setWaiving(null)} />

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(v) => !v && setCancelling(null)}
        title="Cancel this invoice?"
        description={
          <>
            {cancelling && cancelling.amount_paid > 0 ? (
              <span className="flex gap-2 text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {formatMoney(cancelling.amount_paid, cancelling.currency)} has already been
                  taken against this invoice, so the backend will refuse the cancellation.
                  Correct it with an adjustment payment instead.
                </span>
              </span>
            ) : (
              'The invoice stops being owed. A draft can simply be rebuilt instead.'
            )}
          </>
        }
        confirmLabel="Cancel invoice"
        destructive
        loading={cancel.isPending}
        onConfirm={async () => {
          if (cancelling) await cancel.mutateAsync({ invoiceId: cancelling.id })
          setCancelling(null)
        }}
      />

      <Sheet open={!!opened} onOpenChange={(v) => !v && setOpened(null)}>
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {opened?.invoice_number ?? 'Draft invoice'} · {opened?.student_name}
            </SheetTitle>
          </SheetHeader>
          <SheetBody className="space-y-5">
            {opened && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {formatMoney(opened.total_amount, opened.currency)}
                    </p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground">Paid</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-success">
                      {formatMoney(opened.amount_paid, opened.currency)}
                    </p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground">Outstanding</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {formatMoney(opened.amount_outstanding, opened.currency)}
                    </p>
                  </Card>
                </div>

                {opened.payments.length > 0 && (
                  <Card className="p-5">
                    <h3 className="text-sm font-semibold">Payments</h3>
                    <ul className="mt-2 divide-y divide-border">
                      {opened.payments.map((payment, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm">
                              {PAYMENT_METHOD_LABEL[payment.method as PaymentMethod] ??
                                payment.method ??
                                'Payment'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {[payment.reference, payment.instalment_label]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-medium tabular-nums">
                            {formatMoney(payment.amount ?? 0, opened.currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                <Card className="p-5">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">What it is made of</h3>
                  </div>
                  <ul className="mt-2 divide-y divide-border">
                    {opened.line_items.map((line) => (
                      <li
                        key={line.fee_head_id}
                        className="flex items-center justify-between gap-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate">{line.name}</span>
                        <span className="shrink-0 tabular-nums">
                          {formatMoney(line.net_amount, opened.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  )
}

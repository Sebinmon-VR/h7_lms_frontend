import { AlertTriangle, Ban, Eraser, HandCoins, Send, TimerReset } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { FeeInvoiceOut, InvoiceStatus } from '@/api/types'
import {
  useApplyLateFees,
  useCancelInvoice,
  useFeeInvoices,
  useWaiveInstalment,
} from '@/queries/finance.queries'
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, formatMoney } from '@/lib/tuition'
import { INSTALMENT_STATUS_LABEL, INSTALMENT_STATUS_TONE, PAYMENT_METHOD_LABEL, nextDueInstalment } from '@/lib/school'
import { formatDate } from '@/lib/datetime'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
} from '@/components/layout/inline-panel'
import { Field, FormError } from '@/components/forms/field'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import {
  DETAIL_TH,
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
 * The Bills section: every fee bill as a list, the one picked in full beside it.
 *
 * A bill is issued, given concessions, extended with the fees left off at issue
 * and paid against on the fee counter; this lists them all, says what is still
 * owed and still not billed, and opens the counter for the student.
 */

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

type Filter = 'ALL' | 'OVERDUE' | 'NOT_BILLED' | InvoiceStatus

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All bills' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'ISSUED', label: 'Unpaid' },
  { value: 'PARTIALLY_PAID', label: 'Part paid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'NOT_BILLED', label: 'Fees not billed' },
  { value: 'DRAFT', label: 'Not issued' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

type Sort = 'name' | 'due' | 'number'

/**
 * No `currency` prop: every bill carries its own, and the school's setting can
 * change between one being issued and being read.
 */
export function FinanceInvoicesTab({ academicYearId }: { academicYearId: number | null }) {
  const [filter, setFilter] = React.useState<Filter>('ALL')
  const [sort, setSort] = React.useState<Sort>('name')
  const [search, setSearch] = React.useState('')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const invoices = useFeeInvoices({
    academicYearId: academicYearId ?? undefined,
    status: filter === 'ALL' || filter === 'OVERDUE' || filter === 'NOT_BILLED' ? undefined : filter,
    overdueOnly: filter === 'OVERDUE',
  })

  const lateFees = useApplyLateFees()
  const cancel = useCancelInvoice()
  const [waiving, setWaiving] = React.useState<FeeInvoiceOut | null>(null)
  const [cancelling, setCancelling] = React.useState<FeeInvoiceOut | null>(null)

  const term = search.trim().toLowerCase()
  const rows = (invoices.data ?? [])
    .filter((i) => i.status !== 'CANCELLED' || filter === 'CANCELLED')
    .filter((i) => filter !== 'NOT_BILLED' || (i.left_off ?? []).length > 0)
    .filter(
      (i) =>
        !term ||
        [i.student_name, i.admission_number, i.invoice_number].some((v) => (v ?? '').toLowerCase().includes(term)),
    )
    .sort((a, b) =>
      sort === 'due'
        ? b.amount_outstanding - a.amount_outstanding
        : sort === 'number'
          ? (a.invoice_number ?? '~').localeCompare(b.invoice_number ?? '~', undefined, { numeric: true })
          : (a.student_name ?? '').localeCompare(b.student_name ?? ''),
    )
  const selected = rows.find((i) => i.id === selectedId) ?? rows[0] ?? null
  const currency = rows[0]?.currency ?? 'INR'
  const totalDue = rows.reduce((n, i) => n + Math.max(0, i.amount_outstanding), 0)

  const list = (
    <ListPane
      toolbar={
        <>
          <ListSearch value={search} onChange={setSearch} placeholder="Student, adm. no or bill no" />
          <div className="flex gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <SelectTrigger className={cn('h-8 flex-1 px-2.5 text-xs', filter !== 'ALL' && 'border-primary/50 text-primary')} aria-label="Show">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger className="h-8 w-32 px-2.5 text-xs" aria-label="Sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name A–Z</SelectItem>
                <SelectItem value="due">Most due</SelectItem>
                <SelectItem value="number">Bill number</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      }
      footer={
        invoices.data && (
          <>
            {rows.length} bill{rows.length === 1 ? '' : 's'}
            {totalDue > 0 && <span className="font-medium text-warning"> · {formatMoney(totalDue, currency)} due</span>}
          </>
        )
      }
    >
      <QueryBoundary
        query={invoices}
        loading={
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        }
      >
        {() =>
          rows.length === 0 ? (
            <ListEmpty>{filter === 'ALL' && !term ? 'No bills yet. Issue one at the fee counter' : 'Nothing matches'}</ListEmpty>
          ) : (
            <>
              {rows.map((i) => {
                const overdue = i.is_overdue && i.amount_outstanding > 0
                return (
                  <ListItem
                    key={i.id}
                    active={selected?.id === i.id}
                    onClick={() => {
                      setSelectedId(i.id)
                      setWaiving(null)
                    }}
                    title={i.student_name ?? `Student ${i.student_id}`}
                    sub={[i.invoice_number ?? 'Not issued', i.admission_number].filter(Boolean).join(' · ')}
                    muted={i.status === 'CANCELLED'}
                    right={
                      i.status === 'DRAFT' ? (
                        <span className="text-muted-foreground">Not issued</span>
                      ) : i.status === 'CANCELLED' ? (
                        <span className="text-muted-foreground">Cancelled</span>
                      ) : i.amount_outstanding > 0 ? (
                        <span className={cn('font-medium tabular-nums', overdue ? 'text-danger' : 'text-warning')}>
                          {formatMoney(i.amount_outstanding, i.currency)}
                        </span>
                      ) : (
                        <span className="font-medium text-success">Paid</span>
                      )
                    }
                  />
                )
              })}
            </>
          )
        }
      </QueryBoundary>
    </ListPane>
  )

  return (
    <>
      <SplitView
        list={list}
        detail={
          selected ? (
            <BillDetail
              bill={selected}
              waiving={waiving?.id === selected.id}
              onWaive={() => setWaiving(selected)}
              onCloseWaive={() => setWaiving(null)}
              onLateFees={() => lateFees.mutate({ invoiceId: selected.id })}
              lateFeesPending={lateFees.isPending}
              onCancel={() => setCancelling(selected)}
            />
          ) : (
            <p className="px-5 py-16 text-center text-sm text-muted-foreground">
              {invoices.isPending ? '' : 'Pick a bill on the left to see it in full'}
            </p>
          )
        }
      />

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(v) => !v && setCancelling(null)}
        title="Cancel this bill?"
        description={
          <>
            {cancelling && cancelling.amount_paid > 0 ? (
              <span className="flex gap-2 text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {formatMoney(cancelling.amount_paid, cancelling.currency)} has already been paid against
                  this bill, so it cannot be cancelled. Correct it with a write-off instead.
                </span>
              </span>
            ) : (
              'The bill stops being owed and disappears from the family’s Fees page. You can issue a new one at the fee counter.'
            )}
          </>
        }
        confirmLabel="Cancel bill"
        destructive
        loading={cancel.isPending}
        onConfirm={async () => {
          if (cancelling) await cancel.mutateAsync({ invoiceId: cancelling.id })
          setCancelling(null)
        }}
      />
    </>
  )
}

function BillDetail({
  bill,
  waiving,
  onWaive,
  onCloseWaive,
  onLateFees,
  lateFeesPending,
  onCancel,
}: {
  bill: FeeInvoiceOut
  waiving: boolean
  onWaive: () => void
  onCloseWaive: () => void
  onLateFees: () => void
  lateFeesPending: boolean
  onCancel: () => void
}) {
  const draft = bill.status === 'DRAFT'
  const open = bill.status !== 'PAID' && bill.status !== 'CANCELLED'
  const leftOff = bill.left_off ?? []
  const overdue = bill.is_overdue && bill.amount_outstanding > 0
  const money = (n: number) => formatMoney(n, bill.currency)
  const payments = (bill.payments ?? []).slice().reverse()

  return (
    <div>
      <DetailHeader
        title={bill.student_name ?? `Student ${bill.student_id}`}
        badges={
          <Badge tone={overdue ? 'danger' : INVOICE_STATUS_TONE[bill.status]} size="sm">
            {draft ? 'Not issued' : overdue ? 'Overdue' : INVOICE_STATUS_LABEL[bill.status]}
          </Badge>
        }
        sub={[
          bill.invoice_number ? `Bill ${bill.invoice_number}` : 'Not issued yet',
          bill.admission_number,
          bill.academic_year_name,
          bill.issued_at ? `issued ${formatDate(bill.issued_at)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {!draft && open && bill.is_overdue && (
              <Button variant="outline" size="sm" icon={<TimerReset />} loading={lateFeesPending} onClick={onLateFees}>
                Late fees
              </Button>
            )}
            {!draft && open && (
              <Button variant="outline" size="sm" icon={<Eraser />} onClick={onWaive}>
                Write off
              </Button>
            )}
            {open && bill.amount_paid <= 0 && (
              <Button variant="ghost" size="sm" icon={<Ban />} onClick={onCancel}>
                Cancel
              </Button>
            )}
            {bill.status !== 'CANCELLED' && (
              <Button size="sm" asChild>
                <Link to={`/admin/fee-collection?student=${bill.student_id}`}>
                  {draft ? <Send /> : <HandCoins />}
                  {draft ? 'Issue' : leftOff.length > 0 ? 'Bill the rest' : open ? 'Collect' : 'Open at counter'}
                </Link>
              </Button>
            )}
          </>
        }
      />

      {waiving && <WaiveDialog invoice={bill} onClose={onCloseWaive} />}

      <Facts>
        <Fact label="Billed">
          <span className="text-base font-medium tabular-nums">{money(bill.total_amount)}</span>
        </Fact>
        <Fact label="Paid">
          <span className="text-base font-medium tabular-nums text-success">{money(bill.amount_paid)}</span>
        </Fact>
        <Fact label="Balance">
          <span className={cn('text-base font-medium tabular-nums', bill.amount_outstanding > 0 ? (overdue ? 'text-danger' : 'text-warning') : 'text-success')}>
            {bill.amount_outstanding > 0 ? money(bill.amount_outstanding) : 'Nil'}
          </span>
        </Fact>
        {bill.discount_total > 0 && <Fact label="Concession">−{money(bill.discount_total)}</Fact>}
        {bill.tax_total > 0 && <Fact label={bill.tax_label || 'Tax'}>{money(bill.tax_total)}</Fact>}
        {bill.late_fee_total > 0 && <Fact label="Late fees">{money(bill.late_fee_total)}</Fact>}
        {bill.due_date && <Fact label="Payable by">{formatDate(bill.due_date)}</Fact>}
      </Facts>

      {leftOff.length > 0 && (
        <p className="flex items-center gap-2 border-b border-border bg-warning/5 px-5 py-2 text-xs text-foreground">
          <AlertTriangle className="size-3.5 shrink-0 text-warning" />
          <span>
            <strong className="font-medium">Not billed yet:</strong> {leftOff.join(', ')}. Bill them from the fee counter
          </span>
        </p>
      )}

      <DetailSection title={`Instalments · ${bill.instalments.length}`}>
        {bill.instalments.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">No instalments on this bill</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className={DETAIL_TH}>
                  <th className="py-1.5 pl-5 pr-3 font-medium">Fee</th>
                  <th className="px-3 py-1.5 font-medium">Due</th>
                  <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                  <th className="px-3 py-1.5 text-right font-medium">Paid</th>
                  <th className="px-3 py-1.5 text-right font-medium">Balance</th>
                  <th className="py-1.5 pl-3 pr-5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {bill.instalments.map((line) => {
                  const left = Math.max(0, line.outstanding ?? line.amount - line.amount_paid)
                  return (
                    <tr key={line.label} className="border-b border-border">
                      <td className="py-1.5 pl-5 pr-3">
                        <span className="font-medium text-foreground">{line.label}</span>
                        {line.bill_number && <span className="ml-1.5 text-xs text-muted-foreground">{line.bill_number}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{line.due_date ? formatDate(line.due_date) : '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(line.amount)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{line.amount_paid > 0 ? money(line.amount_paid) : '—'}</td>
                      <td className="px-3 py-1.5 text-right font-medium tabular-nums">{left > 0 ? money(left) : 'Nil'}</td>
                      <td className="py-1.5 pl-3 pr-5">
                        {line.is_overdue && left > 0 ? (
                          <span className="text-xs font-medium text-danger">Overdue {line.days_overdue}d</span>
                        ) : (
                          <Badge tone={INSTALMENT_STATUS_TONE[line.status] ?? 'neutral'} size="sm">
                            {INSTALMENT_STATUS_LABEL[line.status] ?? line.status}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </DetailSection>

      <DetailSection title={`Payments · ${payments.length}`}>
        {payments.length === 0 ? (
          <p className="border-b border-border px-5 py-4 text-sm text-muted-foreground">Nothing paid yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className={DETAIL_TH}>
                  <th className="py-1.5 pl-5 pr-3 font-medium">Receipt</th>
                  <th className="px-3 py-1.5 font-medium">Date</th>
                  <th className="px-3 py-1.5 font-medium">Mode</th>
                  <th className="px-3 py-1.5 font-medium">Reference</th>
                  <th className="py-1.5 pl-3 pr-5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-1.5 pl-5 pr-3 font-medium">{p.receipt_number ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{p.paid_at ? formatDate(p.paid_at) : '—'}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {PAYMENT_METHOD_LABEL[p.method as keyof typeof PAYMENT_METHOD_LABEL] ?? p.method ?? 'Payment'}
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-1.5 text-muted-foreground">{p.reference ?? ''}</td>
                    <td className="py-1.5 pl-3 pr-5 text-right font-medium tabular-nums">{money(p.amount ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DetailSection>
    </div>
  )
}

import { AlertTriangle, Ban, Eraser, HandCoins, Receipt, Search, Send, TimerReset } from 'lucide-react'
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
import { nextDueInstalment } from '@/lib/school'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { QueryBoundary } from '@/components/feedback/query-boundary'

/**
 * The Invoices tab: every fee bill in one flat register.
 *
 * A bill is issued, given concessions, extended with the fees left off at issue
 * and paid against on the fee counter; this tab lists them all, says what is
 * still owed and still not billed, and opens the counter for the student.
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

/** The grey strip that heads the sheet, as on the fee counter. */
function SectionBar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border bg-muted/70 px-4 py-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}

type Filter = 'ALL' | 'OVERDUE' | 'NOT_BILLED' | InvoiceStatus

/**
 * Every fee bill as one flat register: what each student was billed, has paid
 * and still owes, and which fees are still waiting to be billed. Issuing,
 * concessions, the rest of the fees and taking money all happen on the fee
 * counter, which each row opens for that student.
 *
 * No `currency` prop: every bill carries its own, and the school's setting can
 * change between one being issued and being read.
 */
export function FinanceInvoicesTab({ academicYearId }: { academicYearId: number | null }) {
  const [filter, setFilter] = React.useState<Filter>('ALL')
  const [search, setSearch] = React.useState('')
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
  const money = (n: number) => formatMoney(n, rows[0]?.currency ?? 'INR')
  const sum = (pick: (i: FeeInvoiceOut) => number) => rows.reduce((s, i) => s + pick(i), 0)

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <SectionBar title={`Fee bills${invoices.data ? ` · ${rows.length}` : ''}`}>
        <Button size="sm" asChild>
          <Link to="/admin/fee-collection">
            <HandCoins />
            Issue or collect at the fee counter
          </Link>
        </Button>
      </SectionBar>

      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search bills"
            className="pl-9"
            placeholder="Student, admission number or bill number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Segmented
          layoutId="invoice-filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'OVERDUE', label: 'Overdue' },
            { value: 'PARTIALLY_PAID', label: 'Part paid' },
            { value: 'PAID', label: 'Paid' },
            { value: 'NOT_BILLED', label: 'Fees not billed' },
            { value: 'DRAFT', label: 'Not issued' },
          ]}
        />
      </div>

      <QueryBoundary
        query={invoices}
        loading={
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        }
      >
        {() =>
          rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
              <Receipt className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">{filter === 'ALL' && !term ? 'No bills yet' : 'Nothing matches'}</p>
              <p className="text-sm text-muted-foreground">
                {filter === 'ALL' && !term
                  ? 'Open the fee counter, find a student and issue their bill.'
                  : 'Try another search or filter.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Bill no</th>
                    <th className="px-3 py-2 font-medium">Student</th>
                    <th className="px-3 py-2 font-medium">Adm no</th>
                    <th className="px-3 py-2 text-right font-medium">Billed</th>
                    <th className="px-3 py-2 text-right font-medium">Paid</th>
                    <th className="px-3 py-2 text-right font-medium">Balance</th>
                    <th className="px-3 py-2 font-medium">Not billed yet</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => {
                    const draft = i.status === 'DRAFT'
                    const open = i.status !== 'PAID' && i.status !== 'CANCELLED'
                    const leftOff = i.left_off ?? []
                    const overdue = i.is_overdue && i.amount_outstanding > 0
                    return (
                      <tr key={i.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium">{i.invoice_number ?? 'Not issued'}</td>
                        <td className="px-3 py-2.5">{i.student_name ?? `Student ${i.student_id}`}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{i.admission_number ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(i.total_amount, i.currency)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-success">
                          {i.amount_paid > 0 ? formatMoney(i.amount_paid, i.currency) : '—'}
                        </td>
                        <td className={cn('px-3 py-2.5 text-right font-semibold tabular-nums', i.amount_outstanding > 0 && 'text-warning')}>
                          {i.amount_outstanding > 0 ? formatMoney(i.amount_outstanding, i.currency) : 'Nil'}
                        </td>
                        <td className="px-3 py-2.5">
                          {leftOff.length > 0 ? (
                            <span className="text-xs font-medium text-warning">{leftOff.join(', ')}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={overdue ? 'danger' : INVOICE_STATUS_TONE[i.status]} size="sm">
                            {draft ? 'Not issued' : overdue ? 'Overdue' : INVOICE_STATUS_LABEL[i.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-1.5">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant={draft || leftOff.length > 0 || open ? 'solid' : 'outline'} asChild>
                              <Link to={`/admin/fee-collection?student=${i.student_id}`}>
                                {draft ? <Send /> : <HandCoins />}
                                {draft ? 'Issue' : leftOff.length > 0 ? 'Bill the rest' : open ? 'Collect' : 'Open'}
                              </Link>
                            </Button>
                            {!draft && open && i.is_overdue && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Charge late fees"
                                title="Charge late fees"
                                onClick={() => lateFees.mutate({ invoiceId: i.id })}
                              >
                                <TimerReset />
                              </Button>
                            )}
                            {!draft && open && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Write off a fee"
                                title="Write off a fee"
                                onClick={() => setWaiving(i)}
                              >
                                <Eraser />
                              </Button>
                            )}
                            {open && i.amount_paid <= 0 && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Cancel the bill"
                                title="Cancel the bill"
                                onClick={() => setCancelling(i)}
                              >
                                <Ban />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                    <td colSpan={3} className="px-4 py-2.5 text-right text-xs uppercase tracking-wide text-muted-foreground">
                      Total
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(sum((i) => i.total_amount))}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(sum((i) => i.amount_paid))}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(sum((i) => i.amount_outstanding))}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        }
      </QueryBoundary>

      <WaiveDialog invoice={waiving} onClose={() => setWaiving(null)} />

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
    </div>
  )
}

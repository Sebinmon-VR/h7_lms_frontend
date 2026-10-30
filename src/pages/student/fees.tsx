import { CreditCard, Download, FileText, Printer, Receipt } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { FeeInvoiceOut, InstalmentOut, PaymentMethod } from '@/api/types'
import { useMyInvoices, useMyPaymentReceipt } from '@/queries/finance.queries'
import { formatDate } from '@/lib/datetime'
import { INSTALMENT_STATUS_LABEL, INSTALMENT_STATUS_TONE, PAYMENT_METHOD_LABEL } from '@/lib/school'
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, formatMoney } from '@/lib/tuition'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'
import { FeeReceipt, FeeReceiptForPrint, printFeeReceipt } from '@/components/domain/fee-receipt'

/**
 * A student's fees, as a plain full-width statement: the bill's figures in one
 * strip, every fee as a row of a table, and every payment with its receipt.
 *
 * Only bills the school has issued appear; before that there is nothing to
 * show. The currency is chosen on the Pay page, where its tax is shown — the
 * figures here are the bill's own.
 */

function owing(i: InstalmentOut): number {
  return Math.max(0, i.outstanding ?? i.amount - i.amount_paid)
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-2 border-b border-border pb-2">
      <h2 className="text-base font-semibold">{children}</h2>
      {right}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'warning' | 'success' }) {
  return (
    <div className="border-b border-r border-border px-5 py-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div
        className={cn(
          'mt-1 text-lg font-semibold tabular-nums',
          tone === 'warning' && 'text-warning',
          tone === 'success' && 'text-success',
        )}
      >
        {value}
      </div>
    </div>
  )
}

/** One receipt, full size, with Print and Save as PDF (the browser's print-to-PDF). */
export function StudentReceiptViewer({
  view,
  onClose,
}: {
  view: { invoiceId: string; index: number } | null
  onClose: () => void
}) {
  const receipt = useMyPaymentReceipt(view?.invoiceId ?? null, view?.index ?? null)
  return (
    <Dialog open={!!view} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>
            {receipt.data?.receipt_number ? `Receipt ${receipt.data.receipt_number}` : 'Receipt'}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="max-h-[70vh] overflow-y-auto bg-neutral-100 p-4">
          <QueryBoundary query={receipt} loading={<Skeleton className="h-[600px] w-full" />}>
            {(data) => (
              <>
                <FeeReceipt receipt={data} copies="single" />
                <FeeReceiptForPrint receipt={data} copies="single" />
              </>
            )}
          </QueryBoundary>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="outline" onClick={printFeeReceipt} disabled={!receipt.data}>
            <Download />
            Save as PDF
          </Button>
          <Button onClick={printFeeReceipt} disabled={!receipt.data}>
            <Printer />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BillStatement({ bill, onReceipt }: { bill: FeeInvoiceOut; onReceipt: (index: number) => void }) {
  const lines = bill.instalments.filter((i) => i.status !== 'WAIVED')
  const payments = (bill.payments ?? []).map((p, index) => ({ ...p, index })).reverse()
  const money = (n: number) => formatMoney(n, bill.currency)
  const concessions = lines.reduce((s, i) => s + (i.concession_amount ?? 0), 0)

  return (
    <>
      {/* ------------------------------------------------ the bill at a glance */}
      <div className="grid grid-cols-2 border-l border-t border-border md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Bill number" value={bill.invoice_number ?? '—'} />
        <Stat label="Session" value={bill.academic_year_name ?? '—'} />
        <Stat label="Total fee" value={money(bill.total_amount)} />
        <Stat label="Paid" value={money(bill.amount_paid)} tone="success" />
        <Stat
          label="Balance due"
          value={bill.amount_outstanding > 0 ? money(bill.amount_outstanding) : 'Nil'}
          tone={bill.amount_outstanding > 0 ? 'warning' : 'success'}
        />
        <Stat
          label="Status"
          value={
            <Badge tone={bill.is_overdue && bill.amount_outstanding > 0 ? 'danger' : INVOICE_STATUS_TONE[bill.status]}>
              {bill.is_overdue && bill.amount_outstanding > 0 ? 'Overdue' : INVOICE_STATUS_LABEL[bill.status]}
            </Badge>
          }
        />
      </div>

      {/* ------------------------------------------------ fee lines */}
      <SectionTitle>Fee details</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-12 px-4 py-2.5 font-medium">#</th>
              <th className="px-4 py-2.5 font-medium">Fee</th>
              <th className="px-4 py-2.5 font-medium">Due date</th>
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
              <th className="px-4 py-2.5 text-right font-medium">Concession</th>
              <th className="px-4 py-2.5 text-right font-medium">Paid</th>
              <th className="px-4 py-2.5 text-right font-medium">Balance</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((i, n) => {
              const concession = i.concession_amount ?? 0
              const left = owing(i)
              return (
                <tr key={i.label} className="border-b border-border">
                  <td className="px-4 py-3 text-muted-foreground">{n + 1}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{i.label}</span>
                    {i.components && i.components.length > 0 && !i.is_extra && (
                      <span className="block text-xs text-muted-foreground">
                        {i.components.map((c) => c.name).join(' + ')}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{i.due_date ? formatDate(i.due_date) : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(i.amount + concession)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{concession > 0 ? `−${money(concession)}` : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{i.amount_paid > 0 ? money(i.amount_paid) : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{left > 0 ? money(left) : 'Nil'}</td>
                  <td className="px-4 py-3">
                    {i.is_overdue && left > 0 ? (
                      <Badge tone="danger" size="sm">
                        Overdue
                      </Badge>
                    ) : (
                      <Badge tone={INSTALMENT_STATUS_TONE[i.status] ?? 'neutral'} size="sm">
                        {INSTALMENT_STATUS_LABEL[i.status] ?? i.status}
                      </Badge>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30 font-semibold">
              <td colSpan={3} className="px-4 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">
                Total
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{money(bill.total_amount + concessions)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{concessions > 0 ? `−${money(concessions)}` : '—'}</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(bill.amount_paid)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(bill.amount_outstanding)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Tax is added when you pay: choose INR or AED on the Pay page to see it.
      </p>

      {/* ------------------------------------------------ payments */}
      <SectionTitle>Payments and receipts</SectionTitle>
      {payments.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No payments yet. The receipt for each payment appears here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Receipt no.</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Paid by</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount paid</th>
                <th className="w-44 px-4 py-2.5 text-right font-medium">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const paidIn = typeof p.paid_currency === 'string' ? p.paid_currency : null
                const paidAmount = typeof p.paid_amount === 'number' ? p.paid_amount : null
                return (
                  <tr key={p.index} className="border-b border-border">
                    <td className="px-4 py-3 font-medium">{p.receipt_number ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(p.paid_at)}</td>
                    <td className="px-4 py-3">{PAYMENT_METHOD_LABEL[p.method as PaymentMethod] ?? p.method ?? 'Payment'}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {paidIn && paidAmount != null ? formatMoney(paidAmount, paidIn) : money(p.amount ?? 0)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {p.receipt_number ? (
                        <Button variant="outline" size="sm" onClick={() => onReceipt(p.index)}>
                          <FileText />
                          View receipt
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default function StudentFeesPage() {
  const invoices = useMyInvoices()
  const bills = (invoices.data ?? []).filter((i) => i.status !== 'DRAFT' && i.status !== 'CANCELLED')
  const [billId, setBillId] = React.useState<string | null>(null)
  const bill = bills.find((b) => b.id === billId) ?? bills[0] ?? null
  const [receiptView, setReceiptView] = React.useState<{ invoiceId: string; index: number } | null>(null)

  return (
    <div className="w-full">
      <PageHeader
        title="My fees"
        description="Your fee bill, what each fee comes to, and the receipt for every payment."
        actions={
          bill && bill.amount_outstanding > 0 ? (
            <Button asChild>
              <Link to={`/student/fees/pay/${bill.id}`}>
                <CreditCard />
                Pay fees
              </Link>
            </Button>
          ) : undefined
        }
      />

      <QueryBoundary query={invoices} loading={<Skeleton className="h-96 w-full" />}>
        {() =>
          !bill ? (
            <div className="flex flex-col items-center gap-2 border-y border-border py-16 text-center">
              <Receipt className="size-7 text-muted-foreground" />
              <p className="text-sm font-medium">No fee bill yet</p>
              <p className="text-sm text-muted-foreground">
                When the school issues your fee bill it appears here, with a Pay button.
              </p>
            </div>
          ) : (
            <>
              {bills.length > 1 && (
                <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Session</span>
                  {bills.map((b) => (
                    <Button
                      key={b.id}
                      size="sm"
                      variant={b.id === bill.id ? 'solid' : 'outline'}
                      onClick={() => setBillId(b.id)}
                    >
                      {b.academic_year_name ?? b.invoice_number}
                    </Button>
                  ))}
                </div>
              )}
              <BillStatement bill={bill} onReceipt={(index) => setReceiptView({ invoiceId: bill.id, index })} />
            </>
          )
        }
      </QueryBoundary>

      <StudentReceiptViewer view={receiptView} onClose={() => setReceiptView(null)} />
    </div>
  )
}

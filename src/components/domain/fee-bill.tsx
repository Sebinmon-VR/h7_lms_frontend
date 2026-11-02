import * as React from 'react'
import { createPortal } from 'react-dom'

import type { FeeBill, FeeInvoiceOut } from '@/api/types'
import { formatDate } from '@/lib/datetime'
import { resolveFileUrl } from '@/lib/files'
import { amountInWords } from '@/lib/money-words'
import { formatMoney } from '@/lib/tuition'
import { H7Mark, type SchoolLetterhead } from '@/components/domain/fee-receipt'

/**
 * One bill on a student's yearly account, printed: the school's letterhead
 * with "Fee bill", its number and dates, who it is for, the fee lines it
 * carries with any concession, what has been paid against it and what is
 * still due, and where the year's account stands.
 *
 * Paper, so drawn in paper colours in both themes. Printing goes through
 * `printFeeReceipt()`, which prints whatever `.fee-receipt-print` holds.
 */

export interface BillPayer {
  className?: string | null
  guardianName?: string | null
  guardianPhone?: string | null
}

const KIND_LABEL: Record<string, string> = {
  ISSUE: 'Fees for the year',
  LATER: 'Fees billed later',
  EXTRA: 'Other items',
}

function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-0.5">
      <dt className="w-28 shrink-0 text-neutral-500">{label}</dt>
      <dd className="min-w-0 font-medium">{children || '—'}</dd>
    </div>
  )
}

export function FeeBillSheet({
  invoice,
  bill,
  school,
  payer,
}: {
  invoice: FeeInvoiceOut
  bill: FeeBill
  school: SchoolLetterhead
  payer?: BillPayer
}) {
  const money = (n: number) => formatMoney(n, invoice.currency)
  const lines = invoice.instalments.filter(
    (i) => (i.bill_number ?? invoice.invoice_number) === bill.number && i.status !== 'WAIVED',
  )
  const logo = school.logoUrl?.startsWith('data:') ? school.logoUrl : resolveFileUrl(school.logoUrl)

  return (
    <section
      className="break-inside-avoid bg-white p-10 text-[13px] leading-normal text-neutral-900"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* ------------------------------------------------ letterhead */}
      <header className="flex items-start justify-between gap-6 border-b-2 border-neutral-900 pb-4">
        <div className="flex min-w-0 items-start gap-3">
          {logo ? <img src={logo} alt="" className="h-16 w-auto shrink-0 object-contain" /> : <H7Mark size={60} />}
          <div className="min-w-0">
            <p className="text-xl font-bold leading-tight">{school.name || 'School'}</p>
            {school.address && <p className="whitespace-pre-line text-neutral-600">{school.address}</p>}
            <p className="text-neutral-600">{[school.phone, school.email].filter(Boolean).join(' · ')}</p>
            {school.website && <p className="text-neutral-600">{school.website.replace(/^https?:\/\//, '')}</p>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold uppercase tracking-wide">Fee bill</p>
          <p className="mt-1 text-neutral-600">
            Bill no. <span className="font-semibold text-neutral-900">{bill.number}</span>
          </p>
          <p className="text-neutral-600">
            Date <span className="font-semibold text-neutral-900">{formatDate(bill.issued_at)}</span>
          </p>
          {bill.due_date && bill.balance > 0 && (
            <p className="text-neutral-600">
              Pay by <span className="font-semibold text-neutral-900">{formatDate(bill.due_date)}</span>
            </p>
          )}
        </div>
      </header>

      {/* ------------------------------------------------ who */}
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Billed to</p>
          <dl>
            <Field label="Student">{invoice.student_name}</Field>
            <Field label="Admission no.">{invoice.admission_number}</Field>
            <Field label="Class">{payer?.className}</Field>
            {payer?.guardianName && (
              <Field label="Parent">
                {payer.guardianName}
                {payer.guardianPhone ? ` · ${payer.guardianPhone}` : ''}
              </Field>
            )}
          </dl>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Bill details</p>
          <dl>
            <Field label="For">{KIND_LABEL[bill.kind] ?? 'Fees'}</Field>
            <Field label="Session">{invoice.academic_year_name}</Field>
            <Field label="Account">{invoice.invoice_number}</Field>
          </dl>
        </div>
      </div>

      {/* ------------------------------------------------ lines */}
      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="bg-neutral-900 text-left text-white">
            <th className="w-10 px-3 py-1.5 font-semibold">#</th>
            <th className="px-3 py-1.5 font-semibold">Particulars</th>
            <th className="px-3 py-1.5 font-semibold">Due date</th>
            <th className="px-3 py-1.5 text-right font-semibold">Fee</th>
            <th className="px-3 py-1.5 text-right font-semibold">Concession</th>
            <th className="px-3 py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const concession = line.concession_amount ?? 0
            return (
              <tr key={line.label} className="border-b border-neutral-200 even:bg-neutral-50">
                <td className="px-3 py-1.5 text-neutral-500">{i + 1}</td>
                <td className="px-3 py-1.5">
                  {line.label}
                  {line.components && line.components.length > 0 && !line.is_extra && (
                    <span className="text-neutral-500"> · {line.components.map((c) => c.name).join(' + ')}</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5">{line.due_date ? formatDate(line.due_date) : '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(line.amount + concession)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{concession > 0 ? `−${money(concession)}` : '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(line.amount)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* ------------------------------------------------ totals */}
      <div className="mt-3 flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            {bill.balance > 0 ? 'Amount due in words' : 'Status'}
          </p>
          <p className="font-semibold">
            {bill.balance > 0 ? amountInWords(bill.balance, invoice.currency) : 'Paid in full. Thank you.'}
          </p>
        </div>
        <dl className="w-64 shrink-0">
          <div className="flex justify-between gap-3 py-0.5">
            <dt className="text-neutral-600">Bill total</dt>
            <dd className="tabular-nums">{money(bill.amount)}</dd>
          </div>
          <div className="flex justify-between gap-3 py-0.5">
            <dt className="text-neutral-600">Paid</dt>
            <dd className="tabular-nums">{money(bill.amount_paid)}</dd>
          </div>
          <div className="mt-1 flex justify-between gap-3 bg-neutral-900 px-2 py-1.5 font-bold text-white">
            <dt>Balance due</dt>
            <dd className="tabular-nums">{bill.balance > 0 ? money(bill.balance) : 'Nil'}</dd>
          </div>
        </dl>
      </div>

      {/* ------------------------------------------------ the year's account */}
      <table className="mt-4 w-full border border-neutral-300 text-center">
        <tbody>
          <tr className="text-[10px] uppercase tracking-wider text-neutral-500">
            <td className="border-r border-neutral-300 px-3 pt-1.5">Total fee for the year</td>
            <td className="border-r border-neutral-300 px-3 pt-1.5">Paid to date</td>
            <td className="px-3 pt-1.5">Balance on all bills</td>
          </tr>
          <tr className="font-semibold tabular-nums">
            <td className="border-r border-neutral-300 px-3 pb-1.5">{money(invoice.total_amount)}</td>
            <td className="border-r border-neutral-300 px-3 pb-1.5">{money(invoice.amount_paid)}</td>
            <td className="px-3 pb-1.5">
              {invoice.amount_outstanding > 0 ? money(invoice.amount_outstanding) : 'Nil'}
            </td>
          </tr>
        </tbody>
      </table>

      <footer className="mt-6 flex items-end justify-between gap-6">
        <p className="max-w-[55%] text-[10px] leading-relaxed text-neutral-500">
          This is a computer-generated bill. Please quote the bill number when you pay. Fees can be paid at the
          school office or online from the Fees page.
        </p>
        <p className="w-44 border-t border-neutral-700 pt-1 text-center text-neutral-600">Authorised signatory</p>
      </footer>
    </section>
  )
}

/**
 * The copy that prints, portalled under <body> and invisible until
 * `printFeeReceipt()` runs. Mount it only while the bill is on screen.
 */
export function FeeBillForPrint(props: React.ComponentProps<typeof FeeBillSheet>) {
  return createPortal(
    <div className="fee-receipt-portal">
      <div className="fee-receipt-print">
        <FeeBillSheet {...props} />
      </div>
    </div>,
    document.body,
  )
}

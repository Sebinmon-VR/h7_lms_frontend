import * as React from 'react'
import { createPortal } from 'react-dom'

import type { FeePaymentReceipt, PaymentMethod } from '@/api/types'
import { formatDate } from '@/lib/datetime'
import { resolveFileUrl } from '@/lib/files'
import { amountInWords } from '@/lib/money-words'
import { PAYMENT_METHOD_LABEL } from '@/lib/school'
import { formatMoney } from '@/lib/tuition'

/**
 * A fee receipt laid out the way a proper payment receipt reads: the school's
 * letterhead with "Payment receipt" and a PAID stamp, who paid and how side by
 * side, a shaded table of what was paid for, the totals (fees, tax, any other
 * currency) with the amount in words, and where the account stands after it.
 *
 * The office prints two copies on one A4 sheet (office and parent); a student
 * or parent prints one. It is paper, so it is drawn in paper colours in both
 * themes. Printing goes through `printFeeReceipt()`, which hides everything but
 * `.fee-receipt-print`.
 */

export interface SchoolLetterhead {
  name?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  logoUrl?: string | null
}

export type ReceiptCopies = 'office' | 'single'

function letterheadOf(receipt: FeePaymentReceipt, school?: SchoolLetterhead): SchoolLetterhead {
  const own = receipt.school
  return {
    name: school?.name || own?.name,
    address: school?.address || own?.address,
    phone: school?.phone || own?.phone,
    email: school?.email || own?.email,
    website: school?.website || own?.website,
    // The embedded copy first: a logo fetched from another site may not be loaded when printing.
    logoUrl: own?.logo_data || school?.logoUrl || own?.logo_url,
  }
}

/**
 * The H7 mark, drawn inline so it is always on the page when the receipt
 * prints - a logo fetched from another site may not have loaded by then.
 */
function H7Mark({ size }: { size: number }) {
  const id = React.useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="H7" role="img" className="shrink-0">
      <defs>
        <linearGradient id={`h7g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#h7g${id})`} />
      <text
        x="32"
        y="42"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="28"
        fontWeight="800"
        fill="#fff"
      >
        H7
      </text>
    </svg>
  )
}

/**
 * The PAID seal, drawn like a rubber stamp: a double ring with the school's
 * name over the top and "Payment received" under the bottom, stars between
 * them, and inside the H7 logo, PAID, the date and the transaction reference
 * (the receipt number when there is none, as for cash).
 */
function PaidSeal({
  school,
  date,
  reference,
  size,
  logo,
}: {
  school: string
  date: string
  reference: string
  size: number
  logo?: string | null
}) {
  const id = React.useId().replace(/:/g, '')
  const ink = '#047857'
  const name = (school || 'H7 EdTech').toUpperCase()
  const ref = reference.length > 22 ? `${reference.slice(0, 21)}…` : reference
  // Squeeze a long reference to the width of the seal's centre rather than let it spill.
  const refWidth = Math.min(ref.length * 5, 60)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      aria-label={`Paid. ${name}. Reference ${reference}`}
      role="img"
      className="shrink-0 -rotate-6"
    >
      <defs>
        {/* Over the top, left to right; under the bottom, left to right so it reads upright. */}
        <path id={`top${id}`} d="M 22 80 A 58 58 0 0 1 138 80" />
        <path id={`bot${id}`} d="M 15 80 A 65 65 0 0 0 145 80" />
      </defs>
      <circle cx="80" cy="80" r="77" fill="#fff" stroke={ink} strokeWidth="3.5" />
      <circle cx="80" cy="80" r="71" fill="none" stroke={ink} strokeWidth="1" />
      <circle cx="80" cy="80" r="47" fill="none" stroke={ink} strokeWidth="1.6" />
      <circle cx="80" cy="80" r="43.5" fill="none" stroke={ink} strokeWidth="0.8" strokeDasharray="1.5 2.5" />

      <text fill={ink} fontFamily="Inter, system-ui, sans-serif" fontSize="15" fontWeight="800" letterSpacing="2.5">
        <textPath href={`#top${id}`} startOffset="50%" textAnchor="middle">
          {name}
        </textPath>
      </text>
      <text fill={ink} fontFamily="Inter, system-ui, sans-serif" fontSize="10" fontWeight="700" letterSpacing="2">
        <textPath href={`#bot${id}`} startOffset="50%" textAnchor="middle">
          PAYMENT RECEIVED
        </textPath>
      </text>
      <text x="14" y="84.5" fill={ink} fontSize="12" textAnchor="middle">★</text>
      <text x="146" y="84.5" fill={ink} fontSize="12" textAnchor="middle">★</text>

      {/* The school's logo in the centre; the H7 mark in the stamp's ink when none is set. */}
      {logo ? (
        <image href={logo} x="62" y="34" width="36" height="36" preserveAspectRatio="xMidYMid meet" />
      ) : (
        <>
          <rect x="66" y="39" width="28" height="28" rx="7" fill={ink} />
          <text x="80" y="58.5" textAnchor="middle" fill="#fff" fontFamily="Inter, system-ui, sans-serif" fontSize="13" fontWeight="800">
            H7
          </text>
        </>
      )}
      <text
        x="80"
        y="88"
        textAnchor="middle"
        fill={ink}
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="19"
        fontWeight="900"
        letterSpacing="4"
      >
        PAID
      </text>
      <line x1="54" y1="93" x2="106" y2="93" stroke={ink} strokeWidth="0.8" />
      <text x="80" y="103" textAnchor="middle" fill={ink} fontFamily="Inter, system-ui, sans-serif" fontSize="8.5" fontWeight="600">
        {date}
      </text>
      {ref && (
        <text
          x="80"
          y="113"
          textAnchor="middle"
          fill={ink}
          fontFamily="ui-monospace, Menlo, monospace"
          fontSize="7.5"
          fontWeight="700"
          textLength={refWidth}
          lengthAdjust="spacingAndGlyphs"
        >
          {ref}
        </text>
      )}
    </svg>
  )
}

function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-0.5">
      <dt className="w-28 shrink-0 text-neutral-500">{label}</dt>
      <dd className="min-w-0 font-medium">{children || '—'}</dd>
    </div>
  )
}

function Copy({
  receipt,
  school,
  copy,
  compact,
}: {
  receipt: FeePaymentReceipt
  school: SchoolLetterhead
  copy?: string
  compact: boolean
}) {
  const money = (n: number) => formatMoney(n, receipt.currency)
  // Tax or another currency on top of the fees: the receipt shows what was handed over.
  const charged = receipt.paid_amount != null && !!receipt.paid_currency
  const paidCurrency = charged ? (receipt.paid_currency as string) : receipt.currency
  const foreignPaid = charged && paidCurrency !== receipt.currency
  const received = charged ? (receipt.paid_amount as number) : receipt.amount
  const method = receipt.method
    ? PAYMENT_METHOD_LABEL[receipt.method as PaymentMethod] ?? receipt.method
    : '—'
  const paidToDate = Math.max(0, receipt.invoice_total - receipt.balance_after)
  const logo = school.logoUrl?.startsWith('data:') ? school.logoUrl : resolveFileUrl(school.logoUrl)

  return (
    <section
      className={
        'break-inside-avoid bg-white text-neutral-900 ' +
        (compact ? 'p-6 text-[11.5px] leading-snug' : 'p-10 text-[13px] leading-normal')
      }
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* ------------------------------------------------ letterhead */}
      <header className="flex items-start justify-between gap-6 border-b-2 border-neutral-900 pb-4">
        <div className="flex min-w-0 items-start gap-3">
          {logo ? (
            <img src={logo} alt="" className={compact ? 'h-12 w-auto shrink-0 object-contain' : 'h-16 w-auto shrink-0 object-contain'} />
          ) : (
            <H7Mark size={compact ? 46 : 60} />
          )}
          <div className="min-w-0">
            <p className={(compact ? 'text-base' : 'text-xl') + ' font-bold leading-tight'}>{school.name || 'School'}</p>
            {school.address && <p className="whitespace-pre-line text-neutral-600">{school.address}</p>}
            <p className="text-neutral-600">{[school.phone, school.email].filter(Boolean).join(' · ')}</p>
            {school.website && <p className="text-neutral-600">{school.website.replace(/^https?:\/\//, '')}</p>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className={(compact ? 'text-lg' : 'text-2xl') + ' font-bold uppercase tracking-wide'}>Payment receipt</p>
          <p className="mt-1 text-neutral-600">
            Receipt no. <span className="font-semibold text-neutral-900">{receipt.receipt_number ?? '—'}</span>
          </p>
          <p className="text-neutral-600">
            Date <span className="font-semibold text-neutral-900">{formatDate(receipt.paid_at)}</span>
          </p>
          {copy && (
            <p className="mt-1 inline-block border border-neutral-400 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              {copy}
            </p>
          )}
        </div>
      </header>

      {/* ------------------------------------------------ who and how */}
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Received from</p>
          <dl>
            <Field label="Student">{receipt.student_name}</Field>
            <Field label="Admission no.">{receipt.admission_number}</Field>
            <Field label="Class">{receipt.class_name}</Field>
            {receipt.guardian_name && (
              <Field label="Parent">
                {receipt.guardian_name}
                {receipt.guardian_phone ? ` · ${receipt.guardian_phone}` : ''}
              </Field>
            )}
          </dl>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Payment details</p>
          <dl>
            <Field label="Bill no.">{receipt.invoice_number}</Field>
            <Field label="Session">{receipt.academic_year_name}</Field>
            <Field label="Paid by">{method}</Field>
            {receipt.reference && <Field label="Reference">{receipt.reference}</Field>}
          </dl>
        </div>
      </div>

      {/* ------------------------------------------------ what was paid */}
      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="bg-neutral-900 text-left text-white">
            <th className="w-10 px-3 py-1.5 font-semibold">#</th>
            <th className="px-3 py-1.5 font-semibold">Description</th>
            <th className="px-3 py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {receipt.lines.map((line, i) => (
            <tr key={`${line.instalment}-${line.head}`} className="border-b border-neutral-200 even:bg-neutral-50">
              <td className="px-3 py-1.5 text-neutral-500">{i + 1}</td>
              <td className="px-3 py-1.5">
                {line.head}
                {line.instalment && line.instalment !== line.head && (
                  <span className="text-neutral-500"> · {line.instalment}</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{money(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ------------------------------------------------ totals */}
      <div className="mt-3 flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Amount in words</p>
          <p className="font-semibold">{amountInWords(received, paidCurrency)}</p>
        </div>
        <dl className="w-64 shrink-0">
          <div className="flex justify-between gap-3 py-0.5">
            <dt className="text-neutral-600">Fees</dt>
            <dd className="tabular-nums">{money(receipt.amount)}</dd>
          </div>
          {foreignPaid && (
            <div className="flex justify-between gap-3 py-0.5">
              <dt className="text-neutral-600">
                In {paidCurrency}
                <span className="block text-[10px]">
                  1 {paidCurrency} = {formatMoney(1 / (receipt.exchange_rate || 1), receipt.currency)}
                </span>
              </dt>
              <dd className="tabular-nums">{formatMoney(receipt.paid_fee_amount ?? 0, paidCurrency)}</dd>
            </div>
          )}
          {charged && (
            <div className="flex justify-between gap-3 py-0.5">
              <dt className="text-neutral-600">
                {receipt.paid_tax_label ?? 'Tax'} {receipt.paid_tax_percent ?? 0}%
              </dt>
              <dd className="tabular-nums">{formatMoney(receipt.paid_tax_amount ?? 0, paidCurrency)}</dd>
            </div>
          )}
          {(receipt.paid_gateway_fee ?? 0) > 0 && (
            <div className="flex justify-between gap-3 py-0.5">
              <dt className="text-neutral-600">{receipt.paid_gateway_fee_label ?? 'Online payment fee'}</dt>
              <dd className="tabular-nums">{formatMoney(receipt.paid_gateway_fee ?? 0, paidCurrency)}</dd>
            </div>
          )}
          <div className="mt-1 flex justify-between gap-3 bg-neutral-900 px-2 py-1.5 font-bold text-white">
            <dt>Total received</dt>
            <dd className="tabular-nums">{formatMoney(received, paidCurrency)}</dd>
          </div>
        </dl>
      </div>

      {receipt.note && (
        <p className="mt-3">
          <span className="text-neutral-500">Remarks: </span>
          {receipt.note}
        </p>
      )}

      {/* ------------------------------------------------ account */}
      <table className="mt-4 w-full border border-neutral-300 text-center">
        <tbody>
          <tr className="text-[10px] uppercase tracking-wider text-neutral-500">
            <td className="border-r border-neutral-300 px-3 pt-1.5">Total fee for the year</td>
            <td className="border-r border-neutral-300 px-3 pt-1.5">Paid to date</td>
            <td className="px-3 pt-1.5">Balance due</td>
          </tr>
          <tr className="font-semibold tabular-nums">
            <td className="border-r border-neutral-300 px-3 pb-1.5">{money(receipt.invoice_total)}</td>
            <td className="border-r border-neutral-300 px-3 pb-1.5">{money(paidToDate)}</td>
            <td className="px-3 pb-1.5">{receipt.balance_after > 0 ? money(receipt.balance_after) : 'Nil'}</td>
          </tr>
        </tbody>
      </table>

      <footer className={(compact ? 'mt-3' : 'mt-6') + ' flex items-end justify-between gap-6'}>
        <p className="max-w-[55%] text-[10px] leading-relaxed text-neutral-500">
          This is a computer-generated receipt.
          {receipt.method === 'ONLINE'
            ? ' Paid online.'
            : receipt.recorded_by_name
              ? ` Received by ${receipt.recorded_by_name}.`
              : ''}{' '}
          Please keep it for your
          records.
        </p>
        <div className="flex shrink-0 items-end gap-5">
          <PaidSeal
            size={compact ? 118 : 150}
            school={school.name || 'School'}
            date={formatDate(receipt.paid_at)}
            reference={receipt.reference || receipt.receipt_number || ''}
            logo={logo}
          />
          <p className="w-44 border-t border-neutral-700 pt-1 text-center text-neutral-600">Authorised signatory</p>
        </div>
      </footer>
    </section>
  )
}

/**
 * The on-screen receipt. `office` shows the office and parent copies, as the
 * counter prints them; `single` shows one full-page receipt for a family.
 */
export function FeeReceipt({
  receipt,
  school,
  copies = 'office',
}: {
  receipt: FeePaymentReceipt
  school?: SchoolLetterhead
  copies?: ReceiptCopies
}) {
  const head = letterheadOf(receipt, school)
  if (copies === 'single') {
    return (
      <div className="border border-neutral-300 shadow-sm">
        <Copy receipt={receipt} school={head} compact={false} />
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="border border-neutral-300">
        <Copy receipt={receipt} school={head} copy="Office copy" compact />
      </div>
      <p className="text-center text-[10px] tracking-widest text-muted-foreground print:text-neutral-500">
        ✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
      </p>
      <div className="border border-neutral-300">
        <Copy receipt={receipt} school={head} copy="Parent copy" compact />
      </div>
    </div>
  )
}

/**
 * The copy that actually prints, portalled under <body> and invisible until
 * `printFeeReceipt()` runs. Mount it next to wherever the preview is shown.
 */
export function FeeReceiptForPrint({
  receipt,
  school,
  copies = 'office',
}: {
  receipt: FeePaymentReceipt
  school?: SchoolLetterhead
  copies?: ReceiptCopies
}) {
  return createPortal(
    <div className="fee-receipt-portal">
      <div className="fee-receipt-print">
        <FeeReceipt receipt={receipt} school={school} copies={copies} />
      </div>
    </div>,
    document.body,
  )
}

/** Fires the browser's print dialog with everything but the receipt hidden. "Save as PDF" works from there. */
export function printFeeReceipt() {
  document.body.classList.add('printing-fee-receipt')
  const cleanup = () => {
    document.body.classList.remove('printing-fee-receipt')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
  // Browsers that never fire `afterprint` (some mobile WebViews) still need the flag cleared.
  window.setTimeout(cleanup, 2000)
}

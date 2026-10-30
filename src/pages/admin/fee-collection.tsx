import {
  AlertTriangle,
  Banknote,
  CreditCard,
  FileCheck2,
  HandCoins,
  Landmark,
  Plus,
  Printer,
  ScrollText,
  Search,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

import type { FeeInvoiceOut, InstalmentOut, PaymentMethod } from '@/api/types'
import {
  useAddExtraItems,
  useCollectFee,
  useCounterRazorpay,
  useFeeBreakdown,
  useFeeCollectionsReport,
  useFeeInvoices,
  useIssueLeftOff,
  useIssueStudentBill,
  usePaymentQuote,
  usePaymentReceipt,
  useRemoveExtraItem,
} from '@/queries/finance.queries'
import { useEnrollments, useUsers } from '@/queries/admin.queries'
import { useAcademicYears, useAdmissionCategories, useCurrentYear } from '@/queries/admissions.queries'
import { useProgramSettings } from '@/queries/tuition.queries'
import { formatDate, todayApiDate } from '@/lib/datetime'
import { INSTALMENT_STATUS_LABEL, INSTALMENT_STATUS_TONE, PAYMENT_METHOD_LABEL } from '@/lib/school'
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, formatMoney } from '@/lib/tuition'
import { RazorpayDismissed, openRazorpay } from '@/lib/razorpay'
import { cn } from '@/lib/cn'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Segmented } from '@/components/ui/segmented'
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
} from '@/components/ui/dialog'
import { Field, FormError } from '@/components/forms/field'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'
import {
  FeeReceipt,
  FeeReceiptForPrint,
  printFeeReceipt,
  type SchoolLetterhead,
} from '@/components/domain/fee-receipt'

/**
 * The fee counter, laid out as one flat sheet the way school offices know it
 * from their old ERP: find the student, read their details in a grid, see every
 * fee as a row, tick what is being paid and how much, take the money, hand over
 * a numbered receipt.
 *
 * Money is only taken against an issued bill. Before the office issues it the
 * sheet is the issue screen: tick the fees being billed, type a concession
 * against any of them and add extra items (books, uniform), then "Issue bill"
 * freezes it and puts it
 * on the student's and parent's Fees page, where they can also pay online.
 *
 * Any fee can be ticked, in any order, with its own amount — the payment is
 * recorded against exactly those fees, so the receipt says what was paid for.
 *
 * The bill is in rupees; the money can be taken in INR or AED. In AED the
 * amount is the school's rate (Fees → Currencies) plus AED's VAT on top, and the bill is credited the
 * rupee fees alone.
 */

const PAY_CURRENCIES = [
  { value: 'INR', label: 'INR ₹' },
  { value: 'AED', label: 'AED' },
] as const
type PayCurrency = (typeof PAY_CURRENCIES)[number]['value']

type CounterMode = PaymentMethod | 'RAZORPAY'

const COUNTER_METHODS: { value: CounterMode; label: string; icon: React.ReactNode }[] = [
  { value: 'CASH', label: 'Cash', icon: <Banknote className="size-4" /> },
  { value: 'UPI', label: 'UPI', icon: <Smartphone className="size-4" /> },
  { value: 'CARD', label: 'Card', icon: <CreditCard className="size-4" /> },
  { value: 'CHEQUE', label: 'Cheque', icon: <ScrollText className="size-4" /> },
  { value: 'BANK_TRANSFER', label: 'Bank transfer', icon: <Landmark className="size-4" /> },
  { value: 'RAZORPAY', label: 'Razorpay', icon: <Wallet className="size-4" /> },
]

const SEARCH_ID = 'fee-counter-student'

/** A row of the fee table: a line on the bill, or an extra item not issued yet. */
interface Row {
  key: string
  label: string
  detail: string | null
  dueDate: string | null | undefined
  fee: number
  concession: number
  paid: number
  balance: number
  status: string
  isOverdue: boolean
  daysOverdue: number
  isExtra: boolean
  /** Extra item typed before issue, held here until the bill is issued. */
  pending?: boolean
}

/** A fixed rate is the school's own, set under Fees → Currencies; otherwise it is the day's market rate. */
export function rateName(status?: string | null): string {
  return status === 'manual' || status === 'fallback_manual' ? 'School rate' : "Today's rate"
}

function owing(i: InstalmentOut): number {
  return Math.max(0, i.outstanding ?? i.amount - i.amount_paid)
}

function toNumber(value: string | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// ---------------------------------------------------------------------- pieces

/** The grey strip that heads each part of the sheet. */
function SectionBar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-y border-border bg-muted/70 px-4 py-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  )
}

/** One cell of the details grid: a small label over its value. */
function InfoCell({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 border-b border-r border-border px-4 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{children ?? '—'}</dd>
    </div>
  )
}

function TodayTotals() {
  const today = todayApiDate()
  const report = useFeeCollectionsReport({ fromDate: today, toDate: today })
  const summary = report.data?.summary
  if (report.isPending) return <Skeleton className="h-4 w-40" />
  if (!summary) return null
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span>
        <span className="text-muted-foreground">Collected today </span>
        <span className="font-semibold tabular-nums">{formatMoney(summary.total, summary.currency)}</span>
        <span className="text-muted-foreground">
          {' '}
          · {summary.count} receipt{summary.count === 1 ? '' : 's'}
        </span>
      </span>
      {Object.entries(summary.by_method).map(([method, m]) => (
        <span key={method} className="text-muted-foreground">
          {PAYMENT_METHOD_LABEL[method as PaymentMethod] ?? method}{' '}
          <span className="font-medium text-foreground tabular-nums">
            {formatMoney(m.total, summary.currency)}
          </span>
        </span>
      ))}
    </div>
  )
}

function SumLine({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: 'success' | 'warning' | 'primary'
}) {
  return (
    <div
      className={cn(
        'flex justify-between gap-3 border-b border-border px-3 py-1.5 last:border-b-0',
        strong ? 'text-base font-semibold' : 'text-sm',
      )}
    >
      <span className={strong ? undefined : 'text-muted-foreground'}>{label}</span>
      <span
        className={cn(
          'tabular-nums',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
          tone === 'primary' && 'text-primary',
        )}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * Fees held back when the bill was issued (say Term 1 and Term 2, billed later).
 * Priced from the fee rules as they stand now; tick, give any concession, issue.
 */
function LeftOffSection({ bill, studentId }: { bill: FeeInvoiceOut; studentId: number }) {
  const labels = bill.left_off ?? []
  const breakdown = useFeeBreakdown(studentId, { academicYearId: bill.academic_year_id }, labels.length > 0)
  const issueMore = useIssueLeftOff()
  const lines = (breakdown.data?.instalments ?? []).filter((i) => labels.includes(i.label))
  const [ticked, setTicked] = React.useState<Record<string, boolean>>({})
  const [concession, setConcession] = React.useState<Record<string, string>>({})
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    setTicked(Object.fromEntries(labels.map((l) => [l, true])))
    setConcession({})
    setReason('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill.id, labels.join('|')])

  const chosen = lines.filter((l) => ticked[l.label])
  const off = (label: string) => Math.max(0, Number(concession[label]) || 0)
  const total = chosen.reduce((s, l) => s + l.amount - off(l.label), 0)

  const submit = async () => {
    for (const l of chosen) {
      if (off(l.label) > l.amount) return setError(`The concession on ${l.label} is more than the fee.`)
    }
    setError(null)
    try {
      await issueMore.mutateAsync({
        invoiceId: bill.id,
        body: {
          labels: chosen.map((l) => l.label),
          concessions: chosen.filter((l) => off(l.label) > 0).map((l) => ({ label: l.label, amount: off(l.label) })),
          concession_reason: reason.trim() || null,
        },
      })
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not add the fees to the bill.')
    }
  }

  if (labels.length === 0) return null
  return (
    <>
      <SectionBar title="Fees not billed yet">
        <span className="text-xs text-warning">Left off when the bill was issued. Tick the ones to bill now.</span>
      </SectionBar>
      {breakdown.isPending ? (
        <div className="p-4">
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2 font-medium">Particulars</th>
                <th className="px-3 py-2 font-medium">Due date</th>
                <th className="px-3 py-2 text-right font-medium">Fee</th>
                <th className="w-36 px-3 py-2 text-right font-medium">Concession</th>
                <th className="px-3 py-2 text-right font-medium">To bill</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.label} className={cn('border-b border-border', ticked[l.label] && 'bg-primary/5')}>
                  <td className="px-3 py-2">
                    <Checkbox
                      aria-label={`Bill ${l.label}`}
                      checked={!!ticked[l.label]}
                      onCheckedChange={(v) => setTicked((t) => ({ ...t, [l.label]: v === true }))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{l.label}</span>
                    {l.components?.length ? (
                      <span className="block text-xs text-muted-foreground">{l.components.map((c) => c.name).join(' + ')}</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{l.due_date ? formatDate(l.due_date) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(l.amount, bill.currency)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <Input
                      aria-label={`Concession on ${l.label}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      placeholder="0"
                      disabled={!ticked[l.label]}
                      className="h-8 text-right tabular-nums"
                      value={concession[l.label] ?? ''}
                      onChange={(e) => setConcession((c) => ({ ...c, [l.label]: e.target.value }))}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {ticked[l.label] ? formatMoney(l.amount - off(l.label), bill.currency) : '—'}
                  </td>
                </tr>
              ))}
              {lines.length < labels.length && (
                <tr className="border-b border-border">
                  <td />
                  <td colSpan={5} className="px-3 py-2 text-xs text-muted-foreground">
                    {labels.filter((l) => !lines.some((x) => x.label === l)).join(', ')}: no fee is set for this in
                    the fee structure any more.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-4">
        <Field id="fc-more-reason" label="Reason for the concession" className="min-w-[220px] flex-1">
          <Input
            id="fc-more-reason"
            placeholder="Only needed when you give a concession"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <div className="flex flex-col items-end gap-1">
          {error && <FormError message={error} />}
          <Button size="lg" onClick={submit} loading={issueMore.isPending} disabled={chosen.length === 0 || total <= 0}>
            <FileCheck2 />
            Issue selected fees for {formatMoney(total, bill.currency)}
          </Button>
        </div>
      </div>
    </>
  )
}

function ReceiptDialog({
  view,
  school,
  autoPrint,
  onAutoPrinted,
  onClose,
  onNext,
}: {
  view: { invoiceId: string; index: number } | null
  school: SchoolLetterhead
  autoPrint: boolean
  onAutoPrinted: () => void
  onClose: () => void
  onNext?: () => void
}) {
  const receipt = usePaymentReceipt(view?.invoiceId ?? null, view?.index ?? null)

  // Print as soon as the receipt is on the page, when the clerk asked for it.
  React.useEffect(() => {
    if (!autoPrint || !receipt.data) return
    const timer = window.setTimeout(() => {
      onAutoPrinted()
      printFeeReceipt()
    }, 150)
    return () => window.clearTimeout(timer)
  }, [autoPrint, receipt.data, onAutoPrinted])

  return (
    <Dialog open={!!view} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {receipt.data?.receipt_number ? `Receipt ${receipt.data.receipt_number}` : 'Receipt'}
          </DialogTitle>
          <DialogDescription>
            Two copies print on one sheet: keep the office copy, give the other to the parent.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[65vh] overflow-y-auto">
          <QueryBoundary query={receipt} loading={<Skeleton className="h-96 w-full rounded-xl" />}>
            {(data) => (
              <>
                <FeeReceipt receipt={data} school={school} />
                <FeeReceiptForPrint receipt={data} school={school} />
              </>
            )}
          </QueryBoundary>
        </DialogBody>
        <DialogFooter>
          {onNext ? (
            <Button variant="outline" onClick={onNext}>
              Next student
            </Button>
          ) : (
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          )}
          <Button onClick={printFeeReceipt} disabled={!receipt.data}>
            <Printer />
            Print receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------- page

export default function FeeCollectionPage() {
  const [params, setParams] = useSearchParams()
  const currentYear = useCurrentYear()
  const years = useAcademicYears({ program: 'LMS' })
  const students = useUsers('STUDENT')
  const enrollments = useEnrollments()
  const categories = useAdmissionCategories({ program: 'LMS' })
  const settings = useProgramSettings('LMS')
  const collect = useCollectFee()
  const issueBill = useIssueStudentBill()
  const addExtras = useAddExtraItems()
  const removeExtra = useRemoveExtraItem()
  const razorpay = useCounterRazorpay()

  const studentId = params.get('student') ? Number(params.get('student')) : null
  const setStudentId = (id: number | null) => {
    const next = new URLSearchParams(params)
    if (id == null) next.delete('student')
    else next.set('student', String(id))
    setParams(next, { replace: true })
  }

  const [yearChoice, setYearChoice] = React.useState<number | null>(null)
  const yearId = yearChoice ?? currentYear.data?.id ?? null
  const yearName = (years.data ?? []).find((y) => y.id === yearId)?.name ?? currentYear.data?.name

  // ------------------------------------------------------------ who
  const classOf = React.useMemo(() => {
    const map = new Map<number, string>()
    for (const e of enrollments.data ?? []) map.set(e.student.id, e.class_room.name)
    return map
  }, [enrollments.data])
  const categoryName = React.useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c.name])),
    [categories.data],
  )
  const options = React.useMemo(
    () =>
      (students.data ?? [])
        .filter((s) => s.is_active)
        .map((s) => ({
          value: String(s.id),
          label: s.full_name,
          hint: [s.admission_number, classOf.get(s.id)].filter(Boolean).join(' · ') || s.email,
          keywords: [s.admission_number, s.guardian_name, s.guardian_phone, s.phone]
            .filter(Boolean)
            .join(' '),
        })),
    [students.data, classOf],
  )
  const student = (students.data ?? []).find((s) => s.id === studentId) ?? null

  // F2 or "/" opens the student search, as on a counter keyboard.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable]')
      if (e.key === 'F2' || (e.key === '/' && !typing)) {
        e.preventDefault()
        document.getElementById(SEARCH_ID)?.click()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ------------------------------------------------------------ the bill
  const invoices = useFeeInvoices(
    { studentId: studentId ?? undefined, academicYearId: yearId ?? undefined },
    studentId != null && yearId != null,
  )
  const live = (invoices.data ?? []).find((i) => i.status !== 'CANCELLED') ?? null
  // A draft is the office's working copy, not a bill anyone has been asked to pay.
  const issued = live != null && live.status !== 'DRAFT' ? live : null
  const breakdown = useFeeBreakdown(
    studentId,
    { academicYearId: yearId ?? undefined },
    studentId != null && yearId != null && invoices.isSuccess && !issued,
  )
  const loadingDues = studentId != null && (invoices.isPending || (!issued && breakdown.isPending))
  const currency = issued?.currency ?? breakdown.data?.currency ?? 'INR'
  const preview = issued ? null : (breakdown.data ?? null)
  const nothingToBill = !issued && breakdown.isSuccess && (breakdown.data?.total_amount ?? 0) <= 0

  // ------------------------------------------------------------ issue-time inputs
  const [concessions, setConcessions] = React.useState<Record<string, string>>({})
  // Fees unticked on the issue sheet: left off the bill entirely.
  const [excluded, setExcluded] = React.useState<Record<string, boolean>>({})
  const [concessionReason, setConcessionReason] = React.useState('')
  const [pendingExtras, setPendingExtras] = React.useState<{ key: string; name: string; amount: number }[]>([])
  const [extraName, setExtraName] = React.useState('')
  const [extraAmount, setExtraAmount] = React.useState('')
  const [sheetError, setSheetError] = React.useState<string | null>(null)

  // ------------------------------------------------------------ payment inputs
  const [ticked, setTicked] = React.useState<Record<string, boolean>>({})
  const [payNow, setPayNow] = React.useState<Record<string, string>>({})
  const [method, setMethod] = React.useState<CounterMode>('CASH')
  const [payCurrency, setPayCurrency] = React.useState<PayCurrency>('INR')
  const [txnRef, setTxnRef] = React.useState('')
  const [chequeNo, setChequeNo] = React.useState('')
  const [bank, setBank] = React.useState('')
  const [chequeDate, setChequeDate] = React.useState<string | null>(null)
  const [receiptDate, setReceiptDate] = React.useState<string | null>(todayApiDate())
  const [note, setNote] = React.useState('')
  const [printAfter, setPrintAfter] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [receiptView, setReceiptView] = React.useState<{ invoiceId: string; index: number } | null>(null)
  const [justCollected, setJustCollected] = React.useState(false)
  const [autoPrint, setAutoPrint] = React.useState(false)
  const clearAutoPrint = React.useCallback(() => setAutoPrint(false), [])

  // A new student or year starts the sheet afresh.
  React.useEffect(() => {
    setConcessions({})
    setExcluded({})
    setConcessionReason('')
    setPendingExtras([])
    setExtraName('')
    setExtraAmount('')
    setSheetError(null)
    setMethod('CASH')
    setPayCurrency('INR')
    setTxnRef('')
    setChequeNo('')
    setBank('')
    setChequeDate(null)
    setNote('')
  }, [studentId, yearId])

  // ------------------------------------------------------------ rows
  const rows: Row[] = React.useMemo(() => {
    const source = issued ? issued.instalments : (preview?.instalments ?? [])
    const lines: Row[] = source
      .filter((i) => i.status !== 'WAIVED')
      .map((i) => {
        const concession = issued ? (i.concession_amount ?? 0) : toNumber(concessions[i.label])
        const paid = i.amount_paid ?? 0
        return {
          key: i.label,
          label: i.label,
          detail: i.components?.length ? i.components.map((c) => c.name).join(' + ') : null,
          dueDate: i.due_date,
          // An issued line already has its concession taken off; show the fee before it.
          fee: issued ? i.amount + concession : i.amount,
          concession,
          paid,
          balance: issued ? owing(i) : Math.max(0, i.amount - concession - paid),
          status: i.status,
          isOverdue: i.is_overdue,
          daysOverdue: i.days_overdue,
          isExtra: !!i.is_extra,
        }
      })
    if (!issued) {
      for (const e of pendingExtras) {
        lines.push({
          key: e.key,
          label: e.name,
          detail: 'Extra item',
          dueDate: todayApiDate(),
          fee: e.amount,
          concession: 0,
          paid: 0,
          balance: e.amount,
          status: 'PENDING',
          isOverdue: false,
          daysOverdue: 0,
          isExtra: true,
          pending: true,
        })
      }
    }
    return lines
  }, [issued, preview, concessions, pendingExtras])

  const payable = rows.filter((r) => r.balance > 0)
  const billing = issued ? rows : rows.filter((r) => !excluded[r.key])
  const totalFee = billing.reduce((s, r) => s + r.fee, 0)
  const totalConcession = billing.reduce((s, r) => s + r.concession, 0)
  const totalPaid = billing.reduce((s, r) => s + r.paid, 0)
  const totalBalance = billing.reduce((s, r) => s + r.balance, 0)
  const allBilled = rows.length > 0 && rows.every((r) => !excluded[r.key])
  const payingNow = payable.reduce((s, r) => s + (ticked[r.key] ? toNumber(payNow[r.key]) : 0), 0)

  // On a freshly loaded bill, tick the overdue fees (or the next one due) at their full balance.
  const dueKey = `${studentId}:${yearId}:${issued?.id ?? 'unissued'}:${issued?.amount_paid ?? 0}:${issued?.total_amount ?? 0}`
  React.useEffect(() => {
    if (loadingDues || !issued) {
      setTicked({})
      setPayNow({})
      return
    }
    const open = issued.instalments.filter((i) => i.status !== 'WAIVED' && owing(i) > 0)
    const overdue = open.filter((i) => i.is_overdue)
    const chosen = overdue.length ? overdue : open.slice(0, 1)
    setTicked(Object.fromEntries(chosen.map((i) => [i.label, true])))
    setPayNow(Object.fromEntries(open.map((i) => [i.label, String(owing(i))])))
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueKey, loadingDues])

  const foreign = payCurrency !== currency
  // Both currencies carry their own tax on top of the fees (INR 18%, AED 5% VAT).
  const quote = usePaymentQuote('admin', payingNow, payCurrency, method === 'RAZORPAY')
  const collectLabel = quote.data ? formatMoney(quote.data.total, quote.data.currency) : formatMoney(payingNow, currency)

  const tickAll = (on: boolean) => setTicked(Object.fromEntries(payable.map((r) => [r.key, on])))
  const allTicked = payable.length > 0 && payable.every((r) => ticked[r.key])

  // ------------------------------------------------------------ actions
  const addExtra = async () => {
    const name = extraName.trim()
    const amount = toNumber(extraAmount)
    if (!name || amount <= 0) return setSheetError('Type the item name and its amount, then press Add.')
    setSheetError(null)
    if (issued) {
      try {
        await addExtras.mutateAsync({ invoiceId: issued.id, items: [{ name, amount }] })
      } catch (err) {
        return setSheetError((err as { message?: string })?.message ?? 'Could not add the item.')
      }
    } else {
      setPendingExtras((list) => [...list, { key: `extra-${Date.now()}`, name, amount }])
    }
    setExtraName('')
    setExtraAmount('')
  }

  const dropExtra = async (row: Row) => {
    setSheetError(null)
    if (row.pending) {
      setPendingExtras((list) => list.filter((e) => e.key !== row.key))
      return
    }
    if (!issued) return
    try {
      await removeExtra.mutateAsync({ invoiceId: issued.id, label: row.label })
    } catch (err) {
      setSheetError((err as { message?: string })?.message ?? 'Could not remove the item.')
    }
  }

  const issue = async () => {
    if (studentId == null || yearId == null) return
    for (const r of billing) {
      if (r.concession < 0 || r.concession > r.fee) {
        return setSheetError(`The concession on ${r.label} cannot be more than the fee.`)
      }
    }
    setSheetError(null)
    try {
      await issueBill.mutateAsync({
        studentId,
        academicYearId: yearId,
        body: {
          concessions: billing
            .filter((r) => !r.pending && r.concession > 0)
            .map((r) => ({ label: r.label, amount: r.concession })),
          concession_reason: concessionReason.trim() || null,
          extra_items: pendingExtras
            .filter((e) => !excluded[e.key])
            .map((e) => ({ name: e.name, amount: e.amount })),
          exclude: rows.filter((r) => !r.pending && excluded[r.key]).map((r) => r.label),
        },
      })
      setConcessions({})
      setExcluded({})
      setPendingExtras([])
    } catch (err) {
      setSheetError((err as { message?: string })?.message ?? 'Could not issue the bill.')
    }
  }

  const reference =
    method === 'CHEQUE'
      ? [
          // The mode prints beside it as "Cheque", so the number goes in bare.
          chequeNo.trim() && `No. ${chequeNo.trim()}`,
          bank.trim(),
          chequeDate && `dated ${formatDate(chequeDate)}`,
        ]
          .filter(Boolean)
          .join(', ')
      : method === 'CASH' || method === 'RAZORPAY'
        ? ''
        : txnRef.trim()

  const razorpayReady = issued?.gateway_provider === 'razorpay' && issued.gateway_enabled
  const busy = collect.isPending || razorpay.isPending

  const submit = async () => {
    if (!issued || studentId == null || yearId == null) return
    const allocations = payable
      .filter((r) => ticked[r.key])
      .map((r) => ({ label: r.label, amount: toNumber(payNow[r.key]) }))
    if (allocations.length === 0) return setError('Tick the fees being paid.')
    for (const a of allocations) {
      const row = payable.find((r) => r.label === a.label)!
      if (a.amount <= 0) return setError(`Enter the amount being paid for ${a.label}.`)
      if (a.amount > row.balance + 0.009) {
        return setError(`${a.label} has only ${formatMoney(row.balance, currency)} left to pay.`)
      }
    }
    const amount = Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100
    if (method === 'CHEQUE' && !chequeNo.trim()) return setError('Enter the cheque number.')
    setError(null)

    try {
      let invoice
      if (method === 'RAZORPAY') {
        invoice = await razorpay.mutateAsync({
          invoiceId: issued.id,
          body: { amount, allocations, currency: payCurrency },
          pay: (intent) =>
            openRazorpay(intent.checkout!, {
              merchant: settings.data?.school_name ?? 'School fees',
              logoUrl: settings.data?.school_logo_url,
            }),
        })
      } else {
        const today = todayApiDate()
        invoice = await collect.mutateAsync({
          studentId,
          body: {
            amount,
            method,
            allocations,
            currency: payCurrency,
            reference: reference || null,
            note: note.trim() || null,
            // A back-dated receipt is stamped at midday on its day, so the date
            // reads the same whatever timezone the report is opened in.
            paid_at: receiptDate && receiptDate !== today ? `${receiptDate}T06:30:00` : null,
            academic_year_id: yearId,
          },
        })
      }
      setJustCollected(true)
      setAutoPrint(printAfter)
      setReceiptView({ invoiceId: invoice.id, index: invoice.payments.length - 1 })
    } catch (err) {
      if (err instanceof RazorpayDismissed) return setError('The Razorpay window was closed before paying.')
      setError((err as { message?: string })?.message ?? 'Could not record the payment.')
    }
  }

  const school: SchoolLetterhead = {
    name: settings.data?.school_name,
    address: settings.data?.school_address,
    phone: settings.data?.school_contact_phone,
    email: settings.data?.school_contact_email,
    website: settings.data?.school_website_url,
    logoUrl: settings.data?.school_logo_url,
  }

  const history = (issued?.payments ?? [])
    .map((p, index) => ({ ...p, index }))
    .reverse()

  const numberCell = 'px-3 py-2 text-right tabular-nums'

  return (
    <div>
      <PageHeader
        title="Fee Collection"
        description="Find the student, issue the bill, tick the fees being paid, take the money and print the receipt."
      />

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <SectionBar title="Fee counter">
          <TodayTotals />
        </SectionBar>

        {/* --------------------------------------------------------- search */}
        <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_170px_180px]">
          <Field id={SEARCH_ID} label="Student" hint="Press F2 or / from anywhere on this page.">
            <Combobox
              id={SEARCH_ID}
              options={options}
              value={studentId ? String(studentId) : null}
              onChange={(v) => setStudentId(Number(v))}
              placeholder="Name, admission number or parent's phone…"
              searchPlaceholder="Type a name, admission number or phone…"
              emptyMessage="No student matches."
            />
          </Field>
          <Field id="fc-year" label="Session">
            <Select value={yearId ? String(yearId) : ''} onValueChange={(v) => setYearChoice(Number(v))}>
              <SelectTrigger id="fc-year">
                <SelectValue placeholder="Session" />
              </SelectTrigger>
              <SelectContent>
                {(years.data ?? []).map((y) => (
                  <SelectItem key={y.id} value={String(y.id)}>
                    {y.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="fc-date" label="Receipt date">
            <DatePicker id="fc-date" value={receiptDate} onChange={setReceiptDate} maxToday />
          </Field>
        </div>

        {!student ? (
          <div className="flex flex-col items-center gap-2 border-t border-border px-4 py-14 text-center">
            <Search className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Find a student to begin</p>
            <p className="text-sm text-muted-foreground">
              Search by name, admission number or the parent's phone number. Shortcut:{' '}
              <Kbd>F2</Kbd> or <Kbd>/</Kbd>
            </p>
          </div>
        ) : (
          <>
            {/* ------------------------------------------------- student */}
            <SectionBar title="Student details" />
            <div className="flex">
              <div className="hidden items-center border-b border-r border-border px-4 sm:flex">
                <Avatar name={student.full_name} src={student.photo_url} size="lg" />
              </div>
              <dl className="grid min-w-0 flex-1 grid-cols-2 lg:grid-cols-4">
                <InfoCell label="Admission no">{student.admission_number}</InfoCell>
                <InfoCell label="Name">{student.full_name}</InfoCell>
                <InfoCell label="Class">{classOf.get(student.id)}</InfoCell>
                <InfoCell label="Admission type">
                  {student.admission_category_id != null
                    ? categoryName.get(student.admission_category_id)
                    : null}
                </InfoCell>
                <InfoCell label="Parent">
                  {student.guardian_name
                    ? `${student.guardian_name}${student.guardian_relation ? ` (${student.guardian_relation})` : ''}`
                    : null}
                </InfoCell>
                <InfoCell label="Phone">{student.guardian_phone ?? student.phone}</InfoCell>
                <InfoCell label="Bill no">{issued?.invoice_number ?? 'Not issued yet'}</InfoCell>
                <InfoCell label="Bill status">
                  {issued ? (
                    <Badge tone={INVOICE_STATUS_TONE[issued.status]} size="sm">
                      {INVOICE_STATUS_LABEL[issued.status]}
                    </Badge>
                  ) : nothingToBill ? (
                    'No fee set'
                  ) : (
                    <Badge tone="warning" size="sm">
                      Not issued yet
                    </Badge>
                  )}
                </InfoCell>
              </dl>
            </div>

            {/* ------------------------------------------------- fees */}
            <SectionBar title={`Fee details · ${yearName ?? ''}`}>
              {!issued && !nothingToBill && !loadingDues && (
                <span className="text-xs text-warning">
                  Not issued yet: tick the fees to bill, give any concession, add extra items, then issue.
                </span>
              )}
            </SectionBar>

            {loadingDues ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : nothingToBill && pendingExtras.length === 0 ? (
              <div className="flex gap-3 px-4 py-5 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <p className="text-muted-foreground">
                  <strong className="text-foreground">No fee is set for this student in {yearName}.</strong>{' '}
                  Give them an admission type and the {yearName} session on their profile under
                  Admissions, then come back.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="w-10 px-3 py-2">
                          {issued ? (
                            payable.length > 0 && (
                              <Checkbox
                                aria-label="Tick every fee"
                                checked={allTicked}
                                onCheckedChange={(v) => tickAll(v === true)}
                              />
                            )
                          ) : (
                            <Checkbox
                              aria-label="Bill every fee"
                              checked={allBilled}
                              onCheckedChange={(v) =>
                                setExcluded(v === true ? {} : Object.fromEntries(rows.map((r) => [r.key, true])))
                              }
                            />
                          )}
                        </th>
                        <th className="w-8 px-1 py-2 font-medium">#</th>
                        <th className="px-3 py-2 font-medium">Particulars</th>
                        <th className="px-3 py-2 font-medium">Due date</th>
                        <th className="px-3 py-2 text-right font-medium">Fee</th>
                        <th className="w-36 px-3 py-2 text-right font-medium">Concession</th>
                        <th className="px-3 py-2 text-right font-medium">Paid</th>
                        <th className="px-3 py-2 text-right font-medium">Balance</th>
                        {issued && <th className="w-36 px-3 py-2 text-right font-medium">Pay now</th>}
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, index) => {
                        const open = r.balance > 0
                        const checked = !!ticked[r.key] && open
                        const leftOff = !issued && !!excluded[r.key]
                        return (
                          <tr
                            key={r.key}
                            className={cn(
                              'border-b border-border',
                              (checked || (!issued && !leftOff)) && 'bg-primary/5',
                              !open && issued && 'text-muted-foreground',
                              leftOff && 'text-muted-foreground opacity-60',
                            )}
                          >
                            <td className="px-3 py-2">
                              {issued ? (
                                open && (
                                  <Checkbox
                                    aria-label={`Pay ${r.label}`}
                                    checked={checked}
                                    onCheckedChange={(v) => setTicked((t) => ({ ...t, [r.key]: v === true }))}
                                  />
                                )
                              ) : (
                                <Checkbox
                                  aria-label={`Bill ${r.label}`}
                                  checked={!leftOff}
                                  onCheckedChange={(v) => setExcluded((e) => ({ ...e, [r.key]: v !== true }))}
                                />
                              )}
                            </td>
                            <td className="px-1 py-2 text-xs text-muted-foreground">{index + 1}</td>
                            <td className="px-3 py-2">
                              <span className="font-medium">{r.label}</span>
                              {r.isExtra && (
                                <Badge tone="info" size="sm" className="ml-2">
                                  Extra
                                </Badge>
                              )}
                              {r.detail && !r.pending && (
                                <span className="block text-xs text-muted-foreground">{r.detail}</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {r.dueDate ? formatDate(r.dueDate) : '—'}
                            </td>
                            <td className={numberCell}>{formatMoney(r.fee, currency)}</td>
                            <td className="px-3 py-1.5 text-right">
                              {!issued && !r.pending ? (
                                <Input
                                  aria-label={`Concession on ${r.label}`}
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="0.01"
                                  placeholder="0"
                                  disabled={leftOff}
                                  className="h-8 text-right tabular-nums"
                                  value={concessions[r.key] ?? ''}
                                  onChange={(e) => setConcessions((c) => ({ ...c, [r.key]: e.target.value }))}
                                />
                              ) : (
                                <span className="tabular-nums">
                                  {r.concession > 0 ? `−${formatMoney(r.concession, currency)}` : '—'}
                                </span>
                              )}
                            </td>
                            <td className={numberCell}>{r.paid > 0 ? formatMoney(r.paid, currency) : '—'}</td>
                            <td className={cn(numberCell, 'font-semibold')}>
                              {r.balance > 0 ? formatMoney(r.balance, currency) : 'Nil'}
                            </td>
                            {issued && (
                              <td className="px-3 py-1.5 text-right">
                                {open && (
                                  <Input
                                    aria-label={`Amount paid now for ${r.label}`}
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    step="0.01"
                                    disabled={!checked}
                                    className="h-8 text-right font-medium tabular-nums"
                                    value={payNow[r.key] ?? ''}
                                    onChange={(e) => setPayNow((p) => ({ ...p, [r.key]: e.target.value }))}
                                  />
                                )}
                              </td>
                            )}
                            <td className="px-3 py-2">
                              {leftOff ? (
                                <Badge tone="neutral" size="sm">
                                  Not billed
                                </Badge>
                              ) : r.pending ? (
                                <Badge tone="neutral" size="sm">
                                  To be added
                                </Badge>
                              ) : r.isOverdue && open ? (
                                <Badge tone="danger" size="sm">
                                  Overdue {r.daysOverdue}d
                                </Badge>
                              ) : (
                                <Badge tone={INSTALMENT_STATUS_TONE[r.status] ?? 'neutral'} size="sm">
                                  {INSTALMENT_STATUS_LABEL[r.status] ?? r.status}
                                </Badge>
                              )}
                            </td>
                            <td className="pr-2">
                              {r.isExtra && r.paid <= 0 && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Remove ${r.label}`}
                                  onClick={() => dropExtra(r)}
                                >
                                  <X />
                                </Button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/40 font-semibold">
                        <td colSpan={4} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                          Total
                        </td>
                        <td className={numberCell}>{formatMoney(totalFee, currency)}</td>
                        <td className={numberCell}>
                          {totalConcession > 0 ? `−${formatMoney(totalConcession, currency)}` : '—'}
                        </td>
                        <td className={numberCell}>{formatMoney(totalPaid, currency)}</td>
                        <td className={numberCell}>{formatMoney(totalBalance, currency)}</td>
                        {issued && <td className={cn(numberCell, 'text-primary')}>{formatMoney(payingNow, currency)}</td>}
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Extra items: books, uniform, anything not in the fee structure. */}
                <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3">
                  <Field id="fc-extra-name" label="Add other item" className="min-w-[200px] flex-1">
                    <Input
                      id="fc-extra-name"
                      placeholder="e.g. Books, Uniform, Trip"
                      value={extraName}
                      onChange={(e) => setExtraName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addExtra()}
                    />
                  </Field>
                  <Field id="fc-extra-amount" label="Amount" className="w-36">
                    <Input
                      id="fc-extra-amount"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      className="text-right tabular-nums"
                      value={extraAmount}
                      onChange={(e) => setExtraAmount(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addExtra()}
                    />
                  </Field>
                  <Button variant="outline" onClick={addExtra} loading={addExtras.isPending}>
                    <Plus />
                    Add
                  </Button>
                </div>
                {sheetError && (
                  <div className="px-4 pt-3">
                    <FormError message={sheetError} />
                  </div>
                )}

                {/* ------------------------------------------- issue */}
                {!issued && (
                  <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-4">
                    <Field id="fc-concession-reason" label="Reason for the concession" className="min-w-[220px] flex-1">
                      <Input
                        id="fc-concession-reason"
                        placeholder={totalConcession > 0 ? 'e.g. Staff child, scholarship' : 'Only needed when you give a concession'}
                        value={concessionReason}
                        onChange={(e) => setConcessionReason(e.target.value)}
                      />
                    </Field>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-muted-foreground">
                        Once issued, the student and parent see it on their Fees page and can pay online.
                      </span>
                      <Button size="lg" onClick={issue} loading={issueBill.isPending} disabled={totalBalance <= 0}>
                        <FileCheck2 />
                        Issue bill for {formatMoney(totalBalance, currency)}
                      </Button>
                    </div>
                  </div>
                )}

                {/* ------------------------------------------- not billed yet */}
                {issued && studentId != null && <LeftOffSection bill={issued} studentId={studentId} />}

                {/* ------------------------------------------- payment */}
                {issued && payable.length > 0 && (
                  <>
                    <SectionBar title="Payment" />
                    <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="min-w-0 space-y-4">
                        <FormError message={error} />
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-sm font-medium">Currency</span>
                          <Segmented
                            layoutId="fee-counter-currency"
                            aria-label="Currency"
                            value={payCurrency}
                            onChange={setPayCurrency}
                            options={PAY_CURRENCIES.map((c) => ({ value: c.value, label: c.label }))}
                          />
                          {foreign && (
                            <span className="text-xs text-muted-foreground">
                              {quote.data
                                ? `${rateName(quote.data.rate_status)}: ${formatMoney(1, quote.data.currency)} = ${formatMoney(1 / quote.data.exchange_rate, currency)}`
                                : 'Getting the rate…'}
                            </span>
                          )}
                        </div>
                        <Segmented
                          layoutId="fee-counter-method"
                          aria-label="Payment mode"
                          value={method}
                          onChange={setMethod}
                          options={COUNTER_METHODS.map((m) => ({ value: m.value, label: m.label, icon: m.icon }))}
                        />

                        {method === 'CHEQUE' ? (
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Field id="fc-cheque" label="Cheque number" required>
                              <Input id="fc-cheque" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
                            </Field>
                            <Field id="fc-bank" label="Bank">
                              <Input id="fc-bank" value={bank} onChange={(e) => setBank(e.target.value)} />
                            </Field>
                            <Field id="fc-cheque-date" label="Cheque date">
                              <DatePicker id="fc-cheque-date" value={chequeDate} onChange={setChequeDate} />
                            </Field>
                          </div>
                        ) : method === 'RAZORPAY' ? (
                          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm">
                            {razorpayReady ? (
                              <>
                                The Razorpay window opens on this screen; the parent pays by UPI, card or
                                net banking. The receipt prints as soon as Razorpay confirms the payment.
                                {foreign && (
                                  <span className="mt-1 block text-warning">
                                    In AED, Razorpay takes international cards only, and only once Razorpay
                                    has switched on international payments for the school.
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-warning">
                                Razorpay is not connected yet. Add the school's Razorpay test keys on the
                                server, then this option takes payments.
                              </span>
                            )}
                          </div>
                        ) : method !== 'CASH' ? (
                          <Field
                            id="fc-ref"
                            label={
                              method === 'UPI'
                                ? 'UPI transaction ID'
                                : method === 'CARD'
                                  ? 'Card slip / approval number'
                                  : 'Transfer reference (UTR)'
                            }
                          >
                            <Input id="fc-ref" value={txnRef} onChange={(e) => setTxnRef(e.target.value)} />
                          </Field>
                        ) : null}

                        <Field id="fc-note" label="Remarks">
                          <Input id="fc-note" value={note} onChange={(e) => setNote(e.target.value)} />
                        </Field>
                      </div>

                      <div className="space-y-3">
                        <div className="rounded-md border border-border">
                          <SumLine label="Total fee" value={formatMoney(totalFee, currency)} />
                          {totalConcession > 0 && (
                            <SumLine label="Concession" value={`−${formatMoney(totalConcession, currency)}`} />
                          )}
                          {(issued.late_fee_total ?? 0) > 0 && (
                            <SumLine label="Late fee" value={formatMoney(issued.late_fee_total, currency)} />
                          )}
                          <SumLine label="Paid earlier" value={formatMoney(totalPaid, currency)} tone="success" />
                          <SumLine
                            label="Paying now"
                            value={formatMoney(payingNow, currency)}
                            strong={false}
                          />
                          <SumLine
                            label="Balance after"
                            value={
                              totalBalance - payingNow > 0.009
                                ? formatMoney(totalBalance - payingNow, currency)
                                : 'Nil'
                            }
                            tone={totalBalance - payingNow > 0.009 ? 'warning' : 'success'}
                          />
                        </div>
                        {payingNow > 0 && (
                          <div className="rounded-md border border-primary/40 bg-primary/5">
                            {quote.data ? (
                              <>
                                <SumLine
                                  label={foreign ? `Fees in ${quote.data.currency}` : 'Fees'}
                                  value={formatMoney(quote.data.fee_amount, quote.data.currency)}
                                />
                                {quote.data.tax_amount > 0 && (
                                  <SumLine
                                    label={`${quote.data.tax_label ?? 'Tax'} ${quote.data.tax_percent}%`}
                                    value={formatMoney(quote.data.tax_amount, quote.data.currency)}
                                  />
                                )}
                                {(quote.data.gateway_fee ?? 0) > 0 && (
                                  <SumLine
                                    label={quote.data.gateway_fee_label ?? 'Online payment fee'}
                                    value={formatMoney(quote.data.gateway_fee ?? 0, quote.data.currency)}
                                  />
                                )}
                                <SumLine
                                  label={`To collect in ${quote.data.currency}`}
                                  value={formatMoney(quote.data.total, quote.data.currency)}
                                  strong
                                  tone="primary"
                                />
                              </>
                            ) : (
                              <div className="p-3">
                                <Skeleton className="h-16 w-full" />
                              </div>
                            )}
                          </div>
                        )}
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox checked={printAfter} onCheckedChange={(v) => setPrintAfter(v === true)} />
                          Print the receipt straight away
                        </label>
                        <Button
                          size="lg"
                          className="w-full"
                          onClick={submit}
                          loading={busy}
                          disabled={
                            !(payingNow > 0) ||
                            (method === 'RAZORPAY' && !razorpayReady) ||
                            !quote.data
                          }
                        >
                          {method === 'RAZORPAY' ? <Wallet /> : <HandCoins />}
                          {method === 'RAZORPAY' ? 'Pay with Razorpay' : 'Collect'}{' '}
                          {payingNow > 0 ? collectLabel : ''}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {/* ------------------------------------------------- receipts */}
            {issued && (
              <>
                <SectionBar title="Receipts this session" />
                {history.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">No payments yet this session.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-4 py-2 font-medium">Receipt no</th>
                          <th className="px-3 py-2 font-medium">Date</th>
                          <th className="px-3 py-2 font-medium">Mode</th>
                          <th className="px-3 py-2 font-medium">Reference</th>
                          <th className="px-3 py-2 text-right font-medium">Amount</th>
                          <th className="w-12" />
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((p) => (
                          <tr key={p.index} className="border-b border-border last:border-b-0">
                            <td className="px-4 py-2 font-medium">{p.receipt_number ?? 'No receipt number'}</td>
                            <td className="whitespace-nowrap px-3 py-2">{formatDate(p.paid_at)}</td>
                            <td className="px-3 py-2">
                              {PAYMENT_METHOD_LABEL[p.method as PaymentMethod] ?? p.method ?? 'Payment'}
                            </td>
                            <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground">
                              {p.reference ?? '—'}
                            </td>
                            <td className={cn(numberCell, 'font-semibold')}>{formatMoney(p.amount ?? 0, currency)}</td>
                            <td className="pr-2">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Reprint receipt"
                                onClick={() => {
                                  setJustCollected(false)
                                  setReceiptView({ invoiceId: issued.id, index: p.index })
                                }}
                              >
                                <Printer />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <ReceiptDialog
        view={receiptView}
        school={school}
        autoPrint={autoPrint}
        onAutoPrinted={clearAutoPrint}
        onClose={() => setReceiptView(null)}
        onNext={
          justCollected
            ? () => {
                setReceiptView(null)
                setStudentId(null)
                window.setTimeout(() => document.getElementById(SEARCH_ID)?.click(), 50)
              }
            : undefined
        }
      />
    </div>
  )
}

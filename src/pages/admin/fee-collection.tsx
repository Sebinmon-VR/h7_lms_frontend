import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  Banknote,
  ChevronRight,
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

import type { FeeBill, FeeInvoiceOut, InstalmentOut, PaymentMethod, UserOut } from '@/api/types'
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
import { formatDate, formatTime, shiftApiDate, todayApiDate } from '@/lib/datetime'
import { countLabel } from '@/lib/format'
import { tidyName as tidy } from '@/lib/names'
import { INSTALMENT_STATUS_LABEL, INSTALMENT_STATUS_TONE, PAYMENT_METHOD_LABEL } from '@/lib/school'
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, formatMoney } from '@/lib/tuition'
import { RazorpayDismissed, openRazorpay } from '@/lib/razorpay'
import { cn } from '@/lib/cn'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormError } from '@/components/forms/field'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { Band, Figure, Figures, WorkspaceHeader } from '@/components/layout/workspace'
import {
  FeeReceipt,
  FeeReceiptForPrint,
  printFeeReceipt,
  type SchoolLetterhead,
} from '@/components/domain/fee-receipt'
import { FeeBillForPrint, FeeBillSheet, type BillPayer } from '@/components/domain/fee-bill'

/**
 * The fee counter, on one screen.
 *
 * Left: every student, by class, each with what they owe this session, so the
 * clerk can find a student by name, admission number or a parent's phone, or
 * just walk the "owing" list. Middle: the student's fee sheet, every fee a row,
 * grouped by the bill it went out on. Right: the checkout — tick fees, choose
 * the mode, collect, and the receipt opens in place, ready to print.
 *
 * Money is only taken against an issued bill. Before the office issues it the
 * sheet is the issue screen: tick the fees being billed, type a concession
 * against any of them and add extra items (books, uniform), then "Issue bill"
 * freezes it and puts it on the student's and parent's Fees page, where they
 * can also pay online.
 *
 * Any fee can be ticked, in any order, with its own amount — the payment is
 * recorded against exactly those fees, so the receipt says what was paid for.
 *
 * The bill is in rupees; the money can be taken in INR or AED. In AED the
 * amount is the school's rate (Fees → Currencies) plus AED's VAT on top, and
 * the bill is credited the rupee fees alone.
 */

const PAY_CURRENCIES = [
  { value: 'INR', label: 'INR ₹' },
  { value: 'AED', label: 'AED' },
] as const
type PayCurrency = (typeof PAY_CURRENCIES)[number]['value']

type CounterMode = PaymentMethod | 'RAZORPAY'

const COUNTER_METHODS: { value: CounterMode; label: string; icon: React.ReactNode }[] = [
  { value: 'CASH', label: 'Cash', icon: <Banknote /> },
  { value: 'UPI', label: 'UPI', icon: <Smartphone /> },
  { value: 'CARD', label: 'Card', icon: <CreditCard /> },
  { value: 'CHEQUE', label: 'Cheque', icon: <ScrollText /> },
  { value: 'BANK_TRANSFER', label: 'Bank', icon: <Landmark /> },
  { value: 'RAZORPAY', label: 'Razorpay', icon: <Wallet /> },
]

const SEARCH_ID = 'fee-counter-student'
const COMPACT_INPUT = 'h-8 px-2.5 py-1 text-sm'
const NO_CLASS = 'No class'

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
  /** The bill the line went out on, once issued. */
  bill?: string | null
}

const BILL_KIND_LABEL: Record<string, string> = {
  ISSUE: 'First bill',
  LATER: 'Billed later',
  EXTRA: 'Other items',
}

/** Where a student stands this session, for the list on the left. */
interface Standing {
  kind: 'unbilled' | 'owing' | 'paid'
  balance: number
  overdue: boolean
  currency: string
  /** Something paid, something still owed. */
  partPaid?: boolean
  /** A fee falls due within the next week and is not paid yet. */
  dueSoon?: boolean
  /** The bill carries a concession or discount. */
  concession?: boolean
}

type StatusFilter = 'all' | 'owing' | 'overdue' | 'due-soon' | 'part-paid' | 'concession' | 'paid' | 'unbilled'
type SortBy = 'name' | 'due'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Any status' },
  { value: 'owing', label: 'Owing' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'due-soon', label: 'Due in 7 days' },
  { value: 'part-paid', label: 'Part paid' },
  { value: 'concession', label: 'Has concession' },
  { value: 'paid', label: 'Fully paid' },
  { value: 'unbilled', label: 'Not billed' },
]

function matchesStatus(st: Standing | undefined, f: StatusFilter): boolean {
  const kind = st?.kind ?? 'unbilled'
  if (f === 'all') return true
  if (f === 'overdue') return kind === 'owing' && !!st?.overdue
  if (f === 'due-soon') return kind === 'owing' && !!st?.dueSoon
  if (f === 'part-paid') return kind === 'owing' && !!st?.partPaid
  if (f === 'concession') return !!st?.concession
  return kind === f
}

/** What fills the work area instead of the sheet: a receipt or a bill to print. */
type Paper = { kind: 'receipt'; invoiceId: string; index: number; fresh: boolean } | { kind: 'bill'; number: string }

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

const byNumber = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

// ---------------------------------------------------------------------- pieces

/** The thin grey strip that heads each part of the sheet. */
function SectionBar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-y border-border bg-muted/50 px-3 py-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
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
  tone?: 'success' | 'warning' | 'primary' | 'danger'
}) {
  return (
    <div className={cn('flex justify-between gap-3 py-1.5', strong ? 'text-base font-semibold' : 'text-sm')}>
      <span className={strong ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
      <span
        className={cn(
          'tabular-nums',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
          tone === 'primary' && 'text-primary',
          tone === 'danger' && 'text-danger',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-xs font-medium text-muted-foreground">{children}</span>
}

function StandingTag({ standing }: { standing: Standing | undefined }) {
  if (!standing || standing.kind === 'unbilled') return <span className="shrink-0 text-[11px] text-muted-foreground/80">Not billed</span>
  if (standing.kind === 'paid') return <span className="shrink-0 text-[11px] font-medium text-success">Paid</span>
  return (
    <span className={cn('shrink-0 text-xs font-medium tabular-nums', standing.overdue ? 'text-danger' : 'text-warning')}>
      {formatMoney(standing.balance, standing.currency)}
    </span>
  )
}

// ---------------------------------------------------------------------- students

function StudentList({
  students,
  classOf,
  categoryName,
  standing,
  value,
  onChange,
}: {
  students: UserOut[]
  classOf: Map<number, string>
  categoryName: Map<number, string>
  standing: Map<number, Standing>
  value: number | null
  onChange: (id: number) => void
}) {
  const [search, setSearch] = React.useState('')
  const [type, setType] = React.useState('all')
  const [status, setStatus] = React.useState<StatusFilter>('all')
  const [sort, setSort] = React.useState<SortBy>('name')
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set())
  const needle = search.trim().toLowerCase()

  const classNames = React.useMemo(() => {
    const names = new Set(students.map((s) => classOf.get(s.id) ?? NO_CLASS))
    return [...names].sort((a, b) => (a === NO_CLASS ? 1 : b === NO_CLASS ? -1 : byNumber(a, b)))
  }, [students, classOf])

  // Admission types the students here actually have, most common first.
  const types = React.useMemo(() => {
    const count = new Map<string, number>()
    for (const s of students) {
      const key = s.admission_category_id != null && categoryName.has(s.admission_category_id) ? String(s.admission_category_id) : 'none'
      count.set(key, (count.get(key) ?? 0) + 1)
    }
    return [...count.entries()]
      .sort((a, b) => (a[0] === 'none' ? 1 : b[0] === 'none' ? -1 : b[1] - a[1]))
      .map(([key, n]) => ({ key, n, label: key === 'none' ? 'No admission type' : tidy(categoryName.get(Number(key)) ?? '') }))
  }, [students, categoryName])
  const typeOf = (s: UserOut) =>
    s.admission_category_id != null && categoryName.has(s.admission_category_id) ? String(s.admission_category_id) : 'none'
  const inClass = type === 'all' ? students : students.filter((s) => typeOf(s) === type)
  const countOf = (f: StatusFilter) => inClass.filter((s) => matchesStatus(standing.get(s.id), f)).length
  const balanceOf = (id: number) => {
    const st = standing.get(id)
    return st?.kind === 'owing' ? st.balance : 0
  }

  const shown = inClass.filter((s) => {
    if (!matchesStatus(standing.get(s.id), status)) return false
    if (!needle) return true
    return [s.full_name, s.admission_number, s.guardian_name, s.guardian_phone, s.phone, classOf.get(s.id)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(needle)
  })
  const currency = [...standing.values()][0]?.currency ?? 'INR'
  const shownDue = shown.reduce((n, s) => n + balanceOf(s.id), 0)
  const filtered = type !== 'all' || status !== 'all' || needle !== ''

  const groups = React.useMemo(() => {
    const map = new Map<string, UserOut[]>()
    for (const s of shown) {
      const k = classOf.get(s.id) ?? NO_CLASS
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(s)
    }
    const order = (a: UserOut, b: UserOut) =>
      sort === 'due' ? balanceOf(b.id) - balanceOf(a.id) || byNumber(a.full_name, b.full_name) : byNumber(a.full_name, b.full_name)
    return [...map.entries()]
      .sort(([a], [b]) => (a === NO_CLASS ? 1 : b === NO_CLASS ? -1 : byNumber(a, b)))
      .map(([name, list]) => ({ name, list: list.sort(order) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, classOf, sort, standing])

  const selectedClass = value != null ? (classOf.get(value) ?? NO_CLASS) : null
  const toggle = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  const allOpen = collapsed.size === 0
  const pad = 'pl-4 pr-4 sm:pl-6 lg:pl-8'

  return (
    <nav aria-label="Students" className="flex flex-col lg:h-full">
      <div className={cn('space-y-2 border-b border-border py-2.5', pad)}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={SEARCH_ID}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && shown.length > 0) onChange(shown[0].id)
              if (e.key === 'Escape') setSearch('')
            }}
            placeholder="Name, adm. no or phone"
            aria-label="Find a student"
            className={cn(COMPACT_INPUT, 'pl-8 pr-10')}
          />
          <Kbd className="absolute right-2 top-1/2 -translate-y-1/2">F2</Kbd>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className={cn('h-8 px-2.5 text-xs', type !== 'all' && 'border-primary/50 text-primary')} aria-label="Admission type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All admission types</SelectItem>
              {types.map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.label} · {t.n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className={cn('h-8 px-2.5 text-xs', status !== 'all' && 'border-primary/50 text-primary')} aria-label="Fee status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label} · {countOf(f.value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className={cn('flex items-center justify-between gap-2 border-b border-border py-1.5 text-[11px] text-muted-foreground', pad)}>
        <span className="min-w-0 truncate">
          {countLabel(shown.length, 'student')}
          {shownDue > 0 && <span className="font-medium text-warning"> · {formatMoney(shownDue, currency)} due</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          {filtered && (
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => {
                setSearch('')
                setType('all')
                setStatus('all')
              }}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => setCollapsed(allOpen ? new Set(classNames) : new Set())}
            title={allOpen ? 'Fold every class' : 'Open every class'}
          >
            {allOpen ? 'Fold' : 'Open'}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground"
            onClick={() => setSort((v) => (v === 'name' ? 'due' : 'name'))}
            title="Change the order"
          >
            <ArrowUpDown className="size-3" />
            {sort === 'name' ? 'A–Z' : 'Most due'}
          </button>
        </span>
      </div>

      <div className="max-h-80 overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
        {groups.length === 0 && (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            <p>{needle ? 'No student matches' : status === 'owing' || status === 'overdue' ? 'Nobody here owes anything' : 'No students here'}</p>
          </div>
        )}
        {groups.map(({ name, list }) => {
          const open = needle !== '' || name === selectedClass || !collapsed.has(name)
          const due = list.reduce((n, s) => n + balanceOf(s.id), 0)
          return (
            <div key={name}>
              <button
                type="button"
                onClick={() => toggle(name)}
                aria-expanded={open}
                className={cn('sticky top-0 z-[1] flex w-full items-center gap-1.5 border-b border-border bg-muted/60 py-1.5 text-left text-xs backdrop-blur hover:bg-muted', pad)}
              >
                <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{tidy(name)}</span>
                {due > 0 && <span className="tabular-nums text-warning">{formatMoney(due, currency)}</span>}
                <span className="min-w-5 text-right tabular-nums text-muted-foreground">{list.length}</span>
              </button>
              {open &&
                list.map((s) => {
                  const active = s.id === value
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onChange(s.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'relative flex w-full items-center gap-2.5 border-b border-border/70 py-1.5 pl-4 pr-4 text-left transition-colors sm:pl-6 lg:pl-8',
                        active ? 'bg-primary/[0.06]' : 'hover:bg-muted/40',
                      )}
                    >
                      {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
                      <Avatar name={s.full_name} src={s.photo_url} size="xs" />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm leading-tight', active ? 'font-medium text-primary' : 'text-foreground')}>
                          {tidy(s.full_name)}
                        </span>
                        <span className="block truncate text-[11px] leading-tight text-muted-foreground">{s.admission_number ?? s.email}</span>
                      </span>
                      <StandingTag standing={standing.get(s.id)} />
                    </button>
                  )
                })}
            </div>
          )
        })}
      </div>
    </nav>
  )
}

// ---------------------------------------------------------------------- today

/** With no student open: what the counter has taken today, each receipt reprintable. */
function TodayPane({ onOpenReceipt, onPickStudent }: { onOpenReceipt: (invoiceId: string, index: number) => void; onPickStudent: (id: number) => void }) {
  const today = todayApiDate()
  const report = useFeeCollectionsReport({ fromDate: today, toDate: today })
  const summary = report.data?.summary
  const rows = [...(report.data?.rows ?? [])].sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1))

  return (
    <div className="py-4 lg:pl-6">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-3">
        <div>
          <h2 className="text-base font-medium text-foreground">Today at the counter</h2>
          <p className="text-xs text-muted-foreground">
            Pick a student on the left, or press <Kbd>F2</Kbd> and type a name, admission number or parent&rsquo;s phone
          </p>
        </div>
      </div>

      {summary && Object.keys(summary.by_method).length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-y border-border py-2 text-xs">
          {Object.entries(summary.by_method).map(([m, v]) => (
            <span key={m} className="text-muted-foreground">
              {PAYMENT_METHOD_LABEL[m as PaymentMethod] ?? m}{' '}
              <span className="font-medium tabular-nums text-foreground">{formatMoney(v.total, summary.currency)}</span>
              <span> · {v.count}</span>
            </span>
          ))}
        </div>
      )}

      {report.isPending ? (
        <div className="space-y-2 pt-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="border-b border-border py-10 text-center text-sm text-muted-foreground">No fees collected yet today</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Receipt</th>
                <th className="px-3 py-2 font-medium">Student</th>
                <th className="px-3 py-2 font-medium">Class</th>
                <th className="px-3 py-2 font-medium">Mode</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.invoice_id}-${r.payment_index ?? i}`} className="border-b border-border hover:bg-muted/30">
                  <td className="whitespace-nowrap py-1.5 pr-3 text-muted-foreground tabular-nums">{formatTime(r.paid_at)}</td>
                  <td className="px-3 py-1.5 font-medium">{r.receipt_number ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    <button type="button" className="text-left hover:text-primary hover:underline" onClick={() => onPickStudent(r.student_id)}>
                      {tidy(r.student_name ?? 'Student')}
                    </button>
                    {r.admission_number && <span className="ml-1.5 text-xs text-muted-foreground">{r.admission_number}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.class_name ?? '—'}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{PAYMENT_METHOD_LABEL[r.method as PaymentMethod] ?? r.method}</td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">{formatMoney(r.amount, r.currency)}</td>
                  <td className="py-1 text-right">
                    {r.payment_index != null && (
                      <Button variant="ghost" size="icon-sm" aria-label="Reprint receipt" onClick={() => onOpenReceipt(r.invoice_id, r.payment_index!)}>
                        <Printer />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------- paper

/** A receipt in the work area, printed straight away when the clerk asked for it. */
function ReceiptPaper({
  invoiceId,
  index,
  school,
  autoPrint,
  onAutoPrinted,
  onBack,
  onNext,
}: {
  invoiceId: string
  index: number
  school: SchoolLetterhead
  autoPrint: boolean
  onAutoPrinted: () => void
  onBack: () => void
  onNext?: () => void
}) {
  const receipt = usePaymentReceipt(invoiceId, index)

  React.useEffect(() => {
    if (!autoPrint || !receipt.data) return
    const timer = window.setTimeout(() => {
      onAutoPrinted()
      printFeeReceipt()
    }, 150)
    return () => window.clearTimeout(timer)
  }, [autoPrint, receipt.data, onAutoPrinted])

  return (
    <PaperFrame
      title={receipt.data?.receipt_number ? `Receipt ${receipt.data.receipt_number}` : 'Receipt'}
      note="Two copies print on one sheet: keep the office copy, give the other to the parent"
      onBack={onBack}
      actions={
        <>
          {onNext && (
            <Button variant="outline" size="sm" onClick={onNext}>
              Next student
            </Button>
          )}
          <Button size="sm" icon={<Printer />} onClick={printFeeReceipt} disabled={!receipt.data}>
            Print receipt
          </Button>
        </>
      }
    >
      <QueryBoundary query={receipt} loading={<Skeleton className="h-96 w-full" />}>
        {(data) => (
          <>
            <FeeReceipt receipt={data} school={school} />
            <FeeReceiptForPrint receipt={data} school={school} />
          </>
        )}
      </QueryBoundary>
    </PaperFrame>
  )
}

function PaperFrame({
  title,
  note,
  onBack,
  actions,
  children,
}: {
  title: string
  note: string
  onBack: () => void
  actions: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="lg:flex lg:h-full lg:flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2.5 lg:pl-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to the fee sheet">
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-base font-medium text-foreground">{title}</h2>
            <p className="truncate text-xs text-muted-foreground">{note}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      <div className="py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pl-6">
        <div className="mx-auto max-w-3xl">{children}</div>
      </div>
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
    <div className="mt-4">
      <SectionBar title="Not billed yet">
        <span className="text-xs text-warning">Left off at issue. Tick the ones to bill now; they go out as a new bill</span>
      </SectionBar>
      {breakdown.isPending ? (
        <Skeleton className="m-3 h-12" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <tbody>
              {lines.map((l) => (
                <tr key={l.label} className={cn('border-b border-border', ticked[l.label] && 'bg-primary/[0.03]')}>
                  <td className="w-9 px-3 py-1.5">
                    <Checkbox
                      aria-label={`Bill ${l.label}`}
                      checked={!!ticked[l.label]}
                      onCheckedChange={(v) => setTicked((t) => ({ ...t, [l.label]: v === true }))}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="font-medium">{l.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[l.due_date ? `Due ${formatDate(l.due_date)}` : null, l.components?.map((c) => c.name).join(' + ')].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(l.amount, bill.currency)}</td>
                  <td className="w-28 px-2 py-1">
                    <Input
                      aria-label={`Concession on ${l.label}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      placeholder="Less 0"
                      disabled={!ticked[l.label]}
                      className={cn(COMPACT_INPUT, 'text-right tabular-nums')}
                      value={concession[l.label] ?? ''}
                      onChange={(e) => setConcession((c) => ({ ...c, [l.label]: e.target.value }))}
                    />
                  </td>
                  <td className="w-28 px-3 py-1.5 text-right font-semibold tabular-nums">
                    {ticked[l.label] ? formatMoney(l.amount - off(l.label), bill.currency) : '—'}
                  </td>
                </tr>
              ))}
              {lines.length < labels.length && (
                <tr className="border-b border-border">
                  <td />
                  <td colSpan={4} className="px-2 py-1.5 text-xs text-muted-foreground">
                    {labels.filter((l) => !lines.some((x) => x.label === l)).join(', ')}: no fee is set for this in the fee structure any more
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Input
          placeholder="Reason for any concession"
          aria-label="Reason for the concession"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={cn(COMPACT_INPUT, 'min-w-[12rem] flex-1')}
        />
        <Button size="sm" icon={<FileCheck2 />} onClick={submit} loading={issueMore.isPending} disabled={chosen.length === 0 || total <= 0}>
          Bill {formatMoney(total, bill.currency)}
        </Button>
      </div>
      {error && (
        <div className="px-3 pt-2">
          <FormError message={error} />
        </div>
      )}
    </div>
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
  const categoryName = React.useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c.name])), [categories.data])
  const activeStudents = React.useMemo(() => (students.data ?? []).filter((s) => s.is_active), [students.data])
  const student = (students.data ?? []).find((s) => s.id === studentId) ?? null

  // Every account this session, for the owing figures on the left.
  const yearInvoices = useFeeInvoices({ academicYearId: yearId ?? undefined }, yearId != null)
  const todayIso = todayApiDate()
  const weekAhead = shiftApiDate(todayIso, 7)
  const standing = React.useMemo(() => {
    const map = new Map<number, Standing>()
    for (const inv of yearInvoices.data ?? []) {
      if (inv.status === 'CANCELLED' || map.has(inv.student_id)) continue
      if (inv.status === 'DRAFT') {
        map.set(inv.student_id, { kind: 'unbilled', balance: 0, overdue: false, currency: inv.currency })
        continue
      }
      const balance = inv.amount_outstanding ?? 0
      const lines = (inv.instalments ?? []).filter((i) => i.status !== 'WAIVED')
      map.set(inv.student_id, {
        kind: balance > 0.009 ? 'owing' : 'paid',
        balance,
        overdue: inv.is_overdue,
        currency: inv.currency,
        partPaid: (inv.amount_paid ?? 0) > 0 && balance > 0.009,
        dueSoon: lines.some((i) => owing(i) > 0 && !i.is_overdue && !!i.due_date && i.due_date >= todayIso && i.due_date <= weekAhead),
        concession: (inv.discount_total ?? 0) > 0 || lines.some((i) => (i.concession_amount ?? 0) > 0),
      })
    }
    return map
  }, [yearInvoices.data, todayIso, weekAhead])

  const today = todayApiDate()
  const todayReport = useFeeCollectionsReport({ fromDate: today, toDate: today })
  const figures = React.useMemo(() => {
    const live = (yearInvoices.data ?? []).filter((i) => i.status !== 'CANCELLED' && i.status !== 'DRAFT')
    const cur = live[0]?.currency ?? 'INR'
    const collected = live.reduce((n, i) => n + (i.amount_paid ?? 0), 0)
    const outstanding = live.reduce((n, i) => n + Math.max(0, i.amount_outstanding ?? 0), 0)
    const owingCount = live.filter((i) => (i.amount_outstanding ?? 0) > 0.009).length
    const overdue = live.filter((i) => i.is_overdue && (i.amount_outstanding ?? 0) > 0.009)
    const billed = new Set(live.map((i) => i.student_id))
    const unbilled = activeStudents.filter((s) => !billed.has(s.id)).length
    return { cur, collected, outstanding, owingCount, overdue, billedCount: live.length, unbilled }
  }, [yearInvoices.data, activeStudents])

  // F2 or "/" jumps to the student search, as on a counter keyboard.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable]')
      if (e.key === 'F2' || (e.key === '/' && !typing)) {
        e.preventDefault()
        const el = document.getElementById(SEARCH_ID) as HTMLInputElement | null
        el?.focus()
        el?.select()
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

  const [paper, setPaper] = React.useState<Paper | null>(null)
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
    setPaper((p) => (p?.kind === 'receipt' && p.fresh ? p : null))
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
          bill: issued ? (i.bill_number ?? issued.invoice_number ?? null) : null,
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
  const tickedRows = payable.filter((r) => ticked[r.key])
  const payingNow = tickedRows.reduce((s, r) => s + toNumber(payNow[r.key]), 0)

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

  // ------------------------------------------------------------ bills
  // An issued account's lines grouped under the bills they went out on; before
  // issue the sheet is one list.
  const liveBills = (issued?.bills ?? []).filter((b) => b.status !== 'CANCELLED')
  const groups = React.useMemo(() => {
    const bills = issued?.bills ?? []
    if (!issued || bills.length === 0) return [{ bill: null as FeeBill | null, rows }]
    const known = new Set(bills.map((b) => b.number))
    const out = bills
      .map((b) => ({ bill: b as FeeBill | null, rows: rows.filter((r) => r.bill === b.number) }))
      .filter((g) => g.rows.length > 0)
    const stray = rows.filter((r) => !r.bill || !known.has(r.bill))
    if (stray.length > 0) out.push({ bill: null, rows: stray })
    return out
  }, [issued, rows])
  const position = new Map(groups.flatMap((g) => g.rows).map((r, i) => [r.key, i + 1]))
  const payThisBill = (number: string) => {
    setTicked(Object.fromEntries(payable.map((r) => [r.key, r.bill === number])))
    setPayNow((p) => ({
      ...p,
      ...Object.fromEntries(payable.filter((r) => r.bill === number).map((r) => [r.key, String(r.balance)])),
    }))
    setError(null)
  }
  const payer: BillPayer = {
    className: student ? classOf.get(student.id) : null,
    guardianName: student?.guardian_name,
    guardianPhone: student?.guardian_phone ?? student?.phone,
  }

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
          concessions: billing.filter((r) => !r.pending && r.concession > 0).map((r) => ({ label: r.label, amount: r.concession })),
          concession_reason: concessionReason.trim() || null,
          extra_items: pendingExtras.filter((e) => !excluded[e.key]).map((e) => ({ name: e.name, amount: e.amount })),
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
    const allocations = tickedRows.map((r) => ({ label: r.label, amount: toNumber(payNow[r.key]) }))
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
      setAutoPrint(printAfter)
      setPaper({ kind: 'receipt', invoiceId: invoice.id, index: invoice.payments.length - 1, fresh: true })
    } catch (err) {
      if (err instanceof RazorpayDismissed) return setError('The Razorpay window was closed before paying.')
      setError((err as { message?: string })?.message ?? 'Could not record the payment.')
    }
  }

  const nextStudent = () => {
    setPaper(null)
    setStudentId(null)
    window.setTimeout(() => {
      const el = document.getElementById(SEARCH_ID) as HTMLInputElement | null
      el?.focus()
      el?.select()
    }, 50)
  }

  const school: SchoolLetterhead = {
    name: settings.data?.school_name,
    address: settings.data?.school_address,
    phone: settings.data?.school_contact_phone,
    email: settings.data?.school_contact_email,
    website: settings.data?.school_website_url,
    logoUrl: settings.data?.school_logo_url,
  }

  const history = (issued?.payments ?? []).map((p, index) => ({ ...p, index })).reverse()
  const num = 'px-2 py-1.5 text-right tabular-nums'
  const paperBill = paper?.kind === 'bill' && issued ? (issued.bills?.find((b) => b.number === paper.number) ?? null) : null
  const standingNow = studentId != null ? standing.get(studentId) : undefined

  // ------------------------------------------------------------ the sheet
  const studentLine = student && (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-3">
        <Avatar name={student.full_name} src={student.photo_url} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-medium text-foreground">{tidy(student.full_name)}</h2>
            {issued ? (
              <Badge tone={INVOICE_STATUS_TONE[issued.status]} size="sm">
                {INVOICE_STATUS_LABEL[issued.status]}
              </Badge>
            ) : nothingToBill ? (
              <Badge tone="neutral" size="sm">
                No fee set
              </Badge>
            ) : (
              !loadingDues && (
                <Badge tone="warning" size="sm">
                  Not issued yet
                </Badge>
              )
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {[
              student.admission_number,
              classOf.get(student.id),
              student.admission_category_id != null ? categoryName.get(student.admission_category_id) : null,
              student.guardian_name ? `${tidy(student.guardian_name)}${student.guardian_relation ? ` (${student.guardian_relation})` : ''}` : null,
              student.guardian_phone ?? student.phone,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {issued ? (liveBills.length > 1 ? `${liveBills.length} bills · balance` : `${issued.invoice_number ?? 'Bill'} · balance`) : 'To bill'}
          </p>
          <p className={cn('text-lg font-semibold tabular-nums', issued && totalBalance > 0 && (standingNow?.overdue ? 'text-danger' : 'text-foreground'))}>
            {loadingDues ? '—' : totalBalance > 0.009 ? formatMoney(totalBalance, currency) : issued ? 'Nil' : formatMoney(0, currency)}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => setStudentId(null)} aria-label="Close this student">
          <X />
        </Button>
      </div>

  )

  const sheet = student && (
    <div className="min-w-0">
      {/* fees */}
      <SectionBar title={`Fees · ${yearName ?? ''}`}>
        {!issued && !nothingToBill && !loadingDues && (
          <span className="text-xs text-warning">Not issued: untick fees to leave off, type any concession, add items, then issue</span>
        )}
        {issued && payable.length > 0 && <span className="text-xs text-muted-foreground">Tick what is being paid; change an amount to take part of it</span>}
      </SectionBar>

      {loadingDues ? (
        <div className="space-y-2 py-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : nothingToBill && pendingExtras.length === 0 ? (
        <div className="flex gap-3 border-b border-border px-3 py-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-muted-foreground">
            <strong className="font-medium text-foreground">No fee is set for this student in {yearName}.</strong> Give them an admission type and
            the {yearName} session on their profile under Admissions, then come back
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="w-9 px-3 py-1.5">
                    {issued ? (
                      payable.length > 0 && <Checkbox aria-label="Tick every fee" checked={allTicked} onCheckedChange={(v) => tickAll(v === true)} />
                    ) : (
                      <Checkbox
                        aria-label="Bill every fee"
                        checked={allBilled}
                        onCheckedChange={(v) => setExcluded(v === true ? {} : Object.fromEntries(rows.map((r) => [r.key, true])))}
                      />
                    )}
                  </th>
                  <th className="px-2 py-1.5 font-medium">Particulars</th>
                  <th className="px-2 py-1.5 text-right font-medium">Fee</th>
                  {!issued && <th className="w-28 px-2 py-1.5 text-right font-medium">Less</th>}
                  <th className="px-2 py-1.5 text-right font-medium">{issued ? 'Balance' : 'To bill'}</th>
                  {issued && <th className="w-28 px-2 py-1.5 text-right font-medium">Pay now</th>}
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody>
                {groups.map(({ bill, rows: lines }) => (
                  <React.Fragment key={bill?.number ?? 'sheet'}>
                    {bill && (
                      <tr className="border-b border-border bg-muted/30">
                        <td colSpan={6} className="px-3 py-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
                              <span className="font-semibold text-foreground">Bill {bill.number}</span>
                              <span className="text-muted-foreground">
                                {BILL_KIND_LABEL[bill.kind] ?? 'Bill'}
                                {bill.issued_at ? ` · ${formatDate(bill.issued_at)}` : ''}
                              </span>
                              <span className="tabular-nums text-muted-foreground">
                                {formatMoney(bill.amount, currency)}
                                {bill.balance > 0 && bill.amount_paid > 0 ? ` · ${formatMoney(bill.balance, currency)} left` : ''}
                              </span>
                              {bill.is_overdue && bill.balance > 0 ? (
                                <span className="font-medium text-danger">Overdue</span>
                              ) : bill.balance <= 0 ? (
                                <span className="font-medium text-success">Paid</span>
                              ) : null}
                            </div>
                            <div className="flex items-center">
                              {bill.balance > 0 && (
                                <Button size="xs" variant="ghost" onClick={() => payThisBill(bill.number)}>
                                  <HandCoins />
                                  Pay this bill
                                </Button>
                              )}
                              <Button size="xs" variant="ghost" onClick={() => setPaper({ kind: 'bill', number: bill.number })}>
                                <Printer />
                                Print
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {lines.map((r) => {
                      const open = r.balance > 0
                      const checked = !!ticked[r.key] && open
                      const leftOff = !issued && !!excluded[r.key]
                      const status = leftOff ? (
                        <span className="text-muted-foreground">Not billed</span>
                      ) : r.pending ? (
                        <span className="text-muted-foreground">To be added</span>
                      ) : r.isOverdue && open ? (
                        <span className="font-medium text-danger">Overdue {r.daysOverdue}d</span>
                      ) : issued ? (
                        <Badge tone={INSTALMENT_STATUS_TONE[r.status] ?? 'neutral'} size="sm">
                          {INSTALMENT_STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      ) : null
                      return (
                        <tr
                          key={r.key}
                          className={cn(
                            'border-b border-border',
                            checked && 'bg-primary/[0.04]',
                            !open && issued && 'text-muted-foreground',
                            leftOff && 'text-muted-foreground opacity-60',
                          )}
                        >
                          <td className="px-3 py-1.5">
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
                          <td className="px-2 py-1.5">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-xs tabular-nums text-muted-foreground">{position.get(r.key)}.</span>
                              <span className={cn('font-medium', open || !issued ? 'text-foreground' : undefined)}>{r.label}</span>
                              {r.isExtra && <span className="text-[11px] text-info">Extra</span>}
                              <span className="text-[11px]">{status}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {[
                                r.dueDate ? `Due ${formatDate(r.dueDate)}` : null,
                                issued && r.concession > 0 ? `Less ${formatMoney(r.concession, currency)}` : null,
                                issued && r.paid > 0 ? `Paid ${formatMoney(r.paid, currency)}` : null,
                                !r.pending ? r.detail : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </td>
                          <td className={num}>{formatMoney(r.fee, currency)}</td>
                          {!issued && (
                          <td className="px-2 py-1 text-right">
                            {!r.pending ? (
                              <Input
                                aria-label={`Concession on ${r.label}`}
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.01"
                                placeholder="0"
                                disabled={leftOff}
                                className={cn(COMPACT_INPUT, 'text-right tabular-nums')}
                                value={concessions[r.key] ?? ''}
                                onChange={(e) => setConcessions((c) => ({ ...c, [r.key]: e.target.value }))}
                              />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          )}
                          <td className={cn(num, 'font-semibold')}>{r.balance > 0 ? formatMoney(r.balance, currency) : 'Nil'}</td>
                          {issued && (
                            <td className="px-2 py-1 text-right">
                              {open && (
                                <Input
                                  aria-label={`Amount paid now for ${r.label}`}
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="0.01"
                                  disabled={!checked}
                                  className={cn(COMPACT_INPUT, 'text-right font-medium tabular-nums')}
                                  value={payNow[r.key] ?? ''}
                                  onChange={(e) => setPayNow((p) => ({ ...p, [r.key]: e.target.value }))}
                                />
                              )}
                            </td>
                          )}
                          <td className="pr-1 text-right">
                            {r.isExtra && r.paid <= 0 && (
                              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${r.label}`} onClick={() => dropExtra(r)}>
                                <X />
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-b border-border bg-muted/30 font-semibold">
                  <td colSpan={2} className="px-3 py-1.5 text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                    Total
                  </td>
                  <td className={num}>{formatMoney(totalFee, currency)}</td>
                  {!issued && <td className={num}>{totalConcession > 0 ? `−${formatMoney(totalConcession, currency)}` : '—'}</td>}
                  <td className={num}>{formatMoney(totalBalance, currency)}</td>
                  {issued && <td className={cn(num, 'text-primary')}>{formatMoney(payingNow, currency)}</td>}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Extra items: books, uniform, anything not in the fee structure. */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Other item</span>
            <Input
              placeholder="Books, uniform, trip…"
              aria-label="Other item name"
              value={extraName}
              onChange={(e) => setExtraName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addExtra()}
              className={cn(COMPACT_INPUT, 'min-w-[10rem] flex-1')}
            />
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="Amount"
              aria-label="Other item amount"
              value={extraAmount}
              onChange={(e) => setExtraAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addExtra()}
              className={cn(COMPACT_INPUT, 'w-28 text-right tabular-nums')}
            />
            <Button variant="outline" size="sm" icon={<Plus />} onClick={addExtra} loading={addExtras.isPending}>
              {issued ? 'Add as new bill' : 'Add'}
            </Button>
          </div>
          {sheetError && (
            <div className="px-3 pt-2">
              <FormError message={sheetError} />
            </div>
          )}

          {issued && studentId != null && <LeftOffSection bill={issued} studentId={studentId} />}
        </>
      )}

      {/* receipts */}
      {issued && (
        <div className="mt-4">
          <SectionBar title={`Receipts · ${history.length}`} />
          {history.length === 0 ? (
            <p className="border-b border-border px-3 py-3 text-sm text-muted-foreground">No payments yet this session</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {history.map((p) => (
                  <tr key={p.index} className="border-b border-border hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-medium">{p.receipt_number ?? '—'}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{formatDate(p.paid_at)}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{PAYMENT_METHOD_LABEL[p.method as PaymentMethod] ?? p.method ?? 'Payment'}</td>
                    <td className="hidden max-w-[14rem] truncate px-2 py-1.5 text-muted-foreground sm:table-cell">{p.reference ?? ''}</td>
                    <td className={cn(num, 'font-semibold')}>{formatMoney(p.amount ?? 0, currency)}</td>
                    <td className="w-10 pr-1 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Reprint receipt"
                        onClick={() => setPaper({ kind: 'receipt', invoiceId: issued.id, index: p.index, fresh: false })}
                      >
                        <Printer />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )

  // ------------------------------------------------------------ checkout
  const checkout = student && !loadingDues && (
    <div className="space-y-4 py-4 lg:pl-5">
      {issued && payable.length > 0 ? (
        <>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Paying now</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">{formatMoney(payingNow, currency)}</p>
            <p className="text-xs text-muted-foreground">
              {tickedRows.length ? `${countLabel(tickedRows.length, 'fee')}: ${tickedRows.map((r) => r.label).join(', ')}` : 'Tick the fees being paid'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Currency</Label>
              <Segmented
                size="sm"
                layoutId="fee-counter-currency"
                aria-label="Currency"
                value={payCurrency}
                onChange={setPayCurrency}
                options={PAY_CURRENCIES.map((c) => ({ value: c.value, label: c.label }))}
              />
            </div>
            <div>
              <Label>Receipt date</Label>
              <DatePicker id="fc-date" value={receiptDate} onChange={setReceiptDate} maxToday className="h-8 px-2.5 text-sm" />
            </div>
          </div>
          {foreign && (
            <p className="-mt-2 text-xs text-muted-foreground">
              {quote.data
                ? `${rateName(quote.data.rate_status)}: ${formatMoney(1, quote.data.currency)} = ${formatMoney(1 / quote.data.exchange_rate, currency)}`
                : 'Getting the rate…'}
            </p>
          )}

          <div>
            <Label>Mode</Label>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Payment mode">
              {COUNTER_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={method === m.value}
                  onClick={() => setMethod(m.value)}
                  className={cn(
                    'flex h-8 items-center justify-center gap-1.5 rounded-md border text-xs transition-colors [&_svg]:size-3.5',
                    method === m.value
                      ? 'border-primary bg-primary/5 font-medium text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {m.icon}
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {method === 'CHEQUE' ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2">
                <Label>Cheque number *</Label>
                <Input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} className={COMPACT_INPUT} />
              </label>
              <label>
                <Label>Bank</Label>
                <Input value={bank} onChange={(e) => setBank(e.target.value)} className={COMPACT_INPUT} />
              </label>
              <div>
                <Label>Cheque date</Label>
                <DatePicker id="fc-cheque-date" value={chequeDate} onChange={setChequeDate} className="h-8 px-2.5 text-sm" />
              </div>
            </div>
          ) : method === 'RAZORPAY' ? (
            <p className={cn('border-l-2 px-3 py-2 text-xs', razorpayReady ? 'border-primary bg-primary/[0.04] text-muted-foreground' : 'border-warning bg-warning/5 text-foreground')}>
              {razorpayReady
                ? 'The Razorpay window opens here; the parent pays by UPI, card or net banking. The receipt opens once Razorpay confirms.'
                : "Razorpay is not connected yet. Add the school's Razorpay keys on the server, then this option takes payments."}
              {razorpayReady && foreign && (
                <span className="mt-1 block text-warning">In AED, Razorpay takes international cards only, once Razorpay has switched them on for the school.</span>
              )}
            </p>
          ) : method !== 'CASH' ? (
            <label className="block">
              <Label>{method === 'UPI' ? 'UPI transaction ID' : method === 'CARD' ? 'Card slip / approval no' : 'Transfer reference (UTR)'}</Label>
              <Input value={txnRef} onChange={(e) => setTxnRef(e.target.value)} className={COMPACT_INPUT} />
            </label>
          ) : null}

          <label className="block">
            <Label>Remarks</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className={COMPACT_INPUT} />
          </label>

          <div className="divide-y divide-border border-y border-border">
            <SumLine label="Total fee" value={formatMoney(totalFee, currency)} />
            {totalConcession > 0 && <SumLine label="Concession" value={`−${formatMoney(totalConcession, currency)}`} />}
            {(issued.late_fee_total ?? 0) > 0 && <SumLine label="Late fee" value={formatMoney(issued.late_fee_total, currency)} />}
            <SumLine label="Paid earlier" value={formatMoney(totalPaid, currency)} tone="success" />
            <SumLine
              label="Balance after this"
              value={totalBalance - payingNow > 0.009 ? formatMoney(totalBalance - payingNow, currency) : 'Nil'}
              tone={totalBalance - payingNow > 0.009 ? 'warning' : 'success'}
            />
            {payingNow > 0 &&
              (quote.data ? (
                <>
                  <SumLine label={foreign ? `Fees in ${quote.data.currency}` : 'Fees'} value={formatMoney(quote.data.fee_amount, quote.data.currency)} />
                  {quote.data.tax_amount > 0 && (
                    <SumLine label={`${quote.data.tax_label ?? 'Tax'} ${quote.data.tax_percent}%`} value={formatMoney(quote.data.tax_amount, quote.data.currency)} />
                  )}
                  {(quote.data.gateway_fee ?? 0) > 0 && (
                    <SumLine label={quote.data.gateway_fee_label ?? 'Online payment fee'} value={formatMoney(quote.data.gateway_fee ?? 0, quote.data.currency)} />
                  )}
                  <SumLine label={`To collect · ${quote.data.currency}`} value={formatMoney(quote.data.total, quote.data.currency)} strong tone="primary" />
                </>
              ) : (
                <div className="py-2">
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
          </div>

          <FormError message={error} />
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={printAfter} onCheckedChange={(v) => setPrintAfter(v === true)} />
            Print the receipt straight away
          </label>
          <Button
            size="lg"
            className="w-full"
            onClick={submit}
            loading={busy}
            disabled={!(payingNow > 0) || (method === 'RAZORPAY' && !razorpayReady) || !quote.data}
          >
            {method === 'RAZORPAY' ? <Wallet /> : <HandCoins />}
            {method === 'RAZORPAY' ? 'Pay with Razorpay' : 'Collect'} {payingNow > 0 ? collectLabel : ''}
          </Button>
        </>
      ) : !issued && !nothingToBill ? (
        <>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Issue bill</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">{formatMoney(totalBalance, currency)}</p>
            <p className="text-xs text-muted-foreground">
              {countLabel(billing.length, 'line')}
              {rows.length > billing.length ? ` · ${rows.length - billing.length} left off for later` : ''}
            </p>
          </div>
          <div className="divide-y divide-border border-y border-border">
            <SumLine label="Fees" value={formatMoney(totalFee, currency)} />
            <SumLine label="Concession" value={totalConcession > 0 ? `−${formatMoney(totalConcession, currency)}` : '—'} />
            <SumLine label="Bill total" value={formatMoney(totalBalance, currency)} strong />
          </div>
          <label className="block">
            <Label>Reason for the concession</Label>
            <Input
              placeholder={totalConcession > 0 ? 'Staff child, scholarship…' : 'Only when you give one'}
              value={concessionReason}
              onChange={(e) => setConcessionReason(e.target.value)}
              className={COMPACT_INPUT}
            />
          </label>
          {sheetError && <FormError message={sheetError} />}
          <Button size="lg" className="w-full" icon={<FileCheck2 />} onClick={issue} loading={issueBill.isPending} disabled={totalBalance <= 0}>
            Issue bill
          </Button>
          <p className="text-xs text-muted-foreground">Once issued, the student and parent see it on their Fees page and can pay online</p>
        </>
      ) : issued ? (
        <>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Account</p>
            <p className="text-2xl font-semibold text-success">Fully paid</p>
            <p className="text-xs text-muted-foreground">Nothing is left to pay this session</p>
          </div>
          <div className="divide-y divide-border border-y border-border">
            <SumLine label="Total fee" value={formatMoney(totalFee, currency)} />
            {totalConcession > 0 && <SumLine label="Concession" value={`−${formatMoney(totalConcession, currency)}`} />}
            <SumLine label="Paid" value={formatMoney(totalPaid, currency)} tone="success" />
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={nextStudent}>
            Next student
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Set a fee for this student first; the checkout opens once there is something to bill</p>
      )}
    </div>
  )

  // ------------------------------------------------------------ layout
  let work: React.ReactNode
  if (paper?.kind === 'receipt') {
    work = (
      <ReceiptPaper
        key={`${paper.invoiceId}-${paper.index}`}
        invoiceId={paper.invoiceId}
        index={paper.index}
        school={school}
        autoPrint={autoPrint}
        onAutoPrinted={clearAutoPrint}
        onBack={() => setPaper(null)}
        onNext={paper.fresh ? nextStudent : undefined}
      />
    )
  } else if (paperBill && issued) {
    work = (
      <PaperFrame
        title={`Bill ${paperBill.number}`}
        note="Print it, or save it as a PDF to send to the parent"
        onBack={() => setPaper(null)}
        actions={
          <Button size="sm" icon={<Printer />} onClick={printFeeReceipt}>
            Print bill
          </Button>
        }
      >
        <div className="border border-border">
          <FeeBillSheet invoice={issued} bill={paperBill} school={school} payer={payer} />
        </div>
        <FeeBillForPrint invoice={issued} bill={paperBill} school={school} payer={payer} />
      </PaperFrame>
    )
  } else if (!student) {
    work = (
      <div className="lg:h-full lg:overflow-y-auto lg:pr-1">
        <TodayPane
          onOpenReceipt={(invoiceId, index) => setPaper({ kind: 'receipt', invoiceId, index, fresh: false })}
          onPickStudent={(id) => setStudentId(id)}
        />
      </div>
    )
  } else {
    work = (
      <div className="flex flex-col lg:h-full lg:pl-6">
        {studentLine}
        <div className="grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_18.5rem] lg:divide-x lg:divide-border">
          <div className="min-w-0 pb-4 lg:min-h-0 lg:overflow-y-auto lg:pr-5">{sheet}</div>
          <aside className="border-t border-border lg:min-h-0 lg:overflow-y-auto lg:border-t-0" aria-label="Payment">
            {checkout}
          </aside>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title="Fee Collection"
        description="Find the student, issue the bill, take the money, print the receipt"
        icon={HandCoins}
        actions={
          <Select value={yearId ? String(yearId) : ''} onValueChange={(v) => setYearChoice(Number(v))}>
            <SelectTrigger className="h-8 w-40 text-sm" aria-label="Session">
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
        }
      />

      <div className="!mt-0">
      <Figures>
        <Figure
          label="Collected today"
          value={todayReport.data ? formatMoney(todayReport.data.summary.total, todayReport.data.summary.currency) : '—'}
          context={todayReport.data ? countLabel(todayReport.data.summary.count, 'receipt') : undefined}
          tone="success"
        />
        <Figure
          label={`Collected · ${yearName ?? 'session'}`}
          value={yearInvoices.data ? formatMoney(figures.collected, figures.cur) : '—'}
          context={yearInvoices.data ? `${countLabel(figures.billedCount, 'bill')} issued` : undefined}
          tone="primary"
        />
        <Figure
          label="Outstanding"
          value={yearInvoices.data ? formatMoney(figures.outstanding, figures.cur) : '—'}
          context={yearInvoices.data ? `${countLabel(figures.owingCount, 'student')}` : undefined}
          tone="warning"
        />
        <Figure
          label="Overdue"
          value={yearInvoices.data ? String(figures.overdue.length) : '—'}
          context="students past a due date"
          alert={figures.overdue.length > 0}
          tone="danger"
        />
        <Figure
          label="Not billed"
          value={yearInvoices.data ? String(figures.unbilled) : '—'}
          context="students with no bill yet"
          tone="neutral"
        />
      </Figures>
      <Band className="border-b border-border">
        <div className="grid lg:h-[calc(100vh-17.5rem)] lg:min-h-[28rem] lg:grid-cols-[17rem_minmax(0,1fr)] lg:divide-x lg:divide-border">
          <div className="-mx-4 border-b border-border sm:-mx-6 lg:mx-0 lg:-ml-8 lg:min-h-0 lg:border-b-0">
            {students.isPending ? (
              <div className="space-y-2 p-4 lg:pl-8">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <StudentList
                students={activeStudents}
                classOf={classOf}
                categoryName={categoryName}
                standing={standing}
                value={studentId}
                onChange={(id) => {
                  setPaper(null)
                  setStudentId(id)
                }}
              />
            )}
          </div>
          <section className="min-w-0 lg:min-h-0">{work}</section>
        </div>
      </Band>
      </div>
    </div>
  )
}

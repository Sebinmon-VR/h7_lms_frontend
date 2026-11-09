import { ArrowLeftRight, BarChart3, Download, HandCoins, History, Printer, Receipt, Send, Trash2, Users } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type {
  FeeCollectionRow,
  FeeReportView,
  FeeRollReport,
  FeeRollRow,
  FeeRollStatus,
  FeeTransactionRow,
  FeeTransactionStatus,
  FeeTransactionsReport,
  PaymentMethod,
} from '@/api/types'
import {
  useDeleteFeeReceipt,
  useFeeCollectionsReport,
  useFeeDuesReport,
  useFeeHeads,
  useFeeInvoice,
  useFeeReportExport,
  useFeeRollReport,
  useFeeTransactionsReport,
  usePaymentReceipt,
  useRecordFeeReceipt,
} from '@/queries/finance.queries'
import { useClasses, useUsers } from '@/queries/admin.queries'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime, formatTime, shiftApiDate, todayApiDate } from '@/lib/datetime'
import { formatMoney } from '@/lib/tuition'
import { tidyName } from '@/lib/names'
import { PAYMENT_METHOD_LABEL } from '@/lib/school'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  Dialog as InPage,
  DialogBody as InPageBody,
  DialogContent as InPageContent,
  DialogDescription as InPageDescription,
  DialogFooter as InPageFooter,
  DialogHeader as InPageHeader,
  DialogTitle as InPageTitle,
} from '@/components/layout/inline-panel'
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
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { FeeReceipt, FeeReceiptForPrint, printFeeReceipt } from '@/components/domain/fee-receipt'
import { resolvePeriod, useReportPeriod } from './tuition/period'

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

const REPORT_TABS: { value: FeeReportView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'students', label: 'Students', icon: Users },
  { value: 'dues', label: 'Dues', icon: BarChart3 },
  { value: 'collections', label: 'Collections', icon: Receipt },
  { value: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
]

type ReportPeriod = 'year' | 'month' | '30d' | '7d' | 'today' | 'custom'

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: 'year', label: 'This session year' },
  { value: 'month', label: 'This month' },
  { value: '30d', label: 'Last 30 days' },
  { value: '7d', label: 'Last 7 days' },
  { value: 'today', label: 'Today' },
  { value: 'custom', label: 'Custom dates' },
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
    <div className="min-w-0 border-l-2 border-border py-0.5 pl-3">
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
      className="h-8 px-2.5 text-xs"
      loading={exporter.isPending}
      onClick={() => exporter.mutate({ view, params })}
    >
      <Download />
      CSV
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

const byNumber = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
const NO_CLASS = 'No class'
const NO_CATEGORY = '__none__'

/** The status filter over the roll, in the order the office chases them. */
const ROLL_FILTERS: { value: string; label: string; count: (s: FeeRollReport['summary']) => number }[] = [
  { value: 'ALL', label: 'Everyone', count: (s) => s.students },
  { value: 'DUE', label: 'Owing', count: (s) => s.unpaid + s.partially_paid + s.overdue },
  { value: 'OVERDUE', label: 'Overdue', count: (s) => s.overdue },
  { value: 'PARTIALLY_PAID', label: 'Part paid', count: (s) => s.partially_paid },
  { value: 'ISSUED', label: 'Unpaid', count: (s) => s.unpaid },
  { value: 'PAID', label: 'Paid in full', count: (s) => s.paid },
  { value: 'NOT_BILLED', label: 'Not billed yet', count: (s) => s.not_billed },
]

function matchesStatus(row: FeeRollRow, status: string): boolean {
  if (status === 'ALL') return true
  if (status === 'DUE') return row.status === 'ISSUED' || row.status === 'PARTIALLY_PAID' || row.status === 'OVERDUE'
  return row.status === status
}

type RollSort = 'class' | 'due' | 'name'

/** What a student's line says on the right: what they owe, or that nothing is. */
function RollAmount({ row }: { row: FeeRollRow }) {
  const cur = row.currency
  if (row.invoice_id == null) return <span className="text-muted-foreground">Not billed</span>
  if (row.status === 'DRAFT') return <span className="text-muted-foreground">Not issued</span>
  if (row.amount_outstanding <= 0) return <span className="font-medium text-success">Paid</span>
  return (
    <span className={cn('font-medium tabular-nums', row.amount_overdue > 0 ? 'text-danger' : 'text-warning')}>
      {formatMoney(row.amount_outstanding, cur)}
    </span>
  )
}

/**
 * Where every student stands for the year, as list + detail: the students on
 * the left, class by class, with what each owes; the one picked on the right
 * as a fee statement - what was billed, the instalments, every payment with
 * its receipt.
 */
function StudentsSheet({
  data,
  status,
  onStatus,
}: {
  data: FeeRollReport
  status: string
  onStatus: (value: string) => void
}) {
  const [query, setQuery] = React.useState('')
  const [category, setCategory] = React.useState('ALL')
  const [sort, setSort] = React.useState<RollSort>('class')
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const s = data.summary
  const cur = data.currency

  const categories = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of data.rows) {
      const key = row.admission_category_name || NO_CATEGORY
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [data.rows])

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.rows
      .filter((row) => matchesStatus(row, status))
      .filter((row) => category === 'ALL' || (row.admission_category_name || NO_CATEGORY) === category)
      .filter(
        (row) =>
          !q ||
          [row.full_name, row.admission_number, row.invoice_number, row.roll_number]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
      )
      .sort((a, b) =>
        sort === 'due'
          ? b.amount_due - a.amount_due || byNumber(a.full_name ?? '', b.full_name ?? '')
          : byNumber(a.full_name ?? '', b.full_name ?? ''),
      )
  }, [data.rows, status, category, query, sort])

  const groups = React.useMemo(() => {
    if (sort !== 'class') return [{ name: null as string | null, rows }]
    const map = new Map<string, FeeRollRow[]>()
    for (const row of rows) {
      const key = row.class_name || NO_CLASS
      map.set(key, [...(map.get(key) ?? []), row])
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === NO_CLASS ? 1 : b === NO_CLASS ? -1 : byNumber(a, b)))
      .map(([name, list]) => ({ name: name as string | null, rows: list }))
  }, [rows, sort])

  const ordered = groups.flatMap((g) => g.rows)
  const selected = ordered.find((r) => r.student_id === selectedId) ?? ordered[0] ?? null
  const owed = (list: FeeRollRow[]) => list.reduce((n, r) => n + (r.invoice_id ? Math.max(0, r.amount_outstanding) : 0), 0)
  const shownDue = owed(rows)
  const filtered = status !== 'ALL' || category !== 'ALL' || query.trim() !== ''

  // Up and down walk the list, as at the fee counter.
  const move = (step: number) => {
    if (!selected) return
    const at = ordered.findIndex((r) => r.student_id === selected.student_id)
    const next = ordered[at + step]
    if (next) {
      setSelectedId(next.student_id)
      document.getElementById(`roll-${next.student_id}`)?.scrollIntoView({ block: 'nearest' })
    }
  }

  const list = (
    <ListPane
      toolbar={
        <>
          <ListSearch value={query} onChange={setQuery} placeholder="Name, adm. no or bill no" />
          <div className="flex gap-2">
            <Select value={status} onValueChange={onStatus}>
              <SelectTrigger className={cn('h-8 flex-1 px-2.5 text-xs', status !== 'ALL' && 'border-primary/50 text-primary')} aria-label="Show">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLL_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label} · {f.count(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as RollSort)}>
              <SelectTrigger className="h-8 w-28 px-2.5 text-xs" aria-label="Order">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="class">By class</SelectItem>
                <SelectItem value="due">Most due</SelectItem>
                <SelectItem value="name">Name A–Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {categories.length > 1 && (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className={cn('h-8 w-full px-2.5 text-xs', category !== 'ALL' && 'border-primary/50 text-primary')} aria-label="Admission type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Every admission type</SelectItem>
                {categories.map(([key, n]) => (
                  <SelectItem key={key} value={key}>
                    {key === NO_CATEGORY ? 'No admission type' : tidyName(key)} · {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </>
      }
      footer={
        <span className="flex items-center justify-between gap-2">
          <span>
            {rows.length} student{rows.length === 1 ? '' : 's'}
            {shownDue > 0 && <span className="font-medium text-warning"> · {formatMoney(shownDue, cur)} due</span>}
          </span>
          {filtered && (
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => {
                setQuery('')
                setCategory('ALL')
                onStatus('ALL')
              }}
            >
              Clear
            </button>
          )}
        </span>
      }
    >
      {rows.length === 0 ? (
        <ListEmpty>
          {data.rows.length === 0
            ? 'No student is in this year yet. They appear once assigned to the session year under Admissions'
            : 'Nobody matches'}
        </ListEmpty>
      ) : (
        <div
          tabIndex={-1}
          className="outline-none"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              move(1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              move(-1)
            }
          }}
        >
          {groups.map((group) => (
            <div key={group.name ?? 'all'}>
              {group.name != null && (
                <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-border bg-muted/80 px-4 py-1 text-[11px] backdrop-blur">
                  <span className="min-w-0 flex-1 truncate font-semibold uppercase tracking-wide text-muted-foreground">
                    {tidyName(group.name)} · {group.rows.length}
                  </span>
                  {owed(group.rows) > 0 && (
                    <span className="tabular-nums text-muted-foreground">{formatMoney(owed(group.rows), cur)}</span>
                  )}
                </div>
              )}
              {group.rows.map((row) => (
                <div key={row.student_id} id={`roll-${row.student_id}`}>
                  <ListItem
                    active={selected?.student_id === row.student_id}
                    onClick={() => setSelectedId(row.student_id)}
                    title={tidyName(row.full_name ?? `Student ${row.student_id}`)}
                    sub={[
                      row.admission_number,
                      sort !== 'class' && row.class_name ? tidyName(row.class_name) : null,
                      row.next_due?.is_overdue ? `${row.next_due.days_overdue}d late` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    right={<RollAmount row={row} />}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </ListPane>
  )

  return (
    <SplitView
      list={list}
      detail={
        <>
          <YearLine data={data} />
          {selected ? (
            <StudentStatement key={selected.student_id} row={selected} currency={cur} yearName={data.academic_year_name ?? null} />
          ) : (
            <p className="px-5 py-16 text-center text-sm text-muted-foreground">Pick a student on the left to see their fees</p>
          )}
        </>
      }
    />
  )
}

/** The year at a glance, one thin line over the statement. */
function YearLine({ data }: { data: FeeRollReport }) {
  const s = data.summary
  const cur = data.currency
  const pct = s.total_billed > 0 ? Math.round((s.total_collected / s.total_billed) * 100) : null
  const item = (label: string, value: React.ReactNode, tone?: string) => (
    <span className="whitespace-nowrap">
      <span className="text-muted-foreground">{label} </span>
      <span className={cn('font-medium tabular-nums text-foreground', tone)}>{value}</span>
    </span>
  )
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted/40 px-5 py-1.5 text-[11px]">
      <span className="font-semibold uppercase tracking-wider text-muted-foreground">
        {data.academic_year_name ?? 'This year'}
      </span>
      {item('Billed', formatMoney(s.total_billed, cur))}
      {item('Collected', `${formatMoney(s.total_collected, cur)}${pct != null ? ` · ${pct}%` : ''}`, 'text-success')}
      {item('Outstanding', formatMoney(s.total_outstanding, cur), s.total_outstanding > 0 ? 'text-warning' : undefined)}
      {s.total_overdue > 0 && item('Overdue', formatMoney(s.total_overdue, cur), 'text-danger')}
      {s.expected_unbilled > 0 && item('Not yet billed', formatMoney(s.expected_unbilled, cur))}
    </div>
  )
}

/** One student's fees for the year: the figures, what was billed, the instalments, the payments. */
function StudentStatement({ row, currency, yearName }: { row: FeeRollRow; currency: string; yearName: string | null }) {
  const billed = row.invoice_id != null
  const invoice = useFeeInvoice(row.invoice_id ?? null)
  const [receipt, setReceipt] = React.useState<ReceiptView | null>(null)
  const cur = row.currency || currency
  const money = (n: number) => formatMoney(n, cur)
  const bill = invoice.data
  const payments = (bill?.payments ?? []).map((p, index) => ({ p, index })).reverse()
  const name = tidyName(row.full_name ?? `Student ${row.student_id}`)

  return (
    <div>
      <DetailHeader
        title={name}
        badges={
          <Badge tone={STATUS_TONE[row.status] ?? 'neutral'} size="sm">
            {STATUS_LABEL[row.status] ?? row.status}
          </Badge>
        }
        sub={[
          row.admission_number,
          row.class_name ? tidyName(row.class_name) : null,
          row.admission_category_name,
          row.roll_number ? `Roll ${row.roll_number}` : null,
          yearName,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <Button size="sm" asChild>
            <Link to={`/admin/fee-collection?student=${row.student_id}`}>
              {billed ? <HandCoins /> : <Send />}
              {!billed ? 'Bill at counter' : row.amount_outstanding > 0 ? 'Collect' : 'Open at counter'}
            </Link>
          </Button>
        }
      />

      <Facts className="sm:grid-cols-4">
        <Fact label={billed ? 'Billed' : 'Expected'}>
          <span className={cn('text-base font-medium tabular-nums', !billed && 'text-muted-foreground')}>
            {billed ? money(row.total_amount) : row.expected_total ? money(row.expected_total) : '—'}
          </span>
        </Fact>
        <Fact label="Paid">
          <span className="text-base font-medium tabular-nums text-success">{row.amount_paid > 0 ? money(row.amount_paid) : '—'}</span>
        </Fact>
        <Fact label="Balance">
          <span
            className={cn(
              'text-base font-medium tabular-nums',
              !billed ? 'text-muted-foreground' : row.amount_overdue > 0 ? 'text-danger' : row.amount_outstanding > 0 ? 'text-warning' : 'text-success',
            )}
          >
            {!billed ? 'Not billed' : row.amount_outstanding > 0 ? money(row.amount_outstanding) : 'Nil'}
          </span>
          {row.amount_overdue > 0 && row.amount_overdue < row.amount_outstanding && (
            <span className="block text-2xs text-danger">{money(row.amount_overdue)} overdue</span>
          )}
        </Fact>
        <Fact label="Next due">
          {row.next_due ? (
            <>
              {row.next_due.label}
              <span className={cn('block text-2xs', row.next_due.is_overdue ? 'text-danger' : 'text-muted-foreground')}>
                {[
                  row.next_due.due_date ? formatDate(row.next_due.due_date) : null,
                  money(row.next_due.amount),
                  row.next_due.is_overdue ? `${row.next_due.days_overdue} days late` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Fact>
      </Facts>

      {!billed ? (
        <p className="border-b border-border px-5 py-6 text-sm text-muted-foreground">
          No bill for this year yet.
          {row.expected_total ? ` The fee rules would bill ${money(row.expected_total)}.` : ' No fee rule matches this student yet.'}{' '}
          Bill them from the fee counter.
        </p>
      ) : (
        <>
          <DetailSection title={`Instalments · ${row.instalments.length}`}>
            {row.instalments.length === 0 ? (
              <p className="border-b border-border px-5 py-4 text-sm text-muted-foreground">No instalments on this bill</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className={DETAIL_TH}>
                      <th className="py-1.5 pl-5 pr-3 font-medium">Instalment</th>
                      <th className="px-3 py-1.5 font-medium">Due on</th>
                      <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                      <th className="px-3 py-1.5 text-right font-medium">Paid</th>
                      <th className="px-3 py-1.5 text-right font-medium">Balance</th>
                      <th className="py-1.5 pl-3 pr-5 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {row.instalments.map((inst, i) => (
                      <tr key={`${inst.label}-${i}`} className="border-b border-border">
                        <td className="py-1.5 pl-5 pr-3 font-medium">{inst.label}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{inst.due_date ? formatDate(inst.due_date) : '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{money(inst.amount)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{inst.amount_paid > 0 ? money(inst.amount_paid) : '—'}</td>
                        <td className={cn('px-3 py-1.5 text-right font-medium tabular-nums', inst.is_overdue && inst.outstanding > 0 ? 'text-danger' : undefined)}>
                          {inst.outstanding > 0 ? money(inst.outstanding) : 'Nil'}
                        </td>
                        <td className="py-1.5 pl-3 pr-5 text-xs">
                          {inst.outstanding <= 0 ? (
                            <span className="text-success">Paid</span>
                          ) : inst.is_overdue ? (
                            <span className="font-medium text-danger">{inst.days_overdue}d late</span>
                          ) : inst.amount_paid > 0 ? (
                            <span className="text-warning">Part paid</span>
                          ) : (
                            <span className="text-muted-foreground">Not due</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DetailSection>

          <DetailSection title={`Fees on the bill${row.invoice_number ? ` · ${row.invoice_number}` : ''}`}>
            {invoice.isPending ? (
              <div className="space-y-1.5 px-5 py-3">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-2/3" />
              </div>
            ) : !bill || bill.line_items.length === 0 ? (
              <p className="border-b border-border px-5 py-4 text-sm text-muted-foreground">No fee lines</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className={DETAIL_TH}>
                      <th className="py-1.5 pl-5 pr-3 font-medium">Fee</th>
                      {bill.tax_total > 0 && <th className="px-3 py-1.5 text-right font-medium">{bill.tax_label || 'Tax'}</th>}
                      <th className="py-1.5 pl-3 pr-5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bill.line_items.map((line, i) => (
                      <tr key={`${line.fee_head_id}-${i}`} className="border-b border-border">
                        <td className="py-1.5 pl-5 pr-3">{line.name}</td>
                        {bill.tax_total > 0 && (
                          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                            {line.tax_amount > 0 ? money(line.tax_amount) : '—'}
                          </td>
                        )}
                        <td className="py-1.5 pl-3 pr-5 text-right tabular-nums">{money(line.net_amount)}</td>
                      </tr>
                    ))}
                    {bill.late_fee_total > 0 && (
                      <tr className="border-b border-border text-muted-foreground">
                        <td className="py-1.5 pl-5 pr-3">Late fees</td>
                        {bill.tax_total > 0 && <td />}
                        <td className="py-1.5 pl-3 pr-5 text-right tabular-nums">{money(bill.late_fee_total)}</td>
                      </tr>
                    )}
                    <tr className="border-b border-border bg-muted/30 font-medium">
                      <td className="py-1.5 pl-5 pr-3">Total</td>
                      {bill.tax_total > 0 && <td />}
                      <td className="py-1.5 pl-3 pr-5 text-right tabular-nums">{money(bill.total_amount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {bill && (bill.left_off ?? []).length > 0 && (
              <p className="border-b border-border bg-warning/5 px-5 py-1.5 text-xs">
                <span className="font-medium">Not billed yet:</span> {(bill.left_off ?? []).join(', ')}
              </p>
            )}
          </DetailSection>

          <DetailSection title={`Payments · ${payments.length}`}>
            {invoice.isPending ? (
              <div className="px-5 py-3">
                <Skeleton className="h-5 w-full" />
              </div>
            ) : payments.length === 0 ? (
              <p className="border-b border-border px-5 py-4 text-sm text-muted-foreground">Nothing paid yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className={DETAIL_TH}>
                      <th className="py-1.5 pl-5 pr-3 font-medium">Date</th>
                      <th className="px-3 py-1.5 font-medium">Receipt</th>
                      <th className="px-3 py-1.5 font-medium">For</th>
                      <th className="px-3 py-1.5 font-medium">Mode · reference</th>
                      <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                      <th className="py-1.5 pl-1 pr-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(({ p, index }) => (
                      <tr key={index} className="border-b border-border">
                        <td className="whitespace-nowrap py-1.5 pl-5 pr-3 text-muted-foreground">{p.paid_at ? formatDate(p.paid_at) : '—'}</td>
                        <td className="px-3 py-1.5 font-medium">{p.receipt_number ?? '—'}</td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{p.instalment_label ?? '—'}</td>
                        <td className="max-w-[14rem] truncate px-3 py-1.5 text-xs text-muted-foreground">
                          {[PAYMENT_METHOD_LABEL[p.method as PaymentMethod] ?? p.method, p.reference].filter(Boolean).join(' · ')}
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium tabular-nums text-success">{money(p.amount ?? 0)}</td>
                        <td className="py-1 pl-1 pr-4 text-right">
                          {p.receipt_number && row.invoice_id && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Receipt ${p.receipt_number}`}
                              title={`Receipt ${p.receipt_number}`}
                              onClick={() => setReceipt({ invoiceId: row.invoice_id as string, index })}
                            >
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
          </DetailSection>
        </>
      )}
      <ReceiptViewer view={receipt} onClose={() => setReceipt(null)} />
    </div>
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
          <TableHead>Bill</TableHead>
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
              ) : row.bill_numbers?.length ? (
                row.bill_numbers.join(', ')
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

// ------------------------------------------------------------ transactions

const TRANSACTION_STATUS: Record<
  FeeTransactionStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  RECEIVED: { label: 'Received', tone: 'success' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  FAILED: { label: 'Failed', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  ABANDONED: { label: 'Abandoned', tone: 'neutral' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
}

type ReceiptView = { invoiceId: string; index: number }

/** How Razorpay says an online payment was made. */
const PAID_BY_LABEL: Record<string, string> = {
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Net banking',
  wallet: 'Wallet',
  emi: 'EMI',
  paylater: 'Pay later',
}

function howPaid(row: FeeTransactionRow): string {
  if (row.channel === 'ONLINE') {
    const via = row.provider === 'razorpay' || !row.provider ? 'Razorpay' : row.provider
    return row.paid_by ? `${via} · ${PAID_BY_LABEL[row.paid_by] ?? row.paid_by}` : via
  }
  return PAYMENT_METHOD_LABEL[row.method as PaymentMethod] ?? row.method
}

/** The status filter over the transactions. Abandoned attempts sit with the cancelled ones. */
const TX_FILTERS: { value: string; label: string; statuses: FeeTransactionStatus[] | null }[] = [
  { value: 'ALL', label: 'All', statuses: null },
  { value: 'RECEIVED', label: 'Received', statuses: ['RECEIVED'] },
  { value: 'IN_PROGRESS', label: 'In progress', statuses: ['IN_PROGRESS'] },
  { value: 'FAILED', label: 'Failed', statuses: ['FAILED'] },
  { value: 'CANCELLED', label: 'Cancelled', statuses: ['CANCELLED', 'ABANDONED'] },
  { value: 'REFUNDED', label: 'Refunded', statuses: ['REFUNDED'] },
]

/** Money in several currencies, never added together: "₹12,000 · AED 300". */
function sumByCurrency(rows: FeeTransactionRow[]): string {
  const totals = new Map<string, number>()
  for (const row of rows) {
    if (row.status !== 'RECEIVED') continue
    const cur = row.paid_currency || row.currency
    totals.set(cur, (totals.get(cur) ?? 0) + row.paid_amount)
  }
  return [...totals.entries()].map(([cur, n]) => formatMoney(n, cur)).join(' · ')
}

function dayLabel(day: string): string {
  const today = todayApiDate()
  if (day === today) return 'Today'
  if (day === shiftApiDate(today, -1)) return 'Yesterday'
  const d = new Date(`${day}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? formatDate(day)
    : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: day.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' })
}

/**
 * Every transaction in the period as list + detail: the payments on the
 * left, day by day with what came in each day; the one picked on the right in
 * full - who and what for, how it was paid, the fees and what was paid on top,
 * what Razorpay kept and what reaches the bank - with its receipt.
 */
function TransactionsSplit({ data }: { data: FeeTransactionsReport }) {
  const [query, setQuery] = React.useState('')
  const [status, setStatus] = React.useState('ALL')
  const [selectedKey, setSelectedKey] = React.useState<number | null>(null)

  const all = React.useMemo(
    () => data.rows.map((row, key) => ({ row, key })).sort((a, b) => String(b.row.paid_at).localeCompare(String(a.row.paid_at))),
    [data.rows],
  )
  const countOf = (f: (typeof TX_FILTERS)[number]) =>
    f.statuses ? all.filter(({ row }) => f.statuses!.includes(row.status)).length : all.length

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const statuses = TX_FILTERS.find((f) => f.value === status)?.statuses ?? null
    return all
      .filter(({ row }) => !statuses || statuses.includes(row.status))
      .filter(
        ({ row }) =>
          !q ||
          [row.student_name, row.admission_number, row.receipt_number, row.reference, row.order_id, row.invoice_number, ...(row.bill_numbers ?? [])]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
      )
  }, [all, status, query])

  const days = React.useMemo(() => {
    const map = new Map<string, typeof shown>()
    for (const item of shown) {
      const day = item.row.paid_on || String(item.row.paid_at).slice(0, 10)
      map.set(day, [...(map.get(day) ?? []), item])
    }
    return [...map.entries()]
  }, [shown])

  const selected = shown.find((i) => i.key === selectedKey) ?? shown[0] ?? null
  const filtered = status !== 'ALL' || query.trim() !== ''
  const receivedShown = shown.filter(({ row }) => row.status === 'RECEIVED').length
  const shownTotal = sumByCurrency(shown.map((i) => i.row))

  const move = (step: number) => {
    if (!selected) return
    const at = shown.findIndex((i) => i.key === selected.key)
    const next = shown[at + step]
    if (next) {
      setSelectedKey(next.key)
      document.getElementById(`tx-${next.key}`)?.scrollIntoView({ block: 'nearest' })
    }
  }

  const list = (
    <ListPane
      toolbar={
        <>
          <ListSearch value={query} onChange={setQuery} placeholder="Student, receipt or reference" />
          <div className="flex gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className={cn('h-8 flex-1 px-2.5 text-xs', status !== 'ALL' && 'border-primary/50 text-primary')} aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TX_FILTERS.filter((f) => f.value !== 'REFUNDED' || countOf(f) > 0).map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label} · {countOf(f)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      }
      footer={
        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate">
            {shown.length} shown
            {receivedShown > 0 && (
              <span className="font-medium text-success">
                {' '}
                · {receivedShown} received {shownTotal}
              </span>
            )}
          </span>
          {filtered && (
            <button
              type="button"
              className="shrink-0 font-medium text-primary hover:underline"
              onClick={() => {
                setQuery('')
                setStatus('ALL')
              }}
            >
              Clear
            </button>
          )}
        </span>
      }
    >
      {shown.length === 0 ? (
        <ListEmpty>{all.length === 0 ? 'No transactions in this period' : 'Nothing matches'}</ListEmpty>
      ) : (
        <div
          tabIndex={-1}
          className="outline-none"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              move(1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              move(-1)
            }
          }}
        >
          {days.map(([day, items]) => {
            const total = sumByCurrency(items.map((i) => i.row))
            return (
              <div key={day}>
                <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-border bg-muted/80 px-4 py-1 text-[11px] backdrop-blur">
                  <span className="min-w-0 flex-1 truncate font-semibold uppercase tracking-wide text-muted-foreground">
                    {dayLabel(day)} · {items.length}
                  </span>
                  {total && <span className="font-medium tabular-nums text-success">{total}</span>}
                </div>
                {items.map(({ row, key }) => {
                  const received = row.status === 'RECEIVED'
                  const st = TRANSACTION_STATUS[row.status]
                  const cur = row.paid_currency || row.currency
                  return (
                    <div key={key} id={`tx-${key}`}>
                      <ListItem
                        active={selected?.key === key}
                        onClick={() => setSelectedKey(key)}
                        muted={!received}
                        title={tidyName(row.student_name ?? `Student ${row.student_id}`)}
                        sub={[row.channel === 'PAST' ? null : formatTime(row.paid_at), row.channel === 'PAST' ? 'Before this system' : howPaid(row)]
                          .filter(Boolean)
                          .join(' · ')}
                        right={
                          <>
                            <span className={cn('block tabular-nums', received ? 'font-medium text-success' : 'text-muted-foreground line-through decoration-muted-foreground/40')}>
                              {formatMoney(row.paid_amount, cur)}
                            </span>
                            {!received && (
                              <span className={cn('block text-[10px]', st.tone === 'danger' ? 'text-danger' : st.tone === 'warning' ? 'text-warning' : 'text-muted-foreground')}>
                                {st.label}
                              </span>
                            )}
                          </>
                        }
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </ListPane>
  )

  return (
    <div className="flex flex-col lg:h-full">
      <TxFigures data={data} />
      <div className="min-w-0 lg:min-h-0 lg:flex-1">
        <SplitView
          list={list}
          detail={
            selected ? (
              <TransactionDetail key={selected.key} row={selected.row} />
            ) : (
              <p className="px-5 py-16 text-center text-sm text-muted-foreground">Pick a transaction on the left to see it in full</p>
            )
          }
        />
      </div>
    </div>
  )
}

/** The period's money: what came in, what reaches the bank, and how it was paid. */
function TxFigures({ data }: { data: FeeTransactionsReport }) {
  const totals = data.summary.by_currency
  if (totals.length === 0) {
    return <div className="border-b border-border px-4 py-3 text-sm text-muted-foreground">No money received in this period.</div>
  }
  return (
    <div className="divide-y divide-border border-b border-border">
      {totals.map((t) => {
        const methods = new Map<string, number>()
        for (const row of data.rows) {
          if (row.status !== 'RECEIVED' || (row.paid_currency || row.currency) !== t.currency) continue
          const label =
            row.channel === 'ONLINE'
              ? (row.paid_by ? PAID_BY_LABEL[row.paid_by] ?? row.paid_by : 'Online')
              : (PAYMENT_METHOD_LABEL[row.method as PaymentMethod] ?? row.method)
          methods.set(label, (methods.get(label) ?? 0) + row.paid_amount)
        }
        return (
          <div key={t.currency} className="flex flex-wrap items-end gap-x-10 gap-y-2 px-5 py-3">
            <div>
              <p className="text-[11px] text-muted-foreground">Received{totals.length > 1 ? ` · ${t.currency}` : ''}</p>
              <p className="text-xl font-semibold tabular-nums text-success">
                {formatMoney(t.total, t.currency)}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {t.count} payment{t.count === 1 ? '' : 's'}
                </span>
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Net to bank</p>
              <p className="text-xl font-semibold tabular-nums">{formatMoney(t.net, t.currency)}</p>
            </div>
            <div className="ml-auto flex flex-wrap gap-x-5 gap-y-1 pb-1 text-sm">
              {[...methods.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([label, total]) => (
                  <span key={label} className="whitespace-nowrap">
                    <span className="text-muted-foreground">{label} </span>
                    <span className="font-medium tabular-nums">{formatMoney(total, t.currency)}</span>
                  </span>
                ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** One transaction: who and when, what it was for, and the money. */
function TransactionDetail({ row }: { row: FeeTransactionRow }) {
  const [receipt, setReceipt] = React.useState<ReceiptView | null>(null)
  const received = row.status === 'RECEIVED'
  const st = TRANSACTION_STATUS[row.status]
  const cur = row.paid_currency || row.currency
  const money = (n: number) => formatMoney(n, cur)
  const canPrint = received && !!row.invoice_id && row.payment_index != null
  const online = row.channel === 'ONLINE'

  const facts: [string, React.ReactNode][] = [
    ['Receipt', row.receipt_number],
    ['Bill', row.bill_numbers?.length ? row.bill_numbers.join(', ') : row.invoice_number],
    ['For', row.against ?? row.instalment_label],
    ['Paid by', row.channel === 'PAST' ? `${PAYMENT_METHOD_LABEL[row.method as PaymentMethod] ?? row.method} · before this system` : howPaid(row)],
  ]
  if (online && row.reference) facts.push(['Reference', <span key="ref" className="break-all font-mono text-xs">{row.reference}</span>])
  if (!online && row.recorded_by_name) facts.push(['Taken by', row.recorded_by_name])
  if (row.note) facts.push(['Note', row.note])

  const money_lines: [string, number, boolean?][] = [['Fees', row.paid_fee_amount]]
  if (row.tax_amount > 0) money_lines.push([`${row.tax_label ?? 'Tax'}${row.tax_percent ? ` ${row.tax_percent}%` : ''}`, row.tax_amount])
  if (row.charges_amount > 0) money_lines.push(['Charges', row.charges_amount])
  money_lines.push(['Total paid', row.paid_amount, true])
  if (online && received && row.razorpay_fee) money_lines.push(['Razorpay kept', -row.razorpay_fee])
  if (online && received && row.net_amount != null && row.razorpay_fee) money_lines.push(['Net to bank', row.net_amount, true])

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('text-2xl font-semibold tabular-nums', !received && 'text-muted-foreground')}>{money(row.paid_amount)}</span>
            <Badge tone={st.tone} size="sm">
              {st.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm">
            {tidyName(row.student_name ?? `Student ${row.student_id}`)}
            {row.class_name && <span className="text-muted-foreground"> · {tidyName(row.class_name)}</span>}
          </p>
          <p className="text-xs text-muted-foreground">{row.channel === 'PAST' ? formatDate(row.paid_at) : formatDateTime(row.paid_at)}</p>
        </div>
        {canPrint && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 px-2.5 text-xs"
            onClick={() => setReceipt({ invoiceId: row.invoice_id, index: row.payment_index as number })}
          >
            <Printer />
            Receipt
          </Button>
        )}
      </div>

      {row.failure_reason && <p className="mt-3 text-sm text-danger">{row.failure_reason}</p>}

      <div className="mt-5 grid max-w-3xl gap-x-10 gap-y-5 sm:grid-cols-2">
        <dl className="space-y-2 text-sm">
          {facts.map(([label, value]) => (
            <div key={label} className="flex gap-3">
              <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
              <dd className="min-w-0">{value ?? '—'}</dd>
            </div>
          ))}
        </dl>
        <dl className={cn('space-y-2 text-sm', !received && 'opacity-50')}>
          {money_lines.map(([label, value, strong]) => (
            <div key={label} className={cn('flex justify-between gap-3', strong && 'border-t border-border pt-2 font-semibold')}>
              <dt className={cn(!strong && 'text-muted-foreground')}>{label}</dt>
              <dd className="tabular-nums">{value < 0 ? `−${money(-value)}` : money(value)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-5 -mx-5">
        <ReceiptViewer view={receipt} onClose={() => setReceipt(null)} />
      </div>
    </div>
  )
}

/** A received payment's receipt, as the counter prints it. */
function ReceiptViewer({ view, onClose }: { view: ReceiptView | null; onClose: () => void }) {
  const receipt = usePaymentReceipt(view?.invoiceId ?? null, view?.index ?? null)
  return (
    <InPage open={!!view} onOpenChange={(v) => !v && onClose()}>
      <InPageContent>
        <InPageHeader>
          <InPageTitle>{receipt.data?.receipt_number ? `Receipt ${receipt.data.receipt_number}` : 'Receipt'}</InPageTitle>
          <InPageDescription>Print it, or save it as a PDF to send to the parent.</InPageDescription>
        </InPageHeader>
        <InPageBody>
          <QueryBoundary query={receipt} loading={<Skeleton className="h-96 w-full rounded-xl" />}>
            {(data) => (
              <>
                <FeeReceipt receipt={data} />
                <FeeReceiptForPrint receipt={data} />
              </>
            )}
          </QueryBoundary>
        </InPageBody>
        <InPageFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={printFeeReceipt} disabled={!receipt.data}>
            <Printer />
            Print receipt
          </Button>
        </InPageFooter>
      </InPageContent>
    </InPage>
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
    { academicYearId: academicYearId ?? undefined, classId: classFilter },
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
  const transactions = useFeeTransactionsReport(
    {
      academicYearId: academicYearId ?? undefined,
      classId: classFilter,
      fromDate: from,
      toDate: to,
      method: method === 'ALL' ? undefined : method,
    },
    view === 'transactions',
  )
  const dated = view === 'collections' || view === 'transactions'

  const today = todayApiDate()
  const yearStart = academicYearStart && academicYearStart <= today ? academicYearStart : null
  const rangeOf = (p: ReportPeriod): { from: string; to: string } | null =>
    p === 'today'
      ? { from: today, to: today }
      : p === 'year'
        ? yearStart
          ? { from: yearStart, to: today }
          : null
        : p === 'custom'
          ? null
          : resolvePeriod(p)
  const [customPicked, setCustomPicked] = React.useState(false)
  const matched = PERIODS.map((p) => p.value).find((p) => {
    const r = rangeOf(p)
    return r != null && r.from === from && r.to === to
  })
  const periodValue: ReportPeriod = customPicked || !matched ? 'custom' : matched
  const choosePeriod = (value: string) => {
    const p = value as ReportPeriod
    if (p === 'custom') {
      setCustomPicked(true)
      return
    }
    setCustomPicked(false)
    const r = rangeOf(p)
    if (r) setPeriod({ preset: 'custom', ...r })
  }

  const classOptions = [
    { value: '', label: 'Every class' },
    ...(classes.data ?? []).map((c) => ({ value: String(c.id), label: c.name, hint: c.code })),
  ]

  const exportParams = {
    academic_year_id: academicYearId ?? undefined,
    class_id: classFilter,
    status: view === 'students' && status !== 'ALL' ? status : undefined,
    from_date: dated ? from : undefined,
    to_date: dated ? to : undefined,
    method: dated && method !== 'ALL' ? method : undefined,
    head_id: view === 'collections' && headId !== 'ALL' ? Number(headId) : undefined,
  }

  return (
    <div className="flex flex-col lg:h-full">
      <div className="flex flex-wrap items-end justify-between gap-x-4 border-b border-border px-4 pt-2.5">
        <div className="flex flex-wrap items-end gap-x-6">
          <h2 className="pb-2.5 text-base font-medium text-foreground">Reports</h2>
          <nav className="-mb-px flex gap-1" aria-label="Report">
            {REPORT_TABS.map((tab) => {
              const Icon = tab.icon
              const active = view === tab.value
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setView(tab.value)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 border-b-2 px-2.5 pb-2.5 pt-1 text-sm transition-colors',
                    active
                      ? 'border-primary font-medium text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-1.5 pb-2">
          {view === 'collections' && (
            <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs" onClick={() => setPastOpen(true)}>
              <History />
              Past payment
            </Button>
          )}
          <ExportButton view={view} params={exportParams} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-1.5">
        <Combobox
          value={classId}
          onChange={(v) => setClassId(v ?? '')}
          options={classOptions}
          placeholder="Every class"
          className="h-8 w-40 px-2.5 text-xs"
        />
        {dated && (
          <>
            <Select value={periodValue} onValueChange={choosePeriod}>
              <SelectTrigger className="h-8 w-36 px-2.5 text-xs" aria-label="Period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.filter((p) => p.value !== 'year' || yearStart).map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {periodValue === 'custom' ? (
              <span className="flex items-center gap-1">
                <DatePicker value={from} onChange={(v) => v && setPeriod({ preset: 'custom', from: v, to })} className="h-8 w-36 px-2.5 text-xs" />
                <span className="text-xs text-muted-foreground">to</span>
                <DatePicker value={to} onChange={(v) => v && setPeriod({ preset: 'custom', from, to: v })} className="h-8 w-36 px-2.5 text-xs" />
              </span>
            ) : (
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatDate(from)} – {formatDate(to)}
              </span>
            )}
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className={cn('h-8 w-36 px-2.5 text-xs', method !== 'ALL' && 'border-primary/50 text-primary')} aria-label="Method">
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
          </>
        )}
        {view === 'collections' && (
          <Select value={headId} onValueChange={setHeadId}>
            <SelectTrigger className={cn('h-8 w-40 px-2.5 text-xs', headId !== 'ALL' && 'border-primary/50 text-primary')} aria-label="Fee">
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
        )}
      </div>
      <PastPaymentDialog open={pastOpen} onOpenChange={setPastOpen} academicYearId={academicYearId} />

      {view === 'students' && (
        <div className="min-w-0 lg:min-h-0 lg:flex-1">
          <QueryBoundary query={roll} loading={<Skeleton className="m-4 h-96 rounded-md" />}>
            {(data) => <StudentsSheet data={data} status={status} onStatus={setStatus} />}
          </QueryBoundary>
        </div>
      )}

      {(view === 'dues' || view === 'collections') && (
        <div className="min-w-0 space-y-3 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">

      {view === 'dues' && (
        <QueryBoundary query={dues} loading={<Skeleton className="h-96 w-full rounded-xl" />}>
          {(data) => (
            <>
              <div className="border-y border-border py-3">
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
              </div>
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
              <div className="border-y border-border py-3">
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
              </div>
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
      )}

      {view === 'transactions' && (
        <div className="min-w-0 lg:min-h-0 lg:flex-1">
          <QueryBoundary query={transactions} loading={<Skeleton className="m-4 h-96 rounded-md" />}>
            {(data) => <TransactionsSplit data={data} />}
          </QueryBoundary>
        </div>
      )}
    </div>
  )
}

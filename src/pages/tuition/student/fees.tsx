import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Package,
  Receipt,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { InvoiceLineItem, InvoiceOut, PackageStatusOut } from '@/api/types'
import {
  useMyPackage,
  useMyTuitionFees,
  useMyTuitionInvoices,
  useTuitionProfile,
} from '@/queries/tuition.queries'
import { useSupportContact } from '@/queries/support.queries'
import { formatDate, toApiDate } from '@/lib/datetime'
import {
  BILLING_MODE_LABEL,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
  amountOutstanding,
  formatMoney,
  packageUsageLabel,
  packageUsagePercent,
} from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'
import { CurrencySwitcher } from '@/pages/admin/finance-currencies'
import { TuitionBreakdownView } from './breakdown'

/**
 * A tuition student's own fees.
 *
 * Separate from `/student/fees`, which is the SCHOOL biller: that one prices a
 * fee structure agreed in advance and collects it in instalments, this one
 * counts the classes that actually happened against a package the student is
 * on for the term. They share no shape beyond the word "invoice", which is why
 * the two products keep separate billers on the backend and separate screens
 * here.
 *
 * Drafts never arrive — the endpoint excludes them. A draft is the office's
 * working copy, re-priced on every regeneration, so an empty list means "you
 * have not been billed yet" rather than "something failed to load".
 */

/** How many classes an invoice charged for — off the invoice, or summed from older lines. */
function invoiceClassCount(invoice: InvoiceOut): number {
  if (invoice.classes_billed != null) return invoice.classes_billed
  return invoice.line_items.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0)
}

/**
 * The header of the fee page: which package I am on and how much of it is
 * left. Nulls mean nothing is assigned yet, which is said plainly — a student
 * admitted this morning has no package and no reason to think anything is
 * wrong.
 */
function PackageCard({ status }: { status: PackageStatusOut }) {
  const pkg = status.package
  const assignment = status.assignment
  if (!pkg || !assignment) {
    return (
      <Card className="mb-5 flex gap-3 p-5">
        <Package className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div>
          <h3 className="text-sm font-semibold">No package yet</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            The office puts you on a package of classes for each term. Until then your classes
            are counted but not priced.
          </p>
        </div>
      </Card>
    )
  }

  const percent = packageUsagePercent(status.classes_used_to_date, status.classes_included)
  const over = status.classes_over > 0

  return (
    <Card className="mb-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <Package className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{pkg.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {pkg.classes_included} classes for {formatMoney(pkg.amount, pkg.currency)} ·{' '}
              {formatMoney(pkg.per_class_amount, pkg.currency)} a class ·{' '}
              {BILLING_MODE_LABEL[pkg.billing_mode]}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[assignment.academic_year_name, assignment.term_name].filter(Boolean).join(' · ')}
              {assignment.starts_on
                ? ` · ${formatDate(assignment.starts_on)}${assignment.ends_on ? ` – ${formatDate(assignment.ends_on)}` : ''}`
                : ''}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums">
            {status.classes_remaining ?? 0}
            <span className="text-xs font-normal text-muted-foreground"> left</span>
          </p>
        </div>
      </div>
      <div className="mt-3">
        <ProgressBar
          value={percent}
          tone={over ? 'warning' : percent >= 80 ? 'info' : 'primary'}
          size="sm"
          label="Package usage"
        />
        <p className={`mt-1 text-xs ${over ? 'text-warning' : 'text-muted-foreground'}`}>
          {packageUsageLabel(status)}
        </p>
      </div>
    </Card>
  )
}

/**
 * One line on an issued invoice. The package with its class count and rate,
 * and the subjects those classes came from — the workings, not just the
 * figure, because the count is the thing a family actually queries. A line
 * from a bill raised before packages still renders as the subject it was.
 */
function InvoiceLine({ line, currency }: { line: InvoiceLineItem; currency: string }) {
  const title = line.package_name ?? line.subject ?? line.description ?? 'Classes'
  const classes = line.classes_billed ?? line.quantity
  const subjects = line.subjects ?? []
  return (
    <li className="py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[
              classes != null ? `${classes} ${classes === 1 ? 'class' : 'classes'}` : null,
              line.unit_amount != null ? `at ${formatMoney(line.unit_amount, currency)}` : null,
              line.term_name,
            ]
              .filter(Boolean)
              .join(' ') || '—'}
          </p>
          {subjects.length > 0 && (
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {subjects
                .map((sub) => `${sub.subject_name ?? 'Subject'} ${sub.classes_counted}`)
                .join(' · ')}
            </p>
          )}
          {line.classes_included != null && (
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {line.classes_used_to_date ?? 0} of {line.classes_included} classes used by the end of
              this period
            </p>
          )}
          {line.note && <p className="mt-0.5 text-2xs text-muted-foreground">{line.note}</p>}
        </div>
        <span className="shrink-0 text-sm tabular-nums">
          {formatMoney(line.amount ?? 0, currency)}
        </span>
      </div>
    </li>
  )
}

function InvoiceCard({
  invoice,
  onOpen,
}: {
  invoice: InvoiceOut
  onOpen: () => void
}) {
  const outstanding = amountOutstanding(invoice)

  return (
    <Card interactive onClick={onOpen} className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              {formatDate(invoice.period_start)} — {formatDate(invoice.period_end)}
            </h3>
            <Badge tone={INVOICE_STATUS_TONE[invoice.status]} size="sm">
              {INVOICE_STATUS_LABEL[invoice.status]}
            </Badge>
            {/* Which session year's rates produced these figures. Stored on the
                invoice, so an old bill stays explicable even after the year's
                dates or rates have been edited. */}
            {invoice.academic_year_name && (
              <Badge tone="outline" size="sm">
                {invoice.academic_year_name}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {invoiceClassCount(invoice)} {invoiceClassCount(invoice) === 1 ? 'class' : 'classes'}
            {invoice.package_name ? ` on ${invoice.package_name}` : ''}
            {invoice.term_name ? ` · ${invoice.term_name}` : ''}
            {invoice.issued_at ? ` · issued ${formatDate(invoice.issued_at)}` : ''}
            {invoice.due_date ? ` · due ${formatDate(invoice.due_date)}` : ''}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-base font-semibold tabular-nums">
            {formatMoney(invoice.total_amount, invoice.currency)}
          </p>
          {outstanding > 0 ? (
            <p className="text-xs tabular-nums text-warning">
              {formatMoney(outstanding, invoice.currency)} outstanding
            </p>
          ) : (
            <p className="text-xs text-success">Settled</p>
          )}
        </div>
      </div>
    </Card>
  )
}

function InvoiceDetailSheet({
  invoice,
  onClose,
}: {
  invoice: InvoiceOut | null
  onClose: () => void
}) {
  const contact = useSupportContact('TUITION')
  const outstanding = invoice ? amountOutstanding(invoice) : 0

  return (
    <Sheet open={!!invoice} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {invoice && `${formatDate(invoice.period_start)} — ${formatDate(invoice.period_end)}`}
          </SheetTitle>
        </SheetHeader>
        <SheetBody>
          {invoice && (
            <>
              <Card className="p-5">
                <h3 className="text-sm font-semibold">What you were billed for</h3>
                <ul className="mt-2 divide-y divide-border">
                  {invoice.line_items.map((line, i) => (
                    <InvoiceLine key={i} line={line} currency={invoice.currency} />
                  ))}
                </ul>

                <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Subtotal</dt>
                    <dd className="tabular-nums">
                      {formatMoney(invoice.subtotal, invoice.currency)}
                    </dd>
                  </div>
                  {invoice.discount_amount > 0 && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Discount</dt>
                      <dd className="tabular-nums text-success">
                        −{formatMoney(invoice.discount_amount, invoice.currency)}
                      </dd>
                    </div>
                  )}
                  {invoice.tax_amount > 0 && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{invoice.tax_label ?? 'Tax'}</dt>
                      <dd className="tabular-nums">
                        {formatMoney(invoice.tax_amount, invoice.currency)}
                      </dd>
                    </div>
                  )}
                  {(invoice.convenience_amount ?? 0) > 0 && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Convenience charge</dt>
                      <dd className="tabular-nums">
                        {formatMoney(invoice.convenience_amount ?? 0, invoice.currency)}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold">
                    <dt>Total</dt>
                    <dd className="tabular-nums">
                      {formatMoney(invoice.total_amount, invoice.currency)}
                    </dd>
                  </div>
                  {invoice.amount_paid > 0 && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Paid</dt>
                      <dd className="tabular-nums text-success">
                        −{formatMoney(invoice.amount_paid, invoice.currency)}
                      </dd>
                    </div>
                  )}
                  {outstanding > 0 && (
                    <div className="flex justify-between gap-4 font-semibold">
                      <dt>Outstanding</dt>
                      <dd className="tabular-nums text-warning">
                        {formatMoney(outstanding, invoice.currency)}
                      </dd>
                    </div>
                  )}
                </dl>
              </Card>

              {invoice.payments.length > 0 && (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold">Payments received</h3>
                  <ul className="mt-2 divide-y divide-border">
                    {invoice.payments.map((payment, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm">{payment.method ?? 'Payment'}</p>
                          <p className="text-xs text-muted-foreground">
                            {[payment.reference, formatDate(payment.paid_at)]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm tabular-nums text-success">
                          {formatMoney(payment.amount ?? 0, invoice.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {outstanding > 0 && (
                <Card className="space-y-3 p-5">
                  <div className="flex items-center gap-2">
                    <Building2 className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Paying this</h3>
                  </div>
                  <Button block asChild>
                    <Link to={`/tuition/student/fees/pay/${encodeURIComponent(invoice.id)}`}>
                      <CreditCard />
                      Pay {formatMoney(outstanding, invoice.currency)}
                    </Link>
                  </Button>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Pay online where it is switched on, or get a reference to quote at the
                    office or on a bank transfer. Either way the invoice updates here as soon
                    as the payment is recorded.
                  </p>
                  {contact.data?.phone && (
                    <p className="text-sm">
                      <a
                        className="font-medium hover:underline"
                        href={`tel:${contact.data.phone}`}
                      >
                        {contact.data.phone}
                      </a>
                      {contact.data.hours ? (
                        <span className="text-muted-foreground"> · {contact.data.hours}</span>
                      ) : null}
                    </p>
                  )}
                </Card>
              )}
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

/**
 * A month's window, as the two dates the endpoint wants.
 *
 * A tuition bill is a count of classes over a period, so there is no such
 * thing as "what I owe" without saying over what — the period is required by
 * the endpoint for that reason, not as a filter.
 */
function monthWindow(offset: number) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { from: toApiDate(start), to: toApiDate(end), label: formatDate(start, 'MMMM yyyy') }
}

export default function TuitionStudentFeesPage() {
  const invoices = useMyTuitionInvoices()
  const profile = useTuitionProfile()
  const myPackage = useMyPackage()
  const [opened, setOpened] = React.useState<InvoiceOut | null>(null)

  // Which month the accrual view is showing, and in which currency.
  const [monthOffset, setMonthOffset] = React.useState(0)
  const [currency, setCurrency] = React.useState<string | null>(null)
  const period = React.useMemo(() => monthWindow(monthOffset), [monthOffset])

  const breakdown = useMyTuitionFees({
    periodStart: period.from,
    periodEnd: period.to,
    currency: currency ?? undefined,
  })

  const totalOutstanding = React.useMemo(
    () => (invoices.data ?? []).reduce((sum, i) => sum + amountOutstanding(i), 0),
    [invoices.data],
  )
  const invoiceCurrency = invoices.data?.[0]?.currency ?? profile.data?.currency ?? 'AED'

  return (
    <div>
      <PageHeader
        title="My fees"
        description="The package you are on, what this month's classes have come to, and what has been billed."
        actions={
          totalOutstanding > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warning" size="lg">
                {formatMoney(totalOutstanding, invoiceCurrency)} outstanding
              </Badge>
              {/* The checkout. It decides on its own whether the gateway is
                  live and says so; the button is offered whenever something
                  is owed. */}
              <Button asChild>
                <Link to="/tuition/student/fees/pay">
                  <CreditCard />
                  Pay fees
                </Link>
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* The package first: it is the frame the month's figure sits in. */}
      {myPackage.data ? (
        <PackageCard status={myPackage.data} />
      ) : myPackage.isPending ? (
        <Skeleton className="mb-5 h-28 w-full rounded-xl" />
      ) : null}

      {/* Two different questions, kept apart.
          The accrual is what this month's classes have come to; the invoices
          are what has actually been billed. A student looking at an unbilled
          month sees a figure in the first and nothing in the second, and both
          answers are correct — collapsing them would make one of them a lie. */}
      <Card className="mb-5 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous month"
              onClick={() => setMonthOffset((m) => m - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-36 text-center text-sm font-medium">{period.label}</span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next month"
              disabled={monthOffset >= 0}
              onClick={() => setMonthOffset((m) => Math.min(m + 1, 0))}
            >
              <ChevronRight />
            </Button>
          </div>

          {breakdown.data && (
            <CurrencySwitcher
              value={breakdown.data.currency}
              available={breakdown.data.available_currencies}
              baseCurrency={breakdown.data.base_currency}
              exchangeRate={breakdown.data.exchange_rate}
              options={breakdown.data.currency_options}
              recommended={breakdown.data.recommended_currency}
              onChange={setCurrency}
            />
          )}
        </div>

        <QueryBoundary
          query={breakdown}
          loading={<Skeleton className="h-64 w-full rounded-xl" />}
        >
          {(data) => <TuitionBreakdownView breakdown={data} />}
        </QueryBoundary>
      </Card>

      <h2 className="mb-3 text-sm font-semibold">Invoices</h2>

      <QueryBoundary
        query={invoices}
        loading={
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            icon={<Receipt />}
            title="You have not been billed yet"
            description="Invoices appear here once the office issues them. A bill being prepared is not shown until it is final."
          />
        }
      >
        {(rows) => (
          <div className="space-y-3">
            {rows.map((invoice) => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                onOpen={() => setOpened(invoice)}
              />
            ))}
          </div>
        )}
      </QueryBoundary>

      <InvoiceDetailSheet invoice={opened} onClose={() => setOpened(null)} />
    </div>
  )
}

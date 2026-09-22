import { CreditCard, Receipt } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { useMyFees, useMyInvoices } from '@/queries/finance.queries'
import { formatDate } from '@/lib/datetime'
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, formatMoney } from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'
import { FeeBreakdownView } from '@/pages/admin/finance-breakdown'
import { CurrencySwitcher } from '@/pages/admin/finance-currencies'

/**
 * A student's own fees.
 *
 * The same `FeeBreakdownOut` the admin previews and the parent sees, rendered
 * by the same component — so what a student reads here and what the office
 * quotes on the phone cannot diverge.
 *
 * `discounts_not_applied` is deliberately NOT shown: a student does not need a
 * list of concessions that were never theirs, and it reads as a list of things
 * they have been denied. It stays on the admin screen, where it answers a
 * support question instead.
 */
export default function StudentFeesPage() {
  /**
   * The currency the figures are shown in.
   *
   * Null means "whatever the server defaults to" — the base currency. It only
   * becomes a real value once the payer picks one, so the first load never
   * asks for a currency that may not be offered.
   */
  const [currency, setCurrency] = React.useState<string | null>(null)
  const fees = useMyFees({ currency: currency ?? undefined })
  const invoices = useMyInvoices()

  return (
    <div>
      <PageHeader
        title="My fees"
        description="What is owed, what it is made up of, and when each part falls due."
        actions={
          // Only offered when something is actually owed — a "Pay" button on a
          // settled account sends people to a page that can only tell them
          // there is nothing to do.
          (invoices.data ?? []).some(
            (i) => i.status !== 'DRAFT' && i.status !== 'CANCELLED' && i.amount_outstanding > 0,
          ) ? (
            <Button asChild>
              <Link to="/student/fees/pay">
                <CreditCard />
                Pay fees
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-5">
        <QueryBoundary
          query={fees}
          loading={<Skeleton className="h-80 w-full rounded-xl" />}
        >
          {(data) => (
            <>
              <CurrencySwitcher
                value={data.currency}
                available={data.available_currencies}
                baseCurrency={data.base_currency}
                exchangeRate={data.exchange_rate}
                options={data.currency_options}
                recommended={data.recommended_currency}
                onChange={setCurrency}
              />
              <FeeBreakdownView breakdown={data} />
            </>
          )}
        </QueryBoundary>

        <QueryBoundary
          query={invoices}
          loading={<Skeleton className="h-32 w-full rounded-xl" />}
          isEmpty={(rows) => rows.length === 0}
          empty={
            <EmptyState
              icon={<Receipt />}
              title="No invoice issued yet"
              description="The breakdown above is what your fees come to. An invoice is raised when the school bills it."
            />
          }
        >
          {(rows) => (
            <Card className="p-5">
              <h3 className="text-sm font-semibold">Invoices</h3>
              {/* A draft is the office's working copy — re-priced whenever it is
                  rebuilt, and not owed. Saying so is the difference between
                  "why is there no Pay button" and "ah, it is not a bill yet". */}
              {rows.every((i) => i.status === 'DRAFT') && (
                <p className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                  Nothing here is payable yet. A draft is the school's working copy of your
                  bill — it becomes payable once the office issues it, and a Pay option
                  appears then.
                </p>
              )}
              <ul className="mt-2 divide-y divide-border">
                {rows.map((invoice) => (
                  <li
                    key={invoice.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {invoice.invoice_number ?? 'Draft'}
                        </span>
                        <Badge tone={INVOICE_STATUS_TONE[invoice.status]} size="sm">
                          {INVOICE_STATUS_LABEL[invoice.status]}
                        </Badge>
                        {invoice.is_overdue && (
                          <Badge tone="danger" size="sm">
                            Overdue
                          </Badge>
                        )}
                      </div>
                      {invoice.due_date && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Due {formatDate(invoice.due_date)}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-medium tabular-nums">
                          {formatMoney(invoice.total_amount, invoice.currency)}
                        </p>
                        {invoice.amount_outstanding > 0 && (
                          <p className="text-xs tabular-nums text-warning">
                            {formatMoney(invoice.amount_outstanding, invoice.currency)} outstanding
                          </p>
                        )}
                      </div>
                      {invoice.status !== 'DRAFT' &&
                        invoice.status !== 'CANCELLED' &&
                        invoice.amount_outstanding > 0 && (
                          <Button size="sm" variant="outline" asChild>
                            <Link to={`/student/fees/pay/${invoice.id}`}>Pay</Link>
                          </Button>
                        )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </QueryBoundary>
      </div>
    </div>
  )
}

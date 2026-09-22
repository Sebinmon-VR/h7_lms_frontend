import { Receipt } from 'lucide-react'
import * as React from 'react'
import { Link, useParams } from 'react-router-dom'

import type { FeeInvoiceOut } from '@/api/types'
import {
  useMyInvoices,
  useMyPaymentIntents,
  useStartMyPayment,
} from '@/queries/finance.queries'
import { FEE_FREQUENCY_LABEL } from '@/lib/school'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'
import { Checkout, PayablePicker } from '@/components/domain/checkout'
import type { CheckoutInvoice } from '@/components/domain/checkout'

/**
 * The school checkout.
 *
 * The shared `Checkout` fed a school invoice: fee heads as the lines, the
 * instalment schedule as the amount choices, and the school's gateway switch.
 * Pressing Pay calls the student's own intent endpoint — until it existed a
 * student could not start a payment at all, which is why this page used to end
 * in a disabled button.
 */

const MERCHANT = 'H7 School'
const BACK_TO = '/student/fees'

function payable(invoice: FeeInvoiceOut): boolean {
  return (
    invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED' && invoice.amount_outstanding > 0
  )
}

/** A school invoice as the checkout wants it. */
function toCheckout(invoice: FeeInvoiceOut): CheckoutInvoice {
  const adjustments = [
    invoice.discount_total > 0
      ? { key: 'discount', label: 'Concessions', amount: invoice.discount_total, negative: true }
      : null,
    invoice.tax_total > 0
      ? { key: 'tax', label: invoice.tax_label || 'Tax', amount: invoice.tax_total }
      : null,
    invoice.convenience_total > 0
      ? { key: 'convenience', label: 'Convenience charge', amount: invoice.convenience_total }
      : null,
    invoice.late_fee_total > 0
      ? { key: 'late', label: 'Late fees', amount: invoice.late_fee_total }
      : null,
  ].filter((row): row is NonNullable<typeof row> => row != null)

  return {
    id: invoice.id,
    reference: invoice.invoice_number ?? invoice.id,
    title: invoice.academic_year_name ? `Fees for ${invoice.academic_year_name}` : 'School fees',
    subtitle: invoice.student_name ?? null,
    currency: invoice.currency,
    total: invoice.total_amount,
    paid: invoice.amount_paid,
    outstanding: invoice.amount_outstanding,
    dueDate: invoice.due_date,
    isOverdue: invoice.is_overdue,
    lines: invoice.line_items.map((line) => ({
      key: `${line.fee_head_id}-${line.name}`,
      label: line.name,
      detail:
        line.frequency && line.frequency in FEE_FREQUENCY_LABEL
          ? FEE_FREQUENCY_LABEL[line.frequency as keyof typeof FEE_FREQUENCY_LABEL]
          : (line.frequency ?? null),
      amount: line.amount,
    })),
    adjustments,
    instalments: invoice.instalments,
    gatewayEnabled: invoice.gateway_enabled,
    gatewayProvider: invoice.gateway_provider ?? null,
  }
}

function SchoolCheckout({ invoice }: { invoice: FeeInvoiceOut }) {
  const intents = useMyPaymentIntents(invoice.id)
  const start = useStartMyPayment('LMS')
  const model = React.useMemo(() => toCheckout(invoice), [invoice])

  return (
    <Checkout
      invoice={model}
      merchant={MERCHANT}
      program="LMS"
      backTo={BACK_TO}
      intents={intents.data ?? []}
      paying={start.isPending}
      onPay={(body) => start.mutateAsync({ invoiceId: invoice.id, body })}
    />
  )
}

export default function StudentPayFeesPage() {
  const { invoiceId } = useParams<{ invoiceId?: string }>()
  const invoices = useMyInvoices()

  return (
    <div>
      <PageHeader
        title="Pay fees"
        description="Check the amount, choose how to pay, and get a reference."
        actions={
          <Button variant="outline" asChild>
            <Link to={BACK_TO}>
              <Receipt />
              Full breakdown
            </Link>
          </Button>
        }
      />

      <QueryBoundary query={invoices} loading={<Skeleton className="h-96 w-full rounded-xl" />}>
        {(rows) => {
          // A draft has no number and is not owed yet — it is the school's
          // working copy, not a bill, so it is never payable.
          const open = rows.filter(payable)

          if (open.length === 0) {
            return (
              <EmptyState
                icon={<Receipt />}
                title="Nothing to pay"
                description={
                  rows.length === 0
                    ? 'No invoice has been issued to you yet.'
                    : 'Every invoice issued to you is settled.'
                }
                action={
                  <Button variant="outline" asChild>
                    <Link to={BACK_TO}>See your fees</Link>
                  </Button>
                }
              />
            )
          }

          const chosen = invoiceId
            ? open.find((i) => i.id === invoiceId)
            : open.length === 1
              ? open[0]
              : null

          if (!chosen) {
            return (
              <PayablePicker
                rows={open.map((invoice) => ({
                  id: invoice.id,
                  reference: invoice.invoice_number ?? invoice.id,
                  title: invoice.academic_year_name ?? 'School fees',
                  outstanding: invoice.amount_outstanding,
                  currency: invoice.currency,
                  dueDate: invoice.due_date,
                  isOverdue: invoice.is_overdue,
                  href: `/student/fees/pay/${invoice.id}`,
                }))}
              />
            )
          }

          return <SchoolCheckout invoice={chosen} />
        }}
      </QueryBoundary>
    </div>
  )
}

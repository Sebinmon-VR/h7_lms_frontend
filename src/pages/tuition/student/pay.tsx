import { Receipt } from 'lucide-react'
import * as React from 'react'
import { Link, useParams } from 'react-router-dom'

import type { InvoiceOut } from '@/api/types'
import {
  useMyTuitionInvoices,
  useMyTuitionPaymentIntents,
  useStartMyTuitionPayment,
} from '@/queries/tuition.queries'
import { formatDate } from '@/lib/datetime'
import { amountOutstanding, formatMoney } from '@/lib/tuition'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'
import { Checkout, PayablePicker } from '@/components/domain/checkout'
import type { CheckoutInvoice } from '@/components/domain/checkout'

/**
 * The tuition checkout.
 *
 * The same page the school's payer gets, fed a tuition invoice: one package
 * line with its class count, no instalments (a tuition bill is paid whole or
 * in part, never on a schedule), and the programme's own gateway switch.
 */

const MERCHANT = 'H7 Online Tuition'
const BACK_TO = '/tuition/student/fees'

function payable(invoice: InvoiceOut): boolean {
  return (
    invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED' && amountOutstanding(invoice) > 0
  )
}

function periodLabel(invoice: InvoiceOut): string {
  return `${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)}`
}

/** A tuition invoice as the checkout wants it. */
function toCheckout(invoice: InvoiceOut): CheckoutInvoice {
  const currency = invoice.currency
  const lines = invoice.line_items.map((line, index) => {
    const classes = line.classes_billed ?? line.quantity
    const subjects = (line.subjects ?? [])
      .map((s) => `${s.subject_name ?? 'Subject'} ${s.classes_counted}`)
      .join(' · ')
    return {
      key: String(line.package_id ?? line.subject_id ?? index),
      label: line.package_name ?? line.subject ?? line.description ?? 'Classes',
      detail:
        [
          classes != null ? `${classes} ${classes === 1 ? 'class' : 'classes'}` : null,
          line.unit_amount != null ? `at ${formatMoney(Number(line.unit_amount), currency)}` : null,
          subjects || null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
      amount: Number(line.amount ?? 0),
    }
  })

  const adjustments = [
    invoice.discount_amount > 0
      ? { key: 'discount', label: 'Concession', amount: invoice.discount_amount, negative: true }
      : null,
    invoice.tax_amount > 0
      ? { key: 'tax', label: invoice.tax_label ?? 'Tax', amount: invoice.tax_amount }
      : null,
    (invoice.convenience_amount ?? 0) > 0
      ? { key: 'convenience', label: 'Convenience charge', amount: invoice.convenience_amount ?? 0 }
      : null,
  ].filter((row): row is NonNullable<typeof row> => row != null)

  return {
    id: invoice.id,
    reference: invoice.id,
    title: `Classes ${periodLabel(invoice)}`,
    subtitle: [invoice.package_name, invoice.term_name].filter(Boolean).join(' · ') || null,
    currency,
    total: invoice.total_amount,
    paid: invoice.amount_paid,
    outstanding: amountOutstanding(invoice),
    dueDate: invoice.due_date,
    lines,
    adjustments,
    instalments: [],
    gatewayEnabled: invoice.gateway_enabled ?? false,
    gatewayProvider: invoice.gateway_provider ?? null,
  }
}

function TuitionCheckout({ invoice }: { invoice: InvoiceOut }) {
  const intents = useMyTuitionPaymentIntents(invoice.id)
  const start = useStartMyTuitionPayment()
  const model = React.useMemo(() => toCheckout(invoice), [invoice])

  return (
    <Checkout
      invoice={model}
      merchant={MERCHANT}
      program="TUITION"
      backTo={BACK_TO}
      intents={intents.data ?? []}
      paying={start.isPending}
      onPay={(body) => start.mutateAsync({ invoiceId: invoice.id, body })}
    />
  )
}

export default function TuitionStudentPayPage() {
  const { invoiceId } = useParams<{ invoiceId?: string }>()
  const invoices = useMyTuitionInvoices()

  return (
    <div>
      <PageHeader
        title="Pay tuition fees"
        description="Check the amount, choose how to pay, and get a reference."
        actions={
          <Button variant="outline" asChild>
            <Link to={BACK_TO}>
              <Receipt />
              My fees
            </Link>
          </Button>
        }
      />

      <QueryBoundary query={invoices} loading={<Skeleton className="h-96 w-full rounded-xl" />}>
        {(rows) => {
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
                  reference: invoice.id,
                  title: `Classes ${periodLabel(invoice)}`,
                  subtitle: invoice.package_name ?? null,
                  outstanding: amountOutstanding(invoice),
                  currency: invoice.currency,
                  dueDate: invoice.due_date,
                  href: `/tuition/student/fees/pay/${encodeURIComponent(invoice.id)}`,
                }))}
              />
            )
          }

          return <TuitionCheckout invoice={chosen} />
        }}
      </QueryBoundary>
    </div>
  )
}

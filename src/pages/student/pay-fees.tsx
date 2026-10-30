import { Receipt } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import type { FeeInvoiceOut } from '@/api/types'
import { useMyInvoices } from '@/queries/finance.queries'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'
import { PayablePicker } from '@/components/domain/checkout'
import { SchoolPayForm } from '@/components/domain/school-pay-form'

/**
 * The school's pay page: the issued bill as a standard payment form — the
 * fees being paid, the currency (INR or AED, each with its tax), the method —
 * and a summary with the Pay button. Online payment opens Razorpay over the
 * page; bank transfer and the office give a reference to quote.
 */

const BACK_TO = '/student/fees'

function payable(invoice: FeeInvoiceOut): boolean {
  return (
    invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED' && invoice.amount_outstanding > 0
  )
}

export default function StudentPayFeesPage() {
  const { invoiceId } = useParams<{ invoiceId?: string }>()
  const invoices = useMyInvoices()

  return (
    <div>
      <PageHeader
        title="Pay fees"
        description="Choose the fees, the currency and how you want to pay."
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
                    ? 'The school has not issued a fee bill to you yet.'
                    : 'Every fee bill issued to you is settled.'
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

          return <SchoolPayForm invoice={chosen} backTo={BACK_TO} />
        }}
      </QueryBoundary>
    </div>
  )
}

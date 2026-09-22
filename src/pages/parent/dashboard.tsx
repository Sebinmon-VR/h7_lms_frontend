import {
  CalendarCheck,
  GraduationCap,
  Lock,
  Receipt,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import type { ChildSummary } from '@/api/types'
import { useMyChildProfile, useMyChildren } from '@/queries/families.queries'
import { useChildFees, useChildInvoices } from '@/queries/finance.queries'
import { RELATION_LABEL } from '@/lib/school'
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, formatMoney } from '@/lib/tuition'
import { formatDate } from '@/lib/datetime'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader, HeroHeader } from '@/components/layout/page-header'
import { ProfileSummary } from '@/components/domain/profile-summary'
import { FeeBreakdownView } from '@/pages/admin/finance-breakdown'
import { CurrencySwitcher } from '@/pages/admin/finance-currencies'

/**
 * The parent portal.
 *
 * A parent has nothing of their own — no timetable, no register, no work. Every
 * screen belongs to a child, so the switcher IS the home page rather than a
 * control bolted onto one.
 *
 * What they may open is decided PER CHILD by that link's flags, which arrive on
 * `/parent/children`. The rule this page follows throughout: hide what a flag
 * denies rather than rendering a tab that answers 403. `may_view_fees` in
 * particular is off unless an admin granted it, so a fee tab is the exception
 * and not the default.
 */

function PermissionChips({ child }: { child: ChildSummary }) {
  const granted = [
    child.may_view_academics && 'Marks',
    child.may_view_attendance && 'Attendance',
    child.may_view_fees && 'Fees',
  ].filter(Boolean) as string[]

  if (granted.length === 0) {
    return (
      <Badge tone="warning" size="sm">
        <Lock />
        No access granted yet
      </Badge>
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {granted.map((label) => (
        <Badge key={label} tone="neutral" size="sm">
          {label}
        </Badge>
      ))}
    </div>
  )
}

function ChildCard({ child }: { child: ChildSummary }) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <Avatar name={child.full_name} src={child.photo_url} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{child.full_name}</h3>
            <Badge tone="outline" size="sm">
              {RELATION_LABEL[child.relation]}
            </Badge>
            {child.is_primary && (
              <Badge tone="primary" size="sm">
                Primary contact
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[child.class_name, child.admission_number].filter(Boolean).join(' · ') ||
              'No class recorded'}
          </p>
          <div className="mt-3">
            <PermissionChips child={child} />
          </div>
        </div>

        <Button size="sm" asChild>
          <Link to={`/parent/children/${child.student_id}`}>Open</Link>
        </Button>
      </div>
    </Card>
  )
}

export default function ParentDashboard() {
  const children = useMyChildren()

  return (
    <div>
      <HeroHeader
        eyebrow="Family"
        title="My children"
        description="Everyone you have been given access to. What you can see is set per child by the school."
      />

      <QueryBoundary
        query={children}
        loading={
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            icon={<UsersRound />}
            title="No children linked to your account"
            description="Your login works, but the school has not linked it to a student yet. The front office can do that from the Families screen."
          />
        }
      >
        {(rows) => (
          <div className="space-y-3">
            {rows.map((child) => (
              <ChildCard key={child.student_id} child={child} />
            ))}
          </div>
        )}
      </QueryBoundary>
    </div>
  )
}

// ================================================================ one child

function ChildFeesPanel({ studentId }: { studentId: number }) {
  // Null until the parent picks one — the first load takes the base currency
  // rather than guessing at one that may not be offered.
  const [currency, setCurrency] = useState<string | null>(null)
  const fees = useChildFees(studentId, { currency: currency ?? undefined })
  const invoices = useChildInvoices(studentId)

  return (
    <div className="space-y-5">
      <QueryBoundary
        query={fees}
        loading={<Skeleton className="h-72 w-full rounded-xl" />}
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
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">
              No invoice has been issued yet. The breakdown above is what the fees come to.
            </p>
          </Card>
        }
      >
        {(rows) => (
          <Card className="p-5">
            <h3 className="text-sm font-semibold">Invoices</h3>
            <ul className="mt-2 divide-y divide-border">
              {rows.map((invoice) => (
                <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
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
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums">
                      {formatMoney(invoice.total_amount, invoice.currency)}
                    </p>
                    {invoice.amount_outstanding > 0 && (
                      <p className="text-xs tabular-nums text-warning">
                        {formatMoney(invoice.amount_outstanding, invoice.currency)} outstanding
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </QueryBoundary>
    </div>
  )
}

export function ParentChildPage() {
  const { studentId } = useParams<{ studentId: string }>()
  const id = Number(studentId)
  const children = useMyChildren()
  const profile = useMyChildProfile(id)

  const child = children.data?.find((c) => c.student_id === id) ?? null

  // Until the switcher has loaded we do not know which flags this child
  // carries, so nothing conditional is rendered — guessing would flash a fee
  // tab at a parent who may not have one.
  if (children.isPending) {
    return <Skeleton className="h-96 w-full rounded-xl" />
  }

  if (!child) {
    return (
      <EmptyState
        icon={<Lock />}
        title="You do not have access to this child"
        description="Either the link was removed, or this is not one of your children. Access is checked on every request, so a revoked link stops working immediately."
        action={
          <Button asChild>
            <Link to="/parent">Back to my children</Link>
          </Button>
        }
      />
    )
  }

  return (
    <div>
      <PageHeader
        title={child.full_name}
        description={[child.class_name, child.admission_number].filter(Boolean).join(' · ')}
        actions={
          <Button variant="outline" asChild>
            <Link to="/parent">All my children</Link>
          </Button>
        }
      />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">
            <UserRound className="size-4" />
            Profile
          </TabsTrigger>
          {/* Each tab is gated on the flag rather than rendered and refused. */}
          {child.may_view_academics && (
            <TabsTrigger value="academics">
              <GraduationCap className="size-4" />
              Marks
            </TabsTrigger>
          )}
          {child.may_view_attendance && (
            <TabsTrigger value="attendance">
              <CalendarCheck className="size-4" />
              Attendance
            </TabsTrigger>
          )}
          {child.may_view_fees && (
            <TabsTrigger value="fees">
              <Receipt className="size-4" />
              Fees
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile">
          <QueryBoundary query={profile} loading={<Skeleton className="h-64 w-full rounded-xl" />}>
            {(data) => <ProfileSummary user={data} />}
          </QueryBoundary>
        </TabsContent>

        {child.may_view_academics && (
          <TabsContent value="academics">
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">
                Marks and report cards for {child.full_name} appear on their own screens. The
                school emails you a digest when parent reports are switched on.
              </p>
            </Card>
          </TabsContent>
        )}

        {child.may_view_attendance && (
          <TabsContent value="attendance">
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">
                {child.full_name}'s lessons, live classes and homework all appear on your{' '}
                <Link className="font-medium underline" to="/calendar">
                  calendar
                </Link>
                , tagged with their name.
              </p>
            </Card>
          </TabsContent>
        )}

        {child.may_view_fees && (
          <TabsContent value="fees">
            <ChildFeesPanel studentId={id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

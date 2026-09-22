import { AlertCircle, Info, Receipt } from 'lucide-react'
import * as React from 'react'

import type { FeeBreakdownOut, InstalmentOut } from '@/api/types'
import { formatDate } from '@/lib/datetime'
import { formatMoney } from '@/lib/tuition'
import {
  INSTALMENT_STATUS_LABEL,
  INSTALMENT_STATUS_TONE,
  splitBreakdownLines,
} from '@/lib/school'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

/**
 * The fee breakdown, rendered once for three audiences.
 *
 * `/fees/me`, `/parent/fees/children/{id}` and the admin preview all return
 * the same `FeeBreakdownOut` from the same computation, so they get the same
 * component — three renderers would be three chances for the parent's total to
 * differ from the student's.
 *
 * NOTHING here recomputes a total. The server's arithmetic is
 *
 *   subtotal − discount_total + tax_total + convenience_total
 *     ± rounding_adjustment = total_amount
 *
 * and every figure below is read straight off the response. `charge_total` is
 * already the non-teaching part of `subtotal`, which is why "Fees" and
 * "Charges" can be separate sections without adding anything up.
 */

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: React.ReactNode
  value: React.ReactNode
  muted?: boolean
  strong?: boolean
}) {
  return (
    <div
      className={
        strong
          ? 'flex items-center justify-between gap-4 border-t border-border pt-3 text-base font-semibold'
          : 'flex items-center justify-between gap-4 text-sm'
      }
    >
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  )
}

function InstalmentRow({
  instalment,
  currency,
}: {
  instalment: InstalmentOut
  currency: string
}) {
  // `is_overdue` and `days_overdue` are derived by the server at read time, so
  // this is correct the morning after a due date with no sweep having run.
  const status = instalment.is_overdue ? 'OVERDUE' : instalment.status

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{instalment.label}</span>
          <Badge tone={INSTALMENT_STATUS_TONE[status] ?? 'neutral'} size="sm">
            {INSTALMENT_STATUS_LABEL[status] ?? status}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {instalment.due_date ? `Due ${formatDate(instalment.due_date)}` : 'No due date'}
          {instalment.is_overdue && instalment.days_overdue > 0
            ? ` · ${instalment.days_overdue} days late`
            : ''}
          {instalment.late_fee_amount
            ? ` · late fee ${formatMoney(instalment.late_fee_amount, currency)}`
            : ''}
        </p>
        {/* What the figure is made of: tuition's share of this term, plus the
            admission fee in the term it falls in. */}
        {instalment.components && instalment.components.length > 0 && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {instalment.components
              .map((c) => `${c.name} ${formatMoney(c.amount, currency)}`)
              .join(' + ')}
          </p>
        )}
        {instalment.waived_reason && (
          <p className="mt-0.5 text-xs text-info">Written off — {instalment.waived_reason}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-medium tabular-nums">
          {formatMoney(instalment.amount, currency)}
        </p>
        {instalment.amount_paid > 0 && (
          <p className="text-xs tabular-nums text-muted-foreground">
            {formatMoney(instalment.amount_paid, currency)} paid
          </p>
        )}
      </div>
    </li>
  )
}

export function FeeBreakdownView({
  breakdown,
  /**
   * Skipped concessions answer "why is this family not getting the sibling
   * discount?" and are worth their weight on an ADMIN screen. On a parent's or
   * a student's they are noise about rules that were never theirs.
   */
  showSkippedDiscounts = false,
}: {
  breakdown: FeeBreakdownOut
  showSkippedDiscounts?: boolean
}) {
  const { fees, charges } = React.useMemo(
    () => splitBreakdownLines(breakdown),
    [breakdown],
  )
  const currency = breakdown.currency

  return (
    <div className="space-y-4">
      <Card className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">
              {breakdown.student_name ?? 'Fee breakdown'}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {breakdown.structure_name ?? 'No structure matched'}
              {breakdown.instalment_plan_name ? ` · ${breakdown.instalment_plan_name}` : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums">
              {formatMoney(breakdown.total_amount, currency)}
            </p>
            <p className="text-xs text-muted-foreground">Total payable</p>
          </div>
        </div>

        {breakdown.detail && (
          <div className="flex gap-2 rounded-lg border border-info/30 bg-info/8 p-3">
            <Info className="mt-0.5 size-4 shrink-0 text-info" />
            <p className="text-xs text-muted-foreground">{breakdown.detail}</p>
          </div>
        )}

        {fees.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Fees
            </p>
            {fees.map((line) => (
              <Row
                key={line.fee_head_id}
                label={line.name}
                value={formatMoney(line.amount, currency)}
              />
            ))}
          </div>
        )}

        {charges.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Charges
            </p>
            {charges.map((line) => (
              <Row
                key={line.fee_head_id}
                label={line.name}
                value={formatMoney(line.amount, currency)}
              />
            ))}
          </div>
        )}

        <div className="space-y-2 border-t border-border pt-3">
          <Row label="Subtotal" value={formatMoney(breakdown.subtotal, currency)} muted />

          {breakdown.discounts.map((discount, i) => (
            <Row
              key={discount.rule_id ?? i}
              label={
                <span className="text-success">
                  {discount.name ?? 'Concession'}
                  {discount.stacked ? ' (stacked)' : ''}
                </span>
              }
              value={<span className="text-success">−{formatMoney(discount.amount, currency)}</span>}
            />
          ))}

          {breakdown.tax_total > 0 && (
            <Row
              label={breakdown.tax_label}
              value={formatMoney(breakdown.tax_total, currency)}
              muted
            />
          )}

          {breakdown.convenience_total > 0 && (
            <Row
              label="Convenience charge"
              value={formatMoney(breakdown.convenience_total, currency)}
              muted
            />
          )}

          {breakdown.rounding_adjustment !== 0 && (
            <Row
              label="Rounding"
              value={`${breakdown.rounding_adjustment > 0 ? '+' : ''}${formatMoney(
                breakdown.rounding_adjustment,
                currency,
              )}`}
              muted
            />
          )}

          <Row
            label="Total"
            value={formatMoney(breakdown.total_amount, currency)}
            strong
          />
        </div>
      </Card>

      {breakdown.instalments.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold">When it falls due</h3>
          <ul className="mt-2 divide-y divide-border">
            {breakdown.instalments.map((instalment) => (
              <InstalmentRow
                key={instalment.label}
                instalment={instalment}
                currency={currency}
              />
            ))}
          </ul>
        </Card>
      )}

      {/* The support question, answered before it is asked. */}
      {showSkippedDiscounts && breakdown.discounts_not_applied.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Concessions that did not apply</h3>
          </div>
          <ul className="mt-3 space-y-2">
            {breakdown.discounts_not_applied.map((skipped, i) => (
              <li key={skipped.rule_id ?? i} className="text-sm">
                <span className="font-medium">{skipped.name ?? 'Rule'}</span>
                <span className="text-muted-foreground"> — {skipped.reason ?? 'did not match'}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!breakdown.gateway_enabled && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Receipt className="size-3.5" />
          Online payment is not available. Pay at the school office and the payment will be
          recorded against this account.
        </p>
      )}
    </div>
  )
}

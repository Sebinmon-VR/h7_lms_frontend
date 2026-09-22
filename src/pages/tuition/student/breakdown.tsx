import { Info, Receipt } from 'lucide-react'
import * as React from 'react'

import type { SubjectUsageOut, TuitionBreakdownLine, TuitionFeeBreakdownOut } from '@/api/types'
import { BILLING_MODE_LABEL, formatMoney, packageUsagePercent } from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'

/**
 * The tuition payment page's figures, rendered once for three audiences.
 *
 * The student's page, the office's preview and the invoice generator all run
 * one computation server-side, so they get one component here too — three
 * renderers would be three chances for the family's total to differ from the
 * bursar's.
 *
 * NOTHING below recomputes a total. The server's arithmetic is
 *
 *   subtotal − discount_total + tax_total + convenience_total
 *     ± rounding_adjustment = total_amount
 *
 * and every figure is read straight off the response.
 */

/**
 * One subject's share of the package's classes.
 *
 * Counts only — the money is on the package. These rows are what a family
 * checks against the timetable: "14 classes" is an argument, "6 English,
 * 5 Maths, 3 Science" is a lookup.
 */
function SubjectRow({ subject }: { subject: SubjectUsageOut }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <p className="text-sm">{subject.subject_name ?? `Subject ${subject.subject_id ?? ''}`}</p>
        {subject.teacher_name && (
          <p className="text-2xs text-muted-foreground">{subject.teacher_name}</p>
        )}
      </div>
      <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">{subject.classes_counted}</span>{' '}
        {subject.classes_counted === 1 ? 'class' : 'classes'}
        {subject.sessions_missed > 0 && (
          <span className="text-warning"> · {subject.sessions_missed} missed</span>
        )}
        {subject.teacher_no_show > 0 && (
          <span> · {subject.teacher_no_show} teacher absent, not counted</span>
        )}
      </p>
    </li>
  )
}

/**
 * The package line: what was counted, at what rate, and where the student
 * stands on the allowance.
 *
 * Under PER_CLASS billing the amount is classes × rate. Under PACKAGE billing
 * it is the flat charge plus any overage, and the flat charge is zero on every
 * invoice but the first of the term — `note` says so, and is shown rather
 * than leaving a zero to be queried.
 */
function PackageLine({
  line,
  currency,
  baseCurrency,
  converted,
}: {
  line: TuitionBreakdownLine
  currency: string
  baseCurrency?: string | null
  converted: boolean
}) {
  const included = line.classes_included
  const used = line.classes_used_to_date
  const percent = packageUsagePercent(used, included)
  const over = included != null && used > included

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{line.package_name ?? 'No package assigned'}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[
              line.classes_billed
                ? `${line.classes_billed} ${line.classes_billed === 1 ? 'class' : 'classes'} this period`
                : 'No classes counted this period',
              line.unit_amount != null && line.package_id
                ? `at ${formatMoney(line.unit_amount, currency)} each`
                : null,
              line.billing_mode ? BILLING_MODE_LABEL[line.billing_mode] : null,
              line.term_name,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {converted && line.base_unit_amount != null && baseCurrency && line.package_id && (
            <p className="mt-1 text-2xs text-muted-foreground">
              {formatMoney(line.base_unit_amount, baseCurrency)} each before conversion
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-medium tabular-nums">{formatMoney(line.amount, currency)}</p>
          {line.discount_amount > 0 && (
            <p className="text-xs tabular-nums text-success">
              −{formatMoney(line.discount_amount, currency)}
            </p>
          )}
        </div>
      </div>

      {/* PACKAGE billing: the flat charge and any overage, itemised, so a bill
          that reads "15,000 + 2 classes" explains both numbers. */}
      {line.billing_mode === 'PACKAGE' && line.package_id && (
        <dl className="space-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Package charge</dt>
            <dd className="tabular-nums">{formatMoney(line.package_amount, currency)}</dd>
          </div>
          {line.overage_classes > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                {line.overage_classes} {line.overage_classes === 1 ? 'class' : 'classes'} over
                the allowance
              </dt>
              <dd className="tabular-nums">{formatMoney(line.overage_amount, currency)}</dd>
            </div>
          )}
          {line.note && <p className="text-muted-foreground">{line.note}</p>}
        </dl>
      )}

      {included != null && (
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {used} of {included} classes used
              {line.usage_from ? ` since ${line.usage_from}` : ''}
            </span>
            <span className={over ? 'font-medium text-warning' : 'text-muted-foreground'}>
              {over
                ? `${used - included} over the allowance`
                : `${line.classes_remaining ?? 0} remaining`}
            </span>
          </div>
          <ProgressBar
            value={percent}
            tone={over ? 'warning' : percent >= 80 ? 'info' : 'primary'}
            size="sm"
            label="Package usage"
          />
        </div>
      )}

      {line.subjects.length > 0 && (
        <div>
          <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Where the classes went
          </p>
          <ul className="mt-1 divide-y divide-border">
            {line.subjects.map((subject) => (
              <SubjectRow key={String(subject.enrollment_id)} subject={subject} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

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

export function TuitionBreakdownView({
  breakdown,
}: {
  breakdown: TuitionFeeBreakdownOut
}) {
  const currency = breakdown.currency
  const converted =
    !!breakdown.base_currency && breakdown.base_currency !== currency
  // This currency's own charge rules, when the server sent them, so the page
  // can say "GST 18% + 2% convenience" beside the figures it produced.
  const option = breakdown.currency_options?.find((o) => o.code === currency)
  const recommended = breakdown.recommended_currency
  const unpriced = !breakdown.package_id && breakdown.sessions_conducted > 0

  return (
    <div className="space-y-4">
      <Card className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">
              {breakdown.student_name ?? 'Tuition fees'}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {breakdown.period_start} — {breakdown.period_end}
              {breakdown.academic_year_name ? ` · ${breakdown.academic_year_name}` : ''}
              {breakdown.term_name ? ` · ${breakdown.term_name}` : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums">
              {formatMoney(breakdown.total_amount, currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {breakdown.classes_billed} {breakdown.classes_billed === 1 ? 'class' : 'classes'}{' '}
              counted this period
            </p>
            <p className="mt-1 flex flex-wrap items-center justify-end gap-1.5 text-2xs text-muted-foreground">
              {recommended && currency === recommended && (
                <Badge tone="primary" size="sm">
                  Recommended currency
                </Badge>
              )}
              {option?.charges_summary && <span>{option.charges_summary}</span>}
            </p>
          </div>
        </div>

        {breakdown.detail && (
          <div
            className={
              unpriced
                ? 'flex gap-2 rounded-lg border border-warning/30 bg-warning/8 p-3'
                : 'flex gap-2 rounded-lg border border-info/30 bg-info/8 p-3'
            }
          >
            <Info
              className={
                unpriced ? 'mt-0.5 size-4 shrink-0 text-warning' : 'mt-0.5 size-4 shrink-0 text-info'
              }
            />
            <p className="text-xs text-muted-foreground">{breakdown.detail}</p>
          </div>
        )}

        {breakdown.line_items.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your package
            </p>
            <div className="mt-2 space-y-4">
              {breakdown.line_items.map((line, index) => (
                <PackageLine
                  key={line.assignment_id ?? line.package_id ?? index}
                  line={line}
                  currency={currency}
                  baseCurrency={breakdown.base_currency}
                  converted={converted}
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            No classes took place in this period, so there is nothing to charge.
          </p>
        )}

        <div className="space-y-2 border-t border-border pt-3">
          <Row label="Subtotal" value={formatMoney(breakdown.subtotal, currency)} muted />

          {breakdown.discount_total > 0 && (
            <Row
              label={<span className="text-success">Concession</span>}
              value={
                <span className="text-success">
                  −{formatMoney(breakdown.discount_total, currency)}
                </span>
              }
            />
          )}

          {breakdown.tax_total > 0 && (
            <Row
              label={
                option?.tax_percent
                  ? `${breakdown.tax_label} (${option.tax_percent}%${option.tax_inclusive ? ', included' : ''})`
                  : breakdown.tax_label
              }
              value={formatMoney(breakdown.tax_total, currency)}
              muted
            />
          )}

          {breakdown.convenience_total > 0 && (
            <Row
              label={
                option && (option.convenience_percent || option.convenience_amount)
                  ? `Convenience charge (${[
                      option.convenience_percent ? `${option.convenience_percent}%` : null,
                      option.convenience_amount
                        ? formatMoney(option.convenience_amount, currency)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' + ')})`
                  : 'Convenience charge'
              }
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

          <Row label="Total" value={formatMoney(breakdown.total_amount, currency)} strong />
        </div>

        {/* Said plainly, because it is the question this page raises: a payer
            looking at a total naturally assumes it is due. It is not — the
            invoice is the bill. */}
        <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          <Receipt className="size-3.5 shrink-0" />
          This is what the period has come to so far. It becomes payable when the office
          issues an invoice for it.
        </p>
      </Card>

      {!breakdown.gateway_enabled && (
        <p className="text-xs text-muted-foreground">
          Online payment is not available. Pay at the office and it will be recorded against
          your account.
        </p>
      )}

      {converted && (
        <Badge tone="neutral" size="sm">
          Converted from {breakdown.base_currency} at {breakdown.exchange_rate}
        </Badge>
      )}
    </div>
  )
}

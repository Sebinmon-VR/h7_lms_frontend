import {
  ArrowLeft,
  Banknote,
  Building2,
  Check,
  CircleAlert,
  CreditCard,
  ExternalLink,
  Landmark,
  Lock,
  ShieldCheck,
  Smartphone,
  Wallet,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type {
  GatewayMethod,
  InstalmentOut,
  PaymentIntentCreate,
  PaymentIntentOut,
  Program,
} from '@/api/types'
import { useSupportContact } from '@/queries/support.queries'
import { formatDate, formatDateTime } from '@/lib/datetime'
import { formatMoney } from '@/lib/tuition'
import {
  GATEWAY_METHOD_HINT,
  GATEWAY_METHOD_LABEL,
  INSTALMENT_STATUS_LABEL,
  INSTALMENT_STATUS_TONE,
  INTENT_STATUS_LABEL,
  INTENT_STATUS_TONE,
  OFFLINE_GATEWAY_METHODS,
  ONLINE_GATEWAY_METHODS,
} from '@/lib/school'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, FormError } from '@/components/forms/field'

/**
 * The checkout — one page, both billers.
 *
 * Shaped like a payment gateway's hosted page because that is what a payer
 * expects at the moment money is involved: the order on the left, the amount
 * and the button on the right, the method as tiles, a lock in the corner. The
 * school's instalment invoice and the tuition package invoice both arrive here
 * through `CheckoutInvoice`, so the two products' payers see one flow.
 *
 * What happens on "Pay" is decided server-side and rendered here by status.
 * An online method comes back with a `checkout_url` when a provider is wired
 * and the payer is sent there; until one is, it comes back CREATED with a
 * `detail` saying so, and the page shows that plainly with the reference to
 * quote instead. An offline method's intent IS the reference. Nothing here
 * pretends a payment happened that did not.
 */

export interface CheckoutLine {
  key: string
  label: string
  detail?: string | null
  amount: number
}

export interface CheckoutAdjustment {
  key: string
  label: string
  amount: number
  /** Shown subtracted — a concession, not a charge. */
  negative?: boolean
}

export interface CheckoutInvoice {
  id: string
  /** The number the payer quotes: the invoice number, or the id when there is none. */
  reference: string
  title: string
  subtitle?: string | null
  currency: string
  total: number
  paid: number
  outstanding: number
  dueDate?: string | null
  isOverdue?: boolean
  lines: CheckoutLine[]
  adjustments: CheckoutAdjustment[]
  /** Empty for a biller with no schedule; the tuition invoice is paid whole. */
  instalments: InstalmentOut[]
  gatewayEnabled: boolean
  gatewayProvider?: string | null
}

export interface CheckoutProps {
  invoice: CheckoutInvoice
  /** Who is being paid — "H7 School", "H7 Online Tuition". */
  merchant: string
  program: Program
  backTo: string
  backLabel?: string
  /** Earlier attempts on this invoice, newest first. */
  intents: PaymentIntentOut[]
  onPay: (body: PaymentIntentCreate) => Promise<PaymentIntentOut>
  paying: boolean
}

type Choice = { kind: 'full' } | { kind: 'instalment'; label: string } | { kind: 'custom' }

const METHOD_ICON: Record<GatewayMethod, React.ComponentType<{ className?: string }>> = {
  UPI: Smartphone,
  CARD: CreditCard,
  NET_BANKING: Landmark,
  WALLET: Wallet,
  BANK_TRANSFER: Building2,
  OFFICE: Banknote,
}

function outstandingInstalments(instalments: InstalmentOut[]): InstalmentOut[] {
  return instalments.filter(
    (i) => i.status !== 'PAID' && i.status !== 'WAIVED' && (i.outstanding ?? i.amount) > 0,
  )
}

function instalmentOwing(instalment: InstalmentOut): number {
  return instalment.outstanding ?? Math.max(instalment.amount - instalment.amount_paid, 0)
}

function isOnline(method: GatewayMethod | null): boolean {
  return method != null && ONLINE_GATEWAY_METHODS.includes(method)
}

// ----------------------------------------------------------------- chrome

function Stepper({ current }: { current: 0 | 1 | 2 }) {
  const steps = ['Review', 'Pay', 'Done']
  return (
    <ol className="mb-6 flex items-center gap-2 text-xs" aria-label="Checkout progress">
      {steps.map((step, index) => {
        const done = index < current
        const active = index === current
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full border text-2xs font-semibold',
                done && 'border-success bg-success text-white',
                active && 'border-primary bg-primary text-white',
                !done && !active && 'border-border text-muted-foreground',
              )}
              aria-current={active ? 'step' : undefined}
            >
              {done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span className={cn('font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>
              {step}
            </span>
            {index < steps.length - 1 && (
              <span aria-hidden className="mx-1 h-px w-8 bg-border sm:w-12" />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function OptionRow({
  selected,
  onSelect,
  title,
  subtitle,
  amount,
  currency,
  children,
}: {
  selected: boolean
  onSelect: () => void
  title: React.ReactNode
  subtitle?: React.ReactNode
  amount?: number
  currency: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-xl border transition-colors',
        selected ? 'border-primary bg-primary/[0.04]' : 'border-border hover:border-primary/40',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span
          aria-hidden
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-full border-2',
            selected ? 'border-primary' : 'border-muted-foreground/40',
          )}
        >
          {selected && <span className="size-2 rounded-full bg-primary" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          {subtitle && <span className="mt-0.5 block text-xs text-muted-foreground">{subtitle}</span>}
        </span>
        {amount !== undefined && (
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {formatMoney(amount, currency)}
          </span>
        )}
      </button>
      {selected && children && <div className="border-t border-border px-4 py-3.5">{children}</div>}
    </div>
  )
}

function MethodTile({
  method,
  selected,
  disabled,
  onSelect,
}: {
  method: GatewayMethod
  selected: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  const Icon = METHOD_ICON[method]
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors',
        selected ? 'border-primary bg-primary/[0.04] ring-1 ring-primary/30' : 'border-border',
        disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-primary/40',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          selected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          {GATEWAY_METHOD_LABEL[method]}
          {disabled && (
            <Badge tone="neutral" size="sm">
              Coming soon
            </Badge>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {GATEWAY_METHOD_HINT[method]}
        </span>
      </span>
    </button>
  )
}

// ----------------------------------------------------------------- panels

function OrderSummary({ invoice, merchant }: { invoice: CheckoutInvoice; merchant: string }) {
  const { currency } = invoice
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Paying to
          </p>
          <h2 className="text-base font-semibold">{merchant}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {invoice.title}
            {invoice.subtitle ? ` · ${invoice.subtitle}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Invoice
          </p>
          <p className="text-sm font-semibold">{invoice.reference}</p>
          {invoice.dueDate && (
            <p className={cn('text-xs', invoice.isOverdue ? 'text-danger' : 'text-muted-foreground')}>
              {invoice.isOverdue ? 'Was due' : 'Due'} {formatDate(invoice.dueDate)}
            </p>
          )}
        </div>
      </div>

      <ul className="mt-4 divide-y divide-border border-t border-border">
        {invoice.lines.map((line) => (
          <li key={line.key} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm">{line.label}</p>
              {line.detail && <p className="text-xs text-muted-foreground">{line.detail}</p>}
            </div>
            <span className="shrink-0 text-sm tabular-nums">{formatMoney(line.amount, currency)}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-2 space-y-1.5 border-t border-border pt-3 text-sm">
        {invoice.adjustments.map((row) => (
          <div key={row.key} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className={cn('tabular-nums', row.negative && 'text-success')}>
              {row.negative ? '−' : ''}
              {formatMoney(row.amount, currency)}
            </dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
          <dt>Invoice total</dt>
          <dd className="tabular-nums">{formatMoney(invoice.total, currency)}</dd>
        </div>
        {invoice.paid > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Already paid</dt>
            <dd className="tabular-nums text-success">−{formatMoney(invoice.paid, currency)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3 font-semibold">
          <dt>Outstanding</dt>
          <dd className="tabular-nums">{formatMoney(invoice.outstanding, currency)}</dd>
        </div>
      </dl>
    </Card>
  )
}

/**
 * The outcome of pressing Pay, by what the server said.
 *
 * Three honest states. A `checkout_url` means a provider took the handoff and
 * the payer is sent on. SUCCEEDED means money moved. Anything else is a saved
 * request with a reference — shown as such, never dressed up as a payment.
 */
function ResultPanel({
  intent,
  invoice,
  onAgain,
  backTo,
  backLabel,
}: {
  intent: PaymentIntentOut
  invoice: CheckoutInvoice
  onAgain: () => void
  backTo: string
  backLabel: string
}) {
  const method = (intent.requested_method ?? null) as GatewayMethod | null
  const reference = intent.reference ?? `PAY-${intent.id}`

  React.useEffect(() => {
    if (intent.checkout_url) {
      const timer = window.setTimeout(() => window.location.assign(intent.checkout_url as string), 800)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [intent.checkout_url])

  if (intent.status === 'SUCCEEDED') {
    return (
      <Card className="space-y-4 p-5 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/12 text-success">
          <Check className="size-6" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Payment received</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatMoney(intent.amount, intent.currency)} against invoice {invoice.reference}.
          </p>
        </div>
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Reference <strong className="text-foreground">{reference}</strong>
          {intent.provider_reference ? ` · ${intent.provider_reference}` : ''}
        </p>
        <Button block asChild>
          <Link to={backTo}>{backLabel}</Link>
        </Button>
      </Card>
    )
  }

  if (intent.checkout_url) {
    return (
      <Card className="space-y-4 p-5 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ExternalLink className="size-6" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Taking you to {intent.provider ?? 'the payment page'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete the payment of {formatMoney(intent.amount, intent.currency)} there. This
            invoice updates as soon as it is confirmed.
          </p>
        </div>
        <Button block asChild>
          <a href={intent.checkout_url}>
            <ExternalLink />
            Open the payment page
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">Reference {reference}</p>
      </Card>
    )
  }

  const failed = intent.status === 'FAILED' || intent.status === 'CANCELLED'
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full',
            failed ? 'bg-danger/10 text-danger' : 'bg-warning/12 text-warning',
          )}
        >
          <CircleAlert className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">
            {failed ? 'The payment did not go through' : 'Payment request saved'}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {intent.failure_reason ?? intent.detail ?? 'Quote the reference below when you pay.'}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          Your payment reference
        </p>
        <p className="mt-1 font-mono text-xl font-semibold tracking-wide">{reference}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatMoney(intent.amount, intent.currency)} · invoice {invoice.reference}
          {method ? ` · ${GATEWAY_METHOD_LABEL[method]}` : ''}
        </p>
      </div>

      {!failed && (
        <ol className="space-y-1.5 text-sm text-muted-foreground">
          {method === 'BANK_TRANSFER' ? (
            <>
              <li>1. Transfer {formatMoney(intent.amount, intent.currency)} to the account the office gave you.</li>
              <li>
                2. Put <strong className="text-foreground">{reference}</strong> in the transfer remarks.
              </li>
              <li>3. The office matches it and this invoice updates — nothing to send afterwards.</li>
            </>
          ) : (
            <>
              <li>
                1. Take <strong className="text-foreground">{reference}</strong> to the office, or quote
                it on a transfer.
              </li>
              <li>2. They record the payment against invoice {invoice.reference}.</li>
              <li>3. It shows here the moment they do.</li>
            </>
          )}
        </ol>
      )}

      <div className="flex flex-col gap-2">
        <Button variant="outline" block onClick={onAgain}>
          {failed ? 'Try again' : 'Start another payment'}
        </Button>
        <Button variant="ghost" block asChild>
          <Link to={backTo}>{backLabel}</Link>
        </Button>
      </div>
    </Card>
  )
}

function Attempts({ intents, currency }: { intents: PaymentIntentOut[]; currency: string }) {
  if (intents.length === 0) return null
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">Payment attempts on this invoice</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Every attempt is kept, including the ones that did not complete. Only a paid one counts
        against the invoice.
      </p>
      <ul className="mt-3 divide-y divide-border">
        {intents.map((intent) => {
          const method = (intent.requested_method ?? null) as GatewayMethod | null
          return (
            <li key={intent.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-mono font-medium">{intent.reference ?? `PAY-${intent.id}`}</span>
                  {method ? (
                    <span className="text-muted-foreground"> · {GATEWAY_METHOD_LABEL[method]}</span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {intent.created_at ? formatDateTime(intent.created_at) : ''}
                  {intent.instalment_label ? ` · ${intent.instalment_label}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={INTENT_STATUS_TONE[intent.status]} size="sm">
                  {INTENT_STATUS_LABEL[intent.status]}
                </Badge>
                <span className="text-sm font-semibold tabular-nums">
                  {formatMoney(intent.amount, intent.currency || currency)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

// ---------------------------------------------------------------- the page

export function Checkout({
  invoice,
  merchant,
  program,
  backTo,
  backLabel = 'Back to my fees',
  intents,
  onPay,
  paying,
}: CheckoutProps) {
  const contact = useSupportContact(program)
  const owing = React.useMemo(() => outstandingInstalments(invoice.instalments), [invoice.instalments])
  const { currency, outstanding } = invoice

  const [choice, setChoice] = React.useState<Choice>({ kind: 'full' })
  const [custom, setCustom] = React.useState('')
  // The gateway's tiles are offered when the school takes online payment;
  // otherwise the offline routes are the ones that work, and the first of
  // them is preselected so the button is never dead on arrival.
  const [method, setMethod] = React.useState<GatewayMethod>(
    invoice.gatewayEnabled ? 'UPI' : 'OFFICE',
  )
  const [result, setResult] = React.useState<PaymentIntentOut | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const amount = React.useMemo(() => {
    if (choice.kind === 'full') return outstanding
    if (choice.kind === 'instalment') {
      const found = invoice.instalments.find((i) => i.label === choice.label)
      return found ? instalmentOwing(found) : 0
    }
    const parsed = Number(custom)
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0
  }, [choice, custom, invoice.instalments, outstanding])

  const tooMuch = amount > outstanding + 0.001
  const valid = amount > 0 && !tooMuch
  const remaining = Math.max(outstanding - amount, 0)
  const online = isOnline(method)

  const pay = async () => {
    if (!valid) return
    setError(null)
    try {
      const intent = await onPay({
        amount,
        instalment_label: choice.kind === 'instalment' ? choice.label : null,
        method,
      })
      setResult(intent)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'The payment could not be started.')
    }
  }

  const step: 0 | 1 | 2 = result ? 2 : 1

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to={backTo}>
            <ArrowLeft />
            {backLabel}
          </Link>
        </Button>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          Secure checkout · {merchant}
        </span>
      </div>

      <Stepper current={step} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="space-y-5">
          <OrderSummary invoice={invoice} merchant={merchant} />

          {!result && (
            <>
              <Card className="p-5">
                <h2 className="text-sm font-semibold">How much are you paying?</h2>
                <div className="mt-4 space-y-2.5">
                  <OptionRow
                    selected={choice.kind === 'full'}
                    onSelect={() => setChoice({ kind: 'full' })}
                    title="Everything outstanding"
                    subtitle="Settles the whole invoice."
                    amount={outstanding}
                    currency={currency}
                  />

                  {/* One row per instalment still owing. A part-paid one shows
                      what is LEFT, not its original figure — paying the
                      original again would overpay. */}
                  {owing.map((instalment) => (
                    <OptionRow
                      key={instalment.label}
                      selected={choice.kind === 'instalment' && choice.label === instalment.label}
                      onSelect={() => setChoice({ kind: 'instalment', label: instalment.label })}
                      title={
                        <span className="flex flex-wrap items-center gap-2">
                          {instalment.label}
                          {instalment.is_overdue && (
                            <Badge tone="danger" size="sm">
                              Overdue
                            </Badge>
                          )}
                          {instalment.amount_paid > 0 && (
                            <Badge tone={INSTALMENT_STATUS_TONE.PARTIALLY_PAID} size="sm">
                              {INSTALMENT_STATUS_LABEL.PARTIALLY_PAID}
                            </Badge>
                          )}
                        </span>
                      }
                      subtitle={
                        [
                          instalment.due_date ? `Due ${formatDate(instalment.due_date)}` : null,
                          instalment.components?.length
                            ? instalment.components
                                .map((c) => `${c.name} ${formatMoney(c.amount, currency)}`)
                                .join(' + ')
                            : null,
                          instalment.amount_paid > 0
                            ? `${formatMoney(instalment.amount_paid, currency)} already paid`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || undefined
                      }
                      amount={instalmentOwing(instalment)}
                      currency={currency}
                    />
                  ))}

                  <OptionRow
                    selected={choice.kind === 'custom'}
                    onSelect={() => setChoice({ kind: 'custom' })}
                    title="A different amount"
                    subtitle={
                      owing.length > 0
                        ? 'Part payment, applied to the oldest instalment first.'
                        : 'A part payment towards this invoice.'
                    }
                    currency={currency}
                  >
                    <Field
                      id="custom-amount"
                      label={`Amount (${currency})`}
                      error={tooMuch ? 'That is more than the invoice still owes.' : undefined}
                    >
                      <Input
                        id="custom-amount"
                        type="number"
                        min={0}
                        step="0.01"
                        value={custom}
                        onChange={(e) => setCustom(e.target.value)}
                        autoFocus
                      />
                    </Field>
                  </OptionRow>
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="text-sm font-semibold">How would you like to pay?</h2>
                {!invoice.gatewayEnabled && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Online payment is not switched on yet. The two routes below work today.
                  </p>
                )}
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2" role="radiogroup">
                  {ONLINE_GATEWAY_METHODS.map((m) => (
                    <MethodTile
                      key={m}
                      method={m}
                      selected={method === m}
                      disabled={!invoice.gatewayEnabled}
                      onSelect={() => setMethod(m)}
                    />
                  ))}
                </div>
                <p className="mb-2.5 mt-4 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                  Or pay offline
                </p>
                <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup">
                  {OFFLINE_GATEWAY_METHODS.map((m) => (
                    <MethodTile key={m} method={m} selected={method === m} onSelect={() => setMethod(m)} />
                  ))}
                </div>
              </Card>
            </>
          )}

          {result && <Attempts intents={intents} currency={currency} />}
        </div>

        {/* The pay panel, sticky: on a long list of instalments the figure
            being committed to has to stay in view while the choice changes. */}
        <div>
          <div className="space-y-4 lg:sticky lg:top-6">
            {result ? (
              <ResultPanel
                intent={result}
                invoice={invoice}
                backTo={backTo}
                backLabel={backLabel}
                onAgain={() => {
                  setResult(null)
                  setError(null)
                }}
              />
            ) : (
              <Card className="space-y-4 p-5">
                <div>
                  <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                    Paying now
                  </p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">
                    {formatMoney(amount, currency)}
                  </p>
                  {valid && remaining > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatMoney(remaining, currency)} will remain outstanding.
                    </p>
                  )}
                  {valid && remaining === 0 && (
                    <p className="mt-1 text-xs text-success">This settles the invoice in full.</p>
                  )}
                </div>

                <dl className="space-y-1.5 border-t border-border pt-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Method</dt>
                    <dd className="text-right">{GATEWAY_METHOD_LABEL[method]}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Invoice</dt>
                    <dd className="text-right">{invoice.reference}</dd>
                  </div>
                </dl>

                <FormError message={error} />

                <Button block size="lg" loading={paying} disabled={!valid} onClick={pay}>
                  {online ? <Lock /> : <Banknote />}
                  {online
                    ? `Pay ${formatMoney(amount, currency)}`
                    : method === 'BANK_TRANSFER'
                      ? 'Get a transfer reference'
                      : 'Get a payment reference'}
                </Button>

                <p className="flex items-start gap-2 text-2xs leading-relaxed text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                  {online
                    ? `You will be taken to ${invoice.gatewayProvider ?? 'the payment provider'} to complete the payment. Your card and bank details are never stored here.`
                    : 'No money is taken on this page. You get a reference to quote, and the office records the payment when it arrives.'}
                </p>
              </Card>
            )}

            {(contact.data?.phone || contact.data?.email) && (
              <Card className="p-4">
                <p className="text-xs font-semibold">Need help with this invoice?</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {contact.data.phone && (
                    <a className="font-medium text-foreground hover:underline" href={`tel:${contact.data.phone}`}>
                      {contact.data.phone}
                    </a>
                  )}
                  {contact.data.phone && contact.data.email ? ' · ' : ''}
                  {contact.data.email && (
                    <a className="font-medium text-foreground hover:underline" href={`mailto:${contact.data.email}`}>
                      {contact.data.email}
                    </a>
                  )}
                  {contact.data.hours ? ` · ${contact.data.hours}` : ''}
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>

      {!result && <div className="mt-5"><Attempts intents={intents} currency={currency} /></div>}
    </div>
  )
}

/**
 * The picker shown when more than one invoice is payable — a short list of
 * bills with one button each, rather than guessing which the payer meant.
 */
export interface PayableRow {
  id: string
  reference: string
  title: string
  subtitle?: string | null
  outstanding: number
  currency: string
  dueDate?: string | null
  isOverdue?: boolean
  href: string
}

export function PayablePicker({ rows }: { rows: PayableRow[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <p className="text-sm text-muted-foreground">
        You have more than one invoice outstanding. Pick the one you are paying.
      </p>
      {rows.map((row) => (
        <Card key={row.id} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{row.reference}</p>
                {row.isOverdue && (
                  <Badge tone="danger" size="sm">
                    Overdue
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.title}
                {row.subtitle ? ` · ${row.subtitle}` : ''}
                {row.dueDate ? ` · due ${formatDate(row.dueDate)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold tabular-nums">
                {formatMoney(row.outstanding, row.currency)}
              </span>
              <Button size="sm" asChild>
                <Link to={row.href}>Pay this</Link>
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

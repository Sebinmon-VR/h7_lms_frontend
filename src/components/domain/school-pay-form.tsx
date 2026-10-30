import {
  ArrowLeft,
  Building2,
  Check,
  CircleAlert,
  Coins,
  CreditCard,
  Landmark,
  ListChecks,
  Lock,
  Receipt,
  School,
  ShieldCheck,
  Smartphone,
  Wallet,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { FeeInvoiceOut, GatewayMethod, InstalmentOut, PaymentIntentOut } from '@/api/types'
import {
  useConfirmMyRazorpay,
  useMyInvoices,
  usePaymentQuote,
  useStartMyPayment,
} from '@/queries/finance.queries'
import { formatDate } from '@/lib/datetime'
import { GATEWAY_METHOD_HINT, GATEWAY_METHOD_LABEL } from '@/lib/school'
import { formatMoney } from '@/lib/tuition'
import { RazorpayDismissed, openRazorpay } from '@/lib/razorpay'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormError } from '@/components/forms/field'
import { StudentReceiptViewer } from '@/pages/student/fees'

/**
 * The school's fee payment form, laid out as a plain full-width form: rows of
 * a label column and the field beside it — the bill, the fees being paid, the
 * currency (a dropdown), the payment method (a radio list) — and the summary
 * with the Pay button in a column on the right.
 *
 * The bill is in rupees. The payer picks INR or AED; each carries its own tax
 * on top (INR 18%, AED 5% VAT) at the school's rate, and the bill is credited
 * the fees alone. Online payment opens Razorpay over this page; bank transfer
 * and the office hand back a reference to quote.
 */

const METHOD_ICON: Record<GatewayMethod, React.ComponentType<{ className?: string }>> = {
  UPI: Smartphone,
  CARD: CreditCard,
  NET_BANKING: Landmark,
  WALLET: Wallet,
  BANK_TRANSFER: Building2,
  OFFICE: School,
}

const CURRENCY_NAME: Record<string, string> = {
  INR: 'Indian Rupee',
  AED: 'UAE Dirham',
}

function owing(i: InstalmentOut): number {
  return Math.max(0, i.outstanding ?? i.amount - i.amount_paid)
}

function rateName(status?: string | null): string {
  return status === 'manual' || status === 'fallback_manual' ? 'School rate' : "Today's rate"
}

/** One row of the form: the label column (icon, title, hint) and the field beside it. */
function FormRow({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-3 border-b border-border py-6 sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-8">
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{label}</p>
          {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function TotalLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-6 py-1', strong ? 'text-base font-semibold' : 'text-sm')}>
      <dt className={strong ? undefined : 'text-muted-foreground'}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

/** What the page shows once Pay has been pressed. */
function Outcome({ intent, invoice, backTo }: { intent: PaymentIntentOut; invoice: FeeInvoiceOut; backTo: string }) {
  const paid = intent.status === 'SUCCEEDED'
  const reference = intent.reference ?? `PAY-${intent.id}`
  const charge = intent.charge
  // The bill refetches after the payment is credited; its last payment is this one.
  const invoices = useMyInvoices()
  const fresh = (invoices.data ?? []).find((i) => i.id === invoice.id)
  const lastIndex = fresh && fresh.payments.length > invoice.payments.length ? fresh.payments.length - 1 : null
  const [viewing, setViewing] = React.useState(false)
  return (
    <div className="w-full max-w-2xl border-y border-border">
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <span
          className={cn(
            'flex size-9 items-center justify-center rounded-full',
            paid ? 'bg-success/12 text-success' : 'bg-primary/10 text-primary',
          )}
        >
          {paid ? <Check className="size-5" /> : <Receipt className="size-5" />}
        </span>
        <div>
          <h2 className="text-base font-semibold">{paid ? 'Payment received' : 'Your payment reference'}</h2>
          <p className="text-sm text-muted-foreground">
            {paid
              ? `Paid against bill ${invoice.invoice_number ?? ''}. The school's receipt follows.`
              : intent.detail ?? 'Quote this reference when you pay. Your bill updates once the school records it.'}
          </p>
        </div>
      </div>
      <dl className="px-6 py-4">
        <TotalLine label="Reference" value={reference} />
        {intent.provider_reference && paid && <TotalLine label="Payment ID" value={intent.provider_reference} />}
        <TotalLine label="Fees" value={formatMoney(intent.amount, intent.currency)} />
        {charge && charge.tax_amount > 0 && (
          <TotalLine
            label={`${charge.tax_label ?? 'Tax'} ${charge.tax_percent}%`}
            value={formatMoney(charge.tax_amount, charge.currency)}
          />
        )}
        {charge && (charge.gateway_fee ?? 0) > 0 && (
          <TotalLine
            label={charge.gateway_fee_label ?? 'Online payment fee'}
            value={formatMoney(charge.gateway_fee ?? 0, charge.currency)}
          />
        )}
        {charge && <TotalLine label="Total" value={formatMoney(charge.total, charge.currency)} strong />}
      </dl>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">
        {paid && (
          <Button variant="outline" onClick={() => setViewing(true)} disabled={lastIndex == null}>
            <Receipt />
            {lastIndex == null ? 'Preparing your receipt…' : 'View receipt'}
          </Button>
        )}
        <Button asChild>
          <Link to={backTo}>Back to my fees</Link>
        </Button>
      </div>
      <StudentReceiptViewer
        view={viewing && lastIndex != null ? { invoiceId: invoice.id, index: lastIndex } : null}
        onClose={() => setViewing(false)}
      />
    </div>
  )
}

export function SchoolPayForm({ invoice, backTo }: { invoice: FeeInvoiceOut; backTo: string }) {
  const start = useStartMyPayment('LMS')
  const confirm = useConfirmMyRazorpay('LMS')

  const open = React.useMemo(
    () => invoice.instalments.filter((i) => i.status !== 'WAIVED' && owing(i) > 0),
    [invoice.instalments],
  )
  const [ticked, setTicked] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(open.map((i) => [i.label, true])),
  )
  const amount = Math.round(open.reduce((s, i) => s + (ticked[i.label] ? owing(i) : 0), 0) * 100) / 100
  const allTicked = open.length > 0 && open.every((i) => ticked[i.label])

  const currencies = invoice.available_currencies?.length ? invoice.available_currencies : [invoice.currency]
  const [payCurrency, setPayCurrency] = React.useState(invoice.currency)
  // Each currency's own total, so the dropdown shows what each choice costs.
  const [methodChoice, setMethodChoice] = React.useState<GatewayMethod | null>(null)
  const goesOnline =
    invoice.gateway_enabled && (methodChoice == null || (methodChoice !== 'BANK_TRANSFER' && methodChoice !== 'OFFICE'))
  const firstQuote = usePaymentQuote('me', amount, currencies[0], goesOnline)
  const secondQuote = usePaymentQuote('me', currencies[1] ? amount : 0, currencies[1] ?? currencies[0], goesOnline)
  const quoteFor = (code: string) => (code === currencies[0] ? firstQuote : secondQuote)
  const quote = quoteFor(payCurrency)

  const online = invoice.gateway_enabled
  const foreign = payCurrency !== invoice.currency
  // Razorpay takes other currencies on international cards only.
  const onlineMethods: GatewayMethod[] = foreign ? ['CARD'] : ['UPI', 'CARD', 'NET_BANKING', 'WALLET']
  const methods: GatewayMethod[] = [...(online ? onlineMethods : []), 'BANK_TRANSFER', 'OFFICE']
  const [method, setMethodState] = React.useState<GatewayMethod>(online ? 'UPI' : 'OFFICE')
  const setMethod = (m: GatewayMethod) => {
    setMethodState(m)
    setMethodChoice(m)
  }
  React.useEffect(() => {
    if (!methods.includes(method)) setMethod(methods[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foreign, online])

  const [result, setResult] = React.useState<PaymentIntentOut | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const isOnline = method !== 'BANK_TRANSFER' && method !== 'OFFICE'

  const pay = async () => {
    if (amount <= 0) return setError('Tick at least one fee to pay.')
    setError(null)
    setBusy(true)
    try {
      const intent = await start.mutateAsync({
        invoiceId: invoice.id,
        body: {
          amount,
          allocations: open.filter((i) => ticked[i.label]).map((i) => ({ label: i.label, amount: owing(i) })),
          currency: payCurrency,
          method,
        },
      })
      if (intent.checkout) {
        const handedBack = await openRazorpay(intent.checkout, { merchant: 'H7 School' })
        setResult(await confirm.mutateAsync({ intentId: intent.id, body: handedBack }))
      } else {
        setResult(intent)
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      if (err instanceof RazorpayDismissed) {
        setError('The payment window was closed before paying. Nothing was charged.')
      } else {
        setError((err as { message?: string })?.message ?? 'The payment could not be started.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (result) return <Outcome intent={result} invoice={invoice} backTo={backTo} />

  return (
    <div className="w-full">
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
        <Link to={backTo}>
          <ArrowLeft />
          Back to my fees
        </Link>
      </Button>

      <div className="grid w-full gap-x-10 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 border-t border-border">
        {/* ------------------------------------------------ bill */}
        <FormRow icon={Receipt} label="Bill">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Bill number</dt>
              <dd className="whitespace-nowrap font-medium">{invoice.invoice_number ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Session</dt>
              <dd className="font-medium">{invoice.academic_year_name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Student</dt>
              <dd className="truncate font-medium">{invoice.student_name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Still to pay</dt>
              <dd className="font-semibold tabular-nums">{formatMoney(invoice.amount_outstanding, invoice.currency)}</dd>
            </div>
          </dl>
        </FormRow>

        {/* ------------------------------------------------ fees */}
        <FormRow icon={ListChecks} label="Fees to pay" hint="Tick the fees you are paying now.">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="w-8 pb-2">
                  <Checkbox
                    aria-label="Pay every fee"
                    checked={allTicked}
                    onCheckedChange={(v) => setTicked(Object.fromEntries(open.map((i) => [i.label, v === true])))}
                  />
                </th>
                <th className="pb-2 font-medium">Fee</th>
                <th className="hidden pb-2 font-medium sm:table-cell">Due date</th>
                <th className="pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {open.map((i) => (
                <tr key={i.label} className="border-b border-border last:border-b-0">
                  <td className="py-2.5">
                    <Checkbox
                      aria-label={`Pay ${i.label}`}
                      checked={!!ticked[i.label]}
                      onCheckedChange={(v) => setTicked((t) => ({ ...t, [i.label]: v === true }))}
                    />
                  </td>
                  <td className="py-2.5">
                    <span className="font-medium">{i.label}</span>
                    {i.is_overdue && (
                      <Badge tone="danger" size="sm" className="ml-2">
                        Overdue
                      </Badge>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap py-2.5 text-muted-foreground sm:table-cell">
                    {i.due_date ? formatDate(i.due_date) : '—'}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{formatMoney(owing(i), invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </FormRow>

        {/* ------------------------------------------------ currency */}
        <FormRow icon={Coins} label="Currency" hint="Your bill is in rupees. Its tax is added on top.">
          <div className="max-w-sm">
            <Select value={payCurrency} onValueChange={setPayCurrency}>
              <SelectTrigger id="pay-currency" aria-label="Currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((code) => {
                  const q = quoteFor(code).data
                  return (
                    <SelectItem key={code} value={code}>
                      {code} — {CURRENCY_NAME[code] ?? code}
                      {q && amount > 0 ? ` · ${formatMoney(q.total, q.currency)}` : ''}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            {quote.data && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {quote.data.tax_percent
                  ? `${quote.data.tax_label ?? 'Tax'} ${quote.data.tax_percent}% is added.`
                  : 'No tax is added.'}
                {foreign &&
                  ` ${rateName(quote.data.rate_status)}: 1 ${quote.data.currency} = ${formatMoney(1 / quote.data.exchange_rate, invoice.currency)}.`}
              </p>
            )}
          </div>
        </FormRow>

        {/* ------------------------------------------------ method */}
        <FormRow
          icon={Wallet}
          label="Payment method"
          hint={foreign ? 'In AED, pay online by an international card.' : undefined}
        >
          <fieldset className="space-y-1" aria-label="Payment method">
            {methods.map((m) => {
              const Icon = METHOD_ICON[m]
              const label = foreign && m === 'CARD' ? 'International card' : GATEWAY_METHOD_LABEL[m]
              const hint = foreign && m === 'CARD' ? 'Visa or Mastercard issued outside India' : GATEWAY_METHOD_HINT[m]
              return (
                <label
                  key={m}
                  className="flex cursor-pointer items-center gap-3 rounded px-1 py-2 hover:bg-muted/40"
                >
                  <input
                    type="radio"
                    name="pay-method"
                    className="size-4 accent-[hsl(var(--primary))]"
                    checked={method === m}
                    onChange={() => setMethod(m)}
                  />
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium">{label}</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">— {hint}</span>
                </label>
              )
            })}
            {!online && (
              <p className="flex items-start gap-2 pt-1 text-xs text-muted-foreground">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                Online payment is not switched on for the school yet.
              </p>
            )}
          </fieldset>
        </FormRow>

      </div>

        {/* ------------------------------------------------ summary + pay */}
        <aside className="border-t border-border pt-6 lg:sticky lg:top-20 lg:self-start lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Payment summary</h2>
          <div>
            <dl>
              <TotalLine label="Fees" value={formatMoney(amount, invoice.currency)} />
              {quote.data && foreign && (
                <TotalLine label={`Fees in ${quote.data.currency}`} value={formatMoney(quote.data.fee_amount, quote.data.currency)} />
              )}
              {quote.data && (
                <TotalLine
                  label={quote.data.tax_percent ? `${quote.data.tax_label ?? 'Tax'} ${quote.data.tax_percent}%` : 'Tax'}
                  value={formatMoney(quote.data.tax_amount, quote.data.currency)}
                />
              )}
              {quote.data && (quote.data.gateway_fee ?? 0) > 0 && (
                <TotalLine
                  label={quote.data.gateway_fee_label ?? 'Online payment fee'}
                  value={formatMoney(quote.data.gateway_fee ?? 0, quote.data.currency)}
                />
              )}
              <div className="mt-1 border-t border-border pt-1">
                <TotalLine
                  label="Total to pay"
                  value={quote.data ? formatMoney(quote.data.total, quote.data.currency) : '—'}
                  strong
                />
              </div>
            </dl>
            <div className="mt-3 space-y-2">
              <FormError message={error} />
              <Button block size="lg" onClick={pay} loading={busy} disabled={amount <= 0 || !quote.data}>
                {isOnline ? <Lock /> : <Receipt />}
                {isOnline
                  ? `Pay ${quote.data ? formatMoney(quote.data.total, quote.data.currency) : ''}`
                  : 'Get a payment reference'}
              </Button>
            </div>
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            {isOnline
              ? 'Payments are processed securely by Razorpay. Your card and bank details are never stored by the school.'
              : 'You get a reference to quote. The school records your payment and your bill updates.'}
          </p>
        </aside>
      </div>
    </div>
  )
}

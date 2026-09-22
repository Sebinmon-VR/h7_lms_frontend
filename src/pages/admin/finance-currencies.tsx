import {
  AlertTriangle,
  Check,
  Coins,
  Globe,
  Info,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react'
import * as React from 'react'

import type {
  CurrencyConfigOut,
  CurrencyConfigUpdate,
  CurrencyOptionOut,
  Program,
  RateStatus,
} from '@/api/types'
import {
  useCurrencySettings,
  useFxStatus,
  useRefreshRates,
  useUpdateCurrencies,
} from '@/queries/finance.queries'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field } from '@/components/forms/field'
import { QueryBoundary } from '@/components/feedback/query-boundary'

/**
 * Currencies, rates and the charges that differ between them.
 *
 * The idea this screen has to get across is that a currency is a RATE AND A
 * SET OF CHARGES, not a multiplier. A domestic INR transfer carries a gateway
 * percentage an AED card payment does not, and the tax position is rarely the
 * same — so switching currency moves the total by more than the exchange rate,
 * and a payer who is not told that reads it as a mistake.
 *
 * Two things are surfaced that a naive version would hide:
 *
 *  - `rate_status` — how the rate on THIS response was actually obtained, as
 *    against `rate_source`, which is only what was asked for. A page claiming a
 *    live rate while serving the school's fallback is worse than one that says
 *    which it used.
 *  - `overrides` — which charge keys a currency sets for itself. Everything
 *    else fell through to the programme's finance settings, and an admin
 *    editing "the AED tax rate" needs to know whether they are looking at one.
 */

/** How each rate was obtained, in the words an administrator needs. */
const RATE_STATUS: Record<RateStatus, { label: string; tone: 'success' | 'info' | 'warning' | 'neutral'; hint: string }> = {
  base: { label: 'Base', tone: 'neutral', hint: 'Fees are entered in this currency. Its rate is always 1.' },
  manual: { label: 'Your rate', tone: 'info', hint: 'The figure you set.' },
  live: { label: 'Live', tone: 'success', hint: 'Fetched from the provider just now.' },
  cached: { label: 'Live (cached)', tone: 'success', hint: 'A recent provider response, reused rather than refetched.' },
  stale: {
    label: 'Stale',
    tone: 'warning',
    hint: 'The last good provider response, served because a refresh failed.',
  },
  fallback_manual: {
    label: 'Fell back to yours',
    tone: 'warning',
    hint: 'The provider was unreachable, so your own rate was used instead.',
  },
}

function statusOf(code: string) {
  return RATE_STATUS[code as RateStatus] ?? { label: code, tone: 'neutral' as const, hint: '' }
}

function num(value: string): number | undefined {
  const t = value.trim()
  if (!t) return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

/**
 * One currency's row.
 *
 * Edits are held locally and committed by the page's Save, so an admin can
 * change three currencies and send one merged update — the endpoint merges per
 * currency, and a save per keystroke would make a half-typed rate live.
 */
function CurrencyRow({
  config,
  draft,
  onChange,
  baseCurrency,
}: {
  config: CurrencyConfigOut
  draft: CurrencyConfigUpdate
  onChange: (patch: CurrencyConfigUpdate) => void
  baseCurrency: string
}) {
  const [open, setOpen] = React.useState(false)
  const status = statusOf(config.rate_status)
  const read = <K extends keyof CurrencyConfigUpdate>(key: K, fallback: CurrencyConfigUpdate[K]) =>
    (draft[key] ?? fallback)

  const source = read('rate_source', config.rate_source as 'MANUAL' | 'LIVE')
  const enabled = read('enabled', config.enabled) as boolean
  const overridden = new Set(config.overrides)

  return (
    <div
      className={cn(
        'rounded-xl border transition-colors',
        config.is_base ? 'border-primary/40 bg-primary/[0.03]' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold">
            {config.symbol || config.code}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{config.code}</span>
              {config.is_base && (
                <Badge tone="primary" size="sm">
                  Base
                </Badge>
              )}
              <Badge tone={status.tone} size="sm">
                {status.label}
              </Badge>
              {!config.is_base && config.rate_from_base <= 0 && (
                <Badge tone="danger" size="sm">
                  No rate — not offered
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {config.is_base
                ? `Fees are entered in ${config.code}.`
                : `1 ${baseCurrency} = ${config.rate_from_base} ${config.code}`}
              {config.rate_fetched_at ? ` · ${formatDateTime(config.rate_fetched_at)}` : ''}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* The base currency cannot be switched off — it is what the fee
              structures are entered in, and disabling it would leave the
              programme with no currency to price from. */}
          {!config.is_base && (
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={enabled}
                onCheckedChange={(v) => onChange({ enabled: v })}
              />
              Offered
            </label>
          )}
          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Rate & charges'}
          </Button>
        </div>
      </div>

      {open && (
        <div className="space-y-5 border-t border-border bg-muted/20 p-4">
          {!config.is_base && (
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                id={`${config.code}-source`}
                label="Rate from"
                hint={
                  source === 'LIVE'
                    ? 'Fetched from the provider, falling back to your figure when it is unreachable.'
                    : 'Your own figure, used exactly.'
                }
              >
                <Select
                  value={source}
                  onValueChange={(v) => onChange({ rate_source: v as 'MANUAL' | 'LIVE' })}
                >
                  <SelectTrigger id={`${config.code}-source`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MANUAL">Your own rate</SelectItem>
                    <SelectItem value="LIVE">Live exchange rate</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field
                id={`${config.code}-rate`}
                label={`${config.code} per 1 ${baseCurrency}`}
                /* Kept required even under LIVE: it is what the live path uses
                   when the provider is down, so leaving it at zero turns an
                   outage into a fee page quoting nothing. */
                hint={
                  source === 'LIVE'
                    ? 'Still needed — this is the fallback when the provider is unreachable.'
                    : undefined
                }
              >
                <Input
                  id={`${config.code}-rate`}
                  type="number"
                  step="0.0001"
                  min={0}
                  value={String(read('rate_from_base', config.manual_rate || config.rate_from_base))}
                  onChange={(e) => onChange({ rate_from_base: num(e.target.value) ?? 0 })}
                />
              </Field>

              <Field id={`${config.code}-symbol`} label="Symbol" hint="Shown beside amounts.">
                <Input
                  id={`${config.code}-symbol`}
                  maxLength={8}
                  value={String(read('symbol', config.symbol ?? '') ?? '')}
                  onChange={(e) => onChange({ symbol: e.target.value })}
                />
              </Field>
            </div>
          )}

          {config.rate_detail && (
            <p className="flex gap-2 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              {config.rate_detail}
            </p>
          )}

          <div>
            <p className="mb-3 flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Charges in {config.code}
              <span className="h-px flex-1 bg-border" aria-hidden />
            </p>
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
              Anything left alone falls through to the programme's finance settings. A field
              marked <strong>set here</strong> is this currency's own.
            </p>

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                id={`${config.code}-tax`}
                label="Tax %"
                hint={overridden.has('tax_percent') ? 'Set here' : 'Inherited'}
              >
                <Input
                  id={`${config.code}-tax`}
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={String(read('tax_percent', config.tax_percent))}
                  onChange={(e) => onChange({ tax_percent: num(e.target.value) ?? 0 })}
                />
              </Field>

              <Field
                id={`${config.code}-tax-label`}
                label="Tax shown as"
                hint={overridden.has('tax_label') ? 'Set here' : 'Inherited'}
              >
                <Input
                  id={`${config.code}-tax-label`}
                  value={String(read('tax_label', config.tax_label) ?? '')}
                  onChange={(e) => onChange({ tax_label: e.target.value })}
                />
              </Field>

              <Field id={`${config.code}-tax-on`} label="Tax charged">
                <label className="flex h-9.5 items-center justify-between gap-3 rounded-md border border-input bg-card px-3.5">
                  <span className="text-sm">
                    {read('tax_enabled', config.tax_enabled) ? 'Yes' : 'No'}
                  </span>
                  <Switch
                    checked={Boolean(read('tax_enabled', config.tax_enabled))}
                    onCheckedChange={(v) => onChange({ tax_enabled: v })}
                  />
                </label>
              </Field>

              <Field
                id={`${config.code}-conv-pct`}
                label="Convenience %"
                hint={overridden.has('convenience_percent') ? 'Set here' : 'Inherited'}
              >
                <Input
                  id={`${config.code}-conv-pct`}
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={String(read('convenience_percent', config.convenience_percent))}
                  onChange={(e) => onChange({ convenience_percent: num(e.target.value) ?? 0 })}
                />
              </Field>

              <Field
                id={`${config.code}-conv-amt`}
                label="Convenience (flat)"
                hint={overridden.has('convenience_amount') ? 'Set here' : 'Inherited'}
              >
                <Input
                  id={`${config.code}-conv-amt`}
                  type="number"
                  step="0.01"
                  min={0}
                  value={String(read('convenience_amount', config.convenience_amount))}
                  onChange={(e) => onChange({ convenience_amount: num(e.target.value) ?? 0 })}
                />
              </Field>

              <Field
                id={`${config.code}-rounding`}
                label="Rounding"
                hint={overridden.has('rounding') ? 'Set here' : 'Inherited'}
              >
                <Select
                  value={String(read('rounding', config.rounding as 'NONE'))}
                  onValueChange={(v) =>
                    onChange({ rounding: v as CurrencyConfigUpdate['rounding'] })
                  }
                >
                  <SelectTrigger id={`${config.code}-rounding`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No rounding</SelectItem>
                    <SelectItem value="NEAREST">Nearest whole unit</SelectItem>
                    <SelectItem value="UP">Always up</SelectItem>
                    <SelectItem value="DOWN">Always down</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function FinanceCurrenciesTab({ program = 'LMS' }: { program?: Program }) {
  const settings = useCurrencySettings(program)
  const fx = useFxStatus()
  const update = useUpdateCurrencies(program)
  const refresh = useRefreshRates(program)

  const [drafts, setDrafts] = React.useState<Record<string, CurrencyConfigUpdate>>({})
  const [baseDraft, setBaseDraft] = React.useState<string | null>(null)

  const dirty = Object.keys(drafts).length > 0 || baseDraft !== null

  const save = () => {
    update.mutate(
      {
        ...(baseDraft ? { base_currency: baseDraft } : {}),
        ...(Object.keys(drafts).length ? { currencies: drafts } : {}),
      },
      {
        onSuccess: () => {
          setDrafts({})
          setBaseDraft(null)
        },
      },
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          A currency is a rate <strong>and its own charges</strong>. Switching currency moves a
          payer's total by more than the exchange rate, because the tax and convenience charge
          usually differ too — which is why each one is configured separately below.
        </p>
        <Button onClick={save} loading={update.isPending} disabled={!dirty}>
          Save currencies
        </Button>
      </div>

      {/* The live-rate cache, and the honest state of it. */}
      <QueryBoundary query={fx} loading={<Skeleton className="h-20 w-full rounded-xl" />}>
        {(status) => (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'flex size-9 items-center justify-center rounded-lg',
                  status.enabled ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground',
                )}
              >
                {status.enabled ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
              </span>
              <div>
                <p className="text-sm font-medium">
                  {status.enabled ? 'Live rates are on' : 'Live rates are off'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {status.enabled
                    ? `${status.provider} · refreshed at most every ${status.cache_minutes} minutes`
                    : 'Every currency uses the rate you set below.'}
                </p>
              </div>
            </div>
            {status.enabled && (
              <Button
                variant="outline"
                size="sm"
                loading={refresh.isPending}
                onClick={() => refresh.mutate()}
              >
                <RefreshCw />
                Refresh now
              </Button>
            )}
          </Card>
        )}
      </QueryBoundary>

      <QueryBoundary
        query={settings}
        loading={
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        }
      >
        {(data) => {
          const codes = Object.keys(data.currencies)
          const base = baseDraft ?? data.base_currency

          return (
            <>
              <Card className="space-y-3 p-5">
                <div className="flex items-center gap-2">
                  <Coins className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Base currency</h3>
                </div>
                <div className="max-w-xs">
                  <Field
                    id="base-currency"
                    label="Fees are entered in"
                    hint="Changing this re-prices nothing already entered — it only changes what every other rate is measured against."
                  >
                    <Select value={base} onValueChange={setBaseDraft}>
                      <SelectTrigger id="base-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {codes.map((code) => (
                          <SelectItem key={code} value={code}>
                            {code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </Card>

              <div className="space-y-3">
                {codes.map((code) => (
                  <CurrencyRow
                    key={code}
                    config={data.currencies[code]}
                    draft={drafts[code] ?? {}}
                    baseCurrency={base}
                    onChange={(patch) =>
                      setDrafts((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }))
                    }
                  />
                ))}
              </div>

              <Card className="flex gap-3 p-4">
                <Info className="mt-0.5 size-4 shrink-0 text-info" />
                <div className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <p>
                    <strong className="text-foreground">
                      {data.available.length} of {codes.length} currencies are offered to payers.
                    </strong>{' '}
                    {data.available.length > 0 && (
                      <span className="inline-flex flex-wrap gap-1 align-middle">
                        {data.available.map((code) => (
                          <Badge key={code} tone="success" size="sm">
                            <Check />
                            {code}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </p>
                  <p>
                    A currency is only offered when it is switched on <em>and</em> carries a
                    rate — quoting a price of zero is worse than not offering the currency.
                  </p>
                  <p>
                    Changing a rate or a charge affects <strong>draft</strong> invoices on their
                    next regeneration. An issued invoice keeps the rate it was issued at: a
                    bill that re-converts at today's rate is a bill whose total changes after
                    it was sent.
                  </p>
                </div>
              </Card>
            </>
          )
        }}
      </QueryBoundary>
    </div>
  )
}

/**
 * The payer-facing switcher, shared by the student, parent and tuition fee
 * screens.
 *
 * Given `options`, each row shows what the SAME bill comes to in that
 * currency — with that currency's own tax and surcharge — and what those
 * charges are, so the choice is made knowing that AED adds VAT and a card fee
 * rather than discovering it on the next screen. The base currency is marked
 * as recommended: it is the one the fees were set in, the only one with no
 * conversion, and the one the office reconciles in.
 */
export function CurrencySwitcher({
  value,
  available,
  baseCurrency,
  exchangeRate,
  onChange,
  options,
  recommended,
}: {
  value: string
  available: string[]
  baseCurrency?: string | null
  exchangeRate: number
  onChange: (code: string) => void
  /** Per-currency totals and charge rules, when the response carried them. */
  options?: CurrencyOptionOut[] | null
  /** The suggested currency — the base, unless the server says otherwise. */
  recommended?: string | null
}) {
  // Nothing to choose between — hide the control rather than render a
  // one-option dropdown, the same rule the product switcher follows.
  if (available.length < 2) return null

  const converted = !!baseCurrency && baseCurrency !== value
  const suggested = recommended ?? baseCurrency ?? null
  const byCode = new Map((options ?? []).map((o) => [o.code, o]))
  const current = byCode.get(value)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Globe className="size-4 text-muted-foreground" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="min-w-36" aria-label="Pay in">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {available.map((code) => {
            const option = byCode.get(code)
            const isSuggested = code === suggested
            return (
              <SelectItem key={code} value={code} textValue={code}>
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{code}</span>
                    {option?.total_amount != null && (
                      <span className="tabular-nums text-muted-foreground">
                        {formatMoney(option.total_amount, code)}
                      </span>
                    )}
                    {isSuggested && (
                      <Badge tone="primary" size="sm">
                        Recommended
                      </Badge>
                    )}
                  </span>
                  {option?.charges_summary && (
                    <span className="text-2xs text-muted-foreground">{option.charges_summary}</span>
                  )}
                </span>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>

      {/* What this choice adds, said out loud. Without it a payer switching
          currency sees a number move by more than the rate — because the tax
          and convenience charge changed too — and reads it as an error. */}
      <span className="text-xs text-muted-foreground">
        {value === suggested ? (
          <>
            Recommended — your fees are set in {value}, so nothing is converted.
            {current?.charges_summary ? ` ${current.charges_summary}.` : ''}
          </>
        ) : (
          <>
            {converted && `1 ${baseCurrency} = ${exchangeRate} ${value}`}
            {current?.charges_summary
              ? ` · ${current.charges_summary}`
              : ' · charges differ by currency'}
            {suggested && ` · ${suggested} is recommended`}
          </>
        )}
      </span>
    </div>
  )
}

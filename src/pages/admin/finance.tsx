import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Coins,
  Globe,
  HandCoins,
  Layers,
  Pencil,
  Percent,
  Plus,
  ListChecks,
  Receipt,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import type {
  AcademicTerm,
  ChargeKind,
  DiscountBasis,
  DiscountRuleOut,
  DiscountValueType,
  FeeFrequency,
  FeeHeadOut,
  FeeStructureItem,
  FeeStructureOut,
  InstalmentLine,
  InstalmentPlanOut,
} from '@/api/types'
import {
  useCreateDiscountRule,
  useCreateFeeHead,
  useCreateFeeStructure,
  useCreateInstalmentPlan,
  useDeleteDiscountRule,
  useDeleteFeeHead,
  useDeleteFeeStructure,
  useDeleteInstalmentPlan,
  useDiscountRules,
  useFeeHeads,
  useFeeStructures,
  useFinanceSettings,
  useInstalmentPlans,
  useUpdateDiscountRule,
  useUpdateInstalmentPlan,
  useUpdateFeeHead,
  useUpdateFeeStructure,
  useUpdateFinanceSettings,
} from '@/queries/finance.queries'
import { useCurrentYear, useAcademicYears, useAdmissionCategories } from '@/queries/admissions.queries'
import { useClasses } from '@/queries/admin.queries'
import { TERMS, TERM_LABEL, formatMoney } from '@/lib/tuition'
import { countLabel } from '@/lib/format'
import {
  CHARGE_KIND_LABEL,
  CREATABLE_CHARGE_KINDS,
  DISCOUNT_BASES,
  DISCOUNT_BASIS_HINT,
  DISCOUNT_BASIS_LABEL,
  FEE_FREQUENCIES,
  FEE_FREQUENCY_LABEL,
  basisNeedsCategories,
  basisNeedsStudents,
  basisUsesNth,
} from '@/lib/school'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from '@/components/layout/inline-panel'
import { Field, FormError } from '@/components/forms/field'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { cn } from '@/lib/cn'
import type { LucideIcon } from 'lucide-react'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { Band, WorkspaceHeader } from '@/components/layout/workspace'
import {
  DETAIL_TH,
  DetailHeader,
  DetailSection,
  Fact,
  Facts,
  ListEmpty,
  ListItem,
  ListPane,
  ListSearch,
  SplitView,
} from '@/components/layout/split-view'
import { FinanceInvoicesTab } from './finance-invoices'
import { FinanceReportsTab } from './finance-reports'
import { FinanceBulkTab } from './finance-bulk'
import { FinanceCurrenciesTab } from './finance-currencies'

/**
 * School fees.
 *
 * The chain is four links and the tabs follow it in order, because each one is
 * meaningless without the one before:
 *
 *   HEADS (what can be charged)
 *     → STRUCTURES (what this class or category is charged)
 *       → PLANS (when it falls due)
 *         → INVOICES (what one student owes, frozen when issued)
 *
 * Settings sit alongside as the fifth tab: currency, tax, late fees and
 * rounding apply across the whole chain rather than to any one link of it.
 *
 * Two rules are enforced by the backend and mirrored in the forms here, because
 * both fail silently and expensively otherwise: instalment percentages must
 * total 100, and an EMPTY scope on a structure means EVERY class rather than
 * none.
 */

// ==================================================================== settings

const settingsSchema = z.object({
  currency: z.string().min(1).max(8),
  tax_enabled: z.boolean(),
  tax_percent: z.string(),
  tax_label: z.string().max(40),
  tax_inclusive: z.boolean(),
  late_fee_enabled: z.boolean(),
  late_fee_percent: z.string(),
  late_fee_amount: z.string(),
  late_fee_grace_days: z.string(),
  convenience_percent: z.string(),
  convenience_amount: z.string(),
  invoice_prefix: z.string().max(10),
  invoice_due_days: z.string(),
  rounding: z.enum(['NONE', 'NEAREST', 'UP', 'DOWN']),
  gateway_enabled: z.boolean(),
  gateway_provider: z.string().max(40),
})

type SettingsValues = z.infer<typeof settingsSchema>

// ===================================================================== shared

/** The add button beside a list's search box. */
function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button size="sm" icon={<Plus />} onClick={onClick} className="h-8 shrink-0" aria-label={label} title={label}>
      Add
    </Button>
  )
}

/** Active ones first, then by name; inactive ones stay at the bottom, greyed. */
function byActiveThenName<T extends { is_active: boolean; name: string }>(a: T, b: T) {
  return Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name, undefined, { numeric: true })
}

function DetailActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <>
      <Button variant="outline" size="sm" icon={<Pencil />} onClick={onEdit}>
        Edit
      </Button>
      <Button variant="ghost" size="sm" icon={<Trash2 />} onClick={onDelete}>
        Delete
      </Button>
    </>
  )
}

function NothingPicked({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-16 text-center text-sm text-muted-foreground">{children}</p>
}

function ListSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  )
}

function num(value: string): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function SettingsTab() {
  const settings = useFinanceSettings()
  const update = useUpdateFinanceSettings()
  const form = useForm<SettingsValues>({ resolver: zodResolver(settingsSchema) })

  React.useEffect(() => {
    const s = settings.data
    if (!s) return
    form.reset({
      currency: s.currency,
      tax_enabled: s.tax_enabled,
      tax_percent: String(s.tax_percent),
      tax_label: s.tax_label,
      tax_inclusive: s.tax_inclusive,
      late_fee_enabled: s.late_fee_enabled,
      late_fee_percent: String(s.late_fee_percent),
      late_fee_amount: String(s.late_fee_amount),
      late_fee_grace_days: String(s.late_fee_grace_days),
      convenience_percent: String(s.convenience_percent),
      convenience_amount: String(s.convenience_amount),
      invoice_prefix: s.invoice_prefix,
      invoice_due_days: String(s.invoice_due_days),
      rounding: (s.rounding as SettingsValues['rounding']) ?? 'NONE',
      gateway_enabled: s.gateway_enabled,
      gateway_provider: s.gateway_provider ?? '',
    })
  }, [settings.data, form])

  const onSubmit = (values: SettingsValues) => {
    update.mutate({
      currency: values.currency,
      tax_enabled: values.tax_enabled,
      tax_percent: num(values.tax_percent),
      tax_label: values.tax_label,
      tax_inclusive: values.tax_inclusive,
      late_fee_enabled: values.late_fee_enabled,
      late_fee_percent: num(values.late_fee_percent),
      late_fee_amount: num(values.late_fee_amount),
      late_fee_grace_days: num(values.late_fee_grace_days),
      convenience_percent: num(values.convenience_percent),
      convenience_amount: num(values.convenience_amount),
      invoice_prefix: values.invoice_prefix,
      invoice_due_days: num(values.invoice_due_days),
      rounding: values.rounding,
      gateway_enabled: values.gateway_enabled,
      // Empty string rather than null: the backend treats null as "leave
      // alone", so clearing a provider means sending a blank one.
      gateway_provider: values.gateway_provider.trim(),
    })
  }

  return (
    <QueryBoundary query={settings} loading={<ListSkeleton />}>
      {() => (
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <section className="max-w-4xl space-y-4 border-b border-border px-4 py-5">
            <h3 className="text-sm font-semibold">Money</h3>
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field id="currency" label="Currency" hint="Applies to both products.">
                <Input id="currency" {...form.register('currency')} />
              </Field>
              <Field
                id="rounding"
                label="Rounding"
                hint="Applied to the final payable only, never to a line."
              >
                <Select
                  value={form.watch('rounding')}
                  onValueChange={(v) =>
                    form.setValue('rounding', v as SettingsValues['rounding'], {
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger id="rounding">
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
          </section>

          <section className="max-w-4xl space-y-4 border-b border-border px-4 py-5">
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="text-sm font-semibold">Tax</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Computed on the discounted taxable base, and never charged on a late fee.
                </span>
              </span>
              <Switch
                checked={form.watch('tax_enabled')}
                onCheckedChange={(v) => form.setValue('tax_enabled', v, { shouldDirty: true })}
              />
            </label>

            {form.watch('tax_enabled') && (
              <div className="space-y-4 border-t border-border pt-4">
                <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                  <Field id="tax_percent" label="Rate (%)">
                    <Input
                      id="tax_percent"
                      type="number"
                      step="0.01"
                      {...form.register('tax_percent')}
                    />
                  </Field>
                  <Field id="tax_label" label="Shown as" hint="e.g. GST, VAT.">
                    <Input id="tax_label" {...form.register('tax_label')} />
                  </Field>
                </div>
                <label className="flex items-start justify-between gap-4">
                  <span className="min-w-0">
                    <span className="text-sm font-medium">Amounts already include tax</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      On: the figures you enter are gross and the tax is worked back out of
                      them. Off: tax is added on top.
                    </span>
                  </span>
                  <Switch
                    checked={form.watch('tax_inclusive')}
                    onCheckedChange={(v) =>
                      form.setValue('tax_inclusive', v, { shouldDirty: true })
                    }
                  />
                </label>
              </div>
            )}
          </section>

          <section className="max-w-4xl space-y-4 border-b border-border px-4 py-5">
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="text-sm font-semibold">Late fees</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Applied per instalment, once the grace period has passed. Never taxed.
                </span>
              </span>
              <Switch
                checked={form.watch('late_fee_enabled')}
                onCheckedChange={(v) =>
                  form.setValue('late_fee_enabled', v, { shouldDirty: true })
                }
              />
            </label>

            {form.watch('late_fee_enabled') && (
              <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
                <Field id="late_percent" label="Percent">
                  <Input
                    id="late_percent"
                    type="number"
                    step="0.01"
                    {...form.register('late_fee_percent')}
                  />
                </Field>
                <Field id="late_amount" label="Flat amount">
                  <Input
                    id="late_amount"
                    type="number"
                    step="0.01"
                    {...form.register('late_fee_amount')}
                  />
                </Field>
                <Field id="late_grace" label="Grace (days)">
                  <Input id="late_grace" type="number" {...form.register('late_fee_grace_days')} />
                </Field>
              </div>
            )}
          </section>

          <section className="max-w-4xl space-y-4 border-b border-border px-4 py-5">
            <div>
              <h3 className="text-sm font-semibold">Invoices and surcharges</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The convenience charge is added AFTER tax, so it is never itself taxed.
              </p>
            </div>
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field id="conv_percent" label="Convenience (%)">
                <Input
                  id="conv_percent"
                  type="number"
                  step="0.01"
                  {...form.register('convenience_percent')}
                />
              </Field>
              <Field id="conv_amount" label="Convenience (flat)">
                <Input
                  id="conv_amount"
                  type="number"
                  step="0.01"
                  {...form.register('convenience_amount')}
                />
              </Field>
              <Field id="inv_prefix" label="Invoice prefix" hint="e.g. INV">
                <Input id="inv_prefix" {...form.register('invoice_prefix')} />
              </Field>
              <Field id="inv_due" label="Payable within (days)">
                <Input id="inv_due" type="number" {...form.register('invoice_due_days')} />
              </Field>
            </div>
          </section>

          <section className="max-w-4xl space-y-4 border-b border-border px-4 py-5">
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="text-sm font-semibold">Online payment</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Drives whether a "Pay online" button is shown at all.
                </span>
              </span>
              <Switch
                checked={form.watch('gateway_enabled')}
                onCheckedChange={(v) =>
                  form.setValue('gateway_enabled', v, { shouldDirty: true })
                }
              />
            </label>

            {/* Said plainly rather than left to be discovered: the endpoints
                exist, record the attempt and mint an idempotency key, but no
                provider is integrated and no checkout URL comes back. */}
            <div className="flex gap-3 border-l-2 border-warning bg-warning/5 px-3 py-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">No provider is connected yet.</strong>{' '}
                Turning this on records payment attempts but returns no checkout page, so
                nobody can actually pay online. Until a gateway is wired, take payment offline
                and record it against the invoice.
              </p>
            </div>

            {form.watch('gateway_enabled') && (
              <Field id="gateway_provider" label="Provider" hint="Recorded for when one is wired.">
                <Input id="gateway_provider" {...form.register('gateway_provider')} />
              </Field>
            )}
          </section>

          <div className="sticky bottom-0 flex justify-end border-t border-border bg-card px-4 py-3">
            <Button type="submit" size="sm" loading={update.isPending} disabled={!form.formState.isDirty}>
              Save settings
            </Button>
          </div>
        </form>
      )}
    </QueryBoundary>
  )
}

// =================================================================== fee heads

const headSchema = z.object({
  name: z.string().min(1, 'Enter a name').max(120),
  code: z.string().min(1, 'Enter a code').max(30),
  kind: z.enum(['FEE', 'CHARGE', 'OTHER']),
  frequency: z.enum(['ONE_TIME', 'MONTHLY', 'TERM', 'ANNUAL']),
  default_amount: z.string(),
  is_taxable: z.boolean(),
  is_discountable: z.boolean(),
  is_admission_charge: z.boolean(),
  is_active: z.boolean(),
  description: z.string().max(1000).optional(),
})

type HeadValues = z.infer<typeof headSchema>

function HeadDialog({
  open,
  onOpenChange,
  editing,
  currency,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: FeeHeadOut | null
  currency: string
}) {
  const create = useCreateFeeHead()
  const update = useUpdateFeeHead()
  const form = useForm<HeadValues>({
    resolver: zodResolver(headSchema),
    defaultValues: {
      name: '',
      code: '',
      kind: 'FEE',
      frequency: 'ANNUAL',
      default_amount: '0',
      is_taxable: false,
      is_discountable: true,
      is_admission_charge: false,
      is_active: true,
      description: '',
    },
  })

  React.useEffect(() => {
    if (!open) return
    form.reset({
      name: editing?.name ?? '',
      code: editing?.code ?? '',
      kind: (editing?.kind as HeadValues['kind']) ?? 'FEE',
      frequency: editing?.frequency ?? 'ANNUAL',
      default_amount: String(editing?.default_amount ?? 0),
      is_taxable: editing?.is_taxable ?? false,
      is_discountable: editing?.is_discountable ?? true,
      is_admission_charge: editing?.is_admission_charge ?? false,
      is_active: editing?.is_active ?? true,
      description: editing?.description ?? '',
    })
  }, [open, editing, form])

  const onSubmit = async (values: HeadValues) => {
    const body = {
      name: values.name,
      code: values.code,
      kind: values.kind as ChargeKind,
      frequency: values.frequency as FeeFrequency,
      default_amount: num(values.default_amount),
      is_taxable: values.is_taxable,
      is_discountable: values.is_discountable,
      is_admission_charge: values.is_admission_charge,
      is_active: values.is_active,
      description: values.description?.trim() || null,
    }
    try {
      if (editing) await update.mutateAsync({ headId: editing.id, body })
      else await create.mutateAsync(body)
      onOpenChange(false)
    } catch (error) {
      form.setError('root', {
        message: (error as { message?: string })?.message ?? 'Could not save the fee head.',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add a fee head'}</DialogTitle>
          <DialogDescription>
            A fee head is something the school can charge for. Structures decide the amounts;
            this is the catalogue.
          </DialogDescription>
        </DialogHeader>
        <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-5">
            <FormError message={form.formState.errors.root?.message} />

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field id="head_name" label="Name" required error={form.formState.errors.name?.message}>
                <Input id="head_name" placeholder="Tuition Fee" {...form.register('name')} />
              </Field>
              <Field id="head_code" label="Code" required error={form.formState.errors.code?.message}>
                <Input id="head_code" placeholder="TUITION" {...form.register('code')} />
              </Field>
            </div>

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field
                id="head_kind"
                label="Kind"
                hint="Tax, convenience and late fees are computed, not entered."
              >
                <Select
                  value={form.watch('kind')}
                  onValueChange={(v) =>
                    form.setValue('kind', v as HeadValues['kind'], { shouldDirty: true })
                  }
                >
                  <SelectTrigger id="head_kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CREATABLE_CHARGE_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {CHARGE_KIND_LABEL[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="head_freq" label="Charged">
                <Select
                  value={form.watch('frequency')}
                  onValueChange={(v) =>
                    form.setValue('frequency', v as HeadValues['frequency'], {
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger id="head_freq">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEE_FREQUENCIES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {FEE_FREQUENCY_LABEL[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field
              id="head_amount"
              label={`Default amount (${currency})`}
              hint="A structure overrides this per class or category."
            >
              <Input
                id="head_amount"
                type="number"
                step="0.01"
                {...form.register('default_amount')}
              />
            </Field>

            <div className="space-y-3 rounded-md border border-border p-3">
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">Taxable</span>
                <Switch
                  checked={form.watch('is_taxable')}
                  onCheckedChange={(v) => form.setValue('is_taxable', v, { shouldDirty: true })}
                />
              </label>
              <label className="flex items-start justify-between gap-4 border-t border-border pt-3">
                <span className="min-w-0">
                  <span className="text-sm font-medium">Concessions may apply to it</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Turn off for a statutory charge the school only passes on.
                  </span>
                </span>
                <Switch
                  checked={form.watch('is_discountable')}
                  onCheckedChange={(v) =>
                    form.setValue('is_discountable', v, { shouldDirty: true })
                  }
                />
              </label>
              <label className="flex items-start justify-between gap-4 border-t border-border pt-3">
                <span className="min-w-0">
                  <span className="text-sm font-medium">This is the admission charge</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Charged once at joining, and dropped for any category that waives it.
                  </span>
                </span>
                <Switch
                  checked={form.watch('is_admission_charge')}
                  onCheckedChange={(v) =>
                    form.setValue('is_admission_charge', v, { shouldDirty: true })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-4 border-t border-border pt-3">
                <span className="text-sm font-medium">Active</span>
                <Switch
                  checked={form.watch('is_active')}
                  onCheckedChange={(v) => form.setValue('is_active', v, { shouldDirty: true })}
                />
              </label>
            </div>

            <Field id="head_desc" label="Description">
              <Textarea id="head_desc" rows={2} {...form.register('description')} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {editing ? 'Save changes' : 'Add fee head'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

function HeadsTab({ currency }: { currency: string }) {
  const heads = useFeeHeads({ includeInactive: true })
  const structures = useFeeStructures({ includeInactive: true })
  const remove = useDeleteFeeHead()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<FeeHeadOut | null>(null)
  const [deleting, setDeleting] = React.useState<FeeHeadOut | null>(null)
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [search, setSearch] = React.useState('')
  const add = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const needle = search.trim().toLowerCase()
  const rows = [...(heads.data ?? [])]
    .filter((h) => !needle || `${h.name} ${h.code}`.toLowerCase().includes(needle))
    .sort(byActiveThenName)
  const selected = rows.find((h) => h.id === selectedId) ?? rows[0] ?? null
  const usedIn = selected
    ? (structures.data ?? []).filter((x) => x.items.some((i) => i.fee_head_id === selected.id))
    : []

  return (
    <>
      <SplitView
        list={
          <ListPane
            toolbar={
              <div className="flex gap-2">
                <ListSearch value={search} onChange={setSearch} placeholder="Find a fee head" />
                <AddButton onClick={add} label="Add a fee head" />
              </div>
            }
            footer={heads.data && `${heads.data.filter((h) => h.is_active).length} active of ${heads.data.length}`}
          >
            <QueryBoundary query={heads} loading={<ListSkeleton />}>
              {() =>
                rows.length === 0 ? (
                  <ListEmpty>{needle ? 'No fee head matches' : 'No fee heads yet. Start with the teaching fee'}</ListEmpty>
                ) : (
                  <>
                    {rows.map((h) => (
                      <ListItem
                        key={h.id}
                        active={!dialogOpen && selected?.id === h.id}
                        onClick={() => {
                          setSelectedId(h.id)
                          setDialogOpen(false)
                        }}
                        title={h.name}
                        sub={`${h.code} · ${FEE_FREQUENCY_LABEL[h.frequency]}${h.is_active ? '' : ' · Inactive'}`}
                        muted={!h.is_active}
                        right={<span className="font-medium tabular-nums text-foreground">{formatMoney(h.default_amount, currency)}</span>}
                      />
                    ))}
                  </>
                )
              }
            </QueryBoundary>
          </ListPane>
        }
        detail={
          dialogOpen ? (
            <HeadDialog open onOpenChange={setDialogOpen} editing={editing} currency={currency} />
          ) : selected ? (
            <>
              <DetailHeader
                title={selected.name}
                badges={!selected.is_active && <Badge tone="neutral" size="sm">Inactive</Badge>}
                sub={`${selected.code} · ${CHARGE_KIND_LABEL[selected.kind]}`}
                actions={
                  <DetailActions
                    onEdit={() => {
                      setEditing(selected)
                      setDialogOpen(true)
                    }}
                    onDelete={() => setDeleting(selected)}
                  />
                }
              />
              <Facts>
                <Fact label="Default amount">
                  <span className="text-base font-medium tabular-nums">{formatMoney(selected.default_amount, currency)}</span>
                </Fact>
                <Fact label="Billed">{FEE_FREQUENCY_LABEL[selected.frequency]}</Fact>
                <Fact label="Kind">{CHARGE_KIND_LABEL[selected.kind]}</Fact>
                <Fact label="Tax">{selected.is_taxable ? `Taxable${selected.tax_percent != null ? ` · ${selected.tax_percent}%` : ''}` : 'Not taxed'}</Fact>
                <Fact label="Concessions">{selected.is_discountable ? 'Allowed' : 'Never applied'}</Fact>
                <Fact label="Admission charge">{selected.is_admission_charge ? 'Yes, billed once at admission' : 'No'}</Fact>
                {selected.description && (
                  <Fact label="Notes" wide>
                    {selected.description}
                  </Fact>
                )}
              </Facts>
              <DetailSection title={`Used in structures · ${usedIn.length}`}>
                {usedIn.length === 0 ? (
                  <p className="border-b border-border px-5 py-4 text-sm text-muted-foreground">
                    No structure charges this yet. Add it to one under Fee structures
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={DETAIL_TH}>
                        <th className="py-1.5 pl-5 pr-3 font-medium">Structure</th>
                        <th className="px-3 py-1.5 font-medium">Applies to</th>
                        <th className="py-1.5 pl-3 pr-5 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usedIn.map((x) => {
                        const item = x.items.find((i) => i.fee_head_id === selected.id)!
                        return (
                          <tr key={x.id} className={cn('border-b border-border', !x.is_active && 'text-muted-foreground')}>
                            <td className="py-1.5 pl-5 pr-3 font-medium">{x.name}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{x.class_ids.length === 0 ? 'Every class' : x.class_names.join(', ')}</td>
                            <td className="py-1.5 pl-3 pr-5 text-right tabular-nums">{formatMoney(item.amount, x.currency || currency)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </DetailSection>
            </>
          ) : (
            <NothingPicked>Add your first fee head: the teaching fee, then transport, exam entry, lab</NothingPicked>
          )
        }
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="This is refused while a fee structure still references it. Deactivating it instead leaves past invoices explicable."
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id)
          setDeleting(null)
        }}
      />
    </>
  )
}

// ================================================================= structures

function StructureDialog({
  open,
  onOpenChange,
  editing,
  heads,
  currency,
  academicYearId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: FeeStructureOut | null
  heads: FeeHeadOut[]
  currency: string
  academicYearId: number | null
}) {
  const create = useCreateFeeStructure()
  const update = useUpdateFeeStructure()
  const classes = useClasses()
  const categories = useAdmissionCategories()

  const [name, setName] = React.useState('')
  const [items, setItems] = React.useState<FeeStructureItem[]>([])
  const [classIds, setClassIds] = React.useState<number[]>([])
  const [categoryIds, setCategoryIds] = React.useState<number[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setItems(
      editing?.items.map((i) => ({
        fee_head_id: i.fee_head_id,
        amount: i.amount,
        label: i.label ?? null,
      })) ?? [],
    )
    setClassIds(editing?.class_ids ?? [])
    setCategoryIds(editing?.admission_category_ids ?? [])
    setError(null)
    setBusy(false)
  }, [open, editing])

  const gross = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
  const used = new Set(items.map((i) => i.fee_head_id))

  const submit = async () => {
    setError(null)
    if (!name.trim()) return setError('Give the structure a name.')
    if (items.length === 0) return setError('Add at least one fee head.')
    if (!academicYearId && !editing) {
      return setError('No current session year is set — create one under Admissions first.')
    }

    setBusy(true)
    try {
      if (editing) {
        await update.mutateAsync({
          structureId: editing.id,
          body: {
            name,
            items,
            class_ids: classIds,
            admission_category_ids: categoryIds,
          },
        })
      } else {
        await create.mutateAsync({
          name,
          academic_year_id: academicYearId as number,
          items,
          class_ids: classIds,
          admission_category_ids: categoryIds,
        })
      }
      onOpenChange(false)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not save the structure.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'Build a fee structure'}</DialogTitle>
          <DialogDescription>
            What a given class or category is actually charged, head by head.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />

          <Field id="structure_name" label="Name" required>
            <Input
              id="structure_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Standard day fee, 2025-26"
            />
          </Field>

          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold">What is charged</h4>
              <span className="text-sm tabular-nums text-muted-foreground">
                Gross {formatMoney(gross, currency)}
              </span>
            </div>

            {items.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nothing added yet. Pick a fee head below.
              </p>
            )}

            <ul className="space-y-2">
              {items.map((item, index) => {
                const head = heads.find((h) => h.id === item.fee_head_id)
                return (
                  <li key={item.fee_head_id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {head?.name ?? `Head ${item.fee_head_id}`}
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      className="w-32"
                      value={String(item.amount)}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((it, i) =>
                            i === index ? { ...it, amount: num(e.target.value) } : it,
                          ),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <X />
                    </Button>
                  </li>
                )
              })}
            </ul>

            <Select
              value=""
              onValueChange={(v) => {
                const head = heads.find((h) => String(h.id) === v)
                if (!head) return
                setItems((prev) => [
                  ...prev,
                  { fee_head_id: head.id, amount: head.default_amount },
                ])
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Add a fee head…" />
              </SelectTrigger>
              <SelectContent>
                {heads
                  .filter((h) => h.is_active && !used.has(h.id))
                  .map((head) => (
                    <SelectItem key={head.id} value={String(head.id)}>
                      {head.name} — {formatMoney(head.default_amount, currency)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* The empty-means-everything rule, said out loud. An admin who
              leaves both blank expecting "nothing yet" has priced the whole
              school, and nothing else on the screen would tell them. */}
          <div className="space-y-4 rounded-md border border-border p-3">
            <div>
              <h4 className="text-sm font-semibold">Who it applies to</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Leaving a list empty means <strong>every one</strong>. Both empty makes this
                the year's default structure.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Classes {classIds.length === 0 && '(all)'}
                </p>
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  {(classes.data ?? []).map((cls) => (
                    <label key={cls.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={classIds.includes(cls.id)}
                        onCheckedChange={(v) =>
                          setClassIds((prev) =>
                            v ? [...prev, cls.id] : prev.filter((id) => id !== cls.id),
                          )
                        }
                      />
                      {cls.name}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Categories {categoryIds.length === 0 && '(all)'}
                </p>
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  {(categories.data ?? []).map((cat) => (
                    <label key={cat.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={categoryIds.includes(cat.id)}
                        onCheckedChange={(v) =>
                          setCategoryIds((prev) =>
                            v ? [...prev, cat.id] : prev.filter((id) => id !== cat.id),
                          )
                        }
                      />
                      {cat.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {editing ? 'Save changes' : 'Create structure'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StructuresTab({ currency, academicYearId }: { currency: string; academicYearId: number | null }) {
  const structures = useFeeStructures({ includeInactive: true })
  const heads = useFeeHeads()
  const remove = useDeleteFeeStructure()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<FeeStructureOut | null>(null)
  const [deleting, setDeleting] = React.useState<FeeStructureOut | null>(null)
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [search, setSearch] = React.useState('')
  const add = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const needle = search.trim().toLowerCase()
  const rows = [...(structures.data ?? [])]
    .filter((x) => !needle || [x.name, ...x.class_names, ...x.admission_category_names].join(' ').toLowerCase().includes(needle))
    .sort(byActiveThenName)
  const selected = rows.find((x) => x.id === selectedId) ?? rows[0] ?? null

  return (
    <>
      <SplitView
        list={
          <ListPane
            toolbar={
              <div className="flex gap-2">
                <ListSearch value={search} onChange={setSearch} placeholder="Structure, class or type" />
                <AddButton onClick={add} label="Build a structure" />
              </div>
            }
            footer={structures.data && `${structures.data.filter((x) => x.is_active).length} active of ${structures.data.length}`}
          >
            <QueryBoundary query={structures} loading={<ListSkeleton />}>
              {() =>
                rows.length === 0 ? (
                  <ListEmpty>{needle ? 'No structure matches' : 'No fee structures yet. Without one, nobody can be billed'}</ListEmpty>
                ) : (
                  <>
                    {rows.map((x) => {
                      const everyClass = x.class_ids.length === 0
                      const everyType = x.admission_category_ids.length === 0
                      return (
                        <ListItem
                          key={x.id}
                          active={!dialogOpen && selected?.id === x.id}
                          onClick={() => {
                            setSelectedId(x.id)
                            setDialogOpen(false)
                          }}
                          title={x.name}
                          sub={
                            everyClass && everyType
                              ? 'Year default · everyone'
                              : `${everyClass ? 'Every class' : x.class_names.join(', ')} · ${everyType ? 'every type' : x.admission_category_names.join(', ')}`
                          }
                          muted={!x.is_active}
                          right={<span className="font-medium tabular-nums text-foreground">{formatMoney(x.gross_total, x.currency || currency)}</span>}
                        />
                      )
                    })}
                  </>
                )
              }
            </QueryBoundary>
          </ListPane>
        }
        detail={
          dialogOpen ? (
            <StructureDialog
              open
              onOpenChange={setDialogOpen}
              editing={editing}
              heads={heads.data ?? []}
              currency={currency}
              academicYearId={academicYearId}
            />
          ) : selected ? (
            <>
              <DetailHeader
                title={selected.name}
                badges={
                  <>
                    {selected.class_ids.length === 0 && selected.admission_category_ids.length === 0 && (
                      <Badge tone="primary" size="sm">
                        Year default
                      </Badge>
                    )}
                    {!selected.is_active && (
                      <Badge tone="neutral" size="sm">
                        Inactive
                      </Badge>
                    )}
                  </>
                }
                sub={`${selected.academic_year_name ?? 'Session'} · ${countLabel(selected.items.length, 'fee head')}`}
                actions={
                  <DetailActions
                    onEdit={() => {
                      setEditing(selected)
                      setDialogOpen(true)
                    }}
                    onDelete={() => setDeleting(selected)}
                  />
                }
              />
              <Facts>
                <Fact label="Total a year">
                  <span className="text-base font-medium tabular-nums">{formatMoney(selected.gross_total, selected.currency || currency)}</span>
                </Fact>
                <Fact label="Session">{selected.academic_year_name ?? '—'}</Fact>
                <Fact label="Priority">{selected.priority}</Fact>
                <Fact label="Classes" wide>
                  {selected.class_ids.length === 0 ? 'Every class' : selected.class_names.join(', ')}
                </Fact>
                <Fact label="Admission types" wide>
                  {selected.admission_category_ids.length === 0 ? 'Every admission type' : selected.admission_category_names.join(', ')}
                </Fact>
                {selected.notes && (
                  <Fact label="Notes" wide>
                    {selected.notes}
                  </Fact>
                )}
              </Facts>
              <DetailSection title={`Fees charged · ${selected.items.length}`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className={DETAIL_TH}>
                      <th className="py-1.5 pl-5 pr-3 font-medium">Fee head</th>
                      <th className="px-3 py-1.5 font-medium">Billed</th>
                      <th className="py-1.5 pl-3 pr-5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((item, i) => (
                      <tr key={`${item.fee_head_id}-${i}`} className="border-b border-border">
                        <td className="py-1.5 pl-5 pr-3">
                          <span className="font-medium text-foreground">{item.label || item.name || `Head ${item.fee_head_id}`}</span>
                          {item.code && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{item.code}</span>}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">{item.frequency ? FEE_FREQUENCY_LABEL[item.frequency] : '—'}</td>
                        <td className="py-1.5 pl-3 pr-5 text-right tabular-nums">{formatMoney(item.amount, selected.currency || currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-b border-border bg-muted/30 font-medium">
                      <td colSpan={2} className="py-1.5 pl-5 pr-3 text-right text-[11px] uppercase tracking-wide text-muted-foreground">
                        Total
                      </td>
                      <td className="py-1.5 pl-3 pr-5 text-right tabular-nums">{formatMoney(selected.gross_total, selected.currency || currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </DetailSection>
            </>
          ) : (
            <NothingPicked>Build a structure to say what a class or admission type is charged</NothingPicked>
          )
        }
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Invoices already issued from it keep their frozen figures — only future billing changes."
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id)
          setDeleting(null)
        }}
      />
    </>
  )
}

// ====================================================================== plans

function PlanDialog({
  open,
  onOpenChange,
  editing,
  academicYearId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: InstalmentPlanOut | null
  academicYearId: number | null
}) {
  const create = useCreateInstalmentPlan()
  const update = useUpdateInstalmentPlan()

  const [name, setName] = React.useState('')
  const [lines, setLines] = React.useState<InstalmentLine[]>([])
  const [isDefault, setIsDefault] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setLines(
      editing?.instalments.length
        ? editing.instalments
        : [
            { label: 'Term 1', term: 'TERM_1', percent: 50 },
            { label: 'Term 2', term: 'TERM_2', percent: 50 },
          ],
    )
    setIsDefault(editing?.is_default ?? false)
    setError(null)
    setBusy(false)
  }, [open, editing])

  const totalPercent = lines.reduce((sum, l) => sum + (Number(l.percent) || 0), 0)
  // Mirrors the backend's own tolerance, so the form and the server agree on
  // what "totals 100" means rather than disagreeing at the third decimal.
  const percentsOk = Math.abs(totalPercent - 100) <= 0.01

  const submit = async () => {
    setError(null)
    if (!name.trim()) return setError('Give the plan a name.')
    if (lines.length === 0) return setError('Add at least one instalment.')
    if (!percentsOk) {
      return setError(
        `The instalments total ${totalPercent.toFixed(2)}%, not 100%. A plan that collects less than the whole fee under-bills every student on it, silently, for a year.`,
      )
    }
    if (!academicYearId && !editing) {
      return setError('No current session year is set — create one under Admissions first.')
    }

    setBusy(true)
    try {
      if (editing) {
        await update.mutateAsync({
          planId: editing.id,
          body: { name, instalments: lines, is_default: isDefault },
        })
      } else {
        await create.mutateAsync({
          name,
          academic_year_id: academicYearId as number,
          instalments: lines,
          is_default: isDefault,
        })
      }
      onOpenChange(false)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not save the plan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'Create an instalment plan'}</DialogTitle>
          <DialogDescription>
            When the fee falls due. Tie an instalment to a term and it falls due at that term's
            start; otherwise give a day count from the start of the year. A one-time charge such
            as the admission fee always lands whole in the first instalment.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />

          <Field id="plan_name" label="Name" required>
            <Input
              id="plan_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Two terms"
            />
          </Field>

          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold">Instalments</h4>
              <span
                className={
                  percentsOk
                    ? 'text-sm font-medium tabular-nums text-success'
                    : 'text-sm font-medium tabular-nums text-danger'
                }
              >
                {totalPercent.toFixed(2)}% of 100%
              </span>
            </div>

            <ul className="space-y-2">
              {lines.map((line, index) => (
                <li key={index} className="flex flex-wrap items-center gap-2">
                  <Input
                    className="min-w-32 flex-1"
                    value={line.label}
                    placeholder="Term 1"
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) => (i === index ? { ...l, label: e.target.value } : l)),
                      )
                    }
                  />
                  <Input
                    type="number"
                    step="0.01"
                    className="w-24"
                    value={line.percent == null ? '' : String(line.percent)}
                    placeholder="%"
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) =>
                          i === index ? { ...l, percent: num(e.target.value) } : l,
                        ),
                      )
                    }
                  />
                  <Select
                    value={line.term ?? 'NONE'}
                    onValueChange={(v) =>
                      setLines((prev) =>
                        prev.map((l, i) =>
                          i === index
                            ? {
                                ...l,
                                term: v === 'NONE' ? null : (v as AcademicTerm),
                                // A term supplies the due date; a day count is the
                                // alternative, never both.
                                due_after_days: v === 'NONE' ? (l.due_after_days ?? 0) : null,
                                due_date: null,
                              }
                            : l,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">By day</SelectItem>
                      {TERMS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TERM_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!line.term && (
                    <Input
                      type="number"
                      className="w-24"
                      value={line.due_after_days == null ? '' : String(line.due_after_days)}
                      placeholder="Day"
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === index
                              ? { ...l, due_after_days: num(e.target.value), due_date: null }
                              : l,
                          ),
                        )
                      }
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>

            <p className="text-xs text-muted-foreground">
              Label, percentage, and either the term it belongs to or the day of the year it
              falls due.
            </p>

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setLines((prev) => [
                  ...prev,
                  { label: `Instalment ${prev.length + 1}`, percent: 0, due_after_days: 0 },
                ])
              }
            >
              <Plus />
              Add an instalment
            </Button>
          </div>

          <label className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
            <span>
              <span className="text-sm font-medium">Use this by default</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Applied to students no more specific plan matches.
              </span>
            </span>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={!percentsOk}>
            {editing ? 'Save changes' : 'Create plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PlansTab({ academicYearId }: { academicYearId: number | null }) {
  const plans = useInstalmentPlans({ includeInactive: true })
  const classes = useClasses()
  const categories = useAdmissionCategories()
  const remove = useDeleteInstalmentPlan()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<InstalmentPlanOut | null>(null)
  const [deleting, setDeleting] = React.useState<InstalmentPlanOut | null>(null)
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [search, setSearch] = React.useState('')
  const add = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const needle = search.trim().toLowerCase()
  const rows = [...(plans.data ?? [])]
    .filter((x) => !needle || x.name.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.is_default) - Number(a.is_default) || byActiveThenName(a, b))
  const selected = rows.find((x) => x.id === selectedId) ?? rows[0] ?? null
  const className = (id: number) => (classes.data ?? []).find((c) => c.id === id)?.name ?? `Class ${id}`
  const typeName = (id: number) => (categories.data ?? []).find((c) => c.id === id)?.name ?? `Type ${id}`
  const shareTotal = selected ? selected.instalments.reduce((n, l) => n + (l.percent ?? 0), 0) : 0

  return (
    <>
      <SplitView
        list={
          <ListPane
            toolbar={
              <div className="flex gap-2">
                <ListSearch value={search} onChange={setSearch} placeholder="Find a plan" />
                <AddButton onClick={add} label="Create a plan" />
              </div>
            }
            footer={plans.data && `${plans.data.filter((x) => x.is_active).length} active of ${plans.data.length}`}
          >
            <QueryBoundary query={plans} loading={<ListSkeleton />}>
              {() =>
                rows.length === 0 ? (
                  <ListEmpty>{needle ? 'No plan matches' : 'No plans yet. Without one the whole fee falls due at once'}</ListEmpty>
                ) : (
                  <>
                    {rows.map((x) => (
                      <ListItem
                        key={x.id}
                        active={!dialogOpen && selected?.id === x.id}
                        onClick={() => {
                          setSelectedId(x.id)
                          setDialogOpen(false)
                        }}
                        title={x.name}
                        sub={x.instalments.map((l) => l.label).join(' · ')}
                        muted={!x.is_active}
                        right={
                          x.is_default ? (
                            <span className="text-primary">Default</span>
                          ) : (
                            <span className="tabular-nums text-muted-foreground">{countLabel(x.instalments.length, 'part')}</span>
                          )
                        }
                      />
                    ))}
                  </>
                )
              }
            </QueryBoundary>
          </ListPane>
        }
        detail={
          dialogOpen ? (
            <PlanDialog open onOpenChange={setDialogOpen} editing={editing} academicYearId={academicYearId} />
          ) : selected ? (
            <>
              <DetailHeader
                title={selected.name}
                badges={
                  <>
                    {selected.is_default && (
                      <Badge tone="primary" size="sm">
                        Default
                      </Badge>
                    )}
                    {!selected.is_active && (
                      <Badge tone="neutral" size="sm">
                        Inactive
                      </Badge>
                    )}
                  </>
                }
                sub={countLabel(selected.instalments.length, 'instalment')}
                actions={
                  <DetailActions
                    onEdit={() => {
                      setEditing(selected)
                      setDialogOpen(true)
                    }}
                    onDelete={() => setDeleting(selected)}
                  />
                }
              />
              <Facts>
                <Fact label="Grace after due date">{selected.grace_days != null ? countLabel(selected.grace_days, 'day') : 'School setting'}</Fact>
                <Fact label="Used for">{selected.is_default ? 'Anyone without a plan of their own' : 'Only where chosen'}</Fact>
                <Fact label="Shares add up to">
                  <span className={cn(shareTotal > 0 && Math.abs(shareTotal - 100) > 0.01 && 'text-danger')}>
                    {shareTotal > 0 ? `${shareTotal}%` : 'Fixed amounts'}
                  </span>
                </Fact>
                <Fact label="Classes" wide>
                  {selected.class_ids.length === 0 ? 'Every class' : selected.class_ids.map(className).join(', ')}
                </Fact>
                <Fact label="Admission types" wide>
                  {selected.admission_category_ids.length === 0 ? 'Every admission type' : selected.admission_category_ids.map(typeName).join(', ')}
                </Fact>
              </Facts>
              <DetailSection title={`Instalments · ${selected.instalments.length}`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className={DETAIL_TH}>
                      <th className="w-10 py-1.5 pl-5 pr-2 font-medium">#</th>
                      <th className="px-3 py-1.5 font-medium">Instalment</th>
                      <th className="px-3 py-1.5 font-medium">Term</th>
                      <th className="px-3 py-1.5 font-medium">Falls due</th>
                      <th className="py-1.5 pl-3 pr-5 text-right font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.instalments.map((line, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="py-1.5 pl-5 pr-2 tabular-nums text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-1.5 font-medium text-foreground">{line.label}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{line.term ? TERM_LABEL[line.term] : '—'}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {line.due_date
                            ? formatShortDate(line.due_date)
                            : line.due_after_days != null
                              ? `${countLabel(line.due_after_days, 'day')} after the bill`
                              : 'On the bill date'}
                        </td>
                        <td className="py-1.5 pl-3 pr-5 text-right tabular-nums">
                          {line.percent != null ? `${line.percent}%` : line.amount != null ? line.amount : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DetailSection>
            </>
          ) : (
            <NothingPicked>Create a plan to split the year&rsquo;s fee into instalments</NothingPicked>
          )
        }
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Invoices already issued keep the instalment dates they were built with."
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id)
          setDeleting(null)
        }}
      />
    </>
  )
}

// ================================================================== discounts

function DiscountDialog({
  open,
  onOpenChange,
  editing,
  academicYearId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: DiscountRuleOut | null
  academicYearId: number | null
}) {
  const create = useCreateDiscountRule()
  const update = useUpdateDiscountRule()
  const categories = useAdmissionCategories()

  const [name, setName] = React.useState('')
  const [basis, setBasis] = React.useState<DiscountBasis>('SIBLING')
  const [valueType, setValueType] = React.useState<DiscountValueType>('PERCENT')
  const [value, setValue] = React.useState('0')
  const [appliesFromNth, setAppliesFromNth] = React.useState('2')
  const [categoryIds, setCategoryIds] = React.useState<number[]>([])
  const [isStackable, setIsStackable] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setBasis(editing?.basis ?? 'SIBLING')
    setValueType(editing?.value_type ?? 'PERCENT')
    setValue(String(editing?.value ?? 0))
    setAppliesFromNth(String(editing?.applies_from_nth ?? 2))
    setCategoryIds(editing?.admission_category_ids ?? [])
    setIsStackable(editing?.is_stackable ?? false)
    setError(null)
    setBusy(false)
  }, [open, editing])

  const submit = async () => {
    setError(null)
    if (!name.trim()) return setError('Give the rule a name.')
    if (basisNeedsCategories(basis) && categoryIds.length === 0) {
      return setError('A category concession has to name the categories it applies to.')
    }
    if (basisNeedsStudents(basis)) {
      return setError(
        'Scholarship and one-off concessions are awarded to named students, which this form does not yet pick. Use the student’s fee screen instead.',
      )
    }
    if (valueType === 'PERCENT' && num(value) > 100) {
      return setError('A percentage concession cannot exceed 100%.')
    }

    setBusy(true)
    try {
      if (editing) {
        await update.mutateAsync({
          ruleId: editing.id,
          body: {
            name,
            value_type: valueType,
            value: num(value),
            applies_from_nth: num(appliesFromNth),
            admission_category_ids: categoryIds,
            is_stackable: isStackable,
          },
        })
      } else {
        await create.mutateAsync({
          name,
          basis,
          value_type: valueType,
          value: num(value),
          academic_year_id: academicYearId,
          applies_from_nth: num(appliesFromNth),
          admission_category_ids: categoryIds,
          is_stackable: isStackable,
        })
      }
      onOpenChange(false)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not save the rule.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add a concession'}</DialogTitle>
          <DialogDescription>
            The fee engine applies these automatically. It also records why a rule did NOT
            fire, which shows on each student's breakdown.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />

          <Field id="rule_name" label="Name" required>
            <Input
              id="rule_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Second child concession"
            />
          </Field>

          <Field id="rule_basis" label="Based on" hint={DISCOUNT_BASIS_HINT[basis]}>
            <Select
              value={basis}
              onValueChange={(v) => setBasis(v as DiscountBasis)}
              disabled={!!editing}
            >
              <SelectTrigger id="rule_basis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISCOUNT_BASES.map((b) => (
                  <SelectItem key={b} value={b}>
                    {DISCOUNT_BASIS_LABEL[b]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field id="rule_value_type" label="Concession is">
              <Select
                value={valueType}
                onValueChange={(v) => setValueType(v as DiscountValueType)}
              >
                <SelectTrigger id="rule_value_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENT">A percentage</SelectItem>
                  <SelectItem value="AMOUNT">A flat amount</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id="rule_value" label={valueType === 'PERCENT' ? 'Percent off' : 'Amount off'}>
              <Input
                id="rule_value"
                type="number"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </Field>
          </div>

          {basisUsesNth(basis) && (
            <Field
              id="rule_nth"
              label={basis === 'SIBLING' ? 'From the nth child' : 'From the nth subject'}
              hint={
                basis === 'SIBLING'
                  ? 'The eldest pays in full. 2 means the concession starts with the second child.'
                  : 'Counts subjects one student takes at the same time — not children.'
              }
            >
              <Input
                id="rule_nth"
                type="number"
                min={1}
                value={appliesFromNth}
                onChange={(e) => setAppliesFromNth(e.target.value)}
              />
            </Field>
          )}

          {basisNeedsCategories(basis) && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Categories
              </p>
              <div className="max-h-40 space-y-1.5 overflow-y-auto">
                {(categories.data ?? []).map((cat) => (
                  <label key={cat.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={categoryIds.includes(cat.id)}
                      onCheckedChange={(v) =>
                        setCategoryIds((prev) =>
                          v ? [...prev, cat.id] : prev.filter((id) => id !== cat.id),
                        )
                      }
                    />
                    {cat.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Stacking is off by default and that surprises people, so it is a
              switch with an explanation rather than a bare toggle. */}
          <label className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
            <span className="min-w-0">
              <span className="text-sm font-medium">Stacks with other concessions</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Off — the default — means rules compete and only the best-valued one applies.
                A staff ward who is also a second child then gets one concession, not two.
              </span>
            </span>
            <Switch checked={isStackable} onCheckedChange={setIsStackable} />
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {editing ? 'Save changes' : 'Add concession'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DiscountsTab({ academicYearId, currency }: { academicYearId: number | null; currency: string }) {
  const rules = useDiscountRules({ includeInactive: true })
  const classes = useClasses()
  const categories = useAdmissionCategories()
  const heads = useFeeHeads({ includeInactive: true })
  const remove = useDeleteDiscountRule()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<DiscountRuleOut | null>(null)
  const [deleting, setDeleting] = React.useState<DiscountRuleOut | null>(null)
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [search, setSearch] = React.useState('')
  const add = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const needle = search.trim().toLowerCase()
  const rows = [...(rules.data ?? [])]
    .filter((x) => !needle || `${x.name} ${DISCOUNT_BASIS_LABEL[x.basis]}`.toLowerCase().includes(needle))
    .sort(byActiveThenName)
  const selected = rows.find((x) => x.id === selectedId) ?? rows[0] ?? null
  const off = (x: DiscountRuleOut) => (x.value_type === 'PERCENT' ? `${x.value}%` : formatMoney(x.value, currency))
  const names = (ids: number[], list: { id: number; name: string }[] | undefined, every: string) =>
    ids.length === 0 ? every : ids.map((id) => list?.find((x) => x.id === id)?.name ?? `#${id}`).join(', ')

  return (
    <>
      <SplitView
        list={
          <ListPane
            toolbar={
              <div className="flex gap-2">
                <ListSearch value={search} onChange={setSearch} placeholder="Find a concession" />
                <AddButton onClick={add} label="Add a concession" />
              </div>
            }
            footer={rules.data && `${rules.data.filter((x) => x.is_active).length} active of ${rules.data.length} · applied automatically`}
          >
            <QueryBoundary query={rules} loading={<ListSkeleton />}>
              {() =>
                rows.length === 0 ? (
                  <ListEmpty>{needle ? 'No concession matches' : 'No concessions yet'}</ListEmpty>
                ) : (
                  <>
                    {rows.map((x) => (
                      <ListItem
                        key={x.id}
                        active={!dialogOpen && selected?.id === x.id}
                        onClick={() => {
                          setSelectedId(x.id)
                          setDialogOpen(false)
                        }}
                        title={x.name}
                        sub={`${DISCOUNT_BASIS_LABEL[x.basis]}${x.is_active ? '' : ' · Inactive'}`}
                        muted={!x.is_active}
                        right={<span className="font-medium tabular-nums text-foreground">{off(x)} off</span>}
                      />
                    ))}
                  </>
                )
              }
            </QueryBoundary>
          </ListPane>
        }
        detail={
          dialogOpen ? (
            <DiscountDialog open onOpenChange={setDialogOpen} editing={editing} academicYearId={academicYearId} />
          ) : selected ? (
            <>
              <DetailHeader
                title={selected.name}
                badges={!selected.is_active && <Badge tone="neutral" size="sm">Inactive</Badge>}
                sub={DISCOUNT_BASIS_LABEL[selected.basis]}
                actions={
                  <DetailActions
                    onEdit={() => {
                      setEditing(selected)
                      setDialogOpen(true)
                    }}
                    onDelete={() => setDeleting(selected)}
                  />
                }
              />
              <p className="border-b border-border px-5 py-2.5 text-xs text-muted-foreground">{DISCOUNT_BASIS_HINT[selected.basis]}</p>
              <Facts>
                <Fact label="Off">
                  <span className="text-base font-medium tabular-nums">{off(selected)}</span>
                  {selected.max_amount != null && <span className="text-xs text-muted-foreground"> · at most {formatMoney(selected.max_amount, currency)}</span>}
                </Fact>
                <Fact label="With other concessions">{selected.is_stackable ? 'Stacks on top' : 'Only the best one applies'}</Fact>
                {basisUsesNth(selected.basis) && <Fact label="Starts from">The {ordinal(selected.applies_from_nth)} one</Fact>}
                {selected.min_count != null && <Fact label="Needs at least">{selected.min_count}</Fact>}
                <Fact label="Valid">
                  {selected.valid_from || selected.valid_until
                    ? `${selected.valid_from ? formatShortDate(selected.valid_from) : 'Any time'} – ${selected.valid_until ? formatShortDate(selected.valid_until) : 'no end'}`
                    : 'Always'}
                </Fact>
                <Fact label="Priority">{selected.priority}</Fact>
              </Facts>
              <DetailSection title="Who and what it covers">
                <dl className="divide-y divide-border border-b border-border text-sm">
                  {[
                    ['Fees', names(selected.fee_head_ids, heads.data, 'Every fee that allows concessions')],
                    ['Classes', names(selected.class_ids, classes.data, 'Every class')],
                    ['Admission types', names(selected.admission_category_ids, categories.data, 'Every admission type')],
                    ...(selected.student_ids.length > 0 ? [['Students', countLabel(selected.student_ids.length, 'named student')]] : []),
                  ].map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 px-5 py-2">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              </DetailSection>
              {selected.notes && <p className="px-5 py-3 text-sm text-muted-foreground">{selected.notes}</p>}
            </>
          ) : (
            <NothingPicked>
              Add a concession and it is applied automatically to every student it matches. Record siblings on each student&rsquo;s Parents &amp;
              Siblings tab for sibling concessions to have anything to count
            </NothingPicked>
          )
        }
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Draft invoices re-price without it the next time they are rebuilt. Issued ones keep their frozen figures."
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id)
          setDeleting(null)
        }}
      />
    </>
  )
}

function ordinal(n: number) {
  const rest = n % 100
  const suffix = rest >= 11 && rest <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${suffix}`
}

function formatShortDate(value: string) {
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ======================================================================= page

type Section = 'invoices' | 'bulk' | 'reports' | 'heads' | 'structures' | 'plans' | 'discounts' | 'currencies' | 'settings'

interface MenuItem {
  key: Section
  label: string
  icon: LucideIcon
  hint: string
}

const MENU: { group: string; items: MenuItem[] }[] = [
  {
    group: 'Billing',
    items: [
      { key: 'invoices', label: 'Bills', icon: Receipt, hint: 'Every student’s bill this session: billed, paid, left to pay' },
      { key: 'bulk', label: 'Bulk billing', icon: ListChecks, hint: 'Bill whole classes at once: the year’s fees, a fee held back, or an extra item' },
      { key: 'reports', label: 'Reports', icon: BarChart3, hint: 'Students, dues by age, collections and every transaction' },
    ],
  },
  {
    group: 'Fee setup',
    items: [
      { key: 'heads', label: 'Fee heads', icon: Coins, hint: 'What can be charged' },
      { key: 'structures', label: 'Fee structures', icon: Layers, hint: 'What each class or admission type is charged' },
      { key: 'plans', label: 'Instalments', icon: CalendarClock, hint: 'When the fee falls due' },
      { key: 'discounts', label: 'Concessions', icon: Percent, hint: 'Automatic discounts and who gets them' },
      { key: 'currencies', label: 'Currencies', icon: Globe, hint: 'Rates for taking fees in other currencies' },
      { key: 'settings', label: 'Settings', icon: Settings2, hint: 'Currency, tax, late fees, bill numbers and online payment' },
    ],
  },
]
const SECTIONS = MENU.flatMap((g) => g.items)
/** Sections laid out as list + detail: they fill the pane and scroll inside it. */
const SPLIT: Section[] = ['invoices', 'bulk', 'reports', 'heads', 'structures', 'plans', 'discounts']

export default function AdminFinancePage() {
  const settings = useFinanceSettings()
  const currentYear = useCurrentYear()
  const years = useAcademicYears()
  const heads = useFeeHeads({ includeInactive: true })
  const structures = useFeeStructures({ includeInactive: true })
  const plans = useInstalmentPlans({ includeInactive: true })
  const rules = useDiscountRules({ includeInactive: true })
  const [params, setParams] = useSearchParams()

  const currency = settings.data?.currency ?? 'INR'
  const academicYearId = currentYear.data?.id ?? null
  const asked = params.get('tab') as Section | null
  const section: Section = asked && SECTIONS.some((x) => x.key === asked) ? asked : 'invoices'
  const current = SECTIONS.find((x) => x.key === section)!
  const go = (key: Section) => {
    const next = new URLSearchParams(params)
    if (key === 'invoices') next.delete('tab')
    else next.set('tab', key)
    setParams(next, { replace: true })
  }

  const counts: Partial<Record<Section, number | undefined>> = {
    heads: heads.data?.filter((h) => h.is_active).length,
    structures: structures.data?.filter((x) => x.is_active).length,
    plans: plans.data?.filter((x) => x.is_active).length,
    discounts: rules.data?.filter((x) => x.is_active).length,
  }

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title="Fee Management"
        description={`Fee setup and every bill it produces${currentYear.data?.name ? ` · ${currentYear.data.name}` : ''}`}
        icon={Coins}
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link to="/admin/fee-collection">
              <HandCoins />
              Fee counter
            </Link>
          </Button>
        }
      />

      <div className="!mt-0">
        {/* Nothing downstream can be created without a year to hang it off, so
            this is said once at the top rather than as four identical errors. */}
        {!currentYear.isPending && !academicYearId && (
          <Band className="border-b border-warning/40 bg-warning/5">
            <p className="flex items-center gap-2 py-2 text-sm text-foreground">
              <AlertTriangle className="size-4 shrink-0 text-warning" />
              <span>
                <strong className="font-medium">No current session year.</strong> Structures, plans and bills all hang off one. Set a year as
                current under Admissions first{years.data?.length ? '' : ' — there are none recorded yet'}
              </span>
            </p>
          </Band>
        )}

        <Band className="border-b border-border">
          <div className="grid lg:h-[calc(100vh-12rem)] lg:min-h-[30rem] lg:grid-cols-[14rem_minmax(0,1fr)] lg:divide-x lg:divide-border">
            <nav aria-label="Fee Management" className="-mx-4 border-b border-border sm:-mx-6 lg:mx-0 lg:-ml-8 lg:overflow-y-auto lg:border-b-0">
              {MENU.map(({ group, items }) => (
                <div key={group}>
                  <p className="border-b border-border bg-muted/40 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:px-6 lg:pl-8 lg:pr-4">
                    {group}
                  </p>
                  {items.map((item) => {
                    const active = item.key === section
                    const Icon = item.icon
                    const n = counts[item.key]
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => go(item.key)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'relative flex w-full items-center gap-2.5 border-b border-border py-2 pl-4 pr-4 text-left text-sm transition-colors sm:pl-6 lg:pl-8',
                          active ? 'bg-primary/5 font-medium text-primary' : 'text-foreground hover:bg-muted/40',
                        )}
                      >
                        {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
                        <Icon className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} strokeWidth={1.75} />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {n != null && <span className="text-xs font-normal tabular-nums text-muted-foreground">{n}</span>}
                      </button>
                    )
                  })}
                </div>
              ))}
            </nav>

            <section className="-mx-4 flex min-w-0 flex-col sm:-mx-6 lg:mx-0 lg:-mr-8 lg:min-h-0" aria-label={current.label}>
              {section !== 'reports' && (
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-base font-medium text-foreground">{current.label}</h2>
                  <p className="text-xs text-muted-foreground">{current.hint}</p>
                </div>
              )}

              <div className={cn('min-w-0 lg:min-h-0 lg:flex-1', SPLIT.includes(section) ? 'lg:overflow-hidden' : 'lg:overflow-y-auto')}>
              {section === 'invoices' && <FinanceInvoicesTab academicYearId={academicYearId} />}
              {section === 'bulk' && <FinanceBulkTab academicYearId={academicYearId} />}
              {section === 'reports' && (
                <FinanceReportsTab academicYearId={academicYearId} academicYearStart={currentYear.data?.start_date ?? null} />
              )}
              {section === 'heads' && <HeadsTab currency={currency} />}
              {section === 'structures' && <StructuresTab currency={currency} academicYearId={academicYearId} />}
              {section === 'plans' && <PlansTab academicYearId={academicYearId} />}
              {section === 'discounts' && <DiscountsTab academicYearId={academicYearId} currency={currency} />}
              {section === 'currencies' && (
                <div className="p-4">
                  <FinanceCurrenciesTab />
                </div>
              )}
              {section === 'settings' && <SettingsTab />}
              </div>
            </section>
          </div>
        </Band>
      </div>
    </div>
  )
}

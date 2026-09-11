import { zodResolver } from '@hookform/resolvers/zod'
import {
  Ban,
  Banknote,
  Download,
  FileSearch,
  FileText,
  Phone,
  UserRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  Send,
  Trash2,
} from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import type { BillingExportView, FeeBasis, FeePlanOut, InvoiceOut } from '@/api/types'
import { useSubjects } from '@/queries/admin.queries'
import {
  useCancelInvoice,
  useCreateFeePlan,
  useDeleteFeePlan,
  useFeePlans,
  useGenerateInvoice,
  useGenerateInvoiceBatch,
  useInvoiceDetail,
  useIssueInvoice,
  useRecordPayment,
  useStudentBilling,
  useTuitionBilling,
  useTuitionExport,
  useTuitionUsers,
  useUpdateFeePlan,
} from '@/queries/tuition.queries'
import { formatDate, formatDateTime } from '@/lib/datetime'
import {
  FEE_BASIS_HINT,
  FEE_BASIS_LABEL,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
  amountOutstanding,
  formatMoney,
  isEditableInvoice,
} from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field } from '@/components/forms/field'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { SessionStatusBadge } from '@/components/domain/tuition'
import { PageHeader } from '@/components/layout/page-header'
import { PeriodPicker, useReportPeriod } from './period'

/**
 * Fee plans and invoicing.
 *
 * Billing here is derived, not typed in: a fee plan says how to price a class,
 * and generating an invoice counts the classes that were actually conducted in
 * a period and multiplies. That is why the attendance rules matter to money —
 * a class the teacher missed is not chargeable, and a class the student missed
 * generally is.
 *
 * A DRAFT is recomputed from those counts every time it is regenerated. Once
 * ISSUED the numbers are frozen, because a bill that changes after it was sent
 * is not a bill.
 */

const FEE_BASES: FeeBasis[] = ['PER_SESSION', 'HOURLY', 'MONTHLY']

const planSchema = z.object({
  name: z.string().min(1, 'Name the plan').max(150),
  basis: z.string(),
  amount: z.string().min(1, 'Enter an amount'),
  currency: z.string().max(8).optional(),
  subject_id: z.string().optional(),
  no_show_amount: z.string().optional(),
  charge_teacher_no_show: z.boolean(),
  is_active: z.boolean(),
  notes: z.string().max(1000).optional(),
})
type PlanValues = z.infer<typeof planSchema>

function FeePlanDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: FeePlanOut | null
}) {
  const subjects = useSubjects(open)
  const create = useCreateFeePlan()
  const update = useUpdateFeePlan()

  const form = useForm<PlanValues>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: '',
      basis: 'PER_SESSION',
      amount: '',
      charge_teacher_no_show: false,
      is_active: true,
    },
  })

  React.useEffect(() => {
    if (!open) return
    form.reset({
      name: editing?.name ?? '',
      basis: editing?.basis ?? 'PER_SESSION',
      amount: editing ? String(editing.amount) : '',
      currency: editing?.currency ?? '',
      subject_id: editing?.subject_id ? String(editing.subject_id) : '',
      no_show_amount: editing?.no_show_amount != null ? String(editing.no_show_amount) : '',
      charge_teacher_no_show: editing?.charge_teacher_no_show ?? false,
      is_active: editing?.is_active ?? true,
      notes: editing?.notes ?? '',
    })
  }, [open, editing, form])

  const basis = form.watch('basis') as FeeBasis

  const onSubmit = async (values: PlanValues) => {
    const body = {
      name: values.name,
      basis: values.basis as FeeBasis,
      amount: Number(values.amount),
      currency: values.currency?.trim() || null,
      subject_id: values.subject_id ? Number(values.subject_id) : null,
      // Null is meaningful and is NOT the same as zero: null bills a missed
      // class in full, zero bills nothing for it.
      no_show_amount: values.no_show_amount === '' ? null : Number(values.no_show_amount),
      charge_teacher_no_show: values.charge_teacher_no_show,
      is_active: values.is_active,
      notes: values.notes || null,
    }

    try {
      if (editing) await update.mutateAsync({ planId: editing.id, body })
      else await create.mutateAsync(body)
      onOpenChange(false)
    } catch (error) {
      form.setError('root', {
        message: (error as { message?: string })?.message ?? 'Could not save the fee plan.',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit fee plan' : 'New fee plan'}</DialogTitle>
          <DialogDescription>
            A plan without a subject is the programme default. One scoped to a subject overrides it
            for that subject, and an arrangement can override both.
          </DialogDescription>
        </DialogHeader>

        <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-4">
            {form.formState.errors.root && (
              <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
                {form.formState.errors.root.message}
              </p>
            )}

            <Field id="plan-name" label="Name" required error={form.formState.errors.name?.message}>
              <Input id="plan-name" placeholder="Standard hourly" {...form.register('name')} />
            </Field>

            <Field id="basis" label="How it is worked out" required hint={FEE_BASIS_HINT[basis]}>
              <Select value={basis} onValueChange={(v) => form.setValue('basis', v)}>
                <SelectTrigger id="basis">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEE_BASES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {FEE_BASIS_LABEL[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="amount"
                label="Amount"
                required
                error={form.formState.errors.amount?.message}
              >
                <Input id="amount" type="number" step="0.01" min={0} {...form.register('amount')} />
              </Field>
              <Field id="currency" label="Currency" hint="Leave blank to use the programme's.">
                <Input id="currency" placeholder="AED" maxLength={8} {...form.register('currency')} />
              </Field>
            </div>

            <Field id="plan-subject" label="Subject" hint="Leave blank to make this the default plan.">
              <Combobox
                id="plan-subject"
                value={form.watch('subject_id') || null}
                onChange={(v) => form.setValue('subject_id', v)}
                options={[
                  { value: '', label: 'Any subject (default plan)' },
                  ...(subjects.data ?? []).map((s) => ({
                    value: String(s.id),
                    label: s.name,
                    hint: s.code,
                  })),
                ]}
                placeholder="Any subject"
              />
            </Field>

            <Field
              id="noshow"
              label="Charge when the student misses"
              hint="Leave blank to bill a missed class in full. Enter 0 to bill nothing for it."
            >
              <Input
                id="noshow"
                type="number"
                step="0.01"
                min={0}
                placeholder="Full amount"
                {...form.register('no_show_amount')}
              />
            </Field>

            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <span className="text-sm">
                Charge when the teacher misses
                <span className="block text-xs text-muted-foreground">
                  Off by default. A class the programme failed to deliver is not normally the
                  student's to pay for.
                </span>
              </span>
              <Switch
                checked={form.watch('charge_teacher_no_show')}
                onCheckedChange={(v) => form.setValue('charge_teacher_no_show', v)}
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <span className="text-sm">Active</span>
              <Switch
                checked={form.watch('is_active')}
                onCheckedChange={(v) => form.setValue('is_active', v)}
              />
            </label>

            <Field id="plan-notes" label="Notes">
              <Textarea id="plan-notes" rows={2} {...form.register('notes')} />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              {editing ? 'Save plan' : 'Create plan'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

function FeePlansTab() {
  const plans = useFeePlans()
  const remove = useDeleteFeePlan()
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<FeePlanOut | null>(null)
  const [deleting, setDeleting] = React.useState<FeePlanOut | null>(null)

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => {
            setEditing(null)
            setOpen(true)
          }}
        >
          <Plus />
          New fee plan
        </Button>
      </div>

      <QueryBoundary
        query={plans}
        loading={
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        }
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={<Banknote />}
            title="No fee plans yet"
            description="A plan says how to price a class. Without one, nothing can be invoiced."
            action={
              <Button
                onClick={() => {
                  setEditing(null)
                  setOpen(true)
                }}
              >
                <Plus />
                New fee plan
              </Button>
            }
          />
        }
      >
        {(data) => (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.map((plan) => (
              <Card key={plan.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">{plan.name}</h3>
                      {!plan.is_active && (
                        <Badge tone="neutral" size="sm">
                          Inactive
                        </Badge>
                      )}
                      {!plan.subject_id && (
                        <Badge tone="primary" size="sm">
                          Default
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {formatMoney(plan.amount, plan.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">{FEE_BASIS_LABEL[plan.basis]}</p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Actions">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditing(plan)
                          setOpen(true)
                        }}
                      >
                        <Pencil />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem destructive onSelect={() => setDeleting(plan)}>
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <dl className="mt-3 space-y-1 border-t border-border/60 pt-3 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Student misses a class</dt>
                    <dd className="tabular-nums">
                      {plan.no_show_amount == null
                        ? 'Billed in full'
                        : formatMoney(plan.no_show_amount, plan.currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Teacher misses a class</dt>
                    <dd>{plan.charge_teacher_no_show ? 'Billed' : 'Not billed'}</dd>
                  </div>
                </dl>

                {plan.notes && <p className="mt-2 text-xs text-muted-foreground">{plan.notes}</p>}
              </Card>
            ))}
          </div>
        )}
      </QueryBoundary>

      <FeePlanDialog open={open} onOpenChange={setOpen} editing={editing} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        destructive
        confirmLabel="Delete plan"
        loading={remove.isPending}
        description="Invoices already issued keep their amounts — those were frozen when they were issued. Drafts that used this plan will need regenerating."
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }}
      />
    </>
  )
}

function InvoiceCard({
  invoice,
  onAudit,
}: {
  invoice: InvoiceOut
  onAudit: () => void
}) {
  const issue = useIssueInvoice()
  const pay = useRecordPayment()
  const cancel = useCancelInvoice()

  const [paying, setPaying] = React.useState(false)
  const [amount, setAmount] = React.useState('')
  const [method, setMethod] = React.useState('')
  const [reference, setReference] = React.useState('')
  const [cancelling, setCancelling] = React.useState(false)

  const outstanding = amountOutstanding(invoice)

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold">
              {invoice.student_name ?? `Student ${invoice.student_id}`}
            </h3>
            <Badge tone={INVOICE_STATUS_TONE[invoice.status]} size="sm">
              {INVOICE_STATUS_LABEL[invoice.status]}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
            {invoice.admission_number ? ` · ${invoice.admission_number}` : ''}
          </p>
        </div>

        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums">
            {formatMoney(invoice.total_amount, invoice.currency)}
          </p>
          {outstanding > 0.005 ? (
            <p className="text-xs text-warning">
              {formatMoney(outstanding, invoice.currency)} outstanding
            </p>
          ) : invoice.total_amount > 0 ? (
            <p className="text-xs text-success">Paid in full</p>
          ) : null}
        </div>
      </div>

      {invoice.line_items.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border/60 pt-3">
          {invoice.line_items.map((line, index) => (
            <li key={index} className="flex flex-wrap justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                {String(line.description ?? line.subject ?? 'Classes')}
                {line.quantity != null ? ` × ${line.quantity}` : ''}
              </span>
              <span className="tabular-nums">
                {formatMoney(Number(line.amount ?? 0), invoice.currency)}
              </span>
            </li>
          ))}
          {invoice.discount_amount > 0 && (
            <li className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Discount</span>
              <span className="tabular-nums">
                −{formatMoney(invoice.discount_amount, invoice.currency)}
              </span>
            </li>
          )}
          {invoice.tax_amount > 0 && (
            <li className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">
                {formatMoney(invoice.tax_amount, invoice.currency)}
              </span>
            </li>
          )}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        {isEditableInvoice(invoice) && (
          <Button
            size="sm"
            loading={issue.isPending}
            onClick={() => issue.mutate(invoice.id)}
          >
            <Send />
            Issue
          </Button>
        )}
        {invoice.status !== 'CANCELLED' && invoice.status !== 'DRAFT' && outstanding > 0.005 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAmount(outstanding.toFixed(2))
              setPaying(true)
            }}
          >
            <Banknote />
            Record payment
          </Button>
        )}
        {invoice.status !== 'CANCELLED' && (
          <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>
            <Ban />
            Cancel
          </Button>
        )}
        {/* The workings behind the total. Opening this is what turns "why is
            this 4,000?" from an argument into a lookup. */}
        <Button size="sm" variant="ghost" onClick={onAudit}>
          <FileSearch />
          Show the classes
        </Button>

        {invoice.payments.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {invoice.payments.length} payment{invoice.payments.length === 1 ? '' : 's'} recorded
          </span>
        )}
      </div>

      <ConfirmDialog
        open={paying}
        onOpenChange={setPaying}
        title="Record a payment"
        confirmLabel="Record payment"
        loading={pay.isPending}
        description={`${formatMoney(outstanding, invoice.currency)} is outstanding on this invoice.`}
        onConfirm={() => {
          const value = Number(amount)
          if (!value || value <= 0) return
          pay.mutate(
            {
              invoiceId: invoice.id,
              body: {
                amount: value,
                method: method.trim() || null,
                reference: reference.trim() || null,
              },
            },
            { onSuccess: () => setPaying(false) },
          )
        }}
      >
        <div className="space-y-3">
          <Field id={`amt-${invoice.id}`} label="Amount" required>
            <Input
              id={`amt-${invoice.id}`}
              type="number"
              step="0.01"
              min={0}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field id={`method-${invoice.id}`} label="Method">
            <Input
              id={`method-${invoice.id}`}
              placeholder="Bank transfer"
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            />
          </Field>
          <Field id={`ref-${invoice.id}`} label="Reference">
            <Input
              id={`ref-${invoice.id}`}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </Field>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this invoice?"
        destructive
        confirmLabel="Cancel invoice"
        loading={cancel.isPending}
        description="The invoice is kept as a record but is no longer owed. Payments already recorded against it stay recorded."
        onConfirm={() =>
          cancel.mutate({ invoiceId: invoice.id }, { onSuccess: () => setCancelling(false) })
        }
      />
    </Card>
  )
}

/**
 * One invoice down to the individual classes behind every line.
 *
 * The counts on a line come from the invoice; the classes come from the
 * session records, read back live. That is why a class can appear here and
 * still not be in the total — `is_billable` is the reason, and showing the
 * session rather than hiding it is what makes the figure checkable.
 */
function InvoiceAuditSheet({
  invoiceId,
  onOpenChange,
}: {
  invoiceId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const detail = useInvoiceDetail(invoiceId)
  const exports = useTuitionExport()

  return (
    <Sheet open={!!invoiceId} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>What this invoice is made of</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <QueryBoundary
            query={detail}
            loading={
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            }
          >
            {(data) => (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {data.student_name ?? `Student ${data.student_id}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(data.period_start)} – {formatDate(data.period_end)} ·{' '}
                      {data.session_count} class{data.session_count === 1 ? '' : 'es'} in the period
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      loading={exports.invoice.isPending}
                      onClick={() =>
                        exports.invoice.mutate({ invoiceId: data.id, view: 'lines' })
                      }
                    >
                      <Download />
                      Lines
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={exports.invoice.isPending}
                      onClick={() =>
                        exports.invoice.mutate({ invoiceId: data.id, view: 'sessions' })
                      }
                    >
                      <Download />
                      Classes
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Total" value={formatMoney(data.total_amount, data.currency)} />
                  <Stat
                    label="Paid"
                    value={formatMoney(data.amount_paid, data.currency)}
                    tone="text-success"
                  />
                  <Stat
                    label="Outstanding"
                    value={formatMoney(data.outstanding, data.currency)}
                    tone={data.outstanding > 0.005 ? 'text-warning' : undefined}
                  />
                </div>

                {data.line_items.map((line, index) => (
                  <Card key={index} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {String(line.subject ?? line.description ?? 'Classes')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {line.quantity != null ? `${line.quantity} × ` : ''}
                          {line.unit_amount != null
                            ? formatMoney(Number(line.unit_amount), data.currency)
                            : ''}
                          {line.basis ? ` · ${FEE_BASIS_LABEL[line.basis]}` : ''}
                        </p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">
                        {formatMoney(Number(line.amount ?? 0), data.currency)}
                      </p>
                    </div>

                    {line.sessions.length > 0 && (
                      <ul className="mt-3 space-y-1 border-t border-border/60 pt-3">
                        {line.sessions.map((session) => (
                          <li
                            key={String(session.id)}
                            className="flex flex-wrap items-center gap-2 text-xs"
                          >
                            <span className="tabular-nums text-muted-foreground">
                              {formatDateTime(
                                session.scheduled_start_at_local ?? session.scheduled_start_at,
                              )}
                            </span>
                            <SessionStatusBadge session={session} />
                            {session.attendance_status && (
                              <Badge tone="outline" size="sm">
                                {session.attendance_status}
                              </Badge>
                            )}
                            {/* Explains a class that happened but is not in
                                the total — otherwise the count looks wrong. */}
                            {session.is_billable === false && (
                              <Badge tone="neutral" size="sm">
                                Not billed
                              </Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </QueryBoundary>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

/**
 * One student's whole billing history — the screen for when a parent rings up.
 *
 * Contact details sit beside the figures on purpose: the question is nearly
 * always "what do they owe, and for what?", and having to leave for a second
 * lookup to find a phone number is what makes that call long.
 */
function StudentAccountSheet({
  studentId,
  onOpenChange,
}: {
  studentId: number | null
  onOpenChange: (open: boolean) => void
}) {
  const account = useStudentBilling(studentId)

  return (
    <Sheet open={studentId != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Billing account</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <QueryBoundary
            query={account}
            loading={
              <div className="space-y-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-40" />
              </div>
            }
          >
            {(data) => (
              <div className="space-y-4">
                <Card className="p-4">
                  <div className="flex items-start gap-3">
                    <UserRound className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {data.student_name ?? `Student ${data.student_id}`}
                      </p>
                      {data.admission_number && (
                        <p className="text-xs text-muted-foreground">{data.admission_number}</p>
                      )}
                      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                        {data.email && <p>{data.email}</p>}
                        {data.phone && (
                          <p className="flex items-center gap-1.5">
                            <Phone className="size-3" />
                            {data.phone}
                          </p>
                        )}
                        {data.guardian_name && (
                          <p>
                            Guardian: {data.guardian_name}
                            {data.guardian_phone ? ` · ${data.guardian_phone}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>

                <div className="grid grid-cols-3 gap-2">
                  <Stat
                    label="Billed"
                    value={formatMoney(data.summary.total_billed, data.summary.currency)}
                  />
                  <Stat
                    label="Paid"
                    value={formatMoney(data.summary.total_collected, data.summary.currency)}
                    tone="text-success"
                  />
                  <Stat
                    label="Owed"
                    value={formatMoney(data.summary.outstanding, data.summary.currency)}
                    tone={data.summary.outstanding > 0.005 ? 'text-warning' : undefined}
                  />
                </div>

                {data.summary.overdue_count > 0 && (
                  <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
                    {data.summary.overdue_count} invoice
                    {data.summary.overdue_count === 1 ? ' is' : 's are'} past the due date —{' '}
                    {formatMoney(data.summary.overdue_amount, data.summary.currency)}.
                  </p>
                )}

                {/* Newest first, which is the order the question is asked in. */}
                <div className="space-y-2">
                  {data.invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {invoice.line_items.length} line
                          {invoice.line_items.length === 1 ? '' : 's'}
                          {invoice.due_date ? ` · due ${formatDate(invoice.due_date)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={INVOICE_STATUS_TONE[invoice.status]} size="sm">
                          {INVOICE_STATUS_LABEL[invoice.status]}
                        </Badge>
                        <span className="text-sm font-semibold tabular-nums">
                          {formatMoney(invoice.total_amount, invoice.currency)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </QueryBoundary>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

function InvoicesTab() {
  const { from, to, setPeriod } = useReportPeriod('month')
  const [studentId, setStudentId] = React.useState<string | null>(null)
  const [unpaidOnly, setUnpaidOnly] = React.useState(false)

  const students = useTuitionUsers('STUDENT')

  /**
   * One call for the rows AND the totals.
   *
   * Deliberately not `useTuitionInvoices` + `useTuitionFeeSummary`: those are
   * two queries that can resolve against different data, and a headline figure
   * contradicting the rows beneath it is how a billing screen loses trust.
   */
  const billing = useTuitionBilling({
    student: studentId ? Number(studentId) : undefined,
    from,
    to,
    unpaidOnly,
  })

  const generateOne = useGenerateInvoice()
  const generateBatch = useGenerateInvoiceBatch()
  const exports = useTuitionExport()

  const [generating, setGenerating] = React.useState(false)
  const [target, setTarget] = React.useState<string | null>(null)
  const [auditing, setAuditing] = React.useState<string | null>(null)
  const [accountFor, setAccountFor] = React.useState<number | null>(null)

  const exportFilters = {
    studentId: studentId ? Number(studentId) : undefined,
    fromDate: from,
    toDate: to,
  }

  const EXPORTS: { view: BillingExportView; label: string; hint: string }[] = [
    { view: 'summary', label: 'Invoices', hint: 'One row per invoice — reconciles to the ledger' },
    { view: 'lines', label: 'Lines', hint: 'One row per subject, with the class counts behind it' },
    { view: 'payments', label: 'Payments', hint: 'What has been paid and what is still owed' },
    { view: 'sessions', label: 'Classes', hint: 'Every class, with dates and attendance' },
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <PeriodPicker from={from} to={to} onChange={setPeriod} />
          <div className="min-w-48">
            <Combobox
              value={studentId}
              onChange={(v) => setStudentId(v || null)}
              options={[
                { value: '', label: 'All students' },
                ...(students.data ?? []).map((u) => ({
                  value: String(u.id),
                  label: u.full_name,
                  hint: u.admission_number ?? u.email,
                })),
              ]}
              placeholder="All students"
            />
          </div>

          <label className="flex items-center gap-2 pb-2 text-sm text-muted-foreground">
            <Checkbox
              checked={unpaidOnly}
              onCheckedChange={(v) => setUnpaidOnly(v === true)}
            />
            Only what is still owed
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Only offered once a student is chosen — an account view of
              "everyone" is just the list already on screen. */}
          {studentId && (
            <Button variant="outline" onClick={() => setAccountFor(Number(studentId))}>
              <UserRound />
              Their account
            </Button>
          )}
          <Button variant="outline" onClick={() => setGenerating(true)}>
            <FileText />
            Draft one invoice
          </Button>
          <Button
            loading={generateBatch.isPending}
            onClick={() => generateBatch.mutate({ period_start: from, period_end: to })}
          >
            <Receipt />
            Bill everyone
          </Button>
        </div>
      </div>

      <QueryBoundary
        query={billing}
        loading={
          <div className="space-y-3">
            <Skeleton className="h-28" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        }
      >
        {(data) => (
          <>
            <Card className="mb-4 p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Billed"
                  value={formatMoney(data.summary.total_billed, data.summary.currency)}
                />
                <Stat
                  label="Collected"
                  value={formatMoney(data.summary.total_collected, data.summary.currency)}
                  tone="text-success"
                />
                <Stat
                  label="Outstanding"
                  value={formatMoney(data.summary.outstanding, data.summary.currency)}
                  tone={data.summary.outstanding > 0.005 ? 'text-warning' : undefined}
                />
                {/* Only ISSUED invoices past their due date. A draft is never
                    overdue — nobody has been asked to pay it. */}
                <Stat
                  label="Overdue"
                  value={formatMoney(data.summary.overdue_amount, data.summary.currency)}
                  tone={data.summary.overdue_count > 0 ? 'text-danger' : undefined}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 sm:grid-cols-4">
                <Stat label="Classes billed" value={data.summary.classes_billed} />
                <Stat label="Conducted" value={data.summary.classes_conducted} />
                <Stat label="Attended" value={data.summary.classes_attended} />
                <Stat label="Missed" value={data.summary.classes_missed} />
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                {formatDate(from)} – {formatDate(to)}, over the {data.summary.invoice_count} invoice
                {data.summary.invoice_count === 1 ? '' : 's'} listed below — these totals are
                computed from exactly those rows. Run maintenance before a billing run so classes
                nobody closed are settled and counted.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                <span className="text-xs font-medium text-muted-foreground">Export as CSV:</span>
                {EXPORTS.map((item) => (
                  <Button
                    key={item.view}
                    size="sm"
                    variant="outline"
                    title={item.hint}
                    loading={
                      exports.billing.isPending && exports.billing.variables?.view === item.view
                    }
                    onClick={() =>
                      exports.billing.mutate({ view: item.view, filters: exportFilters })
                    }
                  >
                    <Download />
                    {item.label}
                  </Button>
                ))}
              </div>
            </Card>

            {data.invoices.length === 0 ? (
              <EmptyState
                icon={<Receipt />}
                title={unpaidOnly ? 'Nothing outstanding' : 'No invoices yet'}
                description={
                  unpaidOnly
                    ? 'Every invoice in this period is settled or cancelled.'
                    : 'Bill everyone for a period, or draft one invoice for a single student.'
                }
              />
            ) : (
              <div className="space-y-3">
                {data.invoices.map((invoice) => (
                  <InvoiceCard
                    key={invoice.id}
                    invoice={invoice}
                    onAudit={() => setAuditing(invoice.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </QueryBoundary>

      <ConfirmDialog
        open={generating}
        onOpenChange={setGenerating}
        title="Draft an invoice"
        confirmLabel="Draft invoice"
        loading={generateOne.isPending}
        description={`Counts the classes conducted between ${formatDate(from)} and ${formatDate(to)} and prices them from the fee plans.`}
        onConfirm={() => {
          if (!target) return
          generateOne.mutate(
            { student_id: Number(target), period_start: from, period_end: to },
            {
              onSuccess: () => {
                setGenerating(false)
                setTarget(null)
              },
            },
          )
        }}
      >
        <Field id="invoice-student" label="Student" required>
          <Combobox
            id="invoice-student"
            value={target}
            onChange={setTarget}
            options={(students.data ?? []).map((u) => ({
              value: String(u.id),
              label: u.full_name,
              hint: u.admission_number ?? u.email,
            }))}
            placeholder="Choose a student…"
          />
        </Field>
      </ConfirmDialog>

      <InvoiceAuditSheet
        invoiceId={auditing}
        onOpenChange={(open) => !open && setAuditing(null)}
      />

      <StudentAccountSheet
        studentId={accountFor}
        onOpenChange={(open) => !open && setAccountFor(null)}
      />
    </>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: React.ReactNode
  tone?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <p className={`text-lg font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

export default function AdminTuitionFeesPage() {
  return (
    <>
      <PageHeader
        title="Fees & invoices"
        description="Bills are counted from classes actually conducted, then priced by the fee plan."
      />

      <Tabs defaultValue="invoices">
        <TabsList className="mb-5">
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="plans">Fee plans</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <InvoicesTab />
        </TabsContent>
        <TabsContent value="plans">
          <FeePlansTab />
        </TabsContent>
      </Tabs>
    </>
  )
}

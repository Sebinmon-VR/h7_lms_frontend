import { zodResolver } from '@hookform/resolvers/zod'
import {
  Ban,
  Banknote,
  Download,
  FileSearch,
  FileText,
  Package,
  Phone,
  UserRound,
  UsersRound,
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

import type {
  AcademicTerm,
  BillingExportView,
  InvoiceLineDetail,
  InvoiceLineItem,
  InvoiceOut,
  PackageBillingMode,
  TuitionPackageOut,
  TuitionSessionOut,
} from '@/api/types'
import { useAcademicYears } from '@/queries/admissions.queries'
import {
  useCancelInvoice,
  useCreatePackage,
  useDeletePackage,
  useGenerateInvoice,
  useGenerateInvoiceBatch,
  useInvoiceDetail,
  useIssueInvoice,
  usePackageStudents,
  usePackages,
  useRecordPayment,
  useStudentBilling,
  useTuitionBilling,
  useTuitionExport,
  useTuitionUsers,
  useUpdatePackage,
} from '@/queries/tuition.queries'
import { formatDate, formatDateTime } from '@/lib/datetime'
import {
  BILLING_MODES,
  BILLING_MODE_HINT,
  BILLING_MODE_LABEL,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
  TERMS,
  TERM_LABEL,
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
import { Field, FormError } from '@/components/forms/field'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { SessionStatusBadge } from '@/components/domain/tuition'
import { PageHeader } from '@/components/layout/page-header'
import { PeriodPicker, useReportPeriod } from './period'

/**
 * Packages and invoicing.
 *
 * The fee is a PACKAGE, not a rate per subject: a student buys "30 classes for
 * 15,000" and spends them on whichever subjects they take. A package is
 * assigned to a student for a term — the year runs April to March in two — and
 * generating an invoice counts the classes actually conducted in a period
 * against it. That is why the attendance rules matter to money: a class the
 * teacher missed never counts, and a class the student missed generally does.
 *
 * A DRAFT is recomputed from those counts every time it is regenerated. Once
 * ISSUED the numbers are frozen, because a bill that changes after it was sent
 * is not a bill.
 */

const packageSchema = z.object({
  name: z.string().min(1, 'Name the package').max(150),
  amount: z.string().min(1, 'Enter the price'),
  classes_included: z.string().min(1, 'Enter how many classes it buys'),
  currency: z.string().max(8).optional(),
  billing_mode: z.string(),
  academic_year_id: z.string().optional(),
  term: z.string().optional(),
  max_subjects: z.string().optional(),
  count_missed_classes: z.boolean(),
  is_active: z.boolean(),
  notes: z.string().max(1000).optional(),
})
type PackageValues = z.infer<typeof packageSchema>

function PackageDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: TuitionPackageOut | null
}) {
  // Only tuition years can scope a package — the backend refuses a
  // school-only year with a 400 rather than letting the package never resolve.
  const years = useAcademicYears({ program: 'TUITION' }, open)
  const create = useCreatePackage()
  const update = useUpdatePackage()

  const form = useForm<PackageValues>({
    resolver: zodResolver(packageSchema),
    defaultValues: {
      name: '',
      amount: '',
      classes_included: '30',
      billing_mode: 'PER_CLASS',
      count_missed_classes: true,
      is_active: true,
    },
  })

  React.useEffect(() => {
    if (!open) return
    form.reset({
      name: editing?.name ?? '',
      amount: editing ? String(editing.amount) : '',
      classes_included: editing ? String(editing.classes_included) : '30',
      currency: editing?.currency ?? '',
      billing_mode: editing?.billing_mode ?? 'PER_CLASS',
      academic_year_id: editing?.academic_year_id ? String(editing.academic_year_id) : '',
      term: editing?.term ?? '',
      max_subjects: editing?.max_subjects != null ? String(editing.max_subjects) : '',
      count_missed_classes: editing?.count_missed_classes ?? true,
      is_active: editing?.is_active ?? true,
      notes: editing?.notes ?? '',
    })
  }, [open, editing, form])

  const mode = form.watch('billing_mode') as PackageBillingMode
  // The rate is derived, never typed — shown live so "15,000 for 30" reads
  // as "500 a class" before the admin has saved anything.
  const amount = Number(form.watch('amount'))
  const classes = Number(form.watch('classes_included'))
  const perClass = amount > 0 && classes > 0 ? amount / classes : null

  const onSubmit = async (values: PackageValues) => {
    const body = {
      name: values.name,
      amount: Number(values.amount),
      classes_included: Number(values.classes_included),
      currency: values.currency?.trim() || null,
      billing_mode: values.billing_mode as PackageBillingMode,
      // Null is an UNSCOPED package, on offer in every year and both terms —
      // not "no year".
      academic_year_id: values.academic_year_id ? Number(values.academic_year_id) : null,
      term: (values.term || null) as AcademicTerm | null,
      max_subjects: values.max_subjects ? Number(values.max_subjects) : null,
      count_missed_classes: values.count_missed_classes,
      is_active: values.is_active,
      notes: values.notes || null,
    }

    try {
      if (editing) await update.mutateAsync({ packageId: editing.id, body })
      else await create.mutateAsync(body)
      onOpenChange(false)
    } catch (error) {
      form.setError('root', {
        message: (error as { message?: string })?.message ?? 'Could not save the package.',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit package' : 'New package'}</DialogTitle>
          <DialogDescription>
            So many classes for so much, on any subjects. A student on a package spends its
            classes on whichever subjects they take — there is no rate per subject.
          </DialogDescription>
        </DialogHeader>

        <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-5">
            <FormError message={form.formState.errors.root?.message} />

            <Field id="pkg-name" label="Name" required error={form.formState.errors.name?.message}>
              <Input id="pkg-name" placeholder="Standard — 30 classes" {...form.register('name')} />
            </Field>

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-3">
              <Field
                id="pkg-amount"
                label="Price"
                required
                error={form.formState.errors.amount?.message}
              >
                <Input id="pkg-amount" type="number" step="0.01" min={0} {...form.register('amount')} />
              </Field>
              <Field
                id="pkg-classes"
                label="Classes included"
                required
                error={form.formState.errors.classes_included?.message}
              >
                <Input
                  id="pkg-classes"
                  type="number"
                  min={1}
                  step={1}
                  {...form.register('classes_included')}
                />
              </Field>
              <Field id="pkg-currency" label="Currency" hint="Blank uses the programme's.">
                <Input id="pkg-currency" placeholder="INR" maxLength={8} {...form.register('currency')} />
              </Field>
            </div>

            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {perClass != null ? (
                <>
                  Works out at{' '}
                  <strong className="text-foreground">
                    {formatMoney(perClass, form.watch('currency')?.trim() || editing?.currency || 'INR')}
                  </strong>{' '}
                  a class. That is the rate every class is priced at.
                </>
              ) : (
                'Enter a price and a class count to see the per-class rate.'
              )}
            </p>

            <Field id="pkg-mode" label="How it is billed" required hint={BILLING_MODE_HINT[mode]}>
              <Select value={mode} onValueChange={(v) => form.setValue('billing_mode', v)}>
                <SelectTrigger id="pkg-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_MODES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {BILLING_MODE_LABEL[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Scope. Blank on both means a standing offer, available in every
                year and both terms. A term-scoped package is what "Term 1
                2026-27 — 30 classes" is. */}
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field
                id="pkg-year"
                label="Session year"
                hint="Blank offers it in every year. The year must include tuition."
              >
                <Combobox
                  id="pkg-year"
                  value={form.watch('academic_year_id') || null}
                  onChange={(v) => form.setValue('academic_year_id', v)}
                  options={[
                    { value: '', label: 'Every year' },
                    ...(years.data ?? []).map((y) => ({
                      value: String(y.id),
                      label: y.name,
                      hint: y.is_current ? 'current' : undefined,
                    })),
                  ]}
                  placeholder="Every year"
                />
              </Field>
              <Field id="pkg-term" label="Term" hint="Blank offers it in both terms.">
                <Select
                  value={form.watch('term') || 'ANY'}
                  onValueChange={(v) => form.setValue('term', v === 'ANY' ? '' : v)}
                >
                  <SelectTrigger id="pkg-term">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANY">Either term</SelectItem>
                    {TERMS.map((term) => (
                      <SelectItem key={term} value={term}>
                        {TERM_LABEL[term]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field
              id="pkg-max-subjects"
              label="Most subjects at once"
              hint="Blank is no cap. Adding a subject beyond it is refused."
            >
              <Input
                id="pkg-max-subjects"
                type="number"
                min={1}
                step={1}
                placeholder="No cap"
                {...form.register('max_subjects')}
              />
            </Field>

            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <span className="text-sm">
                A missed class still counts
                <span className="block text-xs text-muted-foreground">
                  On: a class the student skipped without notice uses one of the package's
                  classes — the teacher turned up and the slot was spent. A class the teacher
                  missed never counts either way.
                </span>
              </span>
              <Switch
                checked={form.watch('count_missed_classes')}
                onCheckedChange={(v) => form.setValue('count_missed_classes', v)}
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <span className="text-sm">
                Active
                <span className="block text-xs text-muted-foreground">
                  Inactive packages cannot be assigned. Students already on one stay on it.
                </span>
              </span>
              <Switch
                checked={form.watch('is_active')}
                onCheckedChange={(v) => form.setValue('is_active', v)}
              />
            </label>

            <Field id="pkg-notes" label="Notes">
              <Textarea id="pkg-notes" rows={2} {...form.register('notes')} />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              {editing ? 'Save package' : 'Create package'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

/** Who is on a package. Students are put on one from the Student subjects screen. */
function PackageStudentsSheet({
  pkg,
  onOpenChange,
}: {
  pkg: TuitionPackageOut | null
  onOpenChange: (open: boolean) => void
}) {
  const [includeEnded, setIncludeEnded] = React.useState(false)
  const rows = usePackageStudents(pkg?.id ?? null, includeEnded)

  return (
    <Sheet open={!!pkg} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{pkg ? `Students on ${pkg.name}` : 'Students'}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <label className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={includeEnded} onCheckedChange={(v) => setIncludeEnded(v === true)} />
            Include past assignments
          </label>
          <QueryBoundary
            query={rows}
            loading={<Skeleton className="h-40" />}
            isEmpty={(data) => data.length === 0}
            empty={
              <EmptyState
                icon={<UsersRound />}
                title="Nobody is on this package"
                description="Put a student on it from Student subjects — pick the student, then Assign a package."
              />
            }
          >
            {(data) => (
              <ul className="space-y-2">
                {data.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {a.student_name ?? `Student ${a.student_id}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[a.academic_year_name, a.term_name].filter(Boolean).join(' · ') ||
                          'Any term'}
                        {a.starts_on
                          ? ` · ${formatDate(a.starts_on)}${a.ends_on ? ` – ${formatDate(a.ends_on)}` : ''}`
                          : ''}
                      </p>
                    </div>
                    <Badge tone={a.is_active ? 'success' : 'neutral'} size="sm">
                      {a.is_active ? 'Current' : 'Ended'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </QueryBoundary>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

function PackagesTab() {
  const packages = usePackages()
  const remove = useDeletePackage()
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<TuitionPackageOut | null>(null)
  const [deleting, setDeleting] = React.useState<TuitionPackageOut | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const [viewing, setViewing] = React.useState<TuitionPackageOut | null>(null)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          A package is what a student buys — so many classes for so much, on any subjects.
          Put a student on one for a term from{' '}
          <span className="font-medium text-foreground">Student subjects</span>; every
          invoice then counts their classes against it.
        </p>
        <Button
          onClick={() => {
            setEditing(null)
            setOpen(true)
          }}
        >
          <Plus />
          New package
        </Button>
      </div>

      <QueryBoundary
        query={packages}
        loading={
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
        }
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={<Package />}
            title="No packages yet"
            description="A package says what a set of classes costs — 30 classes for 15,000, say. Without one, classes are counted but nothing can be priced."
            action={
              <Button
                onClick={() => {
                  setEditing(null)
                  setOpen(true)
                }}
              >
                <Plus />
                New package
              </Button>
            }
          />
        }
      >
        {(data) => (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.map((pkg) => (
              <Card key={pkg.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">{pkg.name}</h3>
                      {!pkg.is_active && (
                        <Badge tone="neutral" size="sm">
                          Inactive
                        </Badge>
                      )}
                      {/* Scope, said out loud: "any year, either term" and
                          "Term 1 of 2026-27" are opposite statements about
                          when the offer applies, and a blank badge would make
                          them look the same. */}
                      <Badge tone={pkg.academic_year_id || pkg.term ? 'accent' : 'neutral'} size="sm">
                        {[pkg.academic_year_name ?? (pkg.academic_year_id ? 'One year' : 'Every year'),
                          pkg.term_name ?? 'either term']
                          .join(', ')}
                      </Badge>
                    </div>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {formatMoney(pkg.amount, pkg.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pkg.classes_included} classes · {formatMoney(pkg.per_class_amount, pkg.currency)}{' '}
                      a class · {BILLING_MODE_LABEL[pkg.billing_mode]}
                    </p>
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
                          setEditing(pkg)
                          setOpen(true)
                        }}
                      >
                        <Pencil />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setViewing(pkg)}>
                        <UsersRound />
                        Students on it
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        destructive
                        onSelect={() => {
                          setDeleteError(null)
                          setDeleting(pkg)
                        }}
                      >
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <dl className="mt-3 space-y-1 border-t border-border/60 pt-3 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Students on it</dt>
                    <dd>
                      <button
                        type="button"
                        className="font-medium underline-offset-2 hover:underline"
                        onClick={() => setViewing(pkg)}
                      >
                        {pkg.students_assigned}
                      </button>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Student misses a class</dt>
                    <dd>{pkg.count_missed_classes ? 'Counts' : 'Not counted'}</dd>
                  </div>
                  {pkg.max_subjects != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Most subjects at once</dt>
                      <dd className="tabular-nums">{pkg.max_subjects}</dd>
                    </div>
                  )}
                </dl>

                {pkg.notes && <p className="mt-2 text-xs text-muted-foreground">{pkg.notes}</p>}
              </Card>
            ))}
          </div>
        )}
      </QueryBoundary>

      <PackageDialog open={open} onOpenChange={setOpen} editing={editing} />
      <PackageStudentsSheet pkg={viewing} onOpenChange={(v) => !v && setViewing(null)} />

      {/* The 409 for "students are on it" is rendered inline rather than as a
          toast: it is the expected outcome of deleting something in use, and
          the message says what to do instead. */}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => {
          if (!v) {
            setDeleting(null)
            setDeleteError(null)
          }
        }}
        title={`Delete “${deleting?.name}”?`}
        destructive
        confirmLabel="Delete package"
        loading={remove.isPending}
        description="Refused while any student is on it — mark it inactive instead, or move them first. Invoices already issued keep their figures either way."
        onConfirm={async () => {
          if (!deleting) return
          setDeleteError(null)
          try {
            await remove.mutateAsync(deleting.id)
            setDeleting(null)
          } catch (error) {
            setDeleteError(
              (error as { message?: string })?.message ?? 'Could not delete the package.',
            )
          }
        }}
      >
        <FormError message={deleteError} />
      </ConfirmDialog>
    </>
  )
}

/**
 * How many classes an invoice charged for.
 *
 * Read off the invoice when it carries the figure; summed from the lines for a
 * bill raised before packages, where each line was a subject with a quantity.
 */
function invoiceClassCount(invoice: InvoiceOut): number {
  if (invoice.classes_billed != null) return invoice.classes_billed
  return invoice.line_items.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0)
}

/**
 * One line on an invoice card: the package with its class count and rate, and
 * the subjects those classes came from. An older per-subject line still
 * renders — it has no package and no subjects, and reads as it always did.
 */
function InvoiceLineSummary({ line, currency }: { line: InvoiceLineItem; currency: string }) {
  const title = line.package_name ?? String(line.description ?? line.subject ?? 'Classes')
  const classes = line.classes_billed ?? line.quantity
  const subjects = line.subjects ?? []

  return (
    <li className="text-xs">
      <div className="flex flex-wrap justify-between gap-2">
        <span className="text-muted-foreground">
          {title}
          {classes != null ? ` × ${classes} class${classes === 1 ? '' : 'es'}` : ''}
          {line.unit_amount != null
            ? ` at ${formatMoney(Number(line.unit_amount), currency)}`
            : ''}
          {line.term_name ? ` · ${line.term_name}` : ''}
        </span>
        <span className="tabular-nums">{formatMoney(Number(line.amount ?? 0), currency)}</span>
      </div>
      {(subjects.length > 0 || line.classes_included != null) && (
        <p className="mt-0.5 text-2xs text-muted-foreground">
          {subjects.map((sub) => `${sub.subject_name ?? 'Subject'} ${sub.classes_counted}`).join(' · ')}
          {line.classes_included != null
            ? `${subjects.length ? ' — ' : ''}${line.classes_used_to_date ?? 0} of ${line.classes_included} used`
            : ''}
        </p>
      )}
      {line.note && <p className="mt-0.5 text-2xs text-muted-foreground">{line.note}</p>}
    </li>
  )
}

/** The classes behind a count, one row each, with the reason any one is not billed. */
function SessionRows({ sessions }: { sessions: TuitionSessionOut[] }) {
  if (sessions.length === 0) return null
  return (
    <ul className="mt-2 space-y-1">
      {sessions.map((session) => (
        <li key={String(session.id)} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="tabular-nums text-muted-foreground">
            {formatDateTime(session.scheduled_start_at_local ?? session.scheduled_start_at)}
          </span>
          <SessionStatusBadge session={session} />
          {session.attendance_status && (
            <Badge tone="outline" size="sm">
              {session.attendance_status}
            </Badge>
          )}
          {/* Explains a class that happened but is not in the total —
              otherwise the count looks wrong. */}
          {session.is_billable === false && (
            <Badge tone="neutral" size="sm">
              Not billed
            </Badge>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * One line of the audit sheet: the package figures, then each subject with the
 * classes behind its count. An invoice from before packages had one line per
 * subject and no `subjects`; its sessions hang straight off the line.
 */
function AuditLine({ line, currency }: { line: InvoiceLineDetail; currency: string }) {
  const title = line.package_name ?? String(line.subject ?? line.description ?? 'Classes')
  const classes = line.classes_billed ?? line.quantity
  const subjects = line.subjects ?? []

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">
            {classes != null ? `${classes} class${classes === 1 ? '' : 'es'}` : ''}
            {line.unit_amount != null
              ? ` × ${formatMoney(Number(line.unit_amount), currency)}`
              : ''}
            {line.billing_mode ? ` · ${BILLING_MODE_LABEL[line.billing_mode]}` : ''}
            {line.term_name ? ` · ${line.term_name}` : ''}
          </p>
          {line.classes_included != null && (
            <p className="text-xs text-muted-foreground">
              {line.classes_used_to_date ?? 0} of {line.classes_included} classes used this term
              {line.classes_remaining != null ? ` · ${line.classes_remaining} remaining` : ''}
            </p>
          )}
          {(line.package_amount ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">
              Package charge {formatMoney(Number(line.package_amount), currency)}
              {(line.overage_classes ?? 0) > 0
                ? ` + ${line.overage_classes} over the allowance (${formatMoney(Number(line.overage_amount ?? 0), currency)})`
                : ''}
            </p>
          )}
          {line.note && <p className="mt-1 text-xs text-muted-foreground">{line.note}</p>}
        </div>
        <p className="text-sm font-semibold tabular-nums">
          {formatMoney(Number(line.amount ?? 0), currency)}
        </p>
      </div>

      {subjects.length > 0 ? (
        <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
          {subjects.map((sub) => (
            <div key={String(sub.enrollment_id)}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {sub.subject_name ?? 'Subject'}
                  {sub.teacher_name ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {' '}· {sub.teacher_name}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {sub.classes_counted} counted · {sub.sessions_attended} attended
                  {sub.sessions_missed > 0 ? ` · ${sub.sessions_missed} missed` : ''}
                  {sub.teacher_no_show > 0 ? ` · ${sub.teacher_no_show} teacher absent` : ''}
                </p>
              </div>
              <SessionRows sessions={sub.sessions} />
            </div>
          ))}
        </div>
      ) : (
        <div className="border-t border-border/60 pt-1">
          <SessionRows sessions={line.sessions} />
        </div>
      )}
    </Card>
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
            <InvoiceLineSummary key={index} line={line} currency={invoice.currency} />
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
                  <AuditLine key={index} line={line} currency={data.currency} />
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
                          {invoiceClassCount(invoice)} class
                          {invoiceClassCount(invoice) === 1 ? '' : 'es'}
                          {invoice.package_name ? ` · ${invoice.package_name}` : ''}
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
    { view: 'lines', label: 'Lines', hint: 'One row per subject inside the package line, with the class counts behind it' },
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
        description={`Counts the classes conducted between ${formatDate(from)} and ${formatDate(to)} against the student's package. A student on no package is counted but priced at zero.`}
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
        description="A student buys a package of classes and spends it on any subjects. Bills count the classes actually conducted against it."
      />

      <Tabs defaultValue="invoices">
        <TabsList className="mb-5">
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <InvoicesTab />
        </TabsContent>
        <TabsContent value="packages">
          <PackagesTab />
        </TabsContent>
      </Tabs>
    </>
  )
}

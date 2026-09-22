import { zodResolver } from '@hookform/resolvers/zod'
import { BadgeCheck, CalendarRange, Layers, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'

import type {
  AcademicTermIn,
  AcademicYearOut,
  AcademicYearStatus,
  AdmissionCategoryOut,
  Program,
} from '@/api/types'
import {
  useAcademicYears,
  useAdmissionCategories,
  useCreateAcademicYear,
  useCreateAdmissionCategory,
  useDeleteAcademicYear,
  useDeleteAdmissionCategory,
  useUpdateAcademicYear,
  useUpdateAdmissionCategory,
} from '@/queries/admissions.queries'
import { formatDate } from '@/lib/datetime'
import { countLabel } from '@/lib/format'
import {
  YEAR_STATUS_HINT,
  YEAR_STATUS_LABEL,
  YEAR_STATUS_TONE,
} from '@/lib/school'
import { TERM_LABEL } from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { Field, FormError } from '@/components/forms/field'
import { DeleteResourceDialog } from '@/components/forms/delete-resource-dialog'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * Session years and admission categories.
 *
 * Two lists that look alike and behave very differently, which is why they are
 * tabs on one page rather than two routes: an admin sets both up in the same
 * sitting, and a category's meaning depends on whether it is scoped to a year.
 *
 * The rule worth knowing before reading the forms: EXACTLY ONE year is
 * current, and the backend enforces that inside the write — setting
 * `is_current` clears it on every other year. So the "make current" toggle
 * needs no second call and no optimistic de-selection, and the list is
 * refetched rather than patched.
 */

const YEAR_STATUSES: AcademicYearStatus[] = ['UPCOMING', 'ACTIVE', 'CLOSED']

/**
 * The two boards this screen serves.
 *
 * The school's admissions and the tuition programme's are the same two
 * collections behind two routes: the tuition route lists tuition records
 * only and creates tuition records without the form saying so. What the
 * screen changes per board is the wording and where its links go — students
 * are managed on Users for the school and on People & Access for tuition.
 */
const BOARD = {
  LMS: {
    title: 'Admissions',
    description:
      'Session years and the categories students are admitted under. Both feed the fee engine, so it is worth getting them right before anybody is billed.',
    yearHint:
      'A session year runs April to March in two terms — Term 1 to October, Term 2 from November. Students are admitted into it, and fee structures and instalment plans hang off it.',
    currentHint: 'New students are admitted into it unless you say otherwise.',
    peopleTo: '/admin/users',
    peopleLabel: 'Users',
    assignHint:
      'individually under “Session year and syllabus”, or several at once by selecting them and choosing Set session year.',
    categoryExamples: 'Regular, Staff Ward, Transfer',
    categoryPlaceholder: 'Staff Ward',
    categoryEmpty:
      'Most schools want at least a Regular category. Add the others — Staff Ward, Transfer, Scholarship — as they come up.',
  },
  TUITION: {
    title: 'Tuition admissions',
    description:
      'The tuition programme’s own session years and admission categories, separate from the school’s. Making a year current rolls over the tuition calendar alone.',
    yearHint:
      'A tuition year is the batch new students are admitted into and what packages are assigned within, term by term. It has its own calendar — it need not match the school’s year.',
    currentHint: 'New tuition students are admitted into it automatically.',
    peopleTo: '/admin/tuition/access',
    peopleLabel: 'People & Access',
    assignHint: 'when they are added, and on their profile afterwards.',
    categoryExamples: 'Regular, Sibling, Scholarship',
    categoryPlaceholder: 'Sibling',
    categoryEmpty:
      'Start with a Regular category. Add Sibling or Scholarship as concessions come up — any discount set here is applied to that student’s invoices automatically.',
  },
} satisfies Record<Program, unknown>

// ==================================================================== years

const yearSchema = z
  .object({
    name: z.string().min(1, 'Enter a name, e.g. 2026-27').max(50),
    code: z.string().max(20).optional(),
    // Both optional together: blank, the backend derives 1 April – 31 March
    // from the year in the name.
    start_date: z.string(),
    end_date: z.string(),
    status: z.enum(['UPCOMING', 'ACTIVE', 'CLOSED']),
    is_current: z.boolean(),
    admissions_open: z.boolean(),
    // Off, the backend cuts the year at 1 November. On, the four dates below
    // are sent and must sit inside the year, in order.
    custom_terms: z.boolean(),
    term1_start: z.string(),
    term1_end: z.string(),
    term2_start: z.string(),
    term2_end: z.string(),
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => !(v.start_date && v.end_date) || v.end_date > v.start_date, {
    message: 'The year must end after it starts',
    path: ['end_date'],
  })
  .refine((v) => !!v.start_date === !!v.end_date, {
    message: 'Give both dates, or leave both blank',
    path: ['end_date'],
  })
  .refine(
    (v) => !v.custom_terms || (v.term1_start && v.term1_end && v.term2_start && v.term2_end),
    { message: 'Fill in all four term dates', path: ['term2_end'] },
  )
  .refine((v) => !v.custom_terms || v.term1_end < v.term2_start, {
    message: 'Term 1 must end before Term 2 starts',
    path: ['term2_start'],
  })

type YearValues = z.infer<typeof yearSchema>

function YearDialog({
  open,
  onOpenChange,
  editing,
  currentYearName,
  board,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: AcademicYearOut | null
  /** So the form can warn what making THIS year current will displace. */
  currentYearName: string | null
  board: Program
}) {
  const create = useCreateAcademicYear(board)
  const update = useUpdateAcademicYear(board)
  const form = useForm<YearValues>({
    resolver: zodResolver(yearSchema),
    defaultValues: {
      name: '',
      code: '',
      start_date: '',
      end_date: '',
      status: 'UPCOMING',
      is_current: false,
      admissions_open: true,
      custom_terms: false,
      term1_start: '',
      term1_end: '',
      term2_start: '',
      term2_end: '',
      notes: '',
    },
  })

  React.useEffect(() => {
    if (!open) return
    const term1 = editing?.terms?.find((t) => t.key === 'TERM_1')
    const term2 = editing?.terms?.find((t) => t.key === 'TERM_2')
    form.reset({
      name: editing?.name ?? '',
      code: editing?.code ?? '',
      start_date: editing?.start_date ?? '',
      end_date: editing?.end_date ?? '',
      status: editing?.status ?? 'UPCOMING',
      is_current: editing?.is_current ?? false,
      admissions_open: editing?.admissions_open ?? true,
      // Prefilled from the stored terms but OFF: sending them back unchanged
      // is harmless, sending them back after the year's dates moved is a 400.
      custom_terms: false,
      term1_start: term1?.start_date ?? '',
      term1_end: term1?.end_date ?? '',
      term2_start: term2?.start_date ?? '',
      term2_end: term2?.end_date ?? '',
      notes: editing?.notes ?? '',
    })
  }, [open, editing, form])

  const willDisplace =
    form.watch('is_current') &&
    !editing?.is_current &&
    currentYearName &&
    currentYearName !== form.watch('name')

  const onSubmit = async (values: YearValues) => {
    const terms: AcademicTermIn[] | undefined = values.custom_terms
      ? [
          { key: 'TERM_1', start_date: values.term1_start, end_date: values.term1_end },
          { key: 'TERM_2', start_date: values.term2_start, end_date: values.term2_end },
        ]
      : undefined
    const body = {
      name: values.name,
      code: values.code?.trim() || null,
      // Left out when blank, so the backend derives April–March from the name
      // on create and keeps the stored dates on edit.
      ...(values.start_date && values.end_date
        ? { start_date: values.start_date, end_date: values.end_date }
        : {}),
      ...(terms ? { terms } : {}),
      status: values.status,
      is_current: values.is_current,
      admissions_open: values.admissions_open,
      notes: values.notes?.trim() || null,
    }

    try {
      if (editing) await update.mutateAsync({ yearId: editing.id, body })
      else await create.mutateAsync(body)
      onOpenChange(false)
    } catch (error) {
      form.setError('root', {
        message: (error as { message?: string })?.message ?? 'Could not save the session year.',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add a session year'}</DialogTitle>
          <DialogDescription>{BOARD[board].yearHint}</DialogDescription>
        </DialogHeader>
        <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-5">
            <FormError message={form.formState.errors.root?.message} />

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field
                id="year_name"
                label="Name"
                required
                error={form.formState.errors.name?.message}
              >
                <Input id="year_name" placeholder="2025-26" {...form.register('name')} />
              </Field>
              <Field id="year_code" label="Short code" hint="Optional, e.g. AY2526">
                <Input id="year_code" placeholder="AY2526" {...form.register('code')} />
              </Field>
            </div>

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field
                id="year_start"
                label="Starts"
                hint={editing ? undefined : 'Blank: 1 April of the year in the name.'}
                error={form.formState.errors.start_date?.message}
              >
                <Input id="year_start" type="date" {...form.register('start_date')} />
              </Field>
              <Field
                id="year_end"
                label="Ends"
                hint={editing ? undefined : 'Blank: 31 March of the following year.'}
                error={form.formState.errors.end_date?.message}
              >
                <Input id="year_end" type="date" {...form.register('end_date')} />
              </Field>
            </div>

            {/* The two terms. Derived by default — Term 1 to 31 October, Term 2
                from 1 November — because that is the calendar, and a school
                that cuts it differently says so here rather than on every
                package and instalment. */}
            <div className="space-y-3 rounded-xl border border-border p-4">
              <label className="flex items-start justify-between gap-4">
                <span className="min-w-0">
                  <span className="text-sm font-medium">Set the term dates myself</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Off: Term 1 runs to 31 October and Term 2 from 1 November. Packages and
                    instalments follow whichever dates the year carries.
                  </span>
                </span>
                <Switch
                  checked={form.watch('custom_terms')}
                  onCheckedChange={(v) => form.setValue('custom_terms', v, { shouldDirty: true })}
                />
              </label>

              {form.watch('custom_terms') && (
                <div className="grid gap-x-4 gap-y-4 border-t border-border pt-3 sm:grid-cols-2">
                  <Field id="term1_start" label="Term 1 starts">
                    <Input id="term1_start" type="date" {...form.register('term1_start')} />
                  </Field>
                  <Field id="term1_end" label="Term 1 ends">
                    <Input id="term1_end" type="date" {...form.register('term1_end')} />
                  </Field>
                  <Field
                    id="term2_start"
                    label="Term 2 starts"
                    error={form.formState.errors.term2_start?.message}
                  >
                    <Input id="term2_start" type="date" {...form.register('term2_start')} />
                  </Field>
                  <Field
                    id="term2_end"
                    label="Term 2 ends"
                    error={form.formState.errors.term2_end?.message}
                  >
                    <Input id="term2_end" type="date" {...form.register('term2_end')} />
                  </Field>
                </div>
              )}
            </div>

            <Field
              id="year_status"
              label="Status"
              hint={YEAR_STATUS_HINT[form.watch('status')]}
            >
              <Select
                value={form.watch('status')}
                onValueChange={(v) =>
                  form.setValue('status', v as AcademicYearStatus, { shouldDirty: true })
                }
              >
                <SelectTrigger id="year_status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEAR_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {YEAR_STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="space-y-3 rounded-xl border border-border p-4">
              <label className="flex items-start justify-between gap-4">
                <span className="min-w-0">
                  <span className="text-sm font-medium">Make this the current year</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Exactly one year is current. Turning this on takes it off whichever year
                    holds it now.
                  </span>
                </span>
                <Switch
                  checked={form.watch('is_current')}
                  onCheckedChange={(v) => form.setValue('is_current', v, { shouldDirty: true })}
                />
              </label>

              {willDisplace && (
                <p className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-muted-foreground">
                  <strong>{currentYearName}</strong> will stop being the current year when you
                  save.
                </p>
              )}

              <label className="flex items-start justify-between gap-4 border-t border-border pt-3">
                <span className="min-w-0">
                  <span className="text-sm font-medium">Admissions open</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Whether new students may be admitted into this year.
                  </span>
                </span>
                <Switch
                  checked={form.watch('admissions_open')}
                  onCheckedChange={(v) =>
                    form.setValue('admissions_open', v, { shouldDirty: true })
                  }
                />
              </label>
            </div>

            <Field id="year_notes" label="Notes" hint="Internal. Never shown to students.">
              <Textarea id="year_notes" rows={2} {...form.register('notes')} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {editing ? 'Save changes' : 'Create year'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

function YearCard({
  year,
  onEdit,
  onDelete,
  onMakeCurrent,
}: {
  year: AcademicYearOut
  onEdit: () => void
  onDelete: () => void
  onMakeCurrent: () => void
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{year.name}</h3>
            {year.is_current && (
              <Badge tone="primary" size="sm">
                <Star />
                Current
              </Badge>
            )}
            <Badge tone={YEAR_STATUS_TONE[year.status]} size="sm">
              {YEAR_STATUS_LABEL[year.status]}
            </Badge>
            {!year.admissions_open && (
              <Badge tone="neutral" size="sm">
                Admissions closed
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(year.start_date)} — {formatDate(year.end_date)}
            {year.code ? ` · ${year.code}` : ''}
          </p>
          {/* The two halves the year is billed in, with today's marked. */}
          {year.terms?.length > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {year.terms.map((term) => (
                <span key={term.key} className="inline-flex items-center gap-1.5">
                  <span className="font-medium text-foreground">
                    {term.name || TERM_LABEL[term.key]}
                  </span>
                  {formatDate(term.start_date, 'd MMM')} – {formatDate(term.end_date, 'd MMM yyyy')}
                  {term.is_current && (
                    <Badge tone="primary" size="sm">
                      now
                    </Badge>
                  )}
                </span>
              ))}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {year.student_count != null ? (
              <Link className="underline" to="/admin/users">
                {countLabel(year.student_count, 'student')}
              </Link>
            ) : (
              'Student count not loaded'
            )}
            {year.category_count != null
              ? ` · ${countLabel(year.category_count, 'category', 'categories')}`
              : ''}
          </p>
          {year.notes && <p className="mt-2 text-sm text-muted-foreground">{year.notes}</p>}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!year.is_current && (
            <Button variant="outline" size="sm" onClick={onMakeCurrent}>
              <Star />
              Make current
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil />
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      </div>
    </Card>
  )
}

function YearsTab({ board }: { board: Program }) {
  const years = useAcademicYears({ board, withCounts: true })
  const update = useUpdateAcademicYear(board)
  const remove = useDeleteAcademicYear(board)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<AcademicYearOut | null>(null)
  const [deleting, setDeleting] = React.useState<AcademicYearOut | null>(null)

  const currentYear = years.data?.find((y) => y.is_current) ?? null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {currentYear ? (
            <>
              <strong className="text-foreground">{currentYear.name}</strong> is the current
              year. {BOARD[board].currentHint}
            </>
          ) : (
            'No year is marked current. Students created without one will have no session year.'
          )}
        </p>
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus />
          Add a year
        </Button>
      </div>

      {/* This page creates years; it does not hold the roll. Students are put
          into a year on their own profile, which is also where the category
          and syllabus live — so the counts below link there rather than
          growing a second, divergent way to edit the same field. */}
      <p className="text-xs text-muted-foreground">
        Students are assigned to a year on{' '}
        <Link className="font-medium underline" to={BOARD[board].peopleTo}>
          {BOARD[board].peopleLabel}
        </Link>{' '}
        — {BOARD[board].assignHint}
      </p>

      <QueryBoundary
        query={years}
        loading={
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            icon={<CalendarRange />}
            title="No session years yet"
            description="Create the year you are teaching now — fee structures, instalment plans and admissions all hang off it."
            action={
              <Button
                onClick={() => {
                  setEditing(null)
                  setDialogOpen(true)
                }}
              >
                <Plus />
                Add a year
              </Button>
            }
          />
        }
      >
        {(rows) => (
          <div className="space-y-3">
            {rows.map((year) => (
              <YearCard
                key={year.id}
                year={year}
                onEdit={() => {
                  setEditing(year)
                  setDialogOpen(true)
                }}
                onDelete={() => setDeleting(year)}
                onMakeCurrent={() =>
                  update.mutate({ yearId: year.id, body: { is_current: true } })
                }
              />
            ))}
          </div>
        )}
      </QueryBoundary>

      <YearDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        currentYearName={currentYear?.name ?? null}
        board={board}
      />

      {/* `supportsForce` is off: unlike the class and subject deletes, the
          admissions endpoints have no `?force` cascade. A year with students
          in it is refused outright and the answer is to close it instead. */}
      <DeleteResourceDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        resourceLabel="session year"
        resourceName={deleting?.name ?? ''}
        supportsForce={false}
        description="This is refused while any student has been admitted into the year. Setting its status to Closed instead keeps the record and makes it read-only."
        onDelete={async () => {
          if (deleting) await remove.mutateAsync(deleting.id)
          setDeleting(null)
        }}
      />
    </div>
  )
}

// =============================================================== categories

const categorySchema = z.object({
  name: z.string().min(1, 'Enter a name').max(100),
  code: z.string().min(1, 'Enter a code').max(30),
  description: z.string().max(1000).optional(),
  academic_year_id: z.string(),
  default_discount_percent: z.string(),
  waives_admission_charge: z.boolean(),
  is_active: z.boolean(),
})

type CategoryValues = z.infer<typeof categorySchema>

const STANDING = 'STANDING'

function CategoryDialog({
  open,
  onOpenChange,
  editing,
  years,
  board,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: AdmissionCategoryOut | null
  years: AcademicYearOut[]
  board: Program
}) {
  const create = useCreateAdmissionCategory(board)
  const update = useUpdateAdmissionCategory(board)
  const form = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      code: '',
      description: '',
      academic_year_id: STANDING,
      default_discount_percent: '',
      waives_admission_charge: false,
      is_active: true,
    },
  })

  React.useEffect(() => {
    if (!open) return
    form.reset({
      name: editing?.name ?? '',
      code: editing?.code ?? '',
      description: editing?.description ?? '',
      academic_year_id: editing?.academic_year_id ? String(editing.academic_year_id) : STANDING,
      default_discount_percent:
        editing?.default_discount_percent != null
          ? String(editing.default_discount_percent)
          : '',
      waives_admission_charge: editing?.waives_admission_charge ?? false,
      is_active: editing?.is_active ?? true,
    })
  }, [open, editing, form])

  const onSubmit = async (values: CategoryValues) => {
    const percent = values.default_discount_percent.trim()
    if (percent && (Number.isNaN(Number(percent)) || Number(percent) < 0 || Number(percent) > 100)) {
      form.setError('default_discount_percent', { message: 'Enter a percentage between 0 and 100' })
      return
    }

    const body = {
      name: values.name,
      code: values.code,
      description: values.description?.trim() || null,
      academic_year_id:
        values.academic_year_id === STANDING ? null : Number(values.academic_year_id),
      default_discount_percent: percent ? Number(percent) : null,
      waives_admission_charge: values.waives_admission_charge,
      is_active: values.is_active,
    }

    try {
      if (editing) await update.mutateAsync({ categoryId: editing.id, body })
      else await create.mutateAsync(body)
      onOpenChange(false)
    } catch (error) {
      form.setError('root', {
        message: (error as { message?: string })?.message ?? 'Could not save the category.',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? `Edit ${editing.name}` : 'Add an admission category'}
          </DialogTitle>
          <DialogDescription>
            The basis a student was admitted on — {BOARD[board].categoryExamples}. Any
            concession set here is applied by the fee engine on its own.
          </DialogDescription>
        </DialogHeader>
        <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-5">
            <FormError message={form.formState.errors.root?.message} />

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field
                id="cat_name"
                label="Name"
                required
                error={form.formState.errors.name?.message}
              >
                <Input
                  id="cat_name"
                  placeholder={BOARD[board].categoryPlaceholder}
                  {...form.register('name')}
                />
              </Field>
              <Field
                id="cat_code"
                label="Code"
                required
                error={form.formState.errors.code?.message}
              >
                <Input id="cat_code" placeholder="STAFF" {...form.register('code')} />
              </Field>
            </div>

            <Field
              id="cat_year"
              label="Applies to"
              hint="A standing category is inherited by every year. Scope it to one year only for a one-off scheme."
            >
              <Select
                value={form.watch('academic_year_id')}
                onValueChange={(v) =>
                  form.setValue('academic_year_id', v, { shouldDirty: true })
                }
              >
                <SelectTrigger id="cat_year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={STANDING}>Every year (standing)</SelectItem>
                  {years.map((year) => (
                    <SelectItem key={year.id} value={String(year.id)}>
                      {year.name} only
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              id="cat_discount"
              label="Standing concession"
              hint="Percentage off, applied automatically to students in this category. Leave blank for none."
              error={form.formState.errors.default_discount_percent?.message}
            >
              <Input
                id="cat_discount"
                type="number"
                min={0}
                max={100}
                step="0.01"
                placeholder="e.g. 50"
                {...form.register('default_discount_percent')}
              />
            </Field>

            <div className="space-y-3 rounded-xl border border-border p-4">
              <label className="flex items-start justify-between gap-4">
                <span className="min-w-0">
                  <span className="text-sm font-medium">Waives the admission charge</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Drops any fee head marked as a one-off admission charge.
                  </span>
                </span>
                <Switch
                  checked={form.watch('waives_admission_charge')}
                  onCheckedChange={(v) =>
                    form.setValue('waives_admission_charge', v, { shouldDirty: true })
                  }
                />
              </label>
              <label className="flex items-start justify-between gap-4 border-t border-border pt-3">
                <span className="min-w-0">
                  <span className="text-sm font-medium">Active</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Deactivate rather than delete once students hold it.
                  </span>
                </span>
                <Switch
                  checked={form.watch('is_active')}
                  onCheckedChange={(v) => form.setValue('is_active', v, { shouldDirty: true })}
                />
              </label>
            </div>

            <Field id="cat_description" label="Description">
              <Textarea id="cat_description" rows={2} {...form.register('description')} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {editing ? 'Save changes' : 'Create category'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

function CategoriesTab({ board }: { board: Program }) {
  const categories = useAdmissionCategories({ board, includeInactive: true, withCounts: true })
  const years = useAcademicYears({ board })
  const remove = useDeleteAdmissionCategory(board)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<AdmissionCategoryOut | null>(null)
  const [deleting, setDeleting] = React.useState<AdmissionCategoryOut | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          A category carries any standing concession, so a Staff Ward is priced correctly
          without anybody entering a discount per child.
        </p>
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus />
          Add a category
        </Button>
      </div>

      <QueryBoundary
        query={categories}
        loading={
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            icon={<Layers />}
            title="No admission categories yet"
            description={BOARD[board].categoryEmpty}
            action={
              <Button
                onClick={() => {
                  setEditing(null)
                  setDialogOpen(true)
                }}
              >
                <Plus />
                Add a category
              </Button>
            }
          />
        }
      >
        {(rows) => (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((category) => (
              <Card key={category.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{category.name}</h3>
                      <Badge tone="outline" size="sm">
                        {category.code}
                      </Badge>
                      {!category.is_active && (
                        <Badge tone="neutral" size="sm">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {category.academic_year_id
                        ? `${category.academic_year_name ?? 'One year'} only`
                        : 'Standing — every year'}
                      {category.student_count != null
                        ? ` · ${countLabel(category.student_count, 'student')}`
                        : ''}
                    </p>
                    {(category.default_discount_percent != null ||
                      category.waives_admission_charge) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {category.default_discount_percent != null && (
                          <Badge tone="success" size="sm">
                            {category.default_discount_percent}% off
                          </Badge>
                        )}
                        {category.waives_admission_charge && (
                          <Badge tone="info" size="sm">
                            No admission charge
                          </Badge>
                        )}
                      </div>
                    )}
                    {category.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{category.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(category)
                        setDialogOpen(true)
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(category)}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryBoundary>

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        years={years.data ?? []}
        board={board}
      />

      <DeleteResourceDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        resourceLabel="admission category"
        resourceName={deleting?.name ?? ''}
        supportsForce={false}
        description="This is refused while any student holds the category. Deactivating it instead keeps their record explicable."
        onDelete={async () => {
          if (deleting) await remove.mutateAsync(deleting.id)
          setDeleting(null)
        }}
      />
    </div>
  )
}

/** The admissions screen for one board; the two routes each render it with theirs. */
export function AdmissionsBoard({ board }: { board: Program }) {
  return (
    <div>
      <PageHeader title={BOARD[board].title} description={BOARD[board].description} />

      <Tabs defaultValue="years">
        <TabsList>
          <TabsTrigger value="years">
            <CalendarRange className="size-4" />
            Session years
          </TabsTrigger>
          <TabsTrigger value="categories">
            <BadgeCheck className="size-4" />
            Categories
          </TabsTrigger>
        </TabsList>

        <TabsContent value="years">
          <YearsTab board={board} />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesTab board={board} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** The school's route. */
export default function AdminAdmissionsPage() {
  return <AdmissionsBoard board="LMS" />
}

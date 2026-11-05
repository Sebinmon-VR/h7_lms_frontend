import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarRange, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import type {
  AcademicTermIn,
  AcademicYearOut,
  AcademicYearStatus,
  AdmissionCategoryOut,
  Program,
} from '@/api/types'
import { useUpdateUser, useUsers } from '@/queries/admin.queries'
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
import {
  YEAR_STATUS_HINT,
  YEAR_STATUS_LABEL,
} from '@/lib/school'
import { TERM_LABEL } from '@/lib/tuition'
import { Button } from '@/components/ui/button'
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
import { Field, FormError } from '@/components/forms/field'
import { DeleteResourceDialog } from '@/components/forms/delete-resource-dialog'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { cn } from '@/lib/cn'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Band, TabStrip, TONE_FILL, WorkspaceHeader, type Tone } from '@/components/layout/workspace'

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
    title: 'Academic Years',
    description: 'Session years, their terms, and the categories students are admitted under. Fees are billed against both',
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
      'Start with a Regular category, then add Staff Ward, Transfer or Scholarship as you need them.',
  },
  TUITION: {
    title: 'Tuition Academic Years',
    description: 'The tuition programme’s own years and admission categories, separate from the school’s',
    yearHint:
      'A tuition year is the batch new students are admitted into and what packages are assigned within, term by term. It has its own calendar — it need not match the school’s year.',
    currentHint: 'New tuition students are admitted into it automatically.',
    peopleTo: '/admin/tuition/access',
    peopleLabel: 'People & Access',
    assignHint: 'when they are added, and on their profile afterwards.',
    categoryExamples: 'Regular, Scholarship, Staff Ward',
    categoryPlaceholder: 'Scholarship',
    categoryEmpty:
      'Start with a Regular category, then add Scholarship or other concessions as you need them. Discounts apply to invoices automatically.',
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

/**
 * One part of a dialog form: a small heading over its fields, ruled off from
 * the part above. Groups read by position and rules, not by boxes.
 */
function FormGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-6 gap-y-2 border-t border-border pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  )
}

/** Shorter controls for the in-page forms, which are read and filled at a glance. */
const COMPACT_INPUT = 'h-8 px-3 py-1 text-sm'
const COMPACT_FIELD = 'space-y-1'


/** A yes/no setting as one plain row: what it does on the left, the switch on the right. */
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="text-sm text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </label>
  )
}

const STATUS_CHOICE_DOT: Record<AcademicYearStatus, string> = {
  UPCOMING: 'bg-info',
  ACTIVE: 'bg-success',
  CLOSED: 'bg-muted-foreground/50',
}

function YearForm({
  onDone,
  editing,
  currentYearName,
  board,
}: {
  /** Called on cancel, and after a successful save. */
  onDone: () => void
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
  }, [editing, form])

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
      onDone()
    } catch (error) {
      form.setError('root', {
        message: (error as { message?: string })?.message ?? 'Could not save the session year.',
      })
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <h2 className="text-base font-medium tracking-tight text-foreground">{editing ? `Edit ${editing.name}` : 'Add a session year'}</h2>
          <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">{BOARD[board].yearHint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="xs" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="xs" loading={form.formState.isSubmitting}>
            {editing ? 'Save changes' : 'Create year'}
          </Button>
        </div>
      </div>
      <div className="max-w-5xl space-y-3">
        <FormError message={form.formState.errors.root?.message} />

        <FormGroup title="Year">
          <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field id="year_name" label="Name" required error={form.formState.errors.name?.message} className={COMPACT_FIELD}>
              <Input className={COMPACT_INPUT} id="year_name" placeholder="2025-26" {...form.register('name')} />
            </Field>
            <Field id="year_code" label="Short code" className={COMPACT_FIELD}>
              <Input className={COMPACT_INPUT} id="year_code" placeholder="AY2526" {...form.register('code')} />
            </Field>
            <Field
              id="year_start"
              label="Starts"
              hint={editing ? undefined : 'Blank: 1 April'}
              error={form.formState.errors.start_date?.message}
              className={COMPACT_FIELD}
            >
              <Input className={COMPACT_INPUT} id="year_start" type="date" {...form.register('start_date')} />
            </Field>
            <Field
              id="year_end"
              label="Ends"
              hint={editing ? undefined : 'Blank: 31 March'}
              error={form.formState.errors.end_date?.message}
              className={COMPACT_FIELD}
            >
              <Input className={COMPACT_INPUT} id="year_end" type="date" {...form.register('end_date')} />
            </Field>
          </div>
        </FormGroup>

        {/* The two terms. Derived by default — Term 1 to 31 October, Term 2
            from 1 November — because that is the calendar, and a school
            that cuts it differently says so here rather than on every
            package and instalment. */}
        <FormGroup title="Terms" hint="Packages and instalments follow these">
          <ToggleRow
            label="Set the term dates myself"
            hint="Off: Term 1 runs to 31 October and Term 2 from 1 November"
            checked={form.watch('custom_terms')}
            onChange={(v) => form.setValue('custom_terms', v, { shouldDirty: true })}
          />
          {form.watch('custom_terms') ? (
            <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
              <Field id="term1_start" label="Term 1 starts" className={COMPACT_FIELD}>
                <Input className={COMPACT_INPUT} id="term1_start" type="date" {...form.register('term1_start')} />
              </Field>
              <Field id="term1_end" label="Term 1 ends" className={COMPACT_FIELD}>
                <Input className={COMPACT_INPUT} id="term1_end" type="date" {...form.register('term1_end')} />
              </Field>
              <Field id="term2_start" label="Term 2 starts" error={form.formState.errors.term2_start?.message} className={COMPACT_FIELD}>
                <Input className={COMPACT_INPUT} id="term2_start" type="date" {...form.register('term2_start')} />
              </Field>
              <Field id="term2_end" label="Term 2 ends" error={form.formState.errors.term2_end?.message} className={COMPACT_FIELD}>
                <Input className={COMPACT_INPUT} id="term2_end" type="date" {...form.register('term2_end')} />
              </Field>
            </div>
          ) : (
            editing?.terms?.length ? (
              <p className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                {editing.terms.map((term) => (
                  <span key={term.key}>
                    <span className="font-medium text-foreground">{term.name || TERM_LABEL[term.key]}</span>{' '}
                    <span className="text-muted-foreground">
                      {formatDate(term.start_date, 'd MMM')} – {formatDate(term.end_date, 'd MMM yyyy')}
                    </span>
                  </span>
                ))}
              </p>
            ) : null
          )}
        </FormGroup>

        <FormGroup title="Status">
          {/* Three states, so three choices in view rather than a dropdown. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div role="radiogroup" aria-label="Status" className="inline-flex rounded-lg bg-muted p-0.5">
            {YEAR_STATUSES.map((status) => {
              const active = form.watch('status') === status
              return (
                <button
                  key={status}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => form.setValue('status', status, { shouldDirty: true })}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs transition-colors',
                    active ? 'bg-card font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className={cn('size-2 rounded-full', STATUS_CHOICE_DOT[status])} aria-hidden />
                  {YEAR_STATUS_LABEL[status]}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">{YEAR_STATUS_HINT[form.watch('status')]}</p>
          </div>

          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <ToggleRow
              label="Make this the current year"
              hint="Takes it off whichever year holds it now"
              checked={form.watch('is_current')}
              onChange={(v) => form.setValue('is_current', v, { shouldDirty: true })}
            />
            {willDisplace && (
              <p className="text-xs text-warning sm:col-span-2 sm:row-start-2">
                <strong>{currentYearName}</strong> will stop being the current year when you save
              </p>
            )}
            <ToggleRow
              label="Admissions open"
              hint="New students may be admitted into it"
              checked={form.watch('admissions_open')}
              onChange={(v) => form.setValue('admissions_open', v, { shouldDirty: true })}
            />
          </div>
        </FormGroup>

        <FormGroup title="Notes" hint="Internal, never shown to students">
          <Textarea id="year_notes" rows={2} aria-label="Notes" className="min-h-14 py-1.5 text-sm" {...form.register('notes')} />
        </FormGroup>
      </div>
    </form>
  )
}

/** The current year first, then the rest newest first. */
function currentYearFirst(a: AcademicYearOut, b: AcademicYearOut): number {
  if (a.is_current !== b.is_current) return a.is_current ? -1 : 1
  return b.start_date.localeCompare(a.start_date)
}

const STATUS_DOT: Record<AcademicYearStatus, Tone> = {
  ACTIVE: 'success',
  UPCOMING: 'info',
  CLOSED: 'neutral',
}


/** A small icon-only action with its name on hover. */
function RowAction({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClick}
          aria-label={label}
          className={danger ? 'hover:bg-danger/10 hover:text-danger' : undefined}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Where today sits in a year: before it, inside it (with how far), or after it. */
function yearPosition(year: AcademicYearOut): { label: string; percent: number | null } {
  const start = new Date(year.start_date).getTime()
  const end = new Date(year.end_date).getTime()
  const now = Date.now()
  if (now < start) {
    const days = Math.ceil((start - now) / DAY_MS)
    return { label: `Starts in ${days} ${days === 1 ? 'day' : 'days'}`, percent: null }
  }
  if (now > end) return { label: 'Finished', percent: null }
  const percent = Math.round(((now - start) / (end - start)) * 100)
  return { label: `${percent}% through`, percent }
}

/**
 * The year's two terms as one bar, each term its length of the year, the
 * running one in indigo. A red line marks today when it falls inside.
 */
function TermTimeline({ year }: { year: AcademicYearOut }) {
  const ms = (d: string) => new Date(d).getTime()
  const start = ms(year.start_date)
  const end = ms(year.end_date) + DAY_MS
  const span = end - start
  const now = Date.now()
  const terms = year.terms ?? []
  if (!(span > 0) || terms.length === 0) return null
  const at = (t: number) => Math.min(100, Math.max(0, ((t - start) / span) * 100))

  return (
    <div>
      <div className="relative flex h-9 overflow-hidden rounded-md bg-muted">
        {terms.map((term, i) => {
          const left = at(ms(term.start_date))
          const width = at(ms(term.end_date) + DAY_MS) - left
          return (
            <div
              key={term.key}
              className={cn(
                'absolute inset-y-0 flex items-center px-3 text-xs font-medium',
                i > 0 && 'border-l-2 border-card',
                term.is_current ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
              )}
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              <span className="truncate">{term.name || TERM_LABEL[term.key]}</span>
            </div>
          )
        })}
        {now >= start && now <= end && (
          <span className="absolute inset-y-0 z-10 w-0.5 bg-danger" style={{ left: `${at(now)}%` }} aria-hidden />
        )}
      </div>
      <div className="relative mt-2 h-4 text-xs text-muted-foreground">
        {terms.map((term) => (
          <span key={term.key} className="absolute whitespace-nowrap" style={{ left: `${at(ms(term.start_date))}%` }}>
            {formatDate(term.start_date, 'd MMM')} – {formatDate(term.end_date, 'd MMM yyyy')}
          </span>
        ))}
      </div>
    </div>
  )
}

/** One fact in the selected year's row of facts. */
function YearFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 py-1 pr-6 sm:px-6 sm:first:pl-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 text-base font-medium text-foreground">{children}</div>
    </div>
  )
}

/**
 * Years on the left, the chosen one in full on the right: the usual shape for
 * a short list of records each worth reading properly. Opens on the current
 * year.
 */
function YearMasterDetail({
  rows,
  board,
  onEdit,
  onDelete,
  onMakeCurrent,
  editor,
}: {
  rows: AcademicYearOut[]
  board: Program
  onEdit: (year: AcademicYearOut) => void
  onDelete: (year: AcademicYearOut) => void
  onMakeCurrent: (year: AcademicYearOut) => void
  /** When set, the form shown in place of the year's details. */
  editor?: React.ReactNode
}) {
  const sorted = React.useMemo(() => [...rows].sort(currentYearFirst), [rows])
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const selected =
    sorted.find((y) => y.id === selectedId) ?? sorted.find((y) => y.is_current) ?? sorted[0] ?? null

  return (
    <Band className="border-b border-border">
      <div className="grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:divide-x lg:divide-border">
        {/* ------------------------------------------------ the list */}
        <ul className="-mx-4 divide-y divide-border border-b border-border sm:-mx-6 lg:mx-0 lg:-ml-8 lg:border-b-0">
          {sorted.map((year) => {
            const active = selected?.id === year.id
            return (
              <li key={year.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(year.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'relative flex w-full items-center gap-3 px-6 py-3.5 text-left transition-colors lg:pl-8',
                    active ? 'bg-primary/5' : 'hover:bg-muted/40',
                  )}
                >
                  {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
                  <span className={cn('size-2 shrink-0 rounded-full', TONE_FILL[STATUS_DOT[year.status]])} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={cn('truncate font-medium', active ? 'text-primary' : 'text-foreground')}>{year.name}</span>
                      {year.is_current && <Star className="size-3.5 shrink-0 fill-primary text-primary" strokeWidth={1.5} />}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatDate(year.start_date, 'MMM yyyy')} – {formatDate(year.end_date, 'MMM yyyy')}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{YEAR_STATUS_LABEL[year.status]}</span>
                </button>
              </li>
            )
          })}
        </ul>

        {/* ------------------------------- the year, or its form */}
        {editor ? (
          <section className="min-w-0 py-5 lg:pl-8">{editor}</section>
        ) : selected && (
          <section className="min-w-0 space-y-6 py-6 lg:pl-8" aria-label={selected.name}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-medium tracking-tight text-foreground">{selected.name}</h2>
                  {selected.is_current && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      <Star className="size-3.5 fill-primary" strokeWidth={1.5} />
                      Current year
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span className={cn('size-2 rounded-full', TONE_FILL[STATUS_DOT[selected.status]])} aria-hidden />
                    {YEAR_STATUS_LABEL[selected.status]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDate(selected.start_date, 'd MMMM yyyy')} – {formatDate(selected.end_date, 'd MMMM yyyy')}
                  {selected.code ? ` · ${selected.code}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!selected.is_current && (
                  <Button variant="outline" size="sm" onClick={() => onMakeCurrent(selected)}>
                    <Star />
                    Make current
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => onEdit(selected)}>
                  <Pencil />
                  Edit
                </Button>
                <RowAction label="Delete" onClick={() => onDelete(selected)} danger>
                  <Trash2 />
                </RowAction>
              </div>
            </div>

            <TermTimeline year={selected} />

            <div className="grid grid-cols-2 gap-y-4 border-t border-border pt-5 sm:grid-cols-4 sm:divide-x sm:divide-border">
              <YearFact label="Students">
                {selected.student_count != null ? (
                  <Link to={BOARD[board].peopleTo} className="hover:text-primary">
                    {selected.student_count}
                  </Link>
                ) : (
                  '—'
                )}
              </YearFact>
              <YearFact label="Categories">{selected.category_count ?? '—'}</YearFact>
              <YearFact label="Admissions">
                <span className={selected.admissions_open ? 'text-success' : 'text-muted-foreground'}>
                  {selected.admissions_open ? 'Open' : 'Closed'}
                </span>
              </YearFact>
              <YearFact label="Progress">{yearPosition(selected).label}</YearFact>
            </div>

            {selected.notes && (
              <p className="border-l-2 border-border pl-3 text-sm text-muted-foreground">{selected.notes}</p>
            )}
          </section>
        )}
      </div>
    </Band>
  )
}

/** Flat, on the page like the table it stands in for: no dashed box. */
function EmptyRow({ title, description, action }: { title: string; description: string; action: React.ReactNode }) {
  return (
    <div className="border-y border-border bg-card px-6 py-12 text-center">
      <p className="text-base font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      <div className="mt-4">{action}</div>
    </div>
  )
}

/** `addSignal` changes when the header's Add button is pressed. */
function YearsTab({ board, addSignal }: { board: Program; addSignal: number }) {
  const years = useAcademicYears({ board, withCounts: true })
  const update = useUpdateAcademicYear(board)
  const remove = useDeleteAcademicYear(board)

  // The year being edited in the page ({ editing: null } adds a new one).
  const [editor, setEditor] = React.useState<{ editing: AcademicYearOut | null } | null>(null)
  const [deleting, setDeleting] = React.useState<AcademicYearOut | null>(null)

  const currentYear = years.data?.find((y) => y.is_current) ?? null

  const addYear = () => setEditor({ editing: null })
  const editorNode = editor ? (
    <YearForm
      key={editor.editing?.id ?? 'new'}
      editing={editor.editing}
      currentYearName={currentYear?.name ?? null}
      board={board}
      onDone={() => setEditor(null)}
    />
  ) : null
  // Opens on a press made while this tab is showing, not on arrival with an
  // old one: the count is remembered from when the tab mounted.
  const seenSignal = React.useRef(addSignal)
  React.useEffect(() => {
    if (addSignal === seenSignal.current) return
    seenSignal.current = addSignal
    addYear()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addSignal])

  return (
    <div className="space-y-6">
      <QueryBoundary
        query={years}
        loading={<Skeleton className="h-48 w-full rounded-none" />}
        isEmpty={(rows) => rows.length === 0}
        empty={
          editorNode ? (
            <Band className="border-b border-border py-6">{editorNode}</Band>
          ) : (
            <EmptyRow
              title="No session years yet"
              description="Create the year you are teaching now. Fee structures, instalment plans and admissions all hang off it"
              action={
                <Button size="sm" onClick={addYear}>
                  <Plus />
                  Add a year
                </Button>
              }
            />
          )
        }
      >
        {(rows) => (
          <>
            <YearMasterDetail
              rows={rows}
              board={board}
              editor={editorNode}
              onEdit={(year) => setEditor({ editing: year })}
              onDelete={(year) => setDeleting(year)}
              onMakeCurrent={(year) => update.mutate({ yearId: year.id, body: { is_current: true } })}
            />
          </>
        )}
      </QueryBoundary>

      {/* This page creates years; it does not hold the roll. Students are put
          into a year on their own profile, which is also where the category
          and syllabus live. */}
      <p className="text-xs text-muted-foreground">
        {currentYear ? `${BOARD[board].currentHint} ` : 'No year is marked current, so new students get no session year. '}
        Students are placed in a year on{' '}
        <Link className="font-medium text-primary hover:underline" to={BOARD[board].peopleTo}>
          {BOARD[board].peopleLabel}
        </Link>
        , {BOARD[board].assignHint}
      </p>

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

function CategoryForm({
  onDone,
  editing,
  board,
}: {
  /** Called on cancel, and after a successful save. */
  onDone: () => void
  editing: AdmissionCategoryOut | null
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
    form.reset({
      name: editing?.name ?? '',
      code: editing?.code ?? '',
      description: editing?.description ?? '',
      academic_year_id: STANDING,
      default_discount_percent:
        editing?.default_discount_percent != null
          ? String(editing.default_discount_percent)
          : '',
      waives_admission_charge: editing?.waives_admission_charge ?? false,
      is_active: editing?.is_active ?? true,
    })
  }, [editing, form])

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
      default_discount_percent: percent ? Number(percent) : null,
      waives_admission_charge: values.waives_admission_charge,
      is_active: values.is_active,
    }

    try {
      // Always for every year: saving an older year-scoped category also clears its year.
      if (editing) await update.mutateAsync({ categoryId: editing.id, body: { ...body, academic_year_id: null } })
      else await create.mutateAsync({ ...body, academic_year_id: null })
      onDone()
    } catch (error) {
      form.setError('root', {
        message: (error as { message?: string })?.message ?? 'Could not save the category.',
      })
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <h2 className="text-base font-medium tracking-tight text-foreground">{editing ? `Edit ${editing.name}` : 'New admission category'}</h2>
          <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            The basis on which a student is admitted, such as {BOARD[board].categoryExamples}. Fee concessions set here are applied
            automatically
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="xs" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="xs" loading={form.formState.isSubmitting}>
            {editing ? 'Save changes' : 'Create category'}
          </Button>
        </div>
      </div>
      <div className="max-w-5xl space-y-3">
        <FormError message={form.formState.errors.root?.message} />

        <FormGroup title="Details" hint="Applies in every academic year">
          <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2">
            <Field id="cat_name" label="Category name" required error={form.formState.errors.name?.message} className={COMPACT_FIELD}>
              <Input className={COMPACT_INPUT} id="cat_name" placeholder={BOARD[board].categoryPlaceholder} {...form.register('name')} />
            </Field>
            <Field id="cat_code" label="Code" required error={form.formState.errors.code?.message} className={COMPACT_FIELD}>
              <Input className={COMPACT_INPUT} id="cat_code" placeholder="STAFF" {...form.register('code')} />
            </Field>
          </div>
        </FormGroup>

        <FormGroup title="Fee concession" hint="Applied automatically to every student in it">
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
          <Field
            id="cat_discount"
            label="Discount (%)"
            error={form.formState.errors.default_discount_percent?.message}
            className={COMPACT_FIELD}
          >
            <Input
              id="cat_discount"
              type="number"
              min={0}
              max={100}
              step="0.01"
              placeholder="e.g. 50"
              className={COMPACT_INPUT}
              {...form.register('default_discount_percent')}
            />
          </Field>
            <ToggleRow
              label="Waive admission fee"
              hint="The one-time admission fee is not charged"
              checked={form.watch('waives_admission_charge')}
              onChange={(v) => form.setValue('waives_admission_charge', v, { shouldDirty: true })}
            />
            <ToggleRow
              label="Active"
              hint="Inactive categories cannot be chosen for new admissions"
              checked={form.watch('is_active')}
              onChange={(v) => form.setValue('is_active', v, { shouldDirty: true })}
            />
          </div>
        </FormGroup>

        <FormGroup title="Description">
          <Textarea id="cat_description" rows={2} aria-label="Description" className="min-h-14 py-1.5 text-sm" {...form.register('description')} />
        </FormGroup>
      </div>
    </form>
  )
}

/** What a category takes off, or null when it gives no concession. */
function categoryConcession(c: AdmissionCategoryOut): string[] {
  const parts: string[] = []
  if (c.default_discount_percent != null) parts.push(`${c.default_discount_percent}% discount`)
  if (c.waives_admission_charge) parts.push('Admission fee waived')
  return parts
}

/**
 * Categories on the left, the chosen one in full on the right, like the
 * years. The right side also holds the delete step: a category nobody holds
 * goes straight away, and one that students hold first moves them to another
 * category, since the server refuses to delete a category in use.
 */
function CategoryMasterDetail({
  rows,
  board,
  yearId,
  yearName,
  editor,
  onEdit,
  onDeleteEmpty,
}: {
  rows: AdmissionCategoryOut[]
  board: Program
  /** The year being viewed; null shows every year. */
  yearId: number | null
  yearName: string | null
  editor?: React.ReactNode
  onEdit: (c: AdmissionCategoryOut) => void
  /** A category with no students: confirm and delete. */
  onDeleteEmpty: (c: AdmissionCategoryOut) => void
}) {
  const users = useUsers()
  const updateUser = useUpdateUser()
  const remove = useDeleteAdmissionCategory(board)
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [moving, setMoving] = React.useState(false)
  const [targetId, setTargetId] = React.useState('')
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null)
  const [moveError, setMoveError] = React.useState<string | null>(null)

  const selected = rows.find((c) => c.id === selectedId) ?? rows[0] ?? null
  const members = (users.data ?? []).filter((u) => selected && u.admission_category_id === selected.id)
  const memberCount = users.data ? members.length : (selected?.student_count ?? 0)
  const inYear = (categoryId: number) =>
    (users.data ?? []).filter(
      (u) => u.admission_category_id === categoryId && (yearId === null || u.academic_year_id === yearId),
    )
  const yearMembers = selected ? inYear(selected.id) : []
  const targets = rows.filter((c) => c.id !== selected?.id && c.is_active)

  React.useEffect(() => {
    setMoving(false)
    setTargetId('')
    setProgress(null)
    setMoveError(null)
  }, [selected?.id])

  const startDelete = () => {
    if (!selected) return
    if (memberCount === 0) onDeleteEmpty(selected)
    else setMoving(true)
  }

  const moveAndDelete = async () => {
    if (!selected || !targetId) return
    setMoveError(null)
    setProgress({ done: 0, total: members.length })
    try {
      // No bulk endpoint: one update per student, in order, so a failure
      // stops with the rest untouched and the count says how far it got.
      for (let i = 0; i < members.length; i++) {
        await updateUser.mutateAsync({ userId: members[i].id, body: { admission_category_id: Number(targetId) } })
        setProgress({ done: i + 1, total: members.length })
      }
      await remove.mutateAsync(selected.id)
      toast.success(`${selected.name} deleted`, {
        description: `${members.length} ${members.length === 1 ? 'student' : 'students'} moved to ${rows.find((c) => String(c.id) === targetId)?.name ?? 'the new category'}`,
      })
      setSelectedId(null)
    } catch (error) {
      setMoveError((error as { message?: string })?.message ?? 'Could not finish. Nothing more was changed.')
    } finally {
      setProgress(null)
    }
  }

  return (
    <Band className="border-y border-border">
      <div className="grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:divide-x lg:divide-border">
        {/* ------------------------------------------------ the list */}
        <ul className="-mx-4 divide-y divide-border border-b border-border sm:-mx-6 lg:mx-0 lg:-ml-8 lg:border-b-0">
          {rows.map((c) => {
            const active = selected?.id === c.id
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'relative flex w-full items-center gap-3 px-6 py-3 text-left transition-colors lg:pl-8',
                    active ? 'bg-primary/5' : 'hover:bg-muted/40',
                  )}
                >
                  {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
                  <span className={cn('size-2 shrink-0 rounded-full', c.is_active ? TONE_FILL.success : TONE_FILL.neutral)} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate font-medium', active ? 'text-primary' : c.is_active ? 'text-foreground' : 'text-muted-foreground')}>
                      {c.name}
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">{c.code}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {users.data ? inYear(c.id).length : (c.student_count ?? 0)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {/* --------------------------- the category, or its form */}
        {editor ? (
          <section className="min-w-0 py-5 lg:pl-8">{editor}</section>
        ) : selected && (
          <section className="min-w-0 space-y-6 py-6 lg:pl-8" aria-label={selected.name}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-medium tracking-tight text-foreground">{selected.name}</h2>
                  <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">{selected.code}</span>
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span className={cn('size-2 rounded-full', selected.is_active ? TONE_FILL.success : TONE_FILL.neutral)} aria-hidden />
                    {selected.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {selected.description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{selected.description}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => onEdit(selected)}>
                  <Pencil />
                  Edit
                </Button>
                <Button variant="outline" size="sm" onClick={startDelete} className="text-danger hover:bg-danger/10 hover:text-danger">
                  <Trash2 />
                  Delete
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-y-4 border-y border-border py-4 sm:grid-cols-4 sm:divide-x sm:divide-border">
              <YearFact label="All students">{memberCount}</YearFact>
              <YearFact label="Fee concession">
                {categoryConcession(selected).length ? (
                  <span className="flex flex-col">
                    {categoryConcession(selected).map((part) => (
                      <span key={part} className={part.endsWith('discount') ? 'text-success' : 'text-info'}>
                        {part}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </YearFact>
              <YearFact label={yearName ? `Students in ${yearName}` : 'Students'}>
                {users.data ? yearMembers.length : memberCount}
              </YearFact>
              <YearFact label="New admissions">
                <span className={selected.is_active ? 'text-success' : 'text-muted-foreground'}>
                  {selected.is_active ? 'Allowed' : 'Not allowed'}
                </span>
              </YearFact>
            </div>

            {/* ------------------------------ delete, moving students first */}
            {moving && (
              <div className="space-y-3 border-l-2 border-danger pl-4">
                <div>
                  <h3 className="text-sm font-medium text-foreground">Delete {selected.name}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {memberCount} {memberCount === 1 ? 'student is' : 'students are'} in this category. Move them to another
                    category, then it is deleted.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={targetId} onValueChange={setTargetId} disabled={!!progress}>
                    <SelectTrigger className="h-8 w-64 text-sm" aria-label="Move students to">
                      <SelectValue placeholder="Move students to…" />
                    </SelectTrigger>
                    <SelectContent>
                      {targets.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="danger" disabled={!targetId || !!progress} loading={!!progress} onClick={() => void moveAndDelete()}>
                    Move and delete
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!!progress} onClick={() => setMoving(false)}>
                    Cancel
                  </Button>
                </div>
                {targets.length === 0 && (
                  <p className="text-xs text-warning">There is no other active category to move them to. Add one first</p>
                )}
                {progress && (
                  <p className="text-xs tabular-nums text-muted-foreground">
                    Moving {progress.done} of {progress.total}…
                  </p>
                )}
                {moveError && <p className="text-xs text-danger">{moveError}</p>}
              </div>
            )}

            {/* ------------------------------------- who is in it */}
            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">
                {yearName ? `Students in ${yearName}` : 'Students in this category'}
              </h3>
              {users.isPending ? (
                <Skeleton className="h-16 rounded-md" />
              ) : yearMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {yearName ? `No students in this category for ${yearName}` : 'No students yet'}
                </p>
              ) : (
                <>
                  <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
                    {yearMembers.slice(0, 12).map((u) => (
                      <li key={u.id} className="border-b border-border py-2">
                        <Link to={`/admin/users/${u.id}`} className="block truncate text-sm text-foreground hover:text-primary">
                          {u.full_name}
                        </Link>
                        {u.admission_number && <span className="font-mono text-xs text-muted-foreground">{u.admission_number}</span>}
                      </li>
                    ))}
                  </ul>
                  {yearMembers.length > 12 && (
                    <p className="mt-2 text-xs text-muted-foreground">and {yearMembers.length - 12} more</p>
                  )}
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </Band>
  )
}

function CategoriesTab({ board, addSignal }: { board: Program; addSignal: number }) {
  const categories = useAdmissionCategories({ board, includeInactive: true, withCounts: true })
  const years = useAcademicYears({ board })
  const remove = useDeleteAdmissionCategory(board)

  // The category being edited in the page ({ editing: null } adds a new one).
  const [editor, setEditor] = React.useState<{ editing: AdmissionCategoryOut | null } | null>(null)
  const [deleting, setDeleting] = React.useState<AdmissionCategoryOut | null>(null)

  // Which year's categories are in view. Starts on the current year; the
  // choice is kept only while the page is open.
  const ALL_YEARS = 'ALL'
  const currentYear = years.data?.find((y) => y.is_current) ?? null
  const [yearChoice, setYearChoice] = React.useState<string>('')
  const yearValue = yearChoice || (currentYear ? String(currentYear.id) : ALL_YEARS)
  const yearId = yearValue === ALL_YEARS ? null : Number(yearValue)
  const yearName = yearId === null ? null : (years.data?.find((y) => y.id === yearId)?.name ?? null)

  const addCategory = () => setEditor({ editing: null })
  const editorNode = editor ? (
    <CategoryForm
      key={editor.editing?.id ?? 'new'}
      editing={editor.editing}
      board={board}
      onDone={() => setEditor(null)}
    />
  ) : null
  const seenSignal = React.useRef(addSignal)
  React.useEffect(() => {
    if (addSignal === seenSignal.current) return
    seenSignal.current = addSignal
    addCategory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addSignal])

  const tiedToYear = (c: AdmissionCategoryOut) => !!yearName && c.name.includes(yearName)
  const byYearThenName = (a: AdmissionCategoryOut, b: AdmissionCategoryOut) => {
    const ta = tiedToYear(a)
    const tb = tiedToYear(b)
    if (ta !== tb) return ta ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true })
  }

  const shownCount = (categories.data ?? []).length

  return (
    <div className="space-y-6">
      {/* The year in view, in its own strip under the tabs. */}
      <Band className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-3">
        <span className="text-sm text-muted-foreground">Academic year</span>
        <Select value={yearValue} onValueChange={setYearChoice}>
          <SelectTrigger className="h-8 w-56 text-sm" aria-label="Academic year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[...(years.data ?? [])].sort(currentYearFirst).map((y) => (
              <SelectItem key={y.id} value={String(y.id)}>
                {y.name}
                {y.is_current ? ' (current)' : ''}
              </SelectItem>
            ))}
            <SelectItem value={ALL_YEARS}>All academic years</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {shownCount} {shownCount === 1 ? 'category' : 'categories'} · student counts for{' '}
          {yearName ?? 'all academic years'}
        </span>
      </Band>

      <QueryBoundary
        query={categories}
        loading={<Skeleton className="h-48 w-full rounded-none" />}
        isEmpty={(rows) => rows.length === 0}
        empty={
          editorNode ? (
            <Band className="border-b border-border py-6">{editorNode}</Band>
          ) : (
            <EmptyRow
              title="No admission categories yet"
              description={BOARD[board].categoryEmpty}
              action={
                <Button size="sm" onClick={addCategory}>
                  <Plus />
                  Add category
                </Button>
              }
            />
          )
        }
      >
        {(rows) => (
          <CategoryMasterDetail
            rows={[...rows].sort(byYearThenName)}
            board={board}
            yearId={yearId}
            yearName={yearName}
            editor={editorNode}
            onEdit={(category) => setEditor({ editing: category })}
            onDeleteEmpty={(category) => setDeleting(category)}
          />
        )}
      </QueryBoundary>

      <p className="text-xs text-muted-foreground">
        A category&apos;s fee concession is applied automatically to every student admitted under it, in every academic year.
        The year a student joined is kept on the student. To delete a category that students are in, move them first
      </p>

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

/** The academic years screen for one board; the two routes each render it with theirs. */
export function AdmissionsBoard({ board }: { board: Program }) {
  const [tab, setTab] = React.useState<'years' | 'categories'>('years')
  // Bumped by the header's Add button; the open tab opens its own dialog.
  const [addSignal, setAddSignal] = React.useState(0)
  // Same parameters as the tabs use, so the counts come from the same cache.
  const years = useAcademicYears({ board, withCounts: true })
  const categories = useAdmissionCategories({ board, includeInactive: true, withCounts: true })

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title={BOARD[board].title}
        description={BOARD[board].description}
        icon={CalendarRange}
        actions={
          <Button size="sm" onClick={() => setAddSignal((n) => n + 1)}>
            <Plus />
            {tab === 'years' ? 'Add academic year' : 'Add category'}
          </Button>
        }
        tabs={
          <TabStrip
            label="Academic years"
            idPrefix="years-tab"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'years', label: 'Session years', count: years.data?.length },
              { key: 'categories', label: 'Admission categories', count: categories.data?.length },
            ]}
          />
        }
      />

      <div role="tabpanel" id="years-tab-panel" className="-mt-6">
        {tab === 'years' ? (
          <YearsTab key="years" board={board} addSignal={addSignal} />
        ) : (
          <CategoriesTab key="categories" board={board} addSignal={addSignal} />
        )}
      </div>
    </div>
  )
}

/** The school's route. */
export default function AdminAdmissionsPage() {
  return <AdmissionsBoard board="LMS" />
}

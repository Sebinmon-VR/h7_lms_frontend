import type { ColumnDef } from '@tanstack/react-table'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Eye,
  Hourglass,
  Inbox,
  KeyRound,
  Mail,
  MessageSquareText,
  MoreHorizontal,
  Phone,
  RefreshCw,
  RotateCcw,
  Trash2,
  UserRoundPlus,
  XCircle,
} from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'

import type {
  AdmissionRequestAdmitResult,
  AdmissionRequestOut,
  AdmissionRequestStatus,
  Program,
} from '@/api/types'
import { useClasses } from '@/queries/admin.queries'
import { useAcademicYears, useAdmissionCategories } from '@/queries/admissions.queries'
import {
  useAddAdmissionRequestNote,
  useAdmissionRequests,
  useAdmitAdmissionRequest,
  useDeleteAdmissionRequest,
  useSetAdmissionRequestStatus,
} from '@/queries/admission-requests.queries'
import { formatDate, formatDateTime, formatRelative, parseApiDate } from '@/lib/datetime'
import { countLabel } from '@/lib/format'
import {
  OPEN_REQUEST_STATUSES,
  RELATION_LABEL,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_TONE,
} from '@/lib/school'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DataTable } from '@/components/data/data-table'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field, FormError } from '@/components/forms/field'
import { EmptyState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'

/**
 * The office's inbox for the website's admission form.
 *
 * A request is not a student. Nothing on this screen creates one except the
 * Admit dialog, and that reuses the same account, enrollment and family code
 * the Users screen does — so an admitted family lands in exactly the state a
 * hand-created one would, with a parent login that can already see fees.
 *
 * The status chips filter one cached list rather than refetching: the queue
 * is small, and moving a row between chips should be instant.
 */

type Filter = 'OPEN' | AdmissionRequestStatus | 'ALL'

const NONE = '__NONE__'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function RequestStatusBadge({
  status,
  size = 'sm',
}: {
  status: AdmissionRequestStatus
  size?: 'sm' | 'md'
}) {
  return (
    <Badge tone={REQUEST_STATUS_TONE[status]} size={size}>
      {REQUEST_STATUS_LABEL[status]}
    </Badge>
  )
}

function ageOn(dob: string | null | undefined, on = new Date()): number | null {
  const born = parseApiDate(dob)
  if (!born) return null
  let age = on.getFullYear() - born.getFullYear()
  const months = on.getMonth() - born.getMonth()
  if (months < 0 || (months === 0 && on.getDate() < born.getDate())) age -= 1
  return age
}

function primaryParent(request: AdmissionRequestOut) {
  return request.parents.find((p) => p.is_primary) ?? request.parents[0] ?? null
}

/** Which actions make sense in each state. ADMITTED is final. */
const CAN = {
  review: (s: AdmissionRequestStatus) => s === 'NEW' || s === 'WAITLISTED',
  admit: (s: AdmissionRequestStatus) => s !== 'ADMITTED',
  waitlist: (s: AdmissionRequestStatus) => s === 'NEW' || s === 'UNDER_REVIEW',
  reject: (s: AdmissionRequestStatus) => OPEN_REQUEST_STATUSES.includes(s),
  reopen: (s: AdmissionRequestStatus) => s === 'REJECTED',
}

// =================================================================== admit

const admitSchema = z.object({
  class_id: z.string(),
  academic_year_id: z.string(),
  admission_category_id: z.string(),
  admission_number: z.string().max(50),
  roll_number: z.string().max(50),
  student_email: z
    .string()
    .max(200)
    .refine((v) => v === '' || EMAIL.test(v), 'Enter a valid email address'),
  create_parent_account: z.boolean(),
  parent_email: z
    .string()
    .max(200)
    .refine((v) => v === '' || EMAIL.test(v), 'Enter a valid email address'),
  send_credentials: z.boolean(),
  notify_applicant: z.boolean(),
  note: z.string().max(2000),
})

type AdmitValues = z.infer<typeof admitSchema>

/**
 * Admitting, with its result shown in the same dialog.
 *
 * The result has to be read, not toasted: it may carry a password that will
 * never be shown again, and a warning that a parent login was NOT created.
 */
function AdmitDialog({
  request,
  onClose,
  board,
}: {
  request: AdmissionRequestOut | null
  onClose: () => void
  board: Program
}) {
  const open = !!request
  const classes = useClasses(open)
  const years = useAcademicYears({ program: board }, open)
  const admit = useAdmitAdmissionRequest()
  const [result, setResult] = React.useState<AdmissionRequestAdmitResult | null>(null)

  const form = useForm<AdmitValues>({
    resolver: zodResolver(admitSchema),
    defaultValues: {
      class_id: NONE,
      academic_year_id: NONE,
      admission_category_id: NONE,
      admission_number: '',
      roll_number: '',
      student_email: '',
      create_parent_account: true,
      parent_email: '',
      send_credentials: true,
      notify_applicant: true,
      note: '',
    },
  })

  const yearId = form.watch('academic_year_id')
  const categories = useAdmissionCategories(
    { program: board, academicYearId: yearId !== NONE ? Number(yearId) : undefined },
    open,
  )

  React.useEffect(() => {
    if (!request) return
    setResult(null)
    const primary = primaryParent(request)
    form.reset({
      class_id: request.class_id ? String(request.class_id) : NONE,
      academic_year_id: request.academic_year_id ? String(request.academic_year_id) : NONE,
      admission_category_id: NONE,
      admission_number: '',
      roll_number: '',
      student_email: '',
      create_parent_account: true,
      parent_email: primary?.email ?? '',
      send_credentials: true,
      notify_applicant: true,
      note: '',
    })
  }, [request, form])

  // The applied-for year may be missing from the list (closed since), so the
  // picker falls back to the current year rather than showing a blank.
  React.useEffect(() => {
    if (!open || !years.data || form.getValues('academic_year_id') !== NONE) return
    const current = years.data.find((y) => y.is_current)
    if (current) form.setValue('academic_year_id', String(current.id))
  }, [open, years.data, form])

  const createParent = form.watch('create_parent_account')
  const primary = request ? primaryParent(request) : null

  const onSubmit = async (values: AdmitValues) => {
    if (!request) return
    try {
      const outcome = await admit.mutateAsync({
        requestId: request.id,
        body: {
          class_id: values.class_id !== NONE ? Number(values.class_id) : null,
          academic_year_id: values.academic_year_id !== NONE ? Number(values.academic_year_id) : null,
          admission_category_id:
            values.admission_category_id !== NONE ? Number(values.admission_category_id) : null,
          admission_number: values.admission_number.trim() || null,
          roll_number: values.roll_number.trim() || null,
          student_email: values.student_email.trim() || null,
          create_parent_account: values.create_parent_account,
          parent_email: values.parent_email.trim() || null,
          send_credentials: values.send_credentials,
          notify_applicant: values.notify_applicant,
          note: values.note.trim() || null,
        },
      })
      setResult(outcome)
    } catch (error) {
      form.setError('root', {
        message: (error as { message?: string })?.message ?? 'Could not admit the student.',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-success" />
                {result.student.full_name} admitted
              </DialogTitle>
              <DialogDescription>{result.detail}</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <dl className="grid gap-3 rounded-xl border border-border p-4 text-sm sm:grid-cols-2">
                <Detail label="Student login" value={result.student.email} />
                <Detail label="Admission number" value={result.student.admission_number} />
                <Detail label="Class" value={result.request.admitted_class_name} />
                <Detail label="Session" value={result.request.admitted_year_name} />
                <Detail
                  label="Parent login"
                  value={
                    result.parent
                      ? `${result.parent.email}${result.parent_created ? '' : ' (existing)'}`
                      : 'Not created'
                  }
                />
                <Detail
                  label="Family notified"
                  value={result.applicant_notified ? 'Email sent' : 'No email sent'}
                />
              </dl>

              {result.credentials.length > 0 && (
                <div className="space-y-2 rounded-xl border border-warning/30 bg-warning/8 p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="size-4" />
                    Login details — shown once, never stored
                  </p>
                  {result.credentials.map((c) => (
                    <div key={c.user_id} className="rounded-lg bg-card px-3 py-2 text-sm">
                      <p className="font-medium">
                        {c.full_name}{' '}
                        <span className="text-xs text-muted-foreground">({c.role.toLowerCase()})</span>
                      </p>
                      <p className="font-mono text-xs">
                        {c.email} · {c.password}
                      </p>
                      <p className="text-xs text-muted-foreground">{c.detail}</p>
                    </div>
                  ))}
                </div>
              )}

              {result.warnings.length > 0 && (
                <div className="space-y-1 rounded-xl border border-danger/30 bg-danger/8 p-4 text-sm">
                  <p className="font-medium text-danger">Needs attention</p>
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                    {result.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </DialogBody>
            <DialogFooter>
              <Button asChild variant="outline">
                <Link to={`/admin/users?q=${encodeURIComponent(result.student.email)}`}>
                  Open student
                </Link>
              </Button>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Admit {request?.student_full_name}</DialogTitle>
              <DialogDescription>
                Creates the student account, enrols them in the class and closes the request.
                Everything below is prefilled from the application.
              </DialogDescription>
            </DialogHeader>
            <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <DialogBody className="space-y-5">
                <FormError message={form.formState.errors.root?.message} />

                <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                  <Field
                    id="admit_class"
                    label="Class"
                    required
                    hint={request?.class_name ? `Applied for ${request.class_name}.` : undefined}
                  >
                    <Select
                      value={form.watch('class_id')}
                      onValueChange={(v) => form.setValue('class_id', v, { shouldDirty: true })}
                    >
                      <SelectTrigger id="admit_class">
                        <SelectValue placeholder="Choose a class" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Not enrolled yet</SelectItem>
                        {(classes.data ?? []).map((room) => (
                          <SelectItem key={room.id} value={String(room.id)}>
                            {room.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field id="admit_year" label="Session year">
                    <Select
                      value={form.watch('academic_year_id')}
                      onValueChange={(v) =>
                        form.setValue('academic_year_id', v, { shouldDirty: true })
                      }
                    >
                      <SelectTrigger id="admit_year">
                        <SelectValue placeholder="Current year" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Current year</SelectItem>
                        {(years.data ?? []).map((year) => (
                          <SelectItem key={year.id} value={String(year.id)}>
                            {year.name}
                            {year.is_current ? ' (current)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field
                    id="admit_category"
                    label="Admission category"
                    hint="Carries any standing concession into the fee engine."
                  >
                    <Select
                      value={form.watch('admission_category_id')}
                      onValueChange={(v) =>
                        form.setValue('admission_category_id', v, { shouldDirty: true })
                      }
                    >
                      <SelectTrigger id="admit_category">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {(categories.data ?? []).map((category) => (
                          <SelectItem key={category.id} value={String(category.id)}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field
                    id="admit_number"
                    label="Admission number"
                    hint="Blank: issued by the school's identifier setting."
                  >
                    <Input id="admit_number" {...form.register('admission_number')} />
                  </Field>

                  <Field id="admit_roll" label="Roll number">
                    <Input id="admit_roll" {...form.register('roll_number')} />
                  </Field>

                  <Field
                    id="admit_email"
                    label="Student login email"
                    hint="Blank: derived from the name."
                    error={form.formState.errors.student_email?.message}
                  >
                    <Input
                      id="admit_email"
                      type="email"
                      placeholder="firstname.lastname@…"
                      {...form.register('student_email')}
                    />
                  </Field>
                </div>

                <div className="space-y-3 rounded-xl border border-border p-4">
                  <label className="flex items-start justify-between gap-4">
                    <span className="min-w-0">
                      <span className="text-sm font-medium">Create a parent login</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        For {primary?.full_name ?? 'the primary contact'}, linked to the student
                        with access to fees. An existing parent with this email is linked instead.
                      </span>
                    </span>
                    <Switch
                      checked={createParent}
                      onCheckedChange={(v) =>
                        form.setValue('create_parent_account', v, { shouldDirty: true })
                      }
                    />
                  </label>
                  {createParent && (
                    <Field
                      id="admit_parent_email"
                      label="Parent email"
                      error={form.formState.errors.parent_email?.message}
                    >
                      <Input id="admit_parent_email" type="email" {...form.register('parent_email')} />
                    </Field>
                  )}

                  <label className="flex items-start justify-between gap-4 border-t border-border pt-3">
                    <span className="min-w-0">
                      <span className="text-sm font-medium">Email login details</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Issues passwords and sends them to {primary?.email ?? 'the family'}. They
                        are also shown here once.
                      </span>
                    </span>
                    <Switch
                      checked={form.watch('send_credentials')}
                      onCheckedChange={(v) =>
                        form.setValue('send_credentials', v, { shouldDirty: true })
                      }
                    />
                  </label>

                  <label className="flex items-start justify-between gap-4 border-t border-border pt-3">
                    <span className="min-w-0">
                      <span className="text-sm font-medium">Tell the family</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        An admission-confirmed email, with the note below included.
                      </span>
                    </span>
                    <Switch
                      checked={form.watch('notify_applicant')}
                      onCheckedChange={(v) =>
                        form.setValue('notify_applicant', v, { shouldDirty: true })
                      }
                    />
                  </label>
                </div>

                <Field id="admit_note" label="Note to the family" hint="Optional. Sent verbatim.">
                  <Textarea
                    id="admit_note"
                    rows={2}
                    placeholder="Please bring the transfer certificate and two photographs on…"
                    {...form.register('note')}
                  />
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" variant="success" loading={form.formState.isSubmitting}>
                  <BadgeCheck />
                  Admit student
                </Button>
              </DialogFooter>
            </DialogForm>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ================================================================ decisions

/** Waitlist or decline, with an optional message to the family. */
function DecisionDialog({
  request,
  decision,
  onClose,
}: {
  request: AdmissionRequestOut | null
  decision: 'WAITLISTED' | 'REJECTED' | null
  onClose: () => void
}) {
  const setStatus = useSetAdmissionRequestStatus()
  const [note, setNote] = React.useState('')
  const [notify, setNotify] = React.useState(true)
  const open = !!request && !!decision

  React.useEffect(() => {
    if (open) {
      setNote('')
      setNotify(true)
    }
  }, [open])

  const copy =
    decision === 'REJECTED'
      ? {
          title: `Decline ${request?.student_full_name}`,
          description:
            'The request is kept and can be reopened later. Say why if the family should know.',
          label: 'Decline',
          placeholder: 'We have no seat in Class 5 this year…',
        }
      : {
          title: `Waitlist ${request?.student_full_name}`,
          description: 'Kept for when a seat opens. Tell the family what to expect.',
          label: 'Add to waiting list',
          placeholder: 'We expect a seat to open in June…',
        }

  const confirm = async () => {
    if (!request || !decision) return
    try {
      await setStatus.mutateAsync({
        requestId: request.id,
        body: { status: decision, note: note.trim() || null, notify_applicant: notify },
      })
      onClose()
    } catch {
      /* the mutation cache already toasted */
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field id="decision_note" label="Message to the family" hint="Optional. Sent verbatim.">
            <Textarea
              id="decision_note"
              rows={3}
              value={note}
              placeholder={copy.placeholder}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
            <span className="text-sm font-medium">
              Email {request?.contact_name ?? 'the family'}
            </span>
            <Switch checked={notify} onCheckedChange={setNotify} />
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={setStatus.isPending}>
            Cancel
          </Button>
          <Button
            variant={decision === 'REJECTED' ? 'danger' : 'solid'}
            loading={setStatus.isPending}
            onClick={confirm}
          >
            {copy.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =================================================================== detail

function Detail({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{value == null || value === '' ? '—' : value}</dd>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  )
}

interface Actions {
  onReview: (r: AdmissionRequestOut) => void
  onAdmit: (r: AdmissionRequestOut) => void
  onWaitlist: (r: AdmissionRequestOut) => void
  onReject: (r: AdmissionRequestOut) => void
  onReopen: (r: AdmissionRequestOut) => void
  onDelete: (r: AdmissionRequestOut) => void
}

function RequestDetailSheet({
  request,
  onClose,
  actions,
}: {
  request: AdmissionRequestOut | null
  onClose: () => void
  actions: Actions
}) {
  const addNote = useAddAdmissionRequestNote()
  const [note, setNote] = React.useState('')

  React.useEffect(() => {
    setNote('')
  }, [request?.id])

  const age = ageOn(request?.date_of_birth)
  const address = request
    ? [
        request.address_line1,
        request.address_line2,
        request.city,
        request.state,
        request.postal_code,
        request.country,
      ]
        .filter(Boolean)
        .join(', ')
    : ''

  const submitNote = async () => {
    if (!request || !note.trim()) return
    await addNote.mutateAsync({ requestId: request.id, body: note.trim() })
    setNote('')
  }

  return (
    <Sheet open={!!request} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold">Admission request</SheetTitle>
        </SheetHeader>

        <SheetBody className="space-y-6">
          {request && (
            <>
              <div className="flex items-center gap-4">
                <Avatar name={request.student_full_name} size="xl" />
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{request.student_full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {request.reference}
                    {age != null ? ` · ${countLabel(age, 'year')} old` : ''}
                    {request.gender ? ` · ${request.gender.toLowerCase()}` : ''}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <RequestStatusBadge status={request.status} />
                    {request.class_name && (
                      <Badge tone="outline" size="sm">
                        {request.class_name}
                      </Badge>
                    )}
                    {request.academic_year_name && (
                      <Badge tone="neutral" size="sm">
                        {request.academic_year_name}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {request.status === 'ADMITTED' && (
                <div className="rounded-xl border border-success/30 bg-success/8 p-4 text-sm">
                  <p className="font-medium">
                    Admitted {formatDate(request.reviewed_at)}
                    {request.reviewed_by_name ? ` by ${request.reviewed_by_name}` : ''}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {request.admitted_student_email}
                    {request.admission_number ? ` · ${request.admission_number}` : ''}
                    {request.admitted_class_name ? ` · ${request.admitted_class_name}` : ''}
                  </p>
                  {request.admitted_student_email && (
                    <Link
                      className="mt-2 inline-block text-xs font-medium underline"
                      to={`/admin/users?q=${encodeURIComponent(request.admitted_student_email)}`}
                    >
                      Open the student record
                    </Link>
                  )}
                </div>
              )}

              {(request.status === 'REJECTED' || request.status === 'WAITLISTED') &&
                request.decision_note && (
                  <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
                    <p className="text-xs font-medium text-muted-foreground">
                      {REQUEST_STATUS_LABEL[request.status]}
                      {request.reviewed_by_name ? ` by ${request.reviewed_by_name}` : ''} ·{' '}
                      {formatDate(request.reviewed_at)}
                    </p>
                    <p className="mt-1">{request.decision_note}</p>
                  </div>
                )}

              <DetailSection title="Student">
                <Detail label="Date of birth" value={formatDate(request.date_of_birth)} />
                <Detail label="Blood group" value={request.blood_group} />
                <Detail label="Nationality" value={request.nationality} />
                <Detail label="Previous school" value={request.previous_school} />
                <Detail label="Class completed" value={request.previous_class} />
                <Detail label="Syllabus" value={request.syllabus} />
                <Detail label="Medium" value={request.medium} />
              </DetailSection>

              <Separator />

              <section>
                <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Parents and guardians
                </h4>
                <div className="space-y-2">
                  {request.parents.map((parent, index) => (
                    <div
                      key={`${parent.full_name}-${index}`}
                      className="rounded-xl border border-border p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{parent.full_name}</span>
                        <Badge tone="outline" size="sm">
                          {RELATION_LABEL[parent.relation] ?? parent.relation}
                        </Badge>
                        {parent.is_primary && (
                          <Badge tone="primary" size="sm">
                            Primary contact
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {parent.phone && (
                          <a className="inline-flex items-center gap-1 hover:text-foreground" href={`tel:${parent.phone}`}>
                            <Phone className="size-3" />
                            {parent.phone}
                          </a>
                        )}
                        {parent.email && (
                          <a className="inline-flex items-center gap-1 hover:text-foreground" href={`mailto:${parent.email}`}>
                            <Mail className="size-3" />
                            {parent.email}
                          </a>
                        )}
                        {parent.occupation && <span>{parent.occupation}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <Separator />

              <DetailSection title="Address and other details">
                <div className="sm:col-span-2">
                  <Detail label="Address" value={address} />
                </div>
                <Detail label="Sibling here" value={request.sibling_name} />
                <Detail label="Transport" value={request.transport_required ? 'Required' : 'Not needed'} />
                <Detail label="How they heard of us" value={request.how_heard} />
                <Detail label="Submitted" value={formatDateTime(request.submitted_at)} />
                <div className="sm:col-span-2">
                  <Detail label="Medical or support needs" value={request.medical_notes} />
                </div>
                <div className="sm:col-span-2">
                  <Detail label="Message from the family" value={request.message} />
                </div>
              </DetailSection>

              <Separator />

              <section className="space-y-3">
                <h4 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Office notes
                </h4>
                {request.internal_notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {request.internal_notes.map((n, index) => (
                      <li key={`${n.at}-${index}`} className="rounded-xl bg-muted/40 p-3 text-sm">
                        <p>{n.body}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {n.author_name ?? 'Someone'} · {formatRelative(n.at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-start gap-2">
                  <Textarea
                    rows={2}
                    value={note}
                    placeholder="Called the father; documents to follow…"
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<MessageSquareText />}
                    disabled={!note.trim()}
                    loading={addNote.isPending}
                    onClick={submitNote}
                  >
                    Add
                  </Button>
                </div>
              </section>

              <Separator />

              <section>
                <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  History
                </h4>
                <ol className="space-y-2 text-sm">
                  {[...request.history].reverse().map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className="flex items-start gap-3">
                      <RequestStatusBadge status={entry.status as AdmissionRequestStatus} />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(entry.at)}
                          {entry.by_name ? ` · ${entry.by_name}` : ''}
                        </p>
                        {entry.note && <p className="mt-0.5">{entry.note}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </SheetBody>

        {request && (
          <SheetFooter className="flex-wrap gap-2">
            {CAN.admit(request.status) && (
              <Button variant="success" icon={<BadgeCheck />} onClick={() => actions.onAdmit(request)}>
                Admit
              </Button>
            )}
            {CAN.review(request.status) && (
              <Button variant="outline" icon={<Eye />} onClick={() => actions.onReview(request)}>
                Under review
              </Button>
            )}
            {CAN.waitlist(request.status) && (
              <Button variant="outline" icon={<Hourglass />} onClick={() => actions.onWaitlist(request)}>
                Waitlist
              </Button>
            )}
            {CAN.reject(request.status) && (
              <Button variant="outline" icon={<XCircle />} onClick={() => actions.onReject(request)}>
                Decline
              </Button>
            )}
            {CAN.reopen(request.status) && (
              <Button variant="outline" icon={<RotateCcw />} onClick={() => actions.onReopen(request)}>
                Reopen
              </Button>
            )}
            <Button variant="ghost" icon={<Trash2 />} onClick={() => actions.onDelete(request)}>
              Delete
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ==================================================================== page

const FILTER_LABEL: Record<Filter, string> = {
  OPEN: 'Needs a decision',
  NEW: 'New',
  UNDER_REVIEW: 'Under review',
  WAITLISTED: 'Waitlisted',
  ADMITTED: 'Admitted',
  REJECTED: 'Declined',
  ALL: 'All',
}

const EMPTY_COPY: Record<Filter, { title: string; description: string }> = {
  OPEN: {
    title: 'Nothing waiting on you',
    description: 'Every request has been decided. New applications from the website land here.',
  },
  NEW: { title: 'No new requests', description: 'Applications nobody has opened yet appear here.' },
  UNDER_REVIEW: { title: 'Nothing under review', description: 'Mark a request under review to keep track of who is looking at it.' },
  WAITLISTED: { title: 'The waiting list is empty', description: 'Waitlisted families appear here until a seat opens.' },
  ADMITTED: { title: 'No admissions from the website yet', description: 'Requests you admit stay here with the student they became.' },
  REJECTED: { title: 'Nothing declined', description: 'Declined requests are kept here and can be reopened.' },
  ALL: {
    title: 'No admission requests yet',
    description: 'Applications sent from the admission form on the school website will appear here.',
  },
}

/** The queue for one board; the school route renders it with LMS. */
export function AdmissionRequestsBoard({ board }: { board: Program }) {
  const requests = useAdmissionRequests(board)
  const setStatus = useSetAdmissionRequestStatus()
  const remove = useDeleteAdmissionRequest()

  const [filter, setFilter] = React.useState<Filter>('OPEN')
  const [viewingId, setViewingId] = React.useState<number | null>(null)
  const [admitting, setAdmitting] = React.useState<AdmissionRequestOut | null>(null)
  const [deciding, setDeciding] = React.useState<{
    request: AdmissionRequestOut
    decision: 'WAITLISTED' | 'REJECTED'
  } | null>(null)
  const [deleting, setDeleting] = React.useState<AdmissionRequestOut | null>(null)

  const rows = React.useMemo(() => requests.data ?? [], [requests.data])
  // Resolved from the list rather than held, so the sheet reflects a status
  // change or a new note the moment the list refetches.
  const viewing = React.useMemo(
    () => rows.find((r) => r.id === viewingId) ?? null,
    [rows, viewingId],
  )

  const counts = React.useMemo(() => {
    const by = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, 0])) as Record<
      AdmissionRequestStatus,
      number
    >
    for (const row of rows) by[row.status] = (by[row.status] ?? 0) + 1
    return {
      ...by,
      OPEN: OPEN_REQUEST_STATUSES.reduce((n, s) => n + by[s], 0),
      ALL: rows.length,
    } as Record<Filter, number>
  }, [rows])

  const filtered = React.useMemo(() => {
    if (filter === 'ALL') return rows
    if (filter === 'OPEN') return rows.filter((r) => OPEN_REQUEST_STATUSES.includes(r.status))
    return rows.filter((r) => r.status === filter)
  }, [rows, filter])

  const actions: Actions = React.useMemo(
    () => ({
      onReview: (r) => setStatus.mutate({ requestId: r.id, body: { status: 'UNDER_REVIEW' } }),
      onReopen: (r) => setStatus.mutate({ requestId: r.id, body: { status: 'NEW' } }),
      onAdmit: (r) => setAdmitting(r),
      onWaitlist: (r) => setDeciding({ request: r, decision: 'WAITLISTED' }),
      onReject: (r) => setDeciding({ request: r, decision: 'REJECTED' }),
      onDelete: (r) => setDeleting(r),
    }),
    [setStatus],
  )

  const columns = React.useMemo<ColumnDef<AdmissionRequestOut, unknown>[]>(
    () => [
      {
        id: 'student',
        header: 'Applicant',
        accessorFn: (row) => row.student_full_name,
        cell: ({ row }) => {
          const age = ageOn(row.original.date_of_birth)
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar name={row.original.student_full_name} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.original.student_full_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.original.reference}
                  {age != null ? ` · ${age} yrs` : ''}
                  {row.original.previous_school ? ` · from ${row.original.previous_school}` : ''}
                </p>
              </div>
            </div>
          )
        },
      },
      {
        id: 'class',
        header: 'Applied for',
        accessorFn: (row) => row.class_name ?? '',
        cell: ({ row }) => (
          <div className="text-sm">
            <p>{row.original.class_name ?? '—'}</p>
            {row.original.academic_year_name && (
              <p className="text-xs text-muted-foreground">{row.original.academic_year_name}</p>
            )}
          </div>
        ),
      },
      {
        id: 'contact',
        header: 'Contact',
        accessorFn: (row) => row.contact_name ?? '',
        cell: ({ row }) => {
          const parent = primaryParent(row.original)
          return (
            <div className="min-w-0 text-sm">
              <p className="truncate">
                {row.original.contact_name}
                {parent && (
                  <span className="text-xs text-muted-foreground">
                    {' '}
                    · {RELATION_LABEL[parent.relation] ?? parent.relation}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {row.original.contact_phone}
                {row.original.contact_email ? ` · ${row.original.contact_email}` : ''}
              </p>
            </div>
          )
        },
      },
      {
        id: 'submitted',
        header: 'Submitted',
        accessorFn: (row) => row.submitted_at ?? '',
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm text-muted-foreground">
                {formatRelative(row.original.submitted_at)}
              </span>
            </TooltipTrigger>
            <TooltipContent>{formatDateTime(row.original.submitted_at)}</TooltipContent>
          </Tooltip>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) => row.status,
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <RequestStatusBadge status={row.original.status} />
            {row.original.internal_notes.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge tone="neutral" size="sm">
                    <MessageSquareText />
                    {row.original.internal_notes.length}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{countLabel(row.original.internal_notes.length, 'office note')}</TooltipContent>
              </Tooltip>
            )}
          </div>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const request = row.original
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${request.student_full_name}`}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setViewingId(request.id)}>
                    <Eye />
                    View details
                  </DropdownMenuItem>
                  {CAN.admit(request.status) && (
                    <DropdownMenuItem onSelect={() => actions.onAdmit(request)}>
                      <BadgeCheck />
                      Admit
                    </DropdownMenuItem>
                  )}
                  {CAN.review(request.status) && (
                    <DropdownMenuItem onSelect={() => actions.onReview(request)}>
                      <CalendarClock />
                      Mark under review
                    </DropdownMenuItem>
                  )}
                  {CAN.waitlist(request.status) && (
                    <DropdownMenuItem onSelect={() => actions.onWaitlist(request)}>
                      <Hourglass />
                      Waitlist
                    </DropdownMenuItem>
                  )}
                  {CAN.reject(request.status) && (
                    <DropdownMenuItem onSelect={() => actions.onReject(request)}>
                      <XCircle />
                      Decline
                    </DropdownMenuItem>
                  )}
                  {CAN.reopen(request.status) && (
                    <DropdownMenuItem onSelect={() => actions.onReopen(request)}>
                      <RotateCcw />
                      Reopen
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => actions.onDelete(request)}>
                    <Trash2 />
                    Delete request
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ],
    [actions],
  )

  const filterOptions = (['OPEN', 'NEW', 'UNDER_REVIEW', 'WAITLISTED', 'ADMITTED', 'REJECTED', 'ALL'] as Filter[]).map(
    (value) => ({
      value,
      label: (
        <>
          {FILTER_LABEL[value]}
          <span className="ml-1 text-xs text-muted-foreground">{counts[value]}</span>
        </>
      ),
    }),
  )

  return (
    <>
      <PageHeader
        title="Admission Requests"
        description="Applications sent from the admission form on the school website. Review them, admit the student in one step, or decline with a note to the family."
        actions={
          <Button
            variant="outline"
            icon={<RefreshCw />}
            loading={requests.isFetching && !requests.isPending}
            onClick={() => requests.refetch()}
          >
            Refresh
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">
            <Inbox />
            {countLabel(counts.NEW, 'new request')}
          </Badge>
          <Badge tone="warning">{countLabel(counts.WAITLISTED, 'waitlisted')}</Badge>
          <Badge tone="success">{countLabel(counts.ADMITTED, 'admitted')}</Badge>
          <Badge tone="neutral">{counts.ALL} total</Badge>
        </div>
      </PageHeader>

      <div className="mb-4 overflow-x-auto pb-1">
        <Segmented
          layoutId="admission-request-filter"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={filterOptions}
          aria-label="Filter by status"
        />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={requests.isPending}
        error={requests.error}
        onRetry={() => requests.refetch()}
        getRowId={(row) => String(row.id)}
        onRowClick={(row) => setViewingId(row.id)}
        initialSorting={[{ id: 'submitted', desc: true }]}
        searchPlaceholder="Search student, reference, parent, phone or email…"
        searchValues={(row) => [
          row.student_full_name,
          row.reference,
          row.contact_name,
          row.contact_phone,
          row.contact_email,
          row.class_name,
          row.previous_school,
          ...row.parents.flatMap((p) => [p.full_name, p.phone, p.email]),
        ]}
        searchParamKey="q"
        emptyState={
          <EmptyState
            icon={<UserRoundPlus />}
            title={EMPTY_COPY[filter].title}
            description={EMPTY_COPY[filter].description}
            action={
              filter !== 'ALL' && counts.ALL > 0 ? (
                <Button variant="outline" onClick={() => setFilter('ALL')}>
                  Show all requests
                </Button>
              ) : undefined
            }
          />
        }
        csv={{
          filename: 'admission-requests',
          columns: [
            { header: 'Reference', value: (r) => r.reference },
            { header: 'Student', value: (r) => r.student_full_name },
            { header: 'Date of birth', value: (r) => r.date_of_birth ?? '' },
            { header: 'Class applied', value: (r) => r.class_name ?? '' },
            { header: 'Session', value: (r) => r.academic_year_name ?? '' },
            { header: 'Contact', value: (r) => r.contact_name ?? '' },
            { header: 'Phone', value: (r) => r.contact_phone ?? '' },
            { header: 'Email', value: (r) => r.contact_email ?? '' },
            { header: 'Status', value: (r) => REQUEST_STATUS_LABEL[r.status] },
            { header: 'Submitted', value: (r) => r.submitted_at ?? '' },
          ],
        }}
      />

      <RequestDetailSheet request={viewing} onClose={() => setViewingId(null)} actions={actions} />

      <AdmitDialog request={admitting} onClose={() => setAdmitting(null)} board={board} />

      <DecisionDialog
        request={deciding?.request ?? null}
        decision={deciding?.decision ?? null}
        onClose={() => setDeciding(null)}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete the request from ${deleting?.student_full_name ?? 'this family'}?`}
        description={
          deleting?.status === 'ADMITTED'
            ? 'The student account created from it stays. Only the application record and its notes are removed.'
            : 'The application and its notes are removed for good. Declining keeps a record instead.'
        }
        confirmLabel="Delete request"
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await remove.mutateAsync(deleting.id)
            if (viewingId === deleting.id) setViewingId(null)
            setDeleting(null)
          } catch {
            /* toasted by the mutation cache */
          }
        }}
      />
    </>
  )
}

/** The school's route. */
export default function AdminAdmissionRequestsPage() {
  return <AdmissionRequestsBoard board="LMS" />
}

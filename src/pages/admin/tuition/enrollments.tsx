import { zodResolver } from '@hookform/resolvers/zod'
import type { ColumnDef } from '@tanstack/react-table'
import { GraduationCap, MoreHorizontal, PauseCircle, Pencil, PlayCircle, Plus, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import type { TuitionEnrollmentOut } from '@/api/types'
import { ApiError } from '@/api/errors'
import { useSubjects } from '@/queries/admin.queries'
import {
  useCreateTuitionEnrollment,
  useDeleteTuitionEnrollment,
  useTuitionEnrollments,
  useTuitionUsers,
  useUpdateTuitionEnrollment,
} from '@/queries/tuition.queries'
import {
  CLASS_LENGTH_HINT,
  ENROLLMENT_STATUS_LABEL,
  MAX_CLASS_MINUTES,
  MIN_CLASS_MINUTES,
  classLengthError,
  mapFieldErrors,
} from '@/lib/tuition'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { DatePicker } from '@/components/ui/date-picker'
import { Input, Textarea } from '@/components/ui/input'
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
import { DataTable } from '@/components/data/data-table'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field, FormError } from '@/components/forms/field'
import { EmptyState } from '@/components/feedback/states'
import { EnrollmentStatusBadge } from '@/components/domain/tuition'
import { UserCell } from '@/components/domain/user-cell'
import { PageHeader } from '@/components/layout/page-header'

/**
 * Who teaches which student, for which subject.
 *
 * The arrangement is the spine of the whole product: slots, classes, homework,
 * library items and invoice lines all hang off one of these, and every other
 * tuition endpoint takes an `enrollment_id` rather than a student and a
 * teacher. Nothing else can be scheduled until one exists.
 */

const schema = z.object({
  student_id: z.string().min(1, 'Choose a student'),
  subject_id: z.string().min(1, 'Choose a subject'),
  teacher_id: z.string().min(1, 'Choose a teacher'),
  grade_level: z.string().max(50).optional(),
  goals: z.string().max(2000).optional(),
  syllabus: z.string().max(5000).optional(),
  // Checked here rather than left to the server: the backend's 422 for this
  // reads "Input should be greater than or equal to 10", which never names the
  // field it is about.
  default_duration_minutes: z
    .string()
    .optional()
    .refine((v) => classLengthError(v) === null, (v) => ({ message: classLengthError(v) ?? '' })),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  notes: z.string().max(2000).optional(),
})
type FormValues = z.infer<typeof schema>

function EnrollmentDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: TuitionEnrollmentOut | null
}) {
  const students = useTuitionUsers('STUDENT', false, open)
  const teachers = useTuitionUsers('TEACHER', false, open)
  const subjects = useSubjects(open)
  const create = useCreateTuitionEnrollment()
  const update = useUpdateTuitionEnrollment()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { student_id: '', subject_id: '', teacher_id: '' },
  })

  React.useEffect(() => {
    if (!open) return
    form.reset({
      student_id: editing ? String(editing.student_id) : '',
      subject_id: editing ? String(editing.subject_id) : '',
      teacher_id: editing ? String(editing.teacher_id) : '',
      grade_level: editing?.grade_level ?? '',
      goals: editing?.goals ?? '',
      syllabus: editing?.syllabus ?? '',
      default_duration_minutes: editing?.default_duration_minutes
        ? String(editing.default_duration_minutes)
        : '',
      start_date: editing?.start_date ?? null,
      end_date: editing?.end_date ?? null,
      notes: editing?.notes ?? '',
    })
  }, [open, editing, form])

  const onSubmit = async (values: FormValues) => {
    const duration = values.default_duration_minutes
      ? Number(values.default_duration_minutes)
      : null

    try {
      if (editing) {
        // The student and subject are the arrangement's identity and the
        // backend will not move them; only the teacher can be re-pointed.
        await update.mutateAsync({
          enrollmentId: editing.id,
          body: {
            teacher_id: Number(values.teacher_id),
            grade_level: values.grade_level || null,
            goals: values.goals || null,
            syllabus: values.syllabus || null,
            default_duration_minutes: duration,
            start_date: values.start_date || null,
            end_date: values.end_date || null,
            notes: values.notes || null,
          },
        })
      } else {
        await create.mutateAsync({
          student_id: Number(values.student_id),
          subject_id: Number(values.subject_id),
          teacher_id: Number(values.teacher_id),
          grade_level: values.grade_level || null,
          goals: values.goals || null,
          syllabus: values.syllabus || null,
          default_duration_minutes: duration,
          start_date: values.start_date || null,
          end_date: values.end_date || null,
          notes: values.notes || null,
        })
      }
      onOpenChange(false)
    } catch (error) {
      // A 409 here is the one-subject-one-teacher rule, and saying so beats
      // showing the raw conflict message on a form the admin has to fix.
      if (error instanceof ApiError && error.isConflict) {
        form.setError('subject_id', {
          message:
            'This student already has an active teacher for this subject. End that arrangement first, or change its teacher.',
        })
        return
      }
      /**
       * A 422 names the field it rejected, so put the message there rather
       * than in a banner at the top of a form ten fields long — the reader
       * otherwise has to guess which input the server meant.
       */
      if (error instanceof ApiError && error.isValidation) {
        const entries = mapFieldErrors(error.fieldErrors)
        let placed = false
        for (const [field, message] of entries) {
          if (field in form.getValues()) {
            form.setError(field as keyof FormValues, { message })
            placed = true
          }
        }
        if (placed) return
      }

      form.setError('root', {
        message: (error as { message?: string })?.message ?? 'Could not save the arrangement.',
      })
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit arrangement' : 'New arrangement'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Changing the teacher re-points the weekly class times and every class still to come. Classes already taught keep the teacher who taught them.'
              : 'One student, one subject, one teacher. Weekly class times are added afterwards, on the schedule screen.'}
          </DialogDescription>
        </DialogHeader>

        <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-5">
            <FormError message={form.formState.errors.root?.message} />

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field
                id="student"
                label="Student"
                required
                error={form.formState.errors.student_id?.message}
                hint={editing ? 'Cannot be changed on an existing arrangement.' : undefined}
              >
                <Combobox
                  id="student"
                  disabled={!!editing}
                  value={form.watch('student_id') || null}
                  onChange={(v) => form.setValue('student_id', v, { shouldValidate: true })}
                  options={(students.data ?? []).map((u) => ({
                    value: String(u.id),
                    label: u.full_name,
                    hint: u.admission_number ?? u.email,
                  }))}
                  placeholder="Choose a student…"
                  emptyMessage="No students have tuition access yet."
                />
              </Field>

              <Field
                id="subject"
                label="Subject"
                required
                error={form.formState.errors.subject_id?.message}
                hint={editing ? 'Cannot be changed on an existing arrangement.' : undefined}
              >
                <Combobox
                  id="subject"
                  disabled={!!editing}
                  value={form.watch('subject_id') || null}
                  onChange={(v) => form.setValue('subject_id', v, { shouldValidate: true })}
                  options={(subjects.data ?? []).map((s) => ({
                    value: String(s.id),
                    label: s.name,
                    hint: s.code,
                  }))}
                  placeholder="Choose a subject…"
                />
              </Field>
            </div>

            <Field
              id="teacher"
              label="Teacher"
              required
              error={form.formState.errors.teacher_id?.message}
              hint="Only teachers with tuition access appear here."
            >
              <Combobox
                id="teacher"
                value={form.watch('teacher_id') || null}
                onChange={(v) => form.setValue('teacher_id', v, { shouldValidate: true })}
                options={(teachers.data ?? []).map((u) => ({
                  value: String(u.id),
                  label: u.full_name,
                  hint: u.employee_id ?? u.email,
                }))}
                placeholder="Choose a teacher…"
                emptyMessage="No teachers have tuition access yet."
              />
            </Field>

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field id="grade" label="Level" hint="e.g. Grade 10, A-Level">
                <Input id="grade" {...form.register('grade_level')} />
              </Field>
              <Field
                id="duration"
                label="Class length"
                hint={CLASS_LENGTH_HINT}
                error={form.formState.errors.default_duration_minutes?.message}
              >
                <Input
                  id="duration"
                  type="number"
                  min={MIN_CLASS_MINUTES}
                  max={MAX_CLASS_MINUTES}
                  placeholder="60"
                  {...form.register('default_duration_minutes')}
                />
              </Field>
            </div>

            <Field id="goals" label="Goal" hint="Why they are having these classes.">
              <Input id="goals" placeholder="Board exam in March" {...form.register('goals')} />
            </Field>

            <Field id="syllabus" label="Syllabus" hint="What is being taught.">
              <Textarea id="syllabus" rows={3} {...form.register('syllabus')} />
            </Field>

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field id="start" label="Starts">
                <DatePicker
                  id="start"
                  value={form.watch('start_date') ?? null}
                  onChange={(v) => form.setValue('start_date', v)}
                />
              </Field>
              <Field id="end" label="Ends" hint="Leave blank for open-ended.">
                <DatePicker
                  id="end"
                  value={form.watch('end_date') ?? null}
                  onChange={(v) => form.setValue('end_date', v)}
                />
              </Field>
            </div>

            <Field id="notes" label="Notes" hint="Internal. Never shown to the student.">
              <Textarea id="notes" rows={2} {...form.register('notes')} />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {editing ? 'Save changes' : 'Create arrangement'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminTuitionEnrollmentsPage() {
  const [includeInactive, setIncludeInactive] = React.useState(false)
  const enrollments = useTuitionEnrollments(includeInactive)
  const update = useUpdateTuitionEnrollment()
  const remove = useDeleteTuitionEnrollment()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<TuitionEnrollmentOut | null>(null)
  const [deleting, setDeleting] = React.useState<TuitionEnrollmentOut | null>(null)

  // Options come from the rows themselves: a subject with no arrangements is
  // not worth offering as a filter that would match nothing.
  const facets = React.useMemo(() => {
    const rows = enrollments.data ?? []
    const subjects = Array.from(
      new Set(rows.map((r) => r.subject?.name).filter((n): n is string => !!n)),
    ).sort()
    const statuses = Array.from(new Set(rows.map((r) => ENROLLMENT_STATUS_LABEL[r.status])))
    return [
      {
        columnId: 'subject',
        label: 'Subject',
        options: subjects.map((name) => ({ value: name, label: name })),
      },
      {
        columnId: 'status',
        label: 'Status',
        options: statuses.map((label) => ({ value: label, label })),
      },
    ]
  }, [enrollments.data])

  const columns = React.useMemo<ColumnDef<TuitionEnrollmentOut, unknown>[]>(
    () => [
      {
        id: 'student',
        header: 'Student',
        accessorFn: (row) => row.student?.full_name ?? '',
        cell: ({ row }) => (
          <UserCell
            name={row.original.student?.full_name ?? `Student ${row.original.student_id}`}
            email={row.original.student?.admission_number ?? row.original.student?.email}
            inactive={row.original.student?.is_active === false}
          />
        ),
      },
      {
        id: 'subject',
        header: 'Subject',
        accessorFn: (row) => row.subject?.name ?? '',
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.original.subject?.name ?? '—'}</p>
            {row.original.grade_level && (
              <p className="truncate text-xs text-muted-foreground">{row.original.grade_level}</p>
            )}
          </div>
        ),
      },
      {
        id: 'teacher',
        header: 'Teacher',
        accessorFn: (row) => row.teacher?.full_name ?? '',
        cell: ({ row }) => (
          <UserCell
            name={row.original.teacher?.full_name ?? `Teacher ${row.original.teacher_id}`}
            email={row.original.teacher?.employee_id ?? row.original.teacher?.email}
            inactive={row.original.teacher?.is_active === false}
          />
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) => ENROLLMENT_STATUS_LABEL[row.status],
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => <EnrollmentStatusBadge enrollment={row.original} />,
      },
      {
        id: 'length',
        header: 'Class length',
        accessorFn: (row) => row.default_duration_minutes ?? 0,
        cell: ({ row }) =>
          row.original.default_duration_minutes ? (
            <span className="text-sm tabular-nums">{row.original.default_duration_minutes} min</span>
          ) : (
            <span className="text-sm text-muted-foreground">Programme default</span>
          ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const enrollment = row.original
          const paused = enrollment.status === 'PAUSED'
          return (
            <div onClick={(event) => event.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      setEditing(enrollment)
                      setDialogOpen(true)
                    }}
                  >
                    <Pencil />
                    Edit
                  </DropdownMenuItem>
                  {/* Pausing keeps the history, the materials and the teacher,
                      and simply stops the slots generating classes. */}
                  <DropdownMenuItem
                    onSelect={() =>
                      update.mutate({
                        enrollmentId: enrollment.id,
                        body: { status: paused ? 'ACTIVE' : 'PAUSED' },
                      })
                    }
                  >
                    {paused ? <PlayCircle /> : <PauseCircle />}
                    {paused ? 'Resume' : 'Pause'}
                  </DropdownMenuItem>
                  {enrollment.status !== 'COMPLETED' && (
                    <DropdownMenuItem
                      onSelect={() =>
                        update.mutate({
                          enrollmentId: enrollment.id,
                          body: { status: 'COMPLETED' },
                        })
                      }
                    >
                      <GraduationCap />
                      Mark completed
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem destructive onSelect={() => setDeleting(enrollment)}>
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ],
    [update],
  )

  return (
    <>
      <PageHeader
        title="Arrangements"
        description="One student, one subject, one teacher. Everything else in tuition hangs off these."
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus />
            New arrangement
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={enrollments.data}
        getRowId={(row) => String(row.id)}
        isLoading={enrollments.isPending}
        error={enrollments.error}
        onRetry={() => void enrollments.refetch()}
        searchPlaceholder="Search students, teachers or subjects…"
        searchValues={(row) => [
          row.student?.full_name,
          row.teacher?.full_name,
          row.subject?.name,
          row.grade_level,
        ]}
        facets={facets}
        toolbar={
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={includeInactive}
              onCheckedChange={(v) => setIncludeInactive(v === true)}
            />
            Include paused and finished
          </label>
        }
        csv={{
          filename: 'tuition-arrangements',
          columns: [
            { header: 'Student', value: (r) => r.student?.full_name ?? '' },
            { header: 'Admission no', value: (r) => r.student?.admission_number ?? '' },
            { header: 'Subject', value: (r) => r.subject?.name ?? '' },
            { header: 'Teacher', value: (r) => r.teacher?.full_name ?? '' },
            { header: 'Status', value: (r) => r.status },
            { header: 'Level', value: (r) => r.grade_level ?? '' },
            { header: 'Class length', value: (r) => r.default_duration_minutes ?? '' },
            { header: 'Started', value: (r) => r.start_date ?? '' },
          ],
        }}
        emptyState={
          <EmptyState
            icon={<GraduationCap />}
            title="No arrangements yet"
            description="Pair a student with a teacher for one subject. Weekly class times come next."
            action={
              <Button
                onClick={() => {
                  setEditing(null)
                  setDialogOpen(true)
                }}
              >
                <Plus />
                New arrangement
              </Button>
            }
          />
        }
      />

      <EnrollmentDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />

      {/* Not the shared DeleteResourceDialog: that one exists for the LMS
          endpoints that answer 409 with a blocking list and cascade on
          `?force=true`. This delete has no such guard — it always takes the
          future schedule with it — so the warning is stated up front instead
          of being asked for. */}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this arrangement?"
        destructive
        confirmLabel="Delete arrangement"
        loading={remove.isPending}
        description={
          <>
            This removes the weekly class times and every class still to come for{' '}
            {deleting?.student?.full_name} in {deleting?.subject?.name}. Classes already taught are
            kept.
          </>
        }
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }}
      >
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">
          Marking it <strong className="text-foreground">completed</strong> is almost always better
          — it keeps the history, the shared materials and the invoices explicable.
        </p>
      </ConfirmDialog>
    </>
  )
}

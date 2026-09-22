import { zodResolver } from '@hookform/resolvers/zod'
import {
  CheckCircle2,
  ClipboardList,
  NotebookPen,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  Users,
} from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import type { HomeworkOut, HomeworkSubmissionOut } from '@/api/types'
import {
  useDeleteHomework,
  useGradeHomework,
  useHomework,
  useHomeworkSubmissions,
  useReopenSubmission,
  useSetHomework,
  useSubmitHomework,
  useUpdateHomework,
} from '@/queries/academics.queries'
import { useMyClasses } from '@/queries/teacher.queries'
import { useAuth } from '@/providers/auth-provider'
import { formatDate, todayApiDate } from '@/lib/datetime'
import { countLabel } from '@/lib/format'
import { isTeachingOrAdmin } from '@/lib/constants'
import { HOMEWORK_STATUS_LABEL, HOMEWORK_STATUS_TONE, dueLabel } from '@/lib/school'
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
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Field, FormError } from '@/components/forms/field'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * Homework — one module, two faces.
 *
 * `GET /homework` serves both and the SERVER decides which shape it fills: a
 * student's rows carry `my_status` and `my_marks`; a teacher's carry
 * `submission_count` and `expected_count`. So this file reads the signed-in
 * role once and renders the matching half, rather than checking which fields
 * happen to be populated — a teacher with no submissions yet and a student with
 * no status look identical on the wire.
 *
 * `MISSED` is derived from the due date having passed with nothing filed. It is
 * never stored, cannot be written, and is correct the morning after with no
 * sweep having run.
 */

// ================================================================== authoring

const homeworkSchema = z.object({
  class_id: z.string().min(1, 'Pick a class'),
  subject_id: z.string().min(1, 'Pick a subject'),
  title: z.string().min(1, 'Give it a title').max(200),
  description: z.string().max(10000).optional(),
  due_date: z.string().min(1, 'Pick a due date'),
  max_marks: z.string(),
  is_mandatory: z.boolean(),
  allow_late_submission: z.boolean(),
})

type HomeworkValues = z.infer<typeof homeworkSchema>

function HomeworkDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: HomeworkOut | null
}) {
  const create = useSetHomework()
  const update = useUpdateHomework()
  const myClasses = useMyClasses()

  const form = useForm<HomeworkValues>({
    resolver: zodResolver(homeworkSchema),
    defaultValues: {
      class_id: '',
      subject_id: '',
      title: '',
      description: '',
      due_date: '',
      max_marks: '',
      is_mandatory: true,
      allow_late_submission: true,
    },
  })

  React.useEffect(() => {
    if (!open) return
    form.reset({
      class_id: editing ? String(editing.class_id) : '',
      subject_id: editing ? String(editing.subject_id) : '',
      title: editing?.title ?? '',
      description: editing?.description ?? '',
      due_date: editing?.due_date ?? todayApiDate(),
      max_marks: editing?.max_marks != null ? String(editing.max_marks) : '',
      is_mandatory: editing?.is_mandatory ?? true,
      allow_late_submission: editing?.allow_late_submission ?? true,
    })
  }, [open, editing, form])

  /**
   * The (class, subject) pairs this teacher actually takes.
   *
   * Built from their mappings rather than from the full catalogues, so the
   * form cannot offer a combination the backend would refuse.
   */
  const pairs = React.useMemo(() => {
    const seen = new Set<string>()
    return (myClasses.data ?? [])
      .map((m) => ({
        classId: m.class_room.id,
        className: m.class_room.name,
        subjectId: m.subject.id,
        subjectName: m.subject.name,
      }))
      .filter((p) => {
        const key = `${p.classId}:${p.subjectId}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }, [myClasses.data])

  const selectedPair = `${form.watch('class_id')}:${form.watch('subject_id')}`

  const onSubmit = async (values: HomeworkValues) => {
    const marks = values.max_marks.trim()
    try {
      if (editing) {
        await update.mutateAsync({
          assignmentId: editing.id,
          body: {
            title: values.title,
            description: values.description?.trim() || null,
            due_date: values.due_date,
            max_marks: marks ? Number(marks) : null,
            is_mandatory: values.is_mandatory,
            allow_late_submission: values.allow_late_submission,
          },
        })
      } else {
        await create.mutateAsync({
          class_id: Number(values.class_id),
          subject_id: Number(values.subject_id),
          title: values.title,
          description: values.description?.trim() || null,
          due_date: values.due_date,
          max_marks: marks ? Number(marks) : null,
          is_mandatory: values.is_mandatory,
          allow_late_submission: values.allow_late_submission,
        })
      }
      onOpenChange(false)
    } catch (error) {
      form.setError('root', {
        message: (error as { message?: string })?.message ?? 'Could not save the homework.',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit homework' : 'Set homework'}</DialogTitle>
          <DialogDescription>
            Everyone in the class sees it. Who has handed in — and who has not — is on the
            marking list.
          </DialogDescription>
        </DialogHeader>
        <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-5">
            <FormError message={form.formState.errors.root?.message} />

            <Field
              id="hw_pair"
              label="Class and subject"
              required
              error={form.formState.errors.class_id?.message}
            >
              <Select
                value={selectedPair === ':' ? '' : selectedPair}
                onValueChange={(v) => {
                  const [classId, subjectId] = v.split(':')
                  form.setValue('class_id', classId, { shouldValidate: true })
                  form.setValue('subject_id', subjectId, { shouldValidate: true })
                }}
                disabled={!!editing}
              >
                <SelectTrigger id="hw_pair">
                  <SelectValue placeholder="Pick one you teach…" />
                </SelectTrigger>
                <SelectContent>
                  {pairs.map((pair) => (
                    <SelectItem
                      key={`${pair.classId}:${pair.subjectId}`}
                      value={`${pair.classId}:${pair.subjectId}`}
                    >
                      {pair.className} · {pair.subjectName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              id="hw_title"
              label="Title"
              required
              error={form.formState.errors.title?.message}
            >
              <Input
                id="hw_title"
                placeholder="Exercise 4.2, questions 1–10"
                {...form.register('title')}
              />
            </Field>

            <Field id="hw_description" label="What to do">
              <Textarea id="hw_description" rows={4} {...form.register('description')} />
            </Field>

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field
                id="hw_due"
                label="Due"
                required
                error={form.formState.errors.due_date?.message}
              >
                <Input id="hw_due" type="date" {...form.register('due_date')} />
              </Field>
              <Field id="hw_marks" label="Out of" hint="Leave blank if it is not marked.">
                <Input id="hw_marks" type="number" step="0.5" {...form.register('max_marks')} />
              </Field>
            </div>

            <div className="space-y-3 rounded-xl border border-border p-4">
              <label className="flex items-start justify-between gap-4">
                <span className="min-w-0">
                  <span className="text-sm font-medium">Counts as set homework</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Turn off for optional practice. On, it counts towards the daily-homework
                    obligation the oversight report tracks.
                  </span>
                </span>
                <Switch
                  checked={form.watch('is_mandatory')}
                  onCheckedChange={(v) => form.setValue('is_mandatory', v, { shouldDirty: true })}
                />
              </label>
              <label className="flex items-start justify-between gap-4 border-t border-border pt-3">
                <span className="min-w-0">
                  <span className="text-sm font-medium">Accept late work</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Late hand-ins are flagged either way; this decides whether they are taken.
                  </span>
                </span>
                <Switch
                  checked={form.watch('allow_late_submission')}
                  onCheckedChange={(v) =>
                    form.setValue('allow_late_submission', v, { shouldDirty: true })
                  }
                />
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {editing ? 'Save changes' : 'Set homework'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

// =================================================================== marking

function SubmissionRow({ submission }: { submission: HomeworkSubmissionOut }) {
  const grade = useGradeHomework()
  const reopen = useReopenSubmission()
  const [marks, setMarks] = React.useState(
    submission.marks != null ? String(submission.marks) : '',
  )
  const [feedback, setFeedback] = React.useState(submission.feedback ?? '')
  const [open, setOpen] = React.useState(false)

  // Non-submitters arrive as rows with no `submitted_at` — they are the point
  // of this list, so they render fully rather than being filtered out.
  const handedIn = !!submission.submitted_at

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {submission.student_name ?? `Student ${submission.student_id}`}
            </span>
            <Badge tone={HOMEWORK_STATUS_TONE[submission.status]} size="sm">
              {HOMEWORK_STATUS_LABEL[submission.status]}
            </Badge>
            {submission.is_late && (
              <Badge tone="warning" size="sm">
                Late
              </Badge>
            )}
          </div>
          {submission.marks != null && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {submission.marks}
              {submission.max_marks != null ? ` / ${submission.max_marks}` : ''}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {handedIn && (
            <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
              {submission.status === 'GRADED' ? 'Change mark' : 'Mark'}
            </Button>
          )}
          {submission.status === 'GRADED' && (
            <Button
              variant="ghost"
              size="sm"
              loading={reopen.isPending}
              onClick={() => reopen.mutate(submission.id)}
            >
              <RotateCcw />
              Reopen
            </Button>
          )}
        </div>
      </div>

      {submission.body && (
        <p className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-sm">
          {submission.body}
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-3 rounded-lg border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <Field id={`marks_${submission.id}`} label="Marks">
              <Input
                id={`marks_${submission.id}`}
                type="number"
                step="0.5"
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
              />
            </Field>
            <Field id={`feedback_${submission.id}`} label="Feedback">
              <Input
                id={`feedback_${submission.id}`}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </Field>
          </div>
          <Button
            size="sm"
            loading={grade.isPending}
            onClick={async () => {
              await grade.mutateAsync({
                submissionId: submission.id,
                body: {
                  marks: marks.trim() ? Number(marks) : null,
                  feedback: feedback.trim() || null,
                },
              })
              setOpen(false)
            }}
          >
            <CheckCircle2 />
            Save mark
          </Button>
        </div>
      )}
    </li>
  )
}

function MarkingSheet({
  assignment,
  onClose,
}: {
  assignment: HomeworkOut | null
  onClose: () => void
}) {
  const submissions = useHomeworkSubmissions(assignment?.id ?? null, !!assignment)

  return (
    <Sheet open={!!assignment} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{assignment?.title}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {assignment && (
            <p className="mb-4 text-sm text-muted-foreground">
              {assignment.class_name} · {assignment.subject_name} · due{' '}
              {formatDate(assignment.due_date)}
            </p>
          )}

          <QueryBoundary
            query={submissions}
            loading={<Skeleton className="h-64 w-full rounded-xl" />}
            isEmpty={(rows) => rows.length === 0}
            empty={
              <EmptyState
                icon={<Users />}
                title="Nobody is enrolled"
                description="This class has no students, so there is nothing to mark."
              />
            }
          >
            {(rows) => (
              <ul className="divide-y divide-border">
                {rows.map((submission) => (
                  <SubmissionRow key={submission.id} submission={submission} />
                ))}
              </ul>
            )}
          </QueryBoundary>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

// ================================================================== handing in

function SubmitDialog({
  assignment,
  onClose,
}: {
  assignment: HomeworkOut | null
  onClose: () => void
}) {
  const submit = useSubmitHomework()
  const [body, setBody] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setBody('')
    setError(null)
  }, [assignment])

  const send = async () => {
    if (!assignment) return
    // Mirrors the backend: a submission needs written work or an attachment,
    // and both empty is a 422 rather than an empty hand-in.
    if (!body.trim()) {
      setError('Write something — an empty submission is not accepted.')
      return
    }
    setError(null)
    try {
      await submit.mutateAsync({ assignmentId: assignment.id, body: { body: body.trim() } })
      onClose()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not hand it in.')
    }
  }

  const alreadyIn = assignment?.my_status === 'SUBMITTED'

  return (
    <Dialog open={!!assignment} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{alreadyIn ? 'Hand in again' : 'Hand in'}</DialogTitle>
          <DialogDescription>
            {alreadyIn
              ? 'This replaces what you handed in before — your teacher sees only the latest version.'
              : assignment?.is_overdue
                ? 'This is past its due date, so it will be flagged as late.'
                : 'Your teacher sees this as soon as you send it.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />
          {assignment?.description && (
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-sm">
              {assignment.description}
            </p>
          )}
          <Field id="submit_body" label="Your work" required>
            <Textarea
              id="submit_body"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} loading={submit.isPending}>
            <Send />
            Hand in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ===================================================================== page

function TeacherHomeworkCard({
  assignment,
  onMark,
  onEdit,
  onDelete,
}: {
  assignment: HomeworkOut
  onMark: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const submitted = assignment.submission_count ?? 0
  const expected = assignment.expected_count ?? 0
  const outstanding = Math.max(expected - submitted, 0)

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{assignment.title}</h3>
            {!assignment.is_mandatory && (
              <Badge tone="neutral" size="sm">
                Optional
              </Badge>
            )}
            {assignment.is_overdue && (
              <Badge tone={outstanding > 0 ? 'warning' : 'neutral'} size="sm">
                Past due
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {assignment.class_name} · {assignment.subject_name} · due{' '}
            {formatDate(assignment.due_date)}
          </p>
          <p className="mt-2 text-sm">
            <span className="font-medium tabular-nums">
              {submitted} of {expected}
            </span>
            <span className="text-muted-foreground"> handed in</span>
            {outstanding > 0 && (
              <span className="text-warning"> · {outstanding} outstanding</span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button size="sm" onClick={onMark}>
            <ClipboardList />
            Marking list
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onEdit}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      </div>
    </Card>
  )
}

function StudentHomeworkCard({
  assignment,
  onSubmit,
}: {
  assignment: HomeworkOut
  onSubmit: () => void
}) {
  const due = dueLabel(assignment)
  const status = assignment.my_status ?? 'ASSIGNED'
  // A graded piece is locked until a teacher reopens it — and a missed one
  // whose late window is shut cannot be taken either.
  const canHandIn =
    status !== 'GRADED' && (!assignment.is_overdue || assignment.allow_late_submission)

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{assignment.title}</h3>
            <Badge tone={HOMEWORK_STATUS_TONE[status]} size="sm">
              {HOMEWORK_STATUS_LABEL[status]}
            </Badge>
            <Badge tone={due.tone} size="sm">
              {due.label}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {assignment.subject_name} · set by {assignment.teacher_name ?? 'your teacher'}
          </p>
          {assignment.description && (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {assignment.description}
            </p>
          )}
          {assignment.my_marks != null && (
            <p className="mt-2 text-sm font-medium tabular-nums text-success">
              {assignment.my_marks}
              {assignment.max_marks != null ? ` / ${assignment.max_marks}` : ''}
            </p>
          )}
        </div>

        {canHandIn && (
          <Button size="sm" onClick={onSubmit}>
            <Send />
            {status === 'SUBMITTED' ? 'Hand in again' : 'Hand in'}
          </Button>
        )}
      </div>
    </Card>
  )
}

export default function HomeworkPage() {
  const { role } = useAuth()
  const teaching = isTeachingOrAdmin(role)
  const homework = useHomework()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<HomeworkOut | null>(null)
  const [marking, setMarking] = React.useState<HomeworkOut | null>(null)
  const [submitting, setSubmitting] = React.useState<HomeworkOut | null>(null)
  const [deleting, setDeleting] = React.useState<HomeworkOut | null>(null)
  const remove = useDeleteHomework()

  return (
    <div>
      <PageHeader
        title="Homework"
        description={
          teaching
            ? 'What you have set, who has handed in, and marking.'
            : 'Work your teachers have set you.'
        }
        actions={
          teaching ? (
            <Button
              onClick={() => {
                setEditing(null)
                setDialogOpen(true)
              }}
            >
              <Plus />
              Set homework
            </Button>
          ) : undefined
        }
      />

      <QueryBoundary
        query={homework}
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
            icon={<NotebookPen />}
            title={teaching ? 'You have not set any homework' : 'No homework right now'}
            description={
              teaching
                ? 'Set a piece and everyone in the class sees it, along with who has handed in.'
                : 'Anything your teachers set will appear here.'
            }
            action={
              teaching ? (
                <Button
                  onClick={() => {
                    setEditing(null)
                    setDialogOpen(true)
                  }}
                >
                  <Plus />
                  Set homework
                </Button>
              ) : undefined
            }
          />
        }
      >
        {(rows) => (
          <div className="space-y-3">
            {rows.map((assignment) =>
              teaching ? (
                <TeacherHomeworkCard
                  key={assignment.id}
                  assignment={assignment}
                  onMark={() => setMarking(assignment)}
                  onEdit={() => {
                    setEditing(assignment)
                    setDialogOpen(true)
                  }}
                  onDelete={() => setDeleting(assignment)}
                />
              ) : (
                <StudentHomeworkCard
                  key={assignment.id}
                  assignment={assignment}
                  onSubmit={() => setSubmitting(assignment)}
                />
              ),
            )}
          </div>
        )}
      </QueryBoundary>

      <HomeworkDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      <MarkingSheet assignment={marking} onClose={() => setMarking(null)} />
      <SubmitDialog assignment={submitting} onClose={() => setSubmitting(null)} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete "${deleting?.title}"?`}
        description={
          deleting?.submission_count
            ? `${countLabel(deleting.submission_count, 'student')} have already handed in. Their work goes with it.`
            : 'Nobody has handed in yet, so nothing is lost.'
        }
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id)
          setDeleting(null)
        }}
      />
    </div>
  )
}

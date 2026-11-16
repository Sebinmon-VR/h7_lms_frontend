import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import type { HomeworkOut, HomeworkSubmissionOut } from '@/api/types'
import {
  useDeleteHomework,
  useGradeHomework,
  useHomework,
  useHomeworkSubmissions,
  useReopenSubmission,
  useSetHomework,
  useUpdateHomework,
} from '@/queries/academics.queries'
import { useMyClasses } from '@/queries/teacher.queries'
import { cn } from '@/lib/cn'
import { formatDate, todayApiDate } from '@/lib/datetime'
import { countLabel } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Band, Figure, Figures, WorkspaceHeader } from '@/components/layout/workspace'
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

/**
 * Homework, as a teacher sees it: the work set on the left, the piece picked on the right
 * with who has handed in, and the marks typed straight into the rows.
 *
 * The same List + detail layout as My classes, flat like the other teacher pages: ruled
 * rows and plain coloured words, no cards or pill badges. A student's Homework page is the
 * other half of pages/shared/homework.tsx and is not touched by this one.
 */

const TH = cn(DETAIL_TH, 'whitespace-nowrap px-2 py-2 font-semibold first:pl-5 last:pr-5')
const TD = 'px-2 py-2.5 align-middle first:pl-5 last:pr-5'

type ListFilter = 'mark' | 'open' | 'past' | 'all'
type MarkFilter = 'all' | 'mark' | 'marked' | 'out'

/** Handed in and not yet marked; null when the server does not say what is marked. */
function toMark(hw: HomeworkOut): number | null {
  if (hw.graded_count == null) return null
  return Math.max((hw.submission_count ?? 0) - hw.graded_count, 0)
}

/** Past its due date and still not in. Before the due date nobody is "missing". */
function missing(hw: HomeworkOut): number {
  return hw.is_overdue ? Math.max((hw.expected_count ?? 0) - (hw.submission_count ?? 0), 0) : 0
}

function dueWords(hw: HomeworkOut): string {
  const d = hw.days_until_due
  if (d == null) return ''
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d > 1) return `in ${d} days`
  if (d === -1) return 'yesterday'
  return `${-d} days ago`
}

// ================================================================== set / edit

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
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: HomeworkOut | null
  onSaved: (hw: HomeworkOut) => void
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

  // Only the class and subject pairs this teacher takes, so the form cannot offer one the
  // backend would refuse.
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
    const body = {
      title: values.title,
      description: values.description?.trim() || null,
      due_date: values.due_date,
      max_marks: marks ? Number(marks) : null,
      is_mandatory: values.is_mandatory,
      allow_late_submission: values.allow_late_submission,
    }
    try {
      const saved = editing
        ? await update.mutateAsync({ assignmentId: editing.id, body })
        : await create.mutateAsync({ class_id: Number(values.class_id), subject_id: Number(values.subject_id), ...body })
      onOpenChange(false)
      onSaved(saved)
    } catch (error) {
      form.setError('root', { message: (error as { message?: string })?.message ?? 'Could not save the homework.' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit homework' : 'Set homework'}</DialogTitle>
          <DialogDescription>
            Everyone in the class sees it. Who has handed in, and who has not, is on its marking list.
          </DialogDescription>
        </DialogHeader>
        <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-5">
            <FormError message={form.formState.errors.root?.message} />

            <Field id="hw_pair" label="Class and subject" required error={form.formState.errors.class_id?.message}>
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
                    <SelectItem key={`${pair.classId}:${pair.subjectId}`} value={`${pair.classId}:${pair.subjectId}`}>
                      {pair.className} · {pair.subjectName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field id="hw_title" label="Title" required error={form.formState.errors.title?.message}>
              <Input id="hw_title" placeholder="Exercise 4.2, questions 1–10" {...form.register('title')} />
            </Field>

            <Field id="hw_description" label="What to do">
              <Textarea id="hw_description" rows={4} {...form.register('description')} />
            </Field>

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field id="hw_due" label="Due" required error={form.formState.errors.due_date?.message}>
                <Input id="hw_due" type="date" {...form.register('due_date')} />
              </Field>
              <Field id="hw_marks" label="Out of" hint="Leave blank if it is not marked.">
                <Input id="hw_marks" type="number" step="0.5" {...form.register('max_marks')} />
              </Field>
            </div>

            <div className="divide-y divide-border border-y border-border">
              <label className="flex items-start justify-between gap-4 py-3">
                <span className="min-w-0">
                  <span className="text-sm font-medium">Counts as set homework</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Turn off for optional practice. On, it counts towards the daily-homework obligation the oversight
                    report tracks.
                  </span>
                </span>
                <Switch
                  checked={form.watch('is_mandatory')}
                  onCheckedChange={(v) => form.setValue('is_mandatory', v, { shouldDirty: true })}
                />
              </label>
              <label className="flex items-start justify-between gap-4 py-3">
                <span className="min-w-0">
                  <span className="text-sm font-medium">Accept late work</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Late hand-ins are flagged either way; this decides whether they are taken.
                  </span>
                </span>
                <Switch
                  checked={form.watch('allow_late_submission')}
                  onCheckedChange={(v) => form.setValue('allow_late_submission', v, { shouldDirty: true })}
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

// ===================================================================== marking

const STATUS_WORDS: Record<HomeworkSubmissionOut['status'], { label: string; className: string }> = {
  SUBMITTED: { label: 'Handed in', className: 'font-medium text-info' },
  GRADED: { label: 'Marked', className: 'text-success' },
  ASSIGNED: { label: 'Not handed in', className: 'text-muted-foreground' },
  MISSED: { label: 'Missed', className: 'font-medium text-danger' },
}

/** To mark first, then marked, then the ones not in; by name within each. */
const STATUS_ORDER: Record<HomeworkSubmissionOut['status'], number> = { SUBMITTED: 0, GRADED: 1, MISSED: 2, ASSIGNED: 3 }

function shortDate(value: string | null | undefined): string {
  if (!value) return '—'
  return formatDate(value.slice(0, 10))
}

function MarkRow({
  submission,
  maxMarks,
  expanded,
  onToggle,
}: {
  submission: HomeworkSubmissionOut
  maxMarks: number | null | undefined
  expanded: boolean
  onToggle: () => void
}) {
  const grade = useGradeHomework()
  const reopen = useReopenSubmission()
  const handedIn = !!submission.submitted_at
  const graded = submission.status === 'GRADED'
  const [changing, setChanging] = React.useState(false)
  const [marks, setMarks] = React.useState(submission.marks != null ? String(submission.marks) : '')
  const [feedback, setFeedback] = React.useState(submission.feedback ?? '')

  // A fresh copy from the server (after a save or a reopen) resets what is typed.
  React.useEffect(() => {
    setMarks(submission.marks != null ? String(submission.marks) : '')
    setFeedback(submission.feedback ?? '')
    setChanging(false)
  }, [submission.marks, submission.feedback, submission.status])

  const editing = handedIn && (!graded || changing)
  // Save stands out only once something is typed in the row.
  const dirty =
    marks !== (submission.marks != null ? String(submission.marks) : '') || feedback !== (submission.feedback ?? '')
  const value = marks.trim() === '' ? null : Number(marks)
  const tooHigh = value != null && maxMarks != null && value > maxMarks
  const invalid = (value != null && (Number.isNaN(value) || value < 0)) || tooHigh

  const save = async () => {
    if (invalid) return
    try {
      await grade.mutateAsync({ submissionId: submission.id, body: { marks: value, feedback: feedback.trim() || null } })
      setChanging(false)
    } catch (error) {
      // The typed mark stays, to try again.
      toast.error((error as { message?: string })?.message ?? 'The mark could not be saved.')
    }
  }
  const reopenIt = () =>
    reopen.mutate(submission.id, {
      onError: (error) => toast.error((error as { message?: string })?.message ?? 'It could not be reopened.'),
    })
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void save()
    }
  }
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const words = STATUS_WORDS[submission.status]

  return (
    <>
      <tr
        className={cn(handedIn && 'cursor-pointer hover:bg-muted/40', expanded && 'bg-muted/30')}
        onClick={handedIn ? onToggle : undefined}
        aria-expanded={handedIn ? expanded : undefined}
      >
        <td className={cn(TD, 'whitespace-nowrap')}>
          <span className="inline-flex items-center gap-1.5">
            <ChevronDown
              className={cn(
                'size-3.5 shrink-0 text-muted-foreground transition-transform',
                expanded ? '' : '-rotate-90',
                !handedIn && 'invisible',
              )}
            />
            <span className="font-medium text-foreground">{submission.student_name ?? `Student ${submission.student_id}`}</span>
          </span>
        </td>
        <td className={cn(TD, 'whitespace-nowrap')}>
          <span className={words.className}>{words.label}</span>
          {submission.is_late && <span className="text-xs font-medium text-warning"> · late</span>}
        </td>
        <td className={cn(TD, 'whitespace-nowrap tabular-nums text-muted-foreground')}>{shortDate(submission.submitted_at)}</td>
        <td className={cn(TD, 'whitespace-nowrap')} onClick={stop}>
          {editing ? (
            <span className="inline-flex items-center gap-1.5">
              <Input
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
                onKeyDown={onKey}
                inputMode="decimal"
                aria-label={`Marks for ${submission.student_name ?? 'this student'}`}
                aria-invalid={invalid || undefined}
                className={cn('h-8 w-16 px-2 py-1 text-right tabular-nums', invalid && 'border-danger')}
              />
              {maxMarks != null && <span className="text-xs text-muted-foreground">/ {maxMarks}</span>}
            </span>
          ) : graded ? (
            <span className="tabular-nums text-foreground">
              {submission.marks ?? '—'}
              {maxMarks != null && submission.marks != null && <span className="text-muted-foreground"> / {maxMarks}</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className={cn(TD, 'min-w-48')} onClick={stop}>
          {editing ? (
            <Input
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={onKey}
              placeholder="Feedback (optional)"
              aria-label={`Feedback for ${submission.student_name ?? 'this student'}`}
              className="h-8 px-2 py-1 text-sm"
            />
          ) : (
            <span className={cn('line-clamp-1', submission.feedback ? 'text-foreground' : 'text-muted-foreground')}>
              {submission.feedback || '—'}
            </span>
          )}
        </td>
        <td className={cn(TD, 'whitespace-nowrap text-right')} onClick={stop}>
          {editing ? (
            <span className="inline-flex items-center gap-1">
              {changing && (
                <Button size="sm" variant="ghost" onClick={() => setChanging(false)}>
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                variant={dirty ? 'solid' : 'outline'}
                loading={grade.isPending}
                disabled={invalid}
                onClick={() => void save()}
              >
                Save
              </Button>
            </span>
          ) : graded ? (
            <span className="inline-flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => setChanging(true)}>
                Change
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<RotateCcw />}
                loading={reopen.isPending}
                onClick={reopenIt}
                title="Clear the mark so the student can hand in again"
              >
                Reopen
              </Button>
            </span>
          ) : null}
        </td>
      </tr>
      {tooHigh && (
        <tr>
          <td colSpan={6} className="px-5 pb-2 text-xs text-danger">
            The most this piece is out of is {maxMarks}.
          </td>
        </tr>
      )}
      {expanded && handedIn && (
        <tr className="bg-muted/30">
          <td colSpan={6} className="px-5 pb-4 pt-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Their work{submission.attachments.length > 0 && ` · ${countLabel(submission.attachments.length, 'attachment')}`}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
              {submission.body?.trim() || 'Nothing written; see the attachments.'}
            </p>
          </td>
        </tr>
      )}
    </>
  )
}

function MarkingTable({ assignment }: { assignment: HomeworkOut }) {
  const submissions = useHomeworkSubmissions(assignment.id)
  const [filter, setFilter] = React.useState<MarkFilter>('all')
  const [open, setOpen] = React.useState<string | null>(null)

  const rows = React.useMemo(
    () =>
      [...(submissions.data ?? [])].sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          (a.student_name ?? '').localeCompare(b.student_name ?? ''),
      ),
    [submissions.data],
  )
  const counts = {
    all: rows.length,
    mark: rows.filter((r) => r.status === 'SUBMITTED').length,
    marked: rows.filter((r) => r.status === 'GRADED').length,
    out: rows.filter((r) => !r.submitted_at).length,
  }
  const shown = rows.filter((r) =>
    filter === 'mark' ? r.status === 'SUBMITTED' : filter === 'marked' ? r.status === 'GRADED' : filter === 'out' ? !r.submitted_at : true,
  )

  const marked = rows.filter((r) => r.status === 'GRADED' && r.marks != null)
  const average = marked.length ? marked.reduce((sum, r) => sum + (r.marks ?? 0), 0) / marked.length : null
  const late = rows.filter((r) => r.is_late && r.submitted_at).length

  return (
    <>
      <Facts>
        <Fact label="Handed in">
          <span className="tabular-nums">
            {assignment.submission_count ?? 0} of {assignment.expected_count ?? 0}
          </span>
          {late > 0 && <span className="text-xs text-warning"> · {late} late</span>}
        </Fact>
        <Fact label="To mark">
          <span className={cn('tabular-nums', counts.mark > 0 ? 'font-semibold text-primary' : 'text-muted-foreground')}>
            {submissions.isPending ? '…' : counts.mark}
          </span>
        </Fact>
        <Fact label={assignment.is_overdue ? 'Missing' : 'Not in yet'}>
          <span
            className={cn(
              'tabular-nums',
              assignment.is_overdue && counts.out > 0 ? 'font-semibold text-danger' : 'text-foreground',
            )}
          >
            {submissions.isPending ? '…' : counts.out}
          </span>
        </Fact>
        <Fact label="Average mark">
          {average == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="tabular-nums">
              {Math.round(average * 10) / 10}
              {assignment.max_marks != null && <span className="text-muted-foreground"> / {assignment.max_marks}</span>}
            </span>
          )}
        </Fact>
        <Fact label="Out of">
          {assignment.max_marks != null ? `${assignment.max_marks} marks` : <span className="text-muted-foreground">Not marked out of</span>}
        </Fact>
        <Fact label="Late work">{assignment.allow_late_submission ? 'Accepted' : 'Not accepted'}</Fact>
      </Facts>

      {assignment.description && (
        <DetailSection title="What to do">
          <p className="whitespace-pre-wrap px-5 py-3 text-sm text-foreground">{assignment.description}</p>
        </DetailSection>
      )}

      <DetailSection
        title={`Marking${rows.length ? ` · ${rows.length}` : ''}`}
        action={
          <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Show">
            {(
              [
                ['all', 'All'],
                ['mark', 'To mark'],
                ['marked', 'Marked'],
                ['out', assignment.is_overdue ? 'Missing' : 'Not in'],
              ] as [MarkFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={filter === key}
                onClick={() => setFilter(key)}
                className={cn(
                  'rounded px-2 py-0.5 text-xs transition-colors',
                  filter === key ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label} <span className="tabular-nums">{counts[key]}</span>
              </button>
            ))}
          </div>
        }
      >
        {submissions.isPending ? (
          <div className="space-y-2 px-5 py-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 rounded" />
            ))}
          </div>
        ) : submissions.isError ? (
          <p className="px-5 py-6 text-center text-sm text-danger">The marking list could not be loaded. Try again in a moment.</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">
            Nobody is enrolled in this class, so there is nothing to mark.
          </p>
        ) : shown.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">
            {filter === 'mark' ? 'Nothing is waiting to be marked.' : 'No students here.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr>
                  <th className={TH}>Student</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Handed in</th>
                  <th className={TH}>Marks</th>
                  <th className={TH}>Feedback</th>
                  <th className={cn(TH, 'text-right')}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((s) => (
                  <MarkRow
                    key={s.id}
                    submission={s}
                    maxMarks={assignment.max_marks}
                    expanded={open === s.id}
                    onToggle={() => setOpen(open === s.id ? null : s.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DetailSection>
    </>
  )
}

function HomeworkDetail({
  assignment,
  onEdit,
  onDelete,
}: {
  assignment: HomeworkOut
  onEdit: () => void
  onDelete: () => void
}) {
  const due = dueWords(assignment)
  return (
    <>
      <DetailHeader
        title={assignment.title}
        badges={
          <>
            {!assignment.is_mandatory && <span className="text-xs text-muted-foreground">Optional</span>}
            {assignment.is_overdue && <span className="text-xs font-medium text-warning">Past due</span>}
          </>
        }
        sub={
          <>
            {assignment.class_name} · {assignment.subject_name} · set {formatDate(assignment.assigned_date)} · due{' '}
            <span className={cn(assignment.is_overdue ? 'text-warning' : 'text-foreground')}>
              {formatDate(assignment.due_date)}
              {due && ` (${due})`}
            </span>
          </>
        }
        actions={
          <>
            <Button size="sm" variant="outline" icon={<Pencil />} onClick={onEdit}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={onDelete} className="text-danger hover:text-danger">
              Delete
            </Button>
          </>
        }
      />
      <MarkingTable key={assignment.id} assignment={assignment} />
    </>
  )
}

// ======================================================================== page

export function TeacherHomework() {
  const homework = useHomework()
  const remove = useDeleteHomework()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = React.useState('')
  const [filter, setFilter] = React.useState<ListFilter | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<HomeworkOut | null>(null)
  const [deleting, setDeleting] = React.useState<HomeworkOut | null>(null)

  const all = homework.data ?? []
  const marksKnown = all.some((hw) => hw.graded_count != null)
  const counts = {
    mark: all.filter((hw) => (toMark(hw) ?? 0) > 0).length,
    open: all.filter((hw) => !hw.is_overdue).length,
    past: all.filter((hw) => hw.is_overdue).length,
    all: all.length,
  }
  // Open on what needs doing: marking, else what is still being worked on.
  const active: ListFilter = filter ?? (counts.mark > 0 ? 'mark' : counts.open > 0 ? 'open' : 'all')

  const q = search.trim().toLowerCase()
  const visible = all
    .filter((hw) =>
      active === 'mark' ? (toMark(hw) ?? 0) > 0 : active === 'open' ? !hw.is_overdue : active === 'past' ? hw.is_overdue : true,
    )
    .filter((hw) => !q || [hw.title, hw.class_name, hw.subject_name].some((v) => v?.toLowerCase().includes(q)))
    .sort((a, b) =>
      // What is past due reads newest first; what is still coming, soonest first.
      active === 'past' || active === 'all' ? b.due_date.localeCompare(a.due_date) : a.due_date.localeCompare(b.due_date),
    )

  // The picked piece while it is in the list being shown; switching the list moves to its first.
  const picked = Number(params.get('hw'))
  const selected = visible.find((hw) => hw.id === picked) ?? visible[0] ?? null
  const pick = (id: number) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('hw', String(id))
        return next
      },
      { replace: true },
    )

  const totalToMark = all.reduce((n, hw) => n + (toMark(hw) ?? 0), 0)
  const dueThisWeek = all.filter((hw) => hw.days_until_due != null && hw.days_until_due >= 0 && hw.days_until_due <= 6).length
  const totalMissing = all.reduce((n, hw) => n + missing(hw), 0)
  const handedIn = all.reduce((n, hw) => n + (hw.submission_count ?? 0), 0)

  const openSet = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const tabs: [ListFilter, string][] = [
    ...(marksKnown ? ([['mark', 'To mark']] as [ListFilter, string][]) : []),
    ['open', 'Open'],
    ['past', 'Past due'],
    ['all', 'All'],
  ]

  return (
    <>
      <WorkspaceHeader
        title="Homework"
        description="What you have set, who has handed in, and marking."
        actions={
          <Button size="sm" icon={<Plus />} onClick={openSet}>
            Set homework
          </Button>
        }
      />

      <Figures>
        <Figure label="Set" value={homework.isPending ? '…' : String(all.length)} context={`${counts.open} still open`} />
        <Figure
          label="To mark"
          value={homework.isPending ? '…' : marksKnown ? String(totalToMark) : '—'}
          context={marksKnown ? 'handed in, not marked' : undefined}
          tone="primary"
        />
        <Figure label="Due this week" value={homework.isPending ? '…' : String(dueThisWeek)} tone="info" />
        <Figure
          label="Missing"
          value={homework.isPending ? '…' : String(totalMissing)}
          context="on work past its due date"
          tone="danger"
          alert={totalMissing > 0}
        />
      </Figures>

      <Band className="border-b border-border px-0 sm:px-0 lg:px-0">
        <div className="lg:h-[calc(100vh-16rem)] lg:min-h-[30rem]">
          <SplitView
            list={
              <ListPane
                toolbar={
                  <>
                    <div className="flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5" role="radiogroup" aria-label="Show">
                      {tabs.map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          role="radio"
                          aria-checked={active === key}
                          onClick={() => setFilter(key)}
                          className={cn(
                            'flex-auto whitespace-nowrap rounded px-1.5 py-1 text-xs transition-colors',
                            active === key
                              ? 'bg-background font-medium text-foreground shadow-xs'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {label}
                          <span className={cn('ml-1 tabular-nums', key === 'mark' && counts.mark > 0 && 'text-primary')}>
                            {counts[key]}
                          </span>
                        </button>
                      ))}
                    </div>
                    <ListSearch value={search} onChange={setSearch} placeholder="Search title, class or subject" />
                  </>
                }
                footer={`${countLabel(all.length, 'piece')} set · ${handedIn} handed in`}
              >
                {homework.isPending ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 rounded" />
                    ))}
                  </div>
                ) : homework.isError ? (
                  <ListEmpty>Your homework could not be loaded. Try again in a moment.</ListEmpty>
                ) : visible.length === 0 ? (
                  <ListEmpty>
                    {q
                      ? 'Nothing matches that search.'
                      : all.length === 0
                        ? 'You have not set any homework yet.'
                        : active === 'mark'
                          ? 'Nothing is waiting to be marked.'
                          : active === 'open'
                            ? 'Nothing is open right now.'
                            : 'Nothing is past its due date.'}
                  </ListEmpty>
                ) : (
                  visible.map((hw) => {
                    const pending = toMark(hw)
                    const gone = missing(hw)
                    return (
                      <ListItem
                        key={hw.id}
                        active={selected?.id === hw.id}
                        onClick={() => pick(hw.id)}
                        title={hw.title}
                        sub={`${hw.class_name ?? ''} · ${hw.subject_name ?? ''} · due ${formatDate(hw.due_date)}`}
                        right={
                          pending ? (
                            <span className="font-semibold tabular-nums text-primary">{pending} to mark</span>
                          ) : (
                            <span className={cn('tabular-nums', gone > 0 ? 'text-warning' : 'text-muted-foreground')}>
                              {hw.submission_count ?? 0}/{hw.expected_count ?? 0}
                            </span>
                          )
                        }
                      />
                    )
                  })
                )}
              </ListPane>
            }
            detail={
              homework.isPending ? (
                <div className="space-y-3 p-5">
                  <Skeleton className="h-10 w-64 rounded" />
                  <Skeleton className="h-24 rounded" />
                  <Skeleton className="h-48 rounded" />
                </div>
              ) : !selected ? (
                <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                  <p className="text-sm text-muted-foreground">
                    {all.length === 0
                      ? 'Set a piece and everyone in the class sees it; who has handed in shows here.'
                      : 'Pick a piece of homework on the left to see who has handed in.'}
                  </p>
                  {all.length === 0 && (
                    <Button size="sm" icon={<Plus />} onClick={openSet}>
                      Set homework
                    </Button>
                  )}
                </div>
              ) : (
                <HomeworkDetail
                  key={selected.id}
                  assignment={selected}
                  onEdit={() => {
                    setEditing(selected)
                    setDialogOpen(true)
                  }}
                  onDelete={() => setDeleting(selected)}
                />
              )
            }
          />
        </div>
      </Band>

      <HomeworkDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={(hw) => pick(hw.id)} />

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
    </>
  )
}

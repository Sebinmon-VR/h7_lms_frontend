import { NotebookPen, Send } from 'lucide-react'
import * as React from 'react'

import type { HomeworkOut } from '@/api/types'
import { useHomework, useSubmitHomework } from '@/queries/academics.queries'
import { useAuth } from '@/providers/auth-provider'
import { isTeachingOrAdmin } from '@/lib/constants'
import { HOMEWORK_STATUS_LABEL, HOMEWORK_STATUS_TONE, dueLabel } from '@/lib/school'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FormError } from '@/components/forms/field'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

import { TeacherHomework } from './homework-teacher'

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
 * The teacher's half is its own page, homework-teacher.tsx (list + detail, marking in
 * the rows); the student's half is below.
 *
 * `MISSED` is derived from the due date having passed with nothing filed. It is
 * never stored, cannot be written, and is correct the morning after with no
 * sweep having run.
 */

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

function StudentHomework() {
  const homework = useHomework()
  const [submitting, setSubmitting] = React.useState<HomeworkOut | null>(null)

  return (
    <div>
      <PageHeader title="Homework" description="Work your teachers have set you." />

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
            title="No homework right now"
            description="Anything your teachers set will appear here."
          />
        }
      >
        {(rows) => (
          <div className="space-y-3">
            {rows.map((assignment) => (
              <StudentHomeworkCard
                key={assignment.id}
                assignment={assignment}
                onSubmit={() => setSubmitting(assignment)}
              />
            ))}
          </div>
        )}
      </QueryBoundary>

      <SubmitDialog assignment={submitting} onClose={() => setSubmitting(null)} />
    </div>
  )
}

export default function HomeworkPage() {
  const { role } = useAuth()
  return isTeachingOrAdmin(role) ? <TeacherHomework /> : <StudentHomework />
}

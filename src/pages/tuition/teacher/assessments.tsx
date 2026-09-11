import { ClipboardCheck, ExternalLink, Plus } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { TuitionAssessmentCategory } from '@/api/types'
import {
  useCreateTuitionAssessment,
  useMyTuitionStudents,
  useTuitionAssessments,
} from '@/queries/tuition.queries'
import { formatDateTime } from '@/lib/datetime'
import { ASSESSMENT_CATEGORIES, ASSESSMENT_CATEGORY_LABEL } from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { DateTimePicker } from '@/components/ui/date-picker'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
import { PageHeader } from '@/components/layout/page-header'

/**
 * Homework, assignments and exams set for one student.
 *
 * The engine behind these is the LMS exam engine unchanged, and the response
 * is an ordinary `ExamOut` — so once a piece of work exists, the existing exam
 * screens open it for question building, marking and publishing. This page's
 * job is only to create one against an ARRANGEMENT rather than a class, which
 * is the single thing the exam form cannot express.
 */

const CATEGORY_OPTIONS: (TuitionAssessmentCategory | 'ALL')[] = ['ALL', ...ASSESSMENT_CATEGORIES]

function SetWorkDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const enrollments = useMyTuitionStudents(false, open)
  const create = useCreateTuitionAssessment()

  const [enrollmentId, setEnrollmentId] = React.useState<string | null>(null)
  const [category, setCategory] = React.useState<TuitionAssessmentCategory>('HOMEWORK')
  const [title, setTitle] = React.useState('')
  const [instructions, setInstructions] = React.useState('')
  const [startsAt, setStartsAt] = React.useState<string | null>(null)
  const [endsAt, setEndsAt] = React.useState<string | null>(null)
  const [maxMarks, setMaxMarks] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setEnrollmentId(null)
    setCategory('HOMEWORK')
    setTitle('')
    setInstructions('')
    setStartsAt(null)
    setEndsAt(null)
    setMaxMarks('')
  }, [open])

  const invalid = !enrollmentId || !title.trim() || !startsAt || !endsAt || endsAt <= startsAt

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Set work"
      confirmLabel="Create"
      loading={create.isPending}
      description="Created as a draft. Add questions and publish it from the exam screen afterwards."
      onConfirm={() => {
        if (invalid) return
        create.mutate(
          {
            enrollment_id: Number(enrollmentId),
            category,
            title: title.trim(),
            instructions: instructions.trim() || null,
            starts_at: startsAt as string,
            ends_at: endsAt as string,
            max_marks: maxMarks ? Number(maxMarks) : null,
          },
          { onSuccess: () => onOpenChange(false) },
        )
      }}
    >
      <div className="space-y-3">
        <Field id="work-student" label="Student and subject" required>
          <Combobox
            id="work-student"
            value={enrollmentId}
            onChange={setEnrollmentId}
            options={(enrollments.data ?? []).map((e) => ({
              value: String(e.id),
              label: `${e.student?.full_name ?? 'Student'} · ${e.subject?.name ?? 'Subject'}`,
            }))}
            placeholder="Choose…"
            emptyMessage="You have no active students."
          />
        </Field>

        <Field id="work-category" label="Kind" required>
          <Select value={category} onValueChange={(v) => setCategory(v as TuitionAssessmentCategory)}>
            <SelectTrigger id="work-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSESSMENT_CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {ASSESSMENT_CATEGORY_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field id="work-title" label="Title" required>
          <Input
            id="work-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Trigonometry — problem set 3"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="work-from" label="Opens" required>
            <DateTimePicker id="work-from" value={startsAt} onChange={setStartsAt} />
          </Field>
          <Field
            id="work-to"
            label="Due"
            required
            error={
              startsAt && endsAt && endsAt <= startsAt ? 'Must be later than the open time' : undefined
            }
          >
            <DateTimePicker id="work-to" value={endsAt} onChange={setEndsAt} />
          </Field>
        </div>

        <Field id="work-marks" label="Out of" hint="Blank uses whatever the questions add up to.">
          <Input
            id="work-marks"
            type="number"
            min={1}
            value={maxMarks}
            onChange={(event) => setMaxMarks(event.target.value)}
          />
        </Field>

        <Field id="work-instructions" label="Instructions" hint="Shown to the student.">
          <Textarea
            id="work-instructions"
            rows={3}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </Field>
      </div>
    </ConfirmDialog>
  )
}

export default function TuitionTeacherAssessmentsPage() {
  const [category, setCategory] = React.useState<TuitionAssessmentCategory | 'ALL'>('ALL')
  const [studentId, setStudentId] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)

  const students = useMyTuitionStudents()
  const assessments = useTuitionAssessments('teacher', {
    category: category === 'ALL' ? undefined : category,
    studentId: studentId ? Number(studentId) : undefined,
  })

  return (
    <>
      <PageHeader
        title="Homework & exams"
        description="Work set for one student at a time. Questions, marking and results use the same screens as school exams."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus />
            Set work
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Kind</label>
          <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === 'ALL' ? 'Anything' : ASSESSMENT_CATEGORY_LABEL[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-48">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Student</label>
          <Combobox
            value={studentId}
            onChange={(v) => setStudentId(v || null)}
            options={[
              { value: '', label: 'All students' },
              ...Array.from(
                new Map(
                  (students.data ?? []).map((e) => [
                    e.student_id,
                    { value: String(e.student_id), label: e.student?.full_name ?? 'Student' },
                  ]),
                ).values(),
              ),
            ]}
            placeholder="All students"
          />
        </div>
      </div>

      <QueryBoundary
        query={assessments}
        loading={
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        }
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={<ClipboardCheck />}
            title="No work set yet"
            description="Set homework or an exam for one of your students. It behaves exactly like a school exam from there."
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus />
                Set work
              </Button>
            }
          />
        }
      >
        {(data) => (
          <div className="space-y-3">
            {data.map((exam) => (
              <Card key={exam.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">{exam.title}</h3>
                      <Badge tone="neutral" size="sm">
                        {ASSESSMENT_CATEGORY_LABEL[exam.category]}
                      </Badge>
                      <Badge
                        tone={
                          exam.status === 'PUBLISHED'
                            ? 'success'
                            : exam.status === 'CANCELLED'
                              ? 'neutral'
                              : 'warning'
                        }
                        size="sm"
                      >
                        {exam.status}
                      </Badge>
                      {exam.results_published && (
                        <Badge tone="info" size="sm">
                          Results released
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {exam.subject?.name ?? '—'} · {formatDateTime(exam.starts_at)} –{' '}
                      {formatDateTime(exam.ends_at, 'HH:mm')} · {exam.question_count} question
                      {exam.question_count === 1 ? '' : 's'} · out of {exam.max_marks}
                    </p>
                    {!exam.answer_key_complete && exam.question_count > 0 && (
                      <p className="mt-1.5 text-xs text-warning">
                        The answer key is incomplete — auto-marking will skip what is missing.
                      </p>
                    )}
                  </div>

                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/teacher/exams/${exam.id}`}>
                      <ExternalLink />
                      Open
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryBoundary>

      <SetWorkDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

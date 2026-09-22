import { Info, Plus, Save, Trash2, TriangleAlert } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { ApiError } from '@/api/errors'
import type { ExamCreate, ExamMode, ExamOut, ExamUpdate, GradeBand, GradingScheme } from '@/api/types'
import { useCreateExam, useExam, useExamStats, useUpdateExam } from '@/queries/exam.queries'
import { cn } from '@/lib/cn'
import { formatDateTime, parseApiDateTime } from '@/lib/datetime'
import {
  DEFAULT_GRADE_BANDS,
  EXAM_MODE_HELP,
  EXAM_MODE_LABEL,
  GRADING_SCHEME_LABEL,
  formatMark,
  formatMinutes,
  sortBands,
} from '@/lib/exams'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { DateTimePicker } from '@/components/ui/date-picker'
import { Input, Textarea } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ErrorState } from '@/components/feedback/states'
import { Field } from '@/components/forms/field'
import { FormActions, FormPage, FormSection } from '@/components/forms/form-page'
import { useExamCatalogue, useExamScope } from './exam-scope'

/**
 * Setting an exam, or correcting one.
 *
 * A page rather than a dialog: there are four groups of decisions here and
 * two of them (the time rules and the marking scheme) have consequences that
 * deserve a sentence of explanation beside the field. The summary on the
 * right restates the whole arrangement in plain words as it is filled in, so
 * a mistake in a date reads as "closes before it opens" rather than as two
 * timestamps that happen to be the wrong way round.
 *
 * Questions are NOT written here. An exam is created as a draft and the paper
 * is built on its own tab, because the form and the answer key are their own
 * job and a teacher may reasonably set the date a week before writing a
 * single question.
 */

interface FormState {
  classId: string | null
  subjectId: string | null
  teacherId: string | null
  title: string
  mode: ExamMode
  description: string
  instructions: string
  startsAt: string | null
  endsAt: string | null
  durationMinutes: string
  graceMinutes: string
  lateAllowed: boolean
  scheme: GradingScheme
  maxMarks: string
  passMarks: string
  bands: GradeBand[]
  autoGrade: boolean
  shuffle: boolean
  maxUploadFiles: string
}

const EMPTY: FormState = {
  classId: null,
  subjectId: null,
  teacherId: null,
  title: '',
  mode: 'ONLINE',
  description: '',
  instructions: '',
  startsAt: null,
  endsAt: null,
  durationMinutes: '',
  graceMinutes: '0',
  lateAllowed: true,
  scheme: 'MARKS',
  maxMarks: '',
  passMarks: '',
  bands: [],
  autoGrade: true,
  shuffle: false,
  maxUploadFiles: '5',
}

function toIso(value: string | null | undefined): string | null {
  const d = parseApiDateTime(value)
  return d ? d.toISOString() : null
}

function fromExam(exam: ExamOut): FormState {
  return {
    classId: String(exam.class_id),
    subjectId: String(exam.subject_id),
    teacherId: String(exam.teacher_id),
    title: exam.title,
    mode: exam.mode,
    description: exam.description ?? '',
    instructions: exam.instructions ?? '',
    startsAt: toIso(exam.starts_at),
    endsAt: toIso(exam.ends_at),
    durationMinutes: exam.duration_minutes != null ? String(exam.duration_minutes) : '',
    graceMinutes: String(exam.upload_grace_minutes ?? 0),
    lateAllowed: exam.late_submission_allowed,
    scheme: exam.grading_scheme,
    maxMarks: String(exam.max_marks),
    passMarks: exam.pass_marks != null ? String(exam.pass_marks) : '',
    bands: sortBands(exam.grade_bands),
    autoGrade: exam.auto_grade_objective,
    shuffle: exam.shuffle_questions,
    maxUploadFiles: String(exam.max_upload_files ?? 5),
  }
}

function num(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function validate(form: FormState, editing: boolean): Record<string, string> {
  const errors: Record<string, string> = {}

  if (!editing) {
    if (!form.classId) errors.classId = 'Choose a class.'
    if (!form.subjectId) errors.subjectId = 'Choose a subject.'
  }
  if (form.title.trim().length < 2) errors.title = 'Give the exam a title.'

  const starts = form.startsAt ? new Date(form.startsAt) : null
  const ends = form.endsAt ? new Date(form.endsAt) : null
  if (!starts) errors.startsAt = 'When does the window open?'
  if (!ends) errors.endsAt = 'When does the window close?'
  if (starts && ends && ends.getTime() <= starts.getTime()) {
    errors.endsAt = 'The window closes before it opens.'
  }

  const duration = num(form.durationMinutes)
  if (form.durationMinutes.trim() !== '' && (duration == null || duration <= 0 || duration > 1440)) {
    errors.durationMinutes = 'Between 1 and 1440 minutes, or leave blank.'
  } else if (duration != null && starts && ends) {
    const windowMinutes = (ends.getTime() - starts.getTime()) / 60_000
    if (duration > windowMinutes) {
      errors.durationMinutes = `Longer than the ${Math.round(windowMinutes)}-minute window — nobody could use their full time.`
    }
  }

  const grace = num(form.graceMinutes)
  if (grace == null || grace < 0 || grace > 1440) errors.graceMinutes = 'Between 0 and 1440 minutes.'

  const max = num(form.maxMarks)
  if (form.maxMarks.trim() !== '' && (max == null || max <= 0)) errors.maxMarks = 'Must be greater than zero.'
  if (editing && form.maxMarks.trim() === '') errors.maxMarks = 'Required.'

  const pass = num(form.passMarks)
  if (form.passMarks.trim() !== '' && (pass == null || pass < 0)) errors.passMarks = 'Cannot be negative.'
  else if (pass != null && max != null && pass > max) errors.passMarks = `Cannot exceed the maximum of ${formatMark(max)}.`

  if (form.scheme === 'GRADE' && form.bands.length === 0) {
    errors.bands = 'A letter-grade exam needs a grade scale to award from.'
  }
  const labels = form.bands.map((b) => b.grade.trim())
  const floors = form.bands.map((b) => b.min_percentage)
  if (labels.some((l) => !l)) errors.bands = 'Every grade needs a label.'
  else if (new Set(labels.map((l) => l.toUpperCase())).size !== labels.length) errors.bands = 'Grade labels must be unique.'
  else if (floors.some((f) => !Number.isFinite(f) || f < 0 || f > 100)) errors.bands = 'Starting percentages must be between 0 and 100.'
  else if (new Set(floors).size !== floors.length) errors.bands = 'Two grades cannot start at the same percentage.'

  const files = num(form.maxUploadFiles)
  if (files == null || files < 1 || files > 25 || !Number.isInteger(files)) {
    errors.maxUploadFiles = 'Between 1 and 25 files.'
  }

  return errors
}

function GradeBandsEditor({
  bands,
  onChange,
  disabled,
  error,
}: {
  bands: GradeBand[]
  onChange: (bands: GradeBand[]) => void
  disabled?: boolean
  error?: string
}) {
  const update = (index: number, patch: Partial<GradeBand>) =>
    onChange(bands.map((b, i) => (i === index ? { ...b, ...patch } : b)))

  return (
    <div className="space-y-2">
      {bands.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
          No grade scale. Marks will be reported as a percentage only.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[5rem_6rem_1fr_2rem] gap-2 border-b border-border bg-muted/50 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Grade</span>
            <span>From %</span>
            <span>Meaning</span>
            <span />
          </div>
          <ul className="divide-y divide-border/70">
            {bands.map((band, index) => (
              <li key={index} className="grid grid-cols-[5rem_6rem_1fr_2rem] items-center gap-2 px-3 py-1.5">
                <Input
                  value={band.grade}
                  disabled={disabled}
                  maxLength={8}
                  className="h-8 font-semibold"
                  aria-label={`Grade label ${index + 1}`}
                  onChange={(e) => update(index, { grade: e.target.value })}
                />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={Number.isFinite(band.min_percentage) ? band.min_percentage : ''}
                  disabled={disabled}
                  className="h-8"
                  aria-label={`Minimum percentage for grade ${band.grade}`}
                  onChange={(e) => update(index, { min_percentage: Number(e.target.value) })}
                />
                <Input
                  value={band.description ?? ''}
                  disabled={disabled}
                  placeholder="Optional"
                  className="h-8"
                  aria-label={`Description for grade ${band.grade}`}
                  onChange={(e) => update(index, { description: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  aria-label={`Remove grade ${band.grade}`}
                  onClick={() => onChange(bands.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          icon={<Plus />}
          disabled={disabled}
          onClick={() => onChange([...bands, { grade: '', min_percentage: 0, description: '' }])}
        >
          Add grade
        </Button>
        {bands.length === 0 && (
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(DEFAULT_GRADE_BANDS.map((b) => ({ ...b })))}>
            Use the standard A+ to E scale
          </Button>
        )}
        {bands.length > 0 && (
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(sortBands(bands))}>
            Sort highest first
          </Button>
        )}
      </div>
    </div>
  )
}

function Summary({
  form,
  className: cls,
  subject,
  teacher,
  editing,
}: {
  form: FormState
  className: string | null
  subject: string | null
  teacher: string | null
  editing: boolean
}) {
  const starts = form.startsAt ? formatDateTime(new Date(form.startsAt)) : null
  const ends = form.endsAt ? formatDateTime(new Date(form.endsAt)) : null
  const duration = num(form.durationMinutes)
  const grace = num(form.graceMinutes) ?? 0
  const max = num(form.maxMarks)
  const pass = num(form.passMarks)

  return (
    <Card className="p-5">
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {editing ? 'What will change' : 'What you are setting'}
      </p>
      <p className="mt-2 text-sm leading-relaxed">
        {form.title.trim() ? <strong>{form.title.trim()}</strong> : <span className="text-muted-foreground">An untitled exam</span>}
        {subject ? ` in ${subject}` : ''}
        {cls ? ` for ${cls}` : ''}
        {teacher ? `, set by ${teacher}` : ''}. An <strong>{EXAM_MODE_LABEL[form.mode].toLowerCase()}</strong> exam
        {starts ? (
          <>
            {' '}
            opening <strong>{starts}</strong>
            {ends ? (
              <>
                {' '}
                and closing <strong>{ends}</strong>
              </>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground"> with no window yet</span>
        )}
        {duration ? (
          <>
            . Each student gets <strong>{formatMinutes(duration)}</strong> once they start
          </>
        ) : (
          <>. Students have the whole window</>
        )}
        {grace > 0 ? `, and a hand-in up to ${formatMinutes(grace)} after the deadline is accepted and flagged late` : ''}
        {!form.lateAllowed ? '. Nothing is accepted after the deadline' : ''}.
      </p>
      <p className="mt-2 text-sm leading-relaxed">
        Valued by <strong>{GRADING_SCHEME_LABEL[form.scheme].toLowerCase()}</strong>
        {max != null ? (
          <>
            , out of <strong>{formatMark(max)}</strong>
          </>
        ) : form.mode === 'ONLINE' ? (
          <>, out of whatever the questions add up to</>
        ) : (
          <>, out of 100</>
        )}
        {pass != null ? (
          <>
            , pass mark <strong>{formatMark(pass)}</strong>
          </>
        ) : ''}
        {form.bands.length > 0 ? `, with ${form.bands.length} grade band${form.bands.length === 1 ? '' : 's'}` : ''}.
      </p>

      {!editing && (
        <div className="mt-4 rounded-lg bg-primary/8 px-3 py-2.5 text-xs">
          <p className="flex items-start gap-2 text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>
              Saved as a <strong>draft</strong>. Students see nothing until you publish it from the exam page
              {form.mode === 'ONLINE'
                ? ', which needs at least one question on the paper.'
                : ', which needs a question form or an uploaded question paper.'}
            </span>
          </p>
        </div>
      )}
    </Card>
  )
}

export default function ExamFormPage() {
  const scope = useExamScope()
  const catalogue = useExamCatalogue()
  const navigate = useNavigate()
  const params = useParams<{ examId?: string }>()
  const examId = params.examId ? Number(params.examId) : null
  const editing = examId != null

  const examQuery = useExam(examId)
  const statsQuery = useExamStats(editing ? examId : null)
  const createExam = useCreateExam()
  const updateExam = useUpdateExam()

  const [form, setForm] = React.useState<FormState>(EMPTY)
  const [touched, setTouched] = React.useState(false)
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [loadedFrom, setLoadedFrom] = React.useState<number | null>(null)

  // Seed once from the exam being edited; later refetches must not clobber edits.
  React.useEffect(() => {
    if (editing && examQuery.data && loadedFrom !== examQuery.data.id) {
      setForm(fromExam(examQuery.data))
      setLoadedFrom(examQuery.data.id)
    }
  }, [editing, examQuery.data, loadedFrom])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const classId = form.classId ? Number(form.classId) : null
  const subjectId = form.subjectId ? Number(form.subjectId) : null
  const subjects = React.useMemo(() => catalogue.subjectsFor(classId), [catalogue, classId])
  const teachers = React.useMemo(() => catalogue.teachersFor(classId, subjectId), [catalogue, classId, subjectId])

  // Auto-pick the only sensible option, the way the other teacher forms do.
  React.useEffect(() => {
    if (editing) return
    if (form.classId == null && catalogue.classes.length === 1) set('classId', String(catalogue.classes[0].id))
  }, [editing, catalogue.classes, form.classId])

  React.useEffect(() => {
    if (editing) return
    if (form.subjectId != null && !subjects.some((s) => String(s.id) === form.subjectId)) set('subjectId', null)
    else if (form.subjectId == null && subjects.length === 1) set('subjectId', String(subjects[0].id))
  }, [editing, subjects, form.subjectId])

  React.useEffect(() => {
    if (editing || !scope.isAdmin) return
    if (form.teacherId != null && !teachers.some((t) => String(t.id) === form.teacherId)) set('teacherId', null)
    else if (form.teacherId == null && teachers.length === 1 && classId != null && subjectId != null) {
      set('teacherId', String(teachers[0].id))
    }
  }, [editing, scope.isAdmin, teachers, form.teacherId, classId, subjectId])

  const errors = React.useMemo(() => ({ ...validate(form, editing), ...fieldErrors }), [form, editing, fieldErrors])
  const showError = (key: string) => (touched ? errors[key] : undefined)

  const handedIn = (statsQuery.data?.submitted ?? 0) > 0
  const original = editing ? examQuery.data : null

  const selectedClass = catalogue.classes.find((c) => c.id === classId) ?? null
  const selectedSubject = subjects.find((s) => s.id === subjectId) ?? null
  const selectedTeacher = teachers.find((t) => String(t.id) === form.teacherId) ?? null

  const buildCreate = (): ExamCreate => ({
    class_id: Number(form.classId),
    subject_id: Number(form.subjectId),
    title: form.title.trim(),
    mode: form.mode,
    status: 'DRAFT',
    description: form.description.trim() || null,
    instructions: form.instructions.trim() || null,
    starts_at: form.startsAt as string,
    ends_at: form.endsAt as string,
    duration_minutes: num(form.durationMinutes),
    upload_grace_minutes: num(form.graceMinutes) ?? 0,
    late_submission_allowed: form.lateAllowed,
    grading_scheme: form.scheme,
    max_marks: num(form.maxMarks),
    pass_marks: num(form.passMarks),
    grade_bands: sortBands(form.bands).map((b) => ({
      grade: b.grade.trim(),
      min_percentage: b.min_percentage,
      description: b.description?.trim() || null,
    })),
    shuffle_questions: form.shuffle,
    auto_grade_objective: form.autoGrade,
    max_upload_files: num(form.maxUploadFiles) ?? 5,
    teacher_id: scope.isAdmin && form.teacherId ? Number(form.teacherId) : null,
    questions: [],
  })

  /**
   * Only what changed. The backend rejects an empty body and applies
   * `exclude_none`, so a field cannot be cleared through an update — which is
   * why the optional fields here are only sent when they carry a value.
   */
  const buildUpdate = (exam: ExamOut): ExamUpdate => {
    const body: ExamUpdate = {}
    const before = fromExam(exam)

    if (form.title.trim() !== before.title) body.title = form.title.trim()
    if (form.description.trim() !== before.description && form.description.trim()) body.description = form.description.trim()
    if (form.instructions.trim() !== before.instructions && form.instructions.trim()) body.instructions = form.instructions.trim()
    if (form.startsAt && form.startsAt !== before.startsAt) body.starts_at = form.startsAt
    if (form.endsAt && form.endsAt !== before.endsAt) body.ends_at = form.endsAt

    const duration = num(form.durationMinutes)
    if (duration != null && String(duration) !== before.durationMinutes) body.duration_minutes = duration
    const grace = num(form.graceMinutes)
    if (grace != null && String(grace) !== before.graceMinutes) body.upload_grace_minutes = grace
    if (form.lateAllowed !== before.lateAllowed) body.late_submission_allowed = form.lateAllowed

    if (form.scheme !== before.scheme) body.grading_scheme = form.scheme
    const max = num(form.maxMarks)
    if (max != null && max !== exam.max_marks) body.max_marks = max
    const pass = num(form.passMarks)
    if (pass != null && pass !== exam.pass_marks) body.pass_marks = pass

    const bandsNow = JSON.stringify(sortBands(form.bands).map((b) => [b.grade.trim(), b.min_percentage, b.description?.trim() || null]))
    const bandsBefore = JSON.stringify(sortBands(exam.grade_bands).map((b) => [b.grade, b.min_percentage, b.description ?? null]))
    if (bandsNow !== bandsBefore) {
      body.grade_bands = sortBands(form.bands).map((b) => ({
        grade: b.grade.trim(),
        min_percentage: b.min_percentage,
        description: b.description?.trim() || null,
      }))
    }

    if (form.shuffle !== before.shuffle) body.shuffle_questions = form.shuffle
    if (form.autoGrade !== before.autoGrade) body.auto_grade_objective = form.autoGrade
    const files = num(form.maxUploadFiles)
    if (files != null && String(files) !== before.maxUploadFiles) body.max_upload_files = files
    if (scope.isAdmin && form.teacherId && Number(form.teacherId) !== exam.teacher_id) body.teacher_id = Number(form.teacherId)

    return body
  }

  const pendingUpdate = original ? buildUpdate(original) : {}
  const dirty = !editing || Object.keys(pendingUpdate).length > 0

  const submit = async () => {
    setTouched(true)
    setServerError(null)
    setFieldErrors({})
    if (Object.keys(validate(form, editing)).length > 0) return

    try {
      if (editing && original) {
        const body = buildUpdate(original)
        if (Object.keys(body).length === 0) {
          navigate(scope.examPath(original.id))
          return
        }
        const updated = await updateExam.mutateAsync({ examId: original.id, body })
        navigate(scope.examPath(updated.id))
      } else {
        const created = await createExam.mutateAsync(buildCreate())
        navigate(`${scope.examPath(created.id)}?tab=${created.mode === 'ONLINE' ? 'questions' : 'overview'}`, { replace: true })
      }
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null
      setServerError(apiError?.message ?? 'Could not save the exam.')
      if (apiError?.fieldErrors) {
        const mapped: Record<string, string> = {}
        const keyMap: Record<string, string> = {
          starts_at: 'startsAt',
          ends_at: 'endsAt',
          duration_minutes: 'durationMinutes',
          upload_grace_minutes: 'graceMinutes',
          max_marks: 'maxMarks',
          pass_marks: 'passMarks',
          grade_bands: 'bands',
          max_upload_files: 'maxUploadFiles',
          class_id: 'classId',
          subject_id: 'subjectId',
        }
        for (const [field, message] of Object.entries(apiError.fieldErrors)) mapped[keyMap[field] ?? field] = message
        setFieldErrors(mapped)
      }
    }
  }

  const backTo = editing && examId != null ? scope.examPath(examId) : scope.examsPath
  const saving = createExam.isPending || updateExam.isPending

  if (editing && examQuery.isPending) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }
  if (editing && examQuery.isError) {
    return <ErrorState error={examQuery.error} onRetry={() => examQuery.refetch()} />
  }
  if (!editing && catalogue.isError) {
    return <ErrorState error={catalogue.error} onRetry={catalogue.refetch} />
  }

  const frozenHint = handedIn
    ? `${statsQuery.data?.submitted} script${statsQuery.data?.submitted === 1 ? ' has' : 's have'} been handed in, so what the exam is worth is fixed.`
    : undefined

  return (
    <FormPage
      title={editing ? `Edit “${original?.title ?? 'exam'}”` : 'Set an exam'}
      description={
        editing
          ? 'Correct the details or time rules. The question paper is edited on the exam page.'
          : 'Decide what the exam is, when it runs and how it is marked. The paper comes next.'
      }
      backTo={backTo}
      backLabel={editing ? 'Back to the exam' : 'Back to exams'}
      aside={
        <Summary
          form={form}
          className={selectedClass?.name ?? original?.class_room?.name ?? null}
          subject={selectedSubject?.name ?? original?.subject?.name ?? null}
          teacher={scope.isAdmin ? (selectedTeacher?.full_name ?? original?.teacher?.full_name ?? null) : null}
          editing={editing}
        />
      }
      footer={
        <>
          {serverError && (
            <p className="mr-auto flex items-center gap-2 text-sm text-danger">
              <TriangleAlert className="size-4 shrink-0" />
              {serverError}
            </p>
          )}
          <FormActions
            cancelTo={backTo}
            submitLabel={editing ? 'Save changes' : 'Save draft'}
            submitIcon={<Save />}
            loading={saving}
            disabled={(touched && Object.keys(errors).length > 0) || !dirty}
            onSubmit={submit}
          />
        </>
      }
    >
      {/* Stacked, not the section's default grid: this form pairs its own fields
          (class + subject, opens + closes) and gives title and mode the full
          width. Inside a three-column grid each pair would get a third of the
          row and each field a sixth. */}
      <FormSection step={1} columns={1} title="What" description="Which class sits it, in which subject, and what it is called.">
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          <Field id="exam-class" label="Class" required error={showError('classId')}>
            <Combobox
              id="exam-class"
              value={form.classId}
              disabled={editing || catalogue.isPending}
              onChange={(v) => {
                set('classId', v)
                set('subjectId', null)
                set('teacherId', null)
              }}
              placeholder={catalogue.isPending ? 'Loading…' : 'Select a class'}
              emptyMessage="No classes available."
              options={
                editing && original
                  ? [
                      {
                        value: String(original.class_id),
                        // Null on a tuition assessment — set for one student, not a class.
                        label: original.class_room?.name ?? (original.class_id == null ? 'One-to-one' : 'Class'),
                      },
                    ]
                  : catalogue.classes.map((c) => ({ value: String(c.id), label: c.name, hint: c.code }))
              }
            />
          </Field>
          <Field id="exam-subject" label="Subject" required error={showError('subjectId')}>
            <Combobox
              id="exam-subject"
              value={form.subjectId}
              disabled={editing || !form.classId}
              onChange={(v) => {
                set('subjectId', v)
                set('teacherId', null)
              }}
              placeholder={form.classId ? 'Select a subject' : 'Choose a class first'}
              emptyMessage="No subjects assigned for this class."
              options={
                editing && original
                  ? [{ value: String(original.subject_id), label: original.subject?.name ?? 'Subject' }]
                  : subjects.map((s) => ({ value: String(s.id), label: s.name, hint: s.code }))
              }
            />
          </Field>
        </div>

        {scope.isAdmin && (
          <Field
            id="exam-teacher"
            label="Set on behalf of"
            hint="The teacher who owns this exam and marks it. Leave blank to file it under yourself."
          >
            <Combobox
              id="exam-teacher"
              value={form.teacherId}
              disabled={!form.classId || !form.subjectId}
              onChange={(v) => set('teacherId', v === form.teacherId ? null : v)}
              placeholder={form.subjectId ? 'Select a teacher (optional)' : 'Choose a class and subject first'}
              options={teachers.map((t) => ({ value: String(t.id), label: t.full_name, hint: t.email }))}
            />
          </Field>
        )}

        <Field id="exam-title" label="Title" required error={showError('title')}>
          <Input
            id="exam-title"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Unit 3 test — Fractions"
            invalid={!!showError('title')}
          />
        </Field>

        <Field id="exam-mode" label="Mode" required hint={editing ? 'Fixed once the exam exists.' : EXAM_MODE_HELP[form.mode]}>
          <Segmented<ExamMode>
            layoutId="exam-mode"
            value={form.mode}
            onChange={(v) => !editing && set('mode', v)}
            aria-label="Exam mode"
            options={[
              { value: 'ONLINE', label: 'Online form' },
              { value: 'OFFLINE', label: 'On paper' },
            ]}
            className={cn(editing && 'pointer-events-none opacity-60')}
          />
        </Field>

        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          <Field id="exam-description" label="Description" hint="What the exam covers. Shown to students.">
            <Textarea
              id="exam-description"
              rows={3}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Chapters 4–6: fractions, decimals and percentages."
            />
          </Field>
          <Field id="exam-instructions" label="Instructions" hint="Shown to students before they start.">
            <Textarea
              id="exam-instructions"
              rows={3}
              value={form.instructions}
              onChange={(e) => set('instructions', e.target.value)}
              placeholder="Answer every question. Show your working for question 5."
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        step={2}
        columns={1}
        title="When"
        description="The window bounds when anyone may sit it; the duration limits each student once they start."
      >
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          <Field id="exam-starts" label="Opens" required error={showError('startsAt')} hint="Shown to students in their own timezone.">
            <DateTimePicker id="exam-starts" value={form.startsAt} onChange={(v) => set('startsAt', v)} invalid={!!showError('startsAt')} />
          </Field>
          <Field id="exam-ends" label="Closes" required error={showError('endsAt')}>
            <DateTimePicker id="exam-ends" value={form.endsAt} onChange={(v) => set('endsAt', v)} invalid={!!showError('endsAt')} />
          </Field>
        </div>
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          <Field
            id="exam-duration"
            label="Time per student"
            error={showError('durationMinutes')}
            hint="Minutes from when they press start. Blank means the whole window."
          >
            <Input
              id="exam-duration"
              type="number"
              min={1}
              max={1440}
              inputMode="numeric"
              value={form.durationMinutes}
              onChange={(e) => set('durationMinutes', e.target.value)}
              placeholder="e.g. 60"
              invalid={!!showError('durationMinutes')}
            />
          </Field>
          <Field
            id="exam-grace"
            label="Uploading concession"
            error={showError('graceMinutes')}
            hint="Minutes past the deadline a hand-in is still accepted, flagged late. For scans that finish landing late."
          >
            <Input
              id="exam-grace"
              type="number"
              min={0}
              max={1440}
              inputMode="numeric"
              value={form.graceMinutes}
              onChange={(e) => set('graceMinutes', e.target.value)}
              invalid={!!showError('graceMinutes')}
            />
          </Field>
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
          <Switch checked={form.lateAllowed} onCheckedChange={(v) => set('lateAllowed', v)} className="mt-0.5" />
          <span className="text-sm">
            <span className="font-medium">Accept late work during the concession</span>
            <span className="block text-xs text-muted-foreground">
              Off means the deadline is hard: nothing is accepted after each student&rsquo;s time runs out.
            </span>
          </span>
        </label>
      </FormSection>

      <FormSection
        step={3}
        columns={1}
        title="Marking"
        description="How a valued script is reported. Fixed once scripts are handed in, so half a class is never marked one way and half another."
      >
        {frozenHint && (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2.5 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <span className="text-muted-foreground">{frozenHint}</span>
          </div>
        )}
        <Field
          id="exam-scheme"
          label="Scheme"
          hint={
            form.scheme === 'MARKS'
              ? 'The marker awards numbers; a letter is derived from the bands if you define any.'
              : 'The marker awards a letter directly from the bands, with no arithmetic.'
          }
        >
          <Segmented<GradingScheme>
            layoutId="exam-scheme"
            value={form.scheme}
            onChange={(v) => !handedIn && set('scheme', v)}
            aria-label="Grading scheme"
            options={[
              { value: 'MARKS', label: 'Marks' },
              { value: 'GRADE', label: 'Letter grade' },
            ]}
            className={cn(handedIn && 'pointer-events-none opacity-60')}
          />
        </Field>
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          <Field
            id="exam-max"
            label="Out of"
            required={editing}
            error={showError('maxMarks')}
            hint={form.mode === 'ONLINE' && !editing ? 'Leave blank to use what the questions add up to.' : undefined}
          >
            <Input
              id="exam-max"
              type="number"
              min={1}
              step="any"
              inputMode="decimal"
              disabled={handedIn}
              value={form.maxMarks}
              onChange={(e) => set('maxMarks', e.target.value)}
              placeholder={form.mode === 'ONLINE' ? 'Sum of questions' : '100'}
              invalid={!!showError('maxMarks')}
            />
          </Field>
          <Field id="exam-pass" label="Pass mark" error={showError('passMarks')} hint="In marks, not percent. Blank means no pass/fail line.">
            <Input
              id="exam-pass"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              disabled={handedIn}
              value={form.passMarks}
              onChange={(e) => set('passMarks', e.target.value)}
              placeholder="e.g. 35"
              invalid={!!showError('passMarks')}
            />
          </Field>
        </div>
        <Field
          id="exam-bands"
          label="Grade scale"
          required={form.scheme === 'GRADE'}
          hint="Each grade starts at a percentage; the one above it is the ceiling, so there are never gaps."
        >
          <GradeBandsEditor bands={form.bands} onChange={(bands) => set('bands', bands)} error={showError('bands')} />
        </Field>
        <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
          <Switch checked={form.autoGrade} onCheckedChange={(v) => set('autoGrade', v)} className="mt-0.5" />
          <span className="text-sm">
            <span className="font-medium">Mark objective questions automatically</span>
            <span className="block text-xs text-muted-foreground">
              Choice, short-answer and numeric questions are settled by the answer key the moment a script is handed in.
              Essays and file uploads always wait for you.
            </span>
          </span>
        </label>
      </FormSection>

      <FormSection step={4} columns={1} title="Options">
        <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
          <Switch checked={form.shuffle} onCheckedChange={(v) => set('shuffle', v)} className="mt-0.5" />
          <span className="text-sm">
            <span className="font-medium">Shuffle question order</span>
            <span className="block text-xs text-muted-foreground">Each student sees the questions in a different order.</span>
          </span>
        </label>
        <Field
          id="exam-files"
          label="Answer sheet uploads per student"
          error={showError('maxUploadFiles')}
          hint="How many files one student may attach: scanned pages, photos, a worked diagram."
        >
          <Input
            id="exam-files"
            type="number"
            min={1}
            max={25}
            inputMode="numeric"
            value={form.maxUploadFiles}
            onChange={(e) => set('maxUploadFiles', e.target.value)}
            invalid={!!showError('maxUploadFiles')}
            className="max-w-32"
          />
        </Field>
      </FormSection>
    </FormPage>
  )
}

import { ArrowLeft, ArrowRight, Check, ClipboardCheck, Eye, Info, Plus, Save, Trash2, TriangleAlert, Video } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ApiError } from '@/api/errors'
import type { ExamCreate, ExamMode, ExamOut, ExamUpdate, GradeBand, GradingScheme } from '@/api/types'
import { useCreateExam, useExam, useExamStats, useUpdateExam } from '@/queries/exam.queries'
import { cn } from '@/lib/cn'
import { formatDateTime, parseApiDateTime } from '@/lib/datetime'
import {
  DEFAULT_GRADE_BANDS,
  EXAM_MODE_HELP,
  GRADING_SCHEME_LABEL,
  formatMark,
  formatMinutes,
  sortBands,
} from '@/lib/exams'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { DateTimePicker } from '@/components/ui/date-picker'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ErrorState } from '@/components/feedback/states'
import { Band } from '@/components/layout/workspace'
import { useExamCatalogue, useExamScope } from './exam-scope'

/**
 * Setting an exam, or correcting one.
 *
 * A page rather than a dialog, in steps: What, When, Marking, then a check of
 * every answer before saving. Each step is a few titled sections with the
 * fields two or three to a row; the progress line along the top shows which
 * steps are done and which need fixing, and any step can be jumped to.
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
  autoPublish: boolean
  autoPublishAt: string | null
  liveInvigilation: boolean
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
  autoPublish: false,
  autoPublishAt: null,
  liveInvigilation: false,
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
    autoPublish: !!exam.auto_publish,
    autoPublishAt: toIso(exam.auto_publish_at),
    liveInvigilation: !!exam.live_invigilation,
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
        <p className="text-xs text-muted-foreground">
          No grade scale. Marks will be reported as a percentage only.
        </p>
      ) : (
        <div className="border-y border-border">
          <div className="grid grid-cols-[5rem_6rem_1fr_2rem] gap-2 border-b border-border py-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Grade</span>
            <span>From %</span>
            <span>Meaning</span>
            <span />
          </div>
          <ul className="divide-y divide-border/70">
            {bands.map((band, index) => (
              <li key={index} className="grid grid-cols-[5rem_6rem_1fr_2rem] items-center gap-2 py-1.5">
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

/** The steps of the form. Each lists the fields it validates; the last is the check. */
type Step = 'details' | 'schedule' | 'marking' | 'review'
const STEPS: { key: Step; label: string; title: string; fields: string[] }[] = [
  { key: 'details', label: 'What', title: 'What is the exam?', fields: ['classId', 'subjectId', 'title'] },
  { key: 'schedule', label: 'When', title: 'When does it run?', fields: ['startsAt', 'endsAt', 'durationMinutes', 'graceMinutes'] },
  { key: 'marking', label: 'Marking', title: 'How is it marked?', fields: ['maxMarks', 'passMarks', 'bands', 'maxUploadFiles'] },
  { key: 'review', label: 'Check & save', title: 'Check and save', fields: [] },
]

/** A field with its label above, the way a section's grid wants it. */
function Cell({
  label,
  hint,
  required,
  error,
  htmlFor,
  className,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  error?: string
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {error ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-danger" role="alert">
          <TriangleAlert className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : (
        hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

/** A section of the form: a small heading, then its fields. */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b border-border py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

/**
 * The exam as a student will meet it, drawn from the form as it is filled
 * in: what it is, when it opens, how long they get, what it is worth and what
 * to do. A mock of the student's screen, so its buttons do nothing.
 */
function StudentPreview({
  form,
  className: cls,
  subject,
  teacher,
}: {
  form: FormState
  className: string | null
  subject: string | null
  teacher: string | null
}) {
  const starts = form.startsAt ? new Date(form.startsAt) : null
  const ends = form.endsAt ? new Date(form.endsAt) : null
  const duration = num(form.durationMinutes)
  const max = num(form.maxMarks)
  const pass = num(form.passMarks)
  const grace = num(form.graceMinutes) ?? 0
  const online = form.mode === 'ONLINE'

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Eye className="size-3.5" />
        What students will see
      </p>
      <div className="border-y border-border">
        <div className="space-y-1 border-b border-border py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-primary">{subject ?? 'Subject'}</p>
          <p className={cn('text-lg font-medium leading-snug', form.title.trim() ? 'text-foreground' : 'text-muted-foreground/60')}>
            {form.title.trim() || 'Exam title'}
          </p>
          <p className="text-xs text-muted-foreground">
            {cls ?? 'Class'}
            {teacher ? ` · ${teacher}` : ''}
          </p>
        </div>

        <dl className="divide-y divide-border text-sm">
          {[
            ['Opens', starts ? formatDateTime(starts) : '—'],
            ['Closes', ends ? formatDateTime(ends) : '—'],
            ['Time allowed', duration ? formatMinutes(duration) : 'Until it closes'],
            ['Marks', `${max != null ? `Out of ${formatMark(max)}` : online ? 'Out of the questions’ total' : 'Out of 100'}${pass != null ? ` · pass ${formatMark(pass)}` : ''}`],
            ['How to answer', online ? 'Answer the questions here' : `Write on paper, upload up to ${form.maxUploadFiles || '5'} photos or scans`],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-right text-xs font-medium text-foreground">{v}</dd>
            </div>
          ))}
        </dl>

        {(form.description.trim() || form.instructions.trim()) && (
          <div className="space-y-2 border-t border-border py-3 text-xs">
            {form.description.trim() && <p className="text-muted-foreground">{form.description.trim()}</p>}
            {form.instructions.trim() && (
              <div className="border-l-2 border-border pl-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Instructions</p>
                <p className="mt-0.5 whitespace-pre-line text-foreground">{form.instructions.trim()}</p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2 border-t border-border py-3">
          {form.liveInvigilation && (
            <p className="flex items-center gap-1.5 text-[11px] text-warning">
              <Video className="size-3.5" />
              Sat in a live room with your camera on
            </p>
          )}
          {!form.lateAllowed ? (
            <p className="text-[11px] text-muted-foreground">Nothing is accepted after your time runs out.</p>
          ) : grace > 0 ? (
            <p className="text-[11px] text-muted-foreground">Uploads up to {formatMinutes(grace)} late are accepted, marked late.</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Students then press <span className="font-medium text-foreground">{online ? 'Start exam' : 'Download paper'}</span>
          </p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">A preview only. Students see it once the exam is published.</p>
    </div>
  )
}

/** A yes/no setting as one compact line with its switch. */
function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md px-1 py-1 hover:bg-muted/40">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs leading-relaxed text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}

/** Two-choice switch, used for the mode and the scheme. */
function Choice<T extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T
  options: [T, string][]
  onChange: (v: T) => void
  disabled?: boolean
  label: string
}) {
  return (
    <div className={cn('inline-flex rounded-md border border-border p-0.5', disabled && 'pointer-events-none opacity-60')} role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn('rounded px-3 py-1.5 text-sm transition-colors', value === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/** One answer on the check step: what it is, and what was chosen. */
function ReviewLine({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 border-b border-border py-2 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-words', warn ? 'font-medium text-danger' : 'text-foreground')}>{value}</dd>
    </div>
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
  const [step, setStep] = React.useState<Step>('details')

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
    auto_publish: form.autoPublish,
    auto_publish_at: form.autoPublish ? form.autoPublishAt : null,
    live_invigilation: form.liveInvigilation,
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
    if (form.autoPublish !== before.autoPublish) body.auto_publish = form.autoPublish
    if (form.liveInvigilation !== before.liveInvigilation) body.live_invigilation = form.liveInvigilation
    if (form.autoPublish && form.autoPublishAt && form.autoPublishAt !== before.autoPublishAt) {
      body.auto_publish_at = form.autoPublishAt
    }
    if (scope.isAdmin && form.teacherId && Number(form.teacherId) !== exam.teacher_id) body.teacher_id = Number(form.teacherId)

    return body
  }

  const pendingUpdate = original ? buildUpdate(original) : {}
  const dirty = !editing || Object.keys(pendingUpdate).length > 0

  const submit = async () => {
    setTouched(true)
    setServerError(null)
    setFieldErrors({})
    const problems = validate(form, editing)
    if (Object.keys(problems).length > 0) {
      const first = STEPS.find((st) => st.fields.some((f) => problems[f]))
      if (first) setStep(first.key)
      return
    }

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

  const stepErrors = (s: Step) => (touched ? STEPS.find((x) => x.key === s)!.fields.filter((f) => errors[f]).length : 0)
  const stepDone = (s: Step) => s !== 'review' && STEPS.find((x) => x.key === s)!.fields.every((f) => !errors[f])
  const stepIndex = STEPS.findIndex((s) => s.key === step)
  const goTo = (i: number) => setStep(STEPS[Math.max(0, Math.min(STEPS.length - 1, i))].key)
  const yesNo = (v: boolean) => (v ? 'Yes' : 'No')
  const at = (v: string | null) => (v ? formatDateTime(new Date(v)) : 'Not set')

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------ head */}
      <Band className="-mt-6 border-b border-border">
        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Link to={backTo} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" />
              {editing ? 'Back to the exam' : 'Back to exams'}
            </Link>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ClipboardCheck className="size-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-medium tracking-tight text-foreground">{editing ? `Edit “${original?.title ?? 'exam'}”` : 'Set an exam'}</h1>
                <p className="text-sm text-muted-foreground">
                  {editing ? 'Correct the details or time rules. The question paper is edited on the exam page' : 'Four short steps. The question paper comes after'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {serverError && (
              <p className="flex items-center gap-1.5 text-sm text-danger">
                <TriangleAlert className="size-4 shrink-0" />
                {serverError}
              </p>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate(backTo)}>
              Cancel
            </Button>
            <Button size="sm" icon={<Save />} loading={saving} disabled={!dirty} onClick={() => void submit()}>
              {editing ? 'Save changes' : 'Save draft'}
            </Button>
          </div>
        </div>

        {/* The progress line: each step a dot, done ones ticked, all clickable. */}
        <ol className="flex items-center gap-2 border-t border-border py-4">
          {STEPS.map((s, i) => {
            const current = s.key === step
            const problems = stepErrors(s.key)
            const done = !current && i < stepIndex && stepDone(s.key)
            return (
              <li key={s.key} className="flex flex-1 items-center gap-2 last:flex-none">
                <button type="button" onClick={() => goTo(i)} className="group flex items-center gap-2" aria-current={current ? 'step' : undefined}>
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors',
                      problems > 0
                        ? 'border-danger bg-danger/10 text-danger'
                        : current
                          ? 'border-primary bg-primary text-primary-foreground'
                          : done
                            ? 'border-success bg-success text-white'
                            : 'border-border bg-card text-muted-foreground group-hover:border-primary/50',
                    )}
                  >
                    {done && problems === 0 ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className={cn('whitespace-nowrap text-sm', current ? 'font-medium text-foreground' : 'text-muted-foreground group-hover:text-foreground')}>
                    {s.label}
                    {problems > 0 && <span className="ml-1 text-xs text-danger">({problems})</span>}
                  </span>
                </button>
                {i < STEPS.length - 1 && <span className={cn('h-px flex-1', i < stepIndex ? 'bg-success' : 'bg-border')} aria-hidden />}
              </li>
            )
          })}
        </ol>
      </Band>

      {/* ---------------------------------------------------------- the step */}
      <div className="!mt-0">
        <Band className="border-b border-border">
          <div className={cn(step !== 'review' && 'grid gap-x-8 lg:grid-cols-[minmax(0,1fr)_20rem]')}>
          <div className="min-w-0">
          {step === 'details' && (
            <>
              <Section title="Who sits it" hint={editing ? 'Fixed once the exam exists' : undefined}>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <Cell label="Class" required htmlFor="exam-class" error={showError('classId')}>
                    <Combobox
                      id="exam-class"
                      value={form.classId}
                      disabled={editing || catalogue.isPending}
                      onChange={(v) => {
                        set('classId', v)
                        set('subjectId', null)
                        set('teacherId', null)
                      }}
                      placeholder={catalogue.isPending ? 'Loading…' : 'Choose a class'}
                      emptyMessage="No classes available."
                      className="h-9"
                      options={
                        editing && original
                          ? [{ value: String(original.class_id), label: original.class_room?.name ?? (original.class_id == null ? 'One-to-one' : 'Class') }]
                          : catalogue.classes.map((c) => ({ value: String(c.id), label: c.name, hint: c.code }))
                      }
                    />
                  </Cell>
                  <Cell label="Subject" required htmlFor="exam-subject" error={showError('subjectId')}>
                    <Combobox
                      id="exam-subject"
                      value={form.subjectId}
                      disabled={editing || !form.classId}
                      onChange={(v) => {
                        set('subjectId', v)
                        set('teacherId', null)
                      }}
                      placeholder={form.classId ? 'Choose a subject' : 'Choose a class first'}
                      emptyMessage="No subjects assigned for this class."
                      className="h-9"
                      options={
                        editing && original
                          ? [{ value: String(original.subject_id), label: original.subject?.name ?? 'Subject' }]
                          : subjects.map((s) => ({ value: String(s.id), label: s.name, hint: s.code }))
                      }
                    />
                  </Cell>
                  {scope.isAdmin && (
                    <Cell label="Set on behalf of" htmlFor="exam-teacher" hint="Blank files it under you">
                      <Combobox
                        id="exam-teacher"
                        value={form.teacherId}
                        disabled={!form.classId || !form.subjectId}
                        onChange={(v) => set('teacherId', v === form.teacherId ? null : v)}
                        placeholder={form.subjectId ? 'Choose a teacher' : 'Choose class and subject'}
                        className="h-9"
                        options={teachers.map((t) => ({ value: String(t.id), label: t.full_name, hint: t.email }))}
                      />
                    </Cell>
                  )}
                </div>
              </Section>
              <Section title="The exam">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <Cell label="Title" required htmlFor="exam-title" error={showError('title')}>
                    <Input id="exam-title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Unit 3 test — Fractions" invalid={!!showError('title')} className="h-9" />
                  </Cell>
                  <Cell label="How it is taken" required hint={editing ? 'Fixed once the exam exists' : undefined}>
                    <Choice<ExamMode>
                      label="Exam mode"
                      value={form.mode}
                      disabled={editing}
                      onChange={(v) => set('mode', v)}
                      options={[
                        ['ONLINE', 'Online form'],
                        ['OFFLINE', 'On paper'],
                      ]}
                    />
                  </Cell>
                </div>
                {!editing && <p className="-mt-3 text-xs text-muted-foreground">{EXAM_MODE_HELP[form.mode]}</p>}
                <div className="grid gap-5 sm:grid-cols-2">
                  <Cell label="Description" htmlFor="exam-description" hint="What it covers. Shown to students">
                    <Textarea id="exam-description" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Chapters 4–6: fractions, decimals and percentages." />
                  </Cell>
                  <Cell label="Instructions" htmlFor="exam-instructions" hint="Shown before they start">
                    <Textarea id="exam-instructions" rows={2} value={form.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="Answer every question. Show your working for question 5." />
                  </Cell>
                </div>
              </Section>
            </>
          )}

          {step === 'schedule' && (
            <>
              <Section title="The window" hint="When anyone may sit it. Shown to students in their own timezone">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Cell label="Opens" required htmlFor="exam-starts" error={showError('startsAt')}>
                    <DateTimePicker id="exam-starts" value={form.startsAt} onChange={(v) => set('startsAt', v)} invalid={!!showError('startsAt')} />
                  </Cell>
                  <Cell label="Closes" required htmlFor="exam-ends" error={showError('endsAt')}>
                    <DateTimePicker id="exam-ends" value={form.endsAt} onChange={(v) => set('endsAt', v)} invalid={!!showError('endsAt')} />
                  </Cell>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Cell label="Time per student (minutes)" htmlFor="exam-duration" hint="From when they press start. Blank means the whole window" error={showError('durationMinutes')}>
                    <Input id="exam-duration" type="number" min={1} max={1440} inputMode="numeric" value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} placeholder="e.g. 60" invalid={!!showError('durationMinutes')} className="h-9" />
                  </Cell>
                  <Cell label="Upload grace time (minutes)" htmlFor="exam-grace" hint="Accepted after the deadline, flagged late" error={showError('graceMinutes')}>
                    <Input id="exam-grace" type="number" min={0} max={1440} inputMode="numeric" value={form.graceMinutes} onChange={(e) => set('graceMinutes', e.target.value)} invalid={!!showError('graceMinutes')} className="h-9" />
                  </Cell>
                </div>
              </Section>
              <Section title="Rules">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Toggle label="Accept late work in the grace time" hint="Off makes the deadline hard." checked={form.lateAllowed} onChange={(v) => set('lateAllowed', v)} />
                  <Toggle label="Live invigilation" hint="Students sit it in a live room, camera on, while you watch." checked={form.liveInvigilation} onChange={(v) => set('liveInvigilation', v)} />
                  <Toggle label="Publish automatically" hint="Released to students by itself. It needs its paper by then." checked={form.autoPublish} onChange={(v) => set('autoPublish', v)} />
                </div>
                {form.autoPublish && (
                  <Cell label="Publish at" htmlFor="exam-auto-publish-at" hint="Blank publishes when the exam opens">
                    <DateTimePicker id="exam-auto-publish-at" value={form.autoPublishAt} onChange={(v) => set('autoPublishAt', v)} />
                  </Cell>
                )}
              </Section>
            </>
          )}

          {step === 'marking' && (
            <>
              <Section title="Marks" hint={frozenHint}>
                <div className="grid gap-5 sm:grid-cols-3">
                  <Cell label="Scheme" hint={form.scheme === 'MARKS' ? 'Numbers; a letter from the bands' : 'A letter straight from the bands'}>
                    <Choice<GradingScheme>
                      label="Grading scheme"
                      value={form.scheme}
                      disabled={handedIn}
                      onChange={(v) => set('scheme', v)}
                      options={[
                        ['MARKS', 'Marks'],
                        ['GRADE', 'Letter grade'],
                      ]}
                    />
                  </Cell>
                  <Cell label="Out of" required={editing} htmlFor="exam-max" hint={form.mode === 'ONLINE' && !editing ? 'Blank uses the questions’ total' : undefined} error={showError('maxMarks')}>
                    <Input id="exam-max" type="number" min={1} step="any" inputMode="decimal" disabled={handedIn} value={form.maxMarks} onChange={(e) => set('maxMarks', e.target.value)} placeholder={form.mode === 'ONLINE' ? 'Sum of questions' : '100'} invalid={!!showError('maxMarks')} className="h-9" />
                  </Cell>
                  <Cell label="Pass mark" htmlFor="exam-pass" hint="In marks. Blank means no pass line" error={showError('passMarks')}>
                    <Input id="exam-pass" type="number" min={0} step="any" inputMode="decimal" disabled={handedIn} value={form.passMarks} onChange={(e) => set('passMarks', e.target.value)} placeholder="e.g. 35" invalid={!!showError('passMarks')} className="h-9" />
                  </Cell>
                </div>
                <Cell label="Grade scale" required={form.scheme === 'GRADE'} hint="Each grade starts at a percentage; the one above is its ceiling">
                  <GradeBandsEditor bands={form.bands} onChange={(bands) => set('bands', bands)} error={showError('bands')} />
                </Cell>
              </Section>
              <Section title="Options">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Toggle label="Mark objective questions automatically" hint="Choice, short-answer and numeric questions, from the answer key." checked={form.autoGrade} onChange={(v) => set('autoGrade', v)} />
                  <Toggle label="Shuffle question order" hint="Each student sees a different order." checked={form.shuffle} onChange={(v) => set('shuffle', v)} />
                </div>
                <Cell label="Answer uploads per student" htmlFor="exam-files" hint="Scanned pages, photos, a diagram (1 to 25)" error={showError('maxUploadFiles')}>
                  <Input id="exam-files" type="number" min={1} max={25} inputMode="numeric" value={form.maxUploadFiles} onChange={(e) => set('maxUploadFiles', e.target.value)} invalid={!!showError('maxUploadFiles')} className="h-9" />
                </Cell>
              </Section>
            </>
          )}

          </div>
          {step !== 'review' && (
            <aside className="border-t border-border py-4 lg:border-l lg:border-t-0 lg:pl-8">
              <div className="lg:sticky lg:top-4">
                <StudentPreview
                  form={form}
                  className={selectedClass?.name ?? original?.class_room?.name ?? null}
                  subject={selectedSubject?.name ?? original?.subject?.name ?? null}
                  teacher={selectedTeacher?.full_name ?? original?.teacher?.full_name ?? null}
                />
              </div>
            </aside>
          )}
          </div>

          {step === 'review' && (
            <>
              <div className="grid lg:grid-cols-3 lg:divide-x lg:divide-border">
              {STEPS.slice(0, 3).map((s, i) => (
                <section key={s.key} className="border-b border-border py-5 lg:border-b-0 lg:px-6 lg:first:pl-0 lg:last:pr-0">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-foreground">
                      <span className={cn('flex size-4 items-center justify-center rounded-full', stepDone(s.key) ? 'bg-success text-white' : 'bg-danger text-white')}>
                        {stepDone(s.key) ? <Check className="size-3" /> : <span className="text-[10px]">!</span>}
                      </span>
                      {s.label}
                    </h3>
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => goTo(i)}>
                      Edit
                    </Button>
                  </div>
                  <dl className="pt-1">
                    {s.key === 'details' && (
                      <>
                        <ReviewLine label="Class" value={selectedClass?.name ?? original?.class_room?.name ?? 'Not chosen'} warn={!!errors.classId} />
                        <ReviewLine label="Subject" value={selectedSubject?.name ?? original?.subject?.name ?? 'Not chosen'} warn={!!errors.subjectId} />
                        {scope.isAdmin && <ReviewLine label="Set on behalf of" value={selectedTeacher?.full_name ?? original?.teacher?.full_name ?? 'You'} />}
                        <ReviewLine label="Title" value={form.title.trim() || 'Not written'} warn={!!errors.title} />
                        <ReviewLine label="How it is taken" value={form.mode === 'ONLINE' ? 'Online form' : 'On paper, answers uploaded'} />
                        {form.description.trim() && <ReviewLine label="Description" value={form.description.trim()} />}
                        {form.instructions.trim() && <ReviewLine label="Instructions" value={form.instructions.trim()} />}
                      </>
                    )}
                    {s.key === 'schedule' && (
                      <>
                        <ReviewLine label="Opens" value={errors.startsAt ?? at(form.startsAt)} warn={!!errors.startsAt} />
                        <ReviewLine label="Closes" value={errors.endsAt ?? at(form.endsAt)} warn={!!errors.endsAt} />
                        <ReviewLine label="Time per student" value={num(form.durationMinutes) ? formatMinutes(num(form.durationMinutes)) : 'The whole window'} />
                        <ReviewLine label="Upload grace time" value={(num(form.graceMinutes) ?? 0) > 0 ? formatMinutes(num(form.graceMinutes)) : 'None'} />
                        <ReviewLine label="Late work" value={form.lateAllowed ? 'Accepted in the grace time' : 'Not accepted'} />
                        <ReviewLine label="Publish automatically" value={form.autoPublish ? (form.autoPublishAt ? `Yes, ${at(form.autoPublishAt)}` : 'Yes, when it opens') : 'No'} />
                        <ReviewLine label="Live invigilation" value={yesNo(form.liveInvigilation)} />
                      </>
                    )}
                    {s.key === 'marking' && (
                      <>
                        <ReviewLine label="Scheme" value={GRADING_SCHEME_LABEL[form.scheme]} />
                        <ReviewLine
                          label="Out of"
                          value={errors.maxMarks ?? (num(form.maxMarks) != null ? formatMark(num(form.maxMarks)) : form.mode === 'ONLINE' ? 'What the questions add up to' : '100')}
                          warn={!!errors.maxMarks}
                        />
                        <ReviewLine label="Pass mark" value={errors.passMarks ?? (num(form.passMarks) != null ? formatMark(num(form.passMarks)) : 'No pass line')} warn={!!errors.passMarks} />
                        <ReviewLine label="Grade scale" value={errors.bands ?? (form.bands.length ? sortBands(form.bands).map((b) => `${b.grade} ${b.min_percentage}%+`).join(' · ') : 'None')} warn={!!errors.bands} />
                        <ReviewLine label="Auto-marking" value={yesNo(form.autoGrade)} />
                        <ReviewLine label="Shuffle questions" value={yesNo(form.shuffle)} />
                        <ReviewLine label="Uploads per student" value={errors.maxUploadFiles ?? form.maxUploadFiles} warn={!!errors.maxUploadFiles} />
                      </>
                    )}
                  </dl>
                </section>
              ))}
              </div>
              {!editing && (
                <p className="mb-5 flex items-start gap-2 border-l-2 border-primary bg-primary/[0.04] px-3 py-2.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span>
                    Saved as a <strong className="text-foreground">draft</strong>. Students see nothing until it is published from the exam page
                    {form.mode === 'ONLINE' ? ', which needs at least one question on the paper.' : ', which needs a question form or an uploaded question paper.'}
                  </span>
                </p>
              )}
            </>
          )}

        </Band>

          {/* ---------------------------------------- step buttons, pinned */}
          <Band className="sticky bottom-0 z-10 border-b border-t border-border bg-card/95 backdrop-blur">
          <div className="flex items-center justify-between py-3">
            <Button variant="ghost" size="sm" disabled={stepIndex === 0} onClick={() => goTo(stepIndex - 1)}>
              <ArrowLeft />
              Back
            </Button>
            {stepIndex < STEPS.length - 1 ? (
              <Button size="sm" onClick={() => goTo(stepIndex + 1)}>
                Next: {STEPS[stepIndex + 1].label}
                <ArrowRight />
              </Button>
            ) : (
              <Button size="sm" icon={<Save />} loading={saving} disabled={!dirty} onClick={() => void submit()}>
                {editing ? 'Save changes' : 'Save draft'}
              </Button>
            )}
          </div>
          </Band>
      </div>
    </div>
  )
}

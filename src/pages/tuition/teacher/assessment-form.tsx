import { CalendarClock, ClipboardCheck, Save, Settings2, SlidersHorizontal } from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'

import type {
  ExamMode,
  GradingScheme,
  TuitionAssessmentCategory,
  TuitionGradeBand,
} from '@/api/types'
import { useCreateTuitionAssessment, useMyTuitionStudents } from '@/queries/tuition.queries'
import { ASSESSMENT_CATEGORIES, ASSESSMENT_CATEGORY_LABEL } from '@/lib/tuition'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { DateTimePicker } from '@/components/ui/date-picker'
import { Input, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field, FormError } from '@/components/forms/field'
import { FormActions, FormPage, FormSection } from '@/components/forms/form-page'

/**
 * Setting tuition work, with the whole engine exposed.
 *
 * This replaces a dialog that sent SEVEN of the eighteen fields
 * `TuitionAssessmentCreate` accepts. Everything it left out was a real
 * decision silently taken on the teacher's behalf: whether the paper is sat
 * online or handed in as a scan, whether it is marked out of marks or graded
 * to bands, how long the student gets once they start, what counts as a pass,
 * and whether objective questions mark themselves. A tuition paper was
 * therefore never as capable as the same paper set for a class — which is the
 * whole complaint.
 *
 * The engine IS the LMS exam engine: the response is an ordinary `ExamOut`, so
 * from here questions, marking, publishing and report cards all run on the
 * school screens. The one thing those screens cannot express is "this is for an
 * arrangement, not a class", which is why creation lives here and editing does
 * not — `/teacher/exams/{id}/edit` handles a tuition paper correctly, because
 * its update is a field diff that never touches `class_id`.
 */

const MODES: { value: ExamMode; label: string; hint: string }[] = [
  {
    value: 'ONLINE',
    label: 'Sat online',
    hint: 'The student answers in the app, inside the window you set.',
  },
  {
    value: 'OFFLINE',
    label: 'Handed in',
    hint: 'They work on paper and upload a scan or photo before the deadline.',
  },
]

const SCHEMES: { value: GradingScheme; label: string; hint: string }[] = [
  { value: 'MARKS', label: 'Marks', hint: 'Scored out of a total.' },
  { value: 'GRADE', label: 'Grades', hint: 'Banded — A, B, C — from the percentage.' },
]

function num(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

const DEFAULT_BANDS: TuitionGradeBand[] = [
  { grade: 'A', min_percentage: 80 },
  { grade: 'B', min_percentage: 65 },
  { grade: 'C', min_percentage: 50 },
  { grade: 'D', min_percentage: 35 },
]

export default function TuitionAssessmentFormPage() {
  const navigate = useNavigate()
  const create = useCreateTuitionAssessment()
  const enrollments = useMyTuitionStudents(false)

  const [enrollmentId, setEnrollmentId] = React.useState('')
  const [category, setCategory] = React.useState<TuitionAssessmentCategory>('HOMEWORK')
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [instructions, setInstructions] = React.useState('')
  const [mode, setMode] = React.useState<ExamMode>('ONLINE')

  const [startsAt, setStartsAt] = React.useState<string | null>(null)
  const [endsAt, setEndsAt] = React.useState<string | null>(null)
  const [duration, setDuration] = React.useState('')
  const [grace, setGrace] = React.useState('0')
  const [lateAllowed, setLateAllowed] = React.useState(true)

  const [scheme, setScheme] = React.useState<GradingScheme>('MARKS')
  const [maxMarks, setMaxMarks] = React.useState('')
  const [passMarks, setPassMarks] = React.useState('')
  const [bands, setBands] = React.useState<TuitionGradeBand[]>(DEFAULT_BANDS)

  const [shuffle, setShuffle] = React.useState(false)
  const [autoGrade, setAutoGrade] = React.useState(true)
  const [maxFiles, setMaxFiles] = React.useState('3')

  const [error, setError] = React.useState<string | null>(null)

  const options = React.useMemo(
    () =>
      (enrollments.data ?? []).map((e) => ({
        value: String(e.id),
        label: e.student?.full_name ?? `Student ${e.student_id}`,
        description: e.subject?.name ?? undefined,
      })),
    [enrollments.data],
  )

  const windowMinutes =
    startsAt && endsAt
      ? (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000
      : null

  const validate = (): string | null => {
    if (!enrollmentId) return 'Pick the student and subject this is for.'
    if (title.trim().length < 2) return 'Give the work a title.'
    if (!startsAt) return 'Say when the window opens.'
    if (!endsAt) return 'Say when the window closes.'
    if (windowMinutes !== null && windowMinutes <= 0) {
      return 'The window closes before it opens.'
    }
    const d = num(duration)
    if (duration.trim() && (d == null || d <= 0 || d > 1440)) {
      return 'Time per student must be between 1 and 1440 minutes, or left blank.'
    }
    // The same check the school form makes: a per-student clock longer than
    // the window itself can never run out, so it silently means nothing.
    if (d != null && windowMinutes !== null && d > windowMinutes) {
      return 'Time per student is longer than the window it sits inside.'
    }
    const max = num(maxMarks)
    const pass = num(passMarks)
    if (max != null && pass != null && pass > max) {
      return 'The pass mark is above the total.'
    }
    return null
  }

  const submit = async () => {
    const problem = validate()
    setError(problem)
    if (problem) return

    try {
      const exam = await create.mutateAsync({
        enrollment_id: Number(enrollmentId),
        category,
        title: title.trim(),
        description: description.trim() || null,
        instructions: instructions.trim() || null,
        mode,
        // Created as a DRAFT, like a class exam: a paper with no questions is
        // not something a student should be able to open.
        status: 'DRAFT',
        starts_at: startsAt as string,
        ends_at: endsAt as string,
        duration_minutes: num(duration),
        upload_grace_minutes: num(grace) ?? 0,
        late_submission_allowed: lateAllowed,
        grading_scheme: scheme,
        // Null lets the engine total the questions itself, which is right
        // until somebody deliberately overrides it.
        max_marks: num(maxMarks),
        pass_marks: num(passMarks),
        grade_bands: scheme === 'GRADE' ? bands : undefined,
        shuffle_questions: shuffle,
        auto_grade_objective: autoGrade,
        max_upload_files: num(maxFiles) ?? 3,
      })
      // Straight to the paper: it has no questions yet, and that is the next
      // thing that has to happen for anybody to sit it.
      navigate(`/teacher/exams/${exam.id}`)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not set the work.')
    }
  }

  return (
    <FormPage
      eyebrow="Online tuition"
      title="Set work"
      description="Homework, an assignment or an exam for one student. It runs on the same engine as a class exam — questions, timed windows, auto-marking and publishing all behave identically."
      backTo="/tuition/teacher/assessments"
      backLabel="Back to homework & exams"
      error={<FormError message={error} />}
      aside={
        <Card className="space-y-3 p-5">
          <h3 className="text-sm font-semibold">What happens next</h3>
          <ol className="space-y-2.5 text-xs leading-relaxed text-muted-foreground">
            <li>
              <strong className="text-foreground">1.</strong> This saves as a draft and opens
              the paper.
            </li>
            <li>
              <strong className="text-foreground">2.</strong> Add questions and the answer
              key. A paper with no questions cannot be sat.
            </li>
            <li>
              <strong className="text-foreground">3.</strong> Publish it. The student sees it
              when the window opens.
            </li>
            <li>
              <strong className="text-foreground">4.</strong> Mark the script, then release
              the result.
            </li>
          </ol>
        </Card>
      }
      footer={
        <FormActions
          cancelTo="/tuition/teacher/assessments"
          submitLabel="Create and add questions"
          submitIcon={<Save />}
          loading={create.isPending}
          onSubmit={submit}
        />
      }
    >
      <FormSection
        icon={<ClipboardCheck />}
        title="What"
        description="Who it is for, and what kind of work it is."
        columns={3}
      >
        <Field
          id="ta-enrollment"
          label="Student and subject"
          required
          hint="One arrangement — a tuition paper is set for a student, not a class."
        >
          <Combobox
            options={options}
            value={enrollmentId}
            onChange={setEnrollmentId}
            placeholder="Search your students…"
          />
        </Field>

        <Field id="ta-category" label="Kind of work">
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as TuitionAssessmentCategory)}
          >
            <SelectTrigger id="ta-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSESSMENT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {ASSESSMENT_CATEGORY_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          id="ta-mode"
          label="How it is sat"
          hint={MODES.find((m) => m.value === mode)?.hint}
        >
          <Select value={mode} onValueChange={(v) => setMode(v as ExamMode)}>
            <SelectTrigger id="ta-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field id="ta-title" label="Title" required className="lg:col-span-3">
          <Input
            id="ta-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Exercise 4.2 — quadratic equations"
          />
        </Field>

        <Field
          id="ta-description"
          label="Description"
          hint="A line for your own records."
          className="lg:col-span-3"
        >
          <Input
            id="ta-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <Field
          id="ta-instructions"
          label="Instructions for the student"
          hint="Shown before they start."
          className="lg:col-span-3"
        >
          <Textarea
            id="ta-instructions"
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection
        icon={<CalendarClock />}
        title="When"
        description="The window it can be sat in, and how long the student gets inside it."
        columns={3}
      >
        <Field id="ta-starts" label="Opens" required hint="Shown in the student's own timezone.">
          <DateTimePicker value={startsAt} onChange={setStartsAt} />
        </Field>

        <Field id="ta-ends" label="Closes" required>
          <DateTimePicker value={endsAt} onChange={setEndsAt} />
        </Field>

        <Field
          id="ta-duration"
          label="Time per student"
          hint="Minutes from when they press start. Blank means the whole window."
        >
          <Input
            id="ta-duration"
            type="number"
            min={1}
            max={1440}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </Field>

        <Field
          id="ta-grace"
          label="Uploading concession"
          hint="Minutes past the deadline a hand-in is still accepted, flagged late."
        >
          <Input
            id="ta-grace"
            type="number"
            min={0}
            value={grace}
            onChange={(e) => setGrace(e.target.value)}
          />
        </Field>

        <Field id="ta-late" label="Late hand-in" className="lg:col-span-2">
          <label className="flex h-9.5 items-center justify-between gap-4 rounded-md border border-input bg-card px-3.5">
            <span className="text-sm">
              {lateAllowed ? 'Accepted, and flagged late' : 'Refused once the window closes'}
            </span>
            <Switch checked={lateAllowed} onCheckedChange={setLateAllowed} />
          </label>
        </Field>
      </FormSection>

      <FormSection
        icon={<SlidersHorizontal />}
        title="Marking"
        description="How the work is scored."
        columns={3}
      >
        <Field
          id="ta-scheme"
          label="Scored as"
          hint={SCHEMES.find((s) => s.value === scheme)?.hint}
        >
          <Select value={scheme} onValueChange={(v) => setScheme(v as GradingScheme)}>
            <SelectTrigger id="ta-scheme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCHEMES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          id="ta-max"
          label="Out of"
          hint="Blank totals the questions instead."
        >
          <Input
            id="ta-max"
            type="number"
            min={0}
            step="0.5"
            value={maxMarks}
            onChange={(e) => setMaxMarks(e.target.value)}
          />
        </Field>

        <Field id="ta-pass" label="Pass mark" hint="Optional.">
          <Input
            id="ta-pass"
            type="number"
            min={0}
            step="0.5"
            value={passMarks}
            onChange={(e) => setPassMarks(e.target.value)}
          />
        </Field>

        {/* Only meaningful under the banded scheme — under MARKS the engine
            never consults them, so showing the editor would imply they matter. */}
        {scheme === 'GRADE' && (
          <div className="space-y-3 lg:col-span-3">
            <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
              Grade bands
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {bands.map((band, index) => (
                <div key={index} className="flex items-end gap-2">
                  <Field id={`ta-band-${index}`} label="Grade" className="flex-1">
                    <Input
                      id={`ta-band-${index}`}
                      value={band.grade}
                      onChange={(e) =>
                        setBands((prev) =>
                          prev.map((b, i) => (i === index ? { ...b, grade: e.target.value } : b)),
                        )
                      }
                    />
                  </Field>
                  <Field id={`ta-band-min-${index}`} label="From %" className="flex-1">
                    <Input
                      id={`ta-band-min-${index}`}
                      type="number"
                      min={0}
                      max={100}
                      value={String(band.min_percentage)}
                      onChange={(e) =>
                        setBands((prev) =>
                          prev.map((b, i) =>
                            i === index
                              ? { ...b, min_percentage: Number(e.target.value) || 0 }
                              : b,
                          ),
                        )
                      }
                    />
                  </Field>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBands((prev) => [...prev, { grade: '', min_percentage: 0 }])}
            >
              Add a band
            </Button>
          </div>
        )}
      </FormSection>

      <FormSection icon={<Settings2 />} title="Options" columns={3}>
        <Field id="ta-shuffle" label="Question order">
          <label className="flex h-9.5 items-center justify-between gap-4 rounded-md border border-input bg-card px-3.5">
            <span className="text-sm">{shuffle ? 'Shuffled' : 'As written'}</span>
            <Switch checked={shuffle} onCheckedChange={setShuffle} />
          </label>
        </Field>

        <Field
          id="ta-auto"
          label="Objective questions"
          hint="Multiple choice and true/false mark themselves against the answer key."
        >
          <label className="flex h-9.5 items-center justify-between gap-4 rounded-md border border-input bg-card px-3.5">
            <span className="text-sm">{autoGrade ? 'Marked automatically' : 'Marked by hand'}</span>
            <Switch checked={autoGrade} onCheckedChange={setAutoGrade} />
          </label>
        </Field>

        {/* Only reached on an OFFLINE paper — an online one is answered in the
            app and has nothing to upload. */}
        {mode === 'OFFLINE' && (
          <Field
            id="ta-files"
            label="Files they may upload"
            hint="Scans of a long answer often run to several pages."
          >
            <Input
              id="ta-files"
              type="number"
              min={1}
              value={maxFiles}
              onChange={(e) => setMaxFiles(e.target.value)}
            />
          </Field>
        )}
      </FormSection>
    </FormPage>
  )
}

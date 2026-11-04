import { ArrowLeft, FilePlus2, Save, Trash2, TriangleAlert } from 'lucide-react'
import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { ApiError } from '@/api/errors'
import type { PaperMarkSheet, PaperMarkSheetSave, PaperMarksRegister } from '@/api/types'
import { useDeletePaperMarks, usePaperMarks, useSavePaperMarks } from '@/queries/exam.queries'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime, todayApiDate } from '@/lib/datetime'
import { formatPercent } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/feedback/states'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field } from '@/components/forms/field'
import { PageHeader } from '@/components/layout/page-header'
import { useExamCatalogue, useExamScope } from './exam-scope'

/**
 * Marks for exams held on paper.
 *
 * Most term exams are written in the hall, not in the LMS, so there is no exam
 * for a report card to read. The class teacher keeps this register instead:
 * one sheet per exam, a column per subject with what it is out of, a row per
 * student. Report cards count every sheet whose date falls in their period.
 *
 * An empty box means the student did not sit that paper. It is never saved as
 * a zero, and the report card lists the paper as not sat.
 */

const NEW = '__new__'
const SUGGESTED_NAMES = ['Unit Test 1', 'Unit Test 2', 'Mid-term Examination', 'Term 1 Examination', 'Term 2 Examination', 'Annual Examination']

const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()
const cellKey = (subjectId: number, studentId: number) => `${subjectId}:${studentId}`
const isAbsent = (raw: string) => raw.trim() === '' || /^ab$/i.test(raw.trim())

/** What the form holds for one sheet. Everything is a string while it is being typed. */
interface FormState {
  name: string
  date: string | null
  /** The subjects the exam had, each a column of the grid. */
  chosen: number[]
  outOf: Record<number, string>
  marks: Record<string, string>
}

/** A new exam starts with every subject taught in the class ticked: a term exam covers them all. */
function formFor(sheet: PaperMarkSheet | null, register: PaperMarksRegister): FormState {
  const outOf: Record<number, string> = {}
  const marks: Record<string, string> = {}
  for (const subject of sheet?.subjects ?? []) {
    if (subject.max_marks != null) outOf[subject.subject_id] = String(subject.max_marks)
    for (const [studentId, value] of Object.entries(subject.marks)) {
      marks[cellKey(subject.subject_id, Number(studentId))] = String(value)
    }
  }
  for (const subject of [...register.subjects, ...register.other_subjects]) outOf[subject.id] ??= '100'
  return {
    name: sheet?.exam_name ?? '',
    date: sheet?.conducted_on ?? todayApiDate(),
    chosen: sheet ? sheet.subjects.map((s) => s.subject_id) : register.subjects.map((s) => s.id),
    outOf,
    marks,
  }
}

function SectionBar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-y border-border bg-muted/70 px-4 py-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}

function SheetList({
  sheets,
  register,
  selected,
  onOpen,
}: {
  sheets: PaperMarkSheet[]
  register: PaperMarksRegister
  selected: string
  onOpen: (name: string) => void
}) {
  const subjectName = (id: number) => register.subjects.find((s) => s.id === id)?.name ?? 'Subject'
  if (sheets.length === 0) {
    return <p className="px-4 py-4 text-sm text-muted-foreground">No marks entered for this class yet. Fill in the sheet below to add the first exam.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">Exam</th>
            <th className="px-3 py-2 font-medium">Date written</th>
            <th className="px-3 py-2 font-medium">Subjects</th>
            <th className="px-3 py-2 font-medium">Entered by</th>
            <th className="px-3 py-2 font-medium">Last changed</th>
            <th className="w-24 px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {sheets.map((sheet) => {
            const open = sheet.exam_name === selected
            return (
              <tr key={sheet.exam_name} className={cn('border-b border-border last:border-b-0', open && 'bg-primary/5')}>
                <td className="px-4 py-2 font-medium">{sheet.exam_name}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatDate(sheet.conducted_on)}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {sheet.subjects
                    .map((s) => subjectName(s.subject_id))
                    .sort()
                    .join(', ')}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{sheet.entered_by.join(', ') || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {sheet.updated_at ? formatDateTime(sheet.updated_at) : '—'}
                </td>
                <td className="px-4 py-1.5 text-right">
                  {open ? (
                    <span className="text-xs font-medium text-primary">Open below</span>
                  ) : (
                    <Button variant="outline" size="xs" onClick={() => onOpen(sheet.exam_name)}>
                      Open
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MarkSheet({
  register,
  sheet,
  onSaved,
  onDeleted,
  onDirtyChange,
}: {
  register: PaperMarksRegister
  sheet: PaperMarkSheet | null
  onSaved: (name: string) => void
  onDeleted: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const save = useSavePaperMarks()
  const remove = useDeletePaperMarks()
  const initial = React.useMemo(() => formFor(sheet, register), [sheet, register])
  const [form, setForm] = React.useState<FormState>(initial)
  const [error, setError] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const tableRef = React.useRef<HTMLTableElement>(null)

  // A fresh sheet, or the same sheet as saved, replaces what is on screen.
  React.useEffect(() => {
    setForm(initial)
    setError(null)
  }, [initial])

  const { students } = register

  // The class's subjects first, then any other subject of the school added to this exam.
  const offered = React.useMemo(() => {
    const extra = register.other_subjects.filter((s) => form.chosen.includes(s.id))
    return [...register.subjects, ...extra]
  }, [register, form.chosen])
  const columns = offered.filter((s) => form.chosen.includes(s.id))
  const addable = register.other_subjects.filter((s) => !form.chosen.includes(s.id))

  const dirty = React.useMemo(() => {
    if (form.name.trim() !== initial.name || form.date !== initial.date) return true
    if ([...form.chosen].sort().join() !== [...initial.chosen].sort().join()) return true
    if (form.chosen.some((id) => Number(form.outOf[id]) !== Number(initial.outOf[id]))) return true
    for (const id of form.chosen) {
      for (const st of students) {
        const now = (form.marks[cellKey(id, st.id)] ?? '').trim()
        const before = initial.marks[cellKey(id, st.id)] ?? ''
        if (isAbsent(now) ? before !== '' : before === '' || Number(now) !== Number(before)) return true
      }
    }
    return false
  }, [form, initial, students])

  React.useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  // ------------------------------------------------------------ checking
  const outOf = (subjectId: number) => Number(form.outOf[subjectId])
  const mark = (subjectId: number, studentId: number) => form.marks[cellKey(subjectId, studentId)] ?? ''
  const badCell = (subjectId: number, studentId: number) => {
    const raw = mark(subjectId, studentId)
    if (isAbsent(raw)) return false
    const value = Number(raw)
    const max = outOf(subjectId)
    return !Number.isFinite(value) || value < 0 || (max > 0 && value > max)
  }
  const badOutOf = columns.filter((s) => !(outOf(s.id) > 0))
  const badCells = columns.flatMap((s) => students.filter((st) => badCell(s.id, st.id)).map((st) => ({ s, st })))
  const anyMark = columns.some((s) => students.some((st) => !isAbsent(mark(s.id, st.id))))
  const clash = register.sheets.find((other) => sameName(other.exam_name, form.name) && other.exam_name !== sheet?.exam_name)
  // Saved marks in a subject that has just been unticked: saving removes them.
  const dropping = (sheet?.subjects ?? [])
    .filter((s) => !form.chosen.includes(s.subject_id) && Object.keys(s.marks).length > 0)
    .map((s) => offered.find((o) => o.id === s.subject_id)?.name ?? register.subjects.find((o) => o.id === s.subject_id)?.name ?? 'a subject')

  const problem = !form.name.trim()
    ? 'Give the exam a name, such as Term 1 Examination.'
    : clash
      ? `This class already has marks for “${clash.exam_name}”. Open it from the list above, or use a different name.`
      : !form.date
        ? 'Enter the date the exam was written.'
        : columns.length === 0
          ? 'Tick at least one subject this exam had.'
          : badOutOf.length > 0
            ? `Enter what ${badOutOf.map((s) => s.name).join(', ')} ${badOutOf.length === 1 ? 'is' : 'are'} out of.`
            : badCells.length > 0
              ? `${badCells[0].st.full_name}’s mark in ${badCells[0].s.name} must be a number from 0 to ${outOf(badCells[0].s.id) || '…'}${badCells.length > 1 ? `, and ${badCells.length - 1} more mark${badCells.length === 2 ? '' : 's'} need checking` : ''}.`
              : !anyMark
                ? sheet
                  ? 'Every mark is empty. To remove this exam, use Delete instead.'
                  : 'Enter at least one mark.'
                : null

  const toggleSubject = (subjectId: number, on: boolean) =>
    setForm((f) => ({
      ...f,
      chosen: on ? [...f.chosen.filter((id) => id !== subjectId), subjectId] : f.chosen.filter((id) => id !== subjectId),
    }))

  // ------------------------------------------------------------ totals
  const totals = (studentId: number) => {
    let got = 0
    let max = 0
    let papers = 0
    for (const s of columns) {
      const raw = mark(s.id, studentId)
      if (isAbsent(raw) || badCell(s.id, studentId) || !(outOf(s.id) > 0)) continue
      got += Number(raw)
      max += outOf(s.id)
      papers += 1
    }
    return { got, max, papers }
  }
  const columnStats = (subjectId: number) => {
    const values = students.map((st) => mark(subjectId, st.id)).filter((raw) => !isAbsent(raw)).map(Number).filter(Number.isFinite)
    const max = outOf(subjectId)
    return {
      entered: values.length,
      average: values.length && max > 0 ? (values.reduce((a, b) => a + b, 0) / values.length / max) * 100 : null,
    }
  }

  // ------------------------------------------------------------ actions
  const setMark = (subjectId: number, studentId: number, value: string) =>
    setForm((f) => ({ ...f, marks: { ...f.marks, [cellKey(subjectId, studentId)]: value } }))

  /** Enter moves down the column, as in a paper mark register; Shift+Enter moves up. */
  const onCellKey = (event: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const next = tableRef.current?.querySelector<HTMLInputElement>(`input[data-cell="${row + (event.shiftKey ? -1 : 1)}:${col}"]`)
    next?.focus()
    next?.select()
  }

  const submit = async () => {
    if (problem) return setError(problem)
    setError(null)
    const body: PaperMarkSheetSave = {
      class_id: register.class_id,
      exam_name: form.name.trim().replace(/\s+/g, ' '),
      previous_exam_name: sheet?.exam_name ?? null,
      conducted_on: form.date as string,
      subjects: columns.map((s) => ({
        subject_id: s.id,
        max_marks: outOf(s.id),
        marks: students.map((st) => ({
          student_id: st.id,
          marks_obtained: isAbsent(mark(s.id, st.id)) ? null : Number(mark(s.id, st.id)),
        })),
      })),
    }
    try {
      const result = await save.mutateAsync(body)
      onSaved(result.sheet.exam_name)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The marks could not be saved. Please try again.')
    }
  }

  const numberCell = 'px-2 py-1 text-right tabular-nums'

  return (
    <>
      <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_200px]">
        <Field id="pm-name" label="Exam" required hint="The name printed on the report card, e.g. Term 1 Examination.">
          <Input
            id="pm-name"
            list="pm-names"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Term 1 Examination"
          />
          <datalist id="pm-names">
            {SUGGESTED_NAMES.filter((n) => !register.sheets.some((s) => sameName(s.exam_name, n))).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
        <Field id="pm-date" label="Date written" required hint="Report cards count it by this date.">
          <DatePicker id="pm-date" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} maxToday />
        </Field>
      </div>

      <SectionBar title="Subjects in this exam">
        <span className="text-xs text-muted-foreground">Tick the subjects this exam had. Each one becomes a column below.</span>
      </SectionBar>
      <div className="space-y-3 p-4">
        {offered.length === 0 && addable.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            The school has no subjects set up yet. An administrator adds them under Subjects.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
            {offered.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={form.chosen.includes(s.id)} onCheckedChange={(v) => toggleSubject(s.id, v === true)} />
                <span className={cn(!form.chosen.includes(s.id) && 'text-muted-foreground')}>{s.name}</span>
              </label>
            ))}
            {addable.length > 0 && (
              <div className="w-64">
                <Combobox
                  value={null}
                  onChange={(v) => v && toggleSubject(Number(v), true)}
                  placeholder={offered.length === 0 ? 'Choose a subject' : 'Add a subject not taught in this class'}
                  searchPlaceholder="Type a subject…"
                  emptyMessage="No subject matches."
                  options={addable.map((s) => ({ value: String(s.id), label: s.name, hint: s.code }))}
                />
              </div>
            )}
          </div>
        )}
        {dropping.length > 0 && (
          <p className="flex items-start gap-2 text-sm text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            The marks already saved for {dropping.join(', ')} will be removed when you save, because{' '}
            {dropping.length === 1 ? 'it is' : 'they are'} no longer ticked.
          </p>
        )}
      </div>

      <SectionBar title="Marks">
        <span className="text-xs text-muted-foreground">
          Leave a box empty (or type AB) if the student was absent. It is never counted as zero. Enter moves down.
        </span>
      </SectionBar>

      {students.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No students are enrolled in this class.</p>
      ) : columns.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Tick at least one subject above to enter its marks.</p>
      ) : (
        <div className="max-h-[65vh] overflow-auto">
          <table ref={tableRef} className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20 bg-card">
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="sticky left-0 z-30 w-14 bg-card px-3 py-2 font-medium">Roll</th>
                <th className="sticky left-14 z-30 min-w-44 border-r border-border bg-card px-3 py-2 font-medium">Student</th>
                {columns.map((s) => (
                  <th key={s.id} className="min-w-24 border-r border-border px-2 py-2 text-right font-medium" title={s.name}>
                    <span className="block truncate">{s.name}</span>
                  </th>
                ))}
                <th className="min-w-28 px-3 py-2 text-right font-medium">Total</th>
                <th className="min-w-16 px-3 py-2 text-right font-medium">%</th>
              </tr>
              <tr className="border-b border-border bg-muted/40 text-xs">
                <td className="sticky left-0 z-30 bg-muted px-3 py-1" />
                <td className="sticky left-14 z-30 border-r border-border bg-muted px-3 py-1 text-right font-medium text-muted-foreground">
                  Out of
                </td>
                {columns.map((s) => (
                  <td key={s.id} className="border-r border-border px-2 py-1">
                    <Input
                      aria-label={`${s.name} is out of`}
                      inputMode="decimal"
                      value={form.outOf[s.id] ?? ''}
                      invalid={badOutOf.some((b) => b.id === s.id)}
                      onChange={(e) => setForm((f) => ({ ...f, outOf: { ...f.outOf, [s.id]: e.target.value } }))}
                      className="h-7 px-2 text-right font-semibold tabular-nums"
                    />
                  </td>
                ))}
                <td colSpan={2} />
              </tr>
            </thead>
            <tbody>
              {students.map((st, row) => {
                const t = totals(st.id)
                return (
                  <tr key={st.id} className="border-b border-border hover:bg-muted/30">
                    <td className="sticky left-0 z-10 bg-card px-3 py-1 tabular-nums text-muted-foreground">{st.roll_number ?? '—'}</td>
                    <td className="sticky left-14 z-10 border-r border-border bg-card px-3 py-1">
                      <span className="block truncate font-medium">{st.full_name}</span>
                    </td>
                    {columns.map((s, col) => {
                      const raw = mark(s.id, st.id)
                      return (
                        <td key={s.id} className="border-r border-border px-2 py-1">
                          <Input
                            data-cell={`${row}:${col}`}
                            aria-label={`${st.full_name}, ${s.name}`}
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="AB"
                            value={raw}
                            invalid={badCell(s.id, st.id)}
                            onChange={(e) => setMark(s.id, st.id, e.target.value)}
                            onKeyDown={(e) => onCellKey(e, row, col)}
                            className="h-7 px-2 text-right tabular-nums placeholder:text-muted-foreground/40"
                          />
                        </td>
                      )
                    })}
                    <td className={cn(numberCell, 'px-3 font-medium')}>
                      {t.papers > 0 ? (
                        <>
                          {+t.got.toFixed(2)}
                          <span className="font-normal text-muted-foreground"> / {+t.max.toFixed(2)}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={cn(numberCell, 'px-3')}>{t.max > 0 ? formatPercent((t.got / t.max) * 100, 1) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 bg-muted text-xs">
              <tr className="border-t border-border">
                <td className="sticky left-0 z-30 bg-muted px-3 py-1.5" />
                <td className="sticky left-14 z-30 border-r border-border bg-muted px-3 py-1.5 text-right font-medium text-muted-foreground">
                  Entered · class average
                </td>
                {columns.map((s) => {
                  const c = columnStats(s.id)
                  return (
                    <td key={s.id} className="border-r border-border px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {c.entered}/{students.length}
                      {c.average != null && <span className="block font-medium text-foreground">{formatPercent(c.average, 0)}</span>}
                    </td>
                  )
                })}
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-3">
        <div className="min-w-0 flex-1 text-sm">
          {error ? (
            <p className="flex items-start gap-2 text-danger" role="alert">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : dirty ? (
            <p className="text-warning">Unsaved changes.</p>
          ) : sheet ? (
            <p className="text-muted-foreground">Saved. These marks count on the next report card issued for this class.</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          {sheet && (
            <Button variant="ghost" icon={<Trash2 />} className="text-danger hover:bg-danger/10" onClick={() => setDeleting(true)}>
              Delete
            </Button>
          )}
          <Button variant="primary" icon={<Save />} loading={save.isPending} disabled={!dirty && !!sheet} onClick={submit}>
            Save marks
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete the marks for ${sheet?.exam_name ?? 'this exam'}?`}
        description="Every mark on this sheet is removed, for every subject. Report cards already issued keep the marks they were issued with; re-issue them to leave this exam off."
        confirmLabel="Delete marks"
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          if (!sheet) return
          remove.mutate(
            { classId: register.class_id, examName: sheet.exam_name },
            {
              onSuccess: () => {
                setDeleting(false)
                onDeleted()
              },
            },
          )
        }}
      />
    </>
  )
}

export default function PaperMarksPage() {
  const scope = useExamScope()
  const catalogue = useExamCatalogue()
  const [params, setParams] = useSearchParams()
  const [dirty, setDirty] = React.useState(false)
  const [pending, setPending] = React.useState<{ classId: string | null; exam: string } | null>(null)

  const classes = catalogue.leadableClasses
  const classParam = params.get('class')
  const classId = classParam ?? (classes.length === 1 ? String(classes[0].id) : null)
  const register = usePaperMarks(classId ? Number(classId) : null)

  const sheets = register.data?.sheets ?? []
  const examParam = params.get('exam')
  const selected = examParam && sheets.some((s) => s.exam_name === examParam) ? examParam : NEW
  const sheet = sheets.find((s) => s.exam_name === selected) ?? null

  const go = React.useCallback(
    (next: { classId: string | null; exam: string }) => {
      const search = new URLSearchParams()
      if (next.classId) search.set('class', next.classId)
      if (next.exam !== NEW) search.set('exam', next.exam)
      setParams(search, { replace: true })
    },
    [setParams],
  )
  const ask = (next: { classId: string | null; exam: string }) => (dirty ? setPending(next) : go(next))
  const onDirtyChange = React.useCallback((d: boolean) => setDirty(d), [])

  const className = classes.find((c) => String(c.id) === classId)?.name ?? register.data?.class_room?.name ?? ''

  return (
    <div>
      <PageHeader
        title="Offline exam marks"
        description="Marks for exams held offline, written on paper in school rather than in the LMS. Enter them here and they count on the class’s report cards."
        actions={
          <Button asChild variant="outline">
            <Link to={scope.reportCardsPath}>
              <ArrowLeft className="size-4" />
              Report cards
            </Link>
          </Button>
        }
      />

      {!catalogue.isPending && classes.length === 0 ? (
        <div className="flex items-start gap-3 rounded-md border border-info/30 bg-info/8 p-4 text-sm text-muted-foreground">
          Marks for offline exams are entered by a class’s class teacher, and you do not lead a class. Ask an administrator
          to assign you.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <SectionBar title="Class" />
          <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,320px)]">
            <Field id="pm-class" label="Class">
              <Combobox
                id="pm-class"
                value={classId}
                onChange={(v) => ask({ classId: v, exam: NEW })}
                placeholder={catalogue.isPending ? 'Loading…' : 'Select a class'}
                options={classes.map((c) => ({ value: String(c.id), label: c.name, hint: c.code }))}
              />
            </Field>
          </div>

          {!classId ? null : register.isPending ? (
            <div className="space-y-2 border-t border-border p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : register.isError || !register.data ? (
            <div className="border-t border-border p-4">
              <ErrorState error={register.error} onRetry={() => register.refetch()} />
            </div>
          ) : (
            <>
              <SectionBar title={`Exams entered for ${className}`}>
                <Button variant="outline" size="xs" icon={<FilePlus2 />} disabled={selected === NEW} onClick={() => ask({ classId, exam: NEW })}>
                  New exam
                </Button>
              </SectionBar>
              <SheetList sheets={sheets} register={register.data} selected={selected} onOpen={(name) => ask({ classId, exam: name })} />

              <SectionBar title={sheet ? sheet.exam_name : 'New exam'}>
                {sheet ? (
                  <Badge tone="neutral" size="sm">
                    Written {formatDate(sheet.conducted_on)}
                  </Badge>
                ) : null}
              </SectionBar>
              <MarkSheet
                key={`${classId}|${selected}`}
                register={register.data}
                sheet={sheet}
                onDirtyChange={onDirtyChange}
                onSaved={(name) => go({ classId, exam: name })}
                onDeleted={() => go({ classId, exam: NEW })}
              />
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        title="Leave without saving?"
        description="The marks you have typed on this sheet have not been saved."
        confirmLabel="Leave without saving"
        destructive
        onConfirm={() => {
          if (pending) go(pending)
          setPending(null)
          setDirty(false)
        }}
      />
    </div>
  )
}

import { FileText, Plus, Trash2, TriangleAlert, UserRoundCog } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import type { ExamGradeOut, GradeEntryCreate } from '@/api/types'
import {
  useClassStudents,
  useCreateGrade,
  useDeleteGrade,
  useMyClasses,
  useTeacherGrades,
  useUpdateGrade,
} from '@/queries/teacher.queries'
import { cn } from '@/lib/cn'
import { useAuth } from '@/providers/auth-provider'
import { buildGradebook, gradeDistribution } from '@/lib/derive'
import { formatPercent, performanceTone } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BarSeries } from '@/components/charts/charts'
import { ChartCard } from '@/components/charts/chart-card'
import { Avatar } from '@/components/ui/avatar'
import { BatchProgress, useBatchRunner } from '@/components/feedback/batch-progress'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field } from '@/components/forms/field'
import { Textarea } from '@/components/ui/input'
import { PageHeader } from '@/components/layout/page-header'
import { ClassSubjectPicker, useClassSubjectSelection } from './class-subject-picker'
import { AdminTeacherNotice, useIsAdminViewingTeacher } from './teacher-guard'

/** Colour scale for a percentage cell — dense but still readable. */
function cellTone(percent: number): string {
  if (percent >= 85) return 'bg-success/18 text-success'
  if (percent >= 70) return 'bg-info/15 text-info'
  if (percent >= 55) return 'bg-primary/12 text-primary'
  if (percent >= 40) return 'bg-warning/18 text-warning'
  return 'bg-danger/15 text-danger'
}

interface EntryRow {
  studentId: number
  name: string
  marks: string
}

function ExamEntryDialog({
  open,
  onOpenChange,
  classId,
  subjectId,
  roster,
  knownExams,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  classId: number
  subjectId: number
  roster: { id: number; full_name: string }[]
  knownExams: string[]
}) {
  const createGrade = useCreateGrade()
  const batch = useBatchRunner<GradeEntryCreate>()

  const [examName, setExamName] = React.useState('')
  const [maxMarks, setMaxMarks] = React.useState('100')
  const [rows, setRows] = React.useState<EntryRow[]>([])

  React.useEffect(() => {
    if (open) {
      setExamName('')
      setMaxMarks('100')
      setRows(roster.map((s) => ({ studentId: s.id, name: s.full_name, marks: '' })))
      batch.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roster])

  const max = Number(maxMarks)
  const filled = rows.filter((r) => r.marks.trim() !== '')

  // The backend validates none of this, so the client has to.
  const invalid = filled.filter((r) => {
    const value = Number(r.marks)
    return Number.isNaN(value) || value < 0 || value > max
  })

  const ready = examName.trim().length > 1 && max > 0 && filled.length > 0 && invalid.length === 0

  const submit = async () => {
    if (!ready) return

    const entries = filled.map((row) => ({
      key: String(row.studentId),
      label: `${row.name} — ${row.marks}/${max}`,
      payload: {
        student_id: row.studentId,
        class_id: classId,
        subject_id: subjectId,
        exam_name: examName.trim(),
        marks_obtained: Number(row.marks),
        max_marks: max,
        remarks: null,
      } satisfies GradeEntryCreate,
    }))

    // No batch endpoint exists, so grades go one request at a time.
    const { succeeded, failed } = await batch.run(entries, (payload) => createGrade.mutateAsync(payload))

    if (failed === 0) {
      toast.success(`Recorded ${succeeded} ${succeeded === 1 ? 'grade' : 'grades'} for ${examName.trim()}`)
      onOpenChange(false)
    } else {
      toast.warning(`${succeeded} saved, ${failed} failed. Only the failed students need re-entering.`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !batch.running && onOpenChange(v)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Record exam marks</DialogTitle>
          <DialogDescription>
            Enter marks for the whole class in one pass. Leave a student blank to skip them.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field id="exam-name" label="Exam name" required>
              <Input
                id="exam-name"
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                placeholder="Midterm Exam 1"
                list="known-exams"
              />
              <datalist id="known-exams">
                {knownExams.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </Field>
            <Field id="max-marks" label="Out of" required>
              <Input
                id="max-marks"
                type="number"
                min={1}
                value={maxMarks}
                onChange={(e) => setMaxMarks(e.target.value)}
              />
            </Field>
          </div>

          {invalid.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2.5 text-xs text-danger">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {invalid.length} {invalid.length === 1 ? 'mark is' : 'marks are'} outside 0–{max || '?'}.
              </span>
            </div>
          )}

          <div className="rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-muted-foreground">
              <span>{roster.length} students</span>
              <span>
                {filled.length} entered
              </span>
            </div>
            <ul className="max-h-72 divide-y divide-border/70 overflow-y-auto">
              {rows.map((row, index) => {
                const value = Number(row.marks)
                const bad = row.marks.trim() !== '' && (Number.isNaN(value) || value < 0 || value > max)
                return (
                  <li key={row.studentId} className="flex items-center gap-3 px-3 py-2">
                    <Avatar name={row.name} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={max}
                      value={row.marks}
                      invalid={bad}
                      placeholder="—"
                      className="h-8 w-24 text-right"
                      aria-label={`Marks for ${row.name}`}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) => (i === index ? { ...r, marks: e.target.value } : r)),
                        )
                      }
                    />
                    <span className="w-12 text-xs text-muted-foreground">
                      {row.marks.trim() !== '' && !bad && max > 0
                        ? formatPercent((value / max) * 100, 0)
                        : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>

          <BatchProgress items={batch.items} percent={batch.percent} done={batch.done} total={batch.total} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={batch.running}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready} loading={batch.running} onClick={submit}>
            Save {filled.length > 0 ? `${filled.length} ` : ''}grades
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Corrects a single mark.
 *
 * The backend re-validates against the MERGED record, so sending only
 * `marks_obtained` is still checked against the stored `max_marks`. We mirror
 * that rule here to catch it before the round-trip, but the server stays the
 * authority — its 400 is surfaced verbatim if the two ever disagree.
 */
function EditGradeDialog({
  grade,
  onClose,
  onRequestDelete,
}: {
  grade: ExamGradeOut | null
  onClose: () => void
  onRequestDelete: (grade: ExamGradeOut) => void
}) {
  const updateGrade = useUpdateGrade()
  const [marks, setMarks] = React.useState('')
  const [maxMarks, setMaxMarks] = React.useState('')
  const [remarks, setRemarks] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!grade) return
    setMarks(String(grade.marks_obtained))
    setMaxMarks(String(grade.max_marks))
    setRemarks(grade.remarks ?? '')
    setError(null)
  }, [grade])

  const marksValue = Number(marks)
  const maxValue = Number(maxMarks)
  const trimmedRemarks = remarks.trim()

  const validationError = React.useMemo(() => {
    if (marks.trim() === '' || Number.isNaN(marksValue)) return 'Enter the marks obtained.'
    if (Number.isNaN(maxValue) || maxValue <= 0) return 'The maximum must be greater than zero.'
    if (marksValue < 0) return 'Marks cannot be negative.'
    if (marksValue > maxValue) return `Marks cannot exceed the maximum of ${maxValue}.`
    return null
  }, [marks, marksValue, maxValue])

  const dirty =
    !!grade &&
    (marksValue !== grade.marks_obtained ||
      maxValue !== grade.max_marks ||
      trimmedRemarks !== (grade.remarks ?? ''))

  const submit = async () => {
    if (!grade || validationError || !dirty) return
    setError(null)
    try {
      await updateGrade.mutateAsync({
        gradeId: grade.id,
        body: {
          ...(marksValue !== grade.marks_obtained && { marks_obtained: marksValue }),
          ...(maxValue !== grade.max_marks && { max_marks: maxValue }),
          ...(trimmedRemarks !== (grade.remarks ?? '') && { remarks: trimmedRemarks }),
        },
      })
      onClose()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not update the grade.')
    }
  }

  return (
    <Dialog open={!!grade} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Edit mark</DialogTitle>
          <DialogDescription>
            {grade
              ? `${grade.student?.full_name ?? 'This student'} — ${grade.exam_name}`
              : undefined}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field id="grade-marks" label="Marks obtained" required>
              <Input
                id="grade-marks"
                type="number"
                min={0}
                step="any"
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
              />
            </Field>
            <Field id="grade-max" label="Out of" required>
              <Input
                id="grade-max"
                type="number"
                min={1}
                step="any"
                value={maxMarks}
                onChange={(e) => setMaxMarks(e.target.value)}
              />
            </Field>
          </div>

          {validationError ? (
            <p className="text-xs text-danger">{validationError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {formatPercent((marksValue / maxValue) * 100)} of the maximum.
            </p>
          )}

          <Field id="grade-remarks" label="Remarks">
            <Textarea
              id="grade-remarks"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional feedback the student will see"
            />
          </Field>
        </DialogBody>
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            icon={<Trash2 />}
            className="text-danger hover:bg-danger/10"
            onClick={() => grade && onRequestDelete(grade)}
          >
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={updateGrade.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!!validationError || !dirty}
              loading={updateGrade.isPending}
              onClick={submit}
            >
              Save mark
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function TeacherGradebookPage() {
  const isAdmin = useIsAdminViewingTeacher()
  const myId = useAuth().user?.id
  const mappingsQuery = useMyClasses(!isAdmin)
  const gradesQuery = useTeacherGrades(!isAdmin)
  const selection = useClassSubjectSelection(mappingsQuery.data)
  const rosterQuery = useClassStudents(selection.classId)
  const deleteGrade = useDeleteGrade()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingGrade, setEditingGrade] = React.useState<ExamGradeOut | null>(null)
  const [deletingGrade, setDeletingGrade] = React.useState<ExamGradeOut | null>(null)

  // Stable reference: an inline `?? []` would be a new array every render,
  // and the entry dialog resets its rows whenever this identity changes.
  const roster = React.useMemo(() => rosterQuery.data ?? [], [rosterQuery.data])

  const scopedGrades = React.useMemo(
    () =>
      (gradesQuery.data ?? []).filter(
        (g) => g.class_id === selection.classId && g.subject_id === selection.subjectId,
      ),
    [gradesQuery.data, selection.classId, selection.subjectId],
  )

  const gradebook = React.useMemo(
    () => buildGradebook(scopedGrades, rosterQuery.data ?? []),
    [scopedGrades, rosterQuery.data],
  )

  const distribution = React.useMemo(() => gradeDistribution(scopedGrades), [scopedGrades])

  const knownExams = React.useMemo(
    () => [...new Set((gradesQuery.data ?? []).map((g) => g.exam_name))],
    [gradesQuery.data],
  )

  /**
   * Marks in this view that somebody else entered.
   *
   * Only possible for a class teacher, and only for a class they lead. It is
   * said once above the matrix rather than per cell: a grid of names in every
   * column would drown out the marks, and what the reader needs to know is
   * simply that this table is not exclusively their own work.
   */
  const foreignAuthors = React.useMemo(() => {
    const names = new Map<number, string>()
    for (const g of scopedGrades) {
      if (myId != null && g.teacher_id !== myId) {
        names.set(g.teacher_id, g.teacher?.full_name ?? 'another teacher')
      }
    }
    return [...names.values()]
  }, [scopedGrades, myId])

  if (isAdmin) {
    return (
      <>
        <PageHeader title="Gradebook" description="Exam marks for your classes." />
        <AdminTeacherNotice />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Gradebook"
        description="Marks by student and exam. Percentages use each exam's own maximum."
        actions={
          <Button
            variant="primary"
            icon={<Plus />}
            disabled={!selection.isComplete || (rosterQuery.data ?? []).length === 0}
            onClick={() => setDialogOpen(true)}
          >
            Record exam
          </Button>
        }
      />

      <Card className="mb-5">
        <CardContent className="pt-5">
          <ClassSubjectPicker selection={selection} />
        </CardContent>
      </Card>

      {mappingsQuery.isError ? (
        <ErrorState error={mappingsQuery.error} onRetry={() => mappingsQuery.refetch()} />
      ) : mappingsQuery.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (mappingsQuery.data ?? []).length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="You have no assigned classes"
          description="An administrator needs to assign you to a subject and class first."
        />
      ) : !selection.isComplete ? (
        <EmptyState
          icon={<FileText />}
          title="Choose a class and subject"
          description="Pick which class and subject to view, and the gradebook will load."
        />
      ) : gradesQuery.isPending || rosterQuery.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : gradesQuery.isError ? (
        <ErrorState error={gradesQuery.error} onRetry={() => gradesQuery.refetch()} />
      ) : gradebook.exams.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No exams recorded yet"
          description="Record the first set of marks and the full matrix will appear here."
          action={
            <Button
              variant="primary"
              icon={<Plus />}
              disabled={(rosterQuery.data ?? []).length === 0}
              onClick={() => setDialogOpen(true)}
            >
              Record exam
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {foreignAuthors.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2.5 text-xs">
              <UserRoundCog className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span className="text-muted-foreground">
                Some of these marks were entered by {foreignAuthors.join(', ')}. You can see and
                correct them because you are the class teacher of this class.
              </span>
            </div>
          )}

          <Card className="overflow-hidden">
            <Table containerClassName="max-h-[60vh]">
              <TableHeader sticky>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="sticky left-0 z-20 min-w-52 bg-muted/70 backdrop-blur">Student</TableHead>
                  {gradebook.exams.map((exam) => (
                    <TableHead key={exam} align="center" className="min-w-28">
                      <span className="block truncate" title={exam}>
                        {exam}
                      </span>
                      <span className="block text-2xs font-normal normal-case text-muted-foreground/80">
                        avg {formatPercent(gradebook.examAverages.get(exam) ?? 0, 0)}
                      </span>
                    </TableHead>
                  ))}
                  <TableHead align="right" className="min-w-24">
                    Average
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gradebook.rows.map((row) => (
                  <TableRow key={row.studentId}>
                    <TableCell className="sticky left-0 z-10 bg-card">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={row.name} size="xs" />
                        <span className="truncate text-sm font-medium">{row.name}</span>
                      </div>
                    </TableCell>
                    {gradebook.exams.map((exam) => {
                      const cell = row.cells.get(exam)
                      return (
                        <TableCell key={exam} align="center">
                          {cell ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => setEditingGrade(cell.grade)}
                                  className={cn(
                                    'inline-block min-w-16 rounded-md px-2 py-1 text-xs font-semibold tabular-nums transition-all',
                                    'hover:ring-2 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                                    cellTone(cell.percent),
                                  )}
                                >
                                  {cell.grade.marks_obtained}/{cell.grade.max_marks}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {formatPercent(cell.percent)}
                                {cell.grade.remarks && ` — ${cell.grade.remarks}`}
                                <span className="mt-0.5 block text-2xs opacity-75">
                                  Click to edit or delete
                                </span>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            /* Blank means not graded, never zero. */
                            <span className="text-xs text-muted-foreground/50">not graded</span>
                          )}
                        </TableCell>
                      )
                    })}
                    <TableCell align="right">
                      {row.gradedCount > 0 ? (
                        <Badge tone={performanceTone(row.average) as 'success'} size="sm">
                          {formatPercent(row.average, 0)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <ChartCard
            title="Grade distribution"
            description={`Across ${scopedGrades.length} recorded ${scopedGrades.length === 1 ? 'mark' : 'marks'}.`}
          >
            <BarSeries
              data={distribution.map((b) => ({ band: b.label, Students: b.count }))}
              xKey="band"
              series={[{ key: 'Students', label: 'Marks' }]}
              height={240}
            />
          </ChartCard>
        </div>
      )}

      {selection.isComplete && (
        <ExamEntryDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          classId={selection.classId as number}
          subjectId={selection.subjectId as number}
          // The memoised roster, not an inline `?? []`: a fresh array identity
          // every render would reset the dialog's rows as you type.
          roster={roster}
          knownExams={knownExams}
        />
      )}

      <EditGradeDialog
        grade={editingGrade}
        onClose={() => setEditingGrade(null)}
        onRequestDelete={(grade) => {
          setEditingGrade(null)
          setDeletingGrade(grade)
        }}
      />

      <ConfirmDialog
        open={!!deletingGrade}
        onOpenChange={(v) => !v && setDeletingGrade(null)}
        title="Delete this mark?"
        description={
          deletingGrade
            ? `${deletingGrade.student?.full_name ?? 'This student'}'s mark for “${deletingGrade.exam_name}” will be removed, and their average recalculated without it.`
            : undefined
        }
        confirmLabel="Delete mark"
        destructive
        loading={deleteGrade.isPending}
        onConfirm={() => {
          if (!deletingGrade) return
          deleteGrade.mutate(deletingGrade.id, { onSettled: () => setDeletingGrade(null) })
        }}
      />
    </>
  )
}

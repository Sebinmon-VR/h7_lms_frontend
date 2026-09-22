import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  History,
  Package,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { AcademicTerm, PackageStatusOut, StudentSubjectOut } from '@/api/types'
import {
  useAddStudentSubject,
  useAssignPackage,
  useEndPackageAssignment,
  usePackages,
  useRemoveStudentSubject,
  useStudentPackage,
  useStudentPackageHistory,
  useStudentSubjects,
  useTuitionUsers,
} from '@/queries/tuition.queries'
import { useSubjects } from '@/queries/admin.queries'
import { useAcademicYears } from '@/queries/admissions.queries'
import { formatDate } from '@/lib/datetime'
import {
  BILLING_MODE_LABEL,
  TERMS,
  TERM_LABEL,
  formatMoney,
  packageUsageLabel,
  packageUsagePercent,
} from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Input, Textarea } from '@/components/ui/input'
import { ProgressBar } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * Subjects, one student at a time.
 *
 * The SAME records as the Arrangements screen — these are enrollments — shaped
 * the way the office actually thinks about them: pick a child, see what they
 * take, add or drop one. The arrangements list answers "who teaches what
 * across the programme", which is a different question and a bad fit for the
 * five-second job of adding a subject for a parent on the phone.
 *
 * The thing to be loud about: adding a subject SCHEDULES NOTHING. An
 * arrangement with no weekly slot looks identical to a working one until the
 * first week goes by empty, so every row shows whether classes have actually
 * run and a new one says so outright.
 */

function AddSubjectDialog({
  studentId,
  studentName,
  existing,
  open,
  onOpenChange,
}: {
  studentId: number
  studentName: string
  existing: StudentSubjectOut[]
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const add = useAddStudentSubject()
  const subjects = useSubjects()
  const teachers = useTuitionUsers('TEACHER')

  const [subjectId, setSubjectId] = React.useState('')
  const [teacherId, setTeacherId] = React.useState('')
  const [duration, setDuration] = React.useState('')
  const [startDate, setStartDate] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setSubjectId('')
    setTeacherId('')
    setDuration('')
    setStartDate('')
    setNotes('')
    setError(null)
  }, [open])

  // A subject the student already takes would be a 409, so it is not offered.
  const taken = new Set(existing.filter((s) => s.status === 'ACTIVE').map((s) => s.subject_id))
  const subjectOptions = (subjects.data ?? [])
    .filter((s) => !taken.has(s.id))
    .map((s) => ({ value: String(s.id), label: s.name, description: s.code }))

  const teacherOptions = (teachers.data ?? []).map((t) => ({
    value: String(t.id),
    label: t.full_name,
    description: t.employee_id ?? t.email,
  }))

  const submit = async () => {
    if (!subjectId) return setError('Pick a subject.')
    // Required by the backend, and rightly: a subject with nobody teaching it
    // is not an arrangement, and "fill it in later" is how a student ends up
    // enrolled in a class that never happens.
    if (!teacherId) return setError('Pick a teacher — a subject with nobody teaching it is not an arrangement.')
    setError(null)
    try {
      await add.mutateAsync({
        studentId,
        body: {
          subject_id: Number(subjectId),
          teacher_id: Number(teacherId),
          default_duration_minutes: duration.trim() ? Number(duration) : null,
          start_date: startDate || null,
          notes: notes.trim() || null,
        },
      })
      onOpenChange(false)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not add the subject.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a subject for {studentName}</DialogTitle>
          <DialogDescription>
            This records who teaches what. It does not create any classes — add a weekly slot
            afterwards, or the arrangement sits there with nothing scheduled.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />

          <Field id="ss-subject" label="Subject" required>
            <Combobox
              options={subjectOptions}
              value={subjectId}
              onChange={setSubjectId}
              placeholder="Search subjects…"
            />
          </Field>

          <Field id="ss-teacher" label="Teacher" required>
            <Combobox
              options={teacherOptions}
              value={teacherId}
              onChange={setTeacherId}
              placeholder="Search tutors…"
            />
          </Field>

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field
              id="ss-duration"
              label="Class length (minutes)"
              hint="Leave blank to use the programme default."
            >
              <Input
                id="ss-duration"
                type="number"
                min={10}
                max={480}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </Field>
            <Field id="ss-start" label="Starts">
              <Input
                id="ss-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
          </div>

          <Field id="ss-notes" label="Notes">
            <Textarea
              id="ss-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={add.isPending}>
            Add subject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================================================================= package
//
// The package is what the student's subjects are chosen WITHIN — "30 classes
// for 15,000, any subjects" — so it sits on this screen, above the subjects,
// rather than on the fees screen with the invoices. Putting a student on one
// is the five-second job the office does when the family pays; it belongs
// next to the five-second job of adding a subject.

const AUTO = 'AUTO'

function AssignPackageDialog({
  studentId,
  studentName,
  current,
  open,
  onOpenChange,
}: {
  studentId: number
  studentName: string
  current: PackageStatusOut | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const assign = useAssignPackage()
  const packages = usePackages({ includeInactive: false }, open)
  const years = useAcademicYears({ program: 'TUITION' }, open)

  const [packageId, setPackageId] = React.useState('')
  const [yearId, setYearId] = React.useState(AUTO)
  const [term, setTerm] = React.useState(AUTO)
  const [startsOn, setStartsOn] = React.useState('')
  const [endsOn, setEndsOn] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setPackageId(current?.package ? String(current.package.id) : '')
    setYearId(AUTO)
    setTerm(AUTO)
    setStartsOn('')
    setEndsOn('')
    setNotes('')
    setError(null)
  }, [open, current])

  const chosen = (packages.data ?? []).find((p) => String(p.id) === packageId) ?? null
  // The package's own scope wins; the pickers only matter for an unscoped one.
  const yearLocked = chosen?.academic_year_id != null
  const termLocked = chosen?.term != null

  const options = (packages.data ?? []).map((p) => ({
    value: String(p.id),
    label: p.name,
    description: `${p.classes_included} classes · ${formatMoney(p.amount, p.currency)}${
      p.academic_year_name || p.term_name
        ? ` · ${[p.academic_year_name, p.term_name].filter(Boolean).join(' ')}`
        : ''
    }`,
  }))

  const submit = async () => {
    if (!packageId) return setError('Pick a package.')
    if (startsOn && endsOn && endsOn < startsOn) return setError('The end date is before the start.')
    setError(null)
    try {
      await assign.mutateAsync({
        studentId,
        body: {
          package_id: Number(packageId),
          academic_year_id: yearLocked || yearId === AUTO ? null : Number(yearId),
          term: termLocked || term === AUTO ? null : (term as AcademicTerm),
          starts_on: startsOn || null,
          ends_on: endsOn || null,
          notes: notes.trim() || null,
        },
      })
      onOpenChange(false)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not assign the package.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {current?.package ? `Change ${studentName}'s package` : `Put ${studentName} on a package`}
          </DialogTitle>
          <DialogDescription>
            A package is for a term. Leave the year and term on automatic and the student lands
            in the term today falls in; assigning again for the same term replaces the earlier
            package rather than stacking a second one on the same classes.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />

          <Field id="pkg-pick" label="Package" required>
            <Combobox
              options={options}
              value={packageId}
              onChange={setPackageId}
              placeholder="Search packages…"
            />
          </Field>

          {chosen && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {chosen.classes_included} classes for {formatMoney(chosen.amount, chosen.currency)} —{' '}
              {formatMoney(chosen.per_class_amount, chosen.currency)} a class,{' '}
              {BILLING_MODE_LABEL[chosen.billing_mode].toLowerCase()}.
              {chosen.max_subjects != null ? ` At most ${chosen.max_subjects} subjects at once.` : ''}
            </p>
          )}

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field
              id="pkg-year"
              label="Session year"
              hint={yearLocked ? `Fixed by the package: ${chosen?.academic_year_name}.` : 'Automatic: the tuition year today is in.'}
            >
              <Select value={yearLocked ? 'LOCKED' : yearId} onValueChange={setYearId} disabled={yearLocked}>
                <SelectTrigger id="pkg-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearLocked && <SelectItem value="LOCKED">{chosen?.academic_year_name}</SelectItem>}
                  <SelectItem value={AUTO}>Automatic</SelectItem>
                  {(years.data ?? []).map((y) => (
                    <SelectItem key={y.id} value={String(y.id)}>
                      {y.name}
                      {y.is_current ? ' (current)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              id="pkg-term"
              label="Term"
              hint={termLocked ? `Fixed by the package: ${chosen?.term_name}.` : 'Automatic: the term today is in.'}
            >
              <Select value={termLocked ? 'LOCKED' : term} onValueChange={setTerm} disabled={termLocked}>
                <SelectTrigger id="pkg-term">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {termLocked && <SelectItem value="LOCKED">{chosen?.term_name}</SelectItem>}
                  <SelectItem value={AUTO}>Automatic</SelectItem>
                  {TERMS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TERM_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field id="pkg-starts" label="Counts from" hint="Blank uses the term's first day.">
              <Input
                id="pkg-starts"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </Field>
            <Field id="pkg-ends" label="Until" hint="Blank uses the term's last day.">
              <Input
                id="pkg-ends"
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
              />
            </Field>
          </div>

          <Field id="pkg-notes" label="Notes">
            <Textarea id="pkg-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={assign.isPending}>
            {current?.package ? 'Change package' : 'Assign package'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StudentPackagePanel({
  studentId,
  studentName,
}: {
  studentId: number
  studentName: string
}) {
  const status = useStudentPackage(studentId)
  const history = useStudentPackageHistory(studentId)
  const end = useEndPackageAssignment()
  const [assignOpen, setAssignOpen] = React.useState(false)
  const [ending, setEnding] = React.useState(false)
  const [showHistory, setShowHistory] = React.useState(false)

  const data = status.data
  const pkg = data?.package ?? null
  const assignment = data?.assignment ?? null
  const percent = data ? packageUsagePercent(data.classes_used_to_date, data.classes_included) : 0
  const over = (data?.classes_over ?? 0) > 0
  const past = (history.data ?? []).filter((a) => !a.is_active)

  return (
    <Card className="mb-4 p-5">
      {status.isPending ? (
        <Skeleton className="h-20 w-full rounded-lg" />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <Package
                className={`mt-0.5 size-5 shrink-0 ${pkg ? 'text-primary' : 'text-muted-foreground'}`}
              />
              <div className="min-w-0">
                {pkg && assignment ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{pkg.name}</h3>
                      <Badge tone="outline" size="sm">
                        {BILLING_MODE_LABEL[pkg.billing_mode]}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {pkg.classes_included} classes for {formatMoney(pkg.amount, pkg.currency)} ·{' '}
                      {formatMoney(pkg.per_class_amount, pkg.currency)} a class
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[assignment.academic_year_name, assignment.term_name]
                        .filter(Boolean)
                        .join(' · ') || 'Any term'}
                      {assignment.starts_on
                        ? ` · ${formatDate(assignment.starts_on)}${assignment.ends_on ? ` – ${formatDate(assignment.ends_on)}` : ''}`
                        : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-semibold">No package</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Classes are counted but priced at zero until {studentName} is put on one.
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button variant={pkg ? 'outline' : 'primary'} size="sm" onClick={() => setAssignOpen(true)}>
                <Package />
                {pkg ? 'Change package' : 'Assign a package'}
              </Button>
              {assignment && (
                <Button variant="ghost" size="sm" onClick={() => setEnding(true)}>
                  Take off
                </Button>
              )}
              {past.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)}>
                  <History />
                  {showHistory ? 'Hide history' : `History (${past.length})`}
                </Button>
              )}
            </div>
          </div>

          {data && pkg && (
            <div className="mt-3">
              <ProgressBar
                value={percent}
                tone={over ? 'warning' : percent >= 80 ? 'info' : 'primary'}
                size="sm"
                label="Package usage"
              />
              <p className={`mt-1 text-xs ${over ? 'text-warning' : 'text-muted-foreground'}`}>
                {packageUsageLabel(data)}
                {data.usage_from ? ` · counted since ${formatDate(data.usage_from)}` : ''}
              </p>
            </div>
          )}

          {showHistory && past.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
              {past.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 text-xs">
                  <span>
                    {a.package_name ?? `Package ${a.package_id}`}
                    <span className="text-muted-foreground">
                      {' '}· {[a.academic_year_name, a.term_name].filter(Boolean).join(' ') || 'any term'}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    {a.starts_on ? formatDate(a.starts_on) : ''}
                    {a.ends_on ? ` – ${formatDate(a.ends_on)}` : ''}
                    {a.ended_at ? ` · ended ${formatDate(a.ended_at)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <AssignPackageDialog
        studentId={studentId}
        studentName={studentName}
        current={data ?? null}
        open={assignOpen}
        onOpenChange={setAssignOpen}
      />

      <ConfirmDialog
        open={ending}
        onOpenChange={setEnding}
        title={`Take ${studentName} off ${pkg?.name ?? 'the package'}?`}
        description="The assignment is ended, not deleted — invoices already raised against it keep reading back to it. From here on the student's classes are counted but priced at zero until another package is assigned."
        confirmLabel="Take off"
        destructive
        loading={end.isPending}
        onConfirm={async () => {
          if (assignment) await end.mutateAsync({ studentId, assignmentId: assignment.id })
          setEnding(false)
        }}
      />
    </Card>
  )
}

function SubjectRow({
  subject,
  onRemove,
}: {
  subject: StudentSubjectOut
  onRemove: () => void
}) {
  const active = subject.status === 'ACTIVE'
  // The pair is the useful figure: it says whether the arrangement is running
  // or merely exists.
  const neverRan = subject.session_count === 0

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              {subject.subject_name ?? `Subject ${subject.subject_id}`}
            </h3>
            {subject.subject_code && (
              <Badge tone="outline" size="sm">
                {subject.subject_code}
              </Badge>
            )}
            {!active && (
              <Badge tone="neutral" size="sm">
                {subject.status ?? 'Inactive'}
              </Badge>
            )}
          </div>

          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <UserRound className="size-3.5" />
            {subject.teacher_name ?? 'No teacher'}
            {subject.start_date ? ` · from ${formatDate(subject.start_date)}` : ''}
          </p>

          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="size-3.5" />
            {subject.conducted_count} of {subject.session_count} classes held
          </p>

          {active && neverRan && (
            <p className="mt-2 flex gap-2 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>
                Nothing is scheduled for this subject. Add a weekly slot under{' '}
                <Link className="font-medium underline" to="/admin/tuition/schedule">
                  Schedule
                </Link>{' '}
                or no class will ever run.
              </span>
            </p>
          )}
        </div>

        {active && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 />
            Drop
          </Button>
        )}
      </div>
    </Card>
  )
}

export default function AdminStudentSubjectsPage() {
  const students = useTuitionUsers('STUDENT')
  const [studentId, setStudentId] = React.useState<number | null>(null)
  const subjects = useStudentSubjects(studentId)
  const removeSubject = useRemoveStudentSubject()

  const [addOpen, setAddOpen] = React.useState(false)
  const [dropping, setDropping] = React.useState<StudentSubjectOut | null>(null)

  const studentOptions = (students.data ?? []).map((s) => ({
    value: String(s.id),
    label: s.full_name,
    description: s.admission_number ?? s.email,
  }))
  const student = students.data?.find((s) => s.id === studentId) ?? null

  return (
    <div>
      <PageHeader
        title="Student subjects"
        description="The package one student is on, what they take within it, and who teaches each. The same records as Arrangements, from the student's side."
        actions={
          student ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus />
              Add a subject
            </Button>
          ) : undefined
        }
      >
        <div className="max-w-sm">
          <Combobox
            options={studentOptions}
            value={studentId ? String(studentId) : ''}
            onChange={(v) => setStudentId(Number(v))}
            placeholder="Pick a student…"
          />
        </div>
      </PageHeader>

      {!studentId ? (
        <EmptyState
          icon={<BookOpen />}
          title="Pick a student"
          description="Choose somebody above to see the package they are on and the subjects they take."
        />
      ) : (
        <>
        {student && <StudentPackagePanel studentId={student.id} studentName={student.full_name} />}
        <QueryBoundary
          query={subjects}
          loading={
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          }
          isEmpty={(rows) => rows.length === 0}
          empty={
            <EmptyState
              icon={<BookOpen />}
              title={`${student?.full_name ?? 'This student'} takes no subjects yet`}
              description="Add one to record who teaches them. You will still need to schedule the classes afterwards."
              action={
                <Button onClick={() => setAddOpen(true)}>
                  <Plus />
                  Add a subject
                </Button>
              }
            />
          }
        >
          {(rows) => (
            <div className="space-y-3">
              {rows.map((subject) => (
                <SubjectRow
                  key={subject.enrollment_id}
                  subject={subject}
                  onRemove={() => setDropping(subject)}
                />
              ))}
            </div>
          )}
        </QueryBoundary>
        </>
      )}

      {student && (
        <AddSubjectDialog
          studentId={student.id}
          studentName={student.full_name}
          existing={subjects.data ?? []}
          open={addOpen}
          onOpenChange={setAddOpen}
        />
      )}

      {/* Cancelling, not deleting. The hard delete exists on the endpoint but
          is not offered here: it takes the classes already taught with it, and
          an arrangement that ended is a fact worth keeping. */}
      <ConfirmDialog
        open={!!dropping}
        onOpenChange={(v) => !v && setDropping(null)}
        title={`Drop ${dropping?.subject_name ?? 'this subject'}?`}
        description="The arrangement is cancelled and its future classes stop. Classes already taught, and anything billed for them, are kept."
        confirmLabel="Drop subject"
        destructive
        loading={removeSubject.isPending}
        onConfirm={async () => {
          if (dropping?.subject_id && studentId) {
            await removeSubject.mutateAsync({
              studentId,
              subjectId: dropping.subject_id,
            })
          }
          setDropping(null)
        }}
      />
    </div>
  )
}

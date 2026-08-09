import type { ColumnDef } from '@tanstack/react-table'
import { GraduationCap, Info, Plus, TriangleAlert, UserMinus } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import type { StudentEnrollmentOut } from '@/api/types'
import {
  useClasses,
  useCreateEnrollment,
  useDeleteEnrollment,
  useEnrollments,
  useUsers,
} from '@/queries/admin.queries'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DataTable } from '@/components/data/data-table'
import { UserCell } from '@/components/domain/user-cell'
import { BatchProgress, useBatchRunner } from '@/components/feedback/batch-progress'
import { EmptyState } from '@/components/feedback/states'
import { Field } from '@/components/forms/field'
import { PageHeader } from '@/components/layout/page-header'

interface EnrollPayload {
  studentId: number
  classId: number
}

function EnrollDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  existing: StudentEnrollmentOut[]
}) {
  const studentsQuery = useUsers('STUDENT')
  const classesQuery = useClasses()
  const createEnrollment = useCreateEnrollment()
  const batch = useBatchRunner<EnrollPayload>()

  const [classId, setClassId] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  const [search, setSearch] = React.useState('')

  // Depend on the stable `reset` callback, never on the whole batch object —
  // that is recreated each render, which would re-run this effect forever and
  // wipe the selection as fast as you make it.
  const resetBatch = batch.reset
  React.useEffect(() => {
    if (!open) return
    setClassId(null)
    setSelected(new Set())
    setSearch('')
    resetBatch()
  }, [open, resetBatch])

  const students = React.useMemo(() => {
    const list = (studentsQuery.data ?? []).filter((s) => s.is_active)
    const needle = search.trim().toLowerCase()
    if (!needle) return list
    return list.filter(
      (s) => s.full_name.toLowerCase().includes(needle) || s.email.toLowerCase().includes(needle),
    )
  }, [studentsQuery.data, search])

  /** studentId -> the class they are already enrolled in. */
  const enrolledIn = React.useMemo(() => {
    const map = new Map<number, string>()
    for (const e of existing) map.set(e.student.id, e.class_room.name)
    return map
  }, [existing])

  const klass = classesQuery.data?.find((c) => String(c.id) === classId)

  const alreadyInThisClass = React.useMemo(
    () => new Set(existing.filter((e) => e.class_room.id === klass?.id).map((e) => e.student.id)),
    [existing, klass],
  )

  const toggle = (studentId: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  const chosen = [...selected]
  const conflicting = chosen.filter((id) => enrolledIn.has(id) && !alreadyInThisClass.has(id))

  const submit = async () => {
    if (!klass || chosen.length === 0) return

    const entries = chosen
      .filter((id) => !alreadyInThisClass.has(id))
      .map((id) => {
        const student = studentsQuery.data?.find((s) => s.id === id)
        return {
          key: String(id),
          label: student?.full_name ?? `Student ${id}`,
          payload: { studentId: id, classId: klass.id },
        }
      })

    if (entries.length === 0) {
      toast.info('Every selected student is already enrolled in this class.')
      return
    }

    // No batch endpoint exists, so these go one at a time with real progress.
    const { succeeded, failed } = await batch.run(entries, (payload) =>
      createEnrollment.mutateAsync({ student_id: payload.studentId, class_id: payload.classId }),
    )

    if (failed === 0) {
      toast.success(`Enrolled ${succeeded} ${succeeded === 1 ? 'student' : 'students'} in ${klass.name}`)
      onOpenChange(false)
    } else {
      toast.warning(`${succeeded} enrolled, ${failed} failed. Review the list and retry.`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !batch.running && onOpenChange(v)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Enroll students</DialogTitle>
          <DialogDescription>Select a class, then choose the students to add to it.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field id="enroll-class" label="Class" required>
            <Combobox
              id="enroll-class"
              value={classId}
              onChange={setClassId}
              placeholder={classesQuery.isPending ? 'Loading classes…' : 'Select a class'}
              emptyMessage="No classes found."
              options={(classesQuery.data ?? []).map((c) => ({
                value: String(c.id),
                label: c.name,
                hint: c.code,
              }))}
            />
          </Field>

          {klass && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    Students {selected.size > 0 && <span className="text-muted-foreground">({selected.size} selected)</span>}
                  </span>
                  {selected.size > 0 && (
                    <Button variant="ghost" size="xs" onClick={() => setSelected(new Set())}>
                      Clear
                    </Button>
                  )}
                </div>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search students…"
                  leading={<Search />}
                  className="h-9"
                />
                <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
                  {students.length === 0 && (
                    <li className="px-3 py-6 text-center text-sm text-muted-foreground">No students found.</li>
                  )}
                  {students.map((student) => {
                    const already = alreadyInThisClass.has(student.id)
                    const otherClass = enrolledIn.get(student.id)
                    return (
                      <li key={student.id}>
                        <label
                          className={
                            already
                              ? 'flex cursor-not-allowed items-center gap-3 rounded-md px-2.5 py-2 opacity-55'
                              : 'flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-muted'
                          }
                        >
                          <Checkbox
                            checked={already || selected.has(student.id)}
                            disabled={already}
                            onCheckedChange={() => toggle(student.id)}
                          />
                          <span className="min-w-0 flex-1">
                            <UserCell name={student.full_name} email={student.email} size="xs" />
                          </span>
                          {already ? (
                            <Badge tone="success" size="sm">
                              Enrolled
                            </Badge>
                          ) : otherClass ? (
                            <Badge tone="warning" size="sm">
                              In {otherClass}
                            </Badge>
                          ) : null}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {/* The backend resolves a student's class from their FIRST
                  enrollment, so a second one is effectively invisible. */}
              {conflicting.length > 0 && (
                <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  <span className="text-muted-foreground">
                    {conflicting.length} selected {conflicting.length === 1 ? 'student is' : 'students are'}{' '}
                    already enrolled elsewhere. Students only ever see one class, so this may hide their
                    current one.
                  </span>
                </div>
              )}

              <BatchProgress items={batch.items} percent={batch.percent} done={batch.done} total={batch.total} />
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={batch.running}>
            {batch.items.length > 0 && !batch.running ? 'Close' : 'Cancel'}
          </Button>
          <Button
            variant="primary"
            disabled={!klass || selected.size === 0}
            loading={batch.running}
            onClick={submit}
          >
            Enroll {selected.size > 0 ? selected.size : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminEnrollmentsPage() {
  const enrollmentsQuery = useEnrollments()
  const deleteEnrollment = useDeleteEnrollment()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [removing, setRemoving] = React.useState<StudentEnrollmentOut | null>(null)
  const [bulkRemoving, setBulkRemoving] = React.useState<StudentEnrollmentOut[] | null>(null)
  const bulk = useBatchRunner<number>()

  const enrollments = enrollmentsQuery.data ?? []

  const columns = React.useMemo<ColumnDef<StudentEnrollmentOut, unknown>[]>(
    () => [
      {
        id: 'student',
        header: 'Student',
        accessorFn: (row) => row.student.full_name,
        cell: ({ row }) => (
          <UserCell
            name={row.original.student.full_name}
            email={row.original.student.email}
            inactive={!row.original.student.is_active}
          />
        ),
      },
      {
        id: 'class',
        header: 'Class',
        accessorFn: (row) => row.class_room.name,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium">{row.original.class_room.name}</p>
            <p className="text-xs text-muted-foreground">{row.original.class_room.code}</p>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Account',
        accessorFn: (row) => (row.student.is_active ? 'Active' : 'Inactive'),
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => (
          <Badge tone={row.original.student.is_active ? 'success' : 'neutral'} dot>
            {row.original.student.is_active ? 'Active' : 'Inactive'}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Un-enroll ${row.original.student.full_name} from ${row.original.class_room.name}`}
            onClick={(e) => {
              e.stopPropagation()
              setRemoving(row.original)
            }}
          >
            <UserMinus />
          </Button>
        ),
      },
    ],
    [],
  )

  const classOptions = React.useMemo(
    () => [...new Set(enrollments.map((e) => e.class_room.name))].sort().map((v) => ({ value: v, label: v })),
    [enrollments],
  )

  const byClass = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const e of enrollments) map.set(e.class_room.name, (map.get(e.class_room.name) ?? 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [enrollments])

  return (
    <>
      <PageHeader
        title="Enrollments"
        description="Which students belong to which class."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setDialogOpen(true)}>
            Enroll students
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {byClass.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {byClass.map(([name, count]) => (
                <Badge key={name} tone="primary">
                  {name}: {count}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              A student sees only one class — the first they were enrolled in. Enrollments cannot be removed
              through the API.
            </span>
          </div>
        </div>
      </PageHeader>

      <DataTable
        columns={columns}
        data={enrollmentsQuery.data}
        isLoading={enrollmentsQuery.isPending}
        error={enrollmentsQuery.error}
        onRetry={() => enrollmentsQuery.refetch()}
        getRowId={(row) => String(row.id)}
        searchPlaceholder="Search student or class…"
        searchParamKey="q"
        bulkActions={{
          render: (selected) => (
            <Button
              variant="danger"
              size="sm"
              icon={<UserMinus />}
              onClick={() => setBulkRemoving(selected)}
            >
              Un-enroll {selected.length}
            </Button>
          ),
        }}
        searchValues={(row) => [
          row.student.full_name,
          row.student.email,
          row.class_room.name,
          row.class_room.code,
        ]}
        initialSorting={[{ id: 'class', desc: false }]}
        facets={[
          { columnId: 'class', label: 'Class', options: classOptions },
          {
            columnId: 'status',
            label: 'Account',
            options: [
              { value: 'Active', label: 'Active' },
              { value: 'Inactive', label: 'Inactive' },
            ],
          },
        ]}
        csv={{
          filename: 'enrollments',
          columns: [
            { header: 'Student', value: (e) => e.student.full_name },
            { header: 'Email', value: (e) => e.student.email },
            { header: 'Class', value: (e) => e.class_room.name },
            { header: 'Class code', value: (e) => e.class_room.code },
            { header: 'Active', value: (e) => (e.student.is_active ? 'Yes' : 'No') },
          ],
        }}
        renderCard={(e) => (
          <Card className="p-4">
            <UserCell name={e.student.full_name} email={e.student.email} />
            <Badge tone="primary" size="sm" className="mt-3">
              {e.class_room.name}
            </Badge>
          </Card>
        )}
        emptyState={
          <EmptyState
            icon={<GraduationCap />}
            title="No enrollments yet"
            description="Enroll students into a class so they can see their subjects, attendance and grades."
            action={
              <Button variant="primary" icon={<Plus />} onClick={() => setDialogOpen(true)}>
                Enroll students
              </Button>
            }
          />
        }
      />

      <EnrollDialog open={dialogOpen} onOpenChange={setDialogOpen} existing={enrollments} />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title="Un-enroll this student?"
        description={
          removing
            ? `${removing.student.full_name} will lose access to ${removing.class_room.name} and stop appearing on its roster. Their attendance and grade history is preserved, and they can be enrolled again at any time.`
            : undefined
        }
        confirmLabel="Un-enroll"
        destructive
        loading={deleteEnrollment.isPending}
        onConfirm={() => {
          if (!removing) return
          deleteEnrollment.mutate(removing.id, { onSettled: () => setRemoving(null) })
        }}
      />

      <ConfirmDialog
        open={!!bulkRemoving}
        onOpenChange={(v) => !v && !bulk.running && setBulkRemoving(null)}
        title={`Un-enroll ${bulkRemoving?.length ?? 0} students?`}
        description="They lose access to their class and drop off its roster. Attendance and grade history is preserved, and any of them can be enrolled again."
        confirmLabel={`Un-enroll ${bulkRemoving?.length ?? 0}`}
        destructive
        loading={bulk.running}
        onConfirm={async () => {
          if (!bulkRemoving) return
          const { succeeded, failed } = await bulk.run(
            bulkRemoving.map((enrollment) => ({
              key: String(enrollment.id),
              label: `${enrollment.student.full_name} — ${enrollment.class_room.name}`,
              payload: enrollment.id,
            })),
            (enrollmentId) => deleteEnrollment.mutateAsync(enrollmentId),
          )
          if (failed === 0) {
            toast.success(`${succeeded} students un-enrolled`)
            setBulkRemoving(null)
            bulk.reset()
          } else {
            toast.warning(`${succeeded} un-enrolled, ${failed} failed`)
          }
        }}
      >
        {bulk.items.length > 0 && (
          <BatchProgress
            items={bulk.items}
            percent={bulk.percent}
            done={bulk.done}
            total={bulk.total}
          />
        )}
      </ConfirmDialog>
    </>
  )
}

import type { ColumnDef } from '@tanstack/react-table'
import { ArrowRight, Grid3x3, Info, Link2, List, Plus, Unlink } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import type { TeacherMappingOut } from '@/api/types'
import {
  useClasses,
  useCreateMapping,
  useDeleteMapping,
  useMappings,
  useSubjects,
  useUsers,
} from '@/queries/admin.queries'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Segmented } from '@/components/ui/segmented'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTable } from '@/components/data/data-table'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { UserCell } from '@/components/domain/user-cell'
import { Field } from '@/components/forms/field'
import { EmptyState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'

// ----------------------------------------------------------------- dialog

function AssignmentDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  existing: TeacherMappingOut[]
}) {
  const teachersQuery = useUsers('TEACHER')
  const subjectsQuery = useSubjects()
  const classesQuery = useClasses()
  const createMapping = useCreateMapping()

  const [teacherId, setTeacherId] = React.useState<string | null>(null)
  const [subjectId, setSubjectId] = React.useState<string | null>(null)
  const [classId, setClassId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setTeacherId(null)
      setSubjectId(null)
      setClassId(null)
      setError(null)
    }
  }, [open])

  const teacher = teachersQuery.data?.find((t) => String(t.id) === teacherId)
  const subject = subjectsQuery.data?.find((s) => String(s.id) === subjectId)
  const klass = classesQuery.data?.find((c) => String(c.id) === classId)
  const ready = !!teacher && !!subject && !!klass

  const duplicate =
    ready &&
    existing.some(
      (m) => m.teacher.id === teacher.id && m.subject.id === subject.id && m.class_room.id === klass.id,
    )

  const submit = async () => {
    if (!ready) return
    setError(null)

    // A duplicate POST returns the existing row with status 201, so the only
    // honest way to report "already assigned" is to check before sending.
    if (duplicate) {
      toast.info('That mapping already exists.')
      onOpenChange(false)
      return
    }

    try {
      await createMapping.mutateAsync({
        teacher_id: teacher.id,
        subject_id: subject.id,
        class_id: klass.id,
      })
      toast.success(`${teacher.full_name} now teaches ${subject.name} in ${klass.name}`)
      onOpenChange(false)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not create the mapping.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign a teacher</DialogTitle>
          <DialogDescription>
            Links one teacher to one subject in one class. Mappings cannot be removed later.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">{error}</p>
          )}

          <Field id="teacher" label="Teacher" required>
            <Combobox
              id="teacher"
              value={teacherId}
              onChange={setTeacherId}
              placeholder={teachersQuery.isPending ? 'Loading teachers…' : 'Select a teacher'}
              emptyMessage="No teachers found. Create one under Users."
              options={(teachersQuery.data ?? [])
                .filter((t) => t.is_active)
                .map((t) => ({ value: String(t.id), label: t.full_name, hint: t.email }))}
            />
          </Field>

          <Field id="subject" label="Subject" required>
            <Combobox
              id="subject"
              value={subjectId}
              onChange={setSubjectId}
              placeholder={subjectsQuery.isPending ? 'Loading subjects…' : 'Select a subject'}
              emptyMessage="No subjects found."
              options={(subjectsQuery.data ?? []).map((s) => ({
                value: String(s.id),
                label: s.name,
                hint: s.code,
              }))}
            />
          </Field>

          <Field id="class" label="Class" required>
            <Combobox
              id="class"
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

          {/* Plain-English confirmation, because this cannot be undone. */}
          {ready && (
            <div
              className={
                duplicate
                  ? 'rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm'
                  : 'rounded-lg border border-primary/25 bg-primary/8 px-3 py-2.5 text-sm'
              }
            >
              {duplicate ? (
                <span className="text-warning">This mapping already exists.</span>
              ) : (
                <span>
                  <strong>{teacher.full_name}</strong> will teach <strong>{subject.name}</strong> in{' '}
                  <strong>{klass.name}</strong>.
                </span>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready} loading={createMapping.isPending} onClick={submit}>
            {duplicate ? 'Close' : 'Create mapping'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------------ matrix

function AssignmentMatrix({ mappings }: { mappings: TeacherMappingOut[] }) {
  const classesQuery = useClasses()
  const subjectsQuery = useSubjects()

  // Only render rows/columns that are actually in use, so the grid stays
  // readable instead of becoming a wall of empty cells.
  const classes = React.useMemo(() => {
    const used = new Set(mappings.map((m) => m.class_room.id))
    return (classesQuery.data ?? []).filter((c) => used.has(c.id))
  }, [classesQuery.data, mappings])

  const subjects = React.useMemo(() => {
    const used = new Set(mappings.map((m) => m.subject.id))
    return (subjectsQuery.data ?? []).filter((s) => used.has(s.id))
  }, [subjectsQuery.data, mappings])

  const cell = React.useMemo(() => {
    const map = new Map<string, TeacherMappingOut[]>()
    for (const m of mappings) {
      const key = `${m.class_room.id}|${m.subject.id}`
      const list = map.get(key)
      if (list) list.push(m)
      else map.set(key, [m])
    }
    return map
  }, [mappings])

  if (classes.length === 0 || subjects.length === 0) {
    return (
      <EmptyState
        icon={<Grid3x3 />}
        title="Nothing to plot yet"
        description="Create at least one mapping to see the class-by-subject matrix."
      />
    )
  }

  return (
    <Card className="overflow-hidden">
      <Table containerClassName="max-h-[70vh]">
        <TableHeader sticky>
          <TableRow className="hover:bg-transparent">
            <TableHead className="sticky left-0 z-20 min-w-44 bg-muted/70 backdrop-blur">Class</TableHead>
            {subjects.map((s) => (
              <TableHead key={s.id} align="center" className="min-w-36">
                <span className="block truncate" title={s.name}>
                  {s.name}
                </span>
                <span className="block text-2xs font-normal normal-case text-muted-foreground/80">{s.code}</span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {classes.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="sticky left-0 z-10 bg-card">
                <span className="block truncate text-sm font-medium">{c.name}</span>
                <span className="block text-xs text-muted-foreground">{c.code}</span>
              </TableCell>
              {subjects.map((s) => {
                const entries = cell.get(`${c.id}|${s.id}`) ?? []
                return (
                  <TableCell key={s.id} align="center">
                    {entries.length === 0 ? (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    ) : entries.length === 1 ? (
                      <span className="inline-flex items-center gap-2">
                        <Avatar name={entries[0].teacher.full_name} size="xs" />
                        <span className="truncate text-xs">{entries[0].teacher.full_name}</span>
                      </span>
                    ) : (
                      <AvatarStack names={entries.map((e) => e.teacher.full_name)} size="xs" />
                    )}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

// -------------------------------------------------------------------- page

export default function AdminAssignmentsPage() {
  const mappingsQuery = useMappings()
  const deleteMapping = useDeleteMapping()
  const [view, setView] = React.useState<'list' | 'matrix'>('list')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [unassigning, setUnassigning] = React.useState<TeacherMappingOut | null>(null)

  const columns = React.useMemo<ColumnDef<TeacherMappingOut, unknown>[]>(
    () => [
      {
        id: 'teacher',
        header: 'Teacher',
        accessorFn: (row) => row.teacher.full_name,
        cell: ({ row }) => (
          <UserCell
            name={row.original.teacher.full_name}
            email={row.original.teacher.email}
            inactive={!row.original.teacher.is_active}
          />
        ),
      },
      {
        id: 'subject',
        header: 'Subject',
        accessorFn: (row) => row.subject.name,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium">{row.original.subject.name}</p>
            <p className="text-xs text-muted-foreground">{row.original.subject.code}</p>
          </div>
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
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Unassign ${row.original.teacher.full_name} from ${row.original.subject.name}`}
            onClick={(e) => {
              e.stopPropagation()
              setUnassigning(row.original)
            }}
          >
            <Unlink />
          </Button>
        ),
      },
    ],
    [],
  )

  const mappings = mappingsQuery.data ?? []

  const subjectOptions = React.useMemo(
    () => [...new Set(mappings.map((m) => m.subject.name))].sort().map((v) => ({ value: v, label: v })),
    [mappings],
  )
  const classOptions = React.useMemo(
    () => [...new Set(mappings.map((m) => m.class_room.name))].sort().map((v) => ({ value: v, label: v })),
    [mappings],
  )

  return (
    <>
      <PageHeader
        title="Teacher Mappings"
        description="Map a teacher to a subject in a class. This is what gives a teacher access to attendance, materials and grades for that class."
        actions={
          <>
            <Segmented
              layoutId="assignments-view"
              value={view}
              onChange={setView}
              size="sm"
              aria-label="Change view"
              options={[
                { value: 'list', label: 'List', icon: <List /> },
                { value: 'matrix', label: 'Matrix', icon: <Grid3x3 /> },
              ]}
            />
            <Button variant="primary" icon={<Plus />} onClick={() => setDialogOpen(true)}>
              New mapping
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Removing an assignment only unlinks the teacher — the attendance, topics, materials and
            grades they already recorded are kept. To move a subject to a different teacher, add the
            new assignment and remove the old one.
          </span>
        </div>
      </PageHeader>

      {view === 'matrix' ? (
        mappingsQuery.isPending ? (
          <Skeleton className="h-96 rounded-xl" />
        ) : (
          <AssignmentMatrix mappings={mappings} />
        )
      ) : (
        <DataTable
          columns={columns}
          data={mappingsQuery.data}
          isLoading={mappingsQuery.isPending}
          error={mappingsQuery.error}
          onRetry={() => mappingsQuery.refetch()}
          getRowId={(row) => String(row.id)}
          searchPlaceholder="Search teacher, subject or class…"
          searchParamKey="q"
          searchValues={(row) => [
            row.teacher.full_name,
            row.teacher.email,
            row.subject.name,
            row.subject.code,
            row.class_room.name,
            row.class_room.code,
          ]}
          initialSorting={[{ id: 'teacher', desc: false }]}
          facets={[
            { columnId: 'subject', label: 'Subject', options: subjectOptions },
            { columnId: 'class', label: 'Class', options: classOptions },
          ]}
          csv={{
            filename: 'teacher-mappings',
            columns: [
              { header: 'Teacher', value: (m) => m.teacher.full_name },
              { header: 'Teacher email', value: (m) => m.teacher.email },
              { header: 'Subject', value: (m) => m.subject.name },
              { header: 'Subject code', value: (m) => m.subject.code },
              { header: 'Class', value: (m) => m.class_room.name },
              { header: 'Class code', value: (m) => m.class_room.code },
            ],
          }}
          renderCard={(m) => (
            <Card className="p-4">
              <UserCell name={m.teacher.full_name} email={m.teacher.email} />
              <div className="mt-3 flex items-center gap-2 text-sm">
                <Badge tone="accent" size="sm">
                  {m.subject.name}
                </Badge>
                <ArrowRight className="size-3.5 text-muted-foreground" />
                <Badge tone="primary" size="sm">
                  {m.class_room.name}
                </Badge>
              </div>
            </Card>
          )}
          emptyState={
            <EmptyState
              icon={<Link2 />}
              title="No mappings yet"
              description="Map a teacher to a subject and class so they can start taking attendance and posting material."
              action={
                <Button variant="primary" icon={<Plus />} onClick={() => setDialogOpen(true)}>
                  New mapping
                </Button>
              }
            />
          }
        />
      )}

      <AssignmentDialog open={dialogOpen} onOpenChange={setDialogOpen} existing={mappings} />

      <ConfirmDialog
        open={!!unassigning}
        onOpenChange={(v) => !v && setUnassigning(null)}
        title="Remove this assignment?"
        description={
          unassigning
            ? `${unassigning.teacher.full_name} will no longer teach ${unassigning.subject.name} to ${unassigning.class_room.name}. Attendance, topics, materials and grades they already recorded are kept.`
            : undefined
        }
        confirmLabel="Remove assignment"
        destructive
        loading={deleteMapping.isPending}
        onConfirm={() => {
          if (!unassigning) return
          deleteMapping.mutate(unassigning.id, { onSettled: () => setUnassigning(null) })
        }}
      />
    </>
  )
}

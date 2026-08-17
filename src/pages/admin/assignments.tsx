import type { ColumnDef } from '@tanstack/react-table'
import {
  ArrowRight,
  Grid3x3,
  Info,
  Layers,
  Link2,
  List,
  Plus,
  TriangleAlert,
  Unlink,
  UserRoundCog,
} from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import type { ClassTeacherMappingOut, TeacherMappingOut } from '@/api/types'
import {
  useClasses,
  useClassTeachers,
  useDeleteClassTeacher,
  useDeleteMapping,
  useMappings,
  useSubjects,
} from '@/queries/admin.queries'
import { formatDateTime } from '@/lib/datetime'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTable } from '@/components/data/data-table'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { UserCell } from '@/components/domain/user-cell'
import { EmptyState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'

type Tab = 'subjects' | 'class-teachers'

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

// ------------------------------------------------------ subject mappings tab

function SubjectMappingsTab() {
  const mappingsQuery = useMappings()
  const deleteMapping = useDeleteMapping()
  const [view, setView] = React.useState<'list' | 'matrix'>('list')
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Removing an assignment only unlinks the teacher — the attendance, topics, materials and
            grades they already recorded are kept.
          </span>
        </div>
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
      </div>

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
                <Button asChild variant="primary" icon={<Plus />}>
                  <Link to="/admin/mappings/new">New mapping</Link>
                </Button>
              }
            />
          }
        />
      )}

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

// ------------------------------------------------------- class teachers tab

/**
 * Classes with nobody answerable for them.
 *
 * Worth its own panel rather than an absence in the table: the whole value of
 * the role is that someone can answer for a class as a whole, and a class with
 * no class teacher is a gap an admin would otherwise have to notice by reading
 * the list and spotting what is missing from it.
 */
function UnledClasses({ mappings }: { mappings: ClassTeacherMappingOut[] }) {
  const classesQuery = useClasses()

  const unled = React.useMemo(() => {
    const led = new Set(mappings.map((m) => m.class_room.id))
    return (classesQuery.data ?? []).filter((c) => !led.has(c.id))
  }, [classesQuery.data, mappings])

  if (classesQuery.isPending || unled.length === 0) return null

  return (
    <Card className="mb-4 border-warning/30 bg-warning/6 p-4">
      <div className="flex items-start gap-2.5">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {unled.length} {unled.length === 1 ? 'class has' : 'classes have'} no class teacher
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Nobody can currently answer for these classes as a whole.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {unled.map((c) => (
              <Button key={c.id} asChild variant="outline" size="xs">
                <Link to={`/admin/mappings/class-teacher/new?class_id=${c.id}`}>
                  <Plus />
                  {c.name}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

function ClassTeachersTab() {
  const query = useClassTeachers()
  const remove = useDeleteClassTeacher()
  const [removing, setRemoving] = React.useState<ClassTeacherMappingOut | null>(null)

  const mappings = query.data ?? []

  /** Do they lead anything else? Decides whether removal also demotes them. */
  const isLastClassFor = React.useCallback(
    (mapping: ClassTeacherMappingOut) =>
      mappings.filter((m) => m.teacher.id === mapping.teacher.id).length === 1,
    [mappings],
  )

  const columns = React.useMemo<ColumnDef<ClassTeacherMappingOut, unknown>[]>(
    () => [
      {
        id: 'teacher',
        header: 'Class teacher',
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
        id: 'assigned',
        header: 'Assigned',
        accessorFn: (row) => row.assigned_at ?? '',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.assigned_at ? formatDateTime(row.original.assigned_at) : '—'}
          </span>
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
            aria-label={`Remove ${row.original.teacher.full_name} as class teacher of ${row.original.class_room.name}`}
            onClick={(e) => {
              e.stopPropagation()
              setRemoving(row.original)
            }}
          >
            <Unlink />
          </Button>
        ),
      },
    ],
    [],
  )

  const classOptions = React.useMemo(
    () => [...new Set(mappings.map((m) => m.class_room.name))].sort().map((v) => ({ value: v, label: v })),
    [mappings],
  )

  return (
    <>
      {!query.isPending && <UnledClasses mappings={mappings} />}

      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          A class teacher answers for a class as a whole: they see and can correct the attendance,
          syllabus, marks, live classes and materials that <strong>every</strong> teacher files
          against it. Authority is per class, and a class may have more than one.
        </span>
      </div>

      <DataTable
        columns={columns}
        data={query.data}
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        getRowId={(row) => String(row.id)}
        searchPlaceholder="Search teacher or class…"
        searchParamKey="ctq"
        searchValues={(row) => [
          row.teacher.full_name,
          row.teacher.email,
          row.class_room.name,
          row.class_room.code,
        ]}
        initialSorting={[{ id: 'class', desc: false }]}
        facets={[{ columnId: 'class', label: 'Class', options: classOptions }]}
        csv={{
          filename: 'class-teachers',
          columns: [
            { header: 'Class', value: (m) => m.class_room.name },
            { header: 'Class code', value: (m) => m.class_room.code },
            { header: 'Class teacher', value: (m) => m.teacher.full_name },
            { header: 'Email', value: (m) => m.teacher.email },
            { header: 'Assigned', value: (m) => m.assigned_at ?? '' },
          ],
        }}
        renderCard={(m) => (
          <Card className="p-4">
            <UserCell name={m.teacher.full_name} email={m.teacher.email} />
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Badge tone="warning" size="sm">
                <UserRoundCog />
                Class teacher
              </Badge>
              <ArrowRight className="size-3.5 text-muted-foreground" />
              <Badge tone="primary" size="sm">
                <Layers />
                {m.class_room.name}
              </Badge>
            </div>
          </Card>
        )}
        emptyState={
          <EmptyState
            icon={<UserRoundCog />}
            title="No class teachers yet"
            description="Assign a teacher to a class so someone can answer for it as a whole, rather than only for their own periods."
            action={
              <Button asChild variant="primary" icon={<Plus />}>
                <Link to="/admin/mappings/class-teacher/new">Assign class teacher</Link>
              </Button>
            }
          />
        }
      />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title="Remove this class teacher?"
        description={
          removing
            ? `${removing.teacher.full_name} will stop answering for ${removing.class_room.name} and lose sight of other teachers' records there. Their own subject mappings, periods and everything they logged are kept.` +
              (isLastClassFor(removing)
                ? ` This is the only class they lead, so they drop back to Teacher and are signed out of every device.`
                : '')
            : undefined
        }
        confirmLabel="Remove class teacher"
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          if (!removing) return
          const name = removing.teacher.full_name
          const className = removing.class_room.name
          remove.mutate(removing.id, {
            onSuccess: () => toast.success(`${name} is no longer the class teacher of ${className}`),
            onSettled: () => setRemoving(null),
          })
        }}
      />
    </>
  )
}

// -------------------------------------------------------------------- page

export default function AdminAssignmentsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  // Held in the URL so the back link from either form returns to the tab the
  // admin was on, and so a tab is shareable.
  const tab: Tab = params.get('tab') === 'class-teachers' ? 'class-teachers' : 'subjects'

  const setTab = (next: Tab) => {
    const updated = new URLSearchParams(params)
    if (next === 'subjects') updated.delete('tab')
    else updated.set('tab', next)
    // Search terms belong to the table that was showing, not to the new one.
    updated.delete('q')
    updated.delete('ctq')
    setParams(updated, { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Teacher Mappings"
        description="Who teaches what, and who answers for each class."
        actions={
          tab === 'subjects' ? (
            <Button variant="primary" icon={<Plus />} onClick={() => navigate('/admin/mappings/new')}>
              New mapping
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={<Plus />}
              onClick={() => navigate('/admin/mappings/class-teacher/new')}
            >
              Assign class teacher
            </Button>
          )
        }
      >
        <Segmented
          layoutId="mappings-tab"
          value={tab}
          onChange={setTab}
          aria-label="Mapping type"
          options={[
            { value: 'subjects', label: 'Subject mappings', icon: <Link2 /> },
            { value: 'class-teachers', label: 'Class teachers', icon: <UserRoundCog /> },
          ]}
        />
      </PageHeader>

      {tab === 'subjects' ? <SubjectMappingsTab /> : <ClassTeachersTab />}
    </>
  )
}

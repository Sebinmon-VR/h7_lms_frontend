import { zodResolver } from '@hookform/resolvers/zod'
import { BookOpen, LayoutList, Pencil, Plus, Repeat2, Search, Trash2, X } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import type { SubjectOut, TeacherMappingOut, UserOut } from '@/api/types'
import {
  useClassTeachers,
  useClasses,
  useCreateMapping,
  useCreateSubject,
  useDeleteMapping,
  useDeleteSubject,
  useMappings,
  useSubjects,
  useTeachingStaff,
  useUpdateSubject,
} from '@/queries/admin.queries'
import { cn } from '@/lib/cn'
import { countLabel } from '@/lib/format'
import { tidyName as tidy } from '@/lib/names'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input, Textarea } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { DeleteResourceDialog } from '@/components/forms/delete-resource-dialog'
import { Field, FormError } from '@/components/forms/field'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { Band, Figure, Figures, WorkspaceHeader } from '@/components/layout/workspace'

/*
 * Subjects & Teachers, laid out like Classes & Students: white bands edge to
 * edge, no cards. A list on the left that switches between subjects and
 * teachers; the chosen one on the right, allocated in place.
 *
 *  - A subject: every class it is taught in, and by whom.
 *  - A teacher: every class and subject they take, and the classes they lead.
 *
 * "All subjects" / "All teachers" at the top of the list shows them as a table.
 * The side is kept in `?view=teachers` so a link can open on the teachers.
 */

type Side = 'subjects' | 'teachers'

const schema = z.object({
  name: z.string().min(2, 'Enter a subject name').max(120),
  code: z
    .string()
    .min(2, 'Enter a code')
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, 'Use letters, numbers, dots, dashes or underscores'),
  description: z.string().max(500).optional(),
})
type FormValues = z.infer<typeof schema>

/** Shorter controls for the in-page forms, which are read and filled at a glance. */
const COMPACT_INPUT = 'h-8 px-3 py-1 text-sm'
const COMPACT_FIELD = 'space-y-1'

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

function CodeTag({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block w-[4.5rem] shrink-0 truncate rounded bg-primary/8 px-1.5 py-0.5 text-center font-mono text-[11px] text-primary',
        className,
      )}
    >
      {code}
    </span>
  )
}

function PaneHeading({ children, trailing }: { children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</h3>
      {trailing}
    </div>
  )
}

/** The blue line for allocating in place: two pickers and a button. */
function AllocateLine({ children, disabled, loading, onAllocate }: {
  children: React.ReactNode
  disabled: boolean
  loading: boolean
  onAllocate: () => void
}) {
  return (
    <div className="grid gap-2 border-l-2 border-primary bg-primary/[0.04] px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
      {children}
      <Button size="sm" disabled={disabled} loading={loading} onClick={onAllocate}>
        <Plus />
        Allocate
      </Button>
    </div>
  )
}

/** One removal confirmation for an allocation, worded from either side. */
function RemoveAllocation({ mapping, onClose }: { mapping: TeacherMappingOut | null; onClose: () => void }) {
  const deleteMapping = useDeleteMapping()
  return (
    <ConfirmDialog
      open={!!mapping}
      onOpenChange={(v) => !v && onClose()}
      title={mapping ? `Remove ${tidy(mapping.subject.name)} in ${mapping.class_room.name}?` : 'Remove?'}
      description={
        mapping
          ? `${tidy(mapping.teacher.full_name)} stops teaching ${tidy(mapping.subject.name)} to ${mapping.class_room.name}, and it leaves their timetable and dashboards. Attendance, topics, materials and marks already recorded are kept.`
          : undefined
      }
      confirmLabel="Remove"
      destructive
      loading={deleteMapping.isPending}
      onConfirm={() => {
        if (!mapping) return
        deleteMapping.mutate(mapping.id, { onSettled: onClose })
      }}
    />
  )
}

function useTeacherOptions() {
  const teachersQuery = useTeachingStaff()
  return {
    teachers: teachersQuery.data ?? [],
    isPending: teachersQuery.isPending,
    options: (teachersQuery.data ?? [])
      .filter((t) => t.is_active)
      .map((t) => ({ value: String(t.id), label: tidy(t.full_name), hint: t.email, keywords: t.employee_id ?? '' })),
  }
}

// ==================================================================== form

/**
 * One form for create and edit, in the right-hand pane. `editing` null means create.
 * Only changed fields are sent on edit — an empty update body is a 400.
 */
function SubjectForm({
  editing,
  existingCodes,
  onClose,
  onCreated,
}: {
  editing: SubjectOut | null
  existingCodes: Set<string>
  onClose: () => void
  onCreated: (subject: SubjectOut) => void
}) {
  const createSubject = useCreateSubject()
  const updateSubject = useUpdateSubject()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: editing?.name ?? '', code: editing?.code ?? '', description: editing?.description ?? '' },
  })

  const onSubmit = async (values: FormValues) => {
    const description = values.description?.trim() ?? ''
    if (existingCodes.has(values.code.toUpperCase()) && values.code.toUpperCase() !== editing?.code.toUpperCase()) {
      form.setError('code', { message: 'A subject already uses this code.' })
      return
    }
    try {
      if (editing) {
        const patch = {
          ...(values.name !== editing.name && { name: values.name }),
          ...(values.code !== editing.code && { code: values.code }),
          ...(description !== (editing.description ?? '') && { description }),
        }
        if (Object.keys(patch).length > 0) await updateSubject.mutateAsync({ subjectId: editing.id, body: patch })
        onClose()
      } else {
        onCreated(await createSubject.mutateAsync({ name: values.name, code: values.code, description: description || null }))
      }
    } catch (error) {
      form.setError('root', {
        message: (error as { message?: string })?.message ?? `Could not ${editing ? 'update' : 'create'} subject.`,
      })
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-foreground">{editing ? `Edit ${tidy(editing.name)}` : 'New subject'}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {editing
              ? 'Renaming a subject updates it everywhere it appears: allocations, materials and reports'
              : 'Add it here, then allocate it to classes and teachers'}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close the form">
          <X />
        </Button>
      </div>

      <FormError message={form.formState.errors.root?.message} />

      <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field id="name" label="Subject name" required error={form.formState.errors.name?.message} className={COMPACT_FIELD}>
          <Input id="name" className={COMPACT_INPUT} placeholder="Mathematics" {...form.register('name')} />
        </Field>
        <Field id="code" label="Code" required error={form.formState.errors.code?.message} hint="Short and unique" className={COMPACT_FIELD}>
          <Input id="code" className={COMPACT_INPUT} placeholder="MAT" {...form.register('code')} />
        </Field>
        <Field id="description" label="Description" error={form.formState.errors.description?.message} className={cn(COMPACT_FIELD, 'sm:col-span-2')}>
          <Textarea id="description" rows={2} className="text-sm" placeholder="Algebra, trigonometry and geometry" {...form.register('description')} />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={form.formState.isSubmitting}>
          {editing ? 'Save changes' : 'Create subject'}
        </Button>
      </div>
    </form>
  )
}

// ==================================================================== list

/**
 * The left-hand list: a switch between subjects and teachers, a search, an
 * "All" row, then one row each. An amber dot marks a subject no class takes,
 * or a teacher with nothing allocated.
 */
function SideList({
  side,
  onSide,
  subjects,
  teachers,
  subjectClasses,
  teacherLoad,
  value,
  onChange,
}: {
  side: Side
  onSide: (s: Side) => void
  subjects: SubjectOut[]
  teachers: UserOut[]
  subjectClasses: (id: number) => number
  teacherLoad: (id: number) => number
  value: number | 'all'
  onChange: (v: number | 'all') => void
}) {
  const [search, setSearch] = React.useState('')
  const needle = search.trim().toLowerCase()

  const row = (active: boolean) =>
    cn(
      'relative flex w-full items-center gap-2.5 py-2 pl-4 pr-4 text-left text-sm transition-colors sm:pl-6 lg:pl-8',
      active ? 'bg-primary/5 font-medium text-primary' : 'text-foreground hover:bg-muted/40',
    )
  const bar = (active: boolean) => active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />

  const shownSubjects = needle ? subjects.filter((s) => `${s.name} ${s.code}`.toLowerCase().includes(needle)) : subjects
  const shownTeachers = needle
    ? teachers.filter((t) => `${t.full_name} ${t.email ?? ''}`.toLowerCase().includes(needle))
    : teachers

  return (
    <nav aria-label={side === 'subjects' ? 'Subjects' : 'Teachers'} className="flex flex-col lg:h-full">
      <div className="space-y-2 border-b border-border px-4 py-2.5 sm:px-6 lg:pl-8 lg:pr-4">
        <Segmented
          size="sm"
          layoutId="subjects-side"
          aria-label="List"
          value={side}
          onChange={(s) => {
            setSearch('')
            onSide(s)
          }}
          className="flex w-full [&>button]:flex-1"
          options={[
            { value: 'subjects', label: `Subjects ${subjects.length}` },
            { value: 'teachers', label: `Teachers ${teachers.length}` },
          ]}
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={side === 'subjects' ? 'Find a subject or code' : 'Find a teacher'}
            aria-label={side === 'subjects' ? 'Find a subject' : 'Find a teacher'}
            className={cn(COMPACT_INPUT, 'pl-8')}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => onChange('all')}
        aria-current={value === 'all' ? 'true' : undefined}
        className={cn(row(value === 'all'), 'border-b border-border')}
      >
        {bar(value === 'all')}
        <LayoutList className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="flex-1">{side === 'subjects' ? 'All subjects' : 'All teachers'}</span>
      </button>

      <ul className="max-h-72 divide-y divide-border overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
        {side === 'subjects' ? (
          <>
            {shownSubjects.length === 0 && <li className="px-6 py-6 text-center text-sm text-muted-foreground">No subject matches</li>}
            {shownSubjects.map((s) => {
              const active = value === s.id
              const count = subjectClasses(s.id)
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => onChange(s.id)} aria-current={active ? 'true' : undefined} title={s.name} className={row(active)}>
                    {bar(active)}
                    <CodeTag code={s.code} className="w-14" />
                    <span className="min-w-0 flex-1 truncate">{tidy(s.name)}</span>
                    {count === 0 && <span className="size-1.5 rounded-full bg-warning" aria-label="Not taught anywhere" />}
                    <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                  </button>
                </li>
              )
            })}
          </>
        ) : (
          <>
            {shownTeachers.length === 0 && <li className="px-6 py-6 text-center text-sm text-muted-foreground">No teacher matches</li>}
            {shownTeachers.map((t) => {
              const active = value === t.id
              const load = teacherLoad(t.id)
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => onChange(t.id)} aria-current={active ? 'true' : undefined} title={t.email ?? undefined} className={row(active)}>
                    {bar(active)}
                    <Avatar name={t.full_name} size="xs" />
                    <span className="min-w-0 flex-1 truncate">{tidy(t.full_name)}</span>
                    {load === 0 && <span className="size-1.5 rounded-full bg-warning" aria-label="Nothing allocated" />}
                    <span className="text-xs tabular-nums text-muted-foreground">{load}</span>
                  </button>
                </li>
              )
            })}
          </>
        )}
      </ul>
    </nav>
  )
}

// ============================================================ the overviews

function SubjectTable({
  subjects,
  mappings,
  onOpen,
  onEdit,
  onDelete,
}: {
  subjects: SubjectOut[]
  mappings: TeacherMappingOut[]
  onOpen: (s: SubjectOut) => void
  onEdit: (s: SubjectOut) => void
  onDelete: (s: SubjectOut) => void
}) {
  const rowsOf = (id: number) => mappings.filter((m) => m.subject.id === id)
  const unused = subjects.filter((s) => rowsOf(s.id).length === 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-medium tracking-tight text-foreground">All subjects</h2>
        <p className="text-sm text-muted-foreground">{countLabel(subjects.length, 'subject')} in the catalogue</p>
      </div>

      {unused.length > 0 && (
        <div className="border-l-2 border-warning bg-warning/5 px-3 py-2 text-sm">
          <p className="font-medium text-foreground">{countLabel(unused.length, 'subject')} not taught in any class</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {unused.slice(0, 6).map((s) => tidy(s.name)).join(' · ')}
            {unused.length > 6 && ` · and ${unused.length - 6} more`}
          </p>
        </div>
      )}

      <div className="overflow-x-auto border-y border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Subject</th>
              <th className="px-3 py-2 text-right font-medium">Classes</th>
              <th className="px-3 py-2 text-left font-medium">Taught by</th>
              <th className="px-3 py-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {subjects.map((subject) => {
              const rows = rowsOf(subject.id)
              const classes = new Set(rows.map((m) => m.class_room.id)).size
              const teachers = [...new Map(rows.map((m) => [m.teacher.id, m.teacher.full_name])).values()]
              return (
                <tr key={subject.id} onClick={() => onOpen(subject)} className="cursor-pointer transition-colors hover:bg-primary/5">
                  <td className="px-3 py-1.5">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <CodeTag code={subject.code} />
                      <span className="truncate font-medium text-foreground">{tidy(subject.name)}</span>
                    </span>
                  </td>
                  <td className={cn('px-3 py-1.5 text-right tabular-nums', classes === 0 && 'text-warning')}>{classes}</td>
                  <td className="max-w-[20rem] truncate px-3 py-1.5 text-muted-foreground">{teachers.length ? teachers.map(tidy).join(', ') : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-0.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${subject.name}`} onClick={() => onEdit(subject)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${subject.name}`} onClick={() => onDelete(subject)}>
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TeacherTable({
  teachers,
  mappings,
  leadsOf,
  onOpen,
}: {
  teachers: UserOut[]
  mappings: TeacherMappingOut[]
  leadsOf: (id: number) => string[]
  onOpen: (t: UserOut) => void
}) {
  const rows = teachers
    .map((t) => {
      const own = mappings.filter((m) => m.teacher.id === t.id)
      return { teacher: t, own, subjects: [...new Set(own.map((m) => tidy(m.subject.name)))] }
    })
    .sort((a, b) => b.own.length - a.own.length || a.teacher.full_name.localeCompare(b.teacher.full_name))
  const idle = rows.filter((r) => r.own.length === 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-medium tracking-tight text-foreground">All teachers</h2>
        <p className="text-sm text-muted-foreground">Busiest first</p>
      </div>

      {idle.length > 0 && (
        <div className="border-l-2 border-warning bg-warning/5 px-3 py-2 text-sm">
          <p className="font-medium text-foreground">{countLabel(idle.length, 'teacher')} with no subject</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {idle.slice(0, 6).map((r) => tidy(r.teacher.full_name)).join(' · ')}
            {idle.length > 6 && ` · and ${idle.length - 6} more`}
          </p>
        </div>
      )}

      <div className="overflow-x-auto border-y border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Teacher</th>
              <th className="px-3 py-2 text-right font-medium">Periods</th>
              <th className="px-3 py-2 text-left font-medium">Subjects</th>
              <th className="px-3 py-2 text-left font-medium">Class teacher of</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ teacher, own, subjects }) => (
              <tr key={teacher.id} onClick={() => onOpen(teacher)} className="cursor-pointer transition-colors hover:bg-primary/5">
                <td className="px-3 py-1.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={teacher.full_name} size="xs" />
                    <span className="truncate font-medium text-foreground">{tidy(teacher.full_name)}</span>
                  </span>
                </td>
                <td className={cn('px-3 py-1.5 text-right tabular-nums', own.length === 0 && 'text-warning')}>{own.length}</td>
                <td className="max-w-[18rem] truncate px-3 py-1.5 text-muted-foreground">{subjects.length ? subjects.join(', ') : '—'}</td>
                <td className="max-w-[12rem] truncate px-3 py-1.5 text-muted-foreground">{leadsOf(teacher.id).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================== one subject

function SubjectDetail({
  subject,
  mappings,
  loading,
  onEdit,
  onDelete,
  onOpenTeacher,
}: {
  subject: SubjectOut
  mappings: TeacherMappingOut[]
  loading: boolean
  onEdit: () => void
  onDelete: () => void
  onOpenTeacher: (id: number) => void
}) {
  const classesQuery = useClasses()
  const teachers = useTeacherOptions()
  const createMapping = useCreateMapping()
  const deleteMapping = useDeleteMapping()
  const [classId, setClassId] = React.useState<string | null>(null)
  const [teacherId, setTeacherId] = React.useState<string | null>(null)
  const [changing, setChanging] = React.useState<{ id: number; teacherId: string | null } | null>(null)
  const [removing, setRemoving] = React.useState<TeacherMappingOut | null>(null)

  const rows = mappings
    .filter((m) => m.subject.id === subject.id)
    .sort((a, b) => a.class_room.name.localeCompare(b.class_room.name, undefined, { numeric: true }))
  const taughtIn = new Set(rows.map((m) => m.class_room.id))
  const teacherCount = new Set(rows.map((m) => m.teacher.id)).size
  const allClasses = [...(classesQuery.data ?? [])].sort(byName)
  const missing = allClasses.filter((c) => !taughtIn.has(c.id))

  // Classes without the subject first; the rest say who already takes it there.
  const classOptions = [...allClasses]
    .sort((a, b) => Number(taughtIn.has(a.id)) - Number(taughtIn.has(b.id)))
    .map((c) => {
      const by = rows.filter((m) => m.class_room.id === c.id).map((m) => tidy(m.teacher.full_name))
      return { value: String(c.id), label: c.name, hint: by.length ? `${c.code} · taught by ${by.join(', ')}` : c.code, keywords: c.code }
    })

  const allocate = async () => {
    if (!classId || !teacherId) return
    // A duplicate POST returns the existing row with status 201, so check first.
    if (rows.some((m) => String(m.class_room.id) === classId && String(m.teacher.id) === teacherId)) {
      toast.info('That teacher already takes this subject in that class.')
      return
    }
    try {
      await createMapping.mutateAsync({ teacher_id: Number(teacherId), subject_id: subject.id, class_id: Number(classId) })
      const klass = allClasses.find((c) => String(c.id) === classId)
      const teacher = teachers.teachers.find((t) => String(t.id) === teacherId)
      toast.success(`${tidy(teacher?.full_name ?? 'The teacher')} now teaches ${tidy(subject.name)} in ${klass?.name ?? 'the class'}`)
      setClassId(null)
      setTeacherId(null)
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? 'Could not allocate the teacher.')
    }
  }

  /** No edit for an allocation: add the new pairing, then remove the old one. */
  const changeTeacher = async (m: TeacherMappingOut) => {
    if (!changing?.teacherId || changing.teacherId === String(m.teacher.id)) {
      setChanging(null)
      return
    }
    try {
      if (!rows.some((x) => x.class_room.id === m.class_room.id && String(x.teacher.id) === changing.teacherId)) {
        await createMapping.mutateAsync({ teacher_id: Number(changing.teacherId), subject_id: subject.id, class_id: m.class_room.id })
      }
      await deleteMapping.mutateAsync(m.id)
      toast.success(`${m.class_room.name} has a new ${tidy(subject.name)} teacher`)
      setChanging(null)
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? 'Could not change the teacher.')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-medium tracking-tight text-foreground">{tidy(subject.name)}</h2>
            <CodeTag code={subject.code} className="w-auto px-2" />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {countLabel(taughtIn.size, 'class', 'classes')} · {countLabel(teacherCount, 'teacher')}
            {subject.description ? ` · ${subject.description}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil />
            Edit
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${subject.name}`} onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      </div>

      <AllocateLine disabled={!classId || !teacherId} loading={createMapping.isPending && !changing} onAllocate={() => void allocate()}>
        <Combobox
          value={classId}
          onChange={setClassId}
          options={classOptions}
          placeholder={classesQuery.isPending ? 'Loading classes…' : 'Class'}
          searchPlaceholder="Search by name or code"
          emptyMessage="No classes found."
          className="h-8 bg-card text-sm"
        />
        <Combobox
          value={teacherId}
          onChange={setTeacherId}
          options={teachers.options}
          placeholder={teachers.isPending ? 'Loading teachers…' : 'Teacher'}
          searchPlaceholder="Search by name or email"
          emptyMessage="No teachers found."
          className="h-8 bg-card text-sm"
        />
      </AllocateLine>

      <section className="space-y-2">
        <PaneHeading>Taught in</PaneHeading>
        {loading ? (
          <Skeleton className="h-32" />
        ) : rows.length === 0 ? (
          <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">Not taught in any class yet. Pick a class and a teacher above</p>
        ) : (
          <div className="border-y border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_2rem] gap-4 border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
              <span>Class</span>
              <span>Teacher</span>
              <span />
            </div>
            <ul className="divide-y divide-border">
              {rows.map((m) => (
                <li key={m.id} className="group grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_2rem] items-center gap-4 px-3 py-1.5 transition-colors hover:bg-muted/30">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{m.class_room.name}</span>
                    <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">{m.class_room.code}</span>
                  </span>
                  {changing?.id === m.id ? (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Combobox
                        value={changing.teacherId}
                        onChange={(v) => setChanging({ id: m.id, teacherId: v })}
                        options={teachers.options.filter((o) => o.value !== String(m.teacher.id))}
                        placeholder="New teacher"
                        searchPlaceholder="Search by name or email"
                        className="h-7 min-w-0 flex-1 text-sm"
                      />
                      <Button size="xs" disabled={!changing.teacherId} loading={createMapping.isPending || deleteMapping.isPending} onClick={() => void changeTeacher(m)}>
                        Save
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => setChanging(null)}>
                        Cancel
                      </Button>
                    </span>
                  ) : (
                    <span className="flex min-w-0 items-center gap-2" title={m.teacher.email ?? undefined}>
                      <button type="button" onClick={() => onOpenTeacher(m.teacher.id)} className="flex min-w-0 items-center gap-2 text-left hover:text-primary">
                        <Avatar name={m.teacher.full_name} size="xs" className={m.teacher.is_active ? undefined : 'opacity-50 grayscale'} />
                        <span className={cn('truncate text-sm', !m.teacher.is_active && 'text-muted-foreground line-through')}>{tidy(m.teacher.full_name)}</span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="ml-auto shrink-0 text-muted-foreground opacity-40 transition-opacity hover:text-primary focus-visible:opacity-100 group-hover:opacity-100"
                        aria-label={`Change the teacher in ${m.class_room.name}`}
                        title="Change teacher"
                        onClick={() => setChanging({ id: m.id, teacherId: null })}
                      >
                        <Repeat2 />
                      </Button>
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground opacity-40 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                    aria-label={`Remove ${subject.name} from ${m.class_room.name}`}
                    onClick={() => setRemoving(m)}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {missing.length > 0 && rows.length > 0 && (
        <section className="space-y-2">
          <PaneHeading>Not taught in · {missing.length}</PaneHeading>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setClassId(String(c.id))}
                title={`Allocate ${tidy(subject.name)} in ${c.name}`}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary"
              >
                <Plus className="size-3" />
                {c.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <RemoveAllocation mapping={removing} onClose={() => setRemoving(null)} />
    </div>
  )
}

// ============================================================== one teacher

/** One teacher: every class and subject they take, allocated and removed in place. */
function TeacherDetail({
  teacher,
  mappings,
  leads,
  loading,
  onOpenSubject,
}: {
  teacher: UserOut
  mappings: TeacherMappingOut[]
  leads: string[]
  loading: boolean
  onOpenSubject: (id: number) => void
}) {
  const classesQuery = useClasses()
  const subjectsQuery = useSubjects()
  const createMapping = useCreateMapping()
  const [classId, setClassId] = React.useState<string | null>(null)
  const [subjectId, setSubjectId] = React.useState<string | null>(null)
  const [removing, setRemoving] = React.useState<TeacherMappingOut | null>(null)

  const own = mappings
    .filter((m) => m.teacher.id === teacher.id)
    .sort((a, b) => a.class_room.name.localeCompare(b.class_room.name, undefined, { numeric: true }) || a.subject.name.localeCompare(b.subject.name))
  const classes = new Set(own.map((m) => m.class_room.id)).size
  const subjects = new Set(own.map((m) => m.subject.id)).size

  const allocate = async () => {
    if (!classId || !subjectId) return
    if (own.some((m) => String(m.class_room.id) === classId && String(m.subject.id) === subjectId)) {
      toast.info(`${tidy(teacher.full_name)} already takes this subject in that class.`)
      return
    }
    try {
      await createMapping.mutateAsync({ teacher_id: teacher.id, subject_id: Number(subjectId), class_id: Number(classId) })
      const subject = subjectsQuery.data?.find((s) => String(s.id) === subjectId)
      const klass = classesQuery.data?.find((c) => String(c.id) === classId)
      toast.success(`${tidy(teacher.full_name)} now teaches ${tidy(subject?.name ?? 'it')} in ${klass?.name ?? 'the class'}`)
      setClassId(null)
      setSubjectId(null)
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? 'Could not allocate.')
    }
  }

  // Group the rows by class so a teacher's week reads class by class.
  const byClass = new Map<string, TeacherMappingOut[]>()
  for (const m of own) byClass.set(m.class_room.name, [...(byClass.get(m.class_room.name) ?? []), m])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={teacher.full_name} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-medium tracking-tight text-foreground">{tidy(teacher.full_name)}</h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {countLabel(subjects, 'subject')} in {countLabel(classes, 'class', 'classes')}
              {teacher.email ? ` · ${teacher.email}` : ''}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={`/admin/users/${teacher.id}`}>Open profile</Link>
        </Button>
      </div>

      {leads.length > 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">Class teacher of </span>
          <span className="font-medium text-foreground">{leads.join(', ')}</span>
        </p>
      )}

      <AllocateLine disabled={!classId || !subjectId} loading={createMapping.isPending} onAllocate={() => void allocate()}>
        <Combobox
          value={classId}
          onChange={setClassId}
          options={[...(classesQuery.data ?? [])].sort(byName).map((c) => ({ value: String(c.id), label: c.name, hint: c.code, keywords: c.code }))}
          placeholder={classesQuery.isPending ? 'Loading classes…' : 'Class'}
          searchPlaceholder="Search by name or code"
          className="h-8 bg-card text-sm"
        />
        <Combobox
          value={subjectId}
          onChange={setSubjectId}
          options={[...(subjectsQuery.data ?? [])].sort(byName).map((s) => ({ value: String(s.id), label: tidy(s.name), hint: s.code, keywords: s.code }))}
          placeholder={subjectsQuery.isPending ? 'Loading subjects…' : 'Subject'}
          searchPlaceholder="Search by name or code"
          className="h-8 bg-card text-sm"
        />
      </AllocateLine>

      <section className="space-y-2">
        <PaneHeading>Teaches</PaneHeading>
        {loading ? (
          <Skeleton className="h-32" />
        ) : own.length === 0 ? (
          <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">Nothing allocated yet. Pick a class and a subject above</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {[...byClass.entries()].map(([className, items]) => (
              <li key={className} className="grid gap-2 px-3 py-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center sm:gap-4">
                <span className="truncate text-sm font-medium text-foreground">{className}</span>
                <span className="flex flex-wrap gap-1.5">
                  {items.map((m) => (
                    <span key={m.id} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border pl-2 pr-0.5 text-sm">
                      <button type="button" onClick={() => onOpenSubject(m.subject.id)} className="inline-flex items-center gap-1.5 hover:text-primary">
                        <span className="font-mono text-[11px] text-primary">{m.subject.code}</span>
                        <span>{tidy(m.subject.name)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoving(m)}
                        aria-label={`Remove ${m.subject.name} in ${m.class_room.name}`}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-danger/10 hover:text-danger"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RemoveAllocation mapping={removing} onClose={() => setRemoving(null)} />
    </div>
  )
}

// ==================================================================== page

export default function AdminSubjectsPage() {
  const subjectsQuery = useSubjects()
  const mappingsQuery = useMappings()
  const teachersQuery = useTeachingStaff()
  const chartQuery = useClassTeachers()
  const deleteSubject = useDeleteSubject()

  const [params, setParams] = useSearchParams()
  const side: Side = params.get('view') === 'teachers' ? 'teachers' : 'subjects'
  const [selectedId, setSelectedId] = React.useState<number | 'all'>('all')
  const [form, setForm] = React.useState<{ editing: SubjectOut | null } | null>(null)
  const [deleting, setDeleting] = React.useState<SubjectOut | null>(null)

  const subjects = React.useMemo(() => [...(subjectsQuery.data ?? [])].sort(byName), [subjectsQuery.data])
  const teachers = React.useMemo(
    () => (teachersQuery.data ?? []).filter((t) => t.is_active).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [teachersQuery.data],
  )
  const mappings = React.useMemo(() => mappingsQuery.data ?? [], [mappingsQuery.data])
  const existingCodes = React.useMemo(() => new Set(subjects.map((s) => s.code.toUpperCase())), [subjects])

  const subjectClasses = (id: number) => new Set(mappings.filter((m) => m.subject.id === id).map((m) => m.class_room.id)).size
  const teacherLoad = (id: number) => mappings.filter((m) => m.teacher.id === id).length
  const leadsOf = (id: number) => (chartQuery.data ?? []).filter((c) => c.teacher.id === id).map((c) => c.class_room.name)

  const switchSide = (next: Side, id: number | 'all' = 'all') => {
    const updated = new URLSearchParams(params)
    if (next === 'subjects') updated.delete('view')
    else updated.set('view', next)
    setParams(updated, { replace: true })
    setSelectedId(id)
    setForm(null)
  }
  const select = (v: number | 'all') => {
    setSelectedId(v)
    setForm(null)
  }

  const selectedSubject = side === 'subjects' && selectedId !== 'all' ? (subjects.find((s) => s.id === selectedId) ?? null) : null
  const selectedTeacher = side === 'teachers' && selectedId !== 'all' ? (teachers.find((t) => t.id === selectedId) ?? null) : null

  const inUse = subjects.filter((s) => subjectClasses(s.id) > 0).length
  const busyTeachers = teachers.filter((t) => teacherLoad(t.id) > 0).length

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title="Subjects & Teachers"
        description="Every subject and who teaches it in each class. Switch the list to teachers to see each teacher's classes"
        icon={BookOpen}
        actions={
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              if (side !== 'subjects') switchSide('subjects')
              setForm({ editing: null })
            }}
          >
            New subject
          </Button>
        }
      />

      <div className="-mt-6">
        <Figures>
          <Figure label="Subjects" value={subjectsQuery.data ? String(subjects.length) : '—'} context="in the catalogue" tone="primary" />
          <Figure label="Taught" value={mappingsQuery.data ? String(inUse) : '—'} context="in at least one class" tone="success" />
          <Figure
            label="Not taught"
            value={mappingsQuery.data ? String(subjects.length - inUse) : '—'}
            context="in no class yet"
            alert={subjects.length - inUse > 0}
            tone="warning"
          />
          <Figure label="Teachers" value={teachersQuery.data ? `${busyTeachers}/${teachers.length}` : '—'} context="with a subject" tone="info" />
          <Figure label="Allocations" value={mappingsQuery.data ? String(mappings.length) : '—'} context="class and subject pairs" tone="neutral" />
        </Figures>

        <QueryBoundary
          query={subjectsQuery}
          loading={
            <Band className="border-b border-border py-4">
              <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
                <Skeleton className="h-72 w-full" />
                <Skeleton className="h-72 w-full" />
              </div>
            </Band>
          }
        >
          {() => (
            <Band className="border-b border-border">
              <div className="grid lg:h-[calc(100vh-17rem)] lg:min-h-[26rem] lg:grid-cols-[17rem_minmax(0,1fr)] lg:divide-x lg:divide-border">
                <div className="-mx-4 border-b border-border sm:-mx-6 lg:mx-0 lg:-ml-8 lg:min-h-0 lg:border-b-0">
                  <SideList
                    side={side}
                    onSide={(s) => switchSide(s)}
                    subjects={subjects}
                    teachers={teachers}
                    subjectClasses={subjectClasses}
                    teacherLoad={teacherLoad}
                    value={form ? -1 : selectedId}
                    onChange={select}
                  />
                </div>

                <section className="min-w-0 py-5 lg:min-h-0 lg:overflow-y-auto lg:pl-8 lg:pr-1">
                  {form ? (
                    <SubjectForm
                      key={form.editing?.id ?? 'new'}
                      editing={form.editing}
                      existingCodes={existingCodes}
                      onClose={() => setForm(null)}
                      onCreated={(s) => {
                        setForm(null)
                        setSelectedId(s.id)
                      }}
                    />
                  ) : selectedSubject ? (
                    <SubjectDetail
                      key={selectedSubject.id}
                      subject={selectedSubject}
                      mappings={mappings}
                      loading={mappingsQuery.isPending}
                      onEdit={() => setForm({ editing: selectedSubject })}
                      onDelete={() => setDeleting(selectedSubject)}
                      onOpenTeacher={(id) => switchSide('teachers', id)}
                    />
                  ) : selectedTeacher ? (
                    <TeacherDetail
                      key={selectedTeacher.id}
                      teacher={selectedTeacher}
                      mappings={mappings}
                      leads={leadsOf(selectedTeacher.id)}
                      loading={mappingsQuery.isPending}
                      onOpenSubject={(id) => switchSide('subjects', id)}
                    />
                  ) : side === 'teachers' ? (
                    <TeacherTable teachers={teachers} mappings={mappings} leadsOf={leadsOf} onOpen={(t) => select(t.id)} />
                  ) : subjects.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-base font-medium text-foreground">No subjects yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">Add the subjects your school teaches, then allocate them to classes</p>
                      <Button size="sm" icon={<Plus />} className="mt-4" onClick={() => setForm({ editing: null })}>
                        New subject
                      </Button>
                    </div>
                  ) : (
                    <SubjectTable
                      subjects={subjects}
                      mappings={mappings}
                      onOpen={(s) => select(s.id)}
                      onEdit={(s) => setForm({ editing: s })}
                      onDelete={setDeleting}
                    />
                  )}
                </section>
              </div>
            </Band>
          )}
        </QueryBoundary>
      </div>

      <DeleteResourceDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        resourceLabel="subject"
        resourceName={deleting?.name ?? ''}
        description="Teacher allocations and every attendance record, topic, meeting, material and grade filed under this subject reference it. It can't be deleted while any of these still exist."
        onDelete={async (force) => {
          await deleteSubject.mutateAsync({ subjectId: deleting!.id, force })
          if (selectedId === deleting!.id) setSelectedId('all')
        }}
      />
    </div>
  )
}

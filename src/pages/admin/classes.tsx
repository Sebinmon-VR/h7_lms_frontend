import { zodResolver } from '@hookform/resolvers/zod'
import {
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  LayoutList,
  Layers,
  LinkIcon,
  Pencil,
  Plus,
  Repeat2,
  RefreshCw,
  Search,
  Trash2,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
  Video,
  X,
  type LucideIcon,
} from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import type { ClassRoomOut, ClassTeacherMappingOut, StudentEnrollmentOut, TeacherMappingOut } from '@/api/types'
import {
  useAssignClassTeacher,
  useClassTeachers,
  useClasses,
  useCreateClass,
  useCreateEnrollment,
  useCreateUser,
  useCreateMapping,
  useDeleteClass,
  useDeleteClassTeacher,
  useDeleteEnrollment,
  useDeleteMapping,
  useEnrollments,
  useMappings,
  useSubjects,
  useTeachingStaff,
  useUpdateClass,
  useUsers,
} from '@/queries/admin.queries'
import { useClearClassRoom, useSetupClassRoom } from '@/queries/classes.queries'
import { cn } from '@/lib/cn'
import { classStats } from '@/lib/derive'
import { countLabel } from '@/lib/format'
import { shareableLink } from '@/lib/meeting-links'
import { useCopyToClipboard } from '@/lib/hooks'
import { recordingLabel } from '@/lib/recordings'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Segmented } from '@/components/ui/segmented'
import { Avatar } from '@/components/ui/avatar'
import { Combobox } from '@/components/ui/combobox'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { DeleteResourceDialog } from '@/components/forms/delete-resource-dialog'
import { Field, FormError } from '@/components/forms/field'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { BatchProgress, useBatchRunner } from '@/components/feedback/batch-progress'
import { Band, Figure, Figures, TONE_FILL, WorkspaceHeader, type Tone } from '@/components/layout/workspace'

/*
 * Classes & Students, laid out like the other admin workspaces: white bands
 * edge to edge, no cards. On the left, a tree of grades with their sections
 * under them; on the right, the chosen class with a tab for each part of it.
 * "All classes" at the top of the tree shows every class as one table.
 */

const schema = z.object({
  name: z.string().min(2, 'Enter a class name').max(120),
  code: z
    .string()
    .min(2, 'Enter a code')
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, 'Use letters, numbers, dots, dashes or underscores'),
  description: z.string().max(500).optional(),
})
type FormValues = z.infer<typeof schema>

/** Shorter controls for the in-page form, which is read and filled at a glance. */
const COMPACT_INPUT = 'h-8 px-3 py-1 text-sm'
const COMPACT_FIELD = 'space-y-1'

type Stat = { studentCount: number; subjectCount: number; teacherCount: number }
const NO_STAT: Stat = { studentCount: 0, subjectCount: 0, teacherCount: 0 }

type DetailTab = 'students' | 'subjects' | 'room'

/** Whether the class has a room that works. An old Google Meet record does not. */
function roomState(klass: ClassRoomOut): { label: string; tone: Tone } {
  if (klass.room_link && klass.room_provider !== 'GOOGLE_MEET') {
    return klass.room_provider === 'AZURE_ACS' ? { label: 'Ready', tone: 'success' } : { label: 'External link', tone: 'info' }
  }
  if (klass.room_status === 'FAILED') return { label: 'Failed', tone: 'danger' }
  if (klass.room_provider === 'GOOGLE_MEET') return { label: 'Old Meet room', tone: 'warning' }
  return { label: 'Not yet', tone: 'neutral' }
}

function hasWorkingRoom(klass: ClassRoomOut) {
  const tone = roomState(klass).tone
  return tone === 'success' || tone === 'info'
}

/** What is missing, in words, or nothing when the class is ready to teach. */
function missing(klass: ClassRoomOut, stat: Stat) {
  const out: string[] = []
  if (stat.studentCount === 0) out.push('no students')
  if (stat.subjectCount === 0) out.push('no subjects')
  const room = roomState(klass).tone
  if (room === 'danger' || room === 'warning') out.push('room not working')
  return out
}

/**
 * "Grade 10 — Section A", "Class 5 B", "10A" → grade and section. A name that
 * does not end in a section letter is a grade of its own.
 */
function splitSection(name: string): { grade: string; section: string | null } {
  const trimmed = name.trim()
  const spaced = trimmed.match(/^(.*?\S)(?:\s*[-—–·:/]\s*|\s+)(?:section\s+|sec\.?\s*)?([A-Za-z])$/i)
  if (spaced) return { grade: spaced[1].trim(), section: spaced[2].toUpperCase() }
  const packed = trimmed.match(/^(\d{1,2})([A-Za-z])$/)
  if (packed) return { grade: packed[1], section: packed[2].toUpperCase() }
  return { grade: trimmed, section: null }
}

/** Classes by grade, grades in natural order (Grade 2 before Grade 10). */
function groupByGrade(classes: ClassRoomOut[]) {
  const groups = new Map<string, { klass: ClassRoomOut; section: string | null }[]>()
  for (const klass of classes) {
    const { grade, section } = splitSection(klass.name)
    if (!groups.has(grade)) groups.set(grade, [])
    groups.get(grade)!.push({ klass, section })
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map(([grade, items]) => ({
      grade,
      items: items.sort((a, b) => (a.section ?? a.klass.name).localeCompare(b.section ?? b.klass.name)),
    }))
}

/** A person on one line: name, then email in grey. Keeps table rows short. */
function PersonLine({ name, email, inactive }: { name: string; email?: string | null; inactive?: boolean }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className={cn('truncate font-medium', inactive ? 'text-muted-foreground line-through' : 'text-foreground')}>
        {name}
      </span>
      {email && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{email}</span>}
    </span>
  )
}

function StateDot({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
      <span className={cn('size-2 shrink-0 rounded-full', TONE_FILL[tone])} aria-hidden />
      {label}
    </span>
  )
}


// ==================================================================== tree

/**
 * Grades, each with its sections under it. A grade folds away; the grade of
 * the chosen class always stays open. Sections carry their student count and
 * an amber dot when something is missing.
 */
function ClassTree({
  classes,
  stats,
  value,
  onChange,
}: {
  classes: ClassRoomOut[]
  stats: Map<number, Stat>
  value: number | 'all'
  onChange: (v: number | 'all') => void
}) {
  const [search, setSearch] = React.useState('')
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set())
  const needle = search.trim().toLowerCase()
  const shown = needle ? classes.filter((k) => `${k.name} ${k.code}`.toLowerCase().includes(needle)) : classes
  const groups = groupByGrade(shown)
  const selectedGrade = value === 'all' ? null : splitSection(classes.find((k) => k.id === value)?.name ?? '').grade

  const toggle = (grade: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(grade)) next.delete(grade)
      else next.add(grade)
      return next
    })

  const row = (active: boolean) =>
    cn(
      'relative flex w-full items-center gap-2 py-2 pr-4 text-left text-sm transition-colors',
      active ? 'bg-primary/5 font-medium text-primary' : 'text-foreground hover:bg-muted/40',
    )

  return (
    <nav aria-label="Classes" className="flex flex-col lg:h-full">
      <div className="border-b border-border px-4 py-2.5 sm:px-6 lg:pl-8 lg:pr-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a class or code"
            aria-label="Find a class"
            className={cn(COMPACT_INPUT, 'pl-8')}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => onChange('all')}
        aria-current={value === 'all' ? 'true' : undefined}
        className={cn(row(value === 'all'), 'border-b border-border pl-4 sm:pl-6 lg:pl-8')}
      >
        {value === 'all' && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
        <LayoutList className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="flex-1">All classes</span>
        <span className="text-xs tabular-nums text-muted-foreground">{classes.length}</span>
      </button>

      <div className="max-h-72 overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
        {groups.length === 0 && <p className="px-6 py-6 text-center text-sm text-muted-foreground">No class matches</p>}
        {groups.map(({ grade, items }) => {
          const open = needle !== '' || grade === selectedGrade || !collapsed.has(grade)
          const students = items.reduce((n, i) => n + (stats.get(i.klass.id)?.studentCount ?? 0), 0)
          // A grade with a single unlettered class is just that class: no fold.
          const lone = items.length === 1 && items[0].section === null
          if (lone) {
            const { klass } = items[0]
            const active = value === klass.id
            const stat = stats.get(klass.id) ?? NO_STAT
            return (
              <button
                key={grade}
                type="button"
                onClick={() => onChange(klass.id)}
                aria-current={active ? 'true' : undefined}
                className={cn(row(active), 'border-b border-border pl-4 sm:pl-6 lg:pl-8')}
              >
                {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
                <span className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{klass.name}</span>
                {missing(klass, stat).length > 0 && <span className="size-1.5 rounded-full bg-warning" aria-label="Needs attention" />}
                <span className="text-xs tabular-nums text-muted-foreground">{stat.studentCount}</span>
              </button>
            )
          }
          return (
            <div key={grade} className="border-b border-border">
              <button
                type="button"
                onClick={() => toggle(grade)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 py-2 pl-4 pr-4 text-left text-sm hover:bg-muted/40 sm:pl-6 lg:pl-8"
              >
                <ChevronRight
                  className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
                />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{grade}</span>
                <span className="text-xs text-muted-foreground">
                  {items.length} sec · <span className="tabular-nums">{students}</span>
                </span>
              </button>
              {open && (
                <ul className="pb-1">
                  {items.map(({ klass, section }) => {
                    const active = value === klass.id
                    const stat = stats.get(klass.id) ?? NO_STAT
                    return (
                      <li key={klass.id}>
                        <button
                          type="button"
                          onClick={() => onChange(klass.id)}
                          aria-current={active ? 'true' : undefined}
                          title={klass.name}
                          className={cn(row(active), 'py-1.5 pl-10 sm:pl-12 lg:pl-14')}
                        >
                          {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
                          <span
                            className={cn(
                              'flex size-5 shrink-0 items-center justify-center rounded text-xs',
                              active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {section ?? '·'}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{section ? `Section ${section}` : klass.name}</span>
                          {missing(klass, stat).length > 0 && (
                            <span className="size-1.5 rounded-full bg-warning" aria-label="Needs attention" />
                          )}
                          <span className="text-xs tabular-nums text-muted-foreground">{stat.studentCount}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
}

// ==================================================================== form

/**
 * One form for both create and edit, in the right-hand pane. `editing` null means create.
 *
 * The edit path sends only the fields that actually changed: the backend
 * rejects an entirely empty update body with a 400, and every omitted field is
 * left untouched.
 */
function ClassForm({
  editing,
  existingCodes,
  onClose,
  onCreated,
}: {
  editing: ClassRoomOut | null
  existingCodes: Set<string>
  onClose: () => void
  onCreated: (klass: ClassRoomOut) => void
}) {
  const createClass = useCreateClass()
  const updateClass = useUpdateClass()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: editing?.name ?? '',
      code: editing?.code ?? '',
      description: editing?.description ?? '',
    },
  })

  const onSubmit = async (values: FormValues) => {
    const description = values.description?.trim() ?? ''

    // Pre-check so the user gets a field-level error rather than a 400 toast.
    // A class keeping its own code is not a clash.
    const codeTaken =
      existingCodes.has(values.code.toUpperCase()) && values.code.toUpperCase() !== editing?.code.toUpperCase()
    if (codeTaken) {
      form.setError('code', { message: 'A class already uses this code.' })
      return
    }

    try {
      if (editing) {
        const patch = {
          ...(values.name !== editing.name && { name: values.name }),
          ...(values.code !== editing.code && { code: values.code }),
          ...(description !== (editing.description ?? '') && { description }),
        }
        if (Object.keys(patch).length > 0) await updateClass.mutateAsync({ classId: editing.id, body: patch })
        onClose()
      } else {
        const created = await createClass.mutateAsync({
          name: values.name,
          code: values.code,
          description: description || null,
        })
        onCreated(created)
      }
    } catch (error) {
      form.setError('root', {
        message: (error as { message?: string })?.message ?? `Could not ${editing ? 'update' : 'create'} class.`,
      })
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-foreground">
            {editing ? `Edit ${editing.name}` : 'New class'}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {editing
              ? 'Renaming a class updates it everywhere it appears: assignments, enrollments and reports'
              : 'Name it "Grade 10 — Section A" and it sits under Grade 10 in the list'}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close the form">
          <X />
        </Button>
      </div>

      <FormError message={form.formState.errors.root?.message} />

      <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field id="name" label="Class name" required error={form.formState.errors.name?.message} className={COMPACT_FIELD}>
          <Input id="name" className={COMPACT_INPUT} placeholder="Grade 10 — Section A" {...form.register('name')} />
        </Field>
        <Field
          id="code"
          label="Code"
          required
          error={form.formState.errors.code?.message}
          hint="Short and unique"
          className={COMPACT_FIELD}
        >
          <Input id="code" className={COMPACT_INPUT} placeholder="CLASS-10A" {...form.register('code')} />
        </Field>
        <Field
          id="description"
          label="Description"
          error={form.formState.errors.description?.message}
          className={cn(COMPACT_FIELD, 'sm:col-span-2')}
        >
          <Textarea id="description" rows={2} className="text-sm" placeholder="Optional notes about this class" {...form.register('description')} />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={form.formState.isSubmitting}>
          {editing ? 'Save changes' : 'Create class'}
        </Button>
      </div>
    </form>
  )
}

// ============================================================== all classes

function ClassTable({
  classes,
  stats,
  onOpen,
  onEdit,
  onDelete,
}: {
  classes: ClassRoomOut[]
  stats: Map<number, Stat>
  onOpen: (klass: ClassRoomOut) => void
  onEdit: (klass: ClassRoomOut) => void
  onDelete: (klass: ClassRoomOut) => void
}) {
  const groups = groupByGrade(classes)
  const chart = useClassTeachers()
  const studentsQuery = useUsers('STUDENT')
  const enrollmentsQuery = useEnrollments()
  const enrolledIds = new Set((enrollmentsQuery.data ?? []).map((e) => e.student.id))
  const unplaced = (studentsQuery.data ?? []).filter((st) => st.is_active && !enrolledIds.has(st.id))
  const leadsOf = (id: number) => (chart.data ?? []).filter((c) => c.class_room.id === id)
  const attention = classes.filter((k) => missing(k, stats.get(k.id) ?? NO_STAT).length > 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-medium tracking-tight text-foreground">All classes</h2>
        <p className="text-sm text-muted-foreground">
          {countLabel(classes.length, 'class', 'classes')} in {countLabel(groups.length, 'grade')}
        </p>
      </div>

      {enrollmentsQuery.data && unplaced.length > 0 && (
        <div className="border-l-2 border-info bg-info/5 px-3 py-2 text-sm">
          <p className="font-medium text-foreground">{countLabel(unplaced.length, 'student')} not in any class</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {unplaced.slice(0, 5).map((st) => st.full_name).join(' · ')}
            {unplaced.length > 5 && ` · and ${unplaced.length - 5} more`}. Open a class and use Enroll students: they are listed first
          </p>
        </div>
      )}

      {attention.length > 0 && (
        <div className="border-l-2 border-warning bg-warning/5 px-3 py-2 text-sm">
          <p className="font-medium text-foreground">{countLabel(attention.length, 'class', 'classes')} not ready to teach</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {attention
              .slice(0, 4)
              .map((k) => `${k.name} (${missing(k, stats.get(k.id) ?? NO_STAT).join(', ')})`)
              .join(' · ')}
            {attention.length > 4 && ` · and ${attention.length - 4} more`}
          </p>
        </div>
      )}

      <div className="overflow-x-auto border-y border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Class</th>
              <th className="px-3 py-2 text-left font-medium">Code</th>
              <th className="px-3 py-2 text-left font-medium">Class teacher</th>
              <th className="px-3 py-2 text-right font-medium">Students</th>
              <th className="px-3 py-2 text-right font-medium">Subjects</th>
              <th className="px-3 py-2 text-right font-medium">Teachers</th>
              <th className="px-3 py-2 text-left font-medium">Live room</th>
              <th className="px-3 py-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ grade, items }) => (
              <React.Fragment key={grade}>
                {items.length > 1 && (
                  <tr className="border-b border-border bg-muted/20">
                    <td colSpan={8} className="px-3 py-1.5 text-xs font-medium text-foreground">
                      {grade}
                    </td>
                  </tr>
                )}
                {items.map(({ klass }) => {
                  const stat = stats.get(klass.id) ?? NO_STAT
                  const room = roomState(klass)
                  return (
                    <tr
                      key={klass.id}
                      onClick={() => onOpen(klass)}
                      className="cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-primary/5"
                    >
                      <td className="max-w-xs px-3 py-2">
                        <span className="block truncate font-medium text-foreground">{klass.name}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{klass.code}</td>
                      <td className="max-w-[12rem] truncate px-3 py-2">
                        {leadsOf(klass.id).length > 0 ? (
                          leadsOf(klass.id).map((l) => tidy(l.teacher.full_name)).join(', ')
                        ) : chart.data ? (
                          <span className="text-warning">Not assigned</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', stat.studentCount === 0 && 'text-warning')}>
                        {stat.studentCount}
                      </td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', stat.subjectCount === 0 && 'text-warning')}>
                        {stat.subjectCount}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{stat.teacherCount}</td>
                      <td className="px-3 py-2">
                        <StateDot tone={room.tone} label={room.label} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-1 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${klass.name}`} onClick={() => onEdit(klass)}>
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${klass.name}`} onClick={() => onDelete(klass)}>
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ================================================================ one class

/**
 * The class's standing live-class room.
 *
 * One room per class, inside the LMS: students join it and stay, and every
 * subject teacher joins the same room at their period. A room is created on
 * its own the first time a period is scheduled, so this section is for
 * setting one up ahead of time, choosing a link the school already has,
 * repairing a failed one, or removing it.
 *
 * An LMS room's `room_link` is a relative app path (`/call/class/{id}`); a
 * pasted link is a full https URL. A class still carrying an old Google Meet
 * room (`room_provider: 'GOOGLE_MEET'`) has no working room until it is
 * replaced.
 */
function RoomPanel({ klass }: { klass: ClassRoomOut }) {
  const setup = useSetupClassRoom()
  const clear = useClearClassRoom()
  const { copied, copy } = useCopyToClipboard()
  const [linkOpen, setLinkOpen] = React.useState(false)
  const [link, setLink] = React.useState('')
  const [confirming, setConfirming] = React.useState<'replace' | 'remove' | null>(null)

  const busy = setup.isPending || clear.isPending
  const isLegacy = klass.room_provider === 'GOOGLE_MEET'
  const hasRoom = !!klass.room_link && !isLegacy
  const isLms = klass.room_provider === 'AZURE_ACS'
  const room = roomState(klass)

  const saveLink = async () => {
    const value = link.trim()
    if (!/^https?:\/\//i.test(value)) return
    try {
      await setup.mutateAsync({ classId: klass.id, body: { manual_link: value, replace: isLegacy || undefined } })
      setLinkOpen(false)
      setLink('')
    } catch {
      /* reported by the mutation */
    }
  }

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-border">
        <div className="py-3 pr-4">
          <dt className="text-xs text-muted-foreground">Status</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            <StateDot tone={room.tone} label={room.label} />
          </dd>
        </div>
        <div className="py-3 sm:px-4">
          <dt className="text-xs text-muted-foreground">Kind</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {hasRoom ? (isLms ? 'In the LMS' : 'External link') : '—'}
          </dd>
        </div>
        <div className="py-3 sm:px-4">
          <dt className="text-xs text-muted-foreground">Recording</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {isLms && klass.room_recording_status ? recordingLabel(klass.room_recording_status) : '—'}
          </dd>
        </div>
      </dl>

      {hasRoom ? (
        <div className="flex items-center gap-2 bg-muted/40 px-3 py-2">
          <Video className="size-4 shrink-0 text-primary" />
          <a
            href={klass.room_link as string}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
          >
            {isLms ? 'Class room in the LMS' : klass.room_link}
          </a>
          <Button variant="ghost" size="icon-sm" aria-label="Copy the room link" onClick={() => void copy(shareableLink(klass.room_link))}>
            {copied ? <Check className="text-success" /> : <Copy />}
          </Button>
          <Button asChild variant="ghost" size="icon-sm" aria-label="Open the room">
            <a href={klass.room_link as string} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
            </a>
          </Button>
        </div>
      ) : isLegacy ? (
        <p className="border-l-2 border-warning bg-warning/5 px-3 py-2 text-sm">
          This class still has an old Google Meet room, which no longer works. Create a room in the LMS to replace it.
        </p>
      ) : klass.room_status === 'FAILED' && klass.room_error ? (
        <p className="border-l-2 border-danger bg-danger/5 px-3 py-2 text-sm text-danger">
          The class room could not be created: {klass.room_error}
        </p>
      ) : null}

      <p className="text-sm text-muted-foreground">
        {hasRoom
          ? 'Every period of this class happens here. Students join once and stay; each teacher joins at their period.'
          : 'No room yet. One is created on its own about 30 minutes before the first period of the day, and sooner when a teacher schedules or joins a period. You can also set it up now.'}
      </p>

      <div className="flex flex-wrap gap-2">
        {hasRoom ? (
          <>
            {isLms && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirming('replace')}>
                <RefreshCw />
                New room
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setLinkOpen((v) => !v)}>
              <LinkIcon />
              Use a different link
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming('remove')}>
              <Trash2 />
              Remove
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              loading={setup.isPending && !linkOpen}
              disabled={busy}
              onClick={() => setup.mutate({ classId: klass.id, body: isLegacy ? { replace: true } : {} })}
            >
              <Video />
              Create room in the LMS
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setLinkOpen((v) => !v)}>
              <LinkIcon />
              Use a link I have
            </Button>
          </>
        )}
      </div>

      {linkOpen && (
        <div className="flex max-w-xl items-center gap-2">
          <Input
            className={COMPACT_INPUT}
            placeholder="https://zoom.us/j/1234567890 or a Teams link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveLink()
            }}
          />
          <Button size="sm" loading={setup.isPending} disabled={!/^https?:\/\//i.test(link.trim())} onClick={() => void saveLink()}>
            Save
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirming === 'replace'}
        onOpenChange={(v) => !v && setConfirming(null)}
        title="Create a new room for this class?"
        description="Anyone in the current room is disconnected. Every period from now on uses the new room, and students reach it from the app as before."
        confirmLabel="Create new room"
        loading={setup.isPending}
        onConfirm={() => setup.mutate({ classId: klass.id, body: { replace: true } }, { onSettled: () => setConfirming(null) })}
      />
      <ConfirmDialog
        open={confirming === 'remove'}
        onOpenChange={(v) => !v && setConfirming(null)}
        title="Remove this class's room?"
        description="The link stops working. A new room is created on its own the next time a period is scheduled for the class."
        confirmLabel="Remove room"
        destructive
        loading={clear.isPending}
        onConfirm={() => clear.mutate(klass.id, { onSettled: () => setConfirming(null) })}
      />
    </div>
  )
}

/** Title case for names stored in capitals: "ART & CRAFT" reads as "Art & Craft". */
function tidy(name: string) {
  // Short names are codes, not words: IT, SST, GK stay as they are.
  if (name.replace(/[^A-Za-z]/g, '').length <= 4) return name
  return name === name.toUpperCase() && /[A-Z]{2}/.test(name)
    ? name.toLowerCase().replace(/(^|[\s(/&-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase())
    : name
}

/**
 * Who teaches what in the class. "By subject" is one line per subject with its
 * teacher; "By teacher" puts each teacher once with their subjects beside them,
 * which shows at a glance who carries the most periods.
 */
function SubjectsPanel({
  teaching,
  loading,
  classId,
  className,
  onRemove,
}: {
  teaching: TeacherMappingOut[]
  loading: boolean
  classId: number
  className: string
  onRemove: (m: TeacherMappingOut) => void
}) {
  const [view, setView] = React.useState<'subject' | 'teacher'>('subject')
  const subjectsQuery = useSubjects()
  const teachersQuery = useTeachingStaff()
  const createMapping = useCreateMapping()
  const deleteMapping = useDeleteMapping()
  const [subjectId, setSubjectId] = React.useState<string | null>(null)
  const [teacherId, setTeacherId] = React.useState<string | null>(null)
  /** The row whose teacher is being changed, and the teacher picked for it. */
  const [changing, setChanging] = React.useState<{ id: number; teacherId: string | null } | null>(null)

  const teacherOptions = (teachersQuery.data ?? [])
    .filter((t) => t.is_active)
    .map((t) => ({ value: String(t.id), label: tidy(t.full_name), hint: t.email, keywords: t.employee_id ?? '' }))

  // Subjects the class does not have yet come first; the rest say who has them.
  const takenBy = new Map<number, string[]>()
  for (const m of teaching) takenBy.set(m.subject.id, [...(takenBy.get(m.subject.id) ?? []), tidy(m.teacher.full_name)])
  const subjectOptions = [...(subjectsQuery.data ?? [])]
    .sort((a, b) => Number(takenBy.has(a.id)) - Number(takenBy.has(b.id)) || a.name.localeCompare(b.name))
    .map((sub) => ({
      value: String(sub.id),
      label: tidy(sub.name),
      hint: takenBy.has(sub.id) ? `${sub.code} · taught by ${takenBy.get(sub.id)!.join(', ')}` : sub.code,
      keywords: sub.code,
    }))

  const allocate = async () => {
    if (!subjectId || !teacherId) return
    // A duplicate POST returns the existing row with status 201, so the only
    // honest way to report "already allocated" is to check before sending.
    if (teaching.some((m) => String(m.subject.id) === subjectId && String(m.teacher.id) === teacherId)) {
      toast.info('That teacher already takes this subject here.')
      return
    }
    try {
      await createMapping.mutateAsync({ teacher_id: Number(teacherId), subject_id: Number(subjectId), class_id: classId })
      const subject = subjectsQuery.data?.find((x) => String(x.id) === subjectId)
      const teacher = teachersQuery.data?.find((x) => String(x.id) === teacherId)
      toast.success(`${tidy(teacher?.full_name ?? 'The teacher')} now teaches ${tidy(subject?.name ?? 'the subject')} in ${className}`)
      setSubjectId(null)
      setTeacherId(null)
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? 'Could not allocate the teacher.')
    }
  }

  /**
   * There is no edit for a mapping, so a change of teacher is the new pairing
   * first and then the old one removed: if the second step fails, the subject
   * still has a teacher.
   */
  const changeTeacher = async (m: TeacherMappingOut) => {
    if (!changing?.teacherId || changing.teacherId === String(m.teacher.id)) {
      setChanging(null)
      return
    }
    try {
      if (!teaching.some((x) => x.subject.id === m.subject.id && String(x.teacher.id) === changing.teacherId)) {
        await createMapping.mutateAsync({ teacher_id: Number(changing.teacherId), subject_id: m.subject.id, class_id: classId })
      }
      await deleteMapping.mutateAsync(m.id)
      toast.success(`${tidy(m.subject.name)} has a new teacher`)
      setChanging(null)
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? 'Could not change the teacher.')
    }
  }

  const byTeacher = React.useMemo(() => {
    const map = new Map<number, { teacher: TeacherMappingOut['teacher']; rows: TeacherMappingOut[] }>()
    for (const m of teaching) {
      if (!map.has(m.teacher.id)) map.set(m.teacher.id, { teacher: m.teacher, rows: [] })
      map.get(m.teacher.id)!.rows.push(m)
    }
    return [...map.values()].sort((x, y) => y.rows.length - x.rows.length || x.teacher.full_name.localeCompare(y.teacher.full_name))
  }, [teaching])
  const load = new Map(byTeacher.map((t) => [t.teacher.id, t.rows.length]))

  const removeButton = (m: TeacherMappingOut) => (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground opacity-40 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
      aria-label={`Remove ${m.subject.name} from ${className}`}
      onClick={() => onRemove(m)}
    >
      <X />
    </Button>
  )

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Segmented
            size="sm"
            layoutId="subjects-view"
            aria-label="Arrange by"
            value={view}
            onChange={setView}
            options={[
              { value: 'subject', label: 'By subject' },
              { value: 'teacher', label: 'By teacher' },
            ]}
          />
          <span className="text-xs text-muted-foreground">
            {countLabel(teaching.length, 'subject')} · {countLabel(byTeacher.length, 'teacher')}
          </span>
        </div>
        <Link to="/admin/subjects" className="text-xs text-muted-foreground hover:text-primary">
          Subjects &amp; Teachers
        </Link>
      </div>

      {/* Allocate without leaving the class: subject, teacher, done. */}
      <div className="grid gap-2 border-l-2 border-primary bg-primary/[0.04] px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
        <Combobox
          id="allocate-subject"
          value={subjectId}
          onChange={setSubjectId}
          options={subjectOptions}
          placeholder={subjectsQuery.isPending ? 'Loading subjects…' : 'Subject'}
          searchPlaceholder="Search by name or code"
          emptyMessage="No subjects found. Add them under Subjects."
          className="h-8 bg-card text-sm"
        />
        <Combobox
          id="allocate-teacher"
          value={teacherId}
          onChange={setTeacherId}
          options={teacherOptions}
          placeholder={teachersQuery.isPending ? 'Loading teachers…' : 'Teacher'}
          searchPlaceholder="Search by name or email"
          emptyMessage="No teachers found. Create one under Teachers."
          className="h-8 bg-card text-sm"
        />
        <Button size="sm" disabled={!subjectId || !teacherId} loading={createMapping.isPending && !changing} onClick={() => void allocate()}>
          <Plus />
          Allocate
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-32" />
      ) : teaching.length === 0 ? (
        <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">
          No subjects allocated yet. Pick a subject and a teacher above
        </p>
      ) : view === 'subject' ? (
        <div className="border-y border-border">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_2rem] gap-4 border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
            <span>Subject</span>
            <span>Teacher</span>
            <span />
          </div>
          <ul className="divide-y divide-border">
            {teaching.map((m) => {
              const count = load.get(m.teacher.id) ?? 1
              return (
                <li
                  key={m.id}
                  className="group grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_2rem] items-center gap-4 px-3 py-1.5 transition-colors hover:bg-muted/30"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="w-[4.5rem] shrink-0 truncate rounded bg-primary/8 px-1.5 py-0.5 text-center font-mono text-[11px] text-primary">
                      {m.subject.code}
                    </span>
                    <span className="truncate text-sm font-medium text-foreground">{tidy(m.subject.name)}</span>
                  </span>
                  {changing?.id === m.id ? (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Combobox
                        value={changing.teacherId}
                        onChange={(v) => setChanging({ id: m.id, teacherId: v })}
                        options={teacherOptions.filter((o) => o.value !== String(m.teacher.id))}
                        placeholder="New teacher"
                        searchPlaceholder="Search by name or email"
                        className="h-7 min-w-0 flex-1 text-sm"
                      />
                      <Button
                        size="xs"
                        disabled={!changing.teacherId}
                        loading={createMapping.isPending || deleteMapping.isPending}
                        onClick={() => void changeTeacher(m)}
                      >
                        Save
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => setChanging(null)}>
                        Cancel
                      </Button>
                    </span>
                  ) : (
                  <span className="flex min-w-0 items-center gap-2" title={m.teacher.email ?? undefined}>
                    <Avatar
                      name={m.teacher.full_name}
                      size="xs"
                      className={m.teacher.is_active ? undefined : 'opacity-50 grayscale'}
                    />
                    <span className={cn('truncate text-sm', m.teacher.is_active ? 'text-foreground' : 'text-muted-foreground line-through')}>
                      {tidy(m.teacher.full_name)}
                    </span>
                    {count > 1 && (
                      <span className="shrink-0 rounded bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                        {count} subjects
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="ml-auto shrink-0 text-muted-foreground opacity-40 transition-opacity hover:text-primary focus-visible:opacity-100 group-hover:opacity-100"
                      aria-label={`Change the teacher of ${m.subject.name}`}
                      title="Change teacher"
                      onClick={() => setChanging({ id: m.id, teacherId: null })}
                    >
                      <Repeat2 />
                    </Button>
                  </span>
                  )}
                  {removeButton(m)}
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {byTeacher.map(({ teacher, rows }) => (
            <li key={teacher.id} className="grid gap-2 px-3 py-2 sm:grid-cols-[16rem_minmax(0,1fr)] sm:items-center sm:gap-4">
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={teacher.full_name} size="sm" className={teacher.is_active ? undefined : 'opacity-50 grayscale'} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{tidy(teacher.full_name)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {countLabel(rows.length, 'subject')}
                    {teacher.email ? ` · ${teacher.email}` : ''}
                  </span>
                </span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                {rows.map((m) => (
                  <span
                    key={m.id}
                    className="group inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card pl-2 pr-0.5 text-sm"
                  >
                    <span className="font-mono text-[11px] text-primary">{m.subject.code}</span>
                    <span className="text-foreground">{tidy(m.subject.name)}</span>
                    <button
                      type="button"
                      onClick={() => onRemove(m)}
                      aria-label={`Remove ${m.subject.name} from ${className}`}
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
  )
}

/**
 * The teacher in charge of the class as a whole, on one line under its name.
 * Separate from subject teachers: a class teacher sees and can correct
 * everything filed against the class. A class may have more than one.
 *
 * Assigning promotes the teacher and signs them out so their new menu appears;
 * removing their last class demotes them the same way. The note says so.
 */
function ClassTeacherLine({ klass }: { klass: ClassRoomOut }) {
  const chart = useClassTeachers()
  const teachersQuery = useTeachingStaff()
  const assign = useAssignClassTeacher()
  const unassign = useDeleteClassTeacher()
  const [picking, setPicking] = React.useState(false)
  const [teacherId, setTeacherId] = React.useState<string | null>(null)
  const [removing, setRemoving] = React.useState<ClassTeacherMappingOut | null>(null)

  const leads = (chart.data ?? []).filter((c) => c.class_room.id === klass.id)
  const options = (teachersQuery.data ?? [])
    .filter((t) => t.is_active && !leads.some((l) => l.teacher.id === t.id))
    .map((t) => ({ value: String(t.id), label: tidy(t.full_name), hint: t.email, keywords: t.employee_id ?? '' }))

  const save = async () => {
    if (!teacherId) return
    try {
      await assign.mutateAsync({ teacher_id: Number(teacherId), class_id: klass.id })
      const t = teachersQuery.data?.find((x) => String(x.id) === teacherId)
      toast.success(`${tidy(t?.full_name ?? 'The teacher')} is now class teacher of ${klass.name}`)
      setPicking(false)
      setTeacherId(null)
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? 'Could not assign the class teacher.')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-border py-2.5">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <UserCog className="size-3.5" />
        Class teacher
      </span>

      {chart.isPending ? (
        <Skeleton className="h-6 w-40" />
      ) : (
        leads.map((l) => (
          <span key={l.id} className="group inline-flex h-7 items-center gap-2 rounded-md bg-primary/5 pl-1 pr-0.5 text-sm">
            <Avatar name={l.teacher.full_name} size="xs" />
            <span className="font-medium text-foreground" title={l.teacher.email ?? undefined}>
              {tidy(l.teacher.full_name)}
            </span>
            <button
              type="button"
              onClick={() => setRemoving(l)}
              aria-label={`Remove ${l.teacher.full_name} as class teacher`}
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-danger/10 hover:text-danger"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))
      )}

      {!chart.isPending && leads.length === 0 && !picking && (
        <span className="text-sm text-warning">Not assigned</span>
      )}

      {picking ? (
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:flex-nowrap">
          <Combobox
            id="class-teacher"
            value={teacherId}
            onChange={setTeacherId}
            options={options}
            placeholder={teachersQuery.isPending ? 'Loading teachers…' : 'Choose a teacher'}
            searchPlaceholder="Search by name or email"
            emptyMessage="No teachers found."
            className="h-7 w-full text-sm sm:w-64"
          />
          <Button size="xs" disabled={!teacherId} loading={assign.isPending} onClick={() => void save()}>
            Assign
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setPicking(false)}>
            Cancel
          </Button>
          <span className="text-xs text-muted-foreground">They are signed out once, so their class-teacher menu appears</span>
        </span>
      ) : (
        <Button variant={leads.length === 0 ? 'outline' : 'ghost'} size="xs" onClick={() => setPicking(true)}>
          <Plus />
          {leads.length === 0 ? 'Assign class teacher' : 'Add another'}
        </Button>
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={removing ? `Remove ${tidy(removing.teacher.full_name)} as class teacher?` : 'Remove class teacher?'}
        description="They stop seeing and correcting everything filed against this class. If it was their only class, they go back to an ordinary teacher and are signed out once. Their subjects here are not affected."
        confirmLabel="Remove"
        destructive
        loading={unassign.isPending}
        onConfirm={() => {
          if (!removing) return
          unassign.mutate(removing.id, { onSettled: () => setRemoving(null) })
        }}
      />
    </div>
  )
}

/**
 * Enrolling students, from inside the class. Students in no class are listed
 * first; ticking a student who is in another class moves them here, because a
 * student only ever sees one class (the backend reads their first enrollment).
 * No batch endpoint exists, so the requests go one at a time with progress.
 */
function EnrollPanel({
  klass,
  enrollments,
  onClose,
}: {
  klass: ClassRoomOut
  enrollments: StudentEnrollmentOut[]
  onClose: () => void
}) {
  const studentsQuery = useUsers('STUDENT')
  const createEnrollment = useCreateEnrollment()
  const deleteEnrollment = useDeleteEnrollment()
  const batch = useBatchRunner<{ studentId: number; previous: number[] }>()
  const [search, setSearch] = React.useState('')
  const [selected, setSelected] = React.useState<Set<number>>(new Set())

  /** studentId -> their current enrollments elsewhere. */
  const elsewhere = React.useMemo(() => {
    const map = new Map<number, StudentEnrollmentOut[]>()
    for (const e of enrollments) {
      if (e.class_room.id === klass.id) continue
      map.set(e.student.id, [...(map.get(e.student.id) ?? []), e])
    }
    return map
  }, [enrollments, klass.id])
  const here = React.useMemo(
    () => new Set(enrollments.filter((e) => e.class_room.id === klass.id).map((e) => e.student.id)),
    [enrollments, klass.id],
  )

  const needle = search.trim().toLowerCase()
  const candidates = (studentsQuery.data ?? [])
    .filter((st) => st.is_active && !here.has(st.id))
    .filter((st) => !needle || `${st.full_name} ${st.email}`.toLowerCase().includes(needle))
    .sort((x, y) => Number(elsewhere.has(x.id)) - Number(elsewhere.has(y.id)) || x.full_name.localeCompare(y.full_name))
  const free = candidates.filter((st) => !elsewhere.has(st.id))
  const moving = [...selected].filter((id) => elsewhere.has(id)).length

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const submit = async () => {
    const entries = [...selected].map((id) => {
      const st = studentsQuery.data?.find((x) => x.id === id)
      return {
        key: String(id),
        label: st?.full_name ?? `Student ${id}`,
        payload: { studentId: id, previous: (elsewhere.get(id) ?? []).map((e) => e.id) },
      }
    })
    const { succeeded, failed } = await batch.run(entries, async ({ studentId, previous }) => {
      for (const enrollmentId of previous) await deleteEnrollment.mutateAsync(enrollmentId)
      await createEnrollment.mutateAsync({ student_id: studentId, class_id: klass.id })
    })
    if (failed === 0) {
      toast.success(`${countLabel(succeeded, 'student')} added to ${klass.name}`)
      onClose()
    } else {
      toast.warning(`${succeeded} added, ${failed} failed. Check the list and try again.`)
      setSelected(new Set())
    }
  }

  return (
    <div className="space-y-3 border-l-2 border-primary bg-primary/[0.03] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">Enroll students in {klass.name}</h3>
          <p className="text-xs text-muted-foreground">
            {countLabel(free.length, 'student')} not in any class{needle ? ' match' : ''}. Ticking a student from another class moves them here
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" disabled={batch.running}>
          <X />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a student"
            aria-label="Find a student to enroll"
            className={cn(COMPACT_INPUT, 'bg-card pl-8')}
          />
        </div>
        {free.length > 0 && (
          <Button variant="outline" size="xs" onClick={() => setSelected(new Set([...selected, ...free.map((st) => st.id)]))}>
            Tick all not in a class
          </Button>
        )}
        {selected.size > 0 && (
          <Button variant="ghost" size="xs" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        )}
      </div>

      {studentsQuery.isPending ? (
        <Skeleton className="h-32" />
      ) : (
        <ul className="max-h-64 divide-y divide-border overflow-y-auto border-y border-border bg-card">
          {candidates.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No students to add</li>}
          {candidates.map((st) => {
            const other = elsewhere.get(st.id)
            return (
              <li key={st.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-muted/40">
                  <Checkbox checked={selected.has(st.id)} onCheckedChange={() => toggle(st.id)} />
                  <span className="min-w-0 flex-1">
                    <PersonLine name={st.full_name} email={st.email} />
                  </span>
                  {other ? (
                    <span className="shrink-0 text-xs text-warning">
                      {selected.has(st.id) ? 'Moves from ' : 'In '}
                      {other.map((e) => e.class_room.name).join(', ')}
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">Not in a class</span>
                  )}
                </label>
              </li>
            )
          })}
        </ul>
      )}

      <BatchProgress items={batch.items} percent={batch.percent} done={batch.done} total={batch.total} />

      <div className="flex flex-wrap items-center justify-end gap-3">
        {moving > 0 && <span className="text-xs text-warning">{countLabel(moving, 'student')} will move from another class</span>}
        <Button size="sm" disabled={selected.size === 0} loading={batch.running} onClick={() => void submit()}>
          Enroll {selected.size > 0 ? selected.size : ''}
        </Button>
      </div>
    </div>
  )
}

/**
 * A new student, straight into this class: name, and optionally the admission
 * number and a guardian's phone. The email is made up by the server, as on the
 * full form; login details are sent later from the student list. Anything more
 * goes on the full form, which comes back here with the student enrolled.
 */
function NewStudentLine({ klass, onClose }: { klass: ClassRoomOut; onClose: () => void }) {
  const createUser = useCreateUser()
  const createEnrollment = useCreateEnrollment()
  const [name, setName] = React.useState('')
  const [admission, setAdmission] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [added, setAdded] = React.useState<string[]>([])
  const nameRef = React.useRef<HTMLInputElement>(null)

  const save = async () => {
    const fullName = name.trim()
    if (fullName.length < 2) {
      nameRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      const created = await createUser.mutateAsync({
        full_name: fullName,
        role: 'STUDENT',
        programs: ['LMS'],
        email: null,
        password: null,
        ...(admission.trim() && { admission_number: admission.trim() }),
        ...(phone.trim() && { guardian_phone: phone.trim() }),
      })
      try {
        await createEnrollment.mutateAsync({ student_id: created.id, class_id: klass.id })
      } catch {
        toast.warning(`${fullName} was created but not enrolled. Use Enroll students to add them.`)
      }
      setAdded((prev) => [fullName, ...prev])
      setName('')
      setAdmission('')
      setPhone('')
      nameRef.current?.focus()
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? 'Could not create the student.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 border-l-2 border-success bg-success/[0.04] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">New student in {klass.name}</h3>
          <p className="text-xs text-muted-foreground">
            Creates the account and enrolls it here. Press Enter to add the next one
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>
      <form
        className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Input ref={nameRef} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" aria-label="Full name" className={cn(COMPACT_INPUT, 'bg-card')} />
        <Input value={admission} onChange={(e) => setAdmission(e.target.value)} placeholder="Admission no. (optional)" aria-label="Admission number" className={cn(COMPACT_INPUT, 'bg-card')} />
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Guardian phone (optional)" aria-label="Guardian phone" className={cn(COMPACT_INPUT, 'bg-card')} />
        <Button type="submit" size="sm" disabled={name.trim().length < 2} loading={busy}>
          <Plus />
          Add
        </Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-success">{added.length > 0 && `Added: ${added.join(', ')}`}</span>
        <Link to={`/admin/users/new?role=STUDENT&class_id=${klass.id}`} className="text-muted-foreground hover:text-primary">
          Need more details? Open the full form
        </Link>
      </div>
    </div>
  )
}

/**
 * The class roster. Tick students to move them to another class or take them
 * out together; "Enroll students" opens the panel above the list.
 */
function StudentsPanel({
  klass,
  roster,
  enrollments,
  loading,
  onRemove,
}: {
  klass: ClassRoomOut
  roster: StudentEnrollmentOut[]
  enrollments: StudentEnrollmentOut[]
  loading: boolean
  onRemove: (e: StudentEnrollmentOut) => void
}) {
  const classesQuery = useClasses()
  const createEnrollment = useCreateEnrollment()
  const deleteEnrollment = useDeleteEnrollment()
  const batch = useBatchRunner<StudentEnrollmentOut>()
  const [enrolling, setEnrolling] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  const [moveTo, setMoveTo] = React.useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = React.useState(false)

  const needle = search.trim().toLowerCase()
  const shown = needle
    ? roster.filter((e) => `${e.student.full_name} ${e.student.email ?? ''}`.toLowerCase().includes(needle))
    : roster
  const picked = roster.filter((e) => selected.has(e.id))
  const allShown = shown.length > 0 && shown.every((e) => selected.has(e.id))

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const run = async (perform: (e: StudentEnrollmentOut) => Promise<unknown>, done: string) => {
    const { succeeded, failed } = await batch.run(
      picked.map((e) => ({ key: String(e.id), label: e.student.full_name, payload: e })),
      perform,
    )
    if (failed === 0) toast.success(`${countLabel(succeeded, 'student')} ${done}`)
    else toast.warning(`${succeeded} done, ${failed} failed. Check the list and try again.`)
    setSelected(new Set())
    setMoveTo(null)
  }

  const target = classesQuery.data?.find((c) => String(c.id) === moveTo)
  const move = () =>
    target &&
    void run(async (e) => {
      await deleteEnrollment.mutateAsync(e.id)
      await createEnrollment.mutateAsync({ student_id: e.student.id, class_id: target.id })
    }, `moved to ${target.name}`)

  return (
    <section className="space-y-3">
      {creating && <NewStudentLine klass={klass} onClose={() => setCreating(false)} />}
      {enrolling && <EnrollPanel klass={klass} enrollments={enrollments} onClose={() => setEnrolling(false)} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{selected.size} selected</span>
            <Combobox
              value={moveTo}
              onChange={setMoveTo}
              options={[...(classesQuery.data ?? [])]
                .filter((c) => c.id !== klass.id)
                .sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }))
                .map((c) => ({ value: String(c.id), label: c.name, hint: c.code }))}
              placeholder="Move to class"
              searchPlaceholder="Search classes"
              className="h-8 w-48 text-sm"
            />
            <Button size="sm" disabled={!target} loading={batch.running && !!target} onClick={move}>
              Move
            </Button>
            <Button variant="outline" size="sm" disabled={batch.running} onClick={() => setConfirmRemove(true)}>
              <UserMinus />
              Un-enroll
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        ) : (
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a student"
              aria-label="Find a student"
              className={cn(COMPACT_INPUT, 'pl-8')}
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          {!creating && (
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              <UserPlus />
              New student
            </Button>
          )}
          {!enrolling && (
            <Button size="sm" onClick={() => setEnrolling(true)}>
              <Plus />
              Enroll existing
            </Button>
          )}
        </div>
      </div>

      <BatchProgress items={batch.items} percent={batch.percent} done={batch.done} total={batch.total} />

      {loading ? (
        <Skeleton className="h-32" />
      ) : shown.length === 0 ? (
        <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">
          {roster.length === 0 ? 'No students yet. Add a new student, or enroll existing ones' : 'No student matches'}
        </p>
      ) : (
        <div className="overflow-x-auto border-y border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="w-9 px-3 py-2">
                  <Checkbox
                    checked={allShown}
                    onCheckedChange={(v) =>
                      setSelected((prev) => {
                        const next = new Set(prev)
                        for (const e of shown) {
                          if (v === true) next.add(e.id)
                          else next.delete(e.id)
                        }
                        return next
                      })
                    }
                    aria-label="Select every student shown"
                  />
                </th>
                <th className="w-10 px-1 py-2 text-right font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Student</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((e, i) => (
                <tr key={e.id} className={cn('hover:bg-muted/30', selected.has(e.id) && 'bg-primary/5')}>
                  <td className="px-3 py-1.5">
                    <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)} aria-label={`Select ${e.student.full_name}`} />
                  </td>
                  <td className="px-1 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="max-w-0 px-3 py-1.5">
                    <Link to={`/admin/users/${e.student.id}`} className="block hover:text-primary">
                      <PersonLine name={e.student.full_name} email={e.student.email} inactive={!e.student.is_active} />
                    </Link>
                  </td>
                  <td className="px-3 py-1.5">
                    <StateDot tone={e.student.is_active ? 'success' : 'neutral'} label={e.student.is_active ? 'Active' : 'Inactive'} />
                  </td>
                  <td className="w-10 px-3 py-0.5 text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Un-enroll ${e.student.full_name} from ${klass.name}`}
                      onClick={() => onRemove(e)}
                    >
                      <UserMinus />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={(v) => !v && !batch.running && setConfirmRemove(false)}
        title={`Un-enroll ${countLabel(picked.length, 'student')} from ${klass.name}?`}
        description="They lose access to this class and drop off its roster. Their attendance and marks are kept, and they can be enrolled again at any time."
        confirmLabel="Un-enroll"
        destructive
        loading={batch.running}
        onConfirm={async () => {
          await run((e) => deleteEnrollment.mutateAsync(e.id), `un-enrolled from ${klass.name}`)
          setConfirmRemove(false)
        }}
      />
    </section>
  )
}

function ClassDetail({
  klass,
  stat,
  onEdit,
  onDelete,
}: {
  klass: ClassRoomOut
  stat: Stat
  onEdit: () => void
  onDelete: () => void
}) {
  const enrollmentsQuery = useEnrollments()
  const mappingsQuery = useMappings()
  const deleteMapping = useDeleteMapping()
  const deleteEnrollment = useDeleteEnrollment()
  const [tab, setTab] = React.useState<DetailTab>('students')

  /** Both removals are confirmed, so each holds the row it is asking about. */
  const [removingSubject, setRemovingSubject] = React.useState<TeacherMappingOut | null>(null)
  const [removingStudent, setRemovingStudent] = React.useState<StudentEnrollmentOut | null>(null)

  const roster = (enrollmentsQuery.data ?? [])
    .filter((e) => e.class_room.id === klass.id)
    .sort((a, b) => a.student.full_name.localeCompare(b.student.full_name))
  const teaching = (mappingsQuery.data ?? [])
    .filter((m) => m.class_room.id === klass.id)
    .sort((a, b) => a.subject.name.localeCompare(b.subject.name))
  const room = roomState(klass)
  const gaps = missing(klass, stat)
  const { grade, section } = splitSection(klass.name)

  const tabs: { key: DetailTab; label: string; icon: LucideIcon; count?: number; tone?: Tone }[] = [
    { key: 'students', label: 'Students', icon: Users, count: roster.length },
    { key: 'subjects', label: 'Subjects & teachers', icon: BookOpen, count: teaching.length },
    { key: 'room', label: 'Live room', icon: Video, tone: room.tone },
  ]

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------- head */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {section && <p className="text-xs font-medium text-muted-foreground">{grade}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-medium tracking-tight text-foreground">{klass.name}</h2>
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{klass.code}</span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {countLabel(stat.studentCount, 'student')} · {countLabel(stat.subjectCount, 'subject')} ·{' '}
            {countLabel(stat.teacherCount, 'teacher')}
            {klass.description ? ` · ${klass.description}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil />
            Edit
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${klass.name}`} onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      </div>

      <ClassTeacherLine klass={klass} />

      {gaps.length > 0 && (
        <p className="border-l-2 border-warning bg-warning/5 px-3 py-2 text-sm text-foreground">
          Not ready to teach: {gaps.join(', ')}.
        </p>
      )}

      {/* ------------------------------------------------------------- tabs */}
      <div role="tablist" aria-label={klass.name} className="sticky -top-5 z-10 flex items-stretch gap-1 overflow-x-auto border-b border-border bg-card [scrollbar-width:none]">
        {tabs.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={cn(
                'relative inline-flex h-10 shrink-0 items-center gap-2 px-3 text-sm transition-colors',
                active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <t.icon className="size-4" strokeWidth={1.75} />
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    'rounded px-1.5 text-xs tabular-nums',
                    active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {t.count}
                </span>
              )}
              {t.tone && <span className={cn('size-2 rounded-full', TONE_FILL[t.tone])} aria-hidden />}
              {active && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" aria-hidden />}
            </button>
          )
        })}
      </div>

      {/* --------------------------------------------------------- students */}
      {tab === 'students' && (
        <StudentsPanel
          klass={klass}
          roster={roster}
          enrollments={enrollmentsQuery.data ?? []}
          loading={enrollmentsQuery.isPending}
          onRemove={setRemovingStudent}
        />
      )}

      {/* ---------------------------------------------- subjects & teachers */}
      {tab === 'subjects' && (
        <SubjectsPanel
          teaching={teaching}
          loading={mappingsQuery.isPending}
          classId={klass.id}
          className={klass.name}
          onRemove={setRemovingSubject}
        />
      )}

      {tab === 'room' && <RoomPanel klass={klass} />}

      {/*
        Removing the mapping unlinks the teacher from the subject in this class.
        It is unguarded on the backend by design — attendance, topics, grades and
        anything else they already filed stays exactly where it is.
      */}
      <ConfirmDialog
        open={!!removingSubject}
        onOpenChange={(v) => !v && setRemovingSubject(null)}
        title={removingSubject ? `Remove ${removingSubject.subject.name} from ${klass.name}?` : 'Remove subject?'}
        description={
          removingSubject
            ? `${removingSubject.teacher.full_name} will stop teaching ${removingSubject.subject.name} to this class and it will disappear from their timetable and dashboards. Attendance, topics, materials and grades they already recorded are kept, and the subject can be assigned again at any time.`
            : undefined
        }
        confirmLabel="Remove subject"
        destructive
        loading={deleteMapping.isPending}
        onConfirm={() => {
          if (!removingSubject) return
          deleteMapping.mutate(removingSubject.id, { onSettled: () => setRemovingSubject(null) })
        }}
      />

      <ConfirmDialog
        open={!!removingStudent}
        onOpenChange={(v) => !v && setRemovingStudent(null)}
        title={removingStudent ? `Un-enroll ${removingStudent.student.full_name}?` : 'Un-enroll this student?'}
        description={
          removingStudent
            ? `They will lose access to ${klass.name} and drop off its roster. Their attendance and grade history is preserved, and they can be enrolled again at any time.`
            : undefined
        }
        confirmLabel="Un-enroll"
        destructive
        loading={deleteEnrollment.isPending}
        onConfirm={() => {
          if (!removingStudent) return
          deleteEnrollment.mutate(removingStudent.id, { onSettled: () => setRemovingStudent(null) })
        }}
      />
    </div>
  )
}

// ==================================================================== page

export default function AdminClassesPage() {
  const classesQuery = useClasses()
  const enrollmentsQuery = useEnrollments()
  const mappingsQuery = useMappings()
  const deleteClass = useDeleteClass()

  const [params] = useSearchParams()
  const [selectedId, setSelectedId] = React.useState<number | 'all'>(() => Number(params.get('class')) || 'all')
  const [form, setForm] = React.useState<{ editing: ClassRoomOut | null } | null>(null)
  const [deleting, setDeleting] = React.useState<ClassRoomOut | null>(null)

  // Counts joined client-side; the API offers no aggregate for this.
  const stats = React.useMemo(
    () => classStats(enrollmentsQuery.data ?? [], mappingsQuery.data ?? []),
    [enrollmentsQuery.data, mappingsQuery.data],
  )
  const statOf = (id: number) => stats.get(id) ?? NO_STAT

  const classes = React.useMemo(() => classesQuery.data ?? [], [classesQuery.data])
  const existingCodes = React.useMemo(() => new Set(classes.map((c) => c.code.toUpperCase())), [classes])

  // The detail reads the LIVE row, so a room created or removed from inside it
  // shows up straight away.
  const selected = selectedId === 'all' ? null : (classes.find((c) => c.id === selectedId) ?? null)

  const totalStudents = classes.reduce((n, k) => n + statOf(k.id).studentCount, 0)
  const roomsReady = classes.filter(hasWorkingRoom).length
  const notReady = classes.filter((k) => missing(k, statOf(k.id)).length > 0).length

  const select = (v: number | 'all') => {
    setSelectedId(v)
    setForm(null)
  }

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title="Classes & Students"
        description="Class sections students are enrolled into and teachers are assigned to. Each class has one live-class room every period of the day happens in"
        icon={Layers}
        actions={
          <Button size="sm" icon={<Plus />} onClick={() => setForm({ editing: null })}>
            New class
          </Button>
        }
      />

      <div className="-mt-6">
        <Figures>
          <Figure label="Classes" value={classesQuery.data ? String(classes.length) : '—'} context={`in ${countLabel(groupByGrade(classes).length, 'grade')}`} tone="primary" />
          <Figure
            label="Students enrolled"
            value={enrollmentsQuery.data ? String(totalStudents) : '—'}
            context={classes.length ? `about ${Math.round(totalStudents / classes.length)} a class` : undefined}
            tone="info"
          />
          <Figure label="Subjects taught" value={mappingsQuery.data ? String(mappingsQuery.data.length) : '—'} context="across all classes" tone="neutral" />
          <Figure label="Rooms ready" value={classesQuery.data ? `${roomsReady}/${classes.length}` : '—'} context="live-class rooms" tone="success" />
          <Figure
            label="Not ready"
            value={classesQuery.data ? String(notReady) : '—'}
            context="missing students, subjects or room"
            alert={notReady > 0}
            tone="warning"
          />
        </Figures>

        <QueryBoundary
          query={classesQuery}
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
                  {classes.length > 0 ? (
                    <ClassTree classes={classes} stats={stats} value={form ? -1 : selectedId} onChange={select} />
                  ) : (
                    <p className="px-6 py-8 text-center text-sm text-muted-foreground lg:pl-8">No classes yet</p>
                  )}
                </div>

                <section className="min-w-0 py-5 lg:min-h-0 lg:overflow-y-auto lg:pl-8 lg:pr-1">
                  {form ? (
                    <ClassForm
                      key={form.editing?.id ?? 'new'}
                      editing={form.editing}
                      existingCodes={existingCodes}
                      onClose={() => setForm(null)}
                      onCreated={(klass) => {
                        setForm(null)
                        setSelectedId(klass.id)
                      }}
                    />
                  ) : classes.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-base font-medium text-foreground">No classes yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Create your first class section, then assign teachers and enroll students
                      </p>
                      <Button size="sm" icon={<Plus />} className="mt-4" onClick={() => setForm({ editing: null })}>
                        New class
                      </Button>
                    </div>
                  ) : selected ? (
                    <ClassDetail
                      key={selected.id}
                      klass={selected}
                      stat={statOf(selected.id)}
                      onEdit={() => setForm({ editing: selected })}
                      onDelete={() => setDeleting(selected)}
                    />
                  ) : (
                    <ClassTable
                      classes={classes}
                      stats={stats}
                      onOpen={(k) => select(k.id)}
                      onEdit={(k) => setForm({ editing: k })}
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
        resourceLabel="class"
        resourceName={deleting?.name ?? ''}
        description="Enrollments, teacher assignments and every attendance record, topic, meeting, material and grade for this class point at it. It can't be deleted while any of these still exist."
        onDelete={async (force) => {
          await deleteClass.mutateAsync({ classId: deleting!.id, force })
          if (selectedId === deleting!.id) setSelectedId('all')
        }}
      />
    </div>
  )
}

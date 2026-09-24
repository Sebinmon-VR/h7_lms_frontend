import { zodResolver } from '@hookform/resolvers/zod'
import {
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  Layers,
  LinkIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserMinus,
  Users,
  Video,
  X,
} from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import type { ClassRoomOut, StudentEnrollmentOut, TeacherMappingOut } from '@/api/types'
import {
  useClasses,
  useCreateClass,
  useDeleteClass,
  useDeleteEnrollment,
  useDeleteMapping,
  useEnrollments,
  useMappings,
  useUpdateClass,
} from '@/queries/admin.queries'
import {
  useClearClassRoom,
  useInviteRoomTeachers,
  useOpenClassRoom,
  useSetupClassRoom,
} from '@/queries/classes.queries'
import { classStats } from '@/lib/derive'
import { countLabel } from '@/lib/format'
import { useCopyToClipboard } from '@/lib/hooks'
import { recordingLabel } from '@/lib/recordings'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { DeleteResourceDialog } from '@/components/forms/delete-resource-dialog'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Field, FormError } from '@/components/forms/field'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { UserCell } from '@/components/domain/user-cell'
import { PageHeader } from '@/components/layout/page-header'

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

/**
 * One dialog for both create and edit. `editing` null means create.
 *
 * The edit path sends only the fields that actually changed: the backend
 * rejects an entirely empty update body with a 400, and every omitted field is
 * left untouched.
 */
function ClassFormDialog({
  open,
  onOpenChange,
  editing,
  existingCodes,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: ClassRoomOut | null
  existingCodes: Set<string>
}) {
  const createClass = useCreateClass()
  const updateClass = useUpdateClass()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', code: '', description: '' },
  })

  React.useEffect(() => {
    if (!open) return
    form.reset({
      name: editing?.name ?? '',
      code: editing?.code ?? '',
      description: editing?.description ?? '',
    })
  }, [open, editing, form])

  const onSubmit = async (values: FormValues) => {
    const description = values.description?.trim() ?? ''

    // Pre-check so the user gets a field-level error rather than a 400 toast.
    // A class keeping its own code is not a clash.
    const codeTaken =
      existingCodes.has(values.code.toUpperCase()) &&
      values.code.toUpperCase() !== editing?.code.toUpperCase()
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
        if (Object.keys(patch).length === 0) {
          onOpenChange(false)
          return
        }
        await updateClass.mutateAsync({ classId: editing.id, body: patch })
      } else {
        await createClass.mutateAsync({
          name: values.name,
          code: values.code,
          description: description || null,
        })
      }
      onOpenChange(false)
    } catch (error) {
      form.setError('root', {
        message:
          (error as { message?: string })?.message ??
          `Could not ${editing ? 'update' : 'create'} class.`,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit class' : 'Create a class'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Renaming a class updates it everywhere it appears — assignments, enrollments and reports.'
              : 'Class sections group the students you enroll and the teachers you assign.'}
          </DialogDescription>
        </DialogHeader>
        <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-5">
            <FormError message={form.formState.errors.root?.message} />
            <Field id="name" label="Class name" required error={form.formState.errors.name?.message}>
              <Input id="name" placeholder="Grade 10 — Section A" {...form.register('name')} />
            </Field>
            <Field
              id="code"
              label="Code"
              required
              error={form.formState.errors.code?.message}
              hint="A short unique identifier, e.g. CLASS-10A."
            >
              <Input id="code" placeholder="CLASS-10A" {...form.register('code')} />
            </Field>
            <Field id="description" label="Description" error={form.formState.errors.description?.message}>
              <Textarea id="description" rows={3} placeholder="Optional notes about this class" {...form.register('description')} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
              {editing ? 'Save changes' : 'Create class'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The class's standing live-class room.
 *
 * One Google Meet link per class: students join it and stay, and every
 * subject teacher joins the same room at their period. A room is created on
 * its own the first time a period is scheduled, so this section is for
 * setting one up ahead of time, choosing a link the school already has,
 * repairing a failed one, or removing it.
 */
function RoomSection({ klass }: { klass: ClassRoomOut }) {
  const setup = useSetupClassRoom()
  const clear = useClearClassRoom()
  const invite = useInviteRoomTeachers()
  const openRoom = useOpenClassRoom()
  const { copied, copy } = useCopyToClipboard()
  const [linkOpen, setLinkOpen] = React.useState(false)
  const [link, setLink] = React.useState('')
  const [confirming, setConfirming] = React.useState<'replace' | 'remove' | null>(null)

  React.useEffect(() => {
    setLinkOpen(false)
    setLink('')
    setConfirming(null)
  }, [klass.id])

  const busy = setup.isPending || clear.isPending
  const hasRoom = !!klass.room_link
  const isMeet = klass.room_provider === 'GOOGLE_MEET'

  const saveLink = async () => {
    const value = link.trim()
    if (!/^https?:\/\//i.test(value)) return
    try {
      await setup.mutateAsync({ classId: klass.id, body: { manual_link: value } })
      setLinkOpen(false)
      setLink('')
    } catch {
      /* reported by the mutation */
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Live-class room
      </h3>

      {hasRoom ? (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <Video className="size-4 shrink-0 text-primary" />
            <a
              href={klass.room_link as string}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
            >
              {klass.room_link}
            </a>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy the room link"
              onClick={() => void copy(klass.room_link as string)}
            >
              {copied ? <Check className="text-success" /> : <Copy />}
            </Button>
            <Button asChild variant="ghost" size="icon-sm" aria-label="Open the room">
              <a href={klass.room_link as string} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
              </a>
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={isMeet ? 'primary' : 'neutral'} size="sm">
              {isMeet ? 'Google Meet' : 'External link'}
            </Badge>
            {klass.room_owner_email && (
              <Badge tone="outline" size="sm">
                Hosted by {klass.room_owner_email}
              </Badge>
            )}
            {isMeet && klass.room_recording_status && (
              <Badge
                tone={klass.room_recording_status === 'ARMED' ? 'success' : 'warning'}
                size="sm"
              >
                {recordingLabel(klass.room_recording_status)}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Every period of this class happens here. Students join once and stay; each teacher
            joins at their period.
          </p>
          {isMeet && (
            <div
              className={
                klass.room_access_type === 'OPEN'
                  ? 'rounded-md border border-success/30 bg-success/8 px-3 py-2 text-xs'
                  : 'rounded-md border border-warning/40 bg-warning/8 px-3 py-2 text-xs'
              }
            >
              {klass.room_access_type === 'OPEN' ? (
                <p>
                  <span className="font-medium text-success">Open to anyone with the link.</span>{' '}
                  <span className="text-muted-foreground">
                    Teachers and students join without asking, whatever Google account they use.
                  </span>
                </p>
              ) : (
                <>
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      Not open yet — people outside the school domain are asked to join.
                    </span>
                    <Button
                      variant="outline"
                      size="xs"
                      loading={openRoom.isPending}
                      disabled={busy}
                      onClick={() => openRoom.mutate(klass.id)}
                    >
                      Open to anyone
                    </Button>
                  </p>
                  {klass.room_access_error && (
                    <p className="mt-1 text-muted-foreground">{klass.room_access_error}</p>
                  )}
                </>
              )}
            </div>
          )}
          {isMeet && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Users className="mr-1 inline size-3.5 text-muted-foreground" />
                  {countLabel(klass.room_guest_emails?.length ?? 0, 'teacher')} on the guest list
                  <span className="text-muted-foreground"> · by their LMS address</span>
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  loading={invite.isPending}
                  disabled={busy}
                  onClick={() => invite.mutate(klass.id)}
                >
                  <RefreshCw />
                  Invite teachers
                </Button>
              </p>
              {klass.room_guest_error && (
                <p className="mt-1 text-danger">Guest list not updated: {klass.room_guest_error}</p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {isMeet && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirming('replace')}>
                <RefreshCw />
                New Meet room
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
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
          {klass.room_status === 'FAILED' && klass.room_error ? (
            <p className="rounded-md border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">
              Google Meet could not create the room: {klass.room_error}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No room yet. The system creates one about 30 minutes before the class&rsquo;s first
              period of the day, and a teacher scheduling or joining a period creates it sooner.
              You can also set it up now.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={setup.isPending && !linkOpen}
              disabled={busy}
              onClick={() => setup.mutate({ classId: klass.id, body: {} })}
            >
              <Video />
              Create Google Meet room
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setLinkOpen((v) => !v)}>
              <LinkIcon />
              Use a link I have
            </Button>
          </div>
        </div>
      )}

      {linkOpen && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            placeholder="https://meet.google.com/… or a Zoom / Teams link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveLink()
            }}
          />
          <Button
            size="sm"
            loading={setup.isPending}
            disabled={!/^https?:\/\//i.test(link.trim())}
            onClick={() => void saveLink()}
          >
            Save
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirming === 'replace'}
        onOpenChange={(v) => !v && setConfirming(null)}
        title="Create a new Meet room for this class?"
        description="The current link stops working and its Calendar event is deleted. Every period from now on uses the new room, and students see the new link the next time they open the app."
        confirmLabel="Create new room"
        loading={setup.isPending}
        onConfirm={() =>
          setup.mutate(
            { classId: klass.id, body: { replace: true } },
            { onSettled: () => setConfirming(null) },
          )
        }
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
    </section>
  )
}

function ClassDetailSheet({ klass, onClose }: { klass: ClassRoomOut | null; onClose: () => void }) {
  const enrollmentsQuery = useEnrollments(!!klass)
  const mappingsQuery = useMappings(!!klass)
  const deleteMapping = useDeleteMapping()
  const deleteEnrollment = useDeleteEnrollment()

  /** Both removals are confirmed, so each holds the row it is asking about. */
  const [removingSubject, setRemovingSubject] = React.useState<TeacherMappingOut | null>(null)
  const [removingStudent, setRemovingStudent] = React.useState<StudentEnrollmentOut | null>(null)

  // Anything held open about the previous class is meaningless for this one.
  React.useEffect(() => {
    setRemovingSubject(null)
    setRemovingStudent(null)
  }, [klass?.id])

  const roster = (enrollmentsQuery.data ?? []).filter((e) => e.class_room.id === klass?.id)
  const teaching = (mappingsQuery.data ?? []).filter((m) => m.class_room.id === klass?.id)

  return (
    <>
      <Sheet open={!!klass} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle className="text-lg font-semibold">{klass?.name}</SheetTitle>
            <p className="text-sm text-muted-foreground">{klass?.code}</p>
          </SheetHeader>
          <SheetBody className="space-y-6">
            {klass?.description && (
              <p className="text-sm text-muted-foreground">{klass.description}</p>
            )}

            {klass && <RoomSection klass={klass} />}

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Subjects &amp; teachers ({teaching.length})
              </h3>
              {mappingsQuery.isPending ? (
                <Skeleton className="h-20 rounded-lg" />
              ) : teaching.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  No subjects assigned yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {teaching.map((m) => (
                    <li key={m.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{m.subject.name}</span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Badge tone="outline" size="sm">
                            {m.subject.code}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${m.subject.name} from ${klass?.name ?? 'this class'}`}
                            onClick={() => setRemovingSubject(m)}
                          >
                            <X />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2">
                        <UserCell
                          name={m.teacher.full_name}
                          email={m.teacher.email}
                          size="xs"
                          inactive={!m.teacher.is_active}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Enrolled students ({roster.length})
              </h3>
              {enrollmentsQuery.isPending ? (
                <Skeleton className="h-20 rounded-lg" />
              ) : roster.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  No students enrolled yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {roster.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center gap-2 rounded-lg border border-border p-2.5"
                    >
                      <span className="min-w-0 flex-1">
                        <UserCell
                          name={e.student.full_name}
                          email={e.student.email}
                          size="xs"
                          inactive={!e.student.is_active}
                        />
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        aria-label={`Un-enroll ${e.student.full_name} from ${klass?.name ?? 'this class'}`}
                        onClick={() => setRemovingStudent(e)}
                      >
                        <UserMinus />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </SheetBody>
        </SheetContent>
      </Sheet>

      {/*
        Removing the mapping unlinks the teacher from the subject in this class.
        It is unguarded on the backend by design — attendance, topics, grades and
        anything else they already filed stays exactly where it is.
      */}
      <ConfirmDialog
        open={!!removingSubject}
        onOpenChange={(v) => !v && setRemovingSubject(null)}
        title={
          removingSubject
            ? `Remove ${removingSubject.subject.name} from ${klass?.name ?? 'this class'}?`
            : 'Remove subject?'
        }
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
        title={
          removingStudent
            ? `Un-enroll ${removingStudent.student.full_name}?`
            : 'Un-enroll this student?'
        }
        description={
          removingStudent
            ? `They will lose access to ${klass?.name ?? 'this class'} and drop off its roster. Their attendance and grade history is preserved, and they can be enrolled again at any time.`
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
    </>
  )
}

export default function AdminClassesPage() {
  const classesQuery = useClasses()
  const enrollmentsQuery = useEnrollments()
  const mappingsQuery = useMappings()
  const deleteClass = useDeleteClass()

  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ClassRoomOut | null>(null)
  const [deleting, setDeleting] = React.useState<ClassRoomOut | null>(null)
  const [selected, setSelected] = React.useState<ClassRoomOut | null>(null)

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (klass: ClassRoomOut) => {
    setEditing(klass)
    setFormOpen(true)
  }

  // Counts joined client-side; the API offers no aggregate for this.
  const stats = React.useMemo(
    () => classStats(enrollmentsQuery.data ?? [], mappingsQuery.data ?? []),
    [enrollmentsQuery.data, mappingsQuery.data],
  )

  const existingCodes = React.useMemo(
    () => new Set((classesQuery.data ?? []).map((c) => c.code.toUpperCase())),
    [classesQuery.data],
  )

  // The sheet reads the LIVE row, not the object captured on click, so a room
  // created or removed from inside it shows up without closing and reopening.
  const selectedLive = React.useMemo(
    () => (selected ? (classesQuery.data?.find((c) => c.id === selected.id) ?? selected) : null),
    [selected, classesQuery.data],
  )

  return (
    <>
      <PageHeader
        title="Classes"
        description="Class sections students are enrolled into and teachers are assigned to. Each class has one live-class room that every period of the day happens in."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={openCreate}>
            New class
          </Button>
        }
      />

      <QueryBoundary
        query={classesQuery}
        loading={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={<Layers />}
            title="No classes yet"
            description="Create your first class section, then assign teachers and enroll students."
            action={
              <Button variant="primary" icon={<Plus />} onClick={openCreate}>
                New class
              </Button>
            }
          />
        }
      >
        {(classes) => (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((klass) => {
              const stat = stats.get(klass.id)
              return (
                <Card key={klass.id} interactive onClick={() => setSelected(klass)} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                      <Layers className="size-5" />
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge tone="outline" size="sm">
                        {klass.code}
                      </Badge>
                      {/* Contained so the menu does not also open the detail sheet. */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${klass.name}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openEdit(klass)}>
                              <Pencil />
                              Edit class
                            </DropdownMenuItem>
                            <DropdownMenuItem destructive onSelect={() => setDeleting(klass)}>
                              <Trash2 />
                              Delete class
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>

                  <h3 className="mt-3 truncate text-base font-semibold">{klass.name}</h3>
                  <p className="mt-1 line-clamp-2 min-h-8 text-sm text-muted-foreground">
                    {klass.description || 'No description'}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-3.5" />
                      {countLabel(stat?.studentCount ?? 0, 'student')}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <BookOpen className="size-3.5" />
                      {countLabel(stat?.subjectCount ?? 0, 'subject')}
                    </span>
                    {klass.room_link ? (
                      <span className="inline-flex items-center gap-1.5 text-success">
                        <Video className="size-3.5" />
                        Room ready
                      </span>
                    ) : klass.room_status === 'FAILED' ? (
                      <span className="inline-flex items-center gap-1.5 text-danger">
                        <Video className="size-3.5" />
                        Room failed
                      </span>
                    ) : null}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </QueryBoundary>

      <ClassFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        existingCodes={existingCodes}
      />
      <ClassDetailSheet klass={selectedLive} onClose={() => setSelected(null)} />

      <DeleteResourceDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        resourceLabel="class"
        resourceName={deleting?.name ?? ''}
        description="Enrollments, teacher assignments and every attendance record, topic, meeting, material and grade for this class point at it. The server checks first and will refuse if any still exist."
        onDelete={(force) => deleteClass.mutateAsync({ classId: deleting!.id, force })}
      />
    </>
  )
}

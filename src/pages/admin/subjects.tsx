import { zodResolver } from '@hookform/resolvers/zod'
import { BookOpen, GraduationCap, Layers, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import type { SubjectOut } from '@/api/types'
import {
  useCreateSubject,
  useDeleteSubject,
  useMappings,
  useSubjects,
  useUpdateSubject,
} from '@/queries/admin.queries'
import { subjectStats } from '@/lib/derive'
import { countLabel } from '@/lib/format'
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
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Field } from '@/components/forms/field'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { UserCell } from '@/components/domain/user-cell'
import { PageHeader } from '@/components/layout/page-header'

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

/** One dialog for create and edit; see the class page for the same pattern. */
function SubjectFormDialog({
  open,
  onOpenChange,
  editing,
  existingCodes,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: SubjectOut | null
  existingCodes: Set<string>
}) {
  const createSubject = useCreateSubject()
  const updateSubject = useUpdateSubject()
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

    const codeTaken =
      existingCodes.has(values.code.toUpperCase()) &&
      values.code.toUpperCase() !== editing?.code.toUpperCase()
    if (codeTaken) {
      form.setError('code', { message: 'A subject already uses this code.' })
      return
    }

    try {
      if (editing) {
        // Only changed fields — an empty update body is a 400.
        const patch = {
          ...(values.name !== editing.name && { name: values.name }),
          ...(values.code !== editing.code && { code: values.code }),
          ...(description !== (editing.description ?? '') && { description }),
        }
        if (Object.keys(patch).length === 0) {
          onOpenChange(false)
          return
        }
        await updateSubject.mutateAsync({ subjectId: editing.id, body: patch })
      } else {
        await createSubject.mutateAsync({
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
          `Could not ${editing ? 'update' : 'create'} subject.`,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit subject' : 'Create a subject'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Renaming a subject updates it everywhere it appears — assignments, materials and reports.'
              : 'Subjects are the catalogue you assign to classes and teachers.'}
          </DialogDescription>
        </DialogHeader>
        <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-4">
            {form.formState.errors.root && (
              <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
                {form.formState.errors.root.message}
              </p>
            )}
            <Field id="name" label="Subject name" required error={form.formState.errors.name?.message}>
              <Input id="name" placeholder="Mathematics" {...form.register('name')} />
            </Field>
            <Field
              id="code"
              label="Code"
              required
              error={form.formState.errors.code?.message}
              hint="A short unique identifier, e.g. MATH101."
            >
              <Input id="code" placeholder="MATH101" {...form.register('code')} />
            </Field>
            <Field id="description" label="Description" error={form.formState.errors.description?.message}>
              <Textarea
                id="description"
                rows={3}
                placeholder="Algebra, trigonometry and geometry"
                {...form.register('description')}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
              {editing ? 'Save changes' : 'Create subject'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

function SubjectDetailSheet({ subject, onClose }: { subject: SubjectOut | null; onClose: () => void }) {
  const mappingsQuery = useMappings(!!subject)
  const teaching = (mappingsQuery.data ?? []).filter((m) => m.subject.id === subject?.id)

  return (
    <Sheet open={!!subject} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold">{subject?.name}</SheetTitle>
          <p className="text-sm text-muted-foreground">{subject?.code}</p>
        </SheetHeader>
        <SheetBody className="space-y-6">
          {subject?.description && <p className="text-sm text-muted-foreground">{subject.description}</p>}

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Taught in ({teaching.length})
            </h3>
            {mappingsQuery.isPending ? (
              <Skeleton className="h-20 rounded-lg" />
            ) : teaching.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                This subject is not assigned to any class yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {teaching.map((m) => (
                  <li key={m.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{m.class_room.name}</span>
                      <Badge tone="outline" size="sm">
                        {m.class_room.code}
                      </Badge>
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
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

export default function AdminSubjectsPage() {
  const subjectsQuery = useSubjects()
  const mappingsQuery = useMappings()
  const deleteSubject = useDeleteSubject()

  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<SubjectOut | null>(null)
  const [deleting, setDeleting] = React.useState<SubjectOut | null>(null)
  const [selected, setSelected] = React.useState<SubjectOut | null>(null)

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (subject: SubjectOut) => {
    setEditing(subject)
    setFormOpen(true)
  }

  const stats = React.useMemo(() => subjectStats(mappingsQuery.data ?? []), [mappingsQuery.data])

  const existingCodes = React.useMemo(
    () => new Set((subjectsQuery.data ?? []).map((s) => s.code.toUpperCase())),
    [subjectsQuery.data],
  )

  return (
    <>
      <PageHeader
        title="Subjects"
        description="The subject catalogue. Assign a subject to a class and teacher under Assignments."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={openCreate}>
            New subject
          </Button>
        }
      />

      <QueryBoundary
        query={subjectsQuery}
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
            icon={<BookOpen />}
            title="No subjects yet"
            description="Add the subjects your institution teaches, then assign them to classes."
            action={
              <Button variant="primary" icon={<Plus />} onClick={openCreate}>
                New subject
              </Button>
            }
          />
        }
      >
        {(subjects) => (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((subject) => {
              const stat = stats.get(subject.id)
              return (
                <Card key={subject.id} interactive onClick={() => setSelected(subject)} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
                      <BookOpen className="size-5" />
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge tone="outline" size="sm">
                        {subject.code}
                      </Badge>
                      {/* Contained so the menu does not also open the detail sheet. */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${subject.name}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openEdit(subject)}>
                              <Pencil />
                              Edit subject
                            </DropdownMenuItem>
                            <DropdownMenuItem destructive onSelect={() => setDeleting(subject)}>
                              <Trash2 />
                              Delete subject
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>

                  <h3 className="mt-3 truncate text-base font-semibold">{subject.name}</h3>
                  <p className="mt-1 line-clamp-2 min-h-8 text-sm text-muted-foreground">
                    {subject.description || 'No description'}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Layers className="size-3.5" />
                      {countLabel(stat?.classCount ?? 0, 'class', 'classes')}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <GraduationCap className="size-3.5" />
                      {countLabel(stat?.teacherCount ?? 0, 'teacher')}
                    </span>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </QueryBoundary>

      <SubjectFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        existingCodes={existingCodes}
      />
      <SubjectDetailSheet subject={selected} onClose={() => setSelected(null)} />

      <DeleteResourceDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        resourceLabel="subject"
        resourceName={deleting?.name ?? ''}
        description="Teacher assignments and every attendance record, topic, meeting, material and grade filed under this subject reference it. The server checks first and will refuse if any still exist."
        onDelete={(force) => deleteSubject.mutateAsync({ subjectId: deleting!.id, force })}
      />
    </>
  )
}

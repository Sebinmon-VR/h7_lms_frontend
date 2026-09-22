import { zodResolver } from '@hookform/resolvers/zod'
import {
  Archive,
  Eye,
  Megaphone,
  Pencil,
  Pin,
  Plus,
  Send,
  Trash2,
  Users,
} from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import type {
  NoticeAudience,
  NoticeOut,
  NoticePriority,
  NoticeStatus,
  Program,
  UserRole,
} from '@/api/types'
import {
  useAdminNotices,
  useArchiveNotice,
  useCreateNotice,
  useDeleteNotice,
  usePublishNotice,
  useUpdateNotice,
} from '@/queries/notices.queries'
import { useClasses, useUsers } from '@/queries/admin.queries'
import { useTuitionUsers } from '@/queries/tuition.queries'
import { formatDateTime, formatRelative } from '@/lib/datetime'
import { countLabel } from '@/lib/format'
import { ALL_ROLES, ROLE_LABEL } from '@/lib/constants'
import {
  NOTICE_AUDIENCES,
  NOTICE_AUDIENCE_HINT,
  NOTICE_AUDIENCE_LABEL,
  NOTICE_PRIORITIES,
  NOTICE_PRIORITY_LABEL,
  NOTICE_PRIORITY_TONE,
  noticeVisibility,
  targetFieldFor,
} from '@/lib/school'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Field, FormError } from '@/components/forms/field'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'
import { Segmented } from '@/components/ui/segmented'

/**
 * Authoring the notice board.
 *
 * Two things shape this screen.
 *
 * **Audience decides which target list is read**, and the others are ignored
 * rather than combined. So the form shows exactly one picker at a time, and
 * switching audience leaves the old ids in place harmlessly — but a targeted
 * notice with an EMPTY list is refused at validation, because it would save
 * cleanly, look published, and reach nobody.
 *
 * **Visibility has two halves.** `status` is the author's decision;
 * `publish_at` / `expires_at` are the clock. Both are surfaced separately, and
 * the server hands back `is_live` / `is_scheduled` / `is_expired` already
 * resolved so "Scheduled for Friday" can be shown rather than a bare "not
 * visible".
 */

const noticeSchema = z.object({
  title: z.string().min(1, 'Give the notice a title').max(200),
  body: z.string().min(1, 'Write something').max(20000),
  audience: z.enum(['EVERYONE', 'ROLE', 'CLASS', 'USER']),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  publish_at: z.string(),
  expires_at: z.string(),
  is_pinned: z.boolean(),
  notify_by_email: z.boolean(),
  include_class_teachers: z.boolean(),
  include_parents: z.boolean(),
})

type NoticeValues = z.infer<typeof noticeSchema>

/**
 * What differs between the two boards, in one place.
 *
 * Tuition has no classes, so the CLASS audience is not offered there — the
 * backend refuses it anyway, because the ids would be the school's. The roles
 * on offer are the ones a tuition account can hold, and the people picker
 * lists tuition accounts rather than the whole school.
 */
const BOARD = {
  LMS: {
    title: 'Notice board',
    description:
      'Write, schedule and publish notices. Publishing reports how many accounts it actually reached — a class notice that reaches nobody is almost always a class nobody is enrolled in.',
    audiences: NOTICE_AUDIENCES,
    roles: ALL_ROLES,
    emptyDescription:
      'A notice reaches everyone you address it to, on their own board and optionally by email.',
    titlePlaceholder: 'School closed on Friday',
  },
  TUITION: {
    title: 'Tuition notice board',
    description:
      'Post to tuition students and tutors. Everything here reaches tuition accounts only — the school never sees it — and publishing reports how many people it reached.',
    audiences: NOTICE_AUDIENCES.filter((a) => a !== 'CLASS'),
    roles: ALL_ROLES.filter((r) => r === 'TEACHER' || r === 'CLASS_TEACHER' || r === 'STUDENT'),
    emptyDescription:
      'A notice reaches every tuition account you address it to — all students, all tutors, or named people — and optionally their parents.',
    titlePlaceholder: 'No classes on Friday — tutor training',
  },
} satisfies Record<Program, unknown>

function NoticeDialog({
  open,
  onOpenChange,
  editing,
  board,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: NoticeOut | null
  board: Program
}) {
  const tuition = board === 'TUITION'
  const create = useCreateNotice(board)
  const update = useUpdateNotice(board)
  const classes = useClasses(!tuition)
  const users = useUsers()
  const tuitionUsers = useTuitionUsers(undefined, false, tuition)
  // The people picker: tuition accounts on the tuition board, everybody on the school's.
  const people = tuition ? tuitionUsers.data : users.data

  const form = useForm<NoticeValues>({
    resolver: zodResolver(noticeSchema),
    defaultValues: {
      title: '',
      body: '',
      audience: 'EVERYONE',
      priority: 'NORMAL',
      publish_at: '',
      expires_at: '',
      is_pinned: false,
      notify_by_email: false,
      include_class_teachers: true,
      include_parents: false,
    },
  })

  // Targets live outside the zod schema: which one is required depends on the
  // audience, and expressing that as a discriminated union would make the
  // form re-validate every other field on each audience change.
  const [roles, setRoles] = React.useState<UserRole[]>([])
  const [classIds, setClassIds] = React.useState<number[]>([])
  const [userIds, setUserIds] = React.useState<number[]>([])
  const [targetError, setTargetError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    form.reset({
      title: editing?.title ?? '',
      body: editing?.body ?? '',
      audience: editing?.audience ?? 'EVERYONE',
      priority: editing?.priority ?? 'NORMAL',
      publish_at: editing?.publish_at?.slice(0, 16) ?? '',
      expires_at: editing?.expires_at?.slice(0, 16) ?? '',
      is_pinned: editing?.is_pinned ?? false,
      notify_by_email: editing?.notify_by_email ?? false,
      include_class_teachers: editing?.include_class_teachers ?? true,
      include_parents: editing?.include_parents ?? false,
    })
    setRoles((editing?.target_roles ?? []) as UserRole[])
    setClassIds(editing?.target_class_ids ?? [])
    setUserIds(editing?.target_user_ids ?? [])
    setTargetError(null)
  }, [open, editing, form])

  const audience = form.watch('audience')
  const targetField = targetFieldFor(audience)

  const onSubmit = async (values: NoticeValues) => {
    setTargetError(null)

    // Mirrors the backend's own check, so the author sees it before the round
    // trip rather than as a 422 on a form they have already left.
    if (targetField === 'target_roles' && roles.length === 0) {
      setTargetError('Pick at least one role, or this notice reaches nobody.')
      return
    }
    if (targetField === 'target_class_ids' && classIds.length === 0) {
      setTargetError('Pick at least one class, or this notice reaches nobody.')
      return
    }
    if (targetField === 'target_user_ids' && userIds.length === 0) {
      setTargetError('Pick at least one person, or this notice reaches nobody.')
      return
    }

    const body = {
      title: values.title,
      body: values.body,
      audience: values.audience,
      priority: values.priority,
      target_roles: roles,
      target_class_ids: classIds,
      target_user_ids: userIds,
      include_class_teachers: values.include_class_teachers,
      include_parents: values.include_parents,
      publish_at: values.publish_at ? `${values.publish_at}:00` : null,
      expires_at: values.expires_at ? `${values.expires_at}:00` : null,
      is_pinned: values.is_pinned,
      notify_by_email: values.notify_by_email,
    }

    try {
      if (editing) await update.mutateAsync({ noticeId: editing.id, body })
      else await create.mutateAsync(body)
      onOpenChange(false)
    } catch (error) {
      form.setError('root', {
        message: (error as { message?: string })?.message ?? 'Could not save the notice.',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit notice' : 'Write a notice'}</DialogTitle>
          <DialogDescription>
            Saved as a draft. Nobody sees it until you publish, and publishing tells you how
            many people it actually reached.
          </DialogDescription>
        </DialogHeader>
        <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-5">
            <FormError message={form.formState.errors.root?.message} />

            <Field
              id="notice_title"
              label="Title"
              required
              error={form.formState.errors.title?.message}
            >
              <Input
                id="notice_title"
                placeholder={BOARD[board].titlePlaceholder}
                {...form.register('title')}
              />
            </Field>

            <Field
              id="notice_body"
              label="Message"
              required
              error={form.formState.errors.body?.message}
            >
              <Textarea id="notice_body" rows={6} {...form.register('body')} />
            </Field>

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field id="notice_audience" label="Who gets this" hint={NOTICE_AUDIENCE_HINT[audience]}>
                <Select
                  value={audience}
                  onValueChange={(v) =>
                    form.setValue('audience', v as NoticeAudience, { shouldDirty: true })
                  }
                >
                  <SelectTrigger id="notice_audience">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOARD[board].audiences.map((a) => (
                      <SelectItem key={a} value={a}>
                        {NOTICE_AUDIENCE_LABEL[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field id="notice_priority" label="Priority">
                <Select
                  value={form.watch('priority')}
                  onValueChange={(v) =>
                    form.setValue('priority', v as NoticePriority, { shouldDirty: true })
                  }
                >
                  <SelectTrigger id="notice_priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTICE_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {NOTICE_PRIORITY_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Exactly one picker, because the audience decides which target
                list the backend reads and ignores the rest. */}
            {targetField && (
              <div className="space-y-2 rounded-xl border border-border p-4">
                {targetError && (
                  <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">
                    {targetError}
                  </p>
                )}

                {audience === 'ROLE' && (
                  <div className="flex flex-wrap gap-3">
                    {BOARD[board].roles.map((role) => (
                      <label key={role} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={roles.includes(role)}
                          onCheckedChange={(v) =>
                            setRoles((prev) =>
                              v ? [...prev, role] : prev.filter((r) => r !== role),
                            )
                          }
                        />
                        {ROLE_LABEL[role]}
                      </label>
                    ))}
                  </div>
                )}

                {audience === 'CLASS' && (
                  <div className="max-h-48 space-y-1.5 overflow-y-auto">
                    {(classes.data ?? []).map((cls) => (
                      <label key={cls.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={classIds.includes(cls.id)}
                          onCheckedChange={(v) =>
                            setClassIds((prev) =>
                              v ? [...prev, cls.id] : prev.filter((id) => id !== cls.id),
                            )
                          }
                        />
                        {cls.name}
                      </label>
                    ))}
                  </div>
                )}

                {audience === 'USER' && (
                  <div className="max-h-48 space-y-1.5 overflow-y-auto">
                    {(people ?? []).map((user) => (
                      <label key={user.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={userIds.includes(user.id)}
                          onCheckedChange={(v) =>
                            setUserIds((prev) =>
                              v ? [...prev, user.id] : prev.filter((id) => id !== user.id),
                            )
                          }
                        />
                        <span className="truncate">{user.full_name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {ROLE_LABEL[user.role as UserRole] ?? user.role}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Class teachers are a CLASS-audience idea; parents apply to any
                audience that resolves to students, which on the tuition board
                is every audience — so the parents toggle is always offered
                there. */}
            {(audience === 'CLASS' || tuition) && (
              <div className="space-y-3 rounded-xl border border-border p-4">
                {audience === 'CLASS' && (
                  <label className="flex items-start justify-between gap-4">
                    <span className="min-w-0">
                      <span className="text-sm font-medium">Also send to class teachers</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        The teachers who take the chosen classes.
                      </span>
                    </span>
                    <Switch
                      checked={form.watch('include_class_teachers')}
                      onCheckedChange={(v) =>
                        form.setValue('include_class_teachers', v, { shouldDirty: true })
                      }
                    />
                  </label>
                )}
                <label
                  className={
                    audience === 'CLASS'
                      ? 'flex items-start justify-between gap-4 border-t border-border pt-3'
                      : 'flex items-start justify-between gap-4'
                  }
                >
                  <span className="min-w-0">
                    <span className="text-sm font-medium">Also send to parents</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {audience === 'CLASS'
                        ? 'Guardians linked to the students in those classes.'
                        : 'Guardians linked to the students this reaches.'}
                    </span>
                  </span>
                  <Switch
                    checked={form.watch('include_parents')}
                    onCheckedChange={(v) =>
                      form.setValue('include_parents', v, { shouldDirty: true })
                    }
                  />
                </label>
              </div>
            )}

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field
                id="publish_at"
                label="Go live at"
                hint="Leave blank to go live the moment you publish."
              >
                <Input id="publish_at" type="datetime-local" {...form.register('publish_at')} />
              </Field>
              <Field id="expires_at" label="Comes down at" hint="Optional.">
                <Input id="expires_at" type="datetime-local" {...form.register('expires_at')} />
              </Field>
            </div>

            <div className="space-y-3 rounded-xl border border-border p-4">
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">Pin to the top of the board</span>
                <Switch
                  checked={form.watch('is_pinned')}
                  onCheckedChange={(v) => form.setValue('is_pinned', v, { shouldDirty: true })}
                />
              </label>
              <label className="flex items-center justify-between gap-4 border-t border-border pt-3">
                <span className="text-sm font-medium">Also email it</span>
                <Switch
                  checked={form.watch('notify_by_email')}
                  onCheckedChange={(v) =>
                    form.setValue('notify_by_email', v, { shouldDirty: true })
                  }
                />
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {editing ? 'Save changes' : 'Save as draft'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

function NoticeCard({
  notice,
  onEdit,
  onPublish,
  onArchive,
  onDelete,
}: {
  notice: NoticeOut
  onEdit: () => void
  onPublish: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const visibility = noticeVisibility(notice)

  const audienceSummary = React.useMemo(() => {
    switch (notice.audience) {
      case 'CLASS':
        return notice.target_class_names.length
          ? notice.target_class_names.join(', ')
          : countLabel(notice.target_class_ids.length, 'class', 'classes')
      case 'ROLE':
        return notice.target_roles.join(', ')
      case 'USER':
        return countLabel(notice.target_user_ids.length, 'person', 'people')
      default:
        return 'Everyone'
    }
  }, [notice])

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {notice.is_pinned && <Pin className="size-3.5 text-primary" />}
            <h3 className="text-base font-semibold">{notice.title}</h3>
            <Badge tone={NOTICE_PRIORITY_TONE[notice.priority]} size="sm">
              {NOTICE_PRIORITY_LABEL[notice.priority]}
            </Badge>
            <Badge tone={visibility.tone} size="sm">
              {visibility.label}
            </Badge>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            {NOTICE_AUDIENCE_LABEL[notice.audience]} · {audienceSummary}
            {notice.author_name ? ` · by ${notice.author_name}` : ''}
          </p>

          {/* The two halves of visibility, shown apart: the decision, then the
              clock. A "scheduled" notice is not a broken one. */}
          {notice.is_scheduled && notice.publish_at && (
            <p className="mt-1 text-xs text-info">
              Goes live {formatRelative(notice.publish_at)} ({formatDateTime(notice.publish_at)})
            </p>
          )}
          {notice.is_expired && notice.expires_at && (
            <p className="mt-1 text-xs text-muted-foreground">
              Came down {formatRelative(notice.expires_at)}
            </p>
          )}

          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{notice.body}</p>

          {notice.recipient_count != null && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5" />
              {countLabel(notice.recipient_count, 'recipient')}
              {notice.read_count != null && ` · ${notice.read_count} opened it`}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {notice.status === 'DRAFT' && (
            <Button size="sm" onClick={onPublish}>
              <Send />
              Publish
            </Button>
          )}
          {notice.status === 'PUBLISHED' && (
            <Button variant="outline" size="sm" onClick={onArchive}>
              <Archive />
              Take down
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      </div>
    </Card>
  )
}

type StatusFilter = 'ALL' | NoticeStatus

/**
 * The authoring screen for one board. The school route renders it for LMS,
 * `/admin/tuition/notices` for TUITION; everything that differs is read from
 * `BOARD` and from the hooks, which take the board and pick the routes.
 */
export function NoticeBoardAdmin({ board }: { board: Program }) {
  const [status, setStatus] = React.useState<StatusFilter>('ALL')
  const notices = useAdminNotices({
    board,
    status: status === 'ALL' ? undefined : status,
    withCounts: true,
  })
  const publish = usePublishNotice(board)
  const archive = useArchiveNotice(board)
  const remove = useDeleteNotice(board)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<NoticeOut | null>(null)
  const [deleting, setDeleting] = React.useState<NoticeOut | null>(null)

  return (
    <div>
      <PageHeader
        title={BOARD[board].title}
        description={BOARD[board].description}
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus />
            Write a notice
          </Button>
        }
      >
        <Segmented
          layoutId="notice-status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'DRAFT', label: 'Drafts' },
            { value: 'PUBLISHED', label: 'Published' },
            { value: 'ARCHIVED', label: 'Archived' },
          ]}
        />
      </PageHeader>

      <QueryBoundary
        query={notices}
        loading={
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            icon={<Megaphone />}
            title={status === 'ALL' ? 'No notices yet' : `No ${status.toLowerCase()} notices`}
            description={
              status === 'ALL' ? BOARD[board].emptyDescription : 'Try a different filter.'
            }
            action={
              status === 'ALL' ? (
                <Button
                  onClick={() => {
                    setEditing(null)
                    setDialogOpen(true)
                  }}
                >
                  <Plus />
                  Write a notice
                </Button>
              ) : undefined
            }
          />
        }
      >
        {(rows) => (
          <div className="space-y-3">
            {rows.map((notice) => (
              <NoticeCard
                key={notice.id}
                notice={notice}
                onEdit={() => {
                  setEditing(notice)
                  setDialogOpen(true)
                }}
                onPublish={() => publish.mutate(notice.id)}
                onArchive={() => archive.mutate(notice.id)}
                onDelete={() => setDeleting(notice)}
              />
            ))}
          </div>
        )}
      </QueryBoundary>

      <NoticeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        board={board}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this notice?"
        description={
          <>
            This removes it and its read receipts permanently. <strong>Taking it down</strong>{' '}
            instead keeps the record of what was said and who opened it.
          </>
        }
        confirmLabel="Delete permanently"
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id)
          setDeleting(null)
        }}
      />
    </div>
  )
}

/** The school board's route. */
export default function AdminNoticesPage() {
  return <NoticeBoardAdmin board="LMS" />
}

/** Exported for the reader's feed, which shows the same priority chip. */
export function NoticePriorityBadge({ priority }: { priority: NoticePriority }) {
  return (
    <Badge tone={NOTICE_PRIORITY_TONE[priority]} size="sm">
      {NOTICE_PRIORITY_LABEL[priority]}
    </Badge>
  )
}

/** Also exported: the "who has read it" line, reused on the detail sheet. */
export function ReadReceiptLine({ notice }: { notice: NoticeOut }) {
  if (notice.recipient_count == null) return null
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Eye className="size-3.5" />
      {notice.read_count ?? 0} of {notice.recipient_count} have opened it
    </p>
  )
}

import {
  Check,
  Download,
  ExternalLink,
  Library,
  Link2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import * as React from 'react'

import type {
  LibraryItemOut,
  LibraryVisibility,
  TuitionEnrollmentOut,
  TuitionMaterialType,
} from '@/api/types'
import {
  useDeleteLibraryItem,
  useDownloadLibraryItem,
  useModerateLibraryItem,
  useMyTuitionStudents,
  useMyTuitionSubjects,
  useShareLibraryLink,
  useTuitionLibrary,
  useTuitionLibraryPending,
  useUpdateLibraryItem,
  useUploadLibraryItem,
} from '@/queries/tuition.queries'
import { formatRelative } from '@/lib/datetime'
import { MAX_UPLOAD_BYTES, formatFileSize, resolveFileUrl } from '@/lib/files'
import {
  MATERIAL_TYPES,
  MATERIAL_TYPE_LABEL,
  VISIBILITY_LABEL,
  isTuitionUser,
} from '@/lib/tuition'
import { useAuth } from '@/providers/auth-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Input, Textarea } from '@/components/ui/input'
import { ProgressBar } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field } from '@/components/forms/field'
import { FileTypeIcon } from '@/components/domain/file-type-icon'
import { LibraryBadges } from '@/components/domain/tuition'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * The shared tuition library.
 *
 * One screen for all three roles, because the backend decides reach per
 * request: what a given person can see is worked out from visibility, their
 * own arrangements and their role, and there is nothing sensible for us to
 * filter on top of that.
 *
 * The two things worth knowing while reading this file:
 *
 * A STUDENT's upload to anything wider than "only me" waits for a teacher to
 * approve it. That is not a nuisance rule — students may upload, which was the
 * point, but one cannot publish to the whole programme unreviewed.
 *
 * Downloading is a POST. It records that the item was opened, which is how a
 * tutor finds out whether the worksheet they shared was ever looked at.
 */

const VISIBILITIES: LibraryVisibility[] = ['PRIVATE', 'ENROLLMENT', 'SUBJECT', 'PROGRAM']

/** Whichever enrollment list this role is allowed to read. */
function useMyEnrollments(enabled: boolean) {
  const { role } = useAuth()
  const asStudent = role === 'STUDENT'
  const teacherSide = useMyTuitionStudents(false, enabled && !asStudent)
  const studentSide = useMyTuitionSubjects(enabled && asStudent)
  return asStudent ? studentSide : teacherSide
}

function enrollmentOption(enrollment: TuitionEnrollmentOut, asStudent: boolean) {
  const subject = enrollment.subject?.name ?? 'Subject'
  const other = asStudent ? enrollment.teacher?.full_name : enrollment.student?.full_name
  return { value: String(enrollment.id), label: `${subject}${other ? ` · ${other}` : ''}` }
}

function ShareDialog({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'file' | 'link'
}) {
  const { role } = useAuth()
  const asStudent = role === 'STUDENT'
  const enrollments = useMyEnrollments(open)
  const upload = useUploadLibraryItem()
  const shareLink = useShareLibraryLink()

  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [materialType, setMaterialType] = React.useState<TuitionMaterialType>('NOTES')
  const [visibility, setVisibility] = React.useState<LibraryVisibility>('ENROLLMENT')
  const [enrollmentId, setEnrollmentId] = React.useState<string | null>(null)
  const [tags, setTags] = React.useState('')
  const [url, setUrl] = React.useState('')
  const [file, setFile] = React.useState<File | null>(null)
  const [progress, setProgress] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    setTitle('')
    setDescription('')
    setMaterialType(mode === 'link' ? 'LINK' : 'NOTES')
    setVisibility('ENROLLMENT')
    setEnrollmentId(null)
    setTags('')
    setUrl('')
    setFile(null)
    setProgress(0)
  }, [open, mode])

  const tooBig = !!file && file.size > MAX_UPLOAD_BYTES
  // ENROLLMENT visibility means "this arrangement", so it needs one named.
  const needsEnrollment = visibility === 'ENROLLMENT'
  const invalid =
    !title.trim() ||
    (needsEnrollment && !enrollmentId) ||
    (mode === 'file' ? !file || tooBig : !url.trim())

  const willWait = asStudent && visibility !== 'PRIVATE'

  const submit = () => {
    if (invalid) return
    const common = {
      title: title.trim(),
      description: description.trim() || null,
      material_type: materialType,
      enrollment_id: enrollmentId ? Number(enrollmentId) : null,
      visibility,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }

    if (mode === 'link') {
      shareLink.mutate(
        { ...common, external_url: url.trim() },
        { onSuccess: () => onOpenChange(false) },
      )
      return
    }

    upload.mutate(
      { form: common, file: file as File, onProgress: setProgress },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'link' ? 'Share a link' : 'Share a file'}
      confirmLabel={mode === 'link' ? 'Share link' : 'Upload'}
      loading={upload.isPending || shareLink.isPending}
      description={
        mode === 'link'
          ? 'Better than uploading a copy of something already on the web — a copy goes stale and loses the source.'
          : `Up to ${formatFileSize(MAX_UPLOAD_BYTES)}. Books, notes, worksheets and recordings.`
      }
      onConfirm={submit}
    >
      <div className="space-y-3">
        {mode === 'file' ? (
          <Field
            id="lib-file"
            label="File"
            required
            error={tooBig ? `Too large — the limit is ${formatFileSize(MAX_UPLOAD_BYTES)}.` : undefined}
          >
            <Input
              id="lib-file"
              type="file"
              onChange={(event) => {
                const picked = event.target.files?.[0] ?? null
                setFile(picked)
                // The file name is nearly always the title somebody wanted.
                if (picked && !title.trim()) setTitle(picked.name.replace(/\.[^.]+$/, ''))
              }}
            />
          </Field>
        ) : (
          <Field id="lib-url" label="Link" required>
            <Input
              id="lib-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
            />
          </Field>
        )}

        <Field id="lib-title" label="Title" required>
          <Input id="lib-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="lib-type" label="Kind">
            <Select
              value={materialType}
              onValueChange={(v) => setMaterialType(v as TuitionMaterialType)}
            >
              <SelectTrigger id="lib-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATERIAL_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {MATERIAL_TYPE_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="lib-visibility" label="Who can see it">
            <Select
              value={visibility}
              onValueChange={(v) => setVisibility(v as LibraryVisibility)}
            >
              <SelectTrigger id="lib-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIBILITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {VISIBILITY_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {needsEnrollment && (
          <Field id="lib-enrollment" label="Which arrangement" required>
            <Combobox
              id="lib-enrollment"
              value={enrollmentId}
              onChange={setEnrollmentId}
              options={(enrollments.data ?? []).map((e) => enrollmentOption(e, asStudent))}
              placeholder="Choose…"
              emptyMessage="You have no active arrangements."
            />
          </Field>
        )}

        <Field id="lib-tags" label="Tags" hint="Comma-separated. Helps people find it.">
          <Input
            id="lib-tags"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="algebra, past paper"
          />
        </Field>

        <Field id="lib-desc" label="Description">
          <Textarea
            id="lib-desc"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        {willWait && (
          <p className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-warning">
            A teacher has to approve this before anyone else can see it. Sharing it with only
            yourself needs no approval.
          </p>
        )}

        {upload.isPending && progress > 0 && (
          <ProgressBar value={progress} label={`Uploading — ${progress}%`} />
        )}
      </div>
    </ConfirmDialog>
  )
}

/**
 * Edits an item already in the library.
 *
 * Visibility is the field that matters here, and it carries a rule worth
 * surfacing: widening an already-approved STUDENT upload sends it back for
 * review. Without that, the approval step would be trivially bypassed by
 * uploading narrow and editing wide, so the dialog says so rather than letting
 * the item silently vanish from view afterwards.
 */
function EditItemDialog({
  item,
  onOpenChange,
}: {
  item: LibraryItemOut | null
  onOpenChange: (open: boolean) => void
}) {
  const update = useUpdateLibraryItem()
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [materialType, setMaterialType] = React.useState<TuitionMaterialType>('NOTES')
  const [visibility, setVisibility] = React.useState<LibraryVisibility>('ENROLLMENT')
  const [tags, setTags] = React.useState('')

  React.useEffect(() => {
    if (!item) return
    setTitle(item.title)
    setDescription(item.description ?? '')
    setMaterialType(item.material_type)
    setVisibility(item.visibility)
    setTags(item.tags.join(', '))
  }, [item])

  const REACH = ['PRIVATE', 'ENROLLMENT', 'SUBJECT', 'PROGRAM']
  const widening =
    !!item &&
    item.uploader_role === 'STUDENT' &&
    item.approval_status === 'APPROVED' &&
    REACH.indexOf(visibility) > REACH.indexOf(item.visibility)

  return (
    <ConfirmDialog
      open={!!item}
      onOpenChange={onOpenChange}
      title="Edit this item"
      confirmLabel="Save"
      loading={update.isPending}
      description="Changes apply for everyone it is shared with."
      onConfirm={() => {
        if (!item || !title.trim()) return
        update.mutate(
          {
            itemId: item.id,
            body: {
              title: title.trim(),
              description: description.trim() || null,
              material_type: materialType,
              visibility,
              tags: tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            },
          },
          { onSuccess: () => onOpenChange(false) },
        )
      }}
    >
      <div className="space-y-3">
        <Field id="edit-title" label="Title" required>
          <Input
            id="edit-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="edit-type" label="Kind">
            <Select
              value={materialType}
              onValueChange={(v) => setMaterialType(v as TuitionMaterialType)}
            >
              <SelectTrigger id="edit-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATERIAL_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {MATERIAL_TYPE_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="edit-visibility" label="Who can see it">
            <Select value={visibility} onValueChange={(v) => setVisibility(v as LibraryVisibility)}>
              <SelectTrigger id="edit-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIBILITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {VISIBILITY_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field id="edit-tags" label="Tags" hint="Comma-separated.">
          <Input id="edit-tags" value={tags} onChange={(event) => setTags(event.target.value)} />
        </Field>

        <Field id="edit-desc" label="Description">
          <Textarea
            id="edit-desc"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        {widening && (
          <p className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-warning">
            Widening who can see a student upload sends it back for approval, so it will be
            hidden again until a teacher reviews it.
          </p>
        )}
      </div>
    </ConfirmDialog>
  )
}

function LibraryCard({
  item,
  canModerate,
  canManage,
}: {
  item: LibraryItemOut
  canModerate: boolean
  canManage: boolean
}) {
  const download = useDownloadLibraryItem()
  const moderate = useModerateLibraryItem()
  const remove = useDeleteLibraryItem()
  const [rejecting, setRejecting] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [deleting, setDeleting] = React.useState(false)
  const [editing, setEditing] = React.useState(false)

  const isLink = !!item.external_url && !item.file_url

  /**
   * Opens through the server so the download is counted.
   *
   * The window is opened from the response rather than pre-opened, which a
   * pop-up blocker may object to — accepted deliberately: an uncounted
   * download makes the "was this ever opened" question unanswerable.
   */
  const open = () => {
    download.mutate(item.id, {
      onSuccess: (fresh) => {
        const href = fresh.external_url ?? resolveFileUrl(fresh.file_url)
        if (href) window.open(href, '_blank', 'noopener')
      },
    })
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <FileTypeIcon url={item.file_name ?? item.file_url ?? item.external_url} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{item.title}</h3>
            <Badge tone="neutral" size="sm">
              {MATERIAL_TYPE_LABEL[item.material_type]}
            </Badge>
          </div>

          {item.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
          )}

          <div className="mt-2">
            <LibraryBadges item={item} />
          </div>

          {item.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.tags.map((tag) => (
                <Badge key={tag} tone="outline" size="sm">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <p className="mt-2 text-2xs text-muted-foreground/80">
            {item.uploader?.full_name ?? 'Someone'}
            {item.uploaded_at ? ` · ${formatRelative(item.uploaded_at)}` : ''}
            {item.download_count > 0 ? ` · opened ${item.download_count}×` : ' · not opened yet'}
          </p>

          {item.rejection_reason && (
            <p className="mt-2 text-xs text-danger">Rejected: {item.rejection_reason}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant="outline" loading={download.isPending} onClick={open}>
            {isLink ? <ExternalLink /> : <Download />}
            Open
          </Button>

          {(canModerate || canManage) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canModerate && item.approval_status !== 'APPROVED' && (
                  <DropdownMenuItem
                    onSelect={() => moderate.mutate({ itemId: item.id, body: { approve: true } })}
                  >
                    <Check />
                    Approve
                  </DropdownMenuItem>
                )}
                {canModerate && item.approval_status !== 'REJECTED' && (
                  <DropdownMenuItem onSelect={() => setRejecting(true)}>
                    <X />
                    Reject
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <DropdownMenuItem onSelect={() => setEditing(true)}>
                    <Pencil />
                    Edit
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <DropdownMenuItem destructive onSelect={() => setDeleting(true)}>
                    <Trash2 />
                    Remove
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Reject this upload?"
        destructive
        confirmLabel="Reject"
        loading={moderate.isPending}
        description="The uploader is told why, so say something they can act on."
        onConfirm={() =>
          moderate.mutate(
            { itemId: item.id, body: { approve: false, reason: reason.trim() || null } },
            { onSuccess: () => setRejecting(false) },
          )
        }
      >
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason"
          autoFocus
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Remove “${item.title}”?`}
        destructive
        confirmLabel="Remove"
        loading={remove.isPending}
        description="It disappears for everyone it was shared with."
        onConfirm={() => remove.mutate(item.id, { onSuccess: () => setDeleting(false) })}
      />

      <EditItemDialog item={editing ? item : null} onOpenChange={setEditing} />
    </Card>
  )
}

export default function TuitionLibraryPage() {
  const { role, user } = useAuth()
  const canModerate = role === 'ADMIN' || role === 'TEACHER' || role === 'CLASS_TEACHER'

  const library = useTuitionLibrary()
  const pending = useTuitionLibraryPending(canModerate)

  const [search, setSearch] = React.useState('')
  const [type, setType] = React.useState<TuitionMaterialType | 'ALL'>('ALL')
  const [shareMode, setShareMode] = React.useState<'file' | 'link' | null>(null)

  /**
   * Filtered here rather than on the server.
   *
   * `?search=` is a post-fetch scan of the same rows server-side, so asking for
   * it costs a round trip and buys nothing — and typing stays instant.
   */
  const rows = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    return (library.data ?? []).filter((item) => {
      if (type !== 'ALL' && item.material_type !== type) return false
      if (!term) return true
      return (
        item.title.toLowerCase().includes(term) ||
        (item.description ?? '').toLowerCase().includes(term) ||
        item.tags.some((tag) => tag.toLowerCase().includes(term))
      )
    })
  }, [library.data, search, type])

  const pendingCount = pending.data?.length ?? 0

  if (user && !isTuitionUser(user) && role !== 'ADMIN') {
    return (
      <EmptyState
        icon={<Library />}
        title="Not part of online tuition"
        description="An administrator can add your account to the tuition programme."
      />
    )
  }

  return (
    <>
      <PageHeader
        title="Tuition library"
        description="Books, notes, worksheets and recordings shared across the programme."
        actions={
          <>
            <Button variant="outline" onClick={() => setShareMode('link')}>
              <Link2 />
              Share a link
            </Button>
            <Button onClick={() => setShareMode('file')}>
              <Upload />
              Upload
            </Button>
          </>
        }
      />

      <Tabs defaultValue="all">
        <TabsList className="mb-4">
          <TabsTrigger value="all">Everything</TabsTrigger>
          {canModerate && (
            <TabsTrigger value="pending">
              Awaiting approval
              {pendingCount > 0 && (
                <Badge tone="warning" size="sm" className="ml-2">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="all">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search titles, descriptions and tags…"
              />
            </div>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Anything</SelectItem>
                {MATERIAL_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {MATERIAL_TYPE_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <QueryBoundary
            query={library}
            loading={
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-28" />
                ))}
              </div>
            }
            isEmpty={() => rows.length === 0}
            empty={
              <EmptyState
                icon={<Library />}
                title={search || type !== 'ALL' ? 'Nothing matches' : 'The library is empty'}
                description={
                  search || type !== 'ALL'
                    ? 'Try a different search, or clear the filter.'
                    : 'Share a book, a worksheet or a recording to start it off.'
                }
                action={
                  search || type !== 'ALL' ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearch('')
                        setType('ALL')
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <Button onClick={() => setShareMode('file')}>
                      <Upload />
                      Upload
                    </Button>
                  )
                }
              />
            }
          >
            {() => (
              <div className="space-y-3">
                {rows.map((item) => (
                  <LibraryCard
                    key={item.id}
                    item={item}
                    canModerate={canModerate}
                    canManage={canModerate || item.uploaded_by === user?.id}
                  />
                ))}
              </div>
            )}
          </QueryBoundary>
        </TabsContent>

        {canModerate && (
          <TabsContent value="pending">
            <QueryBoundary
              query={pending}
              loading={
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-28" />
                  ))}
                </div>
              }
              isEmpty={(data) => data.length === 0}
              empty={
                <EmptyState
                  icon={<Check />}
                  title="Nothing waiting"
                  description="Student uploads that reach beyond themselves appear here for review."
                />
              }
            >
              {(data) => (
                <div className="space-y-3">
                  {data.map((item) => (
                    <LibraryCard key={item.id} item={item} canModerate canManage />
                  ))}
                </div>
              )}
            </QueryBoundary>
          </TabsContent>
        )}
      </Tabs>

      <ShareDialog
        open={shareMode !== null}
        onOpenChange={(open) => !open && setShareMode(null)}
        mode={shareMode ?? 'file'}
      />
    </>
  )
}

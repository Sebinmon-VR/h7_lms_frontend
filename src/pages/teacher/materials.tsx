import {
  ExternalLink,
  Grid3x3,
  Info,
  LayoutList,
  Library,
  MoreHorizontal,
  Pencil,
  Trash2,
  TriangleAlert,
  Upload,
  UploadCloud,
} from 'lucide-react'
import * as React from 'react'

import type { StudyMaterialOut } from '@/api/types'
import {
  useDeleteMaterial,
  useMyClasses,
  useTeacherMaterials,
  useUpdateMaterial,
  useUploadMaterial,
} from '@/queries/teacher.queries'
import { cn } from '@/lib/cn'
import { MATERIAL_TYPE_PRESETS } from '@/lib/constants'
import { formatDateTime, formatRelative } from '@/lib/datetime'
import {
  MAX_UPLOAD_BYTES,
  fileNameFromUrl,
  formatFileSize,
  resolveFileUrl,
  storageLabel,
} from '@/lib/files'
import { subjectName, className as classNameOf } from '@/lib/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { ProgressBar } from '@/components/ui/progress'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FreeformBadge } from '@/components/domain/badges'
import { FileTypeIcon } from '@/components/domain/file-type-icon'
import { FiledBy } from '@/components/domain/filed-by'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field, FormError } from '@/components/forms/field'
import { PageHeader } from '@/components/layout/page-header'
import { useClassSubjectSelection } from './class-subject-picker'
import { AdminTeacherNotice, useIsAdminViewingTeacher } from './teacher-guard'

function UploadDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  existing: StudyMaterialOut[]
}) {
  const mappingsQuery = useMyClasses()
  const selection = useClassSubjectSelection(mappingsQuery.data)
  const [percent, setPercent] = React.useState(0)
  const uploadMaterial = useUploadMaterial(setPercent)

  const [classId, setClassId] = React.useState<string>('')
  const [subjectId, setSubjectId] = React.useState<string>('')
  const [title, setTitle] = React.useState('')
  const [materialType, setMaterialType] = React.useState<string>('NOTES')
  const [customType, setCustomType] = React.useState('')
  const [file, setFile] = React.useState<File | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setClassId(selection.classId ? String(selection.classId) : '')
      setSubjectId(selection.subjectId ? String(selection.subjectId) : '')
      setTitle('')
      setMaterialType('NOTES')
      setCustomType('')
      setFile(null)
      setError(null)
      setPercent(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const subjects = React.useMemo(() => {
    const map = new Map<number, { id: number; name: string; code: string }>()
    for (const m of mappingsQuery.data ?? []) {
      if (classId && m.class_room.id !== Number(classId)) continue
      map.set(m.subject.id, m.subject)
    }
    return [...map.values()]
  }, [mappingsQuery.data, classId])

  /**
   * Uploads no longer clobber each other — the backend prefixes every stored
   * object with a unique token, so two teachers can both upload `notes.pdf`.
   * A same-named file is now only a housekeeping question, not data loss, so
   * this is a note rather than a warning.
   */
  const duplicateName = React.useMemo(() => {
    if (!file || !classId) return null
    return existing.find(
      (m) => m.class_id === Number(classId) && fileNameFromUrl(m.file_url) === file.name,
    )
  }, [file, classId, existing])

  const chooseFile = (next: File | null) => {
    if (!next) return
    if (next.size > MAX_UPLOAD_BYTES) {
      setError(`That file is ${formatFileSize(next.size)}. The limit is ${formatFileSize(MAX_UPLOAD_BYTES)}.`)
      return
    }
    setError(null)
    setFile(next)
    if (!title.trim()) setTitle(next.name.replace(/\.[^.]+$/, ''))
  }

  const resolvedType = materialType === '__custom' ? customType.trim().toUpperCase() : materialType
  const ready = !!classId && !!subjectId && title.trim().length > 1 && !!file && !!resolvedType

  const submit = async () => {
    if (!ready || !file) return
    setError(null)
    try {
      await uploadMaterial.mutateAsync({
        class_id: Number(classId),
        subject_id: Number(subjectId),
        title: title.trim(),
        material_type: resolvedType,
        file,
      })
      onOpenChange(false)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Upload failed.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !uploadMaterial.isPending && onOpenChange(v)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Upload study material</DialogTitle>
          <DialogDescription>Shared with every student in the selected class.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">{error}</p>
          )}

          {/* ------------------------------------------------- dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              chooseFile(e.dataTransfer.files?.[0] ?? null)
            }}
            className={cn(
              'rounded-xl border-2 border-dashed p-6 text-center transition-colors',
              dragging ? 'border-primary bg-primary/8' : 'border-border',
            )}
          >
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileTypeIcon url={file.name} />
                <div className="min-w-0 text-left">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setFile(null)} disabled={uploadMaterial.isPending}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <UploadCloud className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 text-sm">
                  Drag a file here, or{' '}
                  <label className="cursor-pointer font-medium text-primary hover:underline">
                    browse
                    <input
                      type="file"
                      className="sr-only"
                      onChange={(e) => {
                        chooseFile(e.target.files?.[0] ?? null)
                        e.target.value = ''
                      }}
                    />
                  </label>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Up to {formatFileSize(MAX_UPLOAD_BYTES)}</p>
              </>
            )}
          </div>

          {duplicateName && (
            <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs">
              <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">
                “{duplicateName.title}” in this class was uploaded from a file with the same name. Both
                are kept — stored files get a unique name — so students will see two entries.
              </span>
            </div>
          )}

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field id="material-class" label="Class" required>
              <Combobox
                id="material-class"
                value={classId || null}
                onChange={(v) => {
                  setClassId(v)
                  setSubjectId('')
                }}
                placeholder="Select a class"
                options={selection.classes.map((c) => ({ value: String(c.id), label: c.name, hint: c.code }))}
              />
            </Field>
            <Field id="material-subject" label="Subject" required>
              <Combobox
                id="material-subject"
                value={subjectId || null}
                onChange={setSubjectId}
                disabled={!classId}
                placeholder={classId ? 'Select a subject' : 'Choose a class first'}
                options={subjects.map((s) => ({ value: String(s.id), label: s.name, hint: s.code }))}
              />
            </Field>
          </div>

          <Field id="material-title" label="Title" required>
            <Input
              id="material-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Chapter 4 — Trees"
            />
          </Field>

          <Field id="material-type" label="Type" hint="Any label works; these are the common ones.">
            <div className="flex flex-wrap gap-2">
              {MATERIAL_TYPE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setMaterialType(preset)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    materialType === preset
                      ? 'border-primary bg-primary/12 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40',
                  )}
                >
                  {preset}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMaterialType('__custom')}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  materialType === '__custom'
                    ? 'border-primary bg-primary/12 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40',
                )}
              >
                Other
              </button>
            </div>
            {materialType === '__custom' && (
              <Input
                className="mt-2"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="WORKSHEET"
              />
            )}
          </Field>

          {uploadMaterial.isPending && (
            <div>
              <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                <span>Uploading…</span>
                <span className="tabular-nums">{percent}%</span>
              </div>
              <ProgressBar value={percent} />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploadMaterial.isPending}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Upload />} disabled={!ready} loading={uploadMaterial.isPending} onClick={submit}>
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MaterialCard({
  material,
  isNew,
  meta,
  onEdit,
  onDelete,
}: {
  material: StudyMaterialOut
  isNew?: boolean
  /** Extra badge — the admin view uses it to name the owning teacher. */
  meta?: React.ReactNode
  onEdit?: (material: StudyMaterialOut) => void
  onDelete?: (material: StudyMaterialOut) => void
}) {
  const url = resolveFileUrl(material.file_url)
  const provider = material.storage_provider
  const showActions = !!onEdit || !!onDelete

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start gap-3">
        <FileTypeIcon url={material.file_url} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-medium">{material.title}</p>
            <div className="flex shrink-0 items-center gap-1">
              {isNew && (
                <Badge tone="primary" size="sm">
                  New
                </Badge>
              )}
              {showActions && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Actions for ${material.title}`}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onEdit && (
                      <DropdownMenuItem onSelect={() => onEdit(material)}>
                        <Pencil />
                        Rename or retype
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem destructive onSelect={() => onDelete(material)}>
                        <Trash2 />
                        Delete material
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          <p className="truncate text-xs text-muted-foreground">{fileNameFromUrl(material.file_url)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <FreeformBadge value={material.material_type} />
        <Badge tone="accent" size="sm">
          {subjectName(material)}
        </Badge>
        <Badge tone="outline" size="sm">
          {classNameOf(material)}
        </Badge>
        <FiledBy teacherId={material.teacher_id} teacher={material.teacher} />
        {meta}
        {provider && (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* A warning means the file did NOT land where it was meant to,
                  so the badge changes tone rather than reporting the fallback
                  as though it were the configured destination. */}
              <Badge tone={material.storage_warning ? 'warning' : 'neutral'} size="sm">
                {material.storage_warning && <TriangleAlert />}
                {storageLabel(provider)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {material.storage_warning ??
                `Stored in ${storageLabel(provider)}. Deleting this material removes the file from there too.`}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <span className="text-xs text-muted-foreground" title={formatDateTime(material.uploaded_at)}>
          {formatRelative(material.uploaded_at)}
        </span>
        {url && (
          <Button asChild variant="outline" size="sm">
            {/* Cross-origin storage ignores the download attribute, so this
                honestly opens in a new tab rather than faking a download. */}
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open
              <ExternalLink className="size-3" />
            </a>
          </Button>
        )}
      </div>
    </Card>
  )
}

/**
 * Metadata-only edit. The stored file cannot be swapped through the API — to
 * replace it you delete the material and upload again — so this deliberately
 * offers no file picker.
 */
function EditMaterialDialog({
  material,
  onClose,
}: {
  material: StudyMaterialOut | null
  onClose: () => void
}) {
  const updateMaterial = useUpdateMaterial()
  const [title, setTitle] = React.useState('')
  const [type, setType] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!material) return
    setTitle(material.title)
    setType(material.material_type)
    setError(null)
  }, [material])

  const trimmedTitle = title.trim()
  const trimmedType = type.trim().toUpperCase()
  const dirty =
    !!material && (trimmedTitle !== material.title || trimmedType !== material.material_type)
  const ready = trimmedTitle.length > 1 && trimmedType.length > 0 && dirty

  const submit = async () => {
    if (!material || !ready) return
    setError(null)
    try {
      await updateMaterial.mutateAsync({
        materialId: material.id,
        body: {
          ...(trimmedTitle !== material.title && { title: trimmedTitle }),
          ...(trimmedType !== material.material_type && { material_type: trimmedType }),
        },
      })
      onClose()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not update the material.')
    }
  }

  return (
    <Dialog open={!!material} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit material</DialogTitle>
          <DialogDescription>
            Only the title and type can change. To replace the file itself, delete this material and
            upload the new version.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />

          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2.5">
            <FileTypeIcon url={material?.file_url ?? ''} />
            <p className="min-w-0 truncate text-xs text-muted-foreground">
              {material ? fileNameFromUrl(material.file_url) : ''}
            </p>
          </div>

          <Field id="edit-material-title" label="Title" required>
            <Input
              id="edit-material-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          <Field id="edit-material-type" label="Type" hint="Any label works; these are the common ones.">
            <div className="flex flex-wrap gap-2">
              {MATERIAL_TYPE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setType(preset)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    trimmedType === preset
                      ? 'border-primary bg-primary/12 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40',
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
            <Input
              id="edit-material-type"
              className="mt-2"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="WORKSHEET"
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={updateMaterial.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!ready}
            loading={updateMaterial.isPending}
            onClick={submit}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function TeacherMaterialsPage() {
  const isAdmin = useIsAdminViewingTeacher()
  const materialsQuery = useTeacherMaterials(!isAdmin)
  const deleteMaterial = useDeleteMaterial()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<StudyMaterialOut | null>(null)
  const [deleting, setDeleting] = React.useState<StudyMaterialOut | null>(null)
  const [keepFile, setKeepFile] = React.useState(false)
  const [view, setView] = React.useState<'grid' | 'list'>('grid')
  const [subjectFilter, setSubjectFilter] = React.useState<string | null>(null)

  // Default back to a full delete every time the dialog opens; leaving an
  // orphaned file behind should always be a deliberate choice.
  React.useEffect(() => {
    if (deleting) setKeepFile(false)
  }, [deleting])

  const materials = React.useMemo(
    () =>
      [...(materialsQuery.data ?? [])].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)),
    [materialsQuery.data],
  )

  const subjectOptions = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const m of materials) map.set(String(m.subject_id), subjectName(m))
    return [...map.entries()].map(([value, label]) => ({ value, label }))
  }, [materials])

  const filtered = React.useMemo(
    () => (subjectFilter ? materials.filter((m) => String(m.subject_id) === subjectFilter) : materials),
    [materials, subjectFilter],
  )

  if (isAdmin) {
    return (
      <>
        <PageHeader title="Materials" description="Notes and resources you have shared." />
        <AdminTeacherNotice area="materials" />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Materials"
        description="Notes, books and worksheets shared with your classes."
        actions={
          <>
            <Segmented
              layoutId="materials-view"
              value={view}
              onChange={setView}
              size="sm"
              aria-label="Change view"
              options={[
                { value: 'grid', label: 'Grid', icon: <Grid3x3 /> },
                { value: 'list', label: 'List', icon: <LayoutList /> },
              ]}
            />
            <Button variant="primary" icon={<Upload />} onClick={() => setDialogOpen(true)}>
              Upload
            </Button>
          </>
        }
      >
        {subjectOptions.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSubjectFilter(null)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                subjectFilter === null
                  ? 'border-primary bg-primary/12 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40',
              )}
            >
              All subjects
            </button>
            {subjectOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSubjectFilter(option.value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  subjectFilter === option.value
                    ? 'border-primary bg-primary/12 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </PageHeader>

      <QueryBoundary
        query={materialsQuery}
        loading={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={<Library />}
            title="No materials yet"
            description="Upload notes, a book chapter or a worksheet, and every student in the class will see it."
            action={
              <Button variant="primary" icon={<Upload />} onClick={() => setDialogOpen(true)}>
                Upload material
              </Button>
            }
          />
        }
      >
        {() => (
          <div
            className={
              view === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'flex flex-col gap-3'
            }
          >
            {filtered.map((material) => (
              <MaterialCard
                key={material.id}
                material={material}
                onEdit={setEditing}
                onDelete={setDeleting}
              />
            ))}
          </div>
        )}
      </QueryBoundary>

      <UploadDialog open={dialogOpen} onOpenChange={setDialogOpen} existing={materials} />
      <EditMaterialDialog material={editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this material?"
        description={
          deleting
            ? `“${deleting.title}” will disappear from every student's materials list for ${subjectName(deleting)}.`
            : undefined
        }
        confirmLabel="Delete material"
        destructive
        loading={deleteMaterial.isPending}
        onConfirm={() => {
          if (!deleting) return
          deleteMaterial.mutate(
            { materialId: deleting.id, keepFile },
            { onSettled: () => setDeleting(null) },
          )
        }}
      >
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2.5">
          <Checkbox
            checked={keepFile}
            onCheckedChange={(v) => setKeepFile(v === true)}
            className="mt-0.5"
          />
          <span className="text-sm">
            <span className="font-medium">Keep the stored file</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Removes the LMS entry but leaves the file in {storageLabel(deleting?.storage_provider)}
              . Use this only when something outside the LMS links to it — otherwise the file becomes
              unreachable from here.
            </span>
          </span>
        </label>
      </ConfirmDialog>
    </>
  )
}

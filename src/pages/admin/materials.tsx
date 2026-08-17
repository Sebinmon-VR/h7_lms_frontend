import { Grid3x3, HardDrive, LayoutList, Library, Upload, UploadCloud } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { StudyMaterialOut } from '@/api/types'
import {
  useAdminDeleteMaterial,
  useAdminMaterials,
  useAdminUpdateMaterial,
  useAdminUploadMaterial,
  useMappings,
  useStorageStatus,
  useTeachingStaff,
  useUsers,
} from '@/queries/admin.queries'
import { cn } from '@/lib/cn'
import { MATERIAL_TYPE_PRESETS } from '@/lib/constants'
import { MAX_UPLOAD_BYTES, fileNameFromUrl, formatFileSize, storageLabel } from '@/lib/files'
import { buildDirectory, subjectName, teacherName } from '@/lib/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { FileTypeIcon } from '@/components/domain/file-type-icon'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field } from '@/components/forms/field'
import { PageHeader } from '@/components/layout/page-header'
import { MaterialCard } from '@/pages/teacher/materials'

/**
 * Filing the upload under the acting admin.
 *
 * The API expresses this as an omitted `teacher_id`, but a picker with no
 * selection is indistinguishable from one not yet touched — and the Combobox
 * offers no way to clear a choice — so "yourself" is a real option here and
 * translated back to null on submit.
 */
const SELF = '__self'

/**
 * Uploads on behalf of any teacher.
 *
 * Unlike meetings, `teacher_id` here is pure attribution — nothing external is
 * created under that account — so it is genuinely optional.
 */
function AdminUploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const teachersQuery = useTeachingStaff()
  const mappingsQuery = useMappings()
  const [percent, setPercent] = React.useState(0)
  const uploadMaterial = useAdminUploadMaterial(setPercent)

  const [teacherId, setTeacherId] = React.useState(SELF)
  const [classId, setClassId] = React.useState('')
  const [subjectId, setSubjectId] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [materialType, setMaterialType] = React.useState('NOTES')
  const [customType, setCustomType] = React.useState('')
  const [file, setFile] = React.useState<File | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setTeacherId(SELF)
    setClassId('')
    setSubjectId('')
    setTitle('')
    setMaterialType('NOTES')
    setCustomType('')
    setFile(null)
    setError(null)
    setPercent(0)
  }, [open])

  /**
   * With no teacher chosen the material is filed under the admin, so every
   * class is fair game; once one is chosen, follow their assignments.
   */
  const scopedMappings = React.useMemo(() => {
    const all = mappingsQuery.data ?? []
    return teacherId === SELF ? all : all.filter((m) => String(m.teacher.id) === teacherId)
  }, [mappingsQuery.data, teacherId])

  const classOptions = React.useMemo(() => {
    const map = new Map<number, { id: number; name: string; code: string }>()
    for (const m of scopedMappings) map.set(m.class_room.id, m.class_room)
    return [...map.values()]
  }, [scopedMappings])

  const subjectOptions = React.useMemo(() => {
    const map = new Map<number, { id: number; name: string; code: string }>()
    for (const m of scopedMappings) {
      if (classId && m.class_room.id !== Number(classId)) continue
      map.set(m.subject.id, m.subject)
    }
    return [...map.values()]
  }, [scopedMappings, classId])

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
        teacher_id: teacherId === SELF ? null : Number(teacherId),
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

  const teacherOptions = [
    { value: SELF, label: 'Yourself (administrator)', hint: 'Filed under your own account' },
    ...(teachersQuery.data ?? [])
      .filter((t) => t.is_active)
      .map((t) => ({ value: String(t.id), label: t.full_name, hint: t.email })),
  ]

  return (
    <Dialog open={open} onOpenChange={(v) => !uploadMaterial.isPending && onOpenChange(v)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Upload study material</DialogTitle>
          <DialogDescription>
            Shared with every student in the selected class, whoever it is filed under.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFile(null)}
                  disabled={uploadMaterial.isPending}
                >
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
                <p className="mt-1 text-xs text-muted-foreground">
                  Up to {formatFileSize(MAX_UPLOAD_BYTES)}
                </p>
              </>
            )}
          </div>

          <Field
            id="admin-material-teacher"
            label="Attribute to"
            hint="Who this material is listed under. It is visible to the whole class either way."
          >
            <Combobox
              id="admin-material-teacher"
              value={teacherId}
              onChange={(v) => {
                setTeacherId(v)
                setClassId('')
                setSubjectId('')
              }}
              options={teacherOptions}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="admin-material-class" label="Class" required>
              <Combobox
                id="admin-material-class"
                value={classId || null}
                onChange={(v) => {
                  setClassId(v)
                  setSubjectId('')
                }}
                placeholder="Select a class"
                options={classOptions.map((c) => ({ value: String(c.id), label: c.name, hint: c.code }))}
              />
            </Field>
            <Field id="admin-material-subject" label="Subject" required>
              <Combobox
                id="admin-material-subject"
                value={subjectId || null}
                onChange={setSubjectId}
                disabled={!classId}
                placeholder={classId ? 'Select a subject' : 'Choose a class first'}
                options={subjectOptions.map((s) => ({ value: String(s.id), label: s.name, hint: s.code }))}
              />
            </Field>
          </div>

          <Field id="admin-material-title" label="Title" required>
            <Input
              id="admin-material-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Chapter 4 — Trees"
            />
          </Field>

          <Field id="admin-material-type" label="Type" hint="Any label works; these are the common ones.">
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
          <Button
            variant="primary"
            icon={<Upload />}
            disabled={!ready}
            loading={uploadMaterial.isPending}
            onClick={submit}
          >
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditMaterialDialog({
  material,
  onClose,
}: {
  material: StudyMaterialOut | null
  onClose: () => void
}) {
  const updateMaterial = useAdminUpdateMaterial()
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
        <DialogBody className="space-y-4">
          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2.5">
            <FileTypeIcon url={material?.file_url ?? ''} />
            <p className="min-w-0 truncate text-xs text-muted-foreground">
              {material ? fileNameFromUrl(material.file_url) : ''}
            </p>
          </div>

          <Field id="admin-edit-material-title" label="Title" required>
            <Input
              id="admin-edit-material-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          <Field id="admin-edit-material-type" label="Type" hint="Any label works; these are the common ones.">
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
              id="admin-edit-material-type"
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
          <Button variant="primary" disabled={!ready} loading={updateMaterial.isPending} onClick={submit}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminMaterialsPage() {
  const materialsQuery = useAdminMaterials()
  const usersQuery = useUsers()
  const storageQuery = useStorageStatus()
  const deleteMaterial = useAdminDeleteMaterial()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<StudyMaterialOut | null>(null)
  const [deleting, setDeleting] = React.useState<StudyMaterialOut | null>(null)
  const [keepFile, setKeepFile] = React.useState(false)
  const [view, setView] = React.useState<'grid' | 'list'>('grid')
  const [teacherFilter, setTeacherFilter] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (deleting) setKeepFile(false)
  }, [deleting])

  const userDir = React.useMemo(() => buildDirectory(usersQuery.data ?? []), [usersQuery.data])

  const materials = React.useMemo(
    () =>
      [...(materialsQuery.data ?? [])].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)),
    [materialsQuery.data],
  )

  const teacherOptions = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const m of materials) map.set(String(m.teacher_id), teacherName(m, userDir))
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [materials, userDir])

  const filtered = React.useMemo(
    () => (teacherFilter ? materials.filter((m) => String(m.teacher_id) === teacherFilter) : materials),
    [materials, teacherFilter],
  )

  /**
   * Files that fell back to local disk while a cloud provider was configured.
   * Students can usually still reach them, but they live outside the backup and
   * sharing story the cloud provider was chosen for, so they are worth naming.
   */
  const strandedLocally = React.useMemo(() => {
    const configured = storageQuery.data?.provider
    if (!configured || configured === 'LOCAL') return []
    return materials.filter((m) => m.storage_provider === 'LOCAL')
  }, [materials, storageQuery.data])

  return (
    <>
      <PageHeader
        title="Materials"
        description="Every file uploaded across all teachers, and where each one is actually stored."
        actions={
          <>
            <Segmented
              layoutId="admin-materials-view"
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
        {teacherOptions.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTeacherFilter(null)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                teacherFilter === null
                  ? 'border-primary bg-primary/12 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40',
              )}
            >
              All teachers
            </button>
            {teacherOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTeacherFilter(option.value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  teacherFilter === option.value
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

      {strandedLocally.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/8 p-4 text-sm">
          <HardDrive className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium">
              {strandedLocally.length}{' '}
              {strandedLocally.length === 1 ? 'file is' : 'files are'} on the server disk, not{' '}
              {storageLabel(storageQuery.data?.provider)}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              These uploads fell back to local storage because the cloud provider was unreachable at
              the time. Check{' '}
              <Link to="/admin/integrations" className="font-medium text-primary hover:underline">
                Integrations
              </Link>
              , then re-upload them to move the files.
            </p>
          </div>
        </div>
      )}

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
            description="Nobody has uploaded anything. You can upload on a teacher's behalf to get started."
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
                meta={
                  <Badge tone="info" size="sm">
                    {teacherName(material, userDir)}
                  </Badge>
                }
                onEdit={setEditing}
                onDelete={setDeleting}
              />
            ))}
          </div>
        )}
      </QueryBoundary>

      <AdminUploadDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <EditMaterialDialog material={editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this material?"
        description={
          deleting
            ? `“${deleting.title}” will disappear from every student's materials list for ${subjectName(deleting)}, and from ${teacherName(deleting, userDir)}'s own materials page.`
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

import { ExternalLink, HardDrive, Library, Link2, Pencil, Search, Trash2, Upload, UploadCloud, Video, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import type { RecordingLogEntry, StudyMaterialOut } from '@/api/types'
import {
  useAdminDeleteMaterial,
  useAdminMaterials,
  useAdminMeetings,
  useAdminShareLink,
  useAdminUpdateMaterial,
  useAdminUploadMaterial,
  useClasses,
  useMappings,
  useRecordingLog,
  useRecordingStatus,
  useStorageStatus,
  useTeachingStaff,
  useUsers,
} from '@/queries/admin.queries'
import { cn } from '@/lib/cn'
import { MATERIAL_TYPE_PRESETS } from '@/lib/constants'
import { formatDate, parseApiDateTime } from '@/lib/datetime'
import { MAX_UPLOAD_BYTES, fileKind, fileNameFromUrl, formatFileSize, resolveFileUrl, storageLabel } from '@/lib/files'
import { countLabel } from '@/lib/format'
import { isClassVideo } from '@/lib/materials'
import { isLinkMaterial, isWebUrl, normaliseUrl } from '@/lib/links'
import { tidyName as tidy } from '@/lib/names'
import { formatSchoolTime } from '@/lib/school-time'
import { buildDirectory, className as classNameOf, subjectName, teacherName } from '@/lib/select'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { Input, Textarea } from '@/components/ui/input'
import { ProgressBar } from '@/components/ui/progress'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { FileTypeIcon } from '@/components/domain/file-type-icon'
import { LinkSourceField, YouTubePreview } from '@/components/domain/link-preview'
import { ErrorState } from '@/components/feedback/states'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field, FormError } from '@/components/forms/field'
import { Band, WorkspaceHeader } from '@/components/layout/workspace'
import { LOG_LABEL, RecordingDetail, RecordingsPanel, StatusDot, logTitle } from './recordings'
import { AUTO_TYPE, type AddMode } from '@/pages/teacher/materials'

/*
 * Materials, laid out like the other admin workspaces: white bands, no
 * cards. The library is one table, filtered by type, class and teacher; adding
 * and editing open as a strip above it rather than a dialog.
 */

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
function AdminUploadPanel({ initialMode = 'file', onClose }: { initialMode?: AddMode; onClose: () => void }) {
  const teachersQuery = useTeachingStaff()
  const mappingsQuery = useMappings()
  const [percent, setPercent] = React.useState(0)
  const uploadMaterial = useAdminUploadMaterial(setPercent)
  const shareLink = useAdminShareLink()
  const [mode, setMode] = React.useState<AddMode>(initialMode)
  const [linkUrl, setLinkUrl] = React.useState('')
  const [description, setDescription] = React.useState('')
  const pending = uploadMaterial.isPending || shareLink.isPending

  const [teacherId, setTeacherId] = React.useState(SELF)
  const [classId, setClassId] = React.useState('')
  const [subjectId, setSubjectId] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [materialType, setMaterialType] = React.useState(initialMode === 'link' ? AUTO_TYPE : 'NOTES')
  const [customType, setCustomType] = React.useState('')
  const [file, setFile] = React.useState<File | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

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

  const switchMode = (next: AddMode) => {
    setMode(next)
    setError(null)
    if (next === 'link' && materialType === 'NOTES') setMaterialType(AUTO_TYPE)
    if (next === 'file' && materialType === AUTO_TYPE) setMaterialType('NOTES')
  }

  const resolvedType = materialType === '__custom' ? customType.trim().toUpperCase() : materialType
  const source = mode === 'file' ? !!file : isWebUrl(linkUrl)
  const ready = !!classId && !!subjectId && title.trim().length > 1 && source && !!resolvedType

  const submit = async () => {
    if (!ready) return
    setError(null)
    if (mode === 'link') {
      try {
        await shareLink.mutateAsync({
          teacher_id: teacherId === SELF ? null : Number(teacherId),
          class_id: Number(classId),
          subject_id: Number(subjectId),
          title: title.trim(),
          external_url: normaliseUrl(linkUrl),
          material_type: resolvedType === AUTO_TYPE ? null : resolvedType,
          description: description.trim() || null,
        })
        onClose()
      } catch (err) {
        setError((err as { message?: string })?.message ?? 'Could not share the link.')
      }
      return
    }
    if (!file) return
    try {
      await uploadMaterial.mutateAsync({
        teacher_id: teacherId === SELF ? null : Number(teacherId),
        class_id: Number(classId),
        subject_id: Number(subjectId),
        title: title.trim(),
        material_type: resolvedType,
        file,
      })
      onClose()
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
    <Band className="border-b border-border bg-primary/[0.03]">
      <div className="max-w-3xl space-y-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-foreground">Add to the library</h2>
            <p className="text-xs text-muted-foreground">Shared with every student in the selected class, whoever it is filed under</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" disabled={pending}>
            <X />
          </Button>
        </div>
          <FormError message={error} />

          <Segmented
            layoutId="admin-material-add-mode"
            value={mode}
            onChange={switchMode}
            aria-label="What to add"
            options={[
              { value: 'file', label: 'Upload a file', icon: <UploadCloud /> },
              { value: 'link', label: 'Share a link', icon: <Link2 /> },
            ]}
          />

          {mode === 'link' ? (
            <LinkSourceField
              id="admin-material-link"
              url={linkUrl}
              onUrlChange={setLinkUrl}
              title={title}
              onSuggestTitle={setTitle}
              disabled={pending}
            />
          ) : (
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
          )}

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

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
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

          <Field
            id="admin-material-type"
            label="Type"
            hint={
              mode === 'link'
                ? 'Automatic files a YouTube video under Videos and any other page as a link.'
                : 'Any label works; these are the common ones.'
            }
          >
            <div className="flex flex-wrap gap-2">
              {mode === 'link' && (
                <button
                  type="button"
                  onClick={() => setMaterialType(AUTO_TYPE)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    materialType === AUTO_TYPE
                      ? 'border-primary bg-primary/12 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40',
                  )}
                >
                  Automatic
                </button>
              )}
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

          {mode === 'link' && (
            <Field
              id="admin-material-description"
              label="Note for students"
              hint="Optional — what to watch for, or which part matters."
            >
              <Textarea
                id="admin-material-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                className="min-h-20"
              />
            </Field>
          )}

          {uploadMaterial.isPending && (
            <div>
              <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                <span>Uploading…</span>
                <span className="tabular-nums">{percent}%</span>
              </div>
              <ProgressBar value={percent} />
            </div>
          )}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" icon={mode === 'link' ? <Link2 /> : <Upload />} disabled={!ready} loading={pending} onClick={submit}>
            {mode === 'link' ? 'Share link' : 'Upload'}
          </Button>
        </div>
      </div>
    </Band>
  )
}

function EditMaterialPanel({ material, onClose }: { material: StudyMaterialOut; onClose: () => void }) {
  const updateMaterial = useAdminUpdateMaterial()
  const [title, setTitle] = React.useState('')
  const [type, setType] = React.useState('')
  const [linkUrl, setLinkUrl] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!material) return
    setTitle(material.title)
    setType(material.material_type)
    setLinkUrl(material.external_url ?? '')
    setDescription(material.description ?? '')
    setError(null)
  }, [material])

  const isLink = !!material && isLinkMaterial(material)
  const trimmedTitle = title.trim()
  const trimmedType = type.trim().toUpperCase()
  const nextUrl = isLink ? normaliseUrl(linkUrl) : ''
  const urlChanged = isLink && nextUrl !== material?.external_url
  const descriptionChanged = isLink && description.trim() !== (material?.description ?? '')
  const dirty =
    !!material &&
    (trimmedTitle !== material.title ||
      trimmedType !== material.material_type ||
      urlChanged ||
      descriptionChanged)
  const ready =
    trimmedTitle.length > 1 && trimmedType.length > 0 && dirty && (!isLink || isWebUrl(linkUrl))

  const submit = async () => {
    if (!material || !ready) return
    setError(null)
    try {
      await updateMaterial.mutateAsync({
        materialId: material.id,
        body: {
          ...(trimmedTitle !== material.title && { title: trimmedTitle }),
          ...(trimmedType !== material.material_type && { material_type: trimmedType }),
          ...(urlChanged && { external_url: nextUrl }),
          ...(descriptionChanged && { description: description.trim() }),
        },
      })
      onClose()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not update the material.')
    }
  }

  return (
    <Band className="border-b border-border bg-primary/[0.03]">
      <div className="max-w-3xl space-y-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-foreground">{isLink ? 'Edit link' : `Edit ${material.title}`}</h2>
            <p className="text-xs text-muted-foreground">
              {isLink
                ? 'Change where the link points, its title, type or note'
                : 'Only the title and type can change. To replace the file, delete it and upload the new version'}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
          <FormError message={error} />

          {isLink ? (
            <LinkSourceField
              id="admin-edit-material-link"
              url={linkUrl}
              onUrlChange={setLinkUrl}
              title={title}
              onSuggestTitle={setTitle}
              disabled={updateMaterial.isPending}
            />
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2.5">
              <FileTypeIcon url={material?.file_url ?? ''} />
              <p className="min-w-0 truncate text-xs text-muted-foreground">
                {material ? fileNameFromUrl(material.file_url) : ''}
              </p>
            </div>
          )}

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

          {isLink && (
            <Field id="admin-edit-material-description" label="Note for students">
              <Textarea
                id="admin-edit-material-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                className="min-h-20"
              />
            </Field>
          )}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={updateMaterial.isPending}>
            Cancel
          </Button>
          <Button size="sm" disabled={!ready} loading={updateMaterial.isPending} onClick={submit}>
            Save changes
          </Button>
        </div>
      </div>
    </Band>
  )
}

// ==================================================================== page

type Shelf = 'ALL' | 'NOTES' | 'VIDEOS' | 'LINKS' | 'OTHER'

/** Which shelf a material sits on in the list's filter. */
function shelfOf(m: StudyMaterialOut): Exclude<Shelf, 'ALL'> {
  if (isLinkMaterial(m)) return m.link_kind === 'YOUTUBE' ? 'VIDEOS' : 'LINKS'
  if (isClassVideo(m) || fileKind(m.file_url) === 'video') return 'VIDEOS'
  const t = m.material_type.toUpperCase()
  if (t === 'NOTES' || ['pdf', 'doc', 'slides', 'text'].includes(fileKind(m.file_url))) return 'NOTES'
  return 'OTHER'
}

function typeLabel(m: StudyMaterialOut) {
  if (isLinkMaterial(m)) return m.link_kind === 'YOUTUBE' ? 'YouTube video' : 'Web link'
  if (isClassVideo(m)) return 'Class video'
  const t = m.material_type.toUpperCase()
  return t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ')
}

/**
 * Whether a stored file is still there. The API answers `/files/...` with a
 * redirect to a signed link when the file exists, and a 404 when it does not;
 * not following the redirect keeps this a cheap request that never touches
 * the file itself. Anything else (offline, a link) counts as "there".
 */
function useFileMissing(material: StudyMaterialOut) {
  const stored = !isLinkMaterial(material) && material.file_url.startsWith('/files/')
  const url = stored ? resolveFileUrl(material.file_url) : null
  return useQuery({
    queryKey: ['file-missing', url],
    enabled: !!url,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      try {
        const res = await fetch(url!, { redirect: 'manual' })
        return res.status === 404
      } catch {
        return false
      }
    },
  })
}

/**
 * The file itself, as far as the browser can show it: a PDF or image inline,
 * a video with controls, a YouTube link as its player. Anything else — a
 * Word file, a web page that refuses to be framed — gets a plain "open" panel.
 */
function Preview({ material, onReupload, onDelete }: { material: StudyMaterialOut; onReupload: () => void; onDelete: () => void }) {
  const missing = useFileMissing(material)
  const link = isLinkMaterial(material)
  const url = link ? material.external_url : resolveFileUrl(material.file_url)
  const kind = isClassVideo(material) ? 'video' : fileKind(material.file_url)
  const frame = 'w-full overflow-hidden rounded-md border border-border bg-muted/30'

  if (missing.isPending && missing.fetchStatus !== 'idle') return <Skeleton className="h-64 w-full" />
  if (missing.data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 border-l-2 border-warning bg-warning/5 px-6 py-12 text-center">
        <HardDrive className="size-7 text-warning" strokeWidth={1.5} />
        <div className="max-w-md">
          <p className="text-sm font-medium text-foreground">This file is missing from storage</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The entry is still in the library, but the file behind it ({fileNameFromUrl(material.file_url)}) is no longer in{' '}
            {storageLabel(material.storage_provider)}. Students who open it see an error. Upload it again, then delete this entry.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" icon={<Upload />} onClick={onReupload}>
            Upload again
          </Button>
          <Button variant="outline" size="sm" icon={<Trash2 />} onClick={onDelete}>
            Delete entry
          </Button>
        </div>
      </div>
    )
  }
  if (link && material.youtube_id) return <YouTubePreview videoId={material.youtube_id} title={material.title} className={frame} />
  if (url && !link && kind === 'pdf') return <iframe src={url} title={material.title} className={cn(frame, 'h-[60vh] min-h-80')} />
  if (url && !link && kind === 'image') return <img src={url} alt={material.title} className={cn(frame, 'max-h-[60vh] object-contain')} />
  if (url && !link && kind === 'video')
    return (
      <video src={url} controls preload="metadata" className={cn(frame, 'max-h-[60vh] bg-black')}>
        <track kind="captions" />
      </video>
    )

  return (
    <div className={cn(frame, 'flex flex-col items-center justify-center gap-3 py-14 text-center')}>
      <FileTypeIcon url={link ? (material.external_url ?? '') : material.file_url} size="lg" />
      <div className="max-w-sm px-4">
        <p className="text-sm font-medium text-foreground">{link ? 'This page opens on its own site' : 'No preview for this kind of file'}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{link ? material.external_url : fileNameFromUrl(material.file_url)}</p>
      </div>
      {url && (
        <Button asChild size="sm">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            {link ? 'Open link' : 'Open file'}
          </a>
        </Button>
      )}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-2 first:pl-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-foreground">{children}</p>
    </div>
  )
}

/** What is chosen in the middle column: a file or link, or a class recording. */
type Pick = { kind: 'material'; id: number } | { kind: 'recording'; key: string }

const SHELVES: { key: Shelf; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'NOTES', label: 'Notes' },
  { key: 'VIDEOS', label: 'Videos' },
  { key: 'LINKS', label: 'Links' },
  { key: 'OTHER', label: 'Other' },
]

/**
 * Materials in three columns, like a mail app: the classes, the chosen
 * class's files and recordings by subject, and the chosen item large on the
 * right. Nothing to open or close; one click goes one column further.
 */
export default function AdminMaterialsPage() {
  const materialsQuery = useAdminMaterials()
  const usersQuery = useUsers()
  const storageQuery = useStorageStatus()
  const deleteMaterial = useAdminDeleteMaterial()
  const logQuery = useRecordingLog(200)
  const classesQuery = useClasses()
  const meetingsQuery = useAdminMeetings()

  const [panel, setPanel] = React.useState<{ kind: 'add'; mode: AddMode } | { kind: 'edit'; material: StudyMaterialOut } | null>(null)
  const [deleting, setDeleting] = React.useState<StudyMaterialOut | null>(null)
  const [keepFile, setKeepFile] = React.useState(false)
  const [classId, setClassId] = React.useState<number | 'all' | null>(null)
  const [shelf, setShelf] = React.useState<Shelf>('ALL')
  const [search, setSearch] = React.useState('')
  const [pick, setPick] = React.useState<Pick | null>(null)

  // Recording status opens as a strip above the columns; the old Class
  // Recordings address (`?tab=recordings`) lands with it open.
  const [params] = useSearchParams()
  const [statusOpen, setStatusOpen] = React.useState(params.get('tab') === 'recordings')
  const recStatus = useRecordingStatus()
  const recProblems = recStatus.data ? (recStatus.data.problems ?? recStatus.data.meet_problems ?? []) : []
  const recHealthy =
    !!recStatus.data &&
    recStatus.data.enabled &&
    recStatus.data.running &&
    !!(recStatus.data.storage_configured ?? recStatus.data.drive_configured) &&
    recProblems.length === 0

  React.useEffect(() => {
    if (deleting) setKeepFile(false)
  }, [deleting])

  const userDir = React.useMemo(() => buildDirectory(usersQuery.data ?? []), [usersQuery.data])
  const materials = React.useMemo(
    () => [...(materialsQuery.data ?? [])].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)),
    [materialsQuery.data],
  )

  /**
   * Files that fell back to local disk while a cloud provider was configured.
   * Students can usually still reach them, but they live outside the backup and
   * sharing story the cloud provider was chosen for, so they are worth naming.
   */
  const strandedIds = React.useMemo(() => {
    const configured = storageQuery.data?.provider
    if (!configured || configured === 'LOCAL') return new Set<number>()
    return new Set(materials.filter((m) => m.storage_provider === 'LOCAL').map((m) => m.id))
  }, [materials, storageQuery.data])

  /**
   * Class recordings, filed under their class. A class-room recording names
   * its class; a scheduled session's names only the meeting, so its class
   * comes from the meeting.
   */
  const recKey = (e: RecordingLogEntry) => e.recording_id ?? e.recording_name
  const meetingClass = React.useMemo(
    () => new Map((meetingsQuery.data ?? []).map((mt) => [mt.id, mt.class_id] as [number, number])),
    [meetingsQuery.data],
  )
  const classNames = React.useMemo(
    () => new Map((classesQuery.data ?? []).map((c) => [c.id, c.name] as [number, string])),
    [classesQuery.data],
  )
  const recClass = (e: RecordingLogEntry) => e.class_id ?? (e.meeting_id != null ? meetingClass.get(e.meeting_id) : undefined) ?? null
  const recordings = (logQuery.data ?? []).filter((e) => e.status !== 'UNMATCHED' && recClass(e) != null)

  // ------------------------------------------------------ column 1: classes
  const classList = React.useMemo(() => {
    const map = new Map<number, { id: number; name: string; count: number }>()
    const bump = (id: number, name: string) => {
      const c = map.get(id) ?? { id, name, count: 0 }
      c.count += 1
      map.set(id, c)
    }
    for (const m of materials) bump(m.class_id, classNameOf(m))
    for (const e of recordings) bump(recClass(e)!, classNames.get(recClass(e)!) ?? `Class ${recClass(e)}`)
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, recordings.length, classNames, meetingClass])
  const activeClass = classId ?? classList[0]?.id ?? 'all'

  // ------------------------------------------------- column 2: the class
  const needle = search.trim().toLowerCase()
  const inClass = materials.filter(
    (m) =>
      (activeClass === 'all' || m.class_id === activeClass) &&
      (shelf === 'ALL' || shelfOf(m) === shelf) &&
      (!needle || `${m.title} ${subjectName(m)} ${teacherName(m, userDir)}`.toLowerCase().includes(needle)),
  )
  const recsInClass = recordings.filter(
    (e) =>
      (activeClass === 'all' || recClass(e) === activeClass) &&
      (shelf === 'ALL' || shelf === 'VIDEOS') &&
      (!needle || `${logTitle(e)} ${e.started_by_name ?? ''}`.toLowerCase().includes(needle)),
  )
  const shelfCount = (s: Shelf) =>
    materials.filter((m) => (activeClass === 'all' || m.class_id === activeClass) && (s === 'ALL' || shelfOf(m) === s)).length +
    (s === 'ALL' || s === 'VIDEOS' ? recordings.filter((e) => activeClass === 'all' || recClass(e) === activeClass).length : 0)

  // One class: a section per subject. Every class: a section per class.
  const sections = (() => {
    const map = new Map<string, { key: string; label: string; items: StudyMaterialOut[] }>()
    for (const m of inClass) {
      const key = activeClass === 'all' ? `c${m.class_id}` : `s${m.subject_id}`
      const label = activeClass === 'all' ? classNameOf(m) : tidy(subjectName(m))
      if (!map.has(key)) map.set(key, { key, label, items: [] })
      map.get(key)!.items.push(m)
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
  })()

  const firstPick: Pick | null = sections[0]?.items[0]
    ? { kind: 'material', id: sections[0].items[0].id }
    : recsInClass[0]
      ? { kind: 'recording', key: recKey(recsInClass[0]) }
      : null
  const current = pick ?? firstPick
  const pickedMaterial = current?.kind === 'material' ? (inClass.find((m) => m.id === current.id) ?? null) : null
  const pickedRecording = current?.kind === 'recording' ? (recsInClass.find((e) => recKey(e) === current.key) ?? null) : null
  const activeName = activeClass === 'all' ? 'All classes' : (classList.find((c) => c.id === activeClass)?.name ?? 'Class')

  const chooseClass = (id: number | 'all') => {
    setClassId(id)
    setPick(null)
    setPanel(null)
  }
  const choose = (p: Pick) => {
    setPick(p)
    setPanel(null)
  }

  const row = (active: boolean) =>
    cn('relative flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors', active ? 'bg-primary/5' : 'hover:bg-muted/40')
  const bar = (active: boolean) => active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title="Materials"
        description="Every file, link and class recording, by class. Pick one to preview it"
        icon={Library}
        actions={
          <>
            <Button variant={statusOpen ? 'secondary' : 'ghost'} size="sm" onClick={() => setStatusOpen((v) => !v)} aria-expanded={statusOpen}>
              <span className={cn('size-2 rounded-full', recStatus.data ? (recHealthy ? 'bg-success' : 'bg-warning') : 'bg-muted-foreground/40')} aria-hidden />
              Recording status
            </Button>
            <Button variant="outline" size="sm" icon={<Link2 />} onClick={() => setPanel({ kind: 'add', mode: 'link' })}>
              Share link
            </Button>
            <Button size="sm" icon={<Upload />} onClick={() => setPanel({ kind: 'add', mode: 'file' })}>
              Upload
            </Button>
          </>
        }
      />

      <div className="!mt-0">
        {statusOpen && <RecordingsPanel onClose={() => setStatusOpen(false)} />}
        {panel?.kind === 'add' && <AdminUploadPanel key={`add-${panel.mode}`} initialMode={panel.mode} onClose={() => setPanel(null)} />}
        {panel?.kind === 'edit' && <EditMaterialPanel key={`edit-${panel.material.id}`} material={panel.material} onClose={() => setPanel(null)} />}

        <Band className="border-b border-border">
          {materialsQuery.isPending ? (
            <div className="grid gap-4 py-4 lg:grid-cols-[13rem_22rem_minmax(0,1fr)]">
              <Skeleton className="h-80 w-full" />
              <Skeleton className="h-80 w-full" />
              <Skeleton className="h-80 w-full" />
            </div>
          ) : materialsQuery.isError ? (
            <div className="py-6">
              <ErrorState error={materialsQuery.error} onRetry={() => materialsQuery.refetch()} />
            </div>
          ) : (
            <div className="-mx-4 grid sm:-mx-6 lg:mx-0 lg:-ml-8 lg:h-[calc(100vh-12rem)] lg:min-h-[28rem] lg:grid-cols-[13rem_22rem_minmax(0,1fr)] lg:divide-x lg:divide-border">
              {/* --------------------------------------------- 1. classes */}
              <nav aria-label="Classes" className="max-h-60 overflow-y-auto border-b border-border bg-muted/20 lg:max-h-none lg:min-h-0 lg:border-b-0">
                <p className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground lg:pl-8">Classes</p>
                <ul>
                  {[{ id: 'all' as const, name: 'All classes', count: materials.length + recordings.length }, ...classList].map((c) => {
                    const active = activeClass === c.id
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => chooseClass(c.id)}
                          aria-current={active ? 'true' : undefined}
                          className={cn(row(active), 'py-1.5 lg:pl-8', active ? 'bg-card font-medium text-primary' : 'text-foreground')}
                        >
                          {bar(active)}
                          <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                          <span className="text-xs tabular-nums text-muted-foreground">{c.count}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </nav>

              {/* ------------------------------------- 2. the class's items */}
              <div className="flex min-w-0 flex-col border-b border-border lg:min-h-0 lg:border-b-0">
                <div className="space-y-2 border-b border-border px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="truncate text-base font-medium text-foreground">{activeName}</h2>
                    <span className="shrink-0 text-xs text-muted-foreground">{countLabel(inClass.length + recsInClass.length, 'item')}</span>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this class" aria-label="Search" className="h-8 py-1 pl-8 text-sm" />
                  </div>
                  <div className="flex gap-1" role="radiogroup" aria-label="Kind">
                    {SHELVES.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        role="radio"
                        aria-checked={shelf === s.key}
                        onClick={() => {
                          setShelf(s.key)
                          setPick(null)
                        }}
                        className={cn(
                          'flex-1 rounded-md px-1 py-1 text-xs transition-colors',
                          shelf === s.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {s.label}
                        <span className="ml-1 tabular-nums opacity-70">{shelfCount(s.key)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="max-h-96 flex-1 overflow-y-auto lg:max-h-none lg:min-h-0">
                  {inClass.length === 0 && recsInClass.length === 0 && (
                    <p className="px-4 py-12 text-center text-sm text-muted-foreground">{needle ? 'Nothing matches' : 'Nothing here yet'}</p>
                  )}
                  {sections.map((sec) => (
                    <section key={sec.key}>
                      <h3 className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-muted px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {sec.label}
                        <span className="tabular-nums">{sec.items.length}</span>
                      </h3>
                      <ul className="divide-y divide-border">
                        {sec.items.map((m) => {
                          const active = !!pickedMaterial && pickedMaterial.id === m.id
                          const added = parseApiDateTime(m.uploaded_at)
                          return (
                            <li key={m.id}>
                              <button type="button" onClick={() => choose({ kind: 'material', id: m.id })} aria-current={active ? 'true' : undefined} className={row(active)}>
                                {bar(active)}
                                <FileTypeIcon url={isLinkMaterial(m) ? (m.external_url ?? '') : m.file_url} size="sm" />
                                <span className="min-w-0 flex-1">
                                  <span className={cn('block truncate text-sm', active ? 'font-medium text-primary' : 'text-foreground')} title={m.title}>
                                    {m.title}
                                  </span>
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    {activeClass === 'all' ? `${tidy(subjectName(m))} · ` : ''}
                                    {tidy(teacherName(m, userDir))}
                                  </span>
                                </span>
                                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                  {strandedIds.has(m.id) ? <span className="text-warning">disk</span> : added ? formatDate(added, 'd MMM') : ''}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  ))}
                  {recsInClass.length > 0 && (
                    <section>
                      <h3 className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-muted px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Class recordings
                        <span className="tabular-nums">{recsInClass.length}</span>
                      </h3>
                      <ul className="divide-y divide-border">
                        {recsInClass.map((e) => {
                          const active = !!pickedRecording && recKey(pickedRecording) === recKey(e)
                          const when = parseApiDateTime(e.started_at ?? e.claimed_at)
                          const cls = classNames.get(recClass(e)!) ?? ''
                          // A class-room recording is titled with the class itself.
                          const titled = logTitle(e).trim().toLowerCase() !== cls.trim().toLowerCase()
                          return (
                            <li key={recKey(e)}>
                              <button type="button" onClick={() => choose({ kind: 'recording', key: recKey(e) })} aria-current={active ? 'true' : undefined} className={row(active)}>
                                {bar(active)}
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                  <Video className="size-4" strokeWidth={1.75} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className={cn('block truncate text-sm', active ? 'font-medium text-primary' : 'text-foreground')}>
                                    {titled ? logTitle(e) : when ? `${formatDate(when, 'd MMM')}, ${formatSchoolTime(when)}` : 'Class recording'}
                                  </span>
                                  <span className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                                    {e.status !== 'STORED' && <StatusDot status={e.status} pulse={e.status === 'RECORDING'} />}
                                    {activeClass === 'all' ? `${cls} · ` : ''}
                                    {e.status === 'STORED' ? (e.started_by_name ? tidy(e.started_by_name) : 'Saved') : (LOG_LABEL[e.status] ?? e.status)}
                                  </span>
                                </span>
                                {titled && when && <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatDate(when, 'd MMM')}</span>}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )}
                </div>
              </div>

              {/* -------------------------------------------- 3. the preview */}
              <section className="min-w-0 px-4 py-5 lg:min-h-0 lg:overflow-y-auto lg:px-8">
                {pickedRecording ? (
                  <RecordingDetail key={recKey(pickedRecording)} entry={pickedRecording} />
                ) : pickedMaterial ? (
                  <div key={pickedMaterial.id} className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {classNameOf(pickedMaterial)} · {tidy(subjectName(pickedMaterial))}
                        </p>
                        <h2 className="text-xl font-medium tracking-tight text-foreground">{pickedMaterial.title}</h2>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {(isLinkMaterial(pickedMaterial) ? pickedMaterial.external_url : resolveFileUrl(pickedMaterial.file_url)) && (
                          <Button asChild variant="outline" size="sm">
                            <a
                              href={(isLinkMaterial(pickedMaterial) ? pickedMaterial.external_url : resolveFileUrl(pickedMaterial.file_url)) ?? undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink />
                              Open
                            </a>
                          </Button>
                        )}
                        {!isClassVideo(pickedMaterial) && (
                          <Button variant="outline" size="sm" onClick={() => setPanel({ kind: 'edit', material: pickedMaterial })}>
                            <Pencil />
                            Edit
                          </Button>
                        )}
                        <Button variant="ghost" size="icon-sm" className="hover:text-danger" aria-label={`Delete ${pickedMaterial.title}`} onClick={() => setDeleting(pickedMaterial)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </div>

                    <Preview material={pickedMaterial} onReupload={() => setPanel({ kind: 'add', mode: 'file' })} onDelete={() => setDeleting(pickedMaterial)} />

                    {pickedMaterial.description && <p className="border-l-2 border-border pl-3 text-sm text-foreground">{pickedMaterial.description}</p>}

                    <div className="grid grid-cols-2 border-y border-border sm:grid-cols-4 sm:divide-x sm:divide-border">
                      <Fact label="Type">{typeLabel(pickedMaterial)}</Fact>
                      <Fact label="Shared by">{tidy(teacherName(pickedMaterial, userDir))}</Fact>
                      <Fact label="Added">{parseApiDateTime(pickedMaterial.uploaded_at) ? formatDate(parseApiDateTime(pickedMaterial.uploaded_at)!, 'd MMM yyyy') : '—'}</Fact>
                      <Fact label="Stored in">
                        <span className={strandedIds.has(pickedMaterial.id) ? 'text-warning' : undefined}>
                          {isLinkMaterial(pickedMaterial) ? 'The web' : storageLabel(pickedMaterial.storage_provider)}
                        </span>
                      </Fact>
                    </div>
                    {strandedIds.has(pickedMaterial.id) && (
                      <p className="flex items-start gap-2 text-xs text-muted-foreground">
                        <HardDrive className="mt-px size-3.5 shrink-0 text-warning" />
                        This file is on the server disk, not {storageLabel(storageQuery.data?.provider)}. Check{' '}
                        <Link to="/admin/integrations" className="font-medium text-primary hover:underline">
                          Integrations
                        </Link>
                        , then upload it again to move it.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                    <Library className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
                    <p className="mt-2 text-sm font-medium text-foreground">{materials.length === 0 ? 'Nothing shared yet' : 'Pick something to preview it'}</p>
                    {materials.length === 0 && (
                      <Button size="sm" className="mt-4" icon={<Upload />} onClick={() => setPanel({ kind: 'add', mode: 'file' })}>
                        Upload
                      </Button>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </Band>
      </div>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={deleting && isClassVideo(deleting) ? 'Remove this class video?' : 'Delete this material?'}
        description={
          deleting
            ? isClassVideo(deleting)
              ? `“${deleting.title}” will be removed from the class library for ${subjectName(deleting)}. The video itself is kept in ${teacherName(deleting, userDir)}'s Recordings, where it can be published again.`
              : `“${deleting.title}” will disappear from every student's materials list for ${subjectName(deleting)}, and from ${teacherName(deleting, userDir)}'s own materials page.`
            : undefined
        }
        confirmLabel={deleting && isClassVideo(deleting) ? 'Remove from library' : 'Delete material'}
        destructive
        loading={deleteMaterial.isPending}
        onConfirm={() => {
          if (!deleting) return
          const classVideo = isClassVideo(deleting)
          deleteMaterial.mutate({ materialId: deleting.id, keepFile: classVideo ? false : keepFile, classVideo }, { onSettled: () => setDeleting(null) })
        }}
      >
        {deleting && !isClassVideo(deleting) && !isLinkMaterial(deleting) && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2.5">
            <Checkbox checked={keepFile} onCheckedChange={(v) => setKeepFile(v === true)} className="mt-0.5" />
            <span className="text-sm">
              <span className="font-medium">Keep the stored file</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Removes the LMS entry but leaves the file in {storageLabel(deleting?.storage_provider)}. Use this only when something outside the
                LMS links to it.
              </span>
            </span>
          </label>
        )}
      </ConfirmDialog>
    </div>
  )
}

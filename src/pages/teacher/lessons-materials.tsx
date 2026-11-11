import { ExternalLink, Film, Grid3x3, LayoutList, Link2, MoreHorizontal, Pencil, Plus, Trash2, TriangleAlert, Upload } from 'lucide-react'
import * as React from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import type { StudyMaterialOut, TopicOut } from '@/api/types'
import { useDeleteMaterial, useDeleteTopic, useMyClasses, useTeacherMaterials, useTeacherTopics } from '@/queries/teacher.queries'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime, formatDayLabel, formatRelative, parseApiDate, todayApiDate } from '@/lib/datetime'
import { fileNameFromUrl, resolveFileUrl, storageLabel } from '@/lib/files'
import { isLinkMaterial, linkHost, materialYoutubeId } from '@/lib/links'
import { isClassVideo } from '@/lib/materials'
import { subjectName } from '@/lib/select'
import { usePersistentState } from '@/lib/hooks'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Segmented } from '@/components/ui/segmented'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { FileTypeIcon } from '@/components/domain/file-type-icon'
import { FiledBy } from '@/components/domain/filed-by'
import { LinkTypeIcon } from '@/components/domain/link-preview'
import { AttachmentList } from '@/components/forms/attachment-picker'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Band, WorkspaceHeader } from '@/components/layout/workspace'
import { DetailHeader, ListEmpty, ListItem, ListPane, ListSearch, SplitView } from '@/components/layout/split-view'
import { EditMaterialDialog, MaterialCard, UploadDialog, type AddMode } from './materials'
import { AdminTeacherNotice, useIsAdminViewingTeacher } from './teacher-guard'
import { TopicFormDialog } from './topics'

/*
 * Lessons and materials together, list + detail: each class and subject on
 * the left with how far its syllabus has got, and on the right that course's
 * lessons (topics, by date) and materials, a tab each. /teacher/topics opens
 * on Lessons and /teacher/materials on Materials, so old links still land.
 */

type Tab = 'lessons' | 'materials'
type Course = { key: string; classId: number; subjectId: number; cls: string; subject: string }

const courseKey = (classId: number, subjectId: number) => `${classId}-${subjectId}`
const PATH: Record<Tab, string> = { lessons: '/teacher/topics', materials: '/teacher/materials' }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Days since a date, for "last covered". */
function daysSince(date: string | null): number | null {
  const d = parseApiDate(date)
  const today = parseApiDate(todayApiDate())
  return d && today ? Math.round((today.getTime() - d.getTime()) / 86_400_000) : null
}
function sinceText(days: number | null): string {
  if (days == null) return 'nothing yet'
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

function ActionsMenu({ label, items }: { label: string; items: { label: string; icon: React.ReactNode; destructive?: boolean; onSelect: () => void }[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((it) => (
          <DropdownMenuItem key={it.label} destructive={it.destructive} onSelect={it.onSelect}>
            {it.icon}
            {it.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The topics, newest first, under one heading strip per date. */
function LessonsList({
  topics,
  showCourse,
  onEdit,
  onDelete,
}: {
  topics: TopicOut[]
  showCourse: boolean
  onEdit: (t: TopicOut) => void
  onDelete: (t: TopicOut) => void
}) {
  const byDate = React.useMemo(() => {
    const map = new Map<string, TopicOut[]>()
    for (const t of topics) map.set(t.date_covered, [...(map.get(t.date_covered) ?? []), t])
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [topics])

  return (
    <div>
      {byDate.map(([date, items]) => (
        <section key={date}>
          <p className="border-b border-border bg-muted/40 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {formatDayLabel(date)}
            {/* "Today" and "Yesterday" need the date beside them; "Mon, 2 Nov" already is one. */}
            {!/\d/.test(formatDayLabel(date)) && (
              <span className="ml-2 font-normal normal-case tracking-normal">{formatDate(date, 'EEE d MMM yyyy')}</span>
            )}
          </p>
          <ul>
            {items.map((t) => (
              <li key={t.id} className="flex items-start gap-4 border-b border-border px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{t.topic_title}</p>
                  {showCourse && (
                    <p className="text-xs text-muted-foreground">
                      {t.class_room?.name ?? `Class ${t.class_id}`} · {subjectName(t)}
                    </p>
                  )}
                  {t.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.description}</p>}
                  {(t.attachments ?? []).length > 0 && <AttachmentList attachments={t.attachments ?? []} compact className="mt-2" />}
                  <FiledBy teacherId={t.teacher_id} teacher={t.teacher} />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block" title="How much of the topic was covered">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${t.completion_percentage}%` }} />
                  </span>
                  <span className="w-10 text-right text-sm tabular-nums text-foreground">{Math.round(t.completion_percentage)}%</span>
                  <ActionsMenu
                    label={`Actions for ${t.topic_title}`}
                    items={[
                      { label: 'Edit topic', icon: <Pencil />, onSelect: () => onEdit(t) },
                      { label: 'Delete topic', icon: <Trash2 />, destructive: true, onSelect: () => onDelete(t) },
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Materials as rows: what it is, where it came from, when, and Open. */
function MaterialsList({
  materials,
  showCourse,
  onEdit,
  onDelete,
}: {
  materials: StudyMaterialOut[]
  showCourse: boolean
  onEdit: (m: StudyMaterialOut) => void
  onDelete: (m: StudyMaterialOut) => void
}) {
  return (
    <ul>
      {materials.map((m) => {
        const isLink = isLinkMaterial(m)
        const url = isLink ? m.external_url! : resolveFileUrl(m.file_url)
        const video = isClassVideo(m)
        return (
          <li key={m.id} className="flex items-center gap-3 border-b border-border px-5 py-3">
            {isLink ? <LinkTypeIcon youtube={!!materialYoutubeId(m)} /> : <FileTypeIcon url={m.file_url} />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{m.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {video ? (
                  <span className="inline-flex items-center gap-1 font-medium text-primary">
                    <Film className="size-3" />
                    Class video
                  </span>
                ) : (
                  <span className="font-medium text-foreground/70">{(m.material_type || 'File').replace(/_/g, ' ').toLowerCase()}</span>
                )}
                {' · '}
                {isLink ? linkHost(url) : fileNameFromUrl(m.file_url)}
                {showCourse && ` · ${m.class_room?.name ?? `Class ${m.class_id}`} · ${subjectName(m)}`}
              </p>
              {m.storage_warning && (
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-warning" title={m.storage_warning}>
                  <TriangleAlert className="size-3" />
                  Stored in {storageLabel(m.storage_provider)} instead of the usual place
                </p>
              )}
              <FiledBy teacherId={m.teacher_id} teacher={m.teacher} />
            </div>
            <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground sm:block" title={formatDateTime(m.uploaded_at)}>
              {formatRelative(m.uploaded_at)}
            </span>
            {url && (
              <Button asChild variant="outline" size="xs">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  Open
                  <ExternalLink className="size-3" />
                </a>
              </Button>
            )}
            <ActionsMenu
              label={`Actions for ${m.title}`}
              items={[
                { label: isLink ? 'Edit link' : 'Rename or retype', icon: <Pencil />, onSelect: () => onEdit(m) },
                { label: video ? 'Remove from library' : 'Delete material', icon: <Trash2 />, destructive: true, onSelect: () => onDelete(m) },
              ]}
            />
          </li>
        )
      })}
    </ul>
  )
}

function LessonsMaterials({ tab }: { tab: Tab }) {
  const isAdmin = useIsAdminViewingTeacher()
  const navigate = useNavigate()
  const { search: locationSearch } = useLocation()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = React.useState('')
  // Materials as preview cards (the original look, with the video preview) or as a compact list.
  const [view, setView] = usePersistentState<'grid' | 'list'>('h7.teacher-materials-view', 'grid')

  const mappingsQuery = useMyClasses(!isAdmin)
  const topicsQuery = useTeacherTopics(!isAdmin)
  const materialsQuery = useTeacherMaterials(!isAdmin)
  const deleteTopic = useDeleteTopic()
  const deleteMaterial = useDeleteMaterial()

  const [topicDialog, setTopicDialog] = React.useState(false)
  const [editingTopic, setEditingTopic] = React.useState<TopicOut | null>(null)
  const [deletingTopic, setDeletingTopic] = React.useState<TopicOut | null>(null)
  const [uploadOpen, setUploadOpen] = React.useState(false)
  const [addMode, setAddMode] = React.useState<AddMode>('file')
  const [editingMaterial, setEditingMaterial] = React.useState<StudyMaterialOut | null>(null)
  const [deletingMaterial, setDeletingMaterial] = React.useState<StudyMaterialOut | null>(null)
  const [keepFile, setKeepFile] = React.useState(false)
  React.useEffect(() => {
    if (deletingMaterial) setKeepFile(false)
  }, [deletingMaterial])

  const topics = React.useMemo(() => topicsQuery.data ?? [], [topicsQuery.data])
  const materials = React.useMemo(
    () => [...(materialsQuery.data ?? [])].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)),
    [materialsQuery.data],
  )

  /**
   * Every course the teacher can see: their own class + subject pairs, plus any
   * that only appear in records (a class they lead, where colleagues log too).
   */
  const courses = React.useMemo<Course[]>(() => {
    const map = new Map<string, Course>()
    const add = (classId: number, subjectId: number, cls: string, subject: string) => {
      const key = courseKey(classId, subjectId)
      if (!map.has(key)) map.set(key, { key, classId, subjectId, cls, subject })
    }
    for (const m of mappingsQuery.data ?? []) add(m.class_room.id, m.subject.id, m.class_room.name, m.subject.name)
    for (const t of topics) add(t.class_id, t.subject_id, t.class_room?.name ?? `Class ${t.class_id}`, subjectName(t))
    for (const m of materials) add(m.class_id, m.subject_id, m.class_room?.name ?? `Class ${m.class_id}`, subjectName(m))
    return [...map.values()].sort(
      (a, b) => a.cls.localeCompare(b.cls, undefined, { numeric: true }) || a.subject.localeCompare(b.subject),
    )
  }, [mappingsQuery.data, topics, materials])

  const stats = React.useMemo(() => {
    const map = new Map<string, { topics: TopicOut[]; materials: number }>()
    const get = (k: string) => map.get(k) ?? (map.set(k, { topics: [], materials: 0 }), map.get(k)!)
    for (const t of topics) get(courseKey(t.class_id, t.subject_id)).topics.push(t)
    for (const m of materials) get(courseKey(m.class_id, m.subject_id)).materials += 1
    return map
  }, [topics, materials])
  const summary = (list: TopicOut[]) => ({
    completion: list.length ? list.reduce((n, t) => n + (t.completion_percentage ?? 0), 0) / list.length : null,
    last: list.map((t) => t.date_covered).sort((a, b) => b.localeCompare(a))[0] ?? null,
  })

  const active = courses.find((c) => c.key === params.get('course')) ?? null
  const pick = (key: string | null) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (key) p.set('course', key)
        else p.delete('course')
        return p
      },
      { replace: true },
    )
  const goTab = (t: Tab) => navigate(`${PATH[t]}${locationSearch}`)

  const shownTopics = active ? topics.filter((t) => t.class_id === active.classId && t.subject_id === active.subjectId) : topics
  const shownMaterials = active
    ? materials.filter((m) => m.class_id === active.classId && m.subject_id === active.subjectId)
    : materials
  const shownSummary = summary(shownTopics)

  if (isAdmin) {
    return (
      <>
        <WorkspaceHeader title="Lessons & Materials" description="Topics you have covered and notes you have shared." />
        <div className="pt-6">
          <AdminTeacherNotice area="materials" />
        </div>
      </>
    )
  }

  const q = search.trim().toLowerCase()
  const visibleCourses = q ? courses.filter((c) => `${c.cls} ${c.subject}`.toLowerCase().includes(q)) : courses
  const loading = mappingsQuery.isPending || topicsQuery.isPending || materialsQuery.isPending
  const openTopic = () => {
    setEditingTopic(null)
    setTopicDialog(true)
  }
  const openUpload = (mode: AddMode) => {
    setAddMode(mode)
    setUploadOpen(true)
  }

  return (
    <>
      <WorkspaceHeader
        title="Lessons & Materials"
        description="What you have taught each class, and the notes, books and links you have shared. Students see both."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => openUpload('link')}>
              <Link2 />
              Share link
            </Button>
            <Button variant={tab === 'materials' ? 'primary' : 'outline'} size="sm" onClick={() => openUpload('file')}>
              <Upload />
              Upload
            </Button>
            <Button variant={tab === 'lessons' ? 'primary' : 'outline'} size="sm" onClick={openTopic}>
              <Plus />
              Log topic
            </Button>
          </>
        }
      />

      <Band className="border-b border-border px-0 sm:px-0 lg:px-0">
        <div className="lg:h-[calc(100vh-11rem)] lg:min-h-[30rem]">
          <SplitView
            list={
              <ListPane
                toolbar={<ListSearch value={search} onChange={setSearch} placeholder="Search classes or subjects" />}
                footer={`${plural(topics.length, 'topic')} · ${plural(materials.length, 'material')}`}
              >
                {loading ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 rounded" />
                    ))}
                  </div>
                ) : (
                  <>
                    {!q && (
                      <ListItem
                        active={!active}
                        onClick={() => pick(null)}
                        title="All classes"
                        sub={`${plural(topics.length, 'topic')} · ${plural(materials.length, 'material')}`}
                      />
                    )}
                    {visibleCourses.length === 0 ? (
                      <ListEmpty>{q ? 'No class or subject matches.' : 'No classes are assigned to you yet.'}</ListEmpty>
                    ) : (
                      visibleCourses.map((c) => {
                        const s = stats.get(c.key)
                        const sum = summary(s?.topics ?? [])
                        const days = daysSince(sum.last)
                        const stale = days == null || days > 7
                        return (
                          <ListItem
                            key={c.key}
                            active={active?.key === c.key}
                            onClick={() => pick(c.key)}
                            title={
                              <>
                                {c.cls}
                                <span className="font-normal text-muted-foreground"> · {c.subject}</span>
                              </>
                            }
                            sub={
                              <>
                                {plural(s?.topics.length ?? 0, 'topic')} · {plural(s?.materials ?? 0, 'material')} ·{' '}
                                <span className={stale ? 'text-warning' : undefined}>last {sinceText(days)}</span>
                              </>
                            }
                            right={
                              <span className="tabular-nums text-muted-foreground">
                                {sum.completion == null ? '—' : `${Math.round(sum.completion)}%`}
                              </span>
                            }
                          />
                        )
                      })
                    )}
                  </>
                )}
              </ListPane>
            }
            detail={
              <div>
                <DetailHeader
                  title={
                    active ? (
                      <>
                        {active.cls}
                        <span className="font-normal text-muted-foreground"> · {active.subject}</span>
                      </>
                    ) : (
                      'All classes'
                    )
                  }
                  sub={`${plural(shownTopics.length, 'topic')} logged · last ${sinceText(daysSince(shownSummary.last))} · ${plural(shownMaterials.length, 'material')} shared`}
                />

                {/* Syllabus progress: the mean of each topic's completion, as students see it. */}
                <div className="flex items-center gap-4 border-b border-border px-5 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Syllabus</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${shownSummary.completion ?? 0}%` }} />
                  </span>
                  <span className="w-12 text-right text-sm font-semibold tabular-nums text-foreground">
                    {shownSummary.completion == null ? '—' : `${Math.round(shownSummary.completion)}%`}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 border-b border-border px-5">
                <nav className="flex gap-6" role="tablist">
                  {(
                    [
                      ['lessons', 'Lessons', shownTopics.length],
                      ['materials', 'Materials', shownMaterials.length],
                    ] as const
                  ).map(([key, label, n]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={tab === key}
                      onClick={() => goTab(key)}
                      className={cn(
                        '-mb-px border-b-2 py-2.5 text-sm font-medium transition-colors',
                        tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {label}
                      <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{n}</span>
                    </button>
                  ))}
                </nav>
                {tab === 'materials' && (
                  <Segmented
                    layoutId="teacher-materials-view"
                    value={view}
                    onChange={setView}
                    size="sm"
                    aria-label="Change view"
                    options={[
                      { value: 'grid', label: 'Grid', icon: <Grid3x3 /> },
                      { value: 'list', label: 'List', icon: <LayoutList /> },
                    ]}
                  />
                )}
                </div>

                {loading ? (
                  <div className="space-y-2 p-5">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 rounded" />
                    ))}
                  </div>
                ) : tab === 'lessons' ? (
                  shownTopics.length === 0 ? (
                    <ListEmpty>
                      No topics logged here yet. Press <strong className="text-foreground">Log topic</strong> after a class:
                      students see it as their syllabus progress.
                    </ListEmpty>
                  ) : (
                    <LessonsList
                      topics={shownTopics}
                      showCourse={!active}
                      onEdit={(t) => {
                        setEditingTopic(t)
                        setTopicDialog(true)
                      }}
                      onDelete={setDeletingTopic}
                    />
                  )
                ) : shownMaterials.length === 0 ? (
                  <ListEmpty>
                    Nothing shared here yet. <strong className="text-foreground">Upload</strong> notes, a book chapter or a
                    worksheet, or <strong className="text-foreground">Share link</strong> to a video.
                  </ListEmpty>
                ) : view === 'grid' ? (
                  <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
                    {shownMaterials.map((m) => (
                      <MaterialCard key={m.id} material={m} onEdit={setEditingMaterial} onDelete={setDeletingMaterial} />
                    ))}
                  </div>
                ) : (
                  <MaterialsList
                    materials={shownMaterials}
                    showCourse={!active}
                    onEdit={setEditingMaterial}
                    onDelete={setDeletingMaterial}
                  />
                )}
              </div>
            }
          />
        </div>
      </Band>

      <TopicFormDialog
        open={topicDialog}
        onOpenChange={setTopicDialog}
        editing={editingTopic}
        preset={!editingTopic && active ? { class_id: active.classId, subject_id: active.subjectId } : null}
      />
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} existing={materials} initialMode={addMode} />
      <EditMaterialDialog material={editingMaterial} onClose={() => setEditingMaterial(null)} />

      <ConfirmDialog
        open={!!deletingTopic}
        onOpenChange={(v) => !v && setDeletingTopic(null)}
        title="Delete this topic?"
        description={
          deletingTopic
            ? `“${deletingTopic.topic_title}” will be removed from the syllabus and from every student's progress for ${subjectName(deletingTopic)}.`
            : undefined
        }
        confirmLabel="Delete topic"
        destructive
        loading={deleteTopic.isPending}
        onConfirm={() => {
          if (!deletingTopic) return
          deleteTopic.mutate(deletingTopic.id, { onSettled: () => setDeletingTopic(null) })
        }}
      />

      <ConfirmDialog
        open={!!deletingMaterial}
        onOpenChange={(v) => !v && setDeletingMaterial(null)}
        title={deletingMaterial && isClassVideo(deletingMaterial) ? 'Remove this class video?' : 'Delete this material?'}
        description={
          deletingMaterial
            ? isClassVideo(deletingMaterial)
              ? `“${deletingMaterial.title}” will be removed from the class library for ${subjectName(deletingMaterial)}. The video itself is kept in your Recordings, where you can publish it again.`
              : `“${deletingMaterial.title}” will disappear from every student's materials list for ${subjectName(deletingMaterial)}.`
            : undefined
        }
        confirmLabel={deletingMaterial && isClassVideo(deletingMaterial) ? 'Remove from library' : 'Delete material'}
        destructive
        loading={deleteMaterial.isPending}
        onConfirm={() => {
          if (!deletingMaterial) return
          const classVideo = isClassVideo(deletingMaterial)
          deleteMaterial.mutate(
            { materialId: deletingMaterial.id, keepFile: classVideo ? false : keepFile, classVideo },
            { onSettled: () => setDeletingMaterial(null) },
          )
        }}
      >
        {deletingMaterial && !isClassVideo(deletingMaterial) && !isLinkMaterial(deletingMaterial) && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2.5">
            <Checkbox checked={keepFile} onCheckedChange={(v) => setKeepFile(v === true)} className="mt-0.5" />
            <span className="text-sm">
              <span className="font-medium">Keep the stored file</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Removes the LMS entry but leaves the file in {storageLabel(deletingMaterial.storage_provider)}. Use this only
                when something outside the LMS links to it; otherwise the file becomes unreachable from here.
              </span>
            </span>
          </label>
        )}
      </ConfirmDialog>
    </>
  )
}

export function TeacherLessonsPage() {
  return <LessonsMaterials tab="lessons" />
}

export function TeacherMaterialsPage() {
  return <LessonsMaterials tab="materials" />
}

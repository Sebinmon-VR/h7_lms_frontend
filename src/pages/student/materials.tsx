import {
  ArrowRight,
  BookOpen,
  ExternalLink,
  Film,
  FolderOpen,
  NotebookText,
  Play,
  Search,
} from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

import type { StudyMaterialOut } from '@/api/types'
import { useStudentMaterials } from '@/queries/student.queries'
import { newSince } from '@/lib/derive'
import { STORAGE_KEYS } from '@/lib/constants'
import { formatDate, formatDateTime, formatRelative } from '@/lib/datetime'
import { fileNameFromUrl, resolveFileUrl } from '@/lib/files'
import { humanize } from '@/lib/format'
import { usePersistentState } from '@/lib/hooks'
import { LIBRARY_SHELVES, isClassVideo, libraryShelf, type LibraryShelf } from '@/lib/materials'
import { isLinkMaterial, linkHost, materialYoutubeId, youtubeThumbnail } from '@/lib/links'
import { subjectName } from '@/lib/select'
import { subjectLook, toneStyle } from '@/lib/subjects'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileTypeIcon } from '@/components/domain/file-type-icon'
import { LinkTypeIcon } from '@/components/domain/link-preview'
import { VideoPlayerDialog, VideoPoster } from '@/components/domain/class-video'
import { ErrorState } from '@/components/feedback/states'
import { Appear, Stagger } from '@/components/fun/motion'
import { FunChip, FunEmpty, FunPageHeader, FunSection, SubjectTile } from '@/components/fun/fun-ui'
import { PageHeader } from '@/components/layout/page-header'
import { AdminStudentNotice, NotEnrolledState, useEnrollmentStatus } from './student-guard'

/**
 * The student's Library — class videos, notes and books in one place.
 *
 * Route stays `/student/materials` so older links keep working. The shelf and
 * subject live in the URL (`?subject=<id>&tab=videos`) so other pages — the
 * syllabus, a dashboard tile — can open it straight at the right place.
 */

type LibraryTab = 'all' | LibraryShelf

const TABS: readonly LibraryTab[] = ['all', ...LIBRARY_SHELVES]

const SHELF_LOOK: Record<
  LibraryShelf,
  { label: string; Icon: typeof Film; emoji: string; empty: { title: string; body: string } }
> = {
  videos: {
    label: 'Videos',
    Icon: Film,
    emoji: '🎬',
    empty: {
      title: 'No class videos yet',
      body: 'Recordings of your classes and videos your teachers share will be here to watch as many times as you like.',
    },
  },
  notes: {
    label: 'Notes',
    Icon: NotebookText,
    emoji: '📝',
    empty: {
      title: 'No notes yet',
      body: 'Notes your teachers share with your class are kept here.',
    },
  },
  books: {
    label: 'Books',
    Icon: BookOpen,
    emoji: '📖',
    empty: {
      title: 'No books yet',
      body: 'Books and chapters your teachers share are kept here.',
    },
  },
  other: {
    label: 'Other',
    Icon: FolderOpen,
    emoji: '🧩',
    empty: {
      title: 'Nothing else yet',
      body: 'Worksheets, assignments and syllabus files will turn up here.',
    },
  },
}

function isLibraryTab(value: string | null): value is LibraryTab {
  return !!value && (TABS as readonly string[]).includes(value)
}

// ------------------------------------------------------------------- cards

function VideoCard({
  material,
  isNew,
  onPlay,
  className,
}: {
  material: StudyMaterialOut
  isNew?: boolean
  onPlay: (material: StudyMaterialOut) => void
  className?: string
}) {
  const subject = subjectName(material)
  const youtubeId = materialYoutubeId(material)

  return (
    <Appear
      style={toneStyle(subjectLook(subject).tone)}
      className={cn('sticker sticker-hover', className)}
    >
      <button
        type="button"
        onClick={() => onPlay(material)}
        className="group flex h-full w-full flex-col rounded-2xl p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label={`Watch ${material.title}`}
      >
        <div className="relative">
          {youtubeId ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
              <img
                src={youtubeThumbnail(youtubeId)}
                alt=""
                loading="lazy"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-10 w-14 items-center justify-center rounded-xl bg-[#ff0000] text-white shadow-lg transition-transform duration-200 group-hover:scale-110">
                  <Play className="size-5 translate-x-[1px] fill-current" />
                </span>
              </span>
              <span className="absolute bottom-2 left-2 rounded-md bg-black/65 px-1.5 py-0.5 text-2xs font-semibold text-white">
                {subject}
              </span>
            </div>
          ) : (
            <VideoPoster subject={subject} caption={subject} />
          )}
          {isNew && (
            <Badge tone="primary" size="sm" className="absolute left-2 top-2 animate-wiggle bg-card">
              New!
            </Badge>
          )}
        </div>
        <div className="min-w-0 px-1.5 pb-1 pt-2.5">
          <p className="line-clamp-2 text-sm font-bold leading-snug">{material.title}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {material.teacher ? `${material.teacher.full_name} · ` : ''}
            <span title={formatDateTime(material.uploaded_at)}>
              {formatDate(material.uploaded_at, 'd MMM yyyy')}
            </span>
          </p>
        </div>
      </button>
    </Appear>
  )
}

function DocumentCard({
  material,
  isNew,
  showType,
}: {
  material: StudyMaterialOut
  isNew?: boolean
  /** The "Other" shelf mixes kinds, so there the type is worth a chip. */
  showType?: boolean
}) {
  const isLink = isLinkMaterial(material)
  const url = isLink ? material.external_url! : resolveFileUrl(material.file_url)
  const subject = subjectName(material)

  return (
    <Appear style={toneStyle(subjectLook(subject).tone)} className="sticker flex flex-col p-4">
      <div className="flex items-start gap-3">
        {isLink ? <LinkTypeIcon /> : <FileTypeIcon url={material.file_url} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-bold leading-snug">{material.title}</p>
            {isNew && (
              <Badge tone="primary" size="sm" className="shrink-0 animate-wiggle">
                New!
              </Badge>
            )}
          </div>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <SubjectTile subject={subject} size="sm" className="size-5 rounded-md text-2xs shadow-none" />
            <span className="truncate">{subject}</span>
          </p>
        </div>
      </div>

      <div className="mt-3 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        {showType && (
          <Badge tone="outline" size="sm" className="shrink-0">
            {humanize(material.material_type)}
          </Badge>
        )}
        <span className="min-w-0 truncate">
          {isLink ? linkHost(url) : fileNameFromUrl(material.file_url)}
        </span>
      </div>
      {material.description && (
        <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">
          {material.description}
        </p>
      )}

      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <div className="min-w-0 text-xs text-muted-foreground">
          {material.teacher && <p className="truncate">From {material.teacher.full_name}</p>}
          <p title={formatDateTime(material.uploaded_at)}>{formatRelative(material.uploaded_at)}</p>
        </div>
        {url && (
          <Button asChild variant="primary" size="sm" className="shrink-0">
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open
              <ExternalLink className="size-3" />
            </a>
          </Button>
        )}
      </div>
    </Appear>
  )
}

// -------------------------------------------------------------------- page

export default function StudentLibraryPage() {
  const enrollment = useEnrollmentStatus()
  const materialsQuery = useStudentMaterials(!enrollment.isAdmin)
  const [params, setParams] = useSearchParams()

  const [lastSeen, setLastSeen] = usePersistentState<string | null>(
    STORAGE_KEYS.lastSeenMaterials,
    null,
  )
  const [search, setSearch] = React.useState('')
  const [playingId, setPlayingId] = React.useState<number | null>(null)

  const tabParam = params.get('tab')
  const tab: LibraryTab = isLibraryTab(tabParam) ? tabParam : 'all'
  const subjectFilter = params.get('subject')

  /** Writes one search param, replacing history so Back still leaves the page. */
  const setParam = React.useCallback(
    (key: 'tab' | 'subject', value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value == null || (key === 'tab' && value === 'all')) next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const materials = React.useMemo(
    () =>
      [...(materialsQuery.data ?? [])].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)),
    [materialsQuery.data],
  )

  // Snapshot "new since last visit" once, then move the marker forward.
  const freshIds = React.useMemo(() => newSince(materials, lastSeen), [materials, lastSeen])

  React.useEffect(() => {
    if (materials.length === 0) return
    const timer = window.setTimeout(() => setLastSeen(new Date().toISOString()), 4000)
    return () => window.clearTimeout(timer)
  }, [materials.length, setLastSeen])

  const subjectOptions = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const m of materials) map.set(String(m.subject_id), subjectName(m))
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [materials])

  const filtered = React.useMemo(() => {
    const needles = search.toLowerCase().split(/\s+/).filter(Boolean)
    return materials.filter((m) => {
      if (subjectFilter && String(m.subject_id) !== subjectFilter) return false
      if (needles.length === 0) return true
      const haystack = [
        m.title,
        isLinkMaterial(m) ? linkHost(m.external_url) : fileNameFromUrl(m.file_url),
        m.description ?? '',
        subjectName(m),
        m.material_type,
        m.teacher?.full_name ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return needles.every((n) => haystack.includes(n))
    })
  }, [materials, search, subjectFilter])

  const shelves = React.useMemo(() => {
    const out: Record<LibraryShelf, StudyMaterialOut[]> = {
      videos: [],
      notes: [],
      books: [],
      other: [],
    }
    for (const m of filtered) out[libraryShelf(m)].push(m)
    return out
  }, [filtered])

  // Follow the live copy, so a refetch (fresh signed links) reaches an open player.
  const playing = playingId != null ? (materials.find((m) => m.id === playingId) ?? null) : null
  const playingUrl = playing ? resolveFileUrl(playing.file_url) : null
  const playingYoutubeId = playing ? materialYoutubeId(playing) : null

  const filtering = !!subjectFilter || search.trim().length > 0
  const clearFilters = () => {
    setSearch('')
    setParam('subject', null)
  }
  const newCount = freshIds.size

  if (enrollment.isAdmin) {
    return (
      <>
        <PageHeader title="Library" description="Class videos, notes and books from teachers." />
        <AdminStudentNotice />
      </>
    )
  }

  if (enrollment.notEnrolled) {
    return (
      <>
        <FunPageHeader emoji="📚" title="Library" />
        <NotEnrolledState />
      </>
    )
  }

  const renderEmpty = (shelf: LibraryShelf | 'all') => {
    if (filtering) {
      return (
        <FunEmpty
          mood="curious"
          title="Nothing matches"
          description="Try a different word, or show every subject again."
          action={
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Show everything
            </Button>
          }
        />
      )
    }
    if (shelf === 'all') {
      return (
        <FunEmpty
          mood="sleepy"
          title="Your library is empty for now"
          description="Class videos, notes and books your teachers share will all be kept here."
        />
      )
    }
    return (
      <FunEmpty
        mood="sleepy"
        title={SHELF_LOOK[shelf].empty.title}
        description={SHELF_LOOK[shelf].empty.body}
      />
    )
  }

  const play = (material: StudyMaterialOut) => setPlayingId(material.id)

  const videoGrid = (list: StudyMaterialOut[]) => (
    <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((m) => (
        <VideoCard key={m.id} material={m} isNew={freshIds.has(m.id)} onPlay={play} />
      ))}
    </Stagger>
  )

  const documentGrid = (list: StudyMaterialOut[], showType?: boolean) => (
    <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((m) => (
        <DocumentCard key={m.id} material={m} isNew={freshIds.has(m.id)} showType={showType} />
      ))}
    </Stagger>
  )

  const seeAll = (shelf: LibraryShelf, count: number) => (
    <Button variant="ghost" size="sm" onClick={() => setParam('tab', shelf)}>
      See all {count}
      <ArrowRight className="size-3.5" />
    </Button>
  )

  const RECENT = 6

  const overview = () => {
    if (filtered.length === 0) return renderEmpty('all')
    return (
      <div className="space-y-8">
        {shelves.videos.length > 0 && (
          <FunSection
            emoji="🎬"
            title="Latest class videos"
            action={seeAll('videos', shelves.videos.length)}
          >
            {/* A shelf you scroll sideways, like any video app; snapping keeps
                a card from stopping half in view on a phone. */}
            <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2">
              {shelves.videos.slice(0, 10).map((m) => (
                <VideoCard
                  key={m.id}
                  material={m}
                  isNew={freshIds.has(m.id)}
                  onPlay={play}
                  className="w-64 shrink-0 snap-start sm:w-72"
                />
              ))}
            </div>
          </FunSection>
        )}
        {(['notes', 'books', 'other'] as const).map((shelf) =>
          shelves[shelf].length > 0 ? (
            <FunSection
              key={shelf}
              emoji={SHELF_LOOK[shelf].emoji}
              title={
                shelf === 'notes' ? 'Recent notes' : shelf === 'books' ? 'Books' : 'Other things'
              }
              action={
                shelves[shelf].length > RECENT ? seeAll(shelf, shelves[shelf].length) : undefined
              }
            >
              {documentGrid(shelves[shelf].slice(0, RECENT), shelf === 'other')}
            </FunSection>
          ) : null,
        )}
      </div>
    )
  }

  return (
    <>
      <FunPageHeader
        emoji="📚"
        tone={5}
        title="Library"
        description={
          newCount > 0
            ? `${newCount} new thing${newCount === 1 ? '' : 's'} since you last looked!`
            : 'Class videos, notes and books from your teachers.'
        }
      >
        <div className="flex flex-col gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search videos, notes and books…"
            leading={<Search />}
            className="max-w-md"
            aria-label="Search the library"
          />
          {subjectOptions.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <FunChip active={!subjectFilter} onClick={() => setParam('subject', null)}>
                All subjects
              </FunChip>
              {subjectOptions.map((option) => (
                <FunChip
                  key={option.value}
                  active={subjectFilter === option.value}
                  tone={subjectLook(option.label).tone}
                  onClick={() =>
                    setParam('subject', subjectFilter === option.value ? null : option.value)
                  }
                >
                  {subjectLook(option.label).emoji} {option.label}
                </FunChip>
              ))}
            </div>
          )}
        </div>
      </FunPageHeader>

      {materialsQuery.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-lg rounded-lg" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-2xl" />
            ))}
          </div>
        </div>
      ) : materialsQuery.isError ? (
        <ErrorState error={materialsQuery.error} onRetry={() => materialsQuery.refetch()} />
      ) : (
        <Tabs value={tab} onValueChange={(v) => setParam('tab', v)}>
          {/* Five tabs do not fit a phone; the strip scrolls rather than wraps. */}
          <div className="no-scrollbar -mx-1 overflow-x-auto px-1">
            <TabsList>
              <TabsTrigger value="all">All ({filtered.length})</TabsTrigger>
              {LIBRARY_SHELVES.map((shelf) => {
                const { label, Icon } = SHELF_LOOK[shelf]
                return (
                  <TabsTrigger key={shelf} value={shelf}>
                    <Icon />
                    {label} ({shelves[shelf].length})
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          <TabsContent value="all">{overview()}</TabsContent>
          <TabsContent value="videos">
            {shelves.videos.length === 0 ? renderEmpty('videos') : videoGrid(shelves.videos)}
          </TabsContent>
          {(['notes', 'books', 'other'] as const).map((shelf) => (
            <TabsContent key={shelf} value={shelf}>
              {shelves[shelf].length === 0
                ? renderEmpty(shelf)
                : documentGrid(shelves[shelf], shelf === 'other')}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <VideoPlayerDialog
        open={!!playing}
        onOpenChange={(v) => !v && setPlayingId(null)}
        title={playing?.title ?? ''}
        description={
          playing
            ? [
                subjectName(playing),
                playing.teacher?.full_name,
                formatDate(playing.uploaded_at, 'EEEE d MMMM yyyy'),
              ]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        parts={playingUrl ? [{ url: playingUrl, label: playing?.title, youtubeId: playingYoutubeId }] : []}
        allowDownload={false}
        onRefresh={() => void materialsQuery.refetch()}
        meta={
          playing && (
            <>
              {playing.description && (
                <p className="w-full whitespace-pre-line text-sm text-muted-foreground">
                  {playing.description}
                </p>
              )}
              <Badge tone="accent" size="sm">
                {subjectLook(subjectName(playing)).emoji} {subjectName(playing)}
              </Badge>
              {isClassVideo(playing) && (
                <Badge tone="primary" size="sm">
                  <Film />
                  Class video
                </Badge>
              )}
              {playingYoutubeId && (
                <Badge tone="outline" size="sm">
                  YouTube
                </Badge>
              )}
              {playing.teacher && (
                <Badge tone="outline" size="sm">
                  From {playing.teacher.full_name}
                </Badge>
              )}
            </>
          )
        }
      />
    </>
  )
}

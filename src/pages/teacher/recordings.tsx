import {
  CheckCircle2,
  Clapperboard,
  Clock,
  Eye,
  Film,
  Library,
  Loader2,
  Pencil,
  Play,
  Send,
  Trash2,
  TriangleAlert,
  Undo2,
  Wand2,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { ClassRecordingOut } from '@/api/recordings.api'
import type { TeacherMappingOut } from '@/api/types'
import { ApiError } from '@/api/errors'
import { useMappings } from '@/queries/admin.queries'
import {
  recordingInProgress,
  useDeleteRecording,
  useMyRecordings,
  usePublishRecording,
  useRecordingPreferences,
  useUnpublishRecording,
  useUpdateRecordingPreferences,
} from '@/queries/recordings.queries'
import { useMyClasses } from '@/queries/teacher.queries'
import { cn } from '@/lib/cn'
import { formatDateTime, formatRelative } from '@/lib/datetime'
import { formatDuration, humanize } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { VideoPlayerDialog, VideoPoster } from '@/components/domain/class-video'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field, FormError } from '@/components/forms/field'
import { PageHeader } from '@/components/layout/page-header'
import { useIsAdminViewingTeacher } from './teacher-guard'

// ------------------------------------------------------------------ helpers

type Filter = 'all' | 'review' | 'published' | 'progress'

function isToReview(r: ClassRecordingOut) {
  return r.status === 'STORED' && !r.published
}

function isInProgress(r: ClassRecordingOut) {
  return r.status === 'RECORDING' || r.status === 'WAITING' || r.status === 'FAILED'
}

const MATCHES: Record<Filter, (r: ClassRecordingOut) => boolean> = {
  all: () => true,
  review: isToReview,
  published: (r) => r.published,
  progress: isInProgress,
}

function recordingTitle(r: ClassRecordingOut) {
  return r.title?.trim() || r.default_title
}

function playableParts(r: ClassRecordingOut) {
  return r.files
    .filter((f): f is typeof f & { file_url: string } => !!f.file_url)
    .map((f, index) => ({ url: f.file_url, label: f.name ?? `Part ${index + 1}` }))
}

/** A red dot that pulses, the universal "on air" sign. */
function LiveDot() {
  return (
    <span className="relative flex size-2" aria-hidden>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-danger" />
    </span>
  )
}

function RecordingBadge({ recording }: { recording: ClassRecordingOut }) {
  if (recording.published) {
    return (
      <Badge tone="success" size="sm">
        <CheckCircle2 />
        Published
      </Badge>
    )
  }
  switch (recording.status) {
    case 'RECORDING':
      return (
        <Badge tone="danger" size="sm">
          <LiveDot />
          Recording now
        </Badge>
      )
    case 'WAITING':
      return (
        <Badge tone="info" size="sm">
          <Loader2 className="animate-spin" />
          Preparing video
        </Badge>
      )
    case 'STORED':
      return (
        <Badge tone="warning" size="sm">
          <Eye />
          Ready to review
        </Badge>
      )
    case 'FAILED':
      return (
        <Badge tone="danger" size="sm">
          <TriangleAlert />
          Failed
        </Badge>
      )
    default:
      return (
        <Badge tone="neutral" size="sm">
          {humanize(String(recording.status))}
        </Badge>
      )
  }
}

/** What sits on the poster in place of the play button while there is nothing to play. */
function posterOverlay(recording: ClassRecordingOut): React.ReactNode {
  switch (recording.status) {
    case 'RECORDING':
      return (
        <span className="inline-flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm">
          <LiveDot />
          Recording
        </span>
      )
    case 'WAITING':
      return (
        <span className="inline-flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm">
          <Loader2 className="size-3.5 animate-spin" />
          Preparing video
        </span>
      )
    case 'FAILED':
      return (
        <span className="inline-flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm">
          <TriangleAlert className="size-3.5" />
          Not saved
        </span>
      )
    default:
      return undefined
  }
}

/**
 * Subjects this person can file a video under, for one class.
 *
 * A teacher's own mappings; an administrator's view uses the school-wide
 * chart instead, since they teach nothing themselves. With no class on the
 * recording, every subject they teach is offered.
 */
function subjectOptionsFor(mappings: TeacherMappingOut[] | undefined, classId: number | null) {
  const map = new Map<number, { value: string; label: string; hint: string }>()
  for (const m of mappings ?? []) {
    if (classId != null && m.class_room.id !== classId) continue
    map.set(m.subject.id, { value: String(m.subject.id), label: m.subject.name, hint: m.subject.code })
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label))
}

// ------------------------------------------------------------ rule card

function AutoPublishCard({ disabled }: { disabled?: boolean }) {
  const prefsQuery = useRecordingPreferences(!disabled)
  const updatePrefs = useUpdateRecordingPreferences()
  const autoPublish = prefsQuery.data?.auto_publish ?? false

  return (
    <Card className="mb-6 p-5">
      <div className="flex items-start gap-4">
        <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary sm:flex">
          <Wand2 className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <label htmlFor="auto-publish" className="cursor-pointer text-sm font-semibold">
              Publish my recordings automatically
            </label>
            {prefsQuery.isPending && !disabled ? (
              <Skeleton className="h-5 w-9 rounded-full" />
            ) : (
              <Switch
                id="auto-publish"
                checked={autoPublish}
                disabled={disabled || prefsQuery.isError || updatePrefs.isPending}
                onCheckedChange={(checked) => updatePrefs.mutate({ auto_publish: checked })}
              />
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {autoPublish ? (
              <>
                <span className="font-medium text-foreground">On:</span> each recording goes straight
                to the class library under its subject as soon as the video is ready. You can still
                take one out here.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">Off:</span> each recording waits here
                for you to watch, name and publish. Students see nothing until you do.
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            A recording with no subject always waits here for you to pick one.
          </p>
        </div>
      </div>
    </Card>
  )
}

// --------------------------------------------------------- publish dialog

function PublishDialog({
  recording,
  mappings,
  onClose,
}: {
  recording: ClassRecordingOut | null
  mappings: TeacherMappingOut[] | undefined
  onClose: () => void
}) {
  const publish = usePublishRecording()
  const [title, setTitle] = React.useState('')
  const [subjectId, setSubjectId] = React.useState<string>('')
  const [changingSubject, setChangingSubject] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!recording) return
    setTitle(recordingTitle(recording))
    setSubjectId(recording.subject_id != null ? String(recording.subject_id) : '')
    setChangingSubject(false)
    setError(null)
  }, [recording])

  const options = React.useMemo(
    () => subjectOptionsFor(mappings, recording?.class_id ?? null),
    [mappings, recording?.class_id],
  )

  if (!recording) return null

  const needsSubject = recording.subject_id == null
  const showPicker = needsSubject || changingSubject
  const chosenSubjectName =
    options.find((o) => o.value === subjectId)?.label ??
    (subjectId === String(recording.subject_id) ? recording.subject_name : null)
  const className = recording.class_name ?? 'the class'
  const trimmedTitle = title.trim()
  const ready = trimmedTitle.length > 1 && !!subjectId

  const submit = async () => {
    if (!ready) return
    setError(null)
    try {
      await publish.mutateAsync({
        key: recording.key,
        body: {
          title: trimmedTitle,
          ...(subjectId !== String(recording.subject_id ?? '') && { subject_id: Number(subjectId) }),
        },
      })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not publish the recording.')
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !publish.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish to the class library</DialogTitle>
          <DialogDescription>
            Only students of {className} can watch it. You can take it out again at any time.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />

          <Field
            id="publish-title"
            label="Title"
            required
            hint="What students will see on the video card."
          >
            <Input
              id="publish-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={recording.default_title}
              maxLength={200}
            />
          </Field>

          {showPicker ? (
            <Field
              id="publish-subject"
              label="Subject"
              required
              hint={
                options.length === 0
                  ? `You have no subjects in ${className}. An administrator can map one to you.`
                  : needsSubject
                    ? 'This call was not tied to a subject, so choose where it belongs.'
                    : undefined
              }
            >
              <div className="flex items-center gap-2">
                <Combobox
                  id="publish-subject"
                  value={subjectId || null}
                  onChange={setSubjectId}
                  placeholder="Select a subject"
                  emptyMessage="No subjects to choose from."
                  options={options}
                  className="flex-1"
                />
                {!needsSubject && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setChangingSubject(false)
                      setSubjectId(String(recording.subject_id))
                    }}
                  >
                    Keep {recording.subject_name ?? 'original'}
                  </Button>
                )}
              </div>
            </Field>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">Subject</p>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <span className="truncate text-sm">{recording.subject_name ?? 'Subject'}</span>
                <Button
                  variant="ghost"
                  size="xs"
                  icon={<Pencil />}
                  onClick={() => setChangingSubject(true)}
                >
                  Change
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/8 px-3 py-2.5 text-sm">
            <Library className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Students of <span className="font-medium">{className}</span> will find it in their
              Library under{' '}
              <span className="font-medium">{chosenSubjectName ?? 'the subject you choose'}</span>.
            </span>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={publish.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Send />}
            disabled={!ready}
            loading={publish.isPending}
            onClick={submit}
          >
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------------ card

function RecordingCard({
  recording,
  onPlay,
  onPublish,
  onUnpublish,
  unpublishing,
  onDelete,
}: {
  recording: ClassRecordingOut
  onPlay: (r: ClassRecordingOut) => void
  onPublish: (r: ClassRecordingOut) => void
  onUnpublish: (r: ClassRecordingOut) => void
  unpublishing?: boolean
  onDelete: (r: ClassRecordingOut) => void
}) {
  const parts = playableParts(recording)
  const playable = recording.status === 'STORED' && parts.length > 0
  const duration = formatDuration(recording.duration_ms)
  const title = recordingTitle(recording)
  const overlay = posterOverlay(recording)

  return (
    <Card
      className={cn(
        'flex flex-col gap-4 p-4 sm:flex-row',
        recording.status === 'RECORDING' && 'border-danger/40',
        isToReview(recording) && 'border-warning/40',
      )}
    >
      {playable ? (
        <button
          type="button"
          onClick={() => onPlay(recording)}
          className="group shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:w-56"
          aria-label={`Play ${title}`}
        >
          <VideoPoster
            subject={recording.subject_name}
            caption={recording.subject_name ?? recording.class_name}
            badge={duration || undefined}
            size="sm"
          />
        </button>
      ) : (
        <div className="shrink-0 sm:w-56">
          <VideoPoster
            subject={recording.subject_name}
            caption={recording.subject_name ?? recording.class_name}
            badge={duration || undefined}
            overlay={overlay}
            playable={false}
            size="sm"
            className={cn(recording.status === 'FAILED' && 'grayscale')}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <RecordingBadge recording={recording} />
          {parts.length > 1 && (
            <Badge tone="outline" size="sm">
              <Film />
              {parts.length} parts
            </Badge>
          )}
        </div>

        <p className="mt-2 truncate text-base font-semibold" title={title}>
          {title}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {recording.class_name && (
            <Badge tone="outline" size="sm">
              {recording.class_name}
            </Badge>
          )}
          {recording.subject_name ? (
            <Badge tone="accent" size="sm">
              {recording.subject_name}
            </Badge>
          ) : (
            <Badge tone="warning" size="sm">
              No subject yet
            </Badge>
          )}
        </div>

        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {recording.started_at && (
            <span title={formatDateTime(recording.started_at)}>
              {formatDateTime(recording.started_at, "EEE d MMM yyyy 'at' h:mm a")}
            </span>
          )}
          {duration && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {duration}
            </span>
          )}
          {recording.started_by_name && <span>Recorded by {recording.started_by_name}</span>}
        </p>

        {recording.published && recording.published_at && (
          <p className="mt-1 text-xs text-success">
            In the class library since {formatRelative(recording.published_at)}
          </p>
        )}
        {recording.status === 'WAITING' && (
          <p className="mt-1 text-xs text-muted-foreground">
            The video usually arrives a few minutes after the class ends. This page checks on its own.
          </p>
        )}
        {recording.status === 'FAILED' && (
          <p className="mt-2 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">
            {recording.error ?? 'The recording could not be saved.'}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          <Button
            variant="outline"
            size="sm"
            icon={<Play />}
            disabled={!playable}
            onClick={() => onPlay(recording)}
          >
            Play
          </Button>
          {recording.published ? (
            <Button
              variant="outline"
              size="sm"
              icon={<Undo2 />}
              loading={unpublishing}
              onClick={() => onUnpublish(recording)}
            >
              Unpublish
            </Button>
          ) : (
            <Button
              variant={isToReview(recording) ? 'primary' : 'outline'}
              size="sm"
              icon={<Send />}
              disabled={recording.status !== 'STORED'}
              onClick={() => onPublish(recording)}
            >
              Publish
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              {/* A disabled button fires no pointer events, so the tooltip
                  needs a wrapper to anchor on. */}
              <span className="ml-auto">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${title}`}
                  disabled={recording.status === 'RECORDING'}
                  onClick={() => onDelete(recording)}
                  className="hover:text-danger"
                >
                  <Trash2 />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {recording.status === 'RECORDING'
                ? 'Stop the recording before deleting it.'
                : 'Delete this video for good'}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </Card>
  )
}

// ------------------------------------------------------------------ page

export default function TeacherRecordingsPage() {
  const isAdmin = useIsAdminViewingTeacher()
  const recordingsQuery = useMyRecordings()
  const myClassesQuery = useMyClasses(!isAdmin)
  const adminMappingsQuery = useMappings(isAdmin)
  const mappings = isAdmin ? adminMappingsQuery.data : myClassesQuery.data

  const unpublish = useUnpublishRecording()
  const deleteRecording = useDeleteRecording()

  const [filter, setFilter] = React.useState<Filter>('all')
  const [playing, setPlaying] = React.useState<ClassRecordingOut | null>(null)
  const [publishing, setPublishing] = React.useState<ClassRecordingOut | null>(null)
  const [deleting, setDeleting] = React.useState<ClassRecordingOut | null>(null)

  const recordings = React.useMemo(() => recordingsQuery.data ?? [], [recordingsQuery.data])

  const counts = React.useMemo(
    () => ({
      all: recordings.length,
      review: recordings.filter(MATCHES.review).length,
      published: recordings.filter(MATCHES.published).length,
      progress: recordings.filter(MATCHES.progress).length,
    }),
    [recordings],
  )

  const filtered = React.useMemo(() => recordings.filter(MATCHES[filter]), [recordings, filter])
  const polling = recordings.some(recordingInProgress)

  // The dialog keeps showing the latest copy while the list refreshes behind it.
  const playingNow = playing ? (recordings.find((r) => r.key === playing.key) ?? playing) : null

  return (
    <>
      <PageHeader
        title="Recordings"
        description="Your recorded classes. Watch them back, then publish the ones students should see."
        actions={
          polling ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Checking for new videos…
            </span>
          ) : undefined
        }
      />

      <AutoPublishCard />

      {recordings.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <Segmented
            layoutId="recordings-filter"
            value={filter}
            onChange={setFilter}
            size="sm"
            aria-label="Show recordings"
            options={[
              { value: 'all', label: `All (${counts.all})` },
              { value: 'review', label: `To review (${counts.review})` },
              { value: 'published', label: `Published (${counts.published})` },
              { value: 'progress', label: `In progress (${counts.progress})` },
            ]}
          />
        </div>
      )}

      <QueryBoundary
        query={recordingsQuery}
        loading={
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={<Clapperboard />}
            title="No recordings yet"
            description="When you teach a class in the LMS and it is recorded, the video appears here a few minutes after you stop. Watch it back, then publish it to the class library for your students."
            action={
              <Button asChild variant="outline">
                <Link to="/teacher/meetings">Go to Live Classes</Link>
              </Button>
            }
          />
        }
      >
        {() =>
          filtered.length === 0 ? (
            <EmptyState
              icon={filter === 'review' ? <CheckCircle2 /> : <Film />}
              title={
                filter === 'review'
                  ? 'Nothing waiting for review'
                  : filter === 'published'
                    ? 'Nothing published yet'
                    : 'Nothing in progress'
              }
              description={
                filter === 'review'
                  ? 'Every finished recording has been dealt with.'
                  : filter === 'published'
                    ? 'Publish a recording and students of its class will find it in their Library.'
                    : 'Recordings show here while a class is being recorded or its video is being prepared.'
              }
              action={
                <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
                  Show all recordings
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((recording) => (
                <RecordingCard
                  key={recording.key}
                  recording={recording}
                  onPlay={setPlaying}
                  onPublish={setPublishing}
                  onUnpublish={(r) => unpublish.mutate(r.key)}
                  unpublishing={unpublish.isPending && unpublish.variables === recording.key}
                  onDelete={setDeleting}
                />
              ))}
            </div>
          )
        }
      </QueryBoundary>

      <VideoPlayerDialog
        open={!!playingNow}
        onOpenChange={(v) => !v && setPlaying(null)}
        title={playingNow ? recordingTitle(playingNow) : ''}
        description={
          playingNow
            ? [playingNow.class_name, playingNow.subject_name, formatDateTime(playingNow.started_at)]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        parts={playingNow ? playableParts(playingNow) : []}
        onRefresh={() => void recordingsQuery.refetch()}
        meta={
          playingNow && (
            <>
              <RecordingBadge recording={playingNow} />
              {formatDuration(playingNow.duration_ms) && (
                <Badge tone="outline" size="sm">
                  <Clock />
                  {formatDuration(playingNow.duration_ms)}
                </Badge>
              )}
              {!playingNow.published && playingNow.status === 'STORED' && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Send />}
                  className="ml-auto"
                  onClick={() => {
                    const target = playingNow
                    setPlaying(null)
                    setPublishing(target)
                  }}
                >
                  Publish
                </Button>
              )}
            </>
          )
        }
      />

      <PublishDialog
        recording={publishing}
        mappings={mappings}
        onClose={() => setPublishing(null)}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this recording for good?"
        description={
          deleting
            ? deleting.published
              ? `“${recordingTitle(deleting)}” will be deleted and disappear from the ${
                  deleting.class_name ?? 'class'
                } library. This cannot be undone.`
              : `“${recordingTitle(deleting)}” will be deleted from school storage. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete recording"
        destructive
        loading={deleteRecording.isPending}
        onConfirm={() => {
          if (!deleting) return
          deleteRecording.mutate(deleting.key, { onSettled: () => setDeleting(null) })
        }}
      >
        {deleting?.published && (
          <p className="text-sm text-muted-foreground">
            To only hide it from students, use <span className="font-medium">Unpublish</span>{' '}
            instead — the video stays here.
          </p>
        )}
      </ConfirmDialog>
    </>
  )
}

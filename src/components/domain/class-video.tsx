import { Play, RefreshCw, TriangleAlert } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/cn'
import { subjectLook, toneStyle } from '@/lib/subjects'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Class videos — the poster tile and the in-page player, shared by the
 * teacher's Recordings and the student's Library.
 *
 * No thumbnails exist for recordings, so the poster is drawn: a two-hue
 * gradient from the subject's own colour (the same one its tile uses on every
 * other screen), its glyph as a watermark, and a play button. A dark scrim at
 * the foot keeps white text legible whichever hue the subject landed on.
 */

// ------------------------------------------------------------------ poster

export function VideoPoster({
  subject,
  caption,
  badge,
  overlay,
  playable = true,
  size = 'md',
  className,
}: {
  subject: string | null | undefined
  /** Bottom-left line, usually the subject name. */
  caption?: React.ReactNode
  /** Bottom-right chip, usually the duration. */
  badge?: React.ReactNode
  /** Replaces the play button — "Preparing video" and the like. */
  overlay?: React.ReactNode
  playable?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const look = subjectLook(subject)
  const second = (look.tone % 9) + 1

  return (
    <div
      style={{
        ...toneStyle(look.tone),
        background: `radial-gradient(120% 95% at 100% 0%, hsl(var(--fun-${second}) / 0.9) 0%, transparent 62%), linear-gradient(140deg, hsl(var(--tile)) 0%, hsl(var(--tile) / 0.82) 100%)`,
      }}
      className={cn(
        'relative isolate aspect-video w-full overflow-hidden rounded-xl text-white',
        className,
      )}
    >
      {/* Watermark glyph and soft rings — decoration, not content. */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -bottom-3 -right-2 select-none opacity-25 blur-[0.5px]',
          size === 'sm' ? 'text-5xl' : size === 'lg' ? 'text-8xl' : 'text-7xl',
        )}
      >
        {look.emoji}
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute -left-8 -top-10 size-32 rounded-full border-[14px] border-white/10"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/55 to-transparent"
      />

      <div className="absolute inset-0 flex items-center justify-center">
        {overlay ??
          (playable && (
            <span
              className={cn(
                'flex items-center justify-center rounded-full bg-white/90 text-black shadow-lg ring-4 ring-white/25 transition-transform duration-200 group-hover:scale-110',
                size === 'sm' ? 'size-10' : size === 'lg' ? 'size-16' : 'size-12',
              )}
            >
              <Play
                className={cn(
                  'translate-x-[1px] fill-current',
                  size === 'sm' ? 'size-4' : size === 'lg' ? 'size-7' : 'size-5',
                )}
              />
            </span>
          ))}
      </div>

      {(caption || badge) && (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5">
          <span className="min-w-0 truncate text-xs font-semibold drop-shadow">{caption}</span>
          {badge && (
            <span className="shrink-0 rounded-md bg-black/60 px-1.5 py-0.5 text-2xs font-semibold tabular-nums">
              {badge}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ player

export interface VideoPart {
  url: string
  /** Shown above the video when there is more than one part. */
  label?: string
}

/**
 * One <video> per part. Signed storage links expire after a few hours, so a
 * page left open all afternoon can hold a dead one; the error state says so
 * and offers `onRefresh` (a refetch that brings fresh links) where the caller
 * has one.
 */
function PartPlayer({
  part,
  allowDownload,
  onRefresh,
}: {
  part: VideoPart
  allowDownload: boolean
  onRefresh?: () => void
}) {
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => setFailed(false), [part.url])

  if (failed) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center">
        <TriangleAlert className="size-6 text-warning" />
        <div>
          <p className="text-sm font-medium">This video would not load</p>
          <p className="mt-0.5 max-w-sm text-xs text-muted-foreground">
            Video links stay valid for a few hours. Refresh to get a new one.
          </p>
        </div>
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw />}
            onClick={() => {
              setFailed(false)
              onRefresh()
            }}
          >
            Refresh
          </Button>
        )}
      </div>
    )
  }

  return (
    <video
      key={part.url}
      src={part.url}
      controls
      preload="metadata"
      playsInline
      controlsList={allowDownload ? undefined : 'nodownload'}
      onContextMenu={allowDownload ? undefined : (e) => e.preventDefault()}
      onError={() => setFailed(true)}
      className="aspect-video w-full rounded-lg bg-black"
    />
  )
}

export function VideoPlayerDialog({
  open,
  onOpenChange,
  title,
  description,
  meta,
  parts,
  allowDownload = true,
  onRefresh,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  /** A row of badges or facts under the video. */
  meta?: React.ReactNode
  parts: VideoPart[]
  /** Students get `nodownload`; the teacher who made it keeps the browser's menu. */
  allowDownload?: boolean
  onRefresh?: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle className="pr-8">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogBody className="space-y-5">
          {parts.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              There is no video to play yet.
            </p>
          ) : (
            parts.map((part, index) => (
              <div key={part.url} className="space-y-2">
                {parts.length > 1 && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {part.label ?? `Part ${index + 1}`}
                  </p>
                )}
                <PartPlayer part={part} allowDownload={allowDownload} onRefresh={onRefresh} />
              </div>
            ))
          )}
          {meta && <div className="flex flex-wrap items-center gap-2">{meta}</div>}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

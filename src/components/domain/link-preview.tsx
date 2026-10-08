import { ExternalLink, Globe, Link2, Play, Youtube } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/cn'
import {
  isWebUrl,
  linkHost,
  normaliseUrl,
  youtubeEmbedUrl,
  youtubeThumbnail,
  youtubeVideoId,
} from '@/lib/links'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/forms/field'

/**
 * Shared web links in the library — the YouTube preview box and the plain
 * link card.
 *
 * A YouTube video shows its thumbnail first and only loads the player when
 * someone presses play: a grid of twenty iframes would download twenty
 * players, and the privacy-enhanced embed sets no cookies until then.
 */

export function YouTubePlayer({
  videoId,
  title,
  autoplay = false,
  className,
}: {
  videoId: string
  title: string
  autoplay?: boolean
  className?: string
}) {
  return (
    <iframe
      key={videoId}
      src={youtubeEmbedUrl(videoId, autoplay)}
      title={title}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
      className={cn('aspect-video w-full rounded-lg border-0 bg-black', className)}
    />
  )
}

/**
 * The preview box: thumbnail and play button, turning into the player in
 * place. Pass `onPlay` to open a larger player somewhere else instead.
 */
export function YouTubePreview({
  videoId,
  title,
  onPlay,
  badge,
  className,
}: {
  videoId: string
  title: string
  onPlay?: () => void
  /** Bottom-right chip on the thumbnail. */
  badge?: React.ReactNode
  className?: string
}) {
  const [playing, setPlaying] = React.useState(false)

  React.useEffect(() => setPlaying(false), [videoId])

  if (playing) return <YouTubePlayer videoId={videoId} title={title} autoplay className={className} />

  return (
    <button
      type="button"
      onClick={() => (onPlay ? onPlay() : setPlaying(true))}
      aria-label={`Play ${title}`}
      className={cn(
        'group relative block aspect-video w-full overflow-hidden rounded-lg bg-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        className,
      )}
    >
      <img
        src={youtubeThumbnail(videoId)}
        alt=""
        loading="lazy"
        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-10 w-14 items-center justify-center rounded-xl bg-[#ff0000] shadow-lg transition-transform duration-200 group-hover:scale-110">
          <Play className="size-5 translate-x-[1px] fill-current" />
        </span>
      </span>
      <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-2xs font-semibold">
        <Youtube className="size-3" />
        YouTube
      </span>
      {badge && <span className="absolute bottom-2 right-2">{badge}</span>}
    </button>
  )
}

/** Icon box in the same family as FileTypeIcon, for a link instead of a file. */
export function LinkTypeIcon({
  youtube,
  size = 'md',
  className,
}: {
  youtube?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const Icon = youtube ? Youtube : Globe
  const box = size === 'sm' ? 'size-8' : size === 'lg' ? 'size-12' : 'size-10'
  const glyph = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-6' : 'size-5'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg',
        youtube ? 'bg-danger/12 text-danger' : 'bg-info/12 text-info',
        box,
        className,
      )}
    >
      <Icon className={glyph} />
    </span>
  )
}

/**
 * What the share dialog shows under the address field: the video itself for
 * YouTube, the site it points at for anything else.
 */
export function LinkPreview({ url, title }: { url: string; title?: string }) {
  const videoId = youtubeVideoId(url)
  if (videoId) return <YouTubePreview videoId={videoId} title={title || 'YouTube video'} />

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:border-primary/40"
    >
      <LinkTypeIcon />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{linkHost(url)}</span>
        <span className="block truncate text-xs text-muted-foreground">{url}</span>
      </span>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
    </a>
  )
}

/**
 * The title YouTube gives a video, for prefilling the share form. oEmbed is
 * open to browsers; a failure only means the teacher types the title.
 */
export function useYoutubeTitle(videoId: string | null): string | null {
  const [title, setTitle] = React.useState<string | null>(null)

  React.useEffect(() => {
    setTitle(null)
    if (!videoId) return
    const controller = new AbortController()
    const watch = `https://www.youtube.com/watch?v=${videoId}`
    fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { title?: string } | null) => data?.title && setTitle(data.title))
      .catch(() => undefined)
    return () => controller.abort()
  }, [videoId])

  return title
}

/**
 * The address field of the share dialog, with the preview underneath. Fills
 * an empty title from the YouTube video's own title.
 */
export function LinkSourceField({
  id,
  url,
  onUrlChange,
  title,
  onSuggestTitle,
  disabled,
}: {
  id: string
  url: string
  onUrlChange: (url: string) => void
  title: string
  onSuggestTitle: (title: string) => void
  disabled?: boolean
}) {
  const valid = isWebUrl(url)
  const videoId = valid ? youtubeVideoId(url) : null
  const suggested = useYoutubeTitle(videoId)

  React.useEffect(() => {
    if (suggested && !title.trim()) onSuggestTitle(suggested)
    // Only when a new suggestion arrives; never overwrite what was typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested])

  const typed = url.trim().length > 0
  return (
    <div className="space-y-3">
      <Field
        id={id}
        label="Link"
        required
        hint="A YouTube video plays inside the library; any other page opens in a new tab."
        error={typed && !valid ? 'Enter a full web address, such as https://example.com/page.' : undefined}
      >
        <Input
          id={id}
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          leading={<Link2 />}
          inputMode="url"
          autoComplete="off"
          disabled={disabled}
        />
      </Field>
      {valid && <LinkPreview url={normaliseUrl(url)} title={title} />}
    </div>
  )
}

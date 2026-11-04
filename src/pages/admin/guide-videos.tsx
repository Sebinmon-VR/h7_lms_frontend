import { CheckCircle2, ExternalLink, PlayCircle, TriangleAlert } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { STUDENT_GUIDE } from '@/content/user-guide/student'
import { TEACHER_GUIDE } from '@/content/user-guide/teacher'
import type { GuidePart } from '@/content/user-guide/types'
import { normalizeVideoLink, videoEmbedUrl, videoLinkProblem } from '@/content/user-guide/videos'
import { useGuideVideos, useSaveGuideVideos } from '@/queries/guide.queries'
import { formatRelative } from '@/lib/datetime'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/page-header'

function LinkRow({
  id,
  title,
  value,
  onChange,
}: {
  id: string
  title: string
  value: string
  onChange: (value: string) => void
}) {
  const [preview, setPreview] = React.useState(false)
  const trimmed = value.trim()
  const embed = videoEmbedUrl(trimmed)
  const problem = videoLinkProblem(trimmed)
  const invalid = !!problem

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 sm:w-64">
          <p className="truncate text-sm font-medium">{title}</p>
          <Link to={`/guide#${id}`} className="inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-primary">
            Open in the guide <ExternalLink className="size-3" />
          </Link>
        </div>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste a OneDrive embed code, or a Google Drive or YouTube link"
          aria-label={`Video link for ${title}`}
          invalid={invalid}
          className="flex-1"
        />
        <div className="flex shrink-0 items-center gap-2">
          {embed && (
            <Button variant="ghost" size="sm" icon={<PlayCircle />} onClick={() => setPreview((v) => !v)}>
              {preview ? 'Hide' : 'Preview'}
            </Button>
          )}
        </div>
      </div>
      {trimmed !== '' && (
        <p className={`mt-1.5 flex items-center gap-1.5 text-xs ${invalid ? 'text-danger' : 'text-success'}`}>
          {invalid ? <TriangleAlert className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
          {problem ?? 'Will play in the guide. Press Preview, and check it also plays for someone not signed in to your account.'}
        </p>
      )}
      {preview && embed && (
        <div className="mt-3 aspect-video w-full max-w-xl overflow-hidden rounded-lg bg-black">
          <iframe src={embed} title={`Preview: ${title}`} className="size-full" allow="autoplay; fullscreen" allowFullScreen />
        </div>
      )}
    </div>
  )
}

/** Every topic of one guide, once each (both guides share the Getting started part). */
function topicsOf(guide: GuidePart[]) {
  return guide.map((part) => ({ part, topics: part.topics }))
}

/**
 * [Admin] The User Guide's videos.
 *
 * Record a walkthrough, put it on Google Drive (or YouTube), and paste its link beside the
 * topic it explains. A topic shows its video in the guide only once it has a link here; a
 * cleared box removes it. Saved on the server, so it reaches everyone straight away.
 */
export default function GuideVideosPage() {
  const query = useGuideVideos()
  const save = useSaveGuideVideos()
  const [links, setLinks] = React.useState<Record<string, string>>({})
  const [seeded, setSeeded] = React.useState(false)

  React.useEffect(() => {
    if (query.data && !seeded) {
      setLinks(query.data.videos ?? {})
      setSeeded(true)
    }
  }, [query.data, seeded])

  const saved = query.data?.videos ?? {}
  const dirty = Object.keys({ ...saved, ...links }).some((k) => (saved[k] ?? '').trim() !== (links[k] ?? '').trim())
  const invalid = Object.values(links).some((v) => !!videoLinkProblem(v))
  const count = Object.values(links).filter((v) => videoEmbedUrl(v)).length

  const set = (id: string, value: string) => setLinks((prev) => ({ ...prev, [id]: value }))
  const seen = new Set<string>()

  const group = (heading: string, guide: GuidePart[]) => (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">{heading}</h2>
      {topicsOf(guide).map(({ part, topics }) => {
        const fresh = topics.filter((t) => !seen.has(t.id))
        fresh.forEach((t) => seen.add(t.id))
        if (fresh.length === 0) return null
        return (
          <div key={`${heading}-${part.id}`} className="space-y-2">
            <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{part.title}</p>
            {fresh.map((topic) => (
              <LinkRow key={topic.id} id={topic.id} title={topic.title} value={links[topic.id] ?? ''} onChange={(v) => set(topic.id, v)} />
            ))}
          </div>
        )
      })}
    </section>
  )

  return (
    <div>
      <PageHeader
        title="Guide videos"
        description="Add a video walkthrough to any topic of the User Guide. A topic shows its video only once it has a link here."
        actions={
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!dirty || invalid}
            onClick={() =>
              // A pasted embed code is saved as just its address.
              save.mutate(
                Object.fromEntries(
                  Object.entries(links)
                    .map(([k, v]) => [k, normalizeVideoLink(v)] as const)
                    .filter(([, v]) => v !== ''),
                ),
              )
            }
          >
            Save
          </Button>
        }
      />

      <div className="mb-6 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">
        <p className="font-semibold">How to add a video</p>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">From OneDrive</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>
            In OneDrive, right-click the video and choose <strong>Embed</strong>, then <strong>Generate</strong>. On OneDrive for work or
            school, open the video and use <strong>Share</strong>, then <strong>Embed code</strong>.
          </li>
          <li>Copy the embed code and paste it beside the topic below. The whole code is fine.</li>
          <li>
            Make sure the video can be watched by <strong>anyone with the link</strong>, so students who are not in your Microsoft
            account can see it.
          </li>
        </ol>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">From Google Drive or YouTube</p>
        <p className="mt-1 text-muted-foreground">
          Share the video with <strong>Anyone with the link</strong> and paste its link.
        </p>
        <p className="mt-2 text-muted-foreground">
          Then press <strong>Save</strong>. The video appears in the guide for everyone straight away.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {count} topic{count === 1 ? '' : 's'} with a video
          {query.data?.updated_at ? ` · last saved ${formatRelative(query.data.updated_at)}` : ''}
        </p>
      </div>

      {query.isPending ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <div className="space-y-10">
          {group('Teachers’ guide', TEACHER_GUIDE)}
          {group('Students’ guide', STUDENT_GUIDE)}
        </div>
      )}
    </div>
  )
}

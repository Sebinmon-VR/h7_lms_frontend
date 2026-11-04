import { BookOpen, ChevronLeft, ChevronRight, Lightbulb, PlayCircle, Search } from 'lucide-react'
import * as React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { STUDENT_GUIDE } from '@/content/user-guide/student'
import { TEACHER_GUIDE } from '@/content/user-guide/teacher'
import type { GuidePart, GuideTopic } from '@/content/user-guide/types'
import { videoEmbedUrl } from '@/content/user-guide/videos'
import { useGuideVideos } from '@/queries/guide.queries'
import { useAuth } from '@/providers/auth-provider'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/layout/page-header'

type Audience = 'teacher' | 'student'

/** `**Bold**` in guide text becomes bold, the way button names read on screen. */
function Rich({ text }: { text: string }) {
  const parts = text.split('**')
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-foreground">
            {part}
          </strong>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  )
}

function topicText(topic: GuideTopic): string {
  return [
    topic.title,
    topic.summary,
    ...(topic.steps ?? []),
    ...(topic.tips ?? []),
    ...(topic.keywords ?? []),
    ...(topic.sections ?? []).flatMap((s) => [s.heading, ...(s.steps ?? []), ...(s.points ?? [])]),
  ]
    .join(' ')
    .toLowerCase()
}

function matches(topic: GuideTopic, needle: string): boolean {
  if (!needle) return true
  const text = topicText(topic)
  return needle.split(/\s+/).every((word) => text.includes(word))
}

/** Numbered steps: a filled number beside each, so a long run is easy to follow. */
function Steps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((step, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {i + 1}
          </span>
          <span className="pt-0.5">
            <Rich text={step} />
          </span>
        </li>
      ))}
    </ol>
  )
}

function Points({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-primary">
      {items.map((point, i) => (
        <li key={i}>
          <Rich text={point} />
        </li>
      ))}
    </ul>
  )
}

/** The topic's video, played in the page, drawn only when the topic has a link. */
function VideoPanel({ title, src }: { title: string; src: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="aspect-video w-full bg-black">
        <iframe
          src={src}
          title={`Video: ${title}`}
          className="size-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
      <figcaption className="flex items-center gap-2 px-4 py-2.5 text-xs text-muted-foreground">
        <PlayCircle className="size-4 text-primary" />
        Video walkthrough · {title}
      </figcaption>
    </figure>
  )
}

function TopicDetail({
  topic,
  partTitle,
  previous,
  next,
  onGo,
  videoLink,
}: {
  topic: GuideTopic
  partTitle: string
  previous: GuideTopic | null
  next: GuideTopic | null
  onGo: (id: string) => void
  videoLink: string | undefined
}) {
  const video = videoEmbedUrl(videoLink)
  return (
    <article className="min-w-0 space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{partTitle}</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">{topic.title}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{topic.summary}</p>
      </header>

      {video && <VideoPanel title={topic.title} src={video} />}

      <div className="space-y-6 rounded-2xl border border-border bg-card p-5 sm:p-6">
        {topic.steps && <Steps items={topic.steps} />}
        {topic.sections?.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h3 className="text-base font-semibold">{section.heading}</h3>
            {section.steps && <Steps items={section.steps} />}
            {section.points && <Points items={section.points} />}
          </section>
        ))}
        {topic.tips && topic.tips.length > 0 && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
              <Lightbulb className="size-3.5" /> Good to know
            </p>
            <Points items={topic.tips} />
          </div>
        )}
      </div>

      <nav className="flex flex-col gap-2 sm:flex-row sm:justify-between" aria-label="More topics">
        {previous ? (
          <Button variant="outline" icon={<ChevronLeft />} onClick={() => onGo(previous.id)} className="justify-start">
            {previous.title}
          </Button>
        ) : (
          <span />
        )}
        {next && (
          <Button variant="outline" onClick={() => onGo(next.id)} className="justify-end">
            {next.title}
            <ChevronRight className="size-4" />
          </Button>
        )}
      </nav>
    </article>
  )
}

/**
 * The User Guide: how to use the web app, step by step.
 *
 * A teacher sees the teachers' guide and a student the students' - nobody reads the other's.
 * An admin, who supports both, can switch between them. Topics are listed in the sidebar and
 * read in the centre; the chosen one is in the address (#topic-id), so a link opens it.
 */
export default function UserGuidePage() {
  const { role } = useAuth()
  const isAdmin = role === 'ADMIN'
  const own: Audience = role === 'TEACHER' || role === 'CLASS_TEACHER' ? 'teacher' : 'student'
  const [audience, setAudience] = React.useState<Audience>(own)
  const shown: Audience = isAdmin ? audience : own
  const guide: GuidePart[] = shown === 'teacher' ? TEACHER_GUIDE : STUDENT_GUIDE
  const all = guide.flatMap((part) => part.topics.map((topic) => ({ topic, part })))

  const { hash } = useLocation()
  const navigate = useNavigate()
  const wanted = hash.slice(1)
  const current = all.find((entry) => entry.topic.id === wanted) ?? all[0]
  const index = all.indexOf(current)

  const videos = useGuideVideos().data?.videos ?? {}
  const [query, setQuery] = React.useState('')
  const needle = query.trim().toLowerCase()
  const parts = guide
    .map((part) => ({ ...part, topics: part.topics.filter((t) => matches(t, needle)) }))
    .filter((part) => part.topics.length > 0)
  const found = parts.reduce((n, p) => n + p.topics.length, 0)

  const go = React.useCallback(
    (id: string) => {
      navigate({ hash: id }, { replace: true })
      document.getElementById('guide-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [navigate],
  )

  // Switching guides (admins) starts at the top of the other one.
  React.useEffect(() => {
    if (isAdmin && wanted && !all.some((entry) => entry.topic.id === wanted)) navigate({ hash: '' }, { replace: true })
  }, [isAdmin, shown]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <PageHeader
        title="User Guide"
        description={
          shown === 'teacher' ? 'How to use the LMS as a teacher, step by step.' : 'How to use the LMS as a student, step by step.'
        }
        actions={
          isAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm" icon={<PlayCircle />}>
                <Link to="/admin/guide-videos">Manage videos</Link>
              </Button>
            <Segmented
              layoutId="guide-audience"
              value={audience}
              onChange={setAudience}
              aria-label="Which guide"
              options={[
                { value: 'teacher', label: 'Teachers' },
                { value: 'student', label: 'Students' },
              ]}
            />
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] xl:gap-8">
        {/* ------------------------------------------------ topics */}
        <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)] lg:self-start lg:overflow-y-auto">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the guide"
            leading={<Search />}
            aria-label="Search the guide"
          />

          {/* A phone has no room for the list: the topics are a picker instead. */}
          <div className="mt-3 lg:hidden">
            <Select value={current.topic.id} onValueChange={go}>
              <SelectTrigger aria-label="Choose a topic">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {parts.map((part) => (
                  <SelectGroup key={part.id}>
                    <SelectLabel>{part.title}</SelectLabel>
                    {part.topics.map((topic) => (
                      <SelectItem key={topic.id} value={topic.id}>
                        {topic.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <nav className="mt-4 hidden space-y-5 lg:block" aria-label="Guide topics">
            {found === 0 ? (
              <p className="px-2 text-sm text-muted-foreground">Nothing matches “{query}”.</p>
            ) : (
              parts.map((part) => (
                <div key={part.id}>
                  <p className="mb-1 px-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {part.title}
                  </p>
                  <ul className="space-y-0.5">
                    {part.topics.map((topic) => {
                      const active = topic.id === current.topic.id
                      const hasVideo = !!videoEmbedUrl(videos[topic.id])
                      return (
                        <li key={topic.id}>
                          <button
                            type="button"
                            onClick={() => go(topic.id)}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                              active
                                ? 'bg-primary/10 font-medium text-primary'
                                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                            )}
                          >
                            <span className="min-w-0 flex-1">{topic.title}</span>
                            {hasVideo && <PlayCircle className="size-3.5 shrink-0 opacity-70" aria-label="Has a video" />}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))
            )}
          </nav>
        </aside>

        {/* ------------------------------------------------ the topic */}
        <div id="guide-detail" className="scroll-mt-4">
          {current ? (
            <TopicDetail
              topic={current.topic}
              partTitle={current.part.title}
              previous={index > 0 ? all[index - 1].topic : null}
              next={index < all.length - 1 ? all[index + 1].topic : null}
              onGo={go}
              videoLink={videos[current.topic.id]}
            />
          ) : (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <BookOpen className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">The guide is empty.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

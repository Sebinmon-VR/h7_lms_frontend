import { AlertTriangle, ChevronRight, ClipboardCheck, ExternalLink, FolderClosed, FolderOpen, Pencil, PenLine, Plus, Search } from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'

import type { ExamOut } from '@/api/types'
import { useExams } from '@/queries/exam.queries'
import { cn } from '@/lib/cn'
import { formatDate, formatRelative, parseApiDateTime } from '@/lib/datetime'
import { describePaper, formatMark, formatMinutes } from '@/lib/exams'
import { useDebouncedValue } from '@/lib/hooks'
import { tidyName as tidy } from '@/lib/names'
import { formatSchoolTime } from '@/lib/school-time'
import { className as classLabel, subjectName } from '@/lib/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/feedback/states'
import { Band, Figure, Figures, TONE_FILL, TONE_TEXT, WorkspaceHeader, type Tone } from '@/components/layout/workspace'
import { useExamCatalogue, useExamScope } from './exam-scope'

/**
 * Every exam this user may act on: a list on the left grouped by what needs
 * doing, and the chosen exam's summary on the right with the ways into it.
 *
 * An exam list sorted by date alone buries the one thing a teacher opens this
 * page for — the paper the class is sitting right now, or the one due to open
 * in an hour — under last term's. So the groups come first: open, then coming
 * up, then drafts still being written, then what is finished.
 */

type Group = 'open' | 'upcoming' | 'draft' | 'finished' | 'cancelled'

const GROUPS: { key: Group; label: string; tone: Tone }[] = [
  { key: 'open', label: 'Open now', tone: 'success' },
  { key: 'upcoming', label: 'Coming up', tone: 'info' },
  { key: 'draft', label: 'Drafts', tone: 'neutral' },
  { key: 'finished', label: 'Finished', tone: 'warning' },
  { key: 'cancelled', label: 'Cancelled', tone: 'neutral' },
]

function groupOf(exam: ExamOut): Group {
  if (exam.status === 'CANCELLED') return 'cancelled'
  if (exam.status === 'DRAFT') return 'draft'
  if (exam.window_state === 'OPEN' || exam.window_state === 'GRACE') return 'open'
  if (exam.window_state === 'NOT_OPEN') return 'upcoming'
  return 'finished'
}

/** Where the exam stands, in one phrase and a colour. */
function standing(exam: ExamOut): { label: string; tone: Tone } {
  switch (groupOf(exam)) {
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' }
    case 'draft':
      return { label: 'Draft, not visible to students', tone: 'neutral' }
    case 'open':
      return { label: exam.window_state === 'GRACE' ? 'Closing, in grace time' : 'Open now', tone: 'success' }
    case 'upcoming':
      return { label: `Opens ${formatRelative(exam.starts_at)}`, tone: 'info' }
    default:
      return exam.results_published ? { label: 'Finished, results out', tone: 'success' } : { label: 'Finished, results not released', tone: 'warning' }
  }
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** "Mon 10 Nov, 09:00–10:30", or both dates when the window spans days. */
function whenText(exam: ExamOut, long = false) {
  const a = parseApiDateTime(exam.starts_at)
  const b = parseApiDateTime(exam.ends_at)
  if (!a) return '—'
  const day = long ? 'EEEE d MMMM' : 'EEE d MMM'
  if (!b) return `${formatDate(a, day)}, ${formatSchoolTime(a)}`
  return sameDay(a, b)
    ? `${formatDate(a, day)}, ${formatSchoolTime(a)}–${formatSchoolTime(b)}`
    : `${formatDate(a, 'd MMM')} ${formatSchoolTime(a)} → ${formatDate(b, 'd MMM')} ${formatSchoolTime(b)}`
}

function Fact({ label, children, warn }: { label: string; children: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('text-right font-medium', warn ? 'text-warning' : 'text-foreground')}>{children}</dd>
    </div>
  )
}

function ExamSummary({ exam }: { exam: ExamOut }) {
  const scope = useExamScope()
  const navigate = useNavigate()
  const s = standing(exam)
  const group = groupOf(exam)
  const noPaper = exam.question_count === 0 && !exam.question_paper_url

  // What still needs doing before (or after) the exam, in plain words.
  const todo: string[] = []
  if (group !== 'cancelled' && group !== 'finished' && noPaper) todo.push(exam.mode === 'ONLINE' ? 'No questions written yet' : 'No question paper attached yet')
  if (exam.mode === 'ONLINE' && exam.question_count > 0 && !exam.answer_key_complete) todo.push('Some questions have no answer key, so they need marking by hand')
  if (group === 'draft') todo.push(exam.auto_publish ? `Publishes by itself ${exam.auto_publish_at ? formatRelative(exam.auto_publish_at) : 'when the window opens'}` : 'Publish it so students can see it')
  if (group === 'finished' && !exam.results_published) todo.push('Mark the scripts, then release the results')
  if (exam.auto_publish_error) todo.push(exam.auto_publish_error)

  return (
    <div className="space-y-5">
      <div>
        <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', TONE_TEXT[s.tone])}>
          <span className={cn('size-2 rounded-full', TONE_FILL[s.tone], group === 'open' && 'animate-pulse')} aria-hidden />
          {s.label}
        </span>
        <h2 className="mt-1 text-2xl font-medium tracking-tight text-foreground">{exam.title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {classLabel(exam)} · {tidy(subjectName(exam))}
          {exam.teacher ? ` · ${tidy(exam.teacher.full_name)}` : ''}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => navigate(scope.examPath(exam.id))}>
          <ExternalLink />
          Open exam
        </Button>
        {group !== 'cancelled' && (
          <Button variant="outline" size="sm" onClick={() => navigate(scope.editExamPath(exam.id))}>
            <Pencil />
            Edit
          </Button>
        )}
        {(group === 'open' || group === 'finished') && (
          <Button variant="outline" size="sm" onClick={() => navigate(scope.examPath(exam.id))}>
            <PenLine />
            Mark scripts
          </Button>
        )}
      </div>

      {todo.length > 0 && (
        <div className="border-l-2 border-warning bg-warning/5 px-3 py-2.5">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <AlertTriangle className="size-4 text-warning" />
            To do
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {todo.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <dl className="max-w-2xl">
        <Fact label="When">{whenText(exam, true)}</Fact>
        <Fact label="Time for each student">{exam.duration_minutes ? formatMinutes(exam.duration_minutes) : 'The whole window'}</Fact>
        <Fact label="How it is taken">{exam.mode === 'ONLINE' ? 'Online, in the LMS' : 'On paper, answers uploaded'}</Fact>
        <Fact label="Paper" warn={noPaper}>
          {describePaper(exam)}
        </Fact>
        <Fact label="Marks">
          Out of {formatMark(exam.max_marks)}
          {exam.pass_marks != null ? `, pass at ${formatMark(exam.pass_marks)}` : ''}
          {exam.grading_scheme === 'GRADE' ? ', shown as grades' : ''}
        </Fact>
        {exam.upload_grace_minutes > 0 && exam.mode === 'OFFLINE' && <Fact label="Upload grace time">{formatMinutes(exam.upload_grace_minutes)}</Fact>}
        {exam.live_invigilation && <Fact label="Invigilation">Watched live</Fact>}
        <Fact label="Results" warn={group === 'finished' && !exam.results_published}>
          {exam.results_published
            ? `Released${exam.results_published_at ? ` ${formatDate(exam.results_published_at, 'd MMM')}` : ''}`
            : group === 'finished'
              ? 'Not released yet'
              : 'After the exam'}
        </Fact>
      </dl>

      {(exam.instructions || exam.description) && (
        <div className="max-w-2xl space-y-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Instructions</h3>
          <p className="whitespace-pre-line text-sm text-foreground">{exam.instructions || exam.description}</p>
        </div>
      )}
    </div>
  )
}

export default function ExamListPage() {
  const scope = useExamScope()
  const catalogue = useExamCatalogue()
  const examsQuery = useExams()
  const navigate = useNavigate()

  const [search, setSearch] = React.useState('')
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase())

  const exams = React.useMemo(() => examsQuery.data ?? [], [examsQuery.data])
  const now = Date.now()

  const filtered = exams.filter((e) => {
    if (!debouncedSearch) return true
    return `${e.title} ${classLabel(e)} ${subjectName(e)} ${e.teacher?.full_name ?? ''}`.toLowerCase().includes(debouncedSearch)
  })

  // Folders: class, then subject, then its exams. Inside a subject, what
  // needs doing first: open, coming up (soonest first), drafts, then finished
  // and cancelled (newest first).
  const rank: Record<Group, number> = { open: 0, upcoming: 1, draft: 2, finished: 3, cancelled: 4 }
  const byNeed = (a: ExamOut, b: ExamOut) => {
    const ga = groupOf(a)
    const gb = groupOf(b)
    if (ga !== gb) return rank[ga] - rank[gb]
    return ga === 'open' || ga === 'upcoming' ? a.starts_at.localeCompare(b.starts_at) : b.starts_at.localeCompare(a.starts_at)
  }
  const tree = (() => {
    type Sub = { id: number; name: string; items: ExamOut[] }
    const classes = new Map<string, { key: string; name: string; count: number; open: number; subjects: Map<number, Sub> }>()
    for (const e of filtered) {
      const key = e.class_id != null ? String(e.class_id) : 'none'
      if (!classes.has(key)) classes.set(key, { key, name: e.class_id != null ? classLabel(e) : 'No class', count: 0, open: 0, subjects: new Map() })
      const c = classes.get(key)!
      c.count += 1
      if (groupOf(e) === 'open') c.open += 1
      if (!c.subjects.has(e.subject_id)) c.subjects.set(e.subject_id, { id: e.subject_id, name: tidy(subjectName(e)), items: [] })
      c.subjects.get(e.subject_id)!.items.push(e)
    }
    return [...classes.values()]
      .sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }))
      .map((c) => ({
        ...c,
        subjects: [...c.subjects.values()].map((sub) => ({ ...sub, items: [...sub.items].sort(byNeed) })).sort((x, y) => x.name.localeCompare(y.name)),
      }))
  })()
  const ordered = tree.flatMap((c) => c.subjects.flatMap((sub) => sub.items))
  const selected = ordered.find((e) => e.id === selectedId) ?? null

  // Folders start closed, except a class with an exam open right now. A search
  // opens everything that matches, and the chosen exam's folders stay open; a
  // click on a folder overrides all of that.
  const [toggled, setToggled] = React.useState<Map<string, boolean>>(new Map())
  const isOpen = (key: string, liveClass = false) =>
    toggled.get(key) ??
    (!!debouncedSearch ||
      liveClass ||
      (!!selected && (key === `c${selected.class_id ?? 'none'}` || key === `s${selected.class_id ?? 'none'}-${selected.subject_id}`)))
  const toggleFolder = (key: string, liveClass = false) => setToggled((prev) => new Map(prev).set(key, !isOpen(key, liveClass)))

  const count = (g: Group) => exams.filter((e) => groupOf(e) === g).length
  const awaitingResults = exams.filter((e) => groupOf(e) === 'finished' && !e.results_published).length
  const weekAhead = exams.filter((e) => groupOf(e) === 'upcoming' && (parseApiDateTime(e.starts_at)?.getTime() ?? 0) - now < 7 * 86_400_000).length
  const canCreate = scope.isAdmin || !catalogue.hasNothing

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title={scope.isAdmin ? 'Exam Management' : 'Exams'}
        description={scope.isAdmin ? 'Every exam set by any teacher. Pick one to see where it stands' : 'Exams you have set, plus every exam in a class you lead'}
        icon={ClipboardCheck}
        actions={
          <Button size="sm" icon={<Plus />} disabled={!canCreate} onClick={() => navigate(scope.newExamPath)}>
            New exam
          </Button>
        }
      />

      <div className="!mt-0">
        <Figures>
          <Figure label="Open now" value={examsQuery.data ? String(count('open')) : '—'} context="students can hand in" tone="success" />
          <Figure label="Next 7 days" value={examsQuery.data ? String(weekAhead) : '—'} context="exams opening" tone="info" />
          <Figure label="Drafts" value={examsQuery.data ? String(count('draft')) : '—'} context="not visible yet" tone="neutral" />
          <Figure label="Results to release" value={examsQuery.data ? String(awaitingResults) : '—'} context="finished, not out" alert={awaitingResults > 0} tone="warning" />
        </Figures>

        <Band className="border-b border-border">
          {examsQuery.isPending ? (
            <div className="grid gap-4 py-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
              <Skeleton className="h-80 w-full" />
              <Skeleton className="h-80 w-full" />
            </div>
          ) : examsQuery.isError ? (
            <div className="py-6">
              <ErrorState error={examsQuery.error} onRetry={() => examsQuery.refetch()} />
            </div>
          ) : exams.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-base font-medium text-foreground">No exams yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {canCreate
                  ? 'Set the first one. It starts as a draft, so the paper can be written before the class sees anything'
                  : 'A class and subject assignment is needed before an exam can be set. Ask an administrator'}
              </p>
              {canCreate && (
                <Button size="sm" className="mt-4" icon={<Plus />} onClick={() => navigate(scope.newExamPath)}>
                  New exam
                </Button>
              )}
            </div>
          ) : (
            <div className="grid lg:h-[calc(100vh-17rem)] lg:min-h-[28rem] lg:grid-cols-[22rem_minmax(0,1fr)] lg:divide-x lg:divide-border">
              {/* ------------------------------------------------- the list */}
              <div className="-mx-4 flex flex-col border-b border-border sm:-mx-6 lg:mx-0 lg:-ml-8 lg:min-h-0 lg:border-b-0">
                <div className="flex gap-2 border-b border-border py-2.5 pl-4 pr-4 sm:pl-6 lg:pl-8">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search exams" aria-label="Search exams" className="h-8 py-1 pl-8 text-sm" />
                  </div>
                </div>
                <div className="max-h-96 flex-1 overflow-y-auto lg:max-h-none lg:min-h-0">
                  {tree.length === 0 && <p className="px-6 py-12 text-center text-sm text-muted-foreground">Nothing matches</p>}
                  {tree.map((c) => {
                    const cKey = `c${c.key}`
                    const cOpen = isOpen(cKey, c.open > 0)
                    return (
                      <div key={c.key} className="border-b border-border">
                        <button
                          type="button"
                          onClick={() => toggleFolder(cKey, c.open > 0)}
                          aria-expanded={cOpen}
                          className="flex w-full items-center gap-2 py-2.5 pl-4 pr-4 text-left hover:bg-muted/40 sm:pl-6 lg:pl-8"
                        >
                          <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', cOpen && 'rotate-90')} />
                          {cOpen ? (
                            <FolderOpen className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                          ) : (
                            <FolderClosed className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{c.name}</span>
                          {c.open > 0 && <span className="text-[11px] font-medium text-success">{c.open} open</span>}
                          <span className="text-xs tabular-nums text-muted-foreground">{c.count}</span>
                        </button>
                        {cOpen &&
                          c.subjects.map((sub) => {
                            const sKey = `s${c.key}-${sub.id}`
                            const sOpen = isOpen(sKey, c.open > 0)
                            return (
                              <div key={sub.id}>
                                <button
                                  type="button"
                                  onClick={() => toggleFolder(sKey, c.open > 0)}
                                  aria-expanded={sOpen}
                                  className="flex w-full items-center gap-2 py-1.5 pl-10 pr-4 text-left hover:bg-muted/40 sm:pl-12 lg:pl-14"
                                >
                                  <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', sOpen && 'rotate-90')} />
                                  {sOpen ? (
                                    <FolderOpen className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                                  ) : (
                                    <FolderClosed className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                                  )}
                                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{sub.name}</span>
                                  <span className="text-xs tabular-nums text-muted-foreground">{sub.items.length}</span>
                                </button>
                                {sOpen && (
                                  <ul className="pb-1">
                                    {sub.items.map((e) => {
                                      const active = selected?.id === e.id
                                      const start = parseApiDateTime(e.starts_at)
                                      const g = groupOf(e)
                                      const late = g === 'finished' && !e.results_published
                                      const tone = late ? 'warning' : GROUPS.find((x) => x.key === g)!.tone
                                      return (
                                        <li key={e.id}>
                                          <button
                                            type="button"
                                            onClick={() => setSelectedId(e.id)}
                                            onDoubleClick={() => navigate(scope.examPath(e.id))}
                                            aria-current={active ? 'true' : undefined}
                                            className={cn(
                                              'relative flex w-full items-center gap-2.5 py-1.5 pl-[4.5rem] pr-4 text-left transition-colors sm:pl-20 lg:pl-[5.5rem]',
                                              active ? 'bg-primary/10' : 'hover:bg-muted/40',
                                            )}
                                          >
                                            {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
                                            <span
                                              className={cn('size-2 shrink-0 rounded-full', TONE_FILL[tone], g === 'open' && 'animate-pulse')}
                                              title={late ? 'Results not released' : GROUPS.find((x) => x.key === g)!.label}
                                            />
                                            <span className={cn('min-w-0 flex-1 truncate text-sm', active ? 'font-medium text-primary' : 'text-foreground')} title={e.title}>
                                              {e.title}
                                            </span>
                                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{start ? formatDate(start, 'd MMM') : ''}</span>
                                          </button>
                                        </li>
                                      )
                                    })}
                                  </ul>
                                )}
                              </div>
                            )
                          })}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ---------------------------------------------- the summary */}
              <section className="min-w-0 py-5 lg:min-h-0 lg:overflow-y-auto lg:pl-8 lg:pr-1">
                {selected ? <ExamSummary key={selected.id} exam={selected} /> : (
                  <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                    <ClipboardCheck className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
                    <p className="mt-2 text-sm text-muted-foreground">Open a class, then pick an exam to see where it stands</p>
                  </div>
                )}
              </section>
            </div>
          )}
        </Band>
      </div>
    </div>
  )
}

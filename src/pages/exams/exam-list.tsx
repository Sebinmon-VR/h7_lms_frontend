import { ChevronRight, ClipboardCheck, Plus, Search } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'

import type { ExamMode, ExamOut, ExamStatus, ExamWindowState } from '@/api/types'
import { useExams } from '@/queries/exam.queries'
import { cn } from '@/lib/cn'
import { formatDateTime, formatRelative } from '@/lib/datetime'
import { describePaper, formatMark, formatMinutes } from '@/lib/exams'
import { useDebouncedValue } from '@/lib/hooks'
import { className as classLabel, subjectName } from '@/lib/select'
import { subjectLook, toneStyle } from '@/lib/subjects'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ExamModeBadge,
  ExamStatusBadge,
  ExamWindowBadge,
  ResultsBadge,
} from '@/components/domain/badges'
import { FiledBy } from '@/components/domain/filed-by'
import { EmptyState, ErrorState, NoResults } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { useExamCatalogue, useExamScope } from './exam-scope'

/**
 * Every exam this user may act on, grouped by what needs doing.
 *
 * An exam list sorted by date alone buries the one thing a teacher opens
 * this page for — the paper the class is sitting right now, or the one due to
 * open in an hour — under last term's. So the groups come first: open, then
 * upcoming, then drafts still being written, then what is finished.
 */

type Group = 'open' | 'upcoming' | 'draft' | 'finished' | 'cancelled'

const GROUP_ORDER: Group[] = ['open', 'upcoming', 'draft', 'finished', 'cancelled']

const GROUP_LABEL: Record<Group, { title: string; hint: string }> = {
  open: { title: 'Open now', hint: 'Students can hand in.' },
  upcoming: { title: 'Coming up', hint: 'Published, waiting for the window to open.' },
  draft: { title: 'Drafts', hint: 'Not visible to students yet.' },
  finished: { title: 'Finished', hint: 'The window has closed.' },
  cancelled: { title: 'Cancelled', hint: '' },
}

function groupOf(exam: ExamOut): Group {
  if (exam.status === 'CANCELLED') return 'cancelled'
  if (exam.status === 'DRAFT') return 'draft'
  if (exam.window_state === 'OPEN' || exam.window_state === 'GRACE') return 'open'
  if (exam.window_state === 'NOT_OPEN') return 'upcoming'
  return 'finished'
}

type StatusFilter = 'ALL' | ExamStatus | 'OPEN'

function ExamRow({ exam, to }: { exam: ExamOut; to: string }) {
  const subject = subjectName(exam)
  const look = subjectLook(subject)
  const showWindow: ExamWindowState | null = exam.status === 'PUBLISHED' ? exam.window_state : null

  return (
    <li>
      <Link
        to={to}
        style={toneStyle(look.tone)}
        className={cn(
          'group flex items-stretch gap-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all',
          'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        )}
      >
        <span className="w-1.5 shrink-0 bg-[hsl(var(--tile))]" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg leading-none" aria-hidden>
                {look.emoji}
              </span>
              <p className="truncate text-sm font-semibold">{exam.title}</p>
              <ExamModeBadge mode={exam.mode} />
              {exam.status !== 'PUBLISHED' && <ExamStatusBadge status={exam.status} size="sm" />}
              {showWindow && <ExamWindowBadge state={showWindow} size="sm" />}
              {exam.window_state === 'CLOSED' && exam.status === 'PUBLISHED' && (
                <ResultsBadge published={exam.results_published} />
              )}
              <FiledBy teacherId={exam.teacher_id} teacher={exam.teacher} />
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {classLabel(exam)} · {subject}
              {exam.teacher ? ` · ${exam.teacher.full_name}` : ''}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{formatDateTime(exam.starts_at)}</span>
              {' → '}
              {formatDateTime(exam.ends_at)}
              {exam.duration_minutes ? ` · ${formatMinutes(exam.duration_minutes)} each` : ''}
              {exam.window_state === 'NOT_OPEN' && exam.status === 'PUBLISHED'
                ? ` · opens ${formatRelative(exam.starts_at)}`
                : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground sm:flex-col sm:items-end sm:gap-1">
            <span>{describePaper(exam)}</span>
            <span>
              Out of <span className="font-semibold text-foreground">{formatMark(exam.max_marks)}</span>
            </span>
          </div>
          <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
        </div>
      </Link>
    </li>
  )
}

export default function ExamListPage() {
  const scope = useExamScope()
  const catalogue = useExamCatalogue()
  const examsQuery = useExams()
  const navigate = useNavigate()

  const [search, setSearch] = React.useState('')
  const [classId, setClassId] = React.useState<string | null>(null)
  const [subjectId, setSubjectId] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<StatusFilter>('ALL')
  const [mode, setMode] = React.useState<'ALL' | ExamMode>('ALL')
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase())

  const exams = React.useMemo(() => examsQuery.data ?? [], [examsQuery.data])

  // Filter options come from the exams that exist, not the catalogue: a
  // class with no exams is not something to filter to.
  const classOptions = React.useMemo(() => {
    const map = new Map<number, string>()
    for (const e of exams) map.set(e.class_id, classLabel(e))
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [exams])

  const subjectOptions = React.useMemo(() => {
    const map = new Map<number, string>()
    for (const e of exams) {
      if (classId && String(e.class_id) !== classId) continue
      map.set(e.subject_id, subjectName(e))
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [exams, classId])

  const filtered = React.useMemo(
    () =>
      exams.filter((e) => {
        if (classId && String(e.class_id) !== classId) return false
        if (subjectId && String(e.subject_id) !== subjectId) return false
        if (mode !== 'ALL' && e.mode !== mode) return false
        if (status === 'OPEN') {
          if (groupOf(e) !== 'open') return false
        } else if (status !== 'ALL' && e.status !== status) return false
        if (debouncedSearch) {
          const haystack = `${e.title} ${classLabel(e)} ${subjectName(e)} ${e.teacher?.full_name ?? ''}`.toLowerCase()
          if (!haystack.includes(debouncedSearch)) return false
        }
        return true
      }),
    [exams, classId, subjectId, mode, status, debouncedSearch],
  )

  const grouped = React.useMemo(() => {
    const map = new Map<Group, ExamOut[]>()
    for (const e of filtered) {
      const g = groupOf(e)
      const list = map.get(g)
      if (list) list.push(e)
      else map.set(g, [e])
    }
    // Open and upcoming soonest-first; everything else most recent first.
    for (const [g, list] of map) {
      list.sort((a, b) =>
        g === 'open' || g === 'upcoming'
          ? a.starts_at.localeCompare(b.starts_at)
          : b.starts_at.localeCompare(a.starts_at),
      )
    }
    return map
  }, [filtered])

  const counts = React.useMemo(() => {
    const c: Record<Group, number> = { open: 0, upcoming: 0, draft: 0, finished: 0, cancelled: 0 }
    for (const e of exams) c[groupOf(e)] += 1
    return c
  }, [exams])

  const filtersActive = !!classId || !!subjectId || status !== 'ALL' || mode !== 'ALL' || !!search
  const clearFilters = () => {
    setClassId(null)
    setSubjectId(null)
    setStatus('ALL')
    setMode('ALL')
    setSearch('')
  }

  const canCreate = scope.isAdmin || !catalogue.hasNothing

  return (
    <>
      <PageHeader
        title="Exams"
        description={
          scope.isAdmin
            ? 'Every exam set by any teacher. Open one to edit it, mark scripts or release results.'
            : 'Exams you have set, plus every exam in a class you lead.'
        }
        actions={
          <Button variant="primary" icon={<Plus />} disabled={!canCreate} onClick={() => navigate(scope.newExamPath)}>
            New exam
          </Button>
        }
      >
        {exams.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {GROUP_ORDER.filter((g) => counts[g] > 0 && g !== 'cancelled').map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setStatus(g === 'open' ? 'OPEN' : g === 'draft' ? 'DRAFT' : 'ALL')}
                className={cn(
                  'rounded-full border border-border bg-card px-3 py-1 transition-colors hover:border-primary/40',
                  g === 'open' && counts.open > 0 && 'border-success/40 bg-success/8 text-success',
                )}
              >
                <span className="font-semibold tabular-nums">{counts[g]}</span> {GROUP_LABEL[g].title.toLowerCase()}
              </button>
            ))}
          </div>
        )}
      </PageHeader>

      {examsQuery.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : examsQuery.isError ? (
        <ErrorState error={examsQuery.error} onRetry={() => examsQuery.refetch()} />
      ) : exams.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck />}
          title="No exams yet"
          description={
            canCreate
              ? 'Set the first one. It starts as a draft, so you can write the paper before the class sees anything.'
              : 'You need a class and subject assignment before you can set an exam. Ask an administrator.'
          }
          action={
            canCreate ? (
              <Button variant="primary" icon={<Plus />} onClick={() => navigate(scope.newExamPath)}>
                New exam
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <Input
              leading={<Search />}
              placeholder="Search by title, class, subject…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search exams"
            />
            <Combobox
              value={classId}
              onChange={(v) => {
                setClassId(v === classId ? null : v)
                setSubjectId(null)
              }}
              placeholder="Every class"
              options={classOptions.map(([id, name]) => ({ value: String(id), label: name }))}
            />
            <Combobox
              value={subjectId}
              onChange={(v) => setSubjectId(v === subjectId ? null : v)}
              placeholder="Every subject"
              options={subjectOptions.map(([id, name]) => ({ value: String(id), label: name }))}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Segmented<StatusFilter>
                layoutId="exam-status-filter"
                size="sm"
                value={status}
                onChange={setStatus}
                aria-label="Status"
                options={[
                  { value: 'ALL', label: 'All' },
                  { value: 'OPEN', label: 'Open' },
                  { value: 'DRAFT', label: 'Drafts' },
                  { value: 'PUBLISHED', label: 'Published' },
                ]}
              />
              <Segmented<'ALL' | ExamMode>
                layoutId="exam-mode-filter"
                size="sm"
                value={mode}
                onChange={setMode}
                aria-label="Mode"
                options={[
                  { value: 'ALL', label: 'Any' },
                  { value: 'ONLINE', label: 'Online' },
                  { value: 'OFFLINE', label: 'Offline' },
                ]}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <NoResults onClear={filtersActive ? clearFilters : undefined} />
          ) : (
            GROUP_ORDER.filter((g) => grouped.has(g)).map((g) => {
              const list = grouped.get(g) as ExamOut[]
              return (
                <section key={g}>
                  <div className="mb-2.5 flex items-baseline gap-2">
                    <h2 className="text-sm font-semibold">{GROUP_LABEL[g].title}</h2>
                    <span className="text-xs text-muted-foreground">
                      {list.length}
                      {GROUP_LABEL[g].hint ? ` · ${GROUP_LABEL[g].hint}` : ''}
                    </span>
                  </div>
                  <ul className="space-y-2.5">
                    {list.map((exam) => (
                      <ExamRow key={exam.id} exam={exam} to={scope.examPath(exam.id)} />
                    ))}
                  </ul>
                </section>
              )
            })
          )}
        </div>
      )}
    </>
  )
}

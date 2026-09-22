import {
  ArrowLeft,
  Eye,
  EyeOff,
  FileBadge,
  MessageSquareQuote,
  PencilLine,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ApiError } from '@/api/errors'
import type { ReportCardBatch, ReportCardGenerate, ReportCardOut } from '@/api/types'
import {
  useDeleteReportCard,
  useExams,
  useGenerateReportCards,
  useReportCard,
  useReportCards,
  useUpdateReportCard,
} from '@/queries/exam.queries'
import { cn } from '@/lib/cn'
import { formatDate, parseApiDate } from '@/lib/datetime'
import { DEFAULT_GRADE_BANDS } from '@/lib/exams'
import { useDebouncedValue } from '@/lib/hooks'
import { formatPercent } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { PrintReportCardButton, ReportCardTile, ReportCardView } from '@/components/domain/report-card'
import { EmptyState, ErrorState, NoResults } from '@/components/feedback/states'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field } from '@/components/forms/field'
import { PageHeader } from '@/components/layout/page-header'
import { useExamCatalogue, useExamScope } from './exam-scope'

/**
 * Report cards — a class teacher's business.
 *
 * Issuing consolidates every subject teacher's marks into one document per
 * student, so only the teacher answerable for the class as a whole (or an
 * admin) may do it; a subject teacher who opens this page sees which classes
 * they could issue for, which for most of them is none. Cards are issued
 * unpublished so they can be read before the class does.
 */

// ------------------------------------------------------------- generate

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span className="text-sm">
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}

function GenerateDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (batch: ReportCardBatch) => void
}) {
  const catalogue = useExamCatalogue()
  const examsQuery = useExams(open)
  const generate = useGenerateReportCards()

  const [classId, setClassId] = React.useState<string | null>(null)
  const [title, setTitle] = React.useState('')
  const [fromDate, setFromDate] = React.useState<string | null>(null)
  const [toDate, setToDate] = React.useState<string | null>(null)
  const [publishedOnly, setPublishedOnly] = React.useState(true)
  const [missingAsZero, setMissingAsZero] = React.useState(false)
  const [includeAttendance, setIncludeAttendance] = React.useState(true)
  const [includeRank, setIncludeRank] = React.useState(true)
  const [useStandardScale, setUseStandardScale] = React.useState(false)
  const [publish, setPublish] = React.useState(false)
  const [remarks, setRemarks] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setError(null)
    if (catalogue.leadableClasses.length === 1) setClassId(String(catalogue.leadableClasses[0].id))
    setTitle((t) => t || `Term Report Card ${new Date().getFullYear()}`)
  }, [open, catalogue.leadableClasses])

  // What the request would count, so a card with nothing on it is caught before the round trip.
  const candidateExams = React.useMemo(() => {
    if (!classId) return []
    const from = parseApiDate(fromDate)
    const to = parseApiDate(toDate)
    return (examsQuery.data ?? []).filter((e) => {
      if (String(e.class_id) !== classId || e.status === 'CANCELLED') return false
      if (publishedOnly && !e.results_published) return false
      const starts = new Date(`${e.starts_at}${/Z|[+-]\d{2}:?\d{2}$/.test(e.starts_at) ? '' : 'Z'}`)
      if (from && starts < from) return false
      if (to && starts > new Date(to.getTime() + 86_400_000)) return false
      return true
    })
  }, [classId, fromDate, toDate, publishedOnly, examsQuery.data])

  const valid = !!classId && title.trim().length > 1 && (!fromDate || !toDate || fromDate < toDate)

  const submit = async () => {
    if (!valid) return
    setError(null)
    const body: ReportCardGenerate = {
      class_id: Number(classId),
      title: title.trim(),
      from_date: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : null,
      to_date: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : null,
      published_results_only: publishedOnly,
      count_missing_as_zero: missingAsZero,
      include_attendance: includeAttendance,
      include_rank: includeRank,
      grade_bands: useStandardScale ? DEFAULT_GRADE_BANDS : [],
      remarks: remarks.trim() || null,
      publish,
    }
    try {
      const batch = await generate.mutateAsync(body)
      onDone(batch)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not issue the report cards.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !generate.isPending && onOpenChange(v)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Issue report cards</DialogTitle>
          <DialogDescription>
            One card per enrolled student, consolidating their exams by subject. Re-issuing with the same title
            overwrites the previous version.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field id="rc-class" label="Class" required>
              <Combobox
                id="rc-class"
                value={classId}
                onChange={setClassId}
                placeholder={catalogue.isPending ? 'Loading…' : 'Select a class'}
                emptyMessage="You do not lead any class."
                options={catalogue.leadableClasses.map((c) => ({ value: String(c.id), label: c.name, hint: c.code }))}
              />
            </Field>
            <Field id="rc-title" label="Title" required hint="e.g. “Term 1 Report Card 2026”.">
              <Input id="rc-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field id="rc-from" label="Exams from" hint="Leave blank for no lower bound.">
              <DatePicker id="rc-from" value={fromDate} onChange={setFromDate} placeholder="Start of period" />
            </Field>
            <Field id="rc-to" label="Exams until" hint="Leave blank for no upper bound.">
              <DatePicker id="rc-to" value={toDate} onChange={setToDate} placeholder="End of period" />
            </Field>
          </div>

          {classId && !examsQuery.isPending && (
            <div
              className={cn(
                'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs',
                candidateExams.length === 0 ? 'border-danger/30 bg-danger/8 text-danger' : 'border-border bg-surface text-muted-foreground',
              )}
            >
              {candidateExams.length === 0 ? <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> : <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />}
              <span>
                {candidateExams.length === 0
                  ? publishedOnly
                    ? 'No exams in this class have published results in that period, so every card would be empty. Publish results first, or turn off the published-only rule to preview.'
                    : 'No exams in this class fall in that period.'
                  : `${candidateExams.length} exam${candidateExams.length === 1 ? '' : 's'} will be counted: ${candidateExams
                      .slice(0, 4)
                      .map((e) => e.title)
                      .join(', ')}${candidateExams.length > 4 ? '…' : ''}`}
              </span>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle checked={publishedOnly} onChange={setPublishedOnly} label="Published results only" hint="Turn off to preview a card mid-term." />
            <Toggle checked={missingAsZero} onChange={setMissingAsZero} label="Count a missed exam as zero" hint="Otherwise it is left out of the totals and noted on the card." />
            <Toggle checked={includeAttendance} onChange={setIncludeAttendance} label="Include attendance" hint="The percentage of classes attended." />
            <Toggle checked={includeRank} onChange={setIncludeRank} label="Rank within the class" hint="Position by overall percentage." />
            <Toggle checked={useStandardScale} onChange={setUseStandardScale} label="Standard A+ to E scale" hint="Otherwise each exam's own bands are used where they agree." />
            <Toggle checked={publish} onChange={setPublish} label="Release to students now" hint="Off lets you read every card before the class does." />
          </div>

          <Field id="rc-remarks" label="Remarks on every card" hint="You can edit each card's remarks afterwards.">
            <Textarea id="rc-remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generate.isPending}>
            Cancel
          </Button>
          <Button variant="primary" icon={<FileBadge />} disabled={!valid} loading={generate.isPending} onClick={submit}>
            Issue cards
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ----------------------------------------------------------------- list

type PublishedFilter = 'ALL' | 'RELEASED' | 'DRAFT'

export default function ReportCardsPage() {
  const scope = useExamScope()
  const catalogue = useExamCatalogue()
  const cardsQuery = useReportCards()
  const navigate = useNavigate()

  const [generating, setGenerating] = React.useState(false)
  const [warnings, setWarnings] = React.useState<string[]>([])
  const [search, setSearch] = React.useState('')
  const [classId, setClassId] = React.useState<string | null>(null)
  const [published, setPublished] = React.useState<PublishedFilter>('ALL')
  const debounced = useDebouncedValue(search.trim().toLowerCase())

  const cards = React.useMemo(() => cardsQuery.data ?? [], [cardsQuery.data])

  const classOptions = React.useMemo(() => {
    const map = new Map<number, string>()
    for (const c of cards) {
      // A tuition card has no class, so it cannot be bucketed by one. Skipped
      // rather than filed under "null", which would offer a filter that means
      // nothing on this school-side screen.
      if (c.class_id == null) continue
      map.set(c.class_id, c.class_room?.name ?? `Class ${String(c.class_id).slice(-6)}`)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [cards])

  const titleOptions = React.useMemo(() => [...new Set(cards.map((c) => c.title))], [cards])

  const visible = React.useMemo(
    () =>
      cards.filter((c) => {
        if (classId && String(c.class_id) !== classId) return false
        if (published === 'RELEASED' && !c.is_published) return false
        if (published === 'DRAFT' && c.is_published) return false
        if (debounced) {
          const hay = `${c.student?.full_name ?? ''} ${c.student?.email ?? ''} ${c.title} ${c.class_room?.name ?? ''}`.toLowerCase()
          if (!hay.includes(debounced)) return false
        }
        return true
      }),
    [cards, classId, published, debounced],
  )

  const grouped = React.useMemo(() => {
    const map = new Map<string, ReportCardOut[]>()
    for (const c of visible) {
      const key = `${c.title}|${c.class_id}`
      const list = map.get(key)
      if (list) list.push(c)
      else map.set(key, [c])
    }
    for (const list of map.values()) list.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || (a.student?.full_name ?? '').localeCompare(b.student?.full_name ?? ''))
    return [...map.entries()].sort((a, b) => (b[1][0].generated_at ?? '').localeCompare(a[1][0].generated_at ?? ''))
  }, [visible])

  const canIssue = catalogue.leadableClasses.length > 0
  const filtersActive = !!classId || published !== 'ALL' || !!search

  return (
    <>
      <PageHeader
        title="Report cards"
        description={
          scope.isAdmin
            ? 'Consolidated results for every class. Issue, read and release them on the class teacher’s behalf.'
            : 'Consolidated results for the classes you lead, one card per student.'
        }
        actions={
          <Button variant="primary" icon={<Plus />} disabled={!canIssue || catalogue.isPending} onClick={() => setGenerating(true)}>
            Issue report cards
          </Button>
        }
      />

      {!catalogue.isPending && !canIssue && !scope.isAdmin && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-info/30 bg-info/8 p-4 text-sm">
          <FileBadge className="mt-0.5 size-4 shrink-0 text-info" />
          <p className="text-muted-foreground">
            Report cards are issued by a class&rsquo;s class teacher, and you do not lead a class. Ask an administrator to
            assign you, or to issue them.
          </p>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-5 space-y-1 rounded-xl border border-warning/30 bg-warning/8 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert className="size-4 text-warning" />
            Issued with notes
          </p>
          <ul className="list-disc space-y-0.5 pl-6 text-muted-foreground">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <Button variant="ghost" size="xs" onClick={() => setWarnings([])}>
            Dismiss
          </Button>
        </div>
      )}

      {cardsQuery.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : cardsQuery.isError ? (
        <ErrorState error={cardsQuery.error} onRetry={() => cardsQuery.refetch()} />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<FileBadge />}
          title="No report cards yet"
          description={
            canIssue
              ? 'Issue the first set once some exam results have been published. Cards start unreleased so you can read them first.'
              : 'Report cards for the classes you lead will appear here once they are issued.'
          }
          action={
            canIssue ? (
              <Button variant="primary" icon={<Plus />} onClick={() => setGenerating(true)}>
                Issue report cards
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-[1fr_1fr_auto]">
            <Input leading={<Search />} placeholder="Search by student or title…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search report cards" />
            <Combobox
              value={classId}
              onChange={(v) => setClassId(v === classId ? null : v)}
              placeholder="Every class"
              options={classOptions.map(([id, name]) => ({ value: String(id), label: name }))}
            />
            <Segmented<PublishedFilter>
              layoutId="rc-published-filter"
              size="sm"
              value={published}
              onChange={setPublished}
              aria-label="Release state"
              options={[
                { value: 'ALL', label: 'All' },
                { value: 'RELEASED', label: 'Released' },
                { value: 'DRAFT', label: 'Not released' },
              ]}
            />
          </div>

          {visible.length === 0 ? (
            <NoResults
              onClear={
                filtersActive
                  ? () => {
                      setClassId(null)
                      setPublished('ALL')
                      setSearch('')
                    }
                  : undefined
              }
            />
          ) : (
            grouped.map(([key, list]) => {
              const first = list[0]
              const released = list.filter((c) => c.is_published).length
              const average = list.reduce((sum, c) => sum + c.overall_percentage, 0) / list.length
              return (
                <section key={key}>
                  <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="text-sm font-semibold">{first.title}</h2>
                    <span className="text-xs text-muted-foreground">
                      {first.class_room?.name ?? ''} · {list.length} card{list.length === 1 ? '' : 's'} · class average {formatPercent(average, 0)} · issued {formatDate(first.generated_at)}
                    </span>
                    <Badge tone={released === list.length ? 'success' : released > 0 ? 'warning' : 'neutral'} size="sm" className="ml-auto">
                      {released === list.length ? 'All released' : released > 0 ? `${released} of ${list.length} released` : 'Not released'}
                    </Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((card) => (
                      <ReportCardTile key={card.id} card={card} onClick={() => navigate(scope.reportCardPath(card.id))} />
                    ))}
                  </div>
                </section>
              )
            })
          )}
          {titleOptions.length > 1 && (
            <p className="text-xs text-muted-foreground">Cards are grouped by title and class. Re-issuing with the same title replaces the group.</p>
          )}
        </div>
      )}

      <GenerateDialog open={generating} onOpenChange={setGenerating} onDone={(batch) => setWarnings(batch.warnings)} />
    </>
  )
}

// --------------------------------------------------------------- detail

function RemarksDialog({
  card,
  open,
  onOpenChange,
}: {
  card: ReportCardOut
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const update = useUpdateReportCard()
  const [title, setTitle] = React.useState(card.title)
  const [remarks, setRemarks] = React.useState(card.remarks ?? '')
  const [subjectRemarks, setSubjectRemarks] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    if (!open) return
    setTitle(card.title)
    setRemarks(card.remarks ?? '')
    setSubjectRemarks(Object.fromEntries(card.subjects.map((s) => [String(s.subject_id), s.teacher_remarks ?? ''])))
  }, [open, card])

  const changedSubjects = Object.fromEntries(
    Object.entries(subjectRemarks).filter(([id, text]) => {
      const before = card.subjects.find((s) => String(s.subject_id) === id)?.teacher_remarks ?? ''
      return text.trim() !== before
    }),
  )
  const dirty = title.trim() !== card.title || remarks.trim() !== (card.remarks ?? '') || Object.keys(changedSubjects).length > 0

  const submit = () => {
    update.mutate(
      {
        cardId: card.id,
        body: {
          ...(title.trim() !== card.title && title.trim() && { title: title.trim() }),
          ...(remarks.trim() !== (card.remarks ?? '') && { remarks: remarks.trim() }),
          ...(Object.keys(changedSubjects).length > 0 && {
            subject_remarks: Object.fromEntries(Object.entries(changedSubjects).map(([id, text]) => [id, text.trim()])),
          }),
        },
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !update.isPending && onOpenChange(v)}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Remarks</DialogTitle>
          <DialogDescription>The marks are a snapshot and cannot be edited here. Correct the script and re-issue the card instead.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <Field id="rc-edit-title" label="Title">
            <Input id="rc-edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field id="rc-edit-remarks" label="Class teacher's remarks">
            <Textarea id="rc-edit-remarks" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="A sentence or two about the term." />
          </Field>
          {card.subjects.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Per subject</p>
              {card.subjects.map((s) => (
                <Field key={s.subject_id} id={`rc-subject-${s.subject_id}`} label={s.subject_name ?? `Subject ${s.subject_id}`}>
                  <Input
                    id={`rc-subject-${s.subject_id}`}
                    value={subjectRemarks[String(s.subject_id)] ?? ''}
                    onChange={(e) => setSubjectRemarks((prev) => ({ ...prev, [String(s.subject_id)]: e.target.value }))}
                    placeholder="Optional"
                  />
                </Field>
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!dirty} loading={update.isPending} onClick={submit}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ReportCardDetailPage() {
  const scope = useExamScope()
  const navigate = useNavigate()
  const params = useParams<{ cardId: string }>()
  const cardQuery = useReportCard(params.cardId ?? null)
  const update = useUpdateReportCard()
  const remove = useDeleteReportCard()
  const [editing, setEditing] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  if (cardQuery.isPending) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-[40rem] rounded-2xl" />
      </div>
    )
  }
  if (cardQuery.isError || !cardQuery.data) return <ErrorState error={cardQuery.error} onRetry={() => cardQuery.refetch()} />
  const card = cardQuery.data

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={scope.reportCardsPath} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" />
          All report cards
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" icon={<PencilLine />} onClick={() => setEditing(true)}>
            Remarks
          </Button>
          <Button
            variant={card.is_published ? 'outline' : 'primary'}
            size="sm"
            icon={card.is_published ? <EyeOff /> : <Eye />}
            loading={update.isPending}
            onClick={() => update.mutate({ cardId: card.id, body: { is_published: !card.is_published } })}
          >
            {card.is_published ? 'Withdraw from student' : 'Release to student'}
          </Button>
          <Button variant="ghost" size="sm" icon={<Trash2 />} className="text-danger hover:bg-danger/10" onClick={() => setDeleting(true)}>
            Delete
          </Button>
        </div>
      </div>

      {!card.is_published && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
          <MessageSquareQuote className="size-3.5" />
          Not released yet — the student cannot see this card until you release it.
        </p>
      )}

      <ReportCardView card={card} actions={<PrintReportCardButton />} />

      <RemarksDialog card={card} open={editing} onOpenChange={setEditing} />

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this report card?"
        description={`${card.student?.full_name ?? 'The student'}’s “${card.title}” will be withdrawn. The exam marks it was built from are untouched, so it can be re-issued.`}
        confirmLabel="Delete card"
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate(card.id, { onSuccess: () => navigate(scope.reportCardsPath, { replace: true }) })}
      />
    </div>
  )
}

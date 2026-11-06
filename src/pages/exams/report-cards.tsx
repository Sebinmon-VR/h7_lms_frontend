import {
  ArrowLeft,
  ClipboardPen,
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
  X,
} from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ApiError } from '@/api/errors'
import type { ReportCardBatch, ReportCardGenerate, ReportCardOut } from '@/api/types'
import {
  useDeleteReportCard,
  useExams,
  useGenerateReportCards,
  usePaperMarks,
  useReportCard,
  useReportCards,
  useUpdateReportCard,
} from '@/queries/exam.queries'
import { cn } from '@/lib/cn'
import { parseApiDate } from '@/lib/datetime'
import { DEFAULT_GRADE_BANDS } from '@/lib/exams'
import { useDebouncedValue } from '@/lib/hooks'
import { formatPercent } from '@/lib/format'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { PrintReportCardButton, ReportCardView, withRowTotals } from '@/components/domain/report-card'
import { ErrorState } from '@/components/feedback/states'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field } from '@/components/forms/field'
import { Band, Figure, Figures, WorkspaceHeader } from '@/components/layout/workspace'
import { tidyName as tidy } from '@/lib/names'
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
    <label className="flex cursor-pointer items-start gap-3 rounded-md px-1 py-1.5 hover:bg-muted/40">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span className="text-sm">
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}

function IssuePanel({ onClose, onDone }: { onClose: () => void; onDone: (batch: ReportCardBatch) => void }) {
  const open = true
  const scope = useExamScope()
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

  // Paper exams count by the date they were written, whatever the published-only rule says:
  // there is no release step for them, the card is how they reach the student.
  const paperQuery = usePaperMarks(open && classId ? Number(classId) : null)
  const paperExams = React.useMemo(
    () =>
      (paperQuery.data?.sheets ?? []).filter(
        (s) => s.conducted_on && (!fromDate || s.conducted_on >= fromDate) && (!toDate || s.conducted_on <= toDate),
      ),
    [paperQuery.data, fromDate, toDate],
  )

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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not issue the report cards.')
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-medium tracking-tight text-foreground">Issue report cards</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              One card per enrolled student, their exams consolidated by subject. Re-issuing with the same title replaces the set
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" disabled={generate.isPending}>
            <X />
          </Button>
        </div>
        <div className="space-y-5 border-t border-border pt-4">
          {error && (
            <p className="border-l-2 border-danger bg-danger/5 px-3 py-2 text-sm text-danger" role="alert">
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

          {classId && !examsQuery.isPending && !paperQuery.isPending && (
            <div
              className={cn(
                'flex items-start gap-2.5 border-l-2 px-3 py-2 text-xs',
                candidateExams.length + paperExams.length === 0 ? 'border-danger bg-danger/5 text-danger' : 'border-primary bg-primary/[0.04] text-muted-foreground',
              )}
            >
              {candidateExams.length + paperExams.length === 0 ? (
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
              )}
              <span>
                {candidateExams.length + paperExams.length === 0 ? (
                  <>
                    {publishedOnly
                      ? 'No exams in this class have published results in that period, and no offline exam marks have been entered for it, so every card would be empty. '
                      : 'No exams in this class fall in that period. '}
                    For an exam held offline, enter the marks under{' '}
                    <Link to={`${scope.paperMarksPath}?class=${classId}`} className="font-medium underline">
                      Offline exam marks
                    </Link>{' '}
                    first.
                  </>
                ) : (
                  [
                    candidateExams.length > 0 &&
                      `${candidateExams.length} exam${candidateExams.length === 1 ? '' : 's'} held in the LMS: ${candidateExams
                        .slice(0, 4)
                        .map((e) => e.title)
                        .join(', ')}${candidateExams.length > 4 ? '…' : ''}.`,
                    paperExams.length > 0 &&
                      `${paperExams.length} held offline: ${paperExams
                        .slice(0, 4)
                        .map((s) => s.exam_name)
                        .join(', ')}${paperExams.length > 4 ? '…' : ''}.`,
                  ]
                    .filter(Boolean)
                    .join(' ') + ' These will be counted.'
                )}
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
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={generate.isPending}>
            Cancel
          </Button>
          <Button size="sm" icon={<FileBadge />} disabled={!valid} loading={generate.isPending} onClick={submit}>
            Issue cards
          </Button>
        </div>
    </div>
  )
}

// ----------------------------------------------------------------- list

type PublishedFilter = 'ALL' | 'RELEASED' | 'DRAFT'

/** The selected card, large, with the things a class teacher does to it. */
function CardPreview({ card, onDeleted }: { card: ReportCardOut; onDeleted: () => void }) {
  const scope = useExamScope()
  const update = useUpdateReportCard()
  const remove = useDeleteReportCard()
  const [editing, setEditing] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={cn('inline-flex items-center gap-1.5 text-xs font-medium', card.is_published ? 'text-success' : 'text-warning')}>
          <span className={cn('size-2 rounded-full', card.is_published ? 'bg-success' : 'bg-warning')} aria-hidden />
          {card.is_published ? 'Released to the student' : 'Not released: the student cannot see it yet'}
        </p>
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
            {card.is_published ? 'Withdraw' : 'Release'}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to={scope.reportCardPath(card.id)}>Open full page</Link>
          </Button>
          <Button variant="ghost" size="icon-sm" className="hover:text-danger" aria-label="Delete this report card" onClick={() => setDeleting(true)}>
            <Trash2 />
          </Button>
        </div>
      </div>

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
        onConfirm={() => remove.mutate(card.id, { onSuccess: onDeleted, onSettled: () => setDeleting(false) })}
      />
    </div>
  )
}

export default function ReportCardsPage() {
  const scope = useExamScope()
  const catalogue = useExamCatalogue()
  const cardsQuery = useReportCards()
  const update = useUpdateReportCard()

  const [issuing, setIssuing] = React.useState(false)
  const [warnings, setWarnings] = React.useState<string[]>([])
  const [search, setSearch] = React.useState('')
  const [classId, setClassId] = React.useState<string | null>(null)
  const [published, setPublished] = React.useState<PublishedFilter>('ALL')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [releasing, setReleasing] = React.useState<string | null>(null)
  const debounced = useDebouncedValue(search.trim().toLowerCase())

  const cards = React.useMemo(() => cardsQuery.data ?? [], [cardsQuery.data])

  const classOptions = React.useMemo(() => {
    const map = new Map<number, string>()
    for (const c of cards) {
      // A tuition card has no class, so it cannot be bucketed by one.
      if (c.class_id == null) continue
      map.set(c.class_id, c.class_room?.name ?? `Class ${String(c.class_id).slice(-6)}`)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }))
  }, [cards])

  const visible = cards.filter((c) => {
    if (classId && String(c.class_id) !== classId) return false
    if (published === 'RELEASED' && !c.is_published) return false
    if (published === 'DRAFT' && c.is_published) return false
    if (debounced) {
      const hay = `${c.student?.full_name ?? ''} ${c.student?.email ?? ''} ${c.title} ${c.class_room?.name ?? ''}`.toLowerCase()
      if (!hay.includes(debounced)) return false
    }
    return true
  })

  // One set per title and class, newest first; inside, by rank then name.
  const sets = (() => {
    const map = new Map<string, ReportCardOut[]>()
    for (const c of visible) {
      const key = `${c.title}|${c.class_id}`
      map.set(key, [...(map.get(key) ?? []), c])
    }
    for (const list of map.values()) list.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || (a.student?.full_name ?? '').localeCompare(b.student?.full_name ?? ''))
    return [...map.entries()].sort((a, b) => (b[1][0].generated_at ?? '').localeCompare(a[1][0].generated_at ?? ''))
  })()
  const ordered = sets.flatMap(([, list]) => list)
  const selected = issuing ? null : (ordered.find((c) => c.id === selectedId) ?? ordered[0] ?? null)

  const releasedCount = cards.filter((c) => c.is_published).length
  const setCount = new Set(cards.map((c) => `${c.title}|${c.class_id}`)).size
  const canIssue = catalogue.leadableClasses.length > 0

  /** Release every card in a set that is not out yet, one request each. */
  const releaseAll = async (key: string, list: ReportCardOut[]) => {
    setReleasing(key)
    try {
      for (const c of list.filter((x) => !x.is_published)) {
        await update.mutateAsync({ cardId: c.id, body: { is_published: true } })
      }
    } finally {
      setReleasing(null)
    }
  }

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title="Report Cards"
        description={
          scope.isAdmin
            ? 'Consolidated results for every class. Issue, read and release them on the class teacher’s behalf'
            : 'Consolidated results for the classes you lead, one card per student'
        }
        icon={FileBadge}
        actions={
          <>
            {canIssue && (
              <Button asChild variant="outline" size="sm">
                <Link to={scope.paperMarksPath}>
                  <ClipboardPen className="size-4" />
                  Offline exam marks
                </Link>
              </Button>
            )}
            <Button size="sm" icon={<Plus />} disabled={!canIssue || catalogue.isPending} onClick={() => setIssuing(true)}>
              Issue report cards
            </Button>
          </>
        }
      />

      <div className="!mt-0">
        <Figures>
          <Figure label="Report cards" value={cardsQuery.data ? String(cards.length) : '—'} context={`in ${setCount} set${setCount === 1 ? '' : 's'}`} tone="primary" />
          <Figure label="Released" value={cardsQuery.data ? String(releasedCount) : '—'} context="students can see them" tone="success" />
          <Figure
            label="Not released"
            value={cardsQuery.data ? String(cards.length - releasedCount) : '—'}
            context="waiting for you"
            alert={cards.length - releasedCount > 0}
            tone="warning"
          />
          <Figure label="Classes" value={cardsQuery.data ? String(classOptions.length) : '—'} context="with cards issued" tone="neutral" />
        </Figures>

        {!catalogue.isPending && !canIssue && !scope.isAdmin && (
          <Band className="border-b border-border bg-info/[0.05]">
            <p className="py-2.5 text-sm text-foreground">
              Report cards are issued by a class&rsquo;s class teacher, and you do not lead a class. Ask an administrator to assign you, or to issue them.
            </p>
          </Band>
        )}

        {warnings.length > 0 && (
          <Band className="border-b border-border bg-warning/[0.06]">
            <div className="flex items-start gap-3 py-2.5 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">Issued with notes</p>
                <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setWarnings([])}>
                Dismiss
              </Button>
            </div>
          </Band>
        )}

        <Band className="border-b border-border">
          {cardsQuery.isPending ? (
            <div className="grid gap-4 py-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
              <Skeleton className="h-80 w-full" />
              <Skeleton className="h-80 w-full" />
            </div>
          ) : cardsQuery.isError ? (
            <div className="py-6">
              <ErrorState error={cardsQuery.error} onRetry={() => cardsQuery.refetch()} />
            </div>
          ) : (
            <div className="grid lg:h-[calc(100vh-17rem)] lg:min-h-[30rem] lg:grid-cols-[22rem_minmax(0,1fr)] lg:divide-x lg:divide-border">
              {/* ------------------------------------------------- the list */}
              <div className="-mx-4 flex flex-col border-b border-border sm:-mx-6 lg:mx-0 lg:-ml-8 lg:min-h-0 lg:border-b-0">
                <div className="space-y-2 border-b border-border py-2.5 pl-4 pr-4 sm:pl-6 lg:pl-8">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students or titles" aria-label="Search report cards" className="h-8 py-1 pl-8 text-sm" />
                  </div>
                  <div className="flex gap-2">
                    {classOptions.length > 1 && (
                      <Combobox
                        value={classId ?? 'all'}
                        onChange={(v) => setClassId(v === 'all' ? null : v)}
                        options={[{ value: 'all', label: 'All classes' }, ...classOptions.map(([id, name]) => ({ value: String(id), label: name }))]}
                        searchPlaceholder="Search classes"
                        className="h-8 min-w-0 flex-1 text-xs"
                      />
                    )}
                    <div className="flex rounded-md border border-border p-0.5" role="radiogroup" aria-label="Release state">
                      {(
                        [
                          ['ALL', 'All'],
                          ['RELEASED', 'Released'],
                          ['DRAFT', 'Not yet'],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={published === value}
                          onClick={() => setPublished(value)}
                          className={cn('rounded px-2 py-0.5 text-xs transition-colors', published === value ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="max-h-96 flex-1 overflow-y-auto lg:max-h-none lg:min-h-0">
                  {cards.length === 0 ? (
                    <p className="px-6 py-12 text-center text-sm text-muted-foreground">
                      {canIssue ? 'No report cards yet. Issue the first set once results are in' : 'Report cards for the classes you lead appear here once issued'}
                    </p>
                  ) : sets.length === 0 ? (
                    <p className="px-6 py-12 text-center text-sm text-muted-foreground">Nothing matches</p>
                  ) : (
                    sets.map(([key, list]) => {
                      const first = list[0]
                      const released = list.filter((c) => c.is_published).length
                      const average = list.reduce((sum, c) => sum + withRowTotals(c).overall_percentage, 0) / list.length
                      return (
                        <section key={key}>
                          <div className="sticky top-0 z-10 border-b border-border bg-muted py-2 pl-4 pr-4 sm:pl-6 lg:pl-8">
                            <div className="flex items-center justify-between gap-2">
                              <p className="min-w-0 truncate text-xs font-medium text-foreground" title={first.title}>
                                {first.title}
                              </p>
                              {released < list.length && (
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  className="h-6 shrink-0 text-primary"
                                  loading={releasing === key}
                                  onClick={() => void releaseAll(key, list)}
                                >
                                  Release all
                                </Button>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {first.class_room?.name ?? ''} · {list.length} cards · average {formatPercent(average, 0)} · {released}/{list.length} released
                            </p>
                          </div>
                          <ul className="divide-y divide-border">
                            {list.map((c) => {
                              const active = selected?.id === c.id
                              const totals = withRowTotals(c)
                              return (
                                <li key={c.id}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedId(c.id)
                                      setIssuing(false)
                                    }}
                                    aria-current={active ? 'true' : undefined}
                                    className={cn('relative flex w-full items-center gap-3 py-2 pl-4 pr-4 text-left transition-colors sm:pl-6 lg:pl-8', active ? 'bg-primary/5' : 'hover:bg-muted/40')}
                                  >
                                    {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
                                    <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{c.rank ?? '—'}</span>
                                    <span className={cn('min-w-0 flex-1 truncate text-sm', active ? 'font-medium text-primary' : 'text-foreground')}>
                                      {tidy(c.student?.full_name ?? `Student #${String(c.student_id).slice(-6)}`)}
                                    </span>
                                    <span className="shrink-0 text-xs tabular-nums text-foreground">{formatPercent(totals.overall_percentage, 0)}</span>
                                    {totals.overall_grade && <span className="w-6 shrink-0 text-xs font-medium text-muted-foreground">{totals.overall_grade}</span>}
                                    <span className={cn('size-1.5 shrink-0 rounded-full', c.is_published ? 'bg-success' : 'bg-warning')} title={c.is_published ? 'Released' : 'Not released'} />
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        </section>
                      )
                    })
                  )}
                </div>
              </div>

              {/* ----------------------------------------- the card, or issuing */}
              <section className="min-w-0 py-5 lg:min-h-0 lg:overflow-y-auto lg:pl-8 lg:pr-1">
                {issuing ? (
                  <IssuePanel
                    onClose={() => setIssuing(false)}
                    onDone={(batch) => {
                      setWarnings(batch.warnings)
                      setIssuing(false)
                    }}
                  />
                ) : selected ? (
                  <CardPreview key={selected.id} card={selected} onDeleted={() => setSelectedId(null)} />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                    <FileBadge className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
                    <p className="mt-2 text-sm text-muted-foreground">{cards.length === 0 ? 'No report cards yet' : 'Pick a student to see their card'}</p>
                    {canIssue && cards.length === 0 && (
                      <Button size="sm" className="mt-4" icon={<Plus />} onClick={() => setIssuing(true)}>
                        Issue report cards
                      </Button>
                    )}
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
          <DialogDescription>The marks are a snapshot and cannot be edited here. Correct the marks (the exam script, or the offline exam marks) and re-issue the card instead.</DialogDescription>
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
        <p className="mb-4 flex items-center gap-2 border-l-2 border-warning bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
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

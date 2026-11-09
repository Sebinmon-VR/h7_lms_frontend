import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, ChevronRight, FileCheck2, ListChecks, Mail } from 'lucide-react'
import * as React from 'react'

import type { BulkBillingAction, BulkBillingResult, BulkBillingRow, FeeInvoiceOut } from '@/api/types'
import { useClasses, useEnrollments, useUsers } from '@/queries/admin.queries'
import { useBulkBillingJob, useFeeInvoices, useStartBulkBilling } from '@/queries/finance.queries'
import { cn } from '@/lib/cn'
import { countLabel } from '@/lib/format'
import { tidyName as tidy } from '@/lib/names'
import { formatMoney } from '@/lib/tuition'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { ProgressBar } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { FormError } from '@/components/forms/field'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { ListSearch } from '@/components/layout/split-view'

/**
 * Billing many students at once, as one class sheet.
 *
 * Choose what to bill along the top — their fees for the year, a fee held back
 * such as Term 2, or the same extra item for all. The sheet below has a row per
 * class: tick a class to tick every student in it who can take that bill, or
 * open it to tick students one by one. The same sheet then becomes the preview
 * (what each student would be billed, and who is skipped and why) and finally
 * the result, so the clerk never loses their place.
 *
 * Every student gets a numbered bill of their own, made by the same steps as
 * the fee counter, so nothing here can bill differently from the counter. The
 * preview bills nobody; ticking fees off after it re-totals on the spot. Both
 * the preview and the run happen in the background, with progress.
 */

const ACTIONS: { value: BulkBillingAction; label: string; hint: string }[] = [
  { value: 'ISSUE', label: 'Fees for the year', hint: 'The first bill, for students not billed yet' },
  { value: 'LATER', label: 'A fee held back', hint: 'Term 2 and the like, for students who have one waiting' },
  { value: 'EXTRA', label: 'An extra item', hint: 'The same item for everyone: annual day, books, a trip' },
]

const NO_CLASS = 'none'

function isIssued(account: FeeInvoiceOut | undefined) {
  return !!account && account.status !== 'DRAFT' && account.status !== 'CANCELLED'
}

/** Whether a student can take the chosen kind of bill at all, and if not, why. */
function eligibility(action: BulkBillingAction, account: FeeInvoiceOut | undefined): string | null {
  if (action === 'ISSUE') return isIssued(account) ? 'Already billed' : null
  if (!isIssued(account)) return 'Not billed for the year yet'
  if (action === 'LATER' && (account?.left_off ?? []).length === 0) return 'Nothing held back'
  return null
}

/** A preview row as the fees ticked now would bill it. */
function retotal(row: BulkBillingRow, action: BulkBillingAction, chosen: Record<string, boolean>) {
  if (row.outcome !== 'READY') return { ...row, lines: [] as BulkBillingRow['lines'], ready: false }
  const lines = action === 'EXTRA' ? row.lines : row.lines.filter((l) => chosen[l.label])
  const amount = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100
  return { ...row, lines, amount, ready: lines.length > 0 }
}

/** One student line of the sheet, whatever stage it is at. */
interface SheetStudent {
  id: number
  name: string
  admission?: string | null
  status: React.ReactNode
  amount: number | null
  /** Can be ticked (stage one) / will be or was billed (later stages). */
  good: boolean
}

interface SheetClass {
  key: string
  name: string
  students: SheetStudent[]
}

function Steps({ step }: { step: 1 | 2 | 3 }) {
  const items = ['Tick', 'Preview', 'Issued']
  return (
    <ol className="flex items-center gap-1.5 text-xs" aria-label="Steps">
      {items.map((label, i) => {
        const n = i + 1
        const done = n < step
        const now = n === step
        return (
          <li key={label} className="flex items-center gap-1.5">
            {i > 0 && <span className="h-px w-4 bg-border" aria-hidden />}
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-full border text-[10px] font-medium',
                done && 'border-success bg-success text-white',
                now && 'border-primary bg-primary text-primary-foreground',
                !done && !now && 'border-border text-muted-foreground',
              )}
            >
              {done ? <Check className="size-3" /> : n}
            </span>
            <span className={cn(now ? 'font-medium text-foreground' : 'text-muted-foreground')}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function JobProgress({ percent, message }: { percent: number; message?: string | null }) {
  return (
    <div className="mx-auto max-w-md space-y-2 px-5 py-16 text-center">
      <ProgressBar value={percent} />
      <p className="text-sm text-muted-foreground">{message ?? 'Working…'}</p>
    </div>
  )
}

export function FinanceBulkTab({ academicYearId }: { academicYearId: number | null }) {
  const qc = useQueryClient()
  const students = useUsers('STUDENT')
  const enrollments = useEnrollments()
  const classes = useClasses()
  const invoices = useFeeInvoices({ academicYearId: academicYearId ?? undefined }, academicYearId != null)
  const start = useStartBulkBilling()

  const [action, setAction] = React.useState<BulkBillingAction>('ISSUE')
  const [search, setSearch] = React.useState('')
  const [showAll, setShowAll] = React.useState(false)
  const [open, setOpen] = React.useState<Set<string>>(new Set())
  const [picked, setPicked] = React.useState<Record<number, boolean>>({})
  const [itemName, setItemName] = React.useState('')
  const [itemAmount, setItemAmount] = React.useState('')
  const [itemDue, setItemDue] = React.useState<string | null>(null)
  const [email, setEmail] = React.useState(false)
  const [chosen, setChosen] = React.useState<Record<string, boolean>>({})
  const [previewId, setPreviewId] = React.useState<string | null>(null)
  const [runId, setRunId] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const preview = useBulkBillingJob(previewId)
  const run = useBulkBillingJob(runId)

  // ------------------------------------------------------------ who
  const classOf = React.useMemo(() => {
    const map = new Map<number, { id: number; name: string }>()
    for (const e of enrollments.data ?? []) map.set(e.student.id, { id: e.class_room.id, name: e.class_room.name })
    return map
  }, [enrollments.data])
  const accountOf = React.useMemo(
    () => new Map((invoices.data ?? []).filter((i) => i.status !== 'CANCELLED').map((i) => [i.student_id, i])),
    [invoices.data],
  )
  const active = React.useMemo(() => (students.data ?? []).filter((s) => s.is_active), [students.data])
  const keyOf = (studentId: number) => {
    const c = classOf.get(studentId)
    return c ? String(c.id) : NO_CLASS
  }
  const nameOfKey = (key: string) =>
    key === NO_CLASS ? 'No class' : (classes.data ?? []).find((c) => String(c.id) === key)?.name ?? [...classOf.values()].find((c) => String(c.id) === key)?.name ?? 'Class'
  const sortClasses = (a: SheetClass, b: SheetClass) =>
    a.key === NO_CLASS ? 1 : b.key === NO_CLASS ? -1 : a.name.localeCompare(b.name, undefined, { numeric: true })
  const countFor = (a: BulkBillingAction) => active.filter((s) => eligibility(a, accountOf.get(s.id)) == null).length

  const selected = Object.keys(picked).filter((id) => picked[Number(id)]).map(Number)

  // A different choice of students or of what to bill makes the preview stale.
  const previewKey = JSON.stringify([action, [...selected].sort(), itemName, itemAmount, itemDue, academicYearId])
  React.useEffect(() => {
    setPreviewId(null)
    setError(null)
  }, [previewKey])
  // Who can take one kind of bill usually cannot take another: start the ticks afresh.
  React.useEffect(() => {
    setPicked({})
  }, [action])

  const previewData: BulkBillingResult | null = preview.data?.status === 'SUCCEEDED' ? (preview.data.result ?? null) : null
  React.useEffect(() => {
    if (previewData) setChosen(Object.fromEntries(previewData.labels.map((l) => [l, true])))
  }, [previewData])

  const rows = (previewData?.rows ?? []).map((r) => retotal(r, action, chosen))
  const ready = rows.filter((r) => r.ready)
  const readyTotal = Math.round(ready.reduce((s, r) => s + r.amount, 0) * 100) / 100
  const currency = invoices.data?.[0]?.currency ?? 'INR'
  const chosenLabels = Object.keys(chosen).filter((l) => chosen[l])
  const itemEach = action === 'EXTRA' && Number(itemAmount) > 0 ? Number(itemAmount) : null

  const runData: BulkBillingResult | null = run.data?.status === 'SUCCEEDED' ? (run.data.result ?? null) : null
  React.useEffect(() => {
    // New bills change the register, the counter and the reports.
    if (runData) qc.invalidateQueries({ queryKey: ['finance'] })
  }, [runData, qc])

  const stage: 1 | 2 | 3 = runId ? 3 : previewId ? 2 : 1
  const locked = stage > 1

  // Later stages are a review: show every class opened.
  React.useEffect(() => {
    if (stage > 1) setOpen(new Set(['*']))
    else setOpen(new Set())
  }, [stage])

  // ------------------------------------------------------------ the sheet's rows, by stage
  const term = search.trim().toLowerCase()
  const matches = (name: string, adm?: string | null) => !term || [name, adm].some((v) => (v ?? '').toLowerCase().includes(term))

  const sheet: SheetClass[] = React.useMemo(() => {
    const groups = new Map<string, SheetClass>()
    const put = (key: string, student: SheetStudent) => {
      if (!groups.has(key)) groups.set(key, { key, name: nameOfKey(key), students: [] })
      groups.get(key)!.students.push(student)
    }
    if (stage === 1) {
      for (const s of active) {
        if (!matches(s.full_name, s.admission_number)) continue
        const account = accountOf.get(s.id)
        const why = eligibility(action, account)
        if (why && !showAll) continue
        const held = account?.left_off ?? []
        put(keyOf(s.id), {
          id: s.id,
          name: s.full_name,
          admission: s.admission_number,
          good: why == null,
          amount: why == null && picked[s.id] ? itemEach : null,
          status: why ? (
            <span className="text-muted-foreground">{why}</span>
          ) : action === 'LATER' ? (
            <span className="text-warning">Held back: {held.join(', ')}</span>
          ) : isIssued(account) ? (
            <span className="text-muted-foreground">Billed · {account?.invoice_number}</span>
          ) : (
            <span className="text-muted-foreground">Not billed yet</span>
          ),
        })
      }
      // Classes nobody in them can take this bill still show, unless searching.
      if (!term) for (const c of classes.data ?? []) if (!groups.has(String(c.id)) && showAll) groups.set(String(c.id), { key: String(c.id), name: c.name, students: [] })
    } else if (stage === 2) {
      for (const r of rows) {
        if (!matches(r.student_name ?? '', r.admission_number)) continue
        put(keyOf(r.student_id), {
          id: r.student_id,
          name: r.student_name ?? `Student ${r.student_id}`,
          admission: r.admission_number,
          good: r.ready,
          amount: r.ready ? r.amount : null,
          status: r.ready ? (
            <span className="text-foreground">{r.lines.map((l) => `${l.label} ${formatMoney(l.amount, currency)}`).join(' · ')}</span>
          ) : (
            <span className="text-warning">Skipped: {r.detail ?? 'none of the chosen fees apply'}</span>
          ),
        })
      }
    } else if (runData) {
      for (const r of runData.rows) {
        if (!matches(r.student_name ?? '', r.admission_number)) continue
        put(keyOf(r.student_id), {
          id: r.student_id,
          name: r.student_name ?? `Student ${r.student_id}`,
          admission: r.admission_number,
          good: r.outcome === 'BILLED',
          amount: r.outcome === 'BILLED' ? r.amount : null,
          status:
            r.outcome === 'BILLED' ? (
              <span className="text-success">
                Billed · {r.bill_number}
                {r.emailed.length > 0 ? ' · emailed' : ''}
              </span>
            ) : (
              <span className={r.outcome === 'FAILED' ? 'text-danger' : 'text-muted-foreground'}>
                {r.outcome === 'FAILED' ? 'Not billed: ' : 'Skipped: '}
                {r.detail}
              </span>
            ),
        })
      }
    }
    const out = [...groups.values()]
    for (const g of out) g.students.sort((a, b) => Number(b.good) - Number(a.good) || a.name.localeCompare(b.name))
    return out.sort(sortClasses)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, active, accountOf, action, showAll, term, picked, itemEach, rows, runData, classes.data, classOf, currency])

  const isOpen = (key: string) => open.has('*') || open.has(key) || (term !== '' && stage === 1)
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev.has('*') ? sheet.map((c) => c.key) : prev)
      next.delete('*')
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const allOpen = open.has('*') || (sheet.length > 0 && sheet.every((c) => open.has(c.key)))
  const tick = (ids: number[], on: boolean) => setPicked((p) => ({ ...p, ...Object.fromEntries(ids.map((id) => [id, on])) }))
  const eligibleIds = sheet.flatMap((c) => c.students.filter((s) => s.good).map((s) => s.id))
  const allTicked = eligibleIds.length > 0 && eligibleIds.every((id) => picked[id])
  const someTicked = eligibleIds.some((id) => picked[id])

  // ------------------------------------------------------------ actions
  const extraItems = () => {
    const amount = Number(itemAmount)
    return action === 'EXTRA' ? [{ name: itemName.trim(), amount, due_date: itemDue }] : []
  }

  const startPreview = async () => {
    if (academicYearId == null) return setError('Choose the session year first.')
    if (selected.length === 0) return setError('Tick the students to bill.')
    if (action === 'EXTRA' && (!itemName.trim() || !(Number(itemAmount) > 0))) return setError('Type the item and its amount above.')
    setError(null)
    setRunId(null)
    try {
      const job = await start.mutateAsync({
        academic_year_id: academicYearId,
        student_ids: selected,
        action,
        extra_items: extraItems(),
        dry_run: true,
      })
      setPreviewId(job.job_id)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'The preview could not be started.')
    }
  }

  const startRun = async () => {
    if (academicYearId == null) return
    setConfirming(false)
    setError(null)
    try {
      const job = await start.mutateAsync({
        academic_year_id: academicYearId,
        student_ids: ready.map((r) => r.student_id),
        action,
        labels: action === 'EXTRA' ? [] : chosenLabels,
        extra_items: extraItems(),
        email,
        dry_run: false,
      })
      setRunId(job.job_id)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Billing could not be started.')
    }
  }

  const startOver = () => {
    setRunId(null)
    setPreviewId(null)
    setPicked({})
  }

  // The bills query waits for a session year; until then it is not loading, just idle.
  const loading = students.isPending || enrollments.isPending || (academicYearId != null && invoices.isPending)
  const previewing = !!previewId && !previewData && preview.data?.status !== 'FAILED' && !preview.isError
  const running = !!runId && !runData && run.data?.status !== 'FAILED' && !run.isError
  const waiting = (stage === 2 && previewing) || (stage === 3 && running)
  const jobError =
    stage === 2
      ? preview.data?.status === 'FAILED'
        ? preview.data.error
        : preview.isError
          ? 'The preview was lost (the server may have restarted). Go back and run it again.'
          : null
      : stage === 3
        ? run.data?.status === 'FAILED'
          ? run.data.error
          : run.isError
            ? 'Lost track of the run (the server may have restarted). Check Bills before running it again.'
            : null
        : null

  // ------------------------------------------------------------ the sheet
  const amountHead = stage === 1 ? (action === 'EXTRA' ? 'Amount' : 'Amount after preview') : stage === 2 ? 'Will bill' : 'Billed'
  const table = (
    <table className="w-full min-w-[680px] text-sm">
      <thead className="sticky top-0 z-[1]">
        <tr className="border-b border-border bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
          <th className="w-10 py-2 pl-4 pr-1">
            {stage === 1 && (
              <Checkbox
                aria-label="Tick every student who can take this bill"
                checked={allTicked ? true : someTicked ? 'indeterminate' : false}
                disabled={eligibleIds.length === 0}
                onCheckedChange={(v) => tick(eligibleIds, v === true)}
              />
            )}
          </th>
          <th className="px-2 py-2 font-medium">
            <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-foreground" onClick={() => setOpen(allOpen ? new Set() : new Set(['*']))}>
              Class / student
              <span className="normal-case text-primary">· {allOpen ? 'fold all' : 'open all'}</span>
            </button>
          </th>
          <th className="w-24 px-3 py-2 text-right font-medium">Students</th>
          <th className="px-3 py-2 font-medium">{stage === 1 ? 'This session' : stage === 2 ? 'Will be billed' : 'Outcome'}</th>
          <th className="w-32 py-2 pl-3 pr-4 text-right font-medium">{amountHead}</th>
        </tr>
      </thead>
      <tbody>
        {sheet.length === 0 && (
          <tr>
            <td colSpan={5} className="px-4 py-14 text-center text-sm text-muted-foreground">
              {term ? 'No student matches' : stage === 1 ? 'Nobody can take this bill right now. Choose another kind of bill above' : 'Nothing to show'}
            </td>
          </tr>
        )}
        {sheet.map((c) => {
          const good = c.students.filter((s) => s.good)
          const tickedHere = good.filter((s) => picked[s.id]).length
          const state = good.length > 0 && tickedHere === good.length ? true : tickedHere > 0 ? 'indeterminate' : false
          const amount = c.students.reduce((n, s) => n + (s.amount ?? 0), 0)
          const expanded = isOpen(c.key)
          return (
            <React.Fragment key={c.key}>
              <tr className={cn('border-b border-border bg-muted/20', stage === 1 && tickedHere > 0 && 'bg-primary/[0.04]')}>
                <td className="py-2 pl-4 pr-1">
                  {stage === 1 && (
                    <Checkbox
                      aria-label={`Tick ${c.name}`}
                      checked={state}
                      disabled={good.length === 0}
                      onCheckedChange={(v) => tick(good.map((s) => s.id), v === true)}
                    />
                  )}
                </td>
                <td className="px-2 py-2">
                  <button type="button" onClick={() => toggle(c.key)} aria-expanded={expanded} className="flex items-center gap-1.5 text-left font-medium text-foreground">
                    <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
                    {tidy(c.name)}
                  </button>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{c.students.length}</td>
                <td className="px-3 py-2 text-xs">
                  {stage === 1 ? (
                    tickedHere > 0 ? (
                      <span className="font-medium text-primary">
                        {tickedHere} of {good.length} ticked
                      </span>
                    ) : (
                      <span className={good.length ? 'text-foreground' : 'text-muted-foreground'}>
                        {good.length ? `${good.length} can be billed` : 'None can be billed'}
                      </span>
                    )
                  ) : (
                    <span>
                      <span className={stage === 3 ? 'text-success' : 'text-foreground'}>
                        {countLabel(good.length, 'bill')}
                      </span>
                      {c.students.length - good.length > 0 && <span className="text-muted-foreground"> · {c.students.length - good.length} skipped</span>}
                    </span>
                  )}
                </td>
                <td className="py-2 pl-3 pr-4 text-right font-medium tabular-nums">{amount > 0 ? formatMoney(amount, currency) : '—'}</td>
              </tr>
              {expanded &&
                c.students.map((s) => (
                  <tr
                    key={s.id}
                    className={cn(
                      'border-b border-border/70',
                      stage === 1 && s.good && 'cursor-pointer hover:bg-muted/30',
                      stage === 1 && picked[s.id] && 'bg-primary/[0.03]',
                      !s.good && 'text-muted-foreground',
                    )}
                    onClick={stage === 1 && s.good ? () => setPicked((p) => ({ ...p, [s.id]: !p[s.id] })) : undefined}
                  >
                    <td className="py-1.5 pl-4 pr-1" />
                    <td className="py-1.5 pl-9 pr-2" onClick={(e) => stage === 1 && e.stopPropagation()}>
                      <span className="flex items-center gap-2.5">
                        {stage === 1 && (
                          <Checkbox
                            aria-label={`Tick ${s.name}`}
                            checked={!!picked[s.id]}
                            disabled={!s.good}
                            onCheckedChange={(v) => setPicked((p) => ({ ...p, [s.id]: v === true }))}
                          />
                        )}
                        <span className={cn(s.good && 'text-foreground')}>{tidy(s.name)}</span>
                        {s.admission && <span className="text-xs text-muted-foreground">{s.admission}</span>}
                      </span>
                    </td>
                    <td />
                    <td className="px-3 py-1.5 text-xs">{s.status}</td>
                    <td className="py-1.5 pl-3 pr-4 text-right tabular-nums">{s.amount != null ? formatMoney(s.amount, currency) : '—'}</td>
                  </tr>
                ))}
            </React.Fragment>
          )
        })}
      </tbody>
    </table>
  )

  // ------------------------------------------------------------ the bar at the bottom
  let bar: React.ReactNode
  if (stage === 1) {
    bar = (
      <>
        <div className="mr-auto flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span>
            <span className="font-semibold tabular-nums">{selected.length}</span>
            <span className="text-muted-foreground"> {selected.length === 1 ? 'student' : 'students'} ticked</span>
            {itemEach != null && selected.length > 0 && (
              <span className="text-muted-foreground"> · {formatMoney(itemEach * selected.length, currency)}</span>
            )}
          </span>
          {selected.length > 0 && (
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setPicked({})}>
              Clear
            </button>
          )}
          <FormError message={error} />
        </div>
        <Button icon={<ListChecks />} onClick={startPreview} loading={start.isPending} disabled={selected.length === 0}>
          Preview {selected.length > 0 ? countLabel(selected.length, 'bill') : 'bills'}
        </Button>
      </>
    )
  } else if (stage === 2) {
    bar = (
      <>
        <Button variant="ghost" size="sm" icon={<ArrowLeft />} onClick={() => setPreviewId(null)} disabled={start.isPending}>
          Change
        </Button>
        <div className="mr-auto min-w-0 text-sm">
          {previewData && (
            <>
              <span className="font-semibold">
                {countLabel(ready.length, 'bill')} · {formatMoney(readyTotal, currency)}
              </span>
              {rows.length - ready.length > 0 && <span className="text-muted-foreground"> · {rows.length - ready.length} skipped</span>}
            </>
          )}
          <FormError message={error} />
        </div>
        {previewData && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={email} onCheckedChange={(v) => setEmail(v === true)} />
            <Mail className="size-3.5 text-muted-foreground" />
            Email families
            {email && !previewData.summary.mail_configured && <span className="text-xs text-warning">(email is not set up)</span>}
          </label>
        )}
        <Button icon={<FileCheck2 />} onClick={() => setConfirming(true)} disabled={!previewData || ready.length === 0}>
          Issue {countLabel(ready.length, 'bill')}
        </Button>
      </>
    )
  } else {
    bar = (
      <>
        <p className="mr-auto text-sm">
          {runData ? (
            <>
              <span className="font-semibold text-success">
                {runData.summary.counts.BILLED ?? 0} billed · {formatMoney(runData.summary.amount, currency)}
              </span>
              {(runData.summary.counts.SKIPPED ?? 0) > 0 && <span className="text-muted-foreground"> · {runData.summary.counts.SKIPPED} skipped</span>}
              {(runData.summary.counts.FAILED ?? 0) > 0 && <span className="text-danger"> · {runData.summary.counts.FAILED} could not be billed</span>}
              {email && <span className="text-muted-foreground"> · {runData.summary.emailed} emailed</span>}
            </>
          ) : (
            <span className="text-muted-foreground">Billing in the background…</span>
          )}
        </p>
        <Button variant="outline" onClick={startOver} disabled={running}>
          Bill more students
        </Button>
      </>
    )
  }

  return (
    <div className="flex flex-col lg:h-full">
      {/* ------------------------------------------------- what to bill */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2.5">
        <span className="text-xs font-medium text-muted-foreground">Bill</span>
        <div className="flex flex-wrap rounded-md border border-border p-0.5" role="radiogroup" aria-label="What to bill">
          {ACTIONS.map((a) => (
            <button
              key={a.value}
              type="button"
              role="radio"
              aria-checked={action === a.value}
              disabled={locked}
              title={a.hint}
              onClick={() => setAction(a.value)}
              className={cn(
                'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed',
                action === a.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground disabled:opacity-50',
              )}
            >
              {a.label}
              {!loading && <span className={cn('tabular-nums', action === a.value ? 'text-primary-foreground/80' : 'text-muted-foreground/80')}>{countFor(a.value)}</span>}
            </button>
          ))}
        </div>
        {action === 'EXTRA' && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Item: annual day, books…"
              aria-label="Item"
              value={itemName}
              disabled={locked}
              onChange={(e) => setItemName(e.target.value)}
              className="h-8 w-52 px-2.5 text-sm"
            />
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="Each"
              aria-label="Amount for each student"
              value={itemAmount}
              disabled={locked}
              onChange={(e) => setItemAmount(e.target.value)}
              className="h-8 w-28 px-2.5 text-right text-sm tabular-nums"
            />
            <DatePicker value={itemDue} onChange={setItemDue} disabled={locked} placeholder="Pay by (optional)" className="h-8 w-44 px-2.5 text-sm" />
          </div>
        )}
        <div className="ml-auto">
          <Steps step={stage} />
        </div>
      </div>

      {/* ------------------------------------------------- find, and the fees chosen after the preview */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2">
        <div className="w-full max-w-xs">
          <ListSearch value={search} onChange={setSearch} placeholder="Find a student" />
        </div>
        {stage === 1 && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={showAll} onCheckedChange={(v) => setShowAll(v === true)} />
            Also show students who can&rsquo;t take this bill
          </label>
        )}
        {stage === 2 && previewData && action !== 'EXTRA' && previewData.labels.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">{action === 'ISSUE' ? 'Fees on the bill' : 'Held-back fees to bill'}</span>
            {previewData.labels.map((label) => (
              <label key={label} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <Checkbox checked={!!chosen[label]} onCheckedChange={(v) => setChosen((c) => ({ ...c, [label]: v === true }))} />
                {label}
              </label>
            ))}
            {action === 'ISSUE' && <span className="text-[11px] text-muted-foreground">Unticked fees are held back for later</span>}
          </div>
        )}
      </div>

      <div className="max-h-[34rem] overflow-auto lg:max-h-none lg:min-h-0 lg:flex-1">
        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : waiting ? (
          <JobProgress percent={(stage === 2 ? preview.data?.percent : run.data?.percent) ?? 0} message={stage === 2 ? preview.data?.message : run.data?.message} />
        ) : jobError ? (
          <p className="px-5 py-12 text-center text-sm text-danger">{jobError}</p>
        ) : (
          table
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border bg-card px-4 py-2.5">{bar}</div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Issue ${countLabel(ready.length, 'bill')}?`}
        description={`${formatMoney(readyTotal, currency)} in all. Each student gets a numbered bill of their own and sees it on their Fees page${email ? ', and each family is emailed' : ''}.`}
        confirmLabel="Issue bills"
        loading={start.isPending}
        onConfirm={startRun}
      />
    </div>
  )
}

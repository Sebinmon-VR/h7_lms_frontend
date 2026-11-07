import { useQueryClient } from '@tanstack/react-query'
import { FileCheck2, ListChecks, Search } from 'lucide-react'
import * as React from 'react'

import type { BulkBillingAction, BulkBillingResult, BulkBillingRow, FeeInvoiceOut } from '@/api/types'
import { useClasses, useEnrollments, useUsers } from '@/queries/admin.queries'
import { useBulkBillingJob, useFeeInvoices, useStartBulkBilling } from '@/queries/finance.queries'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { ProgressBar } from '@/components/ui/progress'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { Field, FormError } from '@/components/forms/field'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'

/**
 * Billing many students at once: tick the students (a whole class in one
 * click), say what to bill — their fees for the year, a fee held back such as
 * Term 2, or the same extra item for all — preview it, then issue. Every
 * student gets a numbered bill of their own, made by the same steps as the fee
 * counter, so nothing here can bill differently from the counter.
 *
 * The preview bills nobody: it says what each student would be billed and who
 * would be skipped and why. Ticking fees off after the preview re-totals it on
 * the spot. Both the preview and the run happen in the background, with
 * progress, because a whole school takes a little while.
 */

const ACTIONS: { value: BulkBillingAction; label: string }[] = [
  { value: 'ISSUE', label: 'Fees for the year' },
  { value: 'LATER', label: 'A fee held back' },
  { value: 'EXTRA', label: 'An extra item' },
]

const ACTION_HINT: Record<BulkBillingAction, string> = {
  ISSUE: 'For students not billed yet. Choose which fees go on after the preview; the rest are held back.',
  LATER: 'For students who have fees held back, such as Term 2. Each gets a new bill.',
  EXTRA: 'The same item for every student, such as Annual day or Books, as a new bill. Students must be billed for the year first.',
}

type Show = 'ALL' | 'NOT_BILLED' | 'BILLED' | 'HELD'
const SHOW_FOR: Record<BulkBillingAction, Show> = { ISSUE: 'NOT_BILLED', LATER: 'HELD', EXTRA: 'BILLED' }

function SheetStrip({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-y border-border bg-muted/70 px-4 py-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}

const head = 'border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground'

function isIssued(account: FeeInvoiceOut | undefined) {
  return !!account && account.status !== 'DRAFT' && account.status !== 'CANCELLED'
}

/** A preview row as the fees ticked now would bill it. */
function retotal(row: BulkBillingRow, action: BulkBillingAction, chosen: Record<string, boolean>) {
  if (row.outcome !== 'READY') return { ...row, lines: [] as BulkBillingRow['lines'], ready: false }
  const lines = action === 'EXTRA' ? row.lines : row.lines.filter((l) => chosen[l.label])
  const amount = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100
  return { ...row, lines, amount, ready: lines.length > 0 }
}

function JobProgress({ percent, message }: { percent: number; message?: string | null }) {
  return (
    <div className="space-y-1.5 px-4 py-4">
      <ProgressBar value={percent} />
      <p className="text-xs text-muted-foreground">{message ?? 'Working…'}</p>
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
  const [classId, setClassId] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [show, setShow] = React.useState<Show>('NOT_BILLED')
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
  const term = search.trim().toLowerCase()
  const shown = React.useMemo(
    () =>
      (students.data ?? [])
        .filter((s) => s.is_active)
        .filter((s) => !classId || String(classOf.get(s.id)?.id ?? '') === classId)
        .filter((s) => !term || [s.full_name, s.admission_number].some((v) => (v ?? '').toLowerCase().includes(term)))
        .filter((s) => {
          const account = accountOf.get(s.id)
          if (show === 'NOT_BILLED') return !isIssued(account)
          if (show === 'BILLED') return isIssued(account)
          if (show === 'HELD') return isIssued(account) && (account?.left_off ?? []).length > 0
          return true
        })
        .sort(
          (a, b) =>
            (classOf.get(a.id)?.name ?? '~').localeCompare(classOf.get(b.id)?.name ?? '~') ||
            a.full_name.localeCompare(b.full_name),
        ),
    [students.data, classId, classOf, term, accountOf, show],
  )
  const selected = Object.keys(picked).filter((id) => picked[Number(id)]).map(Number)
  const allShownPicked = shown.length > 0 && shown.every((s) => picked[s.id])

  // A different choice of students or of what to bill makes the preview stale.
  const previewKey = JSON.stringify([action, [...selected].sort(), itemName, itemAmount, itemDue, academicYearId])
  React.useEffect(() => {
    setPreviewId(null)
    setError(null)
  }, [previewKey])
  React.useEffect(() => {
    setShow(SHOW_FOR[action])
  }, [action])

  const previewData: BulkBillingResult | null =
    preview.data?.status === 'SUCCEEDED' ? (preview.data.result ?? null) : null
  React.useEffect(() => {
    if (previewData) setChosen(Object.fromEntries(previewData.labels.map((l) => [l, true])))
  }, [previewData])

  const rows = (previewData?.rows ?? []).map((r) => retotal(r, action, chosen))
  const ready = rows.filter((r) => r.ready)
  const readyTotal = Math.round(ready.reduce((s, r) => s + r.amount, 0) * 100) / 100
  const currency = invoices.data?.[0]?.currency ?? 'INR'
  const chosenLabels = Object.keys(chosen).filter((l) => chosen[l])

  const runData: BulkBillingResult | null = run.data?.status === 'SUCCEEDED' ? (run.data.result ?? null) : null
  React.useEffect(() => {
    // New bills change the register, the counter and the reports.
    if (runData) qc.invalidateQueries({ queryKey: ['finance'] })
  }, [runData, qc])

  const extraItems = () => {
    const amount = Number(itemAmount)
    return action === 'EXTRA' ? [{ name: itemName.trim(), amount, due_date: itemDue }] : []
  }

  const startPreview = async () => {
    if (academicYearId == null) return setError('Choose the session year first.')
    if (selected.length === 0) return setError('Tick the students to bill.')
    if (action === 'EXTRA' && (!itemName.trim() || !(Number(itemAmount) > 0))) {
      return setError('Type the item name and its amount.')
    }
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

  return (
    <div>
      {/* ------------------------------------------------- what */}
      <SheetStrip title="1 · What to bill" />
      <div className="space-y-3 px-4 py-4">
        <Segmented layoutId="bulk-action" value={action} onChange={setAction} options={ACTIONS} />
        <p className="text-xs text-muted-foreground">{ACTION_HINT[action]}</p>
        {action === 'EXTRA' && (
          <div className="flex flex-wrap items-end gap-3">
            <Field id="bulk-item" label="Item" className="min-w-[220px] flex-1">
              <Input
                id="bulk-item"
                placeholder="e.g. Annual day, Books, Trip"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
              />
            </Field>
            <Field id="bulk-amount" label="Amount for each student" className="w-48">
              <Input
                id="bulk-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                className="text-right tabular-nums"
                value={itemAmount}
                onChange={(e) => setItemAmount(e.target.value)}
              />
            </Field>
            <Field id="bulk-due" label="Pay by (optional)" className="w-48">
              <DatePicker value={itemDue} onChange={setItemDue} />
            </Field>
          </div>
        )}
      </div>

      {/* ------------------------------------------------- who */}
      <SheetStrip title={`2 · Students${selected.length ? ` · ${selected.length} ticked` : ''}`}>
        {selected.length > 0 && (
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => setPicked({})}>
            Clear
          </button>
        )}
      </SheetStrip>
      <div className="flex flex-wrap items-end gap-3 px-4 py-3">
        <div className="min-w-48">
          <Combobox
            value={classId}
            onChange={(v) => setClassId(v ?? '')}
            options={[
              { value: '', label: 'Every class' },
              ...(classes.data ?? []).map((c) => ({ value: String(c.id), label: c.name, hint: c.code })),
            ]}
            placeholder="Every class"
          />
        </div>
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name or admission number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Segmented
          layoutId="bulk-show"
          value={show}
          onChange={setShow}
          options={[
            { value: 'ALL', label: 'Everyone' },
            { value: 'NOT_BILLED', label: 'Not billed' },
            { value: 'BILLED', label: 'Billed' },
            { value: 'HELD', label: 'Fees held back' },
          ]}
        />
      </div>
      {loading ? (
        <div className="space-y-2 px-4 pb-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <div className="max-h-[420px] overflow-auto border-t border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className={head}>
                <th className="w-10 px-3 py-2">
                  <Checkbox
                    aria-label="Tick every student shown"
                    checked={allShownPicked}
                    onCheckedChange={(v) =>
                      setPicked((p) => ({ ...p, ...Object.fromEntries(shown.map((s) => [s.id, v === true])) }))
                    }
                  />
                </th>
                <th className="px-3 py-2 font-medium">Student</th>
                <th className="px-3 py-2 font-medium">Class</th>
                <th className="px-3 py-2 font-medium">This year</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No student matches. Change the class, the search or the filter above.
                  </td>
                </tr>
              ) : (
                shown.map((s) => {
                  const account = accountOf.get(s.id)
                  const issued = isIssued(account)
                  const bills = (account?.bills ?? []).filter((b) => b.status !== 'CANCELLED').length
                  const held = account?.left_off ?? []
                  return (
                    <tr
                      key={s.id}
                      className={cn('cursor-pointer border-b border-border', picked[s.id] && 'bg-primary/5')}
                      onClick={() => setPicked((p) => ({ ...p, [s.id]: !p[s.id] }))}
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Tick ${s.full_name}`}
                          checked={!!picked[s.id]}
                          onCheckedChange={(v) => setPicked((p) => ({ ...p, [s.id]: v === true }))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{s.full_name}</span>
                        {s.admission_number && (
                          <span className="ml-2 text-xs text-muted-foreground">{s.admission_number}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm">{classOf.get(s.id)?.name ?? '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {issued ? (
                            <Badge tone="success" size="sm">
                              Billed · {account?.invoice_number}
                              {bills > 1 ? ` + ${bills - 1} more` : ''}
                            </Badge>
                          ) : (
                            <Badge tone="neutral" size="sm">
                              Not billed
                            </Badge>
                          )}
                          {held.length > 0 && (
                            <Badge tone="warning" size="sm">
                              Held back: {held.join(', ')}
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        <FormError message={error} />
        <Button
          className="ml-auto"
          onClick={startPreview}
          loading={start.isPending && !previewId && !runId}
          disabled={selected.length === 0 || previewing || running}
        >
          <ListChecks />
          Preview {selected.length > 0 ? `${selected.length} student${selected.length === 1 ? '' : 's'}` : ''}
        </Button>
      </div>

      {/* ------------------------------------------------- preview */}
      {(previewId || runId) && <SheetStrip title={runId ? '4 · Result' : '3 · Preview'} />}
      {previewing && <JobProgress percent={preview.data?.percent ?? 0} message={preview.data?.message} />}
      {preview.data?.status === 'FAILED' && <p className="px-4 py-3 text-sm text-danger">{preview.data.error}</p>}
      {preview.isError && (
        <p className="px-4 py-3 text-sm text-danger">The preview was lost (the server may have restarted). Run it again.</p>
      )}

      {previewData && !runId && (
        <>
          {action !== 'EXTRA' && previewData.labels.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
              <span className="text-xs font-medium text-muted-foreground">
                {action === 'ISSUE' ? 'Fees to put on the bill:' : 'Held-back fees to bill:'}
              </span>
              {previewData.labels.map((label) => (
                <label key={label} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={!!chosen[label]}
                    onCheckedChange={(v) => setChosen((c) => ({ ...c, [label]: v === true }))}
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
          <div className="max-h-[420px] overflow-auto border-t border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className={head}>
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Class</th>
                  <th className="px-3 py-2 font-medium">Will be billed</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.student_id} className={cn('border-b border-border', !r.ready && 'text-muted-foreground')}>
                    <td className="px-3 py-2">
                      <span className="font-medium text-foreground">{r.student_name}</span>
                      {r.admission_number && <span className="ml-2 text-xs">{r.admission_number}</span>}
                    </td>
                    <td className="px-3 py-2">{classOf.get(r.student_id)?.name ?? r.class_name ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.ready
                        ? r.lines.map((l) => `${l.label} ${formatMoney(l.amount, currency)}`).join(' · ')
                        : `Skipped: ${r.detail ?? 'none of the chosen fees apply to this student.'}`}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {r.ready ? formatMoney(r.amount, currency) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-3">
            <div className="text-sm">
              <span className="font-semibold">
                {ready.length} bill{ready.length === 1 ? '' : 's'} · {formatMoney(readyTotal, currency)}
              </span>
              {rows.length - ready.length > 0 && (
                <span className="text-muted-foreground"> · {rows.length - ready.length} skipped</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={email} onCheckedChange={(v) => setEmail(v === true)} />
                Email each family their bill
              </label>
              {email && !previewData.summary.mail_configured && (
                <span className="text-xs text-warning">Email is not set up, so nothing will be sent.</span>
              )}
              <Button size="lg" onClick={() => setConfirming(true)} disabled={ready.length === 0}>
                <FileCheck2 />
                Issue {ready.length} bill{ready.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ------------------------------------------------- result */}
      {running && <JobProgress percent={run.data?.percent ?? 0} message={run.data?.message} />}
      {run.data?.status === 'FAILED' && <p className="px-4 py-3 text-sm text-danger">{run.data.error}</p>}
      {run.isError && (
        <p className="px-4 py-3 text-sm text-danger">
          Lost track of the run (the server may have restarted). Check the bills register before running it again.
        </p>
      )}
      {runData && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm">
              <span className="font-semibold text-success">
                {runData.summary.counts.BILLED ?? 0} billed · {formatMoney(runData.summary.amount, currency)}
              </span>
              {(runData.summary.counts.SKIPPED ?? 0) > 0 && (
                <span className="text-muted-foreground"> · {runData.summary.counts.SKIPPED} skipped</span>
              )}
              {(runData.summary.counts.FAILED ?? 0) > 0 && (
                <span className="text-danger"> · {runData.summary.counts.FAILED} could not be billed</span>
              )}
              {email && <span className="text-muted-foreground"> · {runData.summary.emailed} emails sent</span>}
            </p>
            <Button variant="outline" onClick={startOver}>
              Bill more students
            </Button>
          </div>
          <div className="max-h-[420px] overflow-auto border-t border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className={head}>
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Class</th>
                  <th className="px-3 py-2 font-medium">Outcome</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {runData.rows.map((r) => (
                  <tr key={r.student_id} className="border-b border-border">
                    <td className="px-3 py-2">
                      <span className="font-medium">{r.student_name}</span>
                      {r.admission_number && (
                        <span className="ml-2 text-xs text-muted-foreground">{r.admission_number}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{classOf.get(r.student_id)?.name ?? r.class_name ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.outcome === 'BILLED' ? (
                        <Badge tone="success" size="sm">
                          Billed · {r.bill_number}
                          {r.emailed.length > 0 ? ' · emailed' : ''}
                        </Badge>
                      ) : (
                        <span className={r.outcome === 'FAILED' ? 'text-danger' : 'text-muted-foreground'}>
                          {r.outcome === 'FAILED' ? 'Not billed: ' : 'Skipped: '}
                          {r.detail}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {r.outcome === 'BILLED' ? formatMoney(r.amount, currency) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Issue ${ready.length} bill${ready.length === 1 ? '' : 's'}?`}
        description={`${formatMoney(readyTotal, currency)} in all. Each student gets a numbered bill of their own and sees it on their Fees page${email ? ', and each family is emailed' : ''}.`}
        confirmLabel="Issue bills"
        loading={start.isPending}
        onConfirm={startRun}
      />
    </div>
  )
}

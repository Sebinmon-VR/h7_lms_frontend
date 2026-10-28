import { useQuery } from '@tanstack/react-query'
import { Loader2, MousePointer2, Save, Scissors, TriangleAlert, X } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { examApi } from '@/api/exam.api'
import { ApiError } from '@/api/errors'
import type { ExamOut, MarkedFile, MarkingPart, SubmissionOut } from '@/api/types'
import { cn } from '@/lib/cn'
import { formatMark, gradeForPercentage } from '@/lib/exams'
import { fileNameFromUrl } from '@/lib/files'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Marking on the answer sheet itself.
 *
 * The teacher draws lines across the student's uploaded pages to split them into answers,
 * gives each part a score (and, if they like, what it was worth), and the editor adds the
 * parts up into the script's total, its percentage and - on a graded exam - its grade.
 *
 * Lines are kept as a fraction of the way down each file, so they stay on the same answer
 * however wide the screen is. PDFs are drawn page by page so the lines can sit on top of
 * them; images are shown as they are, and Word (.docx) files are rendered into the page.
 */

type Sheet = Record<string, MarkedFile>

const MIN_GAP = 0.01

function emptyPart(label: string): MarkingPart {
  return { label, marks: null, max_marks: null, comment: null }
}

function initialSheet(submission: SubmissionOut): Sheet {
  const saved = (submission.marking_sheet ?? {}) as Sheet
  const sheet: Sheet = {}
  let count = 0
  submission.attachments.forEach((_, index) => {
    const existing = saved[String(index)]
    if (existing && existing.segments?.length === (existing.dividers?.length ?? 0) + 1) {
      sheet[String(index)] = { dividers: [...existing.dividers], segments: existing.segments.map((s) => ({ ...s })) }
      count += existing.segments.length
    } else {
      count += 1
      sheet[String(index)] = { dividers: [], segments: [emptyPart(`Q${count}`)] }
    }
  })
  return sheet
}

function partCount(sheet: Sheet): number {
  return Object.values(sheet).reduce((n, f) => n + f.segments.length, 0)
}

// ---------------------------------------------------------------- one file, drawn

type Kind = 'pdf' | 'image' | 'docx' | 'other'

function kindOf(type: string, name: string): Kind {
  const lower = name.toLowerCase()
  if (type === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf'
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/.test(lower)) return 'image'
  if (type.includes('wordprocessingml') || lower.endsWith('.docx')) return 'docx'
  return 'other'
}

/** Draws a file into `host` and resolves once it is all on the page. */
async function drawInto(host: HTMLDivElement, blob: Blob, kind: Kind, isCancelled: () => boolean) {
  host.innerHTML = ''
  if (kind === 'pdf') {
    const pdfjs = await import('pdfjs-dist')
    const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise
    for (let n = 1; n <= doc.numPages; n += 1) {
      if (isCancelled()) return
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      // A fixed drawing width, scaled to fit by CSS: sharp enough to read handwriting.
      const scale = (1200 / base.width) * Math.min(window.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.className = 'block h-auto w-full bg-white'
      canvas.style.marginBottom = n < doc.numPages ? '8px' : '0'
      const context = canvas.getContext('2d')
      if (!context) continue
      await page.render({ canvas, canvasContext: context, viewport }).promise
      host.appendChild(canvas)
    }
    return
  }
  if (kind === 'image') {
    const url = URL.createObjectURL(blob)
    await new Promise<void>((resolve) => {
      const img = document.createElement('img')
      img.className = 'block h-auto w-full bg-white'
      img.onload = () => resolve()
      img.onerror = () => resolve()
      img.src = url
      host.appendChild(img)
    })
    return
  }
  if (kind === 'docx') {
    const { renderAsync } = await import('docx-preview')
    const wrap = document.createElement('div')
    wrap.className = 'bg-white text-black'
    host.appendChild(wrap)
    await renderAsync(blob, wrap, undefined, { inWrapper: false, ignoreLastRenderedPageBreak: true })
  }
}

function MarkingSurface({
  cacheKey,
  load,
  fileName,
  file,
  drawing,
  activePart,
  onChange,
  onFocusPart,
}: {
  cacheKey: string
  load: () => Promise<Blob>
  fileName: string
  file: MarkedFile
  drawing: boolean
  activePart: number | null
  onChange: (next: MarkedFile) => void
  onFocusPart: (index: number) => void
}) {
  const query = useQuery({ queryKey: ['document-view', cacheKey], queryFn: load, staleTime: 5 * 60_000, retry: 1 })
  const hostRef = React.useRef<HTMLDivElement>(null)
  const surfaceRef = React.useRef<HTMLDivElement>(null)
  const [drawn, setDrawn] = React.useState<'idle' | 'drawing' | 'done' | 'failed'>('idle')
  const blob = query.data
  const kind = blob ? kindOf(blob.type || '', fileName) : null

  React.useEffect(() => {
    if (!blob || !kind || kind === 'other' || !hostRef.current) return
    let cancelled = false
    setDrawn('drawing')
    drawInto(hostRef.current, blob, kind, () => cancelled)
      .then(() => !cancelled && setDrawn('done'))
      .catch((error) => {
        console.error('Could not draw the answer sheet', error)
        if (!cancelled) setDrawn('failed')
      })
    return () => {
      cancelled = true
    }
  }, [blob, kind])

  const fractionAt = (clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect || rect.height === 0) return null
    return Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1)
  }

  const partAt = (y: number) => {
    let index = 0
    while (index < file.dividers.length && y > file.dividers[index]) index += 1
    return index
  }

  const addLine = (y: number) => {
    if (y <= MIN_GAP || y >= 1 - MIN_GAP) return
    if (file.dividers.some((d) => Math.abs(d - y) < MIN_GAP)) return
    const at = partAt(y)
    const dividers = [...file.dividers, y].sort((a, b) => a - b)
    const segments = [...file.segments]
    segments.splice(at + 1, 0, emptyPart(''))
    onChange({ dividers, segments })
    onFocusPart(at + 1)
  }

  const removeLine = (index: number) => {
    const dividers = file.dividers.filter((_, i) => i !== index)
    const segments = [...file.segments]
    const upper = segments[index]
    const lower = segments[index + 1]
    // The two parts become one; whatever was scored on either is kept.
    const merged =
      upper.marks == null && lower.marks == null ? null : Number(upper.marks ?? 0) + Number(lower.marks ?? 0)
    segments.splice(index, 2, { ...upper, marks: merged })
    onChange({ dividers, segments })
  }

  const dragLine = (index: number, event: React.PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    const lowest = index > 0 ? file.dividers[index - 1] + MIN_GAP : MIN_GAP
    const highest = index < file.dividers.length - 1 ? file.dividers[index + 1] - MIN_GAP : 1 - MIN_GAP
    const move = (e: PointerEvent) => {
      const y = fractionAt(e.clientY)
      if (y == null) return
      const dividers = [...file.dividers]
      dividers[index] = Math.min(Math.max(y, lowest), highest)
      onChange({ ...file, dividers })
    }
    const stop = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', stop)
      target.removeEventListener('pointercancel', stop)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', stop)
    target.addEventListener('pointercancel', stop)
  }

  const setPart = (index: number, patch: Partial<MarkingPart>) => {
    const segments = file.segments.map((s, i) => (i === index ? { ...s, ...patch } : s))
    onChange({ ...file, segments })
  }

  if (query.isPending) {
    return (
      <div className="grid h-64 place-items-center rounded-lg border border-border bg-muted/40 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Opening the answer sheet…
        </span>
      </div>
    )
  }
  if (query.isError || !blob) {
    return <p className="rounded-lg border border-border p-4 text-sm text-danger">This file could not be opened.</p>
  }
  if (kind === 'other') {
    return (
      <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        This kind of file cannot be drawn on. Score it in the list on the right.
      </p>
    )
  }

  const bounds = [0, ...file.dividers, 1]

  return (
    <div ref={surfaceRef} className="relative overflow-hidden rounded-lg border border-border bg-white shadow-sm">
      <div ref={hostRef} />
      {drawn === 'drawing' && (
        <div className="absolute inset-0 grid place-items-center bg-white/70 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Drawing the pages…
          </span>
        </div>
      )}
      {drawn === 'failed' && (
        <div className="absolute inset-0 grid place-items-center bg-white/90 p-4 text-center text-sm text-danger">
          This file could not be drawn. Score it in the list on the right.
        </div>
      )}

      {drawn === 'done' && (
        <div
          className={cn('absolute inset-0', drawing ? 'cursor-crosshair' : 'cursor-default')}
          onClick={(e) => {
            const y = fractionAt(e.clientY)
            if (y == null) return
            if (drawing) addLine(y)
            else onFocusPart(partAt(y))
          }}
        >
          {/* The parts: tinted when chosen, each with its score in the top-right corner. */}
          {file.segments.map((part, i) => {
            const top = bounds[i]
            const bottom = bounds[i + 1]
            const active = activePart === i
            return (
              <div
                key={`part-${i}`}
                className={cn('absolute inset-x-0', active ? 'bg-primary/8' : 'bg-transparent')}
                style={{ top: `${top * 100}%`, height: `${(bottom - top) * 100}%` }}
              >
                <div
                  className={cn(
                    'absolute right-2 top-2 flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs shadow-sm',
                    active ? 'border-primary bg-card' : 'border-border bg-card/95',
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    onFocusPart(i)
                  }}
                >
                  <input
                    value={part.label}
                    onChange={(e) => setPart(i, { label: e.target.value })}
                    placeholder={`Part ${i + 1}`}
                    aria-label={`Name of part ${i + 1}`}
                    className="w-14 bg-transparent font-semibold text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={part.marks ?? ''}
                    onChange={(e) => setPart(i, { marks: e.target.value === '' ? null : Number(e.target.value) })}
                    aria-label={`Marks for ${part.label || `part ${i + 1}`}`}
                    className="w-14 rounded border border-border bg-background px-1.5 py-0.5 text-right font-semibold text-foreground outline-none focus:border-primary"
                  />
                  <span className="text-muted-foreground">/</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={part.max_marks ?? ''}
                    onChange={(e) => setPart(i, { max_marks: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="–"
                    aria-label={`What ${part.label || `part ${i + 1}`} is worth`}
                    className="w-12 bg-transparent text-muted-foreground outline-none"
                  />
                </div>
              </div>
            )
          })}

          {/* The lines: drag the grip to move one, × to remove it. */}
          {file.dividers.map((y, i) => (
            <div key={`line-${i}`} className="absolute inset-x-0" style={{ top: `${y * 100}%` }}>
              <div className="absolute inset-x-0 -translate-y-1/2 border-t-2 border-dashed border-danger" />
              <button
                type="button"
                className="absolute left-2 -translate-y-1/2 cursor-ns-resize touch-none rounded-full bg-danger px-2 py-0.5 text-2xs font-bold text-white shadow"
                onPointerDown={(e) => dragLine(i, e)}
                onClick={(e) => e.stopPropagation()}
                aria-label="Drag to move this line"
              >
                ⇕
              </button>
              <button
                type="button"
                className="absolute left-12 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-card text-danger shadow ring-1 ring-danger/40"
                onClick={(e) => {
                  e.stopPropagation()
                  removeLine(i)
                }}
                aria-label="Remove this line"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- the editor

export function MarkingEditor({
  open,
  onOpenChange,
  exam,
  submission,
  onRecordTotal,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  exam: ExamOut
  submission: SubmissionOut
  /** Records the total as the script's marks (the grade follows on a graded exam). */
  onRecordTotal: (total: number) => Promise<void>
}) {
  const [sheet, setSheet] = React.useState<Sheet>(() => initialSheet(submission))
  const [drawing, setDrawing] = React.useState(true)
  const [active, setActive] = React.useState<{ file: string; part: number } | null>(null)
  const [busy, setBusy] = React.useState<'save' | 'record' | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setSheet(initialSheet(submission))
      setError(null)
    }
    // Only when the editor opens: a background refresh must not wipe what is being marked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const files = submission.attachments.map((attachment, index) => ({ attachment, index, key: String(index) }))

  const total = Object.values(sheet).reduce(
    (sum, f) => sum + f.segments.reduce((s, p) => s + (Number.isFinite(Number(p.marks)) ? Number(p.marks ?? 0) : 0), 0),
    0,
  )
  const rounded = Math.round(total * 100) / 100
  const maxMarks = exam.max_marks || 0
  const percentage = maxMarks > 0 ? (rounded / maxMarks) * 100 : null
  const grade = gradeForPercentage(percentage, exam.grade_bands)
  const overParts = Object.values(sheet).flatMap((f) =>
    f.segments.filter((p) => p.marks != null && p.max_marks != null && p.marks > p.max_marks),
  )
  const overTotal = maxMarks > 0 && rounded > maxMarks
  const scored = Object.values(sheet).some((f) => f.segments.some((p) => p.marks != null))

  const setFile = (key: string, next: MarkedFile) => {
    // A new part gets the next number, so a teacher drawing lines down a paper gets Q1, Q2...
    const before = sheet[key]?.segments.length ?? 0
    let segments = next.segments
    if (next.segments.length > before) {
      let n = partCount(sheet)
      segments = next.segments.map((p) => (p.label ? p : { ...p, label: `Q${(n += 1)}` }))
    }
    setSheet((prev) => ({ ...prev, [key]: { ...next, segments } }))
  }

  const setPart = (key: string, index: number, patch: Partial<MarkingPart>) =>
    setSheet((prev) => ({
      ...prev,
      [key]: { ...prev[key], segments: prev[key].segments.map((p, i) => (i === index ? { ...p, ...patch } : p)) },
    }))

  const persist = async () => {
    await examApi.saveMarking(exam.id, submission.student_id, { files: sheet })
  }

  const saveOnly = async () => {
    setBusy('save')
    setError(null)
    try {
      await persist()
      toast.success('Marking saved')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The marking could not be saved.')
    } finally {
      setBusy(null)
    }
  }

  const record = async () => {
    setBusy('record')
    setError(null)
    try {
      await persist()
      await onRecordTotal(rounded)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The marks could not be recorded.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="h-[calc(100dvh-1rem)] max-w-[calc(100vw-1rem)]">
        <DialogHeader>
          <DialogTitle>Mark on the answer sheet · {submission.student?.full_name ?? 'Student'}</DialogTitle>
          <DialogDescription>
            Draw a line under each answer to split the sheet into parts, then give each part its score. The total,
            percentage{exam.grading_scheme === 'GRADE' ? ' and grade are' : ' is'} worked out for you.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 lg:flex-row">
          {/* ------------------------------------------------ the sheets */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={drawing ? 'primary' : 'outline'}
                icon={<Scissors />}
                onClick={() => setDrawing(true)}
                aria-pressed={drawing}
              >
                Draw lines
              </Button>
              <Button
                size="sm"
                variant={!drawing ? 'primary' : 'outline'}
                icon={<MousePointer2 />}
                onClick={() => setDrawing(false)}
                aria-pressed={!drawing}
              >
                Select parts
              </Button>
              <span className="text-xs text-muted-foreground">
                {drawing
                  ? 'Click across the page under each answer. Drag a red grip to move a line, × to remove it.'
                  : 'Click a part to choose it.'}
              </span>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-lg bg-muted/40 p-3">
              {files.map(({ attachment, index, key }) => {
                const name = attachment.filename ?? fileNameFromUrl(attachment.file_url) ?? `File ${index + 1}`
                return (
                  <section key={key} className="mx-auto max-w-4xl space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">{name}</p>
                    <MarkingSurface
                      cacheKey={`submission-${exam.id}-${submission.student_id}-${index}-${attachment.file_url}`}
                      load={() => examApi.submissionFile(exam.id, submission.student_id, index)}
                      fileName={name}
                      file={sheet[key]}
                      drawing={drawing}
                      activePart={active?.file === key ? active.part : null}
                      onChange={(next) => setFile(key, next)}
                      onFocusPart={(part) => setActive({ file: key, part })}
                    />
                  </section>
                )
              })}
            </div>
          </div>

          {/* ------------------------------------------------ the parts and the total */}
          <aside className="flex min-h-0 w-full shrink-0 flex-col rounded-lg border border-border lg:w-80">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {files.map(({ attachment, index, key }) => (
                <div key={key} className="space-y-1.5">
                  {files.length > 1 && (
                    <p className="truncate text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                      {attachment.filename ?? `File ${index + 1}`}
                    </p>
                  )}
                  {sheet[key].segments.map((part, i) => {
                    const chosen = active?.file === key && active.part === i
                    const over = part.marks != null && part.max_marks != null && part.marks > part.max_marks
                    return (
                      <div
                        key={i}
                        className={cn(
                          'rounded-lg border p-2',
                          chosen ? 'border-primary bg-primary/5' : 'border-border',
                          over && 'border-danger',
                        )}
                        onClick={() => setActive({ file: key, part: i })}
                      >
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={part.label}
                            onChange={(e) => setPart(key, i, { label: e.target.value })}
                            placeholder={`Part ${i + 1}`}
                            aria-label="Part name"
                            className="h-8 min-w-0 flex-1 text-sm font-semibold"
                          />
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            value={part.marks ?? ''}
                            onChange={(e) => setPart(key, i, { marks: e.target.value === '' ? null : Number(e.target.value) })}
                            aria-label="Marks"
                            invalid={over}
                            className="h-8 w-16 text-right font-semibold"
                          />
                          <span className="text-xs text-muted-foreground">/</span>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            value={part.max_marks ?? ''}
                            onChange={(e) =>
                              setPart(key, i, { max_marks: e.target.value === '' ? null : Number(e.target.value) })
                            }
                            placeholder="–"
                            aria-label="Worth"
                            className="h-8 w-14 text-right"
                          />
                        </div>
                        {chosen && (
                          <Input
                            value={part.comment ?? ''}
                            onChange={(e) => setPart(key, i, { comment: e.target.value || null })}
                            placeholder="Comment on this answer (optional)"
                            aria-label="Comment"
                            className="mt-1.5 h-8 text-xs"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t border-border p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className={cn('text-xl font-semibold tabular-nums', overTotal && 'text-danger')}>
                  {formatMark(rounded)} <span className="text-sm text-muted-foreground">/ {formatMark(maxMarks)}</span>
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Percentage</span>
                <span className="font-medium tabular-nums">{percentage != null ? `${percentage.toFixed(1)}%` : '–'}</span>
              </div>
              {exam.grade_bands.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Grade</span>
                  <span className="font-semibold">{grade ?? 'Below every band'}</span>
                </div>
              )}
              {(overTotal || overParts.length > 0) && (
                <p className="flex items-start gap-1.5 text-xs text-danger">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {overTotal
                    ? `The parts add up to more than the exam is out of (${formatMark(maxMarks)}).`
                    : 'A part is given more than it is worth.'}
                </p>
              )}
              {error && <p className="text-xs text-danger">{error}</p>}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" loading={busy === 'save'} onClick={saveOnly}>
                  Save for later
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  icon={<Save />}
                  loading={busy === 'record'}
                  disabled={!scored || overTotal || overParts.length > 0}
                  onClick={record}
                >
                  Record marks
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  )
}

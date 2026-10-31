import {
  Check,
  Circle,
  Eraser,
  Loader2,
  MousePointer2,
  Pencil,
  Save,
  Scissors,
  TriangleAlert,
  Type,
  Underline,
  Undo2,
  X,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { examApi } from '@/api/exam.api'
import { ApiError } from '@/api/errors'
import type { ExamOut, MarkedFile, MarkingPart, SheetMark, SubmissionOut } from '@/api/types'
import { cn } from '@/lib/cn'
import { formatMark, gradeForPercentage } from '@/lib/exams'
import { fileNameFromUrl } from '@/lib/files'
import { MARK_COLORS, SheetMarks, useDrawnSheet } from '@/components/domain/answer-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Marking on the answer sheet itself.
 *
 * The teacher draws lines across the student's uploaded pages to split them into answers,
 * gives each part a score (and, if they like, what it was worth), and the editor adds the
 * parts up into the script's total, its percentage and - on a graded exam - its grade.
 * With the pencil, circle, underline, tick, cross and note tools they show the student where
 * the mistakes are; the student sees the marked sheet once results are published.
 *
 * Lines and marks are kept as fractions of each file's width and height, so they stay on the
 * same answer however wide the screen is. PDFs are drawn page by page so they can sit on top;
 * images are shown as they are, and Word (.docx) files are rendered into the page.
 */

type Sheet = Record<string, MarkedFile>
type MarkTool = 'pen' | 'circle' | 'line' | 'tick' | 'cross' | 'note' | 'erase'
type Tool = 'lines' | 'select' | MarkTool
type Point = [number, number]
/** One undoable change: a mark added, or one rubbed out from where it was. */
type Step = { key: string; added: SheetMark } | { key: string; erased: SheetMark; index: number }

const MIN_GAP = 0.01

const MARK_TOOLS: { tool: MarkTool; label: string; icon: React.ReactNode; hint: string }[] = [
  { tool: 'pen', label: 'Pencil', icon: <Pencil />, hint: 'Draw on the sheet with the pencil.' },
  { tool: 'circle', label: 'Circle', icon: <Circle />, hint: 'Drag across a mistake to circle it.' },
  { tool: 'line', label: 'Underline', icon: <Underline />, hint: 'Drag along the words to underline them.' },
  { tool: 'tick', label: 'Tick', icon: <Check />, hint: 'Click where the tick goes.' },
  { tool: 'cross', label: 'Cross', icon: <X />, hint: 'Click where the cross goes.' },
  { tool: 'note', label: 'Note', icon: <Type />, hint: 'Click where the note goes, type it and press Enter.' },
  { tool: 'erase', label: 'Eraser', icon: <Eraser />, hint: 'Click a mark to remove it.' },
]

const round = (v: number) => Math.round(v * 10000) / 10000
const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

function emptyPart(label: string): MarkingPart {
  return { label, marks: null, max_marks: null, comment: null }
}

function initialSheet(submission: SubmissionOut): Sheet {
  const saved = (submission.marking_sheet ?? {}) as Sheet
  const sheet: Sheet = {}
  let count = 0
  submission.attachments.forEach((_, index) => {
    const existing = saved[String(index)]
    const annotations = [...(existing?.annotations ?? [])]
    if (existing && existing.segments?.length === (existing.dividers?.length ?? 0) + 1) {
      sheet[String(index)] = {
        dividers: [...existing.dividers],
        segments: existing.segments.map((s) => ({ ...s })),
        annotations,
      }
      count += existing.segments.length
    } else {
      count += 1
      sheet[String(index)] = { dividers: [], segments: [emptyPart(`Q${count}`)], annotations }
    }
  })
  return sheet
}

function partCount(sheet: Sheet): number {
  return Object.values(sheet).reduce((n, f) => n + f.segments.length, 0)
}

// ---------------------------------------------------------------- one file, drawn

function MarkingSurface({
  cacheKey,
  load,
  fileName,
  file,
  tool,
  color,
  activePart,
  onChange,
  onFocusPart,
  onAddMark,
  onEraseMark,
}: {
  cacheKey: string
  load: () => Promise<Blob>
  fileName: string
  file: MarkedFile
  tool: Tool
  color: string
  activePart: number | null
  onChange: (next: MarkedFile) => void
  onFocusPart: (index: number) => void
  onAddMark: (mark: SheetMark) => void
  onEraseMark: (index: number) => void
}) {
  const sheet = useDrawnSheet(cacheKey, load, fileName)
  const [draft, setDraft] = React.useState<SheetMark | null>(null)
  const [note, setNote] = React.useState<{ at: Point; text: string } | null>(null)
  const noteRef = React.useRef(note)
  noteRef.current = note
  const drags = tool === 'pen' || tool === 'circle' || tool === 'line'

  const pointAt = (clientX: number, clientY: number): Point | null => {
    const rect = sheet.surfaceNode.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    return [clamp01((clientX - rect.left) / rect.width), clamp01((clientY - rect.top) / rect.height)]
  }

  const fractionAt = (clientY: number) => pointAt(0, clientY)?.[1] ?? null

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
    onChange({ ...file, dividers, segments })
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
    onChange({ ...file, dividers, segments })
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

  // ------------------------------------------------ marks

  const startMark = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drags || e.button !== 0 || (e.target as HTMLElement).closest('[data-no-draw]')) return
    const p = pointAt(e.clientX, e.clientY)
    if (!p) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDraft({ kind: tool, points: tool === 'pen' ? [p] : [p, p], color })
  }

  const moveMark = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draft) return
    const p = pointAt(e.clientX, e.clientY)
    if (!p) return
    setDraft((d) => {
      if (!d) return d
      if (d.kind !== 'pen') return { ...d, points: [d.points[0], p] }
      // A point every couple of pixels is smooth enough and keeps the script small.
      const [lx, ly] = d.points[d.points.length - 1]
      if (Math.abs((p[0] - lx) * sheet.size.width) < 2 && Math.abs((p[1] - ly) * sheet.size.height) < 2) return d
      return { ...d, points: [...d.points, p] }
    })
  }

  const endMark = () => {
    if (!draft) return
    setDraft(null)
    const [a, b] = draft.points
    const big =
      draft.kind === 'pen'
        ? draft.points.length > 1
        : !!b && (Math.abs(b[0] - a[0]) * sheet.size.width > 6 || Math.abs(b[1] - a[1]) * sheet.size.height > 6)
    if (big) onAddMark({ ...draft, points: draft.points.map(([x, y]) => [round(x), round(y)]) })
  }

  const commitNote = () => {
    const current = noteRef.current
    if (!current) return
    noteRef.current = null
    setNote(null)
    const text = current.text.trim()
    if (text) onAddMark({ kind: 'note', points: [[round(current.at[0]), round(current.at[1])]], color, text })
  }

  if (sheet.query.isPending) {
    return (
      <div className="grid h-64 place-items-center rounded-lg border border-border bg-muted/40 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Opening the answer sheet…
        </span>
      </div>
    )
  }
  if (sheet.query.isError || !sheet.query.data) {
    return <p className="rounded-lg border border-border p-4 text-sm text-danger">This file could not be opened.</p>
  }
  if (sheet.kind === 'other') {
    return (
      <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        This kind of file cannot be drawn on. Score it in the list on the right.
      </p>
    )
  }

  const bounds = [0, ...file.dividers, 1]

  return (
    <div ref={sheet.surfaceRef} className="relative overflow-hidden rounded-lg border border-border bg-white shadow-sm">
      <div ref={sheet.hostRef} />
      {sheet.drawn === 'drawing' && (
        <div className="absolute inset-0 grid place-items-center bg-white/70 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Drawing the pages…
          </span>
        </div>
      )}
      {sheet.drawn === 'failed' && (
        <div className="absolute inset-0 grid place-items-center bg-white/90 p-4 text-center text-sm text-danger">
          This file could not be drawn. Score it in the list on the right.
        </div>
      )}

      {sheet.drawn === 'done' && (
        <div
          className={cn(
            'absolute inset-0',
            tool === 'select' || tool === 'erase' ? 'cursor-default' : tool === 'note' ? 'cursor-text' : 'cursor-crosshair',
            // The pen draws instead of scrolling on a touch screen.
            drags && 'touch-none',
          )}
          onPointerDown={startMark}
          onPointerMove={moveMark}
          onPointerUp={endMark}
          onPointerCancel={() => setDraft(null)}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[data-no-draw]')) return
            const p = pointAt(e.clientX, e.clientY)
            if (!p) return
            if (tool === 'lines') addLine(p[1])
            else if (tool === 'select') onFocusPart(partAt(p[1]))
            else if (tool === 'tick' || tool === 'cross') onAddMark({ kind: tool, points: [[round(p[0]), round(p[1])]], color })
            else if (tool === 'note') setNote({ at: p, text: '' })
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
                  data-no-draw
                  className={cn(
                    'absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs shadow-sm',
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

          {/* The teacher's marks, over the page and under the scores. */}
          <SheetMarks
            marks={file.annotations ?? []}
            size={sheet.size}
            draft={draft}
            onErase={tool === 'erase' ? onEraseMark : undefined}
          />

          {/* The lines: drag the grip to move one, × to remove it. */}
          {file.dividers.map((y, i) => (
            <div key={`line-${i}`} className="absolute inset-x-0 z-20" style={{ top: `${y * 100}%` }}>
              <div className="absolute inset-x-0 -translate-y-1/2 border-t-2 border-dashed border-danger" />
              <button
                type="button"
                data-no-draw
                className="absolute left-2 -translate-y-1/2 cursor-ns-resize touch-none rounded-full bg-danger px-2 py-0.5 text-2xs font-bold text-white shadow"
                onPointerDown={(e) => dragLine(i, e)}
                onClick={(e) => e.stopPropagation()}
                aria-label="Drag to move this line"
              >
                ⇕
              </button>
              <button
                type="button"
                data-no-draw
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

          {/* A note being typed, where it will sit on the sheet. */}
          {note && (
            <div
              data-no-draw
              className="absolute z-30"
              style={
                note.at[0] > 0.7
                  ? { right: `${(1 - note.at[0]) * 100}%`, top: `${note.at[1] * 100}%` }
                  : { left: `${note.at[0] * 100}%`, top: `${note.at[1] * 100}%` }
              }
              onClick={(e) => e.stopPropagation()}
            >
              <input
                autoFocus
                value={note.text}
                maxLength={300}
                onChange={(e) => setNote({ ...note, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitNote()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    e.stopPropagation()
                    noteRef.current = null
                    setNote(null)
                  }
                }}
                onBlur={commitNote}
                placeholder="Type a note, then press Enter"
                aria-label="Note on the answer sheet"
                data-sheet-note
                className="w-60 rounded border border-border bg-white px-2 py-1 text-sm font-semibold shadow outline-none focus:border-primary"
                style={{ color }}
              />
            </div>
          )}
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
  const [tool, setTool] = React.useState<Tool>('lines')
  const [color, setColor] = React.useState<string>(MARK_COLORS[0].value)
  const [history, setHistory] = React.useState<Step[]>([])
  const [active, setActive] = React.useState<{ file: string; part: number } | null>(null)
  const [busy, setBusy] = React.useState<'save' | 'record' | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setSheet(initialSheet(submission))
      setHistory([])
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
    // Lines and scores only: the marks on the file are changed through addMark and eraseMark.
    setSheet((prev) => ({ ...prev, [key]: { ...next, segments, annotations: prev[key]?.annotations ?? [] } }))
  }

  const setPart = (key: string, index: number, patch: Partial<MarkingPart>) =>
    setSheet((prev) => ({
      ...prev,
      [key]: { ...prev[key], segments: prev[key].segments.map((p, i) => (i === index ? { ...p, ...patch } : p)) },
    }))

  const addMark = (key: string, mark: SheetMark) => {
    setSheet((prev) => ({ ...prev, [key]: { ...prev[key], annotations: [...(prev[key].annotations ?? []), mark] } }))
    setHistory((h) => [...h, { key, added: mark }])
  }

  const eraseMark = (key: string, index: number) => {
    const mark = sheet[key]?.annotations?.[index]
    if (!mark) return
    setSheet((prev) => ({
      ...prev,
      [key]: { ...prev[key], annotations: (prev[key].annotations ?? []).filter((_, i) => i !== index) },
    }))
    setHistory((h) => [...h, { key, erased: mark, index }])
  }

  const undo = () => {
    const step = history[history.length - 1]
    if (!step) return
    setHistory((h) => h.slice(0, -1))
    setSheet((prev) => {
      const marks = [...(prev[step.key]?.annotations ?? [])]
      if ('added' in step) {
        const at = marks.lastIndexOf(step.added)
        if (at >= 0) marks.splice(at, 1)
      } else {
        marks.splice(Math.min(step.index, marks.length), 0, step.erased)
      }
      return { ...prev, [step.key]: { ...prev[step.key], annotations: marks } }
    })
  }

  // Ctrl+Z (⌘Z) takes back the last mark, except while typing in a box.
  const undoRef = React.useRef(undo)
  undoRef.current = undo
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return
      if ((e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      undoRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

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

  const hint =
    tool === 'lines'
      ? 'Click across the page under each answer. Drag a red grip to move a line, × to remove it.'
      : tool === 'select'
        ? 'Click a part to choose it.'
        : MARK_TOOLS.find((t) => t.tool === tool)?.hint

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        className="h-[calc(100dvh-1rem)] max-w-[calc(100vw-1rem)]"
        // Escape in a note being typed cancels the note, not the whole marking.
        onEscapeKeyDown={(e) => {
          if ((e.target as HTMLElement | null)?.closest?.('[data-sheet-note]')) e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>Mark on the answer sheet · {submission.student?.full_name ?? 'Student'}</DialogTitle>
          <DialogDescription>
            Draw a line under each answer to split the sheet into parts, then give each part its score. The total,
            percentage{exam.grading_scheme === 'GRADE' ? ' and grade are' : ' is'} worked out for you. Circle, tick,
            cross or write on the sheet to show mistakes: the student sees the marked sheet when results are published.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 lg:flex-row">
          {/* ------------------------------------------------ the sheets */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={tool === 'lines' ? 'primary' : 'outline'}
                icon={<Scissors />}
                onClick={() => setTool('lines')}
                aria-pressed={tool === 'lines'}
              >
                Draw lines
              </Button>
              <Button
                size="sm"
                variant={tool === 'select' ? 'primary' : 'outline'}
                icon={<MousePointer2 />}
                onClick={() => setTool('select')}
                aria-pressed={tool === 'select'}
              >
                Select parts
              </Button>

              <span className="mx-1 h-6 w-px bg-border" aria-hidden />

              <div className="flex items-center gap-1" role="group" aria-label="Mark mistakes">
                {MARK_TOOLS.map((t) => (
                  <Tooltip key={t.tool}>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon-sm"
                        variant={tool === t.tool ? 'primary' : 'outline'}
                        icon={t.icon}
                        onClick={() => setTool(t.tool)}
                        aria-pressed={tool === t.tool}
                        aria-label={t.label}
                      />
                    </TooltipTrigger>
                    <TooltipContent>{t.label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>

              <div className="flex items-center gap-1.5 px-1" role="group" aria-label="Colour">
                {MARK_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    aria-pressed={color === c.value}
                    aria-label={`${c.label} ink`}
                    title={c.label}
                    className={cn(
                      'size-5 rounded-full ring-offset-2 ring-offset-card transition-shadow',
                      color === c.value ? 'ring-2 ring-foreground/70' : 'ring-1 ring-border',
                    )}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>

              <Button size="sm" variant="ghost" icon={<Undo2 />} onClick={undo} disabled={history.length === 0}>
                Undo
              </Button>

              <span className="basis-full text-xs text-muted-foreground">{hint}</span>
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
                      tool={tool}
                      color={color}
                      activePart={active?.file === key ? active.part : null}
                      onChange={(next) => setFile(key, next)}
                      onFocusPart={(part) => setActive({ file: key, part })}
                      onAddMark={(mark) => addMark(key, mark)}
                      onEraseMark={(i) => eraseMark(key, i)}
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

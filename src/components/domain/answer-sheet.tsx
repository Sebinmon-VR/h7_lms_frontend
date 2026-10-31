import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import * as React from 'react'

import type { MarkedFile, SheetMark } from '@/api/types'
import { cn } from '@/lib/cn'
import { formatMark } from '@/lib/exams'

/**
 * An answer sheet drawn on the page, and the teacher's marks on top of it.
 *
 * Shared by the marking editor, where the teacher draws, and the student's result, where the
 * marked sheet is shown back to them. Everything on the sheet is kept as a fraction of the
 * file's width and height, so it lands on the same words at any screen width.
 */

export type SheetKind = 'pdf' | 'image' | 'docx' | 'other'

export function kindOf(type: string, name: string): SheetKind {
  const lower = name.toLowerCase()
  if (type === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf'
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/.test(lower)) return 'image'
  if (type.includes('wordprocessingml') || lower.endsWith('.docx')) return 'docx'
  return 'other'
}

/** Draws a file into `host` and resolves once it is all on the page. */
async function drawInto(host: HTMLDivElement, blob: Blob, kind: SheetKind, isCancelled: () => boolean) {
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

/**
 * Loads a file and draws it. Put `hostRef` on an empty div for the pages and `surfaceRef` on
 * the box around it that the lines and marks are measured against.
 */
export function useDrawnSheet(cacheKey: string, load: () => Promise<Blob>, fileName: string) {
  const query = useQuery({ queryKey: ['document-view', cacheKey], queryFn: load, staleTime: 5 * 60_000, retry: 1 })
  const hostRef = React.useRef<HTMLDivElement>(null)
  const surfaceNode = React.useRef<HTMLDivElement | null>(null)
  const observer = React.useRef<ResizeObserver | null>(null)
  const [drawn, setDrawn] = React.useState<'idle' | 'drawing' | 'done' | 'failed'>('idle')
  const [size, setSize] = React.useState({ width: 0, height: 0 })
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

  // The marks are drawn in the sheet's own proportions, so they follow its size.
  const surfaceRef = React.useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect()
    surfaceNode.current = node
    if (!node) return
    observer.current = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    })
    observer.current.observe(node)
  }, [])

  return { query, kind, hostRef, surfaceRef, surfaceNode, drawn, size }
}

// ---------------------------------------------------------------- the marks

export const MARK_COLORS = [
  { value: '#dc2626', label: 'Red' },
  { value: '#16a34a', label: 'Green' },
  { value: '#2563eb', label: 'Blue' },
] as const

// The sheet is drawn 1000 units wide, so a mark's thickness grows and shrinks with the page.
const VIEW_WIDTH = 1000
const STROKE = 3
const SYMBOL = 16
const NOTE_SIZE = 20
const NOTE_LINE = 34

/** Short lines for a note, broken between words. */
function noteLines(text: string): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > NOTE_LINE) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines
}

/** A mark as an SVG path, in view units. Notes are text and have none. */
function pathOf(mark: SheetMark, height: number): string | null {
  const at = mark.points.map(([x, y]) => [x * VIEW_WIDTH, y * height] as const)
  if (at.length === 0) return null
  const [[x, y]] = at
  switch (mark.kind) {
    case 'pen':
      return at.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')
    case 'line':
      return at.length > 1 ? `M${x} ${y} L${at[1][0]} ${at[1][1]}` : null
    case 'circle': {
      if (at.length < 2) return null
      // Two half-ellipses from the left edge round to the right and back.
      const rx = Math.abs(at[1][0] - x) / 2
      const ry = Math.abs(at[1][1] - y) / 2
      const left = Math.min(x, at[1][0])
      const middle = (y + at[1][1]) / 2
      return `M${left} ${middle} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0`
    }
    case 'tick':
      return `M${x - SYMBOL} ${y} L${x - SYMBOL * 0.35} ${y + SYMBOL * 0.7} L${x + SYMBOL} ${y - SYMBOL * 0.9}`
    case 'cross': {
      const s = SYMBOL * 0.8
      return `M${x - s} ${y - s} L${x + s} ${y + s} M${x + s} ${y - s} L${x - s} ${y + s}`
    }
    default:
      return null
  }
}

function MarkShape({ mark, height, onErase }: { mark: SheetMark; height: number; onErase?: () => void }) {
  const erase = onErase
    ? {
        className: 'group cursor-pointer',
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation()
          onErase()
        },
      }
    : {}
  const fade = onErase ? 'transition-opacity group-hover:opacity-40' : undefined

  if (mark.kind === 'note') {
    const [x, y] = mark.points[0] ?? [0, 0]
    const end = x > 0.7
    return (
      <g {...erase}>
        <text
          x={x * VIEW_WIDTH}
          y={y * height}
          fill={mark.color}
          fontSize={NOTE_SIZE}
          fontWeight={600}
          textAnchor={end ? 'end' : 'start'}
          dominantBaseline="hanging"
          stroke="white"
          strokeWidth={5}
          strokeLinejoin="round"
          paintOrder="stroke"
          pointerEvents={onErase ? 'visiblePainted' : undefined}
          className={fade}
        >
          {noteLines(mark.text ?? '').map((line, i) => (
            <tspan key={i} x={x * VIEW_WIDTH} dy={i ? NOTE_SIZE * 1.25 : 0}>
              {line}
            </tspan>
          ))}
        </text>
      </g>
    )
  }

  const d = pathOf(mark, height)
  if (!d) return null
  const bold = mark.kind === 'tick' || mark.kind === 'cross'
  return (
    <g {...erase}>
      <path
        d={d}
        fill="none"
        stroke={mark.color}
        strokeWidth={bold ? STROKE + 1.5 : STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={fade}
      />
      {/* A wide, invisible copy, so a thin stroke is easy to click with the eraser. */}
      {onErase && <path d={d} fill="none" stroke="transparent" strokeWidth={18} pointerEvents="stroke" />}
    </g>
  )
}

/**
 * The teacher's marks over a drawn sheet. With `onErase` each mark can be clicked away;
 * `draft` is the mark still being drawn.
 */
export function SheetMarks({
  marks,
  size,
  draft,
  onErase,
}: {
  marks: SheetMark[]
  size: { width: number; height: number }
  draft?: SheetMark | null
  onErase?: (index: number) => void
}) {
  if (!size.width || !size.height) return null
  const height = (VIEW_WIDTH * size.height) / size.width
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 size-full"
      viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
      preserveAspectRatio="none"
    >
      {marks.map((mark, i) => (
        <MarkShape key={i} mark={mark} height={height} onErase={onErase ? () => onErase(i) : undefined} />
      ))}
      {draft && <MarkShape mark={draft} height={height} />}
    </svg>
  )
}

/** Whether there is anything on a file worth showing the student. */
export function hasMarking(file: MarkedFile | undefined): file is MarkedFile {
  if (!file) return false
  return (file.annotations?.length ?? 0) > 0 || file.segments.some((p) => p.marks != null || !!p.comment)
}

// ---------------------------------------------------------------- the student's copy

/** A marked answer sheet as the student sees it: the file, the teacher's marks and part scores. */
export function MarkedAnswerSheet({
  cacheKey,
  load,
  fileName,
  file,
}: {
  cacheKey: string
  load: () => Promise<Blob>
  fileName: string
  file: MarkedFile
}) {
  const sheet = useDrawnSheet(cacheKey, load, fileName)

  if (sheet.query.isPending) {
    return (
      <div className="grid h-48 place-items-center rounded-lg border border-border bg-muted/40 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Opening your answer sheet…
        </span>
      </div>
    )
  }
  if (sheet.query.isError || sheet.kind === 'other') {
    return (
      <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        This file can't be shown here with your teacher's marks.
      </p>
    )
  }

  const bounds = [0, ...file.dividers, 1]

  return (
    <div ref={sheet.surfaceRef} className="relative overflow-hidden rounded-lg border border-border bg-white">
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
          This file could not be drawn.
        </div>
      )}
      {sheet.drawn === 'done' && (
        <>
          <SheetMarks marks={file.annotations ?? []} size={sheet.size} />
          {file.dividers.map((y, i) => (
            <div
              key={`line-${i}`}
              className="absolute inset-x-0 border-t-2 border-dashed border-danger/50"
              style={{ top: `${y * 100}%` }}
            />
          ))}
          {file.segments.map((part, i) =>
            part.marks != null || part.comment ? (
              <div
                key={`part-${i}`}
                // Small on a phone, where the sheet itself is small and the label sits on it.
                className="absolute right-1 z-20 max-w-[45%] rounded-md border border-border bg-card/90 px-1.5 py-0.5 text-2xs leading-tight text-foreground shadow-sm sm:right-2 sm:max-w-[60%] sm:rounded-lg sm:px-2 sm:py-1 sm:text-xs"
                style={{ top: `calc(${bounds[i] * 100}% + 0.25rem)` }}
              >
                <p className="flex items-baseline justify-end gap-1.5">
                  {part.label && <span className="font-semibold">{part.label}</span>}
                  {part.marks != null && (
                    <span className={cn('font-bold tabular-nums', part.marks === 0 && 'text-danger')}>
                      {formatMark(part.marks)}
                      {part.max_marks != null && <span className="font-normal text-muted-foreground"> / {formatMark(part.max_marks)}</span>}
                    </span>
                  )}
                </p>
                {part.comment && <p className="mt-0.5 text-left text-muted-foreground">{part.comment}</p>}
              </div>
            ) : null,
          )}
        </>
      )}
    </div>
  )
}

import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  Eraser,
  Eye,
  EyeOff,
  Grid3x3,
  Highlighter,
  Minus,
  MoveUpRight,
  Pencil,
  Plus,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InfoTip } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'

/**
 * The teacher's whiteboard in a live class.
 *
 * Everything is drawn on one 1920x1080 canvas, and that canvas is what the call
 * page sends to the class as the teacher's screen share, so students see the
 * board inside the call (and in the recording) without anything new on the
 * server. Drawings are kept as shapes rather than pixels so they can be undone
 * and redrawn on any background, and are saved in this browser for the day so
 * a dropped connection does not wipe the board.
 */

export const BOARD_WIDTH = 1920
export const BOARD_HEIGHT = 1080

type Point = [number, number]
type Tool = 'pen' | 'highlighter' | 'eraser' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text'
type Background = 'plain' | 'grid' | 'lined' | 'chalk'

type Item =
  | { kind: 'stroke'; tool: 'pen' | 'highlighter' | 'eraser'; color: string; size: number; points: Point[] }
  | { kind: 'shape'; shape: 'line' | 'arrow' | 'rect' | 'ellipse'; color: string; size: number; from: Point; to: Point }
  | { kind: 'text'; color: string; size: number; at: Point; text: string }

type Page = { items: Item[]; background: Background }

type History = { past: Page[][]; present: Page[]; future: Page[][] }
type HistoryAction =
  | { type: 'commit'; update: (pages: Page[]) => Page[] }
  | { type: 'undo' }
  | { type: 'redo' }

const HISTORY_LIMIT = 100

function historyReducer(state: History, action: HistoryAction): History {
  switch (action.type) {
    case 'commit': {
      const present = action.update(state.present)
      if (present === state.present) return state
      return { past: [...state.past, state.present].slice(-HISTORY_LIMIT), present, future: [] }
    }
    case 'undo': {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] }
    }
    case 'redo': {
      const [next, ...rest] = state.future
      if (!next) return state
      return { past: [...state.past, state.present], present: next, future: rest }
    }
  }
}

const TOOLS: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  { tool: 'pen', label: 'Pen', icon: <Pencil /> },
  { tool: 'highlighter', label: 'Highlighter', icon: <Highlighter /> },
  { tool: 'eraser', label: 'Eraser', icon: <Eraser /> },
  { tool: 'line', label: 'Line', icon: <Minus /> },
  { tool: 'arrow', label: 'Arrow', icon: <MoveUpRight /> },
  { tool: 'rect', label: 'Rectangle', icon: <Square /> },
  { tool: 'ellipse', label: 'Circle', icon: <Circle /> },
  { tool: 'text', label: 'Text', icon: <Type /> },
]

const COLORS = ['#111827', '#ffffff', '#2563eb', '#dc2626', '#16a34a', '#ea580c', '#7c3aed', '#facc15']
const SIZES = [
  { size: 3, label: 'Thin' },
  { size: 6, label: 'Medium' },
  { size: 12, label: 'Thick' },
]
const BACKGROUNDS: { value: Background; label: string }[] = [
  { value: 'plain', label: 'Plain white' },
  { value: 'grid', label: 'Squared paper' },
  { value: 'lined', label: 'Lined paper' },
  { value: 'chalk', label: 'Chalkboard' },
]

const CHALK = '#1f3d33'
const blankPage = (background: Background = 'plain'): Page => ({ items: [], background })
const fontPx = (size: number) => 28 + size * 4

// ---------------------------------------------------------------------------
// Drawing

function paintBackground(ctx: CanvasRenderingContext2D, background: Background) {
  ctx.fillStyle = background === 'chalk' ? CHALK : '#ffffff'
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
  if (background === 'grid') {
    ctx.strokeStyle = '#dbe4f0'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let x = 60; x < BOARD_WIDTH; x += 60) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, BOARD_HEIGHT)
    }
    for (let y = 60; y < BOARD_HEIGHT; y += 60) {
      ctx.moveTo(0, y)
      ctx.lineTo(BOARD_WIDTH, y)
    }
    ctx.stroke()
  } else if (background === 'lined') {
    ctx.strokeStyle = '#c9d8ee'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let y = 120; y < BOARD_HEIGHT; y += 60) {
      ctx.moveTo(0, y)
      ctx.lineTo(BOARD_WIDTH, y)
    }
    ctx.stroke()
    ctx.strokeStyle = '#f2a7a7'
    ctx.beginPath()
    ctx.moveTo(150, 0)
    ctx.lineTo(150, BOARD_HEIGHT)
    ctx.stroke()
  }
}

function strokePath(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath()
  const [first] = points
  if (points.length < 3) {
    ctx.moveTo(first[0], first[1])
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y)
    if (points.length === 1) ctx.lineTo(first[0] + 0.1, first[1])
  } else {
    // Curves through the midpoints keep fast strokes smooth.
    ctx.moveTo(first[0], first[1])
    for (let i = 1; i < points.length - 1; i += 1) {
      const [x, y] = points[i]
      const [nx, ny] = points[i + 1]
      ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2)
    }
    const last = points[points.length - 1]
    ctx.lineTo(last[0], last[1])
  }
  ctx.stroke()
}

function drawItem(ctx: CanvasRenderingContext2D, item: Item) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = item.color
  ctx.fillStyle = item.color
  if (item.kind === 'stroke') {
    if (item.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = item.size * 5
    } else if (item.tool === 'highlighter') {
      ctx.globalAlpha = 0.35
      ctx.lineWidth = item.size * 4
    } else {
      ctx.lineWidth = item.size
    }
    strokePath(ctx, item.points)
  } else if (item.kind === 'shape') {
    ctx.lineWidth = item.size
    const [x1, y1] = item.from
    const [x2, y2] = item.to
    ctx.beginPath()
    if (item.shape === 'rect') {
      ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
    } else if (item.shape === 'ellipse') {
      ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2)
    } else {
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      if (item.shape === 'arrow') {
        const angle = Math.atan2(y2 - y1, x2 - x1)
        const head = Math.max(22, item.size * 4)
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6))
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6))
      }
    }
    ctx.stroke()
  } else {
    const px = fontPx(item.size)
    ctx.font = `500 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`
    ctx.textBaseline = 'top'
    item.text.split('\n').forEach((line, index) => ctx.fillText(line, item.at[0], item.at[1] + index * px * 1.25))
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Saved in this browser for the day

function loadPages(storageKey: string): Page[] | null {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return parsed.filter((page): page is Page => Array.isArray((page as Page)?.items))
  } catch {
    return null
  }
}

function savePages(storageKey: string, pages: Page[]) {
  try {
    const prefix = storageKey.slice(0, storageKey.indexOf('.', 'h7lms.whiteboard.'.length) + 1)
    // Yesterday's boards are not wanted any more.
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i)
      if (key?.startsWith('h7lms.whiteboard.') && key !== storageKey && !key.startsWith(prefix)) {
        window.localStorage.removeItem(key)
      }
    }
    const empty = pages.length === 1 && pages[0].items.length === 0
    if (empty) window.localStorage.removeItem(storageKey)
    else window.localStorage.setItem(storageKey, JSON.stringify(pages))
  } catch {
    // A full or blocked storage only costs the copy kept for a reload.
  }
}

// ---------------------------------------------------------------------------

export interface WhiteboardProps {
  /** `h7lms.whiteboard.<date>.<class>`: where this board is kept in this browser. */
  storageKey: string
  /** The canvas the call page sends to the class. */
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>
  /** On screen. A closed board stays mounted so its pages survive. */
  open: boolean
  /** Whether the class can see the board right now. */
  shared: boolean
  /** The call is connected, so the board can be shown. */
  canShare: boolean
  sharing: boolean
  onShare: () => void
  onStopSharing: () => void
  onClose: () => void
  className?: string
}

export function Whiteboard({
  storageKey,
  canvasRef,
  open,
  shared,
  canShare,
  sharing,
  onShare,
  onStopSharing,
  onClose,
  className,
}: WhiteboardProps) {
  const [history, dispatch] = React.useReducer(historyReducer, undefined, () => ({
    past: [],
    present: loadPages(storageKey) ?? [blankPage()],
    future: [],
  }))
  const pages = history.present
  const [pageIndex, setPageIndex] = React.useState(0)
  const index = Math.min(pageIndex, pages.length - 1)
  const page = pages[index]

  const [tool, setTool] = React.useState<Tool>('pen')
  const [color, setColor] = React.useState(page.background === 'chalk' ? '#ffffff' : COLORS[0])
  const [size, setSize] = React.useState(SIZES[1].size)
  const [textDraft, setTextDraft] = React.useState<{ at: Point; value: string; color: string; size: number } | null>(
    null,
  )

  const stageRef = React.useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = React.useState(0)
  const layerRef = React.useRef<HTMLCanvasElement | null>(null)
  const draftRef = React.useRef<Item | null>(null)
  const pointerRef = React.useRef<number | null>(null)
  const pageRef = React.useRef(page)
  pageRef.current = page
  const frameRef = React.useRef(0)

  const paint = React.useCallback(() => {
    frameRef.current = 0
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    // Ink goes on its own layer so the eraser removes ink, not the paper.
    if (!layerRef.current) {
      layerRef.current = document.createElement('canvas')
      layerRef.current.width = BOARD_WIDTH
      layerRef.current.height = BOARD_HEIGHT
    }
    const layer = layerRef.current.getContext('2d')
    if (!layer) return
    layer.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
    for (const item of pageRef.current.items) drawItem(layer, item)
    if (draftRef.current) drawItem(layer, draftRef.current)
    paintBackground(ctx, pageRef.current.background)
    ctx.drawImage(layerRef.current, 0, 0)
  }, [canvasRef])

  const requestPaint = React.useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(paint)
  }, [paint])

  React.useEffect(() => {
    paint()
  }, [page, paint])

  React.useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  // A shared canvas only sends a picture when it is drawn on, so keep drawing
  // it while the class watches: someone who joins late still gets the board.
  React.useEffect(() => {
    if (!shared) return
    const timer = window.setInterval(paint, 250)
    return () => window.clearInterval(timer)
  }, [shared, paint])

  React.useEffect(() => {
    const timer = window.setTimeout(() => savePages(storageKey, pages), 600)
    return () => window.clearTimeout(timer)
  }, [storageKey, pages])

  // Fit the 16:9 board into whatever room the panel has.
  React.useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setScale(Math.max(0, Math.min(width / BOARD_WIDTH, height / BOARD_HEIGHT)))
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  // Changes go through the reducer as functions of the latest pages, so two in
  // one click (the open text box, then a new page) both land.
  const commitPage = (change: (page: Page) => Page) =>
    dispatch({ type: 'commit', update: (all) => all.map((p, i) => (i === index ? change(p) : p)) })
  const addItem = (item: Item) => commitPage((p) => ({ ...p, items: [...p.items, item] }))

  const commitText = () => {
    if (!textDraft) return
    const text = textDraft.value.replace(/\s+$/, '')
    setTextDraft(null)
    if (text) addItem({ kind: 'text', color: textDraft.color, size: textDraft.size, at: textDraft.at, text })
  }

  const undo = React.useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = React.useCallback(() => dispatch({ type: 'redo' }), [])

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        redo()
      }
    }
    if (!open) return
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, undo, redo])

  const toBoard = (event: React.PointerEvent | PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return [
      Math.round(((event.clientX - rect.left) / rect.width) * BOARD_WIDTH),
      Math.round(((event.clientY - rect.top) / rect.height) * BOARD_HEIGHT),
    ]
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (pointerRef.current !== null) return
    const point = toBoard(event)
    if (tool === 'text') {
      event.preventDefault()
      if (textDraft) commitText()
      setTextDraft({ at: point, value: '', color, size })
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    pointerRef.current = event.pointerId
    if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
      draftRef.current = { kind: 'stroke', tool, color, size, points: [point] }
    } else {
      draftRef.current = { kind: 'shape', shape: tool, color, size, from: point, to: point }
    }
    requestPaint()
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const draft = draftRef.current
    if (!draft || event.pointerId !== pointerRef.current) return
    if (draft.kind === 'stroke') {
      const events = event.nativeEvent.getCoalescedEvents?.() ?? []
      for (const e of events.length ? events : [event.nativeEvent]) {
        const point = toBoard(e)
        const last = draft.points[draft.points.length - 1]
        if (point[0] !== last[0] || point[1] !== last[1]) draft.points.push(point)
      }
    } else if (draft.kind === 'shape') {
      draft.to = toBoard(event)
    }
    requestPaint()
  }

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerId !== pointerRef.current) return
    pointerRef.current = null
    const draft = draftRef.current
    draftRef.current = null
    if (!draft) return
    const tiny =
      draft.kind === 'shape' && Math.hypot(draft.to[0] - draft.from[0], draft.to[1] - draft.from[1]) < 4
    if (tiny) {
      requestPaint()
      return
    }
    addItem(draft)
  }

  const setBackground = (background: Background) => {
    commitPage((p) => (p.background === background ? p : { ...p, background }))
    // Dark ink disappears on a chalkboard, and white ink on paper.
    if (background === 'chalk' && color === COLORS[0]) setColor('#ffffff')
    if (background !== 'chalk' && color === '#ffffff') setColor(COLORS[0])
  }

  const goToPage = (next: number) => {
    commitText()
    setPageIndex(Math.max(0, Math.min(pages.length - 1, next)))
  }

  const addPage = () => {
    commitText()
    dispatch({
      type: 'commit',
      update: (all) => [...all.slice(0, index + 1), blankPage(all[index].background), ...all.slice(index + 1)],
    })
    setPageIndex(index + 1)
  }

  const clearPage = () => commitPage((p) => (p.items.length ? { ...p, items: [] } : p))

  const deletePage = () => {
    if (pages.length === 1) return clearPage()
    dispatch({ type: 'commit', update: (all) => all.filter((_, i) => i !== index) })
    setPageIndex(Math.max(0, index - 1))
  }

  const download = () => {
    paint()
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `whiteboard-page-${index + 1}.png`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  }

  const toolButton = (active: boolean) =>
    cn(
      'grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4',
      active && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
    )

  return (
    <section className={cn('min-h-0 min-w-0 flex-col bg-muted/40', open ? 'flex' : 'hidden', className)} aria-label="Whiteboard">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border bg-card px-2 py-1.5 sm:px-3">
        <div className="flex items-center gap-0.5" role="toolbar" aria-label="Drawing tools">
          {TOOLS.map((t) => (
            <InfoTip key={t.tool} label={t.label} side="bottom">
              <button
                type="button"
                className={toolButton(tool === t.tool)}
                aria-label={t.label}
                aria-pressed={tool === t.tool}
                onClick={() => {
                  if (t.tool !== 'text') commitText()
                  setTool(t.tool)
                }}
              >
                {t.icon}
              </button>
            </InfoTip>
          ))}
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-1" role="radiogroup" aria-label="Colour">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={`Colour ${c}`}
              onClick={() => setColor(c)}
              className={cn(
                'size-6 rounded-full border border-border shadow-xs transition-transform hover:scale-110',
                color === c && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          <InfoTip label="Any colour" side="bottom">
            <label
              className="relative size-6 cursor-pointer overflow-hidden rounded-full border border-border"
              style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
            >
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Any colour"
              />
            </label>
          </InfoTip>
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Thickness">
          {SIZES.map((s) => (
            <InfoTip key={s.size} label={s.label} side="bottom">
              <button
                type="button"
                role="radio"
                aria-checked={size === s.size}
                aria-label={s.label}
                className={toolButton(size === s.size)}
                onClick={() => setSize(s.size)}
              >
                <span className="rounded-full bg-current" style={{ width: s.size + 3, height: s.size + 3 }} />
              </button>
            </InfoTip>
          ))}
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-0.5">
          <InfoTip label="Undo (Ctrl+Z)" side="bottom">
            <button type="button" className={toolButton(false)} onClick={undo} disabled={!history.past.length} aria-label="Undo">
              <Undo2 />
            </button>
          </InfoTip>
          <InfoTip label="Redo (Ctrl+Y)" side="bottom">
            <button type="button" className={toolButton(false)} onClick={redo} disabled={!history.future.length} aria-label="Redo">
              <Redo2 />
            </button>
          </InfoTip>
          <InfoTip label="Clear this page" side="bottom">
            <button type="button" className={toolButton(false)} onClick={clearPage} aria-label="Clear this page">
              <Trash2 />
            </button>
          </InfoTip>
          <DropdownMenu>
            <InfoTip label="Paper" side="bottom">
              <DropdownMenuTrigger asChild>
                <button type="button" className={toolButton(false)} aria-label="Paper">
                  <Grid3x3 />
                </button>
              </DropdownMenuTrigger>
            </InfoTip>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Paper</DropdownMenuLabel>
              {BACKGROUNDS.map((b) => (
                <DropdownMenuItem key={b.value} onSelect={() => setBackground(b.value)}>
                  <span className={cn('size-2 rounded-full', page.background === b.value ? 'bg-primary' : 'bg-transparent')} />
                  {b.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={deletePage}>
                <Trash2 className="size-4" />
                {pages.length > 1 ? 'Delete this page' : 'Clear this page'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <InfoTip label="Save this page as a picture" side="bottom">
            <button type="button" className={toolButton(false)} onClick={download} aria-label="Save this page as a picture">
              <Download />
            </button>
          </InfoTip>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {shared ? (
            <span className="hidden items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success sm:inline-flex">
              <Eye className="size-3.5" />
              The class can see the board
            </span>
          ) : (
            <span className="hidden items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning sm:inline-flex">
              <EyeOff className="size-3.5" />
              Only you can see this
            </span>
          )}
          {shared ? (
            <Button variant="outline" size="sm" icon={<EyeOff />} onClick={onStopSharing}>
              Hide
            </Button>
          ) : (
            <Button variant="solid" size="sm" icon={<Eye />} loading={sharing} disabled={!canShare} onClick={onShare}>
              Show to class
            </Button>
          )}
          <InfoTip label="Close the whiteboard" side="bottom">
            <button type="button" className={toolButton(false)} onClick={onClose} aria-label="Close the whiteboard">
              <X />
            </button>
          </InfoTip>
        </div>
      </div>

      <div ref={stageRef} className="relative grid min-h-0 min-w-0 flex-1 place-items-center overflow-hidden p-2 sm:p-3">
        <div
          className="relative overflow-hidden rounded-lg shadow-md ring-1 ring-border"
          style={{ width: BOARD_WIDTH * scale, height: BOARD_HEIGHT * scale }}
        >
          <canvas
            ref={canvasRef}
            width={BOARD_WIDTH}
            height={BOARD_HEIGHT}
            className={cn('block size-full touch-none', tool === 'text' ? 'cursor-text' : 'cursor-crosshair')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {textDraft && (
            <textarea
              key={textDraft.at.join(',')}
              autoFocus
              value={textDraft.value}
              onChange={(event) => setTextDraft({ ...textDraft, value: event.target.value })}
              onBlur={commitText}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setTextDraft(null)
                else if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  commitText()
                }
              }}
              placeholder="Type here"
              rows={Math.max(1, textDraft.value.split('\n').length)}
              className="absolute resize-none overflow-hidden border border-dashed border-primary bg-transparent p-0 font-medium leading-[1.25] outline-none placeholder:text-muted-foreground/60"
              style={{
                left: textDraft.at[0] * scale,
                top: textDraft.at[1] * scale,
                color: textDraft.color,
                fontSize: fontPx(textDraft.size) * scale,
                fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
                minWidth: 160 * scale,
                width: `${Math.max(8, ...textDraft.value.split('\n').map((l) => l.length + 2))}ch`,
                maxWidth: BOARD_WIDTH * scale - textDraft.at[0] * scale,
              }}
            />
          )}
        </div>

        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card/95 px-1.5 py-1 text-xs shadow-sm backdrop-blur">
          <button
            type="button"
            className={cn(toolButton(false), 'size-7 rounded-full')}
            onClick={() => goToPage(index - 1)}
            disabled={index === 0}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </button>
          <span className="min-w-20 text-center tabular-nums text-muted-foreground">
            Page {index + 1} of {pages.length}
          </span>
          <button
            type="button"
            className={cn(toolButton(false), 'size-7 rounded-full')}
            onClick={() => goToPage(index + 1)}
            disabled={index === pages.length - 1}
            aria-label="Next page"
          >
            <ChevronRight />
          </button>
          <InfoTip label="New page" side="top">
            <button type="button" className={cn(toolButton(false), 'size-7 rounded-full')} onClick={addPage} aria-label="New page">
              <Plus />
            </button>
          </InfoTip>
        </div>
      </div>
    </section>
  )
}

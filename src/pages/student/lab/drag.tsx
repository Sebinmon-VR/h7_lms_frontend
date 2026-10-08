import * as React from 'react'
import { createPortal } from 'react-dom'

import type { DragPayload, DropTarget } from './useLabSim'

/**
 * Pointer-based drag and drop that works the same with a mouse, a pen or a
 * finger (HTML5 drag events do not fire for touch). A press that does not
 * travel is a tap. Inside scrolling lists, touch drags start on a short
 * long-press so the list still scrolls with a swipe.
 *
 * Drop targets are plain elements carrying `data-drop="vessel|burner|bench"`
 * and `data-uid`; the topmost one under the pointer wins.
 */

interface DragState {
  payload: DragPayload
  x: number
  y: number
  over: DropTarget
}

interface StartOptions {
  /** On touch, wait for a long-press so the surrounding list can scroll. */
  touchDelay?: boolean
  onTap?: () => void
}

interface DragApi {
  drag: DragState | null
  start: (e: React.PointerEvent, payload: DragPayload, opts?: StartOptions) => void
}

const Ctx = React.createContext<DragApi>({ drag: null, start: () => {} })

export function useDrag() {
  return React.useContext(Ctx)
}

const uidOf = (p: DragPayload) => (p.type === 'item' ? p.uid : null)

export function hitTest(x: number, y: number, payload: DragPayload | null): DropTarget {
  const bench = document.querySelector<HTMLElement>('[data-lab-bench]')
  let bx: number | null = null
  if (bench) {
    const r = bench.getBoundingClientRect()
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) bx = (x - r.left) / r.width
  }
  const self = payload ? uidOf(payload) : null
  for (const el of document.elementsFromPoint(x, y)) {
    const h = el as HTMLElement
    const kind = h.dataset?.drop
    if (!kind) continue
    if (self && h.dataset.uid === self) continue
    if (kind === 'vessel' || kind === 'burner') return { kind, uid: h.dataset.uid, x: bx }
    if (kind === 'bench') return { kind: 'bench', x: bx }
  }
  return { kind: bx == null ? 'none' : 'bench', x: bx }
}

export function DragProvider({
  children,
  onDrop,
  renderGhost,
}: {
  children: React.ReactNode
  onDrop: (payload: DragPayload, target: DropTarget) => void
  renderGhost: (payload: DragPayload) => React.ReactNode
}) {
  const [drag, setDrag] = React.useState<DragState | null>(null)
  const dropRef = React.useRef(onDrop)
  dropRef.current = onDrop
  const cleanupRef = React.useRef<(() => void) | null>(null)

  React.useEffect(() => () => cleanupRef.current?.(), [])

  const start = React.useCallback((e: React.PointerEvent, payload: DragPayload, opts: StartOptions = {}) => {
    if (e.button !== 0) return
    cleanupRef.current?.()
    const sx = e.clientX
    const sy = e.clientY
    const pid = e.pointerId
    const touch = e.pointerType === 'touch'
    const delayed = touch && !!opts.touchDelay
    let active = false
    let dead = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = { x: sx, y: sy }

    const activate = () => {
      if (active || dead) return
      active = true
      document.body.style.userSelect = 'none'
      setDrag({ payload, x: last.x, y: last.y, over: hitTest(last.x, last.y, payload) })
      if (touch && 'vibrate' in navigator) navigator.vibrate?.(8)
    }
    if (delayed) timer = setTimeout(activate, 260)

    const blockScroll = (ev: TouchEvent) => {
      if (active) ev.preventDefault()
    }
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return
      last = { x: ev.clientX, y: ev.clientY }
      if (!active) {
        const dist = Math.hypot(ev.clientX - sx, ev.clientY - sy)
        if (dist > 7) {
          if (delayed) {
            // A swipe before the long-press: let the list scroll.
            dead = true
            cleanup()
          } else activate()
        }
        return
      }
      setDrag({ payload, x: ev.clientX, y: ev.clientY, over: hitTest(ev.clientX, ev.clientY, payload) })
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return
      const wasActive = active
      cleanup()
      if (wasActive) dropRef.current(payload, hitTest(ev.clientX, ev.clientY, payload))
      else if (!dead) opts.onTap?.()
    }
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return
      dead = true
      cleanup()
    }
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        dead = true
        cleanup()
      }
    }
    function cleanup() {
      clearTimeout(timer)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key)
      document.removeEventListener('touchmove', blockScroll)
      document.body.style.userSelect = ''
      cleanupRef.current = null
      setDrag(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key)
    document.addEventListener('touchmove', blockScroll, { passive: false })
    cleanupRef.current = cleanup
  }, [])

  const api = React.useMemo(() => ({ drag, start }), [drag, start])

  return (
    <Ctx.Provider value={api}>
      {children}
      {drag &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed left-0 top-0 z-[80]"
            style={{ transform: `translate(${drag.x}px, ${drag.y}px)` }}
          >
            <div className="-translate-x-1/2 -translate-y-[70%] drop-shadow-[0_18px_22px_rgba(0,0,0,0.35)]">{renderGhost(drag.payload)}</div>
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  )
}

/** Click handler for keyboard activation only (pointer taps come through the drag controller). */
export function keyboardOnly(fn: () => void) {
  return (e: React.MouseEvent) => {
    if (e.detail === 0) fn()
  }
}

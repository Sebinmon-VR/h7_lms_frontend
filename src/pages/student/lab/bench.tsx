import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { MousePointerClick, Sparkles } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/cn'
import { Bottle, BOTTLE_H, BOTTLE_MOUTH_Y, BOTTLE_W } from './bottle'
import { BurnerArt } from './burner'
import { Dock } from './dock'
import { keyboardOnly, useDrag } from './drag'
import { REAGENT_BY_ID } from './engine/substances'
import { VesselArt } from './glassware'
import type { VesselKind } from './engine/sim'
import { BURNER, SHAPES, TOOL_SIZE, clamp, isTube, isVesselKind, mouthPoint, rgba, type BenchMetrics, type Placed, type RGB, type ToolKind } from './geometry'
import { EquipmentIcon, LitmusG, LoopG, RestingTool, SplintG } from './tools'
import { liquidTint, phColor, useLabFrame, useLabVersion, volumeMl, type BenchItem, type DragPayload, type Effect, type Lab } from './useLabSim'

/**
 * The bench scene: a dark resin worktop against a tiled wall under warm lab
 * light, with everything the student has put out standing on it. Glassware,
 * burners and tools are SVG; bubbles, steam and glow come from one canvas
 * laid over the top; pours and tests are short animations drawn from the
 * lab's clock so they stay in step with the chemistry.
 */

const ease = (x: number) => x * x * (3 - 2 * x)
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1)

export function Bench({ lab, className }: { lab: Lab; className?: string }) {
  useLabVersion(lab)
  useLabFrame(lab)
  const reduce = useReducedMotion()
  lab.reduced = !!reduce
  const rootRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = React.useState<string | null>(null)
  const { drag } = useDrag()

  React.useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () => lab.setSize(el.clientWidth, el.clientHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [lab])

  React.useEffect(() => {
    lab.attachCanvas(canvasRef.current)
    return () => lab.attachCanvas(null)
  }, [lab])

  const m = lab.metrics()
  const sorted = [...lab.items].filter((it) => lab.placed.has(it.uid)).sort((a, b) => zOf(a) - zOf(b))
  const focus = lab.ui.selected ?? hover
  const showToast = lab.toast && lab.t - lab.toast.at < 5.5

  return (
    <div
      ref={rootRef}
      data-lab-bench
      data-drop="bench"
      className={cn('relative isolate select-none overflow-hidden rounded-2xl bg-[#1d2227] shadow-[0_10px_40px_-12px_rgba(0,0,0,0.6)]', className)}
      style={{ touchAction: 'pan-y' }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) lab.tapBench()
      }}
    >
      <LabStyles />
      <Backdrop m={m} />

      {sorted.map((it) => (
        <ItemView key={it.uid} lab={lab} it={it} p={lab.placed.get(it.uid)!} m={m} setHover={setHover} dragActive={!!drag} />
      ))}

      <svg className="pointer-events-none absolute inset-0 z-[20]" width={m.W} height={m.H} aria-hidden>
        <DeliveryTubes lab={lab} />
        {lab.effects.map((e) => (
          <EffectSvg key={e.id} lab={lab} e={e} m={m} />
        ))}
      </svg>

      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[30] h-full w-full" aria-hidden />

      <div className="pointer-events-none absolute inset-0 z-[35]">
        {lab.effects.map((e) => (
          <EffectHtml key={e.id} lab={lab} e={e} m={m} />
        ))}
        <Readouts lab={lab} focus={drag ? null : focus} />
      </div>

      <AnimatePresence>
        {showToast && lab.toast && (
          <motion.div
            key={lab.toast.id}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: reduce ? 0 : 0.25 }}
            className="pointer-events-none absolute left-1/2 top-2.5 z-[50] w-[min(92%,26rem)] -translate-x-1/2 rounded-xl bg-card/90 px-3 py-2 text-foreground shadow-lg backdrop-blur-md sm:top-3"
            role="status"
          >
            <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-primary">
              <Sparkles className="size-3.5" />
              {lab.toast.title}
            </div>
            <p className="mt-0.5 text-xs leading-snug text-foreground/90">{lab.toast.text}</p>
            {lab.toast.equation && <code className="mt-1 inline-block rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{lab.toast.equation}</code>}
          </motion.div>
        )}
      </AnimatePresence>

      {lab.items.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-[34%] z-[5] flex flex-col items-center gap-2 px-6 text-center text-white/75">
          <MousePointerClick className="size-7 opacity-80" />
          <p className="text-sm font-bold">Drag glassware onto the bench to begin</p>
          <p className="max-w-xs text-xs text-white/55">Or tap anything on the equipment shelf to set it out.</p>
        </div>
      )}

      <Dock lab={lab} />
    </div>
  )
}

function zOf(it: BenchItem) {
  if (it.kind === 'burner') return 2
  if (isVesselKind(it.kind)) return it.onBurner ? 4 : 3
  return 6
}

// ------------------------------------------------------------------ scene

function Backdrop({ m }: { m: BenchMetrics }) {
  const shelfY = m.backY * 0.3
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* tiled wall under a warm lamp */}
      <div
        className="absolute inset-x-0 top-0"
        style={{
          height: m.backY + 2,
          backgroundColor: '#323a41',
          backgroundImage: [
            'radial-gradient(75% 95% at 50% -18%, rgba(255,222,176,0.34), transparent 68%)',
            'linear-gradient(180deg, rgba(0,0,0,0) 62%, rgba(0,0,0,0.42) 100%)',
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0 1px, rgba(255,255,255,0.025) 1px 2px, transparent 2px 34px)',
            'repeating-linear-gradient(90deg, rgba(0,0,0,0.16) 0 1px, rgba(255,255,255,0.02) 1px 2px, transparent 2px 68px)',
            'linear-gradient(180deg, #3d464e, #262c32)',
          ].join(','),
        }}
      />
      {/* a shelf of stock bottles, out of focus */}
      {m.backY > 150 && (
        <div className="absolute inset-x-0" style={{ top: shelfY }}>
          <div className="absolute inset-x-[6%] flex items-end justify-between" style={{ bottom: 0, height: 60, filter: 'blur(2px)', opacity: 0.55 }}>
            {SHELF_BOTTLES.map((b, i) => (
              <div
                key={i}
                style={{
                  width: b.w,
                  height: b.h,
                  borderRadius: `${b.w / 3}px ${b.w / 3}px 4px 4px`,
                  background: `linear-gradient(90deg, rgba(255,255,255,0.25), ${b.c} 30%, ${b.c} 70%, rgba(0,0,0,0.3))`,
                }}
              />
            ))}
          </div>
          <div className="absolute inset-x-[3%] h-2 rounded-sm" style={{ top: 0, background: 'linear-gradient(#6b4a2f, #3e2a1b)', boxShadow: '0 8px 16px rgba(0,0,0,0.45)' }} />
        </div>
      )}
      {/* worktop */}
      <div
        className="absolute inset-x-0"
        style={{
          top: m.backY,
          height: m.frontY - m.backY,
          backgroundImage: [
            'linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0) 32%)',
            'radial-gradient(55% 160% at 50% 0%, rgba(255,226,190,0.13), transparent 70%)',
            'linear-gradient(180deg, #2a3035 0%, #1b1f23 45%, #121518 100%)',
          ].join(','),
        }}
      />
      <div className="absolute inset-x-0" style={{ top: m.frontY - 1, height: 2, background: 'rgba(255,255,255,0.13)' }} />
      <div className="absolute inset-x-0 bottom-0" style={{ top: m.frontY + 1, background: 'linear-gradient(180deg, #15181b, #090a0c)' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(0,0,0,0.38))' }} />
    </div>
  )
}

const SHELF_BOTTLES = [
  { w: 20, h: 40, c: 'rgba(150,85,25,0.85)' },
  { w: 26, h: 52, c: 'rgba(80,140,210,0.6)' },
  { w: 16, h: 34, c: 'rgba(220,230,240,0.45)' },
  { w: 30, h: 44, c: 'rgba(60,150,90,0.6)' },
  { w: 18, h: 50, c: 'rgba(200,70,60,0.6)' },
  { w: 24, h: 38, c: 'rgba(150,85,25,0.75)' },
  { w: 20, h: 46, c: 'rgba(230,200,80,0.55)' },
  { w: 28, h: 56, c: 'rgba(210,225,240,0.4)' },
]

function LabStyles() {
  return (
    <style>{`
@keyframes lab-flicker { 0%,100% { transform: scale(1,1) skewX(0deg) } 25% { transform: scale(0.97,1.05) skewX(1.5deg) } 50% { transform: scale(1.03,0.96) skewX(-1deg) } 75% { transform: scale(0.98,1.03) skewX(0.8deg) } }
@keyframes lab-ember { 0%,100% { opacity: .7 } 50% { opacity: 1 } }
@keyframes lab-pulse { 0%,100% { filter: drop-shadow(0 0 3px hsl(var(--primary) / .55)) } 50% { filter: drop-shadow(0 0 9px hsl(var(--primary) / .9)) } }
.lab-flicker { animation: lab-flicker .16s linear infinite }
.lab-flicker-slow { animation: lab-flicker .7s ease-in-out infinite }
.lab-ember { animation: lab-ember .9s ease-in-out infinite }
.lab-target { animation: lab-pulse 1.2s ease-in-out infinite }
@media (prefers-reduced-motion: reduce) { .lab-flicker, .lab-flicker-slow, .lab-ember, .lab-target { animation: none } }
`}</style>
  )
}

// ------------------------------------------------------------------ items

function isTargetFor(lab: Lab, it: BenchItem) {
  const a = lab.ui.armed
  if (!a) return false
  const vessel = isVesselKind(it.kind)
  switch (a.type) {
    case 'reagent':
      return vessel
    case 'pour':
      return vessel && it.uid !== a.from
    case 'connect':
      return vessel && it.uid !== a.from
    case 'tool':
      return a.target === 'burner' ? it.kind === 'burner' : vessel
  }
}

function ItemView({ lab, it, p, m, setHover, dragActive }: { lab: Lab; it: BenchItem; p: Placed; m: BenchMetrics; setHover: (uid: string | null) => void; dragActive: boolean }) {
  const { drag, start } = useDrag()
  const dragging = drag?.payload.type === 'item' && drag.payload.uid === it.uid
  const over = !!drag && !dragging && drag.over.uid === it.uid
  const selected = lab.ui.selected === it.uid
  const prompted = lab.ui.prompt && (lab.ui.prompt.type === 'add' ? lab.ui.prompt.vessel === it.uid : lab.ui.prompt.to === it.uid || lab.ui.prompt.from === it.uid)
  const source = lab.ui.armed && (('from' in lab.ui.armed && lab.ui.armed.from === it.uid) || ('uid' in lab.ui.armed && lab.ui.armed.uid === it.uid))
  const target = isTargetFor(lab, it)
  const busyTool = lab.effects.some((e) => e.tool === it.uid)
  const vessel = isVesselKind(it.kind)
  const d = vessel ? lab.display.get(it.uid) : undefined
  const v = vessel ? lab.vessel(it.uid) : undefined
  const thermo = vessel ? lab.thermometerIn(it.uid) : undefined
  const onBench = !p.onBurner && !p.lifted
  const s = p.s

  let art: React.ReactNode = null
  if (vessel) {
    art = (
      <VesselArt
        kind={it.kind as VesselKind}
        s={s}
        d={d}
        t={lab.t}
        tilt={p.tilt}
        rack={isTube(it.kind) && onBench}
        clampDrop={isTube(it.kind) && p.onBurner ? (m.y0 - p.bottom) / s : null}
        thermometer={thermo && d ? d.temp : null}
        seed={it.uid}
      />
    )
  } else if (it.kind === 'burner') {
    const held = lab.vesselOn(it.uid)
    art = <BurnerArt s={s} lit={it.lit} power={it.power} holding={held ? (isTube(held.kind) ? 'tube' : 'vessel') : 'none'} flameTest={it.flameTest?.color ?? null} />
  } else {
    art = (
      <RestingTool
        kind={it.kind as ToolKind}
        s={s}
        splint={it.splint}
        paper={it.litmus}
        paperNow={it.litmusNow}
        sample={it.sample ? it.sample.color ?? 'clean' : null}
        hidden={busyTool}
      />
    )
  }

  const glow = over
    ? 'drop-shadow(0 0 10px hsl(var(--success))) drop-shadow(0 0 2px hsl(var(--success)))'
    : selected || prompted || source
      ? 'drop-shadow(0 0 7px hsl(var(--primary) / 0.95))'
      : undefined

  const label = vessel && v ? `${it.label}, ${Math.round(volumeMl(v))} millilitres, ${Math.round(v.temp)} degrees` : it.kind === 'burner' ? `${it.label}, ${it.lit ? 'lit' : 'off'}` : it.label

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      data-drop={vessel ? 'vessel' : it.kind === 'burner' ? 'burner' : undefined}
      data-uid={it.uid}
      className="absolute rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        left: p.left,
        top: p.top,
        width: p.w,
        height: p.h,
        zIndex: p.lifted ? 15 : zOf(it) + (selected ? 6 : 0),
        transform: p.tilt ? `rotate(${p.tilt}deg)` : undefined,
        opacity: dragging ? 0.3 : 1,
        transition: p.lifted || dragActive ? 'opacity 120ms' : 'left 220ms cubic-bezier(.2,.8,.2,1), top 220ms cubic-bezier(.2,.8,.2,1), opacity 120ms',
        cursor: dragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
        start(e, { type: 'item', uid: it.uid }, { onTap: () => lab.tapItem(it.uid) })
      }}
      onClick={keyboardOnly(() => lab.tapItem(it.uid))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          lab.tapItem(it.uid)
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          lab.move(it.uid, it.x + (e.key === 'ArrowLeft' ? -0.03 : 0.03))
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          lab.remove(it.uid)
        } else if (e.key === 'Escape') lab.cancel()
      }}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(it.uid)}
      onPointerLeave={() => setHover(null)}
    >
      {onBench && !busyTool && (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{ left: '6%', right: '6%', bottom: -5 * s, height: 11 * s, background: 'radial-gradient(closest-side, rgba(0,0,0,0.6), transparent)' }}
        />
      )}
      {onBench && d && d.wet && d.liquidA > 0.22 && (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{ left: '-10%', right: '-10%', bottom: -8 * s, height: 16 * s, background: `radial-gradient(closest-side, ${rgba(d.liquid, 0.32)}, transparent)`, mixBlendMode: 'screen' }}
        />
      )}
      <div
        className={cn(target && !over && 'lab-target')}
        style={{
          filter: glow,
          WebkitBoxReflect: onBench && !dragging && !busyTool ? 'below 0px linear-gradient(transparent 62%, rgba(255,255,255,0.14))' : undefined,
        } as React.CSSProperties}
      >
        {art}
      </div>
      {/* While dragging, the space just above a vessel's mouth counts as the vessel. */}
      {dragActive && !dragging && (vessel || it.kind === 'burner') && (
        <div data-drop={vessel ? 'vessel' : 'burner'} data-uid={it.uid} className="absolute inset-x-[-6px]" style={{ top: -46 * s, height: 46 * s }} />
      )}
    </div>
  )
}

// ------------------------------------------------------------------ tubes

function DeliveryTubes({ lab }: { lab: Lab }) {
  const out: React.ReactNode[] = []
  for (const v of lab.vessels.values()) {
    if (!v.deliverTo) continue
    const gs = lab.geoms.get(v.id)
    const gt = lab.geoms.get(v.deliverTo)
    const ps = lab.placed.get(v.id)
    const pt = lab.placed.get(v.deliverTo)
    if (!gs || !gt || !ps || !pt || ps.lifted || pt.lifted) continue
    const s = gs.s
    const sx = gs.cx
    const sy = gs.mouthY + 4 * s
    const outlet = lab.outletFor(v.deliverTo, gt) ?? { x: gt.cx, y: gt.bottomY - 10 * s }
    const tx = outlet.x
    const ty = outlet.y
    const top = Math.min(gs.mouthY, gt.mouthY) - 30 * s
    const r = 10 * s
    const dir = tx >= sx ? 1 : -1
    const path = `M${sx} ${sy} L${sx} ${top + r} Q${sx} ${top} ${sx + dir * r} ${top} L${tx - dir * r} ${top} Q${tx} ${top} ${tx} ${top + r} L${tx} ${ty}`
    const bw = gs.mouthHalf * 2 + 3 * s
    const by = gs.mouthY - 3 * s
    out.push(
      <g key={v.id}>
        <path d={path} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={7 * s} strokeLinejoin="round" strokeLinecap="round" />
        <path d={path} fill="none" stroke="rgba(205,228,245,0.42)" strokeWidth={5.4 * s} strokeLinejoin="round" strokeLinecap="round" />
        <path d={path} fill="none" stroke="rgba(20,30,40,0.35)" strokeWidth={2.4 * s} strokeLinejoin="round" />
        <path d={path} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={0.9 * s} strokeLinejoin="round" transform={`translate(${-1.4 * s} ${-1.2 * s})`} />
        <path
          d={`M${sx - bw / 2 - 1.5 * s} ${by} L${sx + bw / 2 + 1.5 * s} ${by} L${sx + bw / 2 - 1 * s} ${by + 11 * s} L${sx - bw / 2 + 1 * s} ${by + 11 * s} Z`}
          fill="#3b302b"
        />
        <rect x={sx - bw / 2 - 1.5 * s} y={by} width={bw + 3 * s} height={2 * s} fill="rgba(255,255,255,0.18)" />
      </g>,
    )
  }
  return <>{out}</>
}

// ------------------------------------------------------------------ effects

function stream(from: { x: number; y: number }, toY: number, p: number, a: number, b: number, color: RGB, alpha: number, s: number, key: string) {
  if (p < a || p > b) return null
  const fall = seg(p, a, a + 0.06)
  const stop = seg(p, b - 0.05, b)
  const y0 = from.y + (toY - from.y) * stop
  const y1 = from.y + (toY - from.y) * fall
  if (y1 <= y0) return null
  const x1 = from.x - 2 * s
  const col = liquidTint(color, alpha)
  const a2 = Math.max(0.5, Math.min(0.92, alpha + 0.35))
  const d = `M${from.x} ${y0} Q${from.x - 0.5 * s} ${(y0 + y1) / 2} ${x1} ${y1}`
  return (
    <g key={key}>
      <path d={d} fill="none" stroke={rgba(col, a2)} strokeWidth={3 * s} strokeLinecap="round" />
      <path d={d} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={0.8 * s} strokeLinecap="round" transform={`translate(${-0.7 * s} 0)`} />
    </g>
  )
}

/** Where a pouring bottle sits for an add effect, and which way it leans. */
function bottlePose(lab: Lab, e: Effect, m: BenchMetrics) {
  const g = lab.geoms.get(e.target)
  if (!g) return null
  const s = g.s
  const bs = s * 1.05
  const side = g.cx > m.W * 0.62 ? -1 : 1
  const full = side === 1 ? -108 : 108
  const d = (BOTTLE_H / 2 - BOTTLE_MOUTH_Y) * bs
  const M = { x: g.cx + side * g.mouthHalf * 0.25, y: g.mouthY - 7 * s }
  const rad = (full * Math.PI) / 180
  const c = { x: M.x - d * Math.sin(rad), y: M.y + d * Math.cos(rad) }
  const p = clamp((lab.t - e.t0) / e.dur, 0, 1)
  const pin = ease(seg(p, 0, 0.22))
  const pt = ease(seg(p, 0.22, 0.32))
  const pout = ease(seg(p, 0.74, 1))
  return {
    g,
    p,
    M,
    bs,
    theta: full * (0.7 * pin + 0.3 * pt) * (1 - pout),
    x: c.x + side * 40 * s * (1 - pin) + side * 30 * s * pout,
    y: c.y - 60 * s * (1 - pin) - 40 * s * pout,
    opacity: Math.min(1, pin * 1.6, 1 - pout),
  }
}

function EffectSvg({ lab, e, m }: { lab: Lab; e: Effect; m: BenchMetrics }) {
  const p = clamp((lab.t - e.t0) / e.dur, 0, 1)
  const g = lab.geoms.get(e.target)
  if (e.kind === 'pour-bottle' && e.form !== 'solid' && (e.amount ?? 0) > 1) {
    const pose = bottlePose(lab, e, m)
    if (!pose) return null
    const stopY = pose.g.surfaceY ?? pose.g.bottomY - 2 * pose.g.s
    return stream(pose.M, stopY, p, 0.32, 0.74, e.color ?? [220, 235, 250], e.alpha ?? 0, pose.g.s, 'st')
  }
  if (e.kind === 'pour-vessel' && e.from && g) {
    const src = lab.placed.get(e.from)
    if (!src) return null
    const M = mouthPoint(src)
    const stopY = g.surfaceY ?? g.bottomY - 2 * g.s
    return stream(M, stopY, p, 0.4, 0.76, e.color ?? [220, 235, 250], e.alpha ?? 0, g.s, 'pv')
  }
  if (e.kind === 'stir' && g) {
    const s = g.s
    const fade = Math.min(seg(p, 0, 0.12), 1 - seg(p, 0.85, 1))
    const lvl = g.surfaceY ?? g.bottomY
    const x = g.cx + Math.sin(p * Math.PI * 7) * g.half(lvl) * 0.45
    return (
      <g opacity={fade}>
        <line x1={x + 12 * s} y1={g.mouthY - 36 * s} x2={x - 1 * s} y2={g.bottomY - 5 * s} stroke="rgba(215,232,245,0.55)" strokeWidth={3.4 * s} strokeLinecap="round" />
        <line x1={x + 11 * s} y1={g.mouthY - 36 * s} x2={x - 2 * s} y2={g.bottomY - 5 * s} stroke="rgba(255,255,255,0.8)" strokeWidth={0.8 * s} strokeLinecap="round" />
      </g>
    )
  }
  if (e.kind === 'splint' && g && p >= e.at) {
    const s = g.s
    const q = seg(p, e.at, e.at + 0.2)
    const T = { x: g.cx, y: g.mouthY - 2 * s }
    if (e.result === 'pop') {
      return (
        <g>
          <circle cx={T.x} cy={T.y} r={(8 + 46 * q) * s} fill={`rgba(255,250,235,${(1 - q) * 0.85})`} />
          <circle cx={T.x} cy={T.y} r={(10 + 70 * q) * s} fill="none" stroke={`rgba(255,255,255,${(1 - q) * 0.9})`} strokeWidth={2.2 * s} />
        </g>
      )
    }
    if (e.result === 'goes-out') {
      const k = seg(p, e.at + 0.05, e.at + 0.5)
      if (k <= 0 || k >= 1) return null
      return (
        <g opacity={1 - k}>
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={T.x + 30 * s + Math.sin(k * 6 + i) * 4 * s} cy={T.y - 40 * s - k * 50 * s - i * 9 * s} r={(4 + k * 10 + i * 2) * s} fill="rgba(200,200,205,0.35)" />
          ))}
        </g>
      )
    }
    if (e.result === 'relights') {
      return <circle cx={T.x} cy={T.y} r={(20 + 30 * q) * s} fill={`rgba(255,190,90,${(1 - q) * 0.45})`} />
    }
  }
  return null
}

function EffectHtml({ lab, e, m }: { lab: Lab; e: Effect; m: BenchMetrics }) {
  const p = clamp((lab.t - e.t0) / e.dur, 0, 1)
  const g = lab.geoms.get(e.target)

  if (e.kind === 'pour-bottle' && g) {
    const s = g.s
    const reagent = e.reagent ? REAGENT_BY_ID[e.reagent] : undefined
    if (!reagent) return null
    if (e.form === 'solid') {
      // A spatula tips the powder in.
      const pin = ease(seg(p, 0, 0.25))
      const pout = ease(seg(p, 0.7, 1))
      const tilt = -8 + 36 * ease(seg(p, 0.25, 0.38)) * (1 - ease(seg(p, 0.66, 0.78)))
      const L = 100
      const ss = s * 0.95
      const T = { x: g.cx + 4 * s - 40 * s * (1 - pin) - 30 * s * pout, y: g.mouthY - 12 * s - 30 * s * (1 - pin) - 40 * s * pout }
      const heap = 1 - seg(p, 0.34, 0.66)
      return (
        <div className="absolute" style={{ left: T.x - L * ss, top: T.y - 10 * ss, width: L * ss, height: 20 * ss, transformOrigin: `${L * ss}px ${10 * ss}px`, transform: `rotate(${tilt}deg)`, opacity: Math.min(1, pin * 1.5, 1 - pout) }}>
          <svg width={L * ss} height={20 * ss} viewBox={`0 -10 ${L} 20`} overflow="visible">
            <rect x={0} y={-3} width={42} height={6} rx={3} fill="#2b2f35" />
            <rect x={2} y={-2.4} width={38} height={1.4} rx={0.7} fill="rgba(255,255,255,0.22)" />
            <rect x={40} y={-1.2} width={42} height={2.4} rx={1} fill="#b8bec4" />
            <path d="M80 -3 L100 -2.2 Q101 0 100 2.2 L80 3 Z" fill="#cfd4d9" stroke="#8e959b" strokeWidth={0.5} />
            {heap > 0.02 && <ellipse cx={91} cy={-3 * heap} rx={7 * Math.sqrt(heap)} ry={3.6 * heap + 0.4} fill={rgba(e.color ?? [240, 240, 240], 1)} />}
          </svg>
        </div>
      )
    }
    if ((e.amount ?? 0) <= 1) {
      // A dropper for single drops.
      const pin = ease(seg(p, 0, 0.3))
      const pout = ease(seg(p, 0.72, 1))
      const squeeze = Math.sin(seg(p, 0.36, 0.56) * Math.PI)
      const ds = s * 0.9
      const T = { x: g.cx, y: g.mouthY - 8 * s - 50 * s * (1 - pin) - 50 * s * pout }
      const col = liquidTint(e.color, e.alpha)
      return (
        <div className="absolute" style={{ left: T.x - 7 * ds, top: T.y - 70 * ds, width: 14 * ds, height: 70 * ds, opacity: Math.min(1, pin * 1.5, 1 - pout) }}>
          <svg width={14 * ds} height={70 * ds} viewBox="0 0 14 70" overflow="visible">
            <path d="M4.5 22 L4.5 56 L6.3 69 L7.7 69 L9.5 56 L9.5 22 Z" fill="rgba(220,235,248,0.35)" stroke="rgba(240,248,255,0.8)" strokeWidth={0.6} />
            <path d="M4.9 44 L4.9 56 L6.5 68 L7.5 68 L9.1 56 L9.1 44 Z" fill={rgba(col, 0.85)} />
            <g transform={`translate(7 22) scale(${1 + squeeze * 0.12} ${1 - squeeze * 0.22}) translate(-7 -22)`}>
              <path d="M3 22 L3 9 Q3 1 7 1 Q11 1 11 9 L11 22 Z" fill="#7a2f22" />
              <path d="M4.4 20 L4.4 9 Q4.4 3.4 6.4 2.6" fill="none" stroke="rgba(255,200,180,0.45)" strokeWidth={1} />
            </g>
          </svg>
        </div>
      )
    }
    const pose = bottlePose(lab, e, m)
    if (!pose) return null
    const bw = BOTTLE_W * pose.bs
    const bh = BOTTLE_H * pose.bs
    return (
      <div className="absolute" style={{ left: pose.x - bw / 2, top: pose.y - bh / 2, width: bw, height: bh, transform: `rotate(${pose.theta}deg)`, opacity: pose.opacity }}>
        <Bottle reagent={reagent} size={pose.bs} />
      </div>
    )
  }

  if (e.kind === 'splint' && g && e.tool) {
    const s = g.s
    const L = TOOL_SIZE.splint.w - 8
    const T = { x: g.cx, y: g.mouthY - 1 * s }
    const theta = g.cx < m.W * 0.72 ? 118 : 62
    const pin = ease(seg(p, 0, 0.26))
    const pout = ease(seg(p, 0.78, 1))
    const away = 1 - pin + pout
    const dx = (theta > 90 ? 1 : -1) * 50 * s * away
    const dy = -60 * s * away
    const after = p >= e.at
    let mode: 'glowing' | 'burning' = e.splint ?? 'burning'
    let flame = 0.9
    let ember = 1
    const q = seg(p, e.at, e.at + 0.12)
    if (after) {
      if (e.result === 'relights') {
        mode = 'burning'
        flame = 0.3 + 1.1 * q
        ember = 0
      } else if (e.result === 'pop') flame = 0.9 - 0.5 * q
      else if (e.result === 'goes-out') flame = 0.9 * (1 - q)
    }
    return (
      <>
        <div
          className="absolute"
          style={{ left: T.x - L * s, top: T.y - 30 * s, width: (L + 30) * s, height: 60 * s, transformOrigin: `${L * s}px ${30 * s}px`, transform: `translate(${dx}px, ${dy}px) rotate(${theta}deg)`, opacity: 1 - seg(p, 0.9, 1) }}
        >
          <svg width={(L + 30) * s} height={60 * s} viewBox={`0 -30 ${L + 30} 60`} overflow="visible">
            <SplintG mode={mode} length={L} flame={flame} ember={ember} upright={theta} />
          </svg>
        </div>
        {after && e.result === 'pop' && p < e.at + 0.4 && (
          <div
            className="absolute font-black italic tracking-tight text-white"
            style={{ left: T.x, top: T.y - 46 * s, fontSize: Math.max(16, 26 * s), transform: `translate(-50%, -50%) scale(${0.6 + seg(p, e.at, e.at + 0.12) * 0.6}) rotate(-8deg)`, opacity: 1 - seg(p, e.at + 0.25, e.at + 0.4), textShadow: '0 2px 10px rgba(255,170,60,0.9)' }}
          >
            POP!
          </div>
        )}
      </>
    )
  }

  if (e.kind === 'litmus' && g && e.paper) {
    const s = g.s
    const L = TOOL_SIZE.litmus.w - 8
    const wet = g.surfaceY != null
    const T = wet ? { x: g.cx - Math.min(g.half(g.surfaceY!) * 0.3, 6 * s), y: Math.min(g.surfaceY! + 10 * s, g.bottomY - 4 * s) } : { x: g.cx, y: g.mouthY + 4 * s }
    const off = -80 * s * (1 - ease(seg(p, 0, 0.3))) - 80 * s * ease(seg(p, 0.66, 1))
    return (
      <div className="absolute" style={{ left: T.x - L * s, top: T.y + off - 6 * s, width: L * s, height: 12 * s, transformOrigin: `${L * s}px ${6 * s}px`, transform: 'rotate(90deg)', opacity: 1 - seg(p, 0.86, 1) }}>
        <svg width={L * s} height={12 * s} viewBox={`0 -6 ${L} 12`} overflow="visible">
          <LitmusG paper={e.paper} now={p >= e.at ? e.turns ?? null : null} wet={wet && p > 0.3 ? 1 : 0} length={L} />
        </svg>
      </div>
    )
  }

  if (e.kind === 'loop' && g) {
    const s = g.s
    const L = TOOL_SIZE.loop.w - 2
    const T = g.surfaceY != null ? { x: g.cx, y: Math.min(g.surfaceY + 5 * s, g.bottomY - 4 * s) } : { x: g.cx, y: g.bottomY - 6 * s }
    const off = -80 * s * (1 - ease(seg(p, 0, 0.3))) - 80 * s * ease(seg(p, 0.68, 1))
    return (
      <div className="absolute" style={{ left: T.x - L * s, top: T.y + off - 7 * s, width: L * s, height: 14 * s, transformOrigin: `${L * s}px ${7 * s}px`, transform: 'rotate(102deg)', opacity: 1 - seg(p, 0.86, 1) }}>
        <svg width={L * s} height={14 * s} viewBox={`0 -7 ${L} 14`} overflow="visible">
          <LoopG sample={p >= e.at ? e.sampleColor ?? 'clean' : null} length={L} />
        </svg>
      </div>
    )
  }

  if (e.kind === 'flame-test') {
    const b = lab.placed.get(e.target)
    if (!b) return null
    const s = b.s
    const L = TOOL_SIZE.loop.w - 2
    const T = { x: b.cx + 1 * s, y: b.top + (BURNER.barrelTop - 22) * s }
    const away = 1 - ease(seg(p, 0, 0.2)) + ease(seg(p, 0.82, 1))
    const glow = p > 0.18 && p < 0.84 ? 1 : 0
    return (
      <div className="absolute" style={{ left: T.x - L * s, top: T.y - 7 * s, width: L * s, height: 14 * s, transformOrigin: `${L * s}px ${7 * s}px`, transform: `translate(${70 * s * away}px, ${-20 * s * away}px) rotate(166deg)`, opacity: 1 - seg(p, 0.92, 1) }}>
        <svg width={L * s} height={14 * s} viewBox={`0 -7 ${L} 14`} overflow="visible">
          <LoopG sample={e.sampleColor ?? 'clean'} length={L} glow={glow} />
        </svg>
      </div>
    )
  }
  return null
}

// ------------------------------------------------------------------ readouts

function Readouts({ lab, focus }: { lab: Lab; focus: string | null }) {
  const out: React.ReactNode[] = []
  for (const it of lab.items) {
    if (!isVesselKind(it.kind)) continue
    const p = lab.placed.get(it.uid)
    const d = lab.display.get(it.uid)
    const v = lab.vessel(it.uid)
    if (!p || !d || !v || p.lifted) continue
    const sh = SHAPES[it.kind]
    const thermo = lab.thermometerIn(it.uid)
    let top = p.top
    if (thermo) {
      const wide = sh.mouthHalf > 20
      const tx = it.kind === 'dish' ? p.cx + 30 * p.s : p.cx + ((wide ? sh.mouthHalf * 0.42 : 0) + (wide ? 18 : 5)) * p.s
      const ty = it.kind === 'dish' ? p.top - 48 * p.s : p.top + (sh.bottomY - 7 - 150) * p.s
      top = Math.min(top, ty - 22)
      out.push(
        <div key={it.uid + 't'} className="absolute -translate-x-1/2 -translate-y-full rounded-md bg-card/90 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-foreground shadow-md backdrop-blur" style={{ left: tx, top: ty - 3 }}>
          {d.temp.toFixed(1)} °C
        </div>,
      )
    }
    if (focus !== it.uid) continue
    const vol = volumeMl(v)
    out.push(
      <div key={it.uid} className="absolute flex -translate-x-1/2 -translate-y-full items-center gap-2 whitespace-nowrap rounded-full bg-card/90 px-2.5 py-1 text-[11px] font-bold text-foreground shadow-lg backdrop-blur" style={{ left: p.cx, top: top - 8 }}>
        <span className="text-muted-foreground">{it.label}</span>
        <span className="tabular-nums">{Math.round(d.temp)} °C</span>
        {d.ph != null && (
          <span className="flex items-center gap-1 tabular-nums">
            <span className="size-2.5 rounded-full ring-1 ring-black/10" style={{ background: rgba(phColor(d.ph), 1) }} />
            pH {d.ph.toFixed(1)}
          </span>
        )}
        <span className="tabular-nums text-muted-foreground">{vol < 10 ? vol.toFixed(1) : Math.round(vol)} mL</span>
      </div>,
    )
  }
  return <>{out}</>
}

// ------------------------------------------------------------------ ghost

/** What follows the pointer while dragging. */
export function GhostArt({ lab, payload }: { lab: Lab; payload: DragPayload }) {
  const s = lab.metrics().s
  if (payload.type === 'reagent') {
    const r = REAGENT_BY_ID[payload.id]
    return r ? <Bottle reagent={r} size={1.15} /> : null
  }
  if (payload.type === 'equipment') {
    const k = payload.key
    if (k === 'delivery') {
      return (
        <div className="flex size-14 items-center justify-center rounded-2xl bg-card text-foreground shadow-xl">
          <EquipmentIcon k="delivery" className="size-9" />
        </div>
      )
    }
    if (isVesselKind(k)) return <VesselArt kind={k} s={s} rack={isTube(k)} />
    if (k === 'burner') return <BurnerArt s={s} lit={false} power={0.7} holding="none" flameTest={null} />
    const kind = k === 'litmus-red' || k === 'litmus-blue' ? 'litmus' : k
    return (
      <div style={{ transform: 'rotate(-35deg)' }}>
        <RestingTool kind={kind} s={s} paper={k === 'litmus-blue' ? 'blue' : 'red'} />
      </div>
    )
  }
  const it = lab.item(payload.uid)
  if (!it) return null
  if (isVesselKind(it.kind)) return <VesselArt kind={it.kind} s={s} d={lab.display.get(it.uid)} t={lab.t} seed={it.uid} thermometer={lab.thermometerIn(it.uid) ? lab.display.get(it.uid)?.temp ?? 22 : null} />
  if (it.kind === 'burner') return <BurnerArt s={s} lit={it.lit} power={it.power} holding="none" flameTest={null} />
  return (
    <div style={{ transform: 'rotate(-35deg)' }}>
      <RestingTool kind={it.kind} s={s} splint={it.splint} paper={it.litmus} paperNow={it.litmusNow} sample={it.sample ? it.sample.color ?? 'clean' : null} />
    </div>
  )
}

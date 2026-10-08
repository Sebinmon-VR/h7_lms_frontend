import type { VesselKind } from './engine/sim'

/**
 * Shapes and sizes of everything on the bench, in "bench units" (1 unit is one
 * pixel at scale 1), plus the layout that turns item positions into pixels.
 * The glassware, the particle system and the drop targets all read from here
 * so a bubble rises inside the same outline that is drawn.
 */

export type RGB = [number, number, number]
export type ToolKind = 'thermometer' | 'splint' | 'litmus' | 'loop'
export type ItemKind = VesselKind | 'burner' | ToolKind

export const VESSEL_KINDS: VesselKind[] = ['beaker', 'flask', 'testtube', 'boilingtube', 'cylinder', 'dish']
export const isVesselKind = (k: string): k is VesselKind => (VESSEL_KINDS as string[]).includes(k)
export const isTube = (k: string) => k === 'testtube' || k === 'boilingtube'

export const ITEM_NAMES: Record<ItemKind, string> = {
  beaker: 'Beaker',
  flask: 'Conical flask',
  testtube: 'Test tube',
  boilingtube: 'Boiling tube',
  cylinder: 'Measuring cylinder',
  dish: 'Evaporating dish',
  burner: 'Bunsen burner',
  thermometer: 'Thermometer',
  splint: 'Splint',
  litmus: 'Litmus paper',
  loop: 'Flame-test loop',
}

// ------------------------------------------------------------------ shapes

export interface Shape {
  kind: VesselKind
  w: number
  h: number
  cx: number
  /** Closed silhouette: the glass body. */
  body: string
  /** Stroked outline with the lip, open at the top. */
  edge: string
  /** Closed interior, for clipping the liquid. */
  inner: string
  mouthY: number
  mouthHalf: number
  bottomY: number
  fullY: number
  topY: number
  /** Interior half-width at a height. */
  half: (y: number) => number
  /** Liquid surface height for a fill fraction (by volume, not by height). */
  levelY: (fill: number) => number
  marks: Array<{ y: number; major: boolean; label?: string }>
}

interface ShapeDef extends Omit<Shape, 'levelY' | 'marks'> {
  capacity: number
  markEvery?: number
  labelEvery?: number
}

function build(def: ShapeDef): Shape {
  // Cumulative volume from the bottom up, in slices of half-width².
  const step = 0.5
  const ys: number[] = []
  const cum: number[] = []
  let v = 0
  for (let y = def.bottomY; y >= def.topY; y -= step) {
    const hw = def.half(y)
    v += hw * hw * step
    ys.push(y)
    cum.push(v)
  }
  let full = cum[cum.length - 1]
  for (let i = 0; i < ys.length; i++) {
    if (ys[i] <= def.fullY) {
      full = cum[i]
      break
    }
  }
  const levelY = (fill: number) => {
    const target = Math.max(0, fill) * full
    if (target <= 0) return def.bottomY
    for (let i = 0; i < cum.length; i++) if (cum[i] >= target) return ys[i]
    return def.topY
  }
  const marks: Shape['marks'] = []
  if (def.markEvery) {
    for (let ml = def.markEvery; ml <= def.capacity + 0.01; ml += def.markEvery) {
      const major = !def.labelEvery || Math.abs(ml % def.labelEvery) < 0.01
      marks.push({ y: levelY(ml / def.capacity), major, label: major ? String(ml) : undefined })
    }
  }
  const { capacity: _c, markEvery: _m, labelEvery: _l, ...rest } = def
  return { ...rest, levelY, marks }
}

const corner = (y: number, start: number, r: number, hw: number) =>
  y < start ? hw : hw - (r - Math.sqrt(Math.max(0, r * r - (y - start) * (y - start))))

const roundBottom = (y: number, centre: number, r: number) =>
  y < centre ? r : Math.sqrt(Math.max(0, r * r - (y - centre) * (y - centre)))

export const SHAPES: Record<VesselKind, Shape> = {
  beaker: build({
    kind: 'beaker',
    w: 112,
    h: 134,
    cx: 56,
    body: 'M10 9 L10 126 Q10 132 16 132 L96 132 Q102 132 102 126 L102 9 Z',
    edge: 'M5.5 5.5 Q9 6.5 10 10 L10 126 Q10 132 16 132 L96 132 Q102 132 102 126 L102 10 Q103 6.5 106.5 5.5',
    inner: 'M12.6 9 L12.6 125 Q12.6 129.4 17 129.4 L95 129.4 Q99.4 129.4 99.4 125 L99.4 9 Z',
    mouthY: 8,
    mouthHalf: 46,
    bottomY: 129.4,
    fullY: 32,
    topY: 10,
    half: (y) => corner(y, 125, 4.4, 43.4),
    capacity: 250,
    markEvery: 50,
  }),
  flask: build({
    kind: 'flask',
    w: 112,
    h: 144,
    cx: 56,
    body: 'M45 6 L45 48 L10 126 Q6 136 16 140 Q20 141 26 141 L86 141 Q92 141 96 140 Q106 136 102 126 L67 48 L67 6 Z',
    edge: 'M41.5 4 Q44.5 4.8 45 8 L45 48 L10 126 Q6 136 16 140 Q20 141 26 141 L86 141 Q92 141 96 140 Q106 136 102 126 L67 48 L67 8 Q67.5 4.8 70.5 4',
    inner: 'M47.5 6 L47.5 48.6 L12.6 126.6 Q9.6 134.6 17.6 137.6 Q21 138.6 26 138.6 L86 138.6 Q91 138.6 94.4 137.6 Q102.4 134.6 99.4 126.6 L64.5 48.6 L64.5 6 Z',
    mouthY: 6,
    mouthHalf: 11,
    bottomY: 138.6,
    fullY: 58,
    topY: 8,
    half: (y) => (y < 48.6 ? 8.5 : y <= 126.6 ? 8.5 + ((y - 48.6) / 78) * 34.9 : Math.max(30, 43.4 - (y - 126.6) * 1.1)),
    capacity: 250,
    markEvery: 50,
  }),
  testtube: build({
    kind: 'testtube',
    w: 36,
    h: 156,
    cx: 18,
    body: 'M8 6 L8 142 A10 10 0 0 0 28 142 L28 6 Z',
    edge: 'M5.5 4 Q8 4.6 8 7.5 L8 142 A10 10 0 0 0 28 142 L28 7.5 Q28 4.6 30.5 4',
    inner: 'M9.8 6 L9.8 142 A8.2 8.2 0 0 0 26.2 142 L26.2 6 Z',
    mouthY: 5,
    mouthHalf: 10,
    bottomY: 150.2,
    fullY: 24,
    topY: 8,
    half: (y) => roundBottom(y, 142, 8.2),
    capacity: 20,
  }),
  boilingtube: build({
    kind: 'boilingtube',
    w: 48,
    h: 170,
    cx: 24,
    body: 'M8 6 L8 152 A16 16 0 0 0 40 152 L40 6 Z',
    edge: 'M5 4 Q8 4.6 8 7.5 L8 152 A16 16 0 0 0 40 152 L40 7.5 Q40 4.6 43 4',
    inner: 'M10 6 L10 152 A14 14 0 0 0 38 152 L38 6 Z',
    mouthY: 5,
    mouthHalf: 16,
    bottomY: 166,
    fullY: 26,
    topY: 8,
    half: (y) => roundBottom(y, 152, 14),
    capacity: 40,
  }),
  cylinder: build({
    kind: 'cylinder',
    w: 56,
    h: 182,
    cx: 28,
    body: 'M17 8 L17 168 Q17 172 21 172 L35 172 Q39 172 39 168 L39 8 Z',
    edge: 'M12.5 5 Q16 6 17 9 L17 168 Q17 172 21 172 L35 172 Q39 172 39 168 L39 8 Q40 6 42.5 5.5',
    inner: 'M19 8 L19 167 Q19 169.5 21.5 169.5 L34.5 169.5 Q37 169.5 37 167 L37 8 Z',
    mouthY: 6,
    mouthHalf: 11,
    bottomY: 169.5,
    fullY: 28,
    topY: 9,
    half: (y) => corner(y, 167, 2.5, 9),
    capacity: 100,
    markEvery: 10,
    labelEvery: 20,
  }),
  dish: {
    kind: 'dish',
    w: 124,
    h: 56,
    cx: 62,
    body: 'M4 14 C6 40 30 52 62 52 C94 52 118 40 120 14 A58 9.5 0 0 1 4 14 Z',
    edge: 'M4 14 C6 40 30 52 62 52 C94 52 118 40 120 14',
    inner: 'M8 14 A54 8 0 1 0 116 14 A54 8 0 1 0 8 14 Z',
    mouthY: 12,
    mouthHalf: 54,
    bottomY: 26,
    fullY: 16,
    topY: 14,
    half: (y) => 8 + 44 * Math.sqrt(Math.max(0, Math.min(1, (26 - y) / 10))),
    levelY: (fill) => 26 - Math.min(1.2, Math.max(0, fill)) * 10,
    marks: [],
  },
}

// ------------------------------------------------------------------ sizes

export const BURNER = { w: 100, h: 160, gauzeY: 12, barrelTop: 74 }

export const TOOL_SIZE: Record<ToolKind, { w: number; h: number }> = {
  thermometer: { w: 150, h: 14 },
  splint: { w: 118, h: 10 },
  litmus: { w: 64, h: 12 },
  loop: { w: 124, h: 14 },
}

/** Width and height an item occupies on the bench (unscaled). */
export function itemBox(kind: ItemKind): { w: number; h: number } {
  if (isVesselKind(kind)) {
    const s = SHAPES[kind]
    return { w: s.w + (isTube(kind) ? 26 : 0), h: s.h }
  }
  if (kind === 'burner') return { w: BURNER.w, h: BURNER.h }
  return TOOL_SIZE[kind]
}

// ------------------------------------------------------------------ layout

export interface BenchMetrics {
  W: number
  H: number
  s: number
  /** Where things stand. */
  y0: number
  /** Back edge of the worktop and the front edge (top of the apron). */
  backY: number
  frontY: number
}

export function benchMetrics(W: number, H: number): BenchMetrics {
  const s = Math.max(0.5, Math.min(1.25, Math.min(W / 640, H / 410)))
  const apron = Math.max(18, Math.min(44, H * 0.07))
  const frontY = H - apron
  const y0 = frontY - 16 * s
  const backY = y0 - 46 * s
  return { W, H, s, y0, backY, frontY }
}

export interface Placed {
  uid: string
  kind: ItemKind
  cx: number
  /** Centre y (rotation pivot). */
  cy: number
  bottom: number
  top: number
  left: number
  w: number
  h: number
  s: number
  tilt: number
  onBurner: boolean
  /** Lifted off the bench (pouring). */
  lifted: boolean
}

export interface LayoutItem {
  uid: string
  kind: ItemKind
  x: number
  onBurner: string | null
  inVessel: string | null
}

export interface PourMotion {
  from: string
  to: string
  p: number
}

/** Tilt of a pouring vessel and where its mouth goes, over the progress `p` of the pour. */
export function pourPose(p: number) {
  const ease = (x: number) => x * x * (3 - 2 * x)
  if (p < 0.3) return { move: ease(p / 0.3), tilt: ease(p / 0.3) * 0.6 }
  if (p < 0.4) return { move: 1, tilt: 0.6 + ease((p - 0.3) / 0.1) * 0.4 }
  if (p < 0.75) return { move: 1, tilt: 1 }
  const b = ease((p - 0.75) / 0.25)
  return { move: 1 - b, tilt: 1 - b }
}

export function layoutBench(items: LayoutItem[], m: BenchMetrics, pours: PourMotion[]): Map<string, Placed> {
  const out = new Map<string, Placed>()
  const { s, W, y0 } = m
  const place = (it: LayoutItem, cx: number, bottom: number) => {
    const box = itemBox(it.kind)
    const w = box.w * s
    const h = box.h * s
    out.set(it.uid, { uid: it.uid, kind: it.kind, cx, cy: bottom - h / 2, bottom, top: bottom - h, left: cx - w / 2, w, h, s, tilt: 0, onBurner: false, lifted: false })
  }
  const clampX = (kind: ItemKind, x: number) => {
    const half = (itemBox(kind).w * s) / 2 + 6
    return Math.max(half, Math.min(W - half, x * W))
  }
  for (const it of items) {
    if (it.inVessel) continue
    if (isVesselKind(it.kind) && it.onBurner) continue
    place(it, clampX(it.kind, it.x), y0)
  }
  for (const it of items) {
    if (!isVesselKind(it.kind) || !it.onBurner) continue
    const b = out.get(it.onBurner)
    if (!b) {
      place(it, clampX(it.kind, it.x), y0)
      continue
    }
    const sh = SHAPES[it.kind]
    const lift = isTube(it.kind) ? 34 : BURNER.gauzeY
    place(it, b.cx, b.top + lift * s)
    const p = out.get(it.uid)!
    // Tubes have no rack on the burner; their box is the bare tube.
    p.w = sh.w * s
    p.left = p.cx - p.w / 2
    p.onBurner = true
  }
  for (const pour of pours) {
    const src = out.get(pour.from)
    const dst = out.get(pour.to)
    if (!src || !dst || !isVesselKind(src.kind) || !isVesselKind(dst.kind)) continue
    const ss = SHAPES[src.kind]
    const ds = SHAPES[dst.kind]
    const side = src.cx <= dst.cx ? -1 : 1
    const pose = pourPose(pour.p)
    const theta = -side * 78 * pose.tilt
    const full = (-side * 78 * Math.PI) / 180
    // Distance from the box centre to the mouth; at full tilt the mouth sits just above the target's.
    const d = (ss.h / 2 - ss.mouthY) * s
    const mx = dst.cx + side * ds.mouthHalf * 0.45 * s
    const my = dst.top + (ds.mouthY - 8) * s
    const target = { x: mx - d * Math.sin(full), y: my + d * Math.cos(full) }
    const home = { x: src.cx, y: src.cy }
    const cx = home.x + (target.x - home.x) * pose.move
    const cy = home.y + (target.y - home.y) * pose.move - Math.sin(pose.move * Math.PI) * 30 * s
    const h = ss.h * s
    const w = ss.w * s
    out.set(pour.from, { ...src, cx, cy, top: cy - h / 2, bottom: cy + h / 2, left: cx - w / 2, w, h, tilt: theta, lifted: true })
  }
  return out
}

/** Where a tilted vessel's mouth is, in bench pixels. */
export function mouthPoint(p: Placed): { x: number; y: number } {
  if (!isVesselKind(p.kind)) return { x: p.cx, y: p.top }
  const sh = SHAPES[p.kind]
  const d = (sh.h / 2 - sh.mouthY) * p.s
  const rad = (p.tilt * Math.PI) / 180
  return { x: p.cx + d * Math.sin(rad), y: p.cy - d * Math.cos(rad) }
}

/** A vessel's interior in bench pixels, for particles. */
export interface VesselGeom {
  uid: string
  kind: VesselKind
  cx: number
  top: number
  s: number
  mouthY: number
  mouthHalf: number
  bottomY: number
  surfaceY: number | null
  half: (y: number) => number
}

export function vesselGeom(p: Placed, level: number): VesselGeom | null {
  if (!isVesselKind(p.kind)) return null
  const sh = SHAPES[p.kind]
  const shapeLeft = p.cx - (sh.w * p.s) / 2
  const cx = shapeLeft + sh.cx * p.s
  return {
    uid: p.uid,
    kind: p.kind,
    cx,
    top: p.top,
    s: p.s,
    mouthY: p.top + sh.mouthY * p.s,
    mouthHalf: sh.mouthHalf * p.s,
    bottomY: p.top + sh.bottomY * p.s,
    surfaceY: level > 0.004 ? p.top + sh.levelY(level) * p.s : null,
    half: (y) => sh.half((y - p.top) / p.s) * p.s,
  }
}

/** Free x (0–1) for a new item: the first gap that fits, else the roomiest spot. */
export function freeSpot(kind: ItemKind, others: Array<{ kind: ItemKind; x: number }>, m: BenchMetrics): number {
  const w = itemBox(kind).w * m.s
  const spans = others.map((o) => ({ c: o.x * m.W, h: (itemBox(o.kind).w * m.s) / 2 }))
  let best = 0.5
  let bestGap = -Infinity
  for (let x = 0.1; x <= 0.9001; x += 0.04) {
    const c = x * m.W
    let gap = Infinity
    for (const sp of spans) gap = Math.min(gap, Math.abs(c - sp.c) - sp.h - w / 2)
    if (gap >= 10) return x
    if (gap > bestGap) {
      bestGap = gap
      best = x
    }
  }
  return best
}

/** A sodium or potassium ball skating about on the surface, −1…1 across it. */
export function ballOffset(t: number, seed: number) {
  return Math.sin(t * 2.3 + seed) * 0.55 + Math.sin(t * 5.7 + seed * 1.7) * 0.3
}

// ------------------------------------------------------------------ helpers

export const rgba = (c: RGB, a: number) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.max(0, Math.min(1, a)).toFixed(3)})`
export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
export const shade = (c: RGB, f: number): RGB => [c[0] * f, c[1] * f, c[2] * f]

export function hashSeed(str: string) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Small deterministic random, so lumps keep their places between frames. */
export function seeded(seed: number) {
  let a = seed || 1
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))

import * as React from 'react'

import type { EquipmentKind, LabAction } from './engine/experiments'
import {
  addReagent,
  appearance,
  empty,
  fillLevel,
  flameColour,
  litmusPaper,
  newVessel,
  splintTest,
  stepVessel,
  transfer,
  water,
  type Appearance,
  type SimEvent,
  type Vessel,
  type VesselKind,
} from './engine/sim'
import { REAGENT_BY_ID, substance } from './engine/substances'
import {
  ITEM_NAMES,
  benchMetrics,
  clamp,
  freeSpot,
  isVesselKind,
  layoutBench,
  mixRGB,
  vesselGeom,
  type BenchMetrics,
  type ItemKind,
  type Placed,
  type RGB,
  type VesselGeom,
} from './geometry'
import { Particles } from './particles'
import { LabAudio } from './sound'

/**
 * The bench: what is on it, the chemistry running in every vessel, the
 * animations in flight, and what the student has selected. It lives outside
 * React (the simulation mutates vessels sixty times a second); components
 * subscribe to two signals — `version` for discrete changes and `frame` for
 * animation — and read straight from the instance.
 */

export const MAX_ITEMS = 8

// ------------------------------------------------------------------ shelf

export type ShelfKey = VesselKind | 'burner' | 'thermometer' | 'splint' | 'litmus-red' | 'litmus-blue' | 'loop' | 'delivery'

export const SHELF: Array<{ key: ShelfKey; name: string; detail?: string; equipment: EquipmentKind }> = [
  { key: 'beaker', name: 'Beaker', detail: '250 mL', equipment: 'beaker' },
  { key: 'flask', name: 'Conical flask', detail: '250 mL', equipment: 'flask' },
  { key: 'testtube', name: 'Test tube', detail: '20 mL', equipment: 'testtube' },
  { key: 'boilingtube', name: 'Boiling tube', detail: '40 mL', equipment: 'boilingtube' },
  { key: 'cylinder', name: 'Measuring cylinder', detail: '100 mL', equipment: 'cylinder' },
  { key: 'dish', name: 'Evaporating dish', detail: '50 mL', equipment: 'dish' },
  { key: 'burner', name: 'Bunsen burner', equipment: 'burner' },
  { key: 'thermometer', name: 'Thermometer', equipment: 'thermometer' },
  { key: 'splint', name: 'Wooden splint', equipment: 'splint' },
  { key: 'litmus-red', name: 'Red litmus', equipment: 'litmus' },
  { key: 'litmus-blue', name: 'Blue litmus', equipment: 'litmus' },
  { key: 'loop', name: 'Flame-test loop', equipment: 'loop' },
  { key: 'delivery', name: 'Delivery tube', equipment: 'delivery' },
]

const shelfKind = (key: ShelfKey): ItemKind | null =>
  key === 'delivery' ? null : key === 'litmus-red' || key === 'litmus-blue' ? 'litmus' : (key as ItemKind)

// ------------------------------------------------------------------ types

export interface BenchItem {
  uid: string
  kind: ItemKind
  /** Centre, as a fraction of the bench width. */
  x: number
  label: string
  onBurner: string | null
  inVessel: string | null
  lit: boolean
  power: number
  splint: 'glowing' | 'burning'
  litmus: 'red' | 'blue'
  /** The paper's colour after it was dipped (null while fresh). */
  litmusNow: 'red' | 'blue' | null
  sample: { color: RGB | null; id: string; name: string } | null
  flameTest: { color: RGB; until: number } | null
}

export interface Display {
  liquid: RGB
  liquidA: number
  cloud: RGB
  cloudA: number
  level: number
  temp: number
  ph: number | null
  sediment: Appearance['sediment']
  floating: Appearance['floating']
  foam: number
  boiling: boolean
  /** There is liquid in it (not just solids). */
  wet: boolean
}

export interface NoteEntry {
  id: number
  /** Seconds since the lab opened. */
  at: number
  kind: 'reaction' | 'test' | 'log' | 'step'
  title: string
  text?: string
  equation?: string
  vessel?: string
}

export type EffectKind = 'pour-bottle' | 'pour-vessel' | 'splint' | 'litmus' | 'loop' | 'flame-test' | 'stir'

export interface Effect {
  id: number
  kind: EffectKind
  target: string
  tool?: string
  from?: string
  t0: number
  dur: number
  /** Fraction of the way through at which `apply` runs. */
  at: number
  applied: boolean
  apply?: () => void
  reagent?: string
  amount?: number
  form?: 'solution' | 'liquid' | 'solid'
  color?: RGB
  alpha?: number
  splint?: 'glowing' | 'burning'
  result?: string
  paper?: 'red' | 'blue'
  turns?: 'red' | 'blue' | null
  sampleColor?: RGB | null
}

export type Armed =
  | { type: 'reagent'; id: string }
  | { type: 'pour'; from: string }
  | { type: 'connect'; from: string | null }
  | { type: 'tool'; uid: string; target: 'vessel' | 'burner' }

export type Prompt = { type: 'add'; reagent: string; vessel: string } | { type: 'pour'; from: string; to: string }

export type DragPayload = { type: 'equipment'; key: ShelfKey } | { type: 'reagent'; id: string } | { type: 'item'; uid: string }

export interface DropTarget {
  kind: 'vessel' | 'burner' | 'bench' | 'none'
  uid?: string
  /** Bench x (0–1) under the pointer, when over the bench. */
  x: number | null
}

export interface LabObservation {
  at: number
  title: string
  text?: string
  equation?: string
  vessel?: string
}

// ------------------------------------------------------------------ helpers

export function fmtAmount(amount: number, form: string) {
  if (form === 'solid') return amount < 0.2 ? 'a pinch' : `${amount} g`
  return amount <= 0.5 ? 'a drop' : `${amount} mL`
}

/** The universal-indicator colour for a pH, for the little chips. */
export function phColor(p: number): RGB {
  const stops: Array<[number, RGB]> = [[1, [220, 30, 40]], [3, [245, 110, 30]], [5, [245, 210, 40]], [7, [60, 175, 70]], [9, [40, 120, 210]], [11, [70, 50, 170]], [13, [120, 40, 150]]]
  if (p <= stops[0][0]) return stops[0][1]
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i]
    const [p1, c1] = stops[i + 1]
    if (p <= p1) return mixRGB(c0, c1, (p - p0) / (p1 - p0))
  }
  return stops[stops.length - 1][1]
}

const FLAME_NAMES: Record<string, string> = {
  '255,200,40': 'bright yellow-orange',
  '200,140,255': 'lilac',
  '235,30,60': 'crimson',
  '255,110,40': 'orange-red',
  '230,20,30': 'red',
  '140,230,80': 'apple green',
  '60,210,170': 'blue-green',
}

export function flameName(c: RGB) {
  return FLAME_NAMES[c.join(',')] ?? 'coloured'
}

export function volumeMl(v: Vessel) {
  return water(v) + (v.contents.ethanol ?? 0)
}

// ------------------------------------------------------------------ the lab

export class Lab {
  items: BenchItem[] = []
  vessels = new Map<string, Vessel>()
  display = new Map<string, Display>()
  effects: Effect[] = []
  notes: NoteEntry[] = []
  toast: { id: number; title: string; text: string; equation?: string; at: number } | null = null
  message: { id: number; text: string; tone: 'info' | 'warn'; at: number } | null = null
  ui: { selected: string | null; armed: Armed | null; prompt: Prompt | null } = { selected: null, armed: null, prompt: null }

  /** Seconds of simulated time. */
  t = 0
  size = { w: 800, h: 480 }
  placed = new Map<string, Placed>()
  geoms = new Map<string, VesselGeom>()
  inflow = new Map<string, number>()
  particles = new Particles()
  audio = new LabAudio()
  reduced = false

  version = 0
  frame = 0

  private seq = 0
  private noteSeq = 0
  private counters: Record<string, number> = {}
  private heated = new Set<string>()
  private listeners = new Set<() => void>()
  private frameListeners = new Set<() => void>()
  private actionListeners = new Set<(a: LabAction) => void>()
  private raf = 0
  private last = 0
  private lastEmit = 0
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private dpr = 1

  constructor(starter: boolean) {
    if (starter) this.starterBench()
  }

  // ---------------------------------------------------------- plumbing

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }
  getVersion = () => this.version
  subscribeFrame = (fn: () => void) => {
    this.frameListeners.add(fn)
    return () => void this.frameListeners.delete(fn)
  }
  getFrame = () => this.frame
  onAction(fn: (a: LabAction) => void) {
    this.actionListeners.add(fn)
    return () => void this.actionListeners.delete(fn)
  }

  private changed() {
    this.version++
    this.listeners.forEach((fn) => fn())
  }

  private act(a: LabAction) {
    this.actionListeners.forEach((fn) => fn(a))
  }

  start() {
    if (this.raf) return
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  stop() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.audio.setEnabled(false)
  }

  setSize(w: number, h: number) {
    if (Math.abs(w - this.size.w) < 0.5 && Math.abs(h - this.size.h) < 0.5) return
    this.size = { w, h }
    this.sizeCanvas()
    this.relayout()
    this.emitFrame()
  }

  attachCanvas(c: HTMLCanvasElement | null) {
    this.canvas = c
    this.ctx = c?.getContext('2d') ?? null
    this.sizeCanvas()
  }

  private sizeCanvas() {
    if (!this.canvas) return
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.canvas.width = Math.round(this.size.w * this.dpr)
    this.canvas.height = Math.round(this.size.h * this.dpr)
  }

  metrics(): BenchMetrics {
    return benchMetrics(this.size.w, this.size.h)
  }

  private emitFrame() {
    this.frame++
    this.frameListeners.forEach((fn) => fn())
  }

  // ---------------------------------------------------------- queries

  item(uid: string | null | undefined) {
    return uid ? this.items.find((i) => i.uid === uid) : undefined
  }
  vessel(uid: string | null | undefined) {
    return uid ? this.vessels.get(uid) : undefined
  }
  isVessel(uid: string | null | undefined) {
    return !!uid && this.vessels.has(uid)
  }
  label(uid: string | null | undefined) {
    return this.item(uid)?.label ?? 'the vessel'
  }
  burnerUnder(vesselUid: string) {
    return this.item(this.item(vesselUid)?.onBurner)
  }
  vesselOn(burnerUid: string) {
    return this.items.find((i) => i.onBurner === burnerUid)
  }
  thermometerIn(vesselUid: string) {
    return this.items.find((i) => i.kind === 'thermometer' && i.inVessel === vesselUid)
  }
  effectFor(uid: string) {
    return this.effects.find((e) => e.tool === uid || (e.kind === 'pour-vessel' && e.from === uid))
  }
  /** Items that take bench space. */
  private standing() {
    return this.items.filter((i) => !i.inVessel && !i.onBurner)
  }

  observations(): LabObservation[] {
    return this.notes.filter((n) => n.kind === 'reaction' || n.kind === 'test').map(({ at, title, text, equation, vessel }) => ({ at, title, text, equation, vessel }))
  }

  // ---------------------------------------------------------- notebook

  note(n: Omit<NoteEntry, 'id' | 'at'>) {
    this.notes.push({ ...n, id: ++this.noteSeq, at: this.t })
    if (this.notes.length > 300) this.notes.splice(0, this.notes.length - 300)
    this.changed()
  }

  clearNotes() {
    this.notes = []
    this.changed()
  }

  say(text: string, tone: 'info' | 'warn' = 'info') {
    this.message = { id: ++this.noteSeq, text, tone, at: this.t }
    this.changed()
  }

  private onSimEvent(ev: SimEvent) {
    const vessel = this.label(ev.vessel)
    this.note({ kind: 'reaction', title: ev.title, text: ev.text, equation: ev.equation, vessel })
    this.toast = { id: this.noteSeq, title: ev.title, text: ev.text, equation: ev.equation, at: this.t }
  }

  // ---------------------------------------------------------- bench set-up

  private starterBench() {
    this.place('beaker', 0.24, true)
    this.place('testtube', 0.42, true)
    this.place('burner', 0.66, true)
    this.ui.selected = null
  }

  reset(opts: { starter?: boolean; clearNotes?: boolean } = {}) {
    this.items = []
    this.vessels.clear()
    this.display.clear()
    this.effects = []
    this.inflow.clear()
    this.heated.clear()
    this.counters = {}
    this.particles.clear()
    this.ui = { selected: null, armed: null, prompt: null }
    this.toast = null
    this.message = null
    if (opts.clearNotes) {
      this.notes = []
      this.t = 0
    } else this.note({ kind: 'log', title: 'Bench cleared' })
    if (opts.starter) this.starterBench()
    this.relayout()
    this.changed()
    this.emitFrame()
  }

  place(key: ShelfKey, x?: number, quiet = false): string | null {
    const kind = shelfKind(key)
    if (!kind) return null
    if (this.items.filter((i) => !i.inVessel).length >= MAX_ITEMS) {
      this.say(`The bench holds ${MAX_ITEMS} things — remove something first.`, 'warn')
      return null
    }
    const uid = `${kind}-${++this.seq}`
    const n = (this.counters[kind] = (this.counters[kind] ?? 0) + 1)
    const litmus = key === 'litmus-blue' ? 'blue' : 'red'
    const name = kind === 'litmus' ? `${litmus === 'red' ? 'Red' : 'Blue'} litmus` : ITEM_NAMES[kind]
    const numbered = isVesselKind(kind) || kind === 'burner' || n > 1
    const item: BenchItem = {
      uid,
      kind,
      x: x ?? freeSpot(kind, this.standing(), this.metrics()),
      label: numbered ? `${name} ${n}` : name,
      onBurner: null,
      inVessel: null,
      lit: false,
      power: 0.7,
      splint: 'burning',
      litmus,
      litmusNow: null,
      sample: null,
      flameTest: null,
    }
    this.items.push(item)
    if (isVesselKind(kind)) this.vessels.set(uid, newVessel(uid, kind))
    if (!quiet) {
      this.audio.clink()
      this.act({ type: 'place', equipment: kind as EquipmentKind, id: uid })
      this.ui.selected = uid
      if (kind === 'burner') this.say('Tap the burner to light it. Put a vessel on it to heat.')
    }
    this.relayout()
    this.changed()
    return uid
  }

  move(uid: string, x: number) {
    const it = this.item(uid)
    if (!it) return
    it.x = clamp(x, 0.02, 0.98)
    if (it.onBurner) {
      it.onBurner = null
      this.syncHeat()
    }
    if (it.kind === 'thermometer' && it.inVessel) it.inVessel = null
    this.relayout()
    this.changed()
  }

  remove(uid: string) {
    const it = this.item(uid)
    if (!it) return
    this.items = this.items.filter((i) => i.uid !== uid)
    if (this.vessels.has(uid)) {
      this.vessels.delete(uid)
      this.display.delete(uid)
      this.heated.delete(uid)
      for (const v of this.vessels.values()) if (v.deliverTo === uid) v.deliverTo = null
      for (const t of this.items) if (t.inVessel === uid) {
        t.inVessel = null
        t.x = clamp(it.x + 0.08, 0.05, 0.95)
      }
    }
    if (it.kind === 'burner') {
      for (const v of this.items) if (v.onBurner === uid) {
        v.onBurner = null
        v.x = it.x
      }
      this.syncHeat()
    }
    this.effects = this.effects.filter((e) => e.target !== uid && e.tool !== uid && e.from !== uid)
    const mentions = (o: object | null) => !!o && Object.values(o).includes(uid)
    if (this.ui.selected === uid) this.ui.selected = null
    if (mentions(this.ui.armed)) this.ui.armed = null
    if (mentions(this.ui.prompt)) this.ui.prompt = null
    this.relayout()
    this.changed()
  }

  putOnBurner(vUid: string, bUid: string) {
    const v = this.item(vUid)
    const b = this.item(bUid)
    if (!v || !b || !isVesselKind(v.kind) || b.kind !== 'burner') return
    const current = this.vesselOn(bUid)
    if (current && current.uid !== vUid) {
      current.onBurner = null
      current.x = clamp(b.x + 0.14, 0.05, 0.95)
    }
    v.onBurner = bUid
    v.x = b.x
    this.audio.clink()
    if (!b.lit) this.say(`${v.label} is on the burner. Light it to start heating.`)
    this.syncHeat()
    this.relayout()
    this.changed()
  }

  takeOffBurner(vUid: string) {
    const v = this.item(vUid)
    if (!v?.onBurner) return
    const b = this.item(v.onBurner)
    v.onBurner = null
    v.x = clamp((b?.x ?? v.x) + 0.14, 0.05, 0.95)
    this.syncHeat()
    this.relayout()
    this.changed()
  }

  toggleBurner(uid: string, on?: boolean) {
    const b = this.item(uid)
    if (!b || b.kind !== 'burner') return
    b.lit = on ?? !b.lit
    if (b.lit) this.audio.whoosh()
    else this.audio.click()
    this.note({ kind: 'log', title: b.lit ? `${b.label} lit` : `${b.label} turned off` })
    this.syncHeat()
  }

  setPower(uid: string, p: number) {
    const b = this.item(uid)
    if (!b) return
    b.power = clamp(p, 0.05, 1)
    this.changed()
  }

  /** Emits a heat action whenever a vessel starts or stops being heated. */
  private syncHeat() {
    for (const it of this.items) {
      if (!isVesselKind(it.kind)) continue
      const b = this.item(it.onBurner)
      const on = !!b?.lit
      if (on && !this.heated.has(it.uid)) {
        this.heated.add(it.uid)
        this.act({ type: 'heat', vesselId: it.uid, on: true })
      } else if (!on && this.heated.has(it.uid)) {
        this.heated.delete(it.uid)
        this.act({ type: 'heat', vesselId: it.uid, on: false })
      }
    }
    this.changed()
  }

  // ---------------------------------------------------------- chemistry

  private newEffect(e: Omit<Effect, 'id' | 't0' | 'applied'>) {
    const fx: Effect = { ...e, id: ++this.seq, t0: this.t, applied: false }
    this.effects.push(fx)
    this.changed()
    return fx
  }

  addReagentTo(reagentId: string, vUid: string, amount: number) {
    const r = REAGENT_BY_ID[reagentId]
    const v = this.vessel(vUid)
    const it = this.item(vUid)
    this.ui.prompt = null
    if (!r || !v || !it) return
    if (r.form !== 'solid' && volumeMl(v) >= v.capacity * 1.01) {
      this.say(`${it.label} is full.`, 'warn')
      return
    }
    const sub = substance(r.substance)
    const drop = r.form !== 'solid' && amount <= 1
    this.newEffect({
      kind: 'pour-bottle',
      target: vUid,
      reagent: reagentId,
      amount,
      form: r.form,
      color: sub.color,
      alpha: sub.alpha,
      dur: r.form === 'solid' ? 1.35 : drop ? 1.05 : 1.5,
      at: r.form === 'solid' ? 0.6 : 0.5,
      apply: () => {
        const res = addReagent(v, r, amount)
        if (!res.added) {
          this.say(res.message ?? `${it.label} is full.`, 'warn')
          return
        }
        const amt = r.form === 'solid' ? amount : Math.round(res.added * 10) / 10
        this.note({ kind: 'log', title: `Added ${fmtAmount(amt, r.form)} of ${r.label}`, vessel: it.label })
        this.act({ type: 'add', reagent: r.id, vesselId: vUid, vessel: v.kind, amount: res.added })
      },
    })
    this.changed()
  }

  pour(fromUid: string, toUid: string, fraction: number) {
    const from = this.vessel(fromUid)
    const to = this.vessel(toUid)
    this.ui.prompt = null
    if (!from || !to || fromUid === toUid) return
    if (Object.keys(from.contents).length === 0) {
      this.say(`${this.label(fromUid)} is empty.`, 'warn')
      this.changed()
      return
    }
    const d = this.display.get(fromUid)
    this.newEffect({
      kind: 'pour-vessel',
      target: toUid,
      from: fromUid,
      color: d?.liquid ?? [220, 235, 250],
      alpha: d?.liquidA ?? 0.2,
      dur: 1.8,
      at: 0.55,
      apply: () => {
        transfer(from, to, fraction)
        const part = fraction >= 0.99 ? 'all of' : fraction >= 0.5 ? 'half of' : 'a quarter of'
        this.note({ kind: 'log', title: `Poured ${part} ${this.label(fromUid)} into ${this.label(toUid)}` })
        this.act({ type: 'transfer', from: fromUid, to: toUid })
      },
    })
  }

  emptyVessel(uid: string) {
    const v = this.vessel(uid)
    if (!v) return
    const keep = v.deliverTo
    empty(v)
    v.deliverTo = keep
    this.note({ kind: 'log', title: `Emptied ${this.label(uid)}` })
    this.changed()
  }

  stir(uid: string) {
    const v = this.vessel(uid)
    if (!v) return
    this.newEffect({
      kind: 'stir',
      target: uid,
      dur: 1.4,
      at: 0.15,
      apply: () => {
        // Stirring lifts settled solid back into the liquid.
        for (const id of Object.keys(v.suspended)) v.suspended[id] = Math.max(v.suspended[id], 0.6)
        this.act({ type: 'stir', vesselId: uid })
      },
    })
  }

  connect(fromUid: string, toUid: string) {
    const from = this.vessel(fromUid)
    const to = this.vessel(toUid)
    this.ui.armed = null
    if (!from || !to || fromUid === toUid) return
    if (to.deliverTo === fromUid) to.deliverTo = null
    from.deliverTo = toUid
    this.audio.clink()
    this.note({ kind: 'log', title: `Delivery tube from ${this.label(fromUid)} to ${this.label(toUid)}` })
    this.act({ type: 'connect', from: fromUid, to: toUid })
    this.changed()
  }

  disconnect(fromUid: string) {
    const v = this.vessel(fromUid)
    if (!v) return
    v.deliverTo = null
    this.changed()
  }

  // ---------------------------------------------------------- tools

  insertThermometer(tUid: string, vUid: string) {
    const t = this.item(tUid)
    const v = this.vessel(vUid)
    if (!t || !v || t.kind !== 'thermometer') return
    const other = this.thermometerIn(vUid)
    if (other && other.uid !== tUid) {
      this.say(`${this.label(vUid)} already has a thermometer.`, 'warn')
      return
    }
    t.inVessel = vUid
    const reading = Math.round(v.temp * 10) / 10
    this.audio.clink()
    this.note({ kind: 'test', title: `Thermometer reads ${reading.toFixed(1)} °C`, vessel: this.label(vUid) })
    this.act({ type: 'test', test: 'thermometer', vesselId: vUid, result: String(Math.round(v.temp)) })
    this.ui.armed = null
    this.relayout()
    this.changed()
  }

  takeOutThermometer(tUid: string) {
    const t = this.item(tUid)
    if (!t?.inVessel) return
    const v = this.item(t.inVessel)
    t.inVessel = null
    t.x = clamp((v?.x ?? 0.5) + 0.1, 0.05, 0.95)
    this.relayout()
    this.changed()
  }

  setSplint(uid: string, mode: 'glowing' | 'burning') {
    const it = this.item(uid)
    if (!it) return
    it.splint = mode
    this.changed()
  }

  useSplint(sUid: string, vUid: string) {
    const sp = this.item(sUid)
    const v = this.vessel(vUid)
    if (!sp || !v || this.effectFor(sUid)) return
    const mode = sp.splint
    this.ui.armed = null
    // The gas is read the moment the splint reaches the mouth, not when it is picked up.
    const fx = this.newEffect({ kind: 'splint', target: vUid, tool: sUid, splint: mode, dur: 2, at: 0.38 })
    fx.apply = () => {
      const res = splintTest(v, mode)
      fx.result = res.result
      if (res.result === 'pop') this.audio.pop()
      if (res.result === 'relights') this.audio.whoosh()
      this.note({ kind: 'test', title: mode === 'glowing' ? 'Glowing splint test' : 'Burning splint test', text: res.text, vessel: this.label(vUid) })
      this.act({ type: 'test', test: mode === 'glowing' ? 'splint-glowing' : 'splint-burning', vesselId: vUid, result: res.result })
      if (res.result === 'relights') sp.splint = 'burning'
      if (res.result === 'pop' || res.result === 'goes-out') sp.splint = 'glowing'
    }
  }

  dipLitmus(lUid: string, vUid: string) {
    const lp = this.item(lUid)
    const v = this.vessel(vUid)
    if (!lp || !v || this.effectFor(lUid)) return
    const paper = lp.litmusNow ?? lp.litmus
    this.ui.armed = null
    const fx = this.newEffect({ kind: 'litmus', target: vUid, tool: lUid, paper, turns: null, dur: 1.8, at: 0.45 })
    fx.apply = () => {
      const res = litmusPaper(v, paper)
      fx.turns = res.turns
      if (res.turns) lp.litmusNow = res.turns
      this.note({ kind: 'test', title: `${paper === 'red' ? 'Red' : 'Blue'} litmus paper`, text: res.text, vessel: this.label(vUid) })
      this.act({ type: 'test', test: paper === 'red' ? 'litmus-red' : 'litmus-blue', vesselId: vUid, result: res.turns ?? 'none' })
    }
  }

  freshLitmus(uid: string) {
    const it = this.item(uid)
    if (!it) return
    it.litmusNow = null
    this.changed()
  }

  dipLoop(lUid: string, vUid: string) {
    const lp = this.item(lUid)
    const v = this.vessel(vUid)
    if (!lp || !v || this.effectFor(lUid)) return
    this.ui.armed = null
    if (Object.keys(v.contents).length === 0) {
      this.say(`${this.label(vUid)} is empty — nothing to pick up.`, 'warn')
      return
    }
    const fc = flameColour(v)
    this.newEffect({
      kind: 'loop',
      target: vUid,
      tool: lUid,
      sampleColor: fc?.color ?? null,
      dur: 1.3,
      at: 0.5,
      apply: () => {
        lp.sample = fc ? { color: fc.color, id: fc.from.id, name: fc.from.name } : { color: null, id: 'none', name: 'a sample' }
        this.note({ kind: 'log', title: `Loop dipped in ${this.label(vUid)}` })
        this.say('Now hold the loop in a lit burner flame.')
      },
    })
  }

  cleanLoop(uid: string) {
    const it = this.item(uid)
    if (!it) return
    it.sample = null
    this.changed()
  }

  flameTest(lUid: string, bUid: string) {
    const lp = this.item(lUid)
    const b = this.item(bUid)
    this.ui.armed = null
    if (!lp || !b || b.kind !== 'burner' || this.effectFor(lUid)) return
    if (!b.lit) {
      this.say('Light the burner first.', 'warn')
      return
    }
    if (!lp.sample) {
      this.say('Dip the loop in a solution first.', 'warn')
      return
    }
    const sample = lp.sample
    this.newEffect({
      kind: 'flame-test',
      target: bUid,
      tool: lUid,
      sampleColor: sample.color,
      dur: 3.4,
      at: 0.22,
      apply: () => {
        if (sample.color) b.flameTest = { color: sample.color, until: this.t + 2.6 }
        const text = sample.color ? `The flame turns ${flameName(sample.color)} — from the ${sample.name.toLowerCase()}.` : 'No colour: the flame stays blue. Nothing in this sample colours a flame.'
        this.note({ kind: 'test', title: 'Flame test', text })
        this.act({ type: 'test', test: 'flame', vesselId: bUid, result: sample.id })
      },
    })
  }

  /** Use a tool on a vessel: the right test for what it is. */
  useTool(toolUid: string, vUid: string) {
    const t = this.item(toolUid)
    if (!t) return
    if (t.kind === 'splint') this.useSplint(toolUid, vUid)
    else if (t.kind === 'litmus') this.dipLitmus(toolUid, vUid)
    else if (t.kind === 'loop') this.dipLoop(toolUid, vUid)
    else if (t.kind === 'thermometer') this.insertThermometer(toolUid, vUid)
    this.changed()
  }

  // ---------------------------------------------------------- interaction

  select(uid: string | null) {
    this.ui.selected = uid
    this.changed()
  }

  arm(a: Armed | null) {
    this.ui.armed = a
    this.ui.prompt = null
    this.changed()
  }

  setPrompt(p: Prompt | null) {
    this.ui.prompt = p
    this.ui.armed = null
    this.changed()
  }

  cancel() {
    this.ui = { selected: null, armed: null, prompt: null }
    this.changed()
  }

  tapShelf(key: ShelfKey) {
    if (key === 'delivery') {
      const from = this.isVessel(this.ui.selected) ? this.ui.selected : null
      this.arm({ type: 'connect', from })
      return
    }
    if (key === 'thermometer' && this.isVessel(this.ui.selected) && !this.thermometerIn(this.ui.selected!)) {
      const vUid = this.ui.selected!
      const t = this.place('thermometer', this.item(vUid)!.x)
      if (t) this.insertThermometer(t, vUid)
      return
    }
    this.place(key)
  }

  tapReagent(id: string) {
    const { armed, selected } = this.ui
    if (armed?.type === 'reagent' && armed.id === id) return this.arm(null)
    if (this.isVessel(selected)) return this.setPrompt({ type: 'add', reagent: id, vessel: selected! })
    this.arm({ type: 'reagent', id })
  }

  tapItem(uid: string) {
    const it = this.item(uid)
    if (!it) return
    const vessel = isVesselKind(it.kind)
    const armed = this.ui.armed
    if (armed) {
      switch (armed.type) {
        case 'reagent':
          if (vessel) return this.setPrompt({ type: 'add', reagent: armed.id, vessel: uid })
          return this.say('Pick a beaker, flask or tube to pour into.', 'warn')
        case 'pour':
          if (uid === armed.from) return this.arm(null)
          if (vessel) return this.setPrompt({ type: 'pour', from: armed.from, to: uid })
          return this.say('Pour into another vessel.', 'warn')
        case 'connect':
          if (!vessel) return this.say('The delivery tube joins two vessels.', 'warn')
          if (!armed.from) return this.arm({ type: 'connect', from: uid })
          if (uid === armed.from) return this.arm(null)
          return this.connect(armed.from, uid)
        case 'tool':
          if (uid === armed.uid) return this.arm(null)
          if (armed.target === 'burner') {
            if (it.kind === 'burner') return this.flameTest(armed.uid, uid)
            return this.say('Hold the loop in a burner flame.', 'warn')
          }
          if (vessel) return this.useTool(armed.uid, uid)
          return this.say('Use it on a vessel.', 'warn')
      }
    }
    if (it.kind === 'burner') {
      this.ui.selected = uid
      this.toggleBurner(uid)
      return
    }
    this.select(this.ui.selected === uid ? null : uid)
  }

  tapBench() {
    if (this.ui.selected || this.ui.armed || this.ui.prompt) this.cancel()
  }

  drop(payload: DragPayload, target: DropTarget) {
    const onVessel = target.kind === 'vessel' && target.uid ? target.uid : null
    const onBurner = target.kind === 'burner' && target.uid ? target.uid : null
    const x = target.x
    if (payload.type === 'reagent') {
      if (onVessel) this.setPrompt({ type: 'add', reagent: payload.id, vessel: onVessel })
      else if (x != null) this.say('Drop the bottle onto a beaker, flask or tube.', 'warn')
      return
    }
    if (payload.type === 'equipment') {
      const key = payload.key
      if (key === 'delivery') {
        this.arm({ type: 'connect', from: onVessel })
        return
      }
      if (x == null) return
      const kind = shelfKind(key)!
      if (key === 'thermometer' && onVessel) {
        const t = this.place(key, this.item(onVessel)!.x)
        if (t) this.insertThermometer(t, onVessel)
        return
      }
      const uid = this.place(key, x)
      if (!uid) return
      if (isVesselKind(kind) && onBurner) this.putOnBurner(uid, onBurner)
      else if (onVessel && (kind === 'splint' || kind === 'litmus' || kind === 'loop')) this.useTool(uid, onVessel)
      else if (onBurner && kind === 'loop') this.flameTest(uid, onBurner)
      return
    }
    const it = this.item(payload.uid)
    if (!it) return
    if (isVesselKind(it.kind)) {
      if (onVessel && onVessel !== it.uid) return this.setPrompt({ type: 'pour', from: it.uid, to: onVessel })
      if (onBurner) return this.putOnBurner(it.uid, onBurner)
      if (x != null) this.move(it.uid, x)
      return
    }
    switch (it.kind) {
      case 'thermometer':
        if (onVessel) return this.insertThermometer(it.uid, onVessel)
        break
      case 'splint':
      case 'litmus':
        if (onVessel) return this.useTool(it.uid, onVessel)
        break
      case 'loop':
        if (onVessel) return this.useTool(it.uid, onVessel)
        if (onBurner) return this.flameTest(it.uid, onBurner)
        break
    }
    if (x != null) this.move(it.uid, x)
  }

  // ---------------------------------------------------------- the loop

  private relayout() {
    const pours = this.effects
      .filter((e) => e.kind === 'pour-vessel' && e.from)
      .map((e) => ({ from: e.from!, to: e.target, p: clamp((this.t - e.t0) / e.dur, 0, 1) }))
    this.placed = layoutBench(this.items, this.metrics(), pours)
    this.geoms.clear()
    for (const [uid, p] of this.placed) {
      if (!this.vessels.has(uid)) continue
      const g = vesselGeom(p, this.display.get(uid)?.level ?? 0)
      if (g) this.geoms.set(uid, g)
    }
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick)
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000))
    this.last = now
    if (dt <= 0) return
    this.t += dt
    let busy = this.effects.length > 0

    // Burners heat whatever sits on them.
    let anyLit = false
    for (const it of this.items) {
      if (it.kind === 'burner' && it.lit) anyLit = true
      if (it.flameTest && it.flameTest.until < this.t) {
        it.flameTest = null
        busy = true
      }
      const v = this.vessels.get(it.uid)
      if (!v) continue
      const b = this.item(it.onBurner)
      v.heat = b?.lit ? b.power : 0
    }

    // Chemistry, in small steps.
    const steps = Math.max(1, Math.ceil(dt / 0.05))
    const sub = dt / steps
    const arriving = new Map<string, number>()
    for (let i = 0; i < steps; i++) {
      for (const v of this.vessels.values()) {
        const target = v.deliverTo ? this.vessels.get(v.deliverTo) : undefined
        const deliver = target
          ? (gas: string, n: number) => {
              target.gas[gas] = (target.gas[gas] ?? 0) + n
              arriving.set(target.id, (arriving.get(target.id) ?? 0) + n)
            }
          : undefined
        const events = stepVessel(v, sub, deliver)
        for (const ev of events) this.onSimEvent(ev)
      }
    }
    for (const id of this.vessels.keys()) {
      const rate = (arriving.get(id) ?? 0) / dt
      const prev = this.inflow.get(id) ?? 0
      this.inflow.set(id, prev + (rate - prev) * Math.min(1, dt * 4))
    }

    // Animations in flight.
    if (this.effects.length) {
      for (const e of this.effects) {
        const p = (this.t - e.t0) / e.dur
        if (!e.applied && p >= e.at) {
          e.applied = true
          e.apply?.()
        }
        this.effectFrame(e, p, dt)
      }
      const before = this.effects.length
      this.effects = this.effects.filter((e) => this.t - e.t0 < e.dur)
      if (this.effects.length !== before) this.changed()
    }

    // What every vessel looks like, eased toward the chemistry.
    const k = 1 - Math.exp(-dt * 3.2)
    const kl = 1 - Math.exp(-dt * 5)
    for (const v of this.vessels.values()) {
      const ap = appearance(v)
      const level = fillLevel(v)
      const foam = v.contents.foam ?? 0
      let d = this.display.get(v.id)
      if (!d) {
        d = { liquid: ap.liquid.color, liquidA: ap.liquid.alpha, cloud: ap.cloud.color, cloudA: ap.cloud.alpha, level, temp: v.temp, ph: ap.pH, sediment: ap.sediment, floating: ap.floating, foam, boiling: v.fx.boiling, wet: volumeMl(v) > 0.3 }
        this.display.set(v.id, d)
      }
      const fresh = d.level < 0.004
      const diff = Math.abs(d.level - level) + Math.abs(d.liquidA - ap.liquid.alpha) + Math.abs(d.cloudA - ap.cloud.alpha) + Math.abs(d.temp - v.temp) / 40 + Math.abs(d.foam - foam) / 20
      d.liquid = fresh ? ap.liquid.color : mixRGB(d.liquid, ap.liquid.color, k)
      d.liquidA = fresh ? ap.liquid.alpha : d.liquidA + (ap.liquid.alpha - d.liquidA) * k
      d.cloud = d.cloudA < 0.01 ? ap.cloud.color : mixRGB(d.cloud, ap.cloud.color, k)
      d.cloudA += (ap.cloud.alpha - d.cloudA) * k
      d.level += (level - d.level) * kl
      d.temp += (v.temp - d.temp) * Math.min(1, dt * 2.5)
      d.foam += (foam - d.foam) * k
      d.ph = ap.pH
      d.sediment = ap.sediment
      d.floating = ap.floating
      d.boiling = v.fx.boiling
      d.wet = volumeMl(v) > 0.3
      const colourMoving = Math.abs(d.liquid[0] - ap.liquid.color[0]) + Math.abs(d.liquid[1] - ap.liquid.color[1]) + Math.abs(d.liquid[2] - ap.liquid.color[2]) > 1.5
      if (diff > 0.002 || colourMoving) busy = true
      const fx = v.fx
      if (fx.bubbles > 0.01 || fx.steam > 0.02 || fx.smokeLevel > 0.02 || fx.sparks || fx.foam > 0.01 || fx.flame || fx.lightLevel > 0.01 || ap.floating.length) busy = true
    }

    this.relayout()

    // Particles.
    const ps = this.particles
    ps.reduced = this.reduced
    ps.beginFrame()
    const m = this.metrics()
    for (const [uid, g] of this.geoms) {
      const v = this.vessels.get(uid)
      const p = this.placed.get(uid)
      const d = this.display.get(uid)
      if (!v || !p || !d || p.lifted) continue
      const outlet = this.outletFor(uid, g)
      ps.emit(
        {
          geom: g,
          fx: v.fx,
          inflow: this.inflow.get(uid) ?? 0,
          outlet,
          floating: d.floating.length > 0,
          liquidColor: d.liquid,
          hasLiquid: water(v) > 0.5,
          solidTopY: g.bottomY - 6 * g.s,
          t: this.t,
          seed: uid.length,
        },
        dt,
      )
    }
    ps.update(dt, this.geoms, m.y0)
    if (this.ctx && this.canvas) {
      if (ps.busy || this.canvasDirty) {
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
        ps.draw(this.ctx, this.size.w, this.size.h, this.t)
        this.canvasDirty = ps.busy
      }
    }

    // Sound.
    if (this.audio.enabled) {
      let fizz = 0
      let hiss = 0
      let boil = 0
      let crackle = 0
      for (const v of this.vessels.values()) {
        const f = v.fx
        if (f.boiling) boil = Math.max(boil, 1)
        if (f.sound === 'hiss') hiss = Math.max(hiss, f.bubbles + f.foam)
        else if (f.sound === 'crackle') crackle = Math.max(crackle, 1)
        else if (f.bubbles > 0) fizz = Math.max(fizz, f.bubbles * (f.bubbleKind === 'gentle' ? 0.4 : 1))
      }
      const pour = this.effects.some((e) => (e.kind === 'pour-bottle' && e.form !== 'solid' && (e.amount ?? 0) > 1) || e.kind === 'pour-vessel') ? 1 : 0
      this.audio.update({ fizz, hiss, boil, crackle, pour })
    }

    if (busy || anyLit || ps.busy || now - this.lastEmit > 300) {
      this.lastEmit = now
      this.emitFrame()
    }
  }

  private canvasDirty = false

  /** Where a delivery tube ends inside a vessel. */
  outletFor(uid: string, g: VesselGeom): { x: number; y: number } | null {
    for (const v of this.vessels.values()) {
      if (v.deliverTo !== uid) continue
      return { x: g.cx + g.half(g.bottomY - 12 * g.s) * 0.35, y: g.bottomY - 10 * g.s }
    }
    return null
  }

  /** Per-frame bits of an animation that live in the particle system. */
  private effectFrame(e: Effect, p: number, dt: number) {
    const g = this.geoms.get(e.target)
    if (!g) return
    const stopY = g.surfaceY ?? g.bottomY - 3 * g.s
    if (e.kind === 'pour-bottle') {
      if (e.form === 'solid') {
        if (p > 0.32 && p < 0.7) {
          const n = Math.max(1, Math.round(dt * 70))
          this.particles.grains(g.cx + 2 * g.s, g.mouthY - 14 * g.s, stopY, e.color ?? [240, 240, 240], n, g.s)
        }
      } else if ((e.amount ?? 0) <= 1) {
        const prevP = p - dt / e.dur
        if (prevP < 0.48 && p >= 0.48) this.particles.drop(g.cx, g.mouthY - 10 * g.s, stopY, liquidTint(e.color, e.alpha), g.s)
      } else if (p > 0.38 && p < 0.74 && Math.random() < dt * 14) {
        this.particles.splash(g.cx + 3 * g.s, stopY, g.s, 1)
      }
    }
    if (e.kind === 'pour-vessel' && p > 0.4 && p < 0.74 && Math.random() < dt * 14) this.particles.splash(g.cx, stopY, g.s, 1)
  }
}

/** A visible tint for a stream or drop, even of something colourless. */
export function liquidTint(c: RGB | undefined, a: number | undefined): RGB {
  const col = c ?? [220, 235, 250]
  return (a ?? 0) < 0.08 ? [205, 225, 245] : col
}

// ------------------------------------------------------------------ hooks

export function useLab(starter: boolean): Lab {
  const ref = React.useRef<Lab>()
  if (!ref.current) ref.current = new Lab(starter)
  React.useEffect(() => {
    const lab = ref.current!
    lab.start()
    return () => lab.stop()
  }, [])
  return ref.current
}

/** Re-render on discrete changes (items, selection, notebook). */
export function useLabVersion(lab: Lab) {
  return React.useSyncExternalStore(lab.subscribe, lab.getVersion)
}

/** Re-render on animation frames (only while something is moving). */
export function useLabFrame(lab: Lab) {
  return React.useSyncExternalStore(lab.subscribeFrame, lab.getFrame)
}

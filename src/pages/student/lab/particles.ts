import type { VesselFx } from './engine/sim'
import { ballOffset, type RGB, type VesselGeom } from './geometry'

/**
 * One canvas over the whole bench for everything that moves too much to be
 * SVG: bubbles, steam, smoke, sparks, foam, falling powder, the glow of
 * burning magnesium and flames licking out of a vessel.
 *
 * Particles live in flat objects in one array, capped; soft round puffs are
 * drawn from small cached sprites rather than fresh gradients.
 */

type Kind = 'bubble' | 'ring' | 'steam' | 'smoke' | 'spark' | 'foam' | 'grain' | 'drop' | 'splash'

interface P {
  kind: Kind
  x: number
  y: number
  vx: number
  vy: number
  r: number
  grow: number
  age: number
  life: number
  color: RGB
  alpha: number
  /** Bubbles: which vessel, where across it (−1…1), wobble phase. */
  vessel?: string
  u?: number
  phase?: number
  /** Where it stops (a liquid surface or the bench). */
  stopY?: number
  stuck?: boolean
}

const MAX = 700

const BUBBLE_RATE = { gentle: 9, fizz: 26, vigorous: 60, violent: 110 } as const
const BUBBLE_SIZE = { gentle: [0.9, 1.8], fizz: [1, 2.4], vigorous: [1.3, 3.2], violent: [1.8, 4.4] } as const

export interface EmitInput {
  geom: VesselGeom
  fx: VesselFx
  /** Gas arriving down a delivery tube, mmol/s. */
  inflow: number
  /** Where the tube ends inside this vessel, if one does. */
  outlet: { x: number; y: number } | null
  floating: boolean
  liquidColor: RGB
  hasLiquid: boolean
  /** Top of the solids when there is no liquid (dry heating). */
  solidTopY: number
  t: number
  seed: number
}

export class Particles {
  list: P[] = []
  reduced = false
  private sprites = new Map<string, HTMLCanvasElement>()
  private carry = new Map<string, number>()
  /** Light sources this frame (burning magnesium): drawn after the particles. */
  private glows: Array<{ x: number; y: number; level: number; color: RGB; s: number }> = []
  private flames: Array<{ x: number; y: number; color: RGB; s: number; size: number }> = []

  clear() {
    this.list = []
    this.carry.clear()
  }

  get busy() {
    return this.list.length > 0 || this.glows.length > 0 || this.flames.length > 0
  }

  private add(p: Partial<P> & { kind: Kind; x: number; y: number }) {
    if (this.list.length >= MAX) return
    this.list.push({ vx: 0, vy: 0, r: 2, grow: 0, age: 0, life: 1, color: [255, 255, 255], alpha: 1, ...p })
  }

  /** How many to spawn this frame for a rate, keeping fractions between frames. */
  private count(key: string, rate: number, dt: number) {
    const r = this.reduced ? rate * 0.35 : rate
    const acc = (this.carry.get(key) ?? 0) + r * dt
    const n = Math.floor(acc)
    this.carry.set(key, acc - n)
    return n
  }

  beginFrame() {
    this.glows = []
    this.flames = []
  }

  /** Everything a vessel gives off this frame. */
  emit(e: EmitInput, dt: number) {
    const { geom: g, fx, t } = e
    const s = g.s
    const id = g.uid
    const surface = g.surfaceY
    const contentY = surface ?? e.solidTopY

    // Bubbles rising through the liquid.
    if (surface != null && e.hasLiquid) {
      const kind = fx.bubbleKind ?? 'gentle'
      if (fx.bubbles > 0.01) {
        const n = this.count(id + ':b', BUBBLE_RATE[kind] * Math.sqrt(fx.bubbles) * (fx.boiling ? 1.2 : 1), dt)
        const [a, b] = BUBBLE_SIZE[kind]
        for (let i = 0; i < n; i++) this.bubble(g, surface, (a + Math.random() * (b - a)) * s * (fx.boiling ? 1.5 : 1), fx.boiling)
      }
      if (e.inflow > 0.002 && e.outlet) {
        const n = this.count(id + ':in', Math.min(34, 6 + e.inflow * 40), dt)
        for (let i = 0; i < n; i++) {
          const r = (1.4 + Math.random() * 1.8) * s
          this.add({ kind: 'bubble', x: e.outlet.x, y: e.outlet.y, vy: -(50 + Math.random() * 40) * s, r, life: 6, vessel: id, u: (e.outlet.x - g.cx) / Math.max(1, g.half(e.outlet.y)), phase: Math.random() * 6, stopY: surface, color: [255, 255, 255], alpha: 0.85 })
        }
      }
    }

    // Steam and smoke from the mouth.
    if (fx.steam > 0.02) {
      const n = this.count(id + ':st', 12 * fx.steam, dt)
      for (let i = 0; i < n; i++) {
        this.add({ kind: 'steam', x: g.cx + (Math.random() - 0.5) * g.mouthHalf * 1.4, y: g.mouthY - 2 * s, vx: (4 + Math.random() * 12) * s, vy: -(22 + Math.random() * 22) * s, r: (7 + Math.random() * 5) * s, grow: 16 * s, life: 2.2 + Math.random(), color: [245, 248, 252], alpha: 0.3 + fx.steam * 0.16 })
      }
    }
    if (fx.smoke && fx.smokeLevel > 0.02) {
      const n = this.count(id + ':sm', 16 * fx.smokeLevel, dt)
      for (let i = 0; i < n; i++) {
        this.add({ kind: 'smoke', x: g.cx + (Math.random() - 0.5) * g.mouthHalf, y: g.mouthY - 2 * s, vx: (Math.random() - 0.3) * 14 * s, vy: -(16 + Math.random() * 20) * s, r: (7 + Math.random() * 5) * s, grow: 20 * s, life: 3 + Math.random() * 1.2, color: fx.smoke, alpha: 0.32 + fx.smokeLevel * 0.25 })
      }
    }

    // Where the action is on the surface: the skating metal, or the middle.
    const ballX = e.floating && surface != null ? g.cx + ballOffset(t, e.seed) * g.half(surface) * 0.7 : g.cx
    const hotY = e.floating && surface != null ? surface - 2 * s : contentY

    if (fx.sparks) {
      const n = this.count(id + ':sp', 26, dt)
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8
        const v = (90 + Math.random() * 130) * s
        this.add({ kind: 'spark', x: ballX, y: hotY, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1, life: 0.35 + Math.random() * 0.35, color: Math.random() < 0.5 ? [255, 210, 120] : [255, 160, 60], alpha: 1 })
      }
    }

    if (fx.foam > 0.02) {
      // Overflow slides off the lip and down the outside.
      const n = this.count(id + ':fo', 16 * fx.foam, dt)
      for (let i = 0; i < n; i++) {
        const dir = Math.random() < 0.5 ? -1 : 1
        this.add({ kind: 'foam', x: g.cx + dir * g.mouthHalf * (1.05 + Math.random() * 0.4), y: g.mouthY + Math.random() * 6 * s, vx: dir * (4 + Math.random() * 16) * s, vy: (Math.random() * 12 - 4) * s, r: (2.5 + Math.random() * 3.5) * s, life: 7 + Math.random() * 3, color: [255, 250, 236], alpha: 0.95 })
      }
    }

    if (fx.light && fx.lightLevel > 0.02) this.glows.push({ x: ballX, y: hotY, level: fx.lightLevel, color: fx.light, s })
    if (fx.flame) this.flames.push({ x: ballX, y: hotY, color: fx.flame, s, size: e.floating ? 0.9 : 1.2 })
  }

  private bubble(g: VesselGeom, surface: number, r: number, boiling: boolean) {
    const fromY = g.bottomY - (1 + Math.random() * (boiling ? 3 : 8)) * g.s
    if (g.kind === 'dish') {
      // A dish is seen from above: bubbles just break on the surface.
      const a = Math.random() * Math.PI * 2
      const rr = Math.sqrt(Math.random()) * g.half(surface) * 0.85
      this.add({ kind: 'ring', x: g.cx + Math.cos(a) * rr, y: surface + Math.sin(a) * rr * 0.16, r, grow: r * 4, life: 0.35, alpha: 0.7 })
      return
    }
    this.add({ kind: 'bubble', x: g.cx, y: fromY, vy: -(28 + Math.random() * 60) * g.s * (boiling ? 1.4 : 1), r, grow: boiling ? 1.6 * g.s : 0.15 * g.s, life: 8, vessel: g.uid, u: (Math.random() * 2 - 1) * 0.82, phase: Math.random() * 6.28, stopY: surface, alpha: 0.85 })
  }

  /** Powder falling from a spatula. */
  grains(x: number, y: number, stopY: number, color: RGB, n: number, s: number) {
    for (let i = 0; i < n; i++) {
      this.add({ kind: 'grain', x: x + (Math.random() - 0.5) * 6 * s, y, vx: (Math.random() - 0.5) * 10 * s, vy: (20 + Math.random() * 30) * s, r: (0.8 + Math.random() * 1.2) * s, life: 2, color, alpha: 1, stopY })
    }
  }

  drop(x: number, y: number, stopY: number, color: RGB, s: number) {
    this.add({ kind: 'drop', x, y, vy: 40 * s, r: 2.4 * s, life: 2, color, alpha: 0.9, stopY })
  }

  splash(x: number, y: number, s: number, n = 3) {
    for (let i = 0; i < n; i++) this.add({ kind: 'ring', x: x + (Math.random() - 0.5) * 8 * s, y, r: 1.2 * s, grow: 10 * s, life: 0.4, alpha: 0.6 })
  }

  update(dt: number, geoms: Map<string, VesselGeom>, benchY: number) {
    const keep: P[] = []
    for (const p of this.list) {
      p.age += dt
      if (p.age >= p.life) continue
      switch (p.kind) {
        case 'bubble': {
          const g = p.vessel ? geoms.get(p.vessel) : undefined
          if (!g || g.surfaceY == null) continue
          p.y += p.vy * dt
          p.vy *= 1 + dt * 0.4
          p.r += p.grow * dt
          const wob = Math.sin(p.age * 9 + (p.phase ?? 0)) * 1.2 * g.s
          const hw = Math.max(0, g.half(p.y) - p.r - 1)
          p.x = g.cx + (p.u ?? 0) * hw + wob
          if (p.y - p.r <= g.surfaceY) {
            this.add({ kind: 'ring', x: p.x, y: g.surfaceY, r: p.r * 0.8, grow: p.r * 5, life: 0.25, alpha: 0.7 })
            continue
          }
          break
        }
        case 'ring':
          p.r += p.grow * dt
          break
        case 'steam':
        case 'smoke':
          p.x += p.vx * dt
          p.y += p.vy * dt
          p.vx += Math.sin(p.age * 2 + p.y * 0.02) * 6 * dt
          p.r += p.grow * dt
          break
        case 'spark':
          p.vy += 520 * dt
          p.x += p.vx * dt
          p.y += p.vy * dt
          break
        case 'foam':
          if (!p.stuck) {
            p.vy += 110 * dt
            p.vx *= 1 - dt * 0.6
            p.x += p.vx * dt
            p.y += p.vy * dt
            if (p.y + p.r >= benchY) {
              p.y = benchY - p.r * 0.6
              p.stuck = true
            }
          }
          break
        case 'grain':
        case 'drop':
          p.vy += 700 * dt
          p.x += p.vx * dt
          p.y += p.vy * dt
          if (p.stopY != null && p.y >= p.stopY) {
            if (p.kind === 'drop') this.splash(p.x, p.stopY, p.r / 2.4, 2)
            continue
          }
          break
      }
      keep.push(p)
    }
    this.list = keep
  }

  private sprite(c: RGB) {
    const key = c.join(',')
    let sp = this.sprites.get(key)
    if (!sp) {
      sp = document.createElement('canvas')
      sp.width = sp.height = 64
      const x = sp.getContext('2d')!
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32)
      gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.85)`)
      gr.addColorStop(0.3, `rgba(${c[0]},${c[1]},${c[2]},0.42)`)
      gr.addColorStop(0.65, `rgba(${c[0]},${c[1]},${c[2]},0.12)`)
      gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`)
      x.fillStyle = gr
      x.fillRect(0, 0, 64, 64)
      this.sprites.set(key, sp)
    }
    return sp
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
    ctx.clearRect(0, 0, W, H)
    for (const p of this.list) {
      const fade = 1 - p.age / p.life
      switch (p.kind) {
        case 'bubble': {
          ctx.globalAlpha = p.alpha
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.14)'
          ctx.fill()
          ctx.lineWidth = Math.max(0.6, p.r * 0.28)
          ctx.strokeStyle = 'rgba(255,255,255,0.75)'
          ctx.stroke()
          if (p.r > 1.6) {
            ctx.beginPath()
            ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.28, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(255,255,255,0.9)'
            ctx.fill()
          }
          break
        }
        case 'ring':
          ctx.globalAlpha = p.alpha * fade
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, p.r, p.r * 0.32, 0, 0, Math.PI * 2)
          ctx.lineWidth = 0.8
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'
          ctx.stroke()
          break
        case 'steam':
        case 'smoke': {
          const inA = Math.min(1, p.age / 0.4)
          ctx.globalAlpha = p.alpha * inA * fade
          const sp = this.sprite(p.color)
          ctx.drawImage(sp, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2)
          break
        }
        case 'spark':
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = fade
          ctx.strokeStyle = `rgb(${p.color[0]},${p.color[1]},${p.color[2]})`
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025)
          ctx.stroke()
          ctx.globalCompositeOperation = 'source-over'
          break
        case 'foam': {
          ctx.globalAlpha = p.alpha * Math.min(1, fade * 3)
          const gr = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.4, p.r * 0.1, p.x, p.y, p.r)
          gr.addColorStop(0, '#ffffff')
          gr.addColorStop(0.7, '#f7f1e2')
          gr.addColorStop(1, '#d9d0bd')
          ctx.fillStyle = gr
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
          ctx.fill()
          break
        }
        case 'grain':
          ctx.globalAlpha = 1
          ctx.fillStyle = `rgb(${p.color[0]},${p.color[1]},${p.color[2]})`
          ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2)
          break
        case 'drop':
          ctx.globalAlpha = p.alpha
          ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},0.85)`
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, p.r * 0.8, p.r * 1.15, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = 'rgba(255,255,255,0.8)'
          ctx.beginPath()
          ctx.arc(p.x - p.r * 0.25, p.y - p.r * 0.3, p.r * 0.25, 0, Math.PI * 2)
          ctx.fill()
          break
      }
    }
    ctx.globalAlpha = 1

    // Flames coming out of a vessel (potassium's lilac, burning sulfur's blue).
    ctx.globalCompositeOperation = 'lighter'
    for (const f of this.flames) {
      const flick = 1 + Math.sin(t * 23) * 0.08 + Math.sin(t * 37 + 1) * 0.06
      const h = 30 * f.s * f.size * flick
      for (let layer = 0; layer < 3; layer++) {
        const k = 1 - layer * 0.3
        const gr = ctx.createRadialGradient(f.x, f.y - h * 0.35 * k, 0, f.x, f.y - h * 0.35 * k, h * 0.7 * k)
        const c = layer === 2 ? [255, 255, 255] : f.color
        gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${0.55 - layer * 0.1})`)
        gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`)
        ctx.fillStyle = gr
        ctx.beginPath()
        ctx.ellipse(f.x, f.y - h * 0.38 * k, h * 0.32 * k, h * 0.62 * k, Math.sin(t * 9) * 0.08, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Bright light (burning magnesium) washes over the whole bench.
    for (const g of this.glows) {
      const flick = 0.85 + Math.random() * 0.3
      const R = (90 + 260 * g.level) * g.s * flick
      const gr = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, R)
      gr.addColorStop(0, `rgba(255,255,255,${0.95 * g.level})`)
      gr.addColorStop(0.08, `rgba(${g.color[0]},${g.color[1]},${g.color[2]},${0.75 * g.level})`)
      gr.addColorStop(0.35, `rgba(${g.color[0]},${g.color[1]},${g.color[2]},${0.18 * g.level})`)
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = gr
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = `rgba(255,255,250,${0.1 * g.level * flick})`
      ctx.fillRect(0, 0, W, H)
    }
    ctx.globalCompositeOperation = 'source-over'
  }
}

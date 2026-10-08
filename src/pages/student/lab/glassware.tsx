import * as React from 'react'

import type { VesselKind } from './engine/sim'
import { SHAPES, ballOffset, clamp, hashSeed, isTube, mixRGB, rgba, seeded, shade, type RGB, type Shape } from './geometry'
import { ThermometerG } from './tools'
import type { Display } from './useLabSim'

/**
 * Glassware in SVG. Back to front: a faint tint of the far wall of glass,
 * then (clipped to the inside) the liquid with its depth shading, any milky
 * cloud, settled solids, the curved surface and a floating metal; then the
 * near wall: refraction edge, highlights, rim and graduations. Foam that
 * overflows is drawn outside the clip, over everything.
 *
 * A porcelain evaporating dish is opaque, so it is drawn from a little above
 * instead, with the contents seen through its rim.
 */

export interface VesselArtProps {
  kind: VesselKind
  s: number
  d?: Display | null
  t?: number
  tilt?: number
  /** Sitting in a rack on the bench (tubes). */
  rack?: boolean
  /** Held in a retort-stand clamp over a burner: distance down to the bench, in units. */
  clampDrop?: number | null
  thermometer?: number | null
  seed?: string
}

export function VesselArt({ kind, s, d, t = 0, tilt = 0, rack, clampDrop, thermometer, seed = kind }: VesselArtProps) {
  const sh = SHAPES[kind]
  const raw = React.useId().replace(/:/g, '')
  const id = `v${raw}`
  const pad = rack && isTube(kind) ? 13 : 0
  const vbW = sh.w + pad * 2
  if (kind === 'dish') return <DishArt s={s} d={d} t={t} id={id} thermometer={thermometer} />

  const level = d?.level ?? 0
  const wet = !!d?.wet && level > 0.004
  const ly = sh.levelY(level)
  const col: RGB = d?.liquid ?? [225, 238, 252]
  const a = Math.max(0.24, d?.liquidA ?? 0)
  const innerLeft = sh.cx - sh.half(sh.topY + 20)
  const innerRight = sh.cx + sh.half(sh.topY + 20)

  return (
    <svg
      width={vbW * s}
      height={sh.h * s}
      viewBox={`${-pad} 0 ${vbW} ${sh.h}`}
      overflow="visible"
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden
    >
      <defs>
        <clipPath id={`${id}c`}>
          <path d={sh.inner} />
        </clipPath>
        <clipPath id={`${id}lv`}>
          <rect x={-20} y={ly} width={sh.w + 40} height={sh.h} />
        </clipPath>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.2" />
          <stop offset="0.1" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.025" />
          <stop offset="0.86" stopColor="#fff" stopOpacity="0.07" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.18" />
        </linearGradient>
        <linearGradient id={`${id}l`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={rgba(shade(col, 0.55), 1)} stopOpacity={Math.min(1, a * 1.25)} />
          <stop offset="0.22" stopColor={rgba(col, 1)} stopOpacity={a * 0.85} />
          <stop offset="0.55" stopColor={rgba(mixRGB(col, [255, 255, 255], 0.12), 1)} stopOpacity={a * 0.78} />
          <stop offset="0.82" stopColor={rgba(col, 1)} stopOpacity={a * 0.9} />
          <stop offset="1" stopColor={rgba(shade(col, 0.5), 1)} stopOpacity={Math.min(1, a * 1.3)} />
        </linearGradient>
        <linearGradient id={`${id}d`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity={0.12 + a * 0.18} />
        </linearGradient>
        {d && d.cloudA > 0.01 && (
          <linearGradient id={`${id}k`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={rgba(d.cloud, 1)} stopOpacity={d.cloudA * 0.6} />
            <stop offset="1" stopColor={rgba(d.cloud, 1)} stopOpacity={Math.min(0.97, d.cloudA * 1.05)} />
          </linearGradient>
        )}
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.65" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.06" />
        </linearGradient>
        <radialGradient id={`${id}f`} cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#f6f0e0" />
          <stop offset="1" stopColor="#d8cdb6" />
        </radialGradient>
        <radialGradient id={`${id}b`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#d8d8cf" />
          <stop offset="1" stopColor="#8d8d86" />
        </radialGradient>
      </defs>

      {rack && isTube(kind) && <RackBack w={sh.w} h={sh.h} />}
      {clampDrop != null && <ClampStand sh={sh} drop={clampDrop} />}

      {/* far wall */}
      <path d={sh.body} fill={`url(#${id}g)`} />

      <g clipPath={`url(#${id}c)`}>
        {wet && (tilt ? (
          <g transform={`rotate(${-tilt} ${sh.cx} ${ly})`}>
            <rect x={-300} y={ly} width={sh.w + 600} height={600} fill={`url(#${id}l)`} />
            {d && d.cloudA > 0.01 && <rect x={-300} y={ly} width={sh.w + 600} height={600} fill={rgba(d.cloud, d.cloudA * 0.8)} />}
            <line x1={-300} x2={sh.w + 300} y1={ly} y2={ly} stroke={rgba(mixRGB(col, [255, 255, 255], 0.5), 0.9)} strokeWidth={1} />
          </g>
        ) : (
          <>
            <rect x={0} y={ly} width={sh.w} height={sh.h - ly} fill={`url(#${id}l)`} />
            <rect x={0} y={ly} width={sh.w} height={sh.h - ly} fill={`url(#${id}d)`} />
            {d && d.cloudA > 0.01 && <CloudLayer x={0} y={ly} w={sh.w} h={sh.h - ly} fill={`url(#${id}k)`} seed={seed} t={t} />}
            {/* light caught where the liquid meets the glass */}
            <g clipPath={`url(#${id}lv)`}>
              <path d={sh.inner} fill="none" stroke={rgba(mixRGB(col, [255, 255, 255], 0.6), 0.5)} strokeWidth={3.2} />
            </g>
          </>
        ))}

        {d && d.sediment.length > 0 && <Sediment sh={sh} sediment={d.sediment} seed={seed} />}

        {wet && !tilt && <Surface sh={sh} y={ly} col={col} a={a} boiling={!!d?.boiling} t={t} />}

        {wet && !tilt && d && d.floating.map((f, i) => {
          const hw = sh.half(ly)
          const x = sh.cx + ballOffset(t, seed.length + i) * hw * 0.7
          return (
            <g key={f.id}>
              <ellipse cx={x} cy={ly + 0.6} rx={6} ry={1.4} fill="rgba(255,255,255,0.35)" />
              <circle cx={x} cy={ly - 2.2} r={4.3} fill={`url(#${id}b)`} />
            </g>
          )
        })}

        {d && d.foam > 0.4 && (
          <rect x={0} y={wet ? Math.min(ly, sh.topY + 2) : sh.topY} width={sh.w} height={sh.h} fill={`url(#${id}f)`} opacity={clamp(d.foam / 8, 0, 0.95)} />
        )}
      </g>

      {thermometer != null && <InsertedThermometer sh={sh} temp={thermometer} />}

      {/* near wall */}
      <path d={sh.inner} fill="none" stroke="rgba(12,22,32,0.38)" strokeWidth={0.9} />
      {kind === 'flask' ? (
        <>
          <path d="M49.6 10 L49.6 48 L16 122" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={2.4} strokeLinecap="round" />
          <path d="M62.6 12 L62.6 46" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeLinecap="round" />
          <path d="M96 124 L74 74" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.4} strokeLinecap="round" />
        </>
      ) : (
        <g clipPath={`url(#${id}c)`}>
          <rect x={innerLeft + 2.2} y={sh.topY + 3} width={Math.max(2.2, (innerRight - innerLeft) * 0.07)} height={sh.bottomY - sh.topY - 14} rx={1.5} fill={`url(#${id}h)`} />
          <rect x={innerRight - 3.6} y={sh.topY + 6} width={1.3} height={sh.bottomY - sh.topY - 20} rx={0.6} fill="rgba(255,255,255,0.28)" />
        </g>
      )}
      <path d={sh.edge} fill="none" stroke="rgba(238,246,255,0.82)" strokeWidth={1.45} strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx={sh.cx} cy={sh.mouthY + 1.2} rx={sh.mouthHalf - 1} ry={Math.min(3, sh.mouthHalf * 0.13)} fill="none" stroke="rgba(240,248,255,0.55)" strokeWidth={0.9} />
      <Marks sh={sh} />
      {kind === 'cylinder' && (
        <g>
          <path d="M4 182 L9.5 171 L46.5 171 L52 182 Z" fill="rgba(215,232,246,0.28)" stroke="rgba(238,246,255,0.8)" strokeWidth={1.2} strokeLinejoin="round" />
          <path d="M10.5 172.6 L45.5 172.6" stroke="rgba(255,255,255,0.55)" strokeWidth={0.8} />
          <path d="M6.5 179.5 L49.5 179.5" stroke="rgba(10,20,30,0.3)" strokeWidth={0.8} />
        </g>
      )}

      {rack && isTube(kind) && <RackFront w={sh.w} h={sh.h} />}
      {d && d.foam > 0.6 && <FoamColumn sh={sh} foam={d.foam} t={t} fill={`url(#${id}f)`} />}
    </svg>
  )
}

// ------------------------------------------------------------------ pieces

function Surface({ sh, y, col, a, boiling, t }: { sh: Shape; y: number; col: RGB; a: number; boiling: boolean; t: number }) {
  const rx = sh.half(y)
  if (rx < 0.5) return null
  const jig = boiling ? Math.sin(t * 31) * 0.5 + Math.sin(t * 17) * 0.4 : 0
  const ry = clamp(rx * 0.13, 1, 4.6) + jig * 0.4
  const top = mixRGB(col, [255, 255, 255], 0.35)
  return (
    <g>
      <ellipse cx={sh.cx} cy={y + ry * 0.35 + jig * 0.3} rx={rx} ry={ry} fill={rgba(top, Math.min(0.95, a + 0.18))} />
      <ellipse cx={sh.cx} cy={y + ry * 0.35 + jig * 0.3} rx={rx} ry={ry} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={0.75} />
      <ellipse cx={sh.cx - rx * 0.25} cy={y + ry * 0.05} rx={rx * 0.45} ry={ry * 0.35} fill="rgba(255,255,255,0.22)" />
    </g>
  )
}

function CloudLayer({ x, y, w, h, fill, seed, t }: { x: number; y: number; w: number; h: number; fill: string; seed: string; t: number }) {
  // A few soft swirls inside the milkiness so it reads as suspended solid, not paint.
  const rnd = seeded(hashSeed(seed + 'cloud'))
  const swirls = Array.from({ length: 5 }, () => ({ x: x + rnd() * w, y: y + rnd() * Math.min(h, 120), r: 6 + rnd() * 14, ph: rnd() * 6 }))
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={fill} />
      {swirls.map((sw, i) => (
        <ellipse key={i} cx={sw.x + Math.sin(t * 0.4 + sw.ph) * 3} cy={sw.y + 4} rx={sw.r} ry={sw.r * 0.6} fill="rgba(255,255,255,0.08)" />
      ))}
    </g>
  )
}

const METALLIC = new Set(['mg', 'zn', 'fe', 'cu', 'al', 'ag', 'ca', 'na', 'k'])

function Sediment({ sh, sediment, seed }: { sh: Shape; sediment: Display['sediment']; seed: string }) {
  let floor = sh.bottomY
  const parts: React.ReactNode[] = []
  const bottomHalf = Math.max(4, sh.half(sh.bottomY - 4))
  const narrow = 14 / Math.max(8, bottomHalf)
  // Powders first (they settle under the lumps).
  const sorted = [...sediment].sort((a, b) => Number(a.lumpy) - Number(b.lumpy))
  for (const sd of sorted) {
    if (sd.amount <= 0.02) continue
    const rnd = seeded(hashSeed(seed + sd.id))
    if (!sd.lumpy) {
      const hgt = clamp(1 + Math.sqrt(sd.amount) * 1.15 * narrow, 1.2, 34)
      const top = floor - hgt
      const hw = sh.half(top) + 2
      const c = sd.color
      parts.push(
        <g key={sd.id}>
          <path
            d={`M${sh.cx - hw - 4} ${top + 1.5} Q${sh.cx - hw * 0.4} ${top - 1.2} ${sh.cx} ${top - 0.6} Q${sh.cx + hw * 0.5} ${top - 1.4} ${sh.cx + hw + 4} ${top + 1.5} L${sh.cx + hw + 4} ${floor + 30} L${sh.cx - hw - 4} ${floor + 30} Z`}
            fill={rgba(c, 1)}
          />
          <path d={`M${sh.cx - hw - 4} ${top + 1.5} Q${sh.cx - hw * 0.4} ${top - 1.2} ${sh.cx} ${top - 0.6} Q${sh.cx + hw * 0.5} ${top - 1.4} ${sh.cx + hw + 4} ${top + 1.5}`} fill="none" stroke={rgba(mixRGB(c, [255, 255, 255], 0.4), 0.8)} strokeWidth={0.6} />
          {Array.from({ length: Math.min(30, Math.round(hgt * hw * 0.12)) }, (_, i) => (
            <circle key={i} cx={sh.cx + (rnd() * 2 - 1) * hw} cy={top + 1 + rnd() * hgt} r={0.35 + rnd() * 0.4} fill={rgba(shade(c, 0.7), 0.6)} />
          ))}
        </g>,
      )
      floor = top + 0.8
      continue
    }
    if (sd.id === 'fe') {
      const n = clamp(Math.round(sd.amount * 0.9), 12, 70)
      const hgt = clamp(1.5 + Math.sqrt(sd.amount) * 0.7 * narrow, 2, 18)
      parts.push(
        <g key={sd.id}>
          {Array.from({ length: n }, (_, i) => {
            const yy = floor - rnd() * rnd() * hgt
            const hw = Math.max(1, sh.half(yy) - 1.5)
            return <rect key={i} x={sh.cx + (rnd() * 2 - 1) * hw} y={yy - 0.9} width={1.4 + rnd()} height={0.7} transform={`rotate(${rnd() * 180} ${sh.cx} ${yy})`} fill={rnd() < 0.3 ? '#8e8e94' : '#4a4a50'} />
          })}
        </g>,
      )
      floor -= hgt * 0.5
      continue
    }
    const n = clamp(Math.round(Math.sqrt(sd.amount) * 1.1), 1, 12)
    let r = clamp(2.4 + 9 / (n + 2), 2.4, 6)
    r = Math.min(r, bottomHalf * 0.55)
    const perRow = Math.max(1, Math.floor((bottomHalf * 1.7) / (r * 2)))
    const metal = METALLIC.has(sd.id)
    const c = sd.color
    const lumps: React.ReactNode[] = []
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow)
      const colI = i % perRow
      const yy = floor - r * 0.75 - row * r * 1.25
      const hw = Math.max(r, sh.half(yy) - r * 0.8)
      const span = Math.min(perRow, n - row * perRow)
      const x = sh.cx + (span > 1 ? (colI - (span - 1) / 2) * (Math.min(hw * 2, r * 2.1 * span) / span) : 0) + (rnd() - 0.5) * r * 0.6
      const rot = rnd() * 180
      if (sd.id === 'mg') {
        lumps.push(
          <g key={i} transform={`rotate(${rot * 0.3 - 25} ${x} ${yy})`}>
            <rect x={x - r * 1.8} y={yy - 0.9} width={r * 3.6} height={1.8} rx={0.6} fill="#c9ced3" />
            <rect x={x - r * 1.8} y={yy - 0.9} width={r * 3.6} height={0.6} fill="rgba(255,255,255,0.8)" />
          </g>,
        )
        continue
      }
      if (sd.id === 'al') {
        lumps.push(
          <path key={i} d={`M${x - r} ${yy + r * 0.4} L${x - r * 0.4} ${yy - r * 0.8} L${x + r * 0.6} ${yy - r * 0.5} L${x + r} ${yy + r * 0.5} Z`} fill="#d7dbe0" stroke="#9aa0a6" strokeWidth={0.4} />,
        )
        continue
      }
      lumps.push(
        <g key={i}>
          <ellipse cx={x} cy={yy} rx={r * (1 + rnd() * 0.3)} ry={r * (0.68 + rnd() * 0.2)} transform={`rotate(${rot} ${x} ${yy})`} fill={rgba(c, 1)} stroke={rgba(shade(c, 0.55), 0.8)} strokeWidth={0.5} />
          <ellipse cx={x - r * 0.3} cy={yy - r * 0.3} rx={r * 0.4} ry={r * 0.22} fill={`rgba(255,255,255,${metal ? 0.65 : 0.35})`} />
        </g>,
      )
    }
    parts.push(<g key={sd.id}>{lumps}</g>)
    floor -= r * 0.6
  }
  return <g>{parts}</g>
}

function Marks({ sh }: { sh: Shape }) {
  if (!sh.marks.length) return null
  const left = sh.kind === 'flask' ? sh.cx - 5 : sh.kind === 'cylinder' ? 19.5 : 21
  return (
    <g>
      {sh.marks.map((m) => (
        <g key={m.y}>
          <line x1={left} x2={left + (m.major ? (sh.kind === 'cylinder' ? 8 : 11) : 6)} y1={m.y} y2={m.y} stroke="rgba(255,255,255,0.62)" strokeWidth={0.65} />
          {m.label && (
            <text x={left + (sh.kind === 'cylinder' ? 9.5 : 13)} y={m.y + 1.8} fontSize={sh.kind === 'cylinder' ? 4.6 : 5.6} fill="rgba(255,255,255,0.62)" fontFamily="ui-sans-serif, system-ui" fontWeight={600}>
              {m.label}
            </text>
          )}
        </g>
      ))}
      {sh.kind !== 'cylinder' && (
        <text x={left} y={sh.bottomY - 8} fontSize={4.4} fill="rgba(255,255,255,0.45)" fontFamily="ui-sans-serif, system-ui">
          mL
        </text>
      )}
    </g>
  )
}

function InsertedThermometer({ sh, temp }: { sh: Shape; temp: number }) {
  const wide = sh.mouthHalf > 20
  const x = sh.cx + (wide ? sh.mouthHalf * 0.42 : 0)
  const y = sh.bottomY - 7
  const lean = wide ? 7 : 2
  return (
    <g transform={`translate(${x} ${y}) rotate(${lean})`}>
      <ThermometerG temp={temp} length={150} />
    </g>
  )
}

function FoamColumn({ sh, foam, t, fill }: { sh: Shape; foam: number; t: number; fill: string }) {
  // A thick rope of foam pushing out of the mouth, folding over at the top,
  // running down the outside and pooling on the bench.
  const H = Math.min(260, foam * 2.2)
  const n = Math.max(4, Math.ceil(H / 6))
  const mh = Math.max(9, sh.mouthHalf)
  const blobs: React.ReactNode[] = []
  for (let i = 0; i <= n; i++) {
    const k = i / n
    const y = sh.mouthY + 2 - k * H
    const r = mh * (1.15 + 0.28 * Math.sin(i * 1.9 + t * 1.1) + k * 0.25)
    const x = sh.cx + Math.sin(i * 2.3 + t * 0.7) * mh * 0.32
    blobs.push(<circle key={`a${i}`} cx={x} cy={y} r={r} fill={fill} />)
    blobs.push(<circle key={`b${i}`} cx={x + (i % 2 ? 1 : -1) * r * 0.65} cy={y + r * 0.2} r={r * 0.62} fill={fill} />)
  }
  const topY = sh.mouthY + 2 - H
  const cap = mh * 1.5
  const cauliflower = [
    [0, -0.35, 1],
    [-0.75, 0.1, 0.72],
    [0.78, 0.05, 0.74],
    [-0.35, -0.8, 0.6],
    [0.4, -0.75, 0.62],
  ].map(([dx, dy, rr], i) => <circle key={`c${i}`} cx={sh.cx + dx * cap + Math.sin(t + i) * 1.2} cy={topY + dy * cap} r={cap * rr} fill={fill} stroke="rgba(190,175,150,0.3)" strokeWidth={0.5} />)
  const drip = Math.min(sh.h - sh.mouthY, foam * 1.7)
  const outerL = sh.cx - sh.mouthHalf - 2
  const outerR = sh.cx + sh.mouthHalf + 2
  const pool = Math.min(90, 8 + foam * 1.3)
  return (
    <g>
      <ellipse cx={sh.cx} cy={sh.h - 1} rx={pool} ry={Math.min(7, 2 + foam * 0.08)} fill={fill} />
      <rect x={outerL - 5} y={sh.mouthY} width={10} height={drip} rx={5} fill={fill} />
      <circle cx={outerL} cy={sh.mouthY + drip} r={6} fill={fill} />
      <rect x={outerR - 4} y={sh.mouthY} width={8} height={drip * 0.78} rx={4} fill={fill} />
      <circle cx={outerR} cy={sh.mouthY + drip * 0.78} r={5} fill={fill} />
      {blobs}
      {cauliflower}
    </g>
  )
}

function RackBack({ w, h }: { w: number; h: number }) {
  return (
    <g>
      <rect x={-12} y={h * 0.42} width={5} height={h * 0.58} rx={1} fill="#6e4426" />
      <rect x={w + 7} y={h * 0.42} width={5} height={h * 0.58} rx={1} fill="#6e4426" />
    </g>
  )
}

function RackFront({ w, h }: { w: number; h: number }) {
  return (
    <g>
      <rect x={-13} y={h * 0.42} width={w + 26} height={7} rx={1.5} fill="#a8723f" />
      <rect x={-13} y={h * 0.42} width={w + 26} height={1.6} rx={0.8} fill="rgba(255,235,200,0.45)" />
      <rect x={-13} y={h * 0.42 + 5.6} width={w + 26} height={1.4} fill="rgba(0,0,0,0.25)" />
      <rect x={-13} y={h - 4} width={w + 26} height={5} rx={1.2} fill="#8d5c31" />
      <rect x={-13} y={h - 4} width={w + 26} height={1.2} fill="rgba(255,235,200,0.35)" />
    </g>
  )
}

function ClampStand({ sh, drop }: { sh: Shape; drop: number }) {
  const clampY = sh.h * 0.2
  const rodX = sh.w + 46
  const bottom = sh.h + drop
  return (
    <g>
      <rect x={rodX - 2} y={clampY - 14} width={4} height={bottom - clampY + 12} rx={2} fill="#8c939a" />
      <rect x={rodX - 1.2} y={clampY - 14} width={1.2} height={bottom - clampY + 12} fill="rgba(255,255,255,0.45)" />
      <rect x={rodX - 26} y={bottom - 5} width={60} height={6} rx={2} fill="#34393f" />
      <rect x={rodX - 26} y={bottom - 5} width={60} height={1.4} fill="rgba(255,255,255,0.2)" />
      <rect x={sh.cx + sh.mouthHalf} y={clampY - 2} width={rodX - sh.cx - sh.mouthHalf} height={4} fill="#7d848b" />
      <rect x={rodX - 5} y={clampY - 6} width={10} height={12} rx={1.5} fill="#3d4349" />
      <rect x={sh.cx - sh.mouthHalf - 2.5} y={clampY - 4.5} width={sh.mouthHalf * 2 + 5} height={9} rx={2} fill="none" stroke="#6b7279" strokeWidth={2.2} />
      <rect x={sh.cx - sh.mouthHalf - 1} y={clampY - 3.2} width={2} height={6.4} fill="#c49a6c" />
      <rect x={sh.cx + sh.mouthHalf - 1} y={clampY - 3.2} width={2} height={6.4} fill="#c49a6c" />
    </g>
  )
}

// ------------------------------------------------------------------ dish

function DishArt({ s, d, t, id, thermometer }: { s: number; d?: Display | null; t: number; id: string; thermometer?: number | null }) {
  const sh = SHAPES.dish
  const level = d?.level ?? 0
  const wet = !!d?.wet && level > 0.004
  const cy = sh.levelY(level)
  const rx = Math.min(52, sh.half(cy) * 0.98)
  const ry = rx * 0.15
  const col: RGB = d?.liquid ?? [225, 238, 252]
  const a = Math.max(0.28, d?.liquidA ?? 0)
  const sedTotal = (d?.sediment ?? []).reduce((acc, sd) => acc + sd.amount, 0)
  const main = (d?.sediment ?? []).slice().sort((x, y) => y.amount - x.amount)[0]
  const hot = clamp(((d?.temp ?? 22) - 450) / 500, 0, 0.5)
  return (
    <svg width={sh.w * s} height={sh.h * s} viewBox={`0 0 ${sh.w} ${sh.h}`} overflow="visible" style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      <defs>
        <linearGradient id={`${id}o`} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor="#d8d4cb" />
          <stop offset="0.3" stopColor="#fbfaf7" />
          <stop offset="0.7" stopColor="#e7e3db" />
          <stop offset="1" stopColor="#a9a398" />
        </linearGradient>
        <radialGradient id={`${id}i`} cx="0.5" cy="0.8" r="0.7">
          <stop offset="0" stopColor="#f3f1ec" />
          <stop offset="0.7" stopColor="#d9d5cc" />
          <stop offset="1" stopColor="#b5afa4" />
        </radialGradient>
        <clipPath id={`${id}c`}>
          <ellipse cx={sh.cx} cy={14} rx={54} ry={8} />
        </clipPath>
      </defs>
      <path d={sh.body} fill={`url(#${id}o)`} stroke="rgba(0,0,0,0.22)" strokeWidth={0.6} />
      <path d="M12 22 Q20 40 46 47" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={2} strokeLinecap="round" />
      {hot > 0 && <path d={sh.body} fill={`rgba(255,110,40,${hot * 0.22})`} />}
      <ellipse cx={sh.cx} cy={14} rx={56} ry={9.3} fill="#f7f5f0" />
      <ellipse cx={sh.cx} cy={14} rx={54} ry={8} fill={`url(#${id}i)`} />
      <g clipPath={`url(#${id}c)`}>
        {main && sedTotal > 0.05 && (
          <g>
            <ellipse cx={sh.cx} cy={17.5} rx={Math.min(44, 8 + Math.sqrt(sedTotal) * 3.2)} ry={Math.min(5.5, 1.6 + Math.sqrt(sedTotal) * 0.35)} fill={rgba(main.color, 1)} />
            <ellipse cx={sh.cx - 4} cy={16.3} rx={Math.min(30, 5 + Math.sqrt(sedTotal) * 2)} ry={1.2} fill={rgba(mixRGB(main.color, [255, 255, 255], 0.4), 0.7)} />
          </g>
        )}
        {wet && (
          <>
            <ellipse cx={sh.cx} cy={cy} rx={rx} ry={ry + 2.5} fill={rgba(col, a)} />
            {d && d.cloudA > 0.01 && <ellipse cx={sh.cx} cy={cy} rx={rx} ry={ry + 2.5} fill={rgba(d.cloud, d.cloudA * 0.85)} />}
            <ellipse cx={sh.cx - rx * 0.3} cy={cy - ry * 0.6} rx={rx * 0.35} ry={ry * 0.4} fill="rgba(255,255,255,0.35)" />
            <ellipse cx={sh.cx} cy={cy} rx={rx} ry={ry + 2.5} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={0.6} />
          </>
        )}
        {d && d.floating.map((f, i) => (
          <circle key={f.id} cx={sh.cx + ballOffset(t, 3 + i) * rx * 0.7} cy={cy - 1} r={3.4} fill="#cfcfc6" stroke="#8d8d86" strokeWidth={0.5} />
        ))}
      </g>
      <ellipse cx={sh.cx} cy={14} rx={56} ry={9.3} fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth={1.1} />
      <ellipse cx={sh.cx} cy={14.4} rx={57.6} ry={10} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth={0.6} />
      <path d="M117 12 Q123 11 122 15" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth={0.6} />
      {thermometer != null && (
        <g transform={`translate(${sh.cx - 14} 18) rotate(62)`}>
          <ThermometerG temp={thermometer} length={130} />
        </g>
      )}
    </svg>
  )
}

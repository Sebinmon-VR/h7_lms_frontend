import * as React from 'react'

import { TOOL_SIZE, rgba, type RGB, type ToolKind } from './geometry'
import type { ShelfKey } from './useLabSim'

/**
 * Hand tools, drawn to scale with the glassware: thermometer, wooden splint,
 * litmus paper and a nichrome flame-test loop. Each is drawn lying flat with
 * its business end on the right, so the bench can show it resting and the
 * test animations can swing it into a vessel by rotating about the tip.
 */

export const LITMUS: Record<'red' | 'blue', RGB> = { red: [214, 64, 84], blue: [70, 104, 210] }

// ------------------------------------------------------------- thermometer

/** Vertical thermometer, bulb centred on (0, 0), stem going up `length`. */
export function ThermometerG({ temp, length = 150 }: { temp: number; length?: number }) {
  const scale = length - 26
  const yAt = (T: number) => -4 - (Math.max(-10, Math.min(110, T)) + 10) / 120 * scale
  const ticks = []
  for (let T = -10; T <= 110; T += 10) {
    const major = T % 50 === 0
    ticks.push(<line key={T} x1={1} x2={major ? 3 : 2.2} y1={yAt(T)} y2={yAt(T)} stroke="rgba(30,35,40,0.7)" strokeWidth={0.45} />)
  }
  return (
    <g>
      <rect x={-3.2} y={-length} width={6.4} height={length - 2} rx={3.2} fill="rgba(235,242,250,0.32)" stroke="rgba(240,248,255,0.85)" strokeWidth={0.7} />
      <rect x={-2.2} y={-length + 10} width={4.4} height={scale + 2} rx={1} fill="rgba(255,255,255,0.75)" />
      {ticks}
      <rect x={-0.75} y={yAt(temp)} width={1.5} height={-4 - yAt(temp) + 1} fill="#d42a2a" />
      <ellipse cx={0} cy={0} rx={3.7} ry={5} fill="#d42a2a" stroke="rgba(255,255,255,0.7)" strokeWidth={0.6} />
      <ellipse cx={-1.2} cy={-1.6} rx={0.9} ry={1.8} fill="rgba(255,255,255,0.75)" />
      <line x1={-1.9} x2={-1.9} y1={-length + 4} y2={-8} stroke="rgba(255,255,255,0.7)" strokeWidth={0.6} />
    </g>
  )
}

// -------------------------------------------------------------------- splint

export function SplintG({ mode, length = 118, flame = 1, ember = 1, upright = 0 }: { mode: 'glowing' | 'burning'; length?: number; flame?: number; ember?: number; upright?: number }) {
  const id = React.useId().replace(/:/g, '')
  return (
    <g>
      <defs>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9c793" />
          <stop offset="0.5" stopColor="#d1a46a" />
          <stop offset="1" stopColor="#a87a45" />
        </linearGradient>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a87a45" stopOpacity="0" />
          <stop offset="0.5" stopColor="#3b2416" />
          <stop offset="1" stopColor="#141010" />
        </linearGradient>
        <radialGradient id={`${id}e`}>
          <stop offset="0" stopColor="#fff2b0" />
          <stop offset="0.35" stopColor="#ff8a1e" />
          <stop offset="1" stopColor="#ff5a00" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}f`} cx="0.5" cy="0.75" r="0.75">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset="0.35" stopColor="#ffd25a" />
          <stop offset="0.7" stopColor="#ff8a1e" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ff4a00" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x={0} y={-2.4} width={length} height={4.8} rx={1.2} fill={`url(#${id}w)`} />
      <rect x={length - 16} y={-2.4} width={16} height={4.8} rx={1.2} fill={`url(#${id}c)`} />
      {mode === 'glowing' && ember > 0 && (
        <g opacity={ember}>
          <circle cx={length - 1} cy={0} r={7} fill={`url(#${id}e)`} className="lab-ember" />
          <rect x={length - 4} y={-2} width={4} height={4} rx={1} fill="#ff9a3a" />
        </g>
      )}
      {mode === 'burning' && flame > 0 && (
        <g transform={`translate(${length + 1} 0) rotate(${-upright}) scale(${flame})`}>
          <g className="lab-flicker" style={{ transformOrigin: '0px 2px' }}>
            <path d="M-6 2 C-7 -6 -2 -13 0 -22 C2 -13 7 -6 6 2 C4 6 -4 6 -6 2 Z" fill={`url(#${id}f)`} />
            <path d="M-2.5 2 C-3 -3 -1 -6 0 -10 C1 -6 3 -3 2.5 2 C1.5 4 -1.5 4 -2.5 2 Z" fill="rgba(120,170,255,0.7)" />
          </g>
        </g>
      )}
    </g>
  )
}

// -------------------------------------------------------------------- litmus

export function LitmusG({ paper, now, wet = 0, length = 56 }: { paper: 'red' | 'blue'; now: 'red' | 'blue' | null; wet?: number; length?: number }) {
  const base = LITMUS[paper]
  const dipped = now && now !== paper ? LITMUS[now] : null
  const wetLen = length * 0.45
  return (
    <g>
      <rect x={0} y={-4.5} width={length} height={9} rx={0.8} fill={rgba(base, 1)} />
      <rect x={0} y={-4.5} width={length} height={9} rx={0.8} fill="url(#lab-paper)" opacity={0.35} />
      {dipped && <rect x={length - wetLen} y={-4.5} width={wetLen} height={9} rx={0.8} fill={rgba(dipped, 1)} />}
      {wet > 0 && <rect x={length - wetLen} y={-4.5} width={wetLen} height={9} rx={0.8} fill="rgba(0,0,0,0.18)" opacity={wet} />}
      <rect x={0.4} y={-4.1} width={length - 0.8} height={1.4} fill="rgba(255,255,255,0.25)" />
    </g>
  )
}

// ---------------------------------------------------------------------- loop

export function LoopG({ sample, length = 124, glow = 0 }: { sample: RGB | null | 'clean'; length?: number; glow?: number }) {
  const handle = length * 0.42
  return (
    <g>
      <rect x={0} y={-3.6} width={handle} height={7.2} rx={3.2} fill="#2b2f35" />
      <rect x={1.5} y={-2.8} width={handle - 3} height={1.6} rx={0.8} fill="rgba(255,255,255,0.22)" />
      <rect x={handle - 4} y={-2.4} width={6} height={4.8} rx={1} fill="#9aa1a8" />
      <line x1={handle + 2} y1={0} x2={length - 7} y2={0} stroke="#b9bcc0" strokeWidth={0.9} />
      <circle cx={length - 3.8} cy={0} r={3.3} fill={sample && sample !== 'clean' ? rgba(sample, 0.55) : 'none'} stroke={glow > 0 ? `rgba(255,${160 - glow * 60},60,1)` : '#c4c7cb'} strokeWidth={0.9} />
    </g>
  )
}

// --------------------------------------------------------------- bench poses

/** A tool lying on the bench, filling its TOOL_SIZE box. */
export function RestingTool({
  kind,
  s,
  splint = 'burning',
  paper = 'red',
  paperNow = null,
  sample = null,
  hidden,
}: {
  kind: ToolKind
  s: number
  splint?: 'glowing' | 'burning'
  paper?: 'red' | 'blue'
  paperNow?: 'red' | 'blue' | null
  sample?: RGB | null | 'clean'
  hidden?: boolean
}) {
  const { w, h } = TOOL_SIZE[kind]
  return (
    <svg width={w * s} height={h * s} viewBox={`0 0 ${w} ${h}`} overflow="visible" style={{ opacity: hidden ? 0 : 1, display: 'block' }} aria-hidden>
      <PaperPattern />
      {kind === 'thermometer' && (
        <g transform={`translate(${w - 6} ${h / 2}) rotate(-90)`}>
          <ThermometerG temp={22} length={w - 10} />
        </g>
      )}
      {kind === 'splint' && (
        <g transform={`translate(0 ${h / 2})`}>
          <SplintG mode={splint} length={w - 8} flame={0.75} />
        </g>
      )}
      {kind === 'litmus' && (
        <g transform={`translate(4 ${h / 2})`}>
          <LitmusG paper={paper} now={paperNow} length={w - 8} />
        </g>
      )}
      {kind === 'loop' && (
        <g transform={`translate(0 ${h / 2})`}>
          <LoopG sample={sample} length={w - 2} />
        </g>
      )}
    </svg>
  )
}

function PaperPattern() {
  return (
    <defs>
      <pattern id="lab-paper" width="3" height="3" patternUnits="userSpaceOnUse">
        <rect width="3" height="3" fill="none" />
        <circle cx="1" cy="1" r="0.5" fill="rgba(255,255,255,0.6)" />
      </pattern>
    </defs>
  )
}

// ---------------------------------------------------------------- shelf icons

/** Line icons for the equipment rail, drawn in currentColor so they follow the theme. */
export function EquipmentIcon({ k, className }: { k: ShelfKey; className?: string }) {
  const liquid = 'hsl(var(--primary) / 0.35)'
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  let body: React.ReactNode
  switch (k) {
    case 'beaker':
      body = (
        <>
          <path d="M10 22 L10 35 Q10 37 12 37 L28 37 Q30 37 30 35 L30 22 Z" fill={liquid} stroke="none" />
          <path d="M7 6 Q9 6.5 10 8 L10 35 Q10 37 12 37 L28 37 Q30 37 30 35 L30 8 Q31 6.5 33 6" {...common} />
          <path d="M14 14 h4 M14 20 h3 M14 26 h4" {...common} strokeWidth={1.1} />
        </>
      )
      break
    case 'flask':
      body = (
        <>
          <path d="M11.5 26 L8 33 Q6.8 37 11 37 L29 37 Q33.2 37 32 33 L28.5 26 Z" fill={liquid} stroke="none" />
          <path d="M15.5 4 L17 5 L17 15 L8 33 Q6.8 37 11 37 L29 37 Q33.2 37 32 33 L23 15 L23 5 L24.5 4" {...common} />
        </>
      )
      break
    case 'testtube':
      body = (
        <>
          <path d="M16.5 22 L16.5 33 A3.5 3.5 0 0 0 23.5 33 L23.5 22 Z" fill={liquid} stroke="none" />
          <path d="M15 4 Q16.5 4.5 16.5 6 L16.5 33 A3.5 3.5 0 0 0 23.5 33 L23.5 6 Q23.5 4.5 25 4" {...common} />
        </>
      )
      break
    case 'boilingtube':
      body = (
        <>
          <path d="M15 22 L15 32 A5 5 0 0 0 25 32 L25 22 Z" fill={liquid} stroke="none" />
          <path d="M13.5 4 Q15 4.5 15 6 L15 32 A5 5 0 0 0 25 32 L25 6 Q25 4.5 26.5 4" {...common} />
        </>
      )
      break
    case 'cylinder':
      body = (
        <>
          <path d="M17 18 L17 33 L23 33 L23 18 Z" fill={liquid} stroke="none" />
          <path d="M15.5 3.5 Q17 4 17 5.5 L17 33 L23 33 L23 5.5 Q23.5 4 25 3.5 M12 37 L13.5 33.5 L26.5 33.5 L28 37 Z" {...common} />
          <path d="M17 10 h2.5 M17 15 h2 M17 20 h2.5 M17 25 h2" {...common} strokeWidth={1} />
        </>
      )
      break
    case 'dish':
      body = (
        <>
          <ellipse cx="20" cy="22" rx="12" ry="2.5" fill={liquid} stroke="none" />
          <path d="M4 20 Q5 32 20 33 Q35 32 36 20" {...common} />
          <ellipse cx="20" cy="20" rx="16" ry="3.2" {...common} />
        </>
      )
      break
    case 'burner':
      body = (
        <>
          <path d="M20 6 C17 10 17 13 20 16 C23 13 23 10 20 6 Z" fill="hsl(var(--info) / 0.5)" stroke="hsl(var(--info))" strokeWidth={1.2} />
          <path d="M18 17 L18 32 M22 17 L22 32 M17.5 26 h5 M12 37 L14 32.5 L26 32.5 L28 37 Z M18 34 L10 34 Q6 34 5 37" {...common} />
        </>
      )
      break
    case 'thermometer':
      body = (
        <>
          <path d="M18 5 Q18 3 20 3 Q22 3 22 5 L22 29 A4.2 4.2 0 1 1 18 29 Z" {...common} />
          <path d="M20 16 L20 31" stroke="hsl(var(--danger))" strokeWidth={2} strokeLinecap="round" />
          <circle cx="20" cy="32.5" r="2.4" fill="hsl(var(--danger))" />
        </>
      )
      break
    case 'splint':
      body = (
        <>
          <path d="M7 33 L29 11" {...common} strokeWidth={3} stroke="hsl(var(--warning) / 0.8)" />
          <path d="M29 11 C27 8 29 5 31 3 C32 6 35 7 33 11 C32 12.5 30 12.5 29 11 Z" fill="hsl(var(--warning))" stroke="none" />
        </>
      )
      break
    case 'litmus-red':
    case 'litmus-blue':
      body = (
        <>
          <rect x="9" y="11" width="22" height="7" rx="1" fill={k === 'litmus-red' ? '#d64054' : '#4668d2'} />
          <rect x="9" y="22" width="22" height="7" rx="1" fill={k === 'litmus-red' ? '#d64054' : '#4668d2'} opacity="0.55" />
        </>
      )
      break
    case 'loop':
      body = (
        <>
          <path d="M6 34 L16 24" {...common} strokeWidth={3.4} />
          <path d="M16 24 L27 13" {...common} strokeWidth={1.1} />
          <circle cx="29.5" cy="10.5" r="3.2" {...common} strokeWidth={1.2} />
        </>
      )
      break
    case 'delivery':
      body = (
        <>
          <path d="M8 34 L8 12 Q8 7 13 7 L27 7 Q32 7 32 12 L32 34" {...common} strokeWidth={2.4} />
          <rect x="5" y="26" width="6" height="5" rx="1" fill="currentColor" opacity="0.5" />
        </>
      )
      break
  }
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      {body}
    </svg>
  )
}

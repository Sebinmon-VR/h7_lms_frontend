import * as React from 'react'

import { substance, type Reagent } from './engine/substances'
import { hashSeed, mixRGB, rgba, seeded, shade, type RGB } from './geometry'

/**
 * Cabinet bottles. Solutions and liquids come in narrow-necked reagent
 * bottles (amber glass for the light-sensitive ones), solids in wide jars;
 * the cap colour follows the shelf, as in a school prep room, and a red
 * diamond marks anything hazardous.
 */

const AMBER = new Set(['r_agno3', 'r_kmno4', 'r_iodine', 'r_h2o2', 'r_i2'])

const CAP: Record<Reagent['shelf'], string> = {
  acids: '#b3261e',
  bases: '#1f4fa8',
  salts: '#2f3338',
  metals: '#5b6168',
  indicators: '#2f7d32',
  solids: '#e6e2d8',
  other: '#26282b',
}

export const BOTTLE_W = 48
export const BOTTLE_H = 72
/** The pouring lip, in bottle units. */
export const BOTTLE_MOUTH_Y = 3

export function Bottle({ reagent, size = 1, className }: { reagent: Reagent; size?: number; className?: string }) {
  const id = 'r' + React.useId().replace(/:/g, '')
  const sub = substance(reagent.substance)
  const amber = AMBER.has(reagent.id)
  const solid = reagent.form === 'solid'
  const contents: RGB = solid ? sub.color : sub.alpha < 0.08 ? [205, 225, 242] : sub.color
  const ca = solid ? 1 : Math.max(0.35, Math.min(0.92, sub.alpha + 0.2))
  const formula = sub.formula.length > 11 ? sub.formula.slice(0, 11) : sub.formula
  const long = formula.length > 7
  const glassTint = amber ? 'rgba(150,80,20,0.55)' : 'rgba(215,230,242,0.28)'
  const rnd = seeded(hashSeed(reagent.id))

  return (
    <svg width={BOTTLE_W * size} height={BOTTLE_H * size} viewBox={`0 0 ${BOTTLE_W} ${BOTTLE_H}`} className={className} overflow="visible" aria-hidden>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.18" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="0.7" stopColor="#fff" stopOpacity="0.02" />
          <stop offset="1" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={rgba(shade(contents, 0.65), 1)} />
          <stop offset="0.35" stopColor={rgba(contents, 1)} />
          <stop offset="1" stopColor={rgba(shade(contents, 0.6), 1)} />
        </linearGradient>
        <clipPath id={`${id}k`}>
          {solid ? <rect x={6} y={21} width={36} height={48} rx={5} /> : <path d="M20 13 L20 19 Q8 21 7.5 30 L7.5 64 Q7.5 69 12.5 69 L35.5 69 Q40.5 69 40.5 64 L40.5 30 Q40 21 28 19 L28 13 Z" />}
        </clipPath>
      </defs>

      {solid ? (
        <>
          <rect x={5} y={19} width={38} height={51} rx={6} fill={glassTint} stroke="rgba(70,90,110,0.55)" strokeWidth={0.8} />
          <g clipPath={`url(#${id}k)`}>
            <rect x={0} y={36} width={48} height={40} fill={`url(#${id}c)`} />
            {Array.from({ length: 26 }, (_, i) => (
              <circle key={i} cx={7 + rnd() * 34} cy={37 + rnd() * 31} r={0.5 + rnd() * (sub.kind === 'metal' || sub.kind === 'carbonate' ? 2.2 : 0.7)} fill={rgba(rnd() < 0.5 ? shade(contents, 0.75) : mixRGB(contents, [255, 255, 255], 0.5), 0.8)} />
            ))}
          </g>
          <rect x={7} y={6} width={34} height={14} rx={2.5} fill={CAP[reagent.shelf]} />
          <rect x={7} y={6} width={34} height={3} rx={1.5} fill="rgba(255,255,255,0.3)" />
          {Array.from({ length: 8 }, (_, i) => (
            <line key={i} x1={10 + i * 4} x2={10 + i * 4} y1={10} y2={19} stroke="rgba(0,0,0,0.18)" strokeWidth={0.8} />
          ))}
          <rect x={5} y={19} width={38} height={51} rx={6} fill={`url(#${id}g)`} />
          <rect x={5.8} y={19.8} width={36.4} height={49.4} rx={5.4} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.6} />
        </>
      ) : (
        <>
          <path d="M19 12 L19 18.5 Q6.5 20.5 6 30 L6 64 Q6 70 12 70 L36 70 Q42 70 42 64 L42 30 Q41.5 20.5 29 18.5 L29 12 Z" fill={glassTint} stroke="rgba(70,90,110,0.55)" strokeWidth={0.8} />
          <g clipPath={`url(#${id}k)`}>
            <rect x={0} y={27} width={48} height={50} fill={`url(#${id}c)`} opacity={ca} />
            <rect x={0} y={27} width={48} height={1.4} fill={rgba(mixRGB(contents, [255, 255, 255], 0.6), 0.9)} />
            {amber && <rect x={0} y={0} width={48} height={72} fill="rgba(120,60,10,0.35)" />}
          </g>
          <path d="M19 12 L19 18.5 Q6.5 20.5 6 30 L6 64 Q6 70 12 70 L36 70 Q42 70 42 64 L42 30 Q41.5 20.5 29 18.5 L29 12 Z" fill={`url(#${id}g)`} />
          <path d="M19.8 13 L19.8 19.2 Q7.4 21.2 6.9 30 L6.9 64 Q6.9 69.1 12 69.1 L36 69.1 Q41.1 69.1 41.1 64 L41.1 30 Q40.6 21.2 28.2 19.2 L28.2 13" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.6} />
          <rect x={17} y={2} width={14} height={11} rx={2} fill={CAP[reagent.shelf]} />
          <rect x={17} y={2} width={14} height={2.6} rx={1.3} fill="rgba(255,255,255,0.3)" />
          <rect x={18.5} y={12.5} width={11} height={1.5} fill="rgba(0,0,0,0.25)" />
        </>
      )}

      {/* label */}
      <rect x={9.5} y={40} width={29} height={21} rx={1.2} fill="#f6f1e4" stroke="rgba(0,0,0,0.15)" strokeWidth={0.5} />
      <rect x={9.5} y={40} width={29} height={3} rx={1} fill={CAP[reagent.shelf] === '#e6e2d8' ? '#8a8576' : CAP[reagent.shelf]} opacity={0.85} />
      <text
        x={24}
        y={52.5}
        textAnchor="middle"
        fontSize={long ? 5.6 : 7}
        fontWeight={800}
        fill="#1d1f22"
        fontFamily="ui-sans-serif, system-ui"
        {...(formula.length > 9 ? { textLength: 26, lengthAdjust: 'spacingAndGlyphs' } : {})}
      >
        {formula}
      </text>
      <text x={24} y={58.6} textAnchor="middle" fontSize={4.2} fill="#55585c" fontFamily="ui-sans-serif, system-ui" fontWeight={600}>
        {reagent.molarity && reagent.form === 'solution' ? `${reagent.molarity} M` : solid ? 'solid' : 'liquid'}
      </text>
      {reagent.hazard && (
        <g transform="translate(36 41.5) rotate(45)">
          <rect x={-3} y={-3} width={6} height={6} fill="#fff" stroke="#d32020" strokeWidth={1} />
          <rect x={-0.4} y={-1.8} width={0.8} height={2.2} fill="#111" transform="rotate(-45)" />
        </g>
      )}
    </svg>
  )
}

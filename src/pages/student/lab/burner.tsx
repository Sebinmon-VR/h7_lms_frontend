import * as React from 'react'

import { BURNER, rgba, type RGB } from './geometry'

/**
 * A Bunsen burner under a tripod and gauze. Turned low, the air hole closes
 * and the flame goes yellow and lazy (the safety flame); turned up, it roars
 * blue with a bright inner cone. A flame test floods the outer flame with
 * the metal's colour. When a tube is clamped over it the tripod is left out.
 */
export function BurnerArt({
  s,
  lit,
  power,
  holding,
  flameTest,
}: {
  s: number
  lit: boolean
  power: number
  holding: 'none' | 'vessel' | 'tube'
  flameTest: RGB | null
}) {
  const id = 'b' + React.useId().replace(/:/g, '')
  const { w, h, barrelTop: top } = BURNER
  const tripod = holding !== 'tube'
  const safety = power < 0.22
  let fh = safety ? 46 : 20 + 46 * power
  let fw = safety ? 9 : 5.5 + 2.5 * power
  if (flameTest) {
    fh = Math.max(fh, 40) * 1.12
    fw = fw * 1.7
  }
  const capped = tripod && holding === 'vessel' && fh > top - 14
  if (tripod) fh = Math.min(fh, top - 12)
  const flame = (hgt: number, hw: number) =>
    `M${50 - hw} ${top} C${50 - hw} ${top - hgt * 0.38} ${50 - hw * 0.45} ${top - hgt * 0.75} 50 ${top - hgt} C${50 + hw * 0.45} ${top - hgt * 0.75} ${50 + hw} ${top - hgt * 0.38} ${50 + hw} ${top} Z`

  return (
    <svg width={w * s} height={h * s} viewBox={`0 0 ${w} ${h}`} overflow="visible" style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      <defs>
        <linearGradient id={`${id}chrome`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4b5259" />
          <stop offset="0.28" stopColor="#dfe5ea" />
          <stop offset="0.5" stopColor="#9aa3ab" />
          <stop offset="0.8" stopColor="#5d656c" />
          <stop offset="1" stopColor="#3a4046" />
        </linearGradient>
        <linearGradient id={`${id}base`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6c737a" />
          <stop offset="0.4" stopColor="#40464c" />
          <stop offset="1" stopColor="#1f2327" />
        </linearGradient>
        <linearGradient id={`${id}blue`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="rgb(70,105,255)" stopOpacity="0.9" />
          <stop offset="0.55" stopColor="rgb(100,140,255)" stopOpacity="0.5" />
          <stop offset="1" stopColor="rgb(140,170,255)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}cone`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.4" stopColor="rgb(120,225,255)" stopOpacity="0.95" />
          <stop offset="1" stopColor="rgb(80,170,255)" stopOpacity="0.4" />
        </linearGradient>
        <linearGradient id={`${id}yellow`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="rgb(120,150,255)" stopOpacity="0.8" />
          <stop offset="0.12" stopColor="#fff6c4" />
          <stop offset="0.5" stopColor="#ffc14d" />
          <stop offset="0.85" stopColor="#ff8a2a" stopOpacity="0.75" />
          <stop offset="1" stopColor="#ff6a10" stopOpacity="0" />
        </linearGradient>
        {flameTest && (
          <linearGradient id={`${id}test`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={rgba(flameTest, 1)} stopOpacity="0.95" />
            <stop offset="0.5" stopColor={rgba(flameTest, 1)} stopOpacity="0.75" />
            <stop offset="1" stopColor={rgba(flameTest, 1)} stopOpacity="0" />
          </linearGradient>
        )}
        <radialGradient id={`${id}glow`}>
          <stop offset="0" stopColor={flameTest ? rgba(flameTest, 1) : safety ? '#ffb347' : '#6e8cff'} stopOpacity="0.45" />
          <stop offset="1" stopColor={flameTest ? rgba(flameTest, 1) : '#6e8cff'} stopOpacity="0" />
        </radialGradient>
        <pattern id={`${id}mesh`} width="2.2" height="2.2" patternUnits="userSpaceOnUse">
          <path d="M0 0 L2.2 2.2 M2.2 0 L0 2.2" stroke="#6f767c" strokeWidth="0.35" />
        </pattern>
      </defs>

      {tripod && <line x1={50} y1={15} x2={50} y2={h} stroke="#25292d" strokeWidth={3} strokeLinecap="round" />}

      {/* rubber hose to the gas tap */}
      <path d={`M36 141 C26 141 22 152 12 156 S-10 159 -26 159`} fill="none" stroke="#b9592a" strokeWidth={5} strokeLinecap="round" />
      <path d={`M36 140 C26 140 22 151 12 155 S-10 158 -26 158`} fill="none" stroke="rgba(255,215,170,0.35)" strokeWidth={1.2} strokeLinecap="round" />

      {/* burner */}
      <path d="M25 160 L29.5 149 Q50 143.5 70.5 149 L75 160 Z" fill={`url(#${id}base)`} />
      <path d="M30 149.4 Q50 144.2 70 149.4" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.8} />
      <rect x={34} y={137.5} width={11} height={5.5} rx={1.2} fill={`url(#${id}chrome)`} />
      <rect x={44} y={top} width={12} height={150 - top} fill={`url(#${id}chrome)`} />
      <rect x={42.5} y={121} width={15} height={13} rx={1.2} fill={`url(#${id}chrome)`} stroke="rgba(0,0,0,0.3)" strokeWidth={0.5} />
      <rect x={47} y={127.5 - (1 + power * 4) / 2} width={6} height={1 + power * 4} rx={0.6} fill="#0d0f11" />
      <ellipse cx={50} cy={top} rx={6} ry={1.3} fill="#2a2e32" />

      {lit && (
        <g>
          <ellipse cx={50} cy={top - fh * 0.45} rx={fw * 4.5} ry={fh * 0.75} fill={`url(#${id}glow)`} />
          <g className={safety && !flameTest ? 'lab-flicker-slow' : 'lab-flicker'} style={{ transformOrigin: `50px ${top}px` }}>
            {flameTest ? (
              <>
                <path d={flame(fh, fw)} fill={`url(#${id}test)`} />
                <path d={flame(fh * 0.3, fw * 0.4)} fill={`url(#${id}cone)`} opacity={0.6} />
              </>
            ) : safety ? (
              <path d={`M${50 - fw} ${top} C${50 - fw - 1} ${top - fh * 0.35} ${50 - fw * 0.2} ${top - fh * 0.6} ${50 + 2} ${top - fh} C${50 + fw * 0.6} ${top - fh * 0.6} ${50 + fw + 1} ${top - fh * 0.3} ${50 + fw} ${top} Z`} fill={`url(#${id}yellow)`} />
            ) : (
              <>
                <path d={flame(fh, fw)} fill={`url(#${id}blue)`} />
                <path d={flame(fh * 0.42, fw * 0.62)} fill={`url(#${id}cone)`} />
              </>
            )}
          </g>
          {capped && <ellipse cx={50} cy={16} rx={16 + power * 8} ry={2.6} fill={flameTest ? rgba(flameTest, 0.5) : 'rgba(110,145,255,0.45)'} />}
        </g>
      )}

      {tripod && (
        <g>
          <path d="M9 15 L2 160" stroke="#3d4349" strokeWidth={3.4} strokeLinecap="round" />
          <path d="M91 15 L98 160" stroke="#3d4349" strokeWidth={3.4} strokeLinecap="round" />
          <path d="M8.2 18 L2.4 150" stroke="rgba(255,255,255,0.18)" strokeWidth={0.8} />
          <rect x={1} y={BURNER.gauzeY - 2} width={98} height={5} rx={0.8} fill={`url(#${id}mesh)`} stroke="#52595f" strokeWidth={0.7} />
          <rect x={30} y={BURNER.gauzeY - 1.4} width={40} height={3.8} rx={0.6} fill="#d6d0c4" />
          {lit && holding === 'vessel' && power > 0.3 && (
            <rect x={34} y={BURNER.gauzeY - 1.4} width={32} height={3.8} rx={0.6} fill={`rgba(255,110,40,${(power - 0.3) * 0.9})`} />
          )}
          <rect x={1} y={BURNER.gauzeY - 2} width={98} height={1} fill="rgba(255,255,255,0.25)" />
        </g>
      )}
    </svg>
  )
}

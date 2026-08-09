import * as React from 'react'

/**
 * Confetti burst.
 *
 * Three things keep this from becoming annoying, which is the real design
 * problem with celebration effects:
 *
 *  - It renders nothing until fired, and unmounts itself when the animation
 *    ends. Nothing animates off-screen forever.
 *  - It respects `prefers-reduced-motion` by not firing at all. For anyone who
 *    has asked the OS to stop moving things, a screenful of falling paper is
 *    exactly what they opted out of.
 *  - It is `aria-hidden` and non-interactive, so it never interrupts a screen
 *    reader mid-sentence or swallows a click.
 *
 * Callers fire it on a genuine achievement, not on every successful request.
 */

const PIECE_COUNT = 42
const TONES = [1, 2, 3, 4, 5, 6, 7, 8, 9]

interface Piece {
  id: number
  left: number
  tone: number
  duration: number
  delay: number
  drift: number
  spin: number
}

function buildPieces(seed: number): Piece[] {
  return Array.from({ length: PIECE_COUNT }, (_, i) => ({
    id: seed * PIECE_COUNT + i,
    left: Math.random() * 100,
    tone: TONES[Math.floor(Math.random() * TONES.length)],
    duration: 2 + Math.random() * 1.6,
    delay: Math.random() * 0.5,
    // Sideways drift, so the fall does not read as a uniform curtain.
    drift: (Math.random() - 0.5) * 40,
    spin: 360 + Math.random() * 720,
  }))
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

/**
 * Returns `[element, fire]`. Render the element anywhere in the tree; call
 * `fire()` when something worth celebrating happens.
 */
export function useCelebration(): [React.ReactNode, () => void] {
  const [burst, setBurst] = React.useState<{ seed: number; pieces: Piece[] } | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout>>()
  const seed = React.useRef(0)

  React.useEffect(() => () => clearTimeout(timer.current), [])

  const fire = React.useCallback(() => {
    if (prefersReducedMotion()) return
    seed.current += 1
    setBurst({ seed: seed.current, pieces: buildPieces(seed.current) })
    clearTimeout(timer.current)
    // Longest piece is 2 + 1.6 duration plus 0.5 delay; clear a little after.
    timer.current = setTimeout(() => setBurst(null), 4400)
  }, [])

  const element = burst ? (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      {burst.pieces.map((piece) => (
        <span
          key={piece.id}
          className="confetti-piece"
          style={
            {
              left: `${piece.left}%`,
              background: `hsl(var(--fun-${piece.tone}))`,
              '--fall-duration': `${piece.duration}s`,
              '--fall-delay': `${piece.delay}s`,
              '--fall-x': `${piece.drift}vw`,
              '--fall-spin': `${piece.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  ) : null

  return [element, fire]
}

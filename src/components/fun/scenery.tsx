import * as React from 'react'

/**
 * The illustrated backdrop for the learner portal.
 *
 * This is the layer that makes the app feel like a place rather than a form: a
 * wash of colour, a soft hill horizon, and a scatter of drifting doodles behind
 * everything the student reads.
 *
 * Three constraints shaped it, and they are why it looks the way it does:
 *
 *  - **It must never fight the content.** Everything sits at low opacity behind
 *    a `-z-10` layer, and the doodles are placed in the outer margins where
 *    cards do not reach. Text contrast is unaffected.
 *  - **It must be cheap.** One fixed SVG, no images, no per-frame JS. The
 *    motion is pure CSS transform/opacity, which the compositor handles without
 *    touching layout, so scrolling a long page stays smooth.
 *  - **It must be silent to assistive tech and to anyone who asked for less
 *    motion.** The whole layer is `aria-hidden`, and every animation is gated
 *    behind `prefers-reduced-motion` in the stylesheet.
 */

/** A doodle: which glyph, where, how big, and how it drifts. */
interface Doodle {
  d: string
  /** Percentages of the viewport. */
  x: number
  y: number
  size: number
  delay: number
  duration: number
  tone: number
  rotate: number
}

/**
 * Hand-placed rather than random.
 *
 * Random scatter reliably clumps and drops things behind the main column. These
 * hug the left and right margins and the bottom band, which is where a
 * max-width content column leaves room on a laptop.
 */
const DOODLES: Doodle[] = [
  { d: 'star', x: 4, y: 14, size: 26, delay: 0, duration: 7, tone: 3, rotate: -12 },
  { d: 'book', x: 8, y: 48, size: 34, delay: 1.4, duration: 9, tone: 7, rotate: 8 },
  { d: 'pencil', x: 3, y: 74, size: 30, delay: 0.7, duration: 8, tone: 2, rotate: -20 },
  { d: 'planet', x: 92, y: 20, size: 40, delay: 0.4, duration: 10, tone: 8, rotate: 0 },
  { d: 'rocket', x: 95, y: 58, size: 32, delay: 2.1, duration: 8.5, tone: 1, rotate: -18 },
  { d: 'star', x: 88, y: 84, size: 22, delay: 1.1, duration: 6.5, tone: 9, rotate: 14 },
  { d: 'bulb', x: 14, y: 90, size: 26, delay: 1.8, duration: 7.5, tone: 3, rotate: 6 },
  { d: 'atom', x: 82, y: 40, size: 28, delay: 2.6, duration: 9.5, tone: 6, rotate: 0 },
  { d: 'cloud', x: 20, y: 8, size: 46, delay: 0.9, duration: 12, tone: 7, rotate: 0 },
  { d: 'cloud', x: 70, y: 6, size: 38, delay: 2.4, duration: 14, tone: 8, rotate: 0 },
]

/** Each glyph as a single path, drawn in a 24×24 box. */
function Glyph({ name }: { name: string }) {
  switch (name) {
    case 'star':
      return <path d="M12 2l2.9 6.3 6.8.8-5 4.7 1.3 6.8L12 17.3 6 20.6l1.3-6.8-5-4.7 6.8-.8L12 2z" />
    case 'book':
      return (
        <path d="M4 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4V4zm16 0h-3a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h3V4z" />
      )
    case 'pencil':
      return <path d="M3 21l1.2-4.6L15.6 5l3.4 3.4L7.6 19.8 3 21zM17 3.6L20.4 7 18.7 8.7 15.3 5.3 17 3.6z" />
    case 'planet':
      return (
        <>
          <circle cx="12" cy="12" r="6" />
          <path
            d="M3.5 15.5c5 2.5 12 2.5 17 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            opacity="0.7"
          />
        </>
      )
    case 'rocket':
      return (
        <path d="M12 2c3.5 2.5 5.5 6.5 5.5 11l-2.5 3h-6L6.5 13C6.5 8.5 8.5 4.5 12 2zm-1.5 18h3l-1.5 3-1.5-3z" />
      )
    case 'bulb':
      return (
        <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2zM9 19h6v1.5a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 20.5V19z" />
      )
    case 'atom':
      return (
        <>
          <circle cx="12" cy="12" r="2.6" />
          <ellipse
            cx="12"
            cy="12"
            rx="10"
            ry="4.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <ellipse
            cx="12"
            cy="12"
            rx="10"
            ry="4.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            transform="rotate(60 12 12)"
          />
        </>
      )
    case 'cloud':
      return (
        <path d="M6.5 18a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 17.6 9.3 4.2 4.2 0 0 1 17.5 18h-11z" />
      )
    default:
      return null
  }
}

/**
 * Fixed behind the scrolling content.
 *
 * `fixed` rather than `absolute` on purpose: an absolute layer would scroll
 * away on a long page and leave the lower half bare, and stretching it to the
 * full document height would multiply the paint area for no gain.
 */
export function Scenery() {
  /*
    z-0, NOT a negative index.

    Within a stacking context, negative-z children paint before the backgrounds
    of block-level descendants — so `-z-10` here put the whole layer underneath
    the app shell's own `bg-background`, which covered it completely. Sitting at
    z-0 and lifting the content to z-10 is the ordering that actually holds.
  */
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {/* Colour wash — two soft blooms that drift very slowly. */}
      <div className="scenery-bloom scenery-bloom-a" />
      <div className="scenery-bloom scenery-bloom-b" />

      {/* Rolling hills along the bottom, so the page has a ground rather than
          floating in an empty void. */}
      <svg
        className="absolute inset-x-0 bottom-0 h-[38vh] w-full"
        viewBox="0 0 1440 420"
        preserveAspectRatio="none"
      >
        <path
          d="M0 250c180-70 300 40 480 20s280-120 470-80 300 130 490 96V420H0z"
          fill="hsl(var(--fun-8) / 0.10)"
        />
        <path
          d="M0 320c200-60 320 30 520 22s300-96 500-58 260 110 420 84V420H0z"
          fill="hsl(var(--fun-5) / 0.10)"
        />
        <path
          d="M0 372c220-44 360 26 560 18s320-70 520-40 220 62 360 50V420H0z"
          fill="hsl(var(--fun-7) / 0.09)"
        />
      </svg>

      {DOODLES.map((doodle, i) => (
        <svg
          key={i}
          className="scenery-doodle"
          viewBox="0 0 24 24"
          width={doodle.size}
          height={doodle.size}
          style={
            {
              left: `${doodle.x}%`,
              top: `${doodle.y}%`,
              color: `hsl(var(--fun-${doodle.tone}))`,
              '--doodle-delay': `${doodle.delay}s`,
              '--doodle-duration': `${doodle.duration}s`,
              '--doodle-rotate': `${doodle.rotate}deg`,
            } as React.CSSProperties
          }
          fill="currentColor"
        >
          <Glyph name={doodle.d} />
        </svg>
      ))}
    </div>
  )
}

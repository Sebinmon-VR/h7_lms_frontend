import { motion, useReducedMotion, type Variants } from 'framer-motion'
import * as React from 'react'

import { cn } from '@/lib/cn'

/**
 * Motion helpers for the learner portal.
 *
 * Everything here reads `useReducedMotion` and collapses to a plain, instant
 * render when the viewer has asked the OS to stop animating things. That is
 * checked once per component rather than left to the stylesheet, because these
 * are JS-driven animations that CSS `prefers-reduced-motion` cannot reach.
 *
 * The spring is deliberately the same everywhere: a page where each element
 * eases differently reads as sloppy rather than lively.
 */

const SPRING = { type: 'spring', stiffness: 260, damping: 24, mass: 0.8 } as const

/**
 * Staggered entrance for a list or grid.
 *
 * Children arrive one after another rather than all at once, which is what
 * makes a dashboard feel assembled for you instead of merely loaded. The gap is
 * small — 45ms — so a twelve-card grid still settles in well under a second.
 */
export function Stagger({
  children,
  className,
  gap = 0.045,
}: {
  children: React.ReactNode
  className?: string
  gap?: number
}) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="shown"
      variants={{ shown: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  )
}

const ITEM: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  shown: { opacity: 1, y: 0, scale: 1, transition: SPRING },
}

/** One member of a `Stagger`. Also usable alone for a single entrance. */
export function Appear({
  children,
  className,
  style,
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  /** Passed through so a caller can set the `--tile` subject colour. */
  style?: React.CSSProperties
  delay?: number
}) {
  const reduced = useReducedMotion()
  if (reduced)
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )

  return (
    <motion.div
      className={className}
      style={style}
      variants={ITEM}
      initial="hidden"
      animate="shown"
      transition={{ ...SPRING, delay }}
    >
      {children}
    </motion.div>
  )
}

/**
 * A card that responds to touch.
 *
 * The lift on hover and the squash on press are what make a tile read as a
 * physical thing to pick up. `whileTap` matters more than `whileHover` here —
 * most of these students are on tablets, where hover does not exist.
 */
export function Pressable({
  children,
  className,
  style,
  onClick,
  as = 'div',
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
  as?: 'div' | 'button'
}) {
  const reduced = useReducedMotion()
  const Component = as === 'button' ? motion.button : motion.div

  return (
    <Component
      className={className}
      style={style}
      onClick={onClick}
      {...(as === 'button' ? { type: 'button' as const } : {})}
      whileHover={reduced ? undefined : { y: -4 }}
      whileTap={reduced ? undefined : { scale: 0.97 }}
      transition={SPRING}
    >
      {children}
    </Component>
  )
}

/**
 * A number that counts up to its value.
 *
 * Worth the complexity on exactly the figures a learner cares about — their
 * attendance, their average — because watching 0 climb to 88 registers as an
 * achievement in a way that a static 88 does not.
 *
 * Driven by rAF rather than a spring so the digits land exactly on the target
 * rather than overshooting to 91 and settling back, which looks like a bug.
 */
export function CountUp({
  value,
  suffix = '',
  duration = 900,
  className,
}: {
  value: number
  suffix?: string
  duration?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const [shown, setShown] = React.useState(reduced ? value : 0)
  const frame = React.useRef<number>()

  React.useEffect(() => {
    if (reduced) {
      setShown(value)
      return
    }
    const from = 0
    const start = performance.now()

    const tick = (t: number) => {
      const progress = Math.min(1, (t - start) / duration)
      // Ease-out cubic: quick off the mark, gentle into the target.
      const eased = 1 - Math.pow(1 - progress, 3)
      setShown(from + (value - from) * eased)
      if (progress < 1) frame.current = requestAnimationFrame(tick)
    }

    frame.current = requestAnimationFrame(tick)
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [value, duration, reduced])

  return (
    <span className={cn('tabular-nums', className)}>
      {Math.round(shown)}
      {suffix}
    </span>
  )
}

/**
 * Wavy section divider.
 *
 * Breaks a long scroll into chapters. Purely decorative, so it is hidden from
 * assistive tech — the headings already provide the structure.
 */
export function WaveDivider({ className }: { className?: string }) {
  return (
    <svg
      className={cn('wave-divider', className)}
      viewBox="0 0 1200 24"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M0 12c100-16 200 16 300 12s200-24 300-12 200 20 300 8 200-16 300-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

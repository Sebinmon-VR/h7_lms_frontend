import * as React from 'react'

import { cn } from '@/lib/cn'
import { subjectLook, subjectStyle, toneStyle } from '@/lib/subjects'
import { CountUp } from './motion'
import { Mascot, type MascotMood } from './mascot'

/**
 * Playful building blocks for the student and teacher portals.
 *
 * These deliberately sit alongside the standard `ui/` primitives rather than
 * replacing them: the admin portal keeps the plain versions, and a component
 * used in both places should not have to know which theme it is under.
 */

// ------------------------------------------------------------ subject tile

/**
 * The coloured square that stands in for a subject everywhere a learner sees
 * one. Same colour and glyph for the same subject on every screen.
 */
export function SubjectTile({
  subject,
  size = 'md',
  className,
}: {
  subject: string | null | undefined
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const look = subjectLook(subject)
  const dimensions = {
    sm: 'size-8 text-base rounded-lg',
    md: 'size-11 text-xl rounded-xl',
    lg: 'size-14 text-2xl rounded-2xl',
  }[size]

  return (
    <span
      style={toneStyle(look.tone)}
      className={cn(
        'tile-solid flex shrink-0 items-center justify-center shadow-sm',
        dimensions,
        className,
      )}
      // The label beside it carries the meaning; the glyph is decoration.
      aria-hidden
    >
      {look.emoji}
    </span>
  )
}

// -------------------------------------------------------------- big number

/**
 * A headline statistic.
 *
 * Large, coloured and captioned in plain words — "Days you were here" rather
 * than "Attendance rate". The number is the thing being read, so it gets the
 * size and the caption gets the explanation.
 */
export function FunStat({
  value,
  label,
  hint,
  emoji,
  tone = 8,
  className,
}: {
  value: React.ReactNode
  label: string
  hint?: string
  emoji?: string
  tone?: number
  className?: string
}) {
  return (
    <div style={toneStyle(tone)} className={cn('sticker p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-3xl font-extrabold tracking-tight" style={{ color: 'hsl(var(--tile))' }}>
          {value}
        </p>
        {emoji && (
          <span className="text-2xl" aria-hidden>
            {emoji}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm font-semibold">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ------------------------------------------------------------ progress ring

/**
 * Circular progress.
 *
 * An SVG ring rather than a bar because it holds a number in the middle, which
 * lets one shape answer "how much" and "how much exactly" at once — useful when
 * the same figure is both a score and a goal.
 */
export function ProgressRing({
  value,
  size = 88,
  tone = 5,
  label,
  className,
  animate,
}: {
  /** 0–100. Clamped, so a stray 120 does not overdraw the circle. */
  value: number
  size?: number
  tone?: number
  label?: string
  className?: string
  /**
   * Counts the centre number up as the arc sweeps in.
   *
   * Opt-in rather than always on: a page with six rings all counting at once
   * is noise, so only the one or two figures a learner actually came for get
   * it. `CountUp` handles reduced-motion itself.
   */
  animate?: boolean
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  const stroke = size / 10
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <div
      style={toneStyle(tone)}
      className={cn('relative inline-flex items-center justify-center', className)}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke="hsl(var(--tile) / 0.18)"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke="hsl(var(--tile))"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-spring"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-extrabold tabular-nums">
          {animate ? <CountUp value={clamped} suffix="%" /> : `${Math.round(clamped)}%`}
        </span>
        {label && <span className="text-2xs text-muted-foreground">{label}</span>}
      </div>
      <span className="sr-only">{`${Math.round(clamped)} percent${label ? ` ${label}` : ''}`}</span>
    </div>
  )
}

// ----------------------------------------------------------------- streak

/**
 * A run of consecutive days present.
 *
 * Shown only once there is something to show — a "0 day streak" is a scolding,
 * not an encouragement, and the whole point of the widget is the opposite.
 */
export function StreakCard({ days, className }: { days: number; className?: string }) {
  if (days <= 0) return null

  return (
    <div style={toneStyle(2)} className={cn('sticker flex items-center gap-3 p-4', className)}>
      <span className="text-3xl" aria-hidden>
        🔥
      </span>
      <div>
        <p className="text-2xl font-extrabold tracking-tight" style={{ color: 'hsl(var(--tile))' }}>
          {days} day{days === 1 ? '' : 's'}
        </p>
        <p className="text-xs font-medium text-muted-foreground">
          {days >= 5 ? 'Brilliant run — keep it going!' : 'in a row. Nice one!'}
        </p>
      </div>
    </div>
  )
}

// ------------------------------------------------------------- achievement

export interface Achievement {
  id: string
  emoji: string
  title: string
  /** What the learner did, in plain words. */
  description: string
  earned: boolean
  tone: number
}

/**
 * A badge shelf.
 *
 * Unearned badges are shown greyed rather than hidden: knowing what is
 * available is what makes one worth going after, and a shelf that fills in over
 * time reads as progress in a way an empty one never does.
 */
export function AchievementShelf({
  achievements,
  className,
}: {
  achievements: Achievement[]
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-2.5 sm:grid-cols-3', className)}>
      {achievements.map((achievement) => (
        <div
          key={achievement.id}
          style={toneStyle(achievement.tone)}
          className={cn(
            'flex items-center gap-2.5 rounded-xl border-2 p-2.5 transition-opacity',
            achievement.earned
              ? 'border-[hsl(var(--tile)/0.35)] bg-[hsl(var(--tile)/0.12)]'
              : 'border-dashed border-border bg-surface opacity-55',
          )}
        >
          <span
            className={cn('text-xl', !achievement.earned && 'grayscale')}
            aria-hidden
          >
            {achievement.emoji}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold">{achievement.title}</p>
            <p className="truncate text-2xs text-muted-foreground">{achievement.description}</p>
          </div>
          <span className="sr-only">
            {achievement.earned ? 'Earned.' : 'Not earned yet.'}
          </span>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------ empty states

/**
 * Empty state with the mascot.
 *
 * The standard `EmptyState` is right for admin screens; this one is for a
 * learner, where "nothing here yet" is worth softening and is often genuinely
 * good news ("no homework").
 */
export function FunEmpty({
  mood = 'curious',
  title,
  description,
  action,
  className,
}: {
  mood?: MascotMood
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-2xl border-2 border-dashed border-border px-6 py-10 text-center',
        className,
      )}
    >
      <Mascot mood={mood} size="md" />
      <p className="mt-3 text-base font-bold">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// -------------------------------------------------------------- hero panel

/**
 * The greeting block at the top of a learner's page.
 *
 * Uses the mascot and a plain-language line rather than a page title, because
 * a student arriving at their dashboard does not need to be told they are on
 * the dashboard.
 */
export function FunHero({
  greeting,
  message,
  mood = 'happy',
  children,
  className,
}: {
  greeting: string
  message?: string
  mood?: MascotMood
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative mb-6 overflow-hidden rounded-3xl border-2 border-primary/25 p-6 sm:p-7',
        'bg-gradient-to-br from-[hsl(var(--fun-8)/0.22)] via-[hsl(var(--fun-7)/0.14)] to-[hsl(var(--fun-9)/0.12)]',
        className,
      )}
    >
      {/*
        An illustrated band rather than a flat panel. Sun, hills and clouds are
        drawn into the hero itself so it reads as a scene the mascot is standing
        in, which the page-level Scenery cannot do — that layer sits behind
        everything and would be covered by this card.
      */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 800 220"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <circle cx="700" cy="46" r="34" fill="hsl(var(--fun-3) / 0.45)" />
        <circle cx="700" cy="46" r="52" fill="hsl(var(--fun-3) / 0.16)" />
        <path
          d="M0 176c90-30 150 16 250 10s150-46 260-24 200 52 290 34v40H0z"
          fill="hsl(var(--fun-5) / 0.22)"
        />
        <path
          d="M0 200c120-22 180 12 300 8s170-32 290-14 150 30 210 22v24H0z"
          fill="hsl(var(--fun-6) / 0.20)"
        />
        <g fill="hsl(var(--card) / 0.55)">
          <ellipse cx="150" cy="44" rx="38" ry="16" />
          <ellipse cx="178" cy="38" rx="26" ry="13" />
          <ellipse cx="470" cy="30" rx="30" ry="12" />
        </g>
      </svg>

      <div className="relative flex items-center gap-4 sm:gap-6">
        <Mascot mood={mood} size="lg" className="hidden shrink-0 sm:block" />
        <Mascot mood={mood} size="sm" className="shrink-0 sm:hidden" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-4xl">{greeting}</h1>
          {message && (
            <p className="mt-1.5 text-sm font-medium text-muted-foreground sm:text-base">
              {message}
            </p>
          )}
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------ section head

/** A friendlier section heading — emoji, big label, optional action. */
export function FunSection({
  emoji,
  title,
  action,
  children,
  className,
}: {
  emoji: string
  title: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xl" aria-hidden>
          {emoji}
        </span>
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  )
}

// -------------------------------------------------------------- page head

/**
 * Page header for a learner's sub-page.
 *
 * Plainer than `FunHero` — no mascot — because a mascot on every screen stops
 * being a character and becomes furniture. The emoji carries the personality
 * here, and the title is written in the words a learner would use.
 */
export function FunPageHeader({
  emoji,
  title,
  description,
  actions,
  children,
  tone = 8,
}: {
  emoji: string
  title: string
  description?: string
  actions?: React.ReactNode
  children?: React.ReactNode
  /** Colours the band. Pages pick one so each section feels distinct. */
  tone?: number
}) {
  return (
    <div className="mb-5">
      <div
        style={toneStyle(tone)}
        className="relative overflow-hidden rounded-2xl border-2 border-[hsl(var(--tile)/0.28)] bg-[hsl(var(--tile)/0.10)] px-5 py-4"
      >
        {/* A shallow band rather than the full hero scene: enough to give the
            page an identity, not so much that it competes with the content
            directly beneath it. */}
        <svg
          className="pointer-events-none absolute inset-y-0 right-0 h-full w-1/2"
          viewBox="0 0 400 120"
          preserveAspectRatio="xMaxYMid slice"
          aria-hidden
        >
          <circle cx="330" cy="26" r="46" fill="hsl(var(--tile) / 0.14)" />
          <circle cx="368" cy="70" r="24" fill="hsl(var(--tile) / 0.10)" />
          <path
            d="M0 96c60-20 110 10 180 6s110-26 220-8v26H0z"
            fill="hsl(var(--tile) / 0.16)"
          />
        </svg>

        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl sm:text-4xl" aria-hidden>
              {emoji}
            </span>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
              {description && (
                <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

/**
 * Filter pill.
 *
 * Bigger than the admin equivalent — these are the main way a learner narrows a
 * list, and on a tablet they need to be comfortably tappable rather than
 * merely clickable.
 */
export function FunChip({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean
  /** Colours the pill to match what it filters to. */
  tone?: number
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={tone ? toneStyle(tone) : undefined}
      className={cn(
        'rounded-full border-2 px-3.5 py-1.5 text-xs font-bold transition-all',
        active
          ? tone
            ? 'border-[hsl(var(--tile))] bg-[hsl(var(--tile)/0.18)] text-[hsl(var(--tile))]'
            : 'border-primary bg-primary/15 text-primary'
          : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/** Re-exported so pages import one module for the playful layer. */
export { Mascot, subjectStyle, subjectLook }

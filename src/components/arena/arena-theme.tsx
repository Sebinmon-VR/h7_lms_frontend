import { Slot } from '@radix-ui/react-slot'
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import * as React from 'react'

import type { ArenaLook } from '@/api/arena.types'
import { cn } from '@/lib/cn'
import { Art3D, type ArtName } from './arena-art'
import { ArenaAvatar, gradient } from './arena-ui'

export { Art3D, artForEmoji, artUrl, type ArtName } from './arena-art'

/**
 * The games surface. It reads like a modern game client — bold titles, a
 * spotlight stage, chunky pressable buttons, 3D art — but every colour comes
 * from the LMS theme tokens (primary, accent, card, muted…), so it follows the
 * student's light or dark theme and the school's palette.
 *
 * Density: panels p-3/p-4, rows h-11–h-14, labels 11px uppercase, numbers
 * tabular. lucide icons for chrome; 3D art (<Art3D>) for characters, rewards
 * and game covers.
 */

// ------------------------------------------------------------------ surface

/**
 * Wraps every games page. No frame: the page melts into the LMS background,
 * and the atmosphere (two soft theme-coloured glows) is painted as the shell's
 * own background rather than as layers behind the content.
 */
export function ArenaShell({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn('arena-shell relative isolate text-foreground', className)}
      style={{
        backgroundImage:
          'radial-gradient(40rem 26rem at 0% 0%, hsl(var(--primary) / 0.10), transparent 70%), radial-gradient(36rem 24rem at 100% 35%, hsl(var(--accent) / 0.08), transparent 70%)',
      }}
    >
      {children}
    </div>
  )
}

const GLOW = {
  primary: 'border-primary/50 shadow-[0_0_0_1px_hsl(var(--primary)/0.25),0_8px_28px_-8px_hsl(var(--primary)/0.55)]',
  violet: 'border-accent/50 shadow-[0_0_0_1px_hsl(var(--accent)/0.25),0_8px_28px_-8px_hsl(var(--accent)/0.55)]',
  cyan: 'border-info/50 shadow-[0_0_0_1px_hsl(var(--info)/0.25),0_8px_28px_-8px_hsl(var(--info)/0.5)]',
  amber: 'border-warning/60 shadow-[0_0_0_1px_hsl(var(--warning)/0.25),0_8px_28px_-8px_hsl(var(--warning)/0.55)]',
  emerald: 'border-success/55 shadow-[0_0_0_1px_hsl(var(--success)/0.25),0_8px_28px_-8px_hsl(var(--success)/0.5)]',
  rose: 'border-danger/55 shadow-[0_0_0_1px_hsl(var(--danger)/0.25),0_8px_28px_-8px_hsl(var(--danger)/0.5)]',
} as const

/** A panel on the games surface. `interactive` adds the hover lift. */
export const Panel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean; glow?: keyof typeof GLOW; asChild?: boolean }
>(({ className, interactive, glow, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : 'div'
  return (
    <Comp
      ref={ref}
      className={cn(
        'rounded-2xl bg-card/85 shadow-[0_1px_3px_hsl(var(--shadow-color)/0.08),0_8px_24px_-12px_hsl(var(--shadow-color)/0.18)] backdrop-blur-sm',
        interactive &&
          'cursor-pointer transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        glow && GLOW[glow],
        className,
      )}
      {...props}
    />
  )
})
Panel.displayName = 'Panel'

/** A spotlight stage for a hero character: primary-tinted light, slow rays, a floor shadow. */
export function Stage({ className, children, rays = true }: { className?: string; children?: React.ReactNode; rays?: boolean }) {
  return (
    <div
      className={cn('relative isolate overflow-hidden rounded-3xl', className)}
      style={{
        background:
          'radial-gradient(70% 60% at 50% 40%, hsl(var(--primary) / 0.35), transparent 70%), linear-gradient(160deg, hsl(var(--accent) / 0.25), hsl(var(--primary) / 0.14) 55%, hsl(var(--card)) 100%)',
      }}
    >
      {rays && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[40%] -z-10 size-[170%] -translate-x-1/2 -translate-y-1/2 opacity-50 motion-safe:animate-[spin_50s_linear_infinite]"
          style={{
            background:
              'repeating-conic-gradient(from 0deg, transparent 0deg 10deg, hsl(var(--primary-foreground) / 0.22) 10deg 14deg)',
            maskImage: 'radial-gradient(circle, black 12%, transparent 50%)',
          }}
        />
      )}
      <div aria-hidden className="pointer-events-none absolute inset-x-[20%] bottom-[7%] -z-10 h-5 rounded-[50%] bg-foreground/25 blur-md" />
      {children}
    </div>
  )
}

// -------------------------------------------------------------------- type

/** Big game title: heavy, italic, uppercase. */
export function GameTitle({ className, children, as: As = 'h1' }: { className?: string; children: React.ReactNode; as?: 'h1' | 'h2' | 'h3' | 'p' }) {
  return <As className={cn('font-black uppercase italic leading-none tracking-tight text-foreground', className)}>{children}</As>
}

/** 11px uppercase label. */
export function Label({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn('text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground', className)}>{children}</span>
}

/** Section heading with the slanted accent tab used across the games pages. */
export function SectionTitle({
  title,
  icon,
  action,
  className,
}: {
  title: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-2.5 flex items-center justify-between gap-2', className)}>
      <h2 className="flex items-center gap-2 text-xs font-black uppercase italic tracking-wider text-foreground [&_svg]:size-3.5 [&_svg]:text-primary">
        <span aria-hidden className="h-3.5 w-1.5 -skew-x-12 rounded-sm bg-primary" />
        {icon}
        {title}
      </h2>
      {action}
    </div>
  )
}

/** Page heading: icon tile, game title, subtitle, actions (resources etc.). */
export function ArenaHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_3px_0_0_hsl(var(--primary)/0.45)] [&_svg]:size-5">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <GameTitle className="truncate text-xl sm:text-2xl">{title}</GameTitle>
          {subtitle && <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** A resource pill for headers: 3D icon + number (coins, XP…). */
export function ResourcePill({ art, value, label, className }: { art: ArtName; value: number | string; label: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex h-8 items-center gap-1.5 rounded-full bg-card pl-1 pr-3 text-sm font-black tabular-nums shadow-sm', className)}
      title={label}
    >
      <Art3D name={art} className="size-6" />
      {typeof value === 'number' ? value.toLocaleString() : value}
      <span className="sr-only"> {label}</span>
    </span>
  )
}

// ------------------------------------------------------------------ buttons

type ArenaButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'gold'

/** Chunky pressable buttons: a solid ledge under the face that sinks on press. */
const BUTTON_VARIANT: Record<ArenaButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground shadow-[0_4px_0_0_hsl(var(--primary)/0.5),inset_0_1px_0_0_hsl(0_0%_100%/0.25)] hover:brightness-110 active:translate-y-[3px] active:shadow-[0_1px_0_0_hsl(var(--primary)/0.5)]',
  gold:
    'bg-warning text-warning-foreground shadow-[0_4px_0_0_hsl(var(--warning)/0.6),inset_0_1px_0_0_hsl(0_0%_100%/0.35)] hover:brightness-105 active:translate-y-[3px] active:shadow-[0_1px_0_0_hsl(var(--warning)/0.6)]',
  success:
    'bg-success text-success-foreground shadow-[0_4px_0_0_hsl(var(--success)/0.5),inset_0_1px_0_0_hsl(0_0%_100%/0.25)] hover:brightness-110 active:translate-y-[3px] active:shadow-[0_1px_0_0_hsl(var(--success)/0.5)]',
  danger: 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/15',
  secondary:
    'bg-card text-foreground shadow-[0_3px_0_0_hsl(var(--border)),0_1px_3px_hsl(var(--shadow-color)/0.12)] hover:bg-muted active:translate-y-[2px] active:shadow-[0_1px_0_0_hsl(var(--border))]',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
}

const BUTTON_SIZE = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-xs [&_svg]:size-3.5',
  md: 'h-10 gap-2 rounded-xl px-4 text-sm [&_svg]:size-4',
  lg: 'h-12 gap-2 rounded-xl px-6 text-base uppercase italic tracking-wide [&_svg]:size-5',
  icon: 'size-9 rounded-xl [&_svg]:size-4',
} as const

export interface ArenaButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ArenaButtonVariant
  size?: keyof typeof BUTTON_SIZE
  loading?: boolean
  asChild?: boolean
}

export const ArenaButton = React.forwardRef<HTMLButtonElement, ArenaButtonProps>(
  ({ className, variant = 'secondary', size = 'md', loading, disabled, asChild, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex shrink-0 select-none items-center justify-center font-extrabold transition-[filter,background-color,transform,box-shadow] duration-100 disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          BUTTON_VARIANT[variant],
          BUTTON_SIZE[size],
          className,
        )}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    )
  },
)
ArenaButton.displayName = 'ArenaButton'

/** Segmented tabs. */
export function ArenaTabs<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
  'aria-label': ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: React.ReactNode; icon?: React.ReactNode; count?: number }>
  className?: string
  size?: 'sm' | 'md'
  'aria-label'?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('no-scrollbar inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-foreground/[0.06] p-1', className)}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg font-bold transition-colors [&_svg]:size-3.5',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-xs sm:text-sm',
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.icon}
            {o.label}
            {o.count != null && (
              <span className={cn('rounded-md px-1.5 text-[10px] tabular-nums', active ? 'bg-primary text-primary-foreground' : 'bg-foreground/10')}>
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function ArenaChip({
  active,
  onClick,
  disabled,
  children,
  className,
  title,
}: {
  active?: boolean
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
  className?: string
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-3.5',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-[0_2px_0_0_hsl(var(--primary)/0.45)]'
          : 'border-transparent bg-card text-foreground shadow-sm hover:shadow-md',
        className,
      )}
    >
      {children}
    </button>
  )
}

// -------------------------------------------------------------------- stats

const TONE_TEXT = {
  slate: 'text-foreground',
  violet: 'text-accent',
  cyan: 'text-info',
  amber: 'text-warning',
  emerald: 'text-success',
  rose: 'text-danger',
  primary: 'text-primary',
} as const

export function StatPill({
  value,
  label,
  icon,
  tone = 'slate',
  className,
}: {
  value: React.ReactNode
  label: string
  icon?: React.ReactNode
  tone?: keyof typeof TONE_TEXT
  className?: string
}) {
  return (
    <div className={cn('min-w-0 rounded-xl bg-card px-2.5 py-1.5 shadow-sm', className)}>
      <div className={cn('flex items-center gap-1 text-sm font-black tabular-nums [&_svg]:size-3.5', TONE_TEXT[tone])}>
        {icon}
        <span className="truncate">{value}</span>
      </div>
      <div className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  )
}

/** "WIN RATIO ▇▇▇▇▁ 0.67" — the attribute bars of a character screen. */
export function StatBar({
  label,
  value,
  ratio,
  tone = 'primary',
  className,
}: {
  label: string
  value: React.ReactNode
  /** 0–1 fill. */
  ratio: number
  tone?: 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
}) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100)
  const fill = { primary: 'bg-primary', accent: 'bg-accent', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', info: 'bg-info' }[tone]
  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-sm font-black tabular-nums text-foreground">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn('h-full rounded-full transition-[width] duration-700', fill)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// -------------------------------------------------------------------- tiers

export interface Tier {
  name: string
  from: number
  to: number | null
  color: string
  glow: string
  emblem: string
}

/** Competitive tiers from the level: Bronze → Silver → Gold → Platinum → Diamond → Master. */
export const TIERS: Tier[] = [
  { name: 'Bronze', from: 1, to: 5, color: '#c2710c', glow: 'rgba(194,113,12,0.5)', emblem: '◆' },
  { name: 'Silver', from: 5, to: 10, color: '#7c8aa0', glow: 'rgba(124,138,160,0.5)', emblem: '◆' },
  { name: 'Gold', from: 10, to: 15, color: '#d4a106', glow: 'rgba(212,161,6,0.55)', emblem: '◆' },
  { name: 'Platinum', from: 15, to: 20, color: '#0f9f8f', glow: 'rgba(15,159,143,0.5)', emblem: '◈' },
  { name: 'Diamond', from: 20, to: 30, color: '#3b82f6', glow: 'rgba(59,130,246,0.55)', emblem: '◈' },
  { name: 'Master', from: 30, to: null, color: '#c026d3', glow: 'rgba(192,38,211,0.55)', emblem: '✦' },
]

export function tierFor(level: number): Tier {
  return [...TIERS].reverse().find((t) => level >= t.from) ?? TIERS[0]
}

export function TierBadge({ level, size = 'sm', className }: { level: number; size?: 'xs' | 'sm' | 'md'; className?: string }) {
  const tier = tierFor(level)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md border font-black uppercase italic tracking-wider',
        size === 'xs' ? 'h-4 px-1 text-[9px]' : size === 'sm' ? 'h-5 px-1.5 text-[10px]' : 'h-6 px-2 text-xs',
        className,
      )}
      style={{ color: tier.color, borderColor: `${tier.color}66`, background: `${tier.color}18` }}
      title={`${tier.name} tier`}
    >
      <span aria-hidden>{tier.emblem}</span>
      {tier.name}
    </span>
  )
}

export function XpBar({ progress, className, tall }: { progress: number; className?: string; tall?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100)
  return (
    <div className={cn('overflow-hidden rounded-full bg-muted', tall ? 'h-2.5' : 'h-1.5', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-700" style={{ width: `${pct}%` }} />
    </div>
  )
}

/** A compact gamer tag: banner tint, framed avatar, name, title, tier, XP. */
export function PlayerBanner({
  look,
  name,
  level,
  progress,
  subtitle,
  right,
  className,
  size = 'md',
}: {
  look: Partial<ArenaLook> | null | undefined
  name: string
  level: number
  progress?: number
  subtitle?: React.ReactNode
  right?: React.ReactNode
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div className={cn('relative overflow-hidden rounded-2xl bg-card shadow-sm', className)}>
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-3/4 opacity-30"
        style={{ background: gradient(look?.banner?.colors, 110), maskImage: 'linear-gradient(90deg, black, transparent)' }}
      />
      <div className={cn('relative flex items-center gap-3', size === 'sm' ? 'p-2.5' : 'p-3 sm:p-4')}>
        <ArenaAvatar look={look} size={size === 'sm' ? 'sm' : 'md'} level={level} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('truncate font-black text-foreground', size === 'sm' ? 'text-sm' : 'text-base')}>{name}</span>
            <TierBadge level={level} size="xs" />
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {look?.title?.text && (
              <span className={cn('font-bold', RARITY_DARK[look.title.rarity]?.text ?? 'text-primary')}>{look.title.text}</span>
            )}
            {look?.title?.text && subtitle ? <span> · </span> : null}
            {subtitle}
          </div>
          {progress != null && <XpBar progress={progress} className="mt-1.5 max-w-xs" />}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </div>
  )
}

export function ArenaEmpty({
  icon,
  art,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  art?: ArtName
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-2xl bg-foreground/[0.03] px-4 py-8 text-center', className)}>
      {art ? <Art3D name={art} className="size-14" /> : icon && <span className="text-muted-foreground [&_svg]:size-6">{icon}</span>}
      <p className="text-sm font-black text-foreground">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

/**
 * Rarity colours that read on light and dark cards. (Named for the first,
 * dark-only cut; RARITY_STYLE is the same table.)
 */
export const RARITY_DARK = {
  COMMON: { text: 'text-muted-foreground', border: 'border-slate-400/40', glow: '', label: 'Common', dot: 'bg-slate-400', hex: '#94a3b8' },
  RARE: { text: 'text-sky-600 dark:text-sky-300', border: 'border-sky-400/60', glow: 'shadow-[0_6px_20px_-8px_rgba(14,165,233,0.7)]', label: 'Rare', dot: 'bg-sky-500', hex: '#0ea5e9' },
  EPIC: { text: 'text-violet-600 dark:text-violet-300', border: 'border-violet-400/60', glow: 'shadow-[0_6px_20px_-8px_rgba(139,92,246,0.75)]', label: 'Epic', dot: 'bg-violet-500', hex: '#8b5cf6' },
  LEGENDARY: { text: 'text-amber-600 dark:text-amber-300', border: 'border-amber-400/70', glow: 'shadow-[0_6px_22px_-8px_rgba(245,158,11,0.8)]', label: 'Legendary', dot: 'bg-amber-500', hex: '#f59e0b' },
} as const
export const RARITY_STYLE = RARITY_DARK

// ------------------------------------------------------------------- tilt

/**
 * The games' signature hover: the card tilts toward the pointer on a spring, a
 * sheen follows it, and children marked `data-tilt-pop` lift off the face.
 * Mouse only; touch and reduced motion get a flat card.
 */
export function TiltCard({
  className,
  children,
  max = 10,
  sheen = true,
  onClick,
  as = 'div',
  style,
  ...rest
}: {
  className?: string
  children: React.ReactNode
  /** Largest tilt in degrees. */
  max?: number
  sheen?: boolean
  onClick?: () => void
  as?: 'div' | 'button'
} & Omit<React.HTMLAttributes<HTMLElement>, 'onClick' | 'children' | 'className'>) {
  const reduce = useReducedMotion()
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const rotateY = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 220, damping: 18 })
  const rotateX = useSpring(useTransform(py, [0, 1], [max * 0.8, -max * 0.8]), { stiffness: 220, damping: 18 })
  const sx = useTransform(px, [0, 1], ['0%', '100%'])
  const sy = useTransform(py, [0, 1], ['0%', '100%'])
  const light = useMotionTemplate`radial-gradient(60% 50% at ${sx} ${sy}, rgba(255,255,255,0.32), transparent 70%)`
  const [hover, setHover] = React.useState(false)

  const Comp = as === 'button' ? motion.button : motion.div
  return (
    <div style={{ perspective: 900 }} className="min-w-0">
      <Comp
        {...(rest as object)}
        type={as === 'button' ? 'button' : undefined}
        onClick={onClick}
        onPointerMove={(e: React.PointerEvent<HTMLElement>) => {
          if (reduce || e.pointerType !== 'mouse') return
          const r = e.currentTarget.getBoundingClientRect()
          px.set((e.clientX - r.left) / r.width)
          py.set((e.clientY - r.top) / r.height)
        }}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => {
          px.set(0.5)
          py.set(0.5)
          setHover(false)
        }}
        data-hover={hover || undefined}
        className={cn('group/tilt relative block w-full text-left [transform-style:preserve-3d]', className)}
        style={reduce ? style : { ...style, rotateX, rotateY }}
        whileHover={reduce ? undefined : { scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        {children}
        {sheen && !reduce && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/tilt:opacity-100"
            style={{ background: light }}
          />
        )}
      </Comp>
    </div>
  )
}

/** Wrap art inside a TiltCard to lift it toward the viewer on hover. */
export function TiltPop({ className, children, depth = 40 }: { className?: string; children: React.ReactNode; depth?: number }) {
  return (
    <span className="block" style={{ transform: `translateZ(${depth}px)` }}>
      <span className={cn('block transition-transform duration-300 ease-out group-hover/tilt:-translate-y-1.5 group-hover/tilt:scale-[1.06]', className)}>
        {children}
      </span>
    </span>
  )
}

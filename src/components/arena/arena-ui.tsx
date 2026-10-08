import * as React from 'react'

import type { ArenaLook, ArenaLookItem, ArenaRarity } from '@/api/arena.types'
import { cn } from '@/lib/cn'
import { Art3D, artForEmoji, heroUrl } from './arena-art'

/**
 * The arena's visual vocabulary, shared by every arena screen: the framed
 * avatar, coins, the level bar and rarity colours. Items arrive from the
 * backend catalogue as an emoji (avatars), a line of text (titles) or a list
 * of colours (frames, banners), so nothing here is keyed by item id.
 */

export function gradient(colors: string[] | undefined, angle = 135): string {
  const list = colors && colors.length > 0 ? colors : ['#94a3b8', '#cbd5e1']
  if (list.length === 1) return list[0]
  return `linear-gradient(${angle}deg, ${list.join(', ')})`
}

export const RARITY_LOOK: Record<ArenaRarity, { label: string; text: string; ring: string; bg: string }> = {
  COMMON: { label: 'Common', text: 'text-slate-600 dark:text-slate-300', ring: 'ring-slate-300', bg: 'bg-slate-500/10' },
  RARE: { label: 'Rare', text: 'text-sky-600 dark:text-sky-300', ring: 'ring-sky-400', bg: 'bg-sky-500/12' },
  EPIC: { label: 'Epic', text: 'text-violet-600 dark:text-violet-300', ring: 'ring-violet-400', bg: 'bg-violet-500/12' },
  LEGENDARY: { label: 'Legendary', text: 'text-amber-600 dark:text-amber-300', ring: 'ring-amber-400', bg: 'bg-amber-500/15' },
}

export function RarityChip({ rarity, className }: { rarity: ArenaRarity; className?: string }) {
  const look = RARITY_LOOK[rarity]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide',
        look.bg,
        look.text,
        className,
      )}
    >
      {look.label}
    </span>
  )
}

const AVATAR_SIZE = {
  xs: { box: 'size-8', emoji: 'text-base', ring: 'p-[2px]', level: 'hidden' },
  sm: { box: 'size-10', emoji: 'text-xl', ring: 'p-[2px]', level: 'text-[9px] px-1 -bottom-1' },
  md: { box: 'size-14', emoji: 'text-3xl', ring: 'p-[3px]', level: 'text-2xs px-1.5 -bottom-1.5' },
  lg: { box: 'size-20', emoji: 'text-5xl', ring: 'p-1', level: 'text-xs px-2 -bottom-2' },
  xl: { box: 'size-28', emoji: 'text-6xl', ring: 'p-1.5', level: 'text-sm px-2.5 -bottom-2.5' },
} as const

export type ArenaAvatarSize = keyof typeof AVATAR_SIZE

/**
 * The player's face: their avatar emoji on a soft disc, inside a ring painted
 * with their frame's colours, with an optional level chip at the foot.
 */
export function ArenaAvatar({
  look,
  size = 'md',
  level,
  dimmed,
  className,
}: {
  look: Partial<ArenaLook> | null | undefined
  size?: ArenaAvatarSize
  level?: number | null
  /** Greyed, for a player who left. */
  dimmed?: boolean
  className?: string
}) {
  const s = AVATAR_SIZE[size]
  const frame = look?.frame
  const avatar = look?.avatar
  return (
    <span className={cn('relative inline-flex shrink-0', dimmed && 'opacity-40 grayscale', className)}>
      <span
        className={cn('inline-flex rounded-full shadow-sm', s.ring)}
        style={{ background: gradient(frame?.colors) }}
      >
        <span
          className={cn(
            'inline-flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-card to-muted leading-none',
            s.box,
            s.emoji,
          )}
          aria-hidden
        >
          {avatar?.character ? (
            <img
              src={heroUrl(avatar.character, 'head')}
              alt=""
              draggable={false}
              loading="lazy"
              className="size-full scale-[1.18] object-cover object-top"
            />
          ) : artForEmoji(avatar?.emoji ?? '🦉') ? (
            <Art3D emoji={avatar?.emoji ?? '🦉'} className="size-[86%] drop-shadow-[0_3px_4px_rgba(0,0,0,0.3)]" />
          ) : (
            avatar?.emoji ?? '🦉'
          )}
        </span>
      </span>
      {level != null && size !== 'xs' && (
        <span
          className={cn(
            'absolute left-1/2 -translate-x-1/2 rounded-full bg-foreground font-bold tabular-nums text-background shadow ring-1 ring-background/40',
            s.level,
          )}
        >
          {level}
        </span>
      )}
    </span>
  )
}

/** "🪙 120" */
export function Coins({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 font-bold tabular-nums', className)}>
      <Art3D name="coin" className="size-[1.15em]" />
      {value.toLocaleString()}
      <span className="sr-only"> coins</span>
    </span>
  )
}

/** "⚡ 340 XP" */
export function Xp({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 font-bold tabular-nums', className)}>
      <span aria-hidden>⚡</span>
      {value.toLocaleString()} XP
    </span>
  )
}

export function LevelBar({
  level,
  xp,
  levelXp,
  nextLevelXp,
  progress,
  className,
  compact,
}: {
  level: number
  xp: number
  levelXp: number
  nextLevelXp: number
  progress: number
  className?: string
  compact?: boolean
}) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100)
  return (
    <div className={cn('min-w-0', className)}>
      {!compact && (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="font-bold">Level {level}</span>
          <span className="tabular-nums text-muted-foreground">
            {(xp - levelXp).toLocaleString()} / {(nextLevelXp - levelXp).toLocaleString()} XP
          </span>
        </div>
      )}
      <div
        className="h-2.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Level ${level}, ${pct}% to the next level`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/** The player's equipped title, as a small coloured line. */
export function PlayerTitle({ title, className }: { title: ArenaLookItem | undefined | null; className?: string }) {
  if (!title?.text) return null
  return (
    <span className={cn('truncate text-xs font-semibold', RARITY_LOOK[title.rarity]?.text, className)}>
      {title.text}
    </span>
  )
}

/** A banner strip painted with the equipped banner's colours. */
export function BannerStrip({
  banner,
  className,
  children,
}: {
  banner: ArenaLookItem | undefined | null
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div className={cn('relative overflow-hidden', className)} style={{ background: gradient(banner?.colors, 120) }}>
      <span aria-hidden className="pointer-events-none absolute -right-6 -top-10 size-36 rounded-full bg-white/15" />
      <span aria-hidden className="pointer-events-none absolute -bottom-12 left-10 size-28 rounded-full bg-white/10" />
      {children}
    </div>
  )
}

export const OUTCOME_LOOK = {
  WIN: { label: 'Victory', emoji: '🏆', tone: 'text-success' },
  DRAW: { label: 'Draw', emoji: '🤝', tone: 'text-info' },
  LOSS: { label: 'Defeat', emoji: '💪', tone: 'text-muted-foreground' },
  FORFEIT: { label: 'Left early', emoji: '🚪', tone: 'text-muted-foreground' },
} as const

export const DIFFICULTY_LABEL: Record<number, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' }

/** Medal for the top three. */
export function rankMedal(rank: number | null | undefined): string | null {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return null
}

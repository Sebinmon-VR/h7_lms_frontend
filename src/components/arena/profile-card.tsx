import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, CircleCheck, CircleDashed, Flag, RefreshCw, School, Smile, Tag, X, type LucideIcon } from 'lucide-react'
import * as React from 'react'

import type {
  ArenaBadge,
  ArenaLook,
  ArenaLookItem,
  ArenaProfileCard,
  ArenaRarity,
  ArenaSlot,
  ArenaStats,
} from '@/api/arena.types'
import { ApiError, errorDescription, errorTitle } from '@/api/errors'
import { useProfileCard } from '@/queries/arena.queries'
import { formatDate } from '@/lib/datetime'
import { cn } from '@/lib/cn'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ArenaAvatar, gradient } from './arena-ui'
import {
  Art3D,
  ArenaEmpty,
  ArenaTabs,
  GameTitle,
  Label,
  RARITY_STYLE,
  SectionTitle,
  StatBar,
  TierBadge,
  XpBar,
  type ArtName,
  TiltCard,
  TiltPop,
} from './arena-theme'
import { HeroArt } from './arena-art'

/**
 * A player's card, laid out like a game's character showcase: the player on
 * a stage tinted with their banner, name and title beside them, then the
 * attribute bars, badges and collection.
 *
 * Every colour comes from the theme tokens, so the card reads the same on the
 * student arena, inside the locker and on the staff pages, light or dark.
 */

// ------------------------------------------------------------------ rarity

/** Rarity accent as a hex, for inline glows and gradients. */
export const RARITY_HEX: Record<ArenaRarity, string> = {
  COMMON: RARITY_STYLE.COMMON.hex,
  RARE: RARITY_STYLE.RARE.hex,
  EPIC: RARITY_STYLE.EPIC.hex,
  LEGENDARY: RARITY_STYLE.LEGENDARY.hex,
}

/** "● Epic" in the rarity colour. */
export function RarityTag({ rarity, className }: { rarity: ArenaRarity; className?: string }) {
  const r = RARITY_STYLE[rarity]
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider', r.text, className)}>
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', r.dot)} />
      {r.label}
    </span>
  )
}

export const SLOT_LOOK: Record<ArenaSlot, { label: string; one: string; emoji: string; icon: LucideIcon }> = {
  avatar: { label: 'Avatars', one: 'avatar', emoji: '🙂', icon: Smile },
  frame: { label: 'Frames', one: 'frame', emoji: '💍', icon: CircleDashed },
  title: { label: 'Titles', one: 'title', emoji: '🏷️', icon: Tag },
  banner: { label: 'Banners', one: 'banner', emoji: '🎏', icon: Flag },
}

export const SLOT_ORDER: ArenaSlot[] = ['avatar', 'frame', 'title', 'banner']

/** A title as a nameplate tag, coloured by its rarity. */
export function TitleChip({
  item,
  className,
}: {
  item: Pick<ArenaLookItem, 'text' | 'name' | 'rarity'>
  className?: string
}) {
  const hex = RARITY_HEX[item.rarity]
  return (
    <span
      className={cn(
        'inline-block max-w-full truncate rounded-md border px-2 py-0.5 text-xs font-black uppercase italic tracking-wide',
        RARITY_STYLE[item.rarity].text,
        className,
      )}
      style={{ borderColor: `${hex}80`, background: `linear-gradient(180deg, ${hex}26, ${hex}0d)` }}
    >
      {item.text ?? item.name}
    </span>
  )
}

/** The first colour of a frame or banner, for glows. */
function firstHex(item: Pick<ArenaLookItem, 'colors'> | null | undefined, fallback = '#8b5cf6'): string {
  const c = item?.colors?.[0]
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : fallback
}

/**
 * The hero portrait: the 3D avatar standing in a glowing ring painted with
 * the frame's colours. Sized by the caller (`className`, e.g. `size-28`).
 */
export function HeroAvatar({
  look,
  level,
  float,
  className,
}: {
  look: Partial<ArenaLook> | null | undefined
  level?: number | null
  float?: boolean
  className?: string
}) {
  const glow = firstHex(look?.frame)
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', className)}>
      <span
        aria-hidden
        className="absolute inset-0 rounded-full p-[5%]"
        style={{ background: gradient(look?.frame?.colors), boxShadow: `0 0 28px -4px ${glow}, 0 10px 24px -12px rgba(0,0,0,0.45)` }}
      >
        <span className="block size-full rounded-full bg-gradient-to-b from-card to-muted" />
      </span>
      <span className="relative size-[92%] overflow-hidden rounded-full">
        <HeroArt variant="head" avatar={look?.avatar} float={float} className="size-full scale-[1.12] object-cover object-top text-[3.2rem]" />
      </span>
      {level != null && (
        <span className="absolute -bottom-1.5 left-1/2 inline-flex h-5 min-w-7 -translate-x-1/2 items-center justify-center rounded-md bg-primary px-1.5 text-[11px] font-black tabular-nums text-primary-foreground shadow-[0_2px_0_0_hsl(var(--primary)/0.45)]">
          {level}
        </span>
      )}
    </span>
  )
}

// ------------------------------------------------------------------ badges

type BadgeLike = Pick<ArenaBadge, 'id' | 'name' | 'emoji' | 'description' | 'rarity' | 'earned_at'> &
  Partial<Pick<ArenaBadge, 'earned' | 'progress' | 'coins'>>

/**
 * One badge: its emblem in a rarity-bordered square, name below. Tapping or
 * focusing opens what it was for. Locked badges are greyed with their
 * progress; earned ones glow in their rarity.
 */
export function BadgeTile({ badge, size = 'sm', className }: { badge: BadgeLike; size?: 'sm' | 'md'; className?: string }) {
  const earned = badge.earned ?? true
  const hex = RARITY_HEX[badge.rarity]
  const r = RARITY_STYLE[badge.rarity]
  const progress = !earned && badge.progress && badge.progress.goal > 0 ? badge.progress : null
  const pctDone = progress ? Math.round(Math.min(1, progress.value / progress.goal) * 100) : 0

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'group flex min-w-0 flex-col items-center gap-1 rounded-xl p-1 text-center transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            size === 'md' && 'border bg-card px-1.5 pb-2 pt-2.5 shadow-sm',
            size === 'md' && (earned ? r.border : 'border-border'),
            size === 'md' && earned && r.glow,
            className,
          )}
        >
          <span
            aria-hidden
            className={cn(
              'relative flex items-center justify-center rounded-xl border transition-transform group-hover:-translate-y-0.5',
              size === 'md' ? 'size-12' : 'size-11',
              !earned && 'border-dashed border-border bg-muted/60',
            )}
            style={
              earned
                ? {
                    borderColor: `${hex}99`,
                    background: `radial-gradient(circle at 50% 30%, ${hex}40, ${hex}0d 70%)`,
                    boxShadow: badge.rarity === 'COMMON' ? undefined : `0 0 16px -5px ${hex}`,
                  }
                : undefined
            }
          >
            <Art3D emoji={badge.emoji} className={cn('size-[72%] text-2xl', !earned && 'opacity-40 grayscale')} />
            {!earned && <Art3D name="lock" className="absolute -bottom-1.5 -right-1.5 size-5" />}
          </span>
          <span
            className={cn(
              'line-clamp-2 w-full text-[10px] font-bold leading-tight',
              earned ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {badge.name}
          </span>
          {size === 'md' && !progress && (
            <span className="flex items-center gap-1 text-[9px] font-bold tabular-nums text-muted-foreground" aria-hidden>
              <span className={cn('size-1.5 rounded-full', r.dot)} />
              {badge.coins != null && badge.coins > 0 ? (
                <span className="inline-flex items-center gap-0.5 text-foreground">
                  +{badge.coins}
                  <Art3D name="coin" className="size-3" />
                </span>
              ) : (
                r.label
              )}
            </span>
          )}
          {progress && (
            <span className="block w-full px-1" aria-hidden>
              <span className="block h-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full" style={{ width: `${pctDone}%`, background: hex }} />
              </span>
              <span className="mt-0.5 block text-[9px] font-bold tabular-nums text-muted-foreground">
                {Math.min(progress.value, progress.goal).toLocaleString()}/{progress.goal.toLocaleString()}
              </span>
            </span>
          )}
          <span className="sr-only">
            {earned ? '' : 'Locked. '}
            {badge.description}
            {progress ? `. ${Math.min(progress.value, progress.goal)} of ${progress.goal}.` : ''}
            {badge.earned_at ? `. Earned ${formatDate(badge.earned_at)}.` : ''}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" side="top" className="w-64 p-3">
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border"
            style={{ borderColor: `${hex}99`, background: `radial-gradient(circle at 50% 30%, ${hex}33, ${hex}0a 70%)` }}
          >
            <Art3D emoji={badge.emoji} className={cn('size-8 text-xl', !earned && 'opacity-50 grayscale')} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black leading-tight text-foreground">{badge.name}</p>
            <RarityTag rarity={badge.rarity} />
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{badge.description}</p>
        {progress && (
          <div className="mt-2">
            <StatBar
              label="Progress"
              value={`${Math.min(progress.value, progress.goal).toLocaleString()} / ${progress.goal.toLocaleString()}`}
              ratio={progress.value / progress.goal}
              tone="primary"
            />
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold">
          {earned ? (
            <span className="inline-flex items-center gap-1 text-success">
              <CircleCheck className="size-3.5" />
              {badge.earned_at ? `Earned ${formatDate(badge.earned_at)}` : 'Earned'}
            </span>
          ) : (
            !progress && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Art3D name="lock" className="size-4" /> Locked
              </span>
            )
          )}
          {badge.coins != null && badge.coins > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums text-foreground">
              <Art3D name="coin" className="size-4" />+{badge.coins.toLocaleString()}
              <span className="sr-only"> coins</span>
            </span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ------------------------------------------------------------------- stats

function pct(value: number | null): string {
  return value == null ? '—' : `${Math.round(value * 100)}%`
}

function statList(stats: ArenaStats): Array<{ label: string; value: string; title?: string }> {
  return [
    { label: 'Battles', value: stats.matches.toLocaleString() },
    { label: 'Wins', value: stats.wins.toLocaleString() },
    { label: 'Best streak', value: stats.best_win_streak.toLocaleString(), title: 'Most wins in a row' },
    { label: 'Day streak', value: stats.day_streak.toLocaleString(), title: `Days in a row · best ${stats.best_day_streak}` },
    { label: 'Correct', value: stats.correct.toLocaleString(), title: 'Correct answers' },
    { label: 'Flawless', value: stats.perfect_matches.toLocaleString(), title: 'Battles with every answer right' },
  ]
}

/** Badges shown on the overview before "All N". */
const BADGE_ROW = 5

// ------------------------------------------------------------------- parts

type CardTab = 'overview' | 'stats' | 'badges' | 'collection'

/** How many items exist per slot, when the caller knows — "12/47". */
export type SlotTotals = Partial<Record<ArenaSlot, number>>

function RankChip({ art, label, rank, of }: { art: ArtName; label: string; rank: number; of: number }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 text-xs">
      <Art3D name={art} className="size-6" />
      <span className="font-bold text-muted-foreground">{label}</span>
      <span className="font-black tabular-nums text-foreground">#{rank.toLocaleString()}</span>
      <span className="tabular-nums text-muted-foreground">of {of.toLocaleString()}</span>
    </span>
  )
}

function CollectionSwatch({
  slot,
  item,
  card,
}: {
  slot: ArenaSlot
  item: ArenaProfileCard['items'][number]
  card: ArenaProfileCard
}) {
  const hex = RARITY_HEX[item.rarity]
  const label = `${item.name} · ${RARITY_STYLE[item.rarity].label}`
  if (slot === 'title') {
    return (
      <span title={label} className="inline-flex max-w-full">
        <TitleChip item={item} className="max-w-[11rem] px-1.5 text-[10px]" />
        <span className="sr-only">{label}</span>
      </span>
    )
  }
  return (
    <span
      title={label}
      className="relative flex size-11 items-center justify-center overflow-hidden rounded-xl border bg-card"
      style={{
        borderColor: `${hex}99`,
        background: `radial-gradient(circle at 50% 40%, ${hex}26, transparent 70%)`,
        boxShadow: item.rarity === 'COMMON' ? undefined : `0 0 12px -5px ${hex}`,
      }}
    >
      {slot === 'avatar' && <HeroArt variant="head" avatar={item} className="size-8 text-xl" />}
      {slot === 'frame' && <ArenaAvatar look={{ avatar: card.look.avatar, frame: item }} size="xs" />}
      {slot === 'banner' && <span aria-hidden className="absolute inset-1.5 rounded-md" style={{ background: gradient(item.colors, 120) }} />}
      <span className="sr-only">{label}</span>
    </span>
  )
}

// -------------------------------------------------------------------- card

/** The card body, header included. Reused by the dialog and the locker. */
export function ProfileCardView({
  card,
  className,
  totals,
}: {
  card: ArenaProfileCard
  className?: string
  totals?: SlotTotals
}) {
  const reduced = useReducedMotion()
  const [tab, setTab] = React.useState<CardTab>('overview')
  const classRank = card.ranks?.class ?? null
  const globalRank = card.ranks?.global ?? null
  const topMax = Math.max(1, ...card.top_subjects.map((s) => s.correct))
  const title = card.look.title
  const intoLevel = Math.max(0, card.xp - card.level_xp)
  const levelSpan = Math.max(1, card.next_level_xp - card.level_xp)
  const winRate = card.stats.matches > 0 ? card.stats.wins / card.stats.matches : null
  const bannerHex = firstHex(card.look.banner)

  const collection = SLOT_ORDER.map((slot) => ({
    slot,
    items: card.items.filter((item) => item.slot === slot),
  }))

  return (
    <div className={cn('min-w-0 bg-card text-foreground', className)}>
      {/* ------------------------------------------------ showcase band */}
      <div className="relative isolate overflow-hidden border-b border-border">
        <div aria-hidden className="absolute inset-0 -z-10 opacity-40" style={{ background: gradient(card.look.banner?.colors, 120) }} />
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: `radial-gradient(60% 90% at 18% 55%, ${bannerHex}55, transparent 70%)` }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-[18%] top-1/2 -z-10 size-[34rem] -translate-x-1/2 -translate-y-1/2 opacity-60 motion-safe:animate-[spin_60s_linear_infinite]"
          style={{
            background: 'repeating-conic-gradient(from 0deg, transparent 0deg 9deg, hsl(var(--card) / 0.35) 9deg 13deg)',
            maskImage: 'radial-gradient(circle, black 8%, transparent 45%)',
          }}
        />
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-gradient-to-t from-card via-card/70 to-transparent" />
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 -z-10 w-1/2 opacity-50"
          style={{ backgroundImage: 'repeating-linear-gradient(135deg, hsl(var(--foreground) / 0.05) 0 1px, transparent 1px 9px)' }}
        />

        <div className="flex items-end gap-3.5 px-4 pb-4 pt-6 sm:gap-4">
          <motion.div
            initial={reduced ? false : { opacity: 0, x: -12, scale: 0.92 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 240, damping: 20 }}
          >
            <TiltCard max={16} sheen={false} className="rounded-full">
              <TiltPop depth={40}>
                <HeroAvatar look={card.look} level={card.level} float className="size-24 sm:size-28" />
              </TiltPop>
            </TiltCard>
          </motion.div>
          <div className="min-w-0 flex-1 pb-1 pr-7">
            <Label className="text-[10px]">Player card</Label>
            <GameTitle as="p" className="mt-0.5 line-clamp-2 break-words text-2xl leading-[0.95] sm:text-[1.75rem]">
              {card.full_name}
            </GameTitle>
            {title?.text && (
              <p className={cn('mt-1 truncate text-xs font-black uppercase italic tracking-wide', RARITY_STYLE[title.rarity].text)}>
                {title.text}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <TierBadge level={card.level} size="md" />
              {card.class_name && (
                <span className="inline-flex min-w-0 items-center gap-1 text-xs font-semibold text-muted-foreground">
                  <School className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{card.class_name}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 pb-4 pt-3">
        {/* Level */}
        <div>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="text-[11px] font-black uppercase italic tracking-[0.12em] text-foreground">Level {card.level}</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              <span className="font-bold text-foreground">{intoLevel.toLocaleString()}</span> / {levelSpan.toLocaleString()} XP
              <span aria-hidden> · </span>
              {card.xp.toLocaleString()} total
            </span>
          </div>
          <XpBar progress={card.progress} tall />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {classRank && <RankChip art="crown" label="Class" rank={classRank.rank} of={classRank.of} />}
          {globalRank && <RankChip art="globe" label="School" rank={globalRank.rank} of={globalRank.of} />}
          {!classRank && !globalRank && (
            <span className="inline-flex h-8 items-center rounded-lg border border-dashed border-border px-2.5 text-xs text-muted-foreground">
              Unranked — win a battle to get on the boards
            </span>
          )}
        </div>

        <ArenaTabs
          size="sm"
          aria-label="Card sections"
          value={tab}
          onChange={setTab}
          className="flex w-full [&>button]:flex-1 [&>button]:justify-center"
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'stats', label: 'Stats' },
            { value: 'badges', label: 'Badges', count: card.badges.length },
            { value: 'collection', label: 'Items', count: card.items.length },
          ]}
        />

        <div role="tabpanel" aria-label={tab} className="min-h-[10rem]">
          {tab === 'overview' && (
            <div className="space-y-4 pt-1">
              <section>
                <SectionTitle title="Attribute" />
                <div className="grid gap-3">
                  <StatBar label="Win rate" value={pct(winRate)} ratio={winRate ?? 0} tone="success" />
                  <StatBar label="Accuracy" value={pct(card.stats.accuracy)} ratio={card.stats.accuracy ?? 0} tone="info" />
                </div>
              </section>

              <section>
                <SectionTitle
                  title="Badges"
                  action={
                    card.badges.length > BADGE_ROW && (
                      <button
                        type="button"
                        onClick={() => setTab('badges')}
                        className="text-[11px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        All {card.badges.length}
                      </button>
                    )
                  }
                />
                {card.badges.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No badges yet — they drop for wins, streaks and flawless battles.</p>
                ) : (
                  <div className="grid grid-cols-5 gap-1">
                    {card.badges.slice(0, BADGE_ROW).map((badge) => (
                      <BadgeTile key={badge.id} badge={badge} />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === 'stats' && (
            <div className="space-y-4 pt-1">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 min-[420px]:grid-cols-3">
                {statList(card.stats).map((stat) => (
                  <div key={stat.label} title={stat.title} className="min-w-0">
                    <dt className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{stat.label}</dt>
                    <dd className="text-lg font-black tabular-nums text-foreground">{stat.value}</dd>
                  </div>
                ))}
              </dl>

              {card.top_subjects.length > 0 && (
                <section>
                  <SectionTitle title="Top subjects" />
                  <div className="grid gap-2.5">
                    {card.top_subjects.map((subject) => (
                      <StatBar
                        key={subject.subject_id}
                        label={subject.name}
                        value={`${subject.correct.toLocaleString()} correct`}
                        ratio={subject.correct / topMax}
                        tone="accent"
                      />
                    ))}
                  </div>
                </section>
              )}

              {card.last_played_at && (
                <p className="text-[11px] text-muted-foreground">Last battle {formatDate(card.last_played_at)}</p>
              )}
            </div>
          )}

          {tab === 'badges' &&
            (card.badges.length === 0 ? (
              <ArenaEmpty art="medal_1" title="No badges yet" description="Badges drop for wins, streaks and flawless battles." />
            ) : (
              <div className="grid grid-cols-4 gap-1 min-[400px]:grid-cols-5">
                {card.badges.map((badge) => (
                  <BadgeTile key={badge.id} badge={badge} />
                ))}
              </div>
            ))}

          {tab === 'collection' &&
            (card.items.length === 0 ? (
              <ArenaEmpty art="gem" title="Nothing collected yet" description="Looks unlocked in the locker show up here." />
            ) : (
              <div className="space-y-3">
                {collection.map(({ slot, items }) => {
                  const Icon = SLOT_LOOK[slot].icon
                  const total = totals?.[slot]
                  return (
                    <div key={slot}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon className="size-3.5 text-primary" aria-hidden />
                          <Label>{SLOT_LOOK[slot].label}</Label>
                        </span>
                        <span className="text-[11px] font-black tabular-nums text-foreground">
                          {items.length}
                          {total != null && <span className="font-semibold text-muted-foreground">/{total}</span>}
                        </span>
                      </div>
                      {items.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">None yet</p>
                      ) : (
                        <ul className="flex flex-wrap items-center gap-1.5">
                          {items.map((item) => (
                            <li key={item.id} className="inline-flex max-w-full">
                              <CollectionSwatch slot={slot} item={item} card={card} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- skeleton

/** A placeholder block. */
export function Bone({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />
}

export function ProfileCardSkeleton() {
  return (
    <div aria-busy aria-label="Loading player card" className="bg-card">
      <div className="flex items-end gap-3.5 border-b border-border bg-muted/40 px-4 pb-4 pt-6">
        <Bone className="size-24 shrink-0 rounded-full sm:size-28" />
        <div className="flex-1 space-y-2 pb-1">
          <Bone className="h-3 w-16" />
          <Bone className="h-6 w-44 max-w-full" />
          <Bone className="h-3 w-24" />
          <Bone className="h-5 w-20" />
        </div>
      </div>
      <div className="space-y-3 px-4 pb-4 pt-3">
        <Bone className="h-2.5 w-full rounded-full" />
        <div className="flex gap-1.5">
          <Bone className="h-8 w-36" />
          <Bone className="h-8 w-32" />
        </div>
        <Bone className="h-9 w-full rounded-xl" />
        <Bone className="h-20 w-full rounded-xl" />
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Bone key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}

/** A failed request, with a retry. */
export function ArenaErrorNotice({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const apiError = error instanceof ApiError ? error : new ApiError({ message: String(error), status: null })
  return (
    <div role="alert">
      <ArenaEmpty
        className={className}
        icon={<AlertTriangle className="text-danger" />}
        title={errorTitle(apiError)}
        description={errorDescription(apiError)}
        action={
          onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-extrabold text-foreground shadow-[0_3px_0_0_hsl(var(--border))] transition-colors hover:bg-muted active:translate-y-[2px] active:shadow-[0_1px_0_0_hsl(var(--border))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RefreshCw className="size-3.5" />
              Try again
            </button>
          )
        }
      />
    </div>
  )
}

/** Loading, "not yours to see", or the card. */
export function ProfileCardState({ studentId, totals }: { studentId: number | null; totals?: SlotTotals }) {
  const query = useProfileCard(studentId)
  if (query.isPending) return <ProfileCardSkeleton />
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.isForbidden) {
      return (
        <div className="bg-card p-4 pt-12">
          <ArenaEmpty
            art="lock"
            title="This card is private"
            description="You can see the cards of classmates and players on the school board."
          />
        </div>
      )
    }
    return (
      <div className="bg-card p-4 pt-12">
        <ArenaErrorNotice error={query.error} onRetry={() => void query.refetch()} />
      </div>
    )
  }
  return <ProfileCardView card={query.data} totals={totals} />
}

// ------------------------------------------------------------------ dialog

export function ProfileCardDialog({ studentId, onClose }: { studentId: number | null; onClose: () => void }) {
  // Hold on to the last id so the card stays put while the dialog animates out.
  const [shownId, setShownId] = React.useState<number | null>(studentId)
  React.useEffect(() => {
    if (studentId != null) setShownId(studentId)
  }, [studentId])

  const query = useProfileCard(shownId)
  const name = query.data?.full_name

  return (
    <Dialog open={studentId != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md" hideClose className="max-w-lg rounded-2xl p-0 shadow-2xl">
        <DialogTitle className="sr-only">{name ? `${name}'s player card` : 'Player card'}</DialogTitle>
        <DialogDescription className="sr-only">Level, ranks, stats, badges and collection.</DialogDescription>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ProfileCardState studentId={shownId} />
        </div>
        <DialogClose
          className="absolute right-2.5 top-2.5 z-10 rounded-lg border border-border bg-card/85 p-1.5 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Close"
        >
          <X className="size-4" />
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}

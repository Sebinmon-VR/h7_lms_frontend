import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, Crown, Flame, X } from 'lucide-react'
import * as React from 'react'

import type { ArenaMatchPlayer, ArenaMatchView } from '@/api/arena.types'
import { Art3D, TierBadge, TiltCard } from '@/components/arena/arena-theme'
import { ArenaAvatar, type ArenaAvatarSize, gradient } from '@/components/arena/arena-ui'
import { arenaSound } from '@/lib/arena-sound'
import { cn } from '@/lib/cn'
import { useEmote } from '@/queries/arena.queries'
import { botArt } from './helpers'
import { HeroArt } from '@/components/arena/arena-art'

// ------------------------------------------------------------------ emotes

export interface EmoteBubble {
  id: string
  emote: string
  userId: number
}

const BUBBLE_MS = 2600

/** New emotes from the poll, each shown once for a couple of seconds. */
export function useEmoteBubbles(emotes: ArenaMatchView['emotes'] | undefined) {
  const seen = React.useRef(new Set<string>())
  const timers = React.useRef<number[]>([])
  const [bubbles, setBubbles] = React.useState<EmoteBubble[]>([])

  React.useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  React.useEffect(() => {
    if (!emotes?.length) return
    const fresh = emotes.filter((e) => !seen.current.has(e.id))
    if (fresh.length === 0) return
    fresh.forEach((e) => seen.current.add(e.id))
    setBubbles((prev) => [...prev, ...fresh.map((e) => ({ id: e.id, emote: e.emote, userId: e.user_id }))])
    arenaSound.emote()
    for (const e of fresh) {
      timers.current.push(window.setTimeout(() => setBubbles((prev) => prev.filter((b) => b.id !== e.id)), BUBBLE_MS))
    }
  }, [emotes])

  return bubbles
}

export function EmoteBubbles({ bubbles, className }: { bubbles: EmoteBubble[]; className?: string }) {
  const reduced = useReducedMotion()
  return (
    <span className={cn('pointer-events-none absolute -top-4 left-1/2 z-20 -translate-x-1/2', className)} aria-hidden>
      <AnimatePresence>
        {bubbles.slice(-2).map((b) => (
          <motion.span
            key={b.id}
            className={cn(
              'absolute left-0 top-0 whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-foreground shadow-md',
              b.emote.length > 2 ? 'text-[10px] font-black tracking-wider' : 'text-lg leading-none',
            )}
            style={{ x: '-50%' }}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.4 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: -12, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -26, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 20 }}
          >
            {b.emote}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  )
}

const FALLBACK_EMOTES = ['👍', '😎', '🔥', '😮', '😂', '👏', '🤝', 'GG']

export function EmoteBar({ matchId, emotes }: { matchId: number; emotes: string[] | undefined }) {
  const send = useEmote(matchId)
  const reduced = useReducedMotion()
  const [cooling, setCooling] = React.useState(false)
  const list = emotes && emotes.length > 0 ? emotes : FALLBACK_EMOTES

  const fire = (emote: string) => {
    if (cooling) return
    setCooling(true)
    send.mutate(emote)
    window.setTimeout(() => setCooling(false), 900)
  }

  return (
    <div
      role="toolbar"
      aria-label="Send a reaction"
      className="no-scrollbar mx-auto flex w-max max-w-full gap-0.5 overflow-x-auto rounded-full border border-border bg-card/90 p-1 shadow-md backdrop-blur"
    >
      {list.map((e) => (
        <motion.button
          key={e}
          type="button"
          onClick={() => fire(e)}
          disabled={cooling}
          whileHover={reduced ? undefined : { scale: 1.15, y: -2 }}
          whileTap={reduced ? undefined : { scale: 0.9 }}
          aria-label={e === 'GG' ? 'Good game' : `React ${e}`}
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted disabled:opacity-40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            e.length > 2 ? 'text-[10px] font-black tracking-wider text-foreground' : 'text-lg',
          )}
        >
          {e}
        </motion.button>
      ))}
    </div>
  )
}

// -------------------------------------------------------------- faces

export function playerBubbles(bubbles: EmoteBubble[], player: ArenaMatchPlayer) {
  return player.user_id == null ? [] : bubbles.filter((b) => b.userId === player.user_id)
}

export function PlayerFace({
  player,
  size = 'sm',
  bubbles,
  showLevel = true,
}: {
  player: ArenaMatchPlayer
  size?: ArenaAvatarSize
  bubbles: EmoteBubble[]
  showLevel?: boolean
}) {
  return (
    <span className="relative inline-flex">
      <EmoteBubbles bubbles={playerBubbles(bubbles, player)} />
      <ArenaAvatar look={player.look} size={size} level={showLevel ? player.level : null} dimmed={player.left} />
    </span>
  )
}

/** A number that rolls from its last value to the new one. */
export function RollingNumber({ value, duration = 700, className }: { value: number; duration?: number; className?: string }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = React.useState(value)
  const from = React.useRef(value)
  React.useEffect(() => {
    if (reduced || from.current === value) {
      from.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - k, 3)
      setShown(a + (value - a) * eased)
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      from.current = value
    }
  }, [value, duration, reduced])
  return <span className={cn('tabular-nums', className)}>{Math.round(shown).toLocaleString()}</span>
}

// ---------------------------------------------------------- portrait card

/**
 * A player as a character card: a name tab on top, the 3D avatar on a card
 * tinted with their banner, level and tier below. Lobby, VS splash and the
 * results row all use it; `children` adds rows under the portrait.
 */
/** The portrait's art lifts and grows when the card is hovered. */
const PORTRAIT_ART =
  'absolute inset-x-[8%] bottom-[4%] mx-auto w-[84%] transition-transform duration-300 ease-out group-hover/tilt:-translate-y-1.5 group-hover/tilt:scale-110'

export function PortraitCard({
  player,
  bubbles,
  size = 'md',
  highlight,
  badge,
  onOpen,
  children,
  className,
}: {
  player: ArenaMatchPlayer
  bubbles?: EmoteBubble[]
  size?: 'sm' | 'md' | 'lg'
  /** Winner treatment: raised with a gold glow. */
  highlight?: boolean
  /** Corner art (a medal). */
  badge?: React.ReactNode
  onOpen?: () => void
  children?: React.ReactNode
  className?: string
}) {
  const art = player.is_bot ? botArt(player.bot_level, player.look?.avatar?.emoji) : null
  const width = size === 'sm' ? 'w-[6.5rem]' : size === 'lg' ? 'w-[9.5rem] sm:w-44' : 'w-[7.5rem] sm:w-36'
  const body = (
    <>
      {/* Name tab */}
      <span
        className={cn(
          'relative z-10 mx-1.5 flex h-6 -skew-x-12 items-center justify-center rounded-t-md px-2',
          player.is_me ? 'bg-primary text-primary-foreground' : highlight ? 'bg-warning text-warning-foreground' : 'bg-muted text-foreground',
        )}
      >
        <span className="skew-x-12 truncate text-[11px] font-black uppercase tracking-wide">{player.is_me ? 'You' : player.name}</span>
      </span>
      {/* Portrait */}
      <span
        className={cn(
          'relative block aspect-[4/5] overflow-hidden rounded-xl border-2',
          highlight ? 'border-warning' : player.is_me ? 'border-primary' : 'border-border',
        )}
        style={{ background: gradient(player.look?.banner?.colors, 160) }}
      >
        <span aria-hidden className="absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_35%,rgba(255,255,255,0.35),transparent_70%)]" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/35 to-transparent" />
        {art ? (
          <Art3D name={art} className={PORTRAIT_ART} />
        ) : (
          <HeroArt avatar={player.look?.avatar} className={cn(PORTRAIT_ART, 'text-6xl')} />
        )}
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.45)_50%,transparent_70%)] bg-[length:250%_100%] bg-[position:150%_0] opacity-0 transition-[background-position,opacity] duration-700 group-hover/tilt:bg-[position:-50%_0] group-hover/tilt:opacity-100" />
        {player.is_host && (
          <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-warning text-warning-foreground shadow" title="Host">
            <Crown className="size-3.5" aria-hidden />
            <span className="sr-only">Host</span>
          </span>
        )}
        {badge && <span className="absolute left-1 top-1">{badge}</span>}
        {player.left && (
          <span className="absolute inset-0 flex items-center justify-center bg-card/70 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
            Left
          </span>
        )}
      </span>
      {/* Level */}
      <span className="mt-1.5 flex items-center justify-center gap-1.5">
        {player.is_bot ? (
          <span className="text-[10px] font-black uppercase tracking-wider text-info">Bot</span>
        ) : (
          <>
            <span className="text-[11px] font-black tabular-nums text-foreground">Lv {player.level}</span>
            <TierBadge level={player.level} size="xs" />
          </>
        )}
      </span>
      {children}
    </>
  )
  const cls = cn(
    'relative flex shrink-0 flex-col text-center transition-transform duration-200',
    width,
    highlight && 'drop-shadow-[0_12px_24px_hsl(var(--warning)/0.45)]',
    player.left && 'opacity-60',
    className,
  )
  return (
    <div className={cls}>
      {bubbles && <EmoteBubbles bubbles={playerBubbles(bubbles, player)} className="top-6" />}
      <TiltCard
        as={onOpen ? 'button' : 'div'}
        onClick={onOpen}
        sheen={false}
        max={14}
        className="flex flex-col rounded-xl text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={onOpen ? `${player.name}: open player card` : undefined}
      >
        {body}
      </TiltCard>
    </div>
  )
}

// -------------------------------------------------------------- HUD chips

function PlayerChip({
  view,
  player,
  bubbles,
  prevRanks,
  mirrored,
  compact,
}: {
  view: ArenaMatchView
  player: ArenaMatchPlayer
  bubbles: EmoteBubble[]
  prevRanks?: Record<string, number>
  mirrored?: boolean
  compact?: boolean
}) {
  const reduced = useReducedMotion()
  const reveal = view.phase === 'REVEAL' ? view.reveal : null
  const pick = reveal?.picks[player.id]
  const asking = view.phase === 'QUESTION'
  const before = prevRanks?.[player.id]
  const moved = before && player.rank ? before - player.rank : 0

  return (
    <div
      className={cn(
        'relative flex h-12 min-w-0 items-center gap-2 rounded-xl border-2 bg-card px-1.5 transition-colors',
        mirrored && 'flex-row-reverse text-right',
        compact ? 'w-[8.5rem] shrink-0' : 'w-full',
        player.is_me ? 'border-primary/60' : 'border-border',
        reveal && pick?.correct && 'border-success',
        player.left && 'opacity-50',
      )}
    >
      <span className="relative shrink-0">
        <PlayerFace player={player} size="xs" bubbles={bubbles} showLevel={false} />
        <AnimatePresence>
          {((asking && player.answered) || pick) && (
            <motion.span
              key={reveal ? 'r' : 'q'}
              initial={reduced ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className={cn(
                'absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full ring-2 ring-card',
                pick ? (pick.correct ? 'bg-success text-success-foreground' : 'bg-danger text-danger-foreground') : 'bg-info text-info-foreground',
              )}
            >
              {pick && !pick.correct ? <X className="size-2.5" strokeWidth={4} /> : <Check className="size-2.5" strokeWidth={4} />}
              <span className="sr-only">{pick ? (pick.correct ? 'correct' : 'wrong') : 'answered'}</span>
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {pick && pick.points > 0 && (
            <motion.span
              key={`${view.round}-${player.id}`}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.6 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, y: -22, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 16 }}
              style={{ x: '-50%' }}
              className="absolute -top-2 left-1/2 z-10 whitespace-nowrap rounded-md bg-success px-1 text-[10px] font-black tabular-nums text-success-foreground shadow"
            >
              +{pick.points}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('flex min-w-0 items-center gap-1', mirrored && 'flex-row-reverse')}>
          <span className="truncate text-[11px] font-bold text-muted-foreground">{player.is_me ? 'You' : player.name}</span>
          {player.streak >= 2 && (
            <span className="flex shrink-0 items-center text-[10px] font-black tabular-nums text-warning" title={`${player.streak} in a row`}>
              <Flame className="size-3" aria-hidden />
              {player.streak}
            </span>
          )}
        </span>
        <span className={cn('flex items-center gap-1', mirrored && 'flex-row-reverse')}>
          <RollingNumber value={player.score} className="text-base font-black leading-tight text-foreground" />
          {moved !== 0 && (
            <span className={cn('text-[10px] font-black', moved > 0 ? 'text-success' : 'text-danger')}>
              {moved > 0 ? '▲' : '▼'}
              <span className="sr-only">{moved > 0 ? ' up' : ' down'}</span>
            </span>
          )}
        </span>
      </span>
    </div>
  )
}

/** The players across the HUD: a face-off for two, a scrolling strip for more. */
export function PlayerStrip({
  view,
  bubbles,
  prevRanks,
}: {
  view: ArenaMatchView
  bubbles: EmoteBubble[]
  prevRanks?: Record<string, number>
}) {
  const players = view.players
  if (players.length === 2) {
    const me = players.find((p) => p.is_me) ?? players[0]
    const other = players.find((p) => p !== me) ?? players[1]
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 pt-3" aria-label="Players" role="group">
        <PlayerChip view={view} player={me} bubbles={bubbles} prevRanks={prevRanks} />
        <span className="text-xs font-black italic text-muted-foreground" aria-hidden>
          VS
        </span>
        <PlayerChip view={view} player={other} bubbles={bubbles} prevRanks={prevRanks} mirrored />
      </div>
    )
  }
  const ordered = [...players].sort((a, b) => Number(b.is_me) - Number(a.is_me))
  return (
    <ul className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pt-3" aria-label="Players">
      {ordered.map((p) => (
        <li key={p.id}>
          <PlayerChip view={view} player={p} bubbles={bubbles} prevRanks={prevRanks} compact />
        </li>
      ))}
    </ul>
  )
}

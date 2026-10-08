import { motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft, Flag } from 'lucide-react'

import type { ArenaMatchView } from '@/api/arena.types'
import { ArenaButton, Art3D } from '@/components/arena/arena-theme'
import { cn } from '@/lib/cn'
import { type EmoteBubble, PlayerStrip } from './battle-players'
import { MuteToggle } from './helpers'

export const MODE_LABEL: Record<ArenaMatchView['mode'], string> = {
  BOT: 'Vs bot',
  CHALLENGE: 'Challenge',
  ROOM: 'Private room',
  QUICK: 'Quick match',
}

/** The thin meta row: back or forfeit, what this battle is, the Q pill, sound. */
export function BattleTopBar({ view, onBack, onForfeit }: { view: ArenaMatchView; onBack: () => void; onForfeit?: () => void }) {
  const inRounds = view.round != null && (view.phase === 'QUESTION' || view.phase === 'REVEAL')
  return (
    <div className="flex items-center gap-2">
      {!onForfeit && (
        <ArenaButton variant="secondary" size="icon" className="size-9" onClick={onBack} aria-label="Back to the Quiz Battle lobby">
          <ChevronLeft />
        </ArenaButton>
      )}
      {view.emoji && <Art3D emoji={view.emoji} className="size-8 shrink-0 text-2xl" />}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-black uppercase italic tracking-tight text-foreground sm:text-base">{view.title ?? 'Battle'}</h1>
        <p className="truncate text-[11px] font-semibold text-muted-foreground">
          {[MODE_LABEL[view.mode], view.subtitle].filter(Boolean).join(' · ')}
        </p>
      </div>
      {inRounds && (
        <span
          className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-xs font-black italic tabular-nums text-primary-foreground shadow-[0_2px_0_0_hsl(var(--primary)/0.45)]"
          aria-label={`Question ${view.round! + 1} of ${view.round_count}`}
        >
          Q {view.round! + 1}/{view.round_count}
        </span>
      )}
      <MuteToggle className="size-9" />
      {onForfeit && (
        <ArenaButton variant="danger" size="sm" onClick={onForfeit} aria-label="Forfeit the battle" className="px-2 sm:px-3">
          <Flag />
          <span className="hidden sm:inline">Forfeit</span>
        </ArenaButton>
      )}
    </div>
  )
}

/**
 * The draining bar under the HUD: primary with time to spare, warning past
 * half, danger in the last quarter, pulsing through the final three seconds.
 */
export function TimerBar({ view, remainingMs }: { view: ArenaMatchView; remainingMs: number | null }) {
  const reduced = useReducedMotion()
  const asking = view.phase === 'QUESTION'
  const revealing = view.phase === 'REVEAL'

  if (!(asking || revealing) || remainingMs == null) return null

  const total = (asking ? view.question_seconds : view.reveal_seconds) * 1000
  const frac = Math.max(0, Math.min(1, total > 0 ? remainingMs / total : 0))
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const urgent = asking && remainingMs > 0 && seconds <= 3
  const fill = !asking ? 'bg-muted-foreground/40' : frac > 0.5 ? 'bg-primary' : frac > 0.25 ? 'bg-warning' : 'bg-danger'
  const lastRound = view.round != null && view.round + 1 >= view.round_count

  return (
    <div className="mt-2.5 flex h-5 items-center gap-2.5">
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <motion.div
          className={cn('absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-100 ease-linear', fill)}
          style={{ width: `${frac * 100}%` }}
          animate={urgent && !reduced ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
          transition={urgent && !reduced ? { duration: 0.5, repeat: Infinity } : { duration: 0.2 }}
        />
      </div>
      {asking ? (
        <motion.span
          role="timer"
          aria-label={`${seconds} seconds left`}
          className={cn('w-8 text-right text-sm font-black italic tabular-nums', urgent ? 'text-danger' : 'text-foreground')}
          animate={urgent && !reduced ? { scale: [1, 1.25, 1] } : { scale: 1 }}
          transition={urgent && !reduced ? { duration: 0.5, repeat: Infinity } : { duration: 0.1 }}
        >
          {seconds}s
        </motion.span>
      ) : (
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
          {lastRound ? 'Results next' : 'Next question'}
        </span>
      )}
    </div>
  )
}

/** HUD for the live phases: meta row, the players, then the timer. */
export function BattleHud({
  view,
  bubbles,
  prevRanks,
  remainingMs,
  onBack,
  onForfeit,
}: {
  view: ArenaMatchView
  bubbles: EmoteBubble[]
  prevRanks?: Record<string, number>
  remainingMs: number | null
  onBack: () => void
  onForfeit?: () => void
}) {
  const live = view.phase === 'QUESTION' || view.phase === 'REVEAL'
  return (
    <div className="mb-3">
      <BattleTopBar view={view} onBack={onBack} onForfeit={onForfeit} />
      {live && <PlayerStrip view={view} bubbles={bubbles} prevRanks={view.phase === 'REVEAL' ? prevRanks : undefined} />}
      <TimerBar view={view} remainingMs={remainingMs} />
    </div>
  )
}

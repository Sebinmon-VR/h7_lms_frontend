import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, Copy, LogOut, Play, Plus } from 'lucide-react'
import * as React from 'react'

import type { ArenaMatchView } from '@/api/arena.types'
import { ArenaButton, GameTitle, Label } from '@/components/arena/arena-theme'
import { ArenaAvatar } from '@/components/arena/arena-ui'
import { ProfileCardDialog } from '@/components/arena/profile-card'
import { cn } from '@/lib/cn'
import { useCopyToClipboard } from '@/lib/hooks'
import { type EmoteBubble, PortraitCard } from './battle-players'

const INVITE_LOOK = {
  PENDING: { label: 'Waiting', className: 'bg-warning/15 text-warning' },
  ACCEPTED: { label: 'Joined', className: 'bg-success/15 text-success' },
  DECLINED: { label: "Can't play", className: 'bg-muted text-muted-foreground' },
  EXPIRED: { label: 'No answer', className: 'bg-muted text-muted-foreground' },
} as const

function RoomCode({ code }: { code: string }) {
  const { copied, copy } = useCopyToClipboard()
  return (
    <div className="flex flex-col items-center gap-1.5">
      <Label>Room code · friends join from Quiz Battle → Room</Label>
      <button
        type="button"
        onClick={() => void copy(code)}
        className="group flex h-14 items-center gap-3 rounded-2xl border-2 border-dashed border-success bg-success/10 pl-5 pr-3 transition-colors hover:bg-success/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Room code ${code.split('').join(' ')}. Copy`}
      >
        <span className="font-mono text-2xl font-black tracking-[0.35em] text-foreground sm:text-3xl">{code}</span>
        <span
          className={cn(
            'flex size-9 items-center justify-center rounded-xl transition-colors',
            copied ? 'bg-success text-success-foreground' : 'bg-card text-foreground group-hover:bg-muted',
          )}
          aria-hidden
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </span>
        <span className="sr-only" aria-live="polite">
          {copied ? 'Copied' : ''}
        </span>
      </button>
    </div>
  )
}

export function BattleLobby({
  view,
  bubbles,
  onStart,
  starting,
  onLeave,
  leaving,
}: {
  view: ArenaMatchView
  bubbles: EmoteBubble[]
  onStart: () => void
  starting: boolean
  onLeave: () => void
  leaving: boolean
}) {
  const reduced = useReducedMotion()
  const [profileId, setProfileId] = React.useState<number | null>(null)
  const pending = view.invites.filter((i) => i.status === 'PENDING')
  const isRoom = view.mode === 'ROOM'
  const seatsLeft = Math.max(0, view.max_players - view.players.length)

  let waitingLine: string
  if (pending.length > 0) {
    const names = pending.map((i) => i.name ?? 'your classmate')
    waitingLine = names.length === 1 ? `Waiting for ${names[0]} to accept` : `Waiting for ${names.length} classmates to accept`
  } else if (view.can_start) {
    waitingLine = view.is_host ? 'Everyone is in. Ready when you are.' : 'Everyone is in. The host starts the battle.'
  } else if (view.is_host) {
    waitingLine = 'Waiting for at least one more player'
  } else {
    waitingLine = 'Waiting for the host to start'
  }

  return (
    <div className="space-y-5 py-2">
      <div className="text-center">
        <GameTitle as="h2" className="text-2xl sm:text-3xl">
          {isRoom ? 'Private room' : 'Lobby'}
        </GameTitle>
        <p className="mt-1.5 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground" aria-live="polite">
          <span className="relative flex size-2" aria-hidden>
            <span className={cn('absolute inset-0 rounded-full', view.can_start ? 'bg-success' : 'bg-warning', !reduced && 'animate-ping')} />
            <span className={cn('relative size-2 rounded-full', view.can_start ? 'bg-success' : 'bg-warning')} />
          </span>
          {waitingLine}
        </p>
      </div>

      {isRoom && view.code && <RoomCode code={view.code} />}

      <ul
        className="no-scrollbar -mx-3 flex snap-x items-end gap-3 overflow-x-auto px-3 pb-2 pt-6 sm:flex-wrap sm:justify-center sm:overflow-visible"
        aria-label={`Players, ${view.players.length} of ${view.max_players}`}
      >
        <AnimatePresence initial={false}>
          {view.players.map((p) => (
            <motion.li
              key={p.id}
              layout={!reduced}
              className="snap-start"
              initial={reduced ? false : { opacity: 0, scale: 0.8, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            >
              <PortraitCard
                player={p}
                bubbles={bubbles}
                onOpen={!p.is_bot && !p.is_me && p.user_id != null ? () => setProfileId(p.user_id) : undefined}
              />
            </motion.li>
          ))}
        </AnimatePresence>
        {isRoom &&
          Array.from({ length: Math.min(seatsLeft, 3) }).map((_, i) => (
            <li key={`empty-${i}`} className="w-[7.5rem] shrink-0 snap-start sm:w-36">
              <div className="mx-1.5 h-6" />
              <div className="flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <Plus className={cn('size-5', !reduced && i === 0 && 'animate-pulse')} aria-hidden />
                Open seat
              </div>
            </li>
          ))}
      </ul>
      {isRoom && seatsLeft > 3 && <p className="-mt-3 text-center text-[11px] font-semibold text-muted-foreground">{seatsLeft} seats open</p>}

      {view.invites.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Invited">
          {view.invites.map((i) => (
            <li key={i.id} className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-card pl-3 pr-1">
              <span className="max-w-[9rem] truncate text-xs font-bold text-foreground">{i.name ?? 'Classmate'}</span>
              <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider', INVITE_LOOK[i.status].className)}>
                {i.status === 'PENDING' && <span className="size-1.5 rounded-full bg-warning motion-safe:animate-pulse" aria-hidden />}
                {INVITE_LOOK[i.status].label}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col-reverse items-center gap-2 min-[420px]:flex-row min-[420px]:justify-center">
        <ArenaButton variant="ghost" loading={leaving} onClick={onLeave}>
          {!leaving && <LogOut />}
          {view.is_host && isRoom ? 'Close room' : 'Leave'}
        </ArenaButton>
        {view.is_host && (
          <ArenaButton
            variant="gold"
            size="lg"
            className="h-14 w-full max-w-[16rem] text-xl font-black tracking-wider"
            disabled={!view.can_start}
            loading={starting}
            onClick={onStart}
          >
            {!starting && <Play className="fill-current" />}
            Start
          </ArenaButton>
        )}
      </div>

      <ProfileCardDialog studentId={profileId} onClose={() => setProfileId(null)} />
    </div>
  )
}

// --------------------------------------------------------------- countdown

/** "VS" splash for a duel, a big 3-2-1 with a ring for more players. */
export function BattleCountdown({ view, remainingMs, bubbles }: { view: ArenaMatchView; remainingMs: number | null; bubbles: EmoteBubble[] }) {
  const reduced = useReducedMotion()
  const n = remainingMs == null ? 3 : Math.ceil(remainingMs / 1000)
  const label = n > 0 ? String(Math.min(3, n)) : 'GO'
  const duel = view.players.length === 2
  const me = view.players.find((p) => p.is_me) ?? view.players[0]
  const other = view.players.find((p) => p !== me)

  const numeral = (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={label}
        className={cn('relative block font-black italic leading-none text-foreground', label === 'GO' ? 'text-5xl sm:text-6xl' : 'text-6xl sm:text-7xl')}
        initial={reduced ? { opacity: 0 } : { scale: 1.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={reduced ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 480, damping: 24 }}
      >
        {label}
      </motion.span>
    </AnimatePresence>
  )

  return (
    <div className="flex flex-col items-center py-4 text-center sm:py-6" aria-live="assertive">
      <Label>Get ready</Label>
      <p className="mt-1 max-w-full truncate text-base font-black uppercase italic text-foreground sm:text-lg">{view.title ?? 'Battle'}</p>

      {duel && other ? (
        <div className="mt-6 flex w-full items-center justify-center gap-2 sm:gap-6">
          <motion.div initial={reduced ? false : { opacity: 0, x: -80 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 22 }}>
            <PortraitCard player={me} bubbles={bubbles} size="sm" className="sm:w-36" />
          </motion.div>
          <div className="flex w-20 shrink-0 flex-col items-center gap-2 sm:w-28">
            <motion.span
              initial={reduced ? false : { scale: 3, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: -6 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14, delay: reduced ? 0 : 0.25 }}
              className="block bg-gradient-to-b from-warning to-danger bg-clip-text text-5xl font-black italic text-transparent sm:text-6xl"
              aria-hidden
            >
              VS
            </motion.span>
            <span className="flex size-16 items-center justify-center rounded-full border-4 border-primary/30 bg-card shadow-md sm:size-20">{numeral}</span>
          </div>
          <motion.div initial={reduced ? false : { opacity: 0, x: 80 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 22 }}>
            <PortraitCard player={other} bubbles={bubbles} size="sm" className="sm:w-36" />
          </motion.div>
        </div>
      ) : (
        <>
          <Ring remainingMs={remainingMs} label={label}>
            {numeral}
          </Ring>
          <ul className="mt-6 flex flex-wrap items-start justify-center gap-3" aria-label="Players">
            {view.players.map((p, i) => (
              <motion.li
                key={p.id}
                initial={reduced ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduced ? 0 : i * 0.06 }}
                className="flex w-16 flex-col items-center"
              >
                <ArenaAvatar look={p.look} size="md" dimmed={p.left} />
                <span className="mt-1 w-full truncate text-[11px] font-bold text-foreground">{p.is_me ? 'You' : p.name}</span>
              </motion.li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function Ring({ remainingMs, label, children }: { remainingMs: number | null; label: string; children: React.ReactNode }) {
  const reduced = useReducedMotion()
  const r = 54
  const c = 2 * Math.PI * r
  const subFrac = remainingMs == null ? 1 : (remainingMs % 1000) / 1000
  return (
    <div className="relative mt-6 flex size-36 items-center justify-center sm:size-44">
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={reduced ? 0 : c * (1 - subFrac)}
          className="stroke-primary"
        />
      </svg>
      {!reduced && (
        <motion.span
          key={`ring-${label}`}
          className="absolute inset-4 rounded-full border-2 border-primary/50"
          initial={{ scale: 0.6, opacity: 0.9 }}
          animate={{ scale: 1.35, opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          aria-hidden
        />
      )}
      <span className="absolute inset-5 rounded-full bg-primary/10" aria-hidden />
      {children}
    </div>
  )
}


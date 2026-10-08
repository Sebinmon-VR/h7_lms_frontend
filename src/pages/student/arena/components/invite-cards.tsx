import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronRight, Swords, X } from 'lucide-react'
import * as React from 'react'

import type { ArenaInvite } from '@/api/arena.types'
import { ArenaButton } from '@/components/arena/arena-theme'
import { ArenaAvatar } from '@/components/arena/arena-ui'
import { arenaSound } from '@/lib/arena-sound'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/hooks'
import { parseServerTime } from './helpers'

/** A seconds-left ring: drains clockwise and turns red when time is short. */
function SecondsRing({ left, total }: { left: number; total: number }) {
  const r = 15
  const c = 2 * Math.PI * r
  const frac = Math.max(0, Math.min(1, total > 0 ? left / total : 0))
  const urgent = left <= 15
  return (
    <span className="relative flex size-9 shrink-0 items-center justify-center" role="timer" aria-label={`${left} seconds left to answer`}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" className="stroke-muted" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          className={urgent ? 'stroke-danger' : 'stroke-warning'}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <span className={cn('text-[11px] font-black tabular-nums', urgent ? 'text-danger' : 'text-foreground')}>{left}</span>
    </span>
  )
}

const BANNER =
  'pointer-events-auto mx-auto flex w-full max-w-md items-center gap-2.5 rounded-2xl border-2 bg-card/95 px-2.5 py-2 shadow-lg backdrop-blur sm:gap-3 sm:px-3'

/**
 * One floating banner for challenges: the oldest live one, with a "+2 more"
 * hint. Accepting or declining brings up the next.
 */
export function InviteBanner({
  invites,
  onAccept,
  onDecline,
  acceptingId,
  decliningId,
}: {
  invites: ArenaInvite[]
  onAccept: (invite: ArenaInvite) => void
  onDecline: (invite: ArenaInvite) => void
  acceptingId: number | null
  decliningId: number | null
}) {
  const now = useNow(1000).getTime()
  const reduced = useReducedMotion()
  const live = invites
    .map((invite) => {
      const expires = parseServerTime(invite.expires_at) ?? 0
      const created = parseServerTime(invite.created_at) ?? expires - 60_000
      return { invite, left: Math.ceil((expires - now) / 1000), total: Math.max(1, Math.round((expires - created) / 1000)) }
    })
    .filter((row) => row.left > 0)

  // A ping for challenges that arrive while the page is open.
  const seen = React.useRef<Set<number> | null>(null)
  const ids = live.map((r) => r.invite.id).join(',')
  React.useEffect(() => {
    const current = live.map((r) => r.invite.id)
    if (seen.current == null) {
      seen.current = new Set(current)
      return
    }
    const fresh = current.filter((id) => !seen.current!.has(id))
    fresh.forEach((id) => seen.current!.add(id))
    if (fresh.length > 0) arenaSound.invite()
    // `ids` stands in for the list.
  }, [ids])

  const top = live[0]

  return (
    <div aria-live="polite">
      <AnimatePresence mode="wait">
        {top && (
          <motion.div
            key={top.invite.id}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className={cn(BANNER, 'border-warning shadow-[0_10px_30px_-10px_hsl(var(--warning)/0.7)]')}
            role="alert"
          >
            <ArenaAvatar look={top.invite.from.look} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">
                <span className="font-black">{top.invite.from.full_name}</span> challenged you
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {top.invite.title ?? 'Quiz Battle'}
                {live.length > 1 && <span className="font-bold text-warning"> · +{live.length - 1} more</span>}
              </p>
            </div>
            <SecondsRing left={top.left} total={top.total} />
            <ArenaButton
              variant="gold"
              size="sm"
              loading={acceptingId === top.invite.id}
              disabled={acceptingId != null}
              onClick={() => onAccept(top.invite)}
            >
              {acceptingId !== top.invite.id && <Swords />}
              Accept
            </ArenaButton>
            <ArenaButton
              variant="ghost"
              size="icon"
              className="size-8"
              loading={decliningId === top.invite.id}
              onClick={() => onDecline(top.invite)}
              aria-label={`Decline ${top.invite.from.full_name}'s challenge`}
              title="Decline"
            >
              {decliningId !== top.invite.id && <X />}
            </ArenaButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** The "you're mid-battle" banner, same shape as a challenge. */
export function RejoinBanner({ onRejoin }: { onRejoin: () => void }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(BANNER, 'border-primary shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.7)]')}
    >
      <span className="relative ml-1 flex size-2.5 shrink-0" aria-hidden>
        <span className="absolute inset-0 rounded-full bg-primary motion-safe:animate-ping" />
        <span className="relative size-2.5 rounded-full bg-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-foreground">Battle in progress</p>
        <p className="truncate text-xs text-muted-foreground">Jump back in before the questions run out.</p>
      </div>
      <ArenaButton variant="primary" size="sm" onClick={onRejoin}>
        Rejoin
        <ChevronRight />
      </ArenaButton>
    </motion.div>
  )
}

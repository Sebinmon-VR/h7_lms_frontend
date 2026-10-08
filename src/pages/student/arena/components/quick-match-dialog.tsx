import { motion, useReducedMotion } from 'framer-motion'
import { Radar as RadarIcon } from 'lucide-react'
import * as React from 'react'

import type { ArenaLook, ArenaQueueJoin } from '@/api/arena.types'
import { ArenaButton, Art3D } from '@/components/arena/arena-theme'
import { gradient } from '@/components/arena/arena-ui'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useElapsedSeconds } from '@/lib/hooks'
import { useJoinQueue, useLeaveQueue, useQueueStatus } from '@/queries/arena.queries'
import { ARENA_DIALOG } from './helpers'
import { HeroArt } from '@/components/arena/arena-art'

const BOT_OFFER_AFTER_S = 20

/** Blips at fixed bearings, so the scan has something to find. */
const BLIPS = [
  { x: 22, y: 30, d: 0.3 },
  { x: 74, y: 22, d: 1.1 },
  { x: 80, y: 70, d: 1.7 },
  { x: 30, y: 76, d: 2.3 },
]

function Radar({ look }: { look?: Partial<ArenaLook> | null }) {
  const reduced = useReducedMotion()
  return (
    <div className="relative mx-auto size-48" aria-hidden>
      <div className="absolute inset-0 rounded-full border-2 border-primary/30 bg-[radial-gradient(circle,hsl(var(--primary)/0.14),transparent_70%)]" />
      <div className="absolute inset-[18%] rounded-full border border-primary/25" />
      <div className="absolute inset-[36%] rounded-full border border-primary/20" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-primary/15" />
      <div className="absolute inset-x-0 top-1/2 h-px bg-primary/15" />

      {!reduced && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: 'conic-gradient(from 0deg, hsl(var(--primary) / 0.45), transparent 28%)' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
        />
      )}
      {!reduced &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-[34%] rounded-full border-2 border-primary/50"
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 2.6, opacity: 0 }}
            transition={{ duration: 2.4, repeat: Infinity, delay: i * 1.2, ease: 'easeOut' }}
          />
        ))}
      {!reduced &&
        BLIPS.map((b, i) => (
          <motion.span
            key={i}
            className="absolute size-2 rounded-full bg-primary"
            style={{ left: `${b.x}%`, top: `${b.y}%` }}
            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.3, 0.5] }}
            transition={{ duration: 2.4, repeat: Infinity, delay: b.d }}
          />
        ))}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="flex size-20 items-center justify-center rounded-full p-1 shadow-lg" style={{ background: gradient(look?.frame?.colors) }}>
          <span className="flex size-full items-center justify-center rounded-full bg-card">
            <HeroArt variant="head" avatar={look?.avatar} className="size-14 text-4xl" />
          </span>
        </span>
      </div>
    </div>
  )
}

/**
 * Waiting for an opponent. Polls the queue; a queue entry that went stale
 * (the server forgets a waiter after a few quiet seconds) is quietly renewed.
 */
export function QuickMatchDialog({
  request,
  title,
  look,
  onClose,
  onMatched,
  onPlayBot,
  botLoading,
}: {
  request: ArenaQueueJoin | null
  title: string
  look?: Partial<ArenaLook> | null
  onClose: () => void
  onMatched: (matchId: number) => void
  onPlayBot: () => void
  botLoading: boolean
}) {
  const waiting = request != null
  const status = useQueueStatus(waiting)
  const join = useJoinQueue()
  const leave = useLeaveQueue()
  const elapsed = useElapsedSeconds(waiting)
  const lastRejoin = React.useRef(0)

  const state = status.data?.status
  const matchId = status.data?.match_id ?? null

  React.useEffect(() => {
    if (!waiting) return
    if (state === 'MATCHED' && matchId != null) {
      onMatched(matchId)
      return
    }
    if (state === 'IDLE' && !join.isPending && Date.now() - lastRejoin.current > 3000) {
      lastRejoin.current = Date.now()
      join.mutate(request, {
        onSuccess: (s) => {
          if (s.status === 'MATCHED' && s.match_id != null) onMatched(s.match_id)
        },
      })
    }
    // `join` is left out on purpose: its state changes would re-run this on every attempt.
  }, [waiting, state, matchId, request])

  const cancel = () => {
    leave.mutate()
    onClose()
  }

  const offerBot = elapsed >= BOT_OFFER_AFTER_S
  const botFrac = Math.min(1, elapsed / BOT_OFFER_AFTER_S)

  return (
    <Dialog open={waiting} onOpenChange={(open) => !open && cancel()}>
      <DialogContent size="sm" hideClose className={ARENA_DIALOG.content}>
        <DialogHeader>
          <DialogTitle className={ARENA_DIALOG.title}>
            <RadarIcon />
            Finding an opponent
          </DialogTitle>
          <DialogDescription>
            Quick match on <span className="font-semibold text-foreground">{title}</span>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-6 text-center">
          <Radar look={look} />
          <div>
            <p className="text-4xl font-black italic tabular-nums text-foreground" aria-live="off">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
              {offerBot ? 'Nobody yet. Keep waiting, or warm up against a bot.' : 'Usually takes a few seconds.'}
            </p>
          </div>
          {!offerBot && (
            <div className="mx-auto h-1.5 w-44 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${botFrac * 100}%` }} />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <ArenaButton variant="ghost" onClick={cancel}>
            Cancel
          </ArenaButton>
          {offerBot && (
            <ArenaButton variant="gold" loading={botLoading} onClick={onPlayBot}>
              {!botLoading && <Art3D name="robot" className="size-5" />}
              Play a bot instead
            </ArenaButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

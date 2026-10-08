import { History } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { ArenaOutcome, ArenaRecentMatch } from '@/api/arena.types'
import { ArenaEmpty } from '@/components/arena/arena-theme'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/datetime'
import { ARENA_DIALOG } from './helpers'

const OUTCOME: Record<ArenaOutcome, { letter: string; name: string; tile: string }> = {
  WIN: { letter: 'W', name: 'Win', tile: 'bg-success text-success-foreground' },
  DRAW: { letter: 'D', name: 'Draw', tile: 'bg-info text-info-foreground' },
  LOSS: { letter: 'L', name: 'Loss', tile: 'bg-danger text-danger-foreground' },
  FORFEIT: { letter: 'F', name: 'Left early', tile: 'bg-muted text-muted-foreground' },
}

function opponentsLine(m: ArenaRecentMatch) {
  if (m.opponents.length === 0) return null
  if (m.opponents.length <= 2) return `vs ${m.opponents.join(' & ')}`
  return `vs ${m.opponents[0]} +${m.opponents.length - 1}`
}

/** Battle history, behind the lobby's History button. */
export function HistoryDialog({
  recent,
  open,
  onOpenChange,
}: {
  recent: ArenaRecentMatch[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const wins = recent.filter((m) => m.outcome === 'WIN').length
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" className={ARENA_DIALOG.content}>
        <DialogHeader>
          <DialogTitle className={ARENA_DIALOG.title}>
            <History />
            Battle history
          </DialogTitle>
          <DialogDescription>
            {recent.length > 0 ? `${wins} win${wins === 1 ? '' : 's'} in your last ${recent.length}.` : 'Your results land here.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="px-3 py-3 sm:px-4">
          {recent.length === 0 ? (
            <ArenaEmpty art="crossed_swords" title="No battles yet" description="Warm up against a bot to get started." />
          ) : (
            <ul className="space-y-1">
              {recent.map((m) => {
                const o = OUTCOME[m.outcome]
                const vs = opponentsLine(m)
                return (
                  <li key={m.match_id}>
                    <Link
                      to={`/student/arena/battle/${m.match_id}`}
                      className="flex h-14 min-w-0 items-center gap-3 rounded-xl px-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className={cn('flex size-9 shrink-0 -skew-x-6 items-center justify-center rounded-lg text-sm font-black italic', o.tile)}>
                        <span aria-hidden>{o.letter}</span>
                        <span className="sr-only">{o.name}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-foreground">{m.title ?? 'Battle'}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {[vs, formatRelative(m.finished_at)].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="shrink-0 text-right leading-tight">
                        <span className="block text-sm font-black tabular-nums text-foreground">{m.score.toLocaleString()}</span>
                        <span className="block text-[10px] font-bold tabular-nums text-primary">+{m.xp} XP</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

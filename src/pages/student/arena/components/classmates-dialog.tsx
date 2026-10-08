import { Check, Search, Swords, Users } from 'lucide-react'
import * as React from 'react'

import type { ArenaClassmate } from '@/api/arena.types'
import { ArenaButton, ArenaEmpty, TierBadge } from '@/components/arena/arena-theme'
import { ArenaAvatar } from '@/components/arena/arena-ui'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/cn'
import { useClassmates } from '@/queries/arena.queries'
import { ARENA_DIALOG, ARENA_INPUT, ArenaSkeleton, errorMessage } from './helpers'

const MAX_PICKS = 7

/** Online first, then offline, then those already in a battle. */
export function classmateRank(c: ArenaClassmate) {
  if (c.in_battle) return 2
  return c.is_online ? 0 : 1
}

export function PresenceDot({ classmate, className }: { classmate: ArenaClassmate; className?: string }) {
  return (
    <span
      className={cn(
        'absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-card',
        classmate.in_battle ? 'bg-warning' : classmate.is_online ? 'bg-success' : 'bg-muted-foreground/50',
        className,
      )}
      aria-hidden
    />
  )
}

export function presenceLabel(c: ArenaClassmate) {
  return c.in_battle ? 'In a battle' : c.is_online ? 'Online' : 'Offline'
}

/** Pick classmates to challenge; the battle opens as soon as they accept. */
export function ClassmatesDialog({
  open,
  onOpenChange,
  battleTitle,
  sending,
  onSend,
  blockedReason,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  battleTitle: string
  sending: boolean
  onSend: (ids: number[]) => void
  /** Set when there is nothing to battle on yet. */
  blockedReason?: string | null
}) {
  const query = useClassmates(open)
  const [picked, setPicked] = React.useState<number[]>([])
  const [search, setSearch] = React.useState('')

  React.useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  const list = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    return [...(query.data ?? [])]
      .filter((c) => !term || c.full_name.toLowerCase().includes(term))
      .sort((a, b) => classmateRank(a) - classmateRank(b) || a.full_name.localeCompare(b.full_name))
  }, [query.data, search])

  const online = (query.data ?? []).filter((c) => c.is_online && !c.in_battle).length

  const toggle = (id: number) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_PICKS ? prev : [...prev, id]))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className={ARENA_DIALOG.content}>
        <DialogHeader>
          <DialogTitle className={ARENA_DIALOG.title}>
            <Users />
            Challenge friends
            {query.data && (
              <span className="ml-auto mr-6 inline-flex items-center gap-1 text-[11px] font-bold not-italic normal-case tracking-normal text-success">
                <span className="size-1.5 rounded-full bg-success" aria-hidden />
                {online} online
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {blockedReason ?? (
              <>
                Pick up to {MAX_PICKS} for <span className="font-semibold text-foreground">{battleTitle}</span>. It starts as soon as they accept.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-2.5 px-4 py-4 sm:px-6">
          {(query.data?.length ?? 0) > 6 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a classmate…"
                aria-label="Find a classmate"
                className={cn(ARENA_INPUT, 'w-full pl-9')}
              />
            </div>
          )}
          {query.isPending ? (
            <div className="space-y-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <ArenaSkeleton key={i} className="h-12" />
              ))}
            </div>
          ) : query.isError ? (
            <ArenaEmpty
              art="crossed_swords"
              title="Couldn't load your classmates"
              description={errorMessage(query.error)}
              action={
                <ArenaButton size="sm" onClick={() => query.refetch()}>
                  Try again
                </ArenaButton>
              }
            />
          ) : list.length === 0 ? (
            <ArenaEmpty
              art="crossed_swords"
              title={search ? 'Nobody by that name' : 'No classmates to challenge yet'}
              description={search ? undefined : 'Try a quick match or a private room instead.'}
            />
          ) : (
            <ul className="max-h-[50dvh] space-y-1 overflow-y-auto pr-1" aria-label="Classmates">
              {list.map((c) => {
                const on = picked.includes(c.student_id)
                const full = !on && picked.length >= MAX_PICKS
                return (
                  <li key={c.student_id}>
                    <button
                      type="button"
                      onClick={() => toggle(c.student_id)}
                      disabled={full || c.in_battle}
                      aria-pressed={on}
                      className={cn(
                        'flex h-12 w-full items-center gap-2.5 rounded-xl border-2 px-2.5 text-left transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45',
                        on ? 'border-primary bg-primary/10' : 'border-transparent bg-muted/40 hover:border-border',
                      )}
                    >
                      <span className="relative">
                        <ArenaAvatar look={c.look} size="xs" />
                        <PresenceDot classmate={c} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-bold text-foreground">{c.full_name}</span>
                          <TierBadge level={c.level} size="xs" />
                        </span>
                        <span
                          className={cn(
                            'block truncate text-[11px] font-medium',
                            c.in_battle ? 'text-warning' : c.is_online ? 'text-success' : 'text-muted-foreground',
                          )}
                        >
                          {presenceLabel(c)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                          on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                        )}
                        aria-hidden
                      >
                        {on && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <ArenaButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </ArenaButton>
          <ArenaButton variant="gold" disabled={picked.length === 0 || !!blockedReason} loading={sending} onClick={() => onSend(picked)}>
            {!sending && <Swords />}
            {picked.length > 1 ? `Challenge ${picked.length}` : 'Send challenge'}
          </ArenaButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { Volume2, VolumeX } from 'lucide-react'
import * as React from 'react'

import type { ArenaBotLevel } from '@/api/arena.types'
import { ApiError } from '@/api/errors'
import { ArenaButton, artForEmoji, type ArtName } from '@/components/arena/arena-theme'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useArenaMuted } from '@/lib/arena-sound'
import { cn } from '@/lib/cn'

/** Server times are naive UTC ("2026-10-08T09:30:00.123"); a zone is honoured if present. */
export function parseServerTime(value: string | null | undefined): number | null {
  if (!value) return null
  const zoned = /([zZ]|[+-]\d\d:?\d\d)$/.test(value)
  const t = Date.parse(zoned ? value : `${value}Z`)
  return Number.isNaN(t) ? null : t
}

/**
 * The server's clock, ticking locally. `receivedAt` is when the view carrying
 * `serverNow` arrived, so a cached view never skews the offset.
 */
export function useServerClock(serverNow: string | null | undefined, receivedAt: number, active: boolean, ms = 100) {
  const offset = React.useMemo(() => {
    const server = parseServerTime(serverNow)
    return server == null || !receivedAt ? 0 : server - receivedAt
  }, [serverNow, receivedAt])
  // The state only drives re-renders; the reading is always fresh.
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setTick((n) => n + 1), ms)
    return () => window.clearInterval(id)
  }, [active, ms])
  return Date.now() + offset
}

/** The match a 409 "you are already in a battle" points at. */
export function busyMatchId(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const detail = error.detail as { match_id?: unknown } | null
  return detail && typeof detail === 'object' && typeof detail.match_id === 'number' ? detail.match_id : null
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'That did not work. Please try again.'
}

/**
 * One accent per answer slot, from the theme. The letter badge carries the
 * identity, so colour is never the only cue.
 */
export const OPTION_ACCENTS = [
  { bar: 'bg-info', badge: 'bg-info/15 text-info' },
  { bar: 'bg-accent', badge: 'bg-accent/15 text-accent' },
  { bar: 'bg-warning', badge: 'bg-warning/20 text-warning' },
  { bar: 'bg-success', badge: 'bg-success/15 text-success' },
  { bar: 'bg-primary', badge: 'bg-primary/15 text-primary' },
  { bar: 'bg-danger', badge: 'bg-danger/15 text-danger' },
] as const

export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

/** The 3D render for a bot: its own avatar when there is one, else by level. */
const BOT_ART: Record<ArenaBotLevel, ArtName> = { EASY: 'chick', MEDIUM: 'robot', HARD: 'mech_arm' }
export function botArt(level: ArenaBotLevel | null | undefined, emoji?: string | null): ArtName {
  return artForEmoji(emoji) ?? BOT_ART[level ?? 'MEDIUM']
}

export function medalArt(rank: number | null | undefined): ArtName | null {
  if (rank === 1) return 'medal_1'
  if (rank === 2) return 'medal_2'
  if (rank === 3) return 'medal_3'
  return null
}

// ------------------------------------------------------------------ dialogs

/** Class names that dress the app's Dialog for the games surface (theme tokens only). */
export const ARENA_DIALOG = {
  content: 'rounded-2xl border-border bg-card text-foreground',
  title:
    'flex items-center gap-2 text-base font-black uppercase italic tracking-tight text-foreground [&_svg]:size-4 [&_svg]:text-primary',
}

/** A confirm dialog dressed for the arena. */
export function ArenaConfirm({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  loading,
  onConfirm,
  icon,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  onConfirm: () => void
  icon?: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" className={ARENA_DIALOG.content}>
        <DialogHeader>
          <DialogTitle className={cn(ARENA_DIALOG.title, destructive && '[&_svg]:text-danger')}>
            {icon}
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <ArenaButton variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </ArenaButton>
          <ArenaButton variant={destructive ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </ArenaButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MuteToggle({ className }: { className?: string }) {
  const [muted, setMuted] = useArenaMuted()
  return (
    <ArenaButton
      variant="ghost"
      size="icon"
      className={className}
      onClick={() => setMuted(!muted)}
      aria-pressed={muted}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      title={muted ? 'Sound off' : 'Sound on'}
    >
      {muted ? <VolumeX /> : <Volume2 />}
    </ArenaButton>
  )
}

/** A shimmer block for loading states. */
export function ArenaSkeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-muted', className)} aria-hidden />
}

/** "1st", "2nd", "3rd", "4th"… */
export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

/** Colour of a rank number: gold first, then plain. */
export function rankTone(rank: number | null | undefined) {
  if (rank === 1) return 'text-warning'
  if (rank === 2 || rank === 3) return 'text-foreground'
  return 'text-muted-foreground'
}

/** The inline text field used for room codes and searches. */
export const ARENA_INPUT =
  'h-10 min-w-0 rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/datetime'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Online now, or offline with when the server last heard from them. */
export type PresenceState = { online: boolean; lastSeenAt?: string | null }

export function presenceLabel(presence: PresenceState): string {
  if (presence.online) return 'Online now'
  if (presence.lastSeenAt) return `Offline · last seen ${formatRelative(presence.lastSeenAt)}`
  return 'Offline · not signed in since tracking began'
}

/**
 * The dot on an avatar: green when the server heard from the person in the
 * last three minutes, red otherwise. Sits on a `relative` wrapper.
 */
export function PresenceDot({ presence, className }: { presence: PresenceState; className?: string }) {
  const label = presenceLabel(presence)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          className={cn(
            'absolute -bottom-0.5 -right-0.5 block size-2.5 rounded-full ring-2 ring-card',
            presence.online ? 'bg-success' : 'bg-danger',
            className,
          )}
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function UserCell({
  name,
  email,
  inactive,
  presence,
  size = 'sm',
  className,
}: {
  name: string
  email?: string | null
  inactive?: boolean
  /** When given, the avatar carries the online/offline dot. */
  presence?: PresenceState | null
  size?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <span className="relative inline-flex shrink-0">
        <Avatar name={name} size={size} className={inactive ? 'opacity-50 grayscale' : undefined} />
        {presence && <PresenceDot presence={presence} />}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn('truncate text-sm font-medium', inactive && 'text-muted-foreground')}>{name}</span>
          {inactive && (
            <Badge tone="neutral" size="sm">
              Inactive
            </Badge>
          )}
        </div>
        {email && <span className="block truncate text-xs text-muted-foreground">{email}</span>}
      </div>
    </div>
  )
}

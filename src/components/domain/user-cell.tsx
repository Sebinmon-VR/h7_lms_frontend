import { cn } from '@/lib/cn'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

export function UserCell({
  name,
  email,
  inactive,
  size = 'sm',
  className,
}: {
  name: string
  email?: string | null
  inactive?: boolean
  size?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <Avatar name={name} size={size} className={inactive ? 'opacity-50 grayscale' : undefined} />
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

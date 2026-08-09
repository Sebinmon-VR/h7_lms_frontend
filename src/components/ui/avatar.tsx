import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'

import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'

const SIZES = {
  xs: 'size-6 text-2xs',
  sm: 'size-8 text-xs',
  md: 'size-9 text-sm',
  lg: 'size-12 text-base',
  xl: 'size-16 text-xl',
} as const

/**
 * Deterministic gradient per person so avatars stay stable across renders
 * and are distinguishable at a glance in dense tables.
 */
const GRADIENTS = [
  'from-indigo-500 to-violet-500',
  'from-violet-500 to-fuchsia-500',
  'from-sky-500 to-indigo-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-cyan-500 to-blue-500',
  'from-lime-500 to-emerald-500',
]

function gradientFor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return GRADIENTS[hash % GRADIENTS.length]
}

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: string | null | undefined
  src?: string | null
  size?: keyof typeof SIZES
}

export function Avatar({ name, src, size = 'md', className, ...props }: AvatarProps) {
  const label = name ?? 'Unknown'
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative inline-flex shrink-0 select-none overflow-hidden rounded-full',
        SIZES[size],
        className,
      )}
      {...props}
    >
      {src && <AvatarPrimitive.Image src={src} alt={label} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback
        delayMs={src ? 400 : 0}
        className={cn(
          'flex size-full items-center justify-center bg-gradient-to-br font-semibold text-white',
          gradientFor(label),
        )}
      >
        {initials(label)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}

/** Overlapping avatar row with a "+N" overflow chip. */
export function AvatarStack({
  names,
  max = 4,
  size = 'sm',
}: {
  names: string[]
  max?: number
  size?: keyof typeof SIZES
}) {
  const shown = names.slice(0, max)
  const extra = names.length - shown.length
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} size={size} className="ring-2 ring-card" />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-muted font-medium text-muted-foreground ring-2 ring-card',
            SIZES[size],
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}

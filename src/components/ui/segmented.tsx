import { motion } from 'framer-motion'
import * as React from 'react'

import { cn } from '@/lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: React.ReactNode
  icon?: React.ReactNode
  /** Overrides the sliding pill colour, e.g. attendance statuses. */
  activeClassName?: string
}

export interface SegmentedProps<T extends string> {
  value: T | null
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  size?: 'sm' | 'md'
  className?: string
  /** Unique per instance — required so the sliding pill doesn't jump between groups. */
  layoutId: string
  'aria-label'?: string
}

/**
 * Radio-group semantics with a sliding indicator. Used for view toggles and,
 * most importantly, per-student attendance marking.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  layoutId,
  'aria-label': ariaLabel,
}: SegmentedProps<T>) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
              pad,
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              '[&_svg]:size-3.5',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                className={cn('absolute inset-0 rounded-md shadow-sm', opt.activeClassName ?? 'bg-card')}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {opt.icon}
              {opt.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

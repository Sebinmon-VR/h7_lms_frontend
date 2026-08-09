import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/cn'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted/60 text-muted-foreground',
        primary: 'border-primary/25 bg-primary/12 text-primary',
        accent: 'border-accent/25 bg-accent/12 text-accent',
        success: 'border-success/25 bg-success/12 text-success',
        warning: 'border-warning/30 bg-warning/15 text-warning',
        danger: 'border-danger/25 bg-danger/12 text-danger',
        info: 'border-info/25 bg-info/12 text-info',
        outline: 'border-border bg-transparent text-foreground',
      },
      size: {
        sm: 'px-2 py-0.5 text-2xs',
        md: 'px-2.5 py-0.5 text-xs',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Small leading dot in the badge's own colour. */
  dot?: boolean
}

export function Badge({ className, tone, size, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

export { badgeVariants }

import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/cn'
import { useCountUp } from '@/lib/hooks'
import { formatNumber } from '@/lib/format'
import { Card } from '@/components/ui/card'

const TONE_STYLE = {
  primary: 'text-primary bg-primary/12',
  accent: 'text-accent bg-accent/12',
  success: 'text-success bg-success/12',
  warning: 'text-warning bg-warning/15',
  danger: 'text-danger bg-danger/12',
  info: 'text-info bg-info/12',
} as const

export interface StatCardProps {
  label: string
  value: number
  icon: LucideIcon
  tone?: keyof typeof TONE_STYLE
  hint?: string
  /** Suppresses the count-up animation, e.g. for percentages already shown. */
  suffix?: string
  index?: number
  onClick?: () => void
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'primary',
  hint,
  suffix,
  index = 0,
  onClick,
}: StatCardProps) {
  const animated = useCountUp(value)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card
        interactive={!!onClick}
        onClick={onClick}
        className="relative overflow-hidden p-5"
      >
        {/* Soft brand wash in the corner, one per card. */}
        <div
          className="pointer-events-none absolute -right-6 -top-10 size-24 rounded-full opacity-40 blur-2xl"
          style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.5), transparent 70%)' }}
          aria-hidden
        />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
              {formatNumber(Math.round(animated))}
              {suffix && <span className="ml-0.5 text-lg text-muted-foreground">{suffix}</span>}
            </p>
            {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
          </div>
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', TONE_STYLE[tone])}>
            <Icon className="size-5" />
          </span>
        </div>
      </Card>
    </motion.div>
  )
}

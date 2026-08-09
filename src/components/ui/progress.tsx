import { cn } from '@/lib/cn'

const TONE_BG: Record<string, string> = {
  primary: 'bg-gradient-to-r from-primary to-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  muted: 'bg-muted-foreground/40',
}

export interface ProgressBarProps {
  /** 0–100. */
  value: number
  tone?: keyof typeof TONE_BG
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
}

export function ProgressBar({ value, tone = 'primary', size = 'md', className, label }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  const height = size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2'
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full bg-muted', height, className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-700 ease-spring', TONE_BG[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export interface ProgressRingProps {
  /** 0–100. */
  value: number
  size?: number
  strokeWidth?: number
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'muted'
  className?: string
  children?: React.ReactNode
  label?: string
}

const TONE_STROKE: Record<NonNullable<ProgressRingProps['tone']>, string> = {
  primary: 'hsl(var(--primary))',
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  danger: 'hsl(var(--danger))',
  info: 'hsl(var(--info))',
  muted: 'hsl(var(--muted-foreground) / 0.4)',
}

export function ProgressRing({
  value,
  size = 120,
  strokeWidth = 10,
  tone = 'primary',
  className,
  children,
  label,
}: ProgressRingProps) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${Math.round(pct)}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={TONE_STROKE[tone]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

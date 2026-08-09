import { cn } from '@/lib/cn'

export function Logo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent font-bold text-white shadow-sm',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      H7
    </span>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <Logo />
      <span className="flex flex-col leading-none">
        <span className="text-sm font-semibold tracking-tight">H7 LMS</span>
        <span className="text-2xs text-muted-foreground">Learning Platform</span>
      </span>
    </span>
  )
}

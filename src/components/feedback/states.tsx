import { AlertTriangle, Inbox, Lock, RefreshCw, SearchX, ServerCrash, WifiOff } from 'lucide-react'
import * as React from 'react'

import { ApiError, errorDescription, errorTitle } from '@/api/errors'
import { cn } from '@/lib/cn'
import { IS_DEV } from '@/lib/env'
import { Button } from '@/components/ui/button'

/** Nothing exists yet — always paired with a way to create the first one. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-14 text-center',
        className,
      )}
    >
      <div className="relative mb-4">
        <div className="absolute inset-0 -z-10 rounded-full bg-primary/20 blur-2xl" aria-hidden />
        <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-card text-primary [&_svg]:size-6">
          {icon ?? <Inbox />}
        </div>
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Rows exist, but the current filters match none of them. Distinct on purpose. */
export function NoResults({ onClear, className }: { onClear?: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <SearchX className="size-8 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-semibold">No matching records</h3>
      <p className="mt-1 text-sm text-muted-foreground">Try a different search term or clear the filters.</p>
      {onClear && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  )
}

export function ErrorState({
  error,
  onRetry,
  className,
  compact,
}: {
  error: unknown
  onRetry?: () => void
  className?: string
  compact?: boolean
}) {
  const apiError = error instanceof ApiError ? error : new ApiError({ message: String(error), status: null })

  const Icon = apiError.isNetwork ? WifiOff : apiError.isForbiddenRole ? Lock : apiError.isServer ? ServerCrash : AlertTriangle
  const tone = apiError.isForbiddenRole ? 'text-warning' : 'text-danger'

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 text-center',
        compact ? 'py-8' : 'py-14',
        className,
      )}
    >
      <div className={cn('flex size-12 items-center justify-center rounded-2xl bg-muted [&_svg]:size-6', tone)}>
        <Icon />
      </div>
      <h3 className="mt-4 text-base font-semibold">{errorTitle(apiError)}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{errorDescription(apiError)}</p>

      {IS_DEV && apiError.detail != null && !apiError.isNetwork && (
        <pre className="mt-4 max-w-full overflow-x-auto rounded-md bg-muted px-3 py-2 text-left text-2xs text-muted-foreground">
          {typeof apiError.detail === 'string' ? apiError.detail : JSON.stringify(apiError.detail, null, 2)}
        </pre>
      )}

      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" icon={<RefreshCw />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

/**
 * Admin accounts can call teacher/student endpoints, but those are scoped to
 * the caller's own id, so an admin always gets `[]`. Saying "no data yet"
 * there would be a lie.
 */
export function AdminScopeNotice({ area }: { area: 'teacher' | 'student' }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/8 p-4 text-sm">
      <Lock className="mt-0.5 size-4 shrink-0 text-info" />
      <div>
        <p className="font-medium text-foreground">You are signed in as an administrator</p>
        <p className="mt-0.5 text-muted-foreground">
          {area === 'teacher'
            ? 'Teacher pages only show records belonging to the signed-in teacher, and an administrator has no teaching assignments of their own. Use Admin → Assignments to see who teaches what.'
            : 'Student pages only show records for the signed-in student, and an administrator has no enrollment. Use Admin → Enrollments to review student data.'}
        </p>
      </div>
    </div>
  )
}

/** A student with no enrollment — different from "no records yet". */
export function NotEnrolledState() {
  return (
    <EmptyState
      icon={<Inbox />}
      title="You are not enrolled in a class yet"
      description="Once an administrator enrolls you, your classes, attendance, materials and grades will appear here."
    />
  )
}

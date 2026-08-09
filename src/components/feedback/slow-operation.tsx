import { Hourglass } from 'lucide-react'

import { useElapsedSeconds } from '@/lib/hooks'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * `GET /admin/reports/monitoring` is served from a server-side cache and is
 * usually instant, so the elapsed-time notice stays hidden below 3 seconds.
 * Past that the cache has expired and the report is being recomputed, which
 * is normal rather than a fault — this says so instead of leaving a bare
 * spinner to imply breakage.
 */
export function SlowOperation({ label }: { label: string }) {
  const seconds = useElapsedSeconds(true)

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-8 w-16" />
          </div>
        ))}
      </div>

      {seconds >= 3 && (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <Hourglass className="size-4 animate-pulse text-primary" />
          <span className="text-muted-foreground">
            {label} — recomputing on the server, {seconds}s elapsed
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  )
}

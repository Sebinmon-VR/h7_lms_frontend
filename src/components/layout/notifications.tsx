import {
  Bell,
  CheckCircle2,
  CircleDashed,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'
import * as React from 'react'

import type { JobOut, JobStatus } from '@/api/types'
import { isJobSettled, useRecentJobs, useRefreshMonitoring } from '@/queries/admin.queries'
import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/datetime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Job names the API emits, mapped to something a person would recognise. */
const JOB_LABEL: Record<string, string> = {
  monitoring_report: 'Monitoring report',
}

function jobLabel(job: JobOut): string {
  return JOB_LABEL[job.name] ?? job.name.replace(/_/g, ' ')
}

const STATUS_META: Record<
  JobStatus,
  { icon: typeof Bell; tone: 'neutral' | 'info' | 'success' | 'danger'; label: string; spin?: boolean }
> = {
  QUEUED: { icon: CircleDashed, tone: 'neutral', label: 'Queued' },
  RUNNING: { icon: Loader2, tone: 'info', label: 'Running', spin: true },
  SUCCEEDED: { icon: CheckCircle2, tone: 'success', label: 'Done' },
  FAILED: { icon: TriangleAlert, tone: 'danger', label: 'Failed' },
}

function JobRow({ job }: { job: JobOut }) {
  const meta = STATUS_META[job.status]
  const Icon = meta.icon
  const active = !isJobSettled(job.status)

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium capitalize">{jobLabel(job)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {/* A finished job is described by when it ended, a live one by
                what it is doing right now. */}
            {active
              ? (job.message ?? meta.label)
              : `${meta.label} ${formatRelative(job.finished_at ?? job.created_at)}`}
          </p>
        </div>
        <Badge tone={meta.tone} size="sm" className="shrink-0">
          <Icon className={cn(meta.spin && 'animate-spin')} />
          {meta.label}
        </Badge>
      </div>

      {active && <ProgressBar value={job.percent} size="sm" className="mt-2.5" />}

      {job.status === 'FAILED' && job.error && (
        <p className="mt-2 rounded-md border border-danger/30 bg-danger/8 px-2 py-1.5 text-xs text-danger">
          {job.error}
        </p>
      )}

      {job.status === 'SUCCEEDED' && job.duration_seconds != null && (
        <p className="mt-1.5 text-2xs text-muted-foreground">
          Took {job.duration_seconds}s
        </p>
      )}
    </li>
  )
}

/**
 * Background-job notifications, for admins only.
 *
 * The list polls only while something is in flight (see `useRecentJobs`), so an
 * idle admin generates no traffic. The badge counts *running* jobs rather than
 * unread ones — there is no read state on the server, and inventing one in
 * localStorage would lie the moment you opened a second tab.
 */
export function NotificationsMenu() {
  const [open, setOpen] = React.useState(false)
  const jobsQuery = useRecentJobs()
  const refreshMonitoring = useRefreshMonitoring()

  const jobs = jobsQuery.data ?? []
  const activeCount = jobs.filter((job) => !isJobSettled(job.status)).length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Background jobs" className="relative">
              <Bell />
              {activeCount > 0 && (
                <span
                  className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
                  aria-hidden
                >
                  {activeCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {activeCount > 0 ? `${activeCount} job${activeCount === 1 ? '' : 's'} running` : 'Background jobs'}
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Background jobs</p>
            <p className="text-xs text-muted-foreground">Long-running work, with progress.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw />}
            loading={refreshMonitoring.isPending}
            onClick={() => refreshMonitoring.mutate()}
          >
            Rebuild report
          </Button>
        </div>

        <ScrollArea className="max-h-96">
          <div className="p-3">
            {jobsQuery.isPending ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : jobs.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground">No jobs yet.</p>
                <p className="mt-1 text-xs text-muted-foreground/80">
                  Rebuilding the monitoring report runs in the background and shows up here.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {jobs.map((job) => (
                  <JobRow key={job.job_id} job={job} />
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>

        {/* Job state is per-process and in-memory on the server. Saying so
            beats a user wondering why their job vanished after a restart. */}
        <p className="border-t border-border px-4 py-2.5 text-2xs text-muted-foreground">
          Jobs are tracked in the server&rsquo;s memory and are cleared when it restarts.
        </p>
      </PopoverContent>
    </Popover>
  )
}

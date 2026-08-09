import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  Eye,
  MailX,
  Play,
  XCircle,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { ReminderStatus, ReminderSweepSummary } from '@/api/types'
import {
  useReminderLog,
  useReminderPreview,
  useReminderStatus,
  useRunReminders,
} from '@/queries/admin.queries'
import { cn } from '@/lib/cn'
import { formatDateTime, formatRelative } from '@/lib/datetime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * Class reminder diagnostics.
 *
 * The failure mode of a reminder system is spam, not silence, so this page
 * leads with what would be sent rather than with a switch. The dry-run preview
 * claims nothing and delivers nothing, which is what makes it the safe thing to
 * press after editing a timetable.
 */

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: React.ReactNode
  tone?: 'default' | 'success' | 'warning' | 'danger'
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <p
        className={cn(
          'text-lg font-semibold tabular-nums',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
          tone === 'danger' && 'text-danger',
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function SweepSummary({ summary }: { summary: ReminderSweepSummary }) {
  return (
    <div>
      <p className="text-sm">{summary.detail}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Periods due" value={summary.due_periods} />
        <Stat label="Recipients" value={summary.recipients} />
        <Stat
          label={summary.dry_run ? 'Would send' : 'Sent'}
          value={summary.sent}
          tone={summary.sent > 0 ? 'success' : 'default'}
        />
        <Stat
          label="Already handled"
          value={summary.skipped_already_sent}
          tone={summary.skipped_already_sent > 0 ? 'warning' : 'default'}
        />
      </div>

      {summary.failed > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          {summary.failed} reminder{summary.failed === 1 ? '' : 's'} could not be delivered. Check
          the SMTP settings under{' '}
          <Link to="/admin/integrations" className="font-medium underline">
            Integrations
          </Link>
          .
        </p>
      )}

      {summary.details.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {summary.details.map((d) => (
            <div
              key={`${d.timetable_entry_id}-${d.minutes_before}-${d.starts_at}`}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
            >
              <Badge tone="accent" size="sm">
                {d.subject}
              </Badge>
              <Badge tone="outline" size="sm">
                {d.class}
              </Badge>
              <span className="text-muted-foreground">{formatDateTime(d.starts_at)}</span>
              <span className="ml-auto text-muted-foreground">
                {d.sent}/{d.recipients} · {d.minutes_before} min before
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusPanel({ status }: { status: ReminderStatus }) {
  const healthy = status.enabled && status.running && status.mail_configured

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg border',
              healthy
                ? 'border-success/40 bg-success/10 text-success'
                : 'border-warning/40 bg-warning/10 text-warning',
            )}
          >
            <BellRing className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Class reminders</p>
            <p className="text-xs text-muted-foreground">
              {status.enabled
                ? status.running
                  ? 'The scheduler is running.'
                  : 'Enabled, but the scheduler is not running.'
                : 'Disabled — ENABLE_CLASS_REMINDERS is off, so nothing is sent.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge tone={status.enabled ? 'success' : 'neutral'} dot>
            {status.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
          <Badge tone={status.running ? 'success' : 'warning'} dot>
            {status.running ? 'Running' : 'Stopped'}
          </Badge>
          <Badge tone={status.mail_configured ? 'success' : 'danger'} dot>
            {status.mail_configured ? 'Mail ready' : 'No mail'}
          </Badge>
        </div>
      </div>

      {/*
        Called out on its own because it is the first thing to check when
        reminders arrive at the wrong hour: this is the server's idea of school
        local time, and a wrong SCHOOL_TIMEZONE shows up here immediately.
      */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">School local time</p>
          <p className="font-medium tabular-nums">{formatDateTime(status.server_time_local)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Timezone</p>
          <p className="font-medium">{status.timezone}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Sends before</p>
          <p className="font-medium">
            {status.offsets_minutes.length > 0
              ? status.offsets_minutes.map((m) => `${m} min`).join(', ')
              : 'No offsets configured'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Teachers</p>
          <p className="font-medium">{status.remind_teachers ? 'Also reminded' : 'Not reminded'}</p>
        </div>
      </div>

      {!status.mail_configured && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
          <MailX className="mt-0.5 size-4 shrink-0" />
          SMTP is not configured, so no reminder can be delivered however the schedule looks. Fix
          it under{' '}
          <Link to="/admin/integrations" className="font-medium underline">
            Integrations
          </Link>
          .
        </p>
      )}

      {status.last_error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Last sweep errored: {status.last_error}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Sweeps run" value={status.run_count} />
        <Stat
          label="Last run"
          value={status.last_run_at ? formatRelative(status.last_run_at) : 'Never'}
        />
        <Stat label="Scans every" value={`${status.scan_interval_seconds}s`} />
        {/*
          Anything overdue by more than this is dropped rather than sent late —
          the reason a server that was down all morning comes back quiet instead
          of emailing everyone about finished classes.
        */}
        <Stat label="Drops if late by" value={`${status.max_lateness_minutes}m`} />
      </div>
    </Card>
  )
}

const LOG_TONE: Record<string, 'success' | 'danger' | 'warning'> = {
  SENT: 'success',
  FAILED: 'danger',
  SENDING: 'warning',
}

export default function AdminRemindersPage() {
  const statusQuery = useReminderStatus()
  const previewQuery = useReminderPreview()
  const logQuery = useReminderLog(50)
  const runSweep = useRunReminders()

  return (
    <>
      <PageHeader
        title="Reminders"
        description="Emails sent before a period starts, and whether they are actually going out."
        actions={
          <>
            <Button
              variant="outline"
              icon={<Eye />}
              loading={previewQuery.isFetching}
              onClick={() => previewQuery.refetch()}
            >
              Preview
            </Button>
            <Button
              variant="primary"
              icon={<Play />}
              loading={runSweep.isPending}
              onClick={() => runSweep.mutate()}
            >
              Run now
            </Button>
          </>
        }
      />

      <QueryBoundary query={statusQuery} loading={<Skeleton className="h-72 rounded-xl" />}>
        {(status) => <StatusPanel status={status} />}
      </QueryBoundary>

      <Tabs defaultValue="preview" className="mt-5">
        <TabsList>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="last">Last sweep</TabsTrigger>
          <TabsTrigger value="log">Sent log</TabsTrigger>
        </TabsList>

        <TabsContent value="preview">
          <Card className="p-5">
            {previewQuery.isFetching ? (
              <Skeleton className="h-32 rounded-lg" />
            ) : previewQuery.isError ? (
              <p className="text-sm text-danger">
                {(previewQuery.error as { message?: string })?.message ??
                  'Could not build the preview.'}
              </p>
            ) : previewQuery.data ? (
              <SweepSummary summary={previewQuery.data} />
            ) : (
              <EmptyState
                icon={<Eye />}
                title="Nothing previewed yet"
                description="A preview reports exactly what the next sweep would send without claiming or emailing anything, so it is safe to run as often as you like — the thing to press after changing a timetable."
                action={
                  <Button variant="primary" icon={<Eye />} onClick={() => previewQuery.refetch()}>
                    Preview the next sweep
                  </Button>
                }
              />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="last">
          <Card className="p-5">
            {statusQuery.data?.last_result ? (
              <SweepSummary summary={statusQuery.data.last_result} />
            ) : (
              <EmptyState
                icon={<Clock />}
                title="No sweep has run yet"
                description="The scheduler reports its result here after its first pass, or immediately after you use “Run now”."
              />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="log">
          <QueryBoundary
            query={logQuery}
            loading={
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            }
            isEmpty={(data) => data.length === 0}
            empty={
              <EmptyState
                icon={<BellRing />}
                title="Nothing sent yet"
                description="Once reminders go out they are recorded here, which answers “did this student actually get told?” without reading server logs."
              />
            }
          >
            {(entries) => (
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div
                    key={`${entry.timetable_entry_id}-${entry.user_id}-${entry.on_date}-${entry.minutes_before}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm"
                  >
                    {entry.status === 'SENT' ? (
                      <CheckCircle2 className="size-4 shrink-0 text-success" />
                    ) : entry.status === 'FAILED' ? (
                      <XCircle className="size-4 shrink-0 text-danger" />
                    ) : (
                      <Clock className="size-4 shrink-0 text-warning" />
                    )}
                    <span className="min-w-0 truncate font-medium">{entry.email}</span>
                    <Badge tone={LOG_TONE[entry.status] ?? 'neutral'} size="sm">
                      {entry.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {entry.minutes_before} min before {formatDateTime(entry.starts_at)}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatRelative(entry.claimed_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </QueryBoundary>
        </TabsContent>
      </Tabs>
    </>
  )
}

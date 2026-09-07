import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Disc,
  ExternalLink,
  Eye,
  FolderOpen,
  Hourglass,
  Play,
  Video,
  XCircle,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { RecordingSchedulerStatus, RecordingSweepSummary } from '@/api/types'
import {
  useRecordingLog,
  useRecordingPreview,
  useRecordingStatus,
  useRunRecordings,
} from '@/queries/admin.queries'
import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/datetime'
import { recordingLabel } from '@/lib/recordings'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * Class recording diagnostics.
 *
 * The question this page exists to answer is "a class finished — where is the
 * video?", so it leads with what the sweep decided about each session rather
 * than with a switch. The dry-run preview claims nothing and moves nothing,
 * which makes it the safe thing to press while someone is asking.
 *
 * Recording rides on its own Meet API and its own delegation scopes, so
 * `meet_problems` is surfaced prominently: Meet links can work perfectly while
 * not a single class can be recorded.
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

const DETAIL_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  STORED: 'success',
  WOULD_STORE: 'success',
  WAITING: 'warning',
  ARM_FAILED: 'warning',
  UNAVAILABLE: 'neutral',
  FAILED: 'danger',
}

function SweepSummary({ summary }: { summary: RecordingSweepSummary }) {
  return (
    <div>
      <p className="text-sm">{summary.detail}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Finished sessions" value={summary.due_meetings} />
        <Stat
          label={summary.dry_run ? 'Would file' : 'Filed'}
          value={summary.stored}
          tone={summary.stored > 0 ? 'success' : 'default'}
        />
        <Stat
          label="Still processing"
          value={summary.waiting}
          tone={summary.waiting > 0 ? 'warning' : 'default'}
        />
        {/* Not a fault: a class nobody joined never produces a video. */}
        <Stat label="Never recorded" value={summary.unavailable} />
        <Stat
          label="Failed"
          value={summary.failed}
          tone={summary.failed > 0 ? 'danger' : 'default'}
        />
      </div>

      {summary.details.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {summary.details.map((d) => (
            <div
              key={`${d.meeting_id}-${d.status}`}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
            >
              <Badge tone={DETAIL_TONE[String(d.status)] ?? 'neutral'} size="sm">
                {d.status === 'WOULD_STORE' ? 'Ready to file' : recordingLabel(d.status)}
              </Badge>
              <span className="min-w-0 truncate font-medium">{d.title}</span>
              <span className="min-w-0 flex-1 text-muted-foreground">{d.detail}</span>
              {d.recording_url && (
                <a
                  href={d.recording_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  Open
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusPanel({ status }: { status: RecordingSchedulerStatus }) {
  const problems = status.meet_problems ?? []
  const healthy =
    status.enabled && status.running && status.drive_configured && problems.length === 0

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
            <Disc className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Class recording</p>
            <p className="text-xs text-muted-foreground">
              {status.enabled
                ? status.running
                  ? 'Sessions are armed to record themselves, and finished videos are being collected.'
                  : 'Enabled, but the collection sweep is not running.'
                : 'Disabled — ENABLE_MEET_AUTO_RECORDING is off, so no class is armed to record.'}
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
          <Badge tone={status.drive_configured ? 'success' : 'danger'} dot>
            {status.drive_configured ? 'Drive ready' : 'No Drive'}
          </Badge>
        </div>
      </div>

      {/*
        Where the videos land and who can see them. `share_with_students` is the
        difference between a recording the class can watch and one only the
        staff can, and it is not visible anywhere else in the UI.
      */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Filed into</p>
          <p className="flex items-center gap-1.5 font-medium">
            <FolderOpen className="size-3.5 text-muted-foreground" />
            {status.destination_folder}/class_&lt;id&gt;
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Transfer</p>
          <p className="font-medium">
            {status.transfer_mode === 'MOVE'
              ? 'Moved into the school Drive'
              : status.transfer_mode === 'COPY'
                ? 'Copied — the teacher keeps the original'
                : 'Linked where Meet left it'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Students</p>
          <p className="font-medium">
            {status.share_with_students ? 'Given read access' : 'Not shared'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Collected</p>
          <p className="font-medium">{status.harvest_delay_minutes} min after a class ends</p>
        </div>
      </div>

      {/*
        Recording needs the Meet API and two delegation scopes of its own, none
        of which the Calendar setup provides — so these problems are the usual
        answer to "the links work, why is nothing recorded?".
      */}
      {problems.length > 0 && (
        <div className="mt-3 rounded-lg border border-warning/40 bg-warning/8 px-3 py-2.5">
          <p className="flex items-center gap-2 text-sm font-medium text-warning">
            <AlertTriangle className="size-4 shrink-0" />
            Recording is not fully configured
          </p>
          <ul className="mt-1.5 space-y-1">
            {problems.map((problem) => (
              <li key={problem} className="text-xs text-muted-foreground">
                {problem}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            <Link to="/admin/integrations" className="font-medium text-primary hover:underline">
              Integrations
            </Link>{' '}
            probes the Meet recording API live and names the exact grant that is missing.
          </p>
        </div>
      )}

      {!status.drive_configured && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          Google Drive is not configured, so there is nowhere to file a recording even when Meet
          produces one. Fix it under{' '}
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
        {/* After this a session with no video is marked UNAVAILABLE and stops
            being polled, which is what keeps the Meet API cost bounded. */}
        <Stat label="Gives up after" value={`${status.give_up_after_hours}h`} />
      </div>
    </Card>
  )
}

const LOG_TONE: Record<string, 'success' | 'danger' | 'warning'> = {
  STORED: 'success',
  FAILED: 'danger',
  CLAIMED: 'warning',
}

export default function AdminRecordingsPage() {
  const statusQuery = useRecordingStatus()
  const previewQuery = useRecordingPreview()
  const logQuery = useRecordingLog(50)
  const runSweep = useRunRecordings()

  return (
    <>
      <PageHeader
        title="Recordings"
        description="Classes that recorded themselves, where the videos were filed, and what is holding any of them up."
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
              Collect now
            </Button>
          </>
        }
      />

      <QueryBoundary query={statusQuery} loading={<Skeleton className="h-80 rounded-xl" />}>
        {(status) => <StatusPanel status={status} />}
      </QueryBoundary>

      <Tabs defaultValue="preview" className="mt-5">
        <TabsList>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="last">Last sweep</TabsTrigger>
          <TabsTrigger value="log">Filed log</TabsTrigger>
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
                description="A preview asks Meet what it holds for every finished session and reports what the next sweep would file — without claiming, moving or sharing anything. It is the safe way to answer “is recording actually working?”."
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
                description="The scheduler reports its result here after its first pass, or immediately after you use “Collect now”."
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
                icon={<Video />}
                title="Nothing filed yet"
                description="Every recording moved into the school Drive is recorded here — which answers “where did that video go?”, and for a failure, why it did not go there."
              />
            }
          >
            {(entries) => (
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div
                    key={`${entry.meeting_id}-${entry.recording_name}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm"
                  >
                    {entry.status === 'STORED' ? (
                      <CheckCircle2 className="size-4 shrink-0 text-success" />
                    ) : entry.status === 'FAILED' ? (
                      <XCircle className="size-4 shrink-0 text-danger" />
                    ) : (
                      // Claimed but never finished: the sweep took the video and
                      // stopped before filing it, which is worth spotting.
                      <Hourglass className="size-4 shrink-0 text-warning" />
                    )}
                    <span className="font-medium">Meeting #{entry.meeting_id}</span>
                    <Badge tone={LOG_TONE[entry.status] ?? 'neutral'} size="sm">
                      {entry.status}
                    </Badge>
                    {entry.mode && (
                      <Badge tone="outline" size="sm">
                        {entry.mode}
                      </Badge>
                    )}
                    {typeof entry.shared_with === 'number' && entry.shared_with > 0 && (
                      <span className="text-xs text-muted-foreground">
                        shared with {entry.shared_with}
                      </span>
                    )}
                    {(entry.error || entry.warning) && (
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-xs',
                          entry.error ? 'text-danger' : 'text-warning',
                        )}
                        title={entry.error ?? entry.warning ?? undefined}
                      >
                        {entry.error ?? entry.warning}
                      </span>
                    )}
                    {entry.web_view_link && (
                      <a
                        href={entry.web_view_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Open in Drive
                        <ExternalLink className="size-3" />
                      </a>
                    )}
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

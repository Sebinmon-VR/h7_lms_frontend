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
  Radio,
  Video,
  XCircle,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type {
  RecordingLogEntry,
  RecordingSchedulerStatus,
  RecordingSweepSummary,
} from '@/api/types'
import {
  useRecordingLog,
  useRecordingPreview,
  useRecordingStatus,
  useRunRecordings,
} from '@/queries/admin.queries'
import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/datetime'
import { resolveFileUrl } from '@/lib/files'
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
 * video?", so it leads with what happened to each recording rather than with
 * a switch.
 *
 * How recording works now: when the teacher joins a class in the LMS, the
 * backend asks Azure Communication Services to start recording. When the call
 * ends, ACS prepares the video and announces it through an Azure Event Grid
 * webhook; the backend then saves it to school storage (Azure Blob Storage)
 * and attaches it to the session. The sweep only tidies up — it marks
 * sessions nobody joined, and retries anything that did not file.
 *
 * `problems` is surfaced prominently: a class room can work perfectly while
 * no video ever arrives, because the webhook is set up separately.
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
  RECORDING: 'warning',
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
          label="Still being prepared"
          value={summary.waiting}
          tone={summary.waiting > 0 ? 'warning' : 'default'}
        />
        {/* Not a fault: a class the teacher never joined in the LMS is never recorded. */}
        <Stat label="Never recorded" value={summary.unavailable} />
        <Stat
          label="Failed"
          value={summary.failed}
          tone={summary.failed > 0 ? 'danger' : 'default'}
        />
      </div>

      {summary.details.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {summary.details.map((d) => {
            const video = resolveFileUrl(d.recording_url)
            return (
              <div
                key={`${d.meeting_id}-${d.status}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
              >
                <Badge tone={DETAIL_TONE[String(d.status)] ?? 'neutral'} size="sm">
                  {d.status === 'WOULD_STORE' ? 'Ready to file' : recordingLabel(d.status)}
                </Badge>
                <span className="min-w-0 truncate font-medium">{d.title}</span>
                <span className="min-w-0 flex-1 text-muted-foreground">{d.detail}</span>
                {video && (
                  <a
                    href={video}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    Open video
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusPanel({ status }: { status: RecordingSchedulerStatus }) {
  const problems = status.problems ?? status.meet_problems ?? []
  const storageReady = status.storage_configured ?? status.drive_configured
  const healthy = status.enabled && status.running && storageReady && problems.length === 0

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
                  ? 'Classes are recorded when the teacher joins in the LMS, and finished videos are saved to school storage.'
                  : 'Enabled, but the background sweep is not running.'
                : 'Disabled — automatic recording is switched off on the server, so no class is recorded.'}
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
          <Badge tone={storageReady ? 'success' : 'danger'} dot>
            {storageReady ? 'Storage ready' : 'No storage'}
          </Badge>
        </div>
      </div>

      {/* How a recording gets from the class to the class's video list. */}
      <ol className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
        <li className="rounded-lg border border-border bg-surface px-3 py-2.5">
          <p className="font-medium text-foreground">1. Teacher joins</p>
          <p className="mt-0.5 text-muted-foreground">
            Recording starts when the teacher joins the class in the LMS. Nobody has to press
            anything.
          </p>
        </li>
        <li className="rounded-lg border border-border bg-surface px-3 py-2.5">
          <p className="font-medium text-foreground">2. Class ends</p>
          <p className="mt-0.5 text-muted-foreground">
            Azure Communication Services prepares the video and tells the LMS it is ready (via
            an Event Grid webhook).
          </p>
        </li>
        <li className="rounded-lg border border-border bg-surface px-3 py-2.5">
          <p className="font-medium text-foreground">3. Saved and shared</p>
          <p className="mt-0.5 text-muted-foreground">
            The video is saved to school storage and appears on the session for its class.
          </p>
        </li>
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Saved into</p>
          <p className="flex items-center gap-1.5 font-medium">
            <FolderOpen className="size-3.5 text-muted-foreground" />
            {status.destination_folder}/class_&lt;id&gt;
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Stored in</p>
          <p className="font-medium">
            {status.transfer_mode === 'AZURE_BLOB' ? 'Azure Blob Storage' : status.transfer_mode}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Students</p>
          <p className="font-medium">Can watch their class&rsquo;s recordings</p>
        </div>
        {status.max_recording_minutes != null && (
          <div>
            <p className="text-xs text-muted-foreground">Longest recording</p>
            <p className="font-medium">{status.max_recording_minutes} min</p>
          </div>
        )}
      </div>

      {/* The usual answer to "the class room works, why is nothing recorded?". */}
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
            checks storage, live classes and the recording webhook and names what is missing.
          </p>
        </div>
      )}

      {!storageReady && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          School storage is not configured, so there is nowhere to save a recording even when a
          class produces one. Fix it under{' '}
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
        <Stat label="Checks every" value={`${status.scan_interval_seconds}s`} />
        {/* After this a session with no video is marked UNAVAILABLE and stops being checked. */}
        <Stat label="Gives up after" value={`${status.give_up_after_hours}h`} />
      </div>
    </Card>
  )
}

const LOG_TONE: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'neutral'> = {
  RECORDING: 'info',
  STOPPED: 'warning',
  FILE_READY: 'warning',
  STORED: 'success',
  FAILED: 'danger',
  UNMATCHED: 'neutral',
}

const LOG_LABEL: Record<string, string> = {
  RECORDING: 'Recording',
  STOPPED: 'Stopped — preparing video',
  FILE_READY: 'Video ready — saving',
  STORED: 'Saved',
  FAILED: 'Failed',
  UNMATCHED: 'Not matched to a class',
}

function LogStatusIcon({ status }: { status: string }) {
  if (status === 'STORED') return <CheckCircle2 className="size-4 shrink-0 text-success" />
  if (status === 'FAILED') return <XCircle className="size-4 shrink-0 text-danger" />
  if (status === 'RECORDING') return <Radio className="size-4 shrink-0 text-danger" />
  // Stopped or file-ready but not yet saved: worth spotting if it lingers.
  return <Hourglass className="size-4 shrink-0 text-warning" />
}

function logTitle(entry: RecordingLogEntry): string {
  if (entry.title) return entry.title
  if (entry.meeting_id != null) return `Meeting #${entry.meeting_id}`
  if (entry.class_id != null) return `Class #${entry.class_id}`
  return entry.recording_name
}

function LogRow({ entry }: { entry: RecordingLogEntry }) {
  const video = resolveFileUrl(entry.file_url ?? entry.web_view_link)
  const parts = entry.files ?? []
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
      <LogStatusIcon status={entry.status} />
      <span className="font-medium">{logTitle(entry)}</span>
      <Badge tone={LOG_TONE[entry.status] ?? 'neutral'} size="sm">
        {LOG_LABEL[entry.status] ?? entry.status}
      </Badge>
      {entry.started_by_name && (
        <span className="text-xs text-muted-foreground">started by {entry.started_by_name}</span>
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
      {parts.length > 1
        ? parts.map((file, index) => {
            const href = resolveFileUrl(file.file_url ?? file.web_view_link)
            if (!href) return null
            return (
              <a
                key={file.drive_file_id ?? href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Part {index + 1}
                <ExternalLink className="size-3" />
              </a>
            )
          })
        : video && (
            <a
              href={video}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Open video
              <ExternalLink className="size-3" />
            </a>
          )}
      <span className="ml-auto text-xs text-muted-foreground">
        {formatRelative(entry.started_at ?? entry.claimed_at)}
      </span>
    </div>
  )
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
        description="Classes recorded in the LMS, where the videos were saved, and what is holding any of them up."
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
              Check now
            </Button>
          </>
        }
      />

      <QueryBoundary query={statusQuery} loading={<Skeleton className="h-80 rounded-xl" />}>
        {(status) => <StatusPanel status={status} />}
      </QueryBoundary>

      <Tabs defaultValue="log" className="mt-5">
        <TabsList>
          <TabsTrigger value="log">Recording log</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="last">Last sweep</TabsTrigger>
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
                description="A preview reports what the next sweep would do for every finished session — without changing anything. It is the safe way to answer “is recording actually working?”."
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
                description="The scheduler reports its result here after its first pass, or immediately after you use “Check now”."
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
                title="Nothing recorded yet"
                description="Every recording the LMS starts is listed here, from the moment the teacher joins until the video is saved to school storage — and, for a failure, why it was not."
              />
            }
          >
            {(entries) => (
              <div className="space-y-2">
                {entries.map((entry) => (
                  <LogRow key={entry.recording_id ?? entry.recording_name} entry={entry} />
                ))}
              </div>
            )}
          </QueryBoundary>
        </TabsContent>
      </Tabs>
    </>
  )
}

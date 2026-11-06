import { AlertTriangle, Check, Disc, ExternalLink, Eye, Play, X } from 'lucide-react'

// Opened from Materials as the "Recording status" strip (see materials.tsx).
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { RecordingLogEntry, RecordingSchedulerStatus, RecordingSweepSummary } from '@/api/types'
import { useRecordingLog, useRecordingPreview, useRecordingStatus, useRunRecordings } from '@/queries/admin.queries'
import { cn } from '@/lib/cn'
import { formatDate, formatRelative, parseApiDateTime } from '@/lib/datetime'
import { resolveFileUrl } from '@/lib/files'
import { countLabel } from '@/lib/format'
import { tidyName as tidy } from '@/lib/names'
import { recordingLabel } from '@/lib/recordings'
import { formatSchoolTime } from '@/lib/school-time'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/feedback/states'
import { Band, Figure, Figures, TONE_FILL, TONE_TEXT, type Tone } from '@/components/layout/workspace'

/**
 * Class recordings — "a class finished, where is the video?"
 *
 * Laid out like the other admin workspaces: white bands, no cards. Each
 * recording is listed in the Library under its class (see materials.tsx); this
 * tab keeps the checks and the setup, and `RecordingDetail` is the view the
 * Library shows for a recording.
 *
 * How recording works: when the teacher joins a class in the LMS, the backend
 * asks Azure Communication Services to start recording. When the call ends,
 * ACS prepares the video and announces it through an Azure Event Grid
 * webhook; the backend saves it to school storage and attaches it to the
 * session. The sweep only tidies up — it marks sessions nobody joined, and
 * retries anything that did not file.
 *
 * `problems` is surfaced prominently: a class room can work perfectly while
 * no video ever arrives, because the webhook is set up separately.
 */

type TabKey = 'last' | 'preview' | 'setup'

const LOG_TONE: Record<string, Tone> = {
  RECORDING: 'danger',
  STOPPED: 'warning',
  FILE_READY: 'warning',
  STORED: 'success',
  FAILED: 'danger',
  UNMATCHED: 'neutral',
}

export const LOG_LABEL: Record<string, string> = {
  RECORDING: 'Recording now',
  STOPPED: 'Preparing the video',
  FILE_READY: 'Saving to storage',
  STORED: 'Saved',
  FAILED: 'Failed',
  UNMATCHED: 'Not matched to a class',
}

const DETAIL_TONE: Record<string, Tone> = {
  STORED: 'success',
  WOULD_STORE: 'success',
  RECORDING: 'warning',
  WAITING: 'warning',
  ARM_FAILED: 'warning',
  UNAVAILABLE: 'neutral',
  FAILED: 'danger',
}

export function logTitle(entry: RecordingLogEntry): string {
  if (entry.title) return entry.title
  if (entry.meeting_id != null) return `Meeting #${entry.meeting_id}`
  if (entry.class_id != null) return `Class #${entry.class_id}`
  return entry.recording_name
}


export function StatusDot({ status, pulse }: { status: string; pulse?: boolean }) {
  return <span className={cn('size-2 shrink-0 rounded-full', TONE_FILL[LOG_TONE[status] ?? 'neutral'], pulse && 'animate-pulse')} aria-hidden />
}

// ================================================================ recording

/** The road from class to storage, with how far this recording got. */
function Steps({ status }: { status: string }) {
  const steps = ['Recording', 'Preparing', 'Saved']
  const reached = status === 'STORED' ? 3 : status === 'FILE_READY' || status === 'STOPPED' ? 2 : status === 'RECORDING' ? 1 : 0
  const failed = status === 'FAILED'
  return (
    <ol className="flex items-center gap-2">
      {steps.map((label, i) => {
        const done = i < reached
        const current = i === reached - 1 && status !== 'STORED'
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium',
                done ? (current ? 'border-warning bg-warning/10 text-warning' : 'border-success bg-success text-white') : failed && i === reached ? 'border-danger bg-danger/10 text-danger' : 'border-border text-muted-foreground',
              )}
            >
              {done && !current ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn('text-xs', done ? 'font-medium text-foreground' : 'text-muted-foreground')}>{label}</span>
            {i < steps.length - 1 && <span className={cn('h-px flex-1', i < reached - 1 ? 'bg-success' : 'bg-border')} aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}

export function RecordingDetail({ entry }: { entry: RecordingLogEntry }) {
  const parts = (entry.files ?? []).map((f) => resolveFileUrl(f.file_url ?? f.web_view_link)).filter((u): u is string => !!u)
  const video = parts[0] ?? resolveFileUrl(entry.file_url ?? entry.web_view_link)
  const [part, setPart] = React.useState(0)
  const playing = parts.length > 1 ? parts[part] : video
  const started = parseApiDateTime(entry.started_at ?? entry.claimed_at)
  const stopped = parseApiDateTime(entry.stopped_at ?? null)
  const minutes = started && stopped ? Math.max(1, Math.round((stopped.getTime() - started.getTime()) / 60_000)) : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', TONE_TEXT[LOG_TONE[entry.status] ?? 'neutral'])}>
            <StatusDot status={entry.status} pulse={entry.status === 'RECORDING'} />
            {LOG_LABEL[entry.status] ?? entry.status}
          </span>
          <h2 className="mt-1 text-xl font-medium tracking-tight text-foreground">{logTitle(entry)}</h2>
          <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
            {started ? `${formatDate(started, 'EEEE d MMMM')} · ${formatSchoolTime(started)}${stopped ? `–${formatSchoolTime(stopped)}` : ''}` : '—'}
            {minutes ? ` · ${minutes} min` : ''}
          </p>
        </div>
        {video && (
          <Button asChild variant="outline" size="sm">
            <a href={playing ?? video} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              Open video
            </a>
          </Button>
        )}
      </div>

      <Steps status={entry.status} />

      {playing ? (
        <video key={playing} src={playing} controls preload="metadata" className="max-h-[52vh] w-full rounded-md border border-border bg-black">
          <track kind="captions" />
        </video>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-14 text-center">
          <Disc className="size-7 text-muted-foreground/40" strokeWidth={1.5} />
          <p className="mt-2 text-sm text-muted-foreground">
            {entry.status === 'RECORDING'
              ? 'The class is being recorded. The video appears here once it has been saved.'
              : entry.status === 'FAILED'
                ? 'No video was saved for this recording.'
                : 'The video is on its way to school storage.'}
          </p>
        </div>
      )}

      {parts.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Recorded in {parts.length} parts:</span>
          {parts.map((_, i) => (
            <Button key={i} size="xs" variant={i === part ? 'primary' : 'outline'} onClick={() => setPart(i)}>
              Part {i + 1}
            </Button>
          ))}
        </div>
      )}

      {(entry.error || entry.warning) && (
        <p className={cn('border-l-2 px-3 py-2 text-sm', entry.error ? 'border-danger bg-danger/5 text-danger' : 'border-warning bg-warning/5 text-foreground')}>
          {entry.error ?? entry.warning}
        </p>
      )}

      <dl className="grid grid-cols-2 border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-border">
        <div className="px-4 py-2 first:pl-0">
          <dt className="text-xs text-muted-foreground">Started by</dt>
          <dd className="truncate text-sm font-medium text-foreground">{entry.started_by_name ? tidy(entry.started_by_name) : '—'}</dd>
        </div>
        <div className="px-4 py-2">
          <dt className="text-xs text-muted-foreground">What was recorded</dt>
          <dd className="truncate text-sm font-medium text-foreground">
            {entry.kind === 'CLASS_ROOM' || (!entry.meeting_id && entry.class_id) ? 'Class room' : entry.meeting_id ? 'Scheduled session' : (entry.kind ?? '—')}
          </dd>
        </div>
        <div className="px-4 py-2">
          <dt className="text-xs text-muted-foreground">Stored in</dt>
          <dd className="truncate text-sm font-medium text-foreground">{entry.mode === 'AZURE_BLOB' ? 'Azure Storage' : (entry.mode ?? '—')}</dd>
        </div>
      </dl>
    </div>
  )
}

// ==================================================================== sweep

/** What a check did (or, for a preview, would do) for every finished session. */
function SweepSummary({ summary }: { summary: RecordingSweepSummary }) {
  const figures: { label: string; value: number; tone: Tone }[] = [
    { label: 'Finished sessions', value: summary.due_meetings, tone: 'neutral' },
    { label: summary.dry_run ? 'Would be saved' : 'Saved', value: summary.stored, tone: 'success' },
    { label: 'Still being prepared', value: summary.waiting, tone: 'warning' },
    // Not a fault: a class the teacher never joined in the LMS is never recorded.
    { label: 'Never recorded', value: summary.unavailable, tone: 'neutral' },
    { label: 'Failed', value: summary.failed, tone: 'danger' },
  ]
  return (
    <div className="space-y-4 py-5">
      <p className="text-sm text-foreground">{summary.detail}</p>
      <div className="grid grid-cols-2 border-y border-border sm:grid-cols-5 sm:divide-x sm:divide-border">
        {figures.map((f) => (
          <div key={f.label} className="px-4 py-2.5 first:pl-0">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('size-1.5 rounded-full', TONE_FILL[f.tone])} aria-hidden />
              {f.label}
            </p>
            <p className={cn('text-xl font-medium tabular-nums', f.tone === 'danger' && f.value > 0 ? 'text-danger' : 'text-foreground')}>{f.value}</p>
          </div>
        ))}
      </div>
      {summary.details.length > 0 && (
        <div className="overflow-x-auto border-y border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Session</th>
                <th className="px-3 py-2 text-left font-medium">Outcome</th>
                <th className="px-3 py-2 text-left font-medium">Detail</th>
                <th className="px-3 py-2 text-right font-medium">
                  <span className="sr-only">Video</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summary.details.map((d) => {
                const video = resolveFileUrl(d.recording_url)
                const tone = DETAIL_TONE[String(d.status)] ?? 'neutral'
                return (
                  <tr key={`${d.meeting_id}-${d.status}`}>
                    <td className="px-3 py-1.5 font-medium text-foreground">{d.title}</td>
                    <td className={cn('whitespace-nowrap px-3 py-1.5 text-xs font-medium', TONE_TEXT[tone])}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cn('size-1.5 rounded-full', TONE_FILL[tone])} aria-hidden />
                        {d.status === 'WOULD_STORE' ? 'Ready to save' : recordingLabel(d.status)}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{d.detail}</td>
                    <td className="px-3 py-1.5 text-right">
                      {video && (
                        <a href={video} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                          Open
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ==================================================================== setup

function Setup({ status }: { status: RecordingSchedulerStatus }) {
  const problems = status.problems ?? status.meet_problems ?? []
  const storageReady = status.storage_configured ?? status.drive_configured
  const facts: [string, React.ReactNode][] = [
    ['Recording', <span className={status.enabled ? 'text-success' : 'text-muted-foreground'}>{status.enabled ? 'Switched on' : 'Switched off'}</span>],
    ['Background check', <span className={status.running ? 'text-success' : 'text-warning'}>{status.running ? 'Running' : 'Stopped'}</span>],
    ['School storage', <span className={storageReady ? 'text-success' : 'text-danger'}>{storageReady ? 'Ready' : 'Not set up'}</span>],
    ['Saved into', `${status.destination_folder}/class_<id>`],
    ['Stored in', status.transfer_mode === 'AZURE_BLOB' ? 'Azure Storage' : status.transfer_mode],
    ['Longest recording', status.max_recording_minutes != null ? `${status.max_recording_minutes} min` : '—'],
    ['Checks run', String(status.run_count)],
    ['Last check', status.last_run_at ? formatRelative(status.last_run_at) : 'Never'],
    ['Checks every', `${status.scan_interval_seconds} s`],
    // After this a session with no video is marked as never recorded and stops being checked.
    ['Gives up after', `${status.give_up_after_hours} h`],
  ]

  return (
    <div className="max-w-4xl space-y-5 py-5">
      {/* How a recording gets from the class to the class's video list. */}
      <ol className="grid border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-border">
        {[
          ['1', 'Teacher joins', 'Recording starts when the teacher joins the class in the LMS. Nobody has to press anything.'],
          ['2', 'Class ends', 'Azure prepares the video and tells the LMS it is ready, through the recording webhook.'],
          ['3', 'Saved and shared', 'The video is saved to school storage and appears on the session for its class.'],
        ].map(([n, title, body]) => (
          <li key={n} className="flex gap-3 px-4 py-3 first:pl-0">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">{n}</span>
            <span>
              <span className="block text-sm font-medium text-foreground">{title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{body}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* The usual answer to "the class room works, why is nothing recorded?". */}
      {problems.length > 0 && (
        <div className="border-l-2 border-warning bg-warning/5 px-3 py-2.5">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <AlertTriangle className="size-4 shrink-0 text-warning" />
            Recording is not fully set up
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted-foreground">
            <Link to="/admin/integrations" className="font-medium text-primary hover:underline">
              Integrations
            </Link>{' '}
            checks storage, live classes and the recording webhook, and names what is missing.
          </p>
        </div>
      )}
      {status.last_error && <p className="border-l-2 border-danger bg-danger/5 px-3 py-2 text-sm text-danger">The last check failed: {status.last_error}</p>}

      <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
        {facts.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 border-b border-border py-2 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// ==================================================================== panel

/**
 * Recording status, opened from Materials as a strip above the library:
 * figures, then the last check, a check preview and the setup as smaller tabs,
 * with the two actions beside them.
 */
export function RecordingsPanel({ onClose }: { onClose: () => void }) {
  const statusQuery = useRecordingStatus()
  const previewQuery = useRecordingPreview()
  const logQuery = useRecordingLog(50)
  const runSweep = useRunRecordings()
  const [tab, setTab] = React.useState<TabKey>('last')

  const entries = logQuery.data ?? []
  const saved = entries.filter((e) => e.status === 'STORED').length
  const inProgress = entries.filter((e) => ['RECORDING', 'STOPPED', 'FILE_READY'].includes(e.status)).length
  const failed = entries.filter((e) => e.status === 'FAILED').length
  const status = statusQuery.data
  const problems = status ? (status.problems ?? status.meet_problems ?? []) : []
  const storageReady = status ? (status.storage_configured ?? status.drive_configured) : true
  const healthy = !!status && status.enabled && status.running && storageReady && problems.length === 0

  const subTabs: { key: TabKey; label: string; count?: number; alert?: boolean }[] = [
    { key: 'last', label: 'Last check' },
    { key: 'preview', label: 'Check preview' },
    { key: 'setup', label: 'Setup', count: problems.length || undefined, alert: true },
  ]

  return (
    <div className="border-b-2 border-primary/20">
      <Band className="border-b border-border bg-primary/[0.03]">
        <div className="flex items-center justify-between gap-3 py-2.5">
          <div>
            <h2 className="flex items-center gap-2 text-base font-medium text-foreground">
              <Disc className="size-4 text-muted-foreground" />
              Recording status
            </h2>
            <p className="text-xs text-muted-foreground">Whether class recording is working, and what the last check did. The videos are in each class&rsquo;s folder below</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close recording status">
            <X />
          </Button>
        </div>
      </Band>
      <Figures>
        <Figure label="Saved" value={logQuery.data ? String(saved) : '—'} context={`of the last ${countLabel(entries.length, 'recording')}`} tone="success" />
        <Figure label="In progress" value={logQuery.data ? String(inProgress) : '—'} context="recording or saving" tone="info" />
        <Figure label="Failed" value={logQuery.data ? String(failed) : '—'} context="no video saved" alert={failed > 0} tone="danger" />
        <Figure
          label="Recording system"
          value={status ? (healthy ? 'Healthy' : 'Needs attention') : '—'}
          context={status ? (status.enabled ? (status.running ? 'switched on' : 'check stopped') : 'switched off') : undefined}
          alert={!!status && !healthy}
          tone={healthy ? 'success' : 'warning'}
        />
      </Figures>

      <Band className="border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-3 py-2">
          <div className="flex gap-1" role="tablist" aria-label="Recordings">
            {subTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-sm transition-colors',
                  tab === t.key ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className={cn('ml-1.5 text-xs tabular-nums', t.alert && t.count > 0 ? 'text-danger' : 'text-muted-foreground')}>{t.count}</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {status?.last_run_at && <span className="hidden text-xs text-muted-foreground sm:inline">Last checked {formatRelative(status.last_run_at)}</span>}
            <Button
              variant="outline"
              size="sm"
              icon={<Eye />}
              loading={previewQuery.isFetching}
              onClick={() => {
                setTab('preview')
                void previewQuery.refetch()
              }}
            >
              Preview
            </Button>
            <Button size="sm" icon={<Play />} loading={runSweep.isPending} onClick={() => runSweep.mutate(undefined, { onSuccess: () => setTab('last') })}>
              Check now
            </Button>
          </div>
        </div>
      </Band>

      <Band className="border-b border-border">
        {tab === 'preview' &&
          (previewQuery.isFetching ? (
            <Skeleton className="my-5 h-40 w-full" />
          ) : previewQuery.isError ? (
            <p className="py-5 text-sm text-danger">{(previewQuery.error as { message?: string })?.message ?? 'Could not build the preview.'}</p>
          ) : previewQuery.data ? (
            <SweepSummary summary={previewQuery.data} />
          ) : (
            <div className="py-14 text-center">
              <p className="text-base font-medium text-foreground">Nothing previewed yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                A preview shows what the next check would do for every finished session, without changing anything. It is the safe way to answer
                &ldquo;is recording working?&rdquo;
              </p>
              <Button size="sm" className="mt-4" icon={<Eye />} onClick={() => previewQuery.refetch()}>
                Preview the next check
              </Button>
            </div>
          ))}

        {tab === 'last' &&
          (status?.last_result ? (
            <SweepSummary summary={status.last_result} />
          ) : (
            <div className="py-14 text-center">
              <p className="text-base font-medium text-foreground">No check has run yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Its result appears here after the first pass, or straight after Check now.</p>
            </div>
          ))}

        {tab === 'setup' &&
          (statusQuery.isPending ? (
            <Skeleton className="my-5 h-60 w-full" />
          ) : status ? (
            <Setup status={status} />
          ) : (
            <div className="py-6">
              <ErrorState error={statusQuery.error} onRetry={() => statusQuery.refetch()} />
            </div>
          ))}
      </Band>
    </div>
  )
}

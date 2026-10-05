import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Disc,
  HardDrive,
  Mail,
  RefreshCw,
  ShieldAlert,
  Video,
  XCircle,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { EmailHealth, HealthProbe, IntegrationsHealth } from '@/api/types'
import { useIntegrations, useStorageTestUpload } from '@/queries/admin.queries'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * Diagnostics for the Azure services the backend runs on: storage (Azure Blob
 * Storage), live classes (Azure Communication Services), class recording and
 * email.
 *
 * The page shows the backend's own `detail` and `problems` strings verbatim
 * rather than paraphrasing them. They name the exact misconfiguration — a
 * missing connection string, a container that does not exist, a webhook key
 * that was never set — and any wording we substituted would be strictly less
 * useful to whoever has to go and fix it.
 */

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="size-4 shrink-0 text-success" />
  ) : (
    <XCircle className="size-4 shrink-0 text-danger" />
  )
}

/** Key/value line. `mono` is for identifiers meant to be copied into a console. */
function Detail({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('min-w-0 break-all text-right', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  )
}

function Bool({ value }: { value: boolean }) {
  return (
    <Badge tone={value ? 'success' : 'neutral'} size="sm">
      {value ? 'On' : 'Off'}
    </Badge>
  )
}

function IntegrationCard({
  title,
  icon,
  probe,
  probed,
  children,
  actions,
}: {
  title: string
  icon: React.ReactNode
  probe: HealthProbe
  /** False when the settings-only view was requested — `ok` is then untested. */
  probed: boolean
  children?: React.ReactNode
  actions?: React.ReactNode
}) {
  const problems = probe.problems ?? []
  const ok = probe.ok ?? problems.length === 0

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-primary">
            {icon}
          </span>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <StatusIcon ok={ok} />
              <span className={cn('text-xs font-medium', ok ? 'text-success' : 'text-danger')}>
                {ok ? 'Healthy' : 'Not working'}
              </span>
              {!probed && (
                <span className="text-xs text-muted-foreground">— from settings, not tested</span>
              )}
            </div>
          </div>
        </div>
        {actions}
      </div>

      {probe.detail && (
        <p
          className={cn(
            'mt-3 rounded-lg border px-3 py-2 text-xs leading-relaxed',
            ok
              ? 'border-border bg-surface text-muted-foreground'
              : 'border-danger/30 bg-danger/8 text-danger',
          )}
        >
          {probe.detail}
        </p>
      )}

      {/* Configuration faults are found without touching the network, so they
          are listed separately from whatever the live probe reported. */}
      {problems.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {problems.map((problem) => (
            <li key={problem} className="flex items-start gap-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span className="text-muted-foreground">{problem}</span>
            </li>
          ))}
        </ul>
      )}

      {children && <div className="mt-3 divide-y divide-border/60 border-t border-border/60 pt-1">{children}</div>}
    </Card>
  )
}

/** Email is reported from settings only — there is no live probe for it. */
function EmailCard({ email }: { email: EmailHealth }) {
  const ok = email.ok ?? (email.enabled && email.configured)
  const via =
    email.provider === 'ACS'
      ? 'Azure Communication Services'
      : email.provider === 'SMTP'
        ? 'SMTP'
        : null
  return (
    <IntegrationCard
      title="Email"
      icon={<Mail className="size-4" />}
      probed={false}
      probe={{
        ok,
        detail: email.enabled
          ? email.configured
            ? `Credential emails and notifications will be sent${via ? ` through ${via}` : ''}.`
            : 'Notifications are enabled but email is not fully configured, so nothing will actually send.'
          : 'Notifications are switched off. Generated passwords must be delivered to users by hand.',
      }}
    >
      <Detail label="Notifications" value={<Bool value={email.enabled} />} />
      <Detail label="Configured" value={<Bool value={email.configured} />} />
      <Detail label="Sent through" value={via} />
      <Detail label="Sender" value={email.sender} mono />
      <Detail label="Azure email set up" value={<Bool value={email.acs_configured} />} />
      <Detail label="SMTP set up" value={<Bool value={email.smtp_configured} />} />
      <Detail label="SMTP host" value={email.smtp_host} mono />
    </IntegrationCard>
  )
}

function storageProviderName(provider: string | null | undefined): string | null {
  if (provider === 'AZURE_BLOB') return 'Azure Blob Storage'
  if (provider === 'LOCAL') return 'Server disk'
  return provider ?? null
}

function IntegrationsGrid({ data }: { data: IntegrationsHealth }) {
  const testUpload = useStorageTestUpload()
  const { storage, live_classes: live, recording, email } = data
  const storageProblems = storage.problems ?? []
  const liveProblems = [...(live?.problems ?? []), ...(live?.recording?.problems ?? [])]

  return (
    <>
      {/*
        A provider conflict is reported rather than silently resolved by the
        backend, which means uploads are running on whichever setting won — so
        this belongs above everything else on the page.
      */}
      {data.storage_config_conflict && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/8 p-4">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-medium">Storage configuration conflict</p>
            <p className="mt-0.5 text-muted-foreground">{data.storage_config_conflict}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <IntegrationCard
          title="Storage"
          icon={<HardDrive className="size-4" />}
          probe={{
            ...storage,
            ok: storage.ok ?? storageProblems.length === 0,
          }}
          probed={data.probed}
          actions={
            <Button
              variant="outline"
              size="sm"
              loading={testUpload.isPending}
              onClick={() => testUpload.mutate(true)}
            >
              <CloudUpload className="size-4" />
              Test upload
            </Button>
          }
        >
          <Detail label="Provider" value={storageProviderName(storage.provider)} />
          <Detail label="Storage account" value={storage.account} mono />
          <Detail label="Container" value={storage.container} mono />
          <Detail label="Local directory" value={storage.local_dir} mono />
          {storage.strict !== undefined && (
            <Detail label="Strict mode" value={<Bool value={storage.strict} />} />
          )}
        </IntegrationCard>

        {live && (
          <IntegrationCard
            title="Live classes"
            icon={<Video className="size-4" />}
            probe={{
              ok: live.ok ?? (live.enabled && live.configured && (live.problems ?? []).length === 0),
              detail:
                live.detail ??
                (live.enabled
                  ? live.configured
                    ? 'Classes happen inside the LMS on Azure Communication Services.'
                    : 'Live classes are switched on but Azure Communication Services is not configured, so no class room can be created.'
                  : 'Live classes are switched off.'),
              problems: liveProblems,
            }}
            probed={data.probed}
          >
            <Detail label="Service" value="Azure Communication Services" />
            <Detail label="Enabled" value={<Bool value={live.enabled} />} />
            <Detail label="Configured" value={<Bool value={live.configured} />} />
            <Detail label="Endpoint" value={live.endpoint} mono />
            <Detail
              label="Rooms valid for"
              value={live.room_validity_days != null ? `${live.room_validity_days} days` : null}
            />
            <Detail
              label="Sign-in to a call lasts"
              value={live.token_hours != null ? `${live.token_hours} h` : null}
            />
            {live.recording && (
              <>
                <Detail label="Recording" value={<Bool value={live.recording.enabled} />} />
                <Detail
                  label="Recording events key set"
                  value={<Bool value={live.recording.events_key_set} />}
                />
              </>
            )}
          </IntegrationCard>
        )}

        {/*
          Recording has its own card: a class room can work perfectly while
          recordings never arrive, because finished videos are delivered to the
          backend by an Azure Event Grid webhook that is set up separately.
        */}
        {recording && (
          <IntegrationCard
            title="Class recording"
            icon={<Disc className="size-4" />}
            probe={{
              ok: recording.ok,
              detail:
                recording.detail ??
                (recording.enabled
                  ? 'Recording starts when the teacher joins in the LMS; the video is saved to school storage once it is ready.'
                  : 'Automatic recording is switched off.'),
              problems: recording.problems,
            }}
            probed={data.probed}
            actions={
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/recordings">
                  <Video className="size-4" />
                  Recordings
                </Link>
              </Button>
            }
          >
            <Detail label="Enabled" value={<Bool value={recording.enabled} />} />
            {/* Where Azure Event Grid must deliver "recording ready" events. */}
            <Detail label="Event Grid webhook" value={recording.webhook_path} mono />
          </IntegrationCard>
        )}

        <EmailCard email={email} />
      </div>

      {/* A round trip proves writes work, which reachability alone does not. */}
      {testUpload.data && (
        <div
          className={cn(
            'mt-4 flex items-start gap-3 rounded-xl border p-4 text-sm',
            testUpload.data.ok
              ? 'border-success/30 bg-success/8'
              : 'border-warning/40 bg-warning/8',
          )}
        >
          {testUpload.data.ok ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          )}
          <div className="min-w-0">
            <p className="font-medium">Last storage probe</p>
            <p className="mt-0.5 text-muted-foreground">{testUpload.data.detail}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Requested {testUpload.data.requested_provider} · landed on{' '}
              {testUpload.data.actual_provider} ·{' '}
              {testUpload.data.cleaned_up === null
                ? 'probe file kept'
                : testUpload.data.cleaned_up
                  ? 'probe file removed'
                  : 'probe file could NOT be removed'}
            </p>
          </div>
        </div>
      )}
    </>
  )
}

export default function AdminIntegrationsPage() {
  const query = useIntegrations(true)

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Where files are stored, how live classes run and are recorded, how email is sent, and what is currently broken."
        actions={
          <Button
            variant="outline"
            icon={<RefreshCw />}
            loading={query.isFetching}
            onClick={() => query.refetch()}
          >
            Re-check
          </Button>
        }
      />

      <QueryBoundary
        query={query}
        loading={
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        }
      >
        {(data) => <IntegrationsGrid data={data} />}
      </QueryBoundary>
    </>
  )
}

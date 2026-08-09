import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CloudUpload,
  HardDrive,
  Mail,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import * as React from 'react'

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
 * Diagnostics for the Google integrations.
 *
 * The page shows the backend's own `detail` string verbatim rather than
 * paraphrasing it. That string names the exact misconfiguration — a missing
 * credentials file, an unauthorised delegation, a Drive the service account
 * cannot see — and any wording we substituted would be strictly less useful to
 * whoever has to go and fix it.
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
              <StatusIcon ok={probe.ok} />
              <span className={cn('text-xs font-medium', probe.ok ? 'text-success' : 'text-danger')}>
                {probe.ok ? 'Healthy' : 'Not working'}
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
            probe.ok
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

/** SMTP has no live probe, so it reports configuration only. */
function EmailCard({ email }: { email: EmailHealth }) {
  const ok = email.enabled && email.configured
  return (
    <IntegrationCard
      title="Email (SMTP)"
      icon={<Mail className="size-4" />}
      probed={false}
      probe={{
        ok,
        detail: email.enabled
          ? email.configured
            ? 'Credential emails and notifications will be sent.'
            : 'Notifications are enabled but SMTP is not fully configured, so nothing will actually send.'
          : 'Notifications are switched off. Generated passwords must be delivered to users by hand.',
      }}
    >
      <Detail label="Notifications" value={<Bool value={email.enabled} />} />
      <Detail label="Credentials set" value={<Bool value={email.configured} />} />
      <Detail label="Host" value={email.smtp_host} mono />
      <Detail label="User" value={email.smtp_user} mono />
    </IntegrationCard>
  )
}

function IntegrationsGrid({ data }: { data: IntegrationsHealth }) {
  const testUpload = useStorageTestUpload()
  const { storage, drive, google_meet: meet, email } = data

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
          title="File storage"
          icon={<HardDrive className="size-4" />}
          probe={storage}
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
          <Detail label="Provider" value={storage.provider} />
          <Detail label="Bucket" value={storage.bucket} mono />
          <Detail label="Local directory" value={storage.local_dir} mono />
          {storage.strict !== undefined && (
            <Detail
              label="Strict mode"
              value={<Bool value={storage.strict} />}
            />
          )}
        </IntegrationCard>

        <IntegrationCard
          title="Google Drive"
          icon={<CloudUpload className="size-4" />}
          probe={drive}
          probed={data.probed}
        >
          <Detail label="Configured" value={<Bool value={drive.configured} />} />
          <Detail
            label="Destination"
            value={drive.destination === 'SHARED_DRIVE' ? 'Shared Drive' : drive.destination === 'FOLDER' ? 'Folder' : null}
          />
          <Detail label="Target" value={drive.target_name} />
          <Detail label="Shared Drive ID" value={drive.shared_drive_id} mono />
          <Detail label="Folder ID" value={drive.folder_id} mono />
          <Detail label="Root folder" value={drive.root_folder_name} />
          <Detail label="Acting as" value={drive.impersonating} mono />
          <Detail label="Link sharing" value={<Bool value={drive.link_sharing} />} />
          <Detail label="Credentials file" value={drive.credentials_file} mono />
        </IntegrationCard>

        <IntegrationCard
          title="Google Meet"
          icon={<CalendarClock className="size-4" />}
          probe={meet}
          probed={data.probed}
        >
          <Detail label="Enabled" value={<Bool value={meet.enabled} />} />
          <Detail label="Calendar" value={meet.calendar_summary ?? meet.calendar_id} mono />
          <Detail label="Timezone" value={meet.timezone} />
          <Detail label="Impersonation" value={<Bool value={meet.impersonation} />} />
          <Detail label="Acting as" value={meet.acting_as} mono />
          <Detail label="Workspace domain" value={meet.workspace_domain} mono />
          <Detail label="Fallback identity" value={meet.impersonation_fallback} mono />
          <Detail label="Invite attendees" value={<Bool value={meet.invite_attendees} />} />
          <Detail label="Credentials file" value={meet.credentials_file} mono />
        </IntegrationCard>

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
        description="Where files are stored, how meetings are created, and what is currently broken."
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

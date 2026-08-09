import { Clock, Info, KeyRound, LogOut, Monitor, Moon, Server, Sun } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { useAuth } from '@/providers/auth-provider'
import { useTheme, type ThemeMode } from '@/providers/theme-provider'
import { formatDateTime } from '@/lib/datetime'
import { API_BASE } from '@/lib/env'
import { cn } from '@/lib/cn'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { RoleBadge, ActiveBadge } from '@/components/domain/badges'
import { ProfileSummary } from '@/components/domain/profile-summary'
import { PageHeader } from '@/components/layout/page-header'

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function formatRemaining(ms: number | null): string {
  if (ms == null) return 'Unknown'
  if (ms <= 0) return 'Expired'
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  if (hours > 0) return `${hours}h ${minutes}m remaining`
  return `${minutes}m remaining`
}

export default function ProfilePage() {
  const { user, logout, expiresInMs, usesFirebase, sendPasswordReset } = useAuth()
  const { mode, setMode } = useTheme()
  const [resetBusy, setResetBusy] = React.useState(false)

  /**
   * Passwords live in Firebase, not in this backend, so a reset is a Firebase
   * email rather than an API call. Only offered when Firebase is configured.
   */
  const requestPasswordReset = async () => {
    if (!user?.email) return
    setResetBusy(true)
    try {
      await sendPasswordReset(user.email)
      toast.success('Password reset email sent', {
        description: `Check ${user.email} for a link to set a new password.`,
        duration: 8_000,
      })
    } catch (error) {
      toast.error((error as Error)?.message ?? 'Could not send a reset email.')
    } finally {
      setResetBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Profile & settings" description="Your account details and application preferences." />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              {usesFirebase
                ? 'Your name, email and role are managed by an administrator. Your password is held by Firebase and you can reset it yourself.'
                : 'Your details are managed by an administrator. Names, emails and passwords cannot be changed from here.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              <Avatar name={user?.full_name} size="xl" />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{user?.full_name ?? '—'}</p>
                <p className="truncate text-sm text-muted-foreground">{user?.email || 'No email on record'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {user?.role && <RoleBadge role={user.role} />}
                  {user && <ActiveBadge active={user.is_active} />}
                </div>
              </div>
            </div>

            <Separator />

            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Member since</dt>
                <dd className="mt-1 text-sm">{formatDateTime(user?.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Role</dt>
                <dd className="mt-1 text-sm">
                  {user?.role ?? '—'}
                  <span className="ml-2 text-xs text-muted-foreground">(set by an administrator)</span>
                </dd>
              </div>
            </dl>

            {user && (
              <>
                <Separator />
                <ProfileSummary user={user} />
                {/*
                  Read-only on purpose, not an oversight: profile detail and the
                  reminder preference are written through PUT /admin/users/{id},
                  and the API exposes no self-service equivalent. An editable
                  form here would fail for everyone who is not an admin.
                */}
                <p className="text-xs text-muted-foreground">
                  These details, including whether you receive class reminders, are maintained by an
                  administrator — ask them to change anything that is wrong.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Applies to this browser only.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMode(option.value)}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-lg border px-3 py-3 text-xs font-medium transition-colors',
                      mode === option.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                    )}
                  >
                    <option.icon className="size-4" />
                    {option.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Session</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="size-4 text-muted-foreground" />
                <span>{formatRemaining(expiresInMs)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {usesFirebase
                  ? 'Your sign-in token refreshes automatically about every hour, so you stay signed in until you sign out or an administrator deactivates the account.'
                  : 'This server issues short-lived tokens that cannot be renewed — you will be asked to sign in again when the countdown ends.'}
              </p>
              {usesFirebase && user?.email && (
                <Button
                  variant="outline"
                  block
                  icon={<KeyRound />}
                  loading={resetBusy}
                  onClick={requestPasswordReset}
                >
                  Reset password
                </Button>
              )}
              <Button variant="outline" block icon={<LogOut />} onClick={() => logout('manual')}>
                Sign out
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <Server className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">API endpoint</p>
                  <p className="truncate font-mono text-xs">{API_BASE || '(same origin)'}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  {usesFirebase
                    ? 'Roles can only be changed by an administrator — the API has no self-service endpoint for that.'
                    : 'Need a password reset or a role change? Contact an administrator — this server has no self-service endpoint for either.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

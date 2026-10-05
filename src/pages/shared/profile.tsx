import { Clock, Info, KeyRound, LogOut, Monitor, Moon, Server, Sun } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { ApiError } from '@/api/errors'
import { useAuth } from '@/providers/auth-provider'
import { useTheme, type ThemeMode } from '@/providers/theme-provider'
import { formatDateTime } from '@/lib/datetime'
import { API_BASE } from '@/lib/env'
import { cn } from '@/lib/cn'
import { ROLE_LABEL } from '@/lib/constants'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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

/**
 * Changing your own password. The server checks the current one, signs every
 * other device out, and hands this one a fresh token so it stays signed in.
 */
function ChangePasswordCard() {
  const { changePassword } = useAuth()
  const [current, setCurrent] = React.useState('')
  const [next, setNext] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (next.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (next !== confirm) {
      setError('The two new passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      toast.success('Password changed', {
        description: 'Any other device signed in to this account has been signed out.',
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Choose a new password for signing in.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Repeat the new password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button
            type="submit"
            variant="outline"
            block
            icon={<KeyRound />}
            loading={busy}
            disabled={!current || !next || !confirm}
          >
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default function ProfilePage() {
  const { user, logout, expiresInMs } = useAuth()
  const { mode, setMode } = useTheme()

  return (
    <>
      <PageHeader title="Profile & settings" description="Your account details and application preferences." />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              Your name, email and role are managed by an administrator. You can change your own password below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* An identity banner rather than an avatar sitting on a white
                card. Who you are is the one thing this page is certain of, so
                it gets the visual weight — everything under it is detail. */}
            <div className="relative -mx-6 -mt-6 overflow-hidden border-b border-border bg-muted/40 px-6 py-6">
              <div
                className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full opacity-40 blur-3xl"
                style={{
                  background:
                    'radial-gradient(circle, hsl(var(--primary) / 0.45), transparent 70%)',
                }}
                aria-hidden
              />
              <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
                <Avatar name={user?.full_name} src={user?.photo_url} size="xl" />
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold tracking-tight">
                    {user?.full_name ?? '—'}
                  </h2>
                  <p className="truncate text-sm text-muted-foreground">
                    {user?.email || 'No email on record'}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {user?.role && <RoleBadge role={user.role} />}
                    {user && <ActiveBadge active={user.is_active} />}
                    {user?.admission_number && (
                      <Badge tone="outline" size="sm">
                        {user.admission_number}
                      </Badge>
                    )}
                    {user?.employee_id && (
                      <Badge tone="outline" size="sm">
                        {user.employee_id}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <div className="space-y-1">
                <dt className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                  Member since
                </dt>
                <dd className="text-sm font-medium">{formatDateTime(user?.created_at)}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                  Role
                </dt>
                <dd className="text-sm font-medium">
                  {user?.role ? ROLE_LABEL[user.role] : '—'}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    set by an administrator
                  </span>
                </dd>
              </div>
            </dl>

            {user && (
              <>
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
                Your session renews itself while you use the LMS, so you stay signed in until you sign out,
                change your password, or an administrator deactivates the account.
              </p>
              <Button variant="outline" block icon={<LogOut />} onClick={() => logout('manual')}>
                Sign out
              </Button>
            </CardContent>
          </Card>

          <ChangePasswordCard />

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
                  Roles can only be changed by an administrator — the API has no self-service endpoint for that.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import * as React from 'react'
import { Loader2, ServerCrash } from 'lucide-react'

import type { UserRole } from '@/api/types'
import { roleHome, useAuth } from '@/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Wordmark } from './logo'

/** Branded boot state, shown while `/auth/me` validates the stored token. */
export function BootSplash() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background">
      <Wordmark />
      <Loader2 className="size-5 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Restoring your session…</p>
    </div>
  )
}

/**
 * The server is unreachable or erroring, but the token is still valid. We do
 * NOT sign the user out here — with this backend a 500 is common and losing
 * the session over one would be hostile.
 */
function DegradedScreen() {
  const { retryBoot, logout } = useAuth()
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <ServerCrash className="size-10 text-danger" />
      <div>
        <h1 className="text-lg font-semibold">Cannot reach the server</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Your session is still valid, but the API did not respond. Make sure the backend is running on the
          configured address, then try again.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={retryBoot}>Retry</Button>
        <Button variant="outline" onClick={() => logout('manual')}>
          Sign out
        </Button>
      </div>
    </div>
  )
}

export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'booting') return <BootSplash />
  if (status === 'degraded') return <DegradedScreen />
  if (status === 'anonymous') {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  }
  return <Outlet />
}

/**
 * Wrong-role access redirects home rather than showing a dead end — the usual
 * cause is a stale or hand-typed URL. A genuine API 403 still renders an
 * in-page error.
 */
export function RequireRole({ allow }: { allow: UserRole[] }) {
  const { role } = useAuth()
  const notified = React.useRef(false)

  if (role && !allow.includes(role)) {
    if (!notified.current) {
      notified.current = true
      toast.error('That page is not available for your role.')
    }
    return <Navigate to={roleHome(role)} replace />
  }
  return <Outlet />
}

/** Signed-in users never see the login screen. */
export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { status, role } = useAuth()
  if (status === 'booting') return <BootSplash />
  if (status === 'authenticated') return <Navigate to={roleHome(role)} replace />
  return <>{children}</>
}

export function RoleHomeRedirect() {
  const { role } = useAuth()
  return <Navigate to={roleHome(role)} replace />
}

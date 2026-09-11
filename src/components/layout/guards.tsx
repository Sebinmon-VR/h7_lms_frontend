import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import * as React from 'react'
import { Loader2, ServerCrash } from 'lucide-react'

import type { Program, UserRole } from '@/api/types'
import { PROGRAM_LABEL, hasProgram } from '@/lib/tuition'
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
  const { role, user } = useAuth()
  const notified = React.useRef(false)

  if (role && !allow.includes(role)) {
    if (!notified.current) {
      notified.current = true
      toast.error('That page is not available for your role.')
    }
    return <Navigate to={roleHome(user)} replace />
  }
  return <Outlet />
}

/**
 * Gates the online tuition screens on programme membership.
 *
 * A role guard is not enough here and the backend says so: it checks the role
 * AND the `programs` list on every tuition route, because a school teacher with
 * a perfectly valid login has no business in the tuition timetable. Mirroring
 * that check in the router turns what would be a wall of 403s into a redirect
 * with an explanation.
 *
 * Admins pass unconditionally. One admin team runs both products, and an
 * administrator locked out because nobody ticked a box is a support call, not
 * a security win — the backend takes the same view.
 */
export function RequireProgram({ program }: { program: Program }) {
  const { user, role } = useAuth()
  const notified = React.useRef(false)

  if (role === 'ADMIN') return <Outlet />

  if (user && !hasProgram(user, program)) {
    if (!notified.current) {
      notified.current = true
      toast.error(`Your account is not part of ${PROGRAM_LABEL[program].toLowerCase()}.`, {
        description: 'An administrator can grant access from the programme access screen.',
      })
    }
    return <Navigate to={roleHome(user)} replace />
  }

  return <Outlet />
}

/** Signed-in users never see the login screen. */
export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth()
  if (status === 'booting') return <BootSplash />
  if (status === 'authenticated') return <Navigate to={roleHome(user)} replace />
  return <>{children}</>
}

export function RoleHomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={roleHome(user)} replace />
}

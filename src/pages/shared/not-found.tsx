import { Compass, Home } from 'lucide-react'
import { Link } from 'react-router-dom'

import { roleHome, useAuth } from '@/providers/auth-provider'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  const { user } = useAuth()

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="relative">
        <div className="absolute inset-0 -z-10 rounded-full bg-primary/20 blur-3xl" aria-hidden />
        <Compass className="size-14 text-primary" />
      </div>
      <p className="mt-6 text-5xl font-semibold tracking-tight text-gradient">404</p>
      <h1 className="mt-2 text-lg font-semibold">This page does not exist</h1>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        The link may be out of date, or the page may not be available for your role.
      </p>
      <Button asChild variant="primary" className="mt-6">
        <Link to={roleHome(user)}>
          <Home className="size-4" />
          Back to dashboard
        </Link>
      </Button>
    </div>
  )
}

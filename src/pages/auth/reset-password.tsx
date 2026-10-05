import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react'
import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { authApi } from '@/api/auth.api'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthLayout } from './auth-layout'

/**
 * Where the link in a "forgot password" email lands. The token in the address
 * works once, for an hour; the server says so if it has expired or been used.
 */
export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [show, setShow] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset the password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <div className="mb-7">
        <h2 className="text-2xl font-semibold tracking-tight">Choose a new password</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          This link works once. After this, sign in with the new password.
        </p>
      </div>

      {!token ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2.5 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>This page needs the link from your email. Ask for a new one from the sign-in screen.</span>
        </div>
      ) : done ? (
        <div className="space-y-5">
          <div className="flex items-start gap-2.5 rounded-lg border border-success/30 bg-success/8 px-3 py-2.5 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <span>Your password has been changed.</span>
          </div>
          <Button asChild variant="primary" size="lg" block>
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && (
            <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2.5 text-sm text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-password" required>
              New password
            </Label>
            <Input
              id="new-password"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              trailing={
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="pointer-events-auto transition-colors hover:text-foreground"
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff /> : <Eye />}
                </button>
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password" required>
              Repeat the new password
            </Label>
            <Input
              id="confirm-password"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" size="lg" block loading={busy} icon={<KeyRound />}>
            Save new password
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-medium hover:text-primary">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}

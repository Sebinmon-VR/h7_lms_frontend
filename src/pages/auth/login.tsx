import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Eye, EyeOff, LogIn, MailCheck } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { ApiError } from '@/api/errors'
import { roleHome, useAuth } from '@/providers/auth-provider'
import { DEMO_ACCOUNTS } from '@/lib/constants'
import { IS_DEV } from '@/lib/env'
import { firebaseAuthMessage } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthLayout } from './auth-layout'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type FormValues = z.infer<typeof schema>

export default function LoginPage() {
  const { login, sendPasswordReset, usesFirebase } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPassword, setShowPassword] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [resetBusy, setResetBusy] = React.useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const from = (location.state as { from?: string } | null)?.from

  /**
   * Sign-in now fails in two different vocabularies: Firebase `auth/*` codes
   * for the credential itself, and the backend's HTTP errors for the LMS
   * profile behind it. Both have to read as one sentence to the user.
   */
  const describeSignInFailure = (error: unknown): string => {
    const apiError = error instanceof ApiError ? error : null
    if (apiError) {
      if (apiError.isNoProfile) {
        return 'That account signed in successfully, but no LMS profile is linked to it. Ask an administrator to create your account.'
      }
      if (apiError.isInactiveAccount) {
        return 'This account has been deactivated. Contact an administrator.'
      }
      if (apiError.isPasswordLoginUnavailable) {
        return 'Password sign-in is not enabled on this server. Configure Firebase for this site, or ask an administrator for access.'
      }
      if (apiError.isUnauthorized) {
        return 'That email and password combination is not recognised.'
      }
      if (apiError.isNetwork) return apiError.message
      return apiError.message
    }
    return firebaseAuthMessage(error)
  }

  const onSubmit = async (values: FormValues) => {
    setFormError(null)
    try {
      const user = await login(values)
      navigate(from ?? roleHome(user ?? null), { replace: true })
    } catch (error) {
      setFormError(describeSignInFailure(error))
    }
  }

  /**
   * Always reports success, even for an address with no account. Firebase
   * behaves the same way, and confirming which emails are registered would
   * turn this form into an account-enumeration oracle.
   */
  const onForgotPassword = async () => {
    const email = form.getValues('email').trim()
    if (!email) {
      form.setError('email', { message: 'Enter your email address first.' })
      form.setFocus('email')
      return
    }

    setFormError(null)
    setResetBusy(true)
    try {
      await sendPasswordReset(email)
      toast.success('Password reset email sent', {
        description: `If an account exists for ${email}, a reset link is on its way.`,
        duration: 8_000,
      })
    } catch (error) {
      setFormError((error as Error)?.message ?? 'Could not send a reset email.')
    } finally {
      setResetBusy(false)
    }
  }

  const fillDemo = (email: string, password: string) => {
    form.setValue('email', email, { shouldValidate: true })
    form.setValue('password', password, { shouldValidate: true })
    setFormError(null)
  }

  return (
    <AuthLayout>
      <div className="mb-7">
        <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Sign in to pick up where your learning left off.
        </p>
      </div>

      {formError && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2.5 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* Email and password only.
          Accounts are provisioned by an administrator, who generates the
          password and emails it — so a Google button would offer a route that
          most users' accounts are not set up for. Sign-in still runs through
          the Firebase SDK, which keeps the token refreshing in the background
          rather than expiring hard after an hour. */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email" required>
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@institution.edu"
            invalid={!!form.formState.errors.email}
            {...form.register('email')}
          />
          {form.formState.errors.email && (
            <p className="text-xs text-danger">{form.formState.errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password" required>
              Password
            </Label>
            {usesFirebase && (
              <button
                type="button"
                onClick={onForgotPassword}
                disabled={resetBusy}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
              >
                {resetBusy && <MailCheck className="size-3.5" />}
                Forgot password?
              </button>
            )}
          </div>
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            invalid={!!form.formState.errors.password}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="pointer-events-auto transition-colors hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            }
            {...form.register('password')}
          />
          {form.formState.errors.password && (
            <p className="text-xs text-danger">{form.formState.errors.password.message}</p>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          loading={form.formState.isSubmitting}
          icon={<LogIn />}
        >
          Sign in
        </Button>
      </form>

      {IS_DEV && (
        <div className="mt-7 rounded-xl border border-dashed border-border p-4">
          <p className="text-xs font-medium text-muted-foreground">Demo accounts</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => fillDemo(account.email, account.password)}
                className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium transition-colors hover:border-primary/50 hover:text-primary"
              >
                {account.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No self-registration. The backend has no `POST /auth/register` — accounts
          are provisioned by an administrator, who issues credentials from the
          Users screen. Inviting people to sign up here only produced a 404. */}
      <p className="mt-7 text-center text-sm text-muted-foreground">
        Accounts are created by your school. Contact the office if you cannot sign in.
      </p>
    </AuthLayout>
  )
}

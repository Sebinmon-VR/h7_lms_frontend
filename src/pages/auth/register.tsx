import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Info, UserPlus } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { authApi } from '@/api/auth.api'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/providers/auth-provider'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthLayout } from './auth-layout'

const schema = z
  .object({
    full_name: z.string().min(2, 'Enter your full name').max(120),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    password: z.string().min(8, 'Use at least 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })

type FormValues = z.infer<typeof schema>

function strengthOf(password: string): { score: number; label: string; tone: string } {
  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1

  if (score <= 2) return { score, label: 'Weak', tone: 'bg-danger' }
  if (score === 3) return { score, label: 'Fair', tone: 'bg-warning' }
  if (score === 4) return { score, label: 'Good', tone: 'bg-info' }
  return { score, label: 'Strong', tone: 'bg-success' }
}

export default function RegisterPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = React.useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: '', email: '', password: '', confirm: '' },
  })

  const password = form.watch('password')
  const strength = strengthOf(password ?? '')

  const onSubmit = async (values: FormValues) => {
    setFormError(null)
    try {
      // Student only. The backend would accept role "ADMIN" from an anonymous
      // caller; we never offer that.
      await authApi.register({
        full_name: values.full_name,
        email: values.email,
        password: values.password,
        role: 'STUDENT',
      })
      await login({ email: values.email, password: values.password })
      toast.success('Account created. Welcome to H7 LMS.')
      navigate('/student', { replace: true })
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null
      if (apiError?.status === 400) {
        form.setError('email', { message: 'An account already exists with this email.' })
      } else {
        setFormError(apiError?.message ?? 'Registration failed. Please try again.')
      }
    }
  }

  return (
    <AuthLayout>
      <div className="mb-7">
        <h2 className="text-2xl font-semibold tracking-tight">Create your student account</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Teacher and administrator accounts are created by an administrator.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2.5 text-sm text-danger"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="full_name" required>
            Full name
          </Label>
          <Input
            id="full_name"
            autoComplete="name"
            placeholder="Alice Johnson"
            invalid={!!form.formState.errors.full_name}
            {...form.register('full_name')}
          />
          {form.formState.errors.full_name && (
            <p className="text-xs text-danger">{form.formState.errors.full_name.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
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
          <Label htmlFor="password" required>
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            invalid={!!form.formState.errors.password}
            {...form.register('password')}
          />
          {password && (
            <div className="flex items-center gap-2">
              <div className="flex h-1 flex-1 gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-full flex-1 rounded-full transition-colors',
                      i < strength.score ? strength.tone : 'bg-muted',
                    )}
                  />
                ))}
              </div>
              <span className="text-2xs text-muted-foreground">{strength.label}</span>
            </div>
          )}
          {form.formState.errors.password && (
            <p className="text-xs text-danger">{form.formState.errors.password.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm" required>
            Confirm password
          </Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            invalid={!!form.formState.errors.confirm}
            {...form.register('confirm')}
          />
          {form.formState.errors.confirm && (
            <p className="text-xs text-danger">{form.formState.errors.confirm.message}</p>
          )}
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-info/25 bg-info/8 px-3 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-info" />
          <span>
            After signing up an administrator needs to enroll you in a class before your subjects,
            attendance and grades appear.
          </span>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          loading={form.formState.isSubmitting}
          icon={<UserPlus />}
        >
          Create account
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}

import { CalendarClock, FlaskConical, Lock, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { DemoModuleKey, UserOut } from '@/api/types'
import { useDemoModules } from '@/queries/admin.queries'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/datetime'
import { DEMO_MODULE_LABEL, demoDaysLeft } from '@/lib/demo'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Field } from '@/components/forms/field'

/**
 * Demo accounts: the strip a demo student sees, the screen a locked module
 * shows, and the block the admin fills in on the user forms. The rules
 * themselves live in src/lib/demo.ts and, authoritatively, on the server.
 */

function daysLabel(days: number | null) {
  if (days == null) return null
  if (days <= 0) return 'Last day today'
  if (days === 1) return '1 day left'
  return `${days} days left`
}

/** Across the top of every page for a demo account. */
export function DemoBanner({ user }: { user: Pick<UserOut, 'demo_expires_on'> }) {
  const days = demoDaysLeft(user)
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-primary/25 bg-primary/8 px-4 py-2.5 text-sm">
      <Sparkles className="size-4 shrink-0 text-primary" />
      <span className="font-medium">You are using a demo account.</span>
      <span className="text-muted-foreground">
        Join your classes as usual; the other features unlock after admission.
        {user.demo_expires_on ? ` Access ends on ${formatDate(user.demo_expires_on)}.` : ''}
      </span>
      {daysLabel(days) && (
        <span className="ml-auto rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-semibold text-primary">
          {daysLabel(days)}
        </span>
      )}
    </div>
  )
}

/** In place of a page the demo account has not been given. */
export function DemoLockedScreen({ module, homeTo }: { module: DemoModuleKey; homeTo: string }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-border bg-card px-6 py-14 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-warning [&_svg]:size-7">
        <Lock />
      </div>
      <h2 className="mt-5 text-lg font-semibold">{DEMO_MODULE_LABEL[module]} is locked on your demo</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Your demo account includes your classes. {DEMO_MODULE_LABEL[module]} and the other
        features open once the admission is complete — or ask the school office to unlock it
        for your demo.
      </p>
      <Button asChild className="mt-6">
        <Link to={homeTo}>Back to my classes</Link>
      </Button>
    </div>
  )
}

export interface DemoAccessValue {
  is_demo: boolean
  demo_expires_on: string
  demo_modules: DemoModuleKey[]
}

export function demoAccessOf(user?: Partial<UserOut> | null): DemoAccessValue {
  return {
    is_demo: !!user?.is_demo,
    demo_expires_on: user?.demo_expires_on ?? '',
    demo_modules: (user?.demo_modules ?? []) as DemoModuleKey[],
  }
}

/** A problem with the demo settings, or null. Checked before the form submits. */
export function demoAccessProblem(value: DemoAccessValue): string | null {
  if (!value.is_demo) return null
  if (!value.demo_expires_on) return 'Choose the date the demo account ends.'
  const today = new Date().toISOString().slice(0, 10)
  if (value.demo_expires_on < today) return 'The demo end date cannot be in the past.'
  return null
}

/** The request fields; switching demo off sends just the flag. */
export function demoAccessPayload(value: DemoAccessValue) {
  return value.is_demo
    ? { is_demo: true, demo_expires_on: value.demo_expires_on, demo_modules: value.demo_modules }
    : { is_demo: false }
}

/**
 * The admin's demo block: the switch, the end date and the modules to unlock.
 * Classes are always included and say so, so nobody wonders whether a demo
 * student can actually join one.
 */
export function DemoAccessFields({
  value,
  onChange,
  error,
  compact,
}: {
  value: DemoAccessValue
  onChange: (next: DemoAccessValue) => void
  error?: string | null
  compact?: boolean
}) {
  const modules = useDemoModules(value.is_demo)
  const today = new Date().toISOString().slice(0, 10)
  const toggle = (key: DemoModuleKey, on: boolean) =>
    onChange({
      ...value,
      demo_modules: on
        ? [...value.demo_modules.filter((k) => k !== key), key]
        : value.demo_modules.filter((k) => k !== key),
    })

  return (
    <div className={cn('space-y-4', !compact && 'rounded-xl border border-border p-4')}>
      <label className="flex items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-medium">
            <FlaskConical className="size-4 text-primary" />
            Demo account
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            For a family trying the school before admission. Classes are open; every other
            module stays locked unless you unlock it below. The account and everything in it is
            deleted automatically after the end date.
          </span>
        </span>
        <Switch
          checked={value.is_demo}
          onCheckedChange={(on) =>
            onChange({
              ...value,
              is_demo: on,
              demo_expires_on:
                on && !value.demo_expires_on
                  ? new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
                  : value.demo_expires_on,
            })
          }
        />
      </label>

      {value.is_demo && (
        <>
          <Field
            id="demo_expires_on"
            label="Demo ends on"
            required
            error={error ?? undefined}
            hint="The account works through this day, then is deleted with its records."
          >
            <Input
              id="demo_expires_on"
              type="date"
              min={today}
              value={value.demo_expires_on}
              onChange={(e) => onChange({ ...value, demo_expires_on: e.target.value })}
            />
          </Field>

          <div>
            <p className="text-sm font-medium">Unlocked modules</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Classes, the timetable and live classes are always included.
            </p>
            <div className={cn('mt-2 grid gap-2', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')}>
              {(modules.data ?? []).map((module) => (
                <label
                  key={module.key}
                  className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={value.demo_modules.includes(module.key)}
                    onCheckedChange={(on) => toggle(module.key, on === true)}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{module.label}</span>
                    {!compact && (
                      <span className="block text-xs text-muted-foreground">{module.description}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** The admin's view of one demo account: when it ends and what it can open. */
export function DemoAccountCard({
  user,
  onChange,
}: {
  user: Pick<UserOut, 'is_demo' | 'demo_expires_on' | 'demo_modules'>
  onChange?: () => void
}) {
  if (!user.is_demo) return null
  const days = demoDaysLeft(user)
  const expired = days != null && days < 0
  const unlocked = (user.demo_modules ?? []).map((key) => DEMO_MODULE_LABEL[key] ?? key)
  return (
    <section
      className={cn(
        'rounded-xl border p-4',
        expired ? 'border-danger/30 bg-danger/8' : 'border-primary/25 bg-primary/8',
      )}
    >
      <div className="flex items-center gap-2">
        <FlaskConical className={cn('size-4', expired ? 'text-danger' : 'text-primary')} />
        <h3 className="text-sm font-semibold">Demo account</h3>
        {daysLabel(days) && !expired && (
          <span className="ml-auto rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {daysLabel(days)}
          </span>
        )}
      </div>
      <dl className="mt-3 grid gap-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarClock className="size-3.5" />
            Ends on
          </dt>
          <dd className="font-medium">{user.demo_expires_on ? formatDate(user.demo_expires_on) : '—'}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Can open</dt>
          <dd className="text-right font-medium">
            Classes{unlocked.length ? `, ${unlocked.join(', ')}` : ' only'}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {expired
          ? 'This demo has ended. The account can no longer sign in and will be deleted automatically within a few minutes.'
          : 'Deleted automatically, with its records, after the end date. Switch “Demo account” off under Edit to keep it as a normal account.'}
      </p>
      {onChange && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onChange}>
          Change demo settings
        </Button>
      )}
    </section>
  )
}

/** The small tag beside a demo account's name. */
export function DemoBadge({ user }: { user: Pick<UserOut, 'is_demo' | 'demo_expires_on'> }) {
  if (!user.is_demo) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      <FlaskConical className="size-3" />
      Demo{user.demo_expires_on ? ` · ends ${formatDate(user.demo_expires_on)}` : ''}
    </span>
  )
}

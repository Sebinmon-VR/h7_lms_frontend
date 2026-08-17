import * as React from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

/**
 * Layout for a form that owns its own route rather than a dialog.
 *
 * A modal is the wrong container for a decision the person has to reason about:
 * it hides the list they were reading, gives no room to explain what a choice
 * does, and cannot show them the consequence before they commit. These forms
 * get a page, a numbered set of steps down the left, and a summary panel on the
 * right that fills in as the choices are made.
 *
 * The summary is deliberately sticky — on a long form the whole point is that
 * the sentence describing what is about to happen stays in view while the
 * fields above it change.
 */
export function FormPage({
  title,
  description,
  backTo,
  backLabel,
  children,
  aside,
  footer,
}: {
  title: string
  description?: string
  backTo: string
  backLabel: string
  children: React.ReactNode
  aside?: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        to={backTo}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {backLabel}
      </Link>

      <div className="mt-3 mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">{children}</div>
        {/* The sticky element is the INNER div: grid items stretch to the row
            height, so putting `sticky` on the item itself leaves it nothing to
            travel within and it never actually sticks. */}
        {aside && (
          <div>
            <div className="lg:sticky lg:top-6">{aside}</div>
          </div>
        )}
      </div>

      {/* Sticky rather than fixed, and inside the page container: `fixed` would
          be positioned against the viewport and so span underneath the sidebar.
          Sticking to the bottom of the scroll area keeps the primary action
          reachable without ever scrolling back down a form that grew as it was
          filled in. */}
      <div className="sticky bottom-4 z-30 mt-8 flex items-center justify-end gap-2 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
        {footer}
      </div>
    </div>
  )
}

/** One numbered step of a form page. */
export function FormSection({
  step,
  title,
  description,
  className,
  children,
}: {
  step: number
  title: string
  description?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn('p-5 sm:p-6', className)}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary"
        >
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          <div className="mt-4 space-y-4">{children}</div>
        </div>
      </div>
    </Card>
  )
}

/** Cancel + submit pair, for the sticky footer. */
export function FormActions({
  cancelTo,
  submitLabel,
  submitIcon,
  disabled,
  loading,
  onSubmit,
}: {
  cancelTo: string
  submitLabel: string
  submitIcon?: React.ReactNode
  disabled?: boolean
  loading?: boolean
  onSubmit: () => void
}) {
  return (
    <>
      <Button asChild variant="ghost">
        <Link to={cancelTo}>Cancel</Link>
      </Button>
      <Button
        variant="primary"
        icon={submitIcon}
        disabled={disabled}
        loading={loading}
        onClick={onSubmit}
      >
        {submitLabel}
      </Button>
    </>
  )
}

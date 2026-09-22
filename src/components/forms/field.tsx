import { AlertCircle } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/cn'
import { Label } from '@/components/ui/label'

/**
 * Label + control + error/hint, so every form in the app lines up.
 *
 * The label is deliberately a notch SMALLER than the value it describes (13px
 * against the control's 14px). A form where the label and the input are the
 * same size has no hierarchy — the eye has to read both to find out which is
 * which, and a page of them is what makes a dense form feel like a wall.
 *
 * Hint and error occupy the same slot and never both show: an error supersedes
 * the advice that was meant to prevent it, and stacking the two pushes every
 * field below it down the moment validation runs.
 */
export function Field({
  id,
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-xs font-medium text-danger" role="alert">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/**
 * A titled block of related fields.
 *
 * Long forms — the user form, fee structures, notices — read as one
 * undifferentiated column without these. Grouping is what lets somebody scan
 * for "the bit about guardians" instead of reading every label.
 */
export function FieldGroup({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-4', className)}>
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description && (
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

/**
 * Two fields side by side, collapsing to one column on a phone.
 *
 * Exists so pages stop hand-writing `grid gap-4 sm:grid-cols-2` and drifting
 * apart on the gap — which is why some dialogs in this app breathe and others
 * do not.
 */
export function FieldRow({
  children,
  className,
  columns = 2,
}: {
  children: React.ReactNode
  className?: string
  columns?: 2 | 3
}) {
  return (
    <div
      className={cn(
        'grid gap-x-4 gap-y-5',
        columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * The form-level error banner.
 *
 * Was hand-written as a bare `<p>` in roughly fifteen dialogs, each with its
 * own guess at the padding — which is most of why two forms in this app never
 * looked quite the same. It also had no icon, so a server refusal read as a
 * sentence in red rather than as something that stopped the save.
 *
 * Renders nothing for an empty message, so callers can pass a possibly-null
 * error straight through instead of wrapping it in a conditional.
 */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/8 px-3.5 py-3 text-sm text-danger"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 leading-relaxed">{message}</span>
    </div>
  )
}

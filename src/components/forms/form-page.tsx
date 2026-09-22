import * as React from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'

/**
 * A record form, laid out the way an ERP lays one out.
 *
 * Three things distinguish this from the card-in-a-column shape it replaced,
 * and all three came from the same mistake — treating a data-entry screen like
 * a piece of marketing:
 *
 *  - **No card.** A bordered, rounded panel floating inside a page tells the
 *    reader "this is one object among several". A record form IS the screen, so
 *    it sits directly on it, full bleed, with section rules that run the whole
 *    width.
 *  - **Full width.** Capping the column at 5xl left a third of a wide screen
 *    empty while the fields inside it were squeezed two across. The available
 *    width is used, and short fields run three and four to a row.
 *  - **Actions in the header, not a floating bar.** A sticky footer hovering
 *    over the content covers the last field and reads as a cookie banner. Save
 *    and Cancel belong beside the title of the thing being saved.
 *
 * The guided, one-decision-per-step forms (`mapping-new`, `class-teacher-new`)
 * use the same component with `step` numbers on their sections. The layout
 * suits both, and maintaining two would guarantee they drifted.
 */
export function FormPage({
  title,
  description,
  backTo,
  backLabel,
  children,
  aside,
  footer,
  eyebrow,
  meta,
  error,
}: {
  title: string
  description?: string
  backTo: string
  backLabel: string
  children: React.ReactNode
  /** Contextual panel down the right. Omit for a plain record form. */
  aside?: React.ReactNode
  /** Cancel + submit. Rendered in the sticky header. */
  footer: React.ReactNode
  /** Small label above the title — what KIND of record this is. */
  eyebrow?: string
  /** Badges beside the title: status, identifiers, role. */
  meta?: React.ReactNode
  /**
   * Form-level failure, under the header and above the fields.
   *
   * Kept out of `children` so a server refusal cannot be mistaken for one more
   * field group — it is the thing that stopped the save, and it belongs where
   * the eye lands after pressing the button.
   */
  error?: React.ReactNode
}) {
  return (
    /* Negative margins pull the form out of the shell's page padding, so its
       rules meet the edges of the content area. That is what makes it read as
       the screen rather than as a box sitting on one. */
    <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
        <Link
          to={backTo}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {backLabel}
        </Link>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-2xs font-semibold uppercase tracking-wider text-primary">
                {eyebrow}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
              {meta}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">{footer}</div>
        </div>

        {description && (
          <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </header>

      {error && <div className="px-4 pt-5 sm:px-6">{error}</div>}

      <div className={cn('grid items-start', aside && 'xl:grid-cols-[minmax(0,1fr)_22rem]')}>
        <div className="divide-y divide-border">{children}</div>
        {aside && (
          <aside className="border-t border-border p-4 sm:p-6 xl:border-l xl:border-t-0">
            <div className="xl:sticky xl:top-28">{aside}</div>
          </aside>
        )}
      </div>
    </div>
  )
}

/**
 * One block of related fields.
 *
 * The heading is a small uppercase rule-label rather than a title with a
 * coloured disc beside it: somebody filling this in needs to find "the bit
 * about guardians" at a glance, not to read six section headers competing with
 * the page title.
 */
export function FormSection({
  step,
  icon,
  title,
  description,
  className,
  columns = 3,
  children,
}: {
  /**
   * Only on a guided flow, where there genuinely is an order. Omit on a record
   * form — somebody opens one to change a field in the middle, and numbering
   * the groups implies a sequence they are meant to follow.
   */
  step?: number
  /** Shown in place of the step number when there is no order to imply. */
  icon?: React.ReactNode
  title: string
  description?: string
  className?: string
  /** Fields per row above `lg`. Three suits short fields; one suits prose. */
  columns?: 1 | 2 | 3 | 4
  children: React.ReactNode
}) {
  return (
    <section className={cn('px-4 py-6 sm:px-6', className)}>
      <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-foreground">
          {step !== undefined && (
            <span
              aria-hidden
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[0.625rem] font-semibold text-primary"
            >
              {step}
            </span>
          )}
          {step === undefined && icon && (
            <span aria-hidden className="text-muted-foreground [&_svg]:size-3.5">
              {icon}
            </span>
          )}
          {title}
        </h2>
        {description && (
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      <div
        className={cn(
          columns === 1 && 'max-w-3xl space-y-5',
          columns === 2 && 'grid max-w-4xl gap-x-5 gap-y-5 sm:grid-cols-2',
          columns === 3 && 'grid gap-x-5 gap-y-5 sm:grid-cols-2 lg:grid-cols-3',
          columns === 4 && 'grid gap-x-5 gap-y-5 sm:grid-cols-2 lg:grid-cols-4',
        )}
      >
        {children}
      </div>
    </section>
  )
}

/** Cancel + submit, for the header. */
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
      <Button asChild variant="outline" size="sm">
        <Link to={cancelTo}>Cancel</Link>
      </Button>
      <Button
        variant="primary"
        size="sm"
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

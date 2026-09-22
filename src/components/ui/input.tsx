import * as React from 'react'
import { cn } from '@/lib/cn'

/**
 * The shared look of every text-entry control.
 *
 * Two deliberate departures from the app-wide focus rule in `index.css`:
 *
 *  - `focus-visible:ring-offset-0`. The global treatment sets a 2px ring with a
 *    2px offset, which suits a button but detaches from a field — it reads as a
 *    halo floating around the box rather than the box itself being active.
 *  - a soft 3px ring in the primary tint PLUS a solid border change. Colour
 *    alone fails for anyone who cannot distinguish it, and a ring alone is easy
 *    to lose against a card; together they are unambiguous either way.
 *
 * `hover:border-border-strong` is what makes a dense form feel responsive —
 * without it, a grid of inputs is inert until clicked.
 */
const fieldBase =
  'w-full rounded-md border border-input bg-card text-sm text-foreground shadow-xs transition-[color,background-color,border-color,box-shadow] placeholder:text-muted-foreground/60 hover:border-primary/35 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted/40 disabled:opacity-70'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  /** Icon rendered inside the field on the left. */
  leading?: React.ReactNode
  trailing?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, leading, trailing, ...props }, ref) => {
    const field = (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          fieldBase,
          'h-9.5 px-3.5 py-2',
          leading && 'pl-10',
          trailing && 'pr-10',
          invalid &&
            'border-danger hover:border-danger focus-visible:border-danger focus-visible:ring-danger/20',
          className,
        )}
        {...props}
      />
    )

    if (!leading && !trailing) return field

    return (
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
            {leading}
          </span>
        )}
        {field}
        {trailing && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
            {trailing}
          </span>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        fieldBase,
        'min-h-24 resize-y px-3.5 py-2.5 leading-relaxed',
        invalid &&
          'border-danger hover:border-danger focus-visible:border-danger focus-visible:ring-danger/20',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

export { fieldBase }

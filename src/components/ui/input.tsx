import * as React from 'react'
import { cn } from '@/lib/cn'

const fieldBase =
  'w-full rounded-md border border-input bg-card text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60'

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
          'h-9.5 px-3 py-2',
          leading && 'pl-9',
          trailing && 'pr-9',
          invalid && 'border-danger focus-visible:border-danger focus-visible:ring-danger',
          className,
        )}
        {...props}
      />
    )

    if (!leading && !trailing) return field

    return (
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
            {leading}
          </span>
        )}
        {field}
        {trailing && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
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
        'min-h-20 resize-y px-3 py-2',
        invalid && 'border-danger focus-visible:border-danger focus-visible:ring-danger',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

export { fieldBase }

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'

import { cn } from '@/lib/cn'

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean }
>(({ className, required, children, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      // 13px against the control's 14px. See `Field` for why the label is the
      // smaller of the two rather than the larger.
      'block text-[0.8125rem] font-semibold leading-none tracking-tight text-foreground/90',
      'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className,
    )}
    {...props}
  >
    {children}
    {required && (
      <span className="ml-1 font-normal text-danger" aria-hidden>
        *
      </span>
    )}
  </LabelPrimitive.Root>
))
Label.displayName = 'Label'

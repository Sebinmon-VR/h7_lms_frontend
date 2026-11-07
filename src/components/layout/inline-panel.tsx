import { X } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'

/**
 * A form that opens in the page instead of over it.
 *
 * The parts carry the same names as the Dialog parts in components/ui/dialog,
 * so a form written as a dialog moves into the page by changing its import:
 * `Dialog` renders nothing while closed and its children in place while open,
 * the header gets a close button, and the footer is a plain row of actions.
 * Escape closes it, as it would a dialog.
 */

const CloseContext = React.createContext<(open: boolean) => void>(() => {})

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}) {
  if (!open) return null
  return <CloseContext.Provider value={onOpenChange ?? (() => {})}>{children}</CloseContext.Provider>
}

export function DialogContent({
  className,
  children,
  // Dialog sizes mean nothing in the page; accepted so callers need not change.
  size: _size,
  ...props
}: React.HTMLAttributes<HTMLElement> & { size?: string }) {
  const close = React.useContext(CloseContext)
  const ref = React.useRef<HTMLElement>(null)
  React.useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])
  return (
    <section
      ref={ref}
      className={cn('flex flex-col border-y border-primary/25 bg-primary/[0.025]', className)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          close(false)
        }
      }}
      {...props}
    >
      {children}
    </section>
  )
}

export function DialogHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const close = React.useContext(CloseContext)
  return (
    <div className={cn('flex items-start justify-between gap-3 px-4 pt-4', className)} {...props}>
      <div className="min-w-0 space-y-0.5">{children}</div>
      <Button type="button" variant="ghost" size="icon-sm" onClick={() => close(false)} aria-label="Close">
        <X />
      </Button>
    </div>
  )
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-base font-medium text-foreground', className)} {...props} />
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('max-w-3xl text-xs text-muted-foreground', className)} {...props} />
}

export function DialogForm({ className, ...props }: React.FormHTMLAttributes<HTMLFormElement>) {
  return <form className={cn('flex flex-col', className)} {...props} />
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('max-w-4xl space-y-4 px-4 py-4', className)} {...props} />
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3', className)} {...props} />
}

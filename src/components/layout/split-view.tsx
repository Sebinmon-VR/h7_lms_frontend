import { Search } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/cn'
import { Input } from '@/components/ui/input'

/**
 * List + detail inside a workspace pane: a compact list on the left that
 * scrolls on its own, and whatever is picked from it on the right. Built for
 * panes that already have a fixed height (the parent sets `lg:h-full`).
 */
export function SplitView({ list, detail }: { list: React.ReactNode; detail: React.ReactNode }) {
  return (
    <div className="grid lg:h-full lg:grid-cols-[19rem_minmax(0,1fr)] lg:divide-x lg:divide-border">
      <div className="flex flex-col border-b border-border lg:min-h-0 lg:border-b-0">{list}</div>
      <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto">{detail}</div>
    </div>
  )
}

/** The list side: a toolbar (search, filters, add), the rows, and a count line. */
export function ListPane({
  toolbar,
  footer,
  children,
}: {
  toolbar: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <>
      <div className="space-y-2 border-b border-border px-4 py-2.5">{toolbar}</div>
      <div className="max-h-96 overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">{children}</div>
      {footer && <div className="border-t border-border bg-muted/30 px-4 py-1.5 text-[11px] text-muted-foreground">{footer}</div>}
    </>
  )
}

export function ListSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 px-2.5 py-1 pl-8 text-sm"
      />
    </div>
  )
}

export function ListItem({
  active,
  onClick,
  title,
  sub,
  right,
  muted,
}: {
  active: boolean
  onClick: () => void
  title: React.ReactNode
  sub?: React.ReactNode
  right?: React.ReactNode
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'relative flex w-full items-center gap-3 border-b border-border px-4 py-2 text-left transition-colors',
        active ? 'bg-primary/[0.06]' : 'hover:bg-muted/40',
      )}
    >
      {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-sm',
            active ? 'font-medium text-primary' : muted ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {title}
        </span>
        {sub && <span className="block truncate text-[11px] text-muted-foreground">{sub}</span>}
      </span>
      {right != null && <span className="shrink-0 text-right text-xs">{right}</span>}
    </button>
  )
}

export function ListEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{children}</p>
}

/** The top of the detail side: what it is, its badges, and its actions. */
export function DetailHeader({
  title,
  badges,
  sub,
  actions,
}: {
  title: React.ReactNode
  badges?: React.ReactNode
  sub?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-medium leading-tight text-foreground">{title}</h3>
          {badges}
        </div>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  )
}

/** A grid of label-over-value facts under the header. */
export function Facts({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn('grid grid-cols-2 gap-x-6 gap-y-3 border-b border-border px-5 py-4 sm:grid-cols-3', className)}>{children}</dl>
}

export function Fact({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'col-span-2 sm:col-span-3')}>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  )
}

/** A titled part of the detail side, its heading a thin grey strip. */
export function DetailSection({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-1.5">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Table cell paddings that line up with the detail side's 20px gutter. */
export const DETAIL_TH = 'border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground'

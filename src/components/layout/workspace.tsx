import type { LucideIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/cn'

/*
 * The admin workspace layout: white bands that run edge to edge with
 * hairlines between them, instead of rounded cards floating on the page.
 * Reports and Enquiries share these so the two read as one product.
 *
 * Colour carries meaning here, never decoration: a tone names a status
 * (indigo for what is waiting on the office, sky for in progress, amber for
 * waiting, green for done, red for a problem) and is used the same way on
 * tabs, figures and stages.
 */

export type Tone = 'primary' | 'info' | 'warning' | 'success' | 'danger' | 'neutral'

/** Solid fill for each tone: dots, bars, the accent along a figure. */
export const TONE_FILL: Record<Tone, string> = {
  primary: 'bg-primary',
  info: 'bg-info',
  warning: 'bg-warning',
  success: 'bg-success',
  danger: 'bg-danger',
  neutral: 'bg-muted-foreground/40',
}

/** Text in each tone, for a figure or count that should carry it. */
export const TONE_TEXT: Record<Tone, string> = {
  primary: 'text-primary',
  info: 'text-info',
  warning: 'text-warning',
  success: 'text-success',
  danger: 'text-danger',
  neutral: 'text-muted-foreground',
}

/**
 * A white strip that runs to the edges of the content area, the way a toolbar
 * does. The negative margins match the shell's own padding.
 */
export function Band({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('-mx-4 bg-card px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8', className)}>{children}</div>
}

/**
 * The page head: title and description on the left, actions on the right,
 * then the tab strip ruled off underneath. Sits flush with the top bar.
 */
export function WorkspaceHeader({
  title,
  description,
  icon: Icon,
  actions,
  children,
  tabs,
}: {
  title: string
  description?: string
  /** Shown in a soft indigo square beside the title. */
  icon?: LucideIcon
  actions?: React.ReactNode
  /** Anything between the title and the tabs, like a progress line. */
  children?: React.ReactNode
  tabs?: React.ReactNode
}) {
  return (
    <Band className="-mt-6 border-b border-border">
      <header className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {Icon && (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" strokeWidth={1.75} />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-medium tracking-tight text-foreground">{title}</h1>
            {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">{actions}</div>}
      </header>
      {children}
      {tabs}
    </Band>
  )
}

/**
 * The tab row: its own strip under a rule, each tab in a slot divided from the
 * next, the selected one shaded with an accent bar along its foot. Counts sit
 * in small tags; a count marked `alert` turns red when it is above zero.
 */
export function TabStrip<K extends string>({
  label,
  value,
  onChange,
  tabs,
  trailing,
  idPrefix = 'tab',
}: {
  label: string
  value: K
  onChange: (key: K) => void
  tabs: { key: K; label: string; count?: number; alert?: boolean; tone?: Tone }[]
  /** Quiet text at the right end of the strip, like "Updated 2 min ago". */
  trailing?: React.ReactNode
  idPrefix?: string
}) {
  return (
    <div className="-mx-4 flex items-stretch justify-between gap-4 border-t border-border px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div
        role="tablist"
        aria-label={label}
        className="-ml-px flex min-w-0 items-stretch divide-x divide-border overflow-x-auto border-x border-border [scrollbar-width:none]"
      >
        {tabs.map((t) => {
          const active = value === t.key
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`${idPrefix}-${t.key}`}
              aria-selected={active}
              aria-controls={`${idPrefix}-panel`}
              onClick={() => onChange(t.key)}
              className={cn(
                'relative inline-flex h-11 shrink-0 items-center gap-2 px-5 text-sm transition-colors',
                active
                  ? 'bg-muted/50 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
              )}
            >
              {t.tone && <span className={cn('size-2 shrink-0 rounded-full', TONE_FILL[t.tone])} aria-hidden />}
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    'rounded px-1.5 text-xs tabular-nums',
                    t.alert && t.count > 0
                      ? 'bg-danger/10 font-medium text-danger'
                      : active
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {t.count}
                </span>
              )}
              {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" aria-hidden />}
            </button>
          )
        })}
      </div>
      {trailing && <span className="hidden shrink-0 items-center text-xs text-muted-foreground sm:flex">{trailing}</span>}
    </div>
  )
}

/** One figure in the strip: label over number, context beside the number. */
export function Figure({
  label,
  value,
  context,
  alert,
  tone,
}: {
  label: string
  value: string
  context?: string
  alert?: boolean
  /** A short bar in this tone along the top of the figure, and the label's dot. */
  tone?: Tone
}) {
  return (
    <div className="group/figure relative min-w-0 px-5 py-3 first:pl-0">
      {tone && (
        <span
          className={cn('absolute left-5 top-0 h-0.5 w-8 rounded-full group-first/figure:left-0', TONE_FILL[tone])}
          aria-hidden
        />
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {tone && <span className={cn('size-1.5 shrink-0 rounded-full', TONE_FILL[tone])} aria-hidden />}
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className={cn('text-2xl font-medium leading-none tabular-nums', alert ? 'text-danger' : 'text-foreground')}>
          {value}
        </span>
        {context && <span className="truncate text-xs text-muted-foreground">{context}</span>}
      </p>
    </div>
  )
}

/** The figure row: one white band under the tabs, figures divided by hairlines. */
export function Figures({ children }: { children: React.ReactNode }) {
  return (
    <Band className="border-b border-border">
      <div className="grid grid-cols-2 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none lg:divide-x lg:divide-border">
        {children}
      </div>
    </Band>
  )
}

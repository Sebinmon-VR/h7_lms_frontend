import * as React from 'react'

import { cn } from '@/lib/cn'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useChartPalette } from './use-chart-palette'

export function ChartCard({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className={cn('flex-1', bodyClassName)}>{children}</CardContent>
    </Card>
  )
}

/** Themed tooltip body shared by every chart. */
export function ChartTooltipContent({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string | number }[]
  label?: string | number
  formatter?: (value: number | string, name: string) => string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      {label != null && <p className="mb-1 text-xs font-medium text-foreground">{label}</p>}
      <div className="space-y-0.5">
        {payload.map((entry, i) => {
          const name = entry.name ?? String(entry.dataKey ?? '')
          const value = entry.value ?? 0
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="size-2 shrink-0 rounded-full" style={{ background: entry.color }} aria-hidden />
              <span className="text-muted-foreground">{name}</span>
              <span className="ml-auto font-medium tabular-nums text-foreground">
                {formatter ? formatter(value, name) : value}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Legend that matches the tooltip's visual language. */
export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: item.color }} aria-hidden />
          {item.label}
        </span>
      ))}
    </div>
  )
}

export { useChartPalette }

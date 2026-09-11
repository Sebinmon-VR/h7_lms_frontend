import * as React from 'react'

import type { ApiDate } from '@/api/types'
import { shiftApiDate, todayApiDate } from '@/lib/datetime'
import { DatePicker } from '@/components/ui/date-picker'
import { Segmented } from '@/components/ui/segmented'

/**
 * The reporting window shared by every tuition report and billing screen.
 *
 * A window is always sent, never left to the server's default. The reports and
 * the invoices count the same classes, and an admin who reads a report over
 * one period and then bills over another has produced a bill they cannot
 * explain — so the two screens use one control with one meaning.
 */

export type PeriodPreset = '7d' | '30d' | 'month' | 'custom'

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
]

/** First of the current month, in the browser's own calendar. */
function startOfMonth(): ApiDate {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
}

export function resolvePeriod(preset: PeriodPreset): { from: ApiDate; to: ApiDate } {
  const today = todayApiDate()
  switch (preset) {
    case '7d':
      return { from: shiftApiDate(today, -6), to: today }
    case 'month':
      return { from: startOfMonth(), to: today }
    case '30d':
    default:
      return { from: shiftApiDate(today, -29), to: today }
  }
}

/**
 * Holds the window, defaulting to the last 30 days.
 *
 * Thirty rather than seven: a one-to-one student typically has one or two
 * classes a week, so a seven-day window frequently shows a single class and
 * an attendance percentage of 0 or 100 that means nothing.
 */
export function useReportPeriod(initial: PeriodPreset = '30d') {
  const [preset, setPreset] = React.useState<PeriodPreset>(initial)
  const [range, setRange] = React.useState(() => resolvePeriod(initial))

  const setPeriod = React.useCallback((next: { preset: PeriodPreset; from: ApiDate; to: ApiDate }) => {
    setPreset(next.preset)
    setRange({ from: next.from, to: next.to })
  }, [])

  return { preset, from: range.from, to: range.to, setPeriod }
}

export function PeriodPicker({
  from,
  to,
  onChange,
}: {
  from: ApiDate
  to: ApiDate
  onChange: (next: { preset: PeriodPreset; from: ApiDate; to: ApiDate }) => void
}) {
  // Derived rather than stored: whichever preset the current dates match IS
  // the active preset, so editing a date back onto a preset re-selects it.
  const active: PeriodPreset =
    (['7d', '30d', 'month'] as PeriodPreset[]).find((p) => {
      const range = resolvePeriod(p)
      return range.from === from && range.to === to
    }) ?? 'custom'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        layoutId="tuition-period"
        size="sm"
        aria-label="Reporting period"
        value={active}
        options={PRESETS}
        onChange={(preset) => {
          if (preset === 'custom') {
            onChange({ preset, from, to })
            return
          }
          onChange({ preset, ...resolvePeriod(preset) })
        }}
      />
      {active === 'custom' && (
        <div className="flex items-center gap-1.5">
          <DatePicker
            value={from}
            onChange={(value) => value && onChange({ preset: 'custom', from: value, to })}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <DatePicker
            value={to}
            onChange={(value) => value && onChange({ preset: 'custom', from, to: value })}
          />
        </div>
      )}
    </div>
  )
}

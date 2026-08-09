import * as React from 'react'

import { useTheme } from '@/providers/theme-provider'

/**
 * Recharts cannot consume `var(--token)` inside gradient defs and stroke
 * props reliably, so we read the computed values once per theme change and
 * hand concrete `hsl(...)` strings to the charts. One layout read, one source
 * of truth — charts always match the rest of the UI.
 */
export interface ChartPalette {
  series: string[]
  grid: string
  axis: string
  tooltipBg: string
  tooltipBorder: string
  primary: string
  accent: string
  success: string
  warning: string
  danger: string
  info: string
  muted: string
  status: { PRESENT: string; ABSENT: string; LATE: string; EXCUSED: string }
}

function readToken(styles: CSSStyleDeclaration, name: string, alpha?: number): string {
  const raw = styles.getPropertyValue(name).trim()
  if (!raw) return 'hsl(0 0% 50%)'
  return alpha == null ? `hsl(${raw})` : `hsl(${raw} / ${alpha})`
}

export function useChartPalette(): ChartPalette {
  const { version, resolved } = useTheme()

  return React.useMemo(() => {
    const styles = getComputedStyle(document.documentElement)
    return {
      series: [1, 2, 3, 4, 5, 6].map((i) => readToken(styles, `--chart-${i}`)),
      grid: readToken(styles, '--border', 0.6),
      axis: readToken(styles, '--muted-foreground'),
      tooltipBg: readToken(styles, '--card'),
      tooltipBorder: readToken(styles, '--border'),
      primary: readToken(styles, '--primary'),
      accent: readToken(styles, '--accent'),
      success: readToken(styles, '--success'),
      warning: readToken(styles, '--warning'),
      danger: readToken(styles, '--danger'),
      info: readToken(styles, '--info'),
      muted: readToken(styles, '--muted'),
      status: {
        PRESENT: readToken(styles, '--status-present'),
        ABSENT: readToken(styles, '--status-absent'),
        LATE: readToken(styles, '--status-late'),
        EXCUSED: readToken(styles, '--status-excused'),
      },
    }
    // `resolved` is in the deps so a system-theme flip re-reads too.
  }, [version, resolved])
}

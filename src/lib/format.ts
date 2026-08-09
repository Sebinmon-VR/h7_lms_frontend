/** Presentation helpers. Nothing here touches the network or dates. */

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name
    .replace(/\b(dr|prof|mr|mrs|ms|miss)\.?\s/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Coerce anything numeric-ish to a finite number, or null.
 *
 * Form controls hand back strings and the API can send nulls, so every
 * numeric formatter goes through this rather than trusting its input — a
 * `.toFixed()` on a string throws and takes the whole page down.
 */
function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function formatNumber(value: number | null | undefined): string {
  const n = toFiniteNumber(value)
  if (n === null) return '—'
  return new Intl.NumberFormat().format(n)
}

/** Percentages arrive from the API on a 0–100 scale. */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  const n = toFiniteNumber(value)
  if (n === null) return '—'
  const rounded = Number(n.toFixed(digits))
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(digits)}%`
}

export function formatMarks(obtained: number, max: number): string {
  const fmt = (value: number) => {
    const n = toFiniteNumber(value)
    if (n === null) return '—'
    return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  }
  return `${fmt(obtained)} / ${fmt(max)}`
}

/** Backend stores no computed percentage — this is the single formula. */
export function gradePercentage(obtained: number, max: number): number {
  const o = toFiniteNumber(obtained)
  const m = toFiniteNumber(max)
  if (o === null || m === null || m <= 0) return 0
  return (o / m) * 100
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}

export function countLabel(count: number, singular: string, plural?: string): string {
  return `${formatNumber(count)} ${pluralize(count, singular, plural)}`
}

/**
 * IDs are 13-digit epoch-millisecond integers. They must never be shown as
 * if they were a roll number, so anywhere one has to surface we show a short
 * stable suffix instead.
 */
export function shortId(id: number | string): string {
  return `#${String(id).slice(-6)}`
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

/** Title-cases an UPPER_SNAKE or lowercase token for display. */
export function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Buckets a 0–100 percentage into a semantic tone used across the UI. */
export type PerfTone = 'success' | 'warning' | 'danger' | 'muted'

export function performanceTone(percent: number | null | undefined): PerfTone {
  const n = toFiniteNumber(percent)
  if (n === null) return 'muted'
  if (n >= 75) return 'success'
  if (n >= 40) return 'warning'
  return 'danger'
}

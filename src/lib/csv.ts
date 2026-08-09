/**
 * CSV export. The backend has no reporting endpoints beyond the monitoring
 * summary, so every table offers "export what you're looking at" instead.
 */

export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

function escapeCell(value: string | number | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  // Guard against spreadsheet formula injection on untrusted text.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => escapeCell(c.header)).join(',')
  const body = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(','))
  return [head, ...body].join('\r\n')
}

export function downloadCsv(filename: string, contents: string) {
  // BOM so Excel reads UTF-8 correctly.
  const blob = new Blob([`﻿${contents}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  downloadCsv(filename, toCsv(rows, columns))
}

// ------------------------------------------------------------------ import

/**
 * Parses CSV text into rows of cells.
 *
 * A hand-rolled parser rather than `split(',')`, because real spreadsheet
 * exports contain quoted fields with embedded commas, newlines and doubled
 * quotes — splitting would silently corrupt exactly the rows a user most needs
 * imported correctly. Handles CRLF and LF, and a trailing newline.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  // Strip a UTF-8 BOM; Excel writes one and it would otherwise become part
  // of the first header name.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      // Consume the LF of a CRLF pair so it does not open an empty row.
      if (char === '\r' && input[i + 1] === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  // Whatever is buffered when input ends is the final cell, unless the file
  // ended on a newline and left nothing behind.
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows
}

/**
 * Parses CSV into objects keyed by a normalised header name.
 *
 * Headers are lowercased with non-alphanumerics collapsed to `_`, so
 * `"Full Name"`, `full_name` and `FULL-NAME` all resolve to `full_name` — an
 * import should not fail because someone capitalised a column.
 */
export function parseCsvObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const raw = parseCsv(text).filter((row) => row.some((cell) => cell.trim() !== ''))
  if (raw.length === 0) return { headers: [], rows: [] }

  const headers = raw[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))

  const rows = raw.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, i) => [header, (cells[i] ?? '').trim()])),
  )

  return { headers, rows }
}

/** "users-2026-08-08.csv" */
export function timestampedFilename(base: string): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
  return `${base}-${stamp}.csv`
}

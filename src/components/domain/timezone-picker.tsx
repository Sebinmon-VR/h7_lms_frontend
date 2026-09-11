import * as React from 'react'

import { Combobox } from '@/components/ui/combobox'

/**
 * Picks an IANA timezone.
 *
 * A dropdown rather than a text box, because the backend validates the value
 * against the IANA database and rejects anything else with a 400 — so a typed
 * "Asia/Dubay" is a failed save discovered after the fact, and there is no way
 * for someone to know the exact spelling of a zone they have never typed.
 *
 * The list comes from the browser, not a bundled table: `Intl.supportedValuesOf`
 * returns exactly the zones this runtime knows, which is the same database the
 * server validates against. A hard-coded list would drift as zones are added
 * and renamed, and would be several kilobytes of payload to do it.
 */

/**
 * Every zone this browser knows, with the current UTC offset alongside.
 *
 * Computed once at module load: it is a few hundred entries and the formatting
 * is not free, but the answer only changes when the clocks do. Falls back to a
 * short list on a runtime without `supportedValuesOf` (Safari before 15.4),
 * where an empty dropdown would be worse than a partial one.
 */
const FALLBACK_ZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
]

/** "GMT+5:30" for a zone, or null when the runtime cannot format it. */
function offsetLabel(zone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? null
  } catch {
    return null
  }
}

const ZONES: { value: string; label: string; hint?: string }[] = (() => {
  let names: string[]
  try {
    // `supportedValuesOf` is missing on older Safari and some embedded runtimes.
    names = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.(
      'timeZone',
    ) ?? FALLBACK_ZONES
  } catch {
    names = FALLBACK_ZONES
  }

  return names.map((zone) => {
    const offset = offsetLabel(zone)
    return {
      value: zone,
      // The city is what people search for; the region prefix is noise in the
      // label but stays searchable through `keywords`.
      label: zone.replace(/_/g, ' '),
      hint: offset ?? undefined,
    }
  })
})()

/** The browser's own zone — offered as the obvious first choice. */
export const BROWSER_ZONE: string | null = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
})()

export function TimezonePicker({
  value,
  onChange,
  id,
  disabled,
  /** Label for the empty option. Omit to make the field required. */
  clearLabel,
  /** Pinned to the top, e.g. the zone the browser reports. */
  suggested,
}: {
  value: string | null
  onChange: (zone: string | null) => void
  id?: string
  disabled?: boolean
  clearLabel?: string
  suggested?: string | null
}) {
  const options = React.useMemo(() => {
    const rest = ZONES.filter((z) => z.value !== suggested)
    const head: { value: string; label: string; hint?: string }[] = []

    if (clearLabel) head.push({ value: '', label: clearLabel })
    if (suggested) {
      const known = ZONES.find((z) => z.value === suggested)
      head.push({
        value: suggested,
        label: known?.label ?? suggested.replace(/_/g, ' '),
        hint: known?.hint ? `${known.hint} · detected` : 'detected',
      })
    }
    return [...head, ...rest]
  }, [clearLabel, suggested])

  return (
    <Combobox
      id={id}
      disabled={disabled}
      value={value ?? (clearLabel ? '' : null)}
      onChange={(next) => onChange(next || null)}
      options={options}
      placeholder="Choose a timezone…"
      searchPlaceholder="Search e.g. Kolkata, London, GMT…"
      emptyMessage="No zone matches that."
    />
  )
}

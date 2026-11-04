import { cn } from '@/lib/cn'

export interface ClassChipOption {
  value: string
  label: string
}

/**
 * One chip per class, so a page shows a single class's records at a time.
 *
 * With `allowAll`, an "All classes" chip sits first and clears the choice (`null`). Students
 * pass `allowAll={false}`: their pages are always scoped to one class.
 */
export function ClassChips({
  options,
  value,
  onChange,
  allowAll = false,
  allLabel = 'All classes',
  label = 'Class',
}: {
  options: ClassChipOption[]
  value: string | null
  onChange: (value: string | null) => void
  allowAll?: boolean
  allLabel?: string
  label?: string
}) {
  const chip = (active: boolean) =>
    cn(
      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
      active
        ? 'border-primary bg-primary/12 text-primary'
        : 'border-border text-muted-foreground hover:border-primary/40',
    )

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {allowAll && (
        <button
          type="button"
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          className={chip(value === null)}
        >
          {allLabel}
        </button>
      )}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={chip(value === option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

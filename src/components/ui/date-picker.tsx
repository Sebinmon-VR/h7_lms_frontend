import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/cn'
import { formatDate, parseApiDate, toApiDate } from '@/lib/datetime'
import { Button } from './button'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

const dayPickerClassNames = {
  months: 'flex flex-col',
  month: 'space-y-3',
  month_caption: 'flex items-center justify-center h-8 relative',
  caption_label: 'text-sm font-semibold',
  nav: 'flex items-center gap-1 absolute right-1 top-1 z-10',
  button_previous:
    'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40',
  button_next:
    'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40',
  month_grid: 'w-full border-collapse',
  weekdays: 'flex',
  weekday: 'w-9 text-2xs font-medium uppercase tracking-wide text-muted-foreground',
  week: 'flex w-full mt-1',
  day: 'size-9 p-0',
  day_button:
    'inline-flex size-9 items-center justify-center rounded-md text-sm transition-colors hover:bg-muted aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:hover:bg-primary',
  today: 'font-semibold text-primary',
  outside: 'text-muted-foreground/40',
  disabled: 'text-muted-foreground/30 pointer-events-none',
  hidden: 'invisible',
}

export interface DatePickerProps {
  /** "YYYY-MM-DD" or null. */
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  /** Blocks selection after today — used where future dates make no sense. */
  maxToday?: boolean
  className?: string
  id?: string
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled,
  invalid,
  maxToday,
  className,
  id,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = parseApiDate(value) ?? undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={cn(
            'flex h-9.5 w-full items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-60',
            invalid && 'border-danger',
            className,
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn('truncate', !selected && 'text-muted-foreground/70')}>
            {selected ? formatDate(selected) : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3">
        <DayPicker
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            onChange(d ? toApiDate(d) : null)
            setOpen(false)
          }}
          disabled={maxToday ? { after: new Date() } : undefined}
          showOutsideDays
          classNames={dayPickerClassNames}
          components={{
            Chevron: ({ orientation }) =>
              orientation === 'left' ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />,
          }}
        />
        <div className="mt-2 flex justify-between border-t border-border pt-2">
          <Button variant="ghost" size="xs" onClick={() => { onChange(toApiDate(new Date())); setOpen(false) }}>
            Today
          </Button>
          {value && (
            <Button variant="ghost" size="xs" onClick={() => { onChange(null); setOpen(false) }}>
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Date + time, kept as two native-feeling controls rather than one exotic
 * widget. Value is an ISO instant; empty string means unset.
 */
export function DateTimePicker({
  value,
  onChange,
  disabled,
  invalid,
  id,
}: {
  value: string | null
  onChange: (iso: string | null) => void
  disabled?: boolean
  invalid?: boolean
  id?: string
}) {
  // `datetime-local` wants "YYYY-MM-DDTHH:mm" in LOCAL time.
  const localValue = React.useMemo(() => {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
      d.getMinutes(),
    )}`
  }, [value])

  return (
    <input
      id={id}
      type="datetime-local"
      value={localValue}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      onChange={(e) => {
        const raw = e.target.value
        if (!raw) return onChange(null)
        const d = new Date(raw)
        onChange(Number.isNaN(d.getTime()) ? null : d.toISOString())
      }}
      className={cn(
        'h-9.5 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        invalid && 'border-danger',
      )}
    />
  )
}

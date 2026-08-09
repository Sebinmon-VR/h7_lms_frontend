import * as React from 'react'
import { Command } from 'cmdk'
import { Check, ChevronsUpDown, Search } from 'lucide-react'

import { cn } from '@/lib/cn'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

export interface ComboboxOption {
  value: string
  label: string
  /** Secondary line shown under the label (email, code, ...). */
  hint?: string
  /** Extra text folded into matching without being displayed. */
  keywords?: string
  disabled?: boolean
}

export interface ComboboxProps {
  value: string | null
  onChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  id?: string
}

/**
 * Searchable single-select. Necessary because the backend has no server-side
 * search — pickers must stay usable over an entire unpaginated collection.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches.',
  disabled,
  invalid,
  className,
  id,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            'flex h-9.5 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-60',
            invalid && 'border-danger',
            className,
          )}
        >
          <span className={cn('truncate text-left', !selected && 'text-muted-foreground/70')}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command
          className="overflow-hidden rounded-lg"
          filter={(itemValue, search, keywords) => {
            const haystack = `${itemValue} ${keywords?.join(' ') ?? ''}`.toLowerCase()
            const needles = search.toLowerCase().split(/\s+/).filter(Boolean)
            return needles.every((n) => haystack.includes(n)) ? 1 : 0
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              placeholder={searchPlaceholder}
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
          </div>
          <Command.List className="max-h-64 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </Command.Empty>
            {options.map((opt) => (
              <Command.Item
                key={opt.value}
                value={opt.label}
                keywords={[opt.hint ?? '', opt.keywords ?? '']}
                disabled={opt.disabled}
                onSelect={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none',
                  'data-[selected=true]:bg-primary/10 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
                )}
              >
                <Check
                  className={cn('size-4 shrink-0 text-primary', opt.value === value ? 'opacity-100' : 'opacity-0')}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{opt.label}</span>
                  {opt.hint && (
                    <span className="block truncate text-xs text-muted-foreground">{opt.hint}</span>
                  )}
                </span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

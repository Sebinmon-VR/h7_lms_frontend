import type { Table } from '@tanstack/react-table'
import { Check, ListFilter } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

export interface FacetOption {
  value: string
  label: string
  icon?: React.ReactNode
}

export interface FacetConfig<T> {
  columnId: string
  label: string
  options: FacetOption[]
  /** Present so the config is generic over the row type. */
  __row?: T
}

/** Multi-select column filter with live counts from the faceted row model. */
export function DataTableFacetFilter<T>({
  table,
  facet,
}: {
  table: Table<T>
  facet: FacetConfig<T>
}) {
  const column = table.getColumn(facet.columnId)
  if (!column) return null

  const facetCounts = column.getFacetedUniqueValues()
  const selected = new Set((column.getFilterValue() as string[]) ?? [])

  const toggle = (value: string) => {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    column.setFilterValue(next.size ? [...next] : undefined)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" icon={<ListFilter />} className="border-dashed">
          {facet.label}
          {selected.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-1 h-4" />
              <Badge tone="primary" size="sm">
                {selected.size}
              </Badge>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1">
        <div className="max-h-64 overflow-y-auto">
          {facet.options.map((option) => {
            const isSelected = selected.has(option.value)
            const count = facetCounts.get(option.value) ?? 0
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
              >
                <span
                  className={cn(
                    'flex size-4 items-center justify-center rounded border',
                    isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                  )}
                >
                  {isSelected && <Check className="size-3" />}
                </span>
                {option.icon}
                <span className="flex-1 truncate text-left">{option.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
              </button>
            )
          })}
        </div>
        {selected.size > 0 && (
          <>
            <Separator className="my-1" />
            <Button
              variant="ghost"
              size="sm"
              block
              onClick={() => column.setFilterValue(undefined)}
            >
              Clear
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

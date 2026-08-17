import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type Table as TanstackTable,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Download,
  Search,
  X,
} from 'lucide-react'

import { cn } from '@/lib/cn'
import { exportCsv, timestampedFilename, type CsvColumn } from '@/lib/csv'
import { useDebouncedValue } from '@/lib/hooks'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ErrorState, NoResults } from '@/components/feedback/states'
import { DataTableFacetFilter, type FacetConfig } from './facet-filter'

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[] | undefined
  getRowId?: (row: T) => string
  isLoading?: boolean
  error?: unknown
  onRetry?: () => void

  searchPlaceholder?: string
  /** Values folded into the global search for each row. */
  searchValues?: (row: T) => (string | number | null | undefined)[]

  facets?: FacetConfig<T>[]
  initialSorting?: SortingState
  pageSize?: number
  stickyHeader?: boolean
  /** Rendered when the dataset itself is empty (as opposed to filtered out). */
  emptyState?: React.ReactNode
  /** Extra controls on the right of the toolbar. */
  toolbar?: React.ReactNode
  onRowClick?: (row: T) => void
  /** Enables the CSV button; exports the filtered + sorted rows. */
  csv?: { filename: string; columns: CsvColumn<T>[] }
  className?: string
  /** Card renderer used below `md`, where a wide table is unusable. */
  renderCard?: (row: T) => React.ReactNode

  /**
   * Mirrors the search box into a URL query parameter, so the command palette
   * and any other deep link can land on a pre-filtered table. Requires
   * `searchValues`. Use one key per page — two synced tables on the same route
   * would fight over it.
   */
  searchParamKey?: string

  /**
   * Enables multi-select with a checkbox column and a selection action bar.
   * `getRowId` is required alongside it: selection is keyed by row id, and
   * without a stable one the selection would follow row *positions* and point
   * at the wrong records after a sort or filter.
   */
  bulkActions?: {
    /** Rendered in the action bar; receives the currently selected rows. */
    render: (selected: T[], clear: () => void) => React.ReactNode
    /** Rows that cannot be selected, e.g. ones the user does not own. */
    isSelectable?: (row: T) => boolean
  }
}

const PAGE_SIZES = [10, 25, 50, 100]

export function DataTable<T>({
  columns,
  data,
  getRowId,
  isLoading,
  error,
  onRetry,
  searchPlaceholder = 'Search…',
  searchValues,
  facets = [],
  initialSorting = [],
  pageSize = 25,
  stickyHeader = true,
  emptyState,
  toolbar,
  onRowClick,
  csv,
  className,
  renderCard,
  searchParamKey,
  bulkActions,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting)
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  /**
   * Pagination is CONTROLLED here rather than left to the table's own state.
   *
   * Uncontrolled, `autoResetPageIndex` snaps back to page 1 every time the
   * `data` array changes identity — and it does that on any parent re-render
   * while a search is active, and on every background refetch, because a
   * refetch hands back a fresh array even when nothing about it differs. The
   * effect was that paging past the first page of a long list simply did not
   * stick. Owning the state lets us reset deliberately (below) instead.
   */
  const [pagination, setPagination] = React.useState<PaginationState>(() => ({
    pageIndex: 0,
    pageSize,
  }))
  const [searchParams, setSearchParams] = useSearchParams()

  // Seed from the URL so a deep link arrives pre-filtered.
  const [search, setSearch] = React.useState(
    () => (searchParamKey ? (searchParams.get(searchParamKey) ?? '') : ''),
  )
  const debouncedSearch = useDebouncedValue(search, 150)

  /**
   * Follow the URL when it changes underneath us — the palette can deep-link
   * to a route we are already on, which re-renders without remounting, so the
   * initial state above would never run again.
   */
  const urlSearch = searchParamKey ? (searchParams.get(searchParamKey) ?? '') : ''
  React.useEffect(() => {
    if (searchParamKey) setSearch(urlSearch)
  }, [searchParamKey, urlSearch])

  // Write back, debounced and replacing history, so typing does not stack up
  // one history entry per keystroke.
  React.useEffect(() => {
    if (!searchParamKey) return
    const current = searchParams.get(searchParamKey) ?? ''
    if (current === debouncedSearch) return
    const next = new URLSearchParams(searchParams)
    if (debouncedSearch) next.set(searchParamKey, debouncedSearch)
    else next.delete(searchParamKey)
    setSearchParams(next, { replace: true })
    // searchParams/setSearchParams are stable enough per render for this to be
    // driven purely by the debounced value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, searchParamKey])

  const rows = React.useMemo(() => data ?? [], [data])

  /**
   * Token-AND substring matching over the declared searchable values.
   * Predictable beats fuzzy for names, emails and codes.
   */
  const filteredBySearch = React.useMemo(() => {
    const needles = debouncedSearch.toLowerCase().split(/\s+/).filter(Boolean)
    if (needles.length === 0 || !searchValues) return rows
    return rows.filter((row) => {
      const haystack = searchValues(row)
        .filter((v) => v != null && v !== '')
        .join(' ')
        .toLowerCase()
      return needles.every((n) => haystack.includes(n))
    })
  }, [rows, debouncedSearch, searchValues])

  /**
   * Prepends a checkbox column when bulk actions are enabled. Built here
   * rather than asked for from callers so every table's selection UI is
   * identical and no page can forget the header "select all".
   */
  const resolvedColumns = React.useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!bulkActions) return columns
    const selectColumn: ColumnDef<T, unknown> = {
      id: '__select',
      header: ({ table }) => (
        <Checkbox
          // Indeterminate whenever the page is partly selected, so "select
          // all" never looks like it did nothing.
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(v === true)}
          aria-label="Select all rows on this page"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(v) => row.toggleSelected(v === true)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      size: 40,
    }
    return [selectColumn, ...columns]
  }, [columns, bulkActions])

  const table = useReactTable({
    data: filteredBySearch,
    columns: resolvedColumns,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    state: { sorting, columnFilters, rowSelection, pagination },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: bulkActions
      ? (row) => bulkActions.isSelectable?.(row.original) ?? true
      : false,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    // See the `pagination` state above — the automatic reset fires on data
    // identity, which is not the same thing as the data having changed.
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  const hasFilters = debouncedSearch.length > 0 || columnFilters.length > 0
  const clearFilters = () => {
    setSearch('')
    setColumnFilters([])
  }

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original)
  const clearSelection = React.useCallback(() => setRowSelection({}), [])

  /**
   * Drop selections whose rows are no longer present. Without this, deleting
   * five of eight selected rows leaves the bar claiming eight are selected and
   * a follow-up action would target ids the server no longer has.
   */
  const presentIds = React.useMemo(() => {
    if (!bulkActions || !getRowId) return null
    return new Set(rows.map((row) => getRowId(row)))
  }, [rows, bulkActions, getRowId])

  React.useEffect(() => {
    if (!presentIds) return
    setRowSelection((prev) => {
      const kept = Object.fromEntries(
        Object.entries(prev).filter(([id, on]) => on && presentIds.has(id)),
      )
      return Object.keys(kept).length === Object.keys(prev).length ? prev : kept
    })
  }, [presentIds])

  const visibleRows = table.getRowModel().rows
  const totalFiltered = table.getFilteredRowModel().rows.length

  /**
   * The two resets the automatic one was standing in for, now that they are
   * driven by what actually changed rather than by array identity.
   */

  // Narrowing the result set starts you at the top of it, not part-way down a
  // list you have never seen.
  React.useEffect(() => {
    setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }))
  }, [debouncedSearch, columnFilters])

  // Rows disappearing under you — a delete, or a refetch that returns fewer —
  // can leave the current page past the end. Fall back to the last real page
  // rather than showing an empty one.
  const lastPageIndex = Math.max(0, Math.ceil(totalFiltered / pagination.pageSize) - 1)
  React.useEffect(() => {
    setPagination((prev) =>
      prev.pageIndex <= lastPageIndex ? prev : { ...prev, pageIndex: lastPageIndex },
    )
  }, [lastPageIndex])

  if (error && !data) {
    return <ErrorState error={error} onRetry={onRetry} className={className} />
  }

  // Empty dataset — not the same thing as "filters matched nothing".
  if (!isLoading && rows.length === 0 && emptyState) {
    return <>{emptyState}</>
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* -------------------------------------------------- selection bar */}
      {bulkActions && selectedRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/8 px-4 py-2.5">
          <span className="text-sm font-medium">
            {selectedRows.length} selected
          </span>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            Clear
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {bulkActions.render(selectedRows, clearSelection)}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {searchValues && (
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              leading={<Search />}
              className="h-9 w-full sm:max-w-64"
              aria-label={searchPlaceholder}
            />
          )}
          {facets.map((facet) => (
            <DataTableFacetFilter key={facet.columnId} table={table} facet={facet} />
          ))}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} icon={<X />}>
              Clear
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {toolbar}
          {csv && (
            <Button
              variant="outline"
              size="sm"
              icon={<Download />}
              disabled={totalFiltered === 0}
              onClick={() =>
                exportCsv(
                  timestampedFilename(csv.filename),
                  table.getSortedRowModel().rows.map((r) => r.original),
                  csv.columns,
                )
              }
            >
              Export
            </Button>
          )}
        </div>
      </div>

      {/* --------------------------------------------------------- cards */}
      {renderCard && (
        <div className="grid gap-3 md:hidden">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
            : visibleRows.map((row) => (
                <div key={row.id} onClick={() => onRowClick?.(row.original)}>
                  {renderCard(row.original)}
                </div>
              ))}
          {!isLoading && visibleRows.length === 0 && <NoResults onClear={hasFilters ? clearFilters : undefined} />}
        </div>
      )}

      {/* --------------------------------------------------------- table */}
      <div
        className={cn(
          'overflow-hidden rounded-xl border border-border bg-card',
          renderCard && 'hidden md:block',
        )}
      >
        <div className="max-h-[70vh] overflow-auto">
          <Table>
            <TableHeader sticky={stickyHeader}>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort()
                    const sorted = header.column.getIsSorted()
                    const meta = header.column.columnDef.meta as { align?: 'left' | 'center' | 'right' } | undefined
                    return (
                      <TableHead
                        key={header.id}
                        align={meta?.align}
                        style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 rounded transition-colors hover:text-foreground"
                            aria-label={`Sort by ${String(header.column.columnDef.header)}`}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === 'asc' ? (
                              <ArrowUp className="size-3 text-primary" />
                            ) : sorted === 'desc' ? (
                              <ArrowDown className="size-3 text-primary" />
                            ) : (
                              <ChevronsUpDown className="size-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>

            <TableBody>
              {isLoading ? (
                // Column-width-matched skeleton, so nothing shifts on resolve.
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    {columns.map((_col, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4" style={{ width: `${55 + ((i + j) % 4) * 12}%` }} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : visibleRows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns.length} className="p-0">
                    <NoResults onClear={hasFilters ? clearFilters : undefined} />
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((row) => (
                  <TableRow
                    key={row.id}
                    interactive={!!onRowClick}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as { align?: 'left' | 'center' | 'right' } | undefined
                      return (
                        <TableCell key={cell.id} align={meta?.align}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ---------------------------------------------------- pagination */}
      {!isLoading && totalFiltered > 0 && (
        <DataTablePagination table={table} total={rows.length} filtered={totalFiltered} />
      )}
    </div>
  )
}

function DataTablePagination<T>({
  table,
  total,
  filtered,
}: {
  table: TanstackTable<T>
  total: number
  filtered: number
}) {
  const { pageIndex, pageSize } = table.getState().pagination
  const from = filtered === 0 ? 0 : pageIndex * pageSize + 1
  const to = Math.min((pageIndex + 1) * pageSize, filtered)

  return (
    <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p aria-live="polite">
        Showing <span className="font-medium text-foreground">{from}–{to}</span> of{' '}
        <span className="font-medium text-foreground">{filtered}</span>
        {filtered !== total && <> (filtered from {total})</>}
      </p>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">Rows</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => table.setPageSize(Number(v))}
          >
            <SelectTrigger className="h-8 w-[4.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label="First page"
          >
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <span className="px-2 tabular-nums">
            {pageIndex + 1} / {Math.max(1, table.getPageCount())}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            aria-label="Last page"
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  )
}

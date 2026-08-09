import * as React from 'react'
import type { UseQueryResult } from '@tanstack/react-query'

import { ErrorState } from './states'

export interface QueryBoundaryProps<T> {
  query: UseQueryResult<T>
  /** Layout-matched placeholder. Never a bare spinner on a full page. */
  loading: React.ReactNode
  /** Rendered when the query resolves to an empty collection. */
  empty?: React.ReactNode
  isEmpty?: (data: T) => boolean
  children: (data: T) => React.ReactNode
  errorClassName?: string
}

/**
 * The single place pending / error / empty are decided, so every screen in
 * the app behaves identically. Keeps previous data visible during refetches.
 */
export function QueryBoundary<T>({
  query,
  loading,
  empty,
  isEmpty,
  children,
  errorClassName,
}: QueryBoundaryProps<T>) {
  if (query.isPending) return <>{loading}</>

  if (query.isError && query.data === undefined) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} className={errorClassName} />
  }

  const data = query.data as T
  if (empty && isEmpty?.(data)) return <>{empty}</>

  return <>{children(data)}</>
}

/**
 * Combines several queries whose data is needed together. Reports the first
 * error and stays pending until all have resolved.
 */
export function combineQueries(...queries: UseQueryResult<unknown>[]) {
  return {
    isPending: queries.some((q) => q.isPending),
    isError: queries.some((q) => q.isError),
    error: queries.find((q) => q.isError)?.error,
    isFetching: queries.some((q) => q.isFetching),
    refetch: () => queries.forEach((q) => void q.refetch()),
  }
}

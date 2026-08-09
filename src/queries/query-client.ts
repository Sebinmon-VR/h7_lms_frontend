import { QueryClient } from '@tanstack/react-query'

import { ApiError } from '@/api/errors'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // This backend re-reads the user doc and runs unindexed scans on every
      // call, so aggressive refetching is user-hostile. Refresh is explicit.
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      gcTime: 30 * 60_000,
      staleTime: 60_000,
      retry: (failureCount, error) => {
        const apiError = error instanceof ApiError ? error : null
        if (!apiError) return false
        // 4xx will not fix itself on a retry; transport and 5xx faults might.
        if (apiError.isNetwork || apiError.isServer) return failureCount < 2
        return false
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      // Creates here are not idempotent — a blind retry duplicates records.
      retry: 0,
    },
  },
})

/**
 * The monitoring report is far too expensive to recompute after every write.
 * Mark it stale so it refreshes on the next visit instead of immediately.
 */
export function markMonitoringStale() {
  void queryClient.invalidateQueries({
    queryKey: ['admin', 'reports', 'monitoring'],
    refetchType: 'none',
  })
}

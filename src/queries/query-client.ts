import { MutationCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { ApiError } from '@/api/errors'

/**
 * Opt out of the global failure toast, for a mutation whose caller reports the
 * error itself — a form that writes it against the offending field, or a 409
 * that is an expected outcome rather than a fault.
 *
 * Set `meta: { silent: true }` on those. The DEFAULT is to surface, because the
 * opposite default is how a "Issue invoice" button came to do nothing at all:
 * the backend refused a zero-total invoice with a clear 400, the mutation had
 * no `onError`, and the message went nowhere.
 */
export interface MutationMeta {
  silent?: boolean
}

export const queryClient = new QueryClient({
  /**
   * The safety net. Fires for EVERY failed mutation, in addition to any
   * `onError` the mutation defines — so a hook that already toasts should be
   * marked silent rather than left to toast twice.
   */
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if ((mutation.meta as MutationMeta | undefined)?.silent) return
      toast.error(
        error instanceof ApiError ? error.message : 'That did not work. Please try again.',
      )
    },
  }),
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

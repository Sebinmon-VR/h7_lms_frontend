import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { calendarApi, extraClassApi, liveClassApi } from '@/api/classes.api'
import type { CalendarQuery } from '@/api/classes.api'
import { ApiError } from '@/api/errors'
import type {
  ExtraClassCreate,
  ExtraClassDecision,
  ExtraClassStatus,
  Program,
} from '@/api/types'
import { STALE, qk } from './keys'

// ------------------------------------------------------------ live classes

/**
 * One class's clock.
 *
 * `staleTime: 0` and a 30-second interval, because this is a countdown the
 * server computed: a cached copy keeps saying "in 12 minutes" long after it
 * has become five, and the join button is bound to a field that flips inside
 * that window.
 *
 * Polling stops when the tab is hidden — React Query's default — which is
 * right: nobody is watching a countdown they cannot see.
 */
export function useClassTiming(meetingId: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.classes.timing(meetingId ?? 0),
    queryFn: () => liveClassApi.timing(meetingId as number),
    staleTime: STALE.live,
    refetchInterval: 30_000,
    enabled: enabled && meetingId != null,
  })
}

/**
 * The "join now" strip. Only classes the viewer may actually enter appear, so
 * the list renders without checking each row.
 */
export function useLiveClasses(enabled = true) {
  return useQuery({
    queryKey: qk.classes.live(),
    queryFn: liveClassApi.live,
    staleTime: STALE.live,
    refetchInterval: 60_000,
    enabled,
  })
}

/**
 * Joining. A 409 is the EXPECTED outcome of pressing a button that went stale
 * between renders — the window closed, the teacher ended the class — so no
 * toast fires on error here.
 *
 * The caller refetches the timing and shows `join_blocked_reason`, which is
 * the sentence the server wrote for exactly this moment.
 */
export function useJoinClass() {
  const qc = useQueryClient()
  return useMutation({
    // Reported in place by the caller, not as a toast.
    meta: { silent: true },
    mutationFn: (meetingId: number) => liveClassApi.join(meetingId),
    onSettled: (_data, _error, meetingId) => {
      void qc.invalidateQueries({ queryKey: qk.classes.timing(meetingId) })
      void qc.invalidateQueries({ queryKey: qk.classes.live() })
    },
  })
}

function invalidateTiming(qc: QueryClient, meetingId: number) {
  void qc.invalidateQueries({ queryKey: qk.classes.timing(meetingId) })
  void qc.invalidateQueries({ queryKey: qk.classes.live() })
  // A class opening or closing is a calendar event changing state, and the
  // calendar carries the same `timing` block.
  void qc.invalidateQueries({ queryKey: qk.calendar.root })
}

/**
 * The teacher opens the class. Unnecessary when `auto_start_class` is on;
 * with it off — the default — students sit at `waiting_for_teacher` until
 * this is called.
 */
export function useStartClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (meetingId: number) => liveClassApi.start(meetingId),
    onSuccess: (_timing, meetingId) => {
      invalidateTiming(qc, meetingId)
      toast.success('Class opened', { description: 'Students can join now.' })
    },
  })
}

export function useEndClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (meetingId: number) => liveClassApi.end(meetingId),
    onSuccess: (_timing, meetingId) => {
      invalidateTiming(qc, meetingId)
      toast.success('Class ended')
    },
  })
}

// ----------------------------------------------------------- extra classes

/** A queue, pending first. `mineOnly` narrows a teacher to their own requests. */
export function useExtraClasses(
  params: { status?: ExtraClassStatus; program?: Program; mineOnly?: boolean } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: qk.classes.extra(params.status, params.mineOnly ?? false),
    queryFn: () => extraClassApi.list(params),
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useExtraClass(requestId: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.classes.extraRequest(requestId ?? 0),
    queryFn: () => extraClassApi.get(requestId as number),
    staleTime: STALE.transactional,
    enabled: enabled && requestId != null,
  })
}

function invalidateExtra(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.classes.extraRoot() })
  // Scheduling one creates a real class, which lands on the calendar and in
  // the teacher's and admin's meeting lists.
  void qc.invalidateQueries({ queryKey: qk.calendar.root })
}

/**
 * With `extra_class_needs_approval` off, the request comes back already
 * APPROVED and there is nothing to wait for — say which happened rather than
 * a flat "requested", because the two need different next actions.
 */
export function useRequestExtraClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ExtraClassCreate) => extraClassApi.create(body),
    onSuccess: (request) => {
      invalidateExtra(qc)
      toast.success(
        request.status === 'PENDING' ? 'Request sent for approval' : 'Extra class approved',
        {
          description:
            request.status === 'PENDING'
              ? 'An administrator will review it.'
              : 'Approval is not required — it still needs scheduling.',
        },
      )
    },
  })
}

/** Admin only. A rejection without a note is refused by the backend. */
export function useDecideExtraClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ requestId, body }: { requestId: number; body: ExtraClassDecision }) =>
      extraClassApi.decide(requestId, body),
    onSuccess: (request) => {
      invalidateExtra(qc)
      void qc.invalidateQueries({ queryKey: qk.classes.extraRequest(request.id) })
      toast.success(request.status === 'REJECTED' ? 'Request rejected' : 'Request approved', {
        description:
          request.status === 'APPROVED'
            ? 'The class has not been created yet — schedule it to make it real.'
            : undefined,
      })
    },
  })
}

/**
 * Creates the actual class, and this is the step that can fail — a timetable
 * clash or a Meet error, after a human has already approved it.
 *
 * An explicit error toast here rather than the usual silence, because the
 * failure leaves a visible APPROVED-but-unscheduled request the admin has to
 * come back to, and they need to know why.
 */
export function useScheduleExtraClass() {
  const qc = useQueryClient()
  return useMutation({
    // Reports its own failure below; the global net would toast twice.
    meta: { silent: true },
    mutationFn: (requestId: number) => extraClassApi.schedule(requestId),
    onSuccess: (request) => {
      invalidateExtra(qc)
      void qc.invalidateQueries({ queryKey: qk.classes.extraRequest(request.id) })
      toast.success('Extra class scheduled')
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : 'The class could not be created.',
        { description: 'The approval stands — try scheduling it again.' },
      )
    },
  })
}

export function useCancelExtraClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (requestId: number) => extraClassApi.cancel(requestId),
    onSuccess: (request) => {
      invalidateExtra(qc)
      void qc.invalidateQueries({ queryKey: qk.classes.extraRequest(request.id) })
      toast.success('Request withdrawn')
    },
  })
}

// ---------------------------------------------------------------- calendar

/**
 * One person's calendar over a window.
 *
 * The range is capped at 90 days server-side and a longer one is a 400, so
 * callers page by month rather than asking for a year. Retries are left on:
 * unlike a permission error, a 400 here means the caller asked wrongly and
 * will not be retried into working — but a network blip will.
 */
export function useCalendar(query: CalendarQuery = {}, enabled = true) {
  return useQuery({
    queryKey: qk.calendar.range(
      query.fromDate,
      query.toDate,
      query.kinds,
      query.groupByDay ?? false,
    ),
    queryFn: () => calendarApi.get(query),
    // Carries live-class timing blocks, so it goes stale as fast as they do.
    staleTime: STALE.schedule,
    enabled,
  })
}

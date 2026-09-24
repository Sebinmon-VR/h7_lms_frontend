import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { adminApi } from '@/api/admin.api'
import { calendarApi, extraClassApi, liveClassApi } from '@/api/classes.api'
import type { CalendarQuery } from '@/api/classes.api'
import { ApiError } from '@/api/errors'
import type {
  ClassRoomOut,
  ClassRoomSetup,
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
  // A live session is one of the things that opens the class's room to students.
  void qc.invalidateQueries({ queryKey: qk.classes.rooms() })
}

// -------------------------------------------------------------- class rooms

/**
 * The rooms this user belongs to — their class for a student, every class
 * they teach for a teacher. Polled like a countdown: each row says whether
 * they may enter RIGHT NOW, and that flips as periods start and end.
 */
export function useMyClassRooms(enabled = true) {
  return useQuery({
    queryKey: qk.classes.rooms(),
    queryFn: liveClassApi.myRooms,
    staleTime: STALE.live,
    refetchInterval: 60_000,
    enabled,
  })
}

export function useClassRoomAccess(classId: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.classes.room(classId ?? 0),
    queryFn: () => liveClassApi.room(classId as number),
    staleTime: STALE.live,
    refetchInterval: 60_000,
    enabled: enabled && classId != null,
  })
}

/**
 * Entering the room. A 409 is the expected outcome of a stale button — the
 * period ended, or has not opened — so no toast fires here; the caller
 * refetches and shows `join_blocked_reason`.
 */
export function useJoinClassRoom() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: (classId: number) => liveClassApi.joinRoom(classId),
    onSettled: (_data, _error, classId) => {
      void qc.invalidateQueries({ queryKey: qk.classes.room(classId) })
      void qc.invalidateQueries({ queryKey: qk.classes.rooms() })
      // A teacher's first join can create the room, which the class list shows.
      void qc.invalidateQueries({ queryKey: qk.admin.classes() })
    },
  })
}

/**
 * Teacher or admin: who is in the room right now, by name. Polled while a
 * panel shows it; a student's request is a 403, so callers gate on role.
 */
export function useRoomPresence(classId: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.classes.presence(classId ?? 0),
    queryFn: () => liveClassApi.presence(classId as number),
    staleTime: STALE.live,
    refetchInterval: 20_000,
    enabled: enabled && classId != null,
  })
}

/**
 * Leaving the room. The LMS cannot see a Meet tab close, so this is the
 * person saying so: it stamps a LEFT_ROOM line with the time and hands back
 * their access, which now reads `in_room: false`.
 */
export function useLeaveClassRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (classId: number) => liveClassApi.leaveRoom(classId),
    onSuccess: (access, classId) => {
      qc.setQueryData(qk.classes.room(classId), access)
      void qc.invalidateQueries({ queryKey: qk.classes.rooms() })
      toast.success('You have left the class', {
        description: 'Your leaving time has been recorded.',
      })
    },
  })
}

function invalidateRooms(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.classes.rooms() })
  void qc.invalidateQueries({ queryKey: qk.admin.classes() })
  // Mappings and enrollments embed a full ClassRoomOut copy, room fields included.
  void qc.invalidateQueries({ queryKey: qk.admin.mappings() })
  void qc.invalidateQueries({ queryKey: qk.admin.enrollments() })
  void qc.invalidateQueries({ queryKey: qk.teacher.myClasses() })
  void qc.invalidateQueries({ queryKey: qk.student.myClasses() })
}

/**
 * Admin: create, replace or hand-set a class's room. Reports its own failure:
 * a 502 carries Google's reason, which the generic toast would flatten.
 */
export function useSetupClassRoom() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ classId, body }: { classId: number; body?: ClassRoomSetup }) =>
      adminApi.setupClassRoom(classId, body ?? {}),
    onSuccess: (updated: ClassRoomOut) => {
      qc.setQueryData<ClassRoomOut[]>(qk.admin.classes(), (prev) =>
        prev?.map((c) => (c.id === updated.id ? updated : c)),
      )
      invalidateRooms(qc)
      toast.success(
        updated.room_status === 'MANUAL' ? 'Room link saved' : `Room ready for ${updated.name}`,
        {
          description:
            updated.room_status === 'MANUAL'
              ? 'Every period of this class now uses the link you pasted.'
              : updated.room_recording_status === 'ARM_FAILED'
                ? 'The room works, but Meet would not switch automatic recording on for it.'
                : 'Every period of this class now happens in this room.',
          duration: 8_000,
        },
      )
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'The room could not be created.', {
        duration: 10_000,
      })
    },
  })
}

export function useClearClassRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (classId: number) => adminApi.clearClassRoom(classId),
    onSuccess: (updated: ClassRoomOut) => {
      qc.setQueryData<ClassRoomOut[]>(qk.admin.classes(), (prev) =>
        prev?.map((c) => (c.id === updated.id ? updated : c)),
      )
      invalidateRooms(qc)
      toast.success('Room removed', {
        description:
          'The old link no longer works. A new room is created on the next scheduled period.',
      })
    },
  })
}

/**
 * Admin: put the class's teachers on the room's guest list (and re-send the
 * invitations). Reports its own failure — Google's reason is the useful part.
 */
export function useInviteRoomTeachers() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: (classId: number) => adminApi.inviteClassRoomTeachers(classId),
    onSuccess: (updated: ClassRoomOut) => {
      qc.setQueryData<ClassRoomOut[]>(qk.admin.classes(), (prev) =>
        prev?.map((c) => (c.id === updated.id ? updated : c)),
      )
      invalidateRooms(qc)
      const count = updated.room_guest_emails?.length ?? 0
      toast.success(`${count} teacher${count === 1 ? '' : 's'} on the guest list`, {
        description: 'They can join the room without asking. Each has a Calendar invitation.',
      })
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not update the guest list.', {
        duration: 10_000,
      })
    },
  })
}

/**
 * Admin: let anyone with the link into the room without asking. Reports its
 * own failure because Google's reason is the actionable part — it names the
 * Meet API scope to authorise.
 */
export function useOpenClassRoom() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: (classId: number) => adminApi.openClassRoom(classId),
    onSuccess: (updated: ClassRoomOut) => {
      qc.setQueryData<ClassRoomOut[]>(qk.admin.classes(), (prev) =>
        prev?.map((c) => (c.id === updated.id ? updated : c)),
      )
      invalidateRooms(qc)
      toast.success('Room is open to anyone with the link', {
        description: 'Teachers and students join without asking, whatever account they use.',
      })
    },
    onError: (error) => {
      toast.error('Google would not open the room', {
        description: error instanceof ApiError ? error.message : undefined,
        duration: 15_000,
      })
    },
  })
}

/** Admin: invite teachers to every future per-session link they are not yet a guest of. */
export function useRepairTeacherAccess() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: (notify: boolean) => adminApi.repairTeacherAccess(notify),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: qk.admin.meetings() })
      if (result.failed > 0) {
        toast.warning(`Invited ${result.invited}, but ${result.failed} could not be updated`, {
          description: result.failures[0]?.error,
          duration: 12_000,
        })
      } else if (result.invited > 0) {
        toast.success(`Teachers added to ${result.invited} upcoming session${result.invited === 1 ? '' : 's'}`, {
          description: 'They can join those sessions without asking.',
        })
      } else {
        toast.info('Nothing to fix', {
          description: `Every upcoming session already lets its teacher in (${result.checked} checked).`,
        })
      }
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'The repair could not run.')
    },
  })
}

// ------------------------------------------------------------ the live board

/**
 * Admin: every class right now. Polled every 30 seconds — it carries a clock
 * and "who has come in", both of which move while the page is open.
 */
export function useLiveBoard(enabled = true) {
  return useQuery({
    queryKey: qk.admin.liveBoard(),
    queryFn: adminApi.liveBoard,
    staleTime: STALE.live,
    refetchInterval: 30_000,
    enabled,
  })
}

/** Admin: one class's room log, polled while the activity drawer is open. */
export function useClassRoomEvents(classId: number | null, todayOnly = true, enabled = true) {
  return useQuery({
    queryKey: qk.admin.liveEvents(classId ?? 0, todayOnly),
    queryFn: () => adminApi.liveClassEvents(classId as number, { todayOnly, limit: 300 }),
    staleTime: STALE.live,
    refetchInterval: 30_000,
    enabled: enabled && classId != null,
  })
}

/**
 * Admin: who Google Meet saw in a class's room today, with join and leave
 * times. Empty until Meet has something to say (it reports a few minutes
 * behind) or the school has authorised the read scope — the board row's
 * `room_attendance_error` explains the latter.
 */
export function useClassRoomAttendance(
  classId: number | null,
  onDate: string | null = null,
  enabled = true,
) {
  return useQuery({
    queryKey: qk.admin.liveAttendance(classId ?? 0, onDate),
    queryFn: () => adminApi.liveClassAttendance(classId as number, { onDate }),
    staleTime: STALE.live,
    refetchInterval: 60_000,
    enabled: enabled && classId != null,
  })
}

/** Admin: ask Meet for the room's attendance right now rather than waiting for the sweep. */
export function useSyncClassRoomAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ classId, onDate }: { classId: number; onDate?: string | null }) =>
      adminApi.liveClassAttendance(classId, { onDate, sync: true }),
    onSuccess: (rows, { classId, onDate }) => {
      qc.setQueryData(qk.admin.liveAttendance(classId, onDate ?? null), rows)
      void qc.invalidateQueries({ queryKey: qk.admin.liveBoard() })
      toast.success(
        rows.length === 0
          ? 'Meet has nobody on record for this room yet'
          : `Meet reports ${rows.length} ${rows.length === 1 ? 'participant' : 'participants'}`,
      )
    },
  })
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

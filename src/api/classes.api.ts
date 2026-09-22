import { cleanParams, get, post } from './client'
import type {
  ApiDate,
  CalendarKind,
  CalendarOut,
  ClassTimingOut,
  ExtraClassCreate,
  ExtraClassDecision,
  ExtraClassOut,
  ExtraClassStatus,
  JoinClassOut,
  LiveClassRow,
  Program,
} from './types'

/**
 * The live-class clock.
 *
 * Every timing here is computed server-side so a teacher's screen and a
 * student's cannot disagree, and the ONE rule that matters is: bind the join
 * button to `timing.may_join` and nothing else. It already accounts for the
 * early-join window, the grace period, the status and whether the teacher has
 * started. Anything derived on the client eventually disagrees with the
 * server, which enforces the same rule on `join` and answers 409.
 *
 * When `may_join` is false, show `join_blocked_reason` VERBATIM — it
 * distinguishes "The class opens at 09:55", "Waiting for the teacher to start
 * the class" and "This class has ended", which the flags alone cannot.
 */
export const liveClassApi = {
  /** Poll this for a countdown; it carries `starts_in_minutes`. */
  timing: (meetingId: number) => get<ClassTimingOut>(`/classes/${meetingId}/timing`),

  /**
   * Returns the link ONLY if the caller may join. A 409 here is the expected
   * outcome of clicking a stale button, not a crash — refetch the timing and
   * show the reason rather than reporting a failure.
   */
  join: (meetingId: number) => post<JoinClassOut>(`/classes/${meetingId}/join`),

  /**
   * The teacher opens the class. With `auto_start_class` on, a class opens on
   * its timetabled time and this is unnecessary; with it off — the default —
   * students sit at `waiting_for_teacher: true` until this is called.
   */
  start: (meetingId: number) => post<ClassTimingOut>(`/classes/${meetingId}/start`),

  end: (meetingId: number) => post<ClassTimingOut>(`/classes/${meetingId}/end`),

  /**
   * The dashboard "join now" strip, ordered by start time.
   *
   * Only classes the viewer may ACTUALLY join appear, so the list renders
   * without checking each row — but the `meeting_link` is still null unless
   * `timing.may_join`, so go through `join` rather than following it blind.
   */
  live: () => get<LiveClassRow[]>('/classes/live'),
}

/**
 * Extra classes — a class held outside the timetable.
 *
 * Approving and scheduling are two calls ON PURPOSE: creating the class can
 * fail on a clash or a Meet error after a human has already approved it. An
 * `APPROVED` request with no `created_meeting_id` / `created_session_id` is an
 * approval whose class has not been made yet. Show it as such and offer a
 * retry, rather than treating APPROVED as done.
 *
 * When the `extra_class_needs_approval` setting is off, requests are created
 * already APPROVED and the screen collapses to one step.
 */
export const extraClassApi = {
  /**
   * The list is a QUEUE — pending first. `mine_only` narrows a teacher to
   * their own requests; an admin sees everything either way.
   */
  list: (
    params: { status?: ExtraClassStatus; program?: Program; mineOnly?: boolean } = {},
  ) =>
    get<ExtraClassOut[]>('/extra-classes', {
      params: cleanParams({
        status: params.status,
        program: params.program,
        mine_only: params.mineOnly,
      }),
    }),

  get: (requestId: number) => get<ExtraClassOut>(`/extra-classes/${requestId}`),

  /**
   * A SCHOOL request needs `class_id` AND `subject_id`; a TUITION request
   * needs `enrollment_id` and neither of the other two. Any other combination
   * is a 422 — "who is this class for?" must have one answer.
   */
  create: (body: ExtraClassCreate) => post<ExtraClassOut>('/extra-classes', body),

  /** Admin only. A rejection without a note is refused — the teacher needs a reason. */
  decide: (requestId: number, body: ExtraClassDecision) =>
    post<ExtraClassOut>(`/extra-classes/${requestId}/decide`, body),

  /** Admin only. Creates the actual class, and can fail after approval. */
  schedule: (requestId: number) => post<ExtraClassOut>(`/extra-classes/${requestId}/schedule`),

  /** The requester withdrawing — distinct from an admin's rejection. */
  cancel: (requestId: number) => post<ExtraClassOut>(`/extra-classes/${requestId}/cancel`),
}

export interface CalendarQuery {
  fromDate?: ApiDate
  toDate?: ApiDate
  /** Narrow the sources gathered. Omit for everything. */
  kinds?: CalendarKind[]
  /** Adds `days[]`, including EMPTY dates — the tile and month view's shape. */
  groupByDay?: boolean
}

export const calendarApi = {
  /**
   * Everything on one person's calendar, from every source, flattened to one
   * event shape. Switch on `kind` for colour and icon only.
   *
   * Role decides what is gathered — a parent gets the union of their
   * children's events, each tagged with `student_id` / `student_name`.
   *
   * Two things worth knowing before rendering:
   *  - `meeting_link` is present only when the viewer may join RIGHT NOW, so
   *    the calendar cannot be used to walk into a room early;
   *  - the range is capped at 90 DAYS and a longer one is a 400, so a month
   *    grid is fine and a "whole year" view is not.
   */
  get: (query: CalendarQuery = {}) =>
    get<CalendarOut>('/calendar', {
      params: cleanParams({
        from_date: query.fromDate,
        to_date: query.toDate,
        kinds: query.kinds?.length ? query.kinds.join(',') : undefined,
        group_by_day: query.groupByDay,
      }),
    }),
}

import { cleanParams, del, get, post, put } from './client'
import type {
  NoticeAudience,
  NoticeCreate,
  NoticeFeed,
  NoticeOut,
  NoticePublishResult,
  NoticeStatus,
  NoticeUpdate,
  Program,
} from './types'

/**
 * The notice board, in two halves — and on two boards.
 *
 * `noticesApi` is the READER's board — any signed-in user, scoped server-side
 * to what is addressed to them. `noticeAdminApi` is AUTHORING, open to
 * teachers for the classes they lead and to admins for everything.
 *
 * The tuition programme has its own pair, `tuitionNoticesApi` and
 * `tuitionNoticeAdminApi`, on their own routes. Same shapes, same service on
 * the server; what differs is who is on either side. Everything authored there
 * is a TUITION notice and reaches tuition accounts only, and its reader
 * endpoints answer only to tuition members. There is no `CLASS` audience on
 * that board — tuition has enrollments, not classes.
 *
 * Visibility has two halves and they should be surfaced separately: `status`
 * is the author's decision, and `publish_at` / `expires_at` are the clock.
 * Every response resolves both into `is_live`, `is_scheduled` and
 * `is_expired`, so show "Scheduled for Friday" rather than a bare
 * "not visible".
 */

function readerApi(prefix: string) {
  return {
    /**
     * `unread_count` counts the WHOLE feed, not the returned page, so it stays
     * correct while the reader filters or pages. Never recompute the badge from
     * the items on screen.
     */
    feed: (params: { program?: Program; unreadOnly?: boolean; limit?: number } = {}) =>
      get<NoticeFeed>(`${prefix}/feed`, {
        params: cleanParams({
          program: params.program,
          unread_only: params.unreadOnly,
          limit: params.limit,
        }),
      }),

    /**
     * Opening one RECORDS A READ RECEIPT — this is a write dressed as a GET.
     * Never call it to prefetch or to populate a list; it will mark notices read
     * that nobody looked at.
     */
    read: (noticeId: number) => get<NoticeOut>(`${prefix}/${noticeId}`),

    /** Clears a notice from the badge without opening it. */
    dismiss: (noticeId: number) => post<NoticeOut>(`${prefix}/${noticeId}/dismiss`),
  }
}

function authoringApi(prefix: string) {
  return {
    list: (
      params: {
        program?: Program
        status?: NoticeStatus
        audience?: NoticeAudience
        withCounts?: boolean
      } = {},
    ) =>
      get<NoticeOut[]>(prefix, {
        params: cleanParams({
          program: params.program,
          status: params.status,
          audience: params.audience,
          with_counts: params.withCounts,
        }),
      }),

    get: (noticeId: number) => get<NoticeOut>(`${prefix}/${noticeId}`),

    /**
     * Created as a DRAFT unless the body says otherwise — posting to the whole
     * school should not happen because a form defaulted to it.
     *
     * A targeted notice with an empty target list is rejected at validation, so
     * the audience and its list have to agree before this is called.
     */
    create: (body: NoticeCreate) => post<NoticeOut>(prefix, body),

    /**
     * Unlike creation, this does NOT cross-check audience against targets: an
     * author legitimately changes the two in separate saves. The publish step
     * re-checks, which is the moment it actually matters.
     */
    update: (noticeId: number, body: NoticeUpdate) =>
      put<NoticeOut>(`${prefix}/${noticeId}`, body),

    /** Returns `recipient_count` — how many accounts it actually reached. */
    publish: (noticeId: number) => post<NoticePublishResult>(`${prefix}/${noticeId}/publish`),

    /** Takes it down but keeps the record, including its read receipts. */
    archive: (noticeId: number) => post<NoticeOut>(`${prefix}/${noticeId}/archive`),

    /** Admin only, and permanent. Prefer `archive`. */
    remove: (noticeId: number) => del(`${prefix}/${noticeId}`),
  }
}

/** The school board, read side. */
export const noticesApi = readerApi('/notices')

/** The school board, authoring side. Teachers may post to classes they lead. */
export const noticeAdminApi = authoringApi('/admin/notices')

/**
 * The tuition board, read side. Answers only to accounts with tuition access,
 * and only with TUITION notices — a school notice is a 404 here by id.
 */
export const tuitionNoticesApi = readerApi('/tuition/notices')

/**
 * The tuition board, authoring side. Admin only. `program` on the body may be
 * omitted: everything created here is a TUITION notice regardless, and naming
 * `LMS` is refused rather than quietly moved to the school.
 */
export const tuitionNoticeAdminApi = authoringApi('/admin/tuition/notices')

/** Which pair of clients a board uses. */
export function noticeApisFor(board: Program) {
  return board === 'TUITION'
    ? { reader: tuitionNoticesApi, author: tuitionNoticeAdminApi }
    : { reader: noticesApi, author: noticeAdminApi }
}

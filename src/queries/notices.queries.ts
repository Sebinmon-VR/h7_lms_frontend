import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { noticeApisFor } from '@/api/notices.api'
import type {
  NoticeAudience,
  NoticeCreate,
  NoticeStatus,
  NoticeUpdate,
  Program,
} from '@/api/types'
import { STALE, qk } from './keys'

/**
 * Every hook takes a `board`: which product's notice board it reads or writes.
 *
 * The school board and the tuition board are the same shapes on different
 * routes with different people on either side, so one set of hooks serves
 * both — but the board is part of every query key, because a tuition
 * student's unread count and a school student's are two different numbers.
 * Defaults to the school board, so every caller that predates tuition keeps
 * working unchanged.
 */

// ------------------------------------------------------------ the reader

/**
 * The signed-in user's board.
 *
 * `unread_count` on the response counts the WHOLE feed, not the returned page,
 * so the badge stays correct while the reader filters. Never recompute it from
 * `items`.
 */
export function useNoticeFeed(
  params: { board?: Program; program?: Program; unreadOnly?: boolean; limit?: number } = {},
  enabled = true,
) {
  const board = params.board ?? 'LMS'
  return useQuery({
    queryKey: qk.notices.feed(params.unreadOnly ?? false, board),
    queryFn: () => noticeApisFor(board).reader.feed(params),
    staleTime: STALE.transactional,
    enabled,
  })
}

/**
 * Opening a notice RECORDS A READ RECEIPT, which makes this a write wearing a
 * GET's clothes — so it is a mutation here, never a query.
 *
 * Modelling it as `useQuery` would mark notices read on prefetch, on a
 * remount, and on every background refetch, which is how an unread badge
 * empties itself without anybody reading anything.
 */
export function useOpenNotice(board: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (noticeId: number) => noticeApisFor(board).reader.read(noticeId),
    onSuccess: () => {
      // The badge has just changed; the author's listing has not.
      void qc.invalidateQueries({ queryKey: qk.notices.feedRoot() })
    },
  })
}

/** Clears a notice from the badge without opening it. */
export function useDismissNotice(board: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (noticeId: number) => noticeApisFor(board).reader.dismiss(noticeId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.notices.feedRoot() })
    },
  })
}

// ------------------------------------------------------------- authoring

/**
 * The author's listing. Teachers see the notices they may author — their own
 * and their led classes'; admins see everything. The tuition board is admin
 * only.
 */
export function useAdminNotices(
  params: {
    board?: Program
    program?: Program
    status?: NoticeStatus
    audience?: NoticeAudience
    withCounts?: boolean
  } = {},
  enabled = true,
) {
  const board = params.board ?? 'LMS'
  return useQuery({
    queryKey: qk.notices.admin(
      params.status,
      params.audience,
      params.withCounts ?? false,
      board,
    ),
    queryFn: () => noticeApisFor(board).author.list(params),
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useNotice(noticeId: number | null, enabled = true, board: Program = 'LMS') {
  return useQuery({
    queryKey: qk.notices.notice(noticeId ?? 0, board),
    queryFn: () => noticeApisFor(board).author.get(noticeId as number),
    staleTime: STALE.transactional,
    enabled: enabled && noticeId != null,
  })
}

/**
 * Publishing changes what every reader's feed contains, so both subtrees go.
 * Authoring-only edits could get away with less, but a draft can be edited
 * into a live notice in one save, and guessing which happened is not worth the
 * one saved request.
 */
function invalidateNotices(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.notices.root })
}

/**
 * Created as a DRAFT unless the body says otherwise.
 *
 * A targeted notice with an empty target list is refused at validation, so the
 * form must settle the audience and its list before calling this — no toast on
 * error, the caller shows the message against the offending field.
 */
export function useCreateNotice(board: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    // Reported in place by the caller, not as a toast.
    meta: { silent: true },
    mutationFn: (body: NoticeCreate) => noticeApisFor(board).author.create(body),
    onSuccess: (notice) => {
      invalidateNotices(qc)
      toast.success(
        notice.status === 'DRAFT' ? 'Saved as a draft' : `"${notice.title}" created`,
        {
          description:
            notice.status === 'DRAFT'
              ? 'Nobody can see it yet — publish when you are ready.'
              : undefined,
        },
      )
    },
  })
}

export function useUpdateNotice(board: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ noticeId, body }: { noticeId: number; body: NoticeUpdate }) =>
      noticeApisFor(board).author.update(noticeId, body),
    onSuccess: () => {
      invalidateNotices(qc)
      toast.success('Notice updated')
    },
  })
}

/**
 * Reports `recipient_count` — how many accounts it actually reached.
 *
 * Worth saying out loud: a CLASS notice that reaches 0 people is almost always
 * a class nobody is enrolled in, and the number is the only place that shows.
 */
export function usePublishNotice(board: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (noticeId: number) => noticeApisFor(board).author.publish(noticeId),
    onSuccess: (result) => {
      invalidateNotices(qc)
      const { recipient_count: recipients, emails_sent: emails, notice } = result
      toast[recipients === 0 ? 'warning' : 'success'](
        recipients === 0
          ? 'Published, but it reached nobody'
          : `Published to ${recipients} ${recipients === 1 ? 'person' : 'people'}`,
        {
          description:
            recipients === 0
              ? 'Check the audience and its targets — nobody matched.'
              : [
                  notice.is_scheduled ? 'It goes live at its scheduled time.' : null,
                  emails > 0 ? `${emails} email${emails === 1 ? '' : 's'} sent.` : null,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined,
        },
      )
    },
  })
}

/** Takes it down but keeps the record, read receipts included. */
export function useArchiveNotice(board: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (noticeId: number) => noticeApisFor(board).author.archive(noticeId),
    onSuccess: () => {
      invalidateNotices(qc)
      toast.success('Notice archived')
    },
  })
}

export function useDeleteNotice(board: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (noticeId: number) => noticeApisFor(board).author.remove(noticeId),
    onSuccess: () => {
      invalidateNotices(qc)
      toast.success('Notice deleted')
    },
  })
}

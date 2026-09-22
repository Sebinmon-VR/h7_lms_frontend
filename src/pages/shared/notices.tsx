import { BellOff, Inbox, Megaphone, Pin, X } from 'lucide-react'
import * as React from 'react'
import { useLocation } from 'react-router-dom'

import type { NoticeOut, Program } from '@/api/types'
import {
  useDismissNotice,
  useNoticeFeed,
  useOpenNotice,
} from '@/queries/notices.queries'
import { formatDateTime, formatRelative } from '@/lib/datetime'
import { NOTICE_PRIORITY_LABEL, NOTICE_PRIORITY_TONE } from '@/lib/school'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Segmented } from '@/components/ui/segmented'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'
import { programForPath } from '@/routes/navigation'

/**
 * The reader's notice board — one screen for every role, on either board.
 *
 * `/notices` is the school board; `/tuition/notices` is the tuition board.
 * Same screen, different routes on the server and a different set of people
 * addressed — a tuition student's unread count is not the school's.
 *
 * Two behaviours here are not obvious from the shapes:
 *
 * **Opening a notice records a read receipt.** `GET /notices/{id}` is a write
 * dressed as a read, so it fires from a click and never from a render. Nothing
 * on this page prefetches a notice body, and the list is rendered entirely from
 * what the feed already returned.
 *
 * **`unread_count` is the server's, not ours.** It counts the whole feed, not
 * the page or the current filter, so it stays correct while the reader filters.
 * Counting the visible items instead would give a different — smaller — number
 * every time.
 */

function NoticeRow({
  notice,
  onOpen,
  onDismiss,
}: {
  notice: NoticeOut
  onOpen: () => void
  onDismiss: () => void
}) {
  const unread = notice.is_read === false

  return (
    <Card
      interactive
      onClick={onOpen}
      className={
        unread
          ? 'border-primary/30 bg-primary/[0.03] p-5'
          : 'p-5'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {notice.is_pinned && <Pin className="size-3.5 shrink-0 text-primary" />}
            {unread && (
              <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
            )}
            <h3 className={unread ? 'text-base font-semibold' : 'text-base font-medium'}>
              {notice.title}
            </h3>
            {notice.priority !== 'NORMAL' && (
              <Badge tone={NOTICE_PRIORITY_TONE[notice.priority]} size="sm">
                {NOTICE_PRIORITY_LABEL[notice.priority]}
              </Badge>
            )}
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            {notice.author_name ? `${notice.author_name} · ` : ''}
            {formatRelative(notice.publish_at ?? notice.created_at)}
          </p>

          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{notice.body}</p>
        </div>

        {unread && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              // Dismissing must not also open it — opening is what records a
              // read receipt, and "clear from the badge without reading" is
              // precisely what this button is for.
              e.stopPropagation()
              onDismiss()
            }}
          >
            <X />
            Dismiss
          </Button>
        )}
      </div>
    </Card>
  )
}

export function NoticeFeed({ board }: { board: Program }) {
  const [filter, setFilter] = React.useState<'all' | 'unread'>('all')
  const feed = useNoticeFeed({ board, unreadOnly: filter === 'unread' })
  const openNotice = useOpenNotice(board)
  const dismiss = useDismissNotice(board)
  const tuition = board === 'TUITION'

  /**
   * The opened notice, held locally.
   *
   * Seeded from the row so the sheet has something to show immediately, then
   * replaced by the mutation's response — which is the full record, and which
   * arriving is also what marks it read.
   */
  const [opened, setOpened] = React.useState<NoticeOut | null>(null)

  const open = async (notice: NoticeOut) => {
    setOpened(notice)
    try {
      const full = await openNotice.mutateAsync(notice.id)
      setOpened(full)
    } catch {
      // The body we already have is good enough to read; only the receipt was
      // lost, and it will be recorded the next time they open it.
    }
  }

  return (
    <div>
      <PageHeader
        title={tuition ? 'Tuition notices' : 'Notices'}
        description={
          tuition
            ? 'Announcements from the tuition office and your tutors. Opening one marks it read.'
            : 'Announcements addressed to you. Opening one marks it read.'
        }
        actions={
          feed.data && feed.data.unread_count > 0 ? (
            <Badge tone="primary" size="lg">
              {feed.data.unread_count} unread
            </Badge>
          ) : undefined
        }
      >
        <Segmented
          layoutId="notice-feed-filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: 'Unread' },
          ]}
        />
      </PageHeader>

      <QueryBoundary
        query={feed}
        loading={
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(data) => data.items.length === 0}
        empty={
          filter === 'unread' ? (
            <EmptyState
              icon={<BellOff />}
              title="Nothing unread"
              description="You are up to date with the board."
              action={
                <Button variant="outline" onClick={() => setFilter('all')}>
                  Show everything
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Inbox />}
              title="No notices yet"
              description={
                tuition
                  ? 'Announcements from the tuition office will appear here.'
                  : 'Announcements from the school will appear here.'
              }
            />
          )
        }
      >
        {(data) => (
          <div className="space-y-3">
            {data.items.map((notice) => (
              <NoticeRow
                key={notice.id}
                notice={notice}
                onOpen={() => void open(notice)}
                onDismiss={() => dismiss.mutate(notice.id)}
              />
            ))}
          </div>
        )}
      </QueryBoundary>

      <Sheet open={!!opened} onOpenChange={(v) => !v && setOpened(null)}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{opened?.title}</SheetTitle>
          </SheetHeader>
          <SheetBody className="space-y-5">
            {opened && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={NOTICE_PRIORITY_TONE[opened.priority]} size="sm">
                    {NOTICE_PRIORITY_LABEL[opened.priority]}
                  </Badge>
                  {opened.is_pinned && (
                    <Badge tone="primary" size="sm">
                      <Pin />
                      Pinned
                    </Badge>
                  )}
                  {opened.expires_at && (
                    <Badge tone="neutral" size="sm">
                      Until {formatDateTime(opened.expires_at)}
                    </Badge>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  {opened.author_name ? `${opened.author_name} · ` : ''}
                  {formatDateTime(opened.publish_at ?? opened.created_at)}
                </p>

                {/* Plain text, deliberately: the backend stores the body as
                    typed and does not sanitise HTML, so rendering it as markup
                    would make the notice board an injection surface for every
                    teacher who can post to a class. */}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{opened.body}</p>
              </>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  )
}

/** The school board's route. */
export default function NoticeFeedPage() {
  return <NoticeFeed board="LMS" />
}

/**
 * The unread badge for the top bar.
 *
 * Reads the same cached feed the page does, so opening a notice updates both
 * without a second request. Which board is read from the URL, the same way
 * the sidebar decides which product it is in.
 */
export function NoticeBell() {
  const { pathname } = useLocation()
  const feed = useNoticeFeed({ board: programForPath(pathname) })
  const unread = feed.data?.unread_count ?? 0
  if (unread === 0) return null
  return (
    <Badge tone="primary" size="sm">
      <Megaphone />
      {unread}
    </Badge>
  )
}

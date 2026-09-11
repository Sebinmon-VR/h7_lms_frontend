import { ArrowLeft, FileBadge } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useTuitionReportCards } from '@/queries/tuition.queries'
import { formatPercent } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  PrintReportCardButton,
  ReportCardTile,
  ReportCardView,
} from '@/components/domain/report-card'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * A tuition student's report cards.
 *
 * Rendered with the same components the school uses, because a tuition card is
 * structurally the same document — per-subject blocks, per-exam lines, one
 * overall percentage — and a parent holding one should not be able to tell
 * which product produced it.
 *
 * The one deliberate difference is `hideRank`. A one-to-one student has no
 * cohort, the backend always sends `rank: null`, and showing a permanently
 * empty "Class rank" would read as missing data rather than as the considered
 * absence it is.
 *
 * Only published cards arrive here. A card a tutor generated but has not
 * released is a working draft.
 */

/** Sorted newest-first; the list is short, so this is the whole dataset. */
function useSortedCards() {
  const query = useTuitionReportCards()
  const cards = React.useMemo(
    () =>
      [...(query.data ?? [])].sort((a, b) =>
        String(b.generated_at ?? '').localeCompare(String(a.generated_at ?? '')),
      ),
    [query.data],
  )
  return { query, cards }
}

export default function TuitionStudentReportCardsPage() {
  const navigate = useNavigate()
  const { query, cards } = useSortedCards()
  const latest = cards[0]

  return (
    <>
      <PageHeader
        title="Report cards"
        description="How each term went across your tuition subjects, written by your tutor."
      />

      <QueryBoundary
        query={query}
        loading={
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        }
        isEmpty={() => cards.length === 0}
        empty={
          <EmptyState
            icon={<FileBadge />}
            title="No report cards yet"
            description="Your tutor writes one at the end of a term. It appears here once they publish it."
          />
        }
      >
        {() => (
          <div className="space-y-5">
            {latest?.overall_percentage != null && (
              <p className="text-sm text-muted-foreground">
                Your most recent card,{' '}
                <span className="font-medium text-foreground">{latest.title}</span>, came to{' '}
                <span className="font-medium text-foreground">
                  {formatPercent(latest.overall_percentage, 0)}
                </span>
                .
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {cards.map((card) => (
                <ReportCardTile
                  key={card.id}
                  card={card}
                  showStudent={false}
                  onClick={() => navigate(`/tuition/student/report-cards/${card.id}`)}
                />
              ))}
            </div>
          </div>
        )}
      </QueryBoundary>
    </>
  )
}

/**
 * One card in full.
 *
 * Read from the same list rather than a per-card fetch: the backend has no
 * single-card endpoint for a tuition student, the list is a handful of rows,
 * and a card the list does not contain is one this student may not see.
 */
export function TuitionStudentReportCardDetailPage() {
  const { cardId } = useParams<{ cardId: string }>()
  const { query, cards } = useSortedCards()
  const card = cards.find((c) => String(c.id) === cardId)

  if (query.isPending) return <Skeleton className="h-96 rounded-xl" />

  if (!card) {
    return (
      <EmptyState
        icon={<FileBadge />}
        title="That report card is not available"
        description="It may not have been published yet, or the link may be out of date."
        action={
          <Button asChild variant="outline">
            <Link to="/tuition/student/report-cards">
              <ArrowLeft />
              Back to report cards
            </Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="print:hidden">
        <Link to="/tuition/student/report-cards">
          <ArrowLeft />
          All report cards
        </Link>
      </Button>

      <ReportCardView card={card} hideRank actions={<PrintReportCardButton />} />
    </div>
  )
}

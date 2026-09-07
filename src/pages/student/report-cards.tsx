import { ArrowLeft } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useMyReportCard, useMyReportCards } from '@/queries/exam.queries'
import { formatPercent } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { PrintReportCardButton, ReportCardTile, ReportCardView } from '@/components/domain/report-card'
import { Appear, Stagger } from '@/components/fun/motion'
import { FunEmpty, FunPageHeader, FunStat } from '@/components/fun/fun-ui'
import { ErrorState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { AdminStudentNotice, NotEnrolledState, useEnrollmentStatus } from './student-guard'

/**
 * A learner's report cards — only the ones a class teacher has released.
 *
 * The list is short (one card per term) so it leads with the headline number
 * of the latest card and lets each tile carry its own. The card itself is the
 * same component staff see, printed the same way, so what a parent holds
 * matches what the teacher signed off.
 */

export default function StudentReportCardsPage() {
  const enrollment = useEnrollmentStatus()
  const navigate = useNavigate()
  const cardsQuery = useMyReportCards(!enrollment.isAdmin)
  const cards = React.useMemo(
    () => [...(cardsQuery.data ?? [])].sort((a, b) => b.generated_at.localeCompare(a.generated_at)),
    [cardsQuery.data],
  )
  const latest = cards[0]

  if (enrollment.isAdmin) {
    return (
      <>
        <PageHeader title="Report cards" description="Report cards for the signed-in student." />
        <AdminStudentNotice />
      </>
    )
  }

  if (enrollment.notEnrolled) {
    return (
      <>
        <FunPageHeader emoji="🎓" tone={3} title="Report cards" />
        <NotEnrolledState />
      </>
    )
  }

  return (
    <>
      <FunPageHeader emoji="🎓" tone={3} title="Report cards" description="How your term went, all in one place." />

      {cardsQuery.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : cardsQuery.isError ? (
        <ErrorState error={cardsQuery.error} onRetry={() => cardsQuery.refetch()} />
      ) : cards.length === 0 ? (
        <FunEmpty
          mood="curious"
          title="No report cards yet"
          description="Your class teacher issues one at the end of a term. It will show up here as soon as it is released."
        />
      ) : (
        <div className="space-y-5">
          {latest && (
            <div className="grid gap-3 sm:grid-cols-3">
              <FunStat value={formatPercent(latest.overall_percentage, 0)} label="Latest overall" hint={latest.title} emoji="⭐" tone={3} />
              <FunStat
                value={latest.overall_grade ?? '—'}
                label="Latest grade"
                hint={latest.overall_grade ? 'Across every subject' : 'No letter grade on this card'}
                emoji="🏅"
                tone={5}
              />
              <FunStat
                value={latest.rank != null ? `#${latest.rank}` : '—'}
                label="Class position"
                hint={latest.rank != null && latest.class_size != null ? `of ${latest.class_size} students` : 'Not ranked'}
                emoji="🏆"
                tone={2}
              />
            </div>
          )}

          <Stagger className="grid gap-3 sm:grid-cols-2">
            {cards.map((card) => (
              <Appear key={card.id}>
                <ReportCardTile card={card} showStudent={false} onClick={() => navigate(`/student/report-cards/${card.id}`)} />
              </Appear>
            ))}
          </Stagger>
        </div>
      )}
    </>
  )
}

export function StudentReportCardDetailPage() {
  const enrollment = useEnrollmentStatus()
  const params = useParams<{ cardId: string }>()
  const cardQuery = useMyReportCard(params.cardId ?? null, !enrollment.isAdmin)

  if (enrollment.isAdmin) {
    return (
      <>
        <PageHeader title="Report card" />
        <AdminStudentNotice />
      </>
    )
  }

  const back = (
    <Link to="/student/report-cards" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" />
      My report cards
    </Link>
  )

  if (cardQuery.isPending) {
    return (
      <div className="mx-auto max-w-4xl">
        {back}
        <Skeleton className="h-[40rem] rounded-2xl" />
      </div>
    )
  }
  if (cardQuery.isError || !cardQuery.data) {
    return (
      <div className="mx-auto max-w-4xl">
        {back}
        <ErrorState error={cardQuery.error} onRetry={() => cardQuery.refetch()} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      {back}
      <ReportCardView card={cardQuery.data} actions={<PrintReportCardButton />} />
    </div>
  )
}

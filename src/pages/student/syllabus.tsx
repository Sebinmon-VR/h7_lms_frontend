import { ClipboardList } from 'lucide-react'
import * as React from 'react'

import { useStudentTopics } from '@/queries/student.queries'
import { syllabusProgress } from '@/lib/derive'
import { formatDate, formatDayLabel } from '@/lib/datetime'
import { formatPercent } from '@/lib/format'
import { subjectName } from '@/lib/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgressBar, ProgressRing } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { AdminStudentNotice, NotEnrolledState, useEnrollmentStatus } from './student-guard'

export default function StudentSyllabusPage() {
  const enrollment = useEnrollmentStatus()
  const topicsQuery = useStudentTopics(!enrollment.isAdmin)

  const topics = React.useMemo(() => topicsQuery.data ?? [], [topicsQuery.data])

  const progress = React.useMemo(() => syllabusProgress(topics, (t) => subjectName(t)), [topics])

  const grouped = React.useMemo(() => {
    const map = new Map<string, typeof topics>()
    for (const topic of topics) {
      const list = map.get(topic.date_covered)
      if (list) list.push(topic)
      else map.set(topic.date_covered, [topic])
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [topics])

  if (enrollment.isAdmin) {
    return (
      <>
        <PageHeader title="Syllabus" description="Topics your teachers have covered." />
        <AdminStudentNotice />
      </>
    )
  }

  if (enrollment.notEnrolled) {
    return (
      <>
        <PageHeader title="Syllabus" description="Topics your teachers have covered." />
        <NotEnrolledState />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Syllabus"
        description="What has been taught so far, and how far through each subject your class is."
      />

      {topicsQuery.isPending ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : topicsQuery.isError ? (
        <ErrorState error={topicsQuery.error} onRetry={() => topicsQuery.refetch()} />
      ) : topics.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title="No topics logged yet"
          description="Your teachers have not recorded any topics for your class yet."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {progress.map((subject) => (
              <Card key={subject.subjectId}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{subject.subjectName}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-4">
                  <ProgressRing value={subject.completion} size={64} strokeWidth={7}>
                    <span className="text-xs font-semibold tabular-nums">
                      {Math.round(subject.completion)}%
                    </span>
                  </ProgressRing>
                  <div className="min-w-0">
                    <p className="text-sm">
                      {subject.topicCount} {subject.topicCount === 1 ? 'topic' : 'topics'} covered
                    </p>
                    {subject.lastCoveredDate && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Last {formatDayLabel(subject.lastCoveredDate).toLowerCase()}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div>
            <h2 className="mb-4 text-base font-semibold">Timeline</h2>
            <div className="space-y-6">
              {grouped.map(([date, items]) => (
                <div key={date} className="relative pl-6">
                  <span
                    className="absolute left-0 top-1.5 size-2.5 rounded-full bg-accent ring-4 ring-accent/15"
                    aria-hidden
                  />
                  <span className="absolute bottom-0 left-[4.5px] top-6 w-px bg-border" aria-hidden />

                  <p className="text-sm font-semibold">{formatDayLabel(date)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(date)}</p>

                  <div className="mt-3 space-y-2">
                    {items.map((topic) => (
                      <Card key={topic.id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{topic.topic_title}</p>
                            {topic.description && (
                              <p className="mt-1 text-sm text-muted-foreground">{topic.description}</p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Badge tone="accent" size="sm">
                                {subjectName(topic)}
                              </Badge>
                              {topic.teacher && (
                                <span className="text-xs text-muted-foreground">
                                  {topic.teacher.full_name}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="w-24 shrink-0">
                            <p className="mb-1 text-right text-xs tabular-nums text-muted-foreground">
                              {formatPercent(topic.completion_percentage, 0)}
                            </p>
                            <ProgressBar value={topic.completion_percentage} size="sm" />
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

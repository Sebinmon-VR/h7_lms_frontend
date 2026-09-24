import * as React from 'react'

import { useStudentTopics } from '@/queries/student.queries'
import { syllabusProgress } from '@/lib/derive'
import { formatDate, formatDayLabel } from '@/lib/datetime'
import { formatPercent } from '@/lib/format'
import { subjectName } from '@/lib/select'
import { subjectLook, toneStyle } from '@/lib/subjects'
import { ProgressBar } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/feedback/states'
import { AttachmentList } from '@/components/forms/attachment-picker'
import {
  FunEmpty,
  FunPageHeader,
  FunSection,
  ProgressRing,
  SubjectTile,
} from '@/components/fun/fun-ui'
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
        <FunPageHeader emoji="🧗" title="What we have learned" />
        <NotEnrolledState />
      </>
    )
  }

  return (
    <>
      <FunPageHeader
        emoji="🧗"
        tone={6}
        title="What we have learned"
        description="Everything your class has covered so far."
      />

      {topicsQuery.isPending ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : topicsQuery.isError ? (
        <ErrorState error={topicsQuery.error} onRetry={() => topicsQuery.refetch()} />
      ) : topics.length === 0 ? (
        <FunEmpty
          mood="sleepy"
          title="Nothing logged yet"
          description="When your teachers write down what they taught, it will all appear here."
        />
      ) : (
        <div className="space-y-6">
          <FunSection emoji="📈" title="How far you have got">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {progress.map((subject) => (
                <div
                  key={subject.subjectId}
                  style={toneStyle(subjectLook(subject.subjectName).tone)}
                  className="sticker flex items-center gap-4 p-4"
                >
                  <ProgressRing
                    value={subject.completion}
                    tone={subjectLook(subject.subjectName).tone}
                    size={64}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{subject.subjectName}</p>
                    <p className="text-xs text-muted-foreground">
                      {subject.topicCount} {subject.topicCount === 1 ? 'topic' : 'topics'} done
                    </p>
                    {subject.lastCoveredDate && (
                      <p className="mt-0.5 text-2xs text-muted-foreground">
                        Last {formatDayLabel(subject.lastCoveredDate).toLowerCase()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </FunSection>

          <FunSection emoji="🗒️" title="Lesson by lesson">
            <div className="space-y-6">
              {grouped.map(([date, items]) => (
                <div key={date} className="relative pl-6">
                  <span
                    className="absolute left-0 top-1.5 size-3 rounded-full bg-primary ring-4 ring-primary/15"
                    aria-hidden
                  />
                  <span
                    className="absolute bottom-0 left-[5px] top-6 w-0.5 bg-border"
                    aria-hidden
                  />

                  <p className="text-sm font-bold">{formatDayLabel(date)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(date)}</p>

                  <div className="mt-3 space-y-2">
                    {items.map((topic) => {
                      const subject = subjectName(topic)
                      return (
                        <div
                          key={topic.id}
                          style={toneStyle(subjectLook(subject).tone)}
                          className="sticker p-4"
                        >
                          <div className="flex items-start gap-3">
                            <SubjectTile subject={subject} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold">{topic.topic_title}</p>
                              {topic.description && (
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {topic.description}
                                </p>
                              )}
                              <p className="mt-1.5 text-xs text-muted-foreground">
                                {subject}
                                {topic.teacher ? ` · ${topic.teacher.full_name}` : ''}
                              </p>
                              {/* The teacher's notes, board photos and voice recap. */}
                              <AttachmentList attachments={topic.attachments ?? []} compact className="mt-2" />
                            </div>
                            <div className="w-20 shrink-0">
                              <p className="mb-1 text-right text-xs font-bold tabular-nums">
                                {formatPercent(topic.completion_percentage, 0)}
                              </p>
                              <ProgressBar value={topic.completion_percentage} size="sm" />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </FunSection>
        </div>
      )}
    </>
  )
}

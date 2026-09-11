import { ClipboardCheck, PenLine } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { TuitionAssessmentCategory } from '@/api/types'
import {
  useMyTuitionMarks,
  useMyTuitionSubjects,
  useTuitionAssessments,
} from '@/queries/tuition.queries'
import { formatDateTime, formatRelative } from '@/lib/datetime'
import { formatMarks, formatPercent, performanceTone } from '@/lib/format'
import { ASSESSMENT_CATEGORIES, ASSESSMENT_CATEGORY_LABEL } from '@/lib/tuition'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * Work the student's tutor has set them.
 *
 * These are real exams as far as the rest of the app is concerned, so sitting
 * one opens the ordinary exam screen — no second answer sheet, no second set
 * of rules about timing or late hand-ins.
 */

const CATEGORY_OPTIONS: (TuitionAssessmentCategory | 'ALL')[] = ['ALL', ...ASSESSMENT_CATEGORIES]

export default function TuitionStudentAssessmentsPage() {
  const [category, setCategory] = React.useState<TuitionAssessmentCategory | 'ALL'>('ALL')
  const [subjectId, setSubjectId] = React.useState<string | null>(null)

  const subjects = useMyTuitionSubjects()
  const assessments = useTuitionAssessments('student', {
    category: category === 'ALL' ? undefined : category,
    subjectId: subjectId ? Number(subjectId) : undefined,
  })

  // Only the marked ones — see `useMyTuitionMarks`.
  const markedIds = React.useMemo(
    () => (assessments.data ?? []).filter((e) => e.results_published).map((e) => e.id),
    [assessments.data],
  )
  const marks = useMyTuitionMarks(markedIds)

  return (
    <>
      <PageHeader
        title="Homework & exams"
        description="Everything your tutor has set you — homework, assignments and papers to sit — and how you did."
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Kind</label>
          <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === 'ALL' ? 'Everything' : ASSESSMENT_CATEGORY_LABEL[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-48">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Subject</label>
          <Combobox
            value={subjectId}
            onChange={(v) => setSubjectId(v || null)}
            options={[
              { value: '', label: 'All subjects' },
              ...Array.from(
                new Map(
                  (subjects.data ?? []).map((e) => [
                    e.subject_id,
                    { value: String(e.subject_id), label: e.subject?.name ?? 'Subject' },
                  ]),
                ).values(),
              ),
            ]}
            placeholder="All subjects"
          />
        </div>
      </div>

      <QueryBoundary
        query={assessments}
        loading={
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        }
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={<ClipboardCheck />}
            title="Nothing set"
            description="Your tutor has not set you any work yet."
          />
        }
      >
        {(data) => (
          <div className="space-y-3">
            {data.map((exam) => {
              const open = exam.window_state === 'OPEN'
              return (
                <Card key={exam.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">{exam.title}</h3>
                        <Badge tone="neutral" size="sm">
                          {ASSESSMENT_CATEGORY_LABEL[exam.category]}
                        </Badge>
                        {open && (
                          <Badge tone="success" size="sm">
                            Open now
                          </Badge>
                        )}
                        {exam.results_published && (
                          <Badge tone="info" size="sm">
                            Results out
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {exam.subject?.name ?? '—'} · due {formatDateTime(exam.ends_at)} (
                        {formatRelative(exam.ends_at)}) · out of {exam.max_marks}
                      </p>
                      {exam.instructions && (
                        <p className="mt-2 text-xs text-muted-foreground">{exam.instructions}</p>
                      )}

                      {/* The mark, once it exists. Shown here rather than only
                          inside the paper: "how did I do" is the question this
                          list is opened with once a term is under way. */}
                      {(() => {
                        const script = marks.byExam[exam.id]
                        if (!exam.results_published || !script) return null
                        if (script.marks_obtained == null) {
                          return (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Marked, but no score was recorded.
                            </p>
                          )
                        }
                        const tone = performanceTone(script.percentage)
                        return (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'text-sm font-semibold tabular-nums',
                                tone === 'success' && 'text-success',
                                tone === 'warning' && 'text-warning',
                                tone === 'danger' && 'text-danger',
                              )}
                            >
                              {formatMarks(script.marks_obtained, script.max_marks ?? exam.max_marks)}
                            </span>
                            {script.percentage != null && (
                              <Badge
                                tone={
                                  tone === 'success'
                                    ? 'success'
                                    : tone === 'warning'
                                      ? 'warning'
                                      : tone === 'danger'
                                        ? 'danger'
                                        : 'neutral'
                                }
                                size="sm"
                              >
                                {formatPercent(script.percentage, 0)}
                              </Badge>
                            )}
                            {script.grade && (
                              <Badge tone="outline" size="sm">
                                {script.grade}
                              </Badge>
                            )}
                            {script.is_late && (
                              <Badge tone="warning" size="sm">
                                Handed in late
                              </Badge>
                            )}
                          </div>
                        )
                      })()}

                      {exam.results_published && marks.byExam[exam.id]?.evaluator_remarks && (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Tutor:</span>{' '}
                          {marks.byExam[exam.id]?.evaluator_remarks}
                        </p>
                      )}
                    </div>

                    {/* The tuition assessment IS an exam, so it is sat on the
                        ordinary exam screen — same timer, same hand-in rules. */}
                    <Button size="sm" variant={open ? 'solid' : 'outline'} asChild>
                      <Link to={`/student/exams/${exam.id}`}>
                        <PenLine />
                        {open ? 'Start' : 'Open'}
                      </Link>
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </QueryBoundary>
    </>
  )
}

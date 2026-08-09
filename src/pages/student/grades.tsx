import * as React from 'react'

import type { ExamGradeOut } from '@/api/types'
import { useStudentGrades } from '@/queries/student.queries'
import { averageGradePercentage } from '@/lib/derive'
import { formatDate } from '@/lib/datetime'
import { formatMarks, formatPercent, gradePercentage } from '@/lib/format'
import { subjectName } from '@/lib/select'
import { subjectLook, toneStyle } from '@/lib/subjects'
import { Skeleton } from '@/components/ui/skeleton'
import { AreaTrend } from '@/components/charts/charts'
import { ChartCard } from '@/components/charts/chart-card'
import { ErrorState } from '@/components/feedback/states'
import {
  FunChip,
  FunEmpty,
  FunPageHeader,
  FunSection,
  ProgressRing,
  SubjectTile,
} from '@/components/fun/fun-ui'
import { PageHeader } from '@/components/layout/page-header'
import { AdminStudentNotice, NotEnrolledState, useEnrollmentStatus } from './student-guard'

/**
 * A learner's marks.
 *
 * Deliberately not the sortable data table the admin gradebook uses. The
 * question a student has is "how am I doing, and in what" — best answered by a
 * big number, then per-subject cards, then the individual papers. Filtering by
 * subject replaces column sorting, which nobody under sixteen reaches for.
 */

/** Encouragement that stays truthful at every level. */
function verdict(percent: number): { emoji: string; text: string; tone: number } {
  if (percent >= 90) return { emoji: '🏆', text: 'Outstanding work!', tone: 8 }
  if (percent >= 75) return { emoji: '🌟', text: 'Really strong. Well done!', tone: 5 }
  if (percent >= 60) return { emoji: '👍', text: 'Solid — and still climbing.', tone: 6 }
  if (percent >= 40) return { emoji: '💪', text: 'Getting there. Keep practising!', tone: 2 }
  return { emoji: '🌱', text: 'Early days. Every bit of practice counts.', tone: 3 }
}

export default function StudentGradesPage() {
  const enrollment = useEnrollmentStatus()
  const gradesQuery = useStudentGrades(!enrollment.isAdmin)
  const [subjectFilter, setSubjectFilter] = React.useState<string | null>(null)

  const grades = React.useMemo(() => gradesQuery.data ?? [], [gradesQuery.data])
  const overall = React.useMemo(() => averageGradePercentage(grades), [grades])

  const bySubject = React.useMemo(() => {
    const map = new Map<number, ExamGradeOut[]>()
    for (const g of grades) {
      const list = map.get(g.subject_id)
      if (list) list.push(g)
      else map.set(g.subject_id, [g])
    }
    return [...map.entries()]
      .map(([subjectId, list]) => ({
        subjectId,
        name: subjectName(list[0]),
        average: averageGradePercentage(list),
        count: list.length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [grades])

  /** Best subject, so the page opens on something positive that is also true. */
  const best = React.useMemo(
    () =>
      bySubject.length > 1
        ? [...bySubject].sort((a, b) => (b.average ?? 0) - (a.average ?? 0))[0]
        : null,
    [bySubject],
  )

  const trend = React.useMemo(
    () =>
      [...grades]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((g) => ({
          label: g.exam_name.length > 14 ? `${g.exam_name.slice(0, 13)}…` : g.exam_name,
          percent: Number(gradePercentage(g.marks_obtained, g.max_marks).toFixed(1)),
        })),
    [grades],
  )

  const visible = React.useMemo(() => {
    const list = subjectFilter
      ? grades.filter((g) => String(g.subject_id) === subjectFilter)
      : grades
    return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [grades, subjectFilter])

  if (enrollment.isAdmin) {
    return (
      <>
        <PageHeader title="Grades" description="Your exam results." />
        <AdminStudentNotice />
      </>
    )
  }

  if (enrollment.notEnrolled) {
    return (
      <>
        <FunPageHeader emoji="⭐" title="My marks" />
        <NotEnrolledState />
      </>
    )
  }

  const overallVerdict = overall !== null ? verdict(overall) : null

  return (
    <>
      <FunPageHeader
        emoji="⭐"
        tone={3}
        title="My marks"
        description="Every test your teachers have marked."
      />

      {gradesQuery.isPending ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : gradesQuery.isError ? (
        <ErrorState error={gradesQuery.error} onRetry={() => gradesQuery.refetch()} />
      ) : grades.length === 0 ? (
        <FunEmpty
          mood="curious"
          title="No marks yet"
          description="As soon as your teacher marks a test, you will see it here. Nothing to worry about!"
        />
      ) : (
        <div className="space-y-6">
          {/* ------------------------------------------------- big number */}
          <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
            <div
              style={toneStyle(overallVerdict?.tone ?? 8)}
              className="sticker flex flex-col items-center justify-center p-6"
            >
              <ProgressRing value={overall ?? 0} tone={overallVerdict?.tone ?? 8} size={132} />
              <p className="mt-3 text-center text-sm font-bold">
                {overallVerdict?.emoji} {overallVerdict?.text}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Across {grades.length} {grades.length === 1 ? 'test' : 'tests'}
              </p>
            </div>

            <div>
              {best && (
                <div style={toneStyle(subjectLook(best.name).tone)} className="sticker mb-3 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Your strongest subject
                  </p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <SubjectTile subject={best.name} />
                    <div>
                      <p className="text-lg font-extrabold">{best.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatPercent(best.average, 0)} average
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {bySubject.map((subject) => (
                  <div
                    key={subject.subjectId}
                    style={toneStyle(subjectLook(subject.name).tone)}
                    className="sticker flex items-center gap-3 p-3"
                  >
                    <ProgressRing
                      value={subject.average ?? 0}
                      tone={subjectLook(subject.name).tone}
                      size={56}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{subject.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {subject.count} {subject.count === 1 ? 'test' : 'tests'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* --------------------------------------------------- over time */}
          {trend.length > 1 && (
            <ChartCard
              title="How you are doing over time"
              description="Each test, in the order they were marked."
            >
              <AreaTrend data={trend} xKey="label" yKey="percent" yLabel="Score" percent height={220} />
            </ChartCard>
          )}

          {/* ------------------------------------------------- every test */}
          <FunSection emoji="📝" title="Every test">
            {bySubject.length > 1 && (
              <div className="mb-3 flex flex-wrap gap-2">
                <FunChip active={!subjectFilter} onClick={() => setSubjectFilter(null)}>
                  All subjects
                </FunChip>
                {bySubject.map((subject) => (
                  <FunChip
                    key={subject.subjectId}
                    active={subjectFilter === String(subject.subjectId)}
                    tone={subjectLook(subject.name).tone}
                    onClick={() =>
                      setSubjectFilter(
                        subjectFilter === String(subject.subjectId)
                          ? null
                          : String(subject.subjectId),
                      )
                    }
                  >
                    {subjectLook(subject.name).emoji} {subject.name}
                  </FunChip>
                ))}
              </div>
            )}

            <ul className="space-y-2">
              {visible.map((grade) => {
                const percent = gradePercentage(grade.marks_obtained, grade.max_marks)
                const subject = subjectName(grade)
                return (
                  <li
                    key={grade.id}
                    style={toneStyle(subjectLook(subject).tone)}
                    className="sticker p-3"
                  >
                    <div className="flex items-center gap-3">
                      <SubjectTile subject={subject} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{grade.exam_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {subject} · {formatDate(grade.created_at)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xl font-extrabold tabular-nums">
                          {formatPercent(percent, 0)}
                        </p>
                        <p className="text-2xs text-muted-foreground tabular-nums">
                          {formatMarks(grade.marks_obtained, grade.max_marks)}
                        </p>
                      </div>
                    </div>

                    {/* A teacher's comment is the most useful thing on the row
                        when there is one, so it gets its own line rather than
                        being squeezed into a column. */}
                    {grade.remarks && (
                      <p className="mt-2 rounded-lg bg-[hsl(var(--tile)/0.10)] px-3 py-2 text-xs">
                        <span className="font-semibold">Teacher said:</span> {grade.remarks}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </FunSection>

          <p className="text-xs text-muted-foreground">
            Your average treats every test equally, even if they were marked out of different totals.
          </p>
        </div>
      )}
    </>
  )
}

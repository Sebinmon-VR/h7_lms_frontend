import {
  ClipboardCheck,
  ExternalLink,
  FileBadge,
  ListChecks,
  MoreHorizontal,
  Pencil,
  PenLine,
  Plus,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { ExamOut, TuitionAssessmentCategory } from '@/api/types'
import {
  useMyTuitionStudents,
  useTuitionAssessments,
} from '@/queries/tuition.queries'
import { formatDateTime } from '@/lib/datetime'
import { ASSESSMENT_CATEGORIES, ASSESSMENT_CATEGORY_LABEL } from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
 * Homework, assignments and exams set for one student.
 *
 * The engine behind these is the LMS exam engine unchanged, and the response
 * is an ordinary `ExamOut` — so once a piece of work exists, the existing exam
 * screens open it for question building, marking and publishing. This page's
 * job is only to create one against an ARRANGEMENT rather than a class, which
 * is the single thing the exam form cannot express.
 */

const CATEGORY_OPTIONS: (TuitionAssessmentCategory | 'ALL')[] = ['ALL', ...ASSESSMENT_CATEGORIES]

/**
 * What a teacher can do with one piece of tuition work.
 *
 * Every action deep-links into the LMS exam engine, because that IS the engine
 * behind a tuition assessment — the response is an ordinary `ExamOut`. The
 * page previously offered one "Open" button, which reached all of this
 * eventually but told nobody it existed; a teacher looking at an unmarked
 * paper had no way to know marking was two clicks away.
 *
 * `student_id` is the one genuine simplification tuition allows: an assessment
 * is set for a single student, so marking links straight to that student's
 * script rather than to a roster the teacher then has to pick from.
 */
function AssessmentActions({ exam }: { exam: ExamOut }) {
  const needsQuestions = exam.question_count === 0

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {/* The first thing a new paper needs. Promoted to the primary action
          while it has no questions, because a paper with none cannot be sat. */}
      {needsQuestions ? (
        <Button size="sm" asChild>
          <Link to={`/teacher/exams/${exam.id}`}>
            <ListChecks />
            Add questions
          </Link>
        </Button>
      ) : exam.student_id ? (
        /**
         * Whether the script has actually been handed in is NOT on `ExamOut`
         * — it comes from `/exams/{id}/stats`, and asking per row would be one
         * request per assessment on every render of this list. So marking is
         * always offered and the grading screen says what state the script is
         * in, which is where that answer already lives.
         */
        <Button size="sm" variant="outline" asChild>
          <Link to={`/teacher/exams/${exam.id}/grade/${exam.student_id}`}>
            <PenLine />
            Mark
          </Link>
        </Button>
      ) : null}

      <Button size="sm" variant="outline" asChild>
        <Link to={`/teacher/exams/${exam.id}`}>
          <ExternalLink />
          Open
        </Link>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to={`/teacher/exams/${exam.id}`}>
              <ListChecks />
              Questions and answer key
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={`/teacher/exams/${exam.id}/edit`}>
              <Pencil />
              Edit the paper
            </Link>
          </DropdownMenuItem>
          {exam.student_id && (
            <DropdownMenuItem asChild>
              <Link to={`/teacher/exams/${exam.id}/grade/${exam.student_id}`}>
                <PenLine />
                Mark the script
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link to="/teacher/report-cards">
              <FileBadge />
              Report cards
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/**
 * The "set work" dialog used to live here.
 *
 * It sent seven of the eighteen fields `TuitionAssessmentCreate` accepts, so
 * mode, grading scheme, duration, pass mark, late policy, grade bands,
 * shuffling and auto-marking were all decided silently on the teacher's
 * behalf — a tuition paper could never be as capable as the same paper set
 * for a class. Creation now owns a route: `assessment-form.tsx`.
 */

export default function TuitionTeacherAssessmentsPage() {
  const [category, setCategory] = React.useState<TuitionAssessmentCategory | 'ALL'>('ALL')
  const [studentId, setStudentId] = React.useState<string | null>(null)

  const students = useMyTuitionStudents()
  const assessments = useTuitionAssessments('teacher', {
    category: category === 'ALL' ? undefined : category,
    studentId: studentId ? Number(studentId) : undefined,
  })

  return (
    <>
      <PageHeader
        title="Homework & exams"
        description="Work set for one student at a time. Questions, marking and results use the same screens as school exams."
        actions={
          <Button asChild>
            <Link to="/tuition/teacher/assessments/new">
              <Plus />
              Set work
            </Link>
          </Button>
        }
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
                  {option === 'ALL' ? 'Anything' : ASSESSMENT_CATEGORY_LABEL[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-48">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Student</label>
          <Combobox
            value={studentId}
            onChange={(v) => setStudentId(v || null)}
            options={[
              { value: '', label: 'All students' },
              ...Array.from(
                new Map(
                  (students.data ?? []).map((e) => [
                    e.student_id,
                    { value: String(e.student_id), label: e.student?.full_name ?? 'Student' },
                  ]),
                ).values(),
              ),
            ]}
            placeholder="All students"
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
            title="No work set yet"
            description="Set homework or an exam for one of your students. It behaves exactly like a school exam from there."
            action={
              <Button asChild>
                <Link to="/tuition/teacher/assessments/new">
                  <Plus />
                  Set work
                </Link>
              </Button>
            }
          />
        }
      >
        {(data) => (
          <div className="space-y-3">
            {data.map((exam) => (
              <Card key={exam.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">{exam.title}</h3>
                      <Badge tone="neutral" size="sm">
                        {ASSESSMENT_CATEGORY_LABEL[exam.category]}
                      </Badge>
                      <Badge
                        tone={
                          exam.status === 'PUBLISHED'
                            ? 'success'
                            : exam.status === 'CANCELLED'
                              ? 'neutral'
                              : 'warning'
                        }
                        size="sm"
                      >
                        {exam.status}
                      </Badge>
                      {exam.results_published && (
                        <Badge tone="info" size="sm">
                          Results released
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {exam.subject?.name ?? '—'} · {formatDateTime(exam.starts_at)} –{' '}
                      {formatDateTime(exam.ends_at, 'HH:mm')} · {exam.question_count} question
                      {exam.question_count === 1 ? '' : 's'} · out of {exam.max_marks}
                    </p>
                    {/* A paper with no questions cannot be sat, which makes it
                        the one state worth flagging from the list. Hand-in and
                        marking state need a per-exam stats call and so live on
                        the exam screen itself. */}
                    {exam.question_count === 0 && (
                      <p className="mt-1.5 text-xs font-medium text-warning">
                        No questions yet — the student cannot sit this.
                      </p>
                    )}

                    {!exam.answer_key_complete && exam.question_count > 0 && (
                      <p className="mt-1.5 text-xs text-warning">
                        The answer key is incomplete — auto-marking will skip what is missing.
                      </p>
                    )}
                  </div>

                  <AssessmentActions exam={exam} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryBoundary>
    </>
  )
}

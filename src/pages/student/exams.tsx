import { ArrowRight, CalendarClock, Clock, Play, Timer } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { StudentExamOut } from '@/api/types'
import { useMyExams } from '@/queries/exam.queries'
import { cn } from '@/lib/cn'
import { formatCountdown, formatDateTime } from '@/lib/datetime'
import {
  STUDENT_PHASE_LABEL,
  describePaper,
  formatMinutes,
  studentExamPhase,
  type StudentExamPhase,
} from '@/lib/exams'
import { useNow } from '@/lib/hooks'
import { subjectName } from '@/lib/select'
import { subjectLook, toneStyle } from '@/lib/subjects'
import { Skeleton } from '@/components/ui/skeleton'
import { Appear, Stagger } from '@/components/fun/motion'
import { FunEmpty, FunPageHeader, FunSection, SubjectTile } from '@/components/fun/fun-ui'
import { ErrorState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { AdminStudentNotice, NotEnrolledState, useEnrollmentStatus } from './student-guard'

/**
 * A learner's exams.
 *
 * Ordered by what they can do about each one: the paper they can sit right
 * now comes first and is the biggest thing on the page, then what is coming,
 * then what is finished — with the mark on it once the teacher has released
 * it. The verbs on the buttons come from the server's own flags, so a card
 * never offers "Start" to someone the API would refuse.
 */

const PHASE_TONE: Record<StudentExamPhase, string> = {
  ready: 'bg-success text-success-foreground',
  in_progress: 'bg-info text-info-foreground',
  not_open: 'bg-[hsl(var(--tile)/0.18)] text-[hsl(var(--tile))]',
  submitted: 'bg-primary/15 text-primary',
  marked: 'bg-success/15 text-success',
  missed: 'bg-danger/15 text-danger',
  closed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground line-through',
}

function ExamCard({ exam, now, big }: { exam: StudentExamOut; now: Date; big?: boolean }) {
  const phase = studentExamPhase(exam)
  const subject = subjectName(exam)
  const look = subjectLook(subject)
  const actionable = phase === 'ready' || phase === 'in_progress'

  const verb =
    phase === 'ready' ? 'Start' : phase === 'in_progress' ? 'Continue' : phase === 'marked' ? 'See your marks' : 'Open'

  return (
    <Link
      to={`/student/exams/${exam.id}`}
      style={toneStyle(look.tone)}
      className={cn(
        'sticker sticker-hover block p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        big && 'sm:p-5',
      )}
    >
      <div className="flex items-start gap-3">
        <SubjectTile subject={subject} size={big ? 'lg' : 'md'} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn('truncate font-bold', big ? 'text-lg' : 'text-sm')}>{exam.title}</p>
            <span className={cn('rounded-full px-2 py-0.5 text-2xs font-bold', PHASE_TONE[phase])}>
              {STUDENT_PHASE_LABEL[phase]}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {subject}
            {exam.teacher ? ` · ${exam.teacher.full_name}` : ''} · {describePaper(exam)}
          </p>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {phase === 'not_open' ? (
              <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                <CalendarClock className="size-3.5" />
                Opens in {formatCountdown(exam.starts_at, now)} · {formatDateTime(exam.starts_at)}
              </span>
            ) : phase === 'ready' || phase === 'in_progress' ? (
              <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                <Clock className="size-3.5" />
                {phase === 'in_progress' && exam.expires_at
                  ? `Your time ends in ${formatCountdown(exam.expires_at, now)}`
                  : `Closes in ${formatCountdown(exam.closes_at, now)}`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3.5" />
                {exam.submitted_at ? `Handed in ${formatDateTime(exam.submitted_at)}` : formatDateTime(exam.starts_at)}
              </span>
            )}
            {exam.duration_minutes && phase !== 'marked' && phase !== 'submitted' && (
              <span className="inline-flex items-center gap-1">
                <Timer className="size-3.5" />
                {formatMinutes(exam.duration_minutes + exam.extra_time_minutes)}
                {exam.extra_time_minutes > 0 ? ' (with extra time)' : ''}
              </span>
            )}
          </div>
        </div>

        {actionable ? (
          <span className="tile-solid hidden shrink-0 items-center gap-1.5 self-center rounded-full px-4 py-2 text-sm font-bold shadow-sm sm:inline-flex">
            {phase === 'ready' ? <Play className="size-4" /> : <ArrowRight className="size-4" />}
            {verb}
          </span>
        ) : (
          <ArrowRight className="hidden size-4 shrink-0 self-center text-muted-foreground sm:block" />
        )}
      </div>
      {actionable && (
        <span className="tile-solid mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold shadow-sm sm:hidden">
          {phase === 'ready' ? <Play className="size-4" /> : <ArrowRight className="size-4" />}
          {verb}
        </span>
      )}
    </Link>
  )
}

export default function StudentExamsPage() {
  const enrollment = useEnrollmentStatus()
  const now = useNow(30_000)
  const examsQuery = useMyExams(!enrollment.isAdmin, true)
  const exams = React.useMemo(() => examsQuery.data ?? [], [examsQuery.data])

  const groups = React.useMemo(() => {
    const active: StudentExamOut[] = []
    const upcoming: StudentExamOut[] = []
    const done: StudentExamOut[] = []
    for (const exam of exams) {
      const phase = studentExamPhase(exam)
      if (phase === 'ready' || phase === 'in_progress') active.push(exam)
      else if (phase === 'not_open') upcoming.push(exam)
      else done.push(exam)
    }
    active.sort((a, b) => a.closes_at.localeCompare(b.closes_at))
    upcoming.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    done.sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    return { active, upcoming, done }
  }, [exams])

  if (enrollment.isAdmin) {
    return (
      <>
        <PageHeader title="Exams" description="Exams for the signed-in student." />
        <AdminStudentNotice />
      </>
    )
  }

  if (enrollment.notEnrolled) {
    return (
      <>
        <FunPageHeader emoji="📝" tone={7} title="My exams" />
        <NotEnrolledState />
      </>
    )
  }

  const marked = groups.done.filter((e) => studentExamPhase(e) === 'marked')

  return (
    <>
      <FunPageHeader
        emoji="📝"
        tone={7}
        title="My exams"
        description="Everything your teachers have set, and how you did."
      />

      {examsQuery.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : examsQuery.isError ? (
        <ErrorState error={examsQuery.error} onRetry={() => examsQuery.refetch()} />
      ) : exams.length === 0 ? (
        <FunEmpty mood="sleepy" title="No exams yet" description="When a teacher sets one, it will show up here with the date." />
      ) : (
        <div className="space-y-7">
          {groups.active.length > 0 && (
            <FunSection emoji="🚀" title="Happening now">
              <Stagger className="space-y-3">
                {groups.active.map((exam) => (
                  <Appear key={exam.id}>
                    <ExamCard exam={exam} now={now} big />
                  </Appear>
                ))}
              </Stagger>
            </FunSection>
          )}

          {groups.upcoming.length > 0 && (
            <FunSection emoji="📅" title="Coming up">
              <Stagger className="grid gap-3 sm:grid-cols-2">
                {groups.upcoming.map((exam) => (
                  <Appear key={exam.id}>
                    <ExamCard exam={exam} now={now} />
                  </Appear>
                ))}
              </Stagger>
            </FunSection>
          )}

          {groups.done.length > 0 && (
            <FunSection
              emoji="✅"
              title="Finished"
              action={
                marked.length > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {marked.length} with marks out
                  </span>
                ) : undefined
              }
            >
              <Stagger className="grid gap-3 sm:grid-cols-2">
                {groups.done.map((exam) => (
                  <Appear key={exam.id}>
                    <ExamCard exam={exam} now={now} />
                  </Appear>
                ))}
              </Stagger>
            </FunSection>
          )}
        </div>
      )}
    </>
  )
}

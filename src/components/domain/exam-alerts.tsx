import { BellRing, ClipboardCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { StudentExamOut } from '@/api/types'
import { useMyExams } from '@/queries/exam.queries'
import { formatDateTime, formatRelative, parseApiDateTime } from '@/lib/datetime'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'

const UPCOMING_DAYS = 7
const DONE = new Set(['SUBMITTED', 'EVALUATED', 'MISSED'])
// The exam room opens this long before the exam; matches EXAM_ROOM_LEAD_MINUTES on the server.
const ROOM_LEAD_MS = 15 * 60_000

function roomOpen(exam: StudentExamOut): boolean {
  const starts = parseApiDateTime(exam.starts_at)?.getTime()
  return starts != null && Date.now() >= starts - ROOM_LEAD_MS
}

type Alert = { exam: StudentExamOut; state: 'in_progress' | 'open' | 'upcoming' }

function alertsFrom(exams: StudentExamOut[], now: number): Alert[] {
  const horizon = now + UPCOMING_DAYS * 24 * 60 * 60_000
  const alerts: Alert[] = []
  for (const exam of exams) {
    if (exam.status !== 'PUBLISHED' || DONE.has(exam.submission_status ?? '')) continue
    if (exam.submission_status === 'IN_PROGRESS' && exam.can_submit) {
      alerts.push({ exam, state: 'in_progress' })
    } else if ((exam.window_state === 'OPEN' || exam.window_state === 'GRACE') && exam.can_start) {
      alerts.push({ exam, state: 'open' })
    } else if (exam.window_state === 'NOT_OPEN') {
      const starts = parseApiDateTime(exam.starts_at)?.getTime() ?? Infinity
      if (starts <= horizon) alerts.push({ exam, state: 'upcoming' })
    }
  }
  const rank = { in_progress: 0, open: 1, upcoming: 2 }
  return alerts.sort(
    (a, b) => rank[a.state] - rank[b.state] || a.exam.starts_at.localeCompare(b.exam.starts_at),
  )
}

/**
 * The first thing on a student's home page: any exam open now, in progress, or coming up in
 * the next week. Refreshed every minute, so an exam that opens while the page is up appears.
 */
export function ExamAlerts() {
  const query = useMyExams(true, true)
  const alerts = alertsFrom(query.data ?? [], Date.now())
  if (alerts.length === 0) return null

  const urgent = alerts.some((a) => a.state !== 'upcoming')

  return (
    <section
      role="alert"
      aria-live="polite"
      className={cn(
        'mb-6 rounded-2xl border-2 p-4 shadow-sm sm:p-5',
        urgent ? 'border-danger/50 bg-danger/8' : 'border-primary/40 bg-primary/8',
      )}
    >
      <div className="flex items-center gap-2">
        <BellRing className={cn('size-5', urgent ? 'text-danger' : 'text-primary')} />
        <h2 className="text-base font-extrabold">
          {urgent ? 'You have an exam now' : 'Exams coming up'}
        </h2>
      </div>
      <ul className="mt-3 space-y-2">
        {alerts.map(({ exam, state }) => (
          <li
            key={exam.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center"
          >
            <ClipboardCheck className="hidden size-5 shrink-0 text-muted-foreground sm:block" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {exam.title}
                {exam.subject?.name ? <span className="font-medium text-muted-foreground"> · {exam.subject.name}</span> : null}
              </p>
              <p className="text-sm text-muted-foreground">
                {state === 'in_progress' && `In progress · hand in by ${formatDateTime(exam.closes_at)}`}
                {state === 'open' && `Open now · closes ${formatDateTime(exam.closes_at)}`}
                {state === 'upcoming' && `Opens ${formatDateTime(exam.starts_at)} (${formatRelative(exam.starts_at)})`}
              </p>
            </div>
            <Button asChild variant={state === 'upcoming' ? 'outline' : 'primary'} size="sm">
              <Link
                to={
                  exam.live_invigilation && (state !== 'upcoming' || roomOpen(exam))
                    ? `/call/exam/${exam.id}`
                    : `/student/exams/${exam.id}`
                }
              >
                {state === 'in_progress'
                  ? 'Continue'
                  : state === 'open'
                    ? exam.live_invigilation
                      ? 'Join exam room'
                      : 'Start exam'
                    : exam.live_invigilation && roomOpen(exam)
                      ? 'Join exam room'
                      : 'View'}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

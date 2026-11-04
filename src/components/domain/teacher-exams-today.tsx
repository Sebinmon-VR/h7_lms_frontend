import { ClipboardCheck, Video } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { ExamOut } from '@/api/types'
import { useExams } from '@/queries/exam.queries'
import { formatDateTime, formatRelative, parseApiDateTime } from '@/lib/datetime'
import { Button } from '@/components/ui/button'

// How early the exam room lets the teacher in; matches EXAM_HOST_LEAD_MINUTES on the server.
const ROOM_LEAD_MS = 30 * 60_000
const HORIZON_MS = 24 * 60 * 60_000

type Row = { exam: ExamOut; live: boolean; roomOpen: boolean }

function rowsFrom(exams: ExamOut[], now: number): Row[] {
  const rows: Row[] = []
  for (const exam of exams) {
    if (exam.status !== 'PUBLISHED') continue
    const starts = parseApiDateTime(exam.starts_at)?.getTime()
    const ends = parseApiDateTime(exam.ends_at)?.getTime()
    if (starts == null || ends == null) continue
    const closes = ends + (exam.upload_grace_minutes ?? 0) * 60_000
    if (now > closes || starts - now > HORIZON_MS) continue
    rows.push({ exam, live: now >= starts, roomOpen: !!exam.live_invigilation && now >= starts - ROOM_LEAD_MS })
  }
  return rows.sort((a, b) => a.exam.starts_at.localeCompare(b.exam.starts_at))
}

/**
 * The teacher's way into today's exams, first on their home page: what is running now and
 * what starts in the next day, with the exam room one press away for a live-invigilated one.
 */
export function TeacherExamsToday({ examPath }: { examPath: (examId: number) => string }) {
  const query = useExams()
  const rows = rowsFrom(query.data ?? [], Date.now())
  if (rows.length === 0) return null

  return (
    <section className="mb-6 rounded-2xl border-2 border-primary/40 bg-primary/8 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="size-5 text-primary" />
        <h2 className="text-base font-semibold">Exams today</h2>
      </div>
      <ul className="mt-3 space-y-2">
        {rows.map(({ exam, live, roomOpen }) => (
          <li
            key={exam.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {exam.title}
                <span className="font-normal text-muted-foreground">
                  {' · '}
                  {[exam.class_room?.name, exam.subject?.name].filter(Boolean).join(' · ')}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {live
                  ? `Running now · closes ${formatDateTime(exam.ends_at)}`
                  : `Starts ${formatDateTime(exam.starts_at)} (${formatRelative(exam.starts_at)})`}
                {exam.live_invigilation ? ' · live invigilation' : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {roomOpen && (
                <Button asChild variant="primary" size="sm" icon={<Video />}>
                  <Link to={`/call/exam/${exam.id}`}>Open exam room</Link>
                </Button>
              )}
              <Button asChild variant="outline" size="sm">
                <Link to={examPath(exam.id)}>{live ? 'Watch progress' : 'View'}</Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

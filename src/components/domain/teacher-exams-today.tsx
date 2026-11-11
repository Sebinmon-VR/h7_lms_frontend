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
    <section>
      <div className="mb-3 flex items-center gap-2">
        <ClipboardCheck className="size-4 text-primary" />
        <h2 className="text-[15px] font-semibold tracking-tight">Exams today</h2>
        <span className="text-sm font-semibold tabular-nums text-primary">{rows.length}</span>
      </div>
      <ul className="divide-y divide-border border-y border-border">
        {rows.map(({ exam, live, roomOpen }) => (
          <li key={exam.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {live && <span className="mr-2 text-xs font-semibold text-success">Running</span>}
                {exam.title}
                <span className="font-normal text-muted-foreground">
                  {' · '}
                  {[exam.class_room?.name, exam.subject?.name].filter(Boolean).join(' · ')}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
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

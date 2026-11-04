import { CheckCircle2, CircleDashed, LogOut, PenLine } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { examApi } from '@/api/exam.api'
import type { SubmissionOut } from '@/api/types'
import { useExam, useExamStats, useExamSubmissions } from '@/queries/exam.queries'
import { formatRelative, formatTime } from '@/lib/datetime'
import { fileNameFromUrl } from '@/lib/files'
import { cn } from '@/lib/cn'
import { Skeleton } from '@/components/ui/skeleton'
import { InlineFileRow } from '@/components/domain/document-viewer'

const STATUS: Record<string, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  IN_PROGRESS: { label: 'Writing', tone: 'text-primary', Icon: PenLine },
  SUBMITTED: { label: 'Handed in', tone: 'text-success', Icon: CheckCircle2 },
  EVALUATED: { label: 'Handed in', tone: 'text-success', Icon: CheckCircle2 },
  MISSED: { label: 'Missed', tone: 'text-danger', Icon: CircleDashed },
}

function Row({ submission }: { submission: SubmissionOut }) {
  const away = submission.status === 'IN_PROGRESS' && !!submission.away_since
  const look = away
    ? { label: `Away since ${formatTime(submission.away_since!)}`, tone: 'text-warning', Icon: LogOut }
    : (STATUS[submission.status] ?? STATUS.IN_PROGRESS)
  const when = submission.submitted_at ?? submission.started_at
  const absences = submission.away_log?.length ?? 0
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
        away ? 'border-warning/50 bg-warning/8' : 'border-border',
      )}
    >
      <look.Icon className={cn('size-4 shrink-0', look.tone)} />
      <span className="min-w-0 flex-1 truncate">{submission.student?.full_name ?? 'Student'}</span>
      <span className={cn('text-xs font-medium', look.tone)}>
        {look.label}
        {submission.is_late ? ' · late' : ''}
        {!away && absences > 0 ? ` · left ${absences}×` : ''}
      </span>
      {when && <span className="hidden text-2xs text-muted-foreground xl:inline">{formatRelative(when)}</span>}
    </li>
  )
}

/**
 * The invigilator's side of the exam room: who has started and who has handed in, refreshed
 * as it changes, and the question paper to hand. The students' cameras are the call itself.
 */
export function InvigilatorPanel({ examId }: { examId: number }) {
  const exam = useExam(examId)
  const stats = useExamStats(examId, true)
  const submissions = useExamSubmissions(examId, true)

  const rows = [...(submissions.data ?? [])].sort((a, b) =>
    (a.student?.full_name ?? '').localeCompare(b.student?.full_name ?? ''),
  )
  // A heads-up the moment somebody steps out, not only a changed row.
  const awaySeen = React.useRef<Set<string> | null>(null)
  React.useEffect(() => {
    const away = new Set(
      (submissions.data ?? []).filter((x) => x.status === 'IN_PROGRESS' && x.away_since).map((x) => x.id),
    )
    if (awaySeen.current) {
      for (const sub of submissions.data ?? []) {
        if (away.has(sub.id) && !awaySeen.current.has(sub.id)) {
          toast.warning(`${sub.student?.full_name ?? 'A student'} left the exam`, {
            description: 'Their time keeps running.',
          })
        }
      }
    }
    awaySeen.current = away
  }, [submissions.data])

  const s = stats.data
  const notStarted = s ? Math.max(s.enrolled_students - s.started, 0) : null

  return (
    <div className="space-y-4 p-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: 'Writing', value: s ? s.started - s.submitted - s.evaluated : null },
          { label: 'Away', value: submissions.data ? submissions.data.filter((x) => x.status === 'IN_PROGRESS' && x.away_since).length : null },
          { label: 'Handed in', value: s ? s.submitted + s.evaluated : null },
          { label: 'Not started', value: notStarted },
        ].map((tile) => (
          <div key={tile.label} className="rounded-lg border border-border bg-card px-2 py-2">
            <p className="text-lg font-semibold tabular-nums">{tile.value ?? '–'}</p>
            <p className="text-2xs text-muted-foreground">{tile.label}</p>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Students</h2>
        {submissions.isPending ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nobody has started yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((submission) => (
              <Row key={submission.id} submission={submission} />
            ))}
          </ul>
        )}
      </section>

      {exam.data?.question_paper_url && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Question paper</h2>
          <InlineFileRow
            name={fileNameFromUrl(exam.data.question_paper_url) ?? 'Question paper'}
            cacheKey={`paper-${examId}-${exam.data.question_paper_url}`}
            load={() => examApi.paperFile(examId)}
            height="60vh"
          />
        </section>
      )}
    </div>
  )
}

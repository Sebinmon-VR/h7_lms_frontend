import { CalendarClock, Video } from 'lucide-react'
import * as React from 'react'

import type { TuitionSessionOut, TuitionSessionStatus } from '@/api/types'
import {
  useJoinTuitionSession,
  useMyTuitionSubjects,
  useTuitionProfile,
  useTuitionSessions,
} from '@/queries/tuition.queries'
import { shiftApiDate, todayApiDate } from '@/lib/datetime'
import { SESSION_STATUS_LABEL, isClosed } from '@/lib/tuition'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { DatePicker } from '@/components/ui/date-picker'
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
import { SessionCard, TimezoneNote } from '@/components/domain/tuition'
import { PageHeader } from '@/components/layout/page-header'

/**
 * The student's classes.
 *
 * Joining goes through the server rather than opening a link the list already
 * had. The join timestamp is what decides whether the student was on time, and
 * a student who clicked a stale link is invisible to it — so the button calls
 * the join endpoint and opens whatever link comes back.
 */

const STATUS_OPTIONS: (TuitionSessionStatus | 'ALL')[] = [
  'ALL',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW_TEACHER',
  'NO_SHOW_STUDENT',
]

export default function TuitionStudentSessionsPage() {
  const profile = useTuitionProfile()
  const subjects = useMyTuitionSubjects()

  const today = todayApiDate()
  const [from, setFrom] = React.useState(() => shiftApiDate(today, -14))
  const [to, setTo] = React.useState(() => shiftApiDate(today, 14))
  const [status, setStatus] = React.useState<TuitionSessionStatus | 'ALL'>('ALL')
  const [subjectId, setSubjectId] = React.useState<string | null>(null)

  const sessions = useTuitionSessions('student', {
    from,
    to,
    status: status === 'ALL' ? undefined : status,
    who: subjectId ? Number(subjectId) : undefined,
  })

  const join = useJoinTuitionSession()

  const openClass = (session: TuitionSessionOut) => {
    join.mutate(String(session.id), {
      onSuccess: (updated) => {
        const link = updated.meeting_link ?? session.meeting_link
        if (link) window.open(link, '_blank', 'noopener')
      },
    })
  }

  return (
    <>
      <PageHeader
        title="My classes"
        description="Join a class, or look back at one you have already had."
      >
        <TimezoneNote timezone={profile.data?.effective_timezone} />
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-end gap-3">
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

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Status</label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === 'ALL' ? 'Any status' : SESSION_STATUS_LABEL[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">From</label>
          <DatePicker value={from} onChange={(v) => v && setFrom(v)} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">To</label>
          <DatePicker value={to} onChange={(v) => v && setTo(v)} />
        </div>
      </div>

      <QueryBoundary
        query={sessions}
        loading={
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        }
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={<CalendarClock />}
            title="No classes in this window"
            description="Try widening the dates."
          />
        }
      >
        {(data) => (
          <div className="space-y-3">
            {data.map((session) => (
              <SessionCard
                key={String(session.id)}
                session={session}
                viewerIsTeacher={false}
                actions={
                  !isClosed(session) ? (
                    <Button
                      size="sm"
                      loading={join.isPending && join.variables === String(session.id)}
                      onClick={() => openClass(session)}
                    >
                      <Video />
                      Join
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </QueryBoundary>
    </>
  )
}

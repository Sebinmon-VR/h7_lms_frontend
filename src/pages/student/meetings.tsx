import { Check, Copy, ExternalLink, Film, Hourglass, Radio } from 'lucide-react'
import * as React from 'react'

import type { LiveMeetingOut } from '@/api/types'
import { useStudentMeetings } from '@/queries/student.queries'
import { splitMeetings } from '@/lib/derive'
import { cn } from '@/lib/cn'
import { formatDateTime, meetingPhase } from '@/lib/datetime'
import { resolveFileUrl } from '@/lib/files'
import { recordingIsPending } from '@/lib/recordings'
import { subjectName } from '@/lib/select'
import { subjectLook, toneStyle } from '@/lib/subjects'
import { ClassTimingBadge, JoinClassButton } from '@/components/domain/live-class'
import { useCopyToClipboard, useNow } from '@/lib/hooks'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MeetingPhaseBadge } from '@/components/domain/badges'
import { ErrorState } from '@/components/feedback/states'
import { FunEmpty, FunPageHeader, SubjectTile } from '@/components/fun/fun-ui'
import { PageHeader } from '@/components/layout/page-header'
import { AdminStudentNotice, NotEnrolledState, useEnrollmentStatus } from './student-guard'

function StudentMeetingCard({ meeting, now }: { meeting: LiveMeetingOut; now: Date }) {
  const phase = meetingPhase(meeting.scheduled_time, now)
  const { copied, copy } = useCopyToClipboard()
  const recording = resolveFileUrl(meeting.recording_url)
  const subject = subjectName(meeting)

  return (
    <div
      style={toneStyle(subjectLook(subject).tone)}
      className={cn('sticker p-4', phase === 'live' && 'shadow-glow')}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <SubjectTile subject={subject} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <MeetingPhaseBadge phase={phase} />
              {/* The server's countdown. It knows about the early-join window,
                  the grace period and whether the teacher has actually
                  started; `formatCountdown` only knew the scheduled time. */}
              {phase !== 'past' && <ClassTimingBadge meetingId={meeting.id} />}
            </div>
            <p className="mt-1.5 truncate text-base font-bold">{meeting.title}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatDateTime(meeting.scheduled_time)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {subject}
              {meeting.teacher ? ` · with ${meeting.teacher.full_name}` : ''}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* The server's clock, not ours.
              This used to link straight to `meeting.meeting_link` with the
              phase worked out from `scheduled_time`, which let a student walk
              into a room before it opened and disagreed with the server the
              moment a teacher started late. The button below is bound to
              `may_join` and fetches the link through `/classes/{id}/join`,
              which enforces the same rule. */}
          {phase !== 'past' && (
            <JoinClassButton
              meetingId={meeting.id}
              size={phase === 'live' ? 'lg' : 'sm'}
            />
          )}
          {meeting.meeting_link && phase !== 'past' && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy the link"
              onClick={() => void copy(meeting.meeting_link as string)}
            >
              {copied ? <Check className="text-success" /> : <Copy />}
            </Button>
          )}
          {recording && (
            <Button asChild variant="outline" size="sm">
              <a href={recording} target="_blank" rel="noopener noreferrer">
                <Film className="size-4" />
                Watch it back
                <ExternalLink className="size-3" />
              </a>
            </Button>
          )}
          {/* A recorded class takes a few minutes to arrive. Saying so beats an
              empty space that reads as "your teacher forgot". */}
          {!recording && phase === 'past' && recordingIsPending(meeting) && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground">
              <Hourglass className="size-3.5" />
              Recording on its way
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function StudentMeetingsPage() {
  const enrollment = useEnrollmentStatus()
  const meetingsQuery = useStudentMeetings(!enrollment.isAdmin)
  const now = useNow(30_000)

  const groups = React.useMemo(
    () => splitMeetings(meetingsQuery.data ?? [], now),
    [meetingsQuery.data, now],
  )

  if (enrollment.isAdmin) {
    return (
      <>
        <PageHeader title="Meetings" description="Live classes and recordings." />
        <AdminStudentNotice />
      </>
    )
  }

  if (enrollment.notEnrolled) {
    return (
      <>
        <FunPageHeader emoji="🎥" title="Live classes" />
        <NotEnrolledState />
      </>
    )
  }

  const renderList = (list: LiveMeetingOut[], emptyTitle: string, emptyBody: string) => {
    if (meetingsQuery.isPending) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      )
    }
    if (meetingsQuery.isError) {
      return <ErrorState error={meetingsQuery.error} onRetry={() => meetingsQuery.refetch()} />
    }
    if (list.length === 0) {
      return <FunEmpty mood="sleepy" title={emptyTitle} description={emptyBody} />
    }
    return (
      <div className="space-y-3">
        {list.map((meeting) => (
          <StudentMeetingCard key={meeting.id} meeting={meeting} now={now} />
        ))}
      </div>
    )
  }

  return (
    <>
      <FunPageHeader
        emoji="🎥"
        tone={9}
        title="Live classes"
        description="Join a class, or watch one back later."
      />

      <Tabs defaultValue={groups.live.length > 0 ? 'live' : 'upcoming'}>
        <TabsList>
          <TabsTrigger value="live">
            {groups.live.length > 0 && <Radio className="text-danger" />}
            On now ({groups.live.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming">Coming up ({groups.upcoming.length})</TabsTrigger>
          <TabsTrigger value="recordings">Watch back ({groups.recordings.length})</TabsTrigger>
          <TabsTrigger value="past">Finished ({groups.past.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="live">
          {renderList(
            groups.live,
            'Nothing on right now',
            'A class pops up here 10 minutes before it starts.',
          )}
        </TabsContent>
        <TabsContent value="upcoming">
          {renderList(
            groups.upcoming,
            'Nothing planned yet',
            'When your teacher sets up a live class, you will see it here.',
          )}
        </TabsContent>
        <TabsContent value="recordings">
          {renderList(
            groups.recordings,
            'Nothing to watch yet',
            'Recorded classes turn up here a few minutes after they finish, and you can watch them any time.',
          )}
        </TabsContent>
        <TabsContent value="past">
          {renderList(groups.past, 'Nothing finished yet', 'Classes move here once they are over.')}
        </TabsContent>
      </Tabs>
    </>
  )
}

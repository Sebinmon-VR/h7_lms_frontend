import { Check, Copy, ExternalLink, Film, Hourglass, Radio, Video } from 'lucide-react'
import * as React from 'react'

import type { LiveMeetingOut } from '@/api/types'
import { useStudentMeetings } from '@/queries/student.queries'
import { splitMeetings } from '@/lib/derive'
import { cn } from '@/lib/cn'
import { formatCountdown, formatDateTime, meetingPhase } from '@/lib/datetime'
import { resolveFileUrl } from '@/lib/files'
import { subjectName } from '@/lib/select'
import { subjectLook, toneStyle } from '@/lib/subjects'
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
              {phase === 'upcoming' && (
                <span className="text-xs font-semibold text-muted-foreground">
                  starts in {formatCountdown(meeting.scheduled_time, now)}
                </span>
              )}
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
          {meeting.meeting_link && phase !== 'past' && (
            <>
              <Button
                asChild
                variant={phase === 'live' ? 'primary' : 'outline'}
                size={phase === 'live' ? 'lg' : 'sm'}
                className={phase === 'live' ? 'animate-pulse-ring' : undefined}
              >
                <a href={meeting.meeting_link} target="_blank" rel="noopener noreferrer">
                  <Video className="size-4" />
                  {phase === 'live' ? 'Join now!' : 'Open link'}
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Copy the link"
                onClick={() => void copy(meeting.meeting_link as string)}
              >
                {copied ? <Check className="text-success" /> : <Copy />}
              </Button>
            </>
          )}
          {/* A class can legitimately be saved without a link — Meet generation
              is best-effort. Say so plainly rather than leaving a gap the
              student reads as a broken page. */}
          {!meeting.meeting_link && phase !== 'past' && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground">
              <Hourglass className="size-3.5" />
              Link coming soon
            </span>
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
            'If your teacher records a class, you can watch it here any time.',
          )}
        </TabsContent>
        <TabsContent value="past">
          {renderList(groups.past, 'Nothing finished yet', 'Classes move here once they are over.')}
        </TabsContent>
      </Tabs>
    </>
  )
}

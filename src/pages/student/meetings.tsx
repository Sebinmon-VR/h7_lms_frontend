import { Check, Copy, ExternalLink, Film, Hourglass, Radio, Video } from 'lucide-react'
import * as React from 'react'

import type { LiveMeetingOut } from '@/api/types'
import { useStudentMeetings } from '@/queries/student.queries'
import { splitMeetings } from '@/lib/derive'
import { formatCountdown, formatDateTime, meetingPhase } from '@/lib/datetime'
import { resolveFileUrl } from '@/lib/files'
import { subjectName } from '@/lib/select'
import { useCopyToClipboard, useNow } from '@/lib/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MeetingPhaseBadge } from '@/components/domain/badges'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { AdminStudentNotice, NotEnrolledState, useEnrollmentStatus } from './student-guard'

function StudentMeetingCard({ meeting, now }: { meeting: LiveMeetingOut; now: Date }) {
  const phase = meetingPhase(meeting.scheduled_time, now)
  const { copied, copy } = useCopyToClipboard()
  const recording = resolveFileUrl(meeting.recording_url)

  return (
    <Card className={phase === 'live' ? 'border-danger/40 shadow-glow' : undefined}>
      <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <MeetingPhaseBadge phase={phase} />
            {phase === 'upcoming' && (
              <span className="text-xs text-muted-foreground">
                starts in {formatCountdown(meeting.scheduled_time, now)}
              </span>
            )}
          </div>
          <p className="mt-2 truncate text-base font-semibold">{meeting.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{formatDateTime(meeting.scheduled_time)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="accent" size="sm">
              {subjectName(meeting)}
            </Badge>
            {meeting.teacher && (
              <span className="text-xs text-muted-foreground">{meeting.teacher.full_name}</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {meeting.meeting_link && phase !== 'past' && (
            <>
              <Button asChild variant={phase === 'live' ? 'primary' : 'outline'} size="sm">
                <a href={meeting.meeting_link} target="_blank" rel="noopener noreferrer">
                  <Video className="size-4" />
                  {phase === 'live' ? 'Join now' : 'Open link'}
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Copy meeting link"
                onClick={() => void copy(meeting.meeting_link as string)}
              >
                {copied ? <Check className="text-success" /> : <Copy />}
              </Button>
            </>
          )}
          {/* A meeting can legitimately be saved without a link — Meet
              generation is best-effort. Say so rather than showing an empty
              space the student reads as a broken page. */}
          {!meeting.meeting_link && phase !== 'past' && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground">
              <Hourglass className="size-3.5" />
              Link not published yet
            </span>
          )}
          {recording && (
            <Button asChild variant="outline" size="sm">
              <a href={recording} target="_blank" rel="noopener noreferrer">
                <Film className="size-4" />
                Watch recording
                <ExternalLink className="size-3" />
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
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
        <PageHeader title="Meetings" description="Live classes and recordings." />
        <NotEnrolledState />
      </>
    )
  }

  const renderList = (list: LiveMeetingOut[], emptyTitle: string, emptyBody: string) => {
    if (meetingsQuery.isPending) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )
    }
    if (meetingsQuery.isError) {
      return <ErrorState error={meetingsQuery.error} onRetry={() => meetingsQuery.refetch()} />
    }
    if (list.length === 0) {
      return <EmptyState icon={<Video />} title={emptyTitle} description={emptyBody} />
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
      <PageHeader title="Meetings" description="Join live classes and catch up on recordings." />

      <Tabs defaultValue={groups.live.length > 0 ? 'live' : 'upcoming'}>
        <TabsList>
          <TabsTrigger value="live">
            {groups.live.length > 0 && <Radio className="text-danger" />}
            Live ({groups.live.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({groups.upcoming.length})</TabsTrigger>
          <TabsTrigger value="recordings">Recordings ({groups.recordings.length})</TabsTrigger>
          <TabsTrigger value="past">Past ({groups.past.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="live">
          {renderList(groups.live, 'Nothing live right now', 'A class appears here from 10 minutes before it starts.')}
        </TabsContent>
        <TabsContent value="upcoming">
          {renderList(groups.upcoming, 'No upcoming classes', 'When your teacher schedules a live class it will show here.')}
        </TabsContent>
        <TabsContent value="recordings">
          {renderList(groups.recordings, 'No recordings yet', 'Recordings your teachers attach will be available here.')}
        </TabsContent>
        <TabsContent value="past">
          {renderList(groups.past, 'No past classes', 'Classes move here once they have finished.')}
        </TabsContent>
      </Tabs>
    </>
  )
}

import { ArrowRight, BookOpen, CalendarClock, Video } from 'lucide-react'
import { Link } from 'react-router-dom'

import {
  useJoinTuitionSession,
  useMyTuitionSubjects,
  useMyTuitionTimetable,
  useTuitionProfile,
  useTuitionStudentReport,
  useTuitionUpcoming,
} from '@/queries/tuition.queries'
import { greeting } from '@/lib/format'
import { DAY_SHORT } from '@/lib/timetable'
import { isClosed, shortTime, sortSlots } from '@/lib/tuition'
import { useAuth } from '@/providers/auth-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AttendanceTotalsGrid, SessionCard, TimezoneNote } from '@/components/domain/tuition'
import { TuitionTimezoneCard } from '@/components/domain/tuition-timezone'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { HeroHeader } from '@/components/layout/page-header'

/**
 * The student's tuition home.
 *
 * One question first — when is my next class and how do I get into it — and
 * everything else after. The Join button calls the server rather than opening
 * a stored link, because arriving is a thing the system records.
 */
export default function TuitionStudentDashboardPage() {
  const { user } = useAuth()
  const profile = useTuitionProfile()
  const upcoming = useTuitionUpcoming('student', 5)
  const subjects = useMyTuitionSubjects()
  const timetable = useMyTuitionTimetable('student')
  const report = useTuitionStudentReport('student', null)
  const join = useJoinTuitionSession()

  const weekly = sortSlots(timetable.data ?? [])

  return (
    <>
      <HeroHeader
        eyebrow="Online tuition"
        title={`${greeting()}, ${user?.full_name?.split(' ')[0] ?? 'there'}`}
        description="Your one-to-one classes, your tutors, and how you have been getting on."
        actions={
          <Button asChild>
            <Link to="/tuition/student/sessions">
              All my classes
              <ArrowRight />
            </Link>
          </Button>
        }
      >
        <TimezoneNote timezone={profile.data?.effective_timezone} />
      </HeroHeader>

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="size-4 text-primary" />
            Coming up
          </h2>

          <QueryBoundary
            query={upcoming}
            loading={
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            }
            isEmpty={(data) => data.length === 0}
            empty={
              <EmptyState
                icon={<Video />}
                title="No classes coming up"
                description="Your tutor or the office will schedule them. They show up here as soon as they do."
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
                          onClick={() =>
                            join.mutate(String(session.id), {
                              onSuccess: (updated) => {
                                const link = updated.meeting_link ?? session.meeting_link
                                if (link) window.open(link, '_blank', 'noopener')
                              },
                            })
                          }
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
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="size-4 text-primary" />
              Your tutors
            </h2>
            <QueryBoundary
              query={subjects}
              loading={
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-11" />
                  ))}
                </div>
              }
              isEmpty={(data) => data.length === 0}
              empty={
                <p className="py-6 text-center text-sm text-muted-foreground">
                  You are not enrolled in any tuition subjects yet.
                </p>
              }
            >
              {(data) => (
                <ul className="space-y-1.5">
                  {data.map((enrollment) => (
                    <li
                      key={enrollment.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <span className="truncate font-medium">
                        {enrollment.subject?.name ?? 'Subject'}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {enrollment.teacher?.full_name ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </QueryBoundary>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">When your classes are</h2>
            <QueryBoundary
              query={timetable}
              loading={
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-11" />
                  ))}
                </div>
              }
              isEmpty={() => weekly.length === 0}
              empty={
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No regular class times set yet.
                </p>
              }
            >
              {() => (
                <ul className="space-y-1.5">
                  {weekly.map((slot) => (
                    <li
                      key={slot.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <Badge tone="outline" size="sm" className="w-14 justify-center">
                        {DAY_SHORT[slot.day_of_week]}
                      </Badge>
                      <span className="tabular-nums">
                        {shortTime(slot.start_time)}–{shortTime(slot.end_time)}
                      </span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {slot.subject?.name}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </QueryBoundary>
          </Card>
        </div>

        <TuitionTimezoneCard />

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">How you have been attending</h2>
          <QueryBoundary
            query={report}
            loading={
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            }
          >
            {(data) => <AttendanceTotalsGrid totals={data.totals} />}
          </QueryBoundary>
        </Card>
      </div>
    </>
  )
}

import { ArrowRight, CalendarClock, Users, Video } from 'lucide-react'
import { Link } from 'react-router-dom'

import {
  useMyTuitionStudents,
  useMyTuitionTimetable,
  useTuitionProfile,
  useTuitionTeacherReport,
  useTuitionUpcoming,
} from '@/queries/tuition.queries'
import { greeting } from '@/lib/format'
import { DAY_SHORT } from '@/lib/timetable'
import { shortTime, sortSlots } from '@/lib/tuition'
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
 * The tutor's landing page.
 *
 * Leads with what is about to happen rather than with totals: a tuition
 * teacher's next class is usually within the hour, and the countdown on it
 * comes from the server — so this list refetches rather than ticking locally,
 * which is why it can be trusted at a glance.
 */
export default function TuitionTeacherDashboardPage() {
  const { user } = useAuth()
  const profile = useTuitionProfile()
  const upcoming = useTuitionUpcoming('teacher', 6)
  const students = useMyTuitionStudents()
  const timetable = useMyTuitionTimetable('teacher')
  const report = useTuitionTeacherReport('teacher', null)

  const weekly = sortSlots(timetable.data ?? [])

  return (
    <>
      <HeroHeader
        eyebrow="Online tuition"
        title={`${greeting()}, ${user?.full_name?.split(' ')[0] ?? 'there'}`}
        description="Your one-to-one classes, the students you tutor, and how the term is going."
        actions={
          <Button asChild>
            <Link to="/tuition/teacher/sessions">
              Class console
              <ArrowRight />
            </Link>
          </Button>
        }
      >
        <TimezoneNote timezone={profile.data?.effective_timezone} />
      </HeroHeader>

      <div className="space-y-6">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="size-4 text-primary" />
              Coming up
            </h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tuition/teacher/sessions">See all</Link>
            </Button>
          </div>

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
                title="Nothing scheduled"
                description="Once an administrator sets your weekly class times, your classes appear here."
              />
            }
          >
            {(data) => (
              <div className="space-y-3">
                {data.map((session) => (
                  <SessionCard
                    key={String(session.id)}
                    session={session}
                    viewerIsTeacher
                    actions={
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/tuition/teacher/sessions">Open</Link>
                      </Button>
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
              <Users className="size-4 text-primary" />
              Your students
            </h2>
            <QueryBoundary
              query={students}
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
                  No students assigned to you yet.
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
                        {enrollment.student?.full_name ?? 'Student'}
                      </span>
                      <Badge tone="outline" size="sm">
                        {enrollment.subject?.name ?? '—'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </QueryBoundary>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Your weekly pattern</h2>
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
                  No recurring class times yet.
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
                        {slot.student?.full_name} · {slot.subject?.name}
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
          <h2 className="mb-3 text-sm font-semibold">Your teaching, last 30 days</h2>
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

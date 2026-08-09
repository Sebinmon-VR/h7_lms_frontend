import { ChevronLeft, ChevronRight } from 'lucide-react'
import * as React from 'react'

import {
  useStudentDaySchedule,
  useStudentTimetable,
  useStudentUpcoming,
} from '@/queries/student.queries'
import { formatDayLabel, shiftApiDate, todayApiDate } from '@/lib/datetime'
import { dayOfWeekFor } from '@/lib/timetable'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DaySchedule, TimetableWeek, UpcomingPeriods } from '@/components/domain/timetable'
import { FunPageHeader } from '@/components/fun/fun-ui'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'
import { AdminStudentNotice, NotEnrolledState, useEnrollmentStatus } from './student-guard'

export default function StudentTimetablePage() {
  const { isAdmin, notEnrolled } = useEnrollmentStatus()
  const [onDate, setOnDate] = React.useState(() => todayApiDate())

  const weekQuery = useStudentTimetable(!isAdmin)
  const dayQuery = useStudentDaySchedule(onDate, !isAdmin)
  const upcomingQuery = useStudentUpcoming(!isAdmin)

  if (isAdmin) {
    return (
      <>
        <PageHeader title="Timetable" description="Your weekly class schedule." />
        <AdminStudentNotice />
      </>
    )
  }

  // An empty timetable here is not "nothing scheduled yet" — say which it is.
  if (notEnrolled) {
    return (
      <>
        <FunPageHeader emoji="🗓️" title="My timetable" />
        <NotEnrolledState />
      </>
    )
  }

  const isToday = onDate === todayApiDate()

  return (
    <>
      <FunPageHeader
        emoji="🗓️"
        tone={7}
        title="My timetable"
        description="When each of your classes happens."
      />

      <Tabs defaultValue="week">
        <TabsList>
          <TabsTrigger value="week">Whole week</TabsTrigger>
          <TabsTrigger value="day">One day</TabsTrigger>
        </TabsList>

        <TabsContent value="week">
          <div className="grid gap-4 xl:grid-cols-[1fr_19rem]">
            <QueryBoundary query={weekQuery} loading={<Skeleton className="h-96 rounded-xl" />}>
              {(entries) => (
                <TimetableWeek
                  entries={entries}
                  scope="student"
                  today={dayOfWeekFor(new Date())}
                  emptyDescription="Your timetable has not been set up yet. Ask your teacher!"
                />
              )}
            </QueryBoundary>

            <QueryBoundary query={upcomingQuery} loading={<Skeleton className="h-64 rounded-xl" />}>
              {(periods) => <UpcomingPeriods periods={periods} scope="student" />}
            </QueryBoundary>
          </div>
        </TabsContent>

        <TabsContent value="day">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOnDate((d) => shiftApiDate(d, -1))}
              aria-label="Previous day"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="text-center">
              <p className="text-sm font-medium">{formatDayLabel(onDate)}</p>
              {!isToday && (
                <button
                  type="button"
                  onClick={() => setOnDate(todayApiDate())}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Back to today
                </button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOnDate((d) => shiftApiDate(d, 1))}
              aria-label="Next day"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <QueryBoundary
            query={dayQuery}
            loading={
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            }
          >
            {(periods) => (
              <DaySchedule
                periods={periods}
                scope="student"
                emptyTitle={isToday ? 'Nothing today' : 'Nothing scheduled'}
                emptyDescription={
                  isToday
                    ? 'No classes today. Enjoy it!'
                    : `No classes on ${formatDayLabel(onDate)}.`
                }
              />
            )}
          </QueryBoundary>
        </TabsContent>
      </Tabs>
    </>
  )
}

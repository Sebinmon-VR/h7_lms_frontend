import { ChevronLeft, ChevronRight } from 'lucide-react'
import * as React from 'react'

import {
  useTeacherDaySchedule,
  useTeacherTimetable,
  useTeacherUpcoming,
} from '@/queries/teacher.queries'
import { formatDayLabel, shiftApiDate, todayApiDate } from '@/lib/datetime'
import { dayOfWeekFor } from '@/lib/timetable'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DaySchedule, TimetableWeek, UpcomingPeriods } from '@/components/domain/timetable'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'
import { AdminTeacherNotice, useIsAdminViewingTeacher } from './teacher-guard'

export default function TeacherTimetablePage() {
  const isAdmin = useIsAdminViewingTeacher()
  const [onDate, setOnDate] = React.useState(() => todayApiDate())

  const weekQuery = useTeacherTimetable(!isAdmin)
  const dayQuery = useTeacherDaySchedule(onDate, !isAdmin)
  const upcomingQuery = useTeacherUpcoming(!isAdmin)

  if (isAdmin) {
    return (
      <>
        <PageHeader title="Timetable" description="The periods you are scheduled to take." />
        <AdminTeacherNotice area="timetable" />
      </>
    )
  }

  const isToday = onDate === todayApiDate()

  return (
    <>
      <PageHeader
        title="Timetable"
        description="Your weekly periods, and what is coming up next."
      />

      <Tabs defaultValue="week">
        <TabsList>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="day">Day</TabsTrigger>
        </TabsList>

        <TabsContent value="week">
          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
            <QueryBoundary
              query={weekQuery}
              loading={<Skeleton className="h-96 rounded-xl" />}
            >
              {(entries) => (
                <TimetableWeek
                  entries={entries}
                  scope="teacher"
                  today={dayOfWeekFor(new Date())}
                  emptyDescription="You have no periods on the timetable. An administrator schedules these."
                />
              )}
            </QueryBoundary>

            <QueryBoundary
              query={upcomingQuery}
              loading={<Skeleton className="h-64 rounded-xl" />}
            >
              {(periods) => <UpcomingPeriods periods={periods} scope="teacher" />}
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
                scope="teacher"
                emptyTitle={isToday ? 'Nothing today' : 'Nothing scheduled'}
                emptyDescription={
                  isToday
                    ? 'You have no periods on the timetable today.'
                    : `No periods on ${formatDayLabel(onDate)}.`
                }
              />
            )}
          </QueryBoundary>
        </TabsContent>
      </Tabs>
    </>
  )
}

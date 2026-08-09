import {
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  Layers,
  Library,
  Upload,
  Users,
  Video,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/providers/auth-provider'
import {
  useClassRosters,
  useMyClasses,
  useTeacherAttendance,
  useTeacherMaterials,
  useTeacherMeetings,
  useTeacherTopics,
} from '@/queries/teacher.queries'
import { attendanceTrend, missingAttendanceToday, splitMeetings } from '@/lib/derive'
import { formatDayLabel, todayApiDate } from '@/lib/datetime'
import { greeting } from '@/lib/format'
import { subjectName, className as classNameOf } from '@/lib/select'
import { useNow } from '@/lib/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AreaTrend } from '@/components/charts/charts'
import { ChartCard } from '@/components/charts/chart-card'
import { StatCard } from '@/components/domain/stat-card'
import { EmptyState } from '@/components/feedback/states'
import { HeroHeader } from '@/components/layout/page-header'
import { MeetingCard } from './meetings'
import { AdminTeacherNotice, useIsAdminViewingTeacher } from './teacher-guard'

export default function TeacherDashboardPage() {
  const { user } = useAuth()
  const isAdmin = useIsAdminViewingTeacher()
  const now = useNow(60_000)

  const mappingsQuery = useMyClasses(!isAdmin)
  const attendanceQuery = useTeacherAttendance(!isAdmin)
  const topicsQuery = useTeacherTopics(!isAdmin)
  const meetingsQuery = useTeacherMeetings(!isAdmin)
  const materialsQuery = useTeacherMaterials(!isAdmin)

  const mappings = React.useMemo(() => mappingsQuery.data ?? [], [mappingsQuery.data])
  const classIds = React.useMemo(() => [...new Set(mappings.map((m) => m.class_room.id))], [mappings])
  const rosters = useClassRosters(isAdmin ? [] : classIds)

  const today = todayApiDate()

  /** Class+subject pairs still waiting for attendance today. */
  const pending = React.useMemo(
    () => missingAttendanceToday(mappings, attendanceQuery.data ?? [], today),
    [mappings, attendanceQuery.data, today],
  )

  const meetings = React.useMemo(
    () => splitMeetings(meetingsQuery.data ?? [], now),
    [meetingsQuery.data, now],
  )

  const trend = React.useMemo(() => attendanceTrend(attendanceQuery.data ?? [], 14), [attendanceQuery.data])

  const recentTopics = React.useMemo(
    () =>
      [...(topicsQuery.data ?? [])]
        .sort((a, b) => b.date_covered.localeCompare(a.date_covered))
        .slice(0, 5),
    [topicsQuery.data],
  )

  const studentCount = React.useMemo(
    () => new Set(Object.values(rosters.byClass).flat().map((s) => s.id)).size,
    [rosters.byClass],
  )

  if (isAdmin) {
    return (
      <>
        <HeroHeader eyebrow="Teaching" title="Teacher dashboard" />
        <AdminTeacherNotice />
      </>
    )
  }

  return (
    <>
      <HeroHeader
        eyebrow="Teaching"
        title={`${greeting()}, ${user?.full_name?.split(' ').slice(-1)[0] ?? 'there'}`}
        description="What needs doing today, and how your classes are tracking."
        actions={
          <Button asChild variant="primary">
            <Link to="/teacher/attendance">
              <CalendarCheck className="size-4" />
              Take attendance
            </Link>
          </Button>
        }
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/teacher/topics">
              <ClipboardList className="size-4" />
              Log a topic
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/teacher/materials">
              <Upload className="size-4" />
              Upload material
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/teacher/meetings">
              <Video className="size-4" />
              Schedule a meeting
            </Link>
          </Button>
        </div>
      </HeroHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard index={0} label="Assignments" value={mappings.length} icon={Layers} tone="primary" />
        <StatCard index={1} label="Students" value={studentCount} icon={Users} tone="info" />
        <StatCard index={2} label="Topics logged" value={topicsQuery.data?.length ?? 0} icon={ClipboardList} tone="accent" />
        <StatCard index={3} label="Materials shared" value={materialsQuery.data?.length ?? 0} icon={Library} tone="success" />
      </div>

      {/* -------------------------------------------------- today's nudges */}
      {mappings.length > 0 && (
        <Card className={pending.length > 0 ? 'mt-5 border-warning/30' : 'mt-5 border-success/30'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {pending.length > 0 ? 'Attendance still to take today' : 'Attendance is up to date'}
            </CardTitle>
            <CardDescription>{formatDayLabel(today)}</CardDescription>
          </CardHeader>
          <CardContent>
            {attendanceQuery.isPending ? (
              <Skeleton className="h-10 rounded-lg" />
            ) : pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every class and subject you teach has attendance recorded for today.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pending.map((mapping) => (
                  <Button key={mapping.id} asChild variant="outline" size="sm">
                    <Link to="/teacher/attendance">
                      {mapping.class_room.name} · {mapping.subject.name}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Attendance rate"
          description="Share of students marked present, over the last 14 recorded days."
        >
          {attendanceQuery.isPending ? (
            <Skeleton className="h-56 rounded-lg" />
          ) : trend.length === 0 ? (
            <p className="py-14 text-center text-sm text-muted-foreground">
              No attendance recorded yet.
            </p>
          ) : (
            <AreaTrend data={trend} xKey="label" yKey="rate" yLabel="Attendance" height={220} percent />
          )}
        </ChartCard>

        <Card>
          <CardHeader>
            <CardTitle>Recent topics</CardTitle>
            <CardDescription>The last few things you logged.</CardDescription>
          </CardHeader>
          <CardContent>
            {topicsQuery.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : recentTopics.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing logged yet.</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {recentTopics.map((topic) => (
                  <li key={topic.id} className="py-2.5">
                    <p className="truncate text-sm font-medium">{topic.topic_title}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge tone="accent" size="sm">
                        {subjectName(topic)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDayLabel(topic.date_covered)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* -------------------------------------------------------- meetings */}
      <Card className="mt-5">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Live &amp; upcoming</CardTitle>
            <CardDescription>Your next scheduled sessions.</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/teacher/meetings">
              All meetings
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {meetingsQuery.isPending ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : [...meetings.live, ...meetings.upcoming].length === 0 ? (
            <EmptyState
              icon={<Video />}
              title="Nothing scheduled"
              description="Schedule a live class and it will show up here."
              action={
                <Button asChild variant="primary" size="sm">
                  <Link to="/teacher/meetings">Schedule a meeting</Link>
                </Button>
              }
            />
          ) : (
            [...meetings.live, ...meetings.upcoming]
              .slice(0, 3)
              .map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} now={now} />)
          )}
        </CardContent>
      </Card>

      {/* -------------------------------------------------- class shortcuts */}
      {mappings.length > 0 && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mappings.slice(0, 6).map((mapping) => (
            <Card key={mapping.id} interactive className="p-4">
              <Link to="/teacher/classes" className="block">
                <p className="text-sm font-semibold">{mapping.subject.name}</p>
                <p className="text-xs text-muted-foreground">{classNameOf({ class_room: mapping.class_room, class_id: mapping.class_room.id })}</p>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

import {
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  Hourglass,
  Layers,
  Library,
  Upload,
  UserRoundCog,
  Users,
  Video,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { ClassRoomAccessOut, PendingTopicOut, ScheduledPeriod } from '@/api/types'
import { useAuth } from '@/providers/auth-provider'
import { useMyClassRooms } from '@/queries/classes.queries'
import {
  useClassRosters,
  useMyClasses,
  useMyLedClasses,
  usePendingTopics,
  useTeacherAttendance,
  useTeacherMaterials,
  useTeacherMeetings,
  useTeacherTopics,
} from '@/queries/teacher.queries'
import { attendanceTrend, missingAttendanceToday, splitMeetings } from '@/lib/derive'
import { cn } from '@/lib/cn'
import { formatDayLabel, formatTime, todayApiDate } from '@/lib/datetime'
import { greeting } from '@/lib/format'
import { subjectName, className as classNameOf } from '@/lib/select'
import { useNow } from '@/lib/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AreaTrend } from '@/components/charts/charts'
import { ChartCard } from '@/components/charts/chart-card'
import {
  ARRIVAL_TONE,
  JoinRoomButton,
  LeaveRoomButton,
  PresenceNote,
  RoomPresenceList,
  arrivalText,
  formatMinutes,
  minutesBetween,
} from '@/components/domain/class-room'
import { StatCard } from '@/components/domain/stat-card'
import { EmptyState } from '@/components/feedback/states'
import { HeroHeader } from '@/components/layout/page-header'
import { MeetingCard } from './meetings'
import { AdminTeacherNotice, useIsAdminViewingTeacher } from './teacher-guard'
import { TopicFormDialog } from './topics'

/** A period today in a room this teacher belongs to; `mine` when it is theirs to teach. */
type TeachingSpot = { room: ClassRoomAccessOut; period: ScheduledPeriod; mine: boolean }

/**
 * The teacher's counterpart to the student's "join your classroom" banner,
 * and the first thing on the page: the live class. Their own period when it
 * is on; otherwise a colleague's period in a class they teach, which is still
 * their class in session; otherwise their next period. Students are already
 * sitting in the room, so the teacher is the one who arrives and leaves per
 * period, and Leave is here too.
 */
function TeachingNowCard({
  current,
  next,
  roomCount,
  now,
}: {
  current: TeachingSpot | null
  next: TeachingSpot | null
  roomCount: number
  now: Date
}) {
  const spot = current ?? next
  if (!spot) return null
  const { room, period } = spot
  const live = current != null
  const size = live ? 'lg' : 'md'
  const teacher = period.entry.teacher?.full_name ?? 'Teacher to be confirmed'
  const arrival = live && spot.mine ? arrivalText(period) : null

  return (
    <Card className={cn('mb-5', live ? 'border-success/40 shadow-glow' : 'border-primary/30')}>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {live && spot.mine ? (
              <Badge tone="success" dot>
                Your period is on now
              </Badge>
            ) : live ? (
              <Badge tone="info" dot>
                Class in session
              </Badge>
            ) : (
              <Badge tone="primary">
                <Hourglass />
                Your next period
              </Badge>
            )}
            {room.in_room && (
              <Badge tone="neutral" size="sm">
                You are in the room
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-lg font-semibold">
            {room.class_name} · {subjectName(period.entry)}
            {live && !spot.mine ? <span className="font-normal text-muted-foreground"> · {teacher}</span> : null}
          </p>
          <p className="text-sm text-muted-foreground">
            {live && spot.mine
              ? `Started ${formatTime(period.starts_at)} · ${formatMinutes(minutesBetween(period.starts_at, now))} in · ends ${formatTime(period.ends_at)}`
              : live
                ? `Until ${formatTime(period.ends_at)}`
                : `${formatTime(period.starts_at)} – ${formatTime(period.ends_at)} · the room opens for you at ${formatTime(room.window_opens_at ?? period.starts_at)}`}
            {' · '}
            {live && !spot.mine
              ? next
                ? `your next period is ${next.room.class_name} · ${subjectName(next.period.entry)} at ${formatTime(next.period.starts_at)}`
                : 'no period of yours is left today'
              : 'the class sits in its shared room all day; you join it for your period'}
            {roomCount > 1 ? ` · you teach in ${roomCount} rooms today` : ''}
          </p>
          {arrival && (
            <p className={cn('mt-1 text-xs font-medium', ARRIVAL_TONE[arrival.tone])}>
              {arrival.tone === 'warning' && !room.in_room ? 'Students are waiting: ' : ''}
              {arrival.text}
            </p>
          )}
          <PresenceNote access={room} className="mt-1.5" />
          {/* The live list of who is actually in, while their period runs. */}
          {live && spot.mine && <RoomPresenceList classId={room.class_id} compact className="mt-3" />}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Join and Leave belong to the teacher's OWN period; a colleague's
              class in session is information, not a door. */}
          {spot.mine && (
            <>
              <JoinRoomButton access={room} size={size} />
              <LeaveRoomButton access={room} size={size} />
            </>
          )}
          <Button asChild variant="ghost" size="sm">
            <Link to="/teacher/meetings">
              All rooms
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

const DISMISSED_KEY = 'h7:topic-prompts-dismissed'

function pendingKey(p: PendingTopicOut): string {
  return `${p.on_date}:${p.class_id}:${p.subject_id}`
}

/** "Not now" choices, kept per browser for today only; a new day starts clean. */
function useDismissedPrompts(today: string) {
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem(DISMISSED_KEY)
      const parsed = raw ? (JSON.parse(raw) as string[]) : []
      return new Set(parsed.filter((k) => k.startsWith(today)))
    } catch {
      return new Set()
    }
  })
  const dismiss = (key: string) => {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(key)
      try {
        window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]))
      } catch {
        // Browser storage can be unavailable; the prompt simply returns next visit.
      }
      return next
    })
  }
  return { dismissed, dismiss }
}

/**
 * The bell has gone: which topic did you cover? One row per period of the
 * teacher's that ended today with nothing logged, most recent first. "Log
 * the topic" opens the syllabus form with class, subject and date filled in.
 */
function PendingTopicsCard({ onLog }: { onLog: (pending: PendingTopicOut) => void }) {
  const pending = usePendingTopics()
  const { dismissed, dismiss } = useDismissedPrompts(todayApiDate())
  const items = (pending.data ?? []).filter((p) => !dismissed.has(pendingKey(p)))
  if (items.length === 0) return null

  return (
    <Card className="mb-5 border-warning/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Class over — what did you cover?</CardTitle>
        <CardDescription>
          Log it while it is fresh. Students see it as syllabus progress, and you can attach
          notes, photos of the board or a voice recap.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((p) => (
          <div
            key={pendingKey(p)}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="font-medium">
                {p.class_name} · {p.subject_name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatTime(p.starts_at)} – {formatTime(p.ends_at)} · ended{' '}
                {p.minutes_since_end < 1 ? 'just now' : `${formatMinutes(p.minutes_since_end)} ago`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="primary" onClick={() => onLog(p)}>
                <ClipboardList />
                Log the topic
              </Button>
              <Button size="sm" variant="ghost" onClick={() => dismiss(pendingKey(p))}>
                Not now
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default function TeacherDashboardPage() {
  const { user } = useAuth()
  const isAdmin = useIsAdminViewingTeacher()
  const now = useNow(60_000)
  const [logging, setLogging] = React.useState<PendingTopicOut | null>(null)

  // The rooms this teacher teaches in, with today's periods. Polled, so the
  // banner below moves from "next" to "on now" without a reload.
  const roomsQuery = useMyClassRooms(!isAdmin)
  const teaching = React.useMemo(() => {
    const rooms = roomsQuery.data ?? []
    const nowMs = now.getTime()
    const isOn = (period: ScheduledPeriod) =>
      period.is_current ||
      (new Date(period.starts_at).getTime() <= nowMs && nowMs < new Date(period.ends_at).getTime())
    const all: TeachingSpot[] = rooms.flatMap((room) =>
      room.periods_today.map((period) => ({
        room,
        period,
        mine: user != null && period.entry.teacher_id === user.id,
      })),
    )
    const mine = all.filter((spot) => spot.mine)
    // The live class: their own period if it is on, else any period on now in
    // a class they teach — it is their class in session either way.
    const current = mine.find(({ period }) => isOn(period)) ?? all.find(({ period }) => isOn(period)) ?? null
    const next =
      mine
        .filter(({ period }) => new Date(period.starts_at).getTime() > nowMs)
        .sort((a, b) => a.period.starts_at.localeCompare(b.period.starts_at))[0] ?? null
    const roomCount = new Set(mine.map(({ room }) => room.class_id)).size
    return { current, next, roomCount }
  }, [roomsQuery.data, user, now])

  const mappingsQuery = useMyClasses(!isAdmin)
  const attendanceQuery = useTeacherAttendance(!isAdmin)
  const topicsQuery = useTeacherTopics(!isAdmin)
  const meetingsQuery = useTeacherMeetings(!isAdmin)
  const materialsQuery = useTeacherMaterials(!isAdmin)

  const ledQuery = useMyLedClasses(!isAdmin)

  const mappings = React.useMemo(() => mappingsQuery.data ?? [], [mappingsQuery.data])
  const classIds = React.useMemo(() => [...new Set(mappings.map((m) => m.class_room.id))], [mappings])
  const rosters = useClassRosters(isAdmin ? [] : classIds)

  /**
   * Own records only for the tiles below. These lists also carry what other
   * teachers filed against a class this teacher leads, and a tile reading
   * "topics you have logged" must not count a colleague's work as theirs.
   */
  const myTopicCount = React.useMemo(
    () => (topicsQuery.data ?? []).filter((t) => t.teacher_id === user?.id).length,
    [topicsQuery.data, user?.id],
  )
  const myMaterialCount = React.useMemo(
    () => (materialsQuery.data ?? []).filter((m) => m.teacher_id === user?.id).length,
    [materialsQuery.data, user?.id],
  )

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
        title={`${greeting()}, ${user?.full_name?.trim().split(/\s+/)[0] ?? 'there'}`}
        description="Here is what needs doing today."
        actions={
          <Button asChild variant="primary">
            <Link to="/teacher/attendance">
              <CalendarCheck className="size-4" />
              Take the register
            </Link>
          </Button>
        }
      >
        {/* Stated up front rather than left to be discovered: it changes what
            the record pages below are showing them. */}
        {(ledQuery.data ?? []).length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="warning">
              <UserRoundCog />
              Class teacher
            </Badge>
            <span className="text-muted-foreground">
              You lead{' '}
              {(ledQuery.data ?? []).map((m, i) => (
                <React.Fragment key={m.id}>
                  {i > 0 && ', '}
                  <strong className="text-foreground">{m.class_room.name}</strong>
                </React.Fragment>
              ))}
              , so you also see what other teachers record there.
            </span>
            <Link to="/teacher/classes" className="font-medium text-primary hover:underline">
              View
            </Link>
          </div>
        )}

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
              Set up a live class
            </Link>
          </Button>
        </div>
      </HeroHeader>

      {/* The live class, right under the greeting: when a teacher opens the
          dashboard mid-morning, the room they need to be in is the point of
          the visit. */}
      {roomsQuery.isPending ? (
        <Skeleton className="mb-5 h-24 rounded-2xl" />
      ) : (
        <TeachingNowCard
          current={teaching.current}
          next={teaching.next}
          roomCount={teaching.roomCount}
          now={now}
        />
      )}

      {/* ------------------------------------------- the period just finished */}
      <PendingTopicsCard onLog={setLogging} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard index={0} label="Classes you teach" value={mappings.length} icon={Layers} tone="primary" />
        <StatCard index={1} label="Students in your care" value={studentCount} icon={Users} tone="info" />
        <StatCard index={2} label="Topics you have logged" value={myTopicCount} icon={ClipboardList} tone="accent" />
        <StatCard index={3} label="Notes you have shared" value={myMaterialCount} icon={Library} tone="success" />
      </div>

      {/* -------------------------------------------------- today's nudges */}
      {mappings.length > 0 && (
        <Card className={pending.length > 0 ? 'mt-5 border-warning/30' : 'mt-5 border-success/30'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {pending.length > 0 ? 'Registers still to take today' : 'All registers done — nice one'}
            </CardTitle>
            <CardDescription>{formatDayLabel(today)}</CardDescription>
          </CardHeader>
          <CardContent>
            {attendanceQuery.isPending ? (
              <Skeleton className="h-10 rounded-lg" />
            ) : pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every class you teach has its register taken for today.
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
          title="How many turned up"
          description="Students marked present, over the last 14 days you recorded."
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
              title="No live classes yet"
              description="Set one up and it will appear here."
              action={
                <Button asChild variant="primary" size="sm">
                  <Link to="/teacher/meetings">Set up a live class</Link>
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

      {/* The syllabus form, opened from the "class over" prompt with the
          class, subject and date already filled in. */}
      <TopicFormDialog
        open={!!logging}
        onOpenChange={(v) => !v && setLogging(null)}
        editing={null}
        preset={
          logging
            ? { class_id: logging.class_id, subject_id: logging.subject_id, date_covered: logging.on_date }
            : null
        }
      />
    </>
  )
}

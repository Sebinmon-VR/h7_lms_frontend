import {
  ArrowRight,
  BookOpenCheck,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Check,
  ClipboardList,
  Layers,
  Library,
  ShieldAlert,
  TriangleAlert,
  Upload,
  UserRoundCog,
  UserX,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { TeacherExamsToday } from '@/components/domain/teacher-exams-today'

import type {
  AttendanceOut,
  ClassRoomAccessOut,
  LiveMeetingOut,
  PendingTopicOut,
  ScheduledPeriod,
} from '@/api/types'
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
import { missingAttendanceToday, splitMeetings } from '@/lib/derive'
import { AT_RISK_ATTENDANCE } from '@/lib/constants'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime, formatDayLabel, parseApiDate, shiftApiDate, todayApiDate } from '@/lib/datetime'
import { formatSchoolTime } from '@/lib/school-time'
import { formatNumber, greeting } from '@/lib/format'
import { subjectName } from '@/lib/select'
import { useNow } from '@/lib/hooks'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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
import { AdminTeacherNotice, useIsAdminViewingTeacher } from './teacher-guard'
import { TopicFormDialog } from './topics'

/*
 * Laid out like the admin dashboard: sections are a heading over open
 * content, figures sit in one divided row, and lists are ruled rows. These
 * pieces live here, not in shared components, so other pages keep their look.
 */

/** A period today in a room this teacher belongs to; `mine` when it is theirs to teach. */
type TeachingSpot = { room: ClassRoomAccessOut; period: ScheduledPeriod; mine: boolean }

const pairKey = (classId: number, subjectId: number) => `${classId}|${subjectId}`

/** Days without a logged topic before a class and subject is flagged. */
const SYLLABUS_STALE_DAYS = 7
/** The window the "students to watch" list reads attendance over. */
const WATCH_DAYS = 30
/** Fewer records than this say nothing about a student yet. */
const WATCH_MIN_RECORDS = 3

const QUICK_ACTIONS = [
  { to: '/teacher/topics', label: 'Log a topic', icon: ClipboardList },
  { to: '/teacher/materials', label: 'Upload material', icon: Upload },
  { to: '/teacher/meetings', label: 'Set up a live class', icon: Video },
  { to: '/teacher/timetable', label: 'Timetable', icon: CalendarClock },
]

function Section({
  title,
  description,
  icon: Icon,
  iconClassName,
  meta,
  actions,
  className,
  children,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  iconClassName?: string
  meta?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('min-w-0', className)}>
      <header className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {Icon && <Icon className={cn('size-4 shrink-0 text-muted-foreground', iconClassName)} />}
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
            {meta}
          </div>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

/** "View all" style link that sits on the right of a section heading. */
function SectionLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80"
    >
      {children}
      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

/** The same look as SectionLink, for an action that opens something in place. */
function ActionLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80"
    >
      {children}
      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="border-y border-border py-5 text-center text-sm text-muted-foreground">{children}</p>
}

const KPI_TONE = {
  primary: 'text-primary',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
} as const

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: LucideIcon
  tone: keyof typeof KPI_TONE
}) {
  return (
    <div className="min-w-0 px-5 py-3">
      <p className="flex items-center gap-1.5 truncate text-xs font-medium text-muted-foreground">
        <Icon className={cn('size-3.5 shrink-0', KPI_TONE[tone])} />
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold leading-none tabular-nums tracking-tight text-foreground">
        {formatNumber(value)}
      </p>
    </div>
  )
}

/** A small ring showing how much of today's teaching is done, with the figure inside. */
function ProgressRing({ value, label }: { value: number; label: string }) {
  const r = 19
  const c = 2 * Math.PI * r
  return (
    <div className="relative size-12 shrink-0" title={`${value}% of today's periods done`}>
      <svg viewBox="0 0 48 48" className="size-12 -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" className="stroke-primary/15" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          className="stroke-primary transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-2xs font-bold tabular-nums text-primary">
        {label}
      </span>
    </div>
  )
}

/** Today at a glance, at the top right: periods done of the day's periods, and what is next. */
function TodayPanel({
  spots,
  next,
  loading,
  now,
}: {
  spots: TeachingSpot[]
  next: TeachingSpot | null
  loading: boolean
  now: Date
}) {
  if (loading) return <Skeleton className="h-14 w-full rounded-md lg:w-72" />
  const done = spots.filter(({ period }) => new Date(period.ends_at).getTime() <= now.getTime()).length
  const total = spots.length
  const share = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="flex items-center gap-4 lg:w-72 lg:border-l lg:border-border lg:pl-6">
      <ProgressRing value={share} label={`${done}/${total}`} />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-primary">
          <CalendarClock className="size-3.5" />
          Today
        </p>
        <p className="mt-0.5 text-lg font-bold leading-tight tracking-tight text-foreground">
          {total === 0 ? 'No periods' : `${done} of ${total} periods done`}
        </p>
        <p className="mt-0.5 truncate text-2xs text-muted-foreground">
          {next
            ? `Next: ${next.room.class_name} · ${subjectName(next.period.entry)} at ${formatSchoolTime(next.period.starts_at)}`
            : total > 0
              ? 'Nothing more today'
              : 'Nothing on your timetable today'}
        </p>
      </div>
    </div>
  )
}

/**
 * The live class, as one strip: their own period when it is on; otherwise a
 * colleague's period in a class they teach (information, not a door);
 * otherwise their next period.
 */
function LiveNowStrip({
  current,
  next,
  now,
}: {
  current: TeachingSpot | null
  next: TeachingSpot | null
  now: Date
}) {
  const spot = current ?? next
  const live = current != null
  const mineLive = live && !!spot?.mine
  const arrival = mineLive && spot ? arrivalText(spot.period) : null

  return (
    <div className="border-y border-border py-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="relative flex size-2">
            {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />}
            <span className={cn('relative inline-flex size-2 rounded-full', live ? 'bg-success' : 'bg-muted-foreground/50')} />
          </span>
          Live now
        </span>

        {!spot ? (
          <span className="text-xs text-muted-foreground">No class of yours is left today.</span>
        ) : (
          <>
            <span
              className={cn(
                'text-xs font-semibold',
                mineLive ? 'text-success' : live ? 'text-info' : 'text-muted-foreground',
              )}
            >
              {mineLive ? 'Your period' : live ? 'Class in session' : 'Up next'}
            </span>
            <span className="text-sm">
              <span className="font-semibold">
                {spot.room.class_name} · {subjectName(spot.period.entry)}
              </span>
              {live && !spot.mine && (
                <span className="text-muted-foreground"> · {spot.period.entry.teacher?.full_name ?? 'Teacher to be confirmed'}</span>
              )}
            </span>
            <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatSchoolTime(spot.period.starts_at)} – {formatSchoolTime(spot.period.ends_at)}
              {mineLive
                ? ` · ${formatMinutes(minutesBetween(spot.period.starts_at, now))} in`
                : live
                  ? next
                    ? ` · your next: ${next.room.class_name} at ${formatSchoolTime(next.period.starts_at)}`
                    : ' · no period of yours is left today'
                  : ` · room opens at ${formatSchoolTime(spot.room.window_opens_at ?? spot.period.starts_at)}`}
            </span>
            {arrival && (
              <span className={cn('text-xs font-medium', ARRIVAL_TONE[arrival.tone])}>
                {arrival.tone === 'warning' && !spot.room.in_room ? 'Students are waiting: ' : ''}
                {arrival.text}
              </span>
            )}
            {spot.mine && (
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <JoinRoomButton access={spot.room} size="sm" />
                <LeaveRoomButton access={spot.room} size="sm" />
              </span>
            )}
          </>
        )}
      </div>
      {spot && <PresenceNote access={spot.room} className="mt-1" />}
      {/* Who is actually in, while their own period runs. */}
      {mineLive && spot && <RoomPresenceList classId={spot.room.class_id} compact className="mt-2" />}
    </div>
  )
}

type PeriodState = 'done' | 'now' | 'next' | 'later'

const STATE_DOT: Record<PeriodState, string> = {
  done: 'bg-muted-foreground/40',
  now: 'bg-success',
  next: 'bg-primary',
  later: 'bg-border',
}
const STATE_LABEL: Record<PeriodState, string> = { done: 'Done', now: 'Now', next: 'Next', later: '' }

function Tick({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
      <Check className="size-3.5" />
      {children}
    </span>
  )
}

/**
 * The teacher's own periods today, in time order, with what is still owed on
 * each: the register for that class and subject, and the topic once it ends.
 */
function TodayPeriods({
  spots,
  loading,
  now,
  registerTaken,
  topicLogged,
  topicPending,
  onLog,
  className,
}: {
  spots: TeachingSpot[]
  loading: boolean
  now: Date
  registerTaken: Set<string>
  topicLogged: Set<string>
  topicPending: Map<string, PendingTopicOut>
  onLog: (pending: PendingTopicOut) => void
  className?: string
}) {
  const nowMs = now.getTime()
  const nextIndex = spots.findIndex(({ period }) => new Date(period.starts_at).getTime() > nowMs)

  return (
    <Section
      className={className}
      title="Today's periods"
      icon={CalendarDays}
      iconClassName="text-primary"
      description="Your timetable for today, with the register and topic for each"
      actions={<SectionLink to="/teacher/timetable">Timetable</SectionLink>}
    >
      {loading ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : spots.length === 0 ? (
        <Empty>No periods for you today.</Empty>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {spots.map(({ room, period }, i) => {
            const starts = new Date(period.starts_at).getTime()
            const ends = new Date(period.ends_at).getTime()
            const state: PeriodState =
              period.is_current || (starts <= nowMs && nowMs < ends)
                ? 'now'
                : ends <= nowMs
                  ? 'done'
                  : i === nextIndex
                    ? 'next'
                    : 'later'
            const key = pairKey(room.class_id, period.entry.subject_id)
            const pending = topicPending.get(key)
            const begun = state === 'now' || state === 'done'
            return (
              <li
                key={`${room.class_id}-${period.entry.id}-${period.starts_at}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm"
              >
                <span className="inline-flex w-32 shrink-0 items-center gap-2 tabular-nums text-muted-foreground">
                  <span className={cn('size-2 rounded-full', STATE_DOT[state])} aria-hidden />
                  {formatSchoolTime(period.starts_at)} – {formatSchoolTime(period.ends_at)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className={cn('font-semibold', state === 'done' ? 'text-foreground/70' : 'text-foreground')}>
                    {room.class_name}
                  </span>
                  <span className="text-muted-foreground"> · {subjectName(period.entry)}</span>
                  {period.entry.substitution && <span className="ml-1.5 text-xs text-muted-foreground">(cover)</span>}
                </span>
                <span
                  className={cn(
                    'w-10 text-xs font-semibold',
                    state === 'now' ? 'text-success' : state === 'next' ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {STATE_LABEL[state]}
                </span>
                <span className="flex w-48 shrink-0 items-center justify-end gap-3">
                  {begun &&
                    (registerTaken.has(key) ? (
                      <Tick>Register</Tick>
                    ) : (
                      <SectionLink to="/teacher/attendance">Register</SectionLink>
                    ))}
                  {state === 'done' &&
                    (topicLogged.has(key) ? (
                      <Tick>Topic</Tick>
                    ) : pending ? (
                      <ActionLink onClick={() => onLog(pending)}>Log topic</ActionLink>
                    ) : null)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

/** Who is marked absent or late today in this teacher's classes, by class. */
function AbsentToday({ records, loading }: { records: AttendanceOut[]; loading: boolean }) {
  const groups = React.useMemo(() => {
    // One mark per student per class: a student absent in two of the
    // teacher's subjects is one absent child, not two.
    const byClass = new Map<string, Map<number, { name: string; late: boolean }>>()
    for (const a of records) {
      if (a.status !== 'ABSENT' && a.status !== 'LATE') continue
      const cls = a.class_room?.name ?? `Class ${a.class_id}`
      const people = byClass.get(cls) ?? new Map()
      const before = people.get(a.student_id)
      const late = a.status === 'LATE'
      people.set(a.student_id, {
        name: a.student?.full_name ?? `Student ${a.student_id}`,
        // Absent anywhere outranks late.
        late: before ? before.late && late : late,
      })
      byClass.set(cls, people)
    }
    return [...byClass.entries()]
      .map(([cls, people]) => ({
        cls,
        people: [...people.values()].sort((a, b) => Number(a.late) - Number(b.late) || a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.cls.localeCompare(b.cls))
  }, [records])
  const absent = groups.reduce((n, g) => n + g.people.filter((p) => !p.late).length, 0)

  return (
    <Section
      title="Absent today"
      icon={UserX}
      iconClassName="text-danger"
      description="From today's registers"
      meta={absent > 0 ? <span className="text-sm font-semibold tabular-nums text-danger">{absent}</span> : undefined}
    >
      {loading ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : groups.length === 0 ? (
        <Empty>{records.length === 0 ? 'No register taken yet today.' : 'Everyone is in.'}</Empty>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {groups.map((g) => (
            <li key={g.cls} className="py-2 text-sm">
              <p className="text-xs font-semibold text-foreground">{g.cls}</p>
              <p className="mt-0.5 text-muted-foreground">
                {g.people.map((p, i) => (
                  <React.Fragment key={p.name + i}>
                    {i > 0 && ', '}
                    <span className={p.late ? 'text-warning' : 'text-foreground'}>
                      {p.name}
                      {p.late && ' (late)'}
                    </span>
                  </React.Fragment>
                ))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/** Students whose attendance in these registers has slipped. */
function StudentsToWatch({ records, loading }: { records: AttendanceOut[]; loading: boolean }) {
  const list = React.useMemo(() => {
    const by = new Map<number, AttendanceOut[]>()
    for (const a of records) by.set(a.student_id, [...(by.get(a.student_id) ?? []), a])
    return [...by.values()]
      .filter((rows) => rows.length >= WATCH_MIN_RECORDS)
      .map((rows) => {
        const latest = [...rows].sort((a, b) => b.date.localeCompare(a.date))[0]
        const absent = rows.filter((r) => r.status === 'ABSENT').length
        // Late and excused still count as there: this list is about missing school.
        return {
          id: latest.student_id,
          name: latest.student?.full_name ?? `Student ${latest.student_id}`,
          cls: latest.class_room?.name ?? '',
          rate: ((rows.length - absent) / rows.length) * 100,
          absent,
          total: rows.length,
        }
      })
      .filter((s) => s.rate < AT_RISK_ATTENDANCE)
      .sort((a, b) => a.rate - b.rate || a.name.localeCompare(b.name))
  }, [records])

  return (
    <Section
      title="Students to watch"
      icon={TriangleAlert}
      iconClassName="text-warning"
      description={`Under ${AT_RISK_ATTENDANCE}% attendance, last ${WATCH_DAYS} days`}
      meta={list.length > 0 ? <span className="text-sm font-semibold tabular-nums text-warning">{list.length}</span> : undefined}
      actions={<SectionLink to="/teacher/insights">Insights</SectionLink>}
    >
      {loading ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : list.length === 0 ? (
        <Empty>Nobody is falling behind on attendance.</Empty>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {list.slice(0, 6).map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.cls && `${s.cls} · `}
                  {s.absent} absent of {s.total}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 text-sm font-semibold tabular-nums',
                  s.rate < 60 ? 'text-danger' : 'text-warning',
                )}
              >
                {Math.round(s.rate)}%
              </span>
            </li>
          ))}
          {list.length > 6 && <li className="py-2 text-xs text-muted-foreground">and {list.length - 6} more</li>}
        </ul>
      )}
    </Section>
  )
}

function MeetingRow({ meeting, live }: { meeting: LiveMeetingOut; live: boolean }) {
  const link = meeting.meeting_link
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{meeting.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {meeting.class_room?.name ?? 'Class'} · {meeting.subject?.name ?? 'Subject'} ·{' '}
          {formatDateTime(meeting.scheduled_time, 'd MMM, h:mm a')}
        </p>
      </div>
      {live &&
        (link ? (
          <Button asChild size="xs" variant="primary">
            {link.startsWith('/') ? (
              <Link to={link}>Join</Link>
            ) : (
              <a href={link} target="_blank" rel="noreferrer">
                Join
              </a>
            )}
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
            <span className="size-1.5 rounded-full bg-success" aria-hidden />
            Live
          </span>
        ))}
    </li>
  )
}

export default function TeacherDashboardPage() {
  const { user } = useAuth()
  const isAdmin = useIsAdminViewingTeacher()
  const now = useNow(60_000)
  const [logging, setLogging] = React.useState<PendingTopicOut | null>(null)
  const today = todayApiDate()
  const firstName = user?.full_name?.trim().split(/\s+/)[0]

  // The rooms this teacher teaches in, with today's periods. Polled, so the
  // strip moves from "next" to "now" without a reload.
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
    const mine = all
      .filter((spot) => spot.mine)
      .sort((a, b) => a.period.starts_at.localeCompare(b.period.starts_at))
    const current = mine.find(({ period }) => isOn(period)) ?? all.find(({ period }) => isOn(period)) ?? null
    const next = mine.find(({ period }) => new Date(period.starts_at).getTime() > nowMs) ?? null
    return { mine, current, next }
  }, [roomsQuery.data, user, now])

  const mappingsQuery = useMyClasses(!isAdmin)
  const attendanceQuery = useTeacherAttendance(!isAdmin)
  const topicsQuery = useTeacherTopics(!isAdmin)
  const meetingsQuery = useTeacherMeetings(!isAdmin)
  const materialsQuery = useTeacherMaterials(!isAdmin)
  const pendingTopicsQuery = usePendingTopics(!isAdmin)
  const ledQuery = useMyLedClasses(!isAdmin)

  const mappings = React.useMemo(() => mappingsQuery.data ?? [], [mappingsQuery.data])
  const classIds = React.useMemo(() => [...new Set(mappings.map((m) => m.class_room.id))], [mappings])
  const rosters = useClassRosters(isAdmin ? [] : classIds)

  // Own records only: these lists also carry what other teachers filed in a
  // class this teacher leads, and "topics you logged" must not count theirs.
  const myTopics = React.useMemo(
    () => (topicsQuery.data ?? []).filter((t) => t.teacher_id === user?.id),
    [topicsQuery.data, user?.id],
  )
  const myMaterialCount = React.useMemo(
    () => (materialsQuery.data ?? []).filter((m) => m.teacher_id === user?.id).length,
    [materialsQuery.data, user?.id],
  )
  const studentCount = React.useMemo(
    () => new Set(Object.values(rosters.byClass).flat().map((s) => s.id)).size,
    [rosters.byClass],
  )

  // Registers include a led class's other subjects too: a class teacher
  // should hear about any child missing from their class.
  const allAttendance = React.useMemo(() => attendanceQuery.data ?? [], [attendanceQuery.data])
  /** Class+subject pairs still waiting for attendance today. */
  const registersDue = React.useMemo(
    () => missingAttendanceToday(mappings, allAttendance, today),
    [mappings, allAttendance, today],
  )
  const attendanceToday = React.useMemo(() => allAttendance.filter((a) => a.date === today), [allAttendance, today])
  const registerTaken = React.useMemo(
    () => new Set(attendanceToday.map((a) => pairKey(a.class_id, a.subject_id))),
    [attendanceToday],
  )
  const recentAttendance = React.useMemo(() => {
    const since = shiftApiDate(today, -WATCH_DAYS)
    return allAttendance.filter((a) => a.date >= since)
  }, [allAttendance, today])
  const topicLogged = React.useMemo(
    () => new Set(myTopics.filter((t) => t.date_covered === today).map((t) => pairKey(t.class_id, t.subject_id))),
    [myTopics, today],
  )

  const topicsDue = React.useMemo(() => pendingTopicsQuery.data ?? [], [pendingTopicsQuery.data])
  const topicPending = React.useMemo(
    () =>
      new Map(
        topicsDue.filter((p) => p.on_date === today).map((p) => [pairKey(p.class_id, p.subject_id), p] as const),
      ),
    [topicsDue, today],
  )

  /**
   * Each class and subject the teacher teaches, with their last logged topic:
   * the ones gone quiet longest first, so a subject falling behind is seen.
   */
  const syllabus = React.useMemo(() => {
    const todayDate = parseApiDate(today)
    return mappings
      .map((m) => {
        const topics = myTopics.filter((t) => t.class_id === m.class_room.id && t.subject_id === m.subject.id)
        const last = topics.map((t) => t.date_covered).sort((a, b) => b.localeCompare(a))[0] ?? null
        const lastDate = parseApiDate(last)
        const daysSince =
          lastDate && todayDate ? Math.round((todayDate.getTime() - lastDate.getTime()) / 86_400_000) : null
        const behind = daysSince == null || daysSince > SYLLABUS_STALE_DAYS
        return { id: m.id, cls: m.class_room.name, subject: m.subject.name, count: topics.length, last, daysSince, behind }
      })
      .sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999) || a.cls.localeCompare(b.cls))
  }, [mappings, myTopics, today])
  const syllabusBehind = syllabus.filter((s) => s.behind)

  const meetings = React.useMemo(() => splitMeetings(meetingsQuery.data ?? [], now), [meetingsQuery.data, now])
  const recentTopics = React.useMemo(
    () => [...(topicsQuery.data ?? [])].sort((a, b) => b.date_covered.localeCompare(a.date_covered)).slice(0, 5),
    [topicsQuery.data],
  )

  if (isAdmin) {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-2xs font-semibold uppercase tracking-wider text-primary">Teaching</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Teacher dashboard</h1>
        </header>
        <AdminTeacherNotice />
      </div>
    )
  }

  const led = ledQuery.data ?? []
  const tiles = [
    { label: 'Periods today', value: teaching.mine.length, icon: CalendarClock, tone: 'primary' as const },
    { label: 'Classes you teach', value: mappings.length, icon: Layers, tone: 'info' as const },
    { label: 'Students', value: studentCount, icon: Users, tone: 'accent' as const },
    {
      label: 'Registers due',
      value: registersDue.length,
      icon: CalendarCheck,
      tone: registersDue.length > 0 ? ('danger' as const) : ('success' as const),
    },
    { label: 'Topics logged', value: myTopics.length, icon: ClipboardList, tone: 'success' as const },
    { label: 'Notes shared', value: myMaterialCount, icon: Library, tone: 'warning' as const },
  ]

  // What is still owed, as the admin page's "needs your attention" list.
  const attention: { label: string; count: number; names: string[]; cta: React.ReactNode }[] = [
    {
      label: 'Topics to log',
      count: topicsDue.length,
      names: topicsDue.map((p) => `${p.class_name} · ${p.subject_name}`),
      cta: topicsDue[0] ? <ActionLink onClick={() => setLogging(topicsDue[0])}>Log now</ActionLink> : null,
    },
    {
      label: 'Registers still to take',
      count: registersDue.length,
      names: registersDue.map((m) => `${m.class_room.name} · ${m.subject.name}`),
      cta: <SectionLink to="/teacher/attendance">Take register</SectionLink>,
    },
    {
      label: `No topic logged in ${SYLLABUS_STALE_DAYS}+ days`,
      count: syllabusBehind.length,
      names: syllabusBehind.map((s) => `${s.cls} · ${s.subject}`),
      cta: <SectionLink to="/teacher/topics">Log a topic</SectionLink>,
    },
  ].filter((a) => a.count > 0)

  return (
    <div className="space-y-8">
      <TeacherExamsToday examPath={(id) => `/teacher/exams/${id}`} />

      {/* ----------------------------------------------------------- header */}
      <header>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-wider text-primary">Teaching</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              {greeting()}
              {firstName && (
                <>
                  , <span className="text-primary">{firstName}</span>
                </>
              )}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-foreground/70">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-primary" />
                {formatDate(now, 'EEEE, d MMMM yyyy')}
              </span>
              {led.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <UserRoundCog className="size-3.5 text-warning" />
                  Class teacher of {led.map((m) => m.class_room.name).join(', ')}
                </span>
              )}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {led.length > 0
                ? 'Your classes today, and what other teachers record in the class you lead.'
                : 'Your classes today, and anything that still needs doing.'}
            </p>
          </div>
          <div className="lg:self-center">
            <TodayPanel spots={teaching.mine} next={teaching.next} loading={roomsQuery.isPending} now={now} />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-border py-2.5">
          <nav className="flex flex-wrap items-center gap-1">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.label}
                to={action.to}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-primary/10 hover:text-primary"
              >
                <action.icon className="size-4 text-primary" />
                {action.label}
              </Link>
            ))}
          </nav>
          <Button asChild variant="solid" size="sm">
            <Link to="/teacher/attendance">
              <CalendarCheck />
              Take the register
            </Link>
          </Button>
        </div>
      </header>

      {/* ------------------------------------------------------------ tiles */}
      {mappingsQuery.isPending ? (
        <Skeleton className="h-[72px] rounded-lg" />
      ) : (
        <div className="grid grid-cols-2 divide-border border-y border-border sm:grid-cols-3 xl:grid-cols-6 xl:divide-x [&>*:first-child]:pl-0">
          {tiles.map((tile) => (
            <Kpi key={tile.label} label={tile.label} value={tile.value} icon={tile.icon} tone={tile.tone} />
          ))}
        </div>
      )}

      {roomsQuery.isPending ? (
        <Skeleton className="h-11 rounded-lg" />
      ) : (
        <LiveNowStrip current={teaching.current} next={teaching.next} now={now} />
      )}

      {/* ----------------------------------------------------------- alerts */}
      {attention.length > 0 && (
        <Section
          title="Needs your attention"
          icon={ShieldAlert}
          iconClassName="text-warning"
          meta={<span className="text-sm font-semibold tabular-nums text-warning">{attention.length}</span>}
        >
          <ul className="divide-y divide-border border-y border-border">
            {attention.map((group) => (
              <li key={group.label} className="flex items-center gap-4 py-3">
                <span className="w-8 shrink-0 text-xl font-semibold tabular-nums text-warning">{group.count}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{group.label}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {group.names.slice(0, 3).join(', ')}
                    {group.names.length > 3 && ` +${group.names.length - 3} more`}
                  </p>
                </div>
                {group.cta}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ------------------------------------------- periods + students */}
      <div className="grid gap-8 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-border">
        <TodayPeriods
          className="lg:col-span-2 lg:pr-8"
          spots={teaching.mine}
          loading={roomsQuery.isPending}
          now={now}
          registerTaken={registerTaken}
          topicLogged={topicLogged}
          topicPending={topicPending}
          onLog={setLogging}
        />
        <div className="space-y-8 lg:pl-8">
          <AbsentToday records={attendanceToday} loading={attendanceQuery.isPending} />
          <StudentsToWatch records={recentAttendance} loading={attendanceQuery.isPending} />
        </div>
      </div>

      {/* ------------------------------------- syllabus + live + topics */}
      <div className="grid gap-8 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-border">
        <Section
          className="lg:col-span-2 lg:pr-8"
          title="Syllabus"
          icon={BookOpenCheck}
          iconClassName="text-success"
          description="Each class and subject you teach, with the last topic you logged"
          actions={<SectionLink to="/teacher/topics">Topics</SectionLink>}
        >
          {topicsQuery.isPending || mappingsQuery.isPending ? (
            <Skeleton className="h-32 rounded-lg" />
          ) : syllabus.length === 0 ? (
            <Empty>No classes are mapped to you yet.</Empty>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {syllabus.map((s) => (
                <li key={s.id} className="flex items-center gap-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-foreground">{s.cls}</span>
                    <span className="text-muted-foreground"> · {s.subject}</span>
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {s.count} {s.count === 1 ? 'topic' : 'topics'}
                  </span>
                  <span
                    className={cn(
                      'inline-flex w-32 shrink-0 items-center justify-end gap-1.5 text-xs tabular-nums',
                      s.behind ? 'font-semibold text-warning' : 'text-muted-foreground',
                    )}
                  >
                    {s.behind && <span className="size-1.5 rounded-full bg-warning" aria-hidden />}
                    {s.last == null
                      ? 'nothing logged'
                      : s.daysSince === 0
                        ? 'today'
                        : s.daysSince === 1
                          ? 'yesterday'
                          : `${s.daysSince} days ago`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="space-y-8 lg:pl-8">
          <Section
            title="Live classes"
            icon={Video}
            iconClassName="text-info"
            description="Scheduled sessions, live and upcoming"
            actions={<SectionLink to="/teacher/meetings">All</SectionLink>}
          >
            {meetingsQuery.isPending ? (
              <Skeleton className="h-16 rounded-lg" />
            ) : meetings.live.length + meetings.upcoming.length === 0 ? (
              <Empty>
                Nothing scheduled.{' '}
                <Link to="/teacher/meetings" className="font-medium text-primary hover:underline">
                  Set one up
                </Link>
              </Empty>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {meetings.live.map((m) => (
                  <MeetingRow key={m.id} meeting={m} live />
                ))}
                {meetings.upcoming.slice(0, Math.max(0, 4 - meetings.live.length)).map((m) => (
                  <MeetingRow key={m.id} meeting={m} live={false} />
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Recent topics"
            icon={ClipboardList}
            iconClassName="text-accent"
            actions={<SectionLink to="/teacher/topics">All</SectionLink>}
          >
            {topicsQuery.isPending ? (
              <Skeleton className="h-24 rounded-lg" />
            ) : recentTopics.length === 0 ? (
              <Empty>Nothing logged yet.</Empty>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {recentTopics.map((topic) => (
                  <li key={topic.id} className="py-2 text-sm">
                    <p className="truncate font-medium text-foreground">{topic.topic_title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {topic.class_room?.name ? `${topic.class_room.name} · ` : ''}
                      {subjectName(topic)} · {formatDayLabel(topic.date_covered)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      {/* The syllabus form, opened from "Log topic" with class, subject and
          date already filled in. */}
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
    </div>
  )
}

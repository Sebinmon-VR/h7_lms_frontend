import { ArrowRight, ExternalLink, Video } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/providers/auth-provider'
import { useMyClassRooms } from '@/queries/classes.queries'
import {
  useStudentAttendance,
  useStudentGrades,
  useStudentMaterials,
  useStudentMeetings,
  useStudentTopics,
  useStudentUpcoming,
} from '@/queries/student.queries'
import {
  attendanceRate,
  attendanceStreak,
  averageGradePercentage,
  nextMeeting,
  studentTimeline,
  syllabusProgress,
} from '@/lib/derive'
import { formatCountdown, formatRelative, formatTime, meetingPhase } from '@/lib/datetime'
import { resolveFileUrl } from '@/lib/files'
import { formatMarks, formatPercent, gradePercentage } from '@/lib/format'
import { subjectName } from '@/lib/select'
import { subjectLook, toneStyle } from '@/lib/subjects'
import { formatStartsIn } from '@/lib/timetable'
import { useNow } from '@/lib/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { JoinRoomButton, LeaveRoomButton, PresenceNote } from '@/components/domain/class-room'
import { useCelebration } from '@/components/fun/celebrate'
import { Appear, Pressable, Stagger, WaveDivider } from '@/components/fun/motion'
import {
  AchievementShelf,
  FunEmpty,
  FunHero,
  FunSection,
  FunStat,
  ProgressRing,
  StreakCard,
  SubjectTile,
  type Achievement,
} from '@/components/fun/fun-ui'
import { HeroHeader } from '@/components/layout/page-header'
import { AdminStudentNotice, NotEnrolledState, useEnrollmentStatus } from './student-guard'

/**
 * A learner's home screen.
 *
 * Written to be scanned by someone in a hurry before class, not studied: the
 * one thing happening next is the biggest element on the page, every number
 * has a plain-language caption, and each subject carries its own colour so the
 * page can be navigated by shape before it is read.
 */

/** Time-of-day greeting, in the words a child would use. */
function friendlyGreeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * A line under the greeting that says something true about today.
 *
 * Ordered by what matters most right now — a class starting beats a good
 * average — so the learner is told the useful thing rather than a generic one.
 */
function heroMessage(opts: {
  liveNow: boolean
  minutesToNext: number | null
  streak: number
  rate: number | null
  hasAnything: boolean
}): string {
  if (opts.liveNow) return 'Your class is live right now — jump in!'
  if (opts.minutesToNext !== null && opts.minutesToNext >= 0 && opts.minutesToNext <= 30) {
    return `Your next class starts in ${opts.minutesToNext} minute${opts.minutesToNext === 1 ? '' : 's'}. Get ready!`
  }
  if (opts.streak >= 5) return `You have been here ${opts.streak} days in a row. Amazing!`
  if (opts.rate !== null && opts.rate >= 95) return 'Your attendance is brilliant. Keep it up!'
  if (!opts.hasAnything) return 'Nothing new just yet. Check back a bit later!'
  return "Here is everything you need today. Let's go!"
}

/**
 * Badges.
 *
 * Every one is derived from data the learner can actually influence, and the
 * description says what earned it — a badge whose rule is a mystery is just
 * decoration.
 */
function buildAchievements(opts: {
  rate: number | null
  average: number | null
  streak: number
  materialsOpened: number
  topicsCovered: number
}): Achievement[] {
  return [
    {
      id: 'streak-3',
      emoji: '🔥',
      title: 'On a roll',
      description: '3 days in a row',
      earned: opts.streak >= 3,
      tone: 2,
    },
    {
      id: 'streak-10',
      emoji: '🚀',
      title: 'Unstoppable',
      description: '10 days in a row',
      earned: opts.streak >= 10,
      tone: 1,
    },
    {
      id: 'attend-90',
      emoji: '🎯',
      title: 'Always here',
      description: '90% attendance',
      earned: (opts.rate ?? 0) >= 90,
      tone: 5,
    },
    {
      id: 'grade-75',
      emoji: '⭐',
      title: 'Star marks',
      description: '75% average',
      earned: (opts.average ?? 0) >= 75,
      tone: 3,
    },
    {
      id: 'grade-90',
      emoji: '🏆',
      title: 'Top of the class',
      description: '90% average',
      earned: (opts.average ?? 0) >= 90,
      tone: 8,
    },
    {
      id: 'curious',
      emoji: '📚',
      title: 'Curious mind',
      description: '5 topics covered',
      earned: opts.topicsCovered >= 5,
      tone: 7,
    },
  ]
}

const SHORTCUTS = [
  { to: '/student/timetable', label: 'My timetable', emoji: '🗓️', tone: 7 },
  { to: '/student/materials', label: 'Notes & books', emoji: '📚', tone: 5 },
  { to: '/student/grades', label: 'My marks', emoji: '⭐', tone: 3 },
  { to: '/student/meetings', label: 'Live classes', emoji: '🎥', tone: 9 },
]

export default function StudentDashboardPage() {
  const { user } = useAuth()
  const enrollment = useEnrollmentStatus()
  const now = useNow(30_000)
  const [confetti, celebrate] = useCelebration()

  const attendanceQuery = useStudentAttendance(!enrollment.isAdmin)
  const gradesQuery = useStudentGrades(!enrollment.isAdmin)
  const meetingsQuery = useStudentMeetings(!enrollment.isAdmin)
  const materialsQuery = useStudentMaterials(!enrollment.isAdmin)
  const topicsQuery = useStudentTopics(!enrollment.isAdmin)
  const upcomingQuery = useStudentUpcoming(!enrollment.isAdmin)
  // The class's shared room: the one link the whole day happens in.
  const roomsQuery = useMyClassRooms(!enrollment.isAdmin)
  const classRoom = roomsQuery.data?.[0] ?? null

  const attendance = React.useMemo(() => attendanceQuery.data ?? [], [attendanceQuery.data])
  const grades = React.useMemo(() => gradesQuery.data ?? [], [gradesQuery.data])

  const rate = React.useMemo(() => attendanceRate(attendance), [attendance])
  const average = React.useMemo(() => averageGradePercentage(grades), [grades])
  const streak = React.useMemo(() => attendanceStreak(attendance), [attendance])

  const upcomingMeeting = React.useMemo(
    () => nextMeeting(meetingsQuery.data ?? [], now),
    [meetingsQuery.data, now],
  )
  const nextPeriod = (upcomingQuery.data ?? [])[0] ?? null

  const recentGrades = React.useMemo(
    () => [...grades].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4),
    [grades],
  )

  const recentMaterials = React.useMemo(
    () =>
      [...(materialsQuery.data ?? [])]
        .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
        .slice(0, 4),
    [materialsQuery.data],
  )

  const timeline = React.useMemo(
    () =>
      studentTimeline(
        meetingsQuery.data ?? [],
        materialsQuery.data ?? [],
        topicsQuery.data ?? [],
        now,
      ).slice(0, 6),
    [meetingsQuery.data, materialsQuery.data, topicsQuery.data, now],
  )

  const progress = React.useMemo(
    () => syllabusProgress(topicsQuery.data ?? [], (t) => subjectName(t)),
    [topicsQuery.data],
  )

  const achievements = React.useMemo(
    () =>
      buildAchievements({
        rate,
        average,
        streak,
        materialsOpened: recentMaterials.length,
        topicsCovered: topicsQuery.data?.length ?? 0,
      }),
    [rate, average, streak, recentMaterials.length, topicsQuery.data],
  )

  const earnedCount = achievements.filter((a) => a.earned).length
  const achievementsPending = attendanceQuery.isPending || gradesQuery.isPending

  /**
   * Fires once when a new badge appears, not on every render or refetch.
   *
   * The ref starts at null rather than 0 so the FIRST settled load — where the
   * count jumps straight to however many are already earned — is recorded
   * silently. Otherwise every visit would set off confetti for badges the
   * learner won weeks ago.
   */
  const lastEarned = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (achievementsPending) return
    if (lastEarned.current !== null && earnedCount > lastEarned.current) celebrate()
    lastEarned.current = earnedCount
  }, [earnedCount, achievementsPending, celebrate])

  if (enrollment.isAdmin) {
    return (
      <>
        <HeroHeader eyebrow="Learning" title="Student dashboard" />
        <AdminStudentNotice />
      </>
    )
  }

  if (enrollment.isPending) {
    return (
      <>
        <Skeleton className="mb-5 h-28 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </>
    )
  }

  if (enrollment.notEnrolled) {
    return (
      <>
        <FunHero
          greeting={`${friendlyGreeting(now)}, ${user?.full_name?.split(' ')[0] ?? 'there'}!`}
          mood="curious"
          message="You are not in a class yet."
        />
        <NotEnrolledState />
      </>
    )
  }

  /**
   * "Live" has to account for both sources, because the card below shows the
   * timetable period when there is one and the meeting otherwise. Deriving the
   * banner from the meeting alone produced a card headed "Happening now" whose
   * own countdown read "Started" — two different facts about two different
   * things, presented as one.
   */
  const meetingLive =
    !!upcomingMeeting && meetingPhase(upcomingMeeting.scheduled_time, now) === 'live'
  const liveNow = nextPeriod ? nextPeriod.is_current : meetingLive
  const hasAnything = timeline.length > 0 || recentMaterials.length > 0 || !!nextPeriod

  return (
    <>
      {confetti}

      <FunHero
        greeting={`${friendlyGreeting(now)}, ${user?.full_name?.split(' ')[0] ?? 'there'}!`}
        mood={liveNow ? 'cheer' : 'happy'}
        message={heroMessage({
          liveNow,
          minutesToNext: nextPeriod?.starts_in_minutes ?? null,
          streak,
          rate,
          hasAnything,
        })}
      >
        {enrollment.classRoom && (
          <Badge tone="primary" size="sm">
            {enrollment.classRoom.name}
          </Badge>
        )}
      </FunHero>

      {/* ---------------------------------------------------- what's next
          The single biggest thing on the page, right under the greeting. A
          learner opening this before school wants one answer — where do I
          need to be, and when — and the button to go there. */}
      {(nextPeriod || upcomingMeeting) && (
        <Appear
          style={toneStyle(
            subjectLook(
              nextPeriod ? subjectName(nextPeriod.entry) : subjectName(upcomingMeeting!),
            ).tone,
          )}
          className="sticker mb-6 p-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <SubjectTile
              subject={
                nextPeriod ? subjectName(nextPeriod.entry) : subjectName(upcomingMeeting!)
              }
              size="lg"
            />

            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {liveNow ? 'Happening now' : 'Coming up next'}
              </p>
              <p className="mt-0.5 truncate text-xl font-extrabold">
                {nextPeriod ? subjectName(nextPeriod.entry) : upcomingMeeting!.title}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {nextPeriod ? (
                  <>
                    {formatTime(nextPeriod.starts_at)}
                    {nextPeriod.entry.room ? ` · ${nextPeriod.entry.room}` : ''} ·{' '}
                    <span className="font-semibold text-foreground">
                      {formatStartsIn(nextPeriod)}
                    </span>
                  </>
                ) : (
                  <>
                    Starts in{' '}
                    <span className="font-semibold text-foreground">
                      {formatCountdown(upcomingMeeting!.scheduled_time, now)}
                    </span>
                  </>
                )}
              </p>
              {classRoom && <PresenceNote access={classRoom} className="mt-1" />}
            </div>

            {/* The class's shared room, when the school runs one: ONE join for
                the whole day, open from just before the first period to just
                after the last, and a Leave button once they are in so their
                leaving time is recorded. Falls back to the meeting's own link
                for a class without a room. */}
            {classRoom ? (
              <div className="flex flex-wrap items-center gap-2">
                <JoinRoomButton access={classRoom} size="lg" />
                <LeaveRoomButton access={classRoom} size="lg" />
              </div>
            ) : upcomingMeeting?.meeting_link && (
              <Button
                asChild
                variant={meetingLive ? 'primary' : 'outline'}
                size="lg"
                className={meetingLive ? 'animate-pulse-ring' : undefined}
              >
                <a href={upcomingMeeting.meeting_link} target="_blank" rel="noopener noreferrer">
                  <Video className="size-4" />
                  {meetingLive ? 'Join now' : 'Open link'}
                </a>
              </Button>
            )}
          </div>
        </Appear>
      )}

      {/* ------------------------------------------------------------ stats */}
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Appear style={toneStyle(5)} className="sticker flex items-center gap-4 p-4">
          <ProgressRing value={rate ?? 0} tone={5} size={72} animate />
          <div className="min-w-0">
            <p className="text-sm font-bold">Days you were here</p>
            <p className="text-xs text-muted-foreground">
              {rate === null ? 'No record yet' : 'Out of all your classes'}
            </p>
            <Button asChild variant="ghost" size="xs" className="mt-1 -ml-2">
              <Link to="/student/attendance">
                See days
                <ArrowRight className="size-3" />
              </Link>
            </Button>
          </div>
        </Appear>

        <Appear style={toneStyle(3)} className="sticker flex items-center gap-4 p-4">
          <ProgressRing value={average ?? 0} tone={3} size={72} animate />
          <div className="min-w-0">
            <p className="text-sm font-bold">Your average mark</p>
            <p className="text-xs text-muted-foreground">
              {average === null ? 'No marks yet' : 'Across every test'}
            </p>
            <Button asChild variant="ghost" size="xs" className="mt-1 -ml-2">
              <Link to="/student/grades">
                See marks
                <ArrowRight className="size-3" />
              </Link>
            </Button>
          </div>
        </Appear>

        <Appear>
          {streak > 0 ? (
            <StreakCard days={streak} />
          ) : (
            <FunStat
              value={topicsQuery.data?.length ?? 0}
              label="Topics covered"
              hint="Things your class has learned"
              emoji="🧠"
              tone={7}
            />
          )}
        </Appear>

        <Appear>
          <FunStat
            value={`${earnedCount}/${achievements.length}`}
            label="Badges earned"
            hint="Collect them all!"
            emoji="🏅"
            tone={8}
          />
        </Appear>
      </Stagger>

      <WaveDivider className="mt-7" />

      {/* ------------------------------------------------------------ badges */}
      <FunSection emoji="🏅" title="Your badges" className="mt-4">
        <AchievementShelf achievements={achievements} />
      </FunSection>

      {/* ---------------------------------------------- marks and materials */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <FunSection
          emoji="⭐"
          title="Latest marks"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/student/grades">
                See all
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          }
        >
          {gradesQuery.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : recentGrades.length === 0 ? (
            <FunEmpty
              mood="curious"
              title="No marks yet"
              description="When your teacher marks a test, it will show up right here."
            />
          ) : (
            <ul className="space-y-2">
              {recentGrades.map((grade) => {
                const percent = gradePercentage(grade.marks_obtained, grade.max_marks)
                return (
                  <li
                    key={grade.id}
                    style={toneStyle(subjectLook(subjectName(grade)).tone)}
                    className="sticker flex items-center gap-3 p-3"
                  >
                    <SubjectTile subject={subjectName(grade)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{grade.exam_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{subjectName(grade)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-extrabold tabular-nums">
                        {formatPercent(percent, 0)}
                      </p>
                      <p className="text-2xs text-muted-foreground tabular-nums">
                        {formatMarks(grade.marks_obtained, grade.max_marks)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </FunSection>

        <FunSection
          emoji="📚"
          title="New notes"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/student/materials">
                See all
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          }
        >
          {materialsQuery.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : recentMaterials.length === 0 ? (
            <FunEmpty
              mood="sleepy"
              title="Nothing new"
              description="Notes and worksheets your teachers share will appear here."
            />
          ) : (
            <ul className="space-y-2">
              {recentMaterials.map((material) => {
                const url = resolveFileUrl(material.file_url)
                return (
                  <li
                    key={material.id}
                    style={toneStyle(subjectLook(subjectName(material)).tone)}
                    className="sticker flex items-center gap-3 p-3"
                  >
                    <SubjectTile subject={subjectName(material)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{material.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {subjectName(material)} · {formatRelative(material.uploaded_at)}
                      </p>
                    </div>
                    {url && (
                      <Button
                        asChild
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Open ${material.title}`}
                      >
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink />
                        </a>
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </FunSection>
      </div>

      {/* ----------------------------------------------------- how far along */}
      {progress.length > 0 && (
        <FunSection emoji="🧗" title="How far your class has got" className="mt-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {progress.slice(0, 4).map((subject) => (
              <div
                key={subject.subjectId}
                style={toneStyle(subjectLook(subject.subjectName).tone)}
                className="sticker p-3"
              >
                <div className="mb-2 flex items-center gap-2.5">
                  <SubjectTile subject={subject.subjectName} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {subject.subjectName}
                  </span>
                  <span className="text-sm font-extrabold tabular-nums">
                    {formatPercent(subject.completion, 0)}
                  </span>
                </div>
                <ProgressBar value={subject.completion} size="sm" />
              </div>
            ))}
          </div>
        </FunSection>
      )}

      {/* --------------------------------------------------------- timeline */}
      <FunSection emoji="🗓️" title="Your week" className="mt-6">
        {timeline.length === 0 ? (
          <FunEmpty
            mood="sleepy"
            title="A quiet week"
            description="Classes, new notes and topics will show up here as they happen."
          />
        ) : (
          <ol className="space-y-2">
            {timeline.map((entry) => (
              <li key={entry.id}>
                <Link
                  to={entry.href}
                  style={toneStyle(subjectLook(entry.subject).tone)}
                  className="sticker sticker-hover flex items-center gap-3 p-3"
                >
                  <SubjectTile subject={entry.subject} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{entry.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{entry.subject}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {entry.upcoming ? (
                      <Badge tone="primary" size="sm">
                        in {formatCountdown(entry.at, now)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {formatRelative(entry.at)}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </FunSection>

      {/* -------------------------------------------------------- shortcuts */}
      <WaveDivider className="mt-7" />
      <Stagger className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SHORTCUTS.map((item) => (
          <Appear key={item.to}>
            <Pressable style={toneStyle(item.tone)} className="sticker">
              <Link to={item.to} className="flex items-center gap-3 p-4">
                <span className="text-2xl" aria-hidden>
                  {item.emoji}
                </span>
                <span className="text-sm font-bold">{item.label}</span>
                <ArrowRight className="ml-auto size-4 text-muted-foreground" />
              </Link>
            </Pressable>
          </Appear>
        ))}
      </Stagger>
    </>
  )
}

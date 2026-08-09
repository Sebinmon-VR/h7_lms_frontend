import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  ExternalLink,
  FileText,
  Library,
  Video,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/providers/auth-provider'
import {
  useStudentAttendance,
  useStudentGrades,
  useStudentMaterials,
  useStudentMeetings,
  useStudentTopics,
} from '@/queries/student.queries'
import {
  attendanceRate,
  averageGradePercentage,
  nextMeeting,
  studentTimeline,
  syllabusProgress,
} from '@/lib/derive'
import { cn } from '@/lib/cn'
import { formatCountdown, formatDateTime, formatRelative, meetingPhase } from '@/lib/datetime'
import { resolveFileUrl } from '@/lib/files'
import { formatMarks, formatPercent, greeting, gradePercentage, performanceTone } from '@/lib/format'
import { subjectName } from '@/lib/select'
import { useNow } from '@/lib/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ProgressBar, ProgressRing } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { MeetingPhaseBadge } from '@/components/domain/badges'
import { FileTypeIcon } from '@/components/domain/file-type-icon'
import { EmptyState } from '@/components/feedback/states'
import { HeroHeader } from '@/components/layout/page-header'
import { AdminStudentNotice, NotEnrolledState, useEnrollmentStatus } from './student-guard'

const TIMELINE_ICON = {
  meeting: Video,
  material: Library,
  topic: ClipboardList,
} as const

export default function StudentDashboardPage() {
  const { user } = useAuth()
  const enrollment = useEnrollmentStatus()
  const now = useNow(30_000)

  const attendanceQuery = useStudentAttendance(!enrollment.isAdmin)
  const gradesQuery = useStudentGrades(!enrollment.isAdmin)
  const meetingsQuery = useStudentMeetings(!enrollment.isAdmin)
  const materialsQuery = useStudentMaterials(!enrollment.isAdmin)
  const topicsQuery = useStudentTopics(!enrollment.isAdmin)

  const attendance = React.useMemo(() => attendanceQuery.data ?? [], [attendanceQuery.data])
  const grades = React.useMemo(() => gradesQuery.data ?? [], [gradesQuery.data])

  const rate = React.useMemo(() => attendanceRate(attendance), [attendance])
  const average = React.useMemo(() => averageGradePercentage(grades), [grades])

  const upcoming = React.useMemo(
    () => nextMeeting(meetingsQuery.data ?? [], now),
    [meetingsQuery.data, now],
  )

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

  /**
   * Capped at 8: this is a "what's going on" glance, not an archive. The full
   * lists live on their own pages, which each row links to.
   */
  const timeline = React.useMemo(
    () =>
      studentTimeline(
        meetingsQuery.data ?? [],
        materialsQuery.data ?? [],
        topicsQuery.data ?? [],
        now,
      ).slice(0, 8),
    [meetingsQuery.data, materialsQuery.data, topicsQuery.data, now],
  )

  const progress = React.useMemo(
    () => syllabusProgress(topicsQuery.data ?? [], (t) => subjectName(t)),
    [topicsQuery.data],
  )

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
        <HeroHeader eyebrow="Learning" title={`${greeting()}`} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </>
    )
  }

  if (enrollment.notEnrolled) {
    return (
      <>
        <HeroHeader
          eyebrow="Learning"
          title={`${greeting()}, ${user?.full_name?.split(' ')[0] ?? 'there'}`}
        />
        <NotEnrolledState />
      </>
    )
  }

  return (
    <>
      <HeroHeader
        eyebrow={enrollment.classRoom ? enrollment.classRoom.name : 'Learning'}
        title={`${greeting()}, ${user?.full_name?.split(' ')[0] ?? 'there'}`}
        description="Your classes, attendance, materials and results in one place."
        actions={
          upcoming && meetingPhase(upcoming.scheduled_time, now) === 'live' && upcoming.meeting_link ? (
            <Button asChild variant="primary">
              <a href={upcoming.meeting_link} target="_blank" rel="noopener noreferrer">
                <Video className="size-4" />
                Join live class
              </a>
            </Button>
          ) : undefined
        }
      />

      {/* ------------------------------------------------------- next class */}
      {upcoming && (
        <Card
          className={
            meetingPhase(upcoming.scheduled_time, now) === 'live'
              ? 'mb-5 border-danger/40 shadow-glow'
              : 'mb-5'
          }
        >
          <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <MeetingPhaseBadge phase={meetingPhase(upcoming.scheduled_time, now)} />
                {meetingPhase(upcoming.scheduled_time, now) === 'upcoming' && (
                  <span className="text-xs text-muted-foreground">
                    starts in {formatCountdown(upcoming.scheduled_time, now)}
                  </span>
                )}
              </div>
              <p className="mt-2 text-base font-semibold">{upcoming.title}</p>
              <p className="text-sm text-muted-foreground">{formatDateTime(upcoming.scheduled_time)}</p>
              <Badge tone="accent" size="sm" className="mt-2">
                {subjectName(upcoming)}
              </Badge>
            </div>
            {upcoming.meeting_link && (
              <Button asChild variant="outline">
                <a href={upcoming.meeting_link} target="_blank" rel="noopener noreferrer">
                  <Video className="size-4" />
                  Open link
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------ stats */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="flex flex-col items-center justify-center p-6">
          <ProgressRing value={rate} tone={performanceTone(rate)} size={120} strokeWidth={11}>
            <span className="text-2xl font-semibold tabular-nums">{formatPercent(rate, 0)}</span>
            <span className="text-2xs text-muted-foreground">attendance</span>
          </ProgressRing>
          <Button asChild variant="ghost" size="sm" className="mt-3">
            <Link to="/student/attendance">
              View record
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </Card>

        <Card className="flex flex-col items-center justify-center p-6">
          <ProgressRing value={average} tone={performanceTone(average)} size={120} strokeWidth={11}>
            <span className="text-2xl font-semibold tabular-nums">{formatPercent(average, 0)}</span>
            <span className="text-2xs text-muted-foreground">average</span>
          </ProgressRing>
          <Button asChild variant="ghost" size="sm" className="mt-3">
            <Link to="/student/grades">
              View grades
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Syllabus progress</CardTitle>
            <CardDescription>How far your class has covered each subject.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topicsQuery.isPending ? (
              <Skeleton className="h-20 rounded-lg" />
            ) : progress.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nothing logged yet.</p>
            ) : (
              progress.slice(0, 4).map((subject) => (
                <div key={subject.subjectId}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="truncate">{subject.subjectName}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatPercent(subject.completion, 0)}
                    </span>
                  </div>
                  <ProgressBar value={subject.completion} size="sm" />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------------------------------------------- grades and materials */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Latest results</CardTitle>
              <CardDescription>Your most recently recorded exams.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/student/grades">
                All
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {gradesQuery.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : recentGrades.length === 0 ? (
              <EmptyState
                icon={<FileText />}
                title="No grades yet"
                description="Exam results appear here once your teachers record them."
                className="border-0 py-8"
              />
            ) : (
              <ul className="divide-y divide-border/70">
                {recentGrades.map((grade) => {
                  const percent = gradePercentage(grade.marks_obtained, grade.max_marks)
                  return (
                    <li key={grade.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{grade.exam_name}</p>
                        <p className="truncate text-xs text-muted-foreground">{subjectName(grade)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-sm tabular-nums">
                          {formatMarks(grade.marks_obtained, grade.max_marks)}
                        </span>
                        <Badge tone={performanceTone(percent) as 'success'} size="sm">
                          {formatPercent(percent, 0)}
                        </Badge>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>New materials</CardTitle>
              <CardDescription>Recently shared by your teachers.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/student/materials">
                All
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {materialsQuery.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : recentMaterials.length === 0 ? (
              <EmptyState
                icon={<Library />}
                title="Nothing shared yet"
                description="Notes and worksheets will show up here."
                className="border-0 py-8"
              />
            ) : (
              <ul className="divide-y divide-border/70">
                {recentMaterials.map((material) => {
                  const url = resolveFileUrl(material.file_url)
                  return (
                    <li key={material.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <FileTypeIcon url={material.file_url} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{material.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {subjectName(material)} · {formatRelative(material.uploaded_at)}
                          </p>
                        </div>
                      </div>
                      {url && (
                        <Button asChild variant="ghost" size="icon-sm" aria-label={`Open ${material.title}`}>
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
          </CardContent>
        </Card>
      </div>

      {/* --------------------------------------------------------- timeline */}
      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Your week</CardTitle>
          <CardDescription>
            Meetings, materials and topics for your class, in one place.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <EmptyState
              icon={<CalendarCheck />}
              title="Nothing scheduled"
              description="Meetings, new materials and covered topics from the past week and the next two will appear here."
            />
          ) : (
            <ol className="space-y-1">
              {timeline.map((entry) => {
                const Icon = TIMELINE_ICON[entry.kind]
                return (
                  <li key={entry.id}>
                    <Link
                      to={entry.href}
                      className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60"
                    >
                      <span
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-lg',
                          entry.upcoming
                            ? 'bg-primary/12 text-primary'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{entry.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {entry.subject}
                          {entry.meta && entry.kind === 'topic' ? ` · ${entry.meta}` : ''}
                        </p>
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
                )
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* -------------------------------------------------------- shortcuts */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: '/student/classes', label: 'My classes', icon: BookOpen },
          { to: '/student/attendance', label: 'Attendance', icon: CalendarCheck },
          { to: '/student/syllabus', label: 'Syllabus', icon: ClipboardList },
          { to: '/student/meetings', label: 'Meetings', icon: Video },
        ].map((item) => (
          <Card key={item.to} interactive className="p-4">
            <Link to={item.to} className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <item.icon className="size-4" />
              </span>
              <span className="text-sm font-medium">{item.label}</span>
              <ArrowRight className="ml-auto size-4 text-muted-foreground" />
            </Link>
          </Card>
        ))}
      </div>
    </>
  )
}

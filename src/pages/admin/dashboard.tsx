import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  Layers,
  Library,
  Link2,
  ShieldAlert,
  UserPlus,
  Users,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { LiveClassBoardRow, UserOut } from '@/api/types'
import { useAuth } from '@/providers/auth-provider'
import {
  useClasses,
  useEnrollments,
  useMappings,
  useMonitoringReport,
  useSubjects,
  useUsers,
} from '@/queries/admin.queries'
import { useLiveBoard } from '@/queries/classes.queries'
import { isTeachingRole } from '@/lib/constants'
import { cn } from '@/lib/cn'
import { provisioningAlerts, signupsOverTime } from '@/lib/derive'
import { formatRelative, formatTime } from '@/lib/datetime'
import { greeting } from '@/lib/format'
import { subjectName } from '@/lib/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AreaTrend, DonutBreakdown } from '@/components/charts/charts'
import { ChartCard, useChartPalette } from '@/components/charts/chart-card'
import { JoinRoomButton } from '@/components/domain/class-room'
import { StatCard } from '@/components/domain/stat-card'
import { RoleBadge } from '@/components/domain/badges'
import { UserCell } from '@/components/domain/user-cell'
import { ErrorState } from '@/components/feedback/states'
import { HeroHeader } from '@/components/layout/page-header'

const QUICK_ACTIONS = [
  { to: '/admin/users', label: 'Add a user', icon: UserPlus },
  { to: '/admin/classes', label: 'Create a class', icon: Layers },
  { to: '/admin/mappings', label: 'Map a teacher', icon: Link2 },
  { to: '/admin/enrollments', label: 'Enroll students', icon: GraduationCap },
]

function LiveNowRow({ row }: { row: LiveClassBoardRow }) {
  const current = row.current_period
  const session = row.live_sessions.find((s) => s.timing.is_live) ?? row.live_sessions[0] ?? null
  const title = current
    ? subjectName(current.entry)
    : (session?.title ?? session?.subject_name ?? 'Live session')
  const teacher = current
    ? (current.entry.teacher?.full_name ?? 'Teacher to be confirmed')
    : (session?.teacher_name ?? 'Teacher')
  const ends = current
    ? `until ${formatTime(current.ends_at)}`
    : session?.timing.minutes_remaining != null
      ? `${Math.max(0, Math.round(session.timing.minutes_remaining))} min left`
      : ''
  const teacherIn = row.teachers_in_now.length > 0 || row.teacher_present

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-semibold">
          {row.class_name} <span className="font-normal text-muted-foreground">· {title}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {teacher}
          {ends ? ` · ${ends}` : ''} · {row.students_in_now.length} of {row.enrolled_count} students in ·{' '}
          <span className={teacherIn ? 'text-success' : 'text-warning'}>
            {teacherIn ? 'teacher in' : 'teacher not in yet'}
          </span>
        </p>
      </div>
      <JoinRoomButton access={row} size="sm" />
    </li>
  )
}

/**
 * The live classes, right under the greeting. A school day is happening while
 * the office reads this, so what is in session, who is teaching it and how
 * many are in belongs above the setup tiles. Polled with the live board.
 */
function LiveNowStrip() {
  const board = useLiveBoard()
  const rows = board.data ?? []
  const live = rows.filter((r) => r.is_live)
  const upcoming = rows
    .filter((r) => !r.is_live && r.next_period)
    .sort((a, b) => (a.next_period?.starts_at ?? '').localeCompare(b.next_period?.starts_at ?? ''))
  const studentsIn = live.reduce((n, r) => n + r.students_in_now.length, 0)
  const nextUp = upcoming[0]?.next_period ?? null

  if (board.isPending) return <Skeleton className="mb-5 h-24 rounded-2xl" />
  // The board page reports its own failure; the dashboard stays quiet about it.
  if (board.isError) return null

  return (
    <Card className={cn('mb-5', live.length > 0 ? 'border-success/40 shadow-glow' : 'border-border')}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Live now</CardTitle>
          <Badge tone={live.length > 0 ? 'success' : 'neutral'} dot={live.length > 0}>
            {live.length > 0 ? `${live.length} in session` : 'No class in session'}
          </Badge>
          {studentsIn > 0 && (
            <Badge tone="accent">
              <Users />
              {studentsIn} students in
            </Badge>
          )}
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/live-classes">
            Live classes board
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {live.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {live.map((row) => (
              <LiveNowRow key={row.class_id} row={row} />
            ))}
          </ul>
        ) : nextUp ? (
          <p className="text-sm text-muted-foreground">
            Next:{' '}
            <span className="font-medium text-foreground">
              {upcoming[0].class_name} · {subjectName(nextUp.entry)}
            </span>{' '}
            at {formatTime(nextUp.starts_at)}
            {upcoming.length > 1
              ? `, then ${upcoming.length - 1} more ${upcoming.length - 1 === 1 ? 'class' : 'classes'} today`
              : ''}
            .
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing more on the timetable today.</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function AdminDashboardPage() {
  const { user } = useAuth()
  const palette = useChartPalette()

  const usersQuery = useUsers()
  const classesQuery = useClasses()
  const subjectsQuery = useSubjects()
  const mappingsQuery = useMappings()
  const enrollmentsQuery = useEnrollments()
  const reportQuery = useMonitoringReport()

  const users = usersQuery.data ?? []
  const stats = reportQuery.data?.overall_stats

  // Prefer the server's own counts; fall back to what we already have so the
  // tiles stay useful when the (slow) report endpoint is still loading.
  const tiles = React.useMemo(() => {
    const students = stats?.total_students ?? users.filter((u) => u.role === 'STUDENT' && u.is_active).length
    // Both teaching roles — the backend's own report counts them together, and
    // splitting here would make the tile disagree with /admin/reports.
    const teachers =
      stats?.total_teachers ?? users.filter((u) => isTeachingRole(u.role) && u.is_active).length
    return [
      { label: 'Students', value: students, icon: GraduationCap, tone: 'primary' as const },
      { label: 'Teachers', value: teachers, icon: Users, tone: 'info' as const },
      { label: 'Classes', value: stats?.total_classes ?? classesQuery.data?.length ?? 0, icon: Layers, tone: 'accent' as const },
      { label: 'Subjects', value: stats?.total_subjects ?? subjectsQuery.data?.length ?? 0, icon: BookOpen, tone: 'success' as const },
      { label: 'Materials', value: stats?.total_materials_uploaded ?? 0, icon: Library, tone: 'warning' as const },
      { label: 'Attendance logs', value: stats?.total_attendance_logs ?? 0, icon: ClipboardCheck, tone: 'danger' as const },
    ]
  }, [stats, users, classesQuery.data, subjectsQuery.data])

  const alerts = React.useMemo(
    () =>
      provisioningAlerts(
        users,
        classesQuery.data ?? [],
        subjectsQuery.data ?? [],
        mappingsQuery.data ?? [],
        enrollmentsQuery.data ?? [],
      ),
    [users, classesQuery.data, subjectsQuery.data, mappingsQuery.data, enrollmentsQuery.data],
  )

  const signups = React.useMemo(() => signupsOverTime(users), [users])

  const roleBreakdown = React.useMemo(
    () => [
      { name: 'Students', value: users.filter((u) => u.role === 'STUDENT').length, color: palette.series[0] },
      { name: 'Teachers', value: users.filter((u) => isTeachingRole(u.role)).length, color: palette.series[2] },
      { name: 'Administrators', value: users.filter((u) => u.role === 'ADMIN').length, color: palette.series[1] },
    ],
    [users, palette],
  )

  const recentUsers = React.useMemo(
    () => [...users].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6),
    [users],
  )

  const alertGroups: { label: string; items: (UserOut | { id: number; name: string })[]; to: string; cta: string }[] = [
    {
      label: 'Students with no class',
      items: alerts.studentsWithoutEnrollment,
      to: '/admin/enrollments',
      cta: 'Enroll them',
    },
    {
      label: 'Teachers with no mapping',
      items: alerts.teachersWithoutAssignment,
      to: '/admin/mappings',
      cta: 'Map them',
    },
    {
      label: 'Classes with no subject',
      items: alerts.classesWithoutSubject.map((c) => ({ id: c.id, name: c.name })),
      to: '/admin/mappings',
      cta: 'Add subjects',
    },
    {
      label: 'Subjects with no teacher',
      items: alerts.subjectsWithoutTeacher.map((s) => ({ id: s.id, name: s.name })),
      to: '/admin/mappings',
      cta: 'Map a teacher',
    },
  ]

  const activeAlerts = alertGroups.filter((g) => g.items.length > 0)

  return (
    <>
      <HeroHeader
        eyebrow="Administration"
        title={`${greeting()}, ${user?.full_name?.split(' ')[0] ?? 'there'}`}
        description="Everything happening across your institution, and anything that needs setting up."
        actions={
          <Button asChild variant="primary">
            <Link to="/admin/reports">
              View full report
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
      >
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <Button key={action.to} asChild variant="outline" size="sm">
              <Link to={action.to}>
                <action.icon className="size-4" />
                {action.label}
              </Link>
            </Button>
          ))}
        </div>
      </HeroHeader>

      <LiveNowStrip />

      {/* ------------------------------------------------------------ tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {reportQuery.isPending && !usersQuery.data
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
          : tiles.map((tile, i) => (
              <StatCard
                key={tile.label}
                index={i}
                label={tile.label}
                value={tile.value}
                icon={tile.icon}
                tone={tile.tone}
              />
            ))}
      </div>

      {/* ----------------------------------------------------------- alerts */}
      {activeAlerts.length > 0 && (
        <Card className="mt-5 border-warning/30">
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <ShieldAlert className="size-4 text-warning" />
            <CardTitle className="text-sm">Needs your attention</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {activeAlerts.map((group) => (
              <div
                key={group.label}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    <span className="tabular-nums text-warning">{group.items.length}</span> {group.label.toLowerCase()}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {group.items
                      .slice(0, 3)
                      .map((i) => ('full_name' in i ? i.full_name : i.name))
                      .join(', ')}
                    {group.items.length > 3 && ` +${group.items.length - 3} more`}
                  </p>
                </div>
                <Button asChild variant="ghost" size="xs">
                  <Link to={group.to}>{group.cta}</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------- charts */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Accounts created"
          description="New accounts per month, derived from account creation dates."
        >
          {usersQuery.isPending ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : signups.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Not enough history yet.</p>
          ) : (
            <AreaTrend data={signups} xKey="label" yKey="cumulative" yLabel="Total accounts" height={260} />
          )}
        </ChartCard>

        <ChartCard title="Who is on the platform" description="All accounts, including inactive ones.">
          {usersQuery.isPending ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : (
            <DonutBreakdown data={roleBreakdown} centerValue={users.length} centerLabel="accounts" height={240} />
          )}
        </ChartCard>
      </div>

      {/* ------------------------------------------------------ recent users */}
      <Card className="mt-5">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Recently added</CardTitle>
            <CardDescription>The newest accounts in the system.</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/users">
              All users
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {usersQuery.isError ? (
            <ErrorState error={usersQuery.error} onRetry={() => usersQuery.refetch()} compact />
          ) : usersQuery.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : recentUsers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No accounts yet.</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {recentUsers.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                  <UserCell name={u.full_name} email={u.email} inactive={!u.is_active} />
                  <div className="flex shrink-0 items-center gap-3">
                    <RoleBadge role={u.role} size="sm" />
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {formatRelative(u.created_at)}
                    </span>
                    {!u.is_active && (
                      <Badge tone="neutral" size="sm">
                        Inactive
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}

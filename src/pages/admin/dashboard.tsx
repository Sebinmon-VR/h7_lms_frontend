import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  GraduationCap,
  Inbox,
  Layers,
  Library,
  Link2,
  ShieldAlert,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { UserOut } from '@/api/types'
import type { AdmissionRequestStatus } from '@/api/admission-requests.types'
import type { AcademicYearOut, FeeAgeing } from '@/api/school.types'
import {
  useClasses,
  useEnrollments,
  useMappings,
  useMonitoringReport,
  useSubjects,
  useUsers,
} from '@/queries/admin.queries'
import { useAcademicYears } from '@/queries/admissions.queries'
import { useAdmissionRequestSummary } from '@/queries/admission-requests.queries'
import { useFeeCollectionsReport, useFeeRollReport } from '@/queries/finance.queries'
import { useAuth } from '@/providers/auth-provider'
import { useLiveBoard } from '@/queries/classes.queries'
import { useProgramSettings } from '@/queries/tuition.queries'
import { isTeachingRole } from '@/lib/constants'
import { cn } from '@/lib/cn'
import { provisioningAlerts } from '@/lib/derive'
import { formatDate, toApiDate } from '@/lib/datetime'
import { formatSchoolTime } from '@/lib/school-time'
import { formatNumber, greeting } from '@/lib/format'
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE, YEAR_STATUS_LABEL } from '@/lib/school'
import { subjectName } from '@/lib/select'
import { formatMoney } from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const QUICK_ACTIONS = [
  { to: '/admin/users', label: 'Add a user', icon: UserPlus },
  { to: '/admin/classes', label: 'Create a class', icon: Layers },
  { to: '/admin/mappings', label: 'Map a teacher', icon: Link2 },
  { to: '/admin/classes', label: 'Enroll students', icon: GraduationCap },
]

/*
 * The admin dashboard reads like an ERP workspace rather than a wall of
 * cards: sections are a heading over open content, figures sit in one divided
 * row, and lists of records are tables. These pieces live here rather than in
 * the shared HeroHeader / StatCard / ChartCard so the student and teacher
 * surfaces keep their own look.
 */

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

const KPI_TONE = {
  primary: 'text-primary bg-primary/10',
  accent: 'text-accent bg-accent/10',
  success: 'text-success bg-success/10',
  warning: 'text-warning bg-warning/15',
  danger: 'text-danger bg-danger/10',
  info: 'text-info bg-info/10',
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
    <div className="flex items-center gap-3 px-5 py-4">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', KPI_TONE[tone])}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold leading-none tabular-nums tracking-tight text-foreground">
          {formatNumber(value)}
        </p>
        <p className="mt-1.5 truncate text-xs font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

/** How far through the year today is, 0–100, from its own dates. */
function yearProgress(year: AcademicYearOut): number {
  const start = new Date(year.start_date).getTime()
  const end = new Date(year.end_date).getTime()
  if (!(end > start)) return 0
  return Math.min(100, Math.max(0, Math.round(((Date.now() - start) / (end - start)) * 100)))
}

/**
 * The academic year the school is in, at the top of the page. Everything the
 * office reads below (enrolments, fees, timetables) belongs to this year.
 */
function AcademicYearPanel() {
  const years = useAcademicYears()
  const year = React.useMemo(() => {
    const list = years.data ?? []
    return list.find((y) => y.is_current) ?? list.find((y) => y.status === 'ACTIVE') ?? null
  }, [years.data])

  const shell = 'lg:border-l lg:border-border lg:pl-6'
  const label = (
    <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-primary">
      <CalendarRange className="size-3.5" />
      Academic year
    </p>
  )

  if (years.isPending) return <Skeleton className="h-14 w-full rounded-md lg:w-72" />
  if (years.isError) return null

  if (!year) {
    return (
      <div className={cn(shell, 'lg:w-72')}>
        {label}
        <p className="mt-1 text-sm text-muted-foreground">No current academic year</p>
        <Link to="/admin/admissions" className="text-xs font-semibold text-primary hover:underline">
          Set one up
        </Link>
      </div>
    )
  }

  const term = year.terms.find((t) => t.is_current) ?? null
  const progress = yearProgress(year)
  const statusDot =
    year.status === 'ACTIVE' ? 'bg-success' : year.status === 'UPCOMING' ? 'bg-info' : 'bg-muted-foreground'

  return (
    <div className={cn(shell, 'flex items-center gap-4 lg:w-72')}>
      <ProgressRing value={progress} />
      <div className="relative min-w-0">
        {label}
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
          <Link to="/admin/admissions" className="text-lg font-bold leading-tight tracking-tight text-foreground hover:text-primary">
            {year.name}
          </Link>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <span className={cn('size-1.5 rounded-full', statusDot)} aria-hidden />
            {YEAR_STATUS_LABEL[year.status]}
            {term && <span className="text-muted-foreground/70">· {term.name}</span>}
          </span>
        </div>
        <p className="mt-0.5 text-2xs tabular-nums text-muted-foreground">
          {formatDate(year.start_date, 'd MMM yyyy')} – {formatDate(year.end_date, 'd MMM yyyy')}
        </p>
      </div>
    </div>
  )
}

/** A small ring showing how much of the year has gone, with the figure inside. */
function ProgressRing({ value }: { value: number }) {
  const r = 19
  const c = 2 * Math.PI * r
  return (
    <div className="relative size-12 shrink-0" title={`${value}% through the year`}>
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
        {value}%
      </span>
    </div>
  )
}

/** One figure in the live summary line: a value and what it counts. */
function LiveFact({ value, label, tone }: { value: React.ReactNode; label: string; tone?: 'warning' }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap text-xs text-muted-foreground">
      <span className={cn('text-sm font-semibold tabular-nums', tone === 'warning' ? 'text-warning' : 'text-foreground')}>
        {value}
      </span>
      {label}
    </span>
  )
}

/**
 * What is in session right now, as one line. The class-by-class list, with
 * its Join buttons, is the Live classes board; the dashboard only says how
 * the day is going and links there. Polled with the live board.
 */
function LiveNowStrip() {
  const board = useLiveBoard()
  const rows = board.data ?? []
  const live = rows.filter((r) => r.is_live)
  const upcoming = rows
    .filter((r) => !r.is_live && r.next_period)
    .sort((a, b) => (a.next_period?.starts_at ?? '').localeCompare(b.next_period?.starts_at ?? ''))
  const studentsIn = live.reduce((n, r) => n + r.students_in_now.length, 0)
  const enrolled = live.reduce((n, r) => n + r.enrolled_count, 0)
  const teachersIn = live.filter((r) => r.teachers_in_now.length > 0 || r.teacher_present).length
  const nextUp = upcoming[0]?.next_period ?? null

  if (board.isPending) return <Skeleton className="h-11 rounded-lg" />
  // The board page reports its own failure; the dashboard stays quiet about it.
  if (board.isError) return null

  const isLive = live.length > 0

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg px-4 py-2.5 ring-1',
        isLive ? 'bg-success/5 ring-success/25' : 'bg-muted/40 ring-border',
      )}
    >
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="relative flex size-2">
          {isLive && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />}
          <span className={cn('relative inline-flex size-2 rounded-full', isLive ? 'bg-success' : 'bg-muted-foreground/50')} />
        </span>
        Live now
      </span>

      {isLive ? (
        <>
          <Badge tone="success" size="sm">
            {live.length} in session
          </Badge>
          <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
          <LiveFact value={`${studentsIn} / ${enrolled}`} label="students in" />
          <LiveFact
            value={`${teachersIn} / ${live.length}`}
            label="teachers in"
            tone={teachersIn < live.length ? 'warning' : undefined}
          />
        </>
      ) : (
        <span className="text-xs text-muted-foreground">
          {nextUp ? (
            <>
              No class in session · Next:{' '}
              <span className="font-medium text-foreground">
                {upcoming[0].class_name} · {subjectName(nextUp.entry)}
              </span>{' '}
              at {formatSchoolTime(nextUp.starts_at)}
              {upcoming.length > 1
                ? `, then ${upcoming.length - 1} more ${upcoming.length - 1 === 1 ? 'class' : 'classes'} today`
                : ''}
            </>
          ) : (
            'No class in session · Nothing more on the timetable today.'
          )}
        </span>
      )}

      <span className="ml-auto">
        <SectionLink to="/admin/live-classes">Live classes board</SectionLink>
      </span>
    </div>
  )
}

/** Outstanding money by how late it is, earliest first. */
const AGEING: { key: keyof FeeAgeing; label: string; bar: string }[] = [
  { key: 'not_due', label: 'Not yet due', bar: 'bg-info' },
  { key: 'd0_30', label: '1–30 days', bar: 'bg-warning/60' },
  { key: 'd31_60', label: '31–60 days', bar: 'bg-warning' },
  { key: 'd61_90', label: '61–90 days', bar: 'bg-danger/70' },
  { key: 'over_90', label: '90+ days', bar: 'bg-danger' },
]

function MoneyFigure({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone: 'success' | 'danger' | 'primary' | 'foreground'
}) {
  const color = { success: 'text-success', danger: 'text-danger', primary: 'text-primary', foreground: 'text-foreground' }[tone]
  return (
    <div className="min-w-0 px-4 py-3 first:pl-0">
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 truncate text-xl font-semibold tabular-nums tracking-tight', color)}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-2xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * Where the year's fees stand: what came in, what is still owed and how late
 * it is, plus this month's takings. The same figures as the Fees reports, so
 * the dashboard and the office never disagree.
 */
function FeesOverview({ className }: { className?: string }) {
  const roll = useFeeRollReport()
  const today = new Date()
  const month = useFeeCollectionsReport({
    fromDate: toApiDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    toDate: toApiDate(today),
  })

  const s = roll.data?.summary
  const currency = roll.data?.currency ?? s?.currency
  const money = (n: number | null | undefined) => formatMoney(n ?? 0, currency)
  const billed = s?.total_billed ?? 0
  const collectedShare = billed > 0 ? Math.round(((s?.total_collected ?? 0) / billed) * 100) : 0
  const ageingTotal = s ? AGEING.reduce((n, a) => n + (s.ageing[a.key] ?? 0), 0) : 0

  return (
    <Section
      className={className}
      title="Fees"
      icon={Wallet}
      iconClassName="text-success"
      description={
        roll.data
          ? `${roll.data.academic_year_name ?? 'This academic year'} · as of ${formatDate(roll.data.as_of)}`
          : 'This academic year'
      }
      actions={<SectionLink to="/admin/finance">Fees & invoices</SectionLink>}
    >
      {roll.isPending ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : roll.isError || !s ? (
        <p className="border-y border-border py-6 text-center text-sm text-muted-foreground">
          Fee figures are not available yet.{' '}
          <Link to="/admin/finance" className="font-medium text-primary hover:underline">
            Set up fees
          </Link>
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 divide-border border-y border-border sm:grid-cols-4 sm:divide-x">
            <MoneyFigure label="Collected" value={money(s.total_collected)} hint={`of ${money(billed)} billed`} tone="success" />
            <MoneyFigure
              label="Outstanding"
              value={money(s.total_outstanding)}
              hint={`${formatNumber((s.by_status.ISSUED ?? 0) + s.partially_paid + s.overdue)} students owe`}
              tone="foreground"
            />
            <MoneyFigure
              label="Overdue"
              value={money(s.total_overdue)}
              hint={`${formatNumber(s.overdue)} students overdue`}
              tone="danger"
            />
            <MoneyFigure
              label="This month"
              value={month.data ? formatMoney(month.data.summary.total, month.data.currency) : '—'}
              hint={month.data ? `${formatNumber(month.data.summary.count)} payments` : undefined}
              tone="primary"
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-foreground">Collection progress</span>
              <span className="tabular-nums text-muted-foreground">{collectedShare}% collected</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-success/80 to-success"
                style={{ width: `${collectedShare}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-foreground">Outstanding by age</span>
              {s.not_billed > 0 && (
                <Link to="/admin/finance" className="text-muted-foreground hover:text-primary">
                  {formatNumber(s.not_billed)} students not billed yet
                </Link>
              )}
            </div>
            {ageingTotal > 0 ? (
              <>
                <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-muted">
                  {AGEING.map((a) => {
                    const v = s.ageing[a.key] ?? 0
                    return v > 0 ? (
                      <div key={a.key} className={a.bar} style={{ width: `${(v / ageingTotal) * 100}%` }} title={`${a.label}: ${money(v)}`} />
                    ) : null
                  })}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {AGEING.map((a) => (
                    <span key={a.key} className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
                      <span className={cn('size-2 rounded-sm', a.bar)} aria-hidden />
                      {a.label}
                      <span className="font-medium tabular-nums text-foreground">{money(s.ageing[a.key])}</span>
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Nothing outstanding.</p>
            )}
          </div>
        </div>
      )}
    </Section>
  )
}

const TONE_DOT: Record<string, string> = {
  primary: 'bg-primary',
  info: 'bg-info',
  warning: 'bg-warning',
  accent: 'bg-accent',
  success: 'bg-success',
  danger: 'bg-danger',
  neutral: 'bg-muted-foreground/50',
}

/** Enquiries still in play, by the step they are at. */
function AdmissionsOverview({ className }: { className?: string }) {
  const summary = useAdmissionRequestSummary()
  const data = summary.data
  const open = (Object.keys(REQUEST_STATUS_LABEL) as AdmissionRequestStatus[])
    .filter((k) => k !== 'ADMITTED' && k !== 'REJECTED')
    .map((k) => ({ key: k, count: data?.by_status[k] ?? 0 }))
    .filter((r) => r.count > 0)

  return (
    <Section
      className={className}
      title="Enquiries"
      icon={Inbox}
      iconClassName="text-primary"
      description="Admission enquiries still in progress"
      actions={<SectionLink to="/admin/admission-requests">Open</SectionLink>}
    >
      {summary.isPending ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : summary.isError || !data ? (
        <p className="border-y border-border py-6 text-center text-sm text-muted-foreground">
          Admission requests are not available right now.
        </p>
      ) : (
        <div>
          <div className="flex items-end justify-between border-y border-border py-3">
            <div>
              <p className="text-3xl font-semibold leading-none tabular-nums text-foreground">{formatNumber(data.open)}</p>
              <p className="mt-1 text-xs text-muted-foreground">open requests</p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>
                <span className="font-semibold tabular-nums text-success">{formatNumber(data.by_status.ADMITTED ?? 0)}</span>{' '}
                admitted
              </p>
              <p>
                <span className="font-semibold tabular-nums text-foreground">{formatNumber(data.total)}</span> received
              </p>
            </div>
          </div>
          {open.length > 0 ? (
            <ul className="divide-y divide-border">
              {open.map((r) => (
                <li key={r.key}>
                  <Link
                    to="/admin/admission-requests"
                    className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:text-primary"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className={cn('size-2 rounded-full', TONE_DOT[REQUEST_STATUS_TONE[r.key]])} aria-hidden />
                      {REQUEST_STATUS_LABEL[r.key]}
                    </span>
                    <span className="font-semibold tabular-nums">{formatNumber(r.count)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">Nothing waiting. Every request has been settled.</p>
          )}
        </div>
      )}
    </Section>
  )
}

export default function AdminDashboardPage() {
  const { user } = useAuth()
  const userName = user?.full_name?.trim()
  const schoolName = useProgramSettings('LMS').data?.school_name?.trim()

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

  const alertGroups: { label: string; items: (UserOut | { id: number; name: string })[]; to: string; cta: string }[] = [
    {
      label: 'Students with no class',
      items: alerts.studentsWithoutEnrollment,
      to: '/admin/classes',
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
    <div className="space-y-8">
      {/* ----------------------------------------------------------- header */}
      <header>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-wider text-primary">Administration</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              {greeting()}
              {userName && (
                <>
                  , <span className="text-primary">{userName}</span>
                </>
              )}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-foreground/70">
              {schoolName && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="size-3.5 text-primary" />
                  {schoolName}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-primary" />
                {formatDate(new Date(), 'EEEE, d MMMM yyyy')}
              </span>
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Everything happening across your institution, and anything that needs setting up.
            </p>
          </div>
          <div className="lg:self-center">
            <AcademicYearPanel />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-border py-2.5">
          <nav className="flex flex-wrap items-center gap-1">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-primary/10 hover:text-primary"
              >
                <action.icon className="size-4 text-primary" />
                {action.label}
              </Link>
            ))}
          </nav>
          <Button asChild variant="solid" size="sm">
            <Link to="/admin/reports">
              View full report
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </header>

      {/* ------------------------------------------------------------ tiles */}
      {reportQuery.isPending && !usersQuery.data ? (
        <Skeleton className="h-[72px] rounded-lg" />
      ) : (
        <div className="grid grid-cols-2 divide-border border-y border-border sm:grid-cols-3 xl:grid-cols-6 xl:divide-x [&>*:first-child]:pl-0">
          {tiles.map((tile) => (
            <Kpi key={tile.label} label={tile.label} value={tile.value} icon={tile.icon} tone={tile.tone} />
          ))}
        </div>
      )}

      <LiveNowStrip />

      {/* ----------------------------------------------------------- alerts */}
      {activeAlerts.length > 0 && (
        <Section
          title="Needs your attention"
          icon={ShieldAlert}
          iconClassName="text-warning"
          meta={
            <Badge tone="warning" size="sm">
              {activeAlerts.length}
            </Badge>
          }
        >
          <ul className="divide-y divide-border border-y border-border">
            {activeAlerts.map((group) => (
              <li key={group.label} className="flex items-center gap-4 px-3 py-3 transition-colors hover:bg-muted/50">
                <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 px-2 text-sm font-semibold tabular-nums text-warning">
                  {group.items.length}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{group.label}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {group.items
                      .slice(0, 3)
                      .map((i) => ('full_name' in i ? i.full_name : i.name))
                      .join(', ')}
                    {group.items.length > 3 && ` +${group.items.length - 3} more`}
                  </p>
                </div>
                <SectionLink to={group.to}>{group.cta}</SectionLink>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ------------------------------------------------- fees + admissions */}
      <div className="grid gap-8 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-border">
        <FeesOverview className="lg:col-span-2 lg:pr-8" />
        <AdmissionsOverview className="lg:pl-8" />
      </div>
    </div>
  )
}

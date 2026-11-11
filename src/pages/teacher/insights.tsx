import { ArrowUpDown, Download, LineChart, UserRoundCog } from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

import type { AttendanceOut, ExamGradeOut, TopicOut } from '@/api/types'
import {
  useMyClasses,
  useMyLedClasses,
  useTeacherAttendance,
  useTeacherGrades,
  useTeacherTopics,
} from '@/queries/teacher.queries'
import { AT_RISK_ATTENDANCE, AT_RISK_GRADE } from '@/lib/constants'
import { cn } from '@/lib/cn'
import { exportCsv } from '@/lib/csv'
import { formatDate, parseApiDate, shiftApiDate, todayApiDate } from '@/lib/datetime'
import { subjectName } from '@/lib/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ListSearch } from '@/components/layout/split-view'
import { WorkspaceHeader } from '@/components/layout/workspace'
import { AdminTeacherNotice, useIsAdminViewingTeacher } from './teacher-guard'

/*
 * Insights, flat: a class filter and a date range, one line of figures, a
 * day-by-day attendance strip, a table per class and subject, the spread of
 * marks, and one student table with those needing attention first. Drawn with
 * plain bars rather than charts, so it reads the same with a week of records
 * as with a term's. Attendance counts records marked Present, and a mark's
 * percentage uses its exam's own maximum: the office report's formulas, so the
 * two agree.
 */

const RANGES = [
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
] as const
type RangeKey = (typeof RANGES)[number]['key']

const TH = 'whitespace-nowrap border-b border-border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'
const TD = 'px-3 py-2.5 align-middle'

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null)
const gradePct = (g: ExamGradeOut) => (g.max_marks > 0 ? (g.marks_obtained / g.max_marks) * 100 : null)
const presentRate = (rows: AttendanceOut[]) => pct(rows.filter((r) => r.status === 'PRESENT').length, rows.length)
const avg = (values: (number | null)[]) => {
  const v = values.filter((x): x is number => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

function toneFor(value: number | null, warnBelow: number, dangerBelow: number): string {
  if (value == null) return 'text-muted-foreground'
  if (value < dangerBelow) return 'font-semibold text-danger'
  if (value < warnBelow) return 'font-semibold text-warning'
  return 'text-foreground'
}
function barFor(value: number | null, warnBelow: number, dangerBelow: number): string {
  if (value == null) return 'bg-muted'
  if (value < dangerBelow) return 'bg-danger'
  if (value < warnBelow) return 'bg-warning'
  return 'bg-success'
}
const fmt = (v: number | null, digits = 0) => (v == null ? '—' : `${v.toFixed(digits)}%`)

/** A percentage with a short bar behind it. */
function RateCell({ value, warn, danger }: { value: number | null; warn: number; danger: number }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block">
        <span className={cn('block h-full rounded-full', barFor(value, warn, danger))} style={{ width: `${value ?? 0}%` }} />
      </span>
      <span className={cn('w-11 text-right tabular-nums', toneFor(value, warn, danger))}>{fmt(value)}</span>
    </span>
  )
}

function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="min-w-0 py-3 pr-4 lg:px-5 lg:first:pl-0">
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold leading-none tabular-nums tracking-tight', tone ?? 'text-foreground')}>{value}</p>
      {hint && <p className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SectionTitle({ children, sub, action }: { children: React.ReactNode; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{children}</h2>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

/** A rate's height on the strip, which runs from 50% at the foot to 100% at the top. */
const scaled = (rate: number) => Math.min(Math.max(((rate - 50) / 50) * 100, 0), 100)

/** Attendance for each recorded school day, as a strip of bars. */
function DayStrip({ records }: { records: AttendanceOut[] }) {
  const days = React.useMemo(() => {
    const by = new Map<string, AttendanceOut[]>()
    for (const r of records) by.set(r.date, [...(by.get(r.date) ?? []), r])
    return [...by.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-45)
      .map(([date, rows]) => ({
        date,
        rate: presentRate(rows) ?? 0,
        absent: rows.filter((r) => r.status === 'ABSENT').length,
        total: rows.length,
      }))
  }, [records])

  if (days.length === 0) return <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">No attendance recorded in this range.</p>
  const worst = days.reduce((w, d) => (d.rate < w.rate ? d : w), days[0])

  return (
    <div>
      <div className="relative ml-9 flex h-36 items-end gap-1 border-b border-border">
        {/* The scale: 50% at the foot, 100% at the top, the 75% line where a day starts to look bad. */}
        <span className="absolute -left-9 top-0 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground">100%</span>
        <span className="absolute -left-9 bottom-0 translate-y-1/2 text-[10px] tabular-nums text-muted-foreground">50%</span>
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
        <div className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-warning/70" style={{ bottom: `${scaled(AT_RISK_ATTENDANCE)}%` }}>
          <span className="absolute -left-9 -translate-y-1/2 text-[10px] tabular-nums text-warning">{AT_RISK_ATTENDANCE}%</span>
        </div>
        {days.map((d) => (
          <div
            key={d.date}
            className="group relative flex h-full min-w-0 flex-1 items-end"
            title={`${formatDate(parseApiDate(d.date), 'EEE d MMM')}: ${d.rate.toFixed(0)}% present · ${d.absent} absent of ${d.total}`}
          >
            <div
              className={cn('w-full rounded-t-sm opacity-80 group-hover:opacity-100', barFor(d.rate, AT_RISK_ATTENDANCE, 60))}
              style={{ height: `${Math.max(scaled(d.rate), 2)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="ml-9 mt-1.5 flex justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>{formatDate(parseApiDate(days[0].date), 'd MMM')}</span>
        <span>
          Lowest: <strong className="font-semibold text-foreground">{formatDate(parseApiDate(worst.date), 'EEE d MMM')}</strong> ·{' '}
          {worst.rate.toFixed(0)}% ({worst.absent} absent)
        </span>
        <span>{formatDate(parseApiDate(days[days.length - 1].date), 'd MMM')}</span>
      </div>
    </div>
  )
}

const BANDS = [
  { label: '90–100%', from: 90, to: 101, bar: 'bg-success' },
  { label: '75–89%', from: 75, to: 90, bar: 'bg-success/70' },
  { label: '60–74%', from: 60, to: 75, bar: 'bg-info' },
  { label: '40–59%', from: 40, to: 60, bar: 'bg-warning' },
  { label: 'Below 40%', from: 0, to: 40, bar: 'bg-danger' },
]

/** How the marks spread across bands. */
function MarksSpread({ grades }: { grades: ExamGradeOut[] }) {
  const counts = BANDS.map((b) => ({
    ...b,
    count: grades.filter((g) => {
      const p = gradePct(g)
      return p != null && p >= b.from && p < b.to
    }).length,
  }))
  const max = Math.max(1, ...counts.map((c) => c.count))
  if (grades.length === 0) return <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">No marks recorded in this range.</p>
  return (
    <ul className="space-y-2.5 border-y border-border py-3">
      {counts.map((b) => (
        <li key={b.label} className="flex items-center gap-3 text-sm">
          <span className="w-20 shrink-0 text-xs text-muted-foreground">{b.label}</span>
          <span className="h-3 flex-1 overflow-hidden rounded-sm bg-muted/60">
            <span className={cn('block h-full rounded-sm', b.bar)} style={{ width: `${(b.count / max) * 100}%` }} />
          </span>
          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-foreground">
            {b.count} <span className="text-muted-foreground">({Math.round((b.count / grades.length) * 100)}%)</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

type StudentRow = {
  id: number
  name: string
  cls: string
  rate: number | null
  absent: number
  late: number
  records: number
  marks: number | null
  exams: number
  reasons: string[]
}

type SortKey = 'attention' | 'name' | 'rate' | 'marks'

export default function TeacherInsightsPage() {
  const isAdmin = useIsAdminViewingTeacher()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = React.useState('')
  const [sort, setSort] = React.useState<SortKey>('attention')
  const [showAll, setShowAll] = React.useState(false)

  const mappingsQuery = useMyClasses(!isAdmin)
  const ledQuery = useMyLedClasses(!isAdmin)
  const attendanceQuery = useTeacherAttendance(!isAdmin)
  const gradesQuery = useTeacherGrades(!isAdmin)
  const topicsQuery = useTeacherTopics(!isAdmin)

  const led = React.useMemo(() => ledQuery.data ?? [], [ledQuery.data])
  const mappings = React.useMemo(() => mappingsQuery.data ?? [], [mappingsQuery.data])

  // Class tabs: every class they teach or lead.
  const classes = React.useMemo(() => {
    const seen = new Map<number, string>()
    for (const m of led) seen.set(m.class_room.id, m.class_room.name)
    for (const m of mappings) seen.set(m.class_room.id, m.class_room.name)
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [led, mappings])

  const classParam = Number(params.get('class'))
  const classId = classes.some((c) => c.id === classParam) ? classParam : null
  const range: RangeKey = RANGES.some((r) => r.key === params.get('range')) ? (params.get('range') as RangeKey) : '30'
  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (value == null) p.delete(key)
        else p.set(key, value)
        return p
      },
      { replace: true },
    )

  const today = todayApiDate()
  const days = RANGES.find((r) => r.key === range)?.days ?? null
  const since = days ? shiftApiDate(today, -days) : null
  const inScope = React.useCallback(
    (cid: number | null, date: string | null) => (classId == null || cid === classId) && (!since || !date || date >= since),
    [classId, since],
  )

  const attendance = React.useMemo(
    () => (attendanceQuery.data ?? []).filter((a) => inScope(a.class_id, a.date)),
    [attendanceQuery.data, inScope],
  )
  const grades = React.useMemo(
    // Every recorded exam, whatever the range: marks are entered once per exam, and a
    // window would hide a whole term's tests the moment the last one is a month old.
    () => (gradesQuery.data ?? []).filter((g) => g.class_id != null && inScope(g.class_id, null)),
    [gradesQuery.data, inScope],
  )
  const topics = React.useMemo<TopicOut[]>(
    () => (topicsQuery.data ?? []).filter((t) => inScope(t.class_id, t.date_covered)),
    [topicsQuery.data, inScope],
  )

  /** One row per class and subject: attendance, marks and syllabus together. */
  const perSubject = React.useMemo(() => {
    const map = new Map<string, { cls: string; subject: string; att: AttendanceOut[]; marks: ExamGradeOut[]; topics: TopicOut[] }>()
    const ensure = (cid: number, sid: number, cls: string, subject: string) => {
      const key = `${cid}|${sid}`
      if (!map.has(key)) map.set(key, { cls, subject, att: [], marks: [], topics: [] })
      return map.get(key)!
    }
    for (const m of mappings) if (inScope(m.class_room.id, null)) ensure(m.class_room.id, m.subject.id, m.class_room.name, m.subject.name)
    for (const a of attendance) ensure(a.class_id, a.subject_id, a.class_room?.name ?? `Class ${a.class_id}`, subjectName(a)).att.push(a)
    for (const g of grades) ensure(g.class_id as number, g.subject_id, g.class_room?.name ?? `Class ${g.class_id}`, subjectName(g)).marks.push(g)
    for (const t of topics) ensure(t.class_id, t.subject_id, t.class_room?.name ?? `Class ${t.class_id}`, subjectName(t)).topics.push(t)
    return [...map.values()]
      .map((r) => ({
        ...r,
        rate: presentRate(r.att),
        marksAvg: avg(r.marks.map(gradePct)),
        completion: avg(r.topics.map((t) => t.completion_percentage ?? 0)),
        lastTopic: r.topics.map((t) => t.date_covered).sort((a, b) => b.localeCompare(a))[0] ?? null,
      }))
      .sort((a, b) => a.cls.localeCompare(b.cls, undefined, { numeric: true }) || a.subject.localeCompare(b.subject))
  }, [mappings, attendance, grades, topics, inScope])

  const students = React.useMemo<StudentRow[]>(() => {
    const map = new Map<number, { name: string; cls: string; att: AttendanceOut[]; marks: ExamGradeOut[] }>()
    for (const a of attendance) {
      const row = map.get(a.student_id) ?? { name: a.student?.full_name ?? `Student ${a.student_id}`, cls: a.class_room?.name ?? '', att: [], marks: [] }
      row.att.push(a)
      map.set(a.student_id, row)
    }
    for (const g of grades) {
      const row = map.get(g.student_id) ?? { name: g.student?.full_name ?? `Student ${g.student_id}`, cls: g.class_room?.name ?? '', att: [], marks: [] }
      row.marks.push(g)
      map.set(g.student_id, row)
    }
    return [...map.entries()].map(([id, r]) => {
      const rate = presentRate(r.att)
      const marks = avg(r.marks.map(gradePct))
      const reasons: string[] = []
      if (rate != null && r.att.length >= 3 && rate < AT_RISK_ATTENDANCE) reasons.push('Low attendance')
      if (marks != null && marks < AT_RISK_GRADE) reasons.push('Low marks')
      return {
        id,
        name: r.name,
        cls: r.cls,
        rate,
        absent: r.att.filter((a) => a.status === 'ABSENT').length,
        late: r.att.filter((a) => a.status === 'LATE').length,
        records: r.att.length,
        marks,
        exams: r.marks.length,
        reasons,
      }
    })
  }, [attendance, grades])

  if (isAdmin) {
    return (
      <>
        <WorkspaceHeader title="Insights" description="How your classes are doing." />
        <div className="pt-6">
          <AdminTeacherNotice />
        </div>
      </>
    )
  }

  const loading = attendanceQuery.isPending || gradesQuery.isPending || mappingsQuery.isPending
  const failed = attendanceQuery.isError || gradesQuery.isError
  const overallRate = presentRate(attendance)
  const overallMarks = avg(grades.map(gradePct))
  const attention = students.filter((s) => s.reasons.length > 0)
  const topicCompletion = avg(topics.map((t) => t.completion_percentage ?? 0))

  const q = search.trim().toLowerCase()
  const sorted = [...students]
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.cls.toLowerCase().includes(q))
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'rate') return (a.rate ?? 101) - (b.rate ?? 101)
      if (sort === 'marks') return (a.marks ?? 101) - (b.marks ?? 101)
      return b.reasons.length - a.reasons.length || (a.rate ?? 101) - (b.rate ?? 101)
    })
  const visibleStudents = showAll || q ? sorted : sorted.slice(0, 15)
  const sortButton = (key: SortKey, label: string, right = false) => (
    <button
      type="button"
      onClick={() => setSort(key)}
      className={cn('inline-flex items-center gap-1 uppercase', right && 'justify-end', sort === key ? 'text-foreground' : 'hover:text-foreground')}
    >
      {label}
      <ArrowUpDown className="size-3" />
    </button>
  )
  const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? ''

  return (
    <>
      <WorkspaceHeader
        title="Insights"
        description="How your classes are doing: attendance, marks and syllabus, and who needs a closer look."
        actions={
          <div className="flex rounded-md border border-border p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setParam('range', r.key === '30' ? null : r.key)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium',
                  range === r.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
        tabs={
          classes.length > 1 ? (
            <nav className="-mb-px flex gap-5 overflow-x-auto" role="tablist">
              {[{ id: null as number | null, name: 'All classes' }, ...classes].map((c) => {
                const on = classId === c.id
                return (
                  <button
                    key={c.id ?? 'all'}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setParam('class', c.id == null ? null : String(c.id))}
                    className={cn(
                      'whitespace-nowrap border-b-2 pb-2.5 text-sm font-medium transition-colors',
                      on ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {c.name}
                    {led.some((m) => m.class_room.id === c.id) && <UserRoundCog className="ml-1 inline size-3.5 text-warning" />}
                  </button>
                )
              })}
            </nav>
          ) : undefined
        }
      />

      <div className="space-y-8 pt-6">
        {/* The scope, said once: for a class they lead, these are every teacher's records. */}
        {led.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserRoundCog className="size-3.5 text-warning" />
            For {led.map((m) => m.class_room.name).join(', ')}, which you lead, the figures include every teacher's records, not only your own periods.
          </p>
        )}

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 rounded" />
            <Skeleton className="h-40 rounded" />
            <Skeleton className="h-64 rounded" />
          </div>
        ) : failed ? (
          <p className="border-y border-border py-10 text-center text-sm text-muted-foreground">
            The records could not be loaded. Reload the page to try again.
          </p>
        ) : attendance.length === 0 && grades.length === 0 ? (
          <div className="border-y border-border py-12 text-center">
            <LineChart className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">Nothing to show for {rangeLabel.toLowerCase()} yet</p>
            <p className="text-sm text-muted-foreground">Take registers and record exam marks, and this page fills in.</p>
          </div>
        ) : (
          <>
            {/* ---------------------------------------------------- figures */}
            <div className="grid grid-cols-2 divide-border border-y border-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
              <Figure label="Attendance" value={fmt(overallRate, 1)} hint={`${attendance.length} register marks`} tone={toneFor(overallRate, AT_RISK_ATTENDANCE, 60)} />
              <Figure label="Average marks" value={fmt(overallMarks, 1)} hint={`${grades.length} marks · all exams`} tone={toneFor(overallMarks, 60, AT_RISK_GRADE)} />
              <Figure label="Students" value={String(students.length)} hint={classId ? classes.find((c) => c.id === classId)?.name : `${classes.length} classes`} />
              <Figure label="Need a closer look" value={String(attention.length)} hint={`Under ${AT_RISK_ATTENDANCE}% or ${AT_RISK_GRADE}% marks`} tone={attention.length ? 'text-warning' : undefined} />
              <Figure label="Syllabus covered" value={fmt(topicCompletion)} hint={`${topics.length} topics logged`} />
            </div>

            {/* ------------------------------------------------ attendance */}
            <section>
              <SectionTitle sub={`Share of students marked present each school day · ${rangeLabel.toLowerCase()}. Hover a day for its figures.`}>
                Attendance, day by day
              </SectionTitle>
              <DayStrip records={attendance} />
            </section>

            {/* ----------------------------------- per subject + marks spread */}
            <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <section className="min-w-0">
                <SectionTitle sub="Attendance, marks and syllabus for each class and subject.">By class and subject</SectionTitle>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead>
                      <tr>
                        <th className={TH}>Class</th>
                        <th className={TH}>Subject</th>
                        <th className={cn(TH, 'text-right')}>Attendance</th>
                        <th className={cn(TH, 'text-right')}>Marks</th>
                        <th className={cn(TH, 'text-right')}>Syllabus</th>
                        <th className={cn(TH, 'text-right')}>Last topic</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border border-b border-border">
                      {perSubject.map((r) => (
                        <tr key={`${r.cls}-${r.subject}`}>
                          <td className={cn(TD, 'whitespace-nowrap font-semibold text-foreground')}>{r.cls}</td>
                          <td className={cn(TD, 'text-muted-foreground')}>{r.subject}</td>
                          <td className={cn(TD, 'text-right')}>
                            <RateCell value={r.rate} warn={AT_RISK_ATTENDANCE} danger={60} />
                          </td>
                          <td className={cn(TD, 'text-right')}>
                            <RateCell value={r.marksAvg} warn={60} danger={AT_RISK_GRADE} />
                          </td>
                          <td className={cn(TD, 'text-right tabular-nums text-muted-foreground')}>
                            {r.completion == null ? '—' : `${Math.round(r.completion)}%`}
                            <span className="ml-1 text-xs">({r.topics.length})</span>
                          </td>
                          <td className={cn(TD, 'whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground')}>
                            {r.lastTopic ? formatDate(parseApiDate(r.lastTopic), 'd MMM') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="min-w-0">
                <SectionTitle sub={`All ${grades.length} recorded marks, as a share of each exam's maximum.`}>Marks spread</SectionTitle>
                <MarksSpread grades={grades} />
              </section>
            </div>

            {/* -------------------------------------------------- students */}
            <section>
              <SectionTitle
                sub={
                  attention.length
                    ? `${attention.length} need a closer look: under ${AT_RISK_ATTENDANCE}% attendance or ${AT_RISK_GRADE}% average marks. They are listed first.`
                    : 'Nobody is under the attendance or marks thresholds.'
                }
                action={
                  <div className="flex items-center gap-2">
                    <div className="w-56">
                      <ListSearch value={search} onChange={setSearch} placeholder="Search students" />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        exportCsv('student-insights', sorted, [
                          { header: 'Student', value: (s) => s.name },
                          { header: 'Class', value: (s) => s.cls },
                          { header: 'Attendance %', value: (s) => (s.rate == null ? '' : s.rate.toFixed(1)) },
                          { header: 'Absent', value: (s) => s.absent },
                          { header: 'Late', value: (s) => s.late },
                          { header: 'Register marks', value: (s) => s.records },
                          { header: 'Average marks %', value: (s) => (s.marks == null ? '' : s.marks.toFixed(1)) },
                          { header: 'Exams', value: (s) => s.exams },
                          { header: 'Flags', value: (s) => s.reasons.join('; ') },
                        ])
                      }
                    >
                      <Download />
                      CSV
                    </Button>
                  </div>
                }
              >
                Students
              </SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr>
                      <th className={TH}>{sortButton('name', 'Student')}</th>
                      <th className={TH}>Class</th>
                      <th className={cn(TH, 'text-right')}>{sortButton('rate', 'Attendance', true)}</th>
                      <th className={cn(TH, 'text-right')}>Absent</th>
                      <th className={cn(TH, 'text-right')}>{sortButton('marks', 'Marks', true)}</th>
                      <th className={TH}>{sortButton('attention', 'Flag')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border border-b border-border">
                    {visibleStudents.map((s) => (
                      <tr key={s.id} className={s.reasons.length ? 'bg-warning/[0.04]' : undefined}>
                        <td className={cn(TD, 'font-medium text-foreground')}>{s.name}</td>
                        <td className={cn(TD, 'whitespace-nowrap text-muted-foreground')}>{s.cls}</td>
                        <td className={cn(TD, 'text-right')}>
                          <RateCell value={s.rate} warn={AT_RISK_ATTENDANCE} danger={60} />
                        </td>
                        <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums text-muted-foreground')}>
                          {s.records ? (
                            <>
                              {s.absent}
                              <span className="text-xs"> of {s.records}</span>
                              {s.late > 0 && <span className="text-xs text-warning"> · {s.late} late</span>}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className={cn(TD, 'text-right')}>
                          <RateCell value={s.marks} warn={60} danger={AT_RISK_GRADE} />
                        </td>
                        <td className={cn(TD, 'whitespace-nowrap text-xs font-semibold')}>
                          {s.reasons.length ? <span className="text-warning">{s.reasons.join(' · ')}</span> : <span className="text-muted-foreground/60">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!showAll && !q && sorted.length > 15 && (
                <button type="button" onClick={() => setShowAll(true)} className="mt-2 text-sm font-medium text-primary hover:underline">
                  Show all {sorted.length} students
                </button>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">
                Attendance counts register marks of Present; a mark's percentage uses that exam's own maximum. These are the
                office report's formulas, so the two always agree.
              </p>
            </section>
          </>
        )}
      </div>
    </>
  )
}

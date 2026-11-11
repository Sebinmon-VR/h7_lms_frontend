import { CalendarCheck, ChevronDown, ClipboardList, FileText, Phone } from 'lucide-react'
import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import type { AttendanceOut, ExamGradeOut, TeacherMappingOut, UserOut } from '@/api/types'
import {
  useClassRosters,
  useMyClasses,
  useMyLedClasses,
  useTeacherAttendance,
  useTeacherGrades,
  useTeacherMaterials,
  useTeacherMeetings,
  useTeacherTopics,
} from '@/queries/teacher.queries'
import { cn } from '@/lib/cn'
import { formatDate, parseApiDate, todayApiDate } from '@/lib/datetime'
import { useAuth } from '@/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Band, WorkspaceHeader } from '@/components/layout/workspace'
import {
  DETAIL_TH,
  DetailHeader,
  DetailSection,
  Fact,
  Facts,
  ListEmpty,
  ListItem,
  ListPane,
  ListSearch,
  SplitView,
} from '@/components/layout/split-view'
import { AdminTeacherNotice, useIsAdminViewingTeacher } from './teacher-guard'

/*
 * List + detail, like the office's Reports pages: the teacher's classes on
 * the left, and the picked class on the right with its subjects and its
 * students. Every figure is joined client-side from lists already in cache.
 */

/** Days without a logged topic before a class and subject is flagged. */
const SYLLABUS_STALE_DAYS = 7
/** Below this share of present marks attendance shows in orange; below 60 in red. */
const LOW_ATTENDANCE = 75

const pairKey = (classId: number, subjectId: number) => `${classId}|${subjectId}`
const GENDER_LABEL: Record<string, string> = { MALE: 'Boy', FEMALE: 'Girl', OTHER: 'Other' }

const TH = cn(DETAIL_TH, 'whitespace-nowrap px-2 py-2 font-semibold first:pl-5 last:pr-5')
const TD = 'px-2 py-2.5 align-middle first:pl-5 last:pr-5'

type ClassEntry = {
  id: number
  name: string
  code: string | null
  leads: boolean
  subjects: TeacherMappingOut[]
}

type SubjectStats = { topics: number; lastTopic: string | null; materials: number; meetings: number; marks: number; present: number }

type StudentLine = {
  student: UserOut
  marks: number
  present: number
  absent: number
  late: number
  absentToday: boolean
  lastAbsent: string | null
  gradeAvg: number | null
  gradeCount: number
}

function daysAgo(date: string | null): number | null {
  const d = parseApiDate(date)
  const today = parseApiDate(todayApiDate())
  return d && today ? Math.round((today.getTime() - d.getTime()) / 86_400_000) : null
}

function lastTopicText(days: number | null): string {
  if (days == null) return 'Nothing yet'
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

function rateTone(rate: number | null): string {
  if (rate == null) return 'text-muted-foreground'
  if (rate < 60) return 'font-semibold text-danger'
  if (rate < LOW_ATTENDANCE) return 'font-semibold text-warning'
  return 'text-foreground'
}

/** Roll numbers sort as numbers where they are numbers ("2" before "10"). */
function byRoll(a: UserOut, b: UserOut): number {
  const ra = a.roll_number ?? ''
  const rb = b.roll_number ?? ''
  if (ra && rb && ra !== rb) return ra.localeCompare(rb, undefined, { numeric: true })
  if (ra && !rb) return -1
  if (!ra && rb) return 1
  return a.full_name.localeCompare(b.full_name)
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-border bg-muted/40 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  )
}

function StudentDetails({ s }: { s: UserOut }) {
  const address = [s.address_line1, s.address_line2, s.city, s.state, s.postal_code].filter(Boolean).join(', ')
  const value = (v: React.ReactNode) => v || <span className="text-muted-foreground">—</span>
  return (
    <Facts className="border-b-0 bg-muted/30 sm:grid-cols-4">
      <Fact label="Date of birth">{value(s.date_of_birth ? formatDate(s.date_of_birth) : null)}</Fact>
      <Fact label="Blood group">{value(s.blood_group)}</Fact>
      <Fact label="Admitted">{value(s.admission_date ? formatDate(s.admission_date) : null)}</Fact>
      <Fact label="Email">{value(s.email)}</Fact>
      <Fact label="Guardian email">{value(s.guardian_email)}</Fact>
      <Fact label="Student phone">{value(s.phone)}</Fact>
      <Fact label="Alternate phone">{value(s.alternate_phone)}</Fact>
      <Fact label="Address">{value(address)}</Fact>
    </Facts>
  )
}

/** The right side: one class, its subjects, its students. */
function ClassDetail({
  entry,
  roster,
  rosterPending,
  stats,
  attendance,
  grades,
}: {
  entry: ClassEntry
  roster: UserOut[]
  rosterPending: boolean
  stats: Map<string, SubjectStats>
  attendance: AttendanceOut[]
  grades: ExamGradeOut[]
}) {
  const [query, setQuery] = React.useState('')
  const [open, setOpen] = React.useState<number | null>(null)
  const today = todayApiDate()

  const lines = React.useMemo<StudentLine[]>(() => {
    const marks = attendance.filter((a) => a.class_id === entry.id)
    const results = grades.filter((g) => g.class_id === entry.id && g.max_marks > 0)
    return [...roster].sort(byRoll).map((student) => {
      const mine = marks.filter((a) => a.student_id === student.id)
      const absentDates = mine.filter((a) => a.status === 'ABSENT').map((a) => a.date)
      const theirGrades = results.filter((g) => g.student_id === student.id)
      return {
        student,
        marks: mine.length,
        present: mine.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length,
        absent: absentDates.length,
        late: mine.filter((a) => a.status === 'LATE').length,
        absentToday: absentDates.includes(today),
        lastAbsent: absentDates.sort((a, b) => b.localeCompare(a))[0] ?? null,
        gradeCount: theirGrades.length,
        gradeAvg: theirGrades.length
          ? theirGrades.reduce((n, g) => n + (g.marks_obtained / g.max_marks) * 100, 0) / theirGrades.length
          : null,
      }
    })
  }, [entry.id, roster, attendance, grades, today])

  const q = query.trim().toLowerCase()
  const shown = q
    ? lines.filter(({ student: s }) =>
        [s.full_name, s.admission_number, s.roll_number, s.guardian_name].some((v) => v?.toLowerCase().includes(q)),
      )
    : lines

  // Class-wide figures for the facts row.
  const marked = lines.reduce((n, l) => n + l.marks, 0)
  const present = lines.reduce((n, l) => n + l.present, 0)
  const classRate = marked > 0 ? Math.round((present / marked) * 100) : null
  const absentToday = lines.filter((l) => l.absentToday).length
  const boys = roster.filter((s) => s.gender === 'MALE').length
  const girls = roster.filter((s) => s.gender === 'FEMALE').length
  const below = lines.filter((l) => l.marks >= 3 && (l.present / l.marks) * 100 < LOW_ATTENDANCE).length
  const topics = entry.subjects.reduce((n, m) => n + (stats.get(pairKey(entry.id, m.subject.id))?.topics ?? 0), 0)

  return (
    <div>
      <DetailHeader
        title={entry.name}
        badges={
          entry.leads ? <span className="text-xs font-semibold text-warning">Class teacher</span> : undefined
        }
        sub={[
          entry.code,
          `${roster.length} ${roster.length === 1 ? 'student' : 'students'}`,
          entry.subjects.length ? entry.subjects.map((m) => m.subject.name).join(', ') : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <Button asChild size="sm" variant="primary">
              <Link to="/teacher/attendance">
                <CalendarCheck />
                Register
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/teacher/topics">
                <ClipboardList />
                Topics
              </Link>
            </Button>
            {entry.leads && (
              <Button asChild size="sm" variant="outline">
                <Link to={`/teacher/report-cards/paper-marks?class=${entry.id}`}>
                  <FileText />
                  Offline marks
                </Link>
              </Button>
            )}
          </>
        }
      />

      <Facts className="sm:grid-cols-6">
        <Fact label="Students">
          <span className="tabular-nums">{rosterPending ? '…' : roster.length}</span>
          {roster.length > 0 && (boys > 0 || girls > 0) && (
            <span className="ml-1.5 text-xs text-muted-foreground">
              {boys} boys · {girls} girls
            </span>
          )}
        </Fact>
        <Fact label="Attendance">
          <span className={cn('tabular-nums', rateTone(classRate))}>{classRate == null ? '—' : `${classRate}%`}</span>
        </Fact>
        <Fact label="Absent today">
          <span className={cn('tabular-nums', absentToday > 0 && 'font-semibold text-danger')}>{absentToday}</span>
        </Fact>
        <Fact label={`Under ${LOW_ATTENDANCE}%`}>
          <span className={cn('tabular-nums', below > 0 && 'font-semibold text-warning')}>{below}</span>
        </Fact>
        <Fact label="Your subjects">
          <span className="tabular-nums">{entry.subjects.length}</span>
        </Fact>
        <Fact label="Topics logged">
          <span className="tabular-nums">{topics}</span>
        </Fact>
      </Facts>

      <DetailSection title="Your subjects">
        {entry.subjects.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            You lead this class but teach no subject in it. Everything other teachers record here is still yours to see.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th className={TH}>Subject</th>
                  <th className={cn(TH, 'text-right')}>Topics</th>
                  <th className={cn(TH, 'text-right')}>Last topic</th>
                  <th className={cn(TH, 'text-right')}>Materials</th>
                  <th className={cn(TH, 'text-right')}>Live classes</th>
                  <th className={cn(TH, 'text-right')}>Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entry.subjects.map((m) => {
                  const s = stats.get(pairKey(entry.id, m.subject.id))
                  const days = daysAgo(s?.lastTopic ?? null)
                  const behind = days == null || days > SYLLABUS_STALE_DAYS
                  const rate = s && s.marks > 0 ? Math.round((s.present / s.marks) * 100) : null
                  return (
                    <tr key={m.id}>
                      <td className={TD}>
                        <span className="font-medium text-foreground">{m.subject.name}</span>
                        {m.subject.code && <span className="ml-1.5 text-xs text-muted-foreground">{m.subject.code}</span>}
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{s?.topics ?? 0}</td>
                      <td
                        className={cn(
                          TD,
                          'whitespace-nowrap text-right text-xs tabular-nums',
                          behind ? 'font-semibold text-warning' : 'text-muted-foreground',
                        )}
                      >
                        {lastTopicText(days)}
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{s?.materials ?? 0}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{s?.meetings ?? 0}</td>
                      <td className={cn(TD, 'text-right tabular-nums', rateTone(rate))}>
                        {rate == null ? '—' : `${rate}%`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </DetailSection>

      <DetailSection
        title={`Students${roster.length ? ` · ${roster.length}` : ''}`}
        action={
          <div className="w-56">
            <ListSearch value={query} onChange={setQuery} placeholder="Search students" />
          </div>
        }
      >
        {rosterPending ? (
          <div className="space-y-2 px-5 py-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 rounded" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">
            {q ? 'No student matches that search.' : 'No students are enrolled in this class yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr>
                  <th className={TH}>Roll</th>
                  <th className={TH}>Student</th>
                  <th className={TH}>Admission no.</th>
                  <th className={TH}>Guardian</th>
                  <th className={TH}>Phone</th>
                  <th className={cn(TH, 'text-right')}>Attendance</th>
                  <th className={cn(TH, 'text-right')}>Absent</th>
                  <th className={cn(TH, 'text-right')}>Last absent</th>
                  <th className={cn(TH, 'text-right')}>Marks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((line) => {
                  const s = line.student
                  const rate = line.marks > 0 ? Math.round((line.present / line.marks) * 100) : null
                  const expanded = open === s.id
                  const phone = s.guardian_phone || s.phone
                  return (
                    <React.Fragment key={s.id}>
                      <tr
                        className={cn('cursor-pointer hover:bg-muted/40', expanded && 'bg-muted/30')}
                        onClick={() => setOpen(expanded ? null : s.id)}
                        aria-expanded={expanded}
                      >
                        <td className={cn(TD, 'w-12 tabular-nums text-muted-foreground')}>{s.roll_number ?? '—'}</td>
                        <td className={TD}>
                          <span className="inline-flex items-center gap-1.5">
                            <ChevronDown
                              className={cn(
                                'size-3.5 shrink-0 text-muted-foreground transition-transform',
                                expanded ? '' : '-rotate-90',
                              )}
                            />
                            <span className="font-medium text-foreground">{s.full_name}</span>
                            {s.gender && GENDER_LABEL[s.gender] && (
                              <span className="text-xs text-muted-foreground">· {GENDER_LABEL[s.gender]}</span>
                            )}
                            {line.absentToday && <span className="text-xs font-semibold text-danger">· absent today</span>}
                          </span>
                        </td>
                        <td className={cn(TD, 'tabular-nums text-muted-foreground')}>{s.admission_number ?? '—'}</td>
                        <td className={TD}>
                          {s.guardian_name ? (
                            <>
                              <span className="text-foreground">{s.guardian_name}</span>
                              {s.guardian_relation && (
                                <span className="text-xs text-muted-foreground"> · {s.guardian_relation}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className={cn(TD, 'whitespace-nowrap')}>
                          {phone ? (
                            <a
                              href={`tel:${phone.replace(/\s+/g, '')}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 tabular-nums text-primary hover:underline"
                            >
                              <Phone className="size-3" />
                              {phone}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className={cn(TD, 'text-right tabular-nums', rateTone(rate))}>
                          {rate == null ? '—' : `${rate}%`}
                        </td>
                        <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums text-muted-foreground')}>
                          {line.marks > 0 ? (
                            <>
                              {line.absent}
                              {line.late > 0 && <span className="text-warning"> +{line.late} late</span>}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className={cn(TD, 'whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground')}>
                          {line.lastAbsent ? formatDate(line.lastAbsent, 'd MMM') : '—'}
                        </td>
                        <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums')}>
                          {line.gradeAvg == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={line.gradeAvg < 40 ? 'font-semibold text-danger' : 'text-foreground'}>
                              {Math.round(line.gradeAvg)}%
                              <span className="ml-1 text-xs text-muted-foreground">({line.gradeCount})</span>
                            </span>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={9} className="p-0">
                            <StudentDetails s={s} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-border px-5 py-2 text-[11px] text-muted-foreground">
          Attendance and marks come from the registers and exams you can see for this class. Click a student for their
          details.
        </p>
      </DetailSection>
    </div>
  )
}

export default function TeacherClassesPage() {
  const isAdmin = useIsAdminViewingTeacher()
  const myId = useAuth().user?.id
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = React.useState('')

  const mappingsQuery = useMyClasses(!isAdmin)
  const ledQuery = useMyLedClasses(!isAdmin)
  const topicsQuery = useTeacherTopics(!isAdmin)
  const materialsQuery = useTeacherMaterials(!isAdmin)
  const meetingsQuery = useTeacherMeetings(!isAdmin)
  const attendanceQuery = useTeacherAttendance(!isAdmin)
  const gradesQuery = useTeacherGrades(!isAdmin)

  /** One entry per class: the ones they lead first, then the ones they teach. */
  const classes = React.useMemo<ClassEntry[]>(() => {
    const map = new Map<number, ClassEntry>()
    for (const m of ledQuery.data ?? []) {
      map.set(m.class_room.id, { id: m.class_room.id, name: m.class_room.name, code: m.class_room.code ?? null, leads: true, subjects: [] })
    }
    for (const m of mappingsQuery.data ?? []) {
      const e =
        map.get(m.class_room.id) ??
        { id: m.class_room.id, name: m.class_room.name, code: m.class_room.code ?? null, leads: false, subjects: [] }
      e.subjects.push(m)
      map.set(m.class_room.id, e)
    }
    const byName = (a: ClassEntry, b: ClassEntry) => a.name.localeCompare(b.name, undefined, { numeric: true })
    const all = [...map.values()].map((e) => ({ ...e, subjects: [...e.subjects].sort((a, b) => a.subject.name.localeCompare(b.subject.name)) }))
    return [...all.filter((e) => e.leads).sort(byName), ...all.filter((e) => !e.leads).sort(byName)]
  }, [ledQuery.data, mappingsQuery.data])

  const classIds = React.useMemo(() => classes.map((c) => c.id), [classes])
  const rosters = useClassRosters(isAdmin ? [] : classIds)

  /**
   * Per class+subject figures. Own records only: these lists also carry what
   * other teachers filed in a class this teacher leads, and counting those as
   * "yours" would credit them with a colleague's work.
   */
  const stats = React.useMemo(() => {
    const map = new Map<string, SubjectStats>()
    const ensure = (k: string) => {
      let entry = map.get(k)
      if (!entry) {
        entry = { topics: 0, lastTopic: null, materials: 0, meetings: 0, marks: 0, present: 0 }
        map.set(k, entry)
      }
      return entry
    }
    const mine = <T extends { teacher_id: number | null }>(records: T[] | undefined) =>
      (records ?? []).filter((r) => r.teacher_id === myId)
    for (const t of mine(topicsQuery.data)) {
      const e = ensure(pairKey(t.class_id, t.subject_id))
      e.topics += 1
      if (!e.lastTopic || t.date_covered > e.lastTopic) e.lastTopic = t.date_covered
    }
    for (const m of mine(materialsQuery.data)) ensure(pairKey(m.class_id, m.subject_id)).materials += 1
    for (const m of mine(meetingsQuery.data)) ensure(pairKey(m.class_id, m.subject_id)).meetings += 1
    for (const a of mine(attendanceQuery.data)) {
      const e = ensure(pairKey(a.class_id, a.subject_id))
      e.marks += 1
      if (a.status === 'PRESENT' || a.status === 'LATE') e.present += 1
    }
    return map
  }, [myId, topicsQuery.data, materialsQuery.data, meetingsQuery.data, attendanceQuery.data])

  if (isAdmin) {
    return (
      <>
        <WorkspaceHeader title="My classes" description="The classes and subjects assigned to you." />
        <div className="pt-6">
          <AdminTeacherNotice />
        </div>
      </>
    )
  }

  const picked = Number(params.get('class'))
  const active = classes.find((c) => c.id === picked) ?? classes[0] ?? null
  const pick = (id: number) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('class', String(id))
        return next
      },
      { replace: true },
    )

  const q = search.trim().toLowerCase()
  const visible = q
    ? classes.filter((c) => [c.name, c.code, ...c.subjects.map((m) => m.subject.name)].some((v) => v?.toLowerCase().includes(q)))
    : classes
  const ledVisible = visible.filter((c) => c.leads)
  const taughtVisible = visible.filter((c) => !c.leads)
  const studentTotal = new Set(classIds.flatMap((id) => (rosters.byClass[id] ?? []).map((s) => s.id))).size
  const loading = mappingsQuery.isPending || ledQuery.isPending

  const item = (c: ClassEntry) => (
    <ListItem
      key={c.id}
      active={active?.id === c.id}
      onClick={() => pick(c.id)}
      title={c.name}
      sub={c.subjects.length ? c.subjects.map((m) => m.subject.name).join(', ') : 'Class teacher only'}
      right={
        <span className="tabular-nums text-muted-foreground">
          {rosters.isPending ? '…' : (rosters.byClass[c.id] ?? []).length}
        </span>
      }
    />
  )

  return (
    <>
      <WorkspaceHeader
        title="My classes"
        description="Every class you lead or teach, with its subjects and students."
        actions={
          <Button asChild size="sm" variant="primary">
            <Link to="/teacher/attendance">
              <CalendarCheck />
              Take register
            </Link>
          </Button>
        }
      />

      <Band className="border-b border-border px-0 sm:px-0 lg:px-0">
        <div className="lg:h-[calc(100vh-11rem)] lg:min-h-[30rem]">
          <SplitView
            list={
              <ListPane
                toolbar={<ListSearch value={search} onChange={setSearch} placeholder="Search classes or subjects" />}
                footer={`${classes.length} ${classes.length === 1 ? 'class' : 'classes'} · ${studentTotal} students`}
              >
                {loading ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 rounded" />
                    ))}
                  </div>
                ) : visible.length === 0 ? (
                  <ListEmpty>{q ? 'No class matches that search.' : 'No classes are assigned to you yet.'}</ListEmpty>
                ) : (
                  <>
                    {ledVisible.length > 0 && <GroupLabel>Classes you lead</GroupLabel>}
                    {ledVisible.map(item)}
                    {taughtVisible.length > 0 && <GroupLabel>Classes you teach</GroupLabel>}
                    {taughtVisible.map(item)}
                  </>
                )}
              </ListPane>
            }
            detail={
              loading ? (
                <div className="space-y-3 p-5">
                  <Skeleton className="h-10 w-64 rounded" />
                  <Skeleton className="h-24 rounded" />
                  <Skeleton className="h-48 rounded" />
                </div>
              ) : !active ? (
                <ListEmpty>
                  No classes are assigned to you yet. The office maps a teacher to a class and subject before anything
                  can be recorded.
                </ListEmpty>
              ) : (
                <ClassDetail
                  key={active.id}
                  entry={active}
                  roster={rosters.byClass[active.id] ?? []}
                  rosterPending={rosters.isPending}
                  stats={stats}
                  attendance={attendanceQuery.data ?? []}
                  grades={gradesQuery.data ?? []}
                />
              )
            }
          />
        </div>
      </Band>
    </>
  )
}

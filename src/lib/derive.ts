/**
 * Client-side derivations.
 *
 * The backend exposes exactly one analytics endpoint (admin monitoring), so
 * every other insight in the app is computed here from list responses already
 * in cache — zero extra network cost.
 *
 * The grade formula deliberately mirrors the backend's
 * (`mean(marks_obtained / max_marks * 100)`) so teacher insights and
 * `/admin/reports` can never disagree.
 */
import type {
  AttendanceOut,
  AttendanceStatus,
  ClassRoomOut,
  ExamGradeOut,
  LiveMeetingOut,
  StudentEnrollmentOut,
  StudyMaterialOut,
  SubjectOut,
  TeacherMappingOut,
  TopicOut,
  UserOut,
} from '@/api/types'
import { ATTENDANCE_STATUSES, AT_RISK_ATTENDANCE, AT_RISK_GRADE, isTeachingRole } from './constants'
import { parseApiDate, parseApiDateTime, meetingPhase } from './datetime'
import { gradePercentage } from './format'

// -------------------------------------------------------------- attendance

export type StatusCounts = Record<AttendanceStatus, number>

export function emptyStatusCounts(): StatusCounts {
  return { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
}

export function countByStatus(records: AttendanceOut[]): StatusCounts {
  const counts = emptyStatusCounts()
  for (const r of records) {
    if (r.status in counts) counts[r.status] += 1
  }
  return counts
}

/**
 * Attendance percentage. Matches the backend: PRESENT over total records.
 * LATE and EXCUSED are NOT counted as attended, deliberately — diverging here
 * would make the teacher view contradict the admin report.
 */
export function attendanceRate(records: AttendanceOut[]): number {
  if (records.length === 0) return 0
  const present = records.filter((r) => r.status === 'PRESENT').length
  return (present / records.length) * 100
}

export interface StudentAttendanceSummary {
  studentId: number
  name: string
  total: number
  counts: StatusCounts
  rate: number
}

export function summarizeAttendanceByStudent(
  records: AttendanceOut[],
  nameFor: (studentId: number, sample: AttendanceOut) => string,
): StudentAttendanceSummary[] {
  const groups = new Map<number, AttendanceOut[]>()
  for (const r of records) {
    const list = groups.get(r.student_id)
    if (list) list.push(r)
    else groups.set(r.student_id, [r])
  }
  return [...groups.entries()]
    .map(([studentId, list]) => ({
      studentId,
      name: nameFor(studentId, list[0]),
      total: list.length,
      counts: countByStatus(list),
      rate: attendanceRate(list),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface AttendanceTrendPoint {
  date: string
  label: string
  rate: number
  present: number
  total: number
}

/** Attendance rate per calendar day, oldest first, for trend charts. */
export function attendanceTrend(records: AttendanceOut[], lastNDays = 30): AttendanceTrendPoint[] {
  const byDate = new Map<string, AttendanceOut[]>()
  for (const r of records) {
    const list = byDate.get(r.date)
    if (list) list.push(r)
    else byDate.set(r.date, [r])
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-lastNDays)
    .map(([date, list]) => {
      const d = parseApiDate(date)
      return {
        date,
        label: d ? `${d.getDate()}/${d.getMonth() + 1}` : date,
        rate: attendanceRate(list),
        present: list.filter((r) => r.status === 'PRESENT').length,
        total: list.length,
      }
    })
}

/** Consecutive days ending today (or the most recent record) marked PRESENT. */
export function attendanceStreak(records: AttendanceOut[]): number {
  const byDate = new Map<string, AttendanceOut[]>()
  for (const r of records) {
    const list = byDate.get(r.date)
    if (list) list.push(r)
    else byDate.set(r.date, [r])
  }
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a))
  let streak = 0
  for (const date of dates) {
    const dayRecords = byDate.get(date) ?? []
    if (dayRecords.every((r) => r.status === 'PRESENT')) streak += 1
    else break
  }
  return streak
}

// ------------------------------------------------------------------ grades

/** Backend-compatible average: mean of per-exam percentages. */
export function averageGradePercentage(grades: ExamGradeOut[]): number {
  if (grades.length === 0) return 0
  const total = grades.reduce((sum, g) => sum + gradePercentage(g.marks_obtained, g.max_marks), 0)
  return total / grades.length
}

export interface GradebookCell {
  grade: ExamGradeOut
  percent: number
}

export interface GradebookRow {
  studentId: number
  name: string
  /** exam_name -> cell. A missing key means "not graded", never zero. */
  cells: Map<string, GradebookCell>
  average: number
  gradedCount: number
}

export interface Gradebook {
  exams: string[]
  rows: GradebookRow[]
  /** exam_name -> mean percentage across graded students. */
  examAverages: Map<string, number>
}

/** Pivots a flat grade list into a students × exams matrix. */
export function buildGradebook(
  grades: ExamGradeOut[],
  roster: { id: number; full_name: string }[],
): Gradebook {
  const exams = [...new Set(grades.map((g) => g.exam_name))].sort((a, b) => a.localeCompare(b))

  const byStudent = new Map<number, ExamGradeOut[]>()
  for (const g of grades) {
    const list = byStudent.get(g.student_id)
    if (list) list.push(g)
    else byStudent.set(g.student_id, [g])
  }

  // Roster first so ungraded students still appear, then anyone with grades
  // who is no longer on the roster (deactivated, unenrolled).
  const seen = new Set(roster.map((r) => r.id))
  const people = [
    ...roster,
    ...[...byStudent.keys()]
      .filter((id) => !seen.has(id))
      .map((id) => ({
        id,
        full_name: byStudent.get(id)?.[0]?.student?.full_name ?? `Student ${String(id).slice(-6)}`,
      })),
  ]

  const rows: GradebookRow[] = people.map((person) => {
    const list = byStudent.get(person.id) ?? []
    const cells = new Map<string, GradebookCell>()
    for (const g of list) {
      // Duplicate exam names are possible (no dedupe server-side); the most
      // recent entry wins.
      const existing = cells.get(g.exam_name)
      const isNewer =
        !existing ||
        (parseApiDateTime(g.created_at)?.getTime() ?? 0) >=
          (parseApiDateTime(existing.grade.created_at)?.getTime() ?? 0)
      if (isNewer) cells.set(g.exam_name, { grade: g, percent: gradePercentage(g.marks_obtained, g.max_marks) })
    }
    const percents = [...cells.values()].map((c) => c.percent)
    return {
      studentId: person.id,
      name: person.full_name,
      cells,
      average: percents.length ? percents.reduce((a, b) => a + b, 0) / percents.length : 0,
      gradedCount: percents.length,
    }
  })

  const examAverages = new Map<string, number>()
  for (const exam of exams) {
    const values = rows.map((r) => r.cells.get(exam)?.percent).filter((v): v is number => v != null)
    if (values.length) examAverages.set(exam, values.reduce((a, b) => a + b, 0) / values.length)
  }

  return { exams, rows: rows.sort((a, b) => a.name.localeCompare(b.name)), examAverages }
}

export interface DistributionBucket {
  label: string
  range: [number, number]
  count: number
}

/** Standard grade bands for the distribution histogram. */
export function gradeDistribution(grades: ExamGradeOut[]): DistributionBucket[] {
  const buckets: DistributionBucket[] = [
    { label: '0–39', range: [0, 40], count: 0 },
    { label: '40–54', range: [40, 55], count: 0 },
    { label: '55–69', range: [55, 70], count: 0 },
    { label: '70–84', range: [70, 85], count: 0 },
    { label: '85–100', range: [85, 100.01], count: 0 },
  ]
  for (const g of grades) {
    const p = gradePercentage(g.marks_obtained, g.max_marks)
    const bucket = buckets.find((b) => p >= b.range[0] && p < b.range[1])
    if (bucket) bucket.count += 1
  }
  return buckets
}

// ------------------------------------------------------------------ topics

export interface SubjectProgress {
  subjectId: number
  subjectName: string
  topicCount: number
  /** Mean of `completion_percentage` across logged topics. */
  completion: number
  lastCoveredDate: string | null
}

export function syllabusProgress(
  topics: TopicOut[],
  nameFor: (topic: TopicOut) => string,
): SubjectProgress[] {
  const groups = new Map<number, TopicOut[]>()
  for (const t of topics) {
    const list = groups.get(t.subject_id)
    if (list) list.push(t)
    else groups.set(t.subject_id, [t])
  }

  return [...groups.entries()]
    .map(([subjectId, list]) => ({
      subjectId,
      subjectName: nameFor(list[0]),
      topicCount: list.length,
      completion: list.reduce((sum, t) => sum + (t.completion_percentage ?? 0), 0) / list.length,
      lastCoveredDate:
        list
          .map((t) => t.date_covered)
          .sort((a, b) => b.localeCompare(a))[0] ?? null,
    }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName))
}

// ---------------------------------------------------------------- meetings

export function splitMeetings(meetings: LiveMeetingOut[], now = new Date()) {
  const live: LiveMeetingOut[] = []
  const upcoming: LiveMeetingOut[] = []
  const past: LiveMeetingOut[] = []

  for (const m of meetings) {
    const phase = meetingPhase(m.scheduled_time, now)
    if (phase === 'live') live.push(m)
    else if (phase === 'upcoming') upcoming.push(m)
    else past.push(m)
  }

  const asc = (a: LiveMeetingOut, b: LiveMeetingOut) =>
    (parseApiDateTime(a.scheduled_time)?.getTime() ?? 0) - (parseApiDateTime(b.scheduled_time)?.getTime() ?? 0)

  return {
    live: live.sort(asc),
    upcoming: upcoming.sort(asc),
    past: past.sort((a, b) => asc(b, a)),
    recordings: meetings.filter((m) => !!m.recording_url).sort((a, b) => asc(b, a)),
  }
}

export function nextMeeting(meetings: LiveMeetingOut[], now = new Date()): LiveMeetingOut | null {
  const { live, upcoming } = splitMeetings(meetings, now)
  return live[0] ?? upcoming[0] ?? null
}

// ------------------------------------------------------ admin cross-joins

export interface ClassStats {
  classId: number
  studentCount: number
  subjectCount: number
  teacherCount: number
}

/** Per-class counts joined from enrollments + mappings. */
export function classStats(
  enrollments: StudentEnrollmentOut[],
  mappings: TeacherMappingOut[],
): Map<number, ClassStats> {
  const stats = new Map<number, ClassStats>()

  const ensure = (classId: number) => {
    let entry = stats.get(classId)
    if (!entry) {
      entry = { classId, studentCount: 0, subjectCount: 0, teacherCount: 0 }
      stats.set(classId, entry)
    }
    return entry
  }

  for (const e of enrollments) ensure(e.class_room.id).studentCount += 1

  const subjectsByClass = new Map<number, Set<number>>()
  const teachersByClass = new Map<number, Set<number>>()
  for (const m of mappings) {
    const classId = m.class_room.id
    ensure(classId)
    if (!subjectsByClass.has(classId)) subjectsByClass.set(classId, new Set())
    if (!teachersByClass.has(classId)) teachersByClass.set(classId, new Set())
    subjectsByClass.get(classId)!.add(m.subject.id)
    teachersByClass.get(classId)!.add(m.teacher.id)
  }
  for (const [classId, set] of subjectsByClass) ensure(classId).subjectCount = set.size
  for (const [classId, set] of teachersByClass) ensure(classId).teacherCount = set.size

  return stats
}

export interface SubjectStats {
  subjectId: number
  classCount: number
  teacherCount: number
}

export function subjectStats(mappings: TeacherMappingOut[]): Map<number, SubjectStats> {
  const classes = new Map<number, Set<number>>()
  const teachers = new Map<number, Set<number>>()
  for (const m of mappings) {
    if (!classes.has(m.subject.id)) classes.set(m.subject.id, new Set())
    if (!teachers.has(m.subject.id)) teachers.set(m.subject.id, new Set())
    classes.get(m.subject.id)!.add(m.class_room.id)
    teachers.get(m.subject.id)!.add(m.teacher.id)
  }
  const out = new Map<number, SubjectStats>()
  for (const [subjectId, set] of classes) {
    out.set(subjectId, {
      subjectId,
      classCount: set.size,
      teacherCount: teachers.get(subjectId)?.size ?? 0,
    })
  }
  return out
}

export interface ProvisioningAlerts {
  studentsWithoutEnrollment: UserOut[]
  teachersWithoutAssignment: UserOut[]
  classesWithoutSubject: ClassRoomOut[]
  subjectsWithoutTeacher: SubjectOut[]
}

/**
 * The highest-value thing an admin dashboard can show, and it costs nothing:
 * gaps in the setup, found by joining data already in cache.
 */
export function provisioningAlerts(
  users: UserOut[],
  classes: ClassRoomOut[],
  subjects: SubjectOut[],
  mappings: TeacherMappingOut[],
  enrollments: StudentEnrollmentOut[],
): ProvisioningAlerts {
  const enrolledStudentIds = new Set(enrollments.map((e) => e.student.id))
  const assignedTeacherIds = new Set(mappings.map((m) => m.teacher.id))
  const classesWithSubject = new Set(mappings.map((m) => m.class_room.id))
  const subjectsWithTeacher = new Set(mappings.map((m) => m.subject.id))

  return {
    studentsWithoutEnrollment: users.filter(
      (u) => u.role === 'STUDENT' && u.is_active && !enrolledStudentIds.has(u.id),
    ),
    // Both teaching roles. A class teacher with no subject mapping still
    // cannot take a register, and dropping them from this alert would hide
    // exactly the gap an admin most needs to see.
    teachersWithoutAssignment: users.filter(
      (u) => isTeachingRole(u.role) && u.is_active && !assignedTeacherIds.has(u.id),
    ),
    classesWithoutSubject: classes.filter((c) => !classesWithSubject.has(c.id)),
    subjectsWithoutTeacher: subjects.filter((s) => !subjectsWithTeacher.has(s.id)),
  }
}

export interface SignupPoint {
  label: string
  date: string
  count: number
  cumulative: number
}

/** Accounts created per month, derived from `created_at`. */
export function signupsOverTime(users: UserOut[]): SignupPoint[] {
  const byMonth = new Map<string, number>()
  for (const u of users) {
    const d = parseApiDateTime(u.created_at)
    if (!d) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1)
  }
  let cumulative = 0
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      cumulative += count
      const [year, month] = key.split('-')
      const d = new Date(Number(year), Number(month) - 1, 1)
      return {
        date: key,
        label: d.toLocaleString(undefined, { month: 'short', year: '2-digit' }),
        count,
        cumulative,
      }
    })
}

// ------------------------------------------------------------- at-risk

export interface AtRiskStudent {
  studentId: number
  name: string
  attendanceRate: number
  averageGrade: number
  reasons: string[]
}

export function atRiskStudents(
  attendance: AttendanceOut[],
  grades: ExamGradeOut[],
  nameFor: (studentId: number) => string,
): AtRiskStudent[] {
  const ids = new Set([...attendance.map((a) => a.student_id), ...grades.map((g) => g.student_id)])

  const result: AtRiskStudent[] = []
  for (const studentId of ids) {
    const theirAttendance = attendance.filter((a) => a.student_id === studentId)
    const theirGrades = grades.filter((g) => g.student_id === studentId)
    const rate = theirAttendance.length ? attendanceRate(theirAttendance) : null
    const avg = theirGrades.length ? averageGradePercentage(theirGrades) : null

    const reasons: string[] = []
    if (rate !== null && rate < AT_RISK_ATTENDANCE) reasons.push(`${rate.toFixed(0)}% attendance`)
    if (avg !== null && avg < AT_RISK_GRADE) reasons.push(`${avg.toFixed(0)}% average grade`)

    if (reasons.length) {
      result.push({
        studentId,
        name: nameFor(studentId),
        attendanceRate: rate ?? 0,
        averageGrade: avg ?? 0,
        reasons,
      })
    }
  }

  return result.sort((a, b) => a.attendanceRate - b.attendanceRate)
}

// ------------------------------------------------------------ teacher misc

/** Class+subject pairs with no attendance recorded for the given date. */
export function missingAttendanceToday(
  mappings: TeacherMappingOut[],
  attendance: AttendanceOut[],
  date: string,
): TeacherMappingOut[] {
  const marked = new Set(
    attendance.filter((a) => a.date === date).map((a) => `${a.class_id}|${a.subject_id}`),
  )
  return mappings.filter((m) => !marked.has(`${m.class_room.id}|${m.subject.id}`))
}

/** Materials uploaded since a timestamp — powers the "new" badges. */
/** One entry in the unified student timeline. */
export interface TimelineEntry {
  id: string
  kind: 'meeting' | 'material' | 'topic'
  /** Sort key — a local Date parsed from the record's own timestamp. */
  at: Date
  title: string
  subject: string
  /** Only meetings can be in the future. */
  upcoming: boolean
  href: string
  /** Extra context: a meeting link, a file url, or a completion percentage. */
  meta?: string | null
}

/**
 * Merges meetings, materials and topics into one chronological feed spanning a
 * window around today.
 *
 * These three live on separate pages with separate shapes, which makes "what is
 * happening in my class this week" a question the UI could not previously
 * answer without the student checking three places. Sorting is by each
 * record's own timestamp — scheduled time for meetings, upload time for
 * materials, covered date for topics — because those are the moments a student
 * actually cares about, not when the row was written.
 *
 * Records whose timestamps fail to parse are dropped rather than sorted to the
 * epoch, where they would silently dominate the "past" end of the list.
 */
export function studentTimeline(
  meetings: LiveMeetingOut[],
  materials: StudyMaterialOut[],
  topics: TopicOut[],
  now = new Date(),
  daysBack = 7,
  daysForward = 14,
): TimelineEntry[] {
  const from = new Date(now)
  from.setDate(from.getDate() - daysBack)
  from.setHours(0, 0, 0, 0)

  const to = new Date(now)
  to.setDate(to.getDate() + daysForward)
  to.setHours(23, 59, 59, 999)

  const entries: TimelineEntry[] = []
  const inWindow = (d: Date | null): d is Date => d !== null && d >= from && d <= to

  for (const meeting of meetings) {
    const at = parseApiDateTime(meeting.scheduled_time)
    if (!inWindow(at)) continue
    entries.push({
      id: `meeting-${meeting.id}`,
      kind: 'meeting',
      at,
      title: meeting.title,
      subject: meeting.subject?.name ?? 'Class',
      upcoming: at > now,
      href: '/student/meetings',
      meta: meeting.meeting_link,
    })
  }

  for (const material of materials) {
    const at = parseApiDateTime(material.uploaded_at)
    if (!inWindow(at)) continue
    entries.push({
      id: `material-${material.id}`,
      kind: 'material',
      at,
      title: material.title,
      subject: material.subject?.name ?? 'Class',
      upcoming: false,
      href: '/student/materials',
      meta: material.material_type,
    })
  }

  for (const topic of topics) {
    const at = parseApiDate(topic.date_covered)
    if (!inWindow(at)) continue
    entries.push({
      id: `topic-${topic.id}`,
      kind: 'topic',
      at,
      title: topic.topic_title,
      subject: topic.subject?.name ?? 'Class',
      upcoming: false,
      href: '/student/syllabus',
      meta: `${Math.round(topic.completion_percentage)}% covered`,
    })
  }

  // Soonest-upcoming first, then most-recent past — the order a student reads
  // "what is next, and what did I just miss".
  return entries.sort((a, b) => {
    if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1
    return a.upcoming
      ? a.at.getTime() - b.at.getTime()
      : b.at.getTime() - a.at.getTime()
  })
}

export function newSince(materials: StudyMaterialOut[], sinceIso: string | null): Set<number> {
  if (!sinceIso) return new Set()
  const since = new Date(sinceIso).getTime()
  return new Set(
    materials
      .filter((m) => (parseApiDateTime(m.uploaded_at)?.getTime() ?? 0) > since)
      .map((m) => m.id),
  )
}

export { ATTENDANCE_STATUSES }

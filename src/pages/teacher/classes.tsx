import {
  BookOpen,
  CalendarCheck,
  ClipboardList,
  FileText,
  Layers,
  Library,
  UserRoundCog,
  Users,
  Video,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

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
import { countLabel } from '@/lib/format'
import { useAuth } from '@/providers/auth-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'
import { AdminTeacherNotice, useIsAdminViewingTeacher } from './teacher-guard'

/**
 * The classes this teacher answers for as a whole.
 *
 * Kept above the subject cards and styled apart from them because it is a
 * different kind of thing: a subject card is one period of one class, this is
 * the whole class including the periods other people take. Hidden entirely for
 * a subject teacher, who leads nothing.
 */
function LedClasses() {
  const ledQuery = useMyLedClasses()
  const led = ledQuery.data ?? []

  const classIds = React.useMemo(() => led.map((m) => m.class_room.id), [led])
  const rosters = useClassRosters(classIds)

  if (ledQuery.isPending || led.length === 0) return null

  return (
    <section className="mb-8">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <UserRoundCog className="size-4" />
        Classes you lead
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        You are the class teacher of {led.length === 1 ? 'this class' : 'these classes'}. Across{' '}
        {led.length === 1 ? 'it' : 'them'} you can see and correct what{' '}
        <strong>every</strong> teacher records, not only your own periods.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {led.map((mapping) => {
          const roster = rosters.byClass[mapping.class_room.id] ?? []
          return (
            <Card
              key={mapping.id}
              className="flex flex-col border-warning/30 bg-warning/6 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
                  <UserRoundCog className="size-5" />
                </span>
                <Badge tone="warning" size="sm">
                  Class teacher
                </Badge>
              </div>

              <h3 className="mt-3 text-base font-semibold">{mapping.class_room.name}</h3>
              <p className="text-sm text-muted-foreground">{mapping.class_room.code}</p>

              <div className="mt-4 border-t border-warning/25 pt-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-3.5" />
                  {rosters.isPending ? '…' : countLabel(roster.length, 'student')}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/teacher/attendance">
                    <CalendarCheck className="size-4" />
                    Attendance
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/teacher/topics">
                    <ClipboardList className="size-4" />
                    Syllabus
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/teacher/gradebook">
                    <FileText className="size-4" />
                    Grades
                  </Link>
                </Button>
              </div>
            </Card>
          )
        })}
      </div>
    </section>
  )
}

export default function TeacherClassesPage() {
  const isAdmin = useIsAdminViewingTeacher()
  const myId = useAuth().user?.id
  const mappingsQuery = useMyClasses(!isAdmin)
  const topicsQuery = useTeacherTopics(!isAdmin)
  const materialsQuery = useTeacherMaterials(!isAdmin)
  const meetingsQuery = useTeacherMeetings(!isAdmin)
  const gradesQuery = useTeacherGrades(!isAdmin)
  const attendanceQuery = useTeacherAttendance(!isAdmin)

  const mappings = React.useMemo(() => mappingsQuery.data ?? [], [mappingsQuery.data])

  const classIds = React.useMemo(
    () => [...new Set(mappings.map((m) => m.class_room.id))],
    [mappings],
  )
  const rosters = useClassRosters(isAdmin ? [] : classIds)

  /** Per class+subject counts, all joined client-side from lists in cache. */
  const counts = React.useMemo(() => {
    const key = (classId: number, subjectId: number) => `${classId}|${subjectId}`
    const map = new Map<string, { topics: number; materials: number; meetings: number; grades: number; attendance: number }>()

    const ensure = (k: string) => {
      let entry = map.get(k)
      if (!entry) {
        entry = { topics: 0, materials: 0, meetings: 0, grades: 0, attendance: 0 }
        map.set(k, entry)
      }
      return entry
    }

    // Own records only. These lists now also carry what other teachers filed
    // against a class this teacher leads, and counting those under "what you
    // have recorded" would credit them with a colleague's work.
    const mine = <T extends { teacher_id: number | null }>(records: T[] | undefined) =>
      (records ?? []).filter((r) => r.teacher_id === myId)

    for (const t of mine(topicsQuery.data)) ensure(key(t.class_id, t.subject_id)).topics += 1
    for (const m of mine(materialsQuery.data)) ensure(key(m.class_id, m.subject_id)).materials += 1
    for (const m of mine(meetingsQuery.data)) ensure(key(m.class_id, m.subject_id)).meetings += 1
    for (const g of mine(gradesQuery.data)) {
      if (g.class_id == null) continue // tuition grade: belongs to no class
      ensure(key(g.class_id, g.subject_id)).grades += 1
    }
    for (const a of mine(attendanceQuery.data)) ensure(key(a.class_id, a.subject_id)).attendance += 1

    return map
  }, [
    myId,
    topicsQuery.data,
    materialsQuery.data,
    meetingsQuery.data,
    gradesQuery.data,
    attendanceQuery.data,
  ])

  if (isAdmin) {
    return (
      <>
        <PageHeader title="My classes" description="The classes and subjects assigned to you." />
        <AdminTeacherNotice />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="My classes"
        description="Every class and subject you are assigned to, with what you have recorded for each."
      />

      {/* Above the subject cards: leading a class is the broader
          responsibility, and a class teacher with no subject mapping of their
          own would otherwise land on an empty page. */}
      <LedClasses />

      <QueryBoundary
        query={mappingsQuery}
        loading={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={<Layers />}
            title="No classes assigned"
            description="An administrator needs to assign you to a subject and class before you can record anything."
          />
        }
      >
        {(data) => (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((mapping) => {
              const stats = counts.get(`${mapping.class_room.id}|${mapping.subject.id}`)
              const roster = rosters.byClass[mapping.class_room.id] ?? []

              return (
                <Card key={mapping.id} className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                      <BookOpen className="size-5" />
                    </span>
                    <Badge tone="outline" size="sm">
                      {mapping.subject.code}
                    </Badge>
                  </div>

                  <h3 className="mt-3 text-base font-semibold">{mapping.subject.name}</h3>
                  <p className="text-sm text-muted-foreground">{mapping.class_room.name}</p>

                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-3.5" />
                      {rosters.isPending ? '…' : countLabel(roster.length, 'student')}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <ClipboardList className="size-3.5" />
                      {countLabel(stats?.topics ?? 0, 'topic')}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Library className="size-3.5" />
                      {countLabel(stats?.materials ?? 0, 'material')}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Video className="size-3.5" />
                      {countLabel(stats?.meetings ?? 0, 'meeting')}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link to="/teacher/attendance">
                        <CalendarCheck className="size-4" />
                        Attendance
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/teacher/gradebook">
                        <FileText className="size-4" />
                        Grades
                      </Link>
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </QueryBoundary>
    </>
  )
}

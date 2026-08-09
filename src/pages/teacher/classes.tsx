import {
  BookOpen,
  CalendarCheck,
  ClipboardList,
  FileText,
  Layers,
  Library,
  Users,
  Video,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import {
  useClassRosters,
  useMyClasses,
  useTeacherAttendance,
  useTeacherGrades,
  useTeacherMaterials,
  useTeacherMeetings,
  useTeacherTopics,
} from '@/queries/teacher.queries'
import { countLabel } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'
import { AdminTeacherNotice, useIsAdminViewingTeacher } from './teacher-guard'

export default function TeacherClassesPage() {
  const isAdmin = useIsAdminViewingTeacher()
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

    for (const t of topicsQuery.data ?? []) ensure(key(t.class_id, t.subject_id)).topics += 1
    for (const m of materialsQuery.data ?? []) ensure(key(m.class_id, m.subject_id)).materials += 1
    for (const m of meetingsQuery.data ?? []) ensure(key(m.class_id, m.subject_id)).meetings += 1
    for (const g of gradesQuery.data ?? []) ensure(key(g.class_id, g.subject_id)).grades += 1
    for (const a of attendanceQuery.data ?? []) ensure(key(a.class_id, a.subject_id)).attendance += 1

    return map
  }, [topicsQuery.data, materialsQuery.data, meetingsQuery.data, gradesQuery.data, attendanceQuery.data])

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

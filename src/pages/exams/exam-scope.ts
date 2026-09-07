import * as React from 'react'

import type { ClassRoomOut, SubjectOut, UserOut } from '@/api/types'
import { useAuth } from '@/providers/auth-provider'
import { useClasses, useMappings, useSubjects, useTeachingStaff } from '@/queries/admin.queries'
import { useMyClasses, useMyLedClasses } from '@/queries/teacher.queries'

/**
 * The exam screens are shared by teachers and administrators: the backend
 * serves both from the same endpoints and decides per request how much each
 * may see. What differs is where the pages live (`/teacher/...` versus
 * `/admin/...`) and where the class, subject and teacher choices come from —
 * a teacher picks from their own mappings, an admin from the whole catalogue.
 * This hook is the single place those two differences are resolved.
 */
export function useExamScope() {
  const { role, user } = useAuth()
  const isAdmin = role === 'ADMIN'
  const base = isAdmin ? '/admin' : '/teacher'

  return React.useMemo(
    () => ({
      isAdmin,
      userId: user?.id ?? null,
      examsPath: `${base}/exams`,
      newExamPath: `${base}/exams/new`,
      examPath: (examId: number) => `${base}/exams/${examId}`,
      editExamPath: (examId: number) => `${base}/exams/${examId}/edit`,
      gradePath: (examId: number, studentId: number) => `${base}/exams/${examId}/grade/${studentId}`,
      reportCardsPath: `${base}/report-cards`,
      reportCardPath: (cardId: string) => `${base}/report-cards/${cardId}`,
    }),
    [isAdmin, user?.id, base],
  )
}

export interface CatalogueOption {
  id: number
  name: string
  code: string
}

function sortByName<T extends { name: string }>(items: Iterable<T>): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Where the class, subject and teacher choices come from.
 *
 * Teacher: the classes and subjects of their own mappings, plus the classes
 * they lead. Admin: every class and subject, narrowed by the mapping chart so
 * the subject list for a class is the subjects actually taught in it, and the
 * teacher list for a (class, subject) is whoever is mapped to take it —
 * falling back to the full catalogue when no mapping exists, because an admin
 * setting an exam for a new arrangement should not be blocked by the chart.
 */
export function useExamCatalogue() {
  const { isAdmin } = useExamScope()

  const myClassesQuery = useMyClasses(!isAdmin)
  const myLedQuery = useMyLedClasses(!isAdmin)
  const classesQuery = useClasses(isAdmin)
  const subjectsQuery = useSubjects(isAdmin)
  const mappingsQuery = useMappings(isAdmin)
  const staffQuery = useTeachingStaff(isAdmin)

  const queries = isAdmin
    ? [classesQuery, subjectsQuery, mappingsQuery, staffQuery]
    : [myClassesQuery, myLedQuery]

  const classes = React.useMemo<CatalogueOption[]>(() => {
    const map = new Map<number, ClassRoomOut>()
    if (isAdmin) {
      for (const c of classesQuery.data ?? []) map.set(c.id, c)
    } else {
      for (const m of myClassesQuery.data ?? []) map.set(m.class_room.id, m.class_room)
      for (const m of myLedQuery.data ?? []) map.set(m.class_room.id, m.class_room)
    }
    return sortByName(map.values())
  }, [isAdmin, classesQuery.data, myClassesQuery.data, myLedQuery.data])

  const ledClassIds = React.useMemo(
    () => new Set((myLedQuery.data ?? []).map((m) => m.class_room.id)),
    [myLedQuery.data],
  )

  const subjectsFor = React.useCallback(
    (classId: number | null): CatalogueOption[] => {
      if (classId == null) return []
      const map = new Map<number, SubjectOut>()
      if (isAdmin) {
        for (const m of mappingsQuery.data ?? []) {
          if (m.class_room.id === classId) map.set(m.subject.id, m.subject)
        }
        if (map.size === 0) for (const s of subjectsQuery.data ?? []) map.set(s.id, s)
      } else {
        for (const m of myClassesQuery.data ?? []) {
          if (m.class_room.id === classId) map.set(m.subject.id, m.subject)
        }
      }
      return sortByName(map.values())
    },
    [isAdmin, mappingsQuery.data, subjectsQuery.data, myClassesQuery.data],
  )

  const teachersFor = React.useCallback(
    (classId: number | null, subjectId: number | null): UserOut[] => {
      if (!isAdmin) return []
      const mapped = (mappingsQuery.data ?? [])
        .filter((m) => (classId == null || m.class_room.id === classId) && (subjectId == null || m.subject.id === subjectId))
        .map((m) => m.teacher)
      const map = new Map<number, UserOut>()
      for (const t of mapped) map.set(t.id, t)
      if (map.size === 0) for (const t of staffQuery.data ?? []) map.set(t.id, t)
      return [...map.values()].sort((a, b) => a.full_name.localeCompare(b.full_name))
    },
    [isAdmin, mappingsQuery.data, staffQuery.data],
  )

  /** Whether this user may issue report cards for the class. */
  const canLead = React.useCallback(
    (classId: number | null) => classId != null && (isAdmin || ledClassIds.has(classId)),
    [isAdmin, ledClassIds],
  )

  /** Classes for which report cards can be issued. */
  const leadableClasses = React.useMemo(
    () => (isAdmin ? classes : classes.filter((c) => ledClassIds.has(c.id))),
    [isAdmin, classes, ledClassIds],
  )

  return {
    isAdmin,
    isPending: queries.some((q) => q.isPending),
    isError: queries.some((q) => q.isError),
    error: queries.find((q) => q.isError)?.error,
    refetch: () => queries.forEach((q) => void q.refetch()),
    classes,
    subjectsFor,
    teachersFor,
    canLead,
    leadableClasses,
    ledClassIds,
    /** True for a teacher with no mappings and no led classes — nothing to set an exam for. */
    hasNothing: !isAdmin && classes.length === 0,
  }
}

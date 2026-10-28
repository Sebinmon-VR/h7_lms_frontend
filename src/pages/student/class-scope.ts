import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

import { useStudentClasses } from '@/queries/student.queries'

export interface ScopedClass {
  id: number
  name: string
}

/**
 * The class a student's Library and Syllabus pages are showing.
 *
 * A student in more than one class gets one area per class, so their records are never mixed.
 * The choice lives in the URL (`?class=<id>`) so a link opens the right class. An id that is
 * not one of their classes falls back to the first class.
 */
export function useStudentClassScope(enabled = true) {
  const classesQuery = useStudentClasses(enabled)
  const [params, setParams] = useSearchParams()

  const classes = React.useMemo<ScopedClass[]>(() => {
    const seen = new Map<number, ScopedClass>()
    for (const mapping of classesQuery.data ?? []) {
      const room = mapping.class_room
      if (room && !seen.has(room.id)) seen.set(room.id, { id: room.id, name: room.name })
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [classesQuery.data])

  const requested = Number(params.get('class'))
  const classId = classes.some((c) => c.id === requested) ? requested : (classes[0]?.id ?? null)

  const setClassId = React.useCallback(
    (id: number) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('class', String(id))
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return { classes, classId, setClassId, isPending: classesQuery.isPending }
}

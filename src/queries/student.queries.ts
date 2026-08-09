import { useQuery } from '@tanstack/react-query'

import { studentApi } from '@/api/student.api'
import { STALE, qk } from './keys'

export function useStudentClasses(enabled = true) {
  return useQuery({
    queryKey: qk.student.myClasses(),
    queryFn: studentApi.myClasses,
    staleTime: STALE.reference,
    enabled,
  })
}

export function useStudentAttendance(enabled = true) {
  return useQuery({
    queryKey: qk.student.attendance(),
    queryFn: studentApi.attendance,
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useStudentTopics(enabled = true) {
  return useQuery({
    queryKey: qk.student.topics(),
    queryFn: studentApi.topics,
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useStudentMeetings(enabled = true) {
  return useQuery({
    queryKey: qk.student.meetings(),
    queryFn: studentApi.meetings,
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useStudentMaterials(enabled = true) {
  return useQuery({
    queryKey: qk.student.materials(),
    queryFn: studentApi.materials,
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useStudentGrades(enabled = true) {
  return useQuery({
    queryKey: qk.student.grades(),
    queryFn: studentApi.grades,
    staleTime: STALE.transactional,
    enabled,
  })
}

/** The weekly grid — recurring rules, which barely change. */
export function useStudentTimetable(enabled = true) {
  return useQuery({
    queryKey: qk.student.timetable(),
    queryFn: studentApi.timetable,
    staleTime: STALE.reference,
    enabled,
  })
}

/** One date's classes, with the countdown the server computed. */
export function useStudentDaySchedule(onDate?: string, enabled = true) {
  return useQuery({
    queryKey: qk.student.timetableDay(onDate),
    queryFn: () => studentApi.timetableDay(onDate),
    staleTime: STALE.schedule,
    enabled,
  })
}

/**
 * "What's next", across days — the next lesson in a subject may not be until
 * next week. Refetched on an interval so the countdown stays true.
 */
export function useStudentUpcoming(enabled = true) {
  return useQuery({
    queryKey: qk.student.timetableUpcoming(),
    queryFn: () => studentApi.timetableUpcoming(),
    staleTime: STALE.schedule,
    refetchInterval: 5 * 60_000,
    enabled,
  })
}

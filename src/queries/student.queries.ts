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

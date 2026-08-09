import { useAuth } from '@/providers/auth-provider'
import { useStudentClasses } from '@/queries/student.queries'
import { AdminScopeNotice, NotEnrolledState } from '@/components/feedback/states'

export function useIsAdminViewingStudent() {
  const { role } = useAuth()
  return role === 'ADMIN'
}

export function AdminStudentNotice() {
  const isAdmin = useIsAdminViewingStudent()
  if (!isAdmin) return null
  return (
    <div className="mb-5">
      <AdminScopeNotice area="student" />
    </div>
  )
}

/**
 * A student with no enrollment gets `[]` from every endpoint, which is not
 * the same as "no records yet". This distinguishes the two so the empty state
 * tells the truth.
 */
export function useEnrollmentStatus() {
  const isAdmin = useIsAdminViewingStudent()
  const classesQuery = useStudentClasses(!isAdmin)
  return {
    isAdmin,
    isPending: classesQuery.isPending,
    isError: classesQuery.isError,
    error: classesQuery.error,
    refetch: classesQuery.refetch,
    mappings: classesQuery.data ?? [],
    notEnrolled: !classesQuery.isPending && !classesQuery.isError && (classesQuery.data ?? []).length === 0,
    /** The single class the backend resolves for this student. */
    classRoom: classesQuery.data?.[0]?.class_room ?? null,
  }
}

export { NotEnrolledState }

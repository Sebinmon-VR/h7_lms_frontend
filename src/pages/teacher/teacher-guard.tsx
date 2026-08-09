import { useAuth } from '@/providers/auth-provider'
import { AdminScopeNotice } from '@/components/feedback/states'

/**
 * Teacher endpoints scope every query to the token's own teacher id, so an
 * administrator opening these pages legitimately receives empty arrays.
 * Rendering "no data yet" there would be a lie, so we say what is actually
 * happening instead.
 */
export function useIsAdminViewingTeacher() {
  const { role } = useAuth()
  return role === 'ADMIN'
}

export function AdminTeacherNotice() {
  const isAdmin = useIsAdminViewingTeacher()
  if (!isAdmin) return null
  return (
    <div className="mb-5">
      <AdminScopeNotice area="teacher" />
    </div>
  )
}

import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'

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

/**
 * Where an admin should go instead.
 *
 * Meetings and materials now have real system-wide admin endpoints, so for
 * those two the honest answer is a link rather than an explanation of why the
 * page is empty. The rest still have no admin equivalent.
 */
const ADMIN_EQUIVALENT = {
  meetings: { to: '/admin/meetings', label: 'Admin → Meetings' },
  materials: { to: '/admin/materials', label: 'Admin → Materials' },
  timetable: { to: '/admin/timetable', label: 'Admin → Timetable' },
} as const

export function AdminTeacherNotice({
  area,
}: { area?: keyof typeof ADMIN_EQUIVALENT } = {}) {
  const isAdmin = useIsAdminViewingTeacher()
  if (!isAdmin) return null

  const equivalent = area ? ADMIN_EQUIVALENT[area] : undefined
  if (!equivalent) {
    return (
      <div className="mb-5">
        <AdminScopeNotice area="teacher" />
      </div>
    )
  }

  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-info/30 bg-info/8 p-4 text-sm">
      <Lock className="mt-0.5 size-4 shrink-0 text-info" />
      <div>
        <p className="font-medium text-foreground">You are signed in as an administrator</p>
        <p className="mt-0.5 text-muted-foreground">
          This page only shows records belonging to the signed-in teacher, and you have no teaching
          assignments of your own.{' '}
          <Link to={equivalent.to} className="font-medium text-primary hover:underline">
            {equivalent.label}
          </Link>{' '}
          shows every teacher&rsquo;s, and can create and edit on their behalf.
        </p>
      </div>
    </div>
  )
}

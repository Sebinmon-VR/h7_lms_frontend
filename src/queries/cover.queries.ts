import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { coverApi } from '@/api/cover.api'
import type { ApiDate, CoverCreate, TeacherSummaryOut } from '@/api/types'
import { STALE, qk } from './keys'
import { useTeachingStaff } from './admin.queries'

export function useCoverDay(day: ApiDate, isAdmin: boolean, enabled = true) {
  return useQuery({
    queryKey: qk.cover.day(day, isAdmin ? 'admin' : 'mine'),
    queryFn: () => (isAdmin ? coverApi.adminDay(day) : coverApi.myDay(day)),
    staleTime: STALE.transactional,
    enabled: enabled && !!day,
  })
}

/** Everyone who can take a period, as id and name. */
export function useCoverStaff(isAdmin: boolean) {
  const adminStaff = useTeachingStaff(isAdmin)
  const teacherStaff = useQuery({
    queryKey: ['cover', 'staff'],
    queryFn: coverApi.staff,
    staleTime: STALE.reference,
    enabled: !isAdmin,
  })
  const source = isAdmin ? adminStaff : teacherStaff
  const staff: TeacherSummaryOut[] = isAdmin
    ? (adminStaff.data ?? []).map((u) => ({ id: u.id, full_name: u.full_name }))
    : (teacherStaff.data ?? [])
  return { staff, isPending: source.isPending }
}

/** Sets or clears a cover, then refreshes every cover view and the timetable. */
export function useCoverMutations(isAdmin: boolean) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.cover.root })

  const assign = useMutation({
    mutationFn: (body: CoverCreate) =>
      isAdmin ? coverApi.adminAssign(body) : coverApi.myAssign(body),
    onSuccess: () => {
      toast.success('Cover set for that day.')
      refresh()
    },
  })

  const clear = useMutation({
    mutationFn: ({ entryId, day }: { entryId: number; day: ApiDate }) =>
      isAdmin ? coverApi.adminClear(entryId, day) : coverApi.myClear(entryId, day),
    onSuccess: () => {
      toast.success('The timetabled teacher is back on that period.')
      refresh()
    },
  })

  return { assign, clear }
}

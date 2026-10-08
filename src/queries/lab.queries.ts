import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { labApi, labManageApi, type LabAssignmentInput, type LabAttemptInput } from '@/api/lab.api'
import { STALE, qk } from './keys'

export function useMyLabAssignments(enabled = true) {
  return useQuery({ queryKey: qk.lab.mine(), queryFn: labApi.myAssignments, staleTime: 30_000, enabled })
}

/** Records a finished run; the server pays XP and coins the first time. */
export function useRecordLabAttempt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: LabAttemptInput) => labApi.recordAttempt(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.lab.mine() })
      void qc.invalidateQueries({ queryKey: qk.arena.home() })
    },
  })
}

export function useLabAssignments(classId: number | null) {
  return useQuery({
    queryKey: qk.lab.manage(classId ?? 0),
    queryFn: () => labManageApi.assignments(classId ?? undefined),
    enabled: classId != null,
    staleTime: STALE.transactional,
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: qk.lab.root })
}

export function useCreateLabAssignment() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: LabAssignmentInput) => labManageApi.create(body),
    onSuccess: (a) => {
      invalidate()
      toast.success(`“${a.title}” set for the class`)
    },
  })
}

export function useUpdateLabAssignment() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<LabAssignmentInput> }) => labManageApi.update(id, body),
    onSuccess: invalidate,
  })
}

export function useDeleteLabAssignment() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => labManageApi.remove(id),
    onSuccess: () => {
      invalidate()
      toast.success('Experiment removed')
    },
  })
}

export function useLabResults(id: number | null) {
  return useQuery({
    queryKey: qk.lab.results(id ?? 0),
    queryFn: () => labManageApi.results(id as number),
    enabled: id != null,
    staleTime: 15_000,
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { admissionRequestsApi } from '@/api/admission-requests.api'
import type {
  AdmissionRequestAdmit,
  AdmissionRequestStatusUpdate,
  Program,
} from '@/api/types'
import { STALE, qk } from './keys'

/**
 * Hooks for the admission-request queue.
 *
 * Every write invalidates the whole subtree: a status change moves a row
 * between the chips, an admit changes the summary, and a delete removes a
 * row the list still holds. Admitting ALSO touches the users, enrollments and
 * families caches, because it created records in all three.
 */

// ------------------------------------------------------------------ reads

export function useAdmissionRequests(program: Program = 'LMS', enabled = true) {
  return useQuery({
    queryKey: qk.admissionRequests.list(program),
    queryFn: () => admissionRequestsApi.list({ program }),
    // Short: this is an inbox, and a request that landed a minute ago should
    // be there when the admin comes back to the tab.
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useAdmissionRequestSummary(program: Program = 'LMS', enabled = true) {
  return useQuery({
    queryKey: qk.admissionRequests.summary(program),
    queryFn: () => admissionRequestsApi.summary(program),
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useAdmissionRequest(requestId: number | null) {
  return useQuery({
    queryKey: qk.admissionRequests.detail(requestId ?? 0),
    queryFn: () => admissionRequestsApi.get(requestId as number),
    staleTime: STALE.transactional,
    enabled: requestId != null,
  })
}

// -------------------------------------------------------------- mutations

function invalidateRequests(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.admissionRequests.root })
}

export function useSetAdmissionRequestStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ requestId, body }: { requestId: number; body: AdmissionRequestStatusUpdate }) =>
      admissionRequestsApi.setStatus(requestId, body),
    onSuccess: (request, { body }) => {
      invalidateRequests(qc)
      qc.setQueryData(qk.admissionRequests.detail(request.id), request)
      const label = {
        NEW: 'reopened',
        UNDER_REVIEW: 'marked under review',
        WAITLISTED: 'waitlisted',
        REJECTED: 'declined',
      }[body.status]
      toast.success(`${request.student_full_name} ${label}`, {
        description: body.notify_applicant ? 'The family has been emailed.' : undefined,
      })
    },
  })
}

export function useAddAdmissionRequestNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ requestId, body }: { requestId: number; body: string }) =>
      admissionRequestsApi.addNote(requestId, { body }),
    onSuccess: (request) => {
      invalidateRequests(qc)
      qc.setQueryData(qk.admissionRequests.detail(request.id), request)
    },
  })
}

/**
 * Admit. Reported in place by the dialog — the result carries passwords that
 * must be shown once and warnings that need reading — so no success toast
 * here; the error toast stays because a refused admit created nothing.
 */
export function useAdmitAdmissionRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ requestId, body }: { requestId: number; body: AdmissionRequestAdmit }) =>
      admissionRequestsApi.admit(requestId, body),
    onSuccess: (result) => {
      invalidateRequests(qc)
      qc.setQueryData(qk.admissionRequests.detail(result.request.id), result.request)
      // A student, an enrollment and possibly a parent and a household now exist.
      void qc.invalidateQueries({ queryKey: qk.admin.usersRoot() })
      void qc.invalidateQueries({ queryKey: qk.admin.enrollments() })
      void qc.invalidateQueries({ queryKey: qk.families.root })
      void qc.invalidateQueries({ queryKey: qk.admissions.root })
    },
  })
}

export function useDeleteAdmissionRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (requestId: number) => admissionRequestsApi.remove(requestId),
    onSuccess: () => {
      invalidateRequests(qc)
      toast.success('Admission request deleted')
    },
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { admissionRequestsApi } from '@/api/admission-requests.api'
import type {
  AdmissionDocumentsRequest,
  AdmissionDocumentsReview,
  AdmissionPaymentRequest,
  AdmissionPaymentReview,
  AdmissionRequestAdmit,
  AdmissionRequestOut,
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

/**
 * Gateway, currency and mail status for the pipeline dialogs. Reference
 * data: it changes when somebody edits the deployment, not during a shift.
 */
export function useAdmissionPipelineConfig(program: Program = 'LMS', enabled = true) {
  return useQuery({
    queryKey: qk.admissionRequests.config(program),
    queryFn: () => admissionRequestsApi.config(program),
    staleTime: STALE.reference,
    enabled,
  })
}

// -------------------------------------------------------------- mutations

function invalidateRequests(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.admissionRequests.root })
}

/**
 * Put a request the server just returned into the detail entry AND every
 * cached list, so the open sheet (which reads from the list) shows the new
 * stage immediately rather than after the refetch the invalidation starts.
 */
function applyRequest(qc: QueryClient, request: AdmissionRequestOut) {
  qc.setQueryData(qk.admissionRequests.detail(request.id), request)
  qc.setQueriesData<AdmissionRequestOut[]>(
    { queryKey: [...qk.admissionRequests.root, 'list'] },
    (rows) => rows?.map((row) => (row.id === request.id ? request : row)),
  )
  invalidateRequests(qc)
}

const EMAILED = 'The family has been emailed.'
const NOT_EMAILED = 'The email could not be sent. Copy the portal link and share it with the family.'

/**
 * What the toast says about the email. The response carries
 * `applicant_notified`; `asked` is whether the office wanted one at all.
 */
function emailNote(request: AdmissionRequestOut, asked: boolean | undefined): string | undefined {
  if (!asked || request.applicant_notified == null) return undefined
  return request.applicant_notified ? EMAILED : NOT_EMAILED
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
        description: emailNote(request, body.notify_applicant),
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
      applyRequest(qc, result.request)
      // A student, an enrollment and possibly a parent and a household now exist.
      void qc.invalidateQueries({ queryKey: qk.admin.usersRoot() })
      void qc.invalidateQueries({ queryKey: qk.admin.enrollments() })
      void qc.invalidateQueries({ queryKey: qk.families.root })
      void qc.invalidateQueries({ queryKey: qk.admissions.root })
      // A confirmed admission fee may have been entered as a receipt.
      if (result.receipt_id) void qc.invalidateQueries({ queryKey: qk.finance.root })
    },
  })
}

// ------------------------------------------------- the selection pipeline
//
// Each of these answers with the request as it now stands, including
// `applicant_notified`: whether the step's email to the family actually went.

export function useRequestAdmissionDocuments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ requestId, body }: { requestId: number; body: AdmissionDocumentsRequest }) =>
      admissionRequestsApi.requestDocuments(requestId, body),
    onSuccess: (request, { body }) => {
      applyRequest(qc, request)
      toast.success(`Documents requested from ${request.contact_name ?? 'the family'}`, {
        description: !body.notify_applicant
          ? 'No email sent. Share the portal link with the family yourself.'
          : request.applicant_notified
            ? `${EMAILED} The link to their upload page is in the email.`
            : request.status === 'DOCUMENTS_VERIFIED'
              ? 'Every document on the list is already verified, so nothing was sent.'
              : NOT_EMAILED,
      })
    },
  })
}

export function useReviewAdmissionDocuments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ requestId, body }: { requestId: number; body: AdmissionDocumentsReview }) =>
      admissionRequestsApi.reviewDocuments(requestId, body),
    onSuccess: (request, { body }) => {
      applyRequest(qc, request)
      const rejected = body.decisions.filter((d) => d.status === 'REJECTED').length
      const title =
        request.status === 'DOCUMENTS_VERIFIED'
          ? 'Documents verified'
          : rejected > 0
            ? `${rejected === 1 ? 'One document' : `${rejected} documents`} sent back to the family`
            : 'Review saved'
      toast.success(title, {
        description: emailNote(request, body.notify_applicant),
      })
    },
  })
}

export function useRequestAdmissionPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ requestId, body }: { requestId: number; body: AdmissionPaymentRequest }) =>
      admissionRequestsApi.requestPayment(requestId, body),
    onSuccess: (request, { body }) => {
      applyRequest(qc, request)
      const viaGateway = request.payment?.provider === 'RAZORPAY'
      toast.success('Payment requested', {
        description: [
          viaGateway ? 'A Razorpay payment link was created and confirms itself once paid.' : null,
          emailNote(request, body.notify_applicant) ?? null,
        ]
          .filter(Boolean)
          .join(' ') || undefined,
      })
    },
  })
}

export function useReviewAdmissionPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ requestId, body }: { requestId: number; body: AdmissionPaymentReview }) =>
      admissionRequestsApi.reviewPayment(requestId, body),
    onSuccess: (request, { body }) => {
      applyRequest(qc, request)
      toast.success(body.approve ? 'Payment confirmed' : 'Payment details sent back to the family', {
        description: emailNote(request, body.notify_applicant),
      })
    },
  })
}

/** Reads the gateway link back now. Not an error when it is still unpaid. */
export function useCheckAdmissionPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (requestId: number) => admissionRequestsApi.checkPayment(requestId),
    onSuccess: (request) => {
      applyRequest(qc, request)
      if (request.payment?.status === 'VERIFIED') {
        toast.success('Payment received', {
          description: 'Razorpay confirmed the payment. The application is ready to admit.',
        })
      } else {
        toast.info('Not paid yet', {
          description: request.payment?.gateway_status
            ? `Razorpay reports the link as ${request.payment.gateway_status}.`
            : 'Razorpay has no payment on this link yet.',
        })
      }
    },
  })
}

export function useResendAdmissionEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (requestId: number) => admissionRequestsApi.resend(requestId),
    onSuccess: (result) => {
      // An older request gets its portal link on the first resend; refetch
      // so the sheet can show it.
      invalidateRequests(qc)
      if (result.sent) toast.success('Email sent again', { description: result.detail })
      else toast.warning('The email did not go', { description: result.detail })
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

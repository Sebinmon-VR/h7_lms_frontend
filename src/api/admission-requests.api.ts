import { cleanParams, del, get, post } from './client'
import type {
  AdmissionDocumentsRequest,
  AdmissionDocumentsReview,
  AdmissionPaymentRequest,
  AdmissionPaymentReview,
  AdmissionPipelineConfig,
  AdmissionRequestAdmit,
  AdmissionRequestAdmitResult,
  AdmissionRequestNoteCreate,
  AdmissionRequestOut,
  AdmissionRequestStatus,
  AdmissionRequestStatusUpdate,
  AdmissionRequestSummary,
  AdmissionResendResult,
  Program,
} from './types'

const BASE = '/admin/admissions/requests'

/**
 * The office's side of the website admission form.
 *
 * The form itself lives on the school's public site and posts to
 * `/admissions/requests` with no login; nothing here calls that. What this
 * app does is read the queue and decide: review, waitlist, admit, decline,
 * delete — and run the selection pipeline in between (ask for documents,
 * verify them, ask for the fee, confirm it), which the family answers on a
 * private portal page linked from their emails.
 *
 * Two things worth knowing before wiring a screen to it:
 *  - `admit` is the one call that CREATES things — a student, an enrollment,
 *    optionally a parent login and passwords. It returns them, and any step
 *    that failed after the student existed comes back under `warnings` rather
 *    than as an error, because the student is real by then.
 *  - An ADMITTED request cannot be moved by `setStatus` and cannot be admitted
 *    twice; both are a 400 with an explanation.
 */
export const admissionRequestsApi = {
  list: (
    params: {
      status?: AdmissionRequestStatus
      program?: Program
      classId?: number
      academicYearId?: number
    } = {},
  ) =>
    get<AdmissionRequestOut[]>(BASE, {
      params: cleanParams({
        status: params.status,
        program: params.program,
        class_id: params.classId,
        academic_year_id: params.academicYearId,
      }),
    }),

  summary: (program?: Program) =>
    get<AdmissionRequestSummary>(`${BASE}/summary`, { params: cleanParams({ program }) }),

  get: (requestId: number) => get<AdmissionRequestOut>(`${BASE}/${requestId}`),

  setStatus: (requestId: number, body: AdmissionRequestStatusUpdate) =>
    post<AdmissionRequestOut>(`${BASE}/${requestId}/status`, body),

  addNote: (requestId: number, body: AdmissionRequestNoteCreate) =>
    post<AdmissionRequestOut>(`${BASE}/${requestId}/notes`, body),

  admit: (requestId: number, body: AdmissionRequestAdmit) =>
    post<AdmissionRequestAdmitResult>(`${BASE}/${requestId}/admit`, body),

  // ---- the selection pipeline: documents, then the fee -------------------

  /** Whether a payment gateway is set up, the school currency, and mail status. */
  config: (program: Program = 'LMS') =>
    get<AdmissionPipelineConfig>(`${BASE}/config`, { params: cleanParams({ program }) }),

  /** Select the applicant and ask for documents; the family uploads on their portal page. */
  requestDocuments: (requestId: number, body: AdmissionDocumentsRequest) =>
    post<AdmissionRequestOut>(`${BASE}/${requestId}/documents/request`, body),

  /** Accept or reject each document. Any rejection sends the family back to upload again. */
  reviewDocuments: (requestId: number, body: AdmissionDocumentsReview) =>
    post<AdmissionRequestOut>(`${BASE}/${requestId}/documents/review`, body),

  /** Ask for the fee. Replaces any earlier request (and cancels its gateway link). */
  requestPayment: (requestId: number, body: AdmissionPaymentRequest) =>
    post<AdmissionRequestOut>(`${BASE}/${requestId}/payment/request`, body),

  /** Confirm the fee, or send the family's proof back with a note. */
  reviewPayment: (requestId: number, body: AdmissionPaymentReview) =>
    post<AdmissionRequestOut>(`${BASE}/${requestId}/payment/review`, body),

  /** Read a gateway link back now; confirms the fee if it was paid. */
  checkPayment: (requestId: number) =>
    post<AdmissionRequestOut>(`${BASE}/${requestId}/payment/check`),

  /** Send the current step's email to the family again. */
  resend: (requestId: number) => post<AdmissionResendResult>(`${BASE}/${requestId}/resend`),

  /** Removes the request. A student created from it is a separate record and stays. */
  remove: (requestId: number) => del(`${BASE}/${requestId}`),
}

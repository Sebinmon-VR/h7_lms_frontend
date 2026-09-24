import { cleanParams, del, get, post } from './client'
import type {
  AdmissionRequestAdmit,
  AdmissionRequestAdmitResult,
  AdmissionRequestNoteCreate,
  AdmissionRequestOut,
  AdmissionRequestStatus,
  AdmissionRequestStatusUpdate,
  AdmissionRequestSummary,
  Program,
} from './types'

const BASE = '/admin/admissions/requests'

/**
 * The office's side of the website admission form.
 *
 * The form itself lives on the school's public site and posts to
 * `/admissions/requests` with no login; nothing here calls that. What this
 * app does is read the queue and decide: review, waitlist, admit, decline,
 * delete.
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

  /** Removes the request. A student created from it is a separate record and stays. */
  remove: (requestId: number) => del(`${BASE}/${requestId}`),
}

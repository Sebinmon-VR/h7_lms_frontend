/**
 * Wire types for online admission requests — the form on the school's public
 * website and the office's queue for it.
 *
 * Next door to `school.types.ts` for size, and re-exported from `types.ts` so
 * `@/api/types` stays the one import surface. The conventions of `types.ts`
 * hold: dates are "YYYY-MM-DD", datetimes are naive UTC strings, ids are
 * epoch-millisecond integers.
 */

import type { ApiDate, ApiDateTime, CredentialsIssued, UserOut } from './types'
import type { GuardianRelation } from './school.types'

/**
 * Where a request has got to.
 *
 * ADMITTED is terminal: a student account exists and the request can only be
 * deleted, never moved. REJECTED and WAITLISTED can be reopened — a waiting
 * list exists precisely so a "no" in April can become a "yes" in August.
 */
export type AdmissionRequestStatus = 'NEW' | 'UNDER_REVIEW' | 'WAITLISTED' | 'ADMITTED' | 'REJECTED'

/** A parent or guardian as the family entered them. Exactly one is primary. */
export interface AdmissionParent {
  relation: GuardianRelation
  full_name: string
  phone?: string | null
  email?: string | null
  occupation?: string | null
  is_primary: boolean
}

export interface AdmissionRequestNote {
  author_id?: number | null
  author_name?: string | null
  body: string
  at?: ApiDateTime | null
}

export interface AdmissionRequestHistoryEntry {
  status: string
  at?: ApiDateTime | null
  by?: number | null
  by_name?: string | null
  note?: string | null
}

export interface AdmissionRequestOut {
  id: number
  /** "ADR-2026-0007" — what the family quotes on the phone. */
  reference: string
  program: string
  status: AdmissionRequestStatus

  student_full_name: string
  date_of_birth?: ApiDate | null
  gender?: string | null
  blood_group?: string | null
  nationality?: string | null
  previous_school?: string | null
  previous_class?: string | null

  class_id?: number | null
  /** Snapshotted at submission; re-resolved from the live class when it still exists. */
  class_name?: string | null
  academic_year_id?: number | null
  academic_year_name?: string | null
  syllabus?: string | null
  medium?: string | null

  parents: AdmissionParent[]
  contact_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null

  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null

  sibling_name?: string | null
  transport_required: boolean
  medical_notes?: string | null
  message?: string | null
  how_heard?: string | null
  source?: string | null

  submitted_at?: ApiDateTime | null
  updated_at?: ApiDateTime | null
  reviewed_by?: number | null
  reviewed_by_name?: string | null
  reviewed_at?: ApiDateTime | null
  decision_note?: string | null

  /** Filled by an admit, and only then. */
  admitted_student_id?: number | null
  admitted_student_email?: string | null
  admitted_parent_id?: number | null
  admitted_class_id?: number | null
  admitted_class_name?: string | null
  admitted_year_id?: number | null
  admitted_year_name?: string | null
  enrollment_id?: number | null
  admission_number?: string | null

  internal_notes: AdmissionRequestNote[]
  history: AdmissionRequestHistoryEntry[]
}

export interface AdmissionRequestSummary {
  total: number
  /** NEW + UNDER_REVIEW + WAITLISTED — what still needs a decision. */
  open: number
  by_status: Record<string, number>
}

/** Body of `POST /admin/admissions/requests/{id}/status`. Never ADMITTED — that has its own call. */
export interface AdmissionRequestStatusUpdate {
  status: Exclude<AdmissionRequestStatus, 'ADMITTED'>
  /** Shown to the family verbatim when `notify_applicant` is on. */
  note?: string | null
  /** Emails the primary contact. Only sent for WAITLISTED and REJECTED. */
  notify_applicant?: boolean
}

export interface AdmissionRequestNoteCreate {
  body: string
}

/**
 * Body of `POST /admin/admissions/requests/{id}/admit`.
 *
 * Every field is optional because the request already carries the answers;
 * these override them. Blank identifiers are issued by the school's AUTO
 * setting, and a blank student email is derived from the name.
 */
export interface AdmissionRequestAdmit {
  class_id?: number | null
  academic_year_id?: number | null
  admission_category_id?: number | null
  admission_number?: string | null
  roll_number?: string | null
  student_email?: string | null
  /** A PARENT login for the primary contact, or a link to an existing one with that email. */
  create_parent_account?: boolean
  parent_email?: string | null
  /** Issue passwords and email them to the primary contact. */
  send_credentials?: boolean
  /** Write to the family that the student has been admitted. */
  notify_applicant?: boolean
  note?: string | null
}

export interface AdmissionRequestAdmitResult {
  request: AdmissionRequestOut
  student: UserOut
  parent?: UserOut | null
  parent_created: boolean
  enrollment_id?: number | null
  /** Passwords issued during the admit, returned ONCE. Never cached or persisted. */
  credentials: CredentialsIssued[]
  /** Steps that did not go to plan after the student was created. */
  warnings: string[]
  applicant_notified: boolean
  detail: string
}

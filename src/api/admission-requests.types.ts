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
 *
 * The six DOCUMENTS_* / PAYMENT_* states are the selection pipeline, driven
 * by the family's private portal page: the office asks for documents, the
 * family uploads them, the office verifies; then a fee is asked for, paid and
 * confirmed. Each step can be skipped by admitting directly.
 */
export type AdmissionRequestStatus =
  | 'NEW'
  | 'UNDER_REVIEW'
  | 'WAITLISTED'
  | 'DOCUMENTS_REQUESTED'
  | 'DOCUMENTS_SUBMITTED'
  | 'DOCUMENTS_VERIFIED'
  | 'PAYMENT_REQUESTED'
  | 'PAYMENT_SUBMITTED'
  | 'PAYMENT_VERIFIED'
  | 'ADMITTED'
  | 'REJECTED'

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

// ------------------------------------------------- documents and the fee

/**
 * One requested document's state. PENDING nothing uploaded; UPLOADED files
 * are there but the family has not pressed Submit; SUBMITTED waiting for the
 * office; ACCEPTED checked; REJECTED to be uploaded again (`review_note` says
 * why).
 */
export type AdmissionDocumentStatus = 'PENDING' | 'UPLOADED' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED'

export type AdmissionPaymentStatus = 'REQUESTED' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED'

/** One uploaded file. `url` is a short-lived signed link — open it, never store it. */
export interface AdmissionFileOut {
  id: string
  name: string
  content_type?: string | null
  size?: number | null
  uploaded_at?: ApiDateTime | null
  url?: string | null
}

export interface AdmissionDocumentOut {
  /** Stable per request; what a review decision names. */
  key: string
  label: string
  description?: string | null
  required: boolean
  status: AdmissionDocumentStatus
  files: AdmissionFileOut[]
  review_note?: string | null
  reviewed_at?: ApiDateTime | null
  reviewed_by_name?: string | null
}

/** Proof of payment sent by the family: a transaction id, a screenshot, or both. */
export interface AdmissionPaymentSubmissionOut {
  id: string
  transaction_id?: string | null
  paid_on?: ApiDate | null
  amount?: number | null
  method?: string | null
  note?: string | null
  files: AdmissionFileOut[]
  submitted_at?: ApiDateTime | null
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
  review_note?: string | null
}

/**
 * The fee asked of the family. RAZORPAY: the link was made through the
 * gateway and its status can be read back. MANUAL: the office supplied a link
 * or instructions and confirms the money by hand.
 */
export interface AdmissionPaymentOut {
  amount: number
  currency: string
  description: string
  due_date?: ApiDate | null
  link_url?: string | null
  instructions?: string | null
  provider: 'RAZORPAY' | 'MANUAL'
  gateway_link_id?: string | null
  gateway_status?: string | null
  status: AdmissionPaymentStatus
  requested_at?: ApiDateTime | null
  requested_by_name?: string | null
  verified_at?: ApiDateTime | null
  verified_by_name?: string | null
  verified_via?: 'OFFICE' | 'GATEWAY' | null
  gateway_payment_id?: string | null
  amount_paid?: number | null
  review_note?: string | null
  receipt_id?: number | null
  submissions: AdmissionPaymentSubmissionOut[]
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

  /**
   * The family's private page — upload documents, pay, follow progress.
   * Shareable by WhatsApp when an email has gone astray.
   */
  portal_url?: string | null
  documents: AdmissionDocumentOut[]
  documents_note?: string | null
  documents_deadline?: ApiDate | null
  documents_requested_at?: ApiDateTime | null
  documents_submitted_at?: ApiDateTime | null
  documents_verified_at?: ApiDateTime | null
  payment?: AdmissionPaymentOut | null

  /** On the response to an action that may email the family: whether the email went. */
  applicant_notified?: boolean | null
  internal_notes: AdmissionRequestNote[]
  history: AdmissionRequestHistoryEntry[]
}

export interface AdmissionRequestSummary {
  total: number
  /** Everything except ADMITTED and REJECTED — what is still in play. */
  open: number
  by_status: Record<string, number>
}

/**
 * Body of `POST /admin/admissions/requests/{id}/status`. Only the manual
 * moves: the pipeline states are reached through their own calls, and
 * ADMITTED through the admit call.
 */
export interface AdmissionRequestStatusUpdate {
  status: 'NEW' | 'UNDER_REVIEW' | 'WAITLISTED' | 'REJECTED'
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
  /** Issue passwords; they go in the welcome email when `notify_applicant` is on. */
  send_credentials?: boolean
  /** The welcome email: admission details, app links and the login details — one email. */
  notify_applicant?: boolean
  note?: string | null
  /** When the fee was confirmed through the portal, enter it in Finance as a receipt. */
  record_fee_receipt?: boolean
  /** The fee head for that receipt. Omitted: the admission-charge head. */
  fee_head_id?: number | null
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
  /** The Finance receipt entered for the confirmed admission fee, when one was. */
  receipt_id?: number | null
  detail: string
}

// ------------------------------------------------- pipeline request bodies

/** One document to ask for. `key` is derived from the label when omitted. */
export interface AdmissionDocumentSpec {
  key?: string | null
  label: string
  description?: string | null
  required?: boolean
}

/**
 * Body of `POST /{id}/documents/request`. Selects the applicant and asks for
 * documents; asking again keeps the uploads of a document with the same key.
 */
export interface AdmissionDocumentsRequest {
  documents: AdmissionDocumentSpec[]
  /** Included in the email verbatim. */
  note?: string | null
  deadline?: ApiDate | null
  notify_applicant?: boolean
}

export interface AdmissionDocumentDecision {
  key: string
  status: 'ACCEPTED' | 'REJECTED'
  /** Required for a rejection: what the family has to fix. */
  note?: string | null
}

/**
 * Body of `POST /{id}/documents/review`. Any rejection sends the family back
 * to upload those again; every required document accepted verifies the set.
 */
export interface AdmissionDocumentsReview {
  decisions: AdmissionDocumentDecision[]
  note?: string | null
  notify_applicant?: boolean
}

/**
 * Body of `POST /{id}/payment/request`. With the gateway set up and
 * `use_gateway` on, the link is created automatically; otherwise
 * `payment_link` and/or `instructions` are required. Asking again replaces
 * the previous request.
 */
export interface AdmissionPaymentRequest {
  amount: number
  /** Defaults to the school currency. */
  currency?: string | null
  description?: string
  due_date?: ApiDate | null
  payment_link?: string | null
  instructions?: string | null
  use_gateway?: boolean
  note?: string | null
  notify_applicant?: boolean
}

/**
 * Body of `POST /{id}/payment/review`. Confirming works without any proof
 * (cash at the counter); sending back needs a submission and a note.
 */
export interface AdmissionPaymentReview {
  approve: boolean
  note?: string | null
  notify_applicant?: boolean
}

export interface AdmissionResendResult {
  sent: boolean
  detail: string
}

/** `GET /admin/admissions/requests/config` — what the office's dialogs need to know. */
export interface AdmissionPipelineConfig {
  gateway_available: boolean
  gateway_provider?: string | null
  currency: string
  portal_base_url?: string | null
  email_configured: boolean
}

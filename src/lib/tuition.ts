import type {
  AcademicTerm,
  InvoiceOut,
  InvoiceStatus,
  LibraryApprovalStatus,
  LibraryVisibility,
  PackageBillingMode,
  PackageStatusOut,
  Program,
  TuitionAssessmentCategory,
  TuitionAttendanceTotals,
  TuitionEnrollmentStatus,
  TuitionMaterialType,
  TuitionSessionOut,
  TuitionSessionStatus,
  TuitionSlotOut,
  UserOut,
} from '@/api/types'
import { DAYS } from './timetable'

/**
 * Presentation rules for the online tuition product.
 *
 * Everything here exists because a tuition screen has to answer questions the
 * LMS never asks: is this class running right now, may the teacher stop it,
 * does it count on the invoice, and — the one that actually bites — whose
 * clock is the time on the screen.
 */

// ---------------------------------------------------------- programme access

/**
 * Whether an account may reach the tuition product.
 *
 * A missing `programs` list reads as LMS-only, matching the backend: every
 * profile created before tuition existed was a school account, and guessing
 * the other way would show a whole school a product it never bought.
 */
export function hasProgram(user: Pick<UserOut, 'programs'> | null | undefined, program: Program) {
  if (!user) return false
  const programs = user.programs?.length ? user.programs : (['LMS'] as Program[])
  return programs.includes(program)
}

export function isTuitionUser(user: Pick<UserOut, 'programs'> | null | undefined) {
  return hasProgram(user, 'TUITION')
}

export const PROGRAM_LABEL: Record<Program, string> = {
  LMS: 'School',
  TUITION: 'Online tuition',
}

// ------------------------------------------------------------------- tones

type Tone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

export const SESSION_STATUS_LABEL: Record<TuitionSessionStatus, string> = {
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW_TEACHER: 'Teacher absent',
  NO_SHOW_STUDENT: 'Student absent',
}

/**
 * The two no-shows are coloured differently on purpose.
 *
 * A class the teacher missed is the programme's failure and is not chargeable;
 * a class the student missed generally is. Painting both the same red would
 * hide the distinction that decides the invoice.
 */
export const SESSION_STATUS_TONE: Record<TuitionSessionStatus, Tone> = {
  SCHEDULED: 'info',
  IN_PROGRESS: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'neutral',
  NO_SHOW_TEACHER: 'danger',
  NO_SHOW_STUDENT: 'warning',
}

export const ENROLLMENT_STATUS_LABEL: Record<TuitionEnrollmentStatus, string> = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

export const ENROLLMENT_STATUS_TONE: Record<TuitionEnrollmentStatus, Tone> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  COMPLETED: 'neutral',
  CANCELLED: 'neutral',
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Issued',
  PARTIALLY_PAID: 'Part paid',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
}

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, Tone> = {
  DRAFT: 'neutral',
  ISSUED: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  CANCELLED: 'neutral',
}

export const VISIBILITY_LABEL: Record<LibraryVisibility, string> = {
  PRIVATE: 'Only me',
  ENROLLMENT: 'This student and teacher',
  SUBJECT: 'Everyone taking this subject',
  PROGRAM: 'The whole tuition library',
}

/** Short form for a badge, where the sentence above will not fit. */
export const VISIBILITY_SHORT: Record<LibraryVisibility, string> = {
  PRIVATE: 'Private',
  ENROLLMENT: 'This class',
  SUBJECT: 'Subject',
  PROGRAM: 'Everyone',
}

export const APPROVAL_TONE: Record<LibraryApprovalStatus, Tone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
}

export const MATERIAL_TYPE_LABEL: Record<TuitionMaterialType, string> = {
  NOTES: 'Notes',
  BOOK: 'Book',
  RECORDING: 'Recording',
  LINK: 'Link',
  WORKSHEET: 'Worksheet',
  QUESTION_PAPER: 'Question paper',
}

export const MATERIAL_TYPES = Object.keys(MATERIAL_TYPE_LABEL) as TuitionMaterialType[]

export const ASSESSMENT_CATEGORY_LABEL: Record<TuitionAssessmentCategory, string> = {
  HOMEWORK: 'Homework',
  ASSIGNMENT: 'Assignment',
  EXAM: 'Exam',
  TEST: 'Test',
  PROJECT: 'Project',
}

export const ASSESSMENT_CATEGORIES = Object.keys(
  ASSESSMENT_CATEGORY_LABEL,
) as TuitionAssessmentCategory[]

export const BILLING_MODE_LABEL: Record<PackageBillingMode, string> = {
  PER_CLASS: 'Per class attended',
  PACKAGE: 'Whole package per term',
}

/**
 * What each mode actually charges, spelled out where an admin picks one.
 *
 * The package is the same either way — "30 classes for 15,000" — and the mode
 * decides WHEN the money is asked for, which is the question a parent asks.
 */
export const BILLING_MODE_HINT: Record<PackageBillingMode, string> = {
  PER_CLASS:
    'Each invoice bills the classes attended in its period at the per-class rate. The 30 is the allowance the usage is reported against.',
  PACKAGE:
    'The whole amount is billed on the first invoice of the term. Later invoices in the term bill only classes beyond the allowance.',
}

export const BILLING_MODES = Object.keys(BILLING_MODE_LABEL) as PackageBillingMode[]

export const TERM_LABEL: Record<AcademicTerm, string> = {
  TERM_1: 'Term 1',
  TERM_2: 'Term 2',
}

export const TERMS = Object.keys(TERM_LABEL) as AcademicTerm[]

/**
 * "14 of 30 classes used, 16 remaining" — the one line every package screen
 * needs, derived the same way everywhere so the student and the office read
 * the same sentence. Over the allowance, it says so rather than going negative.
 */
export function packageUsageLabel(status: Pick<
  PackageStatusOut,
  'classes_included' | 'classes_used_to_date' | 'classes_remaining' | 'classes_over'
>): string {
  const included = status.classes_included
  if (included == null) {
    return `${status.classes_used_to_date} class${status.classes_used_to_date === 1 ? '' : 'es'} taken`
  }
  if (status.classes_over > 0) {
    return `${status.classes_used_to_date} of ${included} classes used — ${status.classes_over} over the allowance`
  }
  return `${status.classes_used_to_date} of ${included} classes used, ${status.classes_remaining ?? 0} remaining`
}

/** 0–100 for a usage bar; capped at 100 so overage reads as full, not broken. */
export function packageUsagePercent(used: number, included: number | null | undefined): number {
  if (!included || included <= 0) return 0
  return Math.min(100, Math.round((used / included) * 100))
}

// ---------------------------------------------------------------- sessions

/** Classes that are over, one way or another. Anything else is still to come. */
const CLOSED: TuitionSessionStatus[] = [
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW_TEACHER',
  'NO_SHOW_STUDENT',
]

export function isClosed(session: TuitionSessionOut) {
  return CLOSED.includes(session.status)
}

/**
 * Whether this class is running now.
 *
 * Reads the server's `timing` when it is there and falls back to the status:
 * bulk list endpoints omit the timing block, and a session console that
 * decided "not live" from its absence would refuse to show the Join button on
 * a class the teacher had already started.
 *
 * `class_has_started` is consulted too, and it is the more reliable of the
 * two under automatic starts: the status is moved to IN_PROGRESS by a
 * background sweep that may be minutes behind, while `class_has_started` is
 * derived from the timetable and is right immediately. A closed class is
 * never live however it reads — it has started AND finished.
 */
export function isLive(session: TuitionSessionOut) {
  if (isClosed(session)) return false
  if (session.status === 'IN_PROGRESS') return true
  return !!session.timing?.is_live || !!session.timing?.class_has_started
}

/**
 * The student is sitting there and nothing has opened yet.
 *
 * Deliberately distinct from "late": a student who joins a class the teacher
 * has not started is early, however long they have been waiting, and the
 * backend measures their lateness from the class actually beginning. A screen
 * that showed them as late here would make a fair rule read as an unfair one.
 */
export function isWaitingForTeacher(session: TuitionSessionOut) {
  return !!session.timing?.waiting_for_teacher
}

/**
 * Opened by the sweep rather than by the teacher.
 *
 * Worth surfacing because the sweep moves the status ONLY — it never records a
 * teacher as having joined. So an auto-started class can be "in progress" with
 * nobody in the room, and a teacher glancing at a green badge should not read
 * it as "somebody is teaching this".
 */
export function startedAutomatically(session: TuitionSessionOut) {
  return session.auto_started === true && !session.teacher_joined_at
}

/**
 * The instant to display, in the reader's own zone.
 *
 * Prefers the `_local` rendering the server produced: it used the reader's
 * configured timezone, which for a tuition student is frequently NOT the
 * browser's. Falling back to the UTC field means the browser formats it — the
 * right answer only when nobody set a timezone, which is exactly when the two
 * agree anyway.
 */
export function displayStart(session: TuitionSessionOut) {
  return session.scheduled_start_at_local ?? session.scheduled_start_at ?? null
}

export function displayEnd(session: TuitionSessionOut) {
  return (
    session.effective_end_at_local ??
    session.scheduled_end_at_local ??
    session.effective_end_at ??
    session.scheduled_end_at ??
    null
  )
}

/**
 * How long is left, as a short human string, or null when it does not apply.
 *
 * The number comes from the server and was true when the response was built —
 * so anything rendering this must refetch rather than tick locally, or it will
 * confidently count down through a class that already ended.
 */
export function remainingLabel(session: TuitionSessionOut): string | null {
  const timing = session.timing
  if (!timing) return null

  if (timing.is_live && timing.minutes_remaining != null) {
    const mins = Math.max(0, Math.round(timing.minutes_remaining))
    if (mins <= 0) return 'Time is up'
    if (mins < 60) return `${mins} min left`
    return `${Math.floor(mins / 60)}h ${mins % 60}m left`
  }

  if (timing.starts_in_minutes != null && timing.starts_in_minutes > 0) {
    const mins = Math.round(timing.starts_in_minutes)
    if (mins < 60) return `Starts in ${mins} min`
    if (mins < 60 * 24) return `Starts in ${Math.round(mins / 60)}h`
    return `Starts in ${Math.round(mins / (60 * 24))} days`
  }

  return null
}

/**
 * Why a class ran differently from how it was scheduled.
 *
 * Returned as a list because more than one can be true at once — a teacher can
 * arrive late, earn an extension, and still end early — and an admin reading
 * the report needs all of them, not the first.
 */
export function sessionAnomalies(session: TuitionSessionOut): string[] {
  const notes: string[] = []
  if (session.teacher_late_minutes > 0.5) {
    notes.push(`Teacher ${Math.round(session.teacher_late_minutes)} min late`)
  }
  if (session.extension_minutes > 0.5) {
    notes.push(`Ran ${Math.round(session.extension_minutes)} min past the scheduled end`)
  }
  if (session.student_late_minutes > 0.5) {
    notes.push(`Student ${Math.round(session.student_late_minutes)} min late`)
  }
  if (session.ended_early && session.short_by_minutes) {
    notes.push(`Ended ${Math.round(session.short_by_minutes)} min early`)
  }
  if (session.status === 'NO_SHOW_TEACHER') notes.push('Teacher did not attend — not chargeable')
  if (startedAutomatically(session)) {
    notes.push('Opened automatically — the teacher has not joined')
  }
  return notes
}

/** A one-line title for a class: the subject, then whoever the reader is not. */
export function sessionTitle(session: TuitionSessionOut, viewerIsTeacher: boolean): string {
  const subject = session.subject?.name ?? session.title ?? 'Class'
  const other = viewerIsTeacher ? session.student?.full_name : session.teacher?.full_name
  return other ? `${subject} · ${other}` : subject
}

// ------------------------------------------------------------------- slots

/** Monday-first, matching the LMS timetable grid. */
export function sortSlots(slots: TuitionSlotOut[]): TuitionSlotOut[] {
  return [...slots].sort((a, b) => {
    const day = DAYS.indexOf(a.day_of_week) - DAYS.indexOf(b.day_of_week)
    if (day !== 0) return day
    return a.start_time.localeCompare(b.start_time)
  })
}

/** "17:00:00" → "17:00". The backend is inconsistent about the seconds. */
export function shortTime(time: string | null | undefined): string {
  if (!time) return '—'
  return time.slice(0, 5)
}

// ----------------------------------------------------------------- reports

/**
 * Attendance measured against classes CONDUCTED, not scheduled.
 *
 * A student whose teacher missed two classes has 100% attendance, not 60%.
 * Since these same counts price the invoices, the distinction is money as well
 * as fairness — so never recompute it against `total_sessions`.
 */
export function attendanceRate(totals: TuitionAttendanceTotals): number | null {
  if (totals.attendance_percentage != null) return totals.attendance_percentage
  if (!totals.conducted) return null
  return (totals.attended / totals.conducted) * 100
}

/** Hours, to one decimal — minutes are the wire format, hours are the report. */
export function hours(minutes: number | null | undefined): string {
  if (!minutes) return '0'
  return (minutes / 60).toFixed(1)
}

// ---------------------------------------------------------------- invoices

export function amountOutstanding(invoice: InvoiceOut): number {
  return Math.max(0, invoice.total_amount - invoice.amount_paid)
}

/**
 * Formats money in the invoice's own currency.
 *
 * Falls back to plain digits with the code in front when `Intl` does not
 * recognise it: the currency is free text an admin typed into the programme
 * settings, so an unknown code has to render, not throw.
 */
export function formatMoney(amount: number, currency: string | null | undefined): string {
  const code = (currency ?? '').trim().toUpperCase()
  if (code.length === 3) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(amount)
    } catch {
      /* not an ISO code after all */
    }
  }
  return `${code ? `${code} ` : ''}${amount.toFixed(2)}`
}

/**
 * A DRAFT is recomputed from session counts every time it is regenerated; once
 * ISSUED the numbers are frozen, because a bill that changes after it was sent
 * is not a bill. Only the first is safe to regenerate over.
 */
export function isEditableInvoice(invoice: InvoiceOut) {
  return invoice.status === 'DRAFT'
}

// ------------------------------------------------------------ validation

/**
 * The class-length bounds the backend enforces on every duration field.
 *
 * Stated once here because four different forms send a duration —
 * arrangements, weekly slots, extra classes and reschedules — and all four are
 * validated against the same `ge=10, le=480`. A form that does not check it
 * first gets a 422 whose message ("Input should be greater than or equal to
 * 10") does not say which field it is about.
 */
export const MIN_CLASS_MINUTES = 10
export const MAX_CLASS_MINUTES = 480

/** Hint text for a duration input, so the rule is visible before it is broken. */
export const CLASS_LENGTH_HINT = `Minutes, ${MIN_CLASS_MINUTES}–${MAX_CLASS_MINUTES}. Falls back to the programme default.`

/**
 * Checks a duration typed into a text input.
 *
 * Returns a message to show, or null when it is fine. An empty string is fine:
 * every duration in this module is optional and falls back to the
 * arrangement's, then the programme's.
 */
export function classLengthError(value: string | null | undefined): string | null {
  const text = (value ?? '').trim()
  if (!text) return null

  const minutes = Number(text)
  if (!Number.isFinite(minutes) || !Number.isInteger(minutes)) {
    return 'Enter a whole number of minutes.'
  }
  if (minutes < MIN_CLASS_MINUTES) {
    return `A class must be at least ${MIN_CLASS_MINUTES} minutes.`
  }
  if (minutes > MAX_CLASS_MINUTES) {
    return `A class cannot be longer than ${MAX_CLASS_MINUTES} minutes (${MAX_CLASS_MINUTES / 60} hours).`
  }
  return null
}

/**
 * Turns a field name the backend used into the one a form registered.
 *
 * The two mostly agree — both use the wire name — so this is identity for all
 * but the handful a form renames. Kept as a function so callers pass their own
 * map rather than every form sharing one lookup table.
 */
export function mapFieldErrors(
  fieldErrors: Record<string, string>,
  rename: Record<string, string> = {},
): [string, string][] {
  return Object.entries(fieldErrors).map(([field, message]) => [rename[field] ?? field, message])
}

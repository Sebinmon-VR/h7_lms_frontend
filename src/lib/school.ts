import type { GatewayMethod, PaymentIntentStatus } from '@/api/types'
import type {
  AcademicYearStatus,
  AdmissionRequestStatus,
  CalendarEvent,
  CalendarKind,
  ChargeKind,
  ClassTimingOut,
  DiscountBasis,
  ExtraClassOut,
  ExtraClassStatus,
  FeeBreakdownOut,
  FeeFrequency,
  GuardianRelation,
  HomeworkOut,
  HomeworkStatus,
  InstalmentOut,
  LeaveBalanceOut,
  LeaveDayPart,
  LeaveStatus,
  LeaveType,
  NoticeAudience,
  NoticeOut,
  NoticePriority,
  NoticeStatus,
  PaymentMethod,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from '@/api/types'

type Tone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

/**
 * Labels, tones and the few derivations the September modules need.
 *
 * The sibling of `lib/tuition.ts`, and it follows the same rule: anything the
 * backend already decided is read, never recomputed. `may_join`,
 * `join_blocked_reason`, `is_live`, `is_overdue` and `MISSED` are all resolved
 * server-side precisely so two screens cannot disagree about them, and the
 * helpers below present those answers rather than re-deriving them from the
 * clock.
 */

// ==================================================================== admissions

export const YEAR_STATUS_LABEL: Record<AcademicYearStatus, string> = {
  UPCOMING: 'Upcoming',
  ACTIVE: 'Active',
  CLOSED: 'Closed',
}

export const YEAR_STATUS_TONE: Record<AcademicYearStatus, Tone> = {
  UPCOMING: 'info',
  ACTIVE: 'success',
  CLOSED: 'neutral',
}

export const YEAR_STATUS_HINT: Record<AcademicYearStatus, string> = {
  UPCOMING: 'Taking admissions, but not yet being taught.',
  ACTIVE: 'The year currently being taught.',
  CLOSED: 'Over and settled. Read-only.',
}

// ============================================================ admission requests

export const REQUEST_STATUSES: AdmissionRequestStatus[] = [
  'NEW',
  'UNDER_REVIEW',
  'WAITLISTED',
  'ADMITTED',
  'REJECTED',
]

export const REQUEST_STATUS_LABEL: Record<AdmissionRequestStatus, string> = {
  NEW: 'New',
  UNDER_REVIEW: 'Under review',
  WAITLISTED: 'Waitlisted',
  ADMITTED: 'Admitted',
  REJECTED: 'Declined',
}

export const REQUEST_STATUS_TONE: Record<AdmissionRequestStatus, Tone> = {
  NEW: 'primary',
  UNDER_REVIEW: 'info',
  WAITLISTED: 'warning',
  ADMITTED: 'success',
  REJECTED: 'neutral',
}

/** Requests still waiting on a decision — the office's actual to-do list. */
export const OPEN_REQUEST_STATUSES: AdmissionRequestStatus[] = ['NEW', 'UNDER_REVIEW', 'WAITLISTED']

// ====================================================================== families

export const RELATION_LABEL: Record<GuardianRelation, string> = {
  FATHER: 'Father',
  MOTHER: 'Mother',
  GUARDIAN: 'Guardian',
  SIBLING: 'Sibling',
  OTHER: 'Other',
}

export const GUARDIAN_RELATIONS = Object.keys(RELATION_LABEL) as GuardianRelation[]

/**
 * The three per-link permissions, as a table a form can render.
 *
 * Kept together rather than spelled out at each call site because the ORDER
 * matters: fees last, and described as the exception it is, so an admin ticking
 * boxes down the list does not grant it by momentum.
 */
export const PARENT_PERMISSIONS = [
  {
    key: 'may_view_academics' as const,
    label: 'Marks and report cards',
    hint: 'Exam results, grades and homework feedback.',
  },
  {
    key: 'may_view_attendance' as const,
    label: 'Attendance',
    hint: 'Which classes the child was present for.',
  },
  {
    key: 'may_view_fees' as const,
    label: 'Fees and invoices',
    hint: 'Off by default. Grant it only to whoever actually pays.',
  },
]

// ======================================================================= notices

export const NOTICE_PRIORITY_LABEL: Record<NoticePriority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
}

export const NOTICE_PRIORITY_TONE: Record<NoticePriority, Tone> = {
  LOW: 'neutral',
  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
}

export const NOTICE_PRIORITIES = Object.keys(NOTICE_PRIORITY_LABEL) as NoticePriority[]

export const NOTICE_STATUS_LABEL: Record<NoticeStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
}

export const NOTICE_AUDIENCE_LABEL: Record<NoticeAudience, string> = {
  EVERYONE: 'Everyone',
  ROLE: 'By role',
  CLASS: 'By class',
  USER: 'Named people',
}

export const NOTICE_AUDIENCE_HINT: Record<NoticeAudience, string> = {
  EVERYONE: 'Every active account in the programme.',
  ROLE: 'Everyone holding one of the chosen roles.',
  CLASS: 'Students in the chosen classes, plus the teachers who take them.',
  USER: 'Exactly the people you name, and nobody else.',
}

export const NOTICE_AUDIENCES = Object.keys(NOTICE_AUDIENCE_LABEL) as NoticeAudience[]

/**
 * Which target list an audience actually reads.
 *
 * The others are ignored rather than combined, which is why a form may safely
 * leave stale ids behind when the author changes their mind — and why a
 * targeted notice with an EMPTY list is rejected: it would save cleanly, look
 * published, and reach nobody.
 */
export function targetFieldFor(
  audience: NoticeAudience,
): 'target_roles' | 'target_class_ids' | 'target_user_ids' | null {
  switch (audience) {
    case 'ROLE':
      return 'target_roles'
    case 'CLASS':
      return 'target_class_ids'
    case 'USER':
      return 'target_user_ids'
    default:
      return null
  }
}

/**
 * Why a notice is or is not on the board right now, in one sentence.
 *
 * Reads the server's already-resolved `is_live` / `is_scheduled` /
 * `is_expired` rather than comparing dates here, so this can never disagree
 * with what the reader's feed actually contains.
 */
export function noticeVisibility(notice: NoticeOut): { label: string; tone: Tone } {
  if (notice.status === 'DRAFT') return { label: 'Draft — nobody can see it', tone: 'neutral' }
  if (notice.status === 'ARCHIVED') return { label: 'Archived', tone: 'neutral' }
  if (notice.is_expired) return { label: 'Expired', tone: 'neutral' }
  if (notice.is_scheduled) return { label: 'Scheduled', tone: 'info' }
  if (notice.is_live) return { label: 'On the board', tone: 'success' }
  return { label: 'Not visible', tone: 'warning' }
}

// ======================================================================= finance

export const FEE_FREQUENCY_LABEL: Record<FeeFrequency, string> = {
  ONE_TIME: 'One-off',
  MONTHLY: 'Monthly',
  TERM: 'Per term',
  ANNUAL: 'Annual',
}

export const FEE_FREQUENCIES = Object.keys(FEE_FREQUENCY_LABEL) as FeeFrequency[]

export const CHARGE_KIND_LABEL: Record<ChargeKind, string> = {
  FEE: 'Teaching fee',
  CHARGE: 'Charge',
  TAX: 'Tax',
  CONVENIENCE: 'Convenience fee',
  LATE_FEE: 'Late fee',
  DISCOUNT: 'Discount',
  OTHER: 'Other',
}

/** The kinds an admin creates by hand. Tax, convenience and late fees are computed. */
export const CREATABLE_CHARGE_KINDS: ChargeKind[] = ['FEE', 'CHARGE', 'OTHER']

export const DISCOUNT_BASIS_LABEL: Record<DiscountBasis, string> = {
  SIBLING: 'Sibling',
  MULTI_REGISTRATION: 'Multiple registrations',
  CATEGORY: 'Admission category',
  SCHOLARSHIP: 'Scholarship',
  EARLY_PAYMENT: 'Early payment',
  MANUAL: 'One-off decision',
}

/**
 * What each basis actually counts.
 *
 * Spelled out because SIBLING and MULTI_REGISTRATION are the pair schools
 * conflate, and they are genuinely different rules: one counts children in a
 * household, the other counts enrollments held by one student at the same time.
 */
export const DISCOUNT_BASIS_HINT: Record<DiscountBasis, string> = {
  SIBLING:
    'Counts children in the recorded household. The eldest pays in full; the concession starts at the nth child.',
  MULTI_REGISTRATION:
    'Counts enrollments ONE student holds at the same time — two subjects at once, not two children.',
  CATEGORY: 'Comes with the admission category. Name the categories it applies to.',
  SCHOLARSHIP: 'Awarded to named students.',
  EARLY_PAYMENT: 'For settling before a date.',
  MANUAL: 'An administrator’s one-off decision, for named students.',
}

export const DISCOUNT_BASES = Object.keys(DISCOUNT_BASIS_LABEL) as DiscountBasis[]

/** SCHOLARSHIP and MANUAL are refused without `student_ids`. */
export function basisNeedsStudents(basis: DiscountBasis): boolean {
  return basis === 'SCHOLARSHIP' || basis === 'MANUAL'
}

/** CATEGORY is refused without `admission_category_ids`. */
export function basisNeedsCategories(basis: DiscountBasis): boolean {
  return basis === 'CATEGORY'
}

/** SIBLING and MULTI_REGISTRATION are the only two `applies_from_nth` means anything for. */
export function basisUsesNth(basis: DiscountBasis): boolean {
  return basis === 'SIBLING' || basis === 'MULTI_REGISTRATION'
}

export const GATEWAY_METHOD_LABEL: Record<GatewayMethod, string> = {
  UPI: 'UPI',
  CARD: 'Debit or credit card',
  NET_BANKING: 'Net banking',
  WALLET: 'Wallet',
  BANK_TRANSFER: 'Bank transfer',
  OFFICE: 'Pay at the office',
}

export const GATEWAY_METHOD_HINT: Record<GatewayMethod, string> = {
  UPI: 'Google Pay, PhonePe, Paytm or any UPI app',
  CARD: 'Visa, Mastercard, RuPay',
  NET_BANKING: 'All major banks',
  WALLET: 'Paytm, PhonePe and other wallets',
  BANK_TRANSFER: 'NEFT, IMPS or RTGS — quote the reference',
  OFFICE: 'Cash, card or cheque at the counter',
}

/** What a gateway offers, in the order the tiles are shown. */
export const ONLINE_GATEWAY_METHODS: GatewayMethod[] = ['UPI', 'CARD', 'NET_BANKING', 'WALLET']

/** The routes that work today, gateway or not. */
export const OFFLINE_GATEWAY_METHODS: GatewayMethod[] = ['BANK_TRANSFER', 'OFFICE']

export const INTENT_STATUS_LABEL: Record<PaymentIntentStatus, string> = {
  CREATED: 'Awaiting payment',
  REQUIRES_ACTION: 'Needs your confirmation',
  PROCESSING: 'Processing',
  SUCCEEDED: 'Paid',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
}

export const INTENT_STATUS_TONE: Record<PaymentIntentStatus, Tone> = {
  CREATED: 'warning',
  REQUIRES_ACTION: 'warning',
  PROCESSING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  REFUNDED: 'neutral',
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  CARD: 'Card',
  UPI: 'UPI',
  ONLINE: 'Online (gateway)',
  ADJUSTMENT: 'Adjustment',
  OTHER: 'Other',
}

/**
 * What an office clerk records by hand.
 *
 * ONLINE is absent: it belongs to a gateway payment carrying a provider
 * reference that can be reconciled, and no gateway is wired. Offering it would
 * let a clerk file a cash payment as an online one, which is exactly the
 * distinction the enum exists to keep.
 */
export const OFFLINE_PAYMENT_METHODS: PaymentMethod[] = [
  'CASH',
  'BANK_TRANSFER',
  'CHEQUE',
  'CARD',
  'UPI',
  'ADJUSTMENT',
  'OTHER',
]

export const INSTALMENT_STATUS_TONE: Record<string, Tone> = {
  PENDING: 'neutral',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  OVERDUE: 'danger',
  WAIVED: 'info',
}

export const INSTALMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Due',
  PARTIALLY_PAID: 'Part paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  WAIVED: 'Written off',
}

/**
 * The instalment a payment screen should offer first: the oldest unsettled
 * one, which is also what the backend picks when no label is given.
 */
export function nextDueInstalment(instalments: InstalmentOut[]): InstalmentOut | null {
  return (
    instalments.find((i) => i.status !== 'PAID' && i.status !== 'WAIVED') ?? null
  )
}

/**
 * Splits a breakdown into the two sections the payment page renders.
 *
 * `charge_total` is already the non-teaching part of `subtotal`, so this only
 * has to sort the lines — the totals are the server's and are never re-added
 * here.
 */
export function splitBreakdownLines(breakdown: FeeBreakdownOut) {
  const fees = breakdown.line_items.filter((l) => l.kind === 'FEE')
  const charges = breakdown.line_items.filter((l) => l.kind !== 'FEE')
  return { fees, charges }
}

// ================================================================ live classes

/**
 * What to put on a join button, and whether it may be pressed.
 *
 * `may_join` is the ONLY input to the disabled state, deliberately: it already
 * accounts for the early window, the grace period, the status and whether the
 * teacher has started, and the server enforces the same rule on `/join`.
 * `join_blocked_reason` is shown verbatim because it distinguishes cases the
 * flags cannot — "opens at 09:55" from "waiting for the teacher" from "ended".
 */
export function joinState(timing: ClassTimingOut): {
  canJoin: boolean
  label: string
  reason: string | null
  tone: Tone
} {
  if (timing.may_join) {
    return {
      canJoin: true,
      label: timing.is_live ? 'Join now' : 'Join',
      reason: null,
      tone: timing.is_live ? 'success' : 'primary',
    }
  }

  return {
    canJoin: false,
    label: timing.waiting_for_teacher ? 'Waiting for the teacher' : 'Not open yet',
    reason: timing.join_blocked_reason ?? null,
    tone: timing.is_closed || timing.is_expired ? 'neutral' : 'info',
  }
}

// =============================================================== extra classes

export const EXTRA_CLASS_STATUS_LABEL: Record<ExtraClassStatus, string> = {
  PENDING: 'Awaiting approval',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  REJECTED: 'Rejected',
  CANCELLED: 'Withdrawn',
}

export const EXTRA_CLASS_STATUS_TONE: Record<ExtraClassStatus, Tone> = {
  PENDING: 'warning',
  APPROVED: 'info',
  SCHEDULED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
}

/**
 * An APPROVED request whose class was never created.
 *
 * Approving and scheduling are two calls because the second can fail — a
 * clash, a Meet error — after a human has already said yes. This is the state
 * that leaves behind, and it must be visible and retryable rather than read as
 * done.
 */
export function awaitingScheduling(request: ExtraClassOut): boolean {
  return (
    request.status === 'APPROVED' &&
    !request.created_meeting_id &&
    !request.created_session_id
  )
}

// ==================================================================== homework

export const HOMEWORK_STATUS_LABEL: Record<HomeworkStatus, string> = {
  ASSIGNED: 'Not handed in',
  SUBMITTED: 'Handed in',
  GRADED: 'Marked',
  MISSED: 'Missed',
}

export const HOMEWORK_STATUS_TONE: Record<HomeworkStatus, Tone> = {
  ASSIGNED: 'neutral',
  SUBMITTED: 'info',
  GRADED: 'success',
  MISSED: 'danger',
}

/**
 * How near the deadline is, in the words a student should read.
 *
 * Built from the server's `days_until_due` and `is_overdue` rather than from
 * the date, so it agrees with `my_status` — which the same request derived
 * from the same clock.
 */
export function dueLabel(hw: HomeworkOut): { label: string; tone: Tone } {
  if (hw.my_status === 'GRADED') return { label: 'Marked', tone: 'success' }
  if (hw.my_status === 'SUBMITTED') return { label: 'Handed in', tone: 'info' }
  if (hw.is_overdue) {
    return {
      label: hw.allow_late_submission ? 'Overdue — still accepted' : 'Overdue',
      tone: 'danger',
    }
  }

  const days = hw.days_until_due
  if (days == null) return { label: `Due ${hw.due_date}`, tone: 'neutral' }
  if (days === 0) return { label: 'Due today', tone: 'warning' }
  if (days === 1) return { label: 'Due tomorrow', tone: 'warning' }
  return { label: `Due in ${days} days`, tone: 'neutral' }
}

// ================================================================= staff leave

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  CASUAL: 'Casual',
  SICK: 'Sick',
  EARNED: 'Earned',
  UNPAID: 'Unpaid',
  MATERNITY: 'Maternity',
  BEREAVEMENT: 'Bereavement',
  OTHER: 'Other',
}

export const LEAVE_TYPES = Object.keys(LEAVE_TYPE_LABEL) as LeaveType[]

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: 'Awaiting decision',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  CANCELLED: 'Cancelled',
}

export const LEAVE_STATUS_TONE: Record<LeaveStatus, Tone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
  CANCELLED: 'neutral',
}

export const DAY_PART_LABEL: Record<LeaveDayPart, string> = {
  FULL_DAY: 'Full day',
  FIRST_HALF: 'First half',
  SECOND_HALF: 'Second half',
}

export const DAY_PARTS = Object.keys(DAY_PART_LABEL) as LeaveDayPart[]

/**
 * Every leave type this teacher has touched, taken or pending.
 *
 * The two maps are returned separately and are NOT unioned into one number —
 * a request awaiting a decision is neither granted nor free, and showing one
 * combined figure is how two teachers get approved for the same week.
 */
export function leaveTypeRows(balance: LeaveBalanceOut) {
  const types = new Set([
    ...Object.keys(balance.taken_days),
    ...Object.keys(balance.pending_days),
  ])
  return [...types]
    .sort()
    .map((type) => ({
      type,
      label: LEAVE_TYPE_LABEL[type as LeaveType] ?? type,
      taken: balance.taken_days[type] ?? 0,
      pending: balance.pending_days[type] ?? 0,
    }))
}

// ==================================================================== support

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  WAITING_ON_USER: 'Waiting on you',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
}

export const TICKET_STATUS_TONE: Record<TicketStatus, Tone> = {
  OPEN: 'info',
  IN_PROGRESS: 'primary',
  WAITING_ON_USER: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral',
}

export const TICKET_STATUSES = Object.keys(TICKET_STATUS_LABEL) as TicketStatus[]

export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
}

export const TICKET_PRIORITY_TONE: Record<TicketPriority, Tone> = {
  LOW: 'neutral',
  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
}

export const TICKET_PRIORITIES = Object.keys(TICKET_PRIORITY_LABEL) as TicketPriority[]

export const TICKET_CATEGORY_LABEL: Record<TicketCategory, string> = {
  TECHNICAL: 'Something is broken',
  ACADEMIC: 'Classes, marks or timetable',
  BILLING: 'Fees and payments',
  ACCOUNT: 'Profile and access',
  FEEDBACK: 'Feedback',
  OTHER: 'Something else',
}

export const TICKET_CATEGORIES = Object.keys(TICKET_CATEGORY_LABEL) as TicketCategory[]

/** States that still need somebody's attention — the backend's own active set. */
export const ACTIVE_TICKET_STATUSES: TicketStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_ON_USER',
]

// =================================================================== calendar

export const CALENDAR_KIND_LABEL: Record<CalendarKind, string> = {
  TIMETABLE: 'Lesson',
  LIVE_CLASS: 'Live class',
  TUITION_CLASS: 'Tuition',
  EXAM: 'Exam',
  HOMEWORK: 'Homework',
}

export const CALENDAR_KIND_TONE: Record<CalendarKind, Tone> = {
  TIMETABLE: 'neutral',
  LIVE_CLASS: 'primary',
  TUITION_CLASS: 'accent',
  EXAM: 'warning',
  HOMEWORK: 'info',
}

export const CALENDAR_KINDS = Object.keys(CALENDAR_KIND_LABEL) as CalendarKind[]

export function calendarKindLabel(kind: string): string {
  return CALENDAR_KIND_LABEL[kind as CalendarKind] ?? kind
}

export function calendarKindTone(kind: string): Tone {
  return CALENDAR_KIND_TONE[kind as CalendarKind] ?? 'neutral'
}

/**
 * Chip styling for one event inside a month or week cell.
 *
 * A `Badge` is the wrong component there: it is pill-shaped, centres its text
 * and never wraps, so twelve of them stacked in a 120px-wide cell read as a
 * colour swatch rather than as a list of classes. These are full-width rows
 * with a leading colour bar — the shape every calendar uses, and the one that
 * survives being truncated.
 */
export const CALENDAR_KIND_CHIP: Record<CalendarKind, string> = {
  TIMETABLE: 'border-l-muted-foreground/40 bg-muted/60 text-foreground',
  LIVE_CLASS: 'border-l-primary bg-primary/10 text-primary',
  TUITION_CLASS: 'border-l-accent bg-accent/10 text-accent',
  EXAM: 'border-l-warning bg-warning/15 text-warning',
  HOMEWORK: 'border-l-info bg-info/10 text-info',
}

export function calendarKindChip(kind: string): string {
  return (
    CALENDAR_KIND_CHIP[kind as CalendarKind] ??
    'border-l-muted-foreground/40 bg-muted/60 text-foreground'
  )
}

/**
 * Orders a day's events the way a person reads one: timed items in clock
 * order, all-day items (homework) first, because they belong in the day's
 * header rather than at an hour.
 */
export function sortDayEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
    return String(a.start_at ?? '').localeCompare(String(b.start_at ?? ''))
  })
}

/** The 90-day cap the calendar endpoint enforces; a wider range is a 400. */
export const CALENDAR_MAX_DAYS = 90

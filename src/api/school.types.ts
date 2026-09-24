/**
 * Wire types for the school modules added in the September backend release:
 * admissions, families and parent accounts, the notice board, school finance,
 * live-class timing, extra classes, the calendar, homework, staff leave,
 * support and the academic-oversight reports.
 *
 * Split out of `types.ts` for size only, exactly as `tuition.types.ts` is, and
 * re-exported from there so `@/api/types` stays the one import surface.
 *
 * The conventions of `types.ts` all hold here:
 *  - datetimes are naive UTC strings, dates are "YYYY-MM-DD"; never call
 *    `new Date()` on one, use `lib/datetime`;
 *  - every `*Update` is PARTIAL, an empty body is a 400, and `exclude_none`
 *    on the backend means a field cannot be cleared back to null through an
 *    update — only overwritten;
 *  - ids are 13-digit epoch-millisecond integers, not counters.
 *
 * Two shapes are deliberately NOT redefined here because the backend shares
 * one enum across both products: `InvoiceStatus` and `Program` come from
 * `tuition.types.ts`. School invoices and tuition invoices really do move
 * through the same five states.
 */

import type { ApiDate, ApiDateTime, ScheduledPeriod, UserRole } from './types'
import type { InvoiceStatus, Program } from './tuition.types'

// ==================================================================== admissions

/**
 * Where a session year sits relative to today.
 *
 * Stored rather than derived from the dates, because the school's answer and
 * the calendar's legitimately differ: results and arrears keep a year open for
 * weeks after its last teaching day, and admissions open long before it starts.
 */
export type AcademicYearStatus = 'UPCOMING' | 'ACTIVE' | 'CLOSED'

/**
 * The two halves of a session year.
 *
 * The year runs April to March and is billed in two terms — Term 1 to the end
 * of October, Term 2 from November. Packages, instalments and invoices all
 * name one of these, so it is a key rather than free text.
 */
export type AcademicTerm = 'TERM_1' | 'TERM_2'

export interface AcademicTermIn {
  key: AcademicTerm
  name?: string | null
  start_date: ApiDate
  end_date: ApiDate
}

export interface AcademicTermOut {
  key: AcademicTerm
  name: string
  start_date: ApiDate
  end_date: ApiDate
  /** Whether today falls inside this term — the one to preselect. */
  is_current: boolean
}

/** AUTO fills a blank identifier only; a value sent is always kept. */
export type IdentifierMode = 'AUTO' | 'MANUAL'

export interface AcademicYearCreate {
  /** e.g. "2026-27". */
  name: string
  /**
   * Both optional together. Omitted, a name like "2026-27" resolves to
   * 1 April 2026 – 31 March 2027, and any other name to the April–March year
   * the clock is in.
   */
  start_date?: ApiDate | null
  end_date?: ApiDate | null
  /**
   * Omit for the default cut — Term 1 to 31 October, Term 2 from 1 November.
   * Given, both terms are required, in order, inside the year.
   */
  terms?: AcademicTermIn[] | null
  /** e.g. "AY2526". */
  code?: string | null
  status?: AcademicYearStatus
  /**
   * Setting this clears the flag on every OTHER year in the same write, so a
   * "make this current" toggle needs no second call and no optimistic
   * de-selection in the list — refetch and the server's answer is already
   * consistent.
   */
  is_current?: boolean
  admissions_open?: boolean
  programs?: Program[]
  notes?: string | null
}

export type AcademicYearUpdate = Partial<AcademicYearCreate>

export interface AcademicYearOut {
  id: number
  name: string
  code?: string | null
  start_date: ApiDate
  end_date: ApiDate
  status: AcademicYearStatus
  is_current: boolean
  admissions_open: boolean
  programs: string[]
  /** Always two, derived from the dates when none were stored. */
  terms: AcademicTermOut[]
  /** The term today falls in, when the year covers today. */
  current_term?: AcademicTerm | null
  notes?: string | null
  /** Present only when the list was asked for `with_counts`. */
  student_count?: number | null
  category_count?: number | null
  created_at?: ApiDateTime | null
  updated_at?: ApiDateTime | null
}

export interface AdmissionCategoryCreate {
  /** e.g. "Staff Ward". */
  name: string
  code: string
  description?: string | null
  /** Omit for a standing category inherited by every year — usually what you want. */
  academic_year_id?: number | null
  programs?: Program[]
  /** Applied automatically by the fee engine. */
  default_discount_percent?: number | null
  waives_admission_charge?: boolean
  is_active?: boolean
  sort_order?: number
}

export type AdmissionCategoryUpdate = Partial<AdmissionCategoryCreate>

export interface AdmissionCategoryOut {
  id: number
  name: string
  code: string
  description?: string | null
  academic_year_id?: number | null
  academic_year_name?: string | null
  programs: string[]
  default_discount_percent?: number | null
  waives_admission_charge: boolean
  is_active: boolean
  sort_order: number
  student_count?: number | null
  created_at?: ApiDateTime | null
  updated_at?: ApiDateTime | null
}

// ====================================================================== families

/**
 * How a parent account relates to a student it can see.
 *
 * Recorded because "who may I talk to about this child?" is a front-office
 * question, and a legal guardian and an elder brother who does the school run
 * are both valid links with very different standing.
 */
export type GuardianRelation = 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'SIBLING' | 'OTHER'

/** One child in a household. `birth_order` is what sibling concessions price from. */
export interface SiblingMemberOut {
  student_id: number
  full_name: string
  email?: string | null
  admission_number?: string | null
  class_id?: number | null
  class_name?: string | null
  is_active: boolean
  /** 1 for the eldest, counting up. */
  birth_order: number
}

export interface SiblingGroupCreate {
  family_name: string
  /** Accepted at creation; afterwards use the member endpoints. */
  student_ids?: number[]
  primary_contact_user_id?: number | null
  primary_contact_name?: string | null
  primary_contact_phone?: string | null
  primary_contact_email?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
  notes?: string | null
}

/**
 * `student_ids` is absent on purpose — membership goes through the dedicated
 * add/remove endpoints, because each one checks the child is not already in
 * another household and a wholesale replacement would skip that check.
 */
export type SiblingGroupUpdate = Partial<Omit<SiblingGroupCreate, 'student_ids'>> & {
  is_active?: boolean
}

export interface SiblingGroupOut {
  id: number
  family_name: string
  student_ids: number[]
  members: SiblingMemberOut[]
  sibling_count: number
  primary_contact_user_id?: number | null
  primary_contact_name?: string | null
  primary_contact_phone?: string | null
  primary_contact_email?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
  notes?: string | null
  is_active: boolean
  /**
   * True when the household was built by the guardian-details sweep rather
   * than typed in, with the details it matched on. The office's cue to check
   * the name it was given.
   */
  auto_mapped?: boolean
  matched_by?: string[]
  created_at?: ApiDateTime | null
  updated_at?: ApiDateTime | null
}

// -------------------------------------------------------- automatic mapping

/** What two students were matched on. The first three are acted on; the rest are suggestions. */
export type FamilyMatchBasis =
  | 'guardian_phone'
  | 'guardian_email'
  | 'parent_link'
  | 'guardian_name'
  | 'address'
  | 'postal_code'

/** `POST /admin/families/auto-map`. Empty `student_ids` sweeps every ungrouped student. */
export interface FamilyAutoMapRequest {
  student_ids?: number[]
  /** Report what would happen without creating or changing anything. */
  dry_run?: boolean
}

/** Another student who looks like a sibling, and why. */
export interface FamilyMatch {
  student_id: number
  full_name?: string | null
  admission_number?: string | null
  guardian_name?: string | null
  guardian_phone?: string | null
  guardian_email?: string | null
  matched_by: FamilyMatchBasis[]
  group_id?: number | null
  group_name?: string | null
}

/**
 * `GET /admin/families/students/{id}/matches` — what the sweep sees for one
 * student. `strong` is what it would act on; `suggestions` is what it leaves
 * to a person.
 */
export interface FamilyMatchesOut {
  student: FamilyMatch
  strong: FamilyMatch[]
  suggestions: FamilyMatch[]
}

export type FamilyAutoMapAction =
  | 'already_grouped'
  | 'added'
  | 'created'
  | 'conflict'
  | 'no_match'
  | 'skipped'

export interface FamilyAutoMapResult {
  student_id: number
  full_name?: string | null
  admission_number?: string | null
  action: FamilyAutoMapAction
  reason?: string | null
  matched_by: FamilyMatchBasis[]
  group_id?: number | null
  group_name?: string | null
  matches: FamilyMatch[]
  suggestions: FamilyMatch[]
  candidate_groups: { group_id?: number | null; group_name?: string | null }[]
}

export interface FamilyAutoMapReport {
  dry_run: boolean
  considered: number
  created: FamilyAutoMapResult[]
  added: FamilyAutoMapResult[]
  /** Matches sit in DIFFERENT households — the one case the data cannot decide. */
  conflicts: FamilyAutoMapResult[]
  /** Nothing strong enough to act on; each carries name-only `suggestions`. */
  unmatched: FamilyAutoMapResult[]
  skipped: FamilyAutoMapResult[]
  already_grouped: number
  summary: Record<string, number>
}

/**
 * An access grant from one parent login to one student.
 *
 * Permissions are per link and per aspect, and `may_view_fees` is OFF unless
 * an admin grants it. Build the parent's navigation from these flags rather
 * than rendering a tab that answers 403.
 */
export interface ParentLinkCreate {
  student_id: number
  relation?: GuardianRelation
  is_primary?: boolean
  may_view_academics?: boolean
  may_view_attendance?: boolean
  may_view_fees?: boolean
  receives_reports?: boolean
  notes?: string | null
}

export type ParentLinkUpdate = Partial<Omit<ParentLinkCreate, 'student_id'>> & {
  is_active?: boolean
}

export interface ParentLinkOut {
  id: number
  parent_id: number
  parent_name?: string | null
  parent_email?: string | null
  student_id: number
  student_name?: string | null
  student_admission_number?: string | null
  class_id?: number | null
  class_name?: string | null
  relation: GuardianRelation
  is_primary: boolean
  may_view_academics: boolean
  may_view_attendance: boolean
  may_view_fees: boolean
  receives_reports: boolean
  notes?: string | null
  is_active: boolean
  created_at?: ApiDateTime | null
}

/**
 * One child as their parent sees them on the switcher.
 *
 * Carries the link's permission flags so a tab can be hidden rather than
 * rendered and rejected — the same answer, arrived at before the parent has
 * clicked something they were never allowed to open.
 */
export interface ChildSummary {
  student_id: number
  full_name: string
  email?: string | null
  photo_url?: string | null
  admission_number?: string | null
  roll_number?: string | null
  class_id?: number | null
  class_name?: string | null
  relation: GuardianRelation
  is_primary: boolean
  may_view_academics: boolean
  may_view_attendance: boolean
  may_view_fees: boolean
  programs: string[]
}

// ======================================================================= notices

export type NoticePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

/**
 * The lifecycle an author controls — separate from whether the publish time
 * has arrived. One field cannot answer "why can nobody see this?" for both
 * causes, which is why `is_live` / `is_scheduled` / `is_expired` come back
 * already resolved alongside it.
 */
export type NoticeStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

/**
 * Who a notice is addressed to. The audience decides which target list is
 * read; the others are IGNORED rather than combined, so a form may safely
 * leave stale ids behind when the author switches audience.
 */
export type NoticeAudience = 'EVERYONE' | 'ROLE' | 'CLASS' | 'USER'

export interface NoticeAttachment {
  [key: string]: unknown
}

export interface NoticeCreate {
  title: string
  body: string
  program?: Program
  audience?: NoticeAudience
  priority?: NoticePriority
  /** Draft by default. Posting to the whole school is done deliberately. */
  status?: NoticeStatus
  target_roles?: UserRole[]
  target_class_ids?: number[]
  target_user_ids?: number[]
  include_class_teachers?: boolean
  include_parents?: boolean
  /** Empty means "live the moment it is published". */
  publish_at?: ApiDateTime | null
  expires_at?: ApiDateTime | null
  is_pinned?: boolean
  notify_by_email?: boolean
  attachments?: NoticeAttachment[]
}

export type NoticeUpdate = Partial<NoticeCreate>

export interface NoticeOut {
  id: number
  title: string
  body: string
  program: string
  audience: NoticeAudience
  status: NoticeStatus
  priority: NoticePriority
  target_roles: string[]
  target_class_ids: number[]
  target_user_ids: number[]
  /** Resolved names, so a review screen is not reading a list of integers. */
  target_class_names: string[]
  include_class_teachers: boolean
  include_parents: boolean
  publish_at?: ApiDateTime | null
  expires_at?: ApiDateTime | null
  is_pinned: boolean
  notify_by_email: boolean
  email_sent_at?: ApiDateTime | null
  attachments: NoticeAttachment[]

  /** Derived from the clock at read time, never stored. */
  is_live: boolean
  is_scheduled: boolean
  is_expired: boolean

  /** On a reader's own feed; null on the admin listing. */
  is_read?: boolean | null
  read_at?: ApiDateTime | null
  /** On the admin listing, when asked for `with_counts`. */
  read_count?: number | null
  recipient_count?: number | null

  author_id?: number | null
  author_name?: string | null
  created_at?: ApiDateTime | null
  updated_at?: ApiDateTime | null
}

/**
 * `unread_count` counts the WHOLE feed, not the page, so it stays correct
 * while the reader filters. Never recompute it from the items on screen.
 */
export interface NoticeFeed {
  items: NoticeOut[]
  unread_count: number
  pinned_count: number
}

export interface NoticePublishResult {
  notice: NoticeOut
  recipient_count: number
  emails_sent: number
  detail: string
}

// ======================================================================= finance

export type FeeFrequency = 'ONE_TIME' | 'MONTHLY' | 'TERM' | 'ANNUAL'

/**
 * What a non-tuition amount on a bill is. An enum rather than free text
 * because the arithmetic treats each differently: DISCOUNT subtracts, TAX is
 * computed on a base, and LATE_FEE must never itself be taxed.
 */
export type ChargeKind =
  | 'FEE'
  | 'CHARGE'
  | 'TAX'
  | 'CONVENIENCE'
  | 'LATE_FEE'
  | 'DISCOUNT'
  | 'OTHER'

/**
 * Why a concession applies, which decides what evidence resolves it.
 *
 * SIBLING counts children in a recorded household; MULTI_REGISTRATION counts
 * concurrent enrollments held by ONE student. Collapsing the two gives a
 * two-subject student the family discount, which nobody agreed to.
 */
export type DiscountBasis =
  | 'SIBLING'
  | 'MULTI_REGISTRATION'
  | 'CATEGORY'
  | 'SCHOLARSHIP'
  | 'EARLY_PAYMENT'
  | 'MANUAL'

export type DiscountValueType = 'PERCENT' | 'AMOUNT'

/** OVERDUE is derived from the clock at read time and never stored. */
export type InstalmentStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'WAIVED'

/**
 * How money arrived. ADJUSTMENT is a correction rather than money — a
 * write-off or a balance transfer.
 */
export type PaymentMethod =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'CHEQUE'
  | 'CARD'
  | 'UPI'
  | 'ONLINE'
  | 'ADJUSTMENT'
  | 'OTHER'

/** Provider-neutral: no gateway is wired, and the adapter maps onto these. */
export type PaymentIntentStatus =
  | 'CREATED'
  | 'REQUIRES_ACTION'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'

/**
 * How the payer WANTS to pay, chosen on the checkout page.
 *
 * Distinct from `PaymentMethod`, which records how money actually arrived.
 * The first four are what a gateway offers; the last two are the offline
 * routes, kept on the same intent so the office can match a transfer or a
 * counter payment to the reference the payer was shown.
 */
export type GatewayMethod = 'UPI' | 'CARD' | 'NET_BANKING' | 'WALLET' | 'BANK_TRANSFER' | 'OFFICE'

export type RoundingMode = 'NONE' | 'NEAREST' | 'UP' | 'DOWN'

// ---------------------------------------------------------------- fee heads

export interface FeeHeadCreate {
  /** e.g. "Tuition Fee". */
  name: string
  code: string
  kind?: ChargeKind
  frequency?: FeeFrequency
  default_amount?: number
  is_taxable?: boolean
  /** Overrides the program's default rate for this head only. */
  tax_percent?: number | null
  /** Turn off for statutory charges the school only passes on. */
  is_discountable?: boolean
  /** Charged once at joining; waived by categories that say so. */
  is_admission_charge?: boolean
  program?: Program
  description?: string | null
  is_active?: boolean
  sort_order?: number
}

export type FeeHeadUpdate = Partial<Omit<FeeHeadCreate, 'program'>>

export interface FeeHeadOut {
  id: number
  name: string
  code: string
  kind: ChargeKind
  frequency: FeeFrequency
  default_amount: number
  is_taxable: boolean
  tax_percent?: number | null
  is_discountable: boolean
  is_admission_charge: boolean
  program: string
  description?: string | null
  is_active: boolean
  sort_order: number
  created_at?: ApiDateTime | null
}

// ----------------------------------------------------------- fee structures

export interface FeeStructureItem {
  fee_head_id: number
  amount: number
  /** Overrides the head's own frequency and name for this structure only. */
  frequency?: FeeFrequency | null
  label?: string | null
}

export interface FeeStructureCreate {
  name: string
  academic_year_id: number
  items: FeeStructureItem[]
  /** Empty means every class — the year's default structure. */
  class_ids?: number[]
  /** Empty means every category. */
  admission_category_ids?: number[]
  program?: Program
  currency?: string | null
  /** Breaks a tie between equally specific structures. */
  priority?: number
  is_active?: boolean
  notes?: string | null
}

export type FeeStructureUpdate = Partial<
  Omit<FeeStructureCreate, 'academic_year_id' | 'program'>
>

export interface FeeStructureOut {
  id: number
  name: string
  academic_year_id: number
  academic_year_name?: string | null
  /** Denormalised rows: the item plus the head's resolved name and kind. */
  items: Array<FeeStructureItem & { name?: string; code?: string; kind?: string }>
  class_ids: number[]
  class_names: string[]
  admission_category_ids: number[]
  admission_category_names: string[]
  program: string
  currency: string
  priority: number
  is_active: boolean
  notes?: string | null
  /** The structure's own total, before any student-specific concession. */
  gross_total: number
  created_at?: ApiDateTime | null
}

// --------------------------------------------------------- instalment plans

/**
 * One instalment. Exactly one of `percent` / `amount`, and exactly one of
 * `due_date` / `due_after_days` — the backend rejects both or neither.
 * `due_after_days` counts from the year's start, so one plan serves every year.
 */
export interface InstalmentLine {
  /** e.g. "Term 1". */
  label: string
  percent?: number | null
  amount?: number | null
  /**
   * Ties the instalment to one of the year's terms: it falls due at that term's
   * start plus the due-days, and a one-time charge lands whole in the Term 1
   * instalment. A line needs a term, a due date or a day count.
   */
  term?: AcademicTerm | null
  due_date?: ApiDate | null
  due_after_days?: number | null
}

export interface InstalmentPlanCreate {
  name: string
  academic_year_id: number
  /** Percentages must total 100, checked on the backend as well as here. */
  instalments: InstalmentLine[]
  class_ids?: number[]
  admission_category_ids?: number[]
  /** Tie the plan to one structure; omit to match by class/category. */
  structure_id?: number | null
  program?: Program
  grace_days?: number | null
  is_default?: boolean
  is_active?: boolean
}

export type InstalmentPlanUpdate = Partial<
  Omit<InstalmentPlanCreate, 'academic_year_id' | 'program'>
>

export interface InstalmentPlanOut {
  id: number
  name: string
  academic_year_id: number
  instalments: InstalmentLine[]
  class_ids: number[]
  admission_category_ids: number[]
  structure_id?: number | null
  program: string
  grace_days?: number | null
  is_default: boolean
  is_active: boolean
  created_at?: ApiDateTime | null
}

// ------------------------------------------------------------ discount rules

export interface DiscountRuleCreate {
  name: string
  basis: DiscountBasis
  value_type?: DiscountValueType
  value: number
  academic_year_id?: number | null
  program?: Program
  /** SIBLING: from the nth child. MULTI_REGISTRATION: from the nth subject. */
  applies_from_nth?: number
  min_count?: number | null
  /** Required for a CATEGORY rule. */
  admission_category_ids?: number[]
  class_ids?: number[]
  /** Required for SCHOLARSHIP and MANUAL. */
  student_ids?: number[]
  /** Empty means every discountable head. */
  fee_head_ids?: number[]
  max_amount?: number | null
  /**
   * OFF by default: rules compete and only the best-valued one applies. Worth
   * surfacing in the editor, because a staff ward who is also a second child
   * getting one concession rather than two otherwise looks like a bug.
   */
  is_stackable?: boolean
  priority?: number
  valid_from?: ApiDate | null
  valid_until?: ApiDate | null
  is_active?: boolean
  notes?: string | null
}

export type DiscountRuleUpdate = Partial<
  Omit<DiscountRuleCreate, 'basis' | 'academic_year_id' | 'program'>
>

export interface DiscountRuleOut {
  id: number
  name: string
  basis: DiscountBasis
  value_type: DiscountValueType
  value: number
  academic_year_id?: number | null
  program: string
  applies_from_nth: number
  min_count?: number | null
  admission_category_ids: number[]
  class_ids: number[]
  student_ids: number[]
  fee_head_ids: number[]
  max_amount?: number | null
  is_stackable: boolean
  priority: number
  valid_from?: ApiDate | null
  valid_until?: ApiDate | null
  is_active: boolean
  notes?: string | null
  created_at?: ApiDateTime | null
}

// ---------------------------------------------------- the breakdown itself

export interface BreakdownLine {
  fee_head_id: number
  name: string
  code?: string | null
  kind: string
  frequency?: string | null
  amount: number
  taxable: boolean
  discountable: boolean
  tax_percent?: number | null
  discount_amount: number
  tax_amount: number
  net_amount: number
}

export interface AppliedDiscount {
  rule_id?: number | null
  name?: string | null
  basis?: string | null
  value_type?: string | null
  value?: number | null
  amount: number
  stacked: boolean
}

/**
 * A rule that did NOT fire, and why — "household has 1 child; rule needs 2".
 * Worth surfacing on the admin screen: it answers the support question before
 * it is asked.
 */
export interface SkippedDiscount {
  rule_id?: number | null
  name?: string | null
  basis?: string | null
  reason?: string | null
}

export interface InstalmentOut {
  label: string
  /** Set when the instalment is one of the year's terms. */
  term?: AcademicTerm | null
  /**
   * Which fee contributed what: tuition split evenly across the terms, a one-time
   * admission charge whole in the first. Present on the default term split.
   */
  components?: { name: string; amount: number }[]
  due_date?: ApiDate | null
  amount: number
  amount_paid: number
  outstanding?: number | null
  status: string
  is_overdue: boolean
  days_overdue: number
  late_fee_amount?: number | null
  waived_reason?: string | null
}

/**
 * What the payment page renders. `/fees/me`, `/parent/fees/children/{id}` and
 * the admin preview all return this, from the same computation.
 *
 * The totals relate as:
 *   subtotal − discount_total + tax_total + convenience_total
 *     ± rounding_adjustment = total_amount
 *
 * `charge_total` is the part of `subtotal` that is NOT teaching fees, so
 * "Fees" and "Charges" render as sections without recomputing anything.
 */
export interface FeeBreakdownOut {
  student_id: number
  student_name?: string | null
  academic_year_id: number
  /** What THESE figures are in — the currency asked for, or the base. */
  currency: string
  currency_symbol?: string | null
  /** What the fee structure was entered in. */
  base_currency?: string | null
  /** How one became the other. 1 when no conversion happened. */
  exchange_rate: number
  /**
   * What the payer's switcher should offer: enabled currencies that actually
   * carry a rate. A currency configured but rate-less is deliberately absent —
   * showing a price of zero is worse than not offering the currency.
   */
  available_currencies: string[]
  /**
   * The switcher, one row per offered currency, each carrying its own tax and
   * surcharge rules. `recommended_currency` is the base — the currency the
   * fees were set in and the only one with no conversion.
   */
  recommended_currency?: string | null
  currency_options?: CurrencyOptionOut[]
  structure_id?: number | null
  structure_name?: string | null
  instalment_plan_id?: number | null
  instalment_plan_name?: string | null
  line_items: BreakdownLine[]
  discounts: AppliedDiscount[]
  discounts_not_applied: SkippedDiscount[]
  instalments: InstalmentOut[]
  subtotal: number
  discount_total: number
  taxable_base: number
  tax_total: number
  tax_label: string
  charge_total: number
  convenience_total: number
  total_amount: number
  rounding_adjustment: number
  /** Drives whether "Pay online" is rendered at all. */
  gateway_enabled: boolean
  gateway_provider?: string | null
  detail?: string | null
}

export interface FeeInvoicePayment {
  amount?: number
  method?: PaymentMethod | string | null
  reference?: string | null
  paid_at?: ApiDateTime | null
  instalment_label?: string | null
  note?: string | null
  recorded_by?: number | null
  [key: string]: unknown
}

export interface FeeInvoiceOut {
  id: string
  /** Assigned at issue; null while the invoice is still a draft. */
  invoice_number?: string | null
  student_id: number
  student_name?: string | null
  admission_number?: string | null
  academic_year_id: number
  academic_year_name?: string | null
  structure_id?: number | null
  instalment_plan_id?: number | null
  status: InvoiceStatus
  /**
   * FROZEN at issue. A live rate never re-prices an issued bill — a parent who
   * opens it on Tuesday and pays on Thursday must not be asked for a different
   * number.
   */
  currency: string
  currency_symbol?: string | null
  base_currency?: string | null
  exchange_rate: number
  available_currencies: string[]
  line_items: BreakdownLine[]
  discounts: AppliedDiscount[]
  instalments: InstalmentOut[]
  payments: FeeInvoicePayment[]
  subtotal: number
  discount_total: number
  taxable_base: number
  tax_total: number
  tax_label: string
  charge_total: number
  convenience_total: number
  late_fee_total: number
  total_amount: number
  amount_paid: number
  amount_outstanding: number
  is_overdue: boolean
  issued_at?: ApiDateTime | null
  due_date?: ApiDate | null
  notes?: string | null
  gateway_enabled: boolean
  gateway_provider?: string | null
  created_at?: ApiDateTime | null
  updated_at?: ApiDateTime | null
}

/**
 * Named `Fee`-prefixed because `tuition.types` already exports a
 * `PaymentRecord` with a different shape for the tuition biller.
 */
export interface FeePaymentRecord {
  amount: number
  method?: PaymentMethod
  /** Cheque number, UTR, receipt number. */
  reference?: string | null
  /** Defaults to now. */
  paid_at?: ApiDateTime | null
  /** Apply to one instalment; omit to settle oldest-first. */
  instalment_label?: string | null
  note?: string | null
}

/**
 * `POST /admin/finance/students/{id}/collect` — the counter's one step. A
 * payment against a STUDENT: the year's invoice is built and issued first if
 * they have not been billed, then the money is recorded on it.
 */
export interface FeeCollectRequest extends FeePaymentRecord {
  /** Defaults to the current year. */
  academic_year_id?: number | null
}

// ------------------------------------------------------------ fee reports

/** Where a student's bill stands. OVERDUE is derived: an unsettled invoice past a due date. */
export type FeeRollStatus = 'NOT_BILLED' | 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE'

export type FeeReportView = 'students' | 'dues' | 'collections'

/** Amounts still owing, bucketed by how long past due. Not-billed students sit in `not_due`. */
export interface FeeAgeing {
  not_due: number
  d0_30: number
  d31_60: number
  d61_90: number
  over_90: number
}

export interface FeeRollInstalment {
  label: string
  term?: AcademicTerm | null
  due_date?: ApiDate | null
  amount: number
  amount_paid: number
  outstanding: number
  status: string
  is_overdue: boolean
  days_overdue: number
}

export interface FeeRollRow {
  student_id: number
  full_name?: string | null
  admission_number?: string | null
  roll_number?: string | null
  class_id?: number | null
  class_name?: string | null
  admission_category_name?: string | null
  status: FeeRollStatus
  invoice_id?: string | null
  invoice_number?: string | null
  currency: string
  total_amount: number
  amount_paid: number
  amount_outstanding: number
  amount_overdue: number
  /** What the rules would bill a student with no invoice yet. */
  expected_total?: number | null
  /** The figure to chase: outstanding on the invoice, or the expected total. */
  amount_due: number
  is_overdue: boolean
  next_due?: {
    label: string
    term?: AcademicTerm | null
    due_date?: ApiDate | null
    amount: number
    is_overdue: boolean
    days_overdue: number
  } | null
  last_payment_at?: ApiDateTime | null
  last_payment_amount?: number | null
  ageing: FeeAgeing
  instalments: FeeRollInstalment[]
}

export interface FeeRollSummary {
  currency: string
  students: number
  billed: number
  not_billed: number
  paid: number
  partially_paid: number
  unpaid: number
  overdue: number
  total_billed: number
  total_collected: number
  total_outstanding: number
  total_overdue: number
  expected_unbilled: number
  total_due: number
  by_status: Record<string, number>
  ageing: FeeAgeing
}

/** GET /admin/finance/reports/students and /reports/dues. */
export interface FeeRollReport {
  academic_year_id: number
  academic_year_name?: string | null
  as_of: ApiDate
  currency: string
  class_id?: number | null
  status?: string | null
  summary: FeeRollSummary
  rows: FeeRollRow[]
}

/** One fee head's share of a payment, from replaying the invoice's allocation. */
export interface FeeCollectionHead {
  name: string
  fee_head_id?: number | null
  is_admission_charge: boolean
  amount: number
}

export interface FeeCollectionHeadTotal {
  name: string
  fee_head_id?: number | null
  is_admission_charge: boolean
  count: number
  total: number
}

/** POST /admin/finance/receipts: money received with no invoice on this system. */
export interface FeeReceiptCreate {
  student_id: number
  fee_head_id: number
  amount: number
  /** A date or a datetime. */
  paid_at: string
  method?: PaymentMethod
  reference?: string | null
  note?: string | null
  /** Defaults to the student's admission year. */
  academic_year_id?: number | null
}

export interface FeeReceiptOut {
  id: number
  program: Program
  student_id: number
  student_name?: string | null
  admission_number?: string | null
  academic_year_id?: number | null
  fee_head_id: number
  head_name?: string | null
  is_admission_charge: boolean
  amount: number
  currency: string
  paid_at: ApiDateTime
  method: string
  reference?: string | null
  note?: string | null
  source: 'OPENING_BALANCE' | string
  recorded_by?: number | null
  recorded_at?: ApiDateTime | null
}

export interface FeeCollectionRow {
  paid_at: ApiDateTime
  paid_on: ApiDate
  amount: number
  currency: string
  method: string
  reference?: string | null
  note?: string | null
  /** The instalment the payer named, if any. */
  instalment_label?: string | null
  /** The instalments a general payment actually cleared, oldest first. */
  instalments_settled: string[]
  /** What the money settled, by fee head, admission first. */
  heads: FeeCollectionHead[]
  admission_fee_amount: number
  /** INVOICE: a payment on a bill. OPENING_BALANCE: received before this system, entered after. */
  source: 'INVOICE' | 'OPENING_BALANCE'
  receipt_id?: number | null
  invoice_id: string
  invoice_number?: string | null
  academic_year_id?: number | null
  student_id: number
  student_name?: string | null
  admission_number?: string | null
  class_id?: number | null
  class_name?: string | null
  recorded_by?: number | null
  recorded_by_name?: string | null
}

/** GET /admin/finance/reports/collections. */
export interface FeeCollectionsReport {
  from_date: ApiDate
  to_date: ApiDate
  academic_year_id?: number | null
  class_id?: number | null
  method?: string | null
  head_id?: number | null
  currency: string
  summary: {
    currency: string
    count: number
    total: number
    /** The part of `total` that settled admission-charge heads. */
    admission_fees: number
    other_fees: number
    by_head: FeeCollectionHeadTotal[]
    /** The filtered head's own count and total, when `head_id` was given. */
    head?: FeeCollectionHeadTotal | null
    by_method: Record<string, { count: number; total: number }>
    by_day: { date: ApiDate; count: number; total: number }[]
    by_class: { class_name: string; count: number; total: number }[]
  }
  rows: FeeCollectionRow[]
}

export interface WaiveInstalmentRequest {
  label: string
  /** Mandatory — a waiver with no stated cause cannot be audited. */
  reason: string
}

export interface PaymentIntentCreate {
  amount: number
  instalment_label?: string | null
  /** What the payer chose. Offline methods make the intent a reference to quote. */
  method?: GatewayMethod | null
}

export interface PaymentIntentOut {
  id: number
  invoice_id: string
  student_id: number
  amount: number
  currency: string
  status: PaymentIntentStatus
  provider?: string | null
  provider_reference?: string | null
  /** Always null until a provider is wired. */
  checkout_url?: string | null
  idempotency_key?: string | null
  instalment_label?: string | null
  requested_method?: GatewayMethod | string | null
  /** LMS or TUITION — which biller the invoice belongs to. */
  program?: string | null
  invoice_number?: string | null
  /** What the payer quotes at the office or on a transfer: "PAY-<id>". */
  reference?: string | null
  failure_reason?: string | null
  completed_at?: ApiDateTime | null
  created_at?: ApiDateTime | null
  /** Plain-language state of the attempt — shown as-is on the checkout result. */
  detail?: string | null
}

export interface FinanceSettingsOut {
  program: string
  currency: string
  tax_enabled: boolean
  tax_percent: number
  tax_label: string
  tax_inclusive: boolean
  late_fee_enabled: boolean
  late_fee_percent: number
  late_fee_amount: number
  late_fee_grace_days: number
  convenience_percent: number
  convenience_amount: number
  invoice_prefix: string
  invoice_due_days: number
  rounding: RoundingMode | string
  gateway_enabled: boolean
  gateway_provider?: string | null
}

/**
 * Sending `null` does NOT clear a setting — a form defaulting untouched inputs
 * to null would otherwise reset the school's tax rate every time somebody
 * edited the late fee. Omit what you are not changing.
 */
export type FinanceSettingsUpdate = Partial<Omit<FinanceSettingsOut, 'program'>>

// ====================================================== currencies and rates

/**
 * Where a rate came from, as configured.
 *
 * MANUAL uses the school's own figure. LIVE fetches from the exchange-rate
 * provider and falls back to that same figure when it is unreachable — which
 * is why `rate_from_base` stays meaningful even under LIVE.
 */
export type RateSource = 'MANUAL' | 'LIVE'

/**
 * How `rate_from_base` was ACTUALLY obtained on this response.
 *
 * Distinct from `rate_source`, which is only what was asked for. Surface it: a
 * page claiming a live rate while serving a fallback is worse than one that
 * says which it used.
 */
export type RateStatus =
  | 'base'
  | 'manual'
  | 'live'
  | 'cached'
  | 'stale'
  | 'fallback_manual'

/**
 * One currency the school offers.
 *
 * A currency is a rate AND a set of charges, not just a multiplier: a domestic
 * transfer carries a gateway percentage a card payment in another currency does
 * not, and the tax position is rarely the same. Each currency overrides only
 * the keys it needs; the rest fall through to the programme's finance settings,
 * so a school running one currency fills none of this in.
 */
export interface CurrencyConfigOut {
  code: string
  symbol?: string | null
  is_base: boolean
  enabled: boolean
  /** Units of this currency per one unit of the base. The base is always 1. */
  rate_from_base: number
  /** The school's own figure, kept under LIVE as the fallback. */
  manual_rate: number
  rate_source: RateSource | string
  rate_status: RateStatus | string
  rate_fetched_at?: ApiDateTime | null
  rate_detail?: string | null

  tax_enabled: boolean
  tax_percent: number
  tax_label: string
  tax_inclusive: boolean
  late_fee_enabled: boolean
  late_fee_percent: number
  late_fee_amount: number
  late_fee_grace_days: number
  convenience_percent: number
  convenience_amount: number
  rounding: RoundingMode | string

  /**
   * Which keys THIS currency sets for itself; everything else was inherited
   * from the programme's finance settings. Lets the editor show what is
   * currency-specific rather than merely defaulted.
   */
  overrides: string[]
}

export interface CurrencySettingsOut {
  program: string
  /** What fee structures are ENTERED in. Changing it re-prices nothing. */
  base_currency: string
  currencies: Record<string, CurrencyConfigOut>
  /** Enabled and carrying a rate — what a payer may actually pick. */
  available: string[]
  recommended_currency?: string | null
  options?: CurrencyOptionOut[]
}

/**
 * One row of the payer's currency switcher.
 *
 * Not just a code: each currency carries its own tax and surcharge, and a
 * payer choosing between INR and AED should see that AED adds VAT and a card
 * fee BEFORE choosing it. `recommended` marks the base currency. The totals
 * are present on a fee breakdown, where the same classes have been priced in
 * every offered currency, and absent on the settings screen.
 */
export interface CurrencyOptionOut {
  code: string
  symbol?: string | null
  is_base: boolean
  recommended: boolean
  rate_from_base: number
  rate_status?: string | null
  tax_enabled: boolean
  tax_percent: number
  tax_label: string
  tax_inclusive: boolean
  convenience_percent: number
  convenience_amount: number
  rounding: string
  /** "GST 18% + 2% convenience" — ready to print beside the option. */
  charges_summary?: string | null
  subtotal?: number | null
  tax_total?: number | null
  convenience_total?: number | null
  total_amount?: number | null
}

/** Partial per currency: editing one rate does not resend the other's charges. */
export interface CurrencyConfigUpdate {
  enabled?: boolean
  symbol?: string | null
  rate_from_base?: number
  rate_source?: RateSource
  tax_enabled?: boolean
  tax_percent?: number
  tax_label?: string
  tax_inclusive?: boolean
  late_fee_enabled?: boolean
  late_fee_percent?: number
  late_fee_amount?: number
  late_fee_grace_days?: number
  convenience_percent?: number
  convenience_amount?: number
  rounding?: RoundingMode
}

export interface CurrencySettingsUpdate {
  base_currency?: string
  /** Keyed by code. Merged per currency. */
  currencies?: Record<string, CurrencyConfigUpdate>
}

/** One cached provider response, for the admin's rates screen. */
export interface FxCacheEntry {
  [key: string]: unknown
}

export interface FxStatusOut {
  enabled: boolean
  provider: string
  cache_minutes: number
  entries: FxCacheEntry[]
}

/** What a forced refresh resolved, per currency — including the failures. */
export interface FxRefreshResult {
  base_currency: string
  refreshed_at: FxStatusOut
  rates: Record<
    string,
    {
      rate: number
      source: string
      status: RateStatus | string
      fetched_at?: ApiDateTime | null
      detail?: string | null
    }
  >
}

// ================================================================ live classes

/**
 * The class clock, computed server-side so a teacher's screen and a student's
 * cannot disagree.
 *
 * Bind the join button to `may_join` and NOTHING else: it already accounts for
 * the early window, the grace period, the status and whether the teacher has
 * started. Anything derived client-side eventually disagrees with the server,
 * which enforces the same rule on `/join` and answers 409.
 */
export interface ClassTimingOut {
  now: ApiDateTime
  scheduled_start_at?: ApiDateTime | null
  scheduled_end_at?: ApiDateTime | null
  duration_minutes: number
  starts_in_minutes?: number | null
  minutes_remaining?: number | null
  class_started_at?: ApiDateTime | null
  class_has_started: boolean
  is_live: boolean
  is_closed: boolean
  is_expired: boolean
  auto_start: boolean
  join_opens_at?: ApiDateTime | null
  join_window_open: boolean
  may_join: boolean
  /**
   * A student in this state is WAITING, not late — the teacher has not opened
   * the class yet. Word the UI accordingly.
   */
  waiting_for_teacher: boolean
  /**
   * Show verbatim when `may_join` is false. It distinguishes "The class opens
   * at 09:55", "Waiting for the teacher to start the class" and "This class
   * has ended", which the flags alone cannot.
   */
  join_blocked_reason?: string | null
}

/** The link is absent unless the caller may actually join. */
export interface JoinClassOut {
  meeting_id: number
  title: string
  meeting_link?: string | null
  timing: ClassTimingOut
}

/** One row of the dashboard "join now" strip. Only joinable classes appear. */
export interface LiveClassRow {
  meeting_id: number
  title?: string | null
  class_id?: number | null
  subject_id?: number | null
  meeting_link?: string | null
  timing: ClassTimingOut
}

/**
 * A class's standing room, as one person sees it right now.
 *
 * The school runs ONE Google Meet room per class: students join it and stay,
 * and each subject teacher joins at their period. `may_join` is the single
 * flag a join button binds to — for a student it is true for the WHOLE school
 * day, from `day_opens_at` (a little before the first period) to
 * `day_closes_at` (a little after the last), breaks included, or while any
 * scheduled session is live; a teacher or admin may always enter. Show
 * `join_blocked_reason` verbatim when it is false. `room_link` is present
 * only when the caller may enter.
 */
export interface ClassRoomAccessOut {
  class_id: number
  class_name: string
  class_code?: string | null
  has_room: boolean
  room_provider?: 'GOOGLE_MEET' | 'MANUAL' | string | null
  room_status?: 'NONE' | 'CREATED' | 'MANUAL' | 'FAILED' | string | null
  room_error?: string | null
  room_recording_status?: string | null
  /** Whether the school shares rooms per class at all (the admin setting). */
  class_room_mode: boolean
  is_host: boolean
  now: ApiDateTime
  may_join: boolean
  join_blocked_reason?: string | null
  current_period?: ScheduledPeriod | null
  next_period?: ScheduledPeriod | null
  periods_today: ScheduledPeriod[]
  /**
   * The day's window: a student joins once at `day_opens_at` and stays until
   * `day_closes_at`. Null when nothing is timetabled today.
   */
  day_opens_at?: ApiDateTime | null
  day_closes_at?: ApiDateTime | null
  /**
   * The caller's own window: a teacher may enter only around THEIR period
   * (the current one, else the next), a student for the day, an admin always
   * (null). `my_*_period` are a teacher's own periods in this class.
   */
  window_opens_at?: ApiDateTime | null
  window_closes_at?: ApiDateTime | null
  my_current_period?: ScheduledPeriod | null
  my_next_period?: ScheduledPeriod | null
  /** The caller is this class's class teacher and gets the whole-day window. */
  leads_class?: boolean
  /** Admins may always enter; every other host is bound to their own periods. */
  is_admin?: boolean
  /** Scheduled sessions of this class that are live right now. */
  live_meeting_ids: number[]
  /**
   * The caller's own last movement today. `in_room` is true when that last
   * word was a join. The LMS cannot see a Meet tab close, so a leave is the
   * person saying so through the Leave button (`POST /rooms/{id}/leave`).
   */
  my_last_action?: ClassRoomEventAction | string | null
  my_last_at?: ApiDateTime | null
  in_room: boolean
  room_link?: string | null
}

export interface JoinRoomOut {
  class_id: number
  class_name: string
  room_link?: string | null
  access: ClassRoomAccessOut
}

/**
 * One user's last sign of life (`GET /admin/users/presence`). `is_online`
 * means the server heard from them in the last three minutes: any request,
 * or the heartbeat an open tab sends once a minute. A user with no row has
 * not signed in since tracking began.
 */
export interface UserPresenceOut {
  user_id: number
  last_seen_at?: ApiDateTime | null
  is_online: boolean
}

export interface RoomPresenceRow {
  user_id: number
  name: string
  in_room: boolean
  last_action?: ClassRoomEventAction | string | null
  last_at?: ApiDateTime | null
}

/**
 * Who is in a class's room right now, by name, from the LMS log: in when
 * their last word today was a join, out when it was a leave. Teachers of the
 * class and admins only (`GET /classes/rooms/{id}/presence`).
 */
export interface RoomPresenceOut {
  class_id: number
  class_name: string
  now: ApiDateTime
  enrolled_count: number
  in_count: number
  /** Everyone enrolled, those in the room first, then by name. */
  students: RoomPresenceRow[]
  teachers_in: RoomPresenceRow[]
  meet_attendance_synced_at?: ApiDateTime | null
}

/**
 * What the LMS recorded about a class's room: a join it handed a link out
 * for, a leave somebody told it about, a period a teacher opened or closed, a
 * room made or removed. Google Meet's own record of who was in the call, and
 * when, is `ClassRoomAttendanceOut`.
 */
export type ClassRoomEventAction =
  | 'JOINED_ROOM'
  | 'LEFT_ROOM'
  | 'JOINED_SESSION'
  | 'STARTED'
  | 'ENDED'
  | 'ROOM_CREATED'
  | 'ROOM_REPLACED'
  | 'ROOM_LINK_SET'
  | 'ROOM_CLEARED'

export interface ClassRoomEventOut {
  id?: number | null
  class_id: number
  meeting_id?: number | null
  user_id?: number | null
  user_name?: string | null
  role?: UserRole | string | null
  action: ClassRoomEventAction | string
  detail?: string | null
  at: ApiDateTime
}

export interface LiveSessionOut {
  meeting_id: number
  title?: string | null
  subject_name?: string | null
  teacher_name?: string | null
  timing: ClassTimingOut
}

/**
 * One class on the admin's live board. `students_joined_today` is everyone
 * the LMS saw come in; `students_in_now` / `teachers_in_now` are those whose
 * last word today was a join rather than a leave.
 */
export interface LiveClassBoardRow extends ClassRoomAccessOut {
  enrolled_count: number
  students_joined_today: number
  teachers_joined_today: string[]
  /** A teacher came in since the current period opened, or is in now. */
  teacher_present: boolean
  students_in_now: string[]
  teachers_in_now: string[]
  live_sessions: LiveSessionOut[]
  last_event?: ClassRoomEventOut | null
  is_live: boolean
  /** When Meet's attendance record was last copied, or why it cannot be yet. */
  room_attendance_synced_at?: ApiDateTime | null
  room_attendance_error?: string | null
}

/**
 * One participant of one Meet conference in a class's room, as Google
 * recorded it: when they joined and left, in sessions. Meet gives a display
 * name, not an email, so `matched_user_*` is the LMS's best match by name and
 * is empty for a guest it cannot place.
 */
export interface ClassRoomAttendanceOut {
  id?: string | null
  class_id: number
  date: ApiDate
  conference_record?: string | null
  conference_start_at?: ApiDateTime | null
  conference_end_at?: ApiDateTime | null
  /** Meet's resource name for this participant in this conference. */
  participant?: string | null
  display_name?: string | null
  user_kind?: 'SIGNED_IN' | 'ANONYMOUS' | 'PHONE' | string | null
  matched_user_id?: number | null
  matched_user_name?: string | null
  matched_role?: UserRole | string | null
  sessions: { joined_at?: ApiDateTime | null; left_at?: ApiDateTime | null }[]
  first_joined_at?: ApiDateTime | null
  last_left_at?: ApiDateTime | null
  /** The latest session has no end time: they are in the call right now. */
  still_in: boolean
  minutes: number
  synced_at?: ApiDateTime | null
}

// =============================================================== extra classes

/**
 * PENDING → APPROVED → SCHEDULED, or REJECTED / CANCELLED.
 *
 * CANCELLED is the requester withdrawing; REJECTED is an administrator
 * refusing. Same empty timetable, very different conversation.
 */
export type ExtraClassStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'REJECTED'
  | 'CANCELLED'

/**
 * A school request needs `class_id` AND `subject_id`; a tuition request needs
 * `enrollment_id` and neither of the other two. The backend rejects any other
 * combination, because "who is this class for?" must have one answer.
 */
export interface ExtraClassCreate {
  title: string
  scheduled_time: ApiDateTime
  duration_minutes?: number
  /** Read by whoever approves it. */
  reason?: string | null
  program?: Program
  class_id?: number | null
  subject_id?: number | null
  enrollment_id?: number | string | null
}

export interface ExtraClassDecision {
  approve: boolean
  /** Required when rejecting — the teacher needs a reason they can read. */
  note?: string | null
}

export interface ExtraClassOut {
  id: number
  requested_by: number
  teacher_name?: string | null
  title: string
  scheduled_time: ApiDateTime
  duration_minutes: number
  program: string
  reason?: string | null
  class_id?: number | null
  class_name?: string | null
  subject_id?: number | null
  subject_name?: string | null
  enrollment_id?: number | string | null
  status: ExtraClassStatus
  decided_by?: number | null
  decided_by_name?: string | null
  decided_at?: ApiDateTime | null
  decision_note?: string | null
  /**
   * Set once the approved class actually exists. An APPROVED request with
   * NEITHER is an approval whose class has not been made yet — show it as such
   * and offer a retry rather than treating APPROVED as done.
   */
  created_meeting_id?: number | null
  created_session_id?: string | null
  created_at?: ApiDateTime | null
}

// ====================================================================== calendar

export type CalendarKind =
  | 'TIMETABLE'
  | 'LIVE_CLASS'
  | 'TUITION_CLASS'
  | 'EXAM'
  | 'HOMEWORK'

/**
 * Every source flattened to one shape, so a week renders without knowing which
 * collection a row came from. Switch on `kind` for colour and icon only.
 */
export interface CalendarEvent {
  kind: CalendarKind | string
  title: string
  start_at?: ApiDateTime | null
  end_at?: ApiDateTime | null
  /** True for homework: render it in the day header, not at an hour. */
  all_day: boolean
  due_date?: ApiDate | null
  class_id?: number | null
  class_name?: string | null
  subject_id?: number | null
  subject_name?: string | null
  teacher_id?: number | null
  teacher_name?: string | null
  /** Set on a parent's calendar — whose event this is. */
  student_id?: number | null
  student_name?: string | null
  status?: string | null
  /** Present ONLY when the viewer may join right now. */
  meeting_link?: string | null
  reference_id?: number | string | null
  program: string
  is_cancelled: boolean
  /** The full class clock, on live classes only. */
  timing?: ClassTimingOut | null
}

/** Empty days ARE included, so a month grid lines up without synthesised blanks. */
export interface CalendarDay {
  date: ApiDate
  weekday: string
  events: CalendarEvent[]
  count: number
}

export interface CalendarOut {
  from_date: ApiDate
  to_date: ApiDate
  events: CalendarEvent[]
  count: number
  counts_by_kind: Record<string, number>
  /** Populated only when `group_by_day` was requested. */
  days?: CalendarDay[] | null
}

// ====================================================================== homework

/** MISSED is derived from the due date having passed, never stored. */
export type HomeworkStatus = 'ASSIGNED' | 'SUBMITTED' | 'GRADED' | 'MISSED'

export interface HomeworkAttachment {
  [key: string]: unknown
}

export interface HomeworkCreate {
  class_id: number
  subject_id: number
  title: string
  due_date: ApiDate
  description?: string | null
  /** Defaults to today. */
  assigned_date?: ApiDate | null
  max_marks?: number | null
  /** Counts towards the daily-homework obligation in the cadence report. */
  is_mandatory?: boolean
  allow_late_submission?: boolean
  attachments?: HomeworkAttachment[]
}

export type HomeworkUpdate = Partial<
  Omit<HomeworkCreate, 'class_id' | 'subject_id' | 'assigned_date'>
>

export interface HomeworkOut {
  id: number
  class_id: number
  class_name?: string | null
  subject_id: number
  subject_name?: string | null
  teacher_id: number
  teacher_name?: string | null
  title: string
  description?: string | null
  assigned_date: ApiDate
  due_date: ApiDate
  max_marks?: number | null
  is_mandatory: boolean
  allow_late_submission: boolean
  attachments: HomeworkAttachment[]
  /** Derived at read time; never stored. */
  is_overdue: boolean
  days_until_due?: number | null
  /** On a teacher's view. */
  submission_count?: number | null
  expected_count?: number | null
  /** On a student's view. */
  my_status?: HomeworkStatus | null
  my_marks?: number | null
  created_at?: ApiDateTime | null
}

/** Needs either written work or an attachment; both empty is a 422. */
export interface HomeworkSubmit {
  body?: string | null
  attachments?: HomeworkAttachment[]
}

export interface HomeworkGrade {
  marks?: number | null
  feedback?: string | null
}

export interface HomeworkSubmissionOut {
  /** A string id, unlike the assignment's numeric one. */
  id: string
  assignment_id: number
  assignment_title?: string | null
  student_id: number
  student_name?: string | null
  status: HomeworkStatus
  body?: string | null
  attachments: HomeworkAttachment[]
  submitted_at?: ApiDateTime | null
  is_late: boolean
  marks?: number | null
  max_marks?: number | null
  feedback?: string | null
  graded_by?: number | null
  graded_at?: ApiDateTime | null
}

// ==================================================================== staff leave

export type LeaveType =
  | 'CASUAL'
  | 'SICK'
  | 'EARNED'
  | 'UNPAID'
  | 'MATERNITY'
  | 'BEREAVEMENT'
  | 'OTHER'

/** WITHDRAWN is the applicant's own action; REJECTED is the approver's. */
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'CANCELLED'

/** A half-day request covers ONE date — start and end must match. */
export type LeaveDayPart = 'FULL_DAY' | 'FIRST_HALF' | 'SECOND_HALF'

export interface LeaveAttachment {
  [key: string]: unknown
}

export interface LeaveApply {
  leave_type: LeaveType
  start_date: ApiDate
  end_date: ApiDate
  day_part?: LeaveDayPart
  reason?: string | null
  contact_during_leave?: string | null
  attachments?: LeaveAttachment[]
}

export interface LeaveDecision {
  approve: boolean
  /** Required when rejecting. */
  note?: string | null
  /** Optional: who covers the affected periods. */
  substitute_teacher_id?: number | null
}

/** What the applicant was timetabled to take, snapshotted at application time. */
export interface AffectedPeriod {
  date: ApiDate
  class_id?: number | null
  class_name?: string | null
  subject_name?: string | null
  start_time?: string | null
  end_time?: string | null
}

export interface LeaveRequestOut {
  id: number
  teacher_id: number
  teacher_name?: string | null
  employee_id?: string | null
  leave_type: LeaveType
  start_date: ApiDate
  end_date: ApiDate
  day_part: LeaveDayPart
  total_days: number
  reason?: string | null
  contact_during_leave?: string | null
  status: LeaveStatus
  decided_by?: number | null
  decided_by_name?: string | null
  decided_at?: ApiDateTime | null
  decision_note?: string | null
  substitute_teacher_id?: number | null
  substitute_teacher_name?: string | null
  /** Show this on the approval screen: it is what the approver is agreeing to cover. */
  affected_periods: AffectedPeriod[]
  attachments: LeaveAttachment[]
  created_at?: ApiDateTime | null
}

/**
 * `pending_days` is separate from `taken_days` because a request awaiting a
 * decision is neither granted nor free. Showing one combined figure is how two
 * teachers get approved for the same week — render both.
 */
export interface LeaveBalanceOut {
  teacher_id: number
  teacher_name?: string | null
  academic_year_id?: number | null
  taken_days: Record<string, number>
  pending_days: Record<string, number>
  total_taken: number
  total_pending: number
  request_count: number
}

// ======================================================================= support

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_USER' | 'RESOLVED' | 'CLOSED'

export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

export type TicketCategory =
  | 'TECHNICAL'
  | 'ACADEMIC'
  | 'BILLING'
  | 'ACCOUNT'
  | 'FEEDBACK'
  | 'OTHER'

export interface TicketAttachment {
  [key: string]: unknown
}

export interface TicketCreate {
  subject: string
  body: string
  category?: TicketCategory
  priority?: TicketPriority
  program?: Program
  about_student_id?: number | null
  attachments?: TicketAttachment[]
}

export interface TicketReply {
  body: string
  attachments?: TicketAttachment[]
  /** Staff-only note the reporter never sees. Ignored for non-staff. */
  is_internal?: boolean
}

/** Staff only — a non-staff PUT is a 403. */
export interface TicketUpdate {
  status?: TicketStatus
  priority?: TicketPriority
  category?: TicketCategory
  assigned_to?: number | null
  resolution_note?: string | null
}

export interface TicketMessageOut {
  author_id?: number | null
  author_name?: string | null
  author_role?: string | null
  body: string
  attachments: TicketAttachment[]
  is_internal: boolean
  sent_at?: ApiDateTime | null
}

export interface TicketOut {
  id: number
  subject: string
  raised_by: number
  raised_by_name?: string | null
  raised_by_role?: string | null
  program: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  messages: TicketMessageOut[]
  message_count: number
  assigned_to?: number | null
  assigned_to_name?: string | null
  about_student_id?: number | null
  about_student_name?: string | null
  first_response_at?: ApiDateTime | null
  resolved_at?: ApiDateTime | null
  closed_at?: ApiDateTime | null
  resolution_note?: string | null
  satisfaction_rating?: number | null
  created_at?: ApiDateTime | null
  updated_at?: ApiDateTime | null
}

export interface TicketRating {
  /** 1–5, after resolution. */
  rating: number
  comment?: string | null
}

/**
 * The 'call' half of support. Per product, because a tuition parent and a
 * school parent are usually given different numbers.
 *
 * When `tickets_enabled` is false, `POST /support/tickets` answers 403 and the
 * page should offer the phone and email only.
 */
export interface SupportContactOut {
  program: string
  phone?: string | null
  alternate_phone?: string | null
  whatsapp?: string | null
  email?: string | null
  /** e.g. "Mon–Fri, 9am–5pm". */
  hours?: string | null
  address?: string | null
  notes?: string | null
  tickets_enabled: boolean
}

export type SupportContactUpdate = Partial<Omit<SupportContactOut, 'program'>>

/**
 * `awaiting_first_response` and `unassigned` are the two that matter: a ticket
 * nobody has answered and a ticket nobody owns are the failures a queue exists
 * to surface.
 */
export interface SupportQueueSummary {
  total: number
  active: number
  unassigned: number
  awaiting_first_response: number
  urgent: number
  by_status: Record<string, number>
  by_category: Record<string, number>
}

// ============================================================ product switcher

export interface ProgramChoice {
  value: string
  /** "School", "Online Tuition". */
  label: string
  is_default: boolean
}

/**
 * A read of your own profile, not a permission grant — every tuition endpoint
 * checks `programs` independently. `show_switcher` is false when there is
 * nothing to choose between; hide the control rather than rendering a
 * one-item dropdown.
 */
export interface MyProgramsOut {
  user_id: number
  role: string
  programs: ProgramChoice[]
  default_program: string
  show_switcher: boolean
}

// =========================================================== academic oversight

/** One (class, subject) pair's compliance with the exam and homework cadence. */
export interface CadencePair {
  class_id: number
  class_name?: string | null
  subject_id: number
  subject_name?: string | null
  teacher_id?: number | null
  teacher_name?: string | null
  last_exam_id?: number | null
  last_exam_title?: string | null
  last_exam_date?: ApiDate | null
  days_since_exam?: number | null
  exam_overdue: boolean
  exam_never_set: boolean
  last_homework_id?: number | null
  last_homework_title?: string | null
  last_homework_date?: ApiDate | null
  days_since_homework?: number | null
  homework_overdue: boolean
  homework_never_set: boolean
}

/**
 * Cadence REPORTS; it never blocks. Nothing stops a teacher taking a class
 * with last week's exam missing — present it as the management list it is,
 * worst first, subjects never examined above merely overdue.
 */
export interface CadenceReport {
  as_of: ApiDate
  exam_interval_days: number
  homework_interval_days: number
  pairs: CadencePair[]
  total_pairs: number
  exam_overdue_count: number
  homework_overdue_count: number
  never_examined_count: number
}

/** Pair `exams_attempted` with `exams_set`: 3 of 8 and 3 of 3 are opposite problems. */
export interface StudentExamCount {
  student_id: number
  student_name?: string | null
  admission_number?: string | null
  class_id: number
  class_name?: string | null
  exams_set: number
  exams_attempted: number
  exams_missed: number
  attendance_percent?: number | null
}

export interface ExamCountsReport {
  from_date: ApiDate
  to_date: ApiDate
  students: StudentExamCount[]
  total_students: number
  students_with_missed: number
}

export interface StudentHomeworkCount {
  student_id: number
  student_name?: string | null
  class_id: number
  class_name?: string | null
  homework_set: number
  submitted: number
  late: number
  missed: number
  submission_percent?: number | null
}

export interface HomeworkCountsReport {
  from_date: ApiDate
  to_date: ApiDate
  students: StudentHomeworkCount[]
  total_students: number
  students_with_missed: number
}

export type ParentReportPeriod = 'WEEKLY' | 'MONTHLY'

/**
 * The digest a parent would receive. A view over attendance, marks, homework
 * and fees rather than anything stored, so any past period can be previewed
 * and a wrong figure is fixed by correcting the record behind it.
 */
export interface ParentReportPreview {
  student_id: number
  student_name?: string | null
  period?: string
  from_date?: ApiDate
  to_date?: ApiDate
  [key: string]: unknown
}

/** Idempotent per recipient per period; a repeat reports "already sent". */
export interface ParentReportSendResult {
  detail?: string
  sent?: number
  skipped?: number
  [key: string]: unknown
}

export interface ParentReportSweepResult {
  detail?: string
  students?: number
  sent?: number
  skipped?: number
  [key: string]: unknown
}

// ========================================================== tuition subjects

/**
 * The same records as `/enrollments`, shaped the way the office thinks about
 * them. Adding a subject schedules NOTHING — create slots afterwards or the
 * student is enrolled with no classes.
 */
export interface StudentSubjectAdd {
  subject_id: number
  /** Required: a subject with nobody teaching it is not an arrangement. */
  teacher_id: number
  syllabus?: string | null
  grade_level?: string | null
  default_duration_minutes?: number | null
  start_date?: ApiDate | null
  notes?: string | null
}

export interface StudentSubjectOut {
  enrollment_id: number
  student_id: number
  student_name?: string | null
  subject_id?: number | null
  subject_name?: string | null
  subject_code?: string | null
  teacher_id?: number | null
  teacher_name?: string | null
  status?: string | null
  syllabus?: string | null
  grade_level?: string | null
  start_date?: ApiDate | null
  end_date?: ApiDate | null
  /** Scheduled classes, and the subset that actually took place. */
  session_count: number
  conducted_count: number
}

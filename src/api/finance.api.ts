import { cleanParams, del, get, post, put } from './client'
import { downloadCsv } from './tuition.api'
import type {
  ApiDate,
  CurrencySettingsOut,
  CurrencySettingsUpdate,
  DiscountRuleCreate,
  DiscountRuleOut,
  DiscountRuleUpdate,
  FeeBreakdownOut,
  FeeHeadCreate,
  FeeHeadOut,
  FeeHeadUpdate,
  FeeCollectRequest,
  FeeCollectionsReport,
  FeeInvoiceOut,
  FeeReceiptCreate,
  FeeReceiptOut,
  FeeReportView,
  FeeRollReport,
  FeePaymentRecord,
  FeeStructureCreate,
  FeeStructureOut,
  FeeStructureUpdate,
  FinanceSettingsOut,
  FinanceSettingsUpdate,
  FxRefreshResult,
  FxStatusOut,
  InstalmentPlanCreate,
  InstalmentPlanOut,
  InstalmentPlanUpdate,
  InvoiceStatus,
  PaymentIntentCreate,
  PaymentIntentOut,
  Program,
  WaiveInstalmentRequest,
} from './types'

/**
 * School fees, in a chain of four links:
 *
 *   fee HEADS (what can be charged)
 *     → STRUCTURES (what this class or category is charged)
 *       → INSTALMENT PLANS (when it falls due)
 *         → INVOICES (what one student owes, frozen when issued)
 *
 * `breakdown` is the one to read first: it is what the payment page renders,
 * and `/fees/me`, `/parent/fees/children/{id}` and the admin preview all
 * return it from the same computation, so the three screens cannot disagree.
 *
 * Every admin endpoint takes `?program`, defaulting to LMS. Passing TUITION
 * reaches the tuition product's own money settings — the tuition BILLER still
 * lives in `tuition.api`, this is the shared charges-and-tax layer.
 */
export const financeApi = {
  // -------------------------------------------------------------- settings

  settings: (program: Program = 'LMS') =>
    get<FinanceSettingsOut>('/admin/finance/settings', { params: { program } }),

  /**
   * PARTIAL. Sending `null` does not clear a setting — omit what you are not
   * changing, or a form that defaults its untouched inputs to null resets the
   * school's tax rate every time somebody edits the late fee.
   */
  updateSettings: (body: FinanceSettingsUpdate, program: Program = 'LMS') =>
    put<FinanceSettingsOut>('/admin/finance/settings', body, { params: { program } }),

  // ------------------------------------------------------------ currencies

  /**
   * Every currency this programme offers, with its rate AND its own charges.
   *
   * `available` is the payer's switcher — enabled currencies that actually
   * carry a rate. A rate-less currency still appears under `currencies` so it
   * can be configured, but is never offered: showing a price of zero is worse
   * than not offering the currency at all.
   */
  currencies: (program: Program = 'LMS') =>
    get<CurrencySettingsOut>('/admin/finance/currencies', { params: { program } }),

  /**
   * Merged PER CURRENCY, so editing the AED rate does not require resending
   * the INR charge rules you were not looking at.
   *
   * Keep `rate_from_base` set even under `rate_source: 'LIVE'` — it is what a
   * live fetch falls back to when the provider is unreachable.
   */
  updateCurrencies: (body: CurrencySettingsUpdate, program: Program = 'LMS') =>
    put<CurrencySettingsOut>('/admin/finance/currencies', body, { params: { program } }),

  /** What the live-rate cache holds, and when it last refreshed. */
  fxStatus: () => get<FxStatusOut>('/admin/finance/currencies/rates'),

  /**
   * Forces a refresh now, ignoring the cache.
   *
   * Reports the resolved status per currency, so a refresh that FAILED comes
   * back as `fallback_manual` rather than looking like it worked.
   */
  refreshRates: (program: Program = 'LMS') =>
    post<FxRefreshResult>('/admin/finance/currencies/rates/refresh', undefined, {
      params: { program },
      // A provider round trip per currency, over the public internet.
      timeout: 60_000,
    }),

  // ------------------------------------------------------------- fee heads

  listHeads: (params: { program?: Program; includeInactive?: boolean } = {}) =>
    get<FeeHeadOut[]>('/admin/finance/heads', {
      params: cleanParams({
        program: params.program,
        include_inactive: params.includeInactive,
      }),
    }),

  createHead: (body: FeeHeadCreate) => post<FeeHeadOut>('/admin/finance/heads', body),

  updateHead: (headId: number, body: FeeHeadUpdate) =>
    put<FeeHeadOut>(`/admin/finance/heads/${headId}`, body),

  /** Refused while a structure still references it — deactivate instead. */
  deleteHead: (headId: number) => del(`/admin/finance/heads/${headId}`),

  // ------------------------------------------------------------ structures

  listStructures: (
    params: { program?: Program; academicYearId?: number; includeInactive?: boolean } = {},
  ) =>
    get<FeeStructureOut[]>('/admin/finance/structures', {
      params: cleanParams({
        program: params.program,
        academic_year_id: params.academicYearId,
        include_inactive: params.includeInactive,
      }),
    }),

  getStructure: (structureId: number) =>
    get<FeeStructureOut>(`/admin/finance/structures/${structureId}`),

  /**
   * EMPTY `class_ids` / `admission_category_ids` mean "every one" — that is
   * the year's default structure, not an unfinished form. Say so in the UI:
   * an admin who leaves both blank expecting "nothing yet" has just priced the
   * whole school.
   */
  createStructure: (body: FeeStructureCreate) =>
    post<FeeStructureOut>('/admin/finance/structures', body),

  updateStructure: (structureId: number, body: FeeStructureUpdate) =>
    put<FeeStructureOut>(`/admin/finance/structures/${structureId}`, body),

  deleteStructure: (structureId: number) => del(`/admin/finance/structures/${structureId}`),

  // ------------------------------------------------------ instalment plans

  listPlans: (
    params: { program?: Program; academicYearId?: number; includeInactive?: boolean } = {},
  ) =>
    get<InstalmentPlanOut[]>('/admin/finance/plans', {
      params: cleanParams({
        program: params.program,
        academic_year_id: params.academicYearId,
        include_inactive: params.includeInactive,
      }),
    }),

  /**
   * Percentages must total 100. The backend refuses anything else, because a
   * plan totalling 90% under-bills every student on it, silently, for a year —
   * check it in the form too so the author sees it as they type.
   */
  createPlan: (body: InstalmentPlanCreate) =>
    post<InstalmentPlanOut>('/admin/finance/plans', body),

  updatePlan: (planId: number, body: InstalmentPlanUpdate) =>
    put<InstalmentPlanOut>(`/admin/finance/plans/${planId}`, body),

  deletePlan: (planId: number) => del(`/admin/finance/plans/${planId}`),

  // --------------------------------------------------------- discount rules

  listDiscounts: (
    params: { program?: Program; academicYearId?: number; includeInactive?: boolean } = {},
  ) =>
    get<DiscountRuleOut[]>('/admin/finance/discounts', {
      params: cleanParams({
        program: params.program,
        academic_year_id: params.academicYearId,
        include_inactive: params.includeInactive,
      }),
    }),

  /**
   * `is_stackable` is OFF by default: rules compete and only the best-valued
   * one applies. Make that visible in the editor — a staff ward who is also a
   * second child getting ONE concession rather than two otherwise reads as a
   * bug, and the breakdown's `discounts_not_applied` will say exactly that.
   */
  createDiscount: (body: DiscountRuleCreate) =>
    post<DiscountRuleOut>('/admin/finance/discounts', body),

  updateDiscount: (ruleId: number, body: DiscountRuleUpdate) =>
    put<DiscountRuleOut>(`/admin/finance/discounts/${ruleId}`, body),

  deleteDiscount: (ruleId: number) => del(`/admin/finance/discounts/${ruleId}`),

  // ------------------------------------------------------------- breakdown

  /**
   * Preview WITHOUT billing. Safe to call on any student at any time — it
   * computes, stores nothing and issues no invoice.
   *
   * Surface `discounts_not_applied` on the admin screen: each entry says why a
   * rule did not fire ("household has 1 child; rule needs 2"), which answers
   * the support question before it is asked.
   */
  breakdown: (
    studentId: number,
    params: { academicYearId?: number; program?: Program; currency?: string } = {},
  ) =>
    get<FeeBreakdownOut>(`/admin/finance/students/${studentId}/breakdown`, {
      params: cleanParams({
        academic_year_id: params.academicYearId,
        program: params.program,
        // Switching is not just a conversion: each currency carries its own
        // tax and convenience charge, so the total moves by more than the rate.
        currency: params.currency,
      }),
    }),

  // -------------------------------------------------------------- invoices

  /**
   * Builds or REBUILDS the student's draft invoice from the current rules. A
   * second call on a draft re-prices it; once issued, the figures are frozen
   * and this no longer moves them.
   */
  generateInvoice: (
    studentId: number,
    params: { academicYearId?: number; program?: Program } = {},
  ) =>
    post<FeeInvoiceOut>(
      `/admin/finance/students/${studentId}/invoice`,
      undefined,
      {
        params: cleanParams({
          academic_year_id: params.academicYearId,
          program: params.program,
        }),
      },
    ),

  listInvoices: (
    params: {
      academicYearId?: number
      status?: InvoiceStatus
      studentId?: number
      /** The arrears list — invoices with at least one overdue instalment. */
      overdueOnly?: boolean
      program?: Program
    } = {},
  ) =>
    get<FeeInvoiceOut[]>('/admin/finance/invoices', {
      params: cleanParams({
        academic_year_id: params.academicYearId,
        status: params.status,
        student_id: params.studentId,
        overdue_only: params.overdueOnly,
        program: params.program,
      }),
    }),

  getInvoice: (invoiceId: string, program: Program = 'LMS') =>
    get<FeeInvoiceOut>(`/admin/finance/invoices/${invoiceId}`, { params: { program } }),

  /** Assigns the number and freezes the figures. Not reversible by re-issuing. */
  issueInvoice: (invoiceId: string, program: Program = 'LMS') =>
    post<FeeInvoiceOut>(`/admin/finance/invoices/${invoiceId}/issue`, undefined, {
      params: { program },
    }),

  /** Refused once money has been taken against it. */
  cancelInvoice: (invoiceId: string, reason?: string, program: Program = 'LMS') =>
    post<FeeInvoiceOut>(`/admin/finance/invoices/${invoiceId}/cancel`, undefined, {
      params: cleanParams({ reason, program }),
    }),

  /**
   * Records money the office already has. Omit `instalment_label` to settle
   * oldest-first, which is what a counter clerk taking a lump sum wants.
   */
  recordPayment: (invoiceId: string, body: FeePaymentRecord, program: Program = 'LMS') =>
    post<FeeInvoiceOut>(`/admin/finance/invoices/${invoiceId}/payments`, body, {
      params: { program },
    }),

  /**
   * Collects a fee at the counter in one call: builds and issues the year's
   * invoice if the student has none, then records the payment on it. 400 when
   * no structure applies to the student or the amount is more than they owe.
   */
  collectFee: (studentId: number, body: FeeCollectRequest, program: Program = 'LMS') =>
    post<FeeInvoiceOut>(`/admin/finance/students/${studentId}/collect`, body, {
      params: { program },
    }),

  /** Writes off one instalment. The reason is mandatory and is kept for audit. */
  waiveInstalment: (
    invoiceId: string,
    body: WaiveInstalmentRequest,
    program: Program = 'LMS',
  ) =>
    post<FeeInvoiceOut>(`/admin/finance/invoices/${invoiceId}/waive`, body, {
      params: { program },
    }),

  /**
   * Idempotent per instalment — running it twice does not charge twice, so a
   * "apply late fees" button needs no guard of its own.
   */
  applyLateFees: (invoiceId: string, program: Program = 'LMS') =>
    post<FeeInvoiceOut>(`/admin/finance/invoices/${invoiceId}/late-fees`, undefined, {
      params: { program },
    }),

  // ------------------------------------------------------ payment gateway

  /**
   * RECORDED, NOT WIRED. No provider is integrated: this validates the amount,
   * mints an idempotency key and records the attempt, then returns
   * `checkout_url: null` and `status: 'CREATED'`.
   *
   * Read `gateway_enabled` from the breakdown or the settings to decide
   * whether to render "Pay online" at all. Until a provider is chosen, take
   * payment offline through `recordPayment`.
   */
  createIntent: (invoiceId: string, body: PaymentIntentCreate, program: Program = 'LMS') =>
    post<PaymentIntentOut>(`/admin/finance/invoices/${invoiceId}/intents`, body, {
      params: { program },
    }),

  listIntents: (invoiceId: string) =>
    get<PaymentIntentOut[]>(`/admin/finance/invoices/${invoiceId}/intents`),
}

/** The student's own fees. Same `FeeBreakdownOut`, same computation. */
export const myFeesApi = {
  breakdown: (params: { academicYearId?: number; program?: Program; currency?: string } = {}) =>
    get<FeeBreakdownOut>('/fees/me', {
      params: cleanParams({
        academic_year_id: params.academicYearId,
        program: params.program,
        currency: params.currency,
      }),
    }),

  invoices: (program: Program = 'LMS') =>
    get<FeeInvoiceOut[]>('/fees/me/invoices', { params: { program } }),

  /**
   * THE PAY BUTTON. Starts a payment on my own invoice.
   *
   * What comes back depends on `method`. An online method waits for a gateway
   * adapter: `checkout_url` says where to send the payer, and is null with
   * `detail` explaining why while no provider is connected. An offline method
   * (bank transfer, office) makes the intent a `reference` to quote — the
   * office records the money and the invoice updates. 400 with the reason
   * for a draft, cancelled or settled invoice, or an amount over what is owed.
   */
  createIntent: (invoiceId: string, body: PaymentIntentCreate, program: Program = 'LMS') =>
    post<PaymentIntentOut>(`/fees/me/invoices/${invoiceId}/intents`, body, {
      params: { program },
    }),

  /** My attempts on this invoice, newest first, failures included. */
  intents: (invoiceId: string) =>
    get<PaymentIntentOut[]>(`/fees/me/invoices/${invoiceId}/intents`),
}

/**
 * A parent's view of one child's fees.
 *
 * BOTH of these require the link's `may_view_fees`, which is off unless an
 * admin granted it. Read the flag from `/parent/children` and hide the tab —
 * calling these without it is a 403, not an empty page.
 */
export const parentFeesApi = {
  breakdown: (
    studentId: number,
    params: { academicYearId?: number; program?: Program; currency?: string } = {},
  ) =>
    get<FeeBreakdownOut>(`/parent/fees/children/${studentId}`, {
      params: cleanParams({
        academic_year_id: params.academicYearId,
        program: params.program,
        currency: params.currency,
      }),
    }),

  invoices: (studentId: number, program: Program = 'LMS') =>
    get<FeeInvoiceOut[]>(`/parent/fees/children/${studentId}/invoices`, {
      params: { program },
    }),

  /** A parent starting a payment on a child's invoice. Same rules as `myFeesApi.createIntent`. */
  createIntent: (
    studentId: number,
    invoiceId: string,
    body: PaymentIntentCreate,
    program: Program = 'LMS',
  ) =>
    post<PaymentIntentOut>(
      `/parent/fees/children/${studentId}/invoices/${invoiceId}/intents`,
      body,
      { params: { program } },
    ),

  intents: (studentId: number, invoiceId: string) =>
    get<PaymentIntentOut[]>(`/parent/fees/children/${studentId}/invoices/${invoiceId}/intents`),
}

/**
 * Fee reports: the roll, the dues, the collections. Computed server-side from
 * the same invoices the Invoices tab lists, never stored, so a figure here is
 * never a different figure from that screen. `summary` on each is computed
 * from exactly the rows returned.
 */
export const financeReportsApi = {
  /** Every student in the year with where their bill stands, unbilled ones included. */
  students: (
    params: { academicYearId?: number; classId?: number; status?: string; asOf?: ApiDate } = {},
    program: Program = 'LMS',
  ) =>
    get<FeeRollReport>('/admin/finance/reports/students', {
      params: cleanParams({
        academic_year_id: params.academicYearId,
        class_id: params.classId,
        status: params.status,
        as_of: params.asOf,
        program,
      }),
    }),

  /** Whoever still owes, largest overdue balance first, aged into buckets. */
  dues: (
    params: { academicYearId?: number; classId?: number; asOf?: ApiDate } = {},
    program: Program = 'LMS',
  ) =>
    get<FeeRollReport>('/admin/finance/reports/dues', {
      params: cleanParams({
        academic_year_id: params.academicYearId,
        class_id: params.classId,
        as_of: params.asOf,
        program,
      }),
    }),

  /** Every payment received in a period, with totals by method, day and class. */
  collections: (
    params: {
      fromDate: ApiDate
      toDate: ApiDate
      academicYearId?: number
      classId?: number
      method?: string
      /** Only payments that settled this fee head, e.g. the admission fee. */
      headId?: number
    },
    program: Program = 'LMS',
  ) =>
    get<FeeCollectionsReport>('/admin/finance/reports/collections', {
      params: cleanParams({
        from_date: params.fromDate,
        to_date: params.toDate,
        academic_year_id: params.academicYearId,
        class_id: params.classId,
        method: params.method,
        head_id: params.headId,
        program,
      }),
    }),

  /** The same report as a CSV download. Returns the filename written. */
  exportCsv: (view: FeeReportView, params: Record<string, unknown> = {}, program: Program = 'LMS') =>
    downloadCsv('/admin/finance/reports/export', `fee-${view}.csv`, { view, ...params, program }),
}

/**
 * Receipts: money with no invoice on this system.
 *
 * The admission fee every existing student paid before the fee module existed
 * lives here, entered afterwards as an opening balance. An invoice cannot hold
 * it: there is one invoice per student per year, and it is the year's bill.
 * A receipt appears in the collections report and never changes what a
 * student owes.
 */
export const financeReceiptsApi = {
  record: (body: FeeReceiptCreate, program: Program = 'LMS') =>
    post<FeeReceiptOut>('/admin/finance/receipts', body, { params: { program } }),

  list: (
    params: { studentId?: number; academicYearId?: number; feeHeadId?: number } = {},
    program: Program = 'LMS',
  ) =>
    get<FeeReceiptOut[]>('/admin/finance/receipts', {
      params: cleanParams({
        student_id: params.studentId,
        academic_year_id: params.academicYearId,
        fee_head_id: params.feeHeadId,
        program,
      }),
    }),

  remove: (receiptId: number) => del(`/admin/finance/receipts/${receiptId}`),
}

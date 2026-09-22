import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  financeApi,
  financeReceiptsApi,
  financeReportsApi,
  myFeesApi,
  parentFeesApi,
} from '@/api/finance.api'
import type {
  ApiDate,
  CurrencySettingsUpdate,
  DiscountRuleCreate,
  DiscountRuleUpdate,
  FeeHeadCreate,
  FeeHeadUpdate,
  FeeCollectRequest,
  FeePaymentRecord,
  FeeReceiptCreate,
  FeeReportView,
  FeeStructureCreate,
  FeeStructureUpdate,
  FinanceSettingsUpdate,
  InstalmentPlanCreate,
  InstalmentPlanUpdate,
  InvoiceStatus,
  PaymentIntentCreate,
  Program,
  WaiveInstalmentRequest,
} from '@/api/types'
import { formatMoney } from '@/lib/tuition'
import { STALE, qk } from './keys'

// ------------------------------------------------------------------ reads

export function useFinanceSettings(program: Program = 'LMS', enabled = true) {
  return useQuery({
    queryKey: qk.finance.settings(program),
    queryFn: () => financeApi.settings(program),
    staleTime: STALE.reference,
    enabled,
  })
}

/**
 * The currencies a programme offers, with rates and per-currency charges.
 *
 * Short stale time despite being settings: under `rate_source: LIVE` the rate
 * on this response is resolved at read time, so a long-cached copy quotes a
 * figure the next request would not.
 */
export function useCurrencySettings(program: Program = 'LMS', enabled = true) {
  return useQuery({
    queryKey: qk.finance.currencies(program),
    queryFn: () => financeApi.currencies(program),
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useFxStatus(enabled = true) {
  return useQuery({
    queryKey: qk.finance.fxStatus(),
    queryFn: financeApi.fxStatus,
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useUpdateCurrencies(program: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CurrencySettingsUpdate) => financeApi.updateCurrencies(body, program),
    onSuccess: () => {
      // Rates and per-currency charges feed every breakdown, so the whole
      // finance subtree goes rather than just the currency entry.
      void qc.invalidateQueries({ queryKey: qk.finance.root })
      toast.success('Currencies saved')
    },
  })
}

/**
 * Forces a live refresh.
 *
 * Reports per currency, because a refresh can partly fail: a provider that is
 * down leaves each affected currency on `fallback_manual`, and a flat "rates
 * refreshed" would be a lie about exactly the case worth knowing.
 */
export function useRefreshRates(program: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => financeApi.refreshRates(program),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: qk.finance.root })
      const entries = Object.entries(result.rates)
      const failed = entries.filter(([, r]) => r.status === 'fallback_manual')
      if (failed.length === 0) {
        toast.success(`Rates refreshed against ${result.base_currency}`)
      } else {
        toast.warning(
          `${failed.length} of ${entries.length} currencies fell back to your own rate`,
          {
            description: `The provider was unreachable for ${failed
              .map(([code]) => code)
              .join(', ')}.`,
          },
        )
      }
    },
  })
}

export function useFeeHeads(
  params: { program?: Program; includeInactive?: boolean } = {},
  enabled = true,
) {
  const program = params.program ?? 'LMS'
  return useQuery({
    queryKey: qk.finance.heads(program, params.includeInactive ?? false),
    queryFn: () => financeApi.listHeads({ ...params, program }),
    staleTime: STALE.reference,
    enabled,
  })
}

export function useFeeStructures(
  params: { program?: Program; academicYearId?: number; includeInactive?: boolean } = {},
  enabled = true,
) {
  const program = params.program ?? 'LMS'
  return useQuery({
    queryKey: qk.finance.structures(
      program,
      params.academicYearId,
      params.includeInactive ?? false,
    ),
    queryFn: () => financeApi.listStructures({ ...params, program }),
    staleTime: STALE.reference,
    enabled,
  })
}

export function useInstalmentPlans(
  params: { program?: Program; academicYearId?: number; includeInactive?: boolean } = {},
  enabled = true,
) {
  const program = params.program ?? 'LMS'
  return useQuery({
    queryKey: qk.finance.plans(program, params.academicYearId, params.includeInactive ?? false),
    queryFn: () => financeApi.listPlans({ ...params, program }),
    staleTime: STALE.reference,
    enabled,
  })
}

export function useDiscountRules(
  params: { program?: Program; academicYearId?: number; includeInactive?: boolean } = {},
  enabled = true,
) {
  const program = params.program ?? 'LMS'
  return useQuery({
    queryKey: qk.finance.discounts(
      program,
      params.academicYearId,
      params.includeInactive ?? false,
    ),
    queryFn: () => financeApi.listDiscounts({ ...params, program }),
    staleTime: STALE.reference,
    enabled,
  })
}

/**
 * A student's fee breakdown, computed on demand and billing nothing.
 *
 * Short stale time despite being a read: it is derived from the settings, the
 * structures, the discount rules and the household, any of which the admin may
 * have just changed on the screen next door. A preview that lags the rules it
 * previews is worse than no preview.
 */
export function useFeeBreakdown(
  studentId: number | null,
  params: { academicYearId?: number; program?: Program; currency?: string } = {},
  enabled = true,
) {
  return useQuery({
    // Currency is part of the key: switching is not a client-side conversion,
    // it is a different computation. Each currency carries its own tax and
    // convenience charge, so two currencies are two genuinely different answers.
    queryKey: qk.finance.breakdown(
      studentId ?? 0,
      params.academicYearId,
      params.program ?? 'LMS',
      params.currency,
    ),
    queryFn: () => financeApi.breakdown(studentId as number, params),
    staleTime: STALE.transactional,
    enabled: enabled && studentId != null,
  })
}

export function useFeeInvoices(
  params: {
    program?: Program
    academicYearId?: number
    status?: InvoiceStatus
    studentId?: number
    overdueOnly?: boolean
  } = {},
  enabled = true,
) {
  const program = params.program ?? 'LMS'
  return useQuery({
    queryKey: qk.finance.invoices({ ...params, program }),
    queryFn: () => financeApi.listInvoices({ ...params, program }),
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useFeeInvoice(
  invoiceId: string | null,
  program: Program = 'LMS',
  enabled = true,
) {
  return useQuery({
    queryKey: qk.finance.invoice(invoiceId ?? ''),
    queryFn: () => financeApi.getInvoice(invoiceId as string, program),
    staleTime: STALE.transactional,
    enabled: enabled && !!invoiceId,
  })
}

export function usePaymentIntents(invoiceId: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.finance.intents(invoiceId ?? ''),
    queryFn: () => financeApi.listIntents(invoiceId as string),
    staleTime: STALE.transactional,
    enabled: enabled && !!invoiceId,
  })
}

/** The signed-in student's own fees — the same shape the admin previews. */
export function useMyFees(
  params: { academicYearId?: number; program?: Program; currency?: string } = {},
  enabled = true,
) {
  const program = params.program ?? 'LMS'
  return useQuery({
    queryKey: qk.finance.myFees(program, params.currency),
    queryFn: () => myFeesApi.breakdown({ ...params, program }),
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useMyInvoices(program: Program = 'LMS', enabled = true) {
  return useQuery({
    queryKey: qk.finance.myInvoices(program),
    queryFn: () => myFeesApi.invoices(program),
    staleTime: STALE.transactional,
    enabled,
  })
}

/** The signed-in student's attempts on one of their invoices. */
export function useMyPaymentIntents(invoiceId: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.finance.myIntents(invoiceId ?? ''),
    queryFn: () => myFeesApi.intents(invoiceId as string),
    staleTime: STALE.transactional,
    enabled: enabled && !!invoiceId,
  })
}

/**
 * The checkout's Pay button, for the signed-in student.
 *
 * Silent: the checkout renders the outcome itself — a redirect, a reference
 * to quote, or the reason it was refused — and a toast over any of those is
 * noise. The invoice list is refetched because a SUCCEEDED intent (a wired
 * provider answering synchronously) changes what is owed.
 */
export function useStartMyPayment(program: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ invoiceId, body }: { invoiceId: string; body: PaymentIntentCreate }) =>
      myFeesApi.createIntent(invoiceId, body, program),
    onSuccess: (intent) => {
      void qc.invalidateQueries({ queryKey: qk.finance.myIntents(intent.invoice_id) })
      void qc.invalidateQueries({ queryKey: qk.finance.myInvoices(program) })
    },
  })
}

/**
 * A parent's view of one child's fees.
 *
 * `enabled` must be gated on that child's `may_view_fees` — the flag is on
 * `/parent/children`, and calling without it is a 403 rather than an empty
 * page. Retries are off for the same reason: a permission answer will not
 * change on a second attempt.
 */
export function useChildFees(
  studentId: number | null,
  params: { academicYearId?: number; program?: Program; currency?: string } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...qk.parent.childFees(studentId ?? 0), params.currency ?? 'base'],
    queryFn: () => parentFeesApi.breakdown(studentId as number, params),
    staleTime: STALE.transactional,
    enabled: enabled && studentId != null,
    retry: false,
  })
}

export function useChildInvoices(
  studentId: number | null,
  program: Program = 'LMS',
  enabled = true,
) {
  return useQuery({
    queryKey: qk.parent.childInvoices(studentId ?? 0),
    queryFn: () => parentFeesApi.invoices(studentId as number, program),
    staleTime: STALE.transactional,
    enabled: enabled && studentId != null,
    retry: false,
  })
}

// -------------------------------------------------------------- mutations

/**
 * Anything that changes the RULES — settings, heads, structures, plans,
 * discounts — invalidates every breakdown as well as its own list, because a
 * breakdown is a computation over all of them and nothing else would tell it
 * to re-run.
 *
 * Draft invoices are NOT invalidated: they are stored rows and re-price only
 * when somebody regenerates them, which is a deliberate act with its own
 * button. Issued ones are frozen and never move.
 */
function invalidateFeeRules(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.finance.root })
}

/** One invoice changed. Its own entry, the lists it appears in, and nothing else. */
function invalidateInvoices(qc: QueryClient, invoiceId?: string) {
  void qc.invalidateQueries({ queryKey: qk.finance.invoicesRoot() })
  void qc.invalidateQueries({ queryKey: qk.finance.meRoot() })
  // A payment or an issue changes every report, so they go with the invoices.
  void qc.invalidateQueries({ queryKey: qk.finance.reportsRoot() })
  if (invoiceId) void qc.invalidateQueries({ queryKey: qk.finance.invoice(invoiceId) })
}

// ------------------------------------------------------------ fee reports

export function useFeeRollReport(
  params: { academicYearId?: number; classId?: number; status?: string } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: qk.finance.reportRoll(params.academicYearId, params.classId, params.status),
    queryFn: () => financeReportsApi.students(params),
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useFeeDuesReport(
  params: { academicYearId?: number; classId?: number } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: qk.finance.reportDues(params.academicYearId, params.classId),
    queryFn: () => financeReportsApi.dues(params),
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useFeeCollectionsReport(
  params: {
    fromDate: ApiDate
    toDate: ApiDate
    academicYearId?: number
    classId?: number
    method?: string
    headId?: number
  },
  enabled = true,
) {
  return useQuery({
    queryKey: qk.finance.reportCollections(
      params.fromDate, params.toDate, params.academicYearId, params.classId, params.method, params.headId,
    ),
    queryFn: () => financeReportsApi.collections(params),
    staleTime: STALE.transactional,
    enabled,
  })
}

/**
 * A CSV download. A mutation rather than a query: it writes a file, which must
 * happen when asked and exactly once - a query would refetch on focus and save
 * the file again.
 */
export function useFeeReportExport() {
  return useMutation({
    mutationFn: ({ view, params }: { view: FeeReportView; params?: Record<string, unknown> }) =>
      financeReportsApi.exportCsv(view, params),
    onSuccess: (filename) => toast.success('Report saved', { description: filename }),
  })
}

export function useUpdateFinanceSettings(program: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: FinanceSettingsUpdate) => financeApi.updateSettings(body, program),
    onSuccess: () => {
      invalidateFeeRules(qc)
      toast.success('Finance settings saved')
    },
  })
}

export function useCreateFeeHead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: FeeHeadCreate) => financeApi.createHead(body),
    onSuccess: (head) => {
      invalidateFeeRules(qc)
      toast.success(`${head.name} added`)
    },
  })
}

export function useUpdateFeeHead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ headId, body }: { headId: number; body: FeeHeadUpdate }) =>
      financeApi.updateHead(headId, body),
    onSuccess: (head) => {
      invalidateFeeRules(qc)
      toast.success(`${head.name} updated`)
    },
  })
}

export function useDeleteFeeHead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (headId: number) => financeApi.deleteHead(headId),
    onSuccess: () => {
      invalidateFeeRules(qc)
      toast.success('Fee head deleted')
    },
  })
}

export function useCreateFeeStructure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: FeeStructureCreate) => financeApi.createStructure(body),
    onSuccess: (structure) => {
      invalidateFeeRules(qc)
      const everyone = structure.class_ids.length === 0
      toast.success(`${structure.name} created`, {
        description: everyone
          ? 'It applies to every class in the year — it is the default structure.'
          : undefined,
      })
    },
  })
}

export function useUpdateFeeStructure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ structureId, body }: { structureId: number; body: FeeStructureUpdate }) =>
      financeApi.updateStructure(structureId, body),
    onSuccess: (structure) => {
      invalidateFeeRules(qc)
      toast.success(`${structure.name} updated`)
    },
  })
}

export function useDeleteFeeStructure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (structureId: number) => financeApi.deleteStructure(structureId),
    onSuccess: () => {
      invalidateFeeRules(qc)
      toast.success('Fee structure deleted')
    },
  })
}

export function useCreateInstalmentPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: InstalmentPlanCreate) => financeApi.createPlan(body),
    onSuccess: (plan) => {
      invalidateFeeRules(qc)
      toast.success(`${plan.name} created`)
    },
  })
}

export function useUpdateInstalmentPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ planId, body }: { planId: number; body: InstalmentPlanUpdate }) =>
      financeApi.updatePlan(planId, body),
    onSuccess: (plan) => {
      invalidateFeeRules(qc)
      toast.success(`${plan.name} updated`)
    },
  })
}

export function useDeleteInstalmentPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (planId: number) => financeApi.deletePlan(planId),
    onSuccess: () => {
      invalidateFeeRules(qc)
      toast.success('Instalment plan deleted')
    },
  })
}

/**
 * A new rule immediately changes what every student owes, which is why the
 * success message says whether it stacks: an admin who expects two concessions
 * and gets the better of them will otherwise open a bug report.
 */
export function useCreateDiscountRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: DiscountRuleCreate) => financeApi.createDiscount(body),
    onSuccess: (rule) => {
      invalidateFeeRules(qc)
      toast.success(`${rule.name} created`, {
        description: rule.is_stackable
          ? 'It stacks with other concessions.'
          : 'It competes with other concessions — only the best-valued one applies.',
      })
    },
  })
}

export function useUpdateDiscountRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ruleId, body }: { ruleId: number; body: DiscountRuleUpdate }) =>
      financeApi.updateDiscount(ruleId, body),
    onSuccess: (rule) => {
      invalidateFeeRules(qc)
      toast.success(`${rule.name} updated`)
    },
  })
}

export function useDeleteDiscountRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ruleId: number) => financeApi.deleteDiscount(ruleId),
    onSuccess: () => {
      invalidateFeeRules(qc)
      toast.success('Discount rule deleted')
    },
  })
}

// ------------------------------------------------------ invoice lifecycle

/** Builds or rebuilds the draft from the current rules. */
export function useGenerateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      studentId,
      academicYearId,
      program,
    }: {
      studentId: number
      academicYearId?: number
      program?: Program
    }) => financeApi.generateInvoice(studentId, { academicYearId, program }),
    onSuccess: (invoice) => {
      invalidateInvoices(qc, invoice.id)
      toast.success('Draft invoice built', {
        description: `${formatMoney(invoice.total_amount, invoice.currency)} for ${
          invoice.student_name ?? 'the student'
        }.`,
      })
    },
  })
}

/** Assigns the number and freezes the figures. Not undone by re-issuing. */
export function useIssueInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceId, program }: { invoiceId: string; program?: Program }) =>
      financeApi.issueInvoice(invoiceId, program),
    onSuccess: (invoice) => {
      invalidateInvoices(qc, invoice.id)
      toast.success(`Invoice ${invoice.invoice_number ?? ''} issued`.trim(), {
        description: 'The figures are now frozen.',
      })
    },
  })
}

/**
 * Refused once money has been taken. No error toast — the caller explains
 * that a paid invoice is corrected with an adjustment, not a cancellation.
 */
export function useCancelInvoice() {
  const qc = useQueryClient()
  return useMutation({
    // Reported in place by the caller, not as a toast.
    meta: { silent: true },
    mutationFn: ({
      invoiceId,
      reason,
      program,
    }: {
      invoiceId: string
      reason?: string
      program?: Program
    }) => financeApi.cancelInvoice(invoiceId, reason, program),
    onSuccess: (invoice) => {
      invalidateInvoices(qc, invoice.id)
      toast.success('Invoice cancelled')
    },
  })
}

/**
 * The counter: a payment against a student rather than an invoice.
 *
 * Silent, because the dialog shows the receipt itself - invoice number, paid,
 * still owed - and a toast over a receipt is noise. Refusals (nothing to bill,
 * more than is owed) are rendered in place too.
 */
export function useCollectFee() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: ({
      studentId,
      body,
      program,
    }: {
      studentId: number
      body: FeeCollectRequest
      program?: Program
    }) => financeApi.collectFee(studentId, body, program),
    onSuccess: (invoice) => {
      invalidateInvoices(qc, invoice.id)
      void qc.invalidateQueries({ queryKey: qk.finance.breakdownRoot() })
    },
  })
}

export function useRecordPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      invoiceId,
      body,
      program,
    }: {
      invoiceId: string
      body: FeePaymentRecord
      program?: Program
    }) => financeApi.recordPayment(invoiceId, body, program),
    onSuccess: (invoice) => {
      invalidateInvoices(qc, invoice.id)
      const outstanding = invoice.amount_outstanding
      toast.success('Payment recorded', {
        description:
          outstanding > 0
            ? `${formatMoney(outstanding, invoice.currency)} still outstanding.`
            : 'This invoice is settled in full.',
      })
    },
  })
}

export function useWaiveInstalment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      invoiceId,
      body,
      program,
    }: {
      invoiceId: string
      body: WaiveInstalmentRequest
      program?: Program
    }) => financeApi.waiveInstalment(invoiceId, body, program),
    onSuccess: (invoice) => {
      invalidateInvoices(qc, invoice.id)
      toast.success('Instalment written off')
    },
  })
}

/** Idempotent per instalment, so a second press is free rather than harmful. */
export function useApplyLateFees() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceId, program }: { invoiceId: string; program?: Program }) =>
      financeApi.applyLateFees(invoiceId, program),
    onSuccess: (invoice) => {
      invalidateInvoices(qc, invoice.id)
      toast.success(
        invoice.late_fee_total > 0
          ? `Late fees now total ${formatMoney(invoice.late_fee_total, invoice.currency)}`
          : 'No instalment is past its grace period',
      )
    },
  })
}

/**
 * Records a payment attempt. No provider is wired, so this always comes back
 * with `checkout_url: null` and `status: 'CREATED'` — report that honestly
 * rather than as a failure, and do not send the user anywhere.
 */
export function useCreatePaymentIntent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      invoiceId,
      body,
      program,
    }: {
      invoiceId: string
      body: PaymentIntentCreate
      program?: Program
    }) => financeApi.createIntent(invoiceId, body, program),
    onSuccess: (intent) => {
      void qc.invalidateQueries({ queryKey: qk.finance.intents(intent.invoice_id) })
      if (intent.checkout_url) {
        toast.success('Payment started')
      } else {
        toast.warning('Attempt recorded, but no gateway is connected', {
          description:
            intent.detail ??
            'Take the payment offline and record it against the invoice instead.',
        })
      }
    },
  })
}

// --------------------------------------------------------------- receipts

export function useFeeReceipts(
  params: { studentId?: number; academicYearId?: number; feeHeadId?: number } = {},
  program: Program = 'LMS',
  enabled = true,
) {
  return useQuery({
    queryKey: qk.finance.receipts(program, params.studentId),
    queryFn: () => financeReceiptsApi.list(params, program),
    staleTime: STALE.transactional,
    enabled,
  })
}

/** Records money received before this system. Refreshes the reports it now counts in. */
export function useRecordFeeReceipt(program: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: FeeReceiptCreate) => financeReceiptsApi.record(body, program),
    onSuccess: (receipt) => {
      void qc.invalidateQueries({ queryKey: qk.finance.receiptsRoot() })
      void qc.invalidateQueries({ queryKey: qk.finance.reportsRoot() })
      toast.success('Past payment recorded', {
        description: `${formatMoney(receipt.amount, receipt.currency)} · ${receipt.head_name ?? 'fee'}`,
      })
    },
  })
}

export function useDeleteFeeReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (receiptId: number) => financeReceiptsApi.remove(receiptId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.finance.receiptsRoot() })
      void qc.invalidateQueries({ queryKey: qk.finance.reportsRoot() })
      toast.success('Receipt removed')
    },
  })
}

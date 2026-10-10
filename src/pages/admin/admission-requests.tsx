import type { ColumnDef } from '@tanstack/react-table'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertTriangle,
  Banknote,
  BadgeCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  FileCheck2,
  FilePlus2,
  Hourglass,
  Inbox,
  KeyRound,
  Mail,
  MessageSquareText,
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  SearchCheck,
  Send,
  Trash2,
  UserRoundPlus,
  X,
  XCircle,
} from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import type {
  AdmissionDocumentOut,
  AdmissionDocumentStatus,
  AdmissionFileOut,
  AdmissionPaymentOut,
  AdmissionPaymentStatus,
  AdmissionPipelineConfig,
  AdmissionRequestAdmitResult,
  AdmissionRequestOut,
  AdmissionRequestStatus,
  Program,
} from '@/api/types'
import { useClasses } from '@/queries/admin.queries'
import { useAcademicYears, useAdmissionCategories } from '@/queries/admissions.queries'
import { useFeeHeads } from '@/queries/finance.queries'
import {
  useAddAdmissionRequestNote,
  useAdmissionPipelineConfig,
  useAdmissionRequests,
  useAdmitAdmissionRequest,
  useCheckAdmissionPayment,
  useDeleteAdmissionRequest,
  useRequestAdmissionDocuments,
  useRequestAdmissionPayment,
  useResendAdmissionEmail,
  useReviewAdmissionDocuments,
  useReviewAdmissionPayment,
  useSetAdmissionRequestStatus,
} from '@/queries/admission-requests.queries'
import { formatDate, formatDateTime, formatRelative, parseApiDate } from '@/lib/datetime'
import { countLabel } from '@/lib/format'
import { formatFileSize, resolveFileUrl } from '@/lib/files'
import { useCopyToClipboard } from '@/lib/hooks'
import { formatMoney } from '@/lib/tuition'
import {
  ACTION_REQUEST_STATUSES,
  IN_PROGRESS_REQUEST_STATUSES,
  OPEN_REQUEST_STATUSES,
  RELATION_LABEL,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_TONE,
} from '@/lib/school'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { Input, Textarea } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DataTable } from '@/components/data/data-table'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field, FormError } from '@/components/forms/field'
import { EmptyState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'

/**
 * The office's inbox for the website's admission form.
 *
 * A request is not a student. Nothing on this screen creates one except the
 * Admit dialog, and that reuses the same account, enrollment and family code
 * the Users screen does — so an admitted family lands in exactly the state a
 * hand-created one would, with a parent login that can already see fees.
 *
 * Between "new" and "admitted" sits the selection pipeline: select and ask
 * for documents, verify the uploads, ask for the fee, confirm it. The family
 * answers each step on a private portal page linked from their emails; every
 * step can be skipped by admitting directly.
 *
 * The status chips filter one cached list rather than refetching: the queue
 * is small, and moving a row between chips should be instant.
 */

type Filter = 'ACTION' | 'PROGRESS' | 'WAITLISTED' | 'ADMITTED' | 'REJECTED' | 'ALL'

const NONE = '__NONE__'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const WEB_LINK = /^https?:\/\//i

/** "SOME_NEW_STATE" → "Some new state", for a status this build does not know yet. */
function humanise(value: string): string {
  const text = value.replace(/_/g, ' ').trim().toLowerCase()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Updated'
}

/**
 * Takes a plain string on purpose: history entries carry whatever status the
 * server wrote at the time, and an unfamiliar one must render, not crash.
 */
function RequestStatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const known = status in REQUEST_STATUS_LABEL
  const key = status as AdmissionRequestStatus
  return (
    <Badge tone={known ? REQUEST_STATUS_TONE[key] : 'neutral'} size={size}>
      {known ? REQUEST_STATUS_LABEL[key] : humanise(status)}
    </Badge>
  )
}

const DOCUMENT_STATUS: Record<
  AdmissionDocumentStatus,
  { label: string; tone: 'neutral' | 'primary' | 'success' | 'danger' | 'warning' }
> = {
  PENDING: { label: 'Not uploaded', tone: 'neutral' },
  UPLOADED: { label: 'Uploaded, not submitted', tone: 'warning' },
  SUBMITTED: { label: 'To verify', tone: 'primary' },
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  REJECTED: { label: 'Sent back', tone: 'danger' },
}

const PAYMENT_STATUS: Record<
  AdmissionPaymentStatus,
  { label: string; tone: 'neutral' | 'primary' | 'success' | 'danger' }
> = {
  REQUESTED: { label: 'Awaiting payment', tone: 'neutral' },
  SUBMITTED: { label: 'To verify', tone: 'primary' },
  VERIFIED: { label: 'Confirmed', tone: 'success' },
  REJECTED: { label: 'Sent back', tone: 'danger' },
}

const SUBMISSION_STATUS = {
  PENDING: { label: 'To verify', tone: 'primary' },
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  REJECTED: { label: 'Not confirmed', tone: 'danger' },
} as const

function ageOn(dob: string | null | undefined, on = new Date()): number | null {
  const born = parseApiDate(dob)
  if (!born) return null
  let age = on.getFullYear() - born.getFullYear()
  const months = on.getMonth() - born.getMonth()
  if (months < 0 || (months === 0 && on.getDate() < born.getDate())) age -= 1
  return age
}

function primaryParent(request: AdmissionRequestOut) {
  return request.parents.find((p) => p.is_primary) ?? request.parents[0] ?? null
}

// ================================================================= actions

const isOpen = (s: AdmissionRequestStatus) => OPEN_REQUEST_STATUSES.includes(s)

/** Where documents may be asked for: anywhere before the money. */
const DOCUMENTS_FROM: AdmissionRequestStatus[] = [
  'NEW',
  'UNDER_REVIEW',
  'WAITLISTED',
  'DOCUMENTS_REQUESTED',
  'DOCUMENTS_SUBMITTED',
  'DOCUMENTS_VERIFIED',
]

const canVerifyPayment = (r: AdmissionRequestOut) =>
  (r.status === 'PAYMENT_REQUESTED' || r.status === 'PAYMENT_SUBMITTED') && !!r.payment

/**
 * Which actions make sense in each state, mirroring the server's own rules so
 * a button is never offered only to be refused. ADMITTED is final.
 */
const CAN = {
  review: (r: AdmissionRequestOut) => r.status === 'NEW' || r.status === 'WAITLISTED',
  requestDocuments: (r: AdmissionRequestOut) => DOCUMENTS_FROM.includes(r.status),
  reviewDocuments: (r: AdmissionRequestOut) =>
    (r.status === 'DOCUMENTS_SUBMITTED' || r.status === 'DOCUMENTS_REQUESTED') &&
    r.documents.length > 0,
  requestPayment: (r: AdmissionRequestOut) => isOpen(r.status) && r.status !== 'PAYMENT_VERIFIED',
  verifyPayment: canVerifyPayment,
  checkPayment: (r: AdmissionRequestOut) =>
    canVerifyPayment(r) && r.payment?.provider === 'RAZORPAY' && r.payment.status !== 'VERIFIED',
  admit: (r: AdmissionRequestOut) => isOpen(r.status),
  // Once a fee is in play the family has been told they are selected; a
  // waiting list at that point is a decline in disguise.
  waitlist: (r: AdmissionRequestOut) =>
    r.status === 'NEW' || r.status === 'UNDER_REVIEW' || r.status.startsWith('DOCUMENTS_'),
  reject: (r: AdmissionRequestOut) => isOpen(r.status),
  reopen: (r: AdmissionRequestOut) => r.status === 'REJECTED',
}

type StepKey =
  | 'requestDocuments'
  | 'reviewDocuments'
  | 'requestPayment'
  | 'checkPayment'
  | 'verifyPayment'
  | 'admit'
type HousekeepingKey = 'review' | 'waitlist' | 'reject' | 'reopen'

const STEP_ORDER: StepKey[] = [
  'requestDocuments',
  'reviewDocuments',
  'requestPayment',
  'checkPayment',
  'verifyPayment',
  'admit',
]
const HOUSEKEEPING_ORDER: HousekeepingKey[] = ['review', 'waitlist', 'reject', 'reopen']

/** The one thing the office should do next, when it is the office's turn. */
function nextStep(r: AdmissionRequestOut): StepKey | null {
  switch (r.status) {
    case 'NEW':
    case 'UNDER_REVIEW':
    case 'WAITLISTED':
      return 'requestDocuments'
    case 'DOCUMENTS_SUBMITTED':
      return 'reviewDocuments'
    case 'DOCUMENTS_VERIFIED':
      return 'requestPayment'
    case 'PAYMENT_SUBMITTED':
      return 'verifyPayment'
    case 'PAYMENT_VERIFIED':
      return 'admit'
    default:
      return null
  }
}

/** The pipeline steps on offer, the next step first. */
function availableSteps(r: AdmissionRequestOut): StepKey[] {
  const next = nextStep(r)
  const steps = STEP_ORDER.filter((key) => CAN[key](r))
  return next && steps.includes(next) ? [next, ...steps.filter((k) => k !== next)] : steps
}

function stepLabel(key: StepKey, r: AdmissionRequestOut): string {
  switch (key) {
    case 'requestDocuments':
      return r.documents.length > 0 ? 'Change documents requested' : 'Select & request documents'
    case 'reviewDocuments':
      return 'Review documents'
    case 'requestPayment':
      return r.payment ? 'Change payment request' : 'Request payment'
    case 'checkPayment':
      return 'Check payment status'
    case 'verifyPayment':
      return 'Verify payment'
    case 'admit':
      return 'Admit'
  }
}

const STEP_ICON: Record<StepKey, React.ReactNode> = {
  requestDocuments: <FilePlus2 />,
  reviewDocuments: <FileCheck2 />,
  requestPayment: <Banknote />,
  checkPayment: <SearchCheck />,
  verifyPayment: <ReceiptText />,
  admit: <BadgeCheck />,
}

const HOUSEKEEPING: Record<HousekeepingKey, { label: string; icon: React.ReactNode }> = {
  review: { label: 'Mark under review', icon: <CalendarClock /> },
  waitlist: { label: 'Waitlist', icon: <Hourglass /> },
  reject: { label: 'Decline', icon: <XCircle /> },
  reopen: { label: 'Reopen', icon: <RotateCcw /> },
}

interface Actions {
  onReview: (r: AdmissionRequestOut) => void
  onRequestDocuments: (r: AdmissionRequestOut) => void
  onReviewDocuments: (r: AdmissionRequestOut) => void
  onRequestPayment: (r: AdmissionRequestOut) => void
  onCheckPayment: (r: AdmissionRequestOut) => void
  onVerifyPayment: (r: AdmissionRequestOut) => void
  onAdmit: (r: AdmissionRequestOut) => void
  onWaitlist: (r: AdmissionRequestOut) => void
  onReject: (r: AdmissionRequestOut) => void
  onReopen: (r: AdmissionRequestOut) => void
  onDelete: (r: AdmissionRequestOut) => void
}

function runStep(actions: Actions, key: StepKey, r: AdmissionRequestOut) {
  const handlers: Record<StepKey, (r: AdmissionRequestOut) => void> = {
    requestDocuments: actions.onRequestDocuments,
    reviewDocuments: actions.onReviewDocuments,
    requestPayment: actions.onRequestPayment,
    checkPayment: actions.onCheckPayment,
    verifyPayment: actions.onVerifyPayment,
    admit: actions.onAdmit,
  }
  handlers[key](r)
}

function runHousekeeping(actions: Actions, key: HousekeepingKey, r: AdmissionRequestOut) {
  const handlers: Record<HousekeepingKey, (r: AdmissionRequestOut) => void> = {
    review: actions.onReview,
    waitlist: actions.onWaitlist,
    reject: actions.onReject,
    reopen: actions.onReopen,
  }
  handlers[key](r)
}

// =================================================================== shared

/** A switch row with a title and an explanation, as the dialogs use them. */
function SwitchRow({
  title,
  description,
  checked,
  onCheckedChange,
  className,
}: {
  title: string
  description?: React.ReactNode
  checked: boolean
  onCheckedChange: (v: boolean) => void
  className?: string
}) {
  return (
    <label className={`flex items-start justify-between gap-4 ${className ?? ''}`}>
      <span className="min-w-0">
        <span className="text-sm font-medium">{title}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
        )}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  )
}

/** The "email the family" switch, with a warning when mail is not set up. */
function NotifySwitch({
  request,
  checked,
  onCheckedChange,
  config,
  description,
}: {
  request: AdmissionRequestOut | null
  checked: boolean
  onCheckedChange: (v: boolean) => void
  config?: AdmissionPipelineConfig
  description?: React.ReactNode
}) {
  const mailOff = config && !config.email_configured
  return (
    <div className="rounded-xl border border-border px-4 py-3">
      <SwitchRow
        title={`Email ${request?.contact_name ?? 'the family'}`}
        description={
          mailOff
            ? 'Email is not set up for this school, so nothing will be sent. Share the portal link with the family instead.'
            : (description ?? request?.contact_email ?? undefined)
        }
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}

/**
 * Uploaded files, opened in a new tab. The links are signed and expire after
 * about an hour, so they are followed, never copied into notes.
 */
function FileLinks({ files }: { files: AdmissionFileOut[] }) {
  if (files.length === 0) return null
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {files.map((file) => {
        const href = resolveFileUrl(file.url)
        const label = (
          <>
            <Paperclip className="size-3 shrink-0" />
            <span className="max-w-48 truncate">{file.name}</span>
            {file.size ? (
              <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
            ) : null}
          </>
        )
        return (
          <li key={file.id}>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted/60"
              >
                {label}
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                {label}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// =================================================================== admit

const admitSchema = z.object({
  class_id: z.string(),
  academic_year_id: z.string(),
  admission_category_id: z.string(),
  admission_number: z.string().max(50),
  roll_number: z.string().max(50),
  student_email: z
    .string()
    .max(200)
    .refine((v) => v === '' || EMAIL.test(v), 'Enter a valid email address'),
  create_parent_account: z.boolean(),
  parent_email: z
    .string()
    .max(200)
    .refine((v) => v === '' || EMAIL.test(v), 'Enter a valid email address'),
  send_credentials: z.boolean(),
  notify_applicant: z.boolean(),
  note: z.string().max(2000),
  record_fee_receipt: z.boolean(),
  fee_head_id: z.string(),
})

type AdmitValues = z.infer<typeof admitSchema>

/** What is still outstanding before admitting, in the office's words. */
function admitWarnings(request: AdmissionRequestOut): string[] {
  const warnings: string[] = []
  const payment = request.payment
  if (!payment) {
    warnings.push(
      'No admission fee has been requested through the portal. Admit only if the fee has been settled another way or will be billed in Finance.',
    )
  } else if (payment.status !== 'VERIFIED') {
    warnings.push(
      `The admission fee of ${formatMoney(payment.amount, payment.currency)} has not been confirmed (${PAYMENT_STATUS[payment.status]?.label.toLowerCase() ?? 'pending'}). Admitting now does not enter it in Finance.`,
    )
  }
  const unchecked = request.documents.filter((d) => d.required && d.status !== 'ACCEPTED')
  if (unchecked.length > 0) {
    warnings.push(
      `${countLabel(unchecked.length, 'required document')} not verified: ${unchecked.map((d) => d.label).join(', ')}.`,
    )
  }
  return warnings
}

/**
 * Admitting, with its result shown in the same dialog.
 *
 * The result has to be read, not toasted: it may carry a password that will
 * never be shown again, and a warning that a parent login was NOT created.
 */
function AdmitDialog({
  request,
  onClose,
  board,
}: {
  request: AdmissionRequestOut | null
  onClose: () => void
  board: Program
}) {
  const open = !!request
  const feeConfirmed = request?.payment?.status === 'VERIFIED'
  const classes = useClasses(open)
  const years = useAcademicYears({ program: board }, open)
  const feeHeads = useFeeHeads({ program: board }, open && feeConfirmed)
  const admit = useAdmitAdmissionRequest()
  const [result, setResult] = React.useState<AdmissionRequestAdmitResult | null>(null)

  const form = useForm<AdmitValues>({
    resolver: zodResolver(admitSchema),
    defaultValues: {
      class_id: NONE,
      academic_year_id: NONE,
      admission_category_id: NONE,
      admission_number: '',
      roll_number: '',
      student_email: '',
      create_parent_account: true,
      parent_email: '',
      send_credentials: true,
      notify_applicant: true,
      note: '',
      record_fee_receipt: true,
      fee_head_id: NONE,
    },
  })

  const yearId = form.watch('academic_year_id')
  const categories = useAdmissionCategories(
    { program: board, academicYearId: yearId !== NONE ? Number(yearId) : undefined },
    open,
  )

  React.useEffect(() => {
    if (!request) return
    setResult(null)
    const primary = primaryParent(request)
    form.reset({
      class_id: request.class_id ? String(request.class_id) : NONE,
      academic_year_id: request.academic_year_id ? String(request.academic_year_id) : NONE,
      admission_category_id: NONE,
      admission_number: '',
      roll_number: '',
      student_email: '',
      create_parent_account: true,
      parent_email: primary?.email ?? '',
      send_credentials: true,
      notify_applicant: true,
      note: '',
      record_fee_receipt: true,
      fee_head_id: NONE,
    })
  }, [request, form])

  // The applied-for year may be missing from the list (closed since), so the
  // picker falls back to the current year rather than showing a blank.
  React.useEffect(() => {
    if (!open || !years.data || form.getValues('academic_year_id') !== NONE) return
    const current = years.data.find((y) => y.is_current)
    if (current) form.setValue('academic_year_id', String(current.id))
  }, [open, years.data, form])

  const createParent = form.watch('create_parent_account')
  const sendCredentials = form.watch('send_credentials')
  const notify = form.watch('notify_applicant')
  const recordReceipt = form.watch('record_fee_receipt')
  const primary = request ? primaryParent(request) : null
  const warnings = request ? admitWarnings(request) : []
  const activeHeads = (feeHeads.data ?? []).filter((h) => h.is_active)

  const onSubmit = async (values: AdmitValues) => {
    if (!request) return
    try {
      const outcome = await admit.mutateAsync({
        requestId: request.id,
        body: {
          class_id: values.class_id !== NONE ? Number(values.class_id) : null,
          academic_year_id: values.academic_year_id !== NONE ? Number(values.academic_year_id) : null,
          admission_category_id:
            values.admission_category_id !== NONE ? Number(values.admission_category_id) : null,
          admission_number: values.admission_number.trim() || null,
          roll_number: values.roll_number.trim() || null,
          student_email: values.student_email.trim() || null,
          create_parent_account: values.create_parent_account,
          parent_email: values.parent_email.trim() || null,
          send_credentials: values.send_credentials,
          notify_applicant: values.notify_applicant,
          note: values.note.trim() || null,
          // Only meaningful once the fee was confirmed; off otherwise so a
          // request with no confirmed fee never books a receipt.
          record_fee_receipt: feeConfirmed ? values.record_fee_receipt : false,
          fee_head_id:
            feeConfirmed && values.record_fee_receipt && values.fee_head_id !== NONE
              ? Number(values.fee_head_id)
              : null,
        },
      })
      setResult(outcome)
    } catch (error) {
      form.setError('root', {
        message: (error as { message?: string })?.message ?? 'Could not admit the student.',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-success" />
                {result.student.full_name} admitted
              </DialogTitle>
              <DialogDescription>{result.detail}</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <dl className="grid gap-3 rounded-xl border border-border p-4 text-sm sm:grid-cols-2">
                <Detail label="Student login" value={result.student.email} />
                <Detail label="Admission number" value={result.student.admission_number} />
                <Detail label="Class" value={result.request.admitted_class_name} />
                <Detail label="Session" value={result.request.admitted_year_name} />
                <Detail
                  label="Parent login"
                  value={
                    result.parent
                      ? `${result.parent.email}${result.parent_created ? '' : ' (existing)'}`
                      : 'Not created'
                  }
                />
                <Detail
                  label="Welcome email"
                  value={result.applicant_notified ? 'Sent' : 'Not sent'}
                />
                {result.receipt_id != null && (
                  <Detail label="Admission fee" value={`Entered in Finance (receipt #${result.receipt_id})`} />
                )}
              </dl>

              {result.credentials.length > 0 && (
                <div className="space-y-2 rounded-xl border border-warning/30 bg-warning/8 p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="size-4" />
                    Login details — shown once, never stored
                  </p>
                  {result.credentials.map((c) => (
                    <div key={c.user_id} className="rounded-lg bg-card px-3 py-2 text-sm">
                      <p className="font-medium">
                        {c.full_name}{' '}
                        <span className="text-xs text-muted-foreground">({c.role.toLowerCase()})</span>
                      </p>
                      <p className="font-mono text-xs">
                        {c.email} · {c.password}
                      </p>
                      <p className="text-xs text-muted-foreground">{c.detail}</p>
                    </div>
                  ))}
                </div>
              )}

              {result.warnings.length > 0 && (
                <div className="space-y-1 rounded-xl border border-danger/30 bg-danger/8 p-4 text-sm">
                  <p className="font-medium text-danger">Needs attention</p>
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                    {result.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </DialogBody>
            <DialogFooter>
              <Button asChild variant="outline">
                <Link to={`/admin/users?q=${encodeURIComponent(result.student.email)}`}>
                  Open student
                </Link>
              </Button>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Admit {request?.student_full_name}</DialogTitle>
              <DialogDescription>
                Creates the student account, enrols them in the class and closes the request.
                Everything below is prefilled from the application.
              </DialogDescription>
            </DialogHeader>
            <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <DialogBody className="space-y-5">
                <FormError message={form.formState.errors.root?.message} />

                {warnings.length > 0 && (
                  <div className="flex gap-2 rounded-xl border border-warning/30 bg-warning/8 p-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                    <div className="min-w-0 text-xs text-muted-foreground">
                      <p className="text-sm font-medium text-foreground">
                        {feeConfirmed ? 'Before you admit' : 'The admission fee is not confirmed'}
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                  <Field
                    id="admit_class"
                    label="Class"
                    required
                    hint={request?.class_name ? `Applied for ${request.class_name}.` : undefined}
                  >
                    <Select
                      value={form.watch('class_id')}
                      onValueChange={(v) => form.setValue('class_id', v, { shouldDirty: true })}
                    >
                      <SelectTrigger id="admit_class">
                        <SelectValue placeholder="Choose a class" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Not enrolled yet</SelectItem>
                        {(classes.data ?? []).map((room) => (
                          <SelectItem key={room.id} value={String(room.id)}>
                            {room.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field id="admit_year" label="Session year">
                    <Select
                      value={form.watch('academic_year_id')}
                      onValueChange={(v) =>
                        form.setValue('academic_year_id', v, { shouldDirty: true })
                      }
                    >
                      <SelectTrigger id="admit_year">
                        <SelectValue placeholder="Current year" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Current year</SelectItem>
                        {(years.data ?? []).map((year) => (
                          <SelectItem key={year.id} value={String(year.id)}>
                            {year.name}
                            {year.is_current ? ' (current)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field
                    id="admit_category"
                    label="Admission category"
                    hint="Carries any standing concession into the fee engine."
                  >
                    <Select
                      value={form.watch('admission_category_id')}
                      onValueChange={(v) =>
                        form.setValue('admission_category_id', v, { shouldDirty: true })
                      }
                    >
                      <SelectTrigger id="admit_category">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {(categories.data ?? []).map((category) => (
                          <SelectItem key={category.id} value={String(category.id)}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field
                    id="admit_number"
                    label="Admission number"
                    hint="Blank: issued by the school's identifier setting."
                  >
                    <Input id="admit_number" {...form.register('admission_number')} />
                  </Field>

                  <Field id="admit_roll" label="Roll number">
                    <Input id="admit_roll" {...form.register('roll_number')} />
                  </Field>

                  <Field
                    id="admit_email"
                    label="Student login email"
                    hint="Blank: derived from the name."
                    error={form.formState.errors.student_email?.message}
                  >
                    <Input
                      id="admit_email"
                      type="email"
                      placeholder="firstname.lastname@…"
                      {...form.register('student_email')}
                    />
                  </Field>
                </div>

                <div className="space-y-3 rounded-xl border border-border p-4">
                  <SwitchRow
                    title="Create a parent login"
                    description={`For ${primary?.full_name ?? 'the primary contact'}, linked to the student with access to fees. An existing parent with this email is linked instead.`}
                    checked={createParent}
                    onCheckedChange={(v) =>
                      form.setValue('create_parent_account', v, { shouldDirty: true })
                    }
                  />
                  {createParent && (
                    <Field
                      id="admit_parent_email"
                      label="Parent email"
                      error={form.formState.errors.parent_email?.message}
                    >
                      <Input id="admit_parent_email" type="email" {...form.register('parent_email')} />
                    </Field>
                  )}

                  <SwitchRow
                    className="border-t border-border pt-3"
                    title="Issue login details"
                    description={
                      notify
                        ? 'Passwords for the student and, if created, the parent. Included in the welcome email and shown here once.'
                        : 'Passwords for the student and, if created, the parent. With the welcome email off they are only shown here, once — pass them on yourself.'
                    }
                    checked={sendCredentials}
                    onCheckedChange={(v) => form.setValue('send_credentials', v, { shouldDirty: true })}
                  />

                  <SwitchRow
                    className="border-t border-border pt-3"
                    title="Send the welcome email"
                    description={`To ${primary?.email ?? 'the family'}: the admission confirmation, links to the web and mobile apps, the note below${sendCredentials ? ' and the login details' : ''}.`}
                    checked={notify}
                    onCheckedChange={(v) => form.setValue('notify_applicant', v, { shouldDirty: true })}
                  />

                  {feeConfirmed && request?.payment && (
                    <>
                      <SwitchRow
                        className="border-t border-border pt-3"
                        title="Enter the admission fee in Finance"
                        description={`Records the ${formatMoney(
                          request.payment.amount_paid ?? request.payment.amount,
                          request.payment.currency,
                        )} confirmed through the portal as a receipt for the new student.`}
                        checked={recordReceipt}
                        onCheckedChange={(v) =>
                          form.setValue('record_fee_receipt', v, { shouldDirty: true })
                        }
                      />
                      {recordReceipt && activeHeads.length > 0 && (
                        <Field id="admit_fee_head" label="Fee head">
                          <Select
                            value={form.watch('fee_head_id')}
                            onValueChange={(v) => form.setValue('fee_head_id', v, { shouldDirty: true })}
                          >
                            <SelectTrigger id="admit_fee_head">
                              <SelectValue placeholder="The admission charge" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>The admission charge (default)</SelectItem>
                              {activeHeads.map((head) => (
                                <SelectItem key={head.id} value={String(head.id)}>
                                  {head.name}
                                  {head.is_admission_charge ? ' (admission charge)' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      )}
                    </>
                  )}
                </div>

                <Field id="admit_note" label="Note to the family" hint="Optional. Included in the welcome email.">
                  <Textarea
                    id="admit_note"
                    rows={2}
                    placeholder="Classes begin on Monday, 3 June. Please report to the office at 8:30 am…"
                    {...form.register('note')}
                  />
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" variant="success" loading={form.formState.isSubmitting}>
                  <BadgeCheck />
                  Admit student
                </Button>
              </DialogFooter>
            </DialogForm>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ======================================================= request documents

/**
 * The usual admission checklist. Keys are fixed so that asking again keeps
 * the family's uploads: the server matches a document by key.
 */
const DOCUMENT_PRESETS: { key: string; label: string; description?: string }[] = [
  { key: 'birth_certificate', label: 'Birth certificate' },
  { key: 'student_photo', label: 'Passport-size photo of the student', description: 'A recent photo on a plain background.' },
  { key: 'student_id_proof', label: "Student's Aadhaar card / ID proof" },
  { key: 'parent_id_proof', label: "Parent's ID proof", description: 'Aadhaar, passport, voter ID or driving licence.' },
  { key: 'address_proof', label: 'Address proof', description: 'A utility bill, rental agreement or Aadhaar with the current address.' },
  { key: 'transfer_certificate', label: 'Transfer certificate from the previous school' },
  { key: 'previous_report_card', label: "Previous year's report card / mark sheet" },
]

/** What the server derives a key from when none is sent; mirrored to match rows. */
function slug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'document'
  ).slice(0, 60)
}

interface PresetRow {
  key: string
  label: string
  description?: string
  selected: boolean
  required: boolean
}

interface CustomRow {
  id: string
  /** Set for a document already on the request, so its uploads are kept. */
  key: string | null
  label: string
  description: string
  required: boolean
}

let customSeq = 0
const newCustomRow = (seed: Partial<CustomRow> = {}): CustomRow => ({
  id: `custom-${++customSeq}`,
  key: null,
  label: '',
  description: '',
  required: true,
  ...seed,
})

/**
 * The checklist, rebuilt from what was asked before when there is anything —
 * re-requesting then edits the list rather than starting from scratch. A
 * first request preselects the documents every admission needs, plus the
 * previous school's papers when the family named one.
 */
function initialChecklist(request: AdmissionRequestOut): { presets: PresetRow[]; custom: CustomRow[] } {
  const existing = request.documents
  if (existing.length === 0) {
    const fromSchool = !!request.previous_school
    return {
      presets: DOCUMENT_PRESETS.map((p) => ({
        ...p,
        selected:
          ['birth_certificate', 'student_photo', 'student_id_proof', 'parent_id_proof'].includes(p.key) ||
          (fromSchool && (p.key === 'transfer_certificate' || p.key === 'previous_report_card')),
        required: true,
      })),
      custom: [],
    }
  }
  const matched = new Set<string>()
  const presets = DOCUMENT_PRESETS.map((p) => {
    const doc = existing.find((d) => d.key === p.key || slug(d.label) === slug(p.label))
    if (doc) matched.add(doc.key)
    return {
      ...p,
      label: p.label,
      description: doc?.description ?? p.description,
      selected: !!doc,
      required: doc ? doc.required : true,
    }
  })
  const custom = existing
    .filter((d) => !matched.has(d.key))
    .map((d) =>
      newCustomRow({ key: d.key, label: d.label, description: d.description ?? '', required: d.required }),
    )
  return { presets, custom }
}

function RequestDocumentsDialog({
  request,
  onClose,
  config,
}: {
  request: AdmissionRequestOut | null
  onClose: () => void
  config?: AdmissionPipelineConfig
}) {
  const requestDocuments = useRequestAdmissionDocuments()
  const open = !!request
  const [presets, setPresets] = React.useState<PresetRow[]>([])
  const [custom, setCustom] = React.useState<CustomRow[]>([])
  const [deadline, setDeadline] = React.useState<string | null>(null)
  const [note, setNote] = React.useState('')
  const [notify, setNotify] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [showErrors, setShowErrors] = React.useState(false)

  React.useEffect(() => {
    if (!request) return
    const initial = initialChecklist(request)
    setPresets(initial.presets)
    setCustom(initial.custom)
    setDeadline(request.documents_deadline ?? null)
    setNote(request.documents.length > 0 ? (request.documents_note ?? '') : '')
    setNotify(true)
    setError(null)
    setShowErrors(false)
    // Rebuilt only when a different request is opened, not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id])

  const updatePreset = (key: string, patch: Partial<PresetRow>) =>
    setPresets((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const updateCustom = (id: string, patch: Partial<CustomRow>) =>
    setCustom((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const filledCustom = custom.filter((r) => r.label.trim() || r.description.trim())
  const selectedCount = presets.filter((p) => p.selected).length + filledCustom.length
  const alreadyAsked = (request?.documents.length ?? 0) > 0

  const submit = async () => {
    if (!request) return
    setShowErrors(true)
    setError(null)
    if (filledCustom.some((r) => r.label.trim().length < 2)) {
      setError('Give each added document a name.')
      return
    }
    const documents = [
      ...presets
        .filter((p) => p.selected)
        .map((p) => ({ key: p.key, label: p.label, description: p.description ?? null, required: p.required })),
      ...filledCustom.map((r) => ({
        key: r.key,
        label: r.label.trim(),
        description: r.description.trim() || null,
        required: r.required,
      })),
    ]
    if (documents.length === 0) {
      setError('Choose at least one document to ask for.')
      return
    }
    const keys = documents.map((d) => slug(d.key || d.label))
    if (new Set(keys).size !== keys.length) {
      setError('The same document is listed twice. Remove the duplicate.')
      return
    }
    if (documents.length > 20) {
      setError('Ask for at most 20 documents at a time.')
      return
    }
    try {
      await requestDocuments.mutateAsync({
        requestId: request.id,
        body: { documents, deadline, note: note.trim() || null, notify_applicant: notify },
      })
      onClose()
    } catch {
      /* the mutation cache already toasted */
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {alreadyAsked ? 'Change the documents requested' : 'Select & request documents'}
          </DialogTitle>
          <DialogDescription>
            {alreadyAsked
              ? `Updates the checklist for ${request?.student_full_name}. Documents already uploaded are kept.`
              : `Selects ${request?.student_full_name} and asks the family to upload these documents on their private application page.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />

          <section className="space-y-2">
            <h4 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Documents
            </h4>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {presets.map((p) => (
                <li key={p.key} className="flex items-center gap-3 px-3 py-2.5">
                  <Checkbox
                    id={`doc-${p.key}`}
                    checked={p.selected}
                    onCheckedChange={(v) => updatePreset(p.key, { selected: v === true })}
                  />
                  <label htmlFor={`doc-${p.key}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block text-sm">{p.label}</span>
                    {p.description && (
                      <span className="block text-xs text-muted-foreground">{p.description}</span>
                    )}
                  </label>
                  {p.selected && (
                    <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      Required
                      <Switch
                        checked={p.required}
                        onCheckedChange={(v) => updatePreset(p.key, { required: v })}
                      />
                    </label>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2">
            {custom.map((row) => {
              const invalid = showErrors && (row.label.trim() || row.description.trim()) && row.label.trim().length < 2
              return (
                <div key={row.id} className="space-y-2 rounded-xl border border-border p-3">
                  <div className="flex items-start gap-2">
                    <Input
                      aria-label="Document name"
                      placeholder="Document name, e.g. Caste certificate"
                      value={row.label}
                      invalid={!!invalid}
                      maxLength={120}
                      onChange={(e) => updateCustom(row.id, { label: e.target.value })}
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove this document"
                      onClick={() => setCustom((rows) => rows.filter((r) => r.id !== row.id))}
                    >
                      <X />
                    </Button>
                  </div>
                  <Input
                    aria-label="Description"
                    placeholder="What the family should know about it (optional)"
                    value={row.description}
                    maxLength={300}
                    onChange={(e) => updateCustom(row.id, { description: e.target.value })}
                  />
                  <label className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                    Required
                    <Switch
                      checked={row.required}
                      onCheckedChange={(v) => updateCustom(row.id, { required: v })}
                    />
                  </label>
                </div>
              )
            })}
            <Button
              variant="outline"
              size="sm"
              icon={<Plus />}
              onClick={() => setCustom((rows) => [...rows, newCustomRow()])}
            >
              Add another document
            </Button>
          </section>

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field id="docs_deadline" label="Upload by" hint="Optional. Shown to the family as the deadline.">
              <DatePicker id="docs_deadline" value={deadline} onChange={setDeadline} placeholder="No deadline" />
            </Field>
          </div>

          <Field id="docs_note" label="Note to the family" hint="Optional. Included in the email verbatim.">
            <Textarea
              id="docs_note"
              rows={2}
              value={note}
              maxLength={2000}
              placeholder="Clear scans or photos are fine. Please bring the originals on the day of admission."
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          <NotifySwitch
            request={request}
            config={config}
            checked={notify}
            onCheckedChange={setNotify}
            description={`Sends ${request?.contact_email ?? 'the family'} the list and a link to their upload page.`}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={requestDocuments.isPending}>
            Cancel
          </Button>
          <Button icon={<FilePlus2 />} loading={requestDocuments.isPending} onClick={submit}>
            {alreadyAsked ? 'Update request' : `Request ${countLabel(selectedCount, 'document')}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ======================================================== review documents

type Verdict = 'ACCEPTED' | 'REJECTED'

/**
 * A verdict per document. Submitted documents start as Accept so a clean set
 * is one click; anything not yet uploaded, or already decided, starts with no
 * verdict and is left as it is unless the office picks one.
 */
function ReviewDocumentsDialog({
  request,
  onClose,
  config,
}: {
  request: AdmissionRequestOut | null
  onClose: () => void
  config?: AdmissionPipelineConfig
}) {
  const review = useReviewAdmissionDocuments()
  const open = !!request
  const [verdicts, setVerdicts] = React.useState<Record<string, Verdict | null>>({})
  const [reasons, setReasons] = React.useState<Record<string, string>>({})
  const [note, setNote] = React.useState('')
  const [notify, setNotify] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [showErrors, setShowErrors] = React.useState(false)

  React.useEffect(() => {
    if (!request) return
    const initial: Record<string, Verdict | null> = {}
    for (const doc of request.documents) {
      initial[doc.key] =
        (doc.status === 'SUBMITTED' || doc.status === 'UPLOADED') && doc.files.length > 0
          ? 'ACCEPTED'
          : null
    }
    setVerdicts(initial)
    setReasons({})
    setNote('')
    setNotify(true)
    setError(null)
    setShowErrors(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id])

  const documents = request?.documents ?? []
  const decided = documents.filter((d) => verdicts[d.key])
  const rejecting = decided.filter((d) => verdicts[d.key] === 'REJECTED')
  // Whether this review completes the set: every required document accepted,
  // counting both today's verdicts and the ones already on record.
  const completes =
    rejecting.length === 0 &&
    documents
      .filter((d) => d.required)
      .every((d) => (verdicts[d.key] ?? (d.status === 'ACCEPTED' ? 'ACCEPTED' : null)) === 'ACCEPTED')

  const submit = async () => {
    if (!request) return
    setShowErrors(true)
    setError(null)
    if (decided.length === 0) {
      setError('Choose Accept or Send back for at least one document.')
      return
    }
    if (rejecting.some((d) => !reasons[d.key]?.trim())) {
      setError('Say what is wrong with each document you send back, so the family knows what to fix.')
      return
    }
    try {
      await review.mutateAsync({
        requestId: request.id,
        body: {
          decisions: decided.map((d) => ({
            key: d.key,
            status: verdicts[d.key] as Verdict,
            note: verdicts[d.key] === 'REJECTED' ? reasons[d.key].trim() : null,
          })),
          note: note.trim() || null,
          notify_applicant: notify,
        },
      })
      onClose()
    } catch {
      /* the mutation cache already toasted */
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Review documents</DialogTitle>
          <DialogDescription>
            Open each file, then accept it or send it back with a reason. When every required
            document is accepted the documents are marked verified; anything sent back goes to the
            family to upload again.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <FormError message={error} />

          <ul className="space-y-2">
            {documents.map((doc) => {
              const verdict = verdicts[doc.key] ?? null
              const reasonMissing = showErrors && verdict === 'REJECTED' && !reasons[doc.key]?.trim()
              return (
                <li key={doc.key} className="space-y-2 rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium">{doc.label}</span>
                        {!doc.required && (
                          <Badge tone="outline" size="sm">
                            Optional
                          </Badge>
                        )}
                        <Badge tone={DOCUMENT_STATUS[doc.status]?.tone ?? 'neutral'} size="sm">
                          {DOCUMENT_STATUS[doc.status]?.label ?? humanise(doc.status)}
                        </Badge>
                      </div>
                      {doc.files.length === 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">No files uploaded.</p>
                      )}
                    </div>
                    <Segmented<Verdict>
                      layoutId={`doc-verdict-${doc.key}`}
                      size="sm"
                      value={verdict}
                      onChange={(v) =>
                        setVerdicts((prev) => ({ ...prev, [doc.key]: prev[doc.key] === v ? null : v }))
                      }
                      options={[
                        { value: 'ACCEPTED', label: 'Accept', icon: <Check /> },
                        { value: 'REJECTED', label: 'Send back', icon: <X /> },
                      ]}
                      aria-label={`Verdict for ${doc.label}`}
                    />
                  </div>
                  <FileLinks files={doc.files} />
                  {doc.review_note && verdict !== 'REJECTED' && (
                    <p className="text-xs text-muted-foreground">Earlier note: {doc.review_note}</p>
                  )}
                  {verdict === 'REJECTED' && (
                    <Field
                      id={`reason-${doc.key}`}
                      label="Reason, shown to the family"
                      required
                      error={reasonMissing ? 'Say what needs fixing.' : undefined}
                    >
                      <Input
                        id={`reason-${doc.key}`}
                        value={reasons[doc.key] ?? ''}
                        maxLength={500}
                        invalid={reasonMissing}
                        placeholder="The photo is blurred. Please upload a clearer scan."
                        onChange={(e) => setReasons((prev) => ({ ...prev, [doc.key]: e.target.value }))}
                      />
                    </Field>
                  )}
                </li>
              )
            })}
          </ul>

          <Field id="review_note" label="Note to the family" hint="Optional. Included in the email.">
            <Textarea
              id="review_note"
              rows={2}
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          <NotifySwitch
            request={request}
            config={config}
            checked={notify}
            onCheckedChange={setNotify}
            description={
              rejecting.length > 0
                ? 'Tells the family which documents to upload again, and why.'
                : completes
                  ? 'Tells the family their documents are verified.'
                  : 'An email goes only once every document is decided or one is sent back.'
            }
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={review.isPending}>
            Cancel
          </Button>
          <Button
            variant={rejecting.length > 0 ? 'solid' : 'success'}
            icon={<FileCheck2 />}
            loading={review.isPending}
            onClick={submit}
          >
            {rejecting.length > 0
              ? `Send ${countLabel(rejecting.length, 'document')} back`
              : completes
                ? 'Verify documents'
                : 'Save review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ========================================================= request payment

const paymentSchema = z
  .object({
    amount: z
      .string()
      .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, 'Enter an amount above zero'),
    currency: z.string().trim().max(8),
    description: z.string().trim().min(2, 'Describe what the payment is for').max(200),
    due_date: z.string().nullable(),
    use_gateway: z.boolean(),
    payment_link: z
      .string()
      .trim()
      .max(1000)
      .refine((v) => v === '' || WEB_LINK.test(v), 'The link must start with https://'),
    instructions: z.string().trim().max(2000),
    note: z.string().max(2000),
    notify_applicant: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.use_gateway && !v.payment_link && !v.instructions) {
      ctx.addIssue({
        code: 'custom',
        path: ['instructions'],
        message: 'Give the family a payment link or payment instructions (bank or UPI details).',
      })
    }
  })

type PaymentValues = z.infer<typeof paymentSchema>

function RequestPaymentDialog({
  request,
  onClose,
  config,
  board,
}: {
  request: AdmissionRequestOut | null
  onClose: () => void
  config?: AdmissionPipelineConfig
  board: Program
}) {
  const open = !!request
  const requestPayment = useRequestAdmissionPayment()
  const feeHeads = useFeeHeads({ program: board }, open && !request?.payment)
  const gateway = !!config?.gateway_available

  const form = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: '',
      currency: '',
      description: 'Admission fee',
      due_date: null,
      use_gateway: false,
      payment_link: '',
      instructions: '',
      note: '',
      notify_applicant: true,
    },
  })

  // Asking again starts from what was asked before; a first request starts
  // from the admission-charge head's usual amount, when the school has one.
  React.useEffect(() => {
    if (!request) return
    const previous = request.payment
    form.reset({
      amount: previous ? String(previous.amount) : '',
      currency: previous?.currency ?? config?.currency ?? '',
      description: previous?.description ?? 'Admission fee',
      due_date: previous?.due_date ?? null,
      use_gateway: gateway && (!previous || previous.provider === 'RAZORPAY'),
      payment_link: previous?.provider === 'MANUAL' ? (previous.link_url ?? '') : '',
      instructions: previous?.instructions ?? '',
      note: '',
      notify_applicant: true,
    })
  }, [request, config, gateway, form])

  React.useEffect(() => {
    if (!open || request?.payment || form.getValues('amount')) return
    const head = (feeHeads.data ?? []).find((h) => h.is_active && h.is_admission_charge)
    if (head && head.default_amount > 0) form.setValue('amount', String(head.default_amount))
  }, [open, request?.payment, feeHeads.data, form])

  const useGateway = gateway && form.watch('use_gateway')
  const errors = form.formState.errors

  const onSubmit = async (values: PaymentValues) => {
    if (!request) return
    try {
      await requestPayment.mutateAsync({
        requestId: request.id,
        body: {
          amount: Number(values.amount),
          currency: values.currency.toUpperCase() || null,
          description: values.description,
          due_date: values.due_date,
          use_gateway: useGateway,
          // A link given alongside the gateway would win over it, so it is
          // only sent when the office is supplying its own.
          payment_link: useGateway ? null : values.payment_link || null,
          instructions: values.instructions || null,
          note: values.note.trim() || null,
          notify_applicant: values.notify_applicant,
        },
      })
      onClose()
    } catch {
      /* the mutation cache already toasted */
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{request?.payment ? 'Change the payment request' : 'Request payment'}</DialogTitle>
          <DialogDescription>
            {request?.payment
              ? 'Replaces the earlier request. Any payment details the family already sent are kept for reference.'
              : `Asks the family of ${request?.student_full_name} to pay the admission fee from their application page.`}
          </DialogDescription>
        </DialogHeader>
        <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-5">
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-3">
              <Field id="pay_amount" label="Amount" required error={errors.amount?.message} className="sm:col-span-2">
                <Input
                  id="pay_amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  invalid={!!errors.amount}
                  {...form.register('amount')}
                />
              </Field>
              <Field id="pay_currency" label="Currency" error={errors.currency?.message}>
                <Input
                  id="pay_currency"
                  maxLength={8}
                  placeholder={config?.currency ?? 'INR'}
                  className="uppercase"
                  {...form.register('currency')}
                />
              </Field>
              <Field
                id="pay_description"
                label="Description"
                required
                error={errors.description?.message}
                className="sm:col-span-2"
              >
                <Input id="pay_description" maxLength={200} {...form.register('description')} />
              </Field>
              <Field id="pay_due" label="Pay by">
                <DatePicker
                  id="pay_due"
                  value={form.watch('due_date')}
                  onChange={(v) => form.setValue('due_date', v, { shouldDirty: true })}
                  placeholder="No due date"
                />
              </Field>
            </div>

            <div className="space-y-4 rounded-xl border border-border p-4">
              {gateway && (
                <SwitchRow
                  title="Create a Razorpay link automatically"
                  description="The family pays online and the payment confirms itself — nothing to verify by hand."
                  checked={useGateway}
                  onCheckedChange={(v) => form.setValue('use_gateway', v, { shouldDirty: true })}
                />
              )}
              {!useGateway && (
                <Field
                  id="pay_link"
                  label="Payment link"
                  hint="Optional. A link from any payment provider."
                  error={errors.payment_link?.message}
                >
                  <Input
                    id="pay_link"
                    type="url"
                    placeholder="https://"
                    invalid={!!errors.payment_link}
                    {...form.register('payment_link')}
                  />
                </Field>
              )}
              <Field
                id="pay_instructions"
                label={useGateway ? 'Other ways to pay' : 'Payment instructions'}
                hint={
                  useGateway
                    ? 'Optional. Bank or UPI details for families who prefer not to pay online.'
                    : 'Bank account or UPI details. Needed when there is no payment link.'
                }
                error={errors.instructions?.message}
              >
                <Textarea
                  id="pay_instructions"
                  rows={3}
                  maxLength={2000}
                  invalid={!!errors.instructions}
                  placeholder={'Account name: …\nAccount number: …  IFSC: …\nUPI: school@bank'}
                  {...form.register('instructions')}
                />
              </Field>
              {!gateway && (
                <p className="text-xs text-muted-foreground">
                  The family pays using the link or instructions, then sends the transaction ID or a
                  screenshot from their application page for you to verify.
                </p>
              )}
            </div>

            <Field id="pay_note" label="Note to the family" hint="Optional. Included in the email.">
              <Textarea id="pay_note" rows={2} maxLength={2000} {...form.register('note')} />
            </Field>

            <NotifySwitch
              request={request}
              config={config}
              checked={form.watch('notify_applicant')}
              onCheckedChange={(v) => form.setValue('notify_applicant', v, { shouldDirty: true })}
              description={`Sends ${request?.contact_email ?? 'the family'} the amount, how to pay and a link to their application page.`}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" icon={<Banknote />} loading={form.formState.isSubmitting}>
              {request?.payment ? 'Update request' : 'Request payment'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

// ========================================================== verify payment

function VerifyPaymentDialog({
  request,
  onClose,
  config,
}: {
  request: AdmissionRequestOut | null
  onClose: () => void
  config?: AdmissionPipelineConfig
}) {
  const review = useReviewAdmissionPayment()
  const open = !!request
  const [choice, setChoice] = React.useState<'CONFIRM' | 'RETURN'>('CONFIRM')
  const [note, setNote] = React.useState('')
  const [notify, setNotify] = React.useState(true)
  const [showErrors, setShowErrors] = React.useState(false)

  React.useEffect(() => {
    if (!request) return
    setChoice('CONFIRM')
    setNote('')
    setNotify(true)
    setShowErrors(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id])

  const payment = request?.payment
  const pending = payment
    ? [...payment.submissions].reverse().find((s) => s.status === 'PENDING') ?? null
    : null
  // Proof can only be sent back once the family has sent some.
  const canReturn = request?.status === 'PAYMENT_SUBMITTED'
  const returning = canReturn && choice === 'RETURN'
  const noteMissing = showErrors && returning && !note.trim()

  const submit = async () => {
    if (!request) return
    setShowErrors(true)
    if (returning && !note.trim()) return
    try {
      await review.mutateAsync({
        requestId: request.id,
        body: { approve: !returning, note: note.trim() || null, notify_applicant: notify },
      })
      onClose()
    } catch {
      /* the mutation cache already toasted */
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verify payment</DialogTitle>
          <DialogDescription>
            {payment
              ? `${payment.description}: ${formatMoney(payment.amount, payment.currency)} requested from the family of ${request?.student_full_name}.`
              : undefined}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {pending ? (
            <div className="rounded-xl border border-border p-3 text-sm">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Sent by the family {formatRelative(pending.submitted_at)}
              </p>
              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                <Detail label="Transaction ID" value={pending.transaction_id} />
                <Detail label="Paid on" value={formatDate(pending.paid_on)} />
                <Detail
                  label="Amount"
                  value={pending.amount != null ? formatMoney(pending.amount, payment?.currency) : null}
                />
                <Detail label="Method" value={pending.method} />
                {pending.note && (
                  <div className="sm:col-span-2">
                    <Detail label="Their note" value={pending.note} />
                  </div>
                )}
              </dl>
              <FileLinks files={pending.files} />
            </div>
          ) : (
            <p className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              The family has not sent any payment details. You can still confirm the payment —
              for example, when the fee was paid in cash at the school office.
            </p>
          )}

          {canReturn && (
            <Segmented
              layoutId="verify-payment-choice"
              value={choice}
              onChange={setChoice}
              options={[
                { value: 'CONFIRM', label: 'Confirm payment', icon: <Check /> },
                { value: 'RETURN', label: 'Send back', icon: <X /> },
              ]}
              aria-label="Decision"
            />
          )}

          <Field
            id="verify_note"
            label={returning ? 'What did not match' : 'Note'}
            required={returning}
            hint={
              returning
                ? 'Shown to the family so they can correct it and send the details again.'
                : 'Optional. Recorded on the application.'
            }
            error={noteMissing ? 'Tell the family what did not match.' : undefined}
          >
            <Textarea
              id="verify_note"
              rows={2}
              value={note}
              maxLength={2000}
              invalid={noteMissing}
              placeholder={
                returning
                  ? 'We could not find this transaction ID in our account. Please check and send it again.'
                  : 'Paid in cash at the office, receipt no. …'
              }
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          <NotifySwitch
            request={request}
            config={config}
            checked={notify}
            onCheckedChange={setNotify}
            description={
              returning
                ? 'Asks the family to check the payment details and send them again.'
                : 'Tells the family the payment has been received.'
            }
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={review.isPending}>
            Cancel
          </Button>
          <Button
            variant={returning ? 'danger' : 'success'}
            icon={returning ? <XCircle /> : <CheckCircle2 />}
            loading={review.isPending}
            onClick={submit}
          >
            {returning ? 'Send back to the family' : 'Confirm payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================================================================ decisions

/** Waitlist or decline, with an optional message to the family. */
function DecisionDialog({
  request,
  decision,
  onClose,
}: {
  request: AdmissionRequestOut | null
  decision: 'WAITLISTED' | 'REJECTED' | null
  onClose: () => void
}) {
  const setStatus = useSetAdmissionRequestStatus()
  const [note, setNote] = React.useState('')
  const [notify, setNotify] = React.useState(true)
  const open = !!request && !!decision

  React.useEffect(() => {
    if (open) {
      setNote('')
      setNotify(true)
    }
  }, [open])

  const copy =
    decision === 'REJECTED'
      ? {
          title: `Decline ${request?.student_full_name}`,
          description:
            'The request is kept and can be reopened later. Say why if the family should know.',
          label: 'Decline',
          placeholder: 'We have no seat in Class 5 this year…',
        }
      : {
          title: `Waitlist ${request?.student_full_name}`,
          description: 'Kept for when a seat opens. Tell the family what to expect.',
          label: 'Add to waiting list',
          placeholder: 'We expect a seat to open in June…',
        }

  const confirm = async () => {
    if (!request || !decision) return
    try {
      await setStatus.mutateAsync({
        requestId: request.id,
        body: { status: decision, note: note.trim() || null, notify_applicant: notify },
      })
      onClose()
    } catch {
      /* the mutation cache already toasted */
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {decision === 'REJECTED' && request?.payment?.status === 'VERIFIED' && (
            <div className="flex gap-2 rounded-xl border border-warning/30 bg-warning/8 p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <p className="text-xs text-muted-foreground">
                This family has already paid{' '}
                {formatMoney(request.payment.amount_paid ?? request.payment.amount, request.payment.currency)}.
                Arrange the refund separately.
              </p>
            </div>
          )}
          <Field id="decision_note" label="Message to the family" hint="Optional. Sent verbatim.">
            <Textarea
              id="decision_note"
              rows={3}
              value={note}
              placeholder={copy.placeholder}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
            <span className="text-sm font-medium">
              Email {request?.contact_name ?? 'the family'}
            </span>
            <Switch checked={notify} onCheckedChange={setNotify} />
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={setStatus.isPending}>
            Cancel
          </Button>
          <Button
            variant={decision === 'REJECTED' ? 'danger' : 'solid'}
            loading={setStatus.isPending}
            onClick={confirm}
          >
            {copy.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =================================================================== detail

function Detail({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{value == null || value === '' ? '—' : value}</dd>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  )
}

function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h4 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {action}
    </div>
  )
}

/** Steps whose email the server can send again. */
const RESENDABLE: AdmissionRequestStatus[] = ['NEW', 'UNDER_REVIEW', 'DOCUMENTS_REQUESTED', 'PAYMENT_REQUESTED']

/**
 * The family's private link, with copy and resend — for the day the email
 * lands in spam and the office needs to send it on WhatsApp instead.
 */
function PortalLink({ request }: { request: AdmissionRequestOut }) {
  const { copied, copy } = useCopyToClipboard()
  const resend = useResendAdmissionEmail()
  const url = request.portal_url
  const canResend = RESENDABLE.includes(request.status)
  if (!url && !canResend) return null

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">Family’s application page</p>
      {url && (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted/50 px-2 py-1 font-mono text-xs">
            {url}
          </code>
          <Button
            variant="outline"
            size="xs"
            icon={copied ? <Check /> : <Copy />}
            onClick={async () => {
              if (!(await copy(url))) toast.error('Could not copy the link. Select it and copy it instead.')
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button asChild variant="ghost" size="xs">
            <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open the family’s page">
              <ExternalLink />
            </a>
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-2xs text-muted-foreground">
          Private to this family. Share it by WhatsApp or SMS if the email has not arrived.
        </p>
        {canResend && (
          <Button
            variant="ghost"
            size="xs"
            icon={<Send />}
            loading={resend.isPending}
            onClick={() => resend.mutate(request.id)}
          >
            Resend email
          </Button>
        )}
      </div>
    </div>
  )
}

function DocumentsSection({
  request,
  onReview,
}: {
  request: AdmissionRequestOut
  onReview?: () => void
}) {
  const accepted = request.documents.filter((d) => d.status === 'ACCEPTED').length
  const timeline = [
    request.documents_requested_at && `Requested ${formatDate(request.documents_requested_at)}`,
    request.documents_deadline && `due ${formatDate(request.documents_deadline)}`,
    request.documents_submitted_at && `submitted ${formatDate(request.documents_submitted_at)}`,
    request.documents_verified_at && `verified ${formatDate(request.documents_verified_at)}`,
  ].filter(Boolean)

  return (
    <section>
      <SectionHeading
        title={`Documents · ${accepted} of ${request.documents.length} accepted`}
        action={
          onReview && (
            <Button variant="outline" size="xs" icon={<FileCheck2 />} onClick={onReview}>
              Review documents
            </Button>
          )
        }
      />
      {timeline.length > 0 && <p className="mb-2 text-xs text-muted-foreground">{timeline.join(' · ')}</p>}
      {request.documents_note && (
        <p className="mb-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Note to the family: {request.documents_note}
        </p>
      )}
      <ul className="space-y-2">
        {request.documents.map((doc: AdmissionDocumentOut) => (
          <li key={doc.key} className="rounded-xl border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{doc.label}</span>
              {!doc.required && (
                <Badge tone="outline" size="sm">
                  Optional
                </Badge>
              )}
              <Badge tone={DOCUMENT_STATUS[doc.status]?.tone ?? 'neutral'} size="sm">
                {DOCUMENT_STATUS[doc.status]?.label ?? humanise(doc.status)}
              </Badge>
            </div>
            {doc.description && <p className="mt-0.5 text-xs text-muted-foreground">{doc.description}</p>}
            <FileLinks files={doc.files} />
            {doc.review_note && (
              <p className={`mt-1.5 text-xs ${doc.status === 'REJECTED' ? 'text-danger' : 'text-muted-foreground'}`}>
                {doc.review_note}
              </p>
            )}
            {doc.reviewed_by_name && (
              <p className="mt-1 text-2xs text-muted-foreground">
                Reviewed by {doc.reviewed_by_name} · {formatRelative(doc.reviewed_at)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function PaymentSection({
  request,
  payment,
  onVerify,
  onCheck,
  checking,
}: {
  request: AdmissionRequestOut
  payment: AdmissionPaymentOut
  onVerify?: () => void
  onCheck?: () => void
  checking: boolean
}) {
  const status = PAYMENT_STATUS[payment.status]
  const viaGateway = payment.provider === 'RAZORPAY'

  return (
    <section>
      <SectionHeading
        title="Admission fee"
        action={
          (onVerify || onCheck) && (
            <div className="flex flex-wrap gap-1.5">
              {onCheck && (
                <Button variant="outline" size="xs" icon={<SearchCheck />} loading={checking} onClick={onCheck}>
                  Check payment status
                </Button>
              )}
              {onVerify && (
                <Button variant="outline" size="xs" icon={<ReceiptText />} onClick={onVerify}>
                  Verify payment
                </Button>
              )}
            </div>
          )
        }
      />
      <dl className="grid gap-x-4 gap-y-3 rounded-xl border border-border p-3 sm:grid-cols-2">
        <Detail label="Amount" value={formatMoney(payment.amount, payment.currency)} />
        <Detail
          label="Status"
          value={
            <Badge tone={status?.tone ?? 'neutral'} size="sm">
              {status?.label ?? humanise(payment.status)}
            </Badge>
          }
        />
        <Detail label="For" value={payment.description} />
        <Detail label="Pay by" value={formatDate(payment.due_date)} />
        <Detail
          label="Collected through"
          value={
            viaGateway
              ? `Razorpay link${payment.gateway_status ? ` (${payment.gateway_status})` : ''}`
              : 'Link or instructions from the office'
          }
        />
        <Detail
          label="Requested"
          value={
            payment.requested_at
              ? `${formatDate(payment.requested_at)}${payment.requested_by_name ? ` by ${payment.requested_by_name}` : ''}`
              : null
          }
        />
        {payment.link_url && (
          <div className="sm:col-span-2">
            <Detail
              label="Payment link"
              value={
                <a
                  href={payment.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1 underline"
                >
                  <span className="truncate">{payment.link_url}</span>
                  <ExternalLink className="size-3 shrink-0" />
                </a>
              }
            />
          </div>
        )}
        {payment.instructions && (
          <div className="sm:col-span-2">
            <Detail label="Instructions" value={<span className="whitespace-pre-wrap">{payment.instructions}</span>} />
          </div>
        )}
        {payment.status === 'VERIFIED' && (
          <>
            <Detail
              label="Confirmed"
              value={`${formatDate(payment.verified_at)}${
                payment.verified_via === 'GATEWAY'
                  ? ' by Razorpay'
                  : payment.verified_by_name
                    ? ` by ${payment.verified_by_name}`
                    : ''
              }`}
            />
            <Detail
              label="Amount paid"
              value={payment.amount_paid != null ? formatMoney(payment.amount_paid, payment.currency) : null}
            />
            {payment.gateway_payment_id && (
              <Detail label="Razorpay payment ID" value={<span className="font-mono text-xs">{payment.gateway_payment_id}</span>} />
            )}
            {payment.receipt_id != null && <Detail label="Finance receipt" value={`#${payment.receipt_id}`} />}
          </>
        )}
        {payment.review_note && (
          <div className="sm:col-span-2">
            <Detail label="Office note" value={payment.review_note} />
          </div>
        )}
      </dl>

      {payment.submissions.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Payment details sent by the family</p>
          {[...payment.submissions].reverse().map((s) => {
            const tone = SUBMISSION_STATUS[s.status] ?? SUBMISSION_STATUS.PENDING
            return (
              <div key={s.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{formatDateTime(s.submitted_at)}</span>
                  <Badge tone={tone.tone} size="sm">
                    {tone.label}
                  </Badge>
                </div>
                <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                  <Detail label="Transaction ID" value={s.transaction_id && <span className="font-mono text-xs">{s.transaction_id}</span>} />
                  <Detail label="Paid on" value={formatDate(s.paid_on)} />
                  <Detail label="Amount" value={s.amount != null ? formatMoney(s.amount, payment.currency) : null} />
                  <Detail label="Method" value={s.method} />
                  {s.note && (
                    <div className="sm:col-span-2">
                      <Detail label="Their note" value={s.note} />
                    </div>
                  )}
                  {s.review_note && (
                    <div className="sm:col-span-2">
                      <Detail label="Office note" value={s.review_note} />
                    </div>
                  )}
                </dl>
                <FileLinks files={s.files} />
              </div>
            )
          })}
        </div>
      )}
      {request.status === 'PAYMENT_REQUESTED' && viaGateway && (
        <p className="mt-2 text-2xs text-muted-foreground">
          A Razorpay payment confirms itself. Use Check payment status if the family says they have
          paid and this has not updated.
        </p>
      )}
    </section>
  )
}

function RequestDetailSheet({
  request,
  onClose,
  actions,
  checkingId,
}: {
  request: AdmissionRequestOut | null
  onClose: () => void
  actions: Actions
  checkingId: number | null
}) {
  const addNote = useAddAdmissionRequestNote()
  const [note, setNote] = React.useState('')

  React.useEffect(() => {
    setNote('')
  }, [request?.id])

  const age = ageOn(request?.date_of_birth)
  const address = request
    ? [
        request.address_line1,
        request.address_line2,
        request.city,
        request.state,
        request.postal_code,
        request.country,
      ]
        .filter(Boolean)
        .join(', ')
    : ''

  const submitNote = async () => {
    if (!request || !note.trim()) return
    await addNote.mutateAsync({ requestId: request.id, body: note.trim() })
    setNote('')
  }

  const steps = request ? availableSteps(request) : []
  const next = request ? nextStep(request) : null
  const housekeeping = request ? HOUSEKEEPING_ORDER.filter((key) => CAN[key](request)) : []

  return (
    <Sheet open={!!request} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold">Admission request</SheetTitle>
        </SheetHeader>

        <SheetBody className="space-y-6">
          {request && (
            <>
              <div className="flex items-center gap-4">
                <Avatar name={request.student_full_name} size="xl" />
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{request.student_full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {request.reference}
                    {age != null ? ` · ${countLabel(age, 'year')} old` : ''}
                    {request.gender ? ` · ${request.gender.toLowerCase()}` : ''}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <RequestStatusBadge status={request.status} />
                    {request.class_name && (
                      <Badge tone="outline" size="sm">
                        {request.class_name}
                      </Badge>
                    )}
                    {request.academic_year_name && (
                      <Badge tone="neutral" size="sm">
                        {request.academic_year_name}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {request.status === 'ADMITTED' && (
                <div className="rounded-xl border border-success/30 bg-success/8 p-4 text-sm">
                  <p className="font-medium">
                    Admitted {formatDate(request.reviewed_at)}
                    {request.reviewed_by_name ? ` by ${request.reviewed_by_name}` : ''}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {request.admitted_student_email}
                    {request.admission_number ? ` · ${request.admission_number}` : ''}
                    {request.admitted_class_name ? ` · ${request.admitted_class_name}` : ''}
                  </p>
                  {request.admitted_student_email && (
                    <Link
                      className="mt-2 inline-block text-xs font-medium underline"
                      to={`/admin/users?q=${encodeURIComponent(request.admitted_student_email)}`}
                    >
                      Open the student record
                    </Link>
                  )}
                </div>
              )}

              {(request.status === 'REJECTED' || request.status === 'WAITLISTED') &&
                request.decision_note && (
                  <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
                    <p className="text-xs font-medium text-muted-foreground">
                      {REQUEST_STATUS_LABEL[request.status]}
                      {request.reviewed_by_name ? ` by ${request.reviewed_by_name}` : ''} ·{' '}
                      {formatDate(request.reviewed_at)}
                    </p>
                    <p className="mt-1">{request.decision_note}</p>
                  </div>
                )}

              <PortalLink request={request} />

              {request.documents.length > 0 && (
                <>
                  <DocumentsSection
                    request={request}
                    onReview={CAN.reviewDocuments(request) ? () => actions.onReviewDocuments(request) : undefined}
                  />
                  <Separator />
                </>
              )}

              {request.payment && (
                <>
                  <PaymentSection
                    request={request}
                    payment={request.payment}
                    onVerify={CAN.verifyPayment(request) ? () => actions.onVerifyPayment(request) : undefined}
                    onCheck={CAN.checkPayment(request) ? () => actions.onCheckPayment(request) : undefined}
                    checking={checkingId === request.id}
                  />
                  <Separator />
                </>
              )}

              <DetailSection title="Student">
                <Detail label="Date of birth" value={formatDate(request.date_of_birth)} />
                <Detail label="Blood group" value={request.blood_group} />
                <Detail label="Nationality" value={request.nationality} />
                <Detail label="Previous school" value={request.previous_school} />
                <Detail label="Class completed" value={request.previous_class} />
                <Detail label="Syllabus" value={request.syllabus} />
                <Detail label="Medium" value={request.medium} />
              </DetailSection>

              <Separator />

              <section>
                <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Parents and guardians
                </h4>
                <div className="space-y-2">
                  {request.parents.map((parent, index) => (
                    <div
                      key={`${parent.full_name}-${index}`}
                      className="rounded-xl border border-border p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{parent.full_name}</span>
                        <Badge tone="outline" size="sm">
                          {RELATION_LABEL[parent.relation] ?? parent.relation}
                        </Badge>
                        {parent.is_primary && (
                          <Badge tone="primary" size="sm">
                            Primary contact
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {parent.phone && (
                          <a className="inline-flex items-center gap-1 hover:text-foreground" href={`tel:${parent.phone}`}>
                            <Phone className="size-3" />
                            {parent.phone}
                          </a>
                        )}
                        {parent.email && (
                          <a className="inline-flex items-center gap-1 hover:text-foreground" href={`mailto:${parent.email}`}>
                            <Mail className="size-3" />
                            {parent.email}
                          </a>
                        )}
                        {parent.occupation && <span>{parent.occupation}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <Separator />

              <DetailSection title="Address and other details">
                <div className="sm:col-span-2">
                  <Detail label="Address" value={address} />
                </div>
                <Detail label="Sibling here" value={request.sibling_name} />
                <Detail label="Transport" value={request.transport_required ? 'Required' : 'Not needed'} />
                <Detail label="How they heard of us" value={request.how_heard} />
                <Detail label="Submitted" value={formatDateTime(request.submitted_at)} />
                <div className="sm:col-span-2">
                  <Detail label="Medical or support needs" value={request.medical_notes} />
                </div>
                <div className="sm:col-span-2">
                  <Detail label="Message from the family" value={request.message} />
                </div>
              </DetailSection>

              <Separator />

              <section className="space-y-3">
                <h4 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Office notes
                </h4>
                {request.internal_notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {request.internal_notes.map((n, index) => (
                      <li key={`${n.at}-${index}`} className="rounded-xl bg-muted/40 p-3 text-sm">
                        <p>{n.body}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {n.author_name ?? 'Someone'} · {formatRelative(n.at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-start gap-2">
                  <Textarea
                    rows={2}
                    value={note}
                    placeholder="Called the father; documents to follow…"
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<MessageSquareText />}
                    disabled={!note.trim()}
                    loading={addNote.isPending}
                    onClick={submitNote}
                  >
                    Add
                  </Button>
                </div>
              </section>

              <Separator />

              <section>
                <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  History
                </h4>
                <ol className="space-y-2 text-sm">
                  {[...request.history].reverse().map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className="flex items-start gap-3">
                      <RequestStatusBadge status={String(entry.status ?? '')} />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(entry.at)}
                          {entry.by_name ? ` · ${entry.by_name}` : ''}
                        </p>
                        {entry.note && <p className="mt-0.5">{entry.note}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </SheetBody>

        {request && (
          <SheetFooter className="flex-wrap gap-2">
            {/* The next step is the one solid button; the rest stay outlined. */}
            {steps.map((key) => (
              <Button
                key={key}
                variant={key === next ? (key === 'admit' ? 'success' : 'solid') : 'outline'}
                icon={STEP_ICON[key]}
                loading={key === 'checkPayment' && checkingId === request.id}
                onClick={() => runStep(actions, key, request)}
              >
                {stepLabel(key, request)}
              </Button>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" icon={<MoreHorizontal />} aria-label="More actions">
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {housekeeping.map((key) => (
                  <DropdownMenuItem key={key} onSelect={() => runHousekeeping(actions, key, request)}>
                    {HOUSEKEEPING[key].icon}
                    {key === 'review' ? 'Mark under review' : HOUSEKEEPING[key].label}
                  </DropdownMenuItem>
                ))}
                {housekeeping.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem destructive onSelect={() => actions.onDelete(request)}>
                  <Trash2 />
                  Delete request
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ==================================================================== page

const FILTERS: Filter[] = ['ACTION', 'PROGRESS', 'WAITLISTED', 'ADMITTED', 'REJECTED', 'ALL']

const FILTER_LABEL: Record<Filter, string> = {
  ACTION: 'Needs action',
  PROGRESS: 'In progress',
  WAITLISTED: 'Waitlisted',
  ADMITTED: 'Admitted',
  REJECTED: 'Declined',
  ALL: 'All',
}

/** Which statuses each chip shows. ALL is every row, whatever its status. */
const FILTER_STATUSES: Record<Exclude<Filter, 'ALL'>, AdmissionRequestStatus[]> = {
  ACTION: ACTION_REQUEST_STATUSES,
  PROGRESS: IN_PROGRESS_REQUEST_STATUSES,
  WAITLISTED: ['WAITLISTED'],
  ADMITTED: ['ADMITTED'],
  REJECTED: ['REJECTED'],
}

const EMPTY_COPY: Record<Filter, { title: string; description: string }> = {
  ACTION: {
    title: 'Nothing waiting on you',
    description:
      'New applications, documents to verify, payments to verify and families ready to admit appear here.',
  },
  PROGRESS: {
    title: 'Nothing in progress',
    description: 'Applications waiting on the family — documents or a payment — appear here.',
  },
  WAITLISTED: { title: 'The waiting list is empty', description: 'Waitlisted families appear here until a seat opens.' },
  ADMITTED: { title: 'No admissions from the website yet', description: 'Requests you admit stay here with the student they became.' },
  REJECTED: { title: 'Nothing declined', description: 'Declined requests are kept here and can be reopened.' },
  ALL: {
    title: 'No admission requests yet',
    description: 'Applications sent from the admission form on the school website will appear here.',
  },
}

/** The queue for one board; the school route renders it with LMS. */
export function AdmissionRequestsBoard({ board }: { board: Program }) {
  const requests = useAdmissionRequests(board)
  // Loaded with the page so the payment dialog opens already knowing whether
  // a gateway is available and which currency to default to.
  const config = useAdmissionPipelineConfig(board)
  const setStatus = useSetAdmissionRequestStatus()
  const checkPayment = useCheckAdmissionPayment()
  const remove = useDeleteAdmissionRequest()

  const [filter, setFilter] = React.useState<Filter>('ACTION')
  const [viewingId, setViewingId] = React.useState<number | null>(null)
  const [admitting, setAdmitting] = React.useState<AdmissionRequestOut | null>(null)
  const [askingDocuments, setAskingDocuments] = React.useState<AdmissionRequestOut | null>(null)
  const [reviewingDocuments, setReviewingDocuments] = React.useState<AdmissionRequestOut | null>(null)
  const [askingPayment, setAskingPayment] = React.useState<AdmissionRequestOut | null>(null)
  const [verifyingPayment, setVerifyingPayment] = React.useState<AdmissionRequestOut | null>(null)
  const [deciding, setDeciding] = React.useState<{
    request: AdmissionRequestOut
    decision: 'WAITLISTED' | 'REJECTED'
  } | null>(null)
  const [deleting, setDeleting] = React.useState<AdmissionRequestOut | null>(null)

  const rows = React.useMemo(() => requests.data ?? [], [requests.data])
  // Resolved from the list rather than held, so the sheet reflects a status
  // change or a new note the moment the list refetches.
  const viewing = React.useMemo(
    () => rows.find((r) => r.id === viewingId) ?? null,
    [rows, viewingId],
  )

  const counts = React.useMemo(() => {
    const by = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, 0])) as Record<
      AdmissionRequestStatus,
      number
    >
    for (const row of rows) by[row.status] = (by[row.status] ?? 0) + 1
    const sum = (statuses: AdmissionRequestStatus[]) => statuses.reduce((n, s) => n + (by[s] ?? 0), 0)
    return {
      ACTION: sum(FILTER_STATUSES.ACTION),
      PROGRESS: sum(FILTER_STATUSES.PROGRESS),
      WAITLISTED: by.WAITLISTED,
      ADMITTED: by.ADMITTED,
      REJECTED: by.REJECTED,
      ALL: rows.length,
      NEW: by.NEW,
    }
  }, [rows])

  const filtered = React.useMemo(() => {
    if (filter === 'ALL') return rows
    const statuses = FILTER_STATUSES[filter]
    return rows.filter((r) => statuses.includes(r.status))
  }, [rows, filter])

  const actions: Actions = React.useMemo(
    () => ({
      onReview: (r) => setStatus.mutate({ requestId: r.id, body: { status: 'UNDER_REVIEW' } }),
      onReopen: (r) => setStatus.mutate({ requestId: r.id, body: { status: 'NEW' } }),
      onRequestDocuments: (r) => setAskingDocuments(r),
      onReviewDocuments: (r) => setReviewingDocuments(r),
      onRequestPayment: (r) => setAskingPayment(r),
      onCheckPayment: (r) => checkPayment.mutate(r.id),
      onVerifyPayment: (r) => setVerifyingPayment(r),
      onAdmit: (r) => setAdmitting(r),
      onWaitlist: (r) => setDeciding({ request: r, decision: 'WAITLISTED' }),
      onReject: (r) => setDeciding({ request: r, decision: 'REJECTED' }),
      onDelete: (r) => setDeleting(r),
    }),
    // `mutate` is stable across renders; depending on the mutation objects
    // would rebuild every column whenever one of them changed state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setStatus.mutate, checkPayment.mutate],
  )

  const checkingId = checkPayment.isPending ? (checkPayment.variables ?? null) : null

  const columns = React.useMemo<ColumnDef<AdmissionRequestOut, unknown>[]>(
    () => [
      {
        id: 'student',
        header: 'Applicant',
        accessorFn: (row) => row.student_full_name,
        cell: ({ row }) => {
          const age = ageOn(row.original.date_of_birth)
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar name={row.original.student_full_name} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.original.student_full_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.original.reference}
                  {age != null ? ` · ${age} yrs` : ''}
                  {row.original.previous_school ? ` · from ${row.original.previous_school}` : ''}
                </p>
              </div>
            </div>
          )
        },
      },
      {
        id: 'class',
        header: 'Applied for',
        accessorFn: (row) => row.class_name ?? '',
        cell: ({ row }) => (
          <div className="text-sm">
            <p>{row.original.class_name ?? '—'}</p>
            {row.original.academic_year_name && (
              <p className="text-xs text-muted-foreground">{row.original.academic_year_name}</p>
            )}
          </div>
        ),
      },
      {
        id: 'contact',
        header: 'Contact',
        accessorFn: (row) => row.contact_name ?? '',
        cell: ({ row }) => {
          const parent = primaryParent(row.original)
          return (
            <div className="min-w-0 text-sm">
              <p className="truncate">
                {row.original.contact_name}
                {parent && (
                  <span className="text-xs text-muted-foreground">
                    {' '}
                    · {RELATION_LABEL[parent.relation] ?? parent.relation}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {row.original.contact_phone}
                {row.original.contact_email ? ` · ${row.original.contact_email}` : ''}
              </p>
            </div>
          )
        },
      },
      {
        id: 'submitted',
        header: 'Submitted',
        accessorFn: (row) => row.submitted_at ?? '',
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm text-muted-foreground">
                {formatRelative(row.original.submitted_at)}
              </span>
            </TooltipTrigger>
            <TooltipContent>{formatDateTime(row.original.submitted_at)}</TooltipContent>
          </Tooltip>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) => row.status,
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <RequestStatusBadge status={row.original.status} />
            {row.original.internal_notes.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge tone="neutral" size="sm">
                    <MessageSquareText />
                    {row.original.internal_notes.length}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{countLabel(row.original.internal_notes.length, 'office note')}</TooltipContent>
              </Tooltip>
            )}
          </div>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const request = row.original
          const steps = availableSteps(request)
          const next = nextStep(request)
          const housekeeping = HOUSEKEEPING_ORDER.filter((key) => CAN[key](request))
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${request.student_full_name}`}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setViewingId(request.id)}>
                    <Eye />
                    View details
                  </DropdownMenuItem>
                  {steps.length > 0 && <DropdownMenuSeparator />}
                  {steps.map((key) => (
                    <DropdownMenuItem
                      key={key}
                      className={key === next ? 'font-semibold' : undefined}
                      onSelect={() => runStep(actions, key, request)}
                    >
                      {STEP_ICON[key]}
                      {stepLabel(key, request)}
                    </DropdownMenuItem>
                  ))}
                  {housekeeping.length > 0 && <DropdownMenuSeparator />}
                  {housekeeping.map((key) => (
                    <DropdownMenuItem key={key} onSelect={() => runHousekeeping(actions, key, request)}>
                      {HOUSEKEEPING[key].icon}
                      {HOUSEKEEPING[key].label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => actions.onDelete(request)}>
                    <Trash2 />
                    Delete request
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ],
    [actions],
  )

  const filterOptions = FILTERS.map((value) => ({
    value,
    label: (
      <>
        {FILTER_LABEL[value]}
        <span className="ml-1 text-xs text-muted-foreground">{counts[value]}</span>
      </>
    ),
  }))

  return (
    <>
      <PageHeader
        title="Admission Requests"
        description="Applications sent from the admission form on the school website. Select applicants, collect and verify their documents and admission fee, then admit the student in one step."
        actions={
          <Button
            variant="outline"
            icon={<RefreshCw />}
            loading={requests.isFetching && !requests.isPending}
            onClick={() => requests.refetch()}
          >
            Refresh
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">
            <Inbox />
            {countLabel(counts.ACTION, 'needs', 'need')} action
          </Badge>
          {counts.NEW > 0 && <Badge tone="primary">{countLabel(counts.NEW, 'new request')}</Badge>}
          <Badge tone="info">{counts.PROGRESS} in progress</Badge>
          <Badge tone="warning">{countLabel(counts.WAITLISTED, 'waitlisted')}</Badge>
          <Badge tone="success">{countLabel(counts.ADMITTED, 'admitted')}</Badge>
          <Badge tone="neutral">{counts.ALL} total</Badge>
        </div>
      </PageHeader>

      <div className="mb-4 overflow-x-auto pb-1">
        <Segmented
          layoutId="admission-request-filter"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={filterOptions}
          aria-label="Filter by status"
        />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={requests.isPending}
        error={requests.error}
        onRetry={() => requests.refetch()}
        getRowId={(row) => String(row.id)}
        onRowClick={(row) => setViewingId(row.id)}
        initialSorting={[{ id: 'submitted', desc: true }]}
        searchPlaceholder="Search student, reference, parent, phone or email…"
        searchValues={(row) => [
          row.student_full_name,
          row.reference,
          row.contact_name,
          row.contact_phone,
          row.contact_email,
          row.class_name,
          row.previous_school,
          ...row.parents.flatMap((p) => [p.full_name, p.phone, p.email]),
        ]}
        searchParamKey="q"
        emptyState={
          <EmptyState
            icon={<UserRoundPlus />}
            title={EMPTY_COPY[filter].title}
            description={EMPTY_COPY[filter].description}
            action={
              filter !== 'ALL' && counts.ALL > 0 ? (
                <Button variant="outline" onClick={() => setFilter('ALL')}>
                  Show all requests
                </Button>
              ) : undefined
            }
          />
        }
        csv={{
          filename: 'admission-requests',
          columns: [
            { header: 'Reference', value: (r) => r.reference },
            { header: 'Student', value: (r) => r.student_full_name },
            { header: 'Date of birth', value: (r) => r.date_of_birth ?? '' },
            { header: 'Class applied', value: (r) => r.class_name ?? '' },
            { header: 'Session', value: (r) => r.academic_year_name ?? '' },
            { header: 'Contact', value: (r) => r.contact_name ?? '' },
            { header: 'Phone', value: (r) => r.contact_phone ?? '' },
            { header: 'Email', value: (r) => r.contact_email ?? '' },
            { header: 'Status', value: (r) => REQUEST_STATUS_LABEL[r.status] ?? humanise(r.status) },
            { header: 'Fee', value: (r) => (r.payment ? formatMoney(r.payment.amount, r.payment.currency) : '') },
            { header: 'Fee status', value: (r) => (r.payment ? PAYMENT_STATUS[r.payment.status]?.label ?? '' : '') },
            { header: 'Submitted', value: (r) => r.submitted_at ?? '' },
          ],
        }}
      />

      <RequestDetailSheet
        request={viewing}
        onClose={() => setViewingId(null)}
        actions={actions}
        checkingId={checkingId}
      />

      <AdmitDialog request={admitting} onClose={() => setAdmitting(null)} board={board} />

      <RequestDocumentsDialog
        request={askingDocuments}
        onClose={() => setAskingDocuments(null)}
        config={config.data}
      />

      <ReviewDocumentsDialog
        request={reviewingDocuments}
        onClose={() => setReviewingDocuments(null)}
        config={config.data}
      />

      <RequestPaymentDialog
        request={askingPayment}
        onClose={() => setAskingPayment(null)}
        config={config.data}
        board={board}
      />

      <VerifyPaymentDialog
        request={verifyingPayment}
        onClose={() => setVerifyingPayment(null)}
        config={config.data}
      />

      <DecisionDialog
        request={deciding?.request ?? null}
        decision={deciding?.decision ?? null}
        onClose={() => setDeciding(null)}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete the request from ${deleting?.student_full_name ?? 'this family'}?`}
        description={
          deleting?.status === 'ADMITTED'
            ? 'The student account created from it stays. Only the application record and its notes are removed.'
            : 'The application and its notes are removed for good. Declining keeps a record instead.'
        }
        confirmLabel="Delete request"
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await remove.mutateAsync(deleting.id)
            if (viewingId === deleting.id) setViewingId(null)
            setDeleting(null)
          } catch {
            /* toasted by the mutation cache */
          }
        }}
      />
    </>
  )
}

/** The school's route. */
export default function AdminAdmissionRequestsPage() {
  return <AdmissionRequestsBoard board="LMS" />
}

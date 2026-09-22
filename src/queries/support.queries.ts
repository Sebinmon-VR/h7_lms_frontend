import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { meApi, supportAdminApi, supportApi } from '@/api/support.api'
import type {
  Program,
  SupportContactUpdate,
  TicketCategory,
  TicketCreate,
  TicketRating,
  TicketReply,
  TicketStatus,
  TicketUpdate,
} from '@/api/types'
import { STALE, qk } from './keys'

// ------------------------------------------------------------------ reads

/**
 * Tickets. Non-staff see only their own whatever the filters say — the scoping
 * is server-side, so `mineOnly` is a convenience for staff rather than a
 * privacy control, and a reporter cannot widen it.
 */
export function useTickets(
  params: {
    status?: TicketStatus
    program?: Program
    category?: TicketCategory
    assignedTo?: number
    mineOnly?: boolean
  } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: qk.support.tickets(params.status, params.category, params.mineOnly ?? false),
    queryFn: () => supportApi.listTickets(params),
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useTicket(ticketId: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.support.ticket(ticketId ?? 0),
    queryFn: () => supportApi.getTicket(ticketId as number),
    staleTime: STALE.transactional,
    enabled: enabled && ticketId != null,
  })
}

/**
 * Phone, WhatsApp, email and hours for one product.
 *
 * Read this BEFORE rendering a "raise a ticket" control: `tickets_enabled` can
 * be false per product, in which case creating one is a 403 and the page
 * should offer the phone and email only.
 */
export function useSupportContact(program: Program = 'LMS', enabled = true) {
  return useQuery({
    queryKey: qk.support.contact(program),
    queryFn: () => supportApi.contact(program),
    staleTime: STALE.reference,
    enabled,
  })
}

export function useSupportQueue(program?: Program, enabled = true) {
  return useQuery({
    queryKey: qk.support.queue(program),
    queryFn: () => supportAdminApi.queue(program),
    staleTime: STALE.transactional,
    enabled,
  })
}

/**
 * Which products this account may use — the school / tuition dropdown.
 *
 * Reference-cached: it is a read of one's own profile and changes only when an
 * administrator grants a programme, at which point the user is signed in
 * somewhere else anyway.
 */
export function useMyPrograms(enabled = true) {
  return useQuery({
    queryKey: qk.support.myPrograms(),
    queryFn: meApi.programs,
    staleTime: STALE.reference,
    enabled,
  })
}

// -------------------------------------------------------------- mutations

function invalidateTickets(qc: QueryClient, ticketId?: number) {
  void qc.invalidateQueries({ queryKey: qk.support.ticketsRoot() })
  void qc.invalidateQueries({ queryKey: qk.support.queueRoot() })
  if (ticketId) void qc.invalidateQueries({ queryKey: qk.support.ticket(ticketId) })
}

/**
 * 403 when tickets are disabled for the product. No toast: the page has
 * already read `tickets_enabled` and should not have offered the control, so
 * if it fires the caller shows it inline rather than as a surprise.
 */
export function useRaiseTicket() {
  const qc = useQueryClient()
  return useMutation({
    // Reported in place by the caller, not as a toast.
    meta: { silent: true },
    mutationFn: (body: TicketCreate) => supportApi.create(body),
    onSuccess: (ticket) => {
      invalidateTickets(qc)
      toast.success(`Ticket #${ticket.id} raised`, {
        description: 'You will get a reply in this thread.',
      })
    },
  })
}

/**
 * `is_internal` is the field to be careful with: a true reply is a staff note
 * the reporter never sees. The success message says which kind was posted,
 * because the thread itself is the only other place that distinction shows.
 */
export function useReplyToTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ticketId, body }: { ticketId: number; body: TicketReply }) =>
      supportApi.reply(ticketId, body),
    onSuccess: (ticket, { body }) => {
      invalidateTickets(qc, ticket.id)
      toast.success(body.is_internal ? 'Internal note added' : 'Reply sent', {
        description: body.is_internal ? 'The person who raised this cannot see it.' : undefined,
      })
    },
  })
}

/** Staff only. */
export function useUpdateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ticketId, body }: { ticketId: number; body: TicketUpdate }) =>
      supportApi.update(ticketId, body),
    onSuccess: (ticket) => {
      invalidateTickets(qc, ticket.id)
      toast.success('Ticket updated')
    },
  })
}

export function useRateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ticketId, body }: { ticketId: number; body: TicketRating }) =>
      supportApi.rate(ticketId, body),
    onSuccess: (ticket) => {
      invalidateTickets(qc, ticket.id)
      toast.success('Thank you for the feedback')
    },
  })
}

export function useUpdateSupportContact(program: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SupportContactUpdate) => supportAdminApi.updateContact(body, program),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.support.contactRoot() })
      toast.success('Support contact details saved')
    },
  })
}

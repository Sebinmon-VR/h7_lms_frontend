import { cleanParams, get, post, put } from './client'
import type {
  MyProgramsOut,
  Program,
  SupportContactOut,
  SupportContactUpdate,
  SupportQueueSummary,
  TicketCategory,
  TicketCreate,
  TicketOut,
  TicketRating,
  TicketReply,
  TicketStatus,
  TicketUpdate,
} from './types'

/**
 * Support, in two halves: a THREADED ticket (not live chat, so no socket) and
 * the contact details to ring instead.
 *
 * `tickets_enabled` can be false per product, in which case `create` answers
 * 403 and the page should show the phone and email only. Read it from
 * `contact` before rendering the "raise a ticket" control.
 */
export const supportApi = {
  /**
   * Non-staff see only their own tickets whatever the filters say — the
   * scoping is server-side, so `mineOnly` is a convenience for staff rather
   * than a privacy control.
   */
  listTickets: (
    params: {
      status?: TicketStatus
      program?: Program
      category?: TicketCategory
      /** Staff only. */
      assignedTo?: number
      mineOnly?: boolean
    } = {},
  ) =>
    get<TicketOut[]>('/support/tickets', {
      params: cleanParams({
        status: params.status,
        program: params.program,
        category: params.category,
        assigned_to: params.assignedTo,
        mine_only: params.mineOnly,
      }),
    }),

  getTicket: (ticketId: number) => get<TicketOut>(`/support/tickets/${ticketId}`),

  create: (body: TicketCreate) => post<TicketOut>('/support/tickets', body),

  /**
   * Adds to the thread and returns the whole ticket back.
   *
   * `is_internal: true` from staff is a note the REPORTER NEVER SEES. Mark
   * those unmistakably in the staff view, or somebody writes a private note
   * into the public thread. The flag is ignored for non-staff, so a reporter
   * cannot set it.
   */
  reply: (ticketId: number, body: TicketReply) =>
    post<TicketOut>(`/support/tickets/${ticketId}/reply`, body),

  /** Staff only — status, priority, category, assignment and resolution note. */
  update: (ticketId: number, body: TicketUpdate) =>
    put<TicketOut>(`/support/tickets/${ticketId}`, body),

  /** 1–5, after resolution. */
  rate: (ticketId: number, body: TicketRating) =>
    post<TicketOut>(`/support/tickets/${ticketId}/rate`, body),

  /** Phone, WhatsApp, email and hours — per product, and readable by anyone. */
  contact: (program: Program = 'LMS') =>
    get<SupportContactOut>('/support/contact', { params: { program } }),
}

export const supportAdminApi = {
  updateContact: (body: SupportContactUpdate, program: Program = 'LMS') =>
    put<SupportContactOut>('/admin/support/contact', body, { params: { program } }),

  /**
   * The dashboard counts. `awaiting_first_response` and `unassigned` are the
   * two worth surfacing — a ticket nobody has answered and a ticket nobody
   * owns are the failures a queue exists to reveal.
   */
  queue: (program?: Program) =>
    get<SupportQueueSummary>('/admin/support/queue', {
      params: cleanParams({ program }),
    }),
}

export const meApi = {
  /**
   * The product switcher.
   *
   * A read of your own profile, NOT a permission grant — selecting a product
   * gives nobody access, because every tuition endpoint checks `programs`
   * independently. Hide the control when `show_switcher` is false rather than
   * rendering a dropdown with one entry. Admins always get both.
   */
  programs: () => get<MyProgramsOut>('/me/programs'),
}

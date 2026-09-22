import {
  Clock,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Send,
  Star,
  Ticket,
} from 'lucide-react'
import * as React from 'react'

import type {
  SupportContactOut,
  TicketCategory,
  TicketOut,
  TicketPriority,
  TicketStatus,
} from '@/api/types'
import {
  useRaiseTicket,
  useRateTicket,
  useReplyToTicket,
  useSupportContact,
  useSupportQueue,
  useTicket,
  useTickets,
  useUpdateTicket,
} from '@/queries/support.queries'
import { useAuth } from '@/providers/auth-provider'
import { formatRelative } from '@/lib/datetime'
import { isTeachingOrAdmin } from '@/lib/constants'
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABEL,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABEL,
  TICKET_PRIORITY_TONE,
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_TONE,
} from '@/lib/school'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Segmented } from '@/components/ui/segmented'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Field, FormError } from '@/components/forms/field'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * Support — a threaded ticket, and the phone number to ring instead.
 *
 * Threaded rather than live chat, so there is no socket and no presence: a
 * reply is a request, and the thread is refetched.
 *
 * Two things the UI has to get right or it causes the harm it exists to
 * prevent:
 *
 *  - `tickets_enabled` can be FALSE per product, in which case raising one is
 *    a 403. The contact details are read first and the "raise a ticket" control
 *    is simply not rendered when it is off;
 *  - an `is_internal` reply is a staff note the REPORTER NEVER SEES. It is
 *    marked unmistakably in the thread and the composer says so while it is on,
 *    because writing a private note into a public thread is unrecoverable.
 */

function ContactCard({ contact }: { contact: SupportContactOut }) {
  const rows = [
    { icon: Phone, label: 'Phone', value: contact.phone, href: `tel:${contact.phone}` },
    {
      icon: Phone,
      label: 'Alternate',
      value: contact.alternate_phone,
      href: `tel:${contact.alternate_phone}`,
    },
    {
      icon: MessageSquare,
      label: 'WhatsApp',
      value: contact.whatsapp,
      href: `https://wa.me/${(contact.whatsapp ?? '').replace(/\D/g, '')}`,
    },
    { icon: Mail, label: 'Email', value: contact.email, href: `mailto:${contact.email}` },
  ].filter((row) => !!row.value)

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold">Get in touch</h3>

      {rows.length === 0 && !contact.hours ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No contact details have been published yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center gap-2 text-sm">
              <row.icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">{row.label}</span>
              <a className="truncate font-medium hover:underline" href={row.href}>
                {row.value}
              </a>
            </li>
          ))}
          {contact.hours && (
            <li className="flex items-center gap-2 text-sm">
              <Clock className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">Hours</span>
              <span className="font-medium">{contact.hours}</span>
            </li>
          )}
        </ul>
      )}

      {contact.notes && (
        <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
          {contact.notes}
        </p>
      )}
    </Card>
  )
}

function RaiseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const raise = useRaiseTicket()
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [category, setCategory] = React.useState<TicketCategory>('OTHER')
  const [priority, setPriority] = React.useState<TicketPriority>('NORMAL')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setSubject('')
    setBody('')
    setCategory('OTHER')
    setPriority('NORMAL')
    setError(null)
  }, [open])

  const submit = async () => {
    if (!subject.trim()) return setError('Give it a one-line subject.')
    if (!body.trim()) return setError('Describe what is happening.')
    setError(null)
    try {
      await raise.mutateAsync({
        subject: subject.trim(),
        body: body.trim(),
        category,
        priority,
      })
      onOpenChange(false)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not raise the ticket.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raise a ticket</DialogTitle>
          <DialogDescription>
            Replies come back in this thread — you will see them here rather than by email.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />

          <Field id="ticket_subject" label="Subject" required>
            <Input
              id="ticket_subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Cannot join my live class"
            />
          </Field>

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field id="ticket_category" label="What is it about">
              <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)}>
                <SelectTrigger id="ticket_category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {TICKET_CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="ticket_priority" label="How urgent">
              <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                <SelectTrigger id="ticket_priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {TICKET_PRIORITY_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field id="ticket_body" label="What is happening" required>
            <Textarea
              id="ticket_body"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={raise.isPending}>
            Raise ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TicketThread({ ticketId, onClose }: { ticketId: number | null; onClose: () => void }) {
  const { role, user } = useAuth()
  const isStaff = isTeachingOrAdmin(role)
  const ticket = useTicket(ticketId)
  const reply = useReplyToTicket()
  const update = useUpdateTicket()
  const rate = useRateTicket()

  const [message, setMessage] = React.useState('')
  const [internal, setInternal] = React.useState(false)

  React.useEffect(() => {
    setMessage('')
    setInternal(false)
  }, [ticketId])

  const send = async () => {
    if (!ticketId || !message.trim()) return
    await reply.mutateAsync({
      ticketId,
      body: { body: message.trim(), is_internal: isStaff && internal },
    })
    setMessage('')
    setInternal(false)
  }

  return (
    <Sheet open={ticketId != null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{ticket.data?.subject ?? 'Ticket'}</SheetTitle>
        </SheetHeader>
        <SheetBody className="space-y-5">
          <QueryBoundary query={ticket} loading={<Skeleton className="h-96 w-full rounded-xl" />}>
            {(data) => (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TICKET_STATUS_TONE[data.status]} size="sm">
                    {TICKET_STATUS_LABEL[data.status]}
                  </Badge>
                  <Badge tone={TICKET_PRIORITY_TONE[data.priority]} size="sm">
                    {TICKET_PRIORITY_LABEL[data.priority]}
                  </Badge>
                  <Badge tone="outline" size="sm">
                    {TICKET_CATEGORY_LABEL[data.category]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    #{data.id} · {data.raised_by_name}
                  </span>
                </div>

                {isStaff && (
                  <Card className="grid gap-3 p-4 sm:grid-cols-2">
                    <Field id="ticket_set_status" label="Status">
                      <Select
                        value={data.status}
                        onValueChange={(v) =>
                          update.mutate({ ticketId: data.id, body: { status: v as TicketStatus } })
                        }
                      >
                        <SelectTrigger id="ticket_set_status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TICKET_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {TICKET_STATUS_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field id="ticket_set_priority" label="Priority">
                      <Select
                        value={data.priority}
                        onValueChange={(v) =>
                          update.mutate({
                            ticketId: data.id,
                            body: { priority: v as TicketPriority },
                          })
                        }
                      >
                        <SelectTrigger id="ticket_set_priority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TICKET_PRIORITIES.map((p) => (
                            <SelectItem key={p} value={p}>
                              {TICKET_PRIORITY_LABEL[p]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </Card>
                )}

                <ul className="space-y-3">
                  {data.messages.map((msg, i) => (
                    <li
                      key={i}
                      className={
                        msg.is_internal
                          ? 'rounded-lg border border-warning/40 bg-warning/8 p-3'
                          : 'rounded-lg border border-border p-3'
                      }
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {msg.author_name ?? 'Someone'}
                        </span>
                        {msg.author_role && (
                          <span className="text-xs text-muted-foreground">{msg.author_role}</span>
                        )}
                        {/* Unmissable, because the whole point is that the
                            reporter cannot see this one. */}
                        {msg.is_internal && (
                          <Badge tone="warning" size="sm">
                            <Lock />
                            Internal — not shown to {data.raised_by_name ?? 'the reporter'}
                          </Badge>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {formatRelative(msg.sent_at)}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{msg.body}</p>
                    </li>
                  ))}
                </ul>

                {data.status !== 'CLOSED' && (
                  <div className="space-y-3 rounded-lg border border-border p-3">
                    <Textarea
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Write a reply…"
                    />

                    {isStaff && (
                      <label className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="text-xs font-medium">Internal note</span>
                          <span className="mt-0.5 block text-2xs text-muted-foreground">
                            {internal
                              ? `${data.raised_by_name ?? 'The reporter'} will NOT see this.`
                              : 'Visible to whoever raised the ticket.'}
                          </span>
                        </span>
                        <Switch checked={internal} onCheckedChange={setInternal} />
                      </label>
                    )}

                    <Button
                      size="sm"
                      onClick={send}
                      loading={reply.isPending}
                      disabled={!message.trim()}
                    >
                      <Send />
                      {internal ? 'Add internal note' : 'Send reply'}
                    </Button>
                  </div>
                )}

                {/* Rating is the reporter's, and only once it is resolved. */}
                {data.raised_by === user?.id &&
                  (data.status === 'RESOLVED' || data.status === 'CLOSED') &&
                  data.satisfaction_rating == null && (
                    <Card className="p-4">
                      <p className="text-sm font-medium">Was this sorted out?</p>
                      <div className="mt-2 flex gap-1">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <Button
                            key={value}
                            variant="outline"
                            size="icon-sm"
                            onClick={() =>
                              rate.mutate({ ticketId: data.id, body: { rating: value } })
                            }
                          >
                            <Star />
                          </Button>
                        ))}
                      </div>
                    </Card>
                  )}
              </>
            )}
          </QueryBoundary>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

function TicketRow({ ticket, onOpen }: { ticket: TicketOut; onOpen: () => void }) {
  return (
    <Card interactive onClick={onOpen} className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{ticket.subject}</h3>
            <Badge tone={TICKET_STATUS_TONE[ticket.status]} size="sm">
              {TICKET_STATUS_LABEL[ticket.status]}
            </Badge>
            {ticket.priority !== 'NORMAL' && (
              <Badge tone={TICKET_PRIORITY_TONE[ticket.priority]} size="sm">
                {TICKET_PRIORITY_LABEL[ticket.priority]}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            #{ticket.id} · {ticket.raised_by_name} · {TICKET_CATEGORY_LABEL[ticket.category]} ·{' '}
            {formatRelative(ticket.created_at)}
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {ticket.message_count} {ticket.message_count === 1 ? 'message' : 'messages'}
        </span>
      </div>
    </Card>
  )
}

export default function SupportPage() {
  const { role } = useAuth()
  const isAdmin = role === 'ADMIN'
  const contact = useSupportContact()
  const queue = useSupportQueue(undefined, isAdmin)

  const [status, setStatus] = React.useState<'ALL' | TicketStatus>('ALL')
  const tickets = useTickets({ status: status === 'ALL' ? undefined : status })

  const [raiseOpen, setRaiseOpen] = React.useState(false)
  const [openTicket, setOpenTicket] = React.useState<number | null>(null)

  // Read before the control is rendered: creating one when this is off is a
  // 403, and offering a button that always fails is worse than not offering it.
  const ticketsEnabled = contact.data?.tickets_enabled ?? true

  return (
    <div>
      <PageHeader
        title="Help & support"
        description={
          isAdmin
            ? 'The ticket queue, and the contact details people are given.'
            : 'Raise a ticket, or find who to call.'
        }
        actions={
          ticketsEnabled ? (
            <Button onClick={() => setRaiseOpen(true)}>
              <Plus />
              Raise a ticket
            </Button>
          ) : undefined
        }
      />

      {isAdmin && queue.data && (
        <div className="mb-5 grid gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Open</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{queue.data.active}</p>
          </Card>
          {/* The two the queue exists to surface. */}
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Nobody has answered</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-warning">
              {queue.data.awaiting_first_response}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Nobody owns</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-warning">
              {queue.data.unassigned}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Urgent</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-danger">
              {queue.data.urgent}
            </p>
          </Card>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Segmented
            layoutId="ticket-status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'OPEN', label: 'Open' },
              { value: 'IN_PROGRESS', label: 'In progress' },
              { value: 'RESOLVED', label: 'Resolved' },
            ]}
          />

          <QueryBoundary
            query={tickets}
            loading={
              <div className="space-y-3">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-xl" />
                ))}
              </div>
            }
            isEmpty={(rows) => rows.length === 0}
            empty={
              <EmptyState
                icon={<Ticket />}
                title="No tickets"
                description={
                  ticketsEnabled
                    ? 'Raise one and it comes back as a thread you can follow here.'
                    : 'Tickets are turned off for this product — use the contact details instead.'
                }
                action={
                  ticketsEnabled ? (
                    <Button onClick={() => setRaiseOpen(true)}>
                      <Plus />
                      Raise a ticket
                    </Button>
                  ) : undefined
                }
              />
            }
          >
            {(rows) => (
              <div className="space-y-3">
                {rows.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    onOpen={() => setOpenTicket(ticket.id)}
                  />
                ))}
              </div>
            )}
          </QueryBoundary>
        </div>

        <div>
          <QueryBoundary
            query={contact}
            loading={<Skeleton className="h-48 w-full rounded-xl" />}
          >
            {(data) => <ContactCard contact={data} />}
          </QueryBoundary>
        </div>
      </div>

      <RaiseDialog open={raiseOpen} onOpenChange={setRaiseOpen} />
      <TicketThread ticketId={openTicket} onClose={() => setOpenTicket(null)} />
    </div>
  )
}

import { ArrowRight, BookOpen, Clock, Lock, Mail, MessageSquare, Phone, Plus, Send, Star } from 'lucide-react'
import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import type { SupportContactOut, TicketCategory, TicketOut, TicketPriority, TicketStatus } from '@/api/types'
import {
  useRaiseTicket,
  useRateTicket,
  useReplyToTicket,
  useSupportContact,
  useTicket,
  useTickets,
  useUpdateTicket,
} from '@/queries/support.queries'
import { useAuth } from '@/providers/auth-provider'
import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/datetime'
import {
  ACTIVE_TICKET_STATUSES,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABEL,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABEL,
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_TONE,
} from '@/lib/school'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FormError } from '@/components/forms/field'
import { ErrorState } from '@/components/feedback/states'
import { Band, WorkspaceHeader, type Tone } from '@/components/layout/workspace'
import { DetailHeader, DetailSection, ListEmpty, ListItem, ListPane, ListSearch, SplitView } from '@/components/layout/split-view'

/**
 * Help & support, as a teacher sees it: who to call along the top, the tickets down the left
 * and the picked one's conversation on the right, with the reply box under it. Raising a
 * ticket opens in the same right-hand side. The same List + detail layout as the teacher's
 * Homework and Exams pages - ruled rows and plain coloured words, no cards or pill badges.
 *
 * Teachers are support staff on the server: they see the whole queue, can move a ticket's
 * status and priority, and can write internal notes the person who raised it never sees.
 * Students, parents and admins keep the page in support.tsx.
 */

type Filter = 'open' | 'mine' | 'done' | 'all'

// Keyed loosely: the ticket tones come from the badge palette, which has a few more names.
const WORD: Record<Tone, string> & Record<string, string | undefined> = {
  success: 'text-success',
  info: 'font-medium text-info',
  warning: 'font-medium text-warning',
  danger: 'font-medium text-danger',
  neutral: 'text-muted-foreground',
  primary: 'font-medium text-primary',
}

const isActive = (t: TicketOut) => ACTIVE_TICKET_STATUSES.includes(t.status)

/** "Waiting on you" is written for the person who raised it; anyone else is waiting on them. */
function statusLabel(t: { status: TicketStatus; raised_by: number }, me: number | undefined) {
  if (t.status === 'WAITING_ON_USER' && t.raised_by !== me) return 'Waiting on them'
  return TICKET_STATUS_LABEL[t.status]
}

const titleCase = (s: string | null | undefined) =>
  (s ?? '')
    .toLowerCase()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')

// ==================================================================== contact

function ContactStrip({ contact }: { contact: SupportContactOut | undefined }) {
  const rows = contact
    ? [
        { icon: Phone, label: 'Call', value: contact.phone, href: `tel:${contact.phone}` },
        { icon: Phone, label: 'Or', value: contact.alternate_phone, href: `tel:${contact.alternate_phone}` },
        {
          icon: MessageSquare,
          label: 'WhatsApp',
          value: contact.whatsapp,
          href: `https://wa.me/${(contact.whatsapp ?? '').replace(/\D/g, '')}`,
        },
        { icon: Mail, label: 'Email', value: contact.email, href: `mailto:${contact.email}` },
      ].filter((r) => !!r.value)
    : []

  return (
    <Band className="border-b border-border">
      <div className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
          {!contact ? (
            <Skeleton className="h-5 w-80" />
          ) : rows.length === 0 && !contact.hours ? (
            <span className="text-muted-foreground">No phone or email for the school office has been published yet.</span>
          ) : (
            <>
              {rows.map((r) => (
                <span key={r.label} className="inline-flex items-center gap-1.5">
                  <r.icon className="size-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">{r.label}</span>
                  <a href={r.href} className="font-medium text-foreground hover:underline" target={r.label === 'WhatsApp' ? '_blank' : undefined} rel="noreferrer">
                    {r.value}
                  </a>
                </span>
              ))}
              {contact.hours && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">{contact.hours}</span>
                </span>
              )}
            </>
          )}
        </div>
        <Link to="/guide" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <BookOpen className="size-4" />
          User Guide, step by step with videos
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
      {contact?.notes && <p className="-mt-1 pb-3 text-xs text-muted-foreground">{contact.notes}</p>}
    </Band>
  )
}

// ===================================================================== raise

function RaiseForm({ onCancel, onRaised }: { onCancel: () => void; onRaised: (t: TicketOut) => void }) {
  const raise = useRaiseTicket()
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [category, setCategory] = React.useState<TicketCategory>('OTHER')
  const [priority, setPriority] = React.useState<TicketPriority>('NORMAL')
  const [error, setError] = React.useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim()) return setError('Give it a one-line subject.')
    if (!body.trim()) return setError('Describe what is happening.')
    setError(null)
    try {
      onRaised(await raise.mutateAsync({ subject: subject.trim(), body: body.trim(), category, priority }))
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not raise the ticket.')
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DetailHeader title="Raise a ticket" sub="The school office replies here, in the ticket. You will not get an email." />
      <div className="max-w-3xl space-y-5 px-5 py-5">
        <FormError message={error} />
        <Field id="ticket_subject" label="Subject" required>
          <Input id="ticket_subject" autoFocus value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Cannot join my live class" />
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
            rows={9}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What you were doing, what you expected, and what happened instead. Which class or student, if it is about one."
          />
        </Field>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={raise.isPending}>
            Raise ticket
          </Button>
        </div>
      </div>
    </form>
  )
}

// ==================================================================== thread

function TicketDetail({ ticketId, me }: { ticketId: number; me: number | undefined }) {
  const ticket = useTicket(ticketId)
  const reply = useReplyToTicket()
  const update = useUpdateTicket()
  const rate = useRateTicket()
  const [message, setMessage] = React.useState('')
  const [internal, setInternal] = React.useState(false)

  if (ticket.isPending) {
    return (
      <div className="space-y-3 p-5">
        <Skeleton className="h-10 w-72 rounded" />
        <Skeleton className="h-24 rounded" />
        <Skeleton className="h-40 rounded" />
      </div>
    )
  }
  if (ticket.isError || !ticket.data) {
    return (
      <div className="p-5">
        <ErrorState error={ticket.error} onRetry={() => ticket.refetch()} />
      </div>
    )
  }

  const t = ticket.data
  const mine = t.raised_by === me
  const tone = TICKET_STATUS_TONE[t.status]
  const send = async () => {
    if (!message.trim()) return
    await reply.mutateAsync({ ticketId: t.id, body: { body: message.trim(), is_internal: !mine && internal } })
    setMessage('')
    setInternal(false)
  }

  return (
    <>
      <DetailHeader
        title={t.subject}
        badges={
          <>
            <span className={cn('text-xs', WORD[tone])}>{statusLabel(t, me)}</span>
            {(t.priority === 'HIGH' || t.priority === 'URGENT') && (
              <span className={cn('text-xs', t.priority === 'URGENT' ? WORD.danger : WORD.warning)}>{TICKET_PRIORITY_LABEL[t.priority]}</span>
            )}
          </>
        }
        sub={
          <>
            #{t.id} · raised by {mine ? 'you' : (t.raised_by_name ?? 'someone')}
            {!mine && t.raised_by_role ? ` (${titleCase(t.raised_by_role)})` : ''}
            {t.created_at ? ` · ${formatRelative(t.created_at)}` : ''}
            {t.about_student_name ? ` · about ${t.about_student_name}` : ''}
          </>
        }
      />

      {/* Staff controls, flat in one ruled row. */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-border px-5 py-3 sm:grid-cols-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</p>
          <Select value={t.status} onValueChange={(v) => update.mutate({ ticketId: t.id, body: { status: v as TicketStatus } })}>
            <SelectTrigger className="mt-1 h-8 py-1 text-sm" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel({ status: s, raised_by: t.raised_by }, me)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Urgency</p>
          <Select value={t.priority} onValueChange={(v) => update.mutate({ ticketId: t.id, body: { priority: v as TicketPriority } })}>
            <SelectTrigger className="mt-1 h-8 py-1 text-sm" aria-label="Urgency">
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
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">About</p>
          <p className="mt-1.5 text-sm text-foreground">{TICKET_CATEGORY_LABEL[t.category]}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Looked after by</p>
          <p className={cn('mt-1.5 text-sm', t.assigned_to_name ? 'text-foreground' : 'text-muted-foreground')}>{t.assigned_to_name ?? 'Nobody yet'}</p>
        </div>
      </div>

      <DetailSection title={`Conversation · ${t.messages.length}`}>
        <ul className="divide-y divide-border">
          {t.messages.map((m, i) => {
            const fromMe = m.author_id != null && m.author_id === me
            return (
              <li key={i} className={cn('px-5 py-3.5', m.is_internal && 'border-l-2 border-l-warning bg-warning/5')}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium text-foreground">{fromMe ? 'You' : (m.author_name ?? 'Someone')}</span>
                  {!fromMe && m.author_role && <span className="text-xs text-muted-foreground">{titleCase(m.author_role)}</span>}
                  {m.is_internal && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                      <Lock className="size-3" />
                      Internal note, not shown to {t.raised_by_name ?? 'the person who raised it'}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">{m.sent_at ? formatRelative(m.sent_at) : ''}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{m.body}</p>
              </li>
            )
          })}
        </ul>
      </DetailSection>

      {t.status !== 'CLOSED' ? (
        <DetailSection title={internal ? 'Internal note' : 'Reply'}>
          <div className="space-y-3 px-5 py-4">
            <Textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={internal ? 'A note for the office only…' : 'Write a reply…'}
              className={cn(internal && 'border-warning focus-visible:ring-warning/30')}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              {!mine ? (
                <label className="flex items-center gap-2.5">
                  <Switch checked={internal} onCheckedChange={setInternal} />
                  <span className="text-xs">
                    <span className="font-medium">Internal note</span>
                    <span className="ml-1.5 text-muted-foreground">
                      {internal ? `${t.raised_by_name ?? 'They'} will NOT see this.` : `${t.raised_by_name ?? 'The person who raised it'} sees your reply.`}
                    </span>
                  </span>
                </label>
              ) : (
                <span />
              )}
              <Button size="sm" icon={<Send />} onClick={send} loading={reply.isPending} disabled={!message.trim()}>
                {internal ? 'Add internal note' : 'Send reply'}
              </Button>
            </div>
          </div>
        </DetailSection>
      ) : (
        <p className="border-b border-border px-5 py-3 text-sm text-muted-foreground">This ticket is closed. Raise a new one if the problem comes back.</p>
      )}

      {/* Rating is the reporter's, and only once it is sorted. */}
      {mine && (t.status === 'RESOLVED' || t.status === 'CLOSED') && t.satisfaction_rating == null && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <span className="text-sm font-medium">Was this sorted out?</span>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((value) => (
              <Button
                key={value}
                variant="ghost"
                size="icon-sm"
                aria-label={`${value} of 5`}
                onClick={() => rate.mutate({ ticketId: t.id, body: { rating: value } })}
              >
                <Star />
              </Button>
            ))}
          </div>
        </div>
      )}
      {t.satisfaction_rating != null && (
        <p className="border-b border-border px-5 py-3 text-xs text-muted-foreground">Rated {t.satisfaction_rating} of 5.</p>
      )}
    </>
  )
}

// ====================================================================== page

export function TeacherSupport() {
  const { user } = useAuth()
  const me = user?.id
  const contact = useSupportContact()
  const tickets = useTickets()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = React.useState<Filter | null>(null)
  const [search, setSearch] = React.useState('')

  // Read before the button is offered: raising one when tickets are off is a 403.
  const ticketsEnabled = contact.data?.tickets_enabled ?? true

  const all = tickets.data ?? []
  const counts: Record<Filter, number> = {
    open: all.filter(isActive).length,
    mine: all.filter((t) => t.raised_by === me).length,
    done: all.filter((t) => !isActive(t)).length,
    all: all.length,
  }
  const active: Filter = filter ?? (counts.open > 0 ? 'open' : 'all')
  const q = search.trim().toLowerCase()
  const visible = all
    .filter((t) => (active === 'open' ? isActive(t) : active === 'mine' ? t.raised_by === me : active === 'done' ? !isActive(t) : true))
    .filter((t) => !q || `${t.subject} ${t.raised_by_name ?? ''} #${t.id}`.toLowerCase().includes(q))

  const raising = params.get('ticket') === 'new'
  const picked = Number(params.get('ticket'))
  const selected = raising ? null : (visible.find((t) => t.id === picked) ?? visible[0] ?? null)
  const go = (value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set('ticket', value)
        else next.delete('ticket')
        return next
      },
      { replace: true },
    )

  const tabs: [Filter, string][] = [
    ['open', 'Open'],
    ['mine', 'Mine'],
    ['done', 'Resolved'],
    ['all', 'All'],
  ]
  const waitingOnMe = all.filter((t) => t.raised_by === me && t.status === 'WAITING_ON_USER').length

  return (
    <>
      <WorkspaceHeader
        title="Help & support"
        description="Ask the school office for help and follow the replies here, or call them."
        actions={
          ticketsEnabled ? (
            <Button size="sm" icon={<Plus />} disabled={raising} onClick={() => go('new')}>
              Raise a ticket
            </Button>
          ) : undefined
        }
      />

      <ContactStrip contact={contact.data} />

      <Band className="border-b border-border px-0 sm:px-0 lg:px-0">
        {/* On a phone the split is one column; held to the screen's width so a long ticket
            subject is cut short instead of widening the page. */}
        <div className="max-lg:[&>div]:grid-cols-1 lg:h-[calc(100vh-15rem)] lg:min-h-[30rem]">
          <SplitView
            list={
              <ListPane
                toolbar={
                  <>
                    <div className="flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5" role="radiogroup" aria-label="Show">
                      {tabs.map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          role="radio"
                          aria-checked={active === key}
                          onClick={() => setFilter(key)}
                          className={cn(
                            'flex-auto whitespace-nowrap rounded px-1.5 py-1 text-xs transition-colors',
                            active === key ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {label}
                          <span className="ml-1 tabular-nums">{counts[key]}</span>
                        </button>
                      ))}
                    </div>
                    <ListSearch value={search} onChange={setSearch} placeholder="Search subject, name or #" />
                  </>
                }
                footer={
                  tickets.data ? (
                    <>
                      {counts.open} open · {counts.mine} raised by you
                      {waitingOnMe > 0 && <span className="font-medium text-warning"> · {waitingOnMe} waiting on you</span>}
                    </>
                  ) : undefined
                }
              >
                {raising && <ListItem active onClick={() => undefined} title="New ticket" sub="Not sent yet" />}
                {tickets.isPending ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 rounded" />
                    ))}
                  </div>
                ) : tickets.isError ? (
                  <ListEmpty>The tickets could not be loaded. Try again in a moment.</ListEmpty>
                ) : visible.length === 0 ? (
                  <ListEmpty>
                    {q
                      ? 'Nothing matches that search.'
                      : all.length === 0
                        ? 'No tickets yet.'
                        : active === 'open'
                          ? 'Nothing is open. Everything has been sorted.'
                          : active === 'mine'
                            ? 'You have not raised a ticket.'
                            : 'Nothing here.'}
                  </ListEmpty>
                ) : (
                  visible.map((t) => {
                    const tone = TICKET_STATUS_TONE[t.status]
                    const urgent = t.priority === 'URGENT' || t.priority === 'HIGH'
                    return (
                      <ListItem
                        key={t.id}
                        active={selected?.id === t.id}
                        onClick={() => go(String(t.id))}
                        muted={!isActive(t)}
                        title={t.subject}
                        sub={
                          <>
                            {urgent && (
                              <span className={cn(t.priority === 'URGENT' ? 'text-danger' : 'text-warning', 'font-medium')}>
                                {TICKET_PRIORITY_LABEL[t.priority]} ·{' '}
                              </span>
                            )}
                            {t.raised_by === me ? 'You' : (t.raised_by_name ?? 'Someone')} · {t.created_at ? formatRelative(t.created_at) : `#${t.id}`}
                          </>
                        }
                        right={<span className={cn('whitespace-nowrap text-xs', WORD[tone])}>{statusLabel(t, me)}</span>}
                      />
                    )
                  })
                )}
              </ListPane>
            }
            detail={
              raising ? (
                <RaiseForm onCancel={() => go(null)} onRaised={(t) => go(String(t.id))} />
              ) : selected ? (
                <TicketDetail key={selected.id} ticketId={selected.id} me={me} />
              ) : (
                <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                  <p className="max-w-md text-sm text-muted-foreground">
                    {!ticketsEnabled
                      ? 'Tickets are turned off. Call or message the school office using the details above.'
                      : all.length === 0
                        ? 'Something not working, or a question for the office? Raise a ticket and the replies come back here.'
                        : 'Pick a ticket on the left to read it.'}
                  </p>
                  {ticketsEnabled && all.length === 0 && (
                    <Button size="sm" icon={<Plus />} onClick={() => go('new')}>
                      Raise a ticket
                    </Button>
                  )}
                </div>
              )
            }
          />
        </div>
      </Band>
    </>
  )
}

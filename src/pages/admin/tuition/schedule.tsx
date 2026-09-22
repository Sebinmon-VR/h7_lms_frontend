import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Video,
} from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import type { DayOfWeek, SlotAvailabilityResult, TuitionSlotOut } from '@/api/types'
import { ApiError } from '@/api/errors'
import {
  useCheckSlotAvailability,
  useCreateTuitionSlot,
  useDeleteTuitionSlot,
  useGenerateTuitionSessions,
  useTuitionConflicts,
  useTuitionEnrollments,
  useTuitionScheduleStatus,
  useTuitionSlots,
  useUpdateTuitionSlot,
} from '@/queries/tuition.queries'
import { formatDate } from '@/lib/datetime'
import { countLabel } from '@/lib/format'
import { DAYS, DAY_LABEL, DAY_SHORT } from '@/lib/timetable'
import {
  CLASS_LENGTH_HINT,
  MAX_CLASS_MINUTES,
  MIN_CLASS_MINUTES,
  classLengthError,
  shortTime,
  sortSlots,
} from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field, FormError } from '@/components/forms/field'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * The recurring weekly timetable, and the classes generated from it.
 *
 * A slot is a rule — "Maths with Anita, Tuesdays at 17:00" — and the backend
 * turns rules into dated classes up to a horizon. Two consequences shape this
 * screen: nothing past the horizon exists yet (so it cannot be attended or
 * billed), and a booking may clash with a diary the admin cannot see, because
 * two tuition teachers have no other way of knowing about each other.
 *
 * So the form asks the server whether a time is free BEFORE the admin commits,
 * and an override is recorded rather than hidden.
 */

const schema = z.object({
  enrollment_id: z.string().min(1, 'Choose an arrangement'),
  day_of_week: z.string().min(1),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  duration_minutes: z
    .string()
    .optional()
    .refine((v) => classLengthError(v) === null, (v) => ({ message: classLengthError(v) ?? '' })),
  effective_from: z.string().nullable().optional(),
  effective_to: z.string().nullable().optional(),
  meeting_link: z.string().max(2048).optional(),
  auto_create_meet: z.boolean(),
})
type FormValues = z.infer<typeof schema>

function SlotDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: TuitionSlotOut | null
}) {
  const enrollments = useTuitionEnrollments(false, open)
  const create = useCreateTuitionSlot()
  const update = useUpdateTuitionSlot()
  const check = useCheckSlotAvailability()

  const [availability, setAvailability] = React.useState<SlotAvailabilityResult | null>(null)
  const [overrideAcknowledged, setOverrideAcknowledged] = React.useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      enrollment_id: '',
      day_of_week: 'MONDAY',
      start_time: '17:00',
      auto_create_meet: true,
    },
  })

  React.useEffect(() => {
    if (!open) return
    setAvailability(null)
    setOverrideAcknowledged(false)
    form.reset({
      enrollment_id: editing ? String(editing.enrollment_id) : '',
      day_of_week: editing?.day_of_week ?? 'MONDAY',
      start_time: shortTime(editing?.start_time) === '—' ? '17:00' : shortTime(editing?.start_time),
      duration_minutes: editing?.duration_minutes ? String(editing.duration_minutes) : '',
      effective_from: editing?.effective_from ?? null,
      effective_to: editing?.effective_to ?? null,
      meeting_link: editing?.meeting_link ?? '',
      auto_create_meet: editing?.auto_create_meet ?? true,
    })
  }, [open, editing, form])

  const values = form.watch()

  /**
   * Any edit to the time invalidates the last answer.
   *
   * Keeping a stale "available" on screen after the admin moved the class by
   * an hour is worse than showing nothing — it is a green light for a booking
   * nobody checked.
   */
  React.useEffect(() => {
    setAvailability(null)
    setOverrideAcknowledged(false)
  }, [values.enrollment_id, values.day_of_week, values.start_time, values.duration_minutes])

  const runCheck = async () => {
    if (!values.enrollment_id) return
    const result = await check.mutateAsync({
      enrollment_id: Number(values.enrollment_id),
      day_of_week: values.day_of_week as DayOfWeek,
      start_time: values.start_time,
      duration_minutes: values.duration_minutes ? Number(values.duration_minutes) : 60,
      effective_from: values.effective_from || null,
      effective_to: values.effective_to || null,
      // Without this an edit reports a clash with the slot being edited.
      exclude_slot_id: editing?.id ?? null,
    })
    setAvailability(result)
  }

  const onSubmit = async (v: FormValues) => {
    const allowConflicts = overrideAcknowledged
    const body = {
      day_of_week: v.day_of_week as DayOfWeek,
      start_time: v.start_time,
      duration_minutes: v.duration_minutes ? Number(v.duration_minutes) : null,
      effective_from: v.effective_from || null,
      effective_to: v.effective_to || null,
      meeting_link: v.meeting_link || null,
      auto_create_meet: v.auto_create_meet,
    }

    try {
      if (editing) {
        await update.mutateAsync({ slotId: editing.id, body, allowConflicts })
      } else {
        await create.mutateAsync({
          body: { ...body, enrollment_id: Number(v.enrollment_id) },
          allowConflicts,
        })
      }
      onOpenChange(false)
    } catch (error) {
      // A 409 is a normal outcome here, not a failure: it carries the clashes,
      // and the admin decides whether to book over them.
      if (error instanceof ApiError && error.isConflict) {
        setAvailability({
          available: false,
          conflicts: [error.detail ? String(error.detail) : error.message],
        })
        return
      }
      form.setError('root', {
        message: (error as { message?: string })?.message ?? 'Could not save the class time.',
      })
    }
  }

  const blocked = availability?.available === false && !overrideAcknowledged

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit weekly class time' : 'Add a weekly class time'}</DialogTitle>
          <DialogDescription>
            Classes are generated from this rule up to the programme horizon. Both diaries are
            checked — the student's and the teacher's.
          </DialogDescription>
        </DialogHeader>

        <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-5">
            <FormError message={form.formState.errors.root?.message} />

            <Field
              id="arrangement"
              label="Arrangement"
              required
              error={form.formState.errors.enrollment_id?.message}
              hint={editing ? 'Cannot be moved to another arrangement.' : undefined}
            >
              <Combobox
                id="arrangement"
                disabled={!!editing}
                value={form.watch('enrollment_id') || null}
                onChange={(v) => form.setValue('enrollment_id', v, { shouldValidate: true })}
                options={(enrollments.data ?? []).map((e) => ({
                  value: String(e.id),
                  label: `${e.student?.full_name ?? 'Student'} · ${e.subject?.name ?? 'Subject'}`,
                  hint: e.teacher?.full_name ?? undefined,
                }))}
                placeholder="Choose an arrangement…"
                emptyMessage="No active arrangements. Create one first."
              />
            </Field>

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-3">
              <Field id="day" label="Day" required>
                <Select
                  value={form.watch('day_of_week')}
                  onValueChange={(v) => form.setValue('day_of_week', v)}
                >
                  <SelectTrigger id="day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((day) => (
                      <SelectItem key={day} value={day}>
                        {DAY_LABEL[day]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                id="time"
                label="Starts"
                required
                error={form.formState.errors.start_time?.message}
                hint="Programme time"
              >
                <Input id="time" type="time" {...form.register('start_time')} />
              </Field>

              <Field
                id="mins"
                label="Length"
                hint={CLASS_LENGTH_HINT}
                error={form.formState.errors.duration_minutes?.message}
              >
                <Input
                  id="mins"
                  type="number"
                  min={MIN_CLASS_MINUTES}
                  max={MAX_CLASS_MINUTES}
                  placeholder="60"
                  {...form.register('duration_minutes')}
                />
              </Field>
            </div>

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field id="from" label="From" hint="Defaults to today.">
                <DatePicker
                  id="from"
                  value={form.watch('effective_from') ?? null}
                  onChange={(v) => form.setValue('effective_from', v)}
                />
              </Field>
              <Field id="to" label="Until" hint="Leave blank for open-ended.">
                <DatePicker
                  id="to"
                  value={form.watch('effective_to') ?? null}
                  onChange={(v) => form.setValue('effective_to', v)}
                />
              </Field>
            </div>

            <Field
              id="link"
              label="Standing meeting link"
              hint="A Zoom or Teams room used for every class. Leave blank to give each class its own Meet."
            >
              <Input id="link" placeholder="https://…" {...form.register('meeting_link')} />
            </Field>

            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <span className="text-sm">
                Create a Google Meet for each class
                <span className="block text-xs text-muted-foreground">
                  Ignored when a standing link is set above.
                </span>
              </span>
              <Switch
                checked={form.watch('auto_create_meet')}
                onCheckedChange={(v) => form.setValue('auto_create_meet', v)}
              />
            </label>

            {/* Asked before committing, so an impossible time is caught here
                rather than at the end of the form. */}
            <div className="rounded-lg border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Is this time free?</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={check.isPending}
                  disabled={!values.enrollment_id}
                  onClick={runCheck}
                >
                  Check both diaries
                </Button>
              </div>

              {availability?.available && (
                <p className="mt-2 text-sm text-success">
                  Free. Neither the student nor the teacher is booked then.
                </p>
              )}

              {availability && !availability.available && (
                <div className="mt-2 space-y-2">
                  <ul className="space-y-1">
                    {availability.conflicts.map((conflict) => (
                      <li key={conflict} className="flex items-start gap-1.5 text-sm text-warning">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        {conflict}
                      </li>
                    ))}
                  </ul>
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={overrideAcknowledged}
                      onCheckedChange={(v) => setOverrideAcknowledged(v === true)}
                    />
                    <span>
                      Book it anyway.
                      <span className="block text-xs text-muted-foreground">
                        The clash is recorded against the slot and listed on this page, so it stays
                        visible rather than disappearing.
                      </span>
                    </span>
                  </label>
                </div>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending} disabled={blocked}>
              {editing ? 'Save class time' : 'Add class time'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

function SlotRow({
  slot,
  onEdit,
  onDelete,
  onToggle,
}: {
  slot: TuitionSlotOut
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2.5">
      <Badge tone="outline" size="sm" className="w-16 justify-center">
        {DAY_SHORT[slot.day_of_week]}
      </Badge>
      <span className="text-sm font-medium tabular-nums">
        {shortTime(slot.start_time)}–{shortTime(slot.end_time)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{slot.subject?.name ?? '—'}</p>
        <p className="truncate text-xs text-muted-foreground">
          {slot.student?.full_name ?? '—'} · {slot.teacher?.full_name ?? '—'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {!slot.is_active && (
          <Badge tone="neutral" size="sm">
            Paused
          </Badge>
        )}
        {slot.meeting_link ? (
          <Badge tone="info" size="sm">
            <Link2 />
            Standing room
          </Badge>
        ) : slot.auto_create_meet ? (
          <Badge tone="outline" size="sm">
            <Video />
            Meet per class
          </Badge>
        ) : null}
        {slot.conflicts.length > 0 && (
          <Badge tone="warning" size="sm">
            <AlertTriangle />
            Clash
          </Badge>
        )}
        {slot.effective_to && (
          <Badge tone="neutral" size="sm">
            until {formatDate(slot.effective_to)}
          </Badge>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggle}>
            <CalendarClock />
            {slot.is_active ? 'Pause' : 'Resume'}
          </DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={onDelete}>
            <Trash2 />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default function AdminTuitionSchedulePage() {
  const slots = useTuitionSlots()
  const conflicts = useTuitionConflicts()
  const status = useTuitionScheduleStatus()
  const generate = useGenerateTuitionSessions()
  const update = useUpdateTuitionSlot()
  const remove = useDeleteTuitionSlot()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<TuitionSlotOut | null>(null)
  const [deleting, setDeleting] = React.useState<TuitionSlotOut | null>(null)

  const byDay = React.useMemo(() => {
    const sorted = sortSlots(slots.data ?? [])
    return DAYS.map((day) => ({ day, slots: sorted.filter((s) => s.day_of_week === day) })).filter(
      (group) => group.slots.length > 0,
    )
  }, [slots.data])

  const conflictList = conflicts.data?.conflicts ?? []

  return (
    <>
      <PageHeader
        title="Tuition schedule"
        description="Recurring weekly class times, and how far ahead classes have been generated."
        actions={
          <>
            <Button
              variant="outline"
              loading={generate.isPending}
              onClick={() => generate.mutate(undefined)}
            >
              <CalendarPlus />
              Extend the schedule
            </Button>
            <Button
              onClick={() => {
                setEditing(null)
                setDialogOpen(true)
              }}
            >
              <Plus />
              Add class time
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        <QueryBoundary query={status} loading={<Skeleton className="h-20" />}>
          {(data) => (
            <Card className="p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Weekly class times" value={data.active_slots ?? '—'} />
                <Stat label="Classes scheduled" value={data.scheduled_sessions ?? '—'} />
                <Stat
                  label="Generated through"
                  value={data.generated_through ? formatDate(data.generated_through) : '—'}
                />
                <Stat label="Horizon" value={data.horizon_days ? `${data.horizon_days} d` : '—'} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Nothing beyond the horizon exists yet, so it cannot be attended, marked or billed.
                Extending is safe to repeat — it only adds what is missing.
              </p>
            </Card>
          )}
        </QueryBoundary>

        {conflictList.length > 0 && (
          <Card className="border-warning/40 bg-warning/[0.05] p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="size-4 text-warning" />
              {countLabel(conflictList.length, 'clash', 'clashes')} in the timetable
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Somebody is booked twice at the same time. Nothing is blocked — these are the times to
              go and move.
            </p>
            <ul className="mt-3 space-y-1.5">
              {conflictList.map((conflict, index) => (
                <li
                  key={index}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
                >
                  {conflict.detail ?? JSON.stringify(conflict)}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <QueryBoundary
          query={slots}
          loading={
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          }
          isEmpty={(data) => data.length === 0}
          empty={
            <EmptyState
              icon={<CalendarClock />}
              title="No weekly class times yet"
              description="Add one to an arrangement and the classes generate themselves from there."
              action={
                <Button
                  onClick={() => {
                    setEditing(null)
                    setDialogOpen(true)
                  }}
                >
                  <Plus />
                  Add class time
                </Button>
              }
            />
          }
        >
          {() => (
            <div className="space-y-5">
              {byDay.map((group) => (
                <section key={group.day}>
                  <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                    {DAY_LABEL[group.day]}
                  </h2>
                  <div className="space-y-2">
                    {group.slots.map((slot) => (
                      <SlotRow
                        key={slot.id}
                        slot={slot}
                        onEdit={() => {
                          setEditing(slot)
                          setDialogOpen(true)
                        }}
                        onDelete={() => setDeleting(slot)}
                        onToggle={() =>
                          update.mutate({ slotId: slot.id, body: { is_active: !slot.is_active } })
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </QueryBoundary>
      </div>

      <SlotDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Remove this weekly class time?"
        destructive
        confirmLabel="Remove"
        loading={remove.isPending}
        description={
          <>
            Classes still to come at this time are cancelled. Classes already taught are kept as a
            record. To stop it temporarily instead, pause it.
          </>
        }
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }}
      />
    </>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

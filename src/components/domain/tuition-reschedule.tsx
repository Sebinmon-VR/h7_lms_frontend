import * as React from 'react'

import type { TuitionSessionOut } from '@/api/types'
import { useRescheduleTuitionSession } from '@/queries/tuition.queries'
import {
  CLASS_LENGTH_HINT,
  MAX_CLASS_MINUTES,
  MIN_CLASS_MINUTES,
  classLengthError,
  displayStart,
} from '@/lib/tuition'
import { formatDateTime } from '@/lib/datetime'
import { DateTimePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field } from '@/components/forms/field'

/**
 * Moves one class without touching the weekly slot behind it.
 *
 * That distinction is the whole point of the dialog: editing the slot would
 * move every future Tuesday, which is almost never what "this week we'll do it
 * on Thursday instead" means. The recurring pattern is left alone and only
 * this one instance moves.
 *
 * Shared by the admin monitor and the teacher's console. An admin may book
 * over a clash; a teacher may not — the backend's teacher route takes no
 * `allow_conflicts`, so the checkbox is simply absent for them.
 */
export function RescheduleDialog({
  session,
  scope,
  onOpenChange,
}: {
  session: TuitionSessionOut | null
  scope: 'admin' | 'teacher'
  onOpenChange: (open: boolean) => void
}) {
  const reschedule = useRescheduleTuitionSession(scope)
  const [startsAt, setStartsAt] = React.useState<string | null>(null)
  const [duration, setDuration] = React.useState('')
  const [reason, setReason] = React.useState('')

  React.useEffect(() => {
    if (!session) return
    // Seeded with the existing instant so a small move is a small edit, not a
    // fresh date entry.
    setStartsAt(session.scheduled_start_at ?? null)
    setDuration(String(session.duration_minutes))
    setReason('')
  }, [session])

  const unchanged = !!session && startsAt === (session.scheduled_start_at ?? null)
  const lengthError = classLengthError(duration)

  return (
    <ConfirmDialog
      open={!!session}
      onOpenChange={onOpenChange}
      title="Move this class"
      confirmLabel="Move class"
      loading={reschedule.isPending}
      description="Only this one class moves. The weekly class time behind it is left alone, so next week is unaffected."
      onConfirm={() => {
        if (!session || !startsAt || unchanged || lengthError) return
        reschedule.mutate(
          {
            sessionId: String(session.id),
            body: {
              scheduled_start_at: startsAt,
              duration_minutes: duration ? Number(duration) : null,
              reason: reason.trim() || null,
            },
          },
          { onSuccess: () => onOpenChange(false) },
        )
      }}
    >
      <div className="space-y-3">
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
          Currently {formatDateTime(displayStart(session ?? ({} as TuitionSessionOut)))}
        </p>

        <Field
          id="resched-when"
          label="New time"
          required
          error={unchanged ? 'Pick a different time.' : undefined}
        >
          <DateTimePicker id="resched-when" value={startsAt} onChange={setStartsAt} />
        </Field>

        <Field
          id="resched-mins"
          label="Length"
          hint={CLASS_LENGTH_HINT}
          error={lengthError ?? undefined}
        >
          <Input
            id="resched-mins"
            type="number"
            min={MIN_CLASS_MINUTES}
            max={MAX_CLASS_MINUTES}
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          />
        </Field>

        <Field id="resched-why" label="Reason" hint="Shown to the other person.">
          <Input
            id="resched-why"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Clash with a school exam"
          />
        </Field>
      </div>
    </ConfirmDialog>
  )
}

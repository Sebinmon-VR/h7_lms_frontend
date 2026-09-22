import { BellOff, BellRing } from 'lucide-react'
import * as React from 'react'

import type { UserOut } from '@/api/types'
import { formatDate } from '@/lib/datetime'
import { Badge } from '@/components/ui/badge'

/**
 * Read-only view of the optional profile detail.
 *
 * Sections with nothing in them are omitted entirely rather than rendered as a
 * column of dashes: a school onboarding a hundred students has partial data for
 * most of them, and a wall of "—" makes a sparse profile look broken instead of
 * merely incomplete.
 */

const GENDER_LABEL: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  UNDISCLOSED: 'Not disclosed',
}

/**
 * One fact, stacked rather than justified.
 *
 * This was a label-left / value-right row with a hairline between each, which
 * is the shape every generic admin template reaches for and reads as one: on a
 * wide card the label and its value end up a hand's width apart with nothing
 * tying them together, and a long address wraps into a ragged right-aligned
 * block. Stacked in a grid, the pair stays visually one unit at any width.
 */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="break-words text-sm font-medium leading-snug text-foreground">{value}</dd>
    </div>
  )
}

/** Renders nothing when every row inside is empty. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const rows = React.Children.toArray(children).filter(Boolean)
  const hasContent = rows.some((child) => {
    if (!React.isValidElement(child)) return false
    const value = (child.props as { value?: unknown }).value
    return value !== null && value !== undefined && value !== ''
  })
  if (!hasContent) return null

  return (
    <section className="rounded-xl border border-border bg-card/40 p-4">
      <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
        <span className="h-px flex-1 bg-border" aria-hidden />
      </h3>
      {/* Two columns from `sm` up. A profile is a set of short facts, and one
          column of them on a wide card is mostly empty space. */}
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>
    </section>
  )
}

function addressOf(user: UserOut): string | null {
  const parts = [
    user.address_line1,
    user.address_line2,
    user.city,
    user.state,
    user.postal_code,
    user.country,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

export function ProfileSummary({ user }: { user: UserOut }) {
  const isStudent = user.role === 'STUDENT'
  // Null means never set, and the backend defaults new users to opted in.
  const remindersOn = user.reminder_opt_in ?? true
  /**
   * Undefined is NOT null here.
   *
   * A profile that came from the server always carries the key, even when the
   * value is null. Undefined means we never received the field — the
   * token-derived fallback profile — and claiming "receives class reminders"
   * off a default we were never told would be asserting something we do not
   * know.
   */
  const knowsReminderPreference = user.reminder_opt_in !== undefined

  return (
    <div className="space-y-4">
      <Group title="Contact">
        <Row label="Phone" value={user.phone} />
        <Row label="Alternate phone" value={user.alternate_phone} />
        <Row label="Date of birth" value={user.date_of_birth ? formatDate(user.date_of_birth) : null} />
        <Row label="Gender" value={user.gender ? (GENDER_LABEL[user.gender] ?? user.gender) : null} />
        <Row label="Address" value={addressOf(user)} />
      </Group>

      {isStudent && (
        <Group title="Admission">
          <Row label="Admission number" value={user.admission_number} />
          <Row label="Roll number" value={user.roll_number} />
          <Row
            label="Admitted"
            value={user.admission_date ? formatDate(user.admission_date) : null}
          />
          <Row label="Blood group" value={user.blood_group} />
        </Group>
      )}

      {/* The September profile fields. `academic_year_id` and
          `admission_category_id` are deliberately absent: they are ids, and
          this component takes no queries, so it would be rendering
          "Academic year 1758288000000" at somebody. The three free-text
          fields below are the half a person can actually read. */}
      {isStudent && (
        <Group title="Academic">
          <Row label="Syllabus" value={user.syllabus} />
          <Row label="Stream" value={user.academic_stream} />
          <Row label="Medium" value={user.medium} />
        </Group>
      )}

      {isStudent && (
        <Group title="Guardian">
          <Row label="Name" value={user.guardian_name} />
          <Row label="Relation" value={user.guardian_relation} />
          <Row label="Phone" value={user.guardian_phone} />
          <Row label="Email" value={user.guardian_email} />
        </Group>
      )}

      {!isStudent && (
        <Group title="Employment">
          <Row label="Employee ID" value={user.employee_id} />
          <Row label="Designation" value={user.designation} />
          <Row label="Qualification" value={user.qualification} />
          <Row label="Specialization" value={user.specialization} />
          <Row label="Joined" value={user.date_of_joining ? formatDate(user.date_of_joining) : null} />
          <Row
            label="Experience"
            value={
              user.experience_years !== null && user.experience_years !== undefined
                ? `${user.experience_years} year${user.experience_years === 1 ? '' : 's'}`
                : null
            }
          />
        </Group>
      )}

      {knowsReminderPreference && (
        <section className="rounded-xl border border-border bg-card/40 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reminders
            <span className="h-px flex-1 bg-border" aria-hidden />
          </h3>
          <Badge tone={remindersOn ? 'success' : 'neutral'} size="sm">
            {remindersOn ? <BellRing /> : <BellOff />}
            {remindersOn ? 'Receives class reminders' : 'Opted out of class reminders'}
          </Badge>
        </section>
      )}
    </div>
  )
}

/** Admin-only free-form notes. Never shown to the person they describe. */
export function ProfileNotes({ notes }: { notes: string | null | undefined }) {
  if (!notes) return null
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Internal notes
      </h3>
      <p className="whitespace-pre-wrap rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
        {notes}
      </p>
    </section>
  )
}

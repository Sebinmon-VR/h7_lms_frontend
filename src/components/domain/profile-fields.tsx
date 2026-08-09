import { ChevronDown } from 'lucide-react'
import * as React from 'react'

import type { Gender, UserProfileFields, UserRole } from '@/api/types'
import { cn } from '@/lib/cn'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * The optional profile detail, as collapsible sections.
 *
 * Collapsed by default because none of it is required and the common path is
 * name → role → create; a school onboarding a hundred students has partial
 * data for most of them and the API is built to accept that.
 *
 * Which sections show is driven by `role` — the backend enforces nothing
 * per-role, but a guardian contact on a teacher is noise, not data.
 *
 * One contract worth respecting when reading this: on UPDATE the backend treats
 * omitted and null alike, so nothing here can CLEAR a value. Emptying a field
 * leaves the stored one intact rather than erasing it, which is why the hint on
 * the section says so rather than letting someone discover it.
 */

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'UNDISCLOSED', label: 'Prefer not to say' },
]

function Section({
  title,
  hint,
  defaultOpen,
  filled,
  children,
}: {
  title: string
  hint?: string
  defaultOpen?: boolean
  /** How many fields in this section already have a value. */
  filled?: number
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(defaultOpen ?? false)

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-medium">
            {title}
            {!!filled && (
              <span className="rounded-full bg-primary/12 px-1.5 py-0.5 text-2xs font-medium text-primary">
                {filled}
              </span>
            )}
          </span>
          {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
        </span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && <div className="space-y-3 border-t border-border/60 p-3">{children}</div>}
    </div>
  )
}

function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
}: {
  id: string
  label: string
  value: string | number | null | undefined
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export interface ProfileFieldsProps {
  role: UserRole
  value: UserProfileFields
  onChange: (patch: UserProfileFields) => void
  /** Update mode cannot clear values; say so once rather than per field. */
  mode: 'create' | 'edit'
}

/** Counts fields with a meaningful value, for the section badges. */
function countFilled(value: UserProfileFields, keys: (keyof UserProfileFields)[]): number {
  return keys.filter((k) => {
    const v = value[k]
    return v !== null && v !== undefined && v !== ''
  }).length
}

const CONTACT_KEYS: (keyof UserProfileFields)[] = [
  'phone',
  'alternate_phone',
  'date_of_birth',
  'gender',
  'photo_url',
]
const ADDRESS_KEYS: (keyof UserProfileFields)[] = [
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal_code',
  'country',
]
const STUDENT_KEYS: (keyof UserProfileFields)[] = [
  'admission_number',
  'roll_number',
  'admission_date',
  'blood_group',
  'guardian_name',
  'guardian_phone',
  'guardian_email',
  'guardian_relation',
]
const STAFF_KEYS: (keyof UserProfileFields)[] = [
  'employee_id',
  'designation',
  'qualification',
  'specialization',
  'date_of_joining',
  'experience_years',
]

export function ProfileFieldsSection({ role, value, onChange, mode }: ProfileFieldsProps) {
  // Empty string is normalised to null so an untouched input never writes ""
  // into Firestore — two blank admission numbers would otherwise read as a
  // genuine uniqueness collision.
  const set = (key: keyof UserProfileFields) => (raw: string) =>
    onChange({ [key]: raw.trim() === '' ? null : raw } as UserProfileFields)

  const isStudent = role === 'STUDENT'

  return (
    <div className="space-y-2">
      {mode === 'edit' && (
        <p className="text-xs text-muted-foreground">
          Emptying a field leaves the stored value unchanged — this endpoint cannot clear one.
        </p>
      )}

      <Section title="Contact and personal" filled={countFilled(value, CONTACT_KEYS)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField id="pf-phone" label="Phone" value={value.phone} onChange={set('phone')} />
          <TextField
            id="pf-alt-phone"
            label="Alternate phone"
            value={value.alternate_phone}
            onChange={set('alternate_phone')}
          />
          <TextField
            id="pf-dob"
            label="Date of birth"
            type="date"
            value={value.date_of_birth}
            onChange={set('date_of_birth')}
          />
          <div className="space-y-1.5">
            <Label htmlFor="pf-gender">Gender</Label>
            <Select
              value={value.gender ?? ''}
              onValueChange={(v) => onChange({ gender: (v || null) as Gender | null })}
            >
              <SelectTrigger id="pf-gender">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                {GENDERS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <TextField
          id="pf-photo"
          label="Photo URL"
          value={value.photo_url}
          onChange={set('photo_url')}
          placeholder="https://…"
        />
      </Section>

      <Section title="Address" filled={countFilled(value, ADDRESS_KEYS)}>
        <TextField
          id="pf-addr1"
          label="Address line 1"
          value={value.address_line1}
          onChange={set('address_line1')}
        />
        <TextField
          id="pf-addr2"
          label="Address line 2"
          value={value.address_line2}
          onChange={set('address_line2')}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField id="pf-city" label="City" value={value.city} onChange={set('city')} />
          <TextField id="pf-state" label="State" value={value.state} onChange={set('state')} />
          <TextField
            id="pf-postal"
            label="Postal code"
            value={value.postal_code}
            onChange={set('postal_code')}
          />
          <TextField id="pf-country" label="Country" value={value.country} onChange={set('country')} />
        </div>
      </Section>

      {isStudent && (
        <Section
          title="Admission and guardian"
          hint="Student detail"
          filled={countFilled(value, STUDENT_KEYS)}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              id="pf-admission"
              label="Admission number"
              value={value.admission_number}
              onChange={set('admission_number')}
              hint="Must be unique across the school."
            />
            <TextField
              id="pf-roll"
              label="Roll number"
              value={value.roll_number}
              onChange={set('roll_number')}
              hint="Unique within a class, not school-wide."
            />
            <TextField
              id="pf-admitted"
              label="Admission date"
              type="date"
              value={value.admission_date}
              onChange={set('admission_date')}
            />
            <TextField
              id="pf-blood"
              label="Blood group"
              value={value.blood_group}
              onChange={set('blood_group')}
              placeholder="O+"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              id="pf-guardian"
              label="Guardian name"
              value={value.guardian_name}
              onChange={set('guardian_name')}
            />
            <TextField
              id="pf-guardian-rel"
              label="Relation"
              value={value.guardian_relation}
              onChange={set('guardian_relation')}
              placeholder="Mother"
            />
            <TextField
              id="pf-guardian-phone"
              label="Guardian phone"
              value={value.guardian_phone}
              onChange={set('guardian_phone')}
            />
            <TextField
              id="pf-guardian-email"
              label="Guardian email"
              type="email"
              value={value.guardian_email}
              onChange={set('guardian_email')}
            />
          </div>
        </Section>
      )}

      {!isStudent && (
        <Section
          title="Employment"
          hint="Teacher and staff detail"
          filled={countFilled(value, STAFF_KEYS)}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              id="pf-employee"
              label="Employee ID"
              value={value.employee_id}
              onChange={set('employee_id')}
              hint="Must be unique across the school."
            />
            <TextField
              id="pf-designation"
              label="Designation"
              value={value.designation}
              onChange={set('designation')}
              placeholder="Senior Lecturer"
            />
            <TextField
              id="pf-joined"
              label="Date of joining"
              type="date"
              value={value.date_of_joining}
              onChange={set('date_of_joining')}
            />
            <TextField
              id="pf-experience"
              label="Years of experience"
              type="number"
              value={value.experience_years}
              onChange={(raw) =>
                onChange({ experience_years: raw.trim() === '' ? null : Number(raw) })
              }
            />
          </div>
          <TextField
            id="pf-qualification"
            label="Qualification"
            value={value.qualification}
            onChange={set('qualification')}
            placeholder="PhD Computer Science"
          />
          <TextField
            id="pf-specialization"
            label="Specialization"
            value={value.specialization}
            onChange={set('specialization')}
          />
        </Section>
      )}

      <Section
        title="Notes and reminders"
        filled={countFilled(value, ['notes'])}
      >
        <div className="space-y-1.5">
          <Label htmlFor="pf-notes">Internal notes</Label>
          <textarea
            id="pf-notes"
            value={value.notes ?? ''}
            onChange={(e) => onChange({ notes: e.target.value.trim() === '' ? null : e.target.value })}
            rows={3}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground/60 focus:border-primary"
            placeholder="Visible to administrators only."
          />
          <p className="text-xs text-muted-foreground">
            Never shown to the person they describe.
          </p>
        </div>

        <div className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Class reminder emails</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Sent before each timetabled period. On by default — enrolling someone means
              intending to tell them when class starts.
            </p>
          </div>
          <Switch
            // Null means never set, and the backend defaults it to true.
            checked={value.reminder_opt_in ?? true}
            onCheckedChange={(v) => onChange({ reminder_opt_in: v })}
            aria-label="Class reminder emails"
          />
        </div>
      </Section>
    </div>
  )
}

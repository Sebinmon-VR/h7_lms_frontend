import { ChevronDown } from 'lucide-react'
import * as React from 'react'

import type { Gender, UserProfileFields, UserRole } from '@/api/types'
import { useAcademicYears, useAdmissionCategories } from '@/queries/admissions.queries'
import { cn } from '@/lib/cn'
import { Input, Textarea } from '@/components/ui/input'
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

/**
 * Radix refuses an empty-string `SelectItem` value, so "not set" needs a
 * sentinel rather than ''. Both id setters translate it back to null.
 */
const NOT_SET = '__NOT_SET__'

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
  flat,
  children,
}: {
  title: string
  hint?: string
  defaultOpen?: boolean
  /** How many fields in this section already have a value. */
  filled?: number
  /**
   * Renders the section open and without the disclosure control.
   *
   * Collapsing exists because these fields sit inside a dialog, where the
   * alternative is a column taller than the viewport. On a full page there is
   * room to show everything, and hiding it behind eight accordions is the
   * thing that made the dialog feel cramped in the first place.
   */
  flat?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(defaultOpen ?? false)

  if (flat) {
    return (
      /* A rank below the FormSection heading it nests under: uppercase and
         small, so "Profile detail > Address" reads as two levels rather than
         as two competing titles of the same weight. */
      <section className="space-y-4">
        <div className="flex items-baseline gap-2">
          <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
          <span className="h-px flex-1 bg-border" aria-hidden />
        </div>
        <div className="space-y-5">{children}</div>
      </section>
    )
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border transition-colors',
        open ? 'border-primary/30 bg-card' : 'border-border bg-card/50 hover:border-primary/25',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            {title}
            {/* How many fields already have a value. Worth a badge rather than
                a bare count: it is the only thing that tells somebody a
                collapsed section is worth opening. */}
            {!!filled && (
              <span className="rounded-full bg-primary/12 px-2 py-0.5 text-2xs font-semibold text-primary">
                {filled}
              </span>
            )}
          </span>
          {hint && (
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              {hint}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180 text-primary',
          )}
        />
      </button>
      {open && (
        <div className="space-y-5 border-t border-border bg-muted/20 px-4 py-5">{children}</div>
      )}
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
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * Free text with suggestions, not a closed list.
 *
 * `syllabus`, `academic_stream` and `medium` are free text on the backend on
 * purpose — schools name these inconsistently ("CBSE", "State Board Plus Two")
 * and a reference table nobody maintains is worse than a label. But the tuition
 * library's syllabus filter matches the profile value against an item's tags,
 * so a school that types "CBSE" here and "C.B.S.E." there gets a silently empty
 * library. The datalist nudges towards one spelling without refusing another.
 */
function SuggestField({
  id,
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  hint,
}: {
  id: string
  label: string
  value: string | null | undefined
  onChange: (v: string) => void
  suggestions: readonly string[]
  placeholder?: string
  hint?: string
}) {
  const listId = `${id}-options`
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        list={listId}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {suggestions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

const SYLLABUS_SUGGESTIONS = ['CBSE', 'ICSE', 'IGCSE', 'State Board', 'IB'] as const
const STREAM_SUGGESTIONS = ['Science', 'Commerce', 'Humanities'] as const
const MEDIUM_SUGGESTIONS = ['English', 'Hindi', 'Malayalam', 'Tamil'] as const

export interface ProfileFieldsProps {
  role: UserRole
  value: UserProfileFields
  onChange: (patch: UserProfileFields) => void
  /** Update mode cannot clear values; say so once rather than per field. */
  mode: 'create' | 'edit'
  /**
   * `page` shows every section expanded, for a form that owns a route.
   * `dialog` — the default — keeps them collapsible, which is the only way a
   * full profile fits in a modal.
   */
  layout?: 'dialog' | 'page'
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
const INTAKE_KEYS: (keyof UserProfileFields)[] = [
  'academic_year_id',
  'admission_category_id',
  'admission_year_id',
  'syllabus',
  'academic_stream',
  'medium',
]
const STAFF_KEYS: (keyof UserProfileFields)[] = [
  'employee_id',
  'designation',
  'qualification',
  'specialization',
  'date_of_joining',
  'experience_years',
]

export function ProfileFieldsSection({
  role,
  value,
  onChange,
  mode,
  layout = 'dialog',
}: ProfileFieldsProps) {
  const flat = layout === 'page'

  // Empty string is normalised to null so an untouched input never writes ""
  // into Firestore — two blank admission numbers would otherwise read as a
  // genuine uniqueness collision.
  const set = (key: keyof UserProfileFields) => (raw: string) =>
    onChange({ [key]: raw.trim() === '' ? null : raw } as UserProfileFields)

  /**
   * Ids are numbers, not strings. `set` above would post `"1789..."` for a
   * year, which the backend rejects — hence a second setter rather than a
   * cast at each call site.
   */
  const setId = (key: keyof UserProfileFields) => (raw: string) =>
    onChange({ [key]: raw === NOT_SET ? null : Number(raw) } as UserProfileFields)

  const isStudent = role === 'STUDENT'

  // Admin-only endpoints, and this component is only ever rendered inside the
  // admin user forms — but gated on `isStudent` anyway so creating a teacher
  // does not fetch two lists it will never show.
  const years = useAcademicYears({ withCounts: false }, isStudent)
  const categories = useAdmissionCategories({ includeInactive: false }, isStudent)

  const currentYear = years.data?.find((y) => y.is_current) ?? null

  return (
    <div className={flat ? 'space-y-8' : 'space-y-3'}>
      {mode === 'edit' && !flat && (
        <p className="text-xs text-muted-foreground">
          Emptying a field leaves the stored value unchanged — this endpoint cannot clear one.
        </p>
      )}

      <Section flat={flat} title="Contact and personal" filled={countFilled(value, CONTACT_KEYS)}>
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
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
          <div className="space-y-2">
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

      <Section flat={flat} title="Address" filled={countFilled(value, ADDRESS_KEYS)}>
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
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
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
          flat={flat}
          title="Session year and syllabus"
          hint="Which intake this student belongs to"
          /* Open by default, unlike every other section here. The year drives
             which fee structure and instalment plan a student is billed under,
             so leaving it collapsed is how a whole intake ends up on the wrong
             one — or on none. */
          defaultOpen
          filled={countFilled(value, INTAKE_KEYS)}
        >
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pf-year">Session year</Label>
              <Select
                value={
                  value.academic_year_id != null ? String(value.academic_year_id) : NOT_SET
                }
                onValueChange={setId('academic_year_id')}
              >
                <SelectTrigger id="pf-year">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOT_SET}>Not set</SelectItem>
                  {(years.data ?? []).map((year) => (
                    <SelectItem key={year.id} value={String(year.id)}>
                      {year.name}
                      {year.is_current ? ' · current' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* The default only applies on creation, and only when the field
                  is left blank — so say which of the two is happening rather
                  than one hint that is wrong half the time. */}
              <p className="text-xs text-muted-foreground">
                {mode === 'create'
                  ? currentYear
                    ? `Leave unset and this student is admitted into ${currentYear.name}, the current year.`
                    : 'No year is marked current, so leaving this unset gives the student no session year at all.'
                  : 'Moving a student between years changes which fee structure they are billed under.'}
              </p>
              {years.data?.length === 0 && (
                <p className="text-xs text-warning">
                  No session years exist yet — create one under Admissions.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-category">Admission category</Label>
              <Select
                value={
                  value.admission_category_id != null
                    ? String(value.admission_category_id)
                    : NOT_SET
                }
                onValueChange={setId('admission_category_id')}
              >
                <SelectTrigger id="pf-category">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOT_SET}>Not set</SelectItem>
                  {(categories.data ?? []).map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.name}
                      {category.default_discount_percent != null
                        ? ` · ${category.default_discount_percent}% off`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Carries any standing concession — the fee engine applies it on its own.
              </p>
            </div>

            {/* Fixed on admission and never moved by a promotion. It decides the one
                bill that carries the admission fee, so it is editable here for the
                student who joined before the system did and should not be charged. */}
            <div className="space-y-2">
              <Label htmlFor="pf-admission-year">Admitted in year</Label>
              <Select
                value={
                  value.admission_year_id != null ? String(value.admission_year_id) : NOT_SET
                }
                onValueChange={setId('admission_year_id')}
              >
                <SelectTrigger id="pf-admission-year">
                  <SelectValue placeholder="Same as session year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOT_SET}>Same as session year</SelectItem>
                  {(years.data ?? []).map((year) => (
                    <SelectItem key={year.id} value={String(year.id)}>
                      {year.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The admission fee is billed in this year only. Set an earlier year for a
                student who joined before fees were on the system.
              </p>
            </div>
          </div>

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-3">
            <SuggestField
              id="pf-syllabus"
              label="Syllabus"
              value={value.syllabus}
              onChange={set('syllabus')}
              suggestions={SYLLABUS_SUGGESTIONS}
              placeholder="CBSE"
              hint="Used to filter the library when syllabus filtering is on."
            />
            <SuggestField
              id="pf-stream"
              label="Stream"
              value={value.academic_stream}
              onChange={set('academic_stream')}
              suggestions={STREAM_SUGGESTIONS}
              placeholder="Science"
            />
            <SuggestField
              id="pf-medium"
              label="Medium"
              value={value.medium}
              onChange={set('medium')}
              suggestions={MEDIUM_SUGGESTIONS}
              placeholder="English"
              hint="Language of instruction."
            />
          </div>
        </Section>
      )}

      {isStudent && (
        <Section
          flat={flat}
          title="Admission and guardian"
          hint="Student detail"
          filled={countFilled(value, STUDENT_KEYS)}
        >
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
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
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
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
          flat={flat}
          title="Employment"
          hint="Teacher and staff detail"
          filled={countFilled(value, STAFF_KEYS)}
        >
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
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
        flat={flat}
        title="Notes and reminders"
        filled={countFilled(value, ['notes'])}
      >
        {/* The `Textarea` primitive, not a hand-rolled one: this was the only
            raw <textarea> left in the app, and it drifted away from every
            other field the moment the shared focus treatment changed. */}
        <div className="space-y-2">
          <Label htmlFor="pf-notes">Internal notes</Label>
          <Textarea
            id="pf-notes"
            value={value.notes ?? ''}
            onChange={(e) =>
              onChange({ notes: e.target.value.trim() === '' ? null : e.target.value })
            }
            rows={3}
            placeholder="Visible to administrators only."
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Never shown to the person they describe.
          </p>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3.5">
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

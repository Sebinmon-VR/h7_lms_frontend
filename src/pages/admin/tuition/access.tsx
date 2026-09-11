import type { ColumnDef } from '@tanstack/react-table'
import { GraduationCap, ShieldCheck, ShieldOff, UserPlus } from 'lucide-react'
import * as React from 'react'

import type { Program, TuitionUserSummary } from '@/api/types'
import { useSubjects } from '@/queries/admin.queries'
import {
  useCreateTuitionAccount,
  useSetUserPrograms,
  useTuitionUsers,
} from '@/queries/tuition.queries'
import { ROLE_LABEL } from '@/lib/constants'
import { PROGRAM_LABEL } from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { DataTable } from '@/components/data/data-table'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field } from '@/components/forms/field'
import { BROWSER_ZONE, TimezonePicker } from '@/components/domain/timezone-picker'
import { UserCell } from '@/components/domain/user-cell'
import { PageHeader } from '@/components/layout/page-header'

/**
 * Who may use online tuition.
 *
 * This is the "special key" the whole product turns on. Role and programme are
 * checked together on every tuition route: a teacher with a perfectly valid
 * login and the TEACHER role is refused everywhere in tuition until TUITION
 * appears here, and a school student is never shown a tuition screen at all.
 *
 * Both boxes together are a real configuration, not a mistake — a teacher who
 * genuinely does both jobs needs one account, not two.
 */

const PROGRAMS: Program[] = ['LMS', 'TUITION']

/**
 * Adds a brand-new person to the tuition programme.
 *
 * Distinct from Users -> Add user, and deliberately so: a tuition student is
 * not one of the school's pupils borrowed. The two user bases overlap only
 * sometimes, and requiring an LMS profile first would mean every tuition
 * family had to be enrolled in a school they may have nothing to do with.
 *
 * So this creates an account with TUITION access only, and generates the
 * `TUI-`/`TUT-` identifier server-side. For somebody who ALREADY has a school
 * account, tick the box in the table below instead - that grants access
 * without creating a second login for the same person.
 */
function AddPersonDialog({
  role,
  onOpenChange,
}: {
  role: 'STUDENT' | 'TEACHER' | null
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateTuitionAccount(role ?? 'STUDENT')
  const subjects = useSubjects(role === 'TEACHER')

  const [fullName, setFullName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [reference, setReference] = React.useState('')
  const [timezone, setTimezone] = React.useState<string | null>(null)
  const [alsoLms, setAlsoLms] = React.useState(false)
  const [subjectIds, setSubjectIds] = React.useState<number[]>([])

  React.useEffect(() => {
    if (!role) return
    setFullName('')
    setEmail('')
    setPhone('')
    setReference('')
    setTimezone(null)
    setAlsoLms(false)
    setSubjectIds([])
  }, [role])

  const isStudent = role === 'STUDENT'

  return (
    <ConfirmDialog
      open={!!role}
      onOpenChange={onOpenChange}
      title={isStudent ? 'Add a tuition student' : 'Add a tuition tutor'}
      confirmLabel="Add"
      loading={create.isPending}
      description="Creates a new account with tuition access. Everything but the name is optional - an email is derived from it, and credentials are issued separately."
      onConfirm={() => {
        if (!fullName.trim()) return
        create.mutate(
          {
            full_name: fullName.trim(),
            email: email.trim() || null,
            phone: phone.trim() || null,
            timezone,
            also_lms: alsoLms,
            ...(isStudent
              ? { admission_number: reference.trim() || null }
              : { employee_id: reference.trim() || null, subject_ids: subjectIds }),
          },
          { onSuccess: () => onOpenChange(false) },
        )
      }}
    >
      <div className="space-y-3">
        <Field id="add-name" label="Full name" required>
          <Input
            id="add-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoFocus
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="add-email" label="Email" hint="Derived from the name when blank.">
            <Input
              id="add-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field id="add-phone" label="Phone">
            <Input id="add-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
        </div>

        <Field
          id="add-ref"
          label={isStudent ? 'Admission number' : 'Staff id'}
          hint={
            isStudent
              ? 'Generated as TUI-<year>-0001 when blank.'
              : 'Generated as TUT-<year>-0001 when blank.'
          }
        >
          <Input
            id="add-ref"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </Field>

        {!isStudent && (
          <Field
            id="add-subjects"
            label="Subjects they can take"
            hint="Records what they are able to teach so the arrangements screen can shortlist them. Assigns nobody."
          >
            <div className="flex flex-wrap gap-3 rounded-lg border border-border px-3 py-2.5">
              {(subjects.data ?? []).length === 0 && (
                <span className="text-xs text-muted-foreground">No subjects in the catalogue.</span>
              )}
              {(subjects.data ?? []).map((subject) => (
                <label key={subject.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={subjectIds.includes(subject.id)}
                    onCheckedChange={(v) =>
                      setSubjectIds((prev) =>
                        v === true ? [...prev, subject.id] : prev.filter((id) => id !== subject.id),
                      )
                    }
                  />
                  {subject.name}
                </label>
              ))}
            </div>
          </Field>
        )}

        <Field
          id="add-tz"
          label="Timezone"
          hint="Leave blank and it is detected from their browser the first time they sign in."
        >
          <TimezonePicker
            id="add-tz"
            value={timezone}
            onChange={setTimezone}
            clearLabel="Detect automatically"
            suggested={BROWSER_ZONE}
          />
        </Field>

        {/* Off by default, and worth stating why: an account added here that
            silently also reached the school's classes and marks would be a
            privacy problem, not a convenience. */}
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={alsoLms} onCheckedChange={(v) => setAlsoLms(v === true)} />
          <span>
            Also give them school access
            <span className="block text-xs text-muted-foreground">
              Only for someone who genuinely attends or teaches at the school too.
            </span>
          </span>
        </label>
      </div>
    </ConfirmDialog>
  )
}

export default function AdminTuitionAccessPage() {
  // Always the wide list: this screen exists to GRANT access, and a list of
  // people who already have it cannot answer "add somebody".
  const users = useTuitionUsers(undefined, true)
  const setPrograms = useSetUserPrograms()

  const [pendingId, setPendingId] = React.useState<number | null>(null)
  const [adding, setAdding] = React.useState<'STUDENT' | 'TEACHER' | null>(null)

  const toggle = (user: TuitionUserSummary, program: Program, next: boolean) => {
    const current = new Set<Program>(user.programs?.length ? user.programs : ['LMS'])
    if (next) current.add(program)
    else current.delete(program)

    // The backend requires at least one; an empty list is a 422 and, worse,
    // would be an account that can reach nothing at all.
    if (current.size === 0) return

    setPendingId(user.id)
    setPrograms.mutate(
      { userId: user.id, body: { programs: Array.from(current) } },
      { onSettled: () => setPendingId(null) },
    )
  }

  const columns = React.useMemo<ColumnDef<TuitionUserSummary, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'User',
        accessorFn: (row) => row.full_name,
        cell: ({ row }) => (
          <UserCell
            name={row.original.full_name}
            email={row.original.email}
            inactive={!row.original.is_active}
          />
        ),
      },
      {
        id: 'role',
        header: 'Role',
        accessorFn: (row) => ROLE_LABEL[row.role as keyof typeof ROLE_LABEL] ?? row.role,
        filterFn: (r, id, value: string[]) => value.includes(r.getValue(id)),
        cell: ({ row }) => (
          <Badge tone="outline" size="sm">
            {ROLE_LABEL[row.original.role as keyof typeof ROLE_LABEL] ?? row.original.role}
          </Badge>
        ),
      },
      {
        id: 'identifier',
        header: 'Reference',
        accessorFn: (row) => row.admission_number ?? row.employee_id ?? '',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.admission_number ?? row.original.employee_id ?? '—'}
          </span>
        ),
      },
      {
        id: 'timezone',
        header: 'Timezone',
        accessorFn: (row) => row.timezone ?? '',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.timezone ?? 'Programme time'}
          </span>
        ),
      },
      {
        id: 'access',
        header: 'Programmes',
        enableSorting: false,
        // Faceted on the derived label so an admin can pull up "everyone
        // without tuition" — the list this screen is usually opened to fix.
        accessorFn: (row) =>
          (row.programs ?? ['LMS']).includes('TUITION') ? 'Online tuition' : 'School only',
        filterFn: (r, id, value: string[]) => value.includes(r.getValue(id)),
        cell: ({ row }) => {
          const user = row.original
          const programs = new Set<Program>(user.programs?.length ? user.programs : ['LMS'])
          const busy = pendingId === user.id

          return (
            <div className="flex flex-wrap items-center gap-4" onClick={(e) => e.stopPropagation()}>
              {PROGRAMS.map((program) => {
                const checked = programs.has(program)
                // The last remaining programme cannot be turned off: an
                // account with none reaches nothing, and the API refuses it.
                const isLast = checked && programs.size === 1
                return (
                  <label
                    key={program}
                    className="flex items-center gap-2 text-sm"
                    title={isLast ? 'An account must belong to at least one programme.' : undefined}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={busy || isLast}
                      onCheckedChange={(v) => toggle(user, program, v === true)}
                    />
                    {PROGRAM_LABEL[program]}
                  </label>
                )
              })}
            </div>
          )
        },
      },
    ],
    // `toggle` closes over the mutation, which is stable enough for this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingId],
  )

  const tuitionCount = (users.data ?? []).filter((u) =>
    (u.programs ?? ['LMS']).includes('TUITION'),
  ).length

  return (
    <>
      <PageHeader
        title="People & access"
        description="Add tuition students and tutors, and control which products each account may reach."
        actions={
          <>
            <Button variant="outline" onClick={() => setAdding('TEACHER')}>
              <UserPlus />
              Add tutor
            </Button>
            <Button onClick={() => setAdding('STUDENT')}>
              <GraduationCap />
              Add student
            </Button>
          </>
        }
      />

      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm">
              <strong>{tuitionCount}</strong> of {users.data?.length ?? 0} accounts can use online
              tuition.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              A role says what somebody may do; a programme says where. Both have to pass, so a
              teacher without the tuition box is refused by every tuition screen however valid
              their login. Administrators are not scoped — one admin team runs both products.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              <strong className="text-foreground">Adding</strong> someone creates a new account
              with tuition access only. For a person who already has a school login, tick their
              tuition box in the table instead - that avoids a second login for the same person.
            </p>
          </div>
        </div>
      </Card>

      <DataTable
        columns={columns}
        data={users.data}
        getRowId={(row) => String(row.id)}
        isLoading={users.isPending}
        error={users.error}
        onRetry={() => void users.refetch()}
        searchPlaceholder="Search by name, email or reference…"
        searchValues={(row) => [
          row.full_name,
          row.email,
          row.admission_number,
          row.employee_id,
        ]}
        facets={[
          {
            columnId: 'role',
            label: 'Role',
            options: Array.from(
              new Set(
                (users.data ?? []).map(
                  (u) => ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? u.role,
                ),
              ),
            ).map((label) => ({ value: label, label })),
          },
          {
            columnId: 'access',
            label: 'Access',
            options: [
              { value: 'Online tuition', label: 'Online tuition' },
              { value: 'School only', label: 'School only' },
            ],
          },
        ]}
        csv={{
          filename: 'tuition-programme-access',
          columns: [
            { header: 'Name', value: (r) => r.full_name },
            { header: 'Email', value: (r) => r.email },
            { header: 'Role', value: (r) => r.role },
            { header: 'Programmes', value: (r) => (r.programs ?? ['LMS']).join(' + ') },
            { header: 'Timezone', value: (r) => r.timezone ?? '' },
          ],
        }}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <ShieldOff className="size-8 text-muted-foreground" />
            <p className="text-sm font-semibold">No accounts to show</p>
          </div>
        }
      />

      <AddPersonDialog role={adding} onOpenChange={(open) => !open && setAdding(null)} />
    </>
  )
}

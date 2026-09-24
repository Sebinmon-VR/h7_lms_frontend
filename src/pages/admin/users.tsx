import type { ColumnDef } from '@tanstack/react-table'
import {
  CalendarRange,
  Eye,
  KeyRound,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import type { CredentialsIssued, Program, UserOut, UserProfileFields } from '@/api/types'
import { ApiError } from '@/api/errors'
import {
  useDeactivateUser,
  useGenerateCredentials,
  usePermanentlyDeleteUser,
  usePresenceMap,
  useReactivateUser,
  useUpdateUser,
  useUsers,
} from '@/queries/admin.queries'
import { useAcademicYears } from '@/queries/admissions.queries'
import { ALL_ROLES, ROLE_LABEL, isTeachingRole } from '@/lib/constants'
import { formatDateTime, formatRelative } from '@/lib/datetime'
import { PROGRAM_LABEL } from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DataTable } from '@/components/data/data-table'
import { ActiveBadge, RoleBadge } from '@/components/domain/badges'
import { UserCell } from '@/components/domain/user-cell'
import { BatchProgress, useBatchRunner } from '@/components/feedback/batch-progress'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field } from '@/components/forms/field'
import { EmptyState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { CredentialsModal } from './credentials-modal'
import { ImportUsersDialog } from './import-users'
import { UserDetailSheet } from './user-detail'

// -------------------------------------------------------------- create form

/**
 * Only the name is required.
 *
 * There is deliberately no password field: the admin never chooses one. The
 * backend generates a password on demand through "Generate credentials",
 * emails it to the user, and returns it once. An admin-typed password would
 * be weaker, would need relaying by hand anyway, and would tempt reuse.
 *
 * Email is an override, not an input — leaving it blank lets the server derive
 * `firstname.lastname@<domain>` and resolve collisions itself.
 */
export const createSchema = z.object({
  full_name: z.string().min(2, 'Enter a full name').max(120),
  email: z
    .string()
    .max(200)
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address'),
  role: z.enum(['ADMIN', 'TEACHER', 'STUDENT']),
  /**
   * Which products the account may reach.
   *
   * Defaults to the school alone. A tuition tutor or student needs TUITION
   * ticked here or their login works and every tuition screen refuses them —
   * so it sits beside the role rather than among the optional profile fields,
   * which is also how the backend models it.
   */
  programs: z.array(z.enum(['LMS', 'TUITION'])).min(1, 'Pick at least one'),
})
export type CreateValues = z.infer<typeof createSchema>

/**
 * Mirrors the server's address rule for a live hint only.
 *
 * The server is the authority — it strips accents, resolves collisions with a
 * numeric suffix, and knows the configured domain. This preview says so rather
 * than presenting itself as the final answer.
 */
export function previewEmail(fullName: string): string | null {
  const parts = fullName
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)

  if (parts.length === 0) return null
  // Middle names are dropped: first and last only.
  const local = parts.length === 1 ? parts[0] : `${parts[0]}.${parts[parts.length - 1]}`
  return local
}

/**
 * Product access, as two checkboxes.
 *
 * Separate from the role, because they answer different questions: a role says
 * what somebody may do, a programme says where. The backend checks both on
 * every tuition request, so a teacher without TUITION is refused by every
 * tuition screen however valid their login.
 *
 * Both together is a real configuration, not a mistake — a teacher who
 * genuinely does both jobs needs one account, not two. The last remaining box
 * cannot be cleared: an account belonging to no programme reaches nothing, and
 * the API rejects an empty list.
 */
export function ProgramsField({
  value,
  onChange,
  error,
}: {
  value: Program[]
  onChange: (next: Program[]) => void
  error?: string
}) {
  const toggle = (program: Program, checked: boolean) => {
    const next = new Set(value)
    if (checked) next.add(program)
    else next.delete(program)
    if (next.size === 0) return
    onChange(Array.from(next))
  }

  return (
    <Field
      id="programs"
      label="Programme access"
      required
      error={error}
      hint="A tuition tutor or student needs Online tuition ticked, or every tuition screen refuses them."
    >
      <div className="flex flex-wrap gap-4 rounded-lg border border-border px-3 py-2.5">
        {(['LMS', 'TUITION'] as Program[]).map((program) => {
          const checked = value.includes(program)
          const isLast = checked && value.length === 1
          return (
            <label
              key={program}
              className="flex items-center gap-2 text-sm"
              title={isLast ? 'An account must belong to at least one programme.' : undefined}
            >
              <Checkbox
                checked={checked}
                disabled={isLast}
                onCheckedChange={(v) => toggle(program, v === true)}
              />
              {PROGRAM_LABEL[program]}
            </label>
          )
        })}
      </div>
    </Field>
  )
}

/**
 * The create and edit forms used to live here as dialogs.
 *
 * They now own routes — `/admin/users/new` and `/admin/users/:id/edit` — in
 * `user-form.tsx`, which imports the schemas, the programme picker and
 * `profileOf` from this module. A user record carries an account, a role,
 * programme access, contact and address detail, admission or employment
 * fields and a guardian; a modal could only hold that by collapsing most of
 * it behind accordions and growing its own scrollbar.
 */

export const editSchema = z.object({
  full_name: z.string().min(2, 'Enter a full name').max(120),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  is_active: z.boolean(),
  // CLASS_TEACHER and PARENT are accepted here but never offered in the select
  // below: the form has to be able to HOLD the role a user already has, or
  // opening their row and pressing Save would silently change it.
  //
  // CLASS_TEACHER is granted and revoked by assigning classes on Teacher
  // Mappings. PARENT is granted by creating the account on Families, which
  // mints the login and its links to children together — a parent with no
  // links can see nothing, so the role on its own is never what anyone wants.
  role: z.enum(['ADMIN', 'CLASS_TEACHER', 'TEACHER', 'STUDENT', 'PARENT']),
  programs: z.array(z.enum(['LMS', 'TUITION'])).min(1, 'Pick at least one'),
})
export type EditValues = z.infer<typeof editSchema>

/** Pulls just the profile fields off a user, dropping the account columns. */
export function profileOf(user: UserOut): UserProfileFields {
  const {
    id: _id,
    full_name: _name,
    email: _email,
    role: _role,
    is_active: _active,
    created_at: _created,
    updated_at: _updated,
    firebase_uid: _uid,
    programs: _programs,
    ...profile
  } = user
  return profile
}

export default function AdminUsersPage() {
  const navigate = useNavigate()
  const usersQuery = useUsers()
  // Who is online right now: the green-or-red dot on every avatar below.
  const presence = usePresenceMap()
  const deactivateUser = useDeactivateUser()
  const reactivateUser = useReactivateUser()
  // Page-level, for the bulk session-year assignment; the edit dialog holds
  // its own instance for the single-user save.
  const bulkUpdateUser = useUpdateUser()
  const [importOpen, setImportOpen] = React.useState(false)
  const [deactivating, setDeactivating] = React.useState<UserOut | null>(null)

  /**
   * Permanent delete is a two-step conversation with the server, not a single
   * confirm: without `force` the first attempt is EXPECTED to 409 with a list
   * of what still references the user. That list is the only honest basis for
   * asking whether to cascade, so it is fetched by trying, then shown.
   */
  const permanentDelete = usePermanentlyDeleteUser()
  const [erasing, setErasing] = React.useState<UserOut | null>(null)
  const [blockedBy, setBlockedBy] = React.useState<string | null>(null)

  const onErase = React.useCallback((user: UserOut) => {
    setBlockedBy(null)
    setErasing(user)
  }, [])

  const runErase = async (force: boolean) => {
    if (!erasing) return
    try {
      await permanentDelete.mutateAsync({ userId: erasing.id, force })
      setErasing(null)
      setBlockedBy(null)
    } catch (error) {
      // 409 without force means "referenced" — the actionable case. Anything
      // else (own account, last admin) is terminal and closes the dialog.
      if (!force && error instanceof ApiError && error.status === 409) {
        setBlockedBy(error.message)
        return
      }
      toast.error(error instanceof ApiError ? error.message : 'Could not delete the user.')
      setErasing(null)
    }
  }
  const [viewing, setViewing] = React.useState<UserOut | null>(null)
  const [bulkDeactivate, setBulkDeactivate] = React.useState<UserOut[] | null>(null)
  const bulk = useBatchRunner<number>()

  /**
   * Bulk assignment to a session year.
   *
   * Its own runner rather than sharing `bulk`: the two dialogs can both be
   * open across a render, and one progress list serving both would show the
   * deactivation's rows under the year dialog's heading.
   */
  const [bulkYear, setBulkYear] = React.useState<UserOut[] | null>(null)
  const [bulkYearId, setBulkYearId] = React.useState<string>('')
  const yearRunner = useBatchRunner<{ userId: number; yearId: number }>()
  const academicYears = useAcademicYears({ withCounts: false })

  const generateCredentials = useGenerateCredentials()
  const [issuingFor, setIssuingFor] = React.useState<UserOut | null>(null)
  const [sendEmail, setSendEmail] = React.useState(true)

  /**
   * Held in component state only. This is the one copy of the password in the
   * app and it dies with the modal — it is never cached, logged, or persisted.
   */
  const [issued, setIssued] = React.useState<CredentialsIssued | null>(null)

  /**
   * Which users have had credentials issued during THIS session.
   *
   * The API exposes no "has credentials" flag, so a pending badge cannot be
   * derived from the server. Tracking it locally is honest as far as it goes:
   * it marks what we know we did, and says nothing about users provisioned
   * before this page was opened. Deliberately not persisted — a stale
   * localStorage entry would claim credentials exist when they may not.
   */
  const [issuedIds, setIssuedIds] = React.useState<Set<number>>(() => new Set())

  React.useEffect(() => {
    if (issuingFor) setSendEmail(true)
  }, [issuingFor])

  const runGenerate = async () => {
    if (!issuingFor) return
    try {
      const result = await generateCredentials.mutateAsync({
        userId: issuingFor.id,
        options: { send_email: sendEmail },
      })
      setIssuedIds((prev) => new Set(prev).add(result.user_id))
      setIssuingFor(null)
      setIssued(result)
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null
      toast.error(
        apiError?.status === 503
          ? 'Firebase Auth could not be reached. Nothing was changed — try again.'
          : (apiError?.message ?? 'Could not generate credentials.'),
      )
      setIssuingFor(null)
    }
  }

  const columns = React.useMemo<ColumnDef<UserOut, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'User',
        accessorFn: (row) => row.full_name,
        cell: ({ row }) => {
          const seen = presence.byId.get(row.original.id)
          return (
            <UserCell
              name={row.original.full_name}
              email={row.original.email}
              inactive={!row.original.is_active}
              presence={
                presence.isPending
                  ? null
                  : { online: !!seen?.is_online, lastSeenAt: seen?.last_seen_at ?? null }
              }
            />
          )
        },
      },
      {
        id: 'role',
        header: 'Role',
        accessorFn: (row) => row.role,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => <RoleBadge role={row.original.role} size="sm" />,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) => (row.is_active ? 'Active' : 'Inactive'),
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <ActiveBadge active={row.original.is_active} />
            {/* Only ever a positive claim. The API has no "has credentials"
                flag, so we can say what we issued this session but never that
                a user is missing credentials. */}
            {issuedIds.has(row.original.id) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge tone="info" size="sm">
                    <KeyRound />
                    Issued
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Credentials were generated for this user during this session.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        ),
      },
      {
        id: 'created_at',
        header: 'Created',
        accessorFn: (row) => row.created_at,
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm text-muted-foreground">{formatRelative(row.original.created_at)}</span>
            </TooltipTrigger>
            <TooltipContent>{formatDateTime(row.original.created_at)}</TooltipContent>
          </Tooltip>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const user = row.original
          return (
            // Contained so opening the menu doesn't also trigger the row click.
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.full_name}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setIssuingFor(user)}>
                    <KeyRound />
                    Generate credentials
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setViewing(user)}>
                    <Eye />
                    View details
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => navigate(`/admin/users/${user.id}/edit`)}>
                    <Pencil />
                    Edit details
                  </DropdownMenuItem>
                  {user.is_active ? (
                    <DropdownMenuItem destructive onSelect={() => setDeactivating(user)}>
                      <UserX />
                      Deactivate
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => reactivateUser.mutate(user.id)}>
                      <UserCheck />
                      Reactivate
                    </DropdownMenuItem>
                  )}
                  {/* Erasing is a separate, rarer decision from deactivating,
                      so it sits below rather than replacing it. */}
                  <DropdownMenuItem destructive onSelect={() => onErase(user)}>
                    <Trash2 />
                    Delete permanently
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ],
    [reactivateUser, onErase, presence],
  )

  const counts = React.useMemo(() => {
    const users = usersQuery.data ?? []
    return {
      total: users.length,
      admins: users.filter((u) => u.role === 'ADMIN').length,
      // Both teaching roles: a class teacher is a teacher, and counting only
      // the plain ones would make the headcount drop every time one is promoted.
      teachers: users.filter((u) => isTeachingRole(u.role)).length,
      classTeachers: users.filter((u) => u.role === 'CLASS_TEACHER').length,
      students: users.filter((u) => u.role === 'STUDENT').length,
      inactive: users.filter((u) => !u.is_active).length,
    }
  }, [usersQuery.data])

  return (
    <>
      <PageHeader
        title="Users"
        description="Every account in the system. Accounts are deactivated rather than deleted, so records that reference them stay intact."
        actions={
          <>
            <Button variant="outline" icon={<Upload />} onClick={() => setImportOpen(true)}>
              Import CSV
            </Button>
            <Button asChild variant="primary" icon={<UserPlus />}>
              <Link to="/admin/users/new">Add user</Link>
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">{counts.total} total</Badge>
          <Badge tone={presence.onlineCount > 0 ? 'success' : 'neutral'} dot={presence.onlineCount > 0}>
            {presence.onlineCount} online now
          </Badge>
          <Badge tone="primary">
            <ShieldCheck />
            {counts.admins} admins
          </Badge>
          <Badge tone="info">{counts.teachers} teachers</Badge>
          {counts.classTeachers > 0 && (
            <Badge tone="warning">{counts.classTeachers} lead a class</Badge>
          )}
          <Badge tone="accent">{counts.students} students</Badge>
          {counts.inactive > 0 && <Badge tone="warning">{counts.inactive} inactive</Badge>}
        </div>
      </PageHeader>

      <DataTable
        columns={columns}
        data={usersQuery.data}
        isLoading={usersQuery.isPending}
        error={usersQuery.error}
        onRetry={() => usersQuery.refetch()}
        getRowId={(row) => String(row.id)}
        onRowClick={(row) => setViewing(row)}
        searchPlaceholder="Search name or email…"
        searchParamKey="q"
        bulkActions={{
          // Already-inactive accounts have nothing to deactivate, so keeping
          // them selectable would let the count promise work that never happens.
          isSelectable: (user) => user.is_active,
          render: (selected) => {
            // Only students have a session year, so the action appears only
            // when the selection is entirely students — offering it over a
            // mixed selection would promise work that silently skips rows.
            const students = selected.filter((u) => u.role === 'STUDENT')
            return (
              <>
                {students.length === selected.length && students.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<CalendarRange />}
                    onClick={() => {
                      setBulkYearId('')
                      setBulkYear(students)
                    }}
                  >
                    Set session year for {students.length}
                  </Button>
                )}
                <Button
                  variant="danger"
                  size="sm"
                  icon={<UserX />}
                  onClick={() => setBulkDeactivate(selected)}
                >
                  Deactivate {selected.length}
                </Button>
              </>
            )
          },
        }}
        searchValues={(row) => [row.full_name, row.email, row.role]}
        initialSorting={[{ id: 'name', desc: false }]}
        facets={[
          {
            columnId: 'role',
            label: 'Role',
            // ALL_ROLES, not ROLES — a filter has to offer the roles that
            // exist, including the one only the backend assigns.
            options: ALL_ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] })),
          },
          {
            columnId: 'status',
            label: 'Status',
            options: [
              { value: 'Active', label: 'Active' },
              { value: 'Inactive', label: 'Inactive' },
            ],
          },
        ]}
        csv={{
          filename: 'users',
          columns: [
            { header: 'Name', value: (u) => u.full_name },
            { header: 'Email', value: (u) => u.email },
            { header: 'Role', value: (u) => u.role },
            // Absent reads as school-only, matching the backend's own default.
            { header: 'Programmes', value: (u) => (u.programs?.length ? u.programs : ['LMS']).join(' + ') },
            { header: 'Active', value: (u) => (u.is_active ? 'Yes' : 'No') },
            { header: 'Created', value: (u) => u.created_at },
          ],
        }}
        emptyState={
          <EmptyState
            title="No users yet"
            description="Create the first teacher or student account to get started."
            action={
              <Button asChild variant="primary" icon={<UserPlus />}>
                <Link to="/admin/users/new">Add user</Link>
              </Button>
            }
          />
        }
      />

      <ImportUsersDialog open={importOpen} onOpenChange={setImportOpen} />

      <ConfirmDialog
        open={!!issuingFor}
        onOpenChange={(v) => !v && !generateCredentials.isPending && setIssuingFor(null)}
        title={`Generate credentials for ${issuingFor?.full_name ?? 'this user'}?`}
        description={
          issuingFor && issuedIds.has(issuingFor.id)
            ? 'This replaces the password issued earlier. The current one stops working immediately and they are signed out everywhere.'
            : 'A new password is created and emailed to them. If they already have one, it stops working immediately and they are signed out everywhere.'
        }
        confirmLabel="Generate"
        loading={generateCredentials.isPending}
        onConfirm={runGenerate}
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-border px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Will be sent to</p>
            <p className="mt-0.5 truncate font-mono text-sm">{issuingFor?.email}</p>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2.5">
            <Checkbox
              checked={sendEmail}
              onCheckedChange={(v) => setSendEmail(v === true)}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium">Email the credentials</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Turn this off if their mailbox does not exist yet — you will still see the password
                once and can pass it on yourself.
              </span>
            </span>
          </label>

          {issuingFor && !issuingFor.is_active && (
            <p className="rounded-lg border border-info/30 bg-info/8 px-3 py-2 text-xs">
              This account is deactivated. Issuing credentials reactivates it.
            </p>
          )}
        </div>
      </ConfirmDialog>

      <CredentialsModal credentials={issued} onClose={() => setIssued(null)} />

      <ConfirmDialog
        open={!!bulkDeactivate}
        onOpenChange={(v) => !v && !bulk.running && setBulkDeactivate(null)}
        title={`Deactivate ${bulkDeactivate?.length ?? 0} accounts?`}
        description="Each account's Firebase sign-in is disabled and its sessions revoked. History is kept, and any of them can be reactivated individually."
        confirmLabel={`Deactivate ${bulkDeactivate?.length ?? 0}`}
        destructive
        loading={bulk.running}
        onConfirm={async () => {
          if (!bulkDeactivate) return
          // No bulk endpoint exists, so these go one at a time and report
          // per-row outcomes rather than a single all-or-nothing result.
          const { succeeded, failed } = await bulk.run(
            bulkDeactivate.map((user) => ({
              key: String(user.id),
              label: user.full_name,
              payload: user.id,
            })),
            (userId) => deactivateUser.mutateAsync(userId),
          )
          if (failed === 0) {
            toast.success(`${succeeded} accounts deactivated`)
            setBulkDeactivate(null)
            bulk.reset()
          } else {
            toast.warning(`${succeeded} deactivated, ${failed} failed`)
          }
        }}
      >
        {bulk.items.length > 0 && (
          <BatchProgress
            items={bulk.items}
            percent={bulk.percent}
            done={bulk.done}
            total={bulk.total}
          />
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!bulkYear}
        onOpenChange={(v) => {
          if (v || yearRunner.running) return
          setBulkYear(null)
          yearRunner.reset()
        }}
        title={`Set the session year for ${bulkYear?.length ?? 0} students`}
        description="This decides which fee structure and instalment plan each of them is billed under. It does not move them between classes."
        confirmLabel={`Assign ${bulkYear?.length ?? 0}`}
        loading={yearRunner.running}
        onConfirm={async () => {
          if (!bulkYear || !bulkYearId) return
          // No bulk endpoint exists — `PUT /admin/users/{id}` one at a time,
          // reporting per-row outcomes so a partial failure names who was and
          // was not moved.
          const yearId = Number(bulkYearId)
          const { succeeded, failed } = await yearRunner.run(
            bulkYear.map((user) => ({
              key: String(user.id),
              label: user.full_name,
              payload: { userId: user.id, yearId },
            })),
            ({ userId, yearId: id }) =>
              bulkUpdateUser.mutateAsync({ userId, body: { academic_year_id: id } }),
          )
          if (failed === 0) {
            toast.success(`${succeeded} students moved`)
            setBulkYear(null)
            yearRunner.reset()
          } else {
            toast.warning(`${succeeded} moved, ${failed} failed`)
          }
        }}
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="bulk-year">Session year</Label>
            <Select value={bulkYearId} onValueChange={setBulkYearId}>
              <SelectTrigger id="bulk-year">
                <SelectValue placeholder="Pick a year…" />
              </SelectTrigger>
              <SelectContent>
                {(academicYears.data ?? []).map((year) => (
                  <SelectItem key={year.id} value={String(year.id)}>
                    {year.name}
                    {year.is_current ? ' · current' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {academicYears.data?.length === 0 && (
              <p className="text-xs text-warning">
                No session years exist yet — create one under Admissions first.
              </p>
            )}
          </div>

          {yearRunner.items.length > 0 && (
            <BatchProgress
              items={yearRunner.items}
              percent={yearRunner.percent}
              done={yearRunner.done}
              total={yearRunner.total}
            />
          )}
        </div>
      </ConfirmDialog>

      <UserDetailSheet
        user={viewing}
        onClose={() => setViewing(null)}
        onEdit={(user) => {
          setViewing(null)
          navigate(`/admin/users/${user.id}/edit`)
        }}
        onDeactivate={(user) => {
          setViewing(null)
          setDeactivating(user)
        }}
        onGenerateCredentials={(user) => {
          setViewing(null)
          setIssuingFor(user)
        }}
      />

      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(v) => !v && setDeactivating(null)}
        title={`Deactivate ${deactivating?.full_name ?? 'this user'}?`}
        description="Their Firebase sign-in is disabled and any active session is revoked immediately. Attendance, grades and other records are kept, and you can reactivate the account at any time."
        confirmLabel="Deactivate"
        destructive
        loading={deactivateUser.isPending}
        onConfirm={() => {
          if (!deactivating) return
          deactivateUser.mutate(deactivating.id, { onSettled: () => setDeactivating(null) })
        }}
      />

      <ConfirmDialog
        open={!!erasing}
        onOpenChange={(v) => {
          if (!v && !permanentDelete.isPending) {
            setErasing(null)
            setBlockedBy(null)
          }
        }}
        title={
          blockedBy
            ? `${erasing?.full_name ?? 'This user'} still has records`
            : `Permanently delete ${erasing?.full_name ?? 'this user'}?`
        }
        description={
          blockedBy
            ? undefined
            : 'This erases the profile and the Firebase login. It cannot be undone. Deactivating instead keeps their history intact and can be reversed at any time.'
        }
        confirmLabel={blockedBy ? 'Delete the user and all of it' : 'Delete permanently'}
        destructive
        loading={permanentDelete.isPending}
        onConfirm={() => void runErase(!!blockedBy)}
      >
        {blockedBy ? (
          <div className="space-y-2.5">
            <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2.5 text-sm text-danger">
              {blockedBy}
            </p>
            <p className="text-xs text-muted-foreground">
              Continuing deletes those records too, which will leave gaps in attendance and grade
              reports for the classes involved. To keep the history, close this and deactivate the
              account instead.
            </p>
          </div>
        ) : (
          <p className="rounded-lg border border-border bg-surface px-3 py-2.5 text-xs text-muted-foreground">
            If anything still references this user, the next step will list it and ask again before
            anything is removed.
          </p>
        )}
      </ConfirmDialog>
    </>
  )
}

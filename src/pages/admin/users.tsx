import type { ColumnDef } from '@tanstack/react-table'
import {
  Backpack,
  Briefcase,
  CalendarRange,
  Eye,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Presentation,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  type LucideIcon,
} from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import type { Program, UserOut, UserProfileFields, UserRole } from '@/api/types'
import { ApiError } from '@/api/errors'
import {
  useClassTeachers,
  useDeactivateUser,
  useEnrollments,
  useMappings,
  usePermanentlyDeleteUser,
  usePresenceMap,
  useReactivateUser,
  useUpdateUser,
  useUsers,
} from '@/queries/admin.queries'
import { useAcademicYears } from '@/queries/admissions.queries'
import { ALL_ROLES, ROLE_LABEL, isTeachingRole } from '@/lib/constants'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime, formatRelative } from '@/lib/datetime'
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
import { Figure, Figures, TabStrip, WorkspaceHeader, type Tone } from '@/components/layout/workspace'
import { GenerateCredentialsDialog } from './generate-credentials'
import { ImportUsersDialog } from './import-users'

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
  // Mappings. PARENT is granted by creating the account from a student's Parents & Siblings tab, which
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
    programs: _programs,
    // Set by its own upload, never by the form: a stale copy would undo it.
    photo_url: _photo,
    ...profile
  } = user
  return profile
}

/**
 * The same screen narrowed to one kind of account, for the Students, Teachers
 * and Staff menu entries. One page rather than three copies, so bulk actions,
 * credentials and imports behave identically wherever the office starts from.
 */
export type UserScope = 'students' | 'teachers' | 'staff'

/** The tabs on All Users: each kind of account, plus the deactivated ones. */
type RoleTab = 'all' | 'students' | 'teaching' | 'staff' | 'parents' | 'inactive'

const ROLE_TABS: { key: RoleTab; label: string; tone?: Tone; test: (u: UserOut) => boolean }[] = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'students', label: 'Students', tone: 'primary', test: (u) => u.role === 'STUDENT' },
  { key: 'teaching', label: 'Teachers', tone: 'info', test: (u) => isTeachingRole(u.role) },
  { key: 'staff', label: 'Staff', tone: 'success', test: (u) => u.role === 'ADMIN' },
  { key: 'parents', label: 'Parents', tone: 'warning', test: (u) => u.role === 'PARENT' },
  { key: 'inactive', label: 'Inactive', tone: 'neutral', test: (u) => !u.is_active },
]

const SCOPE_ICON: Record<UserScope, LucideIcon> = {
  students: Backpack,
  teachers: Presentation,
  staff: Briefcase,
}

const USER_SCOPES: Record<
  UserScope,
  { title: string; description: string; roles: UserRole[]; newRole: 'STUDENT' | 'TEACHER' | 'ADMIN'; add: string; empty: string }
> = {
  students: {
    title: 'Students',
    description: 'Every student account, with its session year, class and sign-in status.',
    roles: ['STUDENT'],
    newRole: 'STUDENT',
    add: 'Add student',
    empty: 'No students yet',
  },
  teachers: {
    title: 'Teachers',
    description: 'Teachers and class teachers. Class teachers lead a class as well as teaching subjects.',
    roles: ['TEACHER', 'CLASS_TEACHER'],
    newRole: 'TEACHER',
    add: 'Add teacher',
    empty: 'No teachers yet',
  },
  staff: {
    title: 'Staff',
    description: 'Administrators and office staff who run the school on this system.',
    roles: ['ADMIN'],
    newRole: 'ADMIN',
    add: 'Add staff',
    empty: 'No staff accounts yet',
  },
}

export default function AdminUsersPage({ scope }: { scope?: UserScope } = {}) {
  const navigate = useNavigate()
  const usersQuery = useUsers()
  const scoped = scope ? USER_SCOPES[scope] : null
  const scopedUsers = React.useMemo(
    () => (scoped ? usersQuery.data?.filter((u) => scoped.roles.includes(u.role)) : usersQuery.data),
    [usersQuery.data, scoped],
  )
  const roleOptions = scoped ? scoped.roles : ALL_ROLES
  const newUserPath = scoped ? `/admin/users/new?role=${scoped.newRole}` : '/admin/users/new'
  // Who is online right now: the green-or-red dot on every avatar below.
  const presence = usePresenceMap()
  const deactivateUser = useDeactivateUser()
  const reactivateUser = useReactivateUser()
  // Page-level, for the bulk session-year assignment; the edit dialog holds
  // its own instance for the single-user save.
  const bulkUpdateUser = useUpdateUser()
  const [importOpen, setImportOpen] = React.useState(false)
  const [roleTab, setRoleTab] = React.useState<RoleTab>('all')
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

  const [issuingFor, setIssuingFor] = React.useState<UserOut | null>(null)

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
              photo={row.original.photo_url}
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
        // An active demo account files under "Demo", so the Status filter can pick them out
        // with a true count; the cell still shows both tags.
        accessorFn: (row) => (!row.is_active ? 'Inactive' : row.is_demo ? 'Demo' : 'Active'),
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <ActiveBadge active={row.original.is_active} />
            {row.original.is_demo && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge tone="primary" size="sm">
                    Demo
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {row.original.demo_expires_on
                    ? `Demo account — works until ${row.original.demo_expires_on}, then deleted automatically.`
                    : 'Demo account.'}
                </TooltipContent>
              </Tooltip>
            )}
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
                  <DropdownMenuItem onSelect={() => navigate(`/admin/users/${user.id}`)}>
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
    [reactivateUser, onErase, presence, navigate],
  )


  // ---------------------------------------------------------------------------
  // Students / Teachers / Staff: a directory laid out for that kind of person,
  // with the columns the office looks people up by, and a summary strip.
  // ---------------------------------------------------------------------------
  const enrollmentsQuery = useEnrollments(scope === 'students')
  const mappingsQuery = useMappings(scope === 'teachers')
  const classTeachersQuery = useClassTeachers(scope === 'teachers')

  /** A student's class is their first enrollment — the one their portal uses. */
  const classOf = React.useMemo(() => {
    const map = new Map<number, string>()
    for (const e of enrollmentsQuery.data ?? []) if (!map.has(e.student.id)) map.set(e.student.id, e.class_room.name)
    return map
  }, [enrollmentsQuery.data])

  const subjectsOf = React.useMemo(() => {
    const map = new Map<number, Set<string>>()
    for (const m of mappingsQuery.data ?? []) {
      const set = map.get(m.teacher.id) ?? new Set<string>()
      set.add(m.subject.name)
      map.set(m.teacher.id, set)
    }
    return map
  }, [mappingsQuery.data])

  const leadsOf = React.useMemo(() => {
    const map = new Map<number, string[]>()
    for (const m of classTeachersQuery.data ?? []) map.set(m.teacher.id, [...(map.get(m.teacher.id) ?? []), m.class_room.name])
    return map
  }, [classTeachersQuery.data])

  const scopedColumns = React.useMemo<ColumnDef<UserOut, unknown>[] | null>(() => {
    if (!scope) return null
    const byId = (id: string) => columns.find((c) => c.id === id) as ColumnDef<UserOut, unknown>
    const name = (header: string): ColumnDef<UserOut, unknown> => ({ ...byId('name'), header })
    const dash = <span className="text-muted-foreground/50">—</span>
    const text = (
      id: string,
      header: string,
      get: (u: UserOut) => string | null | undefined,
      mono = false,
    ): ColumnDef<UserOut, unknown> => ({
      id,
      header,
      accessorFn: (row) => get(row) ?? '',
      cell: ({ getValue }) => {
        const value = getValue() as string
        return value ? (
          <span className={cn('whitespace-nowrap text-sm', mono && 'font-mono text-xs text-foreground/80')}>{value}</span>
        ) : (
          dash
        )
      },
    })

    if (scope === 'students') {
      return [
        name('Student'),
        text('admission_number', 'Admission no.', (u) => u.admission_number, true),
        text('roll_number', 'Roll no.', (u) => u.roll_number, true),
        {
          id: 'guardian',
          header: 'Guardian',
          accessorFn: (row) => row.guardian_name ?? '',
          cell: ({ row }) =>
            row.original.guardian_name || row.original.guardian_phone ? (
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm">{row.original.guardian_name ?? '—'}</p>
                {row.original.guardian_phone && (
                  <p className="truncate text-xs text-muted-foreground">{row.original.guardian_phone}</p>
                )}
              </div>
            ) : (
              dash
            ),
        },
        byId('status'),
        byId('actions'),
      ]
    }

    if (scope === 'teachers') {
      return [
        name('Teacher'),
        text('employee_id', 'Employee ID', (u) => u.employee_id, true),
        { ...byId('role'), header: 'Type' },
        {
          id: 'subjects',
          header: 'Subjects',
          accessorFn: (row) => subjectsOf.get(row.id)?.size ?? 0,
          cell: ({ row }) => {
            const list = [...(subjectsOf.get(row.original.id) ?? [])]
            if (list.length === 0) {
              return (
                <Badge tone="warning" size="sm">
                  Not mapped
                </Badge>
              )
            }
            return (
              <span className="text-sm">
                {list.slice(0, 2).join(', ')}
                {list.length > 2 && <span className="text-muted-foreground"> +{list.length - 2}</span>}
              </span>
            )
          },
        },
        text('leads', 'Class teacher of', (u) => (leadsOf.get(u.id) ?? []).join(', ')),
        text('phone', 'Phone', (u) => u.phone),
        byId('status'),
        byId('actions'),
      ]
    }

    return [
      name('Staff member'),
      text('employee_id', 'Employee ID', (u) => u.employee_id, true),
      text('phone', 'Phone', (u) => u.phone),
      text('date_of_joining', 'Joined', (u) => (u.date_of_joining ? formatDate(u.date_of_joining) : null)),
      byId('status'),
      byId('actions'),
    ]
  }, [scope, columns, classOf, subjectsOf, leadsOf])


  /**
   * Students under their class, teachers and staff under their designation.
   * Unplaced people sort last, where they read as a to-do rather than noise.
   */
  const NOT_ENROLLED = 'Not enrolled'
  const NO_DESIGNATION = 'Designation not set'
  const groupBy = React.useMemo(() => {
    if (!scope) return undefined
    const lastKey = scope === 'students' ? NOT_ENROLLED : NO_DESIGNATION
    const noun = scope === 'students' ? 'student' : scope === 'teachers' ? 'teacher' : 'member'
    return {
      key: (u: UserOut) =>
        scope === 'students' ? (classOf.get(u.id) ?? NOT_ENROLLED) : u.designation?.trim() || NO_DESIGNATION,
      compare: (a: string, b: string) =>
        a === lastKey ? 1 : b === lastKey ? -1 : a.localeCompare(b, undefined, { numeric: true }),
      label: (key: string, count: number) => (
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'text-xs font-semibold uppercase tracking-wider',
              key === lastKey ? 'text-warning' : 'text-foreground',
            )}
          >
            {key}
          </span>
          <span className="rounded-full bg-background px-2 py-px text-2xs font-medium tabular-nums text-muted-foreground ring-1 ring-border">
            {count} {noun}
            {count === 1 ? '' : 's'}
          </span>
        </span>
      ),
    }
  }, [scope, classOf])

  /** The figures across the top of a Students / Teachers / Staff page. */
  const summary = React.useMemo(() => {
    if (!scope) return []
    const list = scopedUsers ?? []
    const active = list.filter((u) => u.is_active).length
    const online = list.filter((u) => presence.byId.get(u.id)?.is_online).length
    const figures: { label: string; value: number; tone?: 'success' | 'warning' | 'muted' }[] = [
      { label: 'Total', value: list.length },
      { label: 'Active', value: active, tone: 'success' },
      { label: 'Online now', value: online, tone: 'success' },
    ]
    if (scope === 'students') {
      figures.push({
        label: 'Not enrolled',
        value: list.filter((u) => u.is_active && !classOf.has(u.id)).length,
        tone: 'warning',
      })
    }
    if (scope === 'teachers') {
      figures.push(
        { label: 'Class teachers', value: list.filter((u) => u.role === 'CLASS_TEACHER').length },
        { label: 'Not mapped', value: list.filter((u) => u.is_active && !subjectsOf.has(u.id)).length, tone: 'warning' },
      )
    }
    figures.push({ label: 'Inactive', value: list.length - active, tone: 'muted' })
    return figures
  }, [scope, scopedUsers, presence.byId, classOf, subjectsOf])

  const counts = React.useMemo(() => {
    const users = scopedUsers ?? []
    return {
      total: users.length,
      admins: users.filter((u) => u.role === 'ADMIN').length,
      // Both teaching roles: a class teacher is a teacher, and counting only
      // the plain ones would make the headcount drop every time one is promoted.
      teachers: users.filter((u) => isTeachingRole(u.role)).length,
      classTeachers: users.filter((u) => u.role === 'CLASS_TEACHER').length,
      students: users.filter((u) => u.role === 'STUDENT').length,
      inactive: users.filter((u) => !u.is_active).length,
      demo: users.filter((u) => u.is_active && u.is_demo).length,
    }
  }, [scopedUsers])

  const all = scopedUsers ?? []
  const shown = scope ? scopedUsers : all.filter(ROLE_TABS.find((t) => t.key === roleTab)!.test)
  const onlineNow = all.filter((u) => presence.byId.get(u.id)?.is_online).length

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title={scoped?.title ?? 'All Users'}
        description={
          scoped?.description ??
          'Every account in the school: students, teachers, staff and parents. Accounts are deactivated rather than deleted, so their records stay'
        }
        icon={scope ? SCOPE_ICON[scope] : Users}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Upload />} onClick={() => setImportOpen(true)}>
              Import CSV
            </Button>
            <Button asChild size="sm" icon={<UserPlus />}>
              <Link to={newUserPath}>{scoped?.add ?? 'Add user'}</Link>
            </Button>
          </>
        }
        tabs={
          scope ? undefined : (
            <TabStrip
              label="Accounts"
              idPrefix="users-tab"
              value={roleTab}
              onChange={setRoleTab}
              tabs={ROLE_TABS.map((t) => ({ key: t.key, label: t.label, tone: t.tone, count: all.filter(t.test).length }))}
            />
          )
        }
      />

      <div id="users-tab-panel" role={scope ? undefined : 'tabpanel'} className="-mt-6 space-y-6">
        {scope ? (
          <Figures>
            {summary.map((f) => (
              <Figure
                key={f.label}
                label={f.label}
                value={String(f.value)}
                alert={f.tone === 'warning' && f.value > 0}
                tone={f.tone === 'success' ? 'success' : f.tone === 'warning' ? 'warning' : f.tone === 'muted' ? 'neutral' : 'primary'}
              />
            ))}
          </Figures>
        ) : (
          <Figures>
            <Figure label="Total accounts" value={String(counts.total)} context={`${counts.students} students · ${counts.teachers} teachers`} tone="primary" />
            <Figure label="Active" value={String(counts.total - counts.inactive)} context="can sign in" tone="success" />
            <Figure label="Online now" value={String(onlineNow)} context="signed in recently" tone="info" />
            <Figure label="Demo accounts" value={String(counts.demo)} context="trial logins" tone="warning" />
            <Figure label="Inactive" value={String(counts.inactive)} context="cannot sign in" tone="neutral" />
          </Figures>
        )}

      <DataTable
        key={scope ?? roleTab}
        columns={scopedColumns ?? columns}
        data={shown}
        groupBy={groupBy}
        flat
        isLoading={usersQuery.isPending}
        error={usersQuery.error}
        onRetry={() => usersQuery.refetch()}
        getRowId={(row) => String(row.id)}
        onRowClick={(row) => navigate(`/admin/users/${row.id}`)}
        searchPlaceholder={scope ? 'Search name, email, ID or phone…' : 'Search name or email…'}
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
        searchValues={(row) => [
          row.full_name,
          row.email,
          row.role,
          row.admission_number ?? '',
          row.employee_id ?? '',
          row.phone ?? '',
        ]}
        initialSorting={[{ id: 'name', desc: false }]}
        facets={[
          // ALL_ROLES, not ROLES — a filter has to offer the roles that
          // exist, including the one only the backend assigns. A page
          // narrowed to one role has nothing to filter by.
          ...(scope && roleOptions.length > 1
            ? [
                {
                  columnId: 'role',
                  label: 'Role',
                  options: roleOptions.map((role) => ({ value: role, label: ROLE_LABEL[role] })),
                },
              ]
            : []),
          {
            columnId: 'status',
            label: 'Status',
            options: [
              { value: 'Active', label: 'Active' },
              { value: 'Demo', label: 'Demo account' },
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
            { header: 'Demo ends', value: (u) => (u.is_demo ? u.demo_expires_on ?? '' : '') },
            { header: 'Created', value: (u) => u.created_at },
          ],
        }}
        emptyState={
          // Flat, on the page like the table it stands in for.
          <div className="border-y border-border bg-card px-6 py-12 text-center">
            <p className="text-base font-medium text-foreground">
              {scope ? (scoped?.empty ?? 'No users yet') : roleTab === 'all' ? 'No users yet' : `No ${ROLE_TABS.find((t) => t.key === roleTab)!.label.toLowerCase()} accounts`}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Create an account, or import several from a CSV file</p>
            <Button asChild size="sm" icon={<UserPlus />} className="mt-4">
              <Link to={newUserPath}>{scoped?.add ?? 'Add user'}</Link>
            </Button>
          </div>
        }
      />
      </div>

      <ImportUsersDialog open={importOpen} onOpenChange={setImportOpen} />

      <GenerateCredentialsDialog
        user={issuingFor}
        reissue={!!issuingFor && issuedIds.has(issuingFor.id)}
        onClose={() => setIssuingFor(null)}
        onIssued={(id) => setIssuedIds((prev) => new Set(prev).add(id))}
      />

      <ConfirmDialog
        open={!!bulkDeactivate}
        onOpenChange={(v) => !v && !bulk.running && setBulkDeactivate(null)}
        title={`Deactivate ${bulkDeactivate?.length ?? 0} accounts?`}
        description="Each account's sign-in is blocked and it is signed out everywhere. History is kept, and any of them can be reactivated individually."
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


      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(v) => !v && setDeactivating(null)}
        title={`Deactivate ${deactivating?.full_name ?? 'this user'}?`}
        description="Their sign-in is blocked and they are signed out everywhere immediately. Attendance, grades and other records are kept, and you can reactivate the account at any time."
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
            : 'This erases the profile and its login. It cannot be undone. Deactivating instead keeps their history intact and can be reversed at any time.'
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
    </div>
  )
}

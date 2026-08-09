import { zodResolver } from '@hookform/resolvers/zod'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Eye,
  KeyRound,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Upload,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import type { CredentialsIssued, UserOut, UserRole } from '@/api/types'
import { ApiError } from '@/api/errors'
import {
  useCreateUser,
  useDeactivateUser,
  useGenerateCredentials,
  useReactivateUser,
  useUpdateUser,
  useUsers,
} from '@/queries/admin.queries'
import { ROLES, ROLE_LABEL } from '@/lib/constants'
import { formatDateTime, formatRelative } from '@/lib/datetime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
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
const createSchema = z.object({
  full_name: z.string().min(2, 'Enter a full name').max(120),
  email: z
    .string()
    .max(200)
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address'),
  role: z.enum(['ADMIN', 'TEACHER', 'STUDENT']),
})
type CreateValues = z.infer<typeof createSchema>

/**
 * Mirrors the server's address rule for a live hint only.
 *
 * The server is the authority — it strips accents, resolves collisions with a
 * numeric suffix, and knows the configured domain. This preview says so rather
 * than presenting itself as the final answer.
 */
function previewEmail(fullName: string): string | null {
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

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Lets the page offer to issue credentials straight after creation. */
  onCreated: (user: UserOut) => void
}) {
  const createUser = useCreateUser()
  const [overrideEmail, setOverrideEmail] = React.useState(false)

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { full_name: '', email: '', role: 'STUDENT' },
  })

  React.useEffect(() => {
    if (!open) return
    form.reset({ full_name: '', email: '', role: 'STUDENT' })
    setOverrideEmail(false)
  }, [open, form])

  const localPart = previewEmail(form.watch('full_name') ?? '')

  const onSubmit = async (values: CreateValues) => {
    const email = values.email.trim()
    try {
      // Omit both fields entirely rather than sending empty strings: null is
      // what tells the server to generate the address, and the admin never
      // supplies a password at all.
      const created = await createUser.mutateAsync({
        full_name: values.full_name,
        role: values.role,
        email: overrideEmail && email ? email : null,
        password: null,
      })
      onOpenChange(false)
      onCreated(created)
    } catch (error) {
      const message = (error as { message?: string })?.message ?? ''
      if (/already exists/i.test(message)) {
        setOverrideEmail(true)
        form.setError('email', { message: 'An account already uses this email.' })
      } else if (/email domain/i.test(message)) {
        form.setError('root', {
          message:
            'The server has no email domain configured, so it cannot generate an address. Set USER_EMAIL_DOMAIN on the backend, or enter an email manually.',
        })
        setOverrideEmail(true)
      } else {
        form.setError('root', { message })
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>
            Creates the profile and an email address. They cannot sign in until you generate
            credentials — you will be offered that next. The role cannot be changed later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-4">
            {form.formState.errors.root && (
              <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
                {form.formState.errors.root.message}
              </p>
            )}

            <Field id="full_name" label="Full name" required error={form.formState.errors.full_name?.message}>
              <Input id="full_name" placeholder="Dr. Grace Hopper" {...form.register('full_name')} />
            </Field>

            {/* Email is generated by default; the override stays collapsed so
                the common path is name → role → create. */}
            {overrideEmail ? (
              <Field
                id="email"
                label="Email"
                error={form.formState.errors.email?.message}
                hint="Leave empty to let the server generate one from the name."
              >
                <Input
                  id="email"
                  type="email"
                  placeholder="grace@institution.edu"
                  {...form.register('email')}
                />
              </Field>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Email address</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {localPart ? (
                        <>
                          Generated as{' '}
                          <code className="font-mono text-foreground">{localPart}@…</code> — the
                          server picks the domain and adds a number if it is taken.
                        </>
                      ) : (
                        'Generated from the full name once you enter one.'
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setOverrideEmail(true)}
                  >
                    Set manually
                  </Button>
                </div>
              </div>
            )}

            <Field id="role" label="Role" required error={form.formState.errors.role?.message}>
              <Select
                value={form.watch('role')}
                onValueChange={(v) => form.setValue('role', v as UserRole, { shouldValidate: true })}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- edit form

const editSchema = z.object({
  full_name: z.string().min(2, 'Enter a full name').max(120),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  is_active: z.boolean(),
})
type EditValues = z.infer<typeof editSchema>

function EditUserDialog({ user, onClose }: { user: UserOut | null; onClose: () => void }) {
  const updateUser = useUpdateUser()
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { full_name: '', email: '', is_active: true },
  })

  React.useEffect(() => {
    if (user) {
      form.reset({ full_name: user.full_name, email: user.email, is_active: user.is_active })
    }
  }, [user, form])

  const onSubmit = async (values: EditValues) => {
    if (!user) return
    await updateUser.mutateAsync({ userId: user.id, body: values })
    onClose()
  }

  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>Changes apply immediately.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-4">
            <Field id="edit_name" label="Full name" required error={form.formState.errors.full_name?.message}>
              <Input id="edit_name" {...form.register('full_name')} />
            </Field>

            <Field
              id="edit_email"
              label="Email"
              required
              error={form.formState.errors.email?.message}
              hint="Emails are not checked for uniqueness on update — take care not to create a duplicate."
            >
              <Input id="edit_email" type="email" {...form.register('email')} />
            </Field>

            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Inactive accounts cannot sign in.</p>
              </div>
              <Switch
                checked={form.watch('is_active')}
                onCheckedChange={(v) => form.setValue('is_active', v, { shouldDirty: true })}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Role</p>
                <p className="text-xs text-muted-foreground">Roles are fixed once an account is created.</p>
              </div>
              {user && <RoleBadge role={user.role} />}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// -------------------------------------------------------------------- page

export default function AdminUsersPage() {
  const usersQuery = useUsers()
  const deactivateUser = useDeactivateUser()
  const reactivateUser = useReactivateUser()

  const [createOpen, setCreateOpen] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<UserOut | null>(null)
  const [deactivating, setDeactivating] = React.useState<UserOut | null>(null)
  const [viewing, setViewing] = React.useState<UserOut | null>(null)
  const [bulkDeactivate, setBulkDeactivate] = React.useState<UserOut[] | null>(null)
  const bulk = useBatchRunner<number>()

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
                  <DropdownMenuItem onSelect={() => setEditing(user)}>
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
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ],
    [reactivateUser],
  )

  const counts = React.useMemo(() => {
    const users = usersQuery.data ?? []
    return {
      total: users.length,
      admins: users.filter((u) => u.role === 'ADMIN').length,
      teachers: users.filter((u) => u.role === 'TEACHER').length,
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
            <Button variant="primary" icon={<UserPlus />} onClick={() => setCreateOpen(true)}>
              Add user
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">{counts.total} total</Badge>
          <Badge tone="primary">
            <ShieldCheck />
            {counts.admins} admins
          </Badge>
          <Badge tone="info">{counts.teachers} teachers</Badge>
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
          render: (selected) => (
            <Button
              variant="danger"
              size="sm"
              icon={<UserX />}
              onClick={() => setBulkDeactivate(selected)}
            >
              Deactivate {selected.length}
            </Button>
          ),
        }}
        searchValues={(row) => [row.full_name, row.email, row.role]}
        initialSorting={[{ id: 'name', desc: false }]}
        facets={[
          {
            columnId: 'role',
            label: 'Role',
            options: ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] })),
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
            { header: 'Active', value: (u) => (u.is_active ? 'Yes' : 'No') },
            { header: 'Created', value: (u) => u.created_at },
          ],
        }}
        emptyState={
          <EmptyState
            title="No users yet"
            description="Create the first teacher or student account to get started."
            action={
              <Button variant="primary" icon={<UserPlus />} onClick={() => setCreateOpen(true)}>
                Add user
              </Button>
            }
          />
        }
      />

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        // A new account cannot sign in yet, so go straight to issuing
        // credentials rather than leaving the admin to find the button.
        onCreated={(user) => setIssuingFor(user)}
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
      <EditUserDialog user={editing} onClose={() => setEditing(null)} />

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

      <UserDetailSheet
        user={viewing}
        onClose={() => setViewing(null)}
        onEdit={(user) => {
          setViewing(null)
          setEditing(user)
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
    </>
  )
}

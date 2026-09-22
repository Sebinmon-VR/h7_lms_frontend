import { zodResolver } from '@hookform/resolvers/zod'
import { IdCard, Save, ShieldCheck, UserPlus } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'

import type { Program, UserOut, UserProfileFields } from '@/api/types'
import { useCreateUser, useUpdateUser, useUsers } from '@/queries/admin.queries'
import { ROLES, ROLE_LABEL } from '@/lib/constants'
import { formatDateTime } from '@/lib/datetime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field, FormError } from '@/components/forms/field'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { FormActions, FormPage, FormSection } from '@/components/forms/form-page'
import { ActiveBadge, RoleBadge } from '@/components/domain/badges'
import { ProfileFieldsSection } from '@/components/domain/profile-fields'
import { EmptyState } from '@/components/feedback/states'
import {
  ProgramsField,
  createSchema,
  previewEmail,
  editSchema,
  profileOf,
  type CreateValues,
  type EditValues,
} from './users'

/**
 * Creating and editing a user, on a page rather than in a dialog.
 *
 * A user record is the widest thing this application stores — an account, a
 * role, programme access, contact details, an address, admission or employment
 * detail, a guardian, a session year. In a modal that became a 576px column
 * with eight collapsed accordions and its own scrollbar, which is exactly the
 * shape somebody means when they say a form feels cramped.
 *
 * On a page the sections are all open, the fields run two and three across,
 * and the list behind stays reachable by the back link rather than being
 * covered by an overlay.
 *
 * The schema, the programme picker and the profile-field block are imported
 * from the list page rather than re-declared. Two definitions of "which roles
 * may be chosen" is how a form ends up accepting something the other refuses.
 */

/** The account half — the fields that are not optional profile detail. */
function AccountSection({
  mode,
  children,
}: {
  mode: 'create' | 'edit'
  children: React.ReactNode
}) {
  return (
    <FormSection
      icon={<ShieldCheck />}
      title="Account"
      description={
        mode === 'create'
          ? 'The login itself. Everything below this is optional and can be filled in later.'
          : 'Changing the role signs the user out of every device.'
      }
      columns={3}
    >
      {children}
    </FormSection>
  )
}

// ===================================================================== create

function CreateUserForm() {
  const navigate = useNavigate()
  const createUser = useCreateUser()
  const [profile, setProfile] = React.useState<UserProfileFields>({})
  const [overrideEmail, setOverrideEmail] = React.useState(false)

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      full_name: '',
      email: '',
      role: 'STUDENT',
      programs: ['LMS'],
    },
  })

  const onSubmit = async (values: CreateValues) => {
    const email = values.email.trim()
    try {
      const created = await createUser.mutateAsync({
        ...profile,
        full_name: values.full_name,
        role: values.role,
        programs: values.programs,
        // Omitted rather than blank: null is what tells the server to derive
        // the address, and the admin never supplies a password at all.
        email: overrideEmail && email ? email : null,
        password: null,
      })
      navigate('/admin/users', { state: { createdUserId: created.id } })
    } catch (error) {
      const message = (error as { message?: string })?.message ?? ''
      if (/already exists/i.test(message)) {
        setOverrideEmail(true)
        form.setError('email', { message: 'An account already uses this email.' })
      } else if (/email domain/i.test(message)) {
        setOverrideEmail(true)
        form.setError('root', {
          message:
            'The server has no email domain configured, so it cannot generate an address. Set USER_EMAIL_DOMAIN on the backend, or enter an email manually.',
        })
      } else {
        form.setError('root', { message: message || 'Could not create the account.' })
      }
    }
  }

  const role = form.watch('role')
  const emailPreview = previewEmail(form.watch('full_name'))

  return (
    <FormPage
      eyebrow="People"
      title="Add a user"
      description="Creates the account. Credentials are issued separately from the user list, which emails them a password nobody has to relay by hand."
      backTo="/admin/users"
      backLabel="Back to users"
      error={<FormError message={form.formState.errors.root?.message} />}
      footer={
        <FormActions
          cancelTo="/admin/users"
          submitLabel="Create user"
          submitIcon={<UserPlus />}
          loading={form.formState.isSubmitting}
          onSubmit={form.handleSubmit(onSubmit)}
        />
      }
    >
      <AccountSection mode="create">
        <Field
          id="full_name"
          label="Full name"
          required
          error={form.formState.errors.full_name?.message}
        >
          <Input id="full_name" placeholder="Aaruhi Hennu" {...form.register('full_name')} />
        </Field>

        <Field id="role" label="Role" required error={form.formState.errors.role?.message}>
          <Select
            value={role}
            // Narrower than UserRole: a new account cannot be created as a
            // CLASS_TEACHER or a PARENT — the backend derives the first from
            // class assignments and mints the second on the Families screen.
            onValueChange={(v) =>
              form.setValue('role', v as CreateValues['role'], { shouldValidate: true })
            }
          >
            <SelectTrigger id="role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="sm:col-span-2 lg:col-span-3">
          {overrideEmail ? (
            <Field
              id="email"
              label="Email"
              error={form.formState.errors.email?.message}
              hint="Leave blank and the server derives one from the name."
            >
              <Input id="email" type="email" {...form.register('email')} />
            </Field>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm">
                  {/* A hint, not the final answer — the server strips accents,
                      resolves collisions with a numeric suffix and knows the
                      configured domain. Said plainly so nobody reads it as a
                      promise. */}
                  {emailPreview ? (
                    <>
                      Will be something like{' '}
                      <span className="font-medium">{emailPreview}@…</span>
                    </>
                  ) : (
                    'The email address is generated from the name.'
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  The server picks the domain and resolves any collision.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setOverrideEmail(true)}>
                Set it manually
              </Button>
            </div>
          )}
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <ProgramsField
            value={form.watch('programs') as Program[]}
            onChange={(next) => form.setValue('programs', next, { shouldDirty: true })}
            error={form.formState.errors.programs?.message}
          />
        </div>
      </AccountSection>

      <FormSection
        icon={<IdCard />}
        title="Profile detail"
        description="All optional. A school onboarding a hundred students has partial data for most of them, and the API is built to accept that."
      >
        <ProfileFieldsSection
          role={role}
          value={profile}
          onChange={(patch) => setProfile((prev) => ({ ...prev, ...patch }))}
          mode="create"
          layout="page"
        />
      </FormSection>
    </FormPage>
  )
}

// ======================================================================= edit

function EditUserForm({ user }: { user: UserOut }) {
  const navigate = useNavigate()
  const updateUser = useUpdateUser()
  const [profile, setProfile] = React.useState<UserProfileFields>(() => profileOf(user))
  /** Holds a pending role change until it is confirmed. */
  const [confirmRole, setConfirmRole] = React.useState<EditValues | null>(null)

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      full_name: user.full_name,
      email: user.email,
      is_active: user.is_active,
      role: user.role,
      // Absent on profiles that predate the tuition module, which read as
      // school-only — the safe direction, and what the backend assumes too.
      programs: user.programs?.length ? user.programs : ['LMS'],
    },
  })

  const save = async (values: EditValues) => {
    try {
      await updateUser.mutateAsync({
        userId: user.id,
        body: {
          ...profile,
          full_name: values.full_name,
          email: values.email,
          is_active: values.is_active,
          // Only sent when it actually changed — including it unchanged would
          // still revoke the user's tokens and sign them out for nothing.
          ...(values.role !== user.role && { role: values.role }),
          programs: values.programs,
        },
      })
      navigate('/admin/users')
    } catch (error) {
      form.setError('root', {
        message: (error as { message?: string })?.message ?? 'Could not save the account.',
      })
    }
  }

  const onSubmit = async (values: EditValues) => {
    // A role change signs the user out everywhere, so it gets its own step
    // rather than riding along with a rename.
    if (values.role !== user.role) {
      setConfirmRole(values)
      return
    }
    await save(values)
  }

  const role = form.watch('role')
  const roleOptions =
    user.role === 'CLASS_TEACHER' || user.role === 'PARENT' ? [user.role, ...ROLES] : ROLES

  return (
    <FormPage
      eyebrow="People"
      title={user.full_name}
      description="Changes apply immediately. Profile detail is saved with the account."
      backTo="/admin/users"
      backLabel="Back to users"
      error={<FormError message={form.formState.errors.root?.message} />}
      meta={
        <>
          <RoleBadge role={user.role} />
          <ActiveBadge active={user.is_active} />
          {user.admission_number && (
            <Badge tone="outline" size="sm">
              {user.admission_number}
            </Badge>
          )}
          {user.employee_id && (
            <Badge tone="outline" size="sm">
              {user.employee_id}
            </Badge>
          )}
        </>
      }
      aside={
        <Card className="space-y-3 p-5">
          <h3 className="text-sm font-semibold">Account</h3>
          <dl className="space-y-3">
            <div className="space-y-1">
              <dt className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                Created
              </dt>
              <dd className="text-sm font-medium">{formatDateTime(user.created_at)}</dd>
            </div>
            {user.updated_at && (
              <div className="space-y-1">
                <dt className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                  Last updated
                </dt>
                <dd className="text-sm font-medium">{formatDateTime(user.updated_at)}</dd>
              </div>
            )}
          </dl>
          <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            Emptying a profile field leaves the stored value unchanged — this endpoint cannot
            clear one.
          </p>
        </Card>
      }
      footer={
        <FormActions
          cancelTo="/admin/users"
          submitLabel="Save changes"
          submitIcon={<Save />}
          loading={form.formState.isSubmitting}
          onSubmit={form.handleSubmit(onSubmit)}
        />
      }
    >
      <AccountSection mode="edit">
        <Field
          id="edit_full_name"
          label="Full name"
          required
          error={form.formState.errors.full_name?.message}
        >
          <Input id="edit_full_name" {...form.register('full_name')} />
        </Field>

        <Field
          id="edit_email"
          label="Email"
          required
          error={form.formState.errors.email?.message}
          hint="Not checked for uniqueness on update — take care not to create a duplicate."
        >
          <Input id="edit_email" type="email" {...form.register('email')} />
        </Field>

        <Field
          id="edit_role"
          label="Role"
          required
          error={form.formState.errors.role?.message}
          hint={
            user.role === 'CLASS_TEACHER'
              ? '“Class teacher” is set by assigning them a class, not chosen here — moving them off it will be undone the next time their assignments change.'
              : undefined
          }
        >
          <Select
            value={role}
            onValueChange={(v) =>
              form.setValue('role', v as EditValues['role'], { shouldDirty: true })
            }
          >
            <SelectTrigger id="edit_role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* A class teacher's or a parent's own role is listed so the form
                  can show what they actually are, but is never offered to
                  anybody who is not already one. */}
              {roleOptions.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field id="edit_active" label="Status">
          <label className="flex h-9.5 items-center justify-between gap-4 rounded-md border border-input bg-card px-3.5">
            <span className="text-sm">
              {form.watch('is_active') ? 'Active' : 'Inactive — cannot sign in'}
            </span>
            <Switch
              checked={form.watch('is_active')}
              onCheckedChange={(v) => form.setValue('is_active', v, { shouldDirty: true })}
            />
          </label>
        </Field>

        {user.role === 'PARENT' && (
          <p className="rounded-lg border border-info/30 bg-info/8 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground sm:col-span-2 lg:col-span-3">
            This is a guardian's login. What they can see is decided per child on{' '}
            <strong>Families → Parent accounts</strong>, not here.
          </p>
        )}

        <div className="sm:col-span-2 lg:col-span-3">
          <ProgramsField
            value={form.watch('programs') as Program[]}
            onChange={(next) => form.setValue('programs', next, { shouldDirty: true })}
            error={form.formState.errors.programs?.message}
          />
        </div>
      </AccountSection>

      <FormSection
        icon={<IdCard />}
        title="Profile detail"
        description="Contact, address, admission and guardian information."
      >
        <ProfileFieldsSection
          role={role}
          value={profile}
          onChange={(patch) => setProfile((prev) => ({ ...prev, ...patch }))}
          mode="edit"
          layout="page"
        />
      </FormSection>

      <ConfirmDialog
        open={!!confirmRole}
        onOpenChange={(v) => !v && setConfirmRole(null)}
        title="Change this user's role?"
        description="Their sessions are revoked and they are signed out of every device. They will need to sign in again."
        confirmLabel="Change role"
        destructive
        loading={updateUser.isPending}
        onConfirm={async () => {
          if (confirmRole) await save(confirmRole)
          setConfirmRole(null)
        }}
      />
    </FormPage>
  )
}

// ====================================================================== route

export default function AdminUserFormPage() {
  const { userId } = useParams<{ userId: string }>()
  const isEdit = !!userId

  /**
   * The directory, not a per-user fetch.
   *
   * There is no `GET /admin/users/{id}`, and the list is already cached by
   * every screen that links here — so opening this form from the table costs
   * no request at all.
   */
  const users = useUsers()
  const user = users.data?.find((u) => String(u.id) === userId)

  if (!isEdit) return <CreateUserForm />

  if (users.isPending) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <Skeleton className="h-12 w-64 rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    )
  }

  if (!user) {
    return (
      <EmptyState
        icon={<ShieldCheck />}
        title="No such user"
        description="The account may have been permanently deleted."
        action={
          <Button asChild>
            <a href="/admin/users">Back to users</a>
          </Button>
        }
      />
    )
  }

  // Keyed so switching between two users remounts the form rather than
  // leaving the previous record's values in the inputs.
  return <EditUserForm key={user.id} user={user} />
}

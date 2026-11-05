import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ChevronLeft, ChevronRight, FlaskConical, IdCard, Save, ShieldCheck, UserPlus } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import type { Program, UserOut, UserProfileFields } from '@/api/types'
import { useCreateEnrollment, useCreateUser, useUpdateUser, useUsers } from '@/queries/admin.queries'
import { ROLES, ROLE_LABEL } from '@/lib/constants'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/datetime'
import { Button } from '@/components/ui/button'
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
import { ProfileFieldsSection, sectionAnchor } from '@/components/domain/profile-fields'
import { PhotoField } from '@/components/domain/photo-field'
import { StudentFamily } from './student-family'
import {
  DemoAccessFields,
  DemoBadge,
  demoAccessOf,
  demoAccessPayload,
  demoAccessProblem,
  type DemoAccessValue,
} from '@/components/domain/demo-account'
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

/**
 * Demo access, for students only: a family trying the school before admission.
 * See src/lib/demo.ts for what it locks and app/core/demo.py for the rule.
 */
function DemoSection({
  value,
  onChange,
  error,
}: {
  value: DemoAccessValue
  onChange: (next: DemoAccessValue) => void
  error: string | null
}) {
  return (
    <FormSection
      icon={<FlaskConical />}
      title="Demo access"
      description="Give a prospective student a trial login with classes only, ending on a date you choose."
    >
      <div className="sm:col-span-2 lg:col-span-3">
        <DemoAccessFields value={value} onChange={onChange} error={error} />
      </div>
    </FormSection>
  )
}

// ===================================================================== create

function CreateUserForm() {
  const navigate = useNavigate()
  const createUser = useCreateUser()
  // The Students / Teachers / Staff pages send their role along, so "Add
  // teacher" opens a teacher form rather than a student one.
  const [searchParams] = useSearchParams()
  const presetRole = createSchema.shape.role.safeParse(searchParams.get('role'))
  // Opened from a class ("Open the full form"): enroll the new student there
  // and go back to that class.
  const presetClassId = Number(searchParams.get('class_id')) || null
  const createEnrollment = useCreateEnrollment()
  const [profile, setProfile] = React.useState<UserProfileFields>({})
  const [overrideEmail, setOverrideEmail] = React.useState(false)
  const [demoAccess, setDemoAccess] = React.useState<DemoAccessValue>(() => demoAccessOf())
  const [demoError, setDemoError] = React.useState<string | null>(null)

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      full_name: '',
      email: '',
      role: presetRole.success ? presetRole.data : 'STUDENT',
      programs: ['LMS'],
    },
  })

  const onSubmit = async (values: CreateValues) => {
    const email = values.email.trim()
    const isStudent = values.role === 'STUDENT'
    const problem = isStudent ? demoAccessProblem(demoAccess) : null
    setDemoError(problem)
    if (problem) return
    try {
      const created = await createUser.mutateAsync({
        ...profile,
        ...(isStudent && demoAccess.is_demo ? demoAccessPayload(demoAccess) : {}),
        full_name: values.full_name,
        role: values.role,
        programs: values.programs,
        // Omitted rather than blank: null is what tells the server to derive
        // the address, and the admin never supplies a password at all.
        email: overrideEmail && email ? email : null,
        password: null,
      })
      if (presetClassId && isStudent) {
        try {
          await createEnrollment.mutateAsync({ student_id: created.id, class_id: presetClassId })
        } catch {
          toast.warning('The student was created but not enrolled. Enroll them from the class.')
        }
        navigate(`/admin/classes?class=${presetClassId}`)
        return
      }
      // Back to the list the form was opened from, where the new account shows.
      const listPath = presetRole.success
        ? { STUDENT: '/admin/students', TEACHER: '/admin/teachers', ADMIN: '/admin/staff' }[values.role]
        : '/admin/users'
      navigate(listPath, { state: { createdUserId: created.id } })
    } catch (error) {
      const message = (error as { message?: string })?.message ?? ''
      if (/already exists/i.test(message)) {
        setOverrideEmail(true)
        form.setError('email', { message: 'An account already uses this email.' })
      } else if (/email domain/i.test(String((error as { detail?: unknown })?.detail ?? message))) {
        setOverrideEmail(true)
        form.setError('root', {
          message:
            "An email address couldn't be created automatically. Please enter one.",
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
            // class assignments and mints the second from a student's Parents & Siblings tab.
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
              hint="Leave blank to create one from the name."
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
        description="All optional. You can fill these in later."
      >
        <ProfileFieldsSection
          role={role}
          value={profile}
          onChange={(patch) => setProfile((prev) => ({ ...prev, ...patch }))}
          mode="create"
          layout="page"
        />
      </FormSection>

      {role === 'STUDENT' && (
        <DemoSection value={demoAccess} onChange={setDemoAccess} error={demoError} />
      )}
    </FormPage>
  )
}

// ======================================================================= edit

/**
 * One tab of the edit page: a heading over its fields. Registers itself in
 * the tab list through `data-nav-section`, the same marker the profile-detail
 * sections carry.
 */
function EditSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section id={sectionAnchor(title)} data-nav-section={title} className="space-y-5">
      <div className="border-b border-border pb-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/**
 * Tabs built from the sections actually on the page, so they follow the role
 * (a student has Guardian, a teacher has Employment) without a second list to
 * keep in step.
 *
 * Every section stays mounted and only the inactive ones are hidden, so what
 * was typed in one tab is still there after visiting another, and one Save
 * sends all of it.
 */
function useSectionTabs(container: React.RefObject<HTMLElement>, deps: unknown[]) {
  const [sections, setSections] = React.useState<{ id: string; title: string }[]>([])
  const [activeId, setActiveId] = React.useState<string | null>(null)

  React.useLayoutEffect(() => {
    const root = container.current
    if (!root) return
    const nodes = [...root.querySelectorAll<HTMLElement>('[data-nav-section]')]
    setSections(nodes.map((n) => ({ id: n.id, title: n.dataset.navSection ?? '' })))
    setActiveId((prev) => (prev && nodes.some((n) => n.id === prev) ? prev : (nodes[0]?.id ?? null)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  // `hidden` is not set from JSX on these elements, so React leaves it alone
  // and it has to be reapplied whenever a section mounts.
  React.useLayoutEffect(() => {
    container.current?.querySelectorAll<HTMLElement>('[data-nav-section]').forEach((n) => {
      n.hidden = n.id !== activeId
    })
  })

  return { sections, activeId, setActiveId }
}

function EditUserForm({ user }: { user: UserOut }) {
  const navigate = useNavigate()
  const updateUser = useUpdateUser()
  // Taken once: `user` is refreshed in place when the photo changes, and a
  // re-derived baseline would make untouched fields read as edited.
  const [initialProfile] = React.useState(() => profileOf(user))
  const [initialDemo] = React.useState(() => demoAccessOf(user))
  const [profile, setProfile] = React.useState<UserProfileFields>(initialProfile)
  /** Holds a pending role change until it is confirmed. */
  const [confirmRole, setConfirmRole] = React.useState<EditValues | null>(null)
  const [demoAccess, setDemoAccess] = React.useState<DemoAccessValue>(initialDemo)
  const [demoError, setDemoError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)

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

  const profileUrl = `/admin/users/${user.id}`
  const role = form.watch('role')
  const roleOptions =
    user.role === 'CLASS_TEACHER' || user.role === 'PARENT' ? [user.role, ...ROLES] : ROLES

  const mainRef = React.useRef<HTMLDivElement>(null)
  const tabs = useSectionTabs(mainRef, [role])
  const activeIndex = tabs.sections.findIndex((s) => s.id === tabs.activeId)
  const prevTab = activeIndex > 0 ? tabs.sections[activeIndex - 1] : null
  const nextTab = activeIndex >= 0 && activeIndex < tabs.sections.length - 1 ? tabs.sections[activeIndex + 1] : null
  const openTab = (id: string) => {
    tabs.setActiveId(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Anything typed and not yet saved, across the account fields, the profile
  // detail and demo access — the three pieces of state this page edits.
  const dirty =
    !saved &&
    (form.formState.isDirty ||
      JSON.stringify(profile) !== JSON.stringify(initialProfile) ||
      JSON.stringify(demoAccess) !== JSON.stringify(initialDemo))

  // Closing the tab or reloading with edits pending asks first.
  React.useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = async (values: EditValues) => {
    const isStudent = values.role === 'STUDENT'
    const problem = isStudent ? demoAccessProblem(demoAccess) : null
    setDemoError(problem)
    if (problem) {
      openTab(sectionAnchor('Demo access'))
      return
    }
    // The photo is uploaded on its own (see PhotoField); sending the URL
    // held here could put back a photo that was just replaced.
    const { photo_url: _photo, ...profileBody } = profile
    try {
      await updateUser.mutateAsync({
        userId: user.id,
        body: {
          ...profileBody,
          // Sent when it is or was a demo, so switching it off reaches the server.
          ...(isStudent && (demoAccess.is_demo || user.is_demo) ? demoAccessPayload(demoAccess) : {}),
          full_name: values.full_name,
          email: values.email,
          is_active: values.is_active,
          // Only sent when it actually changed — including it unchanged would
          // still revoke the user's tokens and sign them out for nothing.
          ...(values.role !== user.role && { role: values.role }),
          programs: values.programs,
        },
      })
      setSaved(true)
      // Back to their page, which now shows what was saved.
      navigate(profileUrl)
    } catch (error) {
      form.setError('root', {
        message: (error as { message?: string })?.message ?? 'Could not save the account.',
      })
      window.scrollTo({ top: 0, behavior: 'smooth' })
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
  // A field that fails validation lives on the Account tab; open it so the
  // message is seen rather than leaving Save looking broken.
  const submit = form.handleSubmit(onSubmit, () => openTab(sectionAnchor('Account')))

  // Ctrl+S / Cmd+S saves, as in any desktop editor.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void submit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [submit])

  const saveButton = (
    <Button
      variant="primary"
      size="sm"
      icon={<Save />}
      loading={form.formState.isSubmitting || updateUser.isPending}
      disabled={!dirty}
      onClick={() => void submit()}
      title="Save (Ctrl+S)"
    >
      Save changes
    </Button>
  )

  return (
    /* Full bleed, like the other record forms: the editor is the screen. */
    <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6">
      {/* --------------------------------------------------- sticky header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Link
            to={profileUrl}
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="size-3.5" />
            Profile
          </Link>
          <span className="hidden h-6 w-px bg-border sm:block" aria-hidden />

          <div className="min-w-0 flex-1">
            <p className="text-2xs font-semibold uppercase tracking-wider text-primary">Edit user</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold leading-tight tracking-tight">
                {form.watch('full_name') || user.full_name}
              </h1>
              <RoleBadge role={user.role} size="sm" />
              <ActiveBadge active={user.is_active} />
              <DemoBadge user={user} />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                'hidden items-center gap-1.5 text-xs sm:inline-flex',
                dirty ? 'text-warning' : 'text-muted-foreground',
              )}
              aria-live="polite"
            >
              <span className={cn('size-1.5 rounded-full', dirty ? 'bg-warning' : 'bg-success')} aria-hidden />
              {dirty ? 'Unsaved changes' : 'All changes saved'}
            </span>
            <Button asChild variant="outline" size="sm">
              <Link to={profileUrl}>Cancel</Link>
            </Button>
            {saveButton}
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-8">
        {/* ------------------------------------------- photo and identity */}
        <div className="flex flex-col gap-5 border-b border-border py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-2">
            <PhotoField user={user} />
            <p className="text-2xs text-muted-foreground">
              Saved straight away. The middle of the picture is cropped to a square.
            </p>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-1 text-xs sm:text-right">
            {(user.admission_number || user.employee_id) && (
              <>
                <dt className="text-muted-foreground">{user.admission_number ? 'Admission no.' : 'Employee ID'}</dt>
                <dd className="font-mono font-medium">{user.admission_number ?? user.employee_id}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Created</dt>
            <dd className="font-medium">{formatDateTime(user.created_at)}</dd>
            {user.updated_at && (
              <>
                <dt className="text-muted-foreground">Last updated</dt>
                <dd className="font-medium">{formatDateTime(user.updated_at)}</dd>
              </>
            )}
          </dl>
        </div>

        {/* ------------------------------------------------------- tab bar */}
        <div role="tablist" aria-label="Sections" className="flex gap-1 overflow-x-auto border-b border-border">
          {tabs.sections.map((s) => {
            const active = tabs.activeId === s.id
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={s.id}
                onClick={() => openTab(s.id)}
                className={cn(
                  '-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors',
                  active
                    ? 'border-primary font-semibold text-primary'
                    : 'border-transparent font-medium text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                {s.title}
              </button>
            )
          })}
        </div>

        {/* ------------------------------------------------ the active tab */}
        <div className="min-w-0 py-7">
          {form.formState.errors.root?.message && (
            <div className="mb-5">
              <FormError message={form.formState.errors.root.message} />
            </div>
          )}

          <div ref={mainRef} className="max-w-4xl" role="tabpanel">
            <EditSection title="Account" description="The login itself. Changing the role signs the user out of every device.">
              <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2">
                <Field id="edit_full_name" label="Full name" required error={form.formState.errors.full_name?.message}>
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
                    onValueChange={(v) => form.setValue('role', v as EditValues['role'], { shouldDirty: true })}
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
                    <span className="text-sm">{form.watch('is_active') ? 'Active' : 'Inactive — cannot sign in'}</span>
                    <Switch
                      checked={form.watch('is_active')}
                      onCheckedChange={(v) => form.setValue('is_active', v, { shouldDirty: true })}
                    />
                  </label>
                </Field>

                {user.role === 'PARENT' && (
                  <p className="rounded-lg border border-info/30 bg-info/8 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground sm:col-span-2">
                    This is a guardian's login. Which children they can see is set on each child's{' '}
                    <strong>Parents &amp; Siblings</strong> tab, not here.
                  </p>
                )}

                <div className="sm:col-span-2">
                  <ProgramsField
                    value={form.watch('programs') as Program[]}
                    onChange={(next) => form.setValue('programs', next, { shouldDirty: true })}
                    error={form.formState.errors.programs?.message}
                  />
                </div>
              </div>
            </EditSection>

            <ProfileFieldsSection
              role={role}
              value={profile}
              onChange={(patch) => setProfile((prev) => ({ ...prev, ...patch }))}
              mode="edit"
              layout="page"
              familySlot={
                // Parents and siblings save as they change, not with Save
                // changes: each is its own link or household on the server.
                user.role === 'STUDENT' ? (
                  <div className="space-y-1 border-t border-border pt-5">
                    <p className="text-xs text-muted-foreground">Parent logins and siblings below are saved straight away</p>
                    <StudentFamily student={user} hideGuardian />
                  </div>
                ) : undefined
              }
            />

            {role === 'STUDENT' && (
              <EditSection
                title="Demo access"
                description="Give a prospective student a trial login with classes only, ending on a date you choose."
              >
                <DemoAccessFields value={demoAccess} onChange={setDemoAccess} error={demoError} />
              </EditSection>
            )}
          </div>

          <p className="mt-6 max-w-4xl text-2xs text-muted-foreground">
            Emptying a profile field leaves the stored value unchanged — this endpoint cannot clear one.
          </p>

          {/* Step through the tabs, and save from wherever you are. */}
          <div className="mt-8 flex max-w-4xl flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <div className="flex items-center gap-2">
              {prevTab && (
                <Button variant="ghost" size="sm" icon={<ChevronLeft />} onClick={() => openTab(prevTab.id)}>
                  {prevTab.title}
                </Button>
              )}
              {nextTab && (
                <Button variant="outline" size="sm" onClick={() => openTab(nextTab.id)}>
                  Next: {nextTab.title}
                  <ChevronRight />
                </Button>
              )}
            </div>
            {saveButton}
          </div>
        </div>
      </div>

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
    </div>
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

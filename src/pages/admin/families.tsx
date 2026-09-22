import { zodResolver } from '@hookform/resolvers/zod'
import {
  Baby,
  KeyRound,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  UsersRound,
  Wand2,
  X,
} from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import type {
  FamilyAutoMapReport,
  FamilyAutoMapResult,
  FamilyMatchBasis,
  GuardianRelation,
  ParentLinkOut,
  SiblingGroupOut,
  UserOut,
} from '@/api/types'
import {
  useAddSiblingMember,
  useAutoMapFamilies,
  useCreateParent,
  useCreateParentLink,
  useCreateSiblingGroup,
  useDeleteParentLink,
  useDeleteSiblingGroup,
  useParentAccounts,
  useParentLinks,
  useRemoveSiblingMember,
  useSiblingGroups,
  useUpdateParentLink,
  useUpdateSiblingGroup,
} from '@/queries/families.queries'
import { useUsers } from '@/queries/admin.queries'
import { countLabel } from '@/lib/format'
import { GUARDIAN_RELATIONS, PARENT_PERMISSIONS, RELATION_LABEL } from '@/lib/school'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FormError } from '@/components/forms/field'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * Households and parent logins.
 *
 * These are two different things and the page keeps them apart deliberately,
 * because conflating them is the mistake that produces wrong bills:
 *
 *  - a SIBLING GROUP is a billing household. It works whether or not anybody
 *    has a login, and it is what the sibling concession counts;
 *  - a PARENT LINK is an access grant from one guardian's login to one child.
 *    It gives somebody a way in, and grants nothing financial by itself.
 *
 * A family with three children and no parent account is completely normal, and
 * so is a parent account linked to children in three different households.
 *
 * Most households build themselves. Two students recording the same guardian
 * phone or email, or reached by the same parent login, are grouped on
 * admission without anybody clicking; the sweep below does the same for the
 * whole roll, and the manual controls remain for what the data cannot decide.
 */

// ============================================================== auto-mapping

const BASIS_LABEL: Record<FamilyMatchBasis, string> = {
  guardian_phone: 'same guardian phone',
  guardian_email: 'same guardian email',
  parent_link: 'same parent login',
  guardian_name: 'same guardian name',
  address: 'same address',
  postal_code: 'same postcode',
}

function basisLabel(bases: FamilyMatchBasis[] | undefined) {
  return (bases ?? []).map((b) => BASIS_LABEL[b] ?? b).join(', ')
}

function ResultRow({ result, tone }: { result: FamilyAutoMapResult; tone?: 'warning' | 'danger' }) {
  return (
    <li className="rounded-lg border border-border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {result.full_name ?? `Student ${result.student_id}`}
          {result.admission_number && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              {result.admission_number}
            </span>
          )}
        </span>
        {result.group_name && (
          <Badge tone={tone ?? 'primary'} size="sm">
            {result.group_name}
          </Badge>
        )}
      </div>
      {result.matched_by?.length > 0 && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Matched on {basisLabel(result.matched_by)}
          {result.matches?.length
            ? ` with ${result.matches.map((m) => m.full_name ?? m.student_id).join(', ')}`
            : ''}
        </p>
      )}
      {result.reason && <p className="mt-0.5 text-xs text-muted-foreground">{result.reason}</p>}
      {result.candidate_groups?.length > 0 && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Could belong to:{' '}
          {result.candidate_groups.map((g) => g.group_name ?? `household ${g.group_id}`).join(' or ')}
        </p>
      )}
      {result.suggestions?.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {result.suggestions.map((m) => (
            <li key={m.student_id}>
              Possibly {m.full_name ?? m.student_id} — {basisLabel(m.matched_by)}
              {m.group_name ? ` (in ${m.group_name})` : ''}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function ReportSection({
  title,
  hint,
  rows,
  tone,
}: {
  title: string
  hint: string
  rows: FamilyAutoMapResult[]
  tone?: 'warning' | 'danger'
}) {
  if (rows.length === 0) return null
  return (
    <section>
      <h4 className="text-sm font-semibold">
        {title} <span className="font-normal text-muted-foreground">({rows.length})</span>
      </h4>
      <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <ResultRow key={r.student_id} result={r} tone={tone} />
        ))}
      </ul>
    </section>
  )
}

/**
 * The sweep, shown as a dry run first.
 *
 * Opening the dialog asks the server what it WOULD do; nothing is written
 * until the admin has read the report and pressed Apply. Both calls are the
 * same endpoint with `dry_run` flipped, so what was shown is exactly what
 * happens — the report after applying is re-rendered from the real run.
 */
function AutoMapDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const run = useAutoMapFamilies()
  const [report, setReport] = React.useState<FamilyAutoMapReport | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const sweep = React.useCallback(
    async (dryRun: boolean) => {
      setError(null)
      try {
        setReport(await run.mutateAsync({ dry_run: dryRun }))
      } catch (err) {
        setError((err as { message?: string })?.message ?? 'Could not run the mapping.')
      }
    },
    [run],
  )

  React.useEffect(() => {
    if (!open) {
      setReport(null)
      setError(null)
      return
    }
    void sweep(true)
    // Runs once per opening; `sweep` is stable for the dialog's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const actionable = report ? report.created.length + report.added.length : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Map households from guardian details</DialogTitle>
          <DialogDescription>
            Students who share a guardian phone, a guardian email or a parent login are
            siblings. A shared guardian name on its own is only ever a suggestion. Students
            already in a household are left where they are.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />

          {!report && run.isPending && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          )}

          {report && (
            <>
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                {report.dry_run ? 'If applied: ' : 'Done: '}
                <strong>{report.created.length}</strong> household
                {report.created.length === 1 ? '' : 's'} created,{' '}
                <strong>{report.added.length}</strong> student{report.added.length === 1 ? '' : 's'}{' '}
                added to an existing one, <strong>{report.conflicts.length}</strong> to decide by
                hand. {report.already_grouped} already in a household;{' '}
                {report.unmatched.length + report.skipped.length} with nothing to match on.
              </p>

              <ReportSection
                title="New households"
                hint="Named after the shared surname, or the guardian. Rename any that read oddly."
                rows={report.created}
              />
              <ReportSection
                title="Added to an existing household"
                hint="The student's matches are already in one household; they join it."
                rows={report.added}
              />
              <ReportSection
                title="Needs a decision"
                hint="The matches sit in different households. Merge or fix these by hand — nothing is changed here."
                rows={report.conflicts}
                tone="danger"
              />
              <ReportSection
                title="No match strong enough"
                hint="A shared name alone is not acted on. Use Add child on the household you believe is right."
                rows={report.unmatched.filter((r) => r.suggestions?.length > 0)}
                tone="warning"
              />
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {report && !report.dry_run ? 'Close' : 'Cancel'}
          </Button>
          {report?.dry_run && (
            <Button onClick={() => sweep(false)} loading={run.isPending} disabled={actionable === 0}>
              <Wand2 />
              {actionable === 0 ? 'Nothing to apply' : `Apply ${actionable} change${actionable === 1 ? '' : 's'}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================================================================ households

const groupSchema = z.object({
  family_name: z.string().min(1, 'Enter a family name').max(150),
  primary_contact_name: z.string().max(150).optional(),
  primary_contact_phone: z.string().max(32).optional(),
  primary_contact_email: z.string().max(320).optional(),
  address_line1: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
})

type GroupValues = z.infer<typeof groupSchema>

function GroupDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: SiblingGroupOut | null
}) {
  const create = useCreateSiblingGroup()
  const update = useUpdateSiblingGroup()
  const form = useForm<GroupValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: { family_name: '' },
  })

  React.useEffect(() => {
    if (!open) return
    form.reset({
      family_name: editing?.family_name ?? '',
      primary_contact_name: editing?.primary_contact_name ?? '',
      primary_contact_phone: editing?.primary_contact_phone ?? '',
      primary_contact_email: editing?.primary_contact_email ?? '',
      address_line1: editing?.address_line1 ?? '',
      city: editing?.city ?? '',
      notes: editing?.notes ?? '',
    })
  }, [open, editing, form])

  const onSubmit = async (values: GroupValues) => {
    const body = {
      family_name: values.family_name,
      primary_contact_name: values.primary_contact_name?.trim() || null,
      primary_contact_phone: values.primary_contact_phone?.trim() || null,
      primary_contact_email: values.primary_contact_email?.trim() || null,
      address_line1: values.address_line1?.trim() || null,
      city: values.city?.trim() || null,
      notes: values.notes?.trim() || null,
    }
    try {
      if (editing) await update.mutateAsync({ groupId: editing.id, body })
      else await create.mutateAsync(body)
      onOpenChange(false)
    } catch (error) {
      form.setError('root', {
        message: (error as { message?: string })?.message ?? 'Could not save the household.',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? `Edit ${editing.family_name}` : 'Record a household'}
          </DialogTitle>
          <DialogDescription>
            A household groups siblings for billing. Add the children afterwards — each one is
            checked against the households already on record.
          </DialogDescription>
        </DialogHeader>
        <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-5">
            <FormError message={form.formState.errors.root?.message} />
            <Field
              id="family_name"
              label="Family name"
              required
              error={form.formState.errors.family_name?.message}
            >
              <Input id="family_name" placeholder="The Nair family" {...form.register('family_name')} />
            </Field>

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field id="contact_name" label="Main contact">
                <Input id="contact_name" {...form.register('primary_contact_name')} />
              </Field>
              <Field id="contact_phone" label="Phone">
                <Input id="contact_phone" {...form.register('primary_contact_phone')} />
              </Field>
            </div>

            <Field id="contact_email" label="Email">
              <Input id="contact_email" type="email" {...form.register('primary_contact_email')} />
            </Field>

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field id="address1" label="Address">
                <Input id="address1" {...form.register('address_line1')} />
              </Field>
              <Field id="city" label="City">
                <Input id="city" {...form.register('city')} />
              </Field>
            </div>

            <Field id="group_notes" label="Notes">
              <Textarea id="group_notes" rows={2} {...form.register('notes')} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {editing ? 'Save changes' : 'Create household'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Adding a child.
 *
 * The 400 for "already in another household" is rendered inline rather than as
 * a toast: it is the expected outcome of picking the wrong name out of a long
 * list, and the message names the household they are in, which is the only
 * useful thing on screen at that moment.
 */
function AddChildDialog({
  group,
  onClose,
  students,
}: {
  group: SiblingGroupOut | null
  onClose: () => void
  students: UserOut[]
}) {
  const addMember = useAddSiblingMember()
  const [studentId, setStudentId] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setStudentId('')
    setError(null)
  }, [group])

  const alreadyIn = new Set(group?.student_ids ?? [])
  const options = students
    .filter((s) => !alreadyIn.has(s.id))
    .map((s) => ({
      value: String(s.id),
      label: s.full_name,
      description: s.admission_number ?? s.email,
    }))

  const submit = async () => {
    if (!group || !studentId) return
    setError(null)
    try {
      await addMember.mutateAsync({ groupId: group.id, studentId: Number(studentId) })
      onClose()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not add the child.')
    }
  }

  return (
    <Dialog open={!!group} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Add a child to {group?.family_name}</DialogTitle>
          <DialogDescription>
            Birth order is worked out from the children's dates of birth, and it is what every
            sibling concession is priced from.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError message={error} />
          <Field id="add_child" label="Student" required>
            <Combobox
              options={options}
              value={studentId}
              onChange={setStudentId}
              placeholder="Search students…"
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!studentId} loading={addMember.isPending}>
            Add child
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HouseholdsTab({ students }: { students: UserOut[] }) {
  const groups = useSiblingGroups()
  const removeMember = useRemoveSiblingMember()
  const deleteGroup = useDeleteSiblingGroup()

  const [search, setSearch] = React.useState('')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<SiblingGroupOut | null>(null)
  const [addingTo, setAddingTo] = React.useState<SiblingGroupOut | null>(null)
  const [deleting, setDeleting] = React.useState<SiblingGroupOut | null>(null)
  const [mapping, setMapping] = React.useState(false)

  // Filtered here rather than server-side: the backend does the same
  // comprehension over the same full fetch, so sending it would only cost a
  // refetch per keystroke. See `useSiblingGroups`.
  const filtered = React.useMemo(() => {
    const rows = groups.data ?? []
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (g) =>
        g.family_name.toLowerCase().includes(q) ||
        g.members.some((m) => m.full_name.toLowerCase().includes(q)),
    )
  }, [groups.data, search])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by family or child…"
          className="max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setMapping(true)}>
            <Wand2 />
            Map from guardian details
          </Button>
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus />
            Record a household
          </Button>
        </div>
      </div>

      <QueryBoundary
        query={groups}
        loading={
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            icon={<UsersRound />}
            title="No households recorded"
            description="Households build themselves from guardian details as students are admitted. Run the mapping to sweep everyone already on the roll, or record one by hand."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setMapping(true)}>
                  <Wand2 />
                  Map from guardian details
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(null)
                    setDialogOpen(true)
                  }}
                >
                  <Plus />
                  Record a household
                </Button>
              </div>
            }
          />
        }
      >
        {() =>
          filtered.length === 0 ? (
            <EmptyState
              icon={<UsersRound />}
              title="No households match that search"
              description="Try a different family or child name."
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((group) => (
                <Card key={group.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold">{group.family_name}</h3>
                        <Badge tone={group.sibling_count > 1 ? 'primary' : 'neutral'} size="sm">
                          {countLabel(group.sibling_count, 'child', 'children')}
                        </Badge>
                        {!group.is_active && (
                          <Badge tone="neutral" size="sm">
                            Inactive
                          </Badge>
                        )}
                        {/* Built by the sweep rather than typed in — the cue to
                            check the name it was given. */}
                        {group.auto_mapped && (
                          <Badge
                            tone="info"
                            size="sm"
                            title={group.matched_by?.length ? `Matched on ${basisLabel(group.matched_by as FamilyMatchBasis[])}` : undefined}
                          >
                            <Wand2 />
                            Auto-mapped
                          </Badge>
                        )}
                      </div>
                      {(group.primary_contact_name || group.primary_contact_phone) && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {[group.primary_contact_name, group.primary_contact_phone]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setAddingTo(group)}>
                        <UserPlus />
                        Add child
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(group)
                          setDialogOpen(true)
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(group)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>

                  {group.members.length > 0 ? (
                    <ul className="mt-4 space-y-2 border-t border-border pt-4">
                      {group.members.map((member) => (
                        <li
                          key={member.student_id}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Badge tone="outline" size="sm">
                              {/* 1 for the eldest. The concession is priced from this. */}
                              #{member.birth_order}
                            </Badge>
                            <span className="truncate text-sm font-medium">
                              {member.full_name}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {[member.class_name, member.admission_number]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() =>
                              removeMember.mutate({
                                groupId: group.id,
                                studentId: member.student_id,
                              })
                            }
                          >
                            <X />
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
                      No children on record yet — a household with none counts for nothing.
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )
        }
      </QueryBoundary>

      <GroupDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      <AddChildDialog group={addingTo} onClose={() => setAddingTo(null)} students={students} />
      <AutoMapDialog open={mapping} onOpenChange={setMapping} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete ${deleting?.family_name}?`}
        description="The children themselves are untouched — only the household record goes, along with any sibling concession that was counting it."
        confirmLabel="Delete household"
        destructive
        loading={deleteGroup.isPending}
        onConfirm={async () => {
          if (deleting) await deleteGroup.mutateAsync(deleting.id)
          setDeleting(null)
        }}
      />
    </div>
  )
}

// ============================================================ parent accounts

const parentSchema = z.object({
  full_name: z.string().min(2, 'Enter the parent’s full name').max(150),
  email: z.string().email('Enter a valid email address').or(z.literal('')),
  phone: z.string().max(32).optional(),
})

type ParentValues = z.infer<typeof parentSchema>

/** One child being granted, with its three permission toggles. */
interface DraftLink {
  student_id: number
  student_name: string
  relation: GuardianRelation
  may_view_academics: boolean
  may_view_attendance: boolean
  may_view_fees: boolean
}

function PermissionToggles({
  link,
  onChange,
}: {
  link: Pick<DraftLink, 'may_view_academics' | 'may_view_attendance' | 'may_view_fees'>
  onChange: (key: keyof DraftLink, value: boolean) => void
}) {
  return (
    <div className="space-y-2">
      {PARENT_PERMISSIONS.map((perm) => (
        <label key={perm.key} className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="text-xs font-medium">{perm.label}</span>
            <span className="mt-0.5 block text-2xs text-muted-foreground">{perm.hint}</span>
          </span>
          <Switch
            checked={link[perm.key]}
            onCheckedChange={(v) => onChange(perm.key, v)}
          />
        </label>
      ))}
    </div>
  )
}

/**
 * Creates the login and its links together.
 *
 * Deliberately one dialog rather than "create the account, then grant access":
 * a parent with no links can see literally nothing, and a two-step flow makes
 * that broken state the default outcome of being interrupted.
 */
function NewParentDialog({
  open,
  onOpenChange,
  students,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  students: UserOut[]
}) {
  const createParent = useCreateParent()
  const form = useForm<ParentValues>({
    resolver: zodResolver(parentSchema),
    defaultValues: { full_name: '', email: '', phone: '' },
  })
  const [links, setLinks] = React.useState<DraftLink[]>([])
  const [picking, setPicking] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    form.reset({ full_name: '', email: '', phone: '' })
    setLinks([])
    setPicking('')
  }, [open, form])

  const linked = new Set(links.map((l) => l.student_id))
  const options = students
    .filter((s) => !linked.has(s.id))
    .map((s) => ({
      value: String(s.id),
      label: s.full_name,
      description: s.admission_number ?? s.email,
    }))

  const addLink = (value: string) => {
    const student = students.find((s) => String(s.id) === value)
    if (!student) return
    setLinks((prev) => [
      ...prev,
      {
        student_id: student.id,
        student_name: student.full_name,
        relation: 'GUARDIAN',
        may_view_academics: true,
        may_view_attendance: true,
        // Off by default, matching the backend. Granting it is a decision.
        may_view_fees: false,
      },
    ])
    setPicking('')
  }

  const onSubmit = async (values: ParentValues) => {
    if (links.length === 0) {
      form.setError('root', {
        message: 'Link at least one child — a parent with no children can see nothing.',
      })
      return
    }
    try {
      await createParent.mutateAsync({
        full_name: values.full_name,
        email: values.email || null,
        phone: values.phone?.trim() || null,
        links: links.map((l) => ({
          student_id: l.student_id,
          relation: l.relation,
          may_view_academics: l.may_view_academics,
          may_view_attendance: l.may_view_attendance,
          may_view_fees: l.may_view_fees,
        })),
      })
      onOpenChange(false)
    } catch (error) {
      form.setError('root', {
        message: (error as { message?: string })?.message ?? 'Could not create the parent.',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Add a parent login</DialogTitle>
          <DialogDescription>
            Creates the account and its access to each child in one go. Leave the email blank
            and one is derived from the name, as with any other account.
          </DialogDescription>
        </DialogHeader>
        <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-5">
            <FormError message={form.formState.errors.root?.message} />

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field
                id="parent_name"
                label="Full name"
                required
                error={form.formState.errors.full_name?.message}
              >
                <Input id="parent_name" {...form.register('full_name')} />
              </Field>
              <Field id="parent_phone" label="Phone">
                <Input id="parent_phone" {...form.register('phone')} />
              </Field>
            </div>

            <Field
              id="parent_email"
              label="Email"
              hint="Optional — one is generated from the name if you leave it blank."
              error={form.formState.errors.email?.message}
            >
              <Input id="parent_email" type="email" {...form.register('email')} />
            </Field>

            <div className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold">Children this parent may see</h4>
                  <p className="text-xs text-muted-foreground">
                    Permissions are set per child, not per parent.
                  </p>
                </div>
              </div>

              <Combobox
                options={options}
                value={picking}
                onChange={addLink}
                placeholder="Add a child…"
              />

              {links.length === 0 ? (
                <p className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-muted-foreground">
                  No children linked yet. The account would be able to sign in and see nothing.
                </p>
              ) : (
                <ul className="space-y-3">
                  {links.map((link, index) => (
                    <li key={link.student_id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">{link.student_name}</span>
                        <div className="flex items-center gap-2">
                          <Select
                            value={link.relation}
                            onValueChange={(v) =>
                              setLinks((prev) =>
                                prev.map((l, i) =>
                                  i === index ? { ...l, relation: v as GuardianRelation } : l,
                                ),
                              )
                            }
                          >
                            <SelectTrigger className="h-8 w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {GUARDIAN_RELATIONS.map((rel) => (
                                <SelectItem key={rel} value={rel}>
                                  {RELATION_LABEL[rel]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() =>
                              setLinks((prev) => prev.filter((_, i) => i !== index))
                            }
                          >
                            <X />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 border-t border-border pt-3">
                        <PermissionToggles
                          link={link}
                          onChange={(key, value) =>
                            setLinks((prev) =>
                              prev.map((l, i) => (i === index ? { ...l, [key]: value } : l)),
                            )
                          }
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Create parent
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

/** Editing one existing grant. Revocation takes effect on the parent's next request. */
function LinkRow({ link }: { link: ParentLinkOut }) {
  const update = useUpdateParentLink()
  const remove = useDeleteParentLink()
  const [confirming, setConfirming] = React.useState(false)

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-medium">{link.student_name ?? `Student ${link.student_id}`}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {[link.class_name, link.student_admission_number].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="outline" size="sm">
            {RELATION_LABEL[link.relation]}
          </Badge>
          {link.is_primary && (
            <Badge tone="primary" size="sm">
              Primary
            </Badge>
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => setConfirming(true)}>
            <X />
          </Button>
        </div>
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <PermissionToggles
          link={link}
          onChange={(key, value) =>
            update.mutate({ linkId: link.id, body: { [key]: value } })
          }
        />
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Revoke this access?"
        description="It stops working on this parent's very next request — access is resolved per request rather than carried in their session, so there is no window where a revoked link still opens."
        confirmLabel="Revoke access"
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          await remove.mutateAsync(link.id)
          setConfirming(false)
        }}
      />
    </li>
  )
}

function ParentDetail({ parent, students }: { parent: UserOut; students: UserOut[] }) {
  const links = useParentLinks(parent.id)
  const createLink = useCreateParentLink()
  const [picking, setPicking] = React.useState('')

  const linked = new Set((links.data ?? []).map((l) => l.student_id))
  const options = students
    .filter((s) => !linked.has(s.id))
    .map((s) => ({
      value: String(s.id),
      label: s.full_name,
      description: s.admission_number ?? s.email,
    }))

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{parent.full_name}</h3>
          <p className="text-sm text-muted-foreground">{parent.email}</p>
        </div>
        {!parent.is_active && (
          <Badge tone="neutral" size="sm">
            Disabled
          </Badge>
        )}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <QueryBoundary
          query={links}
          loading={<Skeleton className="h-24 w-full rounded-lg" />}
          isEmpty={(rows) => rows.length === 0}
          empty={
            <p className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-muted-foreground">
              This account has no children linked, so it can sign in and see nothing. Grant
              access below.
            </p>
          }
        >
          {(rows) => (
            <ul className="space-y-3">
              {rows.map((link) => (
                <LinkRow key={link.id} link={link} />
              ))}
            </ul>
          )}
        </QueryBoundary>

        <div className="mt-3">
          <Combobox
            options={options}
            value={picking}
            onChange={(value) => {
              const student = students.find((s) => String(s.id) === value)
              if (!student) return
              createLink.mutate({
                parentId: parent.id,
                body: { student_id: student.id, relation: 'GUARDIAN' },
              })
              setPicking('')
            }}
            placeholder="Grant access to another child…"
          />
        </div>
      </div>
    </Card>
  )
}

function ParentsTab({ students }: { students: UserOut[] }) {
  const parents = useParentAccounts()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const filtered = React.useMemo(() => {
    const rows = parents.data ?? []
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (p) => p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    )
  }, [parents.data, search])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search parents…"
          className="max-w-xs"
        />
        <Button onClick={() => setDialogOpen(true)}>
          <KeyRound />
          Add a parent login
        </Button>
      </div>

      <QueryBoundary
        query={parents}
        loading={
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-44 w-full rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            icon={<ShieldCheck />}
            title="No parent logins yet"
            description="A parent account is a guardian's own way in. It is separate from the household record, and what it may see is decided per child."
            action={
              <Button onClick={() => setDialogOpen(true)}>
                <KeyRound />
                Add a parent login
              </Button>
            }
          />
        }
      >
        {() =>
          filtered.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck />}
              title="No parents match that search"
              description="Try a different name or email."
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((parent) => (
                <ParentDetail key={parent.id} parent={parent} students={students} />
              ))}
            </div>
          )
        }
      </QueryBoundary>

      <NewParentDialog open={dialogOpen} onOpenChange={setDialogOpen} students={students} />
    </div>
  )
}

export default function AdminFamiliesPage() {
  const studentsQuery = useUsers('STUDENT')
  const students = studentsQuery.data ?? []

  return (
    <div>
      <PageHeader
        title="Families"
        description="Households for sibling billing, and the parent logins that reach them. Households build themselves from matching guardian details; record one by hand when the data cannot decide."
      />

      <Tabs defaultValue="households">
        <TabsList>
          <TabsTrigger value="households">
            <Baby className="size-4" />
            Households
          </TabsTrigger>
          <TabsTrigger value="parents">
            <Users className="size-4" />
            Parent accounts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="households">
          <HouseholdsTab students={students} />
        </TabsContent>
        <TabsContent value="parents">
          <ParentsTab students={students} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

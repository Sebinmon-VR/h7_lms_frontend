import { KeyRound, Link2, Plus, Trash2, UserPlus, UsersRound } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import type { GuardianRelation, UserOut } from '@/api/types'
import { useUsers } from '@/queries/admin.queries'
import {
  useAddSiblingMember,
  useCreateParent,
  useCreateParentLink,
  useCreateSiblingGroup,
  useDeleteParentLink,
  useFamilyMatches,
  useParentAccounts,
  useRemoveSiblingMember,
  useStudentGroup,
  useStudentParents,
} from '@/queries/families.queries'
import { cn } from '@/lib/cn'
import { GUARDIAN_RELATIONS, RELATION_LABEL } from '@/lib/school'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'

/*
 * A student's family, on the student's own page: the guardian on record, the
 * parent logins that can see the child, and the brothers and sisters billed
 * as one household. This replaces the separate Parents & Guardians screen,
 * so the office manages a family from the child it is looking at.
 */

const MATCH_LABEL: Record<string, string> = {
  guardian_phone: 'same guardian phone',
  guardian_email: 'same guardian email',
  parent_link: 'same parent login',
}

/** A titled part of the tab: heading and actions over a rule, no box. */
function Part({
  title,
  hint,
  icon: Icon,
  action,
  children,
}: {
  title: string
  hint?: string
  icon: typeof UsersRound
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Icon className="size-4 text-primary" strokeWidth={1.75} />
            {title}
          </h3>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-muted-foreground">{children}</p>
}

/** The free-text relation on a student record, as one of the link relations. */
function asRelation(text: string | null | undefined): GuardianRelation {
  const upper = (text ?? '').trim().toUpperCase()
  return (GUARDIAN_RELATIONS as string[]).includes(upper) ? (upper as GuardianRelation) : 'GUARDIAN'
}

/** "Ayaan Shiyas" → "Shiyas family", for a new household's name. */
function familyNameFor(student: UserOut): string {
  const parts = student.full_name.trim().split(/\s+/)
  return `${parts[parts.length - 1] ?? student.full_name} family`
}

export function StudentFamily({
  student,
  hideGuardian = false,
}: {
  student: UserOut
  /** On the edit page the guardian fields are editable just above, so the read-only copy goes. */
  hideGuardian?: boolean
}) {
  const users = useUsers()
  const group = useStudentGroup(student.id)
  const links = useStudentParents(student.id)
  const parents = useParentAccounts()
  const matches = useFamilyMatches(student.id)

  const addMember = useAddSiblingMember()
  const removeMember = useRemoveSiblingMember()
  const createGroup = useCreateSiblingGroup()
  const createParent = useCreateParent()
  const createLink = useCreateParentLink()
  const deleteLink = useDeleteParentLink()

  const [siblingId, setSiblingId] = React.useState<string | null>(null)
  const [parentId, setParentId] = React.useState<string | null>(null)
  const [relation, setRelation] = React.useState<GuardianRelation>(asRelation(student.guardian_relation))
  const [unlinking, setUnlinking] = React.useState<{ id: number; name: string } | null>(null)
  const [removing, setRemoving] = React.useState<{ id: number; name: string } | null>(null)

  const household = group.data ?? null
  const siblings = (household?.members ?? []).filter((m) => m.student_id !== student.id)
  const inHousehold = new Set(household?.student_ids ?? [])
  const linkedParentIds = new Set((links.data ?? []).map((l) => l.parent_id))

  const studentOptions = (users.data ?? [])
    .filter((u) => u.role === 'STUDENT' && u.id !== student.id && !inHousehold.has(u.id))
    .map((u) => ({ value: String(u.id), label: u.full_name, hint: u.admission_number ?? u.email, keywords: u.email }))
  const parentOptions = (parents.data ?? [])
    .filter((p) => !linkedParentIds.has(p.id))
    .map((p) => ({ value: String(p.id), label: p.full_name, hint: p.email ?? p.phone ?? undefined, keywords: p.phone ?? '' }))

  const suggested = [...(matches.data?.strong ?? []), ...(matches.data?.suggestions ?? [])].filter(
    (m, i, all) => m.student_id !== student.id && !inHousehold.has(m.student_id) && all.findIndex((x) => x.student_id === m.student_id) === i,
  )

  /** Puts another student in this one's household, starting one if needed. */
  const addSibling = async (otherId: number) => {
    try {
      if (household) {
        await addMember.mutateAsync({ groupId: household.id, studentId: otherId })
      } else {
        await createGroup.mutateAsync({ family_name: familyNameFor(student), student_ids: [student.id, otherId] })
      }
      setSiblingId(null)
      toast.success('Sibling added')
    } catch {
      /* the mutation cache shows the server's reason */
    }
  }

  const linkParent = async () => {
    if (!parentId) return
    try {
      await createLink.mutateAsync({
        parentId: Number(parentId),
        body: { student_id: student.id, relation, is_primary: (links.data ?? []).length === 0 },
      })
      setParentId(null)
      toast.success('Parent linked')
    } catch {
      /* shown by the mutation cache */
    }
  }

  /** A parent login built from the guardian already on the student's record. */
  const createFromGuardian = async () => {
    if (!student.guardian_name) return
    try {
      const parent = await createParent.mutateAsync({
        full_name: student.guardian_name,
        email: student.guardian_email || null,
        phone: student.guardian_phone || null,
        programs: student.programs?.length ? student.programs : ['LMS'],
        links: [{ student_id: student.id, relation: asRelation(student.guardian_relation), is_primary: true }],
      })
      toast.success(`Parent login created for ${parent.full_name}`, {
        description: 'Generate their credentials from their page so they can sign in.',
        action: { label: 'Open', onClick: () => window.location.assign(`/admin/users/${parent.id}`) },
      })
    } catch {
      /* shown by the mutation cache */
    }
  }

  const guardianHasLogin = (links.data ?? []).some(
    (l) => l.parent_name?.trim().toLowerCase() === student.guardian_name?.trim().toLowerCase(),
  )

  return (
    <div className="space-y-8">
      {/* -------------------------------------------------- guardian */}
      {!hideGuardian && (
      <Part
        title="Guardian"
        icon={UsersRound}
        hint="The contact on the student's record"
        action={
          <Link to={`/admin/users/${student.id}/edit`} className="text-xs font-medium text-primary hover:underline">
            Edit details
          </Link>
        }
      >
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Name', student.guardian_name],
            ['Relation', student.guardian_relation],
            ['Phone', student.guardian_phone],
            ['Email', student.guardian_email],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className={cn('mt-0.5 truncate text-sm', value ? 'font-medium text-foreground' : 'text-muted-foreground/60')}>
                {value || 'Not set'}
              </dd>
            </div>
          ))}
        </dl>
      </Part>
      )}

      {/* --------------------------------------------- parent logins */}
      <Part
        title={`Parent logins (${links.data?.length ?? 0})`}
        icon={KeyRound}
        hint="Parents who can sign in to see this child"
        action={
          student.guardian_name && !guardianHasLogin ? (
            <Button variant="outline" size="xs" icon={<UserPlus />} loading={createParent.isPending} onClick={() => void createFromGuardian()}>
              Create login for {student.guardian_name}
            </Button>
          ) : undefined
        }
      >
        {links.isPending ? (
          <Skeleton className="h-12 rounded-md" />
        ) : (links.data ?? []).length === 0 ? (
          <Empty>No parent can sign in for this child yet</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {(links.data ?? []).map((l) => {
              const access = [
                l.may_view_academics && 'Academics',
                l.may_view_attendance && 'Attendance',
                l.may_view_fees && 'Fees',
              ].filter(Boolean)
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-2.5">
                  <span className="min-w-48">
                    <Link to={`/admin/users/${l.parent_id}`} className="text-sm font-medium text-foreground hover:text-primary">
                      {l.parent_name ?? 'Parent'}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{l.parent_email}</span>
                  </span>
                  <span className="min-w-24 text-sm text-muted-foreground">
                    {RELATION_LABEL[l.relation]}
                    {l.is_primary && <span className="ml-1.5 text-xs font-medium text-primary">Primary</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{access.length ? `Sees ${access.join(', ')}` : 'No access granted'}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto hover:bg-danger/10 hover:text-danger"
                    aria-label={`Unlink ${l.parent_name ?? 'parent'}`}
                    onClick={() => setUnlinking({ id: l.id, name: l.parent_name ?? 'this parent' })}
                  >
                    <Trash2 />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Combobox
            value={parentId}
            onChange={setParentId}
            options={parentOptions}
            placeholder="Link an existing parent…"
            searchPlaceholder="Search parents"
            emptyMessage="No other parent accounts"
            className="h-8 w-64 text-sm"
          />
          <Select value={relation} onValueChange={(v) => setRelation(v as GuardianRelation)}>
            <SelectTrigger className="h-8 w-36 text-sm" aria-label="Relation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GUARDIAN_RELATIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {RELATION_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="xs" icon={<Link2 />} disabled={!parentId} loading={createLink.isPending} onClick={() => void linkParent()}>
            Link parent
          </Button>
        </div>
      </Part>

      {/* -------------------------------------------------- siblings */}
      <Part
        title={`Siblings (${siblings.length})`}
        icon={UsersRound}
        hint={
          household
            ? `${household.family_name}: billed as one household, which is what the sibling discount counts`
            : 'Brothers and sisters at the school, billed as one household'
        }
      >
        {group.isPending ? (
          <Skeleton className="h-12 rounded-md" />
        ) : siblings.length === 0 ? (
          <Empty>No siblings recorded</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {siblings.map((m) => (
              <li key={m.student_id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-2.5">
                <span className="min-w-48">
                  <Link to={`/admin/users/${m.student_id}`} className="text-sm font-medium text-foreground hover:text-primary">
                    {m.full_name}
                  </Link>
                  {m.admission_number && <span className="block font-mono text-xs text-muted-foreground">{m.admission_number}</span>}
                </span>
                <span className="min-w-28 text-sm text-muted-foreground">{m.class_name ?? 'No class'}</span>
                <span className="text-xs text-muted-foreground">
                  {m.birth_order === 1 ? 'Eldest' : `Child ${m.birth_order}`}
                  {!m.is_active && ' · inactive'}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto hover:bg-danger/10 hover:text-danger"
                  aria-label={`Remove ${m.full_name} from the household`}
                  onClick={() => setRemoving({ id: m.student_id, name: m.full_name })}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Combobox
            value={siblingId}
            onChange={setSiblingId}
            options={studentOptions}
            placeholder="Add a sibling…"
            searchPlaceholder="Search students"
            emptyMessage="No other students"
            className="h-8 w-64 text-sm"
          />
          <Button
            size="xs"
            icon={<Plus />}
            disabled={!siblingId}
            loading={addMember.isPending || createGroup.isPending}
            onClick={() => siblingId && void addSibling(Number(siblingId))}
          >
            Add sibling
          </Button>
        </div>

        {/* Students whose guardian details match this one's. */}
        {suggested.length > 0 && (
          <div className="pt-1">
            <p className="text-xs font-medium text-muted-foreground">Possible siblings</p>
            <ul className="mt-1 divide-y divide-border">
              {suggested.slice(0, 5).map((m) => (
                <li key={m.student_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                  <span className="min-w-48 text-sm text-foreground">{m.full_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.matched_by.map((b) => MATCH_LABEL[b] ?? b).join(', ')}
                    {m.group_name ? ` · in ${m.group_name}` : ''}
                  </span>
                  <Button
                    variant="outline"
                    size="xs"
                    className="ml-auto"
                    disabled={!!m.group_id}
                    onClick={() => void addSibling(m.student_id)}
                  >
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Part>

      <ConfirmDialog
        open={!!unlinking}
        onOpenChange={(v) => !v && setUnlinking(null)}
        title={`Unlink ${unlinking?.name}?`}
        description="They will no longer see this child when they sign in. Their login and any other children stay."
        confirmLabel="Unlink"
        destructive
        loading={deleteLink.isPending}
        onConfirm={() => unlinking && deleteLink.mutate(unlinking.id, { onSettled: () => setUnlinking(null) })}
      />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={`Remove ${removing?.name} from the household?`}
        description="They will no longer count towards the sibling discount. Their own record is not changed."
        confirmLabel="Remove"
        destructive
        loading={removeMember.isPending}
        onConfirm={() =>
          removing &&
          household &&
          removeMember.mutate({ groupId: household.id, studentId: removing.id }, { onSettled: () => setRemoving(null) })
        }
      />
    </div>
  )
}

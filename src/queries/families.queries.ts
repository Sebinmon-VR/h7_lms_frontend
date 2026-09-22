import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { familiesApi, parentApi } from '@/api/families.api'
import type { ParentCreate } from '@/api/families.api'
import type {
  FamilyAutoMapReport,
  FamilyAutoMapRequest,
  ParentLinkCreate,
  ParentLinkUpdate,
  SiblingGroupCreate,
  SiblingGroupUpdate,
} from '@/api/types'
import { STALE, qk } from './keys'

// ------------------------------------------------------- households (admin)

/**
 * Every household, fetched unfiltered.
 *
 * `search` is deliberately not sent: the backend matches it with a Python
 * comprehension over the same full fetch, so it buys nothing server-side and
 * would cost a refetch per keystroke. Filter on the client.
 */
export function useSiblingGroups(includeInactive = false, enabled = true) {
  return useQuery({
    queryKey: qk.families.groups(includeInactive),
    queryFn: () => familiesApi.listGroups({ includeInactive }),
    staleTime: STALE.reference,
    enabled,
  })
}

/**
 * The household one student belongs to, or `null` for an only child.
 *
 * `null` is the NORMAL case — most students are in no recorded household —
 * so render "not in a family group" rather than treating it as missing data.
 */
export function useStudentGroup(studentId: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.families.studentGroup(studentId ?? 0),
    queryFn: () => familiesApi.groupForStudent(studentId as number),
    staleTime: STALE.reference,
    enabled: enabled && studentId != null,
  })
}

/**
 * What the guardian-details sweep sees for one student.
 *
 * Read on the manual "add a child" flow so the office is offered the matches
 * before scrolling a list of names. Short stale time: the answer changes the
 * moment somebody edits a guardian phone.
 */
export function useFamilyMatches(studentId: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.families.matches(studentId ?? 0),
    queryFn: () => familiesApi.matchesForStudent(studentId as number),
    staleTime: STALE.transactional,
    enabled: enabled && studentId != null,
  })
}

// --------------------------------------------------- parent accounts (admin)

export function useParentAccounts(enabled = true) {
  return useQuery({
    queryKey: qk.families.parents(),
    queryFn: familiesApi.listParents,
    staleTime: STALE.reference,
    enabled,
  })
}

export function useParentLinks(parentId: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.families.parentLinks(parentId ?? 0),
    queryFn: () => familiesApi.listLinksForParent(parentId as number),
    staleTime: STALE.reference,
    enabled: enabled && parentId != null,
  })
}

/** The front-office view: who can reach this child. */
export function useStudentParents(studentId: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.families.studentLinks(studentId ?? 0),
    queryFn: () => familiesApi.listLinksForStudent(studentId as number),
    staleTime: STALE.reference,
    enabled: enabled && studentId != null,
  })
}

// ---------------------------------------------------------------- the parent

/**
 * A parent's children, with the per-aspect permission flags on each.
 *
 * Build the parent's navigation from `may_view_academics`,
 * `may_view_attendance` and `may_view_fees` rather than rendering tabs that
 * 403 — fees in particular are OFF unless an admin granted them.
 *
 * Short stale time because revocation takes effect on the parent's next
 * request: access is resolved per request rather than carried in the token, so
 * a long-cached list is the only way a revoked child would still appear.
 */
export function useMyChildren(enabled = true) {
  return useQuery({
    queryKey: qk.parent.children(),
    queryFn: parentApi.children,
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useMyChild(studentId: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.parent.child(studentId ?? 0),
    queryFn: () => parentApi.child(studentId as number),
    staleTime: STALE.transactional,
    enabled: enabled && studentId != null,
  })
}

export function useMyChildProfile(studentId: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.parent.childProfile(studentId ?? 0),
    queryFn: () => parentApi.childProfile(studentId as number),
    staleTime: STALE.reference,
    enabled: enabled && studentId != null,
  })
}

// ---------------------------------------------------------------- mutations

/**
 * Household membership changes re-price every sibling concession in the group,
 * so the fee breakdowns go too — leaving them cached is how an admin adds a
 * second child and sees the old, undiscounted figure.
 */
function invalidateFamilies(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.families.root })
  void qc.invalidateQueries({ queryKey: qk.finance.breakdownRoot() })
}

export function useCreateSiblingGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SiblingGroupCreate) => familiesApi.createGroup(body),
    onSuccess: (group) => {
      invalidateFamilies(qc)
      toast.success(`${group.family_name} created`)
    },
  })
}

export function useUpdateSiblingGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, body }: { groupId: number; body: SiblingGroupUpdate }) =>
      familiesApi.updateGroup(groupId, body),
    onSuccess: (group) => {
      invalidateFamilies(qc)
      toast.success(`${group.family_name} updated`)
    },
  })
}

/**
 * 400 when the child already belongs to another household. That is the
 * expected outcome of picking the wrong name from a long list, not a crash —
 * no toast fires here, and the caller shows the server's message, which names
 * the household they are already in.
 */
export function useAddSiblingMember() {
  const qc = useQueryClient()
  return useMutation({
    // Reported in place by the caller, not as a toast.
    meta: { silent: true },
    mutationFn: ({ groupId, studentId }: { groupId: number; studentId: number }) =>
      familiesApi.addMember(groupId, studentId),
    onSuccess: (group) => {
      invalidateFamilies(qc)
      toast.success('Child added to the household', {
        description: `${group.family_name} now has ${group.sibling_count} children on record.`,
      })
    },
  })
}

export function useRemoveSiblingMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, studentId }: { groupId: number; studentId: number }) =>
      familiesApi.removeMember(groupId, studentId),
    onSuccess: () => {
      invalidateFamilies(qc)
      toast.success('Child removed from the household')
    },
  })
}

/**
 * Builds households from guardian details — a dry run or the real thing,
 * decided by the body.
 *
 * Silent on purpose: the caller renders the whole report, including the
 * conflicts, and a toast saying "done" over a report of what could not be
 * decided would be the wrong emphasis. The caches go only on a real run.
 */
export function useAutoMapFamilies() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: FamilyAutoMapRequest) => familiesApi.autoMap(body),
    onSuccess: (report: FamilyAutoMapReport) => {
      if (!report.dry_run) invalidateFamilies(qc)
    },
  })
}

export function useDeleteSiblingGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (groupId: number) => familiesApi.deleteGroup(groupId),
    onSuccess: () => {
      invalidateFamilies(qc)
      toast.success('Household deleted')
    },
  })
}

/**
 * Creates the login and its links in one call.
 *
 * Also invalidates the user directory: a parent IS a user, and the admin's
 * people screens read from that cache.
 */
export function useCreateParent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ParentCreate) => familiesApi.createParent(body),
    onSuccess: (parent) => {
      invalidateFamilies(qc)
      void qc.invalidateQueries({ queryKey: qk.admin.usersRoot() })
      toast.success(`${parent.full_name} can now sign in`, {
        description: parent.email ?? undefined,
      })
    },
  })
}

export function useCreateParentLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ parentId, body }: { parentId: number; body: ParentLinkCreate }) =>
      familiesApi.createLink(parentId, body),
    onSuccess: (link) => {
      invalidateFamilies(qc)
      toast.success(`${link.parent_name ?? 'The parent'} can now see ${link.student_name ?? 'this child'}`)
    },
  })
}

export function useUpdateParentLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ linkId, body }: { linkId: number; body: ParentLinkUpdate }) =>
      familiesApi.updateLink(linkId, body),
    onSuccess: () => {
      invalidateFamilies(qc)
      toast.success('Access updated')
    },
  })
}

/** Takes effect on the parent's very next request — there is no stale window. */
export function useDeleteParentLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (linkId: number) => familiesApi.deleteLink(linkId),
    onSuccess: () => {
      invalidateFamilies(qc)
      toast.success('Access revoked')
    },
  })
}

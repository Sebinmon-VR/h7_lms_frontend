import { cleanParams, del, delWithBody, get, post, put } from './client'
import type {
  ChildSummary,
  FamilyAutoMapReport,
  FamilyAutoMapRequest,
  FamilyMatchesOut,
  ParentLinkCreate,
  ParentLinkOut,
  ParentLinkUpdate,
  Program,
  SiblingGroupCreate,
  SiblingGroupOut,
  SiblingGroupUpdate,
  UserOut,
  UserProfileFields,
} from './types'

/** Body of `POST /admin/families/parents` — a login and its links in one call. */
export interface ParentCreate extends UserProfileFields {
  full_name: string
  /** Omit to derive one from the name, as with any other account. */
  email?: string | null
  password?: string | null
  /** Should match the children's, or the parent reaches a product they cannot see. */
  programs?: Program[]
  links?: ParentLinkCreate[]
}

/**
 * Two separate things, and conflating them is the mistake this module exists
 * to prevent.
 *
 * A SIBLING GROUP is a billing household. It works whether or not anybody has
 * a login, and it is what the sibling discount counts.
 *
 * A PARENT LINK is an access grant from one parent login to one student. It
 * grants nothing financial on its own, and revoking it takes effect on the
 * parent's NEXT request — access is resolved per request rather than carried
 * in the token, so there is no window in which a deleted link still works.
 */
export const familiesApi = {
  // ------------------------------------------------------------ households

  listGroups: (params: { search?: string; includeInactive?: boolean } = {}) =>
    get<SiblingGroupOut[]>('/admin/families/groups', {
      params: cleanParams({
        search: params.search,
        include_inactive: params.includeInactive,
      }),
    }),

  getGroup: (groupId: number) => get<SiblingGroupOut>(`/admin/families/groups/${groupId}`),

  /**
   * `null` for an only child — NOT an error. Most students are in no recorded
   * household, and a 404 here would put a red banner on every profile.
   */
  groupForStudent: (studentId: number) =>
    get<SiblingGroupOut | null>(`/admin/families/students/${studentId}/group`),

  createGroup: (body: SiblingGroupCreate) =>
    post<SiblingGroupOut>('/admin/families/groups', body),

  updateGroup: (groupId: number, body: SiblingGroupUpdate) =>
    put<SiblingGroupOut>(`/admin/families/groups/${groupId}`, body),

  /**
   * 400 when the child is already in another household — one student belongs
   * to exactly one, or the sibling count has two answers. Show the message;
   * it names the household they are in.
   */
  addMember: (groupId: number, studentId: number) =>
    post<SiblingGroupOut>(`/admin/families/groups/${groupId}/members`, {
      student_id: studentId,
    }),

  /**
   * A DELETE that answers with a body: the group as it now stands, with
   * `birth_order` already renumbered across the remaining children. Use the
   * response rather than removing the row locally — taking the eldest out
   * re-prices every sibling concession below them.
   */
  removeMember: (groupId: number, studentId: number) =>
    delWithBody<SiblingGroupOut>(
      `/admin/families/groups/${groupId}/members/${studentId}`,
    ),

  deleteGroup: (groupId: number) => del(`/admin/families/groups/${groupId}`),

  // ------------------------------------------------------- automatic mapping

  /**
   * Builds households from guardian details.
   *
   * Students sharing a guardian phone, a guardian email or a parent login are
   * siblings: each joins the household its matches are in, or a new one is
   * created and named after the shared surname. A shared guardian NAME alone
   * is never acted on — it comes back under `unmatched[].suggestions` for a
   * person to confirm. Runs on its own after every admission, guardian edit
   * and parent link; call this to sweep the whole roll or retry a few.
   *
   * Safe to repeat, and `dry_run: true` returns the same report without
   * writing — which is why the screen shows the dry run first.
   */
  autoMap: (body: FamilyAutoMapRequest = {}) =>
    post<FamilyAutoMapReport>('/admin/families/auto-map', body),

  /**
   * Who looks like this student's sibling, and why. `strong` is what the
   * sweep would act on; `suggestions` the name-only matches it leaves to a
   * person. Each carries the household the other student is already in, so
   * the picker can offer "add to the Sharma household" directly.
   */
  matchesForStudent: (studentId: number) =>
    get<FamilyMatchesOut>(`/admin/families/students/${studentId}/matches`),

  // -------------------------------------------------------- parent accounts

  listParents: () => get<UserOut[]>('/admin/families/parents'),

  /**
   * Creates the login AND its links in one call. `role` is not a field on the
   * body by design — this endpoint mints parents, and letting a request name
   * the role is how a create-parent form becomes an admin-creation exploit.
   */
  createParent: (body: ParentCreate) => post<UserOut>('/admin/families/parents', body),

  listLinksForParent: (parentId: number) =>
    get<ParentLinkOut[]>(`/admin/families/parents/${parentId}/links`),

  /** The front-office view: who can reach this child. */
  listLinksForStudent: (studentId: number) =>
    get<ParentLinkOut[]>(`/admin/families/students/${studentId}/parents`),

  createLink: (parentId: number, body: ParentLinkCreate) =>
    post<ParentLinkOut>(`/admin/families/parents/${parentId}/links`, body),

  updateLink: (linkId: number, body: ParentLinkUpdate) =>
    put<ParentLinkOut>(`/admin/families/links/${linkId}`, body),

  deleteLink: (linkId: number) => del(`/admin/families/links/${linkId}`),
}

/**
 * The parent's own side. Every one of these is scoped to the caller's links,
 * so a student id the parent has no grant for is a 403 rather than a leak.
 */
export const parentApi = {
  /**
   * The switcher, and a parent's home. Each child carries
   * `may_view_academics`, `may_view_attendance` and `may_view_fees` — build
   * the navigation from those flags rather than rendering a tab that 403s.
   * Fees are OFF unless an admin has granted them.
   */
  children: () => get<ChildSummary[]>('/parent/children'),

  child: (studentId: number) => get<ChildSummary>(`/parent/children/${studentId}`),

  /** The full profile, subject to the same link check. */
  childProfile: (studentId: number) => get<UserOut>(`/parent/children/${studentId}/profile`),
}

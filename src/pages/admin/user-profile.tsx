import {
  ArrowLeft,
  BellOff,
  BellRing,
  BookOpen,
  KeyRound,
  Layers,
  Mail,
  Pencil,
  Phone,
  UserCheck,
  UserX,
} from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import type { UserOut } from '@/api/types'
import {
  useClassTeachers,
  useDeactivateUser,
  useEnrollments,
  useMappings,
  usePresenceMap,
  useReactivateUser,
  useUsers,
} from '@/queries/admin.queries'
import { useAcademicYears, useAdmissionCategories } from '@/queries/admissions.queries'
import { ROLE_LABEL, isTeachingRole } from '@/lib/constants'
import { cn } from '@/lib/cn'
import { DEMO_MODULE_LABEL } from '@/lib/demo'
import { formatDate, formatDateTime, formatRelative } from '@/lib/datetime'
import { PROGRAM_LABEL } from '@/lib/tuition'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ActiveBadge, RoleBadge } from '@/components/domain/badges'
import { DemoBadge } from '@/components/domain/demo-account'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { GenerateCredentialsDialog } from './generate-credentials'

/** The list a person belongs on, so "back" returns to where they are filed. */
export function userListPath(user: Pick<UserOut, 'role'>): { to: string; label: string } {
  if (user.role === 'STUDENT') return { to: '/admin/students', label: 'Students' }
  if (isTeachingRole(user.role)) return { to: '/admin/teachers', label: 'Teachers' }
  if (user.role === 'ADMIN') return { to: '/admin/staff', label: 'Staff' }
  return { to: '/admin/users', label: 'All Users' }
}

const GENDER_LABEL: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  UNDISCLOSED: 'Not disclosed',
}

function isEmpty(value: React.ReactNode) {
  return value === null || value === undefined || value === ''
}

/** One labelled figure in the strip under the header. Empty values show a dash. */
function Fact({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  const empty = isEmpty(value)
  return (
    <div className="min-w-0 px-4 py-3 first:pl-0">
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 truncate text-sm font-semibold',
          empty ? 'text-muted-foreground/60' : 'text-foreground',
          mono && !empty && 'font-mono',
        )}
      >
        {empty ? '—' : value}
      </p>
    </div>
  )
}

/**
 * One field in a tab. Unlike the sparse summary elsewhere, a tab shows every
 * field it owns, filled or not: an admin opens "Guardian" to see what is
 * missing as much as what is there.
 */
function Item({ label, value, mono, wide }: { label: string; value: React.ReactNode; mono?: boolean; wide?: boolean }) {
  const empty = isEmpty(value)
  return (
    <div className={cn('min-w-0 border-b border-border/70 pb-3', wide && 'sm:col-span-2 lg:col-span-3')}>
      <dt className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'mt-1 break-words text-sm',
          empty ? 'text-muted-foreground/60' : 'font-medium text-foreground',
          mono && !empty && 'font-mono',
        )}
      >
        {empty ? 'Not set' : value}
      </dd>
    </div>
  )
}

/** A titled group of fields inside a tab: a heading over a rule, no box. */
function Block({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function Fields({ children }: { children: React.ReactNode }) {
  return <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
}

function addressOf(user: UserOut): string | null {
  const parts = [user.address_line1, user.address_line2, user.city, user.state, user.postal_code, user.country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

type TabKey = 'profile' | 'admission' | 'guardian' | 'class' | 'employment' | 'teaching' | 'account'

const TAB_LABEL: Record<TabKey, string> = {
  profile: 'Profile',
  admission: 'Admission',
  guardian: 'Guardian',
  class: 'Class',
  employment: 'Employment',
  teaching: 'Teaching',
  account: 'Account',
}

/**
 * One person's full record on its own page.
 *
 * Assembled from the lists already in cache — there is no
 * `GET /admin/users/{id}` — so it shares their loading and their freshness.
 */
export default function AdminUserProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const usersQuery = useUsers()
  const user = usersQuery.data?.find((u) => String(u.id) === userId) ?? null

  const mappingsQuery = useMappings(!!user)
  const enrollmentsQuery = useEnrollments(!!user)
  const classTeachersQuery = useClassTeachers(!!user)
  const isStudentUser = user?.role === 'STUDENT'
  const years = useAcademicYears({ withCounts: false }, isStudentUser)
  const categories = useAdmissionCategories({ includeInactive: true }, isStudentUser)
  const presence = usePresenceMap()
  const deactivateUser = useDeactivateUser()
  const reactivateUser = useReactivateUser()
  const [issuing, setIssuing] = React.useState(false)
  const [deactivating, setDeactivating] = React.useState(false)

  if (usersQuery.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-32 rounded" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    )
  }
  if (usersQuery.isError) return <ErrorState error={usersQuery.error} onRetry={() => usersQuery.refetch()} />
  if (!user) {
    return (
      <EmptyState
        title="User not found"
        description="This account may have been deleted, or the link is wrong."
        action={
          <Button asChild variant="outline" icon={<ArrowLeft />}>
            <Link to="/admin/users">All users</Link>
          </Button>
        }
      />
    )
  }

  const back = userListPath(user)
  const isStudent = user.role === 'STUDENT'
  const teacher = isTeachingRole(user.role)
  const teaching = (mappingsQuery.data ?? []).filter((m) => m.teacher.id === user.id)
  const leading = (classTeachersQuery.data ?? []).filter((m) => m.teacher.id === user.id)
  const enrollments = (enrollmentsQuery.data ?? []).filter((e) => e.student.id === user.id)
  // Only the first enrollment is ever visible to the student — the API
  // resolves their class that way.
  const homeClass = enrollments[0]?.class_room ?? null
  const yearName = (id: number | null | undefined) => years.data?.find((y) => y.id === id)?.name ?? null
  const category = categories.data?.find((c) => c.id === user.admission_category_id)?.name ?? null
  const seen = presence.byId.get(user.id)
  const subjects = [...new Set(teaching.map((m) => m.subject.name))]
  const assignmentsLoading =
    mappingsQuery.isPending || enrollmentsQuery.isPending || classTeachersQuery.isPending
  const remindersOn = user.reminder_opt_in ?? true

  // The tabs a person of this kind has, in reading order.
  const tabKeys: TabKey[] = isStudent
    ? ['profile', 'admission', 'guardian', 'class', 'account']
    : teacher
      ? ['profile', 'employment', 'teaching', 'account']
      : ['profile', 'employment', 'account']
  const requested = searchParams.get('tab') as TabKey | null
  const tab: TabKey = requested && tabKeys.includes(requested) ? requested : 'profile'
  // In the address, so a refresh or a shared link opens the same tab.
  const openTab = (key: TabKey) => {
    const next = new URLSearchParams(searchParams)
    if (key === 'profile') next.delete('tab')
    else next.set('tab', key)
    setSearchParams(next, { replace: true })
  }

  const tabCount: Partial<Record<TabKey, number>> = {
    class: enrollments.length,
    teaching: teaching.length + leading.length,
  }

  return (
    <div className="space-y-6">
      <Link
        to={back.to}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-4" />
        {back.label}
      </Link>

      {/* ---------------------------------------------------------- header */}
      <header className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="relative shrink-0">
            <Avatar name={user.full_name} src={user.photo_url} size="xl" className={user.is_active ? undefined : 'opacity-50 grayscale'} />
            {!presence.isPending && (
              <span
                className={cn(
                  'absolute bottom-0.5 right-0.5 size-3.5 rounded-full ring-2 ring-background',
                  seen?.is_online ? 'bg-success' : 'bg-muted-foreground/40',
                )}
                aria-hidden
              />
            )}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{user.full_name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Mail className="size-3.5 shrink-0" />
                <span className="truncate">{user.email}</span>
              </span>
              {user.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5 shrink-0" />
                  {user.phone}
                </span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RoleBadge role={user.role} size="sm" />
              <ActiveBadge active={user.is_active} />
              <DemoBadge user={user} />
              {!presence.isPending && (
                <span className="text-xs text-muted-foreground">
                  {seen?.is_online
                    ? 'Online now'
                    : seen?.last_seen_at
                      ? `Last seen ${formatRelative(seen.last_seen_at)}`
                      : 'Not signed in yet'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* The primary action: a user without credentials cannot sign in at
              all, so this is what an admin most often came here to do. */}
          <Button variant="primary" size="sm" icon={<KeyRound />} onClick={() => setIssuing(true)}>
            Generate credentials
          </Button>
          <Button variant="outline" size="sm" icon={<Pencil />} onClick={() => navigate(`/admin/users/${user.id}/edit`)}>
            Edit
          </Button>
          {user.is_active ? (
            <Button variant="ghost" size="sm" icon={<UserX />} onClick={() => setDeactivating(true)}>
              Deactivate
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon={<UserCheck />}
              loading={reactivateUser.isPending}
              onClick={() => reactivateUser.mutate(user.id)}
            >
              Reactivate
            </Button>
          )}
        </div>
      </header>

      {/* ------------------------------------------------------- key facts */}
      <div className="grid grid-cols-2 border-y border-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-x lg:divide-border">
        {isStudent ? (
          <>
            <Fact label="Admission no." value={user.admission_number} mono />
            <Fact label="Class" value={homeClass?.name} />
            <Fact label="Roll no." value={user.roll_number} mono />
            <Fact label="Session year" value={yearName(user.academic_year_id)} />
            <Fact label="Admitted" value={user.admission_date ? formatDate(user.admission_date) : null} />
            <Fact label="Guardian phone" value={user.guardian_phone} />
          </>
        ) : (
          <>
            <Fact label="Employee ID" value={user.employee_id} mono />
            <Fact label="Designation" value={user.designation ?? ROLE_LABEL[user.role]} />
            {teacher ? (
              <>
                <Fact label="Subjects" value={subjects.length > 0 ? subjects.length : null} />
                <Fact label="Class teacher of" value={leading.map((m) => m.class_room.name).join(', ')} />
              </>
            ) : (
              <>
                <Fact label="Qualification" value={user.qualification} />
                <Fact label="Specialization" value={user.specialization} />
              </>
            )}
            <Fact label="Joined" value={user.date_of_joining ? formatDate(user.date_of_joining) : null} />
            <Fact label="Phone" value={user.phone} />
          </>
        )}
      </div>

      {/* ------------------------------------------------------------ tabs */}
      <div>
        <div role="tablist" aria-label="Record sections" className="flex gap-1 overflow-x-auto border-b border-border">
          {tabKeys.map((key) => {
            const active = tab === key
            return (
              <button
                key={key}
                type="button"
                role="tab"
                id={`tab-${key}`}
                aria-selected={active}
                aria-controls={`panel-${key}`}
                onClick={() => openTab(key)}
                className={cn(
                  '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm transition-colors',
                  active
                    ? 'border-primary font-semibold text-primary'
                    : 'border-transparent font-medium text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                {TAB_LABEL[key]}
                {tabCount[key] !== undefined && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-2xs tabular-nums',
                      active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {tabCount[key]}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-8 pt-6">
          {tab === 'profile' && (
            <>
              <Block title="Personal">
                <Fields>
                  <Item label="Full name" value={user.full_name} />
                  <Item label="Date of birth" value={user.date_of_birth ? formatDate(user.date_of_birth) : null} />
                  <Item label="Gender" value={user.gender ? (GENDER_LABEL[user.gender] ?? user.gender) : null} />
                  {isStudent && <Item label="Blood group" value={user.blood_group} />}
                </Fields>
              </Block>
              <Block title="Contact">
                <Fields>
                  <Item label="Email" value={user.email} />
                  <Item label="Phone" value={user.phone} />
                  <Item label="Alternate phone" value={user.alternate_phone} />
                  <Item label="Address" value={addressOf(user)} wide />
                </Fields>
              </Block>
              <Block title="Internal notes">
                <p
                  className={cn(
                    'whitespace-pre-wrap border-l-2 border-border pl-3 text-sm',
                    user.notes ? 'text-foreground' : 'text-muted-foreground/60',
                  )}
                >
                  {user.notes || 'No notes. Notes are visible to administrators only.'}
                </p>
              </Block>
            </>
          )}

          {tab === 'admission' && (
            <>
              <Block title="Admission">
                <Fields>
                  <Item label="Admission number" value={user.admission_number} mono />
                  <Item label="Roll number" value={user.roll_number} mono />
                  <Item label="Admitted on" value={user.admission_date ? formatDate(user.admission_date) : null} />
                  <Item label="Session year" value={yearName(user.academic_year_id)} />
                  <Item label="Year first joined" value={yearName(user.admission_year_id)} />
                  <Item label="Admission category" value={category} />
                </Fields>
              </Block>
              <Block title="Academic">
                <Fields>
                  <Item label="Syllabus" value={user.syllabus} />
                  <Item label="Stream" value={user.academic_stream} />
                  <Item label="Medium" value={user.medium} />
                </Fields>
              </Block>
            </>
          )}

          {tab === 'guardian' && (
            <Block title="Guardian">
              <Fields>
                <Item label="Name" value={user.guardian_name} />
                <Item label="Relation" value={user.guardian_relation} />
                <Item label="Phone" value={user.guardian_phone} />
                <Item label="Email" value={user.guardian_email} />
              </Fields>
            </Block>
          )}

          {tab === 'class' && (
            <Block
              title="Enrollment"
              action={
                <Link to="/admin/enrollments" className="text-xs font-semibold text-primary hover:underline">
                  Manage enrollments
                </Link>
              }
            >
              {assignmentsLoading ? (
                <Skeleton className="h-16 rounded-md" />
              ) : enrollments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Not enrolled in a class, so they see nothing in their portal.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-border text-left text-2xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4 font-semibold">Class</th>
                      <th className="py-2 pr-4 font-semibold">Code</th>
                      <th className="py-2 font-semibold">Visibility</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {enrollments.map((e, index) => (
                      <tr key={e.id}>
                        <td className="py-2.5 pr-4 font-medium">
                          <span className="inline-flex items-center gap-2">
                            <Layers className="size-3.5 text-primary" />
                            {e.class_room.name}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">{e.class_room.code}</td>
                        <td className={cn('py-2.5 text-xs', index === 0 ? 'text-success' : 'text-warning')}>
                          {index === 0
                            ? 'This is the class they see.'
                            : 'Hidden from the student — only their first enrollment is used.'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Block>
          )}

          {tab === 'employment' && (
            <Block title="Employment">
              <Fields>
                <Item label="Employee ID" value={user.employee_id} mono />
                <Item label="Designation" value={user.designation} />
                <Item label="Qualification" value={user.qualification} />
                <Item label="Specialization" value={user.specialization} />
                <Item label="Date of joining" value={user.date_of_joining ? formatDate(user.date_of_joining) : null} />
                <Item
                  label="Experience"
                  value={
                    user.experience_years !== null && user.experience_years !== undefined
                      ? `${user.experience_years} year${user.experience_years === 1 ? '' : 's'}`
                      : null
                  }
                />
              </Fields>
              {user.role === 'ADMIN' && (
                <p className="text-xs text-muted-foreground">
                  Administrators manage the system and are not mapped to classes or subjects.
                </p>
              )}
            </Block>
          )}

          {tab === 'teaching' && (
            <>
              {/* isTeachingRole, not `=== 'TEACHER'` — a promoted teacher still
                  holds these mappings and hiding them would read as having none. */}
              <Block title={`Class teacher of (${leading.length})`}>
                {leading.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not the class teacher of any class.</p>
                ) : (
                  <ul className="divide-y divide-border border-y border-border">
                    {leading.map((m) => (
                      <li key={m.id} className="flex items-center gap-2 py-2.5 text-sm">
                        <Layers className="size-3.5 shrink-0 text-warning" />
                        <span className="font-medium">{m.class_room.name}</span>
                        <span className="ml-auto font-mono text-xs text-muted-foreground">{m.class_room.code}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Block>

              <Block
                title={`Subjects taught (${teaching.length})`}
                action={
                  <Link to="/admin/mappings" className="text-xs font-semibold text-primary hover:underline">
                    Manage mappings
                  </Link>
                }
              >
                {assignmentsLoading ? (
                  <Skeleton className="h-20 rounded-md" />
                ) : teaching.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Not mapped to any subject yet, so they cannot record anything.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y border-border text-left text-2xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-4 font-semibold">Subject</th>
                        <th className="py-2 pr-4 font-semibold">Code</th>
                        <th className="py-2 font-semibold">Class</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {teaching.map((m) => (
                        <tr key={m.id}>
                          <td className="py-2.5 pr-4 font-medium">
                            <span className="inline-flex items-center gap-2">
                              <BookOpen className="size-3.5 text-accent" />
                              {m.subject.name}
                            </span>
                          </td>
                          <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">{m.subject.code}</td>
                          <td className="py-2.5">{m.class_room.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Block>
            </>
          )}

          {tab === 'account' && (
            <>
              <Block title="Sign-in">
                <Fields>
                  <Item label="Email (login)" value={user.email} />
                  <Item label="Role" value={ROLE_LABEL[user.role]} />
                  <Item label="Status" value={user.is_active ? 'Active' : 'Inactive — cannot sign in'} />
                  <Item
                    label="Programmes"
                    value={(user.programs?.length ? user.programs : ['LMS' as const]).map((p) => PROGRAM_LABEL[p]).join(', ')}
                  />
                  <Item
                    label="Last seen"
                    value={
                      presence.isPending
                        ? null
                        : seen?.is_online
                          ? 'Online now'
                          : seen?.last_seen_at
                            ? formatDateTime(seen.last_seen_at)
                            : 'Not signed in yet'
                    }
                  />
                  <Item
                    label="Class reminders"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        {remindersOn ? <BellRing className="size-3.5 text-success" /> : <BellOff className="size-3.5" />}
                        {remindersOn ? 'Receives reminder emails' : 'Opted out'}
                      </span>
                    }
                  />
                  <Item label="Created" value={formatDateTime(user.created_at)} />
                  <Item label="Last updated" value={user.updated_at ? formatDateTime(user.updated_at) : null} />
                </Fields>
              </Block>

              {user.is_demo && (
                <Block title="Demo access">
                  <Fields>
                    <Item label="Works until" value={user.demo_expires_on ? formatDate(user.demo_expires_on) : null} />
                    <Item
                      label="Unlocked modules"
                      value={
                        user.demo_modules?.length ? (
                          <span className="flex flex-wrap gap-1">
                            {user.demo_modules.map((m) => (
                              <Badge key={m} tone="outline" size="sm">
                                {DEMO_MODULE_LABEL[m]}
                              </Badge>
                            ))}
                          </span>
                        ) : (
                          'Classes only'
                        )
                      }
                      wide
                    />
                  </Fields>
                </Block>
              )}
            </>
          )}
        </div>
      </div>

      <GenerateCredentialsDialog user={issuing ? user : null} onClose={() => setIssuing(false)} />

      <ConfirmDialog
        open={deactivating}
        onOpenChange={(v) => !v && setDeactivating(false)}
        title={`Deactivate ${user.full_name}?`}
        description="Their sign-in is blocked and they are signed out everywhere immediately. Attendance, grades and other records are kept, and you can reactivate the account at any time."
        confirmLabel="Deactivate"
        destructive
        loading={deactivateUser.isPending}
        onConfirm={() => deactivateUser.mutate(user.id, { onSettled: () => setDeactivating(false) })}
      />
    </div>
  )
}

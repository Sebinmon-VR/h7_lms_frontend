import {
  BookOpen,
  GraduationCap,
  KeyRound,
  Layers,
  Link2,
  Mail,
  Pencil,
  UserCheck,
  UserX,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import type { UserOut } from '@/api/types'
import { useEnrollments, useMappings, useReactivateUser } from '@/queries/admin.queries'
import { formatDateTime } from '@/lib/datetime'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ActiveBadge, RoleBadge } from '@/components/domain/badges'

/**
 * Everything the API knows about one person, assembled from the lists already
 * in cache — there is no `GET /admin/users/{id}`, and no per-user detail
 * endpoint of any kind.
 */
export function UserDetailSheet({
  user,
  onClose,
  onEdit,
  onDeactivate,
  onGenerateCredentials,
}: {
  user: UserOut | null
  onClose: () => void
  onEdit: (user: UserOut) => void
  onDeactivate: (user: UserOut) => void
  onGenerateCredentials: (user: UserOut) => void
}) {
  const mappingsQuery = useMappings(!!user)
  const enrollmentsQuery = useEnrollments(!!user)
  const reactivateUser = useReactivateUser()

  const teaching = (mappingsQuery.data ?? []).filter((m) => m.teacher.id === user?.id)
  const enrollments = (enrollmentsQuery.data ?? []).filter((e) => e.student.id === user?.id)

  const loading = mappingsQuery.isPending || enrollmentsQuery.isPending

  return (
    <Sheet open={!!user} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold">User details</SheetTitle>
        </SheetHeader>

        <SheetBody className="space-y-6">
          {user && (
            <>
              <div className="flex items-center gap-4">
                <Avatar name={user.full_name} size="xl" />
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{user.full_name}</p>
                  <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                    <Mail className="size-3.5 shrink-0" />
                    {user.email}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <RoleBadge role={user.role} size="sm" />
                    <ActiveBadge active={user.is_active} />
                  </div>
                </div>
              </div>

              <Separator />

              <dl className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd>{formatDateTime(user.created_at)}</dd>
                </div>
              </dl>

              {user.role === 'TEACHER' && (
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Link2 className="size-3.5" />
                    Teaching mappings ({teaching.length})
                  </h3>
                  {loading ? (
                    <Skeleton className="h-20 rounded-lg" />
                  ) : teaching.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                      <p>Not mapped to any subject yet, so they cannot record anything.</p>
                      <Button asChild variant="outline" size="sm" className="mt-2">
                        <Link to="/admin/mappings">Create a mapping</Link>
                      </Button>
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {teaching.map((m) => (
                        <li key={m.id} className="rounded-lg border border-border p-3">
                          <div className="flex items-center gap-2">
                            <BookOpen className="size-3.5 shrink-0 text-accent" />
                            <span className="text-sm font-medium">{m.subject.name}</span>
                            <Badge tone="outline" size="sm" className="ml-auto">
                              {m.subject.code}
                            </Badge>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                            <Layers className="size-3.5" />
                            {m.class_room.name}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {user.role === 'STUDENT' && (
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <GraduationCap className="size-3.5" />
                    Enrollment ({enrollments.length})
                  </h3>
                  {loading ? (
                    <Skeleton className="h-16 rounded-lg" />
                  ) : enrollments.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                      <p>Not enrolled in a class, so they see nothing in their portal.</p>
                      <Button asChild variant="outline" size="sm" className="mt-2">
                        <Link to="/admin/enrollments">Enroll them</Link>
                      </Button>
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {enrollments.map((e, index) => (
                        <li key={e.id} className="rounded-lg border border-border p-3">
                          <div className="flex items-center gap-2">
                            <Layers className="size-3.5 shrink-0 text-primary" />
                            <span className="text-sm font-medium">{e.class_room.name}</span>
                            <Badge tone="outline" size="sm" className="ml-auto">
                              {e.class_room.code}
                            </Badge>
                          </div>
                          {/* Only the first enrollment is ever visible to the
                              student — the API resolves their class that way. */}
                          {index === 0 ? (
                            <p className="mt-1.5 text-xs text-success">This is the class they see.</p>
                          ) : (
                            <p className="mt-1.5 text-xs text-warning">
                              Hidden from the student — only their first enrollment is used.
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {user.role === 'ADMIN' && (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  Administrators manage the system and are not mapped to classes or subjects.
                </p>
              )}
            </>
          )}
        </SheetBody>

        <SheetFooter>
          {user && (
            <>
              {/* The primary action: a user without credentials cannot sign in
                  at all, so this is what an admin most often came here to do. */}
              <Button
                variant="primary"
                icon={<KeyRound />}
                onClick={() => onGenerateCredentials(user)}
              >
                Generate credentials
              </Button>
              <Button variant="outline" icon={<Pencil />} onClick={() => onEdit(user)}>
                Edit
              </Button>
              {user.is_active ? (
                <Button variant="ghost" icon={<UserX />} onClick={() => onDeactivate(user)}>
                  Deactivate
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  icon={<UserCheck />}
                  loading={reactivateUser.isPending}
                  onClick={() => reactivateUser.mutate(user.id)}
                >
                  Reactivate
                </Button>
              )}
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

import { BookOpen, Info, Layers } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { UserCell } from '@/components/domain/user-cell'
import { ErrorState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { AdminStudentNotice, NotEnrolledState, useEnrollmentStatus } from './student-guard'

export default function StudentClassesPage() {
  const enrollment = useEnrollmentStatus()

  if (enrollment.isAdmin) {
    return (
      <>
        <PageHeader title="My classes" description="Your subjects and who teaches them." />
        <AdminStudentNotice />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="My classes"
        description={
          enrollment.classRoom
            ? `Subjects taught in ${enrollment.classRoom.name}.`
            : 'Your subjects and who teaches them.'
        }
      >
        {enrollment.classRoom && (
          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              You are viewing <strong>{enrollment.classRoom.name}</strong> ({enrollment.classRoom.code}).
              Everything else in the app — attendance, materials, meetings — is for this class.
            </span>
          </div>
        )}
      </PageHeader>

      {enrollment.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : enrollment.isError ? (
        <ErrorState error={enrollment.error} onRetry={() => enrollment.refetch()} />
      ) : enrollment.notEnrolled ? (
        <NotEnrolledState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enrollment.mappings.map((mapping) => (
            <Card key={mapping.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
                  <BookOpen className="size-5" />
                </span>
                <Badge tone="outline" size="sm">
                  {mapping.subject.code}
                </Badge>
              </div>

              <h3 className="mt-3 text-base font-semibold">{mapping.subject.name}</h3>
              {mapping.subject.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{mapping.subject.description}</p>
              )}

              <div className="mt-4 border-t border-border/60 pt-3">
                <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Taught by
                </p>
                <UserCell name={mapping.teacher.full_name} email={mapping.teacher.email} size="xs" />
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Layers className="size-3.5" />
                {mapping.class_room.name}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

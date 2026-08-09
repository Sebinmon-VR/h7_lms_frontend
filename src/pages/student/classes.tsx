import { Link } from 'react-router-dom'

import { subjectLook, toneStyle } from '@/lib/subjects'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { UserCell } from '@/components/domain/user-cell'
import { ErrorState } from '@/components/feedback/states'
import { Appear, Stagger } from '@/components/fun/motion'
import { FunPageHeader, SubjectTile } from '@/components/fun/fun-ui'
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
      <FunPageHeader
        emoji="🎒"
        tone={7}
        title="My subjects"
        description={
          enrollment.classRoom
            ? `Everything you learn in ${enrollment.classRoom.name}.`
            : 'What you learn, and who teaches it.'
        }
        actions={
          enrollment.classRoom ? (
            <Badge tone="primary">{enrollment.classRoom.name}</Badge>
          ) : undefined
        }
      />

      {enrollment.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : enrollment.isError ? (
        <ErrorState error={enrollment.error} onRetry={() => enrollment.refetch()} />
      ) : enrollment.notEnrolled ? (
        <NotEnrolledState />
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enrollment.mappings.map((mapping) => (
            <Appear
              key={mapping.id}
              style={toneStyle(subjectLook(mapping.subject.name).tone)}
              className="sticker flex flex-col p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <SubjectTile subject={mapping.subject.name} size="lg" />
                <Badge tone="outline" size="sm">
                  {mapping.subject.code}
                </Badge>
              </div>

              <h3 className="mt-3 text-lg font-extrabold">{mapping.subject.name}</h3>
              {mapping.subject.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {mapping.subject.description}
                </p>
              )}

              <div className="mt-4 border-t-2 border-[hsl(var(--tile)/0.2)] pt-3">
                <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                  Your teacher
                </p>
                <UserCell name={mapping.teacher.full_name} email={mapping.teacher.email} size="xs" />
              </div>
            </Appear>
          ))}
        </Stagger>
      )}

      {/* Every other student page is scoped to this same class, which is worth
          saying once here rather than repeating on each of them. */}
      {enrollment.classRoom && !enrollment.notEnrolled && (
        <p className="mt-5 rounded-xl border-2 border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
          Your marks, days and notes all come from{' '}
          <strong className="text-foreground">{enrollment.classRoom.name}</strong>. Have a look at
          your{' '}
          <Link to="/student/timetable" className="font-semibold text-primary hover:underline">
            timetable
          </Link>{' '}
          to see when each subject happens.
        </p>
      )}
    </>
  )
}

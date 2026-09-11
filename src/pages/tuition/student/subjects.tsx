import { BookOpen } from 'lucide-react'

import { useMyTuitionSubjects } from '@/queries/tuition.queries'
import { Skeleton } from '@/components/ui/skeleton'
import { EnrollmentSummary } from '@/components/domain/tuition'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * What the student learns one to one, and who teaches it.
 *
 * Each card is one arrangement — subject, tutor, the goal it was set up for
 * and the syllabus being worked through. One subject has exactly one tutor
 * here, which is why there is no list of teachers per subject.
 */
export default function TuitionStudentSubjectsPage() {
  const enrollments = useMyTuitionSubjects()

  return (
    <>
      <PageHeader
        title="My tutors"
        description="The subjects you take one to one, who teaches each, and what you are working towards."
      />

      <QueryBoundary
        query={enrollments}
        loading={
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
        }
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={<BookOpen />}
            title="No tuition subjects yet"
            description="Once the office pairs you with a tutor, the subject appears here."
          />
        }
      >
        {(data) => (
          <div className="space-y-3">
            {data.map((enrollment) => (
              <EnrollmentSummary
                key={enrollment.id}
                enrollment={enrollment}
                viewerIsTeacher={false}
              />
            ))}
          </div>
        )}
      </QueryBoundary>
    </>
  )
}

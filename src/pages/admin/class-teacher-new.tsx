import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Layers,
  PencilLine,
  ShieldCheck,
  UserRoundCog,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  useAssignClassTeacher,
  useClasses,
  useClassTeachers,
  useEnrollments,
  useMappings,
  useTeachingStaff,
} from '@/queries/admin.queries'
import { countLabel } from '@/lib/format'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Skeleton } from '@/components/ui/skeleton'
import { RoleBadge } from '@/components/domain/badges'
import { Field } from '@/components/forms/field'
import { FormActions, FormPage, FormSection } from '@/components/forms/form-page'

const BACK_TO = '/admin/mappings?tab=class-teachers'

/** What the assignment actually grants, spelled out rather than implied. */
const GRANTS = [
  {
    icon: Eye,
    text: 'See the attendance, syllabus, marks, live classes and materials that every teacher files against the class — not only their own periods.',
  },
  {
    icon: PencilLine,
    text: 'Correct any of those records, whoever entered them.',
  },
  {
    icon: ShieldCheck,
    text: 'Nothing outside this class. Elsewhere they stay an ordinary subject teacher.',
  },
]

export default function AdminClassTeacherNewPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const teachersQuery = useTeachingStaff()
  const classesQuery = useClasses()
  const existingQuery = useClassTeachers()
  const mappingsQuery = useMappings()
  const enrollmentsQuery = useEnrollments()
  const assign = useAssignClassTeacher()

  // Pre-selected when arrived at from a specific class's row.
  const [teacherId, setTeacherId] = React.useState<string | null>(null)
  const [classId, setClassId] = React.useState<string | null>(params.get('class_id'))
  const [error, setError] = React.useState<string | null>(null)

  const teacher = teachersQuery.data?.find((t) => String(t.id) === teacherId) ?? null
  const klass = classesQuery.data?.find((c) => String(c.id) === classId) ?? null
  const existing = existingQuery.data ?? []
  const ready = !!teacher && !!klass

  const duplicate =
    ready && existing.some((m) => m.teacher.id === teacher.id && m.class_room.id === klass.id)

  /** Classes this teacher already leads — context for "are they overloaded?". */
  const alreadyLeads = React.useMemo(
    () => (teacher ? existing.filter((m) => m.teacher.id === teacher.id) : []),
    [existing, teacher],
  )

  /** Who currently leads the chosen class. Several is legitimate, not an error. */
  const currentLeaders = React.useMemo(
    () => (klass ? existing.filter((m) => m.class_room.id === klass.id) : []),
    [existing, klass],
  )

  /** Whether the teacher actually takes a period in this class. */
  const teachesHere = React.useMemo(() => {
    if (!teacher || !klass) return []
    return (mappingsQuery.data ?? []).filter(
      (m) => m.teacher.id === teacher.id && m.class_room.id === klass.id,
    )
  }, [mappingsQuery.data, teacher, klass])

  const studentCount = React.useMemo(
    () => (klass ? (enrollmentsQuery.data ?? []).filter((e) => e.class_room.id === klass.id).length : 0),
    [enrollmentsQuery.data, klass],
  )

  const submit = async () => {
    if (!ready) return
    setError(null)

    // A duplicate POST returns the existing row with status 201, so checking
    // beforehand is the only way to report "already assigned" honestly.
    if (duplicate) {
      toast.info(`${teacher.full_name} already leads ${klass.name}.`)
      navigate(BACK_TO)
      return
    }

    try {
      await assign.mutateAsync({ teacher_id: teacher.id, class_id: klass.id })
      toast.success(`${teacher.full_name} is now the class teacher of ${klass.name}`, {
        description:
          teacher.role === 'CLASS_TEACHER'
            ? undefined
            : 'They have been signed out of every device so the class-teacher screens appear on their next sign-in.',
      })
      navigate(BACK_TO)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not assign the class teacher.')
    }
  }

  return (
    <FormPage
      title="Assign a class teacher"
      description="Makes one teacher answerable for a whole class, rather than for a single subject in it. This is the broadest assignment in the system — everything below explains exactly what it grants."
      backTo={BACK_TO}
      backLabel="Teacher Mappings"
      aside={
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Summary</h2>

          {!ready ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Choose a teacher and a class to see what will change.
            </p>
          ) : duplicate ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                <strong>{teacher.full_name}</strong> already leads <strong>{klass.name}</strong>.
                Nothing will change.
              </span>
            </div>
          ) : (
            <>
              <p className="mt-3 text-sm">
                <strong>{teacher.full_name}</strong> becomes the class teacher of{' '}
                <strong>{klass.name}</strong>.
              </p>

              <ul className="mt-4 space-y-2.5 border-t border-border/60 pt-4">
                {GRANTS.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>

              {teacher.role !== 'CLASS_TEACHER' && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/8 p-3 text-xs">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  <span className="text-muted-foreground">
                    This <strong>signs them out everywhere</strong>. Their role changes to Class
                    teacher, which re-issues their credentials so the new screens appear straight
                    away instead of whenever their current session happens to end.
                  </span>
                </div>
              )}
            </>
          )}
        </Card>
      }
      footer={
        <FormActions
          cancelTo={BACK_TO}
          submitLabel={duplicate ? 'Already assigned' : 'Assign class teacher'}
          submitIcon={<UserRoundCog />}
          disabled={!ready || duplicate}
          loading={assign.isPending}
          onSubmit={submit}
        />
      }
    >
      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/8 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <FormSection
        step={1}
        title="Who leads the class"
        description="Only teachers appear here. Administrators already reach every class, so assigning one would change nothing and the server refuses it."
      >
        <Field id="teacher" label="Teacher" required>
          <Combobox
            id="teacher"
            value={teacherId}
            onChange={setTeacherId}
            placeholder={teachersQuery.isPending ? 'Loading teachers…' : 'Search by name or email'}
            emptyMessage="No teachers found. Create one under Users."
            options={(teachersQuery.data ?? [])
              .filter((t) => t.is_active)
              .map((t) => ({
                value: String(t.id),
                label: t.full_name,
                hint: t.email,
                keywords: t.employee_id ?? '',
              }))}
          />
        </Field>

        {teachersQuery.isPending ? (
          <Skeleton className="h-20 rounded-lg" />
        ) : (
          teacher && (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <Avatar name={teacher.full_name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{teacher.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{teacher.email}</p>
                </div>
                <RoleBadge role={teacher.role} size="sm" />
              </div>

              <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                {alreadyLeads.length === 0 ? (
                  'Leads no class at present.'
                ) : (
                  <>
                    Already leads{' '}
                    {alreadyLeads.map((m, i) => (
                      <React.Fragment key={m.id}>
                        {i > 0 && ', '}
                        <strong className="text-foreground">{m.class_room.name}</strong>
                      </React.Fragment>
                    ))}
                    . A teacher may lead more than one.
                  </>
                )}
              </p>
            </div>
          )
        )}
      </FormSection>

      <FormSection
        step={2}
        title="Which class"
        description="Authority is scoped to this class alone. Leading 9-A grants nothing over 10-B."
      >
        <Field id="class" label="Class" required>
          <Combobox
            id="class"
            value={classId}
            onChange={setClassId}
            placeholder={classesQuery.isPending ? 'Loading classes…' : 'Search by name or code'}
            emptyMessage="No classes found."
            options={(classesQuery.data ?? []).map((c) => ({
              value: String(c.id),
              label: c.name,
              hint: c.code,
            }))}
          />
        </Field>

        {klass && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <Layers className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{klass.name}</p>
                <p className="truncate text-xs text-muted-foreground">{klass.code}</p>
              </div>
              <Badge tone="neutral" size="sm">
                <Users />
                {enrollmentsQuery.isPending ? '…' : countLabel(studentCount, 'student')}
              </Badge>
            </div>

            <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              <p>
                {currentLeaders.length === 0 ? (
                  'No class teacher yet.'
                ) : (
                  <>
                    Currently led by{' '}
                    {currentLeaders.map((m, i) => (
                      <React.Fragment key={m.id}>
                        {i > 0 && ', '}
                        <strong className="text-foreground">{m.teacher.full_name}</strong>
                      </React.Fragment>
                    ))}
                    . Adding another is fine — joint and relief arrangements are supported.
                  </>
                )}
              </p>

              {/* Not a blocker: a class teacher need not take a period in the
                  class. But it is worth saying out loud, because the usual
                  cause is picking the wrong class. */}
              {teacher && (
                <p className="flex items-start gap-1.5">
                  {teachesHere.length > 0 ? (
                    <>
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                      <span>
                        {teacher.full_name.split(' ')[0]} teaches{' '}
                        {teachesHere.map((m) => m.subject.name).join(', ')} here.
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                      <span>
                        {teacher.full_name.split(' ')[0]} takes no subject in this class. That is
                        allowed, but check it is the class you meant.
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
        )}
      </FormSection>
    </FormPage>
  )
}

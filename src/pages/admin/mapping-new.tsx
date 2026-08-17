import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, BookOpen, Layers, Link2, Users } from 'lucide-react'
import { toast } from 'sonner'

import {
  useClasses,
  useCreateMapping,
  useEnrollments,
  useMappings,
  useSubjects,
  useTeachingStaff,
} from '@/queries/admin.queries'
import { countLabel } from '@/lib/format'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { RoleBadge } from '@/components/domain/badges'
import { Field } from '@/components/forms/field'
import { FormActions, FormPage, FormSection } from '@/components/forms/form-page'

const BACK_TO = '/admin/mappings'

export default function AdminMappingNewPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const teachersQuery = useTeachingStaff()
  const subjectsQuery = useSubjects()
  const classesQuery = useClasses()
  const enrollmentsQuery = useEnrollments()
  const existingQuery = useMappings()
  const createMapping = useCreateMapping()

  const [teacherId, setTeacherId] = React.useState<string | null>(params.get('teacher_id'))
  const [subjectId, setSubjectId] = React.useState<string | null>(null)
  const [classId, setClassId] = React.useState<string | null>(params.get('class_id'))
  const [error, setError] = React.useState<string | null>(null)

  const teacher = teachersQuery.data?.find((t) => String(t.id) === teacherId) ?? null
  const subject = subjectsQuery.data?.find((s) => String(s.id) === subjectId) ?? null
  const klass = classesQuery.data?.find((c) => String(c.id) === classId) ?? null
  const existing = existingQuery.data ?? []
  const ready = !!teacher && !!subject && !!klass

  const duplicate =
    ready &&
    existing.some(
      (m) => m.teacher.id === teacher.id && m.subject.id === subject.id && m.class_room.id === klass.id,
    )

  /** Anyone already teaching this subject here — a co-teacher, not a clash. */
  const alsoTeaching = React.useMemo(() => {
    if (!subject || !klass) return []
    return existing.filter(
      (m) => m.subject.id === subject.id && m.class_room.id === klass.id && m.teacher.id !== teacher?.id,
    )
  }, [existing, subject, klass, teacher])

  const studentCount = React.useMemo(
    () => (klass ? (enrollmentsQuery.data ?? []).filter((e) => e.class_room.id === klass.id).length : 0),
    [enrollmentsQuery.data, klass],
  )

  const submit = async () => {
    if (!ready) return
    setError(null)

    // A duplicate POST returns the existing row with status 201, so the only
    // honest way to report "already assigned" is to check before sending.
    if (duplicate) {
      toast.info('That mapping already exists.')
      navigate(BACK_TO)
      return
    }

    try {
      await createMapping.mutateAsync({
        teacher_id: teacher.id,
        subject_id: subject.id,
        class_id: klass.id,
      })
      toast.success(`${teacher.full_name} now teaches ${subject.name} in ${klass.name}`)
      navigate(BACK_TO)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not create the mapping.')
    }
  }

  return (
    <FormPage
      title="Map a teacher to a subject"
      description="Gives one teacher one subject in one class. This is what lets them take the register, log topics, post materials and enter marks for that pairing."
      backTo={BACK_TO}
      backLabel="Teacher Mappings"
      aside={
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Summary</h2>

          {!ready ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Fill in all three to see what will change.
            </p>
          ) : duplicate ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>This mapping already exists. Nothing will change.</span>
            </div>
          ) : (
            <>
              <p className="mt-3 text-sm">
                <strong>{teacher.full_name}</strong> will teach <strong>{subject.name}</strong> in{' '}
                <strong>{klass.name}</strong>.
              </p>
              <p className="mt-4 border-t border-border/60 pt-4 text-xs text-muted-foreground">
                Scoped to this subject in this class. To make them answerable for the whole class,
                assign them as its class teacher instead.
              </p>
            </>
          )}
        </Card>
      }
      footer={
        <FormActions
          cancelTo={BACK_TO}
          submitLabel={duplicate ? 'Already mapped' : 'Create mapping'}
          submitIcon={<Link2 />}
          disabled={!ready || duplicate}
          loading={createMapping.isPending}
          onSubmit={submit}
        />
      }
    >
      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/8 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <FormSection step={1} title="Teacher" description="Class teachers appear here too — they take subjects like anyone else.">
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

        {teacher && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
            <Avatar name={teacher.full_name} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{teacher.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">{teacher.email}</p>
            </div>
            <RoleBadge role={teacher.role} size="sm" />
          </div>
        )}
      </FormSection>

      <FormSection step={2} title="Subject" description="What they will teach.">
        <Field id="subject" label="Subject" required>
          <Combobox
            id="subject"
            value={subjectId}
            onChange={setSubjectId}
            placeholder={subjectsQuery.isPending ? 'Loading subjects…' : 'Search by name or code'}
            emptyMessage="No subjects found."
            options={(subjectsQuery.data ?? []).map((s) => ({
              value: String(s.id),
              label: s.name,
              hint: s.code,
            }))}
          />
        </Field>

        {subject && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
              <BookOpen className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{subject.name}</p>
              <p className="truncate text-xs text-muted-foreground">{subject.code}</p>
            </div>
          </div>
        )}
      </FormSection>

      <FormSection step={3} title="Class" description="Where they will teach it.">
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

            {/* Co-teaching is legitimate, so this is information rather than a
                warning — but an admin who did not expect it usually picked the
                wrong class. */}
            {alsoTeaching.length > 0 && subject && (
              <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                {alsoTeaching.map((m) => m.teacher.full_name).join(', ')} already{' '}
                {alsoTeaching.length === 1 ? 'teaches' : 'teach'} {subject.name} here. Several
                teachers may share a subject.
              </p>
            )}
          </div>
        )}
      </FormSection>
    </FormPage>
  )
}

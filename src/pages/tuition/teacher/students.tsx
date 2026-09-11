import { BarChart3, FileBadge, Users } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { TuitionEnrollmentOut } from '@/api/types'
import {
  useCreateTuitionReportCard,
  useMyTuitionStudents,
  usePublishTuitionReportCard,
  useTuitionStudentReport,
} from '@/queries/tuition.queries'
import { formatDate } from '@/lib/datetime'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field } from '@/components/forms/field'
import { AttendanceTotalsGrid, EnrollmentSummary } from '@/components/domain/tuition'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * The students this tutor teaches, one arrangement at a time.
 *
 * Selecting one loads their attendance report beside it, because in a
 * one-to-one product "how is this student doing" is the only question the
 * screen is really for — there is no class average to compare against and no
 * cohort to rank within.
 */

function ReportCardDialog({
  enrollment,
  onOpenChange,
}: {
  enrollment: TuitionEnrollmentOut | null
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateTuitionReportCard()
  const publish = usePublishTuitionReportCard()
  const [title, setTitle] = React.useState('')
  const [from, setFrom] = React.useState<string | null>(null)
  const [to, setTo] = React.useState<string | null>(null)
  const [countMissing, setCountMissing] = React.useState(false)
  const [remarks, setRemarks] = React.useState('')

  /**
   * The card that was just generated, if any.
   *
   * Held so the dialog can offer to publish it. Generating and publishing are
   * two backend calls and genuinely two decisions — a card is private until
   * released, which is what lets a tutor read it back before the student does
   * — but closing the dialog in between would leave the second one with no
   * obvious home, and an unpublished card is invisible to everyone.
   */
  const [generated, setGenerated] = React.useState<{ id: string; title: string } | null>(null)

  React.useEffect(() => {
    if (!enrollment) return
    setTitle('')
    setFrom(null)
    setTo(null)
    setCountMissing(false)
    setRemarks('')
    setGenerated(null)
  }, [enrollment])

  if (generated) {
    return (
      <ConfirmDialog
        open={!!enrollment}
        onOpenChange={onOpenChange}
        title="Publish this report card?"
        confirmLabel="Publish to the student"
        cancelLabel="Keep it private"
        loading={publish.isPending}
        description={`“${generated.title}” is generated and visible only to you. Publishing shows it to the student.`}
        onConfirm={() =>
          publish.mutate(generated.id, { onSuccess: () => onOpenChange(false) })
        }
      >
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">
          Read it back first if you want to — it stays where it is either way, and you can
          publish it later.
        </p>
      </ConfirmDialog>
    )
  }

  return (
    <ConfirmDialog
      open={!!enrollment}
      onOpenChange={onOpenChange}
      title={`Report card for ${enrollment?.student?.full_name ?? 'this student'}`}
      confirmLabel="Generate"
      loading={create.isPending}
      description="Consolidates their tuition work over a period. It stays private to you until you publish it."
      onConfirm={() => {
        if (!enrollment || !title.trim()) return
        create.mutate(
          {
            student_id: enrollment.student_id,
            title: title.trim(),
            from_date: from,
            to_date: to,
            count_missing_as_zero: countMissing,
            remarks: remarks.trim() || null,
          },
          {
            onSuccess: (card) => {
              // The backend names it `id` on some paths and `card_id` on
              // others; without either there is nothing to publish, so the
              // dialog just closes rather than offering a dead button.
              const id = card.id ?? card.card_id
              if (!id) {
                onOpenChange(false)
                return
              }
              setGenerated({ id: String(id), title: String(card.title ?? title.trim()) })
            },
          },
        )
      }}
    >
      <div className="space-y-3">
        <Field id="rc-title" label="Title" required hint="e.g. Term 1 2026">
          <Input
            id="rc-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="rc-from" label="From">
            <DatePicker id="rc-from" value={from} onChange={setFrom} />
          </Field>
          <Field id="rc-to" label="To">
            <DatePicker id="rc-to" value={to} onChange={setTo} />
          </Field>
        </div>

        {/* Off by default and stated plainly: an absence is not a mark, and
            averaging one in unasked misreports the student. */}
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={countMissing}
            onCheckedChange={(v) => setCountMissing(v === true)}
          />
          <span>
            Count unsat papers as zero
            <span className="block text-xs text-muted-foreground">
              Off, they are left out of the average entirely.
            </span>
          </span>
        </label>

        <Field id="rc-remarks" label="Remarks" hint="Shown to the student once published.">
          <Textarea
            id="rc-remarks"
            rows={3}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
          />
        </Field>
      </div>
    </ConfirmDialog>
  )
}

export default function TuitionTeacherStudentsPage() {
  const [includeInactive, setIncludeInactive] = React.useState(false)
  const enrollments = useMyTuitionStudents(includeInactive)

  const [selected, setSelected] = React.useState<TuitionEnrollmentOut | null>(null)
  const [reportCardFor, setReportCardFor] = React.useState<TuitionEnrollmentOut | null>(null)

  // The report is per student, not per arrangement: a student taking two
  // subjects with the same tutor has one attendance record, broken down.
  const report = useTuitionStudentReport('teacher', selected?.student_id ?? null)

  return (
    <>
      <PageHeader
        title="My students"
        description="The students you teach one to one, and how each of them is getting on."
        actions={
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={includeInactive}
              onCheckedChange={(v) => setIncludeInactive(v === true)}
            />
            Include paused and finished
          </label>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <QueryBoundary
          query={enrollments}
          loading={
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          }
          isEmpty={(data) => data.length === 0}
          empty={
            <EmptyState
              icon={<Users />}
              title="No students yet"
              description="An administrator assigns students to you. They appear here as soon as they do."
            />
          }
        >
          {(data) => (
            <div className="space-y-3">
              {data.map((enrollment) => (
                <EnrollmentSummary
                  key={enrollment.id}
                  enrollment={enrollment}
                  viewerIsTeacher
                  actions={
                    <>
                      <Button
                        size="sm"
                        variant={selected?.id === enrollment.id ? 'solid' : 'outline'}
                        onClick={() => setSelected(enrollment)}
                      >
                        <BarChart3 />
                        Report
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setReportCardFor(enrollment)}
                      >
                        <FileBadge />
                        Report card
                      </Button>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </QueryBoundary>

        <div>
          {selected ? (
            <Card className="sticky top-4 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  {selected.student?.full_name ?? 'Student'}
                </h2>
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/tuition/teacher/sessions`}>Their classes</Link>
                </Button>
              </div>

              <QueryBoundary
                query={report}
                loading={
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                }
              >
                {(data) => (
                  <>
                    <p className="mb-3 text-xs text-muted-foreground">
                      {formatDate(data.from_date)} – {formatDate(data.to_date)}
                    </p>
                    <AttendanceTotalsGrid totals={data.totals} className="lg:grid-cols-3" />

                    {data.subjects.length > 0 && (
                      <ul className="mt-4 space-y-1.5">
                        {data.subjects.map((line, index) => (
                          <li
                            key={index}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                          >
                            <span className="truncate font-medium">
                              {String(line.subject ?? `Subject ${line.subject_id}`)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {line.attended ?? 0}/{line.conducted ?? 0} attended
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </QueryBoundary>
            </Card>
          ) : (
            <Card className="flex h-48 items-center justify-center p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Pick a student to see their attendance and hours.
              </p>
            </Card>
          )}
        </div>
      </div>

      <ReportCardDialog
        enrollment={reportCardFor}
        onOpenChange={(open) => !open && setReportCardFor(null)}
      />
    </>
  )
}

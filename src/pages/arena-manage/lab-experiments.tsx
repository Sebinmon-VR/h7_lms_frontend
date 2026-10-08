import { BarChart3, CalendarClock, FlaskConical, Pencil, Plus, School, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import type { LabAssignment } from '@/api/lab.api'
import { cn } from '@/lib/cn'
import { formatDateTime, parseApiDateTime } from '@/lib/datetime'
import { useManageClasses } from '@/queries/arena.queries'
import { useDeleteLabAssignment, useLabAssignments, useUpdateLabAssignment } from '@/queries/lab.queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { ProgressBar } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { EXPERIMENTS } from '@/pages/student/lab/engine/experiments'
import { EditAssignmentDialog } from './lab/edit-dialog'
import { ResultsSheet } from './lab/results-sheet'
import { SetExperimentDialog } from './lab/set-dialog'

function numberParam(value: string | null): number | null {
  if (!value) return null
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

export default function LabExperimentsPage() {
  const classesQuery = useManageClasses()
  const [params, setParams] = useSearchParams()
  const classes = React.useMemo(() => classesQuery.data ?? [], [classesQuery.data])
  const rawClass = numberParam(params.get('class'))
  const classId = classes.some((c) => c.id === rawClass) ? rawClass : null
  const className = classes.find((c) => c.id === classId)?.name ?? ''
  const [setOpen, setSetOpen] = React.useState(false)

  const pickClass = React.useCallback(
    (id: string | number) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('class', String(id))
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  // One class is no choice: fill it in.
  React.useEffect(() => {
    if (classId == null && classes.length === 1) pickClass(classes[0].id)
  }, [classId, classes, pickClass])

  return (
    <>
      <PageHeader
        title="Lab experiments"
        description="Set virtual chemistry experiments for a class. Students run them in the Virtual Lab game in the arena, and finishing one earns them arena XP and coins."
        actions={
          <Button variant="primary" icon={<Plus />} disabled={classId == null} onClick={() => setSetOpen(true)}>
            Set an experiment
          </Button>
        }
      >
        {classes.length > 0 && (
          <div className="max-w-sm">
            <Combobox
              id="lab-class"
              value={classId ? String(classId) : null}
              onChange={pickClass}
              placeholder="Choose a class"
              searchPlaceholder="Search classes…"
              options={classes.map((c) => ({ value: String(c.id), label: c.name }))}
            />
          </div>
        )}
      </PageHeader>

      <QueryBoundary
        query={classesQuery}
        loading={<ListSkeleton />}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            icon={<School />}
            title="You aren't assigned to a class yet"
            description="Once an administrator maps you to a class on the timetable, you can set lab experiments for it here."
          />
        }
      >
        {() =>
          classId == null ? (
            <EmptyState
              icon={<FlaskConical />}
              title="Choose a class"
              description="Pick the class you want to set experiments for."
            />
          ) : (
            <AssignmentList key={classId} classId={classId} className={className} onSet={() => setSetOpen(true)} />
          )
        }
      </QueryBoundary>

      {classId != null && (
        <SetExperimentDialog open={setOpen} onOpenChange={setSetOpen} classId={classId} className={className} />
      )}
    </>
  )
}

function ListSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-44 rounded-xl" />
      ))}
    </div>
  )
}

function AssignmentList({ classId, className, onSet }: { classId: number; className: string; onSet: () => void }) {
  const query = useLabAssignments(classId)
  const update = useUpdateLabAssignment()
  const remove = useDeleteLabAssignment()
  const [results, setResults] = React.useState<LabAssignment | null>(null)
  const [editing, setEditing] = React.useState<LabAssignment | null>(null)
  const [deleting, setDeleting] = React.useState<LabAssignment | null>(null)

  const toggle = (a: LabAssignment, on: boolean) =>
    update.mutate(
      { id: a.id, body: { is_active: on } },
      { onSuccess: () => toast.success(on ? `“${a.title}” is open to students` : `“${a.title}” is hidden from students`) },
    )

  return (
    <>
      <QueryBoundary
        query={query}
        loading={<ListSkeleton />}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            icon={<FlaskConical />}
            title={`No experiments set for ${className} yet`}
            description={`Pick one of the ${EXPERIMENTS.length} ready-made experiments, or build your own with steps the lab checks and a short quiz. Students find it in the Virtual Lab.`}
            action={
              <Button variant="primary" icon={<Plus />} onClick={onSet}>
                Set the first experiment
              </Button>
            }
          />
        }
      >
        {(list) => (
          <div className="grid gap-4 lg:grid-cols-2">
            {list.map((a) => (
              <AssignmentCard
                key={a.id}
                assignment={a}
                toggling={update.isPending && update.variables?.id === a.id}
                onToggle={(on) => toggle(a, on)}
                onResults={() => setResults(a)}
                onEdit={() => setEditing(a)}
                onDelete={() => setDeleting(a)}
              />
            ))}
          </div>
        )}
      </QueryBoundary>

      <ResultsSheet assignment={results} onOpenChange={(v) => !v && setResults(null)} />
      <EditAssignmentDialog assignment={editing} onOpenChange={(v) => !v && setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Remove this experiment?"
        description={
          deleting
            ? `“${deleting.title}” disappears from ${className}'s Virtual Lab. Runs students have already finished, and the XP and coins they earned, are kept.`
            : undefined
        }
        confirmLabel="Remove"
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.id, { onSettled: () => setDeleting(null) })
        }}
      />
    </>
  )
}

function AssignmentCard({
  assignment: a,
  toggling,
  onToggle,
  onResults,
  onEdit,
  onDelete,
}: {
  assignment: LabAssignment
  toggling: boolean
  onToggle: (on: boolean) => void
  onResults: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const done = a.completed_by ?? 0
  const size = a.class_size ?? 0
  const due = parseApiDateTime(a.due_at)
  const overdue = !!due && due.getTime() < Date.now()
  const switchId = `lab-active-${a.id}`

  return (
    <Card className={cn('flex min-w-0 flex-col p-4', !a.is_active && 'bg-muted/30')}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl',
            !a.is_active && 'opacity-60',
          )}
          aria-hidden
        >
          {a.emoji}
        </span>
        <div className={cn('min-w-0 flex-1', !a.is_active && 'opacity-70')}>
          <h3 className="break-words text-sm font-semibold leading-snug">{a.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{a.topic}</span>
            <Badge tone={a.library_id ? 'info' : 'accent'} size="sm">
              {a.library_id ? 'Library' : 'Custom'}
            </Badge>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Switch
            id={switchId}
            checked={a.is_active}
            disabled={toggling}
            onCheckedChange={onToggle}
            aria-label={a.is_active ? 'Open to students. Switch off to hide.' : 'Hidden from students. Switch on to open.'}
          />
          <label htmlFor={switchId} className="text-2xs text-muted-foreground">
            {a.is_active ? 'Open' : 'Hidden'}
          </label>
        </div>
      </div>

      <p className={cn('mt-3 flex items-center gap-1.5 text-xs', overdue ? 'text-warning' : 'text-muted-foreground')}>
        <CalendarClock className="size-3.5 shrink-0" />
        {due ? `${overdue ? 'Was due' : 'Due'} ${formatDateTime(due)}` : 'No due date'}
      </p>
      {a.instructions && <p className="mt-1.5 line-clamp-2 break-words text-xs text-muted-foreground">{a.instructions}</p>}

      <div className="mt-3 space-y-1.5">
        <p className="text-xs">
          <span className="font-semibold tabular-nums">
            {done} / {size}
          </span>{' '}
          <span className="text-muted-foreground">student{size === 1 ? '' : 's'} completed</span>
        </p>
        <ProgressBar
          value={size ? (done / size) * 100 : 0}
          size="sm"
          tone={size > 0 && done >= size ? 'success' : 'primary'}
          label={`${done} of ${size} students completed`}
        />
      </div>

      {/* Keeps the buttons on one line across a row of cards of different heights. */}
      <div className="min-h-4 flex-1" />
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button variant="outline" size="sm" icon={<BarChart3 />} onClick={onResults}>
          Results
        </Button>
        <Button variant="ghost" size="sm" icon={<Pencil />} onClick={onEdit}>
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 />}
          onClick={onDelete}
          className="ml-auto text-danger hover:bg-danger/10 hover:text-danger"
        >
          Delete
        </Button>
      </div>
    </Card>
  )
}

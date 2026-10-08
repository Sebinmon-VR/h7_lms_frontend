import { ChevronDown, Users } from 'lucide-react'
import * as React from 'react'

import type { LabAssignment, LabResults } from '@/api/lab.api'
import { cn } from '@/lib/cn'
import { formatDateTime, formatRelative } from '@/lib/datetime'
import { Badge } from '@/components/ui/badge'
import { ProgressBar } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { useLabResults } from '@/queries/lab.queries'

type Student = LabResults['students'][number]

function scoreTone(best: Student['best']): 'success' | 'warning' | 'danger' | 'neutral' {
  if (!best) return 'neutral'
  if (!best.total) return 'success'
  const pct = best.score / best.total
  return pct >= 0.75 ? 'success' : pct >= 0.5 ? 'warning' : 'danger'
}

export function ResultsSheet({
  assignment,
  onOpenChange,
}: {
  assignment: LabAssignment | null
  onOpenChange: (open: boolean) => void
}) {
  // Keep showing the last one while the sheet slides away.
  const [current, setCurrent] = React.useState(assignment)
  React.useEffect(() => {
    if (assignment) setCurrent(assignment)
  }, [assignment])
  const query = useLabResults(assignment?.id ?? null)

  return (
    <Sheet open={!!assignment} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-lg font-semibold leading-tight tracking-tight">
            <span aria-hidden>{current?.emoji}</span>
            <span className="min-w-0 break-words">{current?.title}</span>
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            {current?.topic}
            {current?.due_at ? ` · due ${formatDateTime(current.due_at)}` : ''}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="px-4 sm:px-6">
          <QueryBoundary
            query={query}
            loading={
              <div className="space-y-3">
                <Skeleton className="h-20 rounded-xl" />
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 rounded-md" />
                ))}
              </div>
            }
          >
            {(data) => <ResultsBody data={data} />}
          </QueryBoundary>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

function ResultsBody({ data }: { data: LabResults }) {
  const [open, setOpen] = React.useState<number | null>(null)
  const students = data.students
  const done = students.filter((s) => s.best)
  const ratios = done.flatMap((s) => (s.best && s.best.total > 0 ? [s.best.score / s.best.total] : []))
  const average = ratios.length ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) : null

  if (students.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title="No students in this class"
        description="Once students are enrolled, their lab runs show up here."
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-3.5">
          <p className="text-xs text-muted-foreground">Completed</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">
            {done.length}
            <span className="text-sm font-normal text-muted-foreground"> / {students.length}</span>
          </p>
          <ProgressBar value={(done.length / students.length) * 100} size="sm" className="mt-2" label="Completed" />
        </div>
        <div className="rounded-xl border border-border bg-card p-3.5">
          <p className="text-xs text-muted-foreground">Average quiz score</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">{average == null ? '—' : `${average}%`}</p>
          <p className="mt-1 text-2xs text-muted-foreground">Best run of each student who finished</p>
        </div>
      </div>

      <Table containerClassName="rounded-lg border border-border">
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead align="center" className="hidden sm:table-cell">
              Attempts
            </TableHead>
            <TableHead align="center">Best</TableHead>
            <TableHead className="hidden sm:table-cell">Last completed</TableHead>
            <TableHead className="w-8">
              <span className="sr-only">Observations</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((s) => {
            const expanded = open === s.student_id
            const canExpand = s.attempts > 0
            return (
              <React.Fragment key={s.student_id}>
                <TableRow
                  interactive={canExpand}
                  onClick={canExpand ? () => setOpen(expanded ? null : s.student_id) : undefined}
                  className={cn(expanded && 'bg-muted/40')}
                >
                  <TableCell className="min-w-0">
                    <span className="block break-words font-medium">{s.full_name || `Student ${s.student_id}`}</span>
                    {/* On a phone the hidden columns fold in under the name. */}
                    <span className="block text-xs text-muted-foreground sm:hidden">
                      {s.attempts > 0
                        ? `${s.attempts} attempt${s.attempts === 1 ? '' : 's'} · ${formatRelative(s.last_completed_at)}`
                        : 'No attempts yet'}
                    </span>
                  </TableCell>
                  <TableCell align="center" className="hidden tabular-nums sm:table-cell">
                    {s.attempts || <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell align="center">
                    {s.best ? (
                      <Badge tone={scoreTone(s.best)} size="sm" className="tabular-nums">
                        {s.best.total ? `${s.best.score}/${s.best.total}` : 'Done'}
                      </Badge>
                    ) : (
                      <span className="whitespace-nowrap text-xs text-muted-foreground">Not started</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                    {s.last_completed_at ? (
                      <span title={formatDateTime(s.last_completed_at)}>{formatRelative(s.last_completed_at)}</span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="w-8 px-2">
                    {canExpand && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpen(expanded ? null : s.student_id)
                        }}
                        aria-expanded={expanded}
                        aria-label={expanded ? 'Hide observations' : 'Show observations'}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell colSpan={5} className="py-3">
                      <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Observations from the latest run
                      </p>
                      {s.observations.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nothing was recorded.</p>
                      ) : (
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                          {s.observations.map((o, i) => (
                            <li key={i} className="break-words">
                              {o}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

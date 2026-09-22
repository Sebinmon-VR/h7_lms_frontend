import {
  AlertTriangle,
  ClipboardCheck,
  ClipboardList,
  Info,
  Mail,
  NotebookPen,
  Send,
} from 'lucide-react'
import * as React from 'react'

import type { CadencePair, ParentReportPeriod } from '@/api/types'
import {
  useCadenceReport,
  useExamCounts,
  useHomeworkCounts,
  useSweepParentReports,
} from '@/queries/academics.queries'
import { formatDate } from '@/lib/datetime'
import { formatPercent } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * Academic oversight.
 *
 * Cadence REPORTS; it never blocks. Nothing stops a teacher taking a class with
 * last week's exam missing, so this is presented as the management list it is —
 * worst first, subjects never examined above merely overdue — rather than as an
 * error state.
 *
 * The counts pair deliberately: `exams_attempted` beside `exams_set`, because 3
 * of 8 and 3 of 3 are the same number and opposite problems. Neither is shown
 * alone.
 */

function CadenceRow({ pair }: { pair: CadencePair }) {
  return (
    <TableRow>
      <TableCell>
        <p className="text-sm font-medium">{pair.class_name ?? `Class ${pair.class_id}`}</p>
        <p className="text-xs text-muted-foreground">
          {pair.subject_name ?? `Subject ${pair.subject_id}`}
          {pair.teacher_name ? ` · ${pair.teacher_name}` : ' · no teacher mapped'}
        </p>
      </TableCell>

      <TableCell>
        {pair.exam_never_set ? (
          <Badge tone="danger" size="sm">
            Never examined
          </Badge>
        ) : (
          <div>
            <Badge tone={pair.exam_overdue ? 'warning' : 'success'} size="sm">
              {pair.exam_overdue ? `${pair.days_since_exam} days ago` : 'On track'}
            </Badge>
            {pair.last_exam_title && (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {pair.last_exam_title}
              </p>
            )}
          </div>
        )}
      </TableCell>

      <TableCell>
        {pair.homework_never_set ? (
          <Badge tone="danger" size="sm">
            Never set
          </Badge>
        ) : (
          <Badge tone={pair.homework_overdue ? 'warning' : 'success'} size="sm">
            {pair.homework_overdue ? `${pair.days_since_homework} days ago` : 'On track'}
          </Badge>
        )}
      </TableCell>
    </TableRow>
  )
}

function CadenceTab() {
  const [overdueOnly, setOverdueOnly] = React.useState(true)
  const report = useCadenceReport({ overdueOnly })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 rounded-lg border border-info/30 bg-info/8 px-3 py-2">
          <Info className="mt-0.5 size-4 shrink-0 text-info" />
          <p className="max-w-2xl text-xs text-muted-foreground">
            This reports; it never blocks. The seven days are a rolling gap between
            consecutive exams rather than a calendar week — a calendar week lets a teacher set
            exams on a Friday and the next Monday and miss eleven days in between while
            appearing compliant in both.
          </p>
        </div>

        <label className="flex shrink-0 items-center gap-2 text-sm">
          <Switch checked={overdueOnly} onCheckedChange={setOverdueOnly} />
          Behind only
        </label>
      </div>

      <QueryBoundary
        query={report}
        loading={<Skeleton className="h-96 w-full rounded-xl" />}
        isEmpty={(data) => data.pairs.length === 0}
        empty={
          <EmptyState
            icon={<ClipboardCheck />}
            title={overdueOnly ? 'Everything is on track' : 'No class and subject pairs'}
            description={
              overdueOnly
                ? 'Every class and subject has had an exam and homework inside the expected window.'
                : 'Pairs are built from the teacher mappings — map a teacher to a class and subject first.'
            }
          />
        }
      >
        {(data) => (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Pairs</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{data.total_pairs}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Never examined</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-danger">
                  {data.never_examined_count}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Exam overdue</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-warning">
                  {data.exam_overdue_count}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Homework overdue</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-warning">
                  {data.homework_overdue_count}
                </p>
              </Card>
            </div>

            <Card className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class and subject</TableHead>
                    <TableHead>Last exam</TableHead>
                    <TableHead>Last homework</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Already sorted worst-first by the server — subjects never
                      examined above merely overdue. Re-sorting here would lose
                      that ordering. */}
                  {data.pairs.map((pair) => (
                    <CadenceRow key={`${pair.class_id}-${pair.subject_id}`} pair={pair} />
                  ))}
                </TableBody>
              </Table>
            </Card>

            <p className="mt-2 text-xs text-muted-foreground">
              As of {formatDate(data.as_of)} · expecting an exam every{' '}
              {data.exam_interval_days} days and homework every {data.homework_interval_days}.
            </p>
          </>
        )}
      </QueryBoundary>
    </div>
  )
}

function ExamCountsTab() {
  const report = useExamCounts()

  return (
    <QueryBoundary
      query={report}
      loading={<Skeleton className="h-96 w-full rounded-xl" />}
      isEmpty={(data) => data.students.length === 0}
      empty={
        <EmptyState
          icon={<ClipboardCheck />}
          title="No exam data in this window"
          description="Defaults to the last four weeks. Nothing was set or sat in it."
        />
      }
    >
      {(data) => (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {formatDate(data.from_date)} — {formatDate(data.to_date)} ·{' '}
            <strong className="text-foreground">{data.students_with_missed}</strong> of{' '}
            {data.total_students} students missed at least one.
          </p>

          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  {/* The pair, never one alone. */}
                  <TableHead className="text-right">Sat</TableHead>
                  <TableHead className="text-right">Set</TableHead>
                  <TableHead className="text-right">Missed</TableHead>
                  <TableHead className="text-right">Attendance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.students.map((row) => (
                  <TableRow key={row.student_id}>
                    <TableCell>
                      <p className="text-sm font-medium">{row.student_name}</p>
                      {row.admission_number && (
                        <p className="text-xs text-muted-foreground">{row.admission_number}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.class_name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.exams_attempted}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.exams_set}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.exams_missed > 0 ? (
                        <span className="font-medium text-danger">{row.exams_missed}</span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.attendance_percent != null
                        ? formatPercent(row.attendance_percent, 0)
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </QueryBoundary>
  )
}

function HomeworkCountsTab() {
  const report = useHomeworkCounts()

  return (
    <QueryBoundary
      query={report}
      loading={<Skeleton className="h-96 w-full rounded-xl" />}
      isEmpty={(data) => data.students.length === 0}
      empty={
        <EmptyState
          icon={<NotebookPen />}
          title="No homework data in this window"
          description="Defaults to the last week. Nothing was set or handed in during it."
        />
      }
    >
      {(data) => (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {formatDate(data.from_date)} — {formatDate(data.to_date)} ·{' '}
            <strong className="text-foreground">{data.students_with_missed}</strong> of{' '}
            {data.total_students} students missed at least one.
          </p>

          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Set</TableHead>
                  <TableHead className="text-right">In</TableHead>
                  <TableHead className="text-right">Late</TableHead>
                  <TableHead className="text-right">Missed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.students.map((row) => (
                  <TableRow key={row.student_id}>
                    <TableCell className="text-sm font-medium">{row.student_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.class_name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.homework_set}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.submitted}</TableCell>
                    <TableCell className="text-right tabular-nums text-warning">
                      {row.late || '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.missed > 0 ? (
                        <span className="font-medium text-danger">{row.missed}</span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </QueryBoundary>
  )
}

function ParentDigestTab() {
  const sweep = useSweepParentReports()
  const [period, setPeriod] = React.useState<ParentReportPeriod>('WEEKLY')

  return (
    <div className="max-w-2xl space-y-4">
      {/* Off by default, and the endpoints working on demand hides that. Said
          plainly so nobody assumes a silent sweep is already running. */}
      <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/8 p-4">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Automatic digests are off by default.</strong>{' '}
          You can send one now from here, but nothing goes out on a schedule until
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">ENABLE_PARENT_REPORTS</code>
          is switched on for the deployment.
        </p>
      </div>

      <Card className="space-y-4 p-5">
        <div>
          <h3 className="text-sm font-semibold">Send the digest now</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Covers the last <strong>complete</strong> week or month, not the current partial
            one — a Monday digest covering the week that started that morning would report
            nothing.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-40">
            <Select value={period} onValueChange={(v) => setPeriod(v as ParentReportPeriod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WEEKLY">Last week</SelectItem>
                <SelectItem value="MONTHLY">Last month</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button loading={sweep.isPending} onClick={() => sweep.mutate({ period })}>
            <Send />
            Send to every active student's parents
          </Button>
        </div>

        <p className="flex items-start gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <Mail className="mt-0.5 size-3.5 shrink-0" />
          Safe to run twice: sending is idempotent per recipient per period, so a repeat
          reports "already sent" rather than mailing anybody again. Each parent's copy is
          built for their own permissions — the fee section appears only where the link
          grants it.
        </p>
      </Card>
    </div>
  )
}

export default function AdminOversightPage() {
  return (
    <div>
      <PageHeader
        title="Oversight"
        description="Whether the exam and homework cadence is being kept, who is falling behind, and the digest parents receive."
      />

      <Tabs defaultValue="cadence">
        <TabsList>
          <TabsTrigger value="cadence">
            <ClipboardList className="size-4" />
            Cadence
          </TabsTrigger>
          <TabsTrigger value="exams">
            <ClipboardCheck className="size-4" />
            Exam counts
          </TabsTrigger>
          <TabsTrigger value="homework">
            <NotebookPen className="size-4" />
            Homework counts
          </TabsTrigger>
          <TabsTrigger value="digests">
            <Mail className="size-4" />
            Parent digests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cadence">
          <CadenceTab />
        </TabsContent>
        <TabsContent value="exams">
          <ExamCountsTab />
        </TabsContent>
        <TabsContent value="homework">
          <HomeworkCountsTab />
        </TabsContent>
        <TabsContent value="digests">
          <ParentDigestTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

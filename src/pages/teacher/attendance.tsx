import {
  CalendarCheck,
  CheckCircle2,
  CircleSlash,
  Clock,
  Info,
  Keyboard,
  MessageSquarePlus,
  RotateCcw,
  Save,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import type { AttendanceStatus, StudentAttendanceItem, UserOut } from '@/api/types'
import {
  useClassStudents,
  useDeleteAttendance,
  useMarkAttendance,
  useMyClasses,
  useTeacherAttendance,
} from '@/queries/teacher.queries'
import { cn } from '@/lib/cn'
import { ATTENDANCE_HOTKEY, ATTENDANCE_LABEL, ATTENDANCE_STATUSES } from '@/lib/constants'
import { formatDayLabel, todayApiDate } from '@/lib/datetime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DatePicker } from '@/components/ui/date-picker'
import { Textarea } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar } from '@/components/ui/avatar'
import { BatchProgress, useBatchRunner } from '@/components/feedback/batch-progress'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { ClassSubjectPicker, useClassSubjectSelection } from './class-subject-picker'
import { AdminTeacherNotice, useIsAdminViewingTeacher } from './teacher-guard'

const STATUS_BUTTON: Record<
  AttendanceStatus,
  { icon: typeof CheckCircle2; active: string; idle: string; key: string }
> = {
  PRESENT: {
    icon: CheckCircle2,
    active: 'bg-success text-success-foreground border-success',
    idle: 'hover:border-success/60 hover:text-success',
    key: 'P',
  },
  ABSENT: {
    icon: XCircle,
    active: 'bg-danger text-danger-foreground border-danger',
    idle: 'hover:border-danger/60 hover:text-danger',
    key: 'A',
  },
  LATE: {
    icon: Clock,
    active: 'bg-warning text-warning-foreground border-warning',
    idle: 'hover:border-warning/60 hover:text-warning',
    key: 'L',
  },
  EXCUSED: {
    icon: CircleSlash,
    active: 'bg-info text-info-foreground border-info',
    idle: 'hover:border-info/60 hover:text-info',
    key: 'E',
  },
}

interface RowState {
  status: AttendanceStatus
  remarks: string
}

/** Chunk size for the sequential save. The backend writes one doc per student. */
const CHUNK_SIZE = 10

export default function TeacherAttendancePage() {
  const isAdmin = useIsAdminViewingTeacher()
  const mappingsQuery = useMyClasses(!isAdmin)
  const attendanceQuery = useTeacherAttendance(!isAdmin)
  const markAttendance = useMarkAttendance()
  const deleteAttendance = useDeleteAttendance()
  const batch = useBatchRunner<{ class_id: number; subject_id: number; date: string; attendance_list: StudentAttendanceItem[] }>()

  const selection = useClassSubjectSelection(mappingsQuery.data)
  const [date, setDate] = React.useState<string>(todayApiDate())
  const [rows, setRows] = React.useState<Map<number, RowState>>(new Map())
  const [keyboardMode, setKeyboardMode] = React.useState(false)
  const [cursor, setCursor] = React.useState(0)
  const [dirty, setDirty] = React.useState(false)
  const [clearingDay, setClearingDay] = React.useState(false)
  const [clearingBusy, setClearingBusy] = React.useState(false)

  const rosterQuery = useClassStudents(selection.classId)
  const roster = React.useMemo(() => rosterQuery.data ?? [], [rosterQuery.data])

  /** Records already saved for this exact class + subject + date. */
  const existing = React.useMemo(() => {
    if (!selection.isComplete) return []
    return (attendanceQuery.data ?? []).filter(
      (r) => r.class_id === selection.classId && r.subject_id === selection.subjectId && r.date === date,
    )
  }, [attendanceQuery.data, selection.classId, selection.subjectId, selection.isComplete, date])

  const isEditing = existing.length > 0

  // Prefill from saved records. POST is an upsert on
  // (student, class, subject, date), so re-saving genuinely edits.
  React.useEffect(() => {
    if (roster.length === 0) {
      setRows(new Map())
      return
    }
    const byStudent = new Map(existing.map((r) => [r.student_id, r]))
    const next = new Map<number, RowState>()
    for (const student of roster) {
      const saved = byStudent.get(student.id)
      next.set(student.id, {
        status: saved?.status ?? 'PRESENT',
        remarks: saved?.remarks ?? '',
      })
    }
    setRows(next)
    setDirty(false)
    setCursor(0)
  }, [roster, existing])

  const setStatus = React.useCallback((studentId: number, status: AttendanceStatus) => {
    setRows((prev) => {
      const next = new Map(prev)
      const current = next.get(studentId)
      next.set(studentId, { status, remarks: current?.remarks ?? '' })
      return next
    })
    setDirty(true)
  }, [])

  const setRemarks = React.useCallback((studentId: number, remarks: string) => {
    setRows((prev) => {
      const next = new Map(prev)
      const current = next.get(studentId)
      next.set(studentId, { status: current?.status ?? 'PRESENT', remarks })
      return next
    })
    setDirty(true)
  }, [])

  const markAll = (status: AttendanceStatus) => {
    setRows((prev) => {
      const next = new Map<number, RowState>()
      for (const student of roster) {
        next.set(student.id, { status, remarks: prev.get(student.id)?.remarks ?? '' })
      }
      return next
    })
    setDirty(true)
  }

  // ---------------------------------------------------------- keyboard mode
  React.useEffect(() => {
    if (!keyboardMode || roster.length === 0) return

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        setCursor((c) => Math.min(roster.length - 1, c + 1))
        return
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        setCursor((c) => Math.max(0, c - 1))
        return
      }
      const status = ATTENDANCE_HOTKEY[e.key.toLowerCase()]
      if (status) {
        e.preventDefault()
        const student = roster[cursor]
        if (student) {
          setStatus(student.id, status)
          setCursor((c) => Math.min(roster.length - 1, c + 1))
        }
      }
      if (e.key === 'Escape') setKeyboardMode(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [keyboardMode, roster, cursor, setStatus])

  // Warn before leaving with unsaved marks.
  React.useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const counts = React.useMemo(() => {
    const result: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
    for (const row of rows.values()) result[row.status] += 1
    return result
  }, [rows])

  /**
   * Removes every saved record for the current class, subject and date.
   *
   * There is no batch-delete endpoint, so this fans out one request per
   * record. Failures are counted rather than thrown: a partial delete still
   * changed real state, and silently reporting success would be a lie.
   */
  const clearDay = async () => {
    if (existing.length === 0) return
    setClearingBusy(true)

    const results = await Promise.allSettled(
      existing.map((record) => deleteAttendance.mutateAsync(record.id)),
    )
    const failed = results.filter((r) => r.status === 'rejected').length

    setClearingBusy(false)
    setClearingDay(false)

    if (failed > 0) {
      toast.error(`${failed} of ${existing.length} records could not be deleted.`, {
        description: 'The rest were removed. Reload to see the current state.',
      })
    } else {
      toast.success(`Attendance for ${formatDayLabel(date)} deleted`)
    }
  }

  const save = async () => {
    if (!selection.isComplete || roster.length === 0) return

    const items: StudentAttendanceItem[] = roster.map((student) => {
      const row = rows.get(student.id)
      return {
        student_id: student.id,
        status: row?.status ?? 'PRESENT',
        remarks: row?.remarks?.trim() ? row.remarks.trim() : null,
      }
    })

    // The backend writes and hydrates each student sequentially, so a large
    // class in one request is a timeout risk. Chunking is safe here precisely
    // because the endpoint upserts.
    const chunks: StudentAttendanceItem[][] = []
    for (let i = 0; i < items.length; i += CHUNK_SIZE) chunks.push(items.slice(i, i + CHUNK_SIZE))

    const entries = chunks.map((chunk, i) => ({
      key: `chunk-${i}`,
      label: `Students ${i * CHUNK_SIZE + 1}–${i * CHUNK_SIZE + chunk.length}`,
      payload: {
        class_id: selection.classId as number,
        subject_id: selection.subjectId as number,
        date,
        attendance_list: chunk,
      },
    }))

    const { failed } = await batch.run(entries, (payload) => markAttendance.mutateAsync(payload))

    if (failed === 0) {
      toast.success(
        isEditing
          ? `Attendance updated for ${formatDayLabel(date)}`
          : `Attendance saved for ${roster.length} students`,
      )
      setDirty(false)
      batch.reset()
    } else {
      toast.error(`${failed} of ${entries.length} batches failed. Saving again is safe — it overwrites.`)
    }
  }

  if (isAdmin) {
    return (
      <>
        <PageHeader title="Attendance" description="Take or edit attendance for a class." />
        <AdminTeacherNotice />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Mark a whole class in one pass. Saving the same date again updates the existing records."
        actions={
          <Button
            variant={keyboardMode ? 'solid' : 'outline'}
            icon={<Keyboard />}
            onClick={() => setKeyboardMode((k) => !k)}
            disabled={roster.length === 0}
          >
            {keyboardMode ? 'Keyboard mode on' : 'Keyboard mode'}
          </Button>
        }
      />

      {/* ------------------------------------------------------- selection */}
      <Card className="mb-5">
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
          <ClassSubjectPicker selection={selection} className="contents" />
          <div className="space-y-1.5">
            <label htmlFor="attendance-date" className="text-sm font-medium">
              Date
            </label>
            <DatePicker id="attendance-date" value={date} onChange={(v) => setDate(v ?? todayApiDate())} maxToday />
          </div>
        </CardContent>
      </Card>

      {mappingsQuery.isError ? (
        <ErrorState error={mappingsQuery.error} onRetry={() => mappingsQuery.refetch()} />
      ) : mappingsQuery.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (mappingsQuery.data ?? []).length === 0 ? (
        <EmptyState
          icon={<CalendarCheck />}
          title="You have no assigned classes"
          description="An administrator needs to assign you to a subject and class before you can take attendance."
        />
      ) : !selection.isComplete ? (
        <EmptyState
          icon={<CalendarCheck />}
          title="Choose a class and subject"
          description="Pick which class and subject you are marking, and the roster will load."
        />
      ) : rosterQuery.isError ? (
        <ErrorState error={rosterQuery.error} onRetry={() => rosterQuery.refetch()} />
      ) : rosterQuery.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : roster.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No students in this class"
          description="An administrator needs to enroll students before attendance can be recorded."
        />
      ) : (
        <>
          {isEditing && (
            <div className="mb-4 flex flex-wrap items-start gap-2.5 rounded-xl border border-info/30 bg-info/8 px-4 py-3 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-info" />
              <span className="flex-1">
                Attendance was already recorded for <strong>{formatDayLabel(date)}</strong>. The marks below
                are the saved ones — saving will update them.
              </span>
              {/* Saving can only overwrite. Removing a day recorded against the
                  wrong date needs the delete endpoint. */}
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 />}
                className="shrink-0 text-danger hover:bg-danger/10"
                onClick={() => setClearingDay(true)}
              >
                Delete this day
              </Button>
            </div>
          )}

          {keyboardMode && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/8 px-4 py-3 text-xs">
              <span className="font-medium">Keyboard mode</span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> move
              </span>
              {ATTENDANCE_STATUSES.map((status) => (
                <span key={status} className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Kbd>{STATUS_BUTTON[status].key}</Kbd> {ATTENDANCE_LABEL[status]}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Kbd>Esc</Kbd> exit
              </span>
            </div>
          )}

          {/* ------------------------------------------------ summary bar */}
          <Card className="sticky top-0 z-20 mb-4">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">
                  <Users />
                  {roster.length} students
                </Badge>
                {ATTENDANCE_STATUSES.map((status) => {
                  const tone =
                    status === 'PRESENT' ? 'success' : status === 'ABSENT' ? 'danger' : status === 'LATE' ? 'warning' : 'info'
                  return (
                    <Badge key={status} tone={tone as 'success'}>
                      {ATTENDANCE_LABEL[status]}: {counts[status]}
                    </Badge>
                  )
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => markAll('PRESENT')}>
                  All present
                </Button>
                <Button variant="ghost" size="sm" icon={<RotateCcw />} onClick={() => markAll('ABSENT')}>
                  All absent
                </Button>
                <Button
                  variant="primary"
                  icon={<Save />}
                  loading={batch.running}
                  disabled={!dirty && isEditing}
                  onClick={save}
                >
                  {isEditing ? 'Update attendance' : 'Save attendance'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {batch.items.length > 0 && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-sm">Saving</CardTitle>
              </CardHeader>
              <CardContent>
                <BatchProgress items={batch.items} percent={batch.percent} done={batch.done} total={batch.total} />
              </CardContent>
            </Card>
          )}

          {/* ---------------------------------------------------- roster */}
          <div className="space-y-2">
            {roster.map((student, index) => (
              <AttendanceRow
                key={student.id}
                student={student}
                row={rows.get(student.id)}
                focused={keyboardMode && index === cursor}
                onStatus={(status) => setStatus(student.id, status)}
                onRemarks={(remarks) => setRemarks(student.id, remarks)}
                onFocus={() => keyboardMode && setCursor(index)}
              />
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={clearingDay}
        onOpenChange={(v) => !v && !clearingBusy && setClearingDay(false)}
        title={`Delete attendance for ${formatDayLabel(date)}?`}
        description={`All ${existing.length} saved ${existing.length === 1 ? 'record' : 'records'} for this class and subject on that date will be removed. Use this when a day was recorded against the wrong date — to change the marks instead, edit them above and save.`}
        confirmLabel="Delete records"
        destructive
        loading={clearingBusy}
        onConfirm={clearDay}
      />
    </>
  )
}

function AttendanceRow({
  student,
  row,
  focused,
  onStatus,
  onRemarks,
  onFocus,
}: {
  student: UserOut
  row: RowState | undefined
  focused: boolean
  onStatus: (status: AttendanceStatus) => void
  onRemarks: (remarks: string) => void
  onFocus: () => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focused])

  const status = row?.status ?? 'PRESENT'
  const hasRemarks = !!row?.remarks?.trim()

  return (
    <div
      ref={ref}
      onMouseDown={onFocus}
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-card p-3 transition-colors sm:flex-row sm:items-center sm:justify-between',
        focused ? 'border-primary ring-2 ring-primary/25' : 'border-border',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={student.full_name} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{student.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">{student.email}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {ATTENDANCE_STATUSES.map((option) => {
          const config = STATUS_BUTTON[option]
          const Icon = config.icon
          const active = status === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => onStatus(option)}
              aria-pressed={active}
              aria-label={`${ATTENDANCE_LABEL[option]} — ${student.full_name}`}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all',
                active ? config.active : cn('border-border text-muted-foreground', config.idle),
              )}
            >
              <Icon className="size-3.5" />
              <span className="hidden sm:inline">{ATTENDANCE_LABEL[option]}</span>
            </button>
          )
        })}

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={hasRemarks ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label={`Remarks for ${student.full_name}`}
            >
              <MessageSquarePlus />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <label htmlFor={`remarks-${student.id}`} className="text-xs font-medium">
              Remarks for {student.full_name}
            </label>
            <Textarea
              id={`remarks-${student.id}`}
              rows={3}
              className="mt-2"
              placeholder="Optional note"
              value={row?.remarks ?? ''}
              onChange={(e) => onRemarks(e.target.value)}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

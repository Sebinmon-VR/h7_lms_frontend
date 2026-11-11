import { Check, Keyboard, MessageSquarePlus, Save, Trash2, UserRoundCog } from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import type { AttendanceOut, AttendanceStatus, StudentAttendanceItem, TeacherMappingOut, UserOut } from '@/api/types'
import {
  useClassStudents,
  useDeleteAttendance,
  useMarkAttendance,
  useMyClasses,
  useTeacherAttendance,
} from '@/queries/teacher.queries'
import { cn } from '@/lib/cn'
import { useAuth } from '@/providers/auth-provider'
import { ATTENDANCE_HOTKEY, ATTENDANCE_LABEL, ATTENDANCE_STATUSES } from '@/lib/constants'
import { formatDate, formatDayLabel, parseApiDate, shiftApiDate, todayApiDate } from '@/lib/datetime'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Skeleton } from '@/components/ui/skeleton'
import { BatchProgress, useBatchRunner } from '@/components/feedback/batch-progress'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Band, WorkspaceHeader } from '@/components/layout/workspace'
import { DetailHeader, ListEmpty, ListItem, ListPane, SplitView } from '@/components/layout/split-view'
import { AdminTeacherNotice, useIsAdminViewingTeacher } from './teacher-guard'

/*
 * List + detail: the day's registers on the left, each Taken or Not taken, and
 * the picked register on the right, a row per student in roll order with the
 * four marks one tap away. Saving the same class, subject and date again
 * updates the records, since the server upserts.
 */

/** The marks: letter, colours when chosen, and a tint for the row. */
const MARK: Record<AttendanceStatus, { letter: string; on: string; idle: string; row: string; text: string }> = {
  PRESENT: { letter: 'P', on: 'bg-success text-success-foreground border-success', idle: 'hover:border-success/60 hover:text-success', row: '', text: 'text-success' },
  ABSENT: { letter: 'A', on: 'bg-danger text-danger-foreground border-danger', idle: 'hover:border-danger/60 hover:text-danger', row: 'bg-danger/[0.05]', text: 'text-danger' },
  LATE: { letter: 'L', on: 'bg-warning text-warning-foreground border-warning', idle: 'hover:border-warning/60 hover:text-warning', row: 'bg-warning/[0.06]', text: 'text-warning' },
  EXCUSED: { letter: 'E', on: 'bg-info text-info-foreground border-info', idle: 'hover:border-info/60 hover:text-info', row: 'bg-info/[0.05]', text: 'text-info' },
}

interface RowState {
  status: AttendanceStatus
  remarks: string
}

/** Chunk size for the sequential save. The backend writes one doc per student. */
const CHUNK_SIZE = 10

const regKey = (classId: number, subjectId: number) => `${classId}|${subjectId}`

/** Roll numbers sort as numbers where they are numbers ("2" before "10"). */
function byRoll(a: UserOut, b: UserOut): number {
  const ra = a.roll_number ?? ''
  const rb = b.roll_number ?? ''
  if (ra && rb && ra !== rb) return ra.localeCompare(rb, undefined, { numeric: true })
  if (ra && !rb) return -1
  if (!ra && rb) return 1
  return a.full_name.localeCompare(b.full_name)
}

/** One register's state on the date, from the saved records. */
function registerSummary(records: AttendanceOut[]) {
  return {
    taken: records.length > 0,
    absent: records.filter((r) => r.status === 'ABSENT').length,
    late: records.filter((r) => r.status === 'LATE').length,
  }
}

export default function TeacherAttendancePage() {
  const isAdmin = useIsAdminViewingTeacher()
  const myId = useAuth().user?.id
  const [params, setParams] = useSearchParams()
  const mappingsQuery = useMyClasses(!isAdmin)
  const attendanceQuery = useTeacherAttendance(!isAdmin)

  const today = todayApiDate()
  const dateParam = params.get('date')
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam <= today ? dateParam : today

  const mappings = React.useMemo(
    () =>
      [...(mappingsQuery.data ?? [])].sort(
        (a, b) =>
          a.class_room.name.localeCompare(b.class_room.name, undefined, { numeric: true }) ||
          a.subject.name.localeCompare(b.subject.name),
      ),
    [mappingsQuery.data],
  )

  /** Saved records on the date, by register. */
  const onDate = React.useMemo(() => {
    const map = new Map<string, AttendanceOut[]>()
    for (const r of attendanceQuery.data ?? []) {
      if (r.date !== date) continue
      const k = regKey(r.class_id, r.subject_id)
      map.set(k, [...(map.get(k) ?? []), r])
    }
    return map
  }, [attendanceQuery.data, date])

  // The picked register: from the address, else the first one still to take, else the first.
  const picked = mappings.find((m) => String(m.id) === params.get('reg'))
  const active: TeacherMappingOut | null =
    picked ??
    mappings.find((m) => !onDate.has(regKey(m.class_room.id, m.subject.id))) ??
    mappings[0] ??
    null

  // Unsaved marks in the register on the right; switching away asks first.
  const dirtyRef = React.useRef(false)
  const setParam = (changes: Record<string, string | null>) => {
    if (dirtyRef.current && !window.confirm('You have unsaved marks in this register. Leave without saving?')) return
    dirtyRef.current = false
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(changes)) {
          if (v == null) p.delete(k)
          else p.set(k, v)
        }
        return p
      },
      { replace: true },
    )
  }

  if (isAdmin) {
    return (
      <>
        <WorkspaceHeader title="Attendance" description="Take or edit attendance for a class." />
        <div className="pt-6">
          <AdminTeacherNotice />
        </div>
      </>
    )
  }

  const takenCount = mappings.filter((m) => onDate.has(regKey(m.class_room.id, m.subject.id))).length

  return (
    <>
      <WorkspaceHeader
        title="Attendance"
        description="Pick a register, mark each student, save. Saving the same day again updates it."
      />

      <Band className="border-b border-border px-0 sm:px-0 lg:px-0">
        <div className="lg:h-[calc(100vh-11rem)] lg:min-h-[30rem]">
          <SplitView
            list={
              <ListPane
                toolbar={
                  <div className="space-y-2">
                    <DatePicker
                      value={date}
                      onChange={(v) => setParam({ date: v && v !== today ? v : null })}
                      maxToday
                    />
                    <div className="flex items-center justify-between text-xs">
                      <button
                        type="button"
                        className="font-medium text-primary hover:underline"
                        onClick={() => setParam({ date: shiftApiDate(date, -1) })}
                      >
                        ‹ Previous day
                      </button>
                      {date !== today ? (
                        <button type="button" className="font-medium text-primary hover:underline" onClick={() => setParam({ date: null })}>
                          Back to today
                        </button>
                      ) : (
                        <span className="text-muted-foreground">Today</span>
                      )}
                    </div>
                  </div>
                }
                footer={
                  mappings.length
                    ? `${takenCount} of ${mappings.length} registers taken on ${formatDate(parseApiDate(date), 'd MMM')}`
                    : undefined
                }
              >
                {mappingsQuery.isPending || attendanceQuery.isPending ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 rounded" />
                    ))}
                  </div>
                ) : mappingsQuery.isError ? (
                  <ListEmpty>Your classes could not be loaded. Reload the page to try again.</ListEmpty>
                ) : mappings.length === 0 ? (
                  <ListEmpty>No classes are assigned to you yet. The office maps a teacher to a class and subject first.</ListEmpty>
                ) : (
                  mappings.map((m) => {
                    const s = registerSummary(onDate.get(regKey(m.class_room.id, m.subject.id)) ?? [])
                    return (
                      <ListItem
                        key={m.id}
                        active={active?.id === m.id}
                        onClick={() => setParam({ reg: String(m.id) })}
                        title={
                          <>
                            {m.class_room.name}
                            <span className="font-normal text-muted-foreground"> · {m.subject.name}</span>
                          </>
                        }
                        sub={
                          s.taken ? (
                            <span className="text-success">
                              Taken
                              {s.absent > 0 && <span className="text-danger"> · {s.absent} absent</span>}
                              {s.late > 0 && <span className="text-warning"> · {s.late} late</span>}
                            </span>
                          ) : (
                            <span className="text-warning">Not taken</span>
                          )
                        }
                        right={
                          s.taken ? (
                            <Check className="size-4 text-success" />
                          ) : (
                            <span className="block size-2 rounded-full bg-warning" aria-label="Not taken" />
                          )
                        }
                      />
                    )
                  })
                )}
              </ListPane>
            }
            detail={
              active ? (
                <Register
                  key={`${active.id}-${date}`}
                  mapping={active}
                  date={date}
                  saved={onDate.get(regKey(active.class_room.id, active.subject.id)) ?? []}
                  myId={myId}
                  onDirty={(d) => {
                    dirtyRef.current = d
                  }}
                />
              ) : mappingsQuery.isPending ? (
                <div className="space-y-3 p-5">
                  <Skeleton className="h-10 w-64 rounded" />
                  <Skeleton className="h-64 rounded" />
                </div>
              ) : (
                <ListEmpty>Nothing to mark.</ListEmpty>
              )
            }
          />
        </div>
      </Band>
    </>
  )
}

/** The register for one class, subject and date. */
function Register({
  mapping,
  date,
  saved,
  myId,
  onDirty,
}: {
  mapping: TeacherMappingOut
  date: string
  saved: AttendanceOut[]
  myId: number | undefined
  onDirty: (dirty: boolean) => void
}) {
  const classId = mapping.class_room.id
  const subjectId = mapping.subject.id
  const markAttendance = useMarkAttendance()
  const deleteAttendance = useDeleteAttendance()
  const batch = useBatchRunner<{ class_id: number; subject_id: number; date: string; attendance_list: StudentAttendanceItem[] }>()

  const rosterQuery = useClassStudents(classId)
  const roster = React.useMemo(() => [...(rosterQuery.data ?? [])].sort(byRoll), [rosterQuery.data])

  const [rows, setRows] = React.useState<Map<number, RowState>>(new Map())
  const [dirty, setDirtyState] = React.useState(false)
  const [keyboardMode, setKeyboardMode] = React.useState(false)
  const [cursor, setCursor] = React.useState(0)
  const [clearing, setClearing] = React.useState(false)
  const [clearingBusy, setClearingBusy] = React.useState(false)
  const setDirty = React.useCallback(
    (d: boolean) => {
      setDirtyState(d)
      onDirty(d)
    },
    [onDirty],
  )

  const isEditing = saved.length > 0
  // Somebody else's register: only reachable as this class's class teacher.
  const markedByOthers = myId != null && saved.some((r) => r.teacher_id !== myId)

  // Prefill from saved records; everyone present on a new register.
  React.useEffect(() => {
    const byStudent = new Map(saved.map((r) => [r.student_id, r]))
    const next = new Map<number, RowState>()
    for (const student of roster) {
      const s = byStudent.get(student.id)
      next.set(student.id, { status: s?.status ?? 'PRESENT', remarks: s?.remarks ?? '' })
    }
    setRows(next)
    setDirty(false)
    setCursor(0)
  }, [roster, saved, setDirty])

  const setStatus = React.useCallback(
    (studentId: number, status: AttendanceStatus) => {
      setRows((prev) => new Map(prev).set(studentId, { status, remarks: prev.get(studentId)?.remarks ?? '' }))
      setDirty(true)
    },
    [setDirty],
  )
  const setRemarks = (studentId: number, remarks: string) => {
    setRows((prev) => new Map(prev).set(studentId, { status: prev.get(studentId)?.status ?? 'PRESENT', remarks }))
    setDirty(true)
  }
  const markAll = (status: AttendanceStatus) => {
    setRows((prev) => {
      const next = new Map<number, RowState>()
      for (const s of roster) next.set(s.id, { status, remarks: prev.get(s.id)?.remarks ?? '' })
      return next
    })
    setDirty(true)
  }

  // Keyboard mode: arrows move, P/A/L/E mark and move on, Esc leaves.
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

  // Warn before leaving the page with unsaved marks.
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

  const save = async () => {
    if (roster.length === 0) return
    const items: StudentAttendanceItem[] = roster.map((student) => {
      const row = rows.get(student.id)
      return {
        student_id: student.id,
        status: row?.status ?? 'PRESENT',
        remarks: row?.remarks?.trim() ? row.remarks.trim() : null,
      }
    })
    // The backend writes each student in turn, so a big class in one request
    // risks a timeout. Chunks are safe because the endpoint upserts.
    const chunks: StudentAttendanceItem[][] = []
    for (let i = 0; i < items.length; i += CHUNK_SIZE) chunks.push(items.slice(i, i + CHUNK_SIZE))
    const entries = chunks.map((chunk, i) => ({
      key: `chunk-${i}`,
      label: `Students ${i * CHUNK_SIZE + 1}–${i * CHUNK_SIZE + chunk.length}`,
      payload: { class_id: classId, subject_id: subjectId, date, attendance_list: chunk },
    }))
    const { failed } = await batch.run(entries, (payload) => markAttendance.mutateAsync(payload))
    if (failed === 0) {
      toast.success(isEditing ? `Register updated for ${formatDayLabel(date)}` : `Register saved: ${counts.PRESENT} present, ${counts.ABSENT} absent`)
      setDirty(false)
      batch.reset()
    } else {
      toast.error(`${failed} of ${entries.length} batches failed. Saving again is safe — it overwrites.`)
    }
  }

  /**
   * Removes every saved record for this register and date: one request per
   * record, since there is no batch delete. Failures are counted, not hidden.
   */
  const clearDay = async () => {
    setClearingBusy(true)
    const results = await Promise.allSettled(saved.map((record) => deleteAttendance.mutateAsync(record.id)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setClearingBusy(false)
    setClearing(false)
    if (failed > 0) {
      toast.error(`${failed} of ${saved.length} records could not be deleted.`, {
        description: 'The rest were removed. Reload to see the current state.',
      })
    } else {
      toast.success(`Register for ${formatDayLabel(date)} deleted`)
    }
  }

  const day = parseApiDate(date)

  return (
    <div>
      <DetailHeader
        title={
          <>
            {mapping.class_room.name}
            <span className="font-normal text-muted-foreground"> · {mapping.subject.name}</span>
          </>
        }
        badges={
          isEditing ? (
            <span className="text-xs font-semibold text-success">Taken</span>
          ) : (
            <span className="text-xs font-semibold text-warning">Not taken yet</span>
          )
        }
        sub={`${day ? formatDate(day, 'EEEE, d MMMM yyyy') : date} · ${roster.length} students`}
        actions={
          <Button
            variant={keyboardMode ? 'solid' : 'outline'}
            size="sm"
            onClick={() => setKeyboardMode((k) => !k)}
            disabled={roster.length === 0}
          >
            <Keyboard />
            {keyboardMode ? 'Keyboard on' : 'Keyboard'}
          </Button>
        }
      />

      {(markedByOthers || isEditing) && (
        <div className="space-y-1 border-b border-border px-5 py-2.5 text-xs">
          {markedByOthers && (
            <p className="flex items-center gap-1.5 text-warning">
              <UserRoundCog className="size-3.5 shrink-0" />
              Another teacher took this register. You can correct it as class teacher; saving replaces their marks for this day.
            </p>
          )}
          {isEditing && (
            <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
              The saved marks are shown; saving updates them.
              <button
                type="button"
                onClick={() => setClearing(true)}
                className="inline-flex items-center gap-1 font-medium text-danger hover:underline"
              >
                <Trash2 className="size-3.5" />
                Delete this day
              </button>
              <span>(for a register saved on the wrong date)</span>
            </p>
          )}
        </div>
      )}

      {keyboardMode && (
        <p className="flex flex-wrap items-center gap-3 border-b border-border bg-primary/[0.04] px-5 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Keyboard</span>
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          {ATTENDANCE_STATUSES.map((status) => (
            <span key={status} className="inline-flex items-center gap-1">
              <Kbd>{MARK[status].letter}</Kbd> {ATTENDANCE_LABEL[status]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <Kbd>Esc</Kbd> stop
          </span>
        </p>
      )}

      {/* Counts and Save, kept in view while the list scrolls. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-5 py-2.5 backdrop-blur">
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          {ATTENDANCE_STATUSES.map((status) => (
            <span key={status} className="inline-flex items-baseline gap-1">
              <span className={cn('text-lg font-semibold tabular-nums', counts[status] ? MARK[status].text : 'text-muted-foreground/60')}>
                {counts[status]}
              </span>
              <span className="text-xs text-muted-foreground">{ATTENDANCE_LABEL[status]}</span>
            </span>
          ))}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => markAll('PRESENT')} disabled={roster.length === 0}>
            All present
          </Button>
          <Button variant="primary" size="sm" loading={batch.running} disabled={roster.length === 0 || (!dirty && isEditing)} onClick={save}>
            <Save />
            {isEditing ? (dirty ? 'Save changes' : 'Saved') : 'Save register'}
          </Button>
        </div>
      </div>

      {batch.items.length > 0 && (
        <div className="border-b border-border px-5 py-3">
          <BatchProgress items={batch.items} percent={batch.percent} done={batch.done} total={batch.total} />
        </div>
      )}

      {rosterQuery.isPending ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded" />
          ))}
        </div>
      ) : rosterQuery.isError ? (
        <ListEmpty>The class list could not be loaded. Reload the page to try again.</ListEmpty>
      ) : roster.length === 0 ? (
        <ListEmpty>No students are enrolled in this class yet. The office enrols them first.</ListEmpty>
      ) : (
        <ul>
          {roster.map((student, index) => (
            <StudentRow
              key={student.id}
              student={student}
              row={rows.get(student.id)}
              focused={keyboardMode && index === cursor}
              onStatus={(status) => setStatus(student.id, status)}
              onRemarks={(remarks) => setRemarks(student.id, remarks)}
              onFocus={() => keyboardMode && setCursor(index)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={clearing}
        onOpenChange={(v) => !v && !clearingBusy && setClearing(false)}
        title={`Delete the register for ${formatDayLabel(date)}?`}
        description={`All ${saved.length} saved ${saved.length === 1 ? 'mark' : 'marks'} for ${mapping.class_room.name} · ${mapping.subject.name} on that date will be removed. Use this when a register was saved on the wrong date; to change marks, edit them and save.`}
        confirmLabel="Delete register"
        destructive
        loading={clearingBusy}
        onConfirm={clearDay}
      />
    </div>
  )
}

function StudentRow({
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
  const ref = React.useRef<HTMLLIElement>(null)
  React.useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focused])
  const status = row?.status ?? 'PRESENT'
  // On a phone the note box opens on request, so the list stays one line a student.
  const [noteOpen, setNoteOpen] = React.useState(() => !!row?.remarks?.trim())
  const hasNote = !!row?.remarks?.trim()

  return (
    <li
      ref={ref}
      onMouseDown={onFocus}
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-2',
        MARK[status].row,
        focused && 'relative ring-2 ring-inset ring-primary/40',
      )}
    >
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{student.roll_number ?? '—'}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{student.full_name}</span>
        {student.admission_number && <span className="block truncate text-[11px] text-muted-foreground">{student.admission_number}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1" role="group" aria-label={`Mark for ${student.full_name}`}>
        {ATTENDANCE_STATUSES.map((option) => {
          const on = status === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => onStatus(option)}
              aria-pressed={on}
              aria-label={`${ATTENDANCE_LABEL[option]}: ${student.full_name}`}
              title={ATTENDANCE_LABEL[option]}
              className={cn(
                'h-8 rounded-md border px-2.5 text-xs font-semibold transition-colors',
                on ? MARK[option].on : cn('border-border text-muted-foreground', MARK[option].idle),
              )}
            >
              <span className="sm:hidden">{MARK[option].letter}</span>
              <span className="hidden sm:inline">{ATTENDANCE_LABEL[option]}</span>
            </button>
          )
        })}
        {!noteOpen && !hasNote && (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            aria-label={`Add a note for ${student.full_name}`}
            className="ml-1 flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden"
          >
            <MessageSquarePlus className="size-4" />
          </button>
        )}
      </span>
      <Input
        value={row?.remarks ?? ''}
        onChange={(e) => onRemarks(e.target.value)}
        placeholder="Note"
        aria-label={`Note for ${student.full_name}`}
        className={cn('h-8 w-full text-sm md:block md:w-40 xl:w-56', !noteOpen && !hasNote && 'hidden')}
      />
    </li>
  )
}

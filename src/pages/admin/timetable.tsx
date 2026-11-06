import { CalendarRange, Plus, Trash2, TriangleAlert, Upload, X } from 'lucide-react'
import * as React from 'react'

import type { ClassRoomOut, DayOfWeek, TimetableEntryCreate, TimetableEntryOut } from '@/api/types'
import { ApiError } from '@/api/errors'
import {
  useBulkCreateTimetable,
  useClasses,
  useCreateTimetableEntry,
  useDeleteTimetableEntry,
  useMappings,
  useSubjects,
  useTimetable,
  useUpdateTimetableEntry,
  useTeachingStaff,
} from '@/queries/admin.queries'
import { cn } from '@/lib/cn'
import { countLabel } from '@/lib/format'
import { tidyName as tidy } from '@/lib/names'
import { DAYS, DAY_LABEL, type ParsedRow, dayOfWeekFor, formatWallTime, minutesOfDay, parseTimetableRows } from '@/lib/timetable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/forms/field'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Band, TabStrip, WorkspaceHeader } from '@/components/layout/workspace'

/*
 * The timetable, the way a school writes it on the wall: pick a class, and its
 * week is one grid — days down the side, periods across the top. Click a cell
 * to set or change its subject; the teacher comes from the subject allocation
 * unless you pick someone else. Every class shares the same period times, so
 * a time added for one class is a column for all of them.
 *
 * Times are the school's wall clock: a 09:00 period stays at 09:00 through a
 * daylight-saving change.
 */

const COMPACT_INPUT = 'h-8 px-3 py-1 text-sm'

/** Week days shown: Monday to Saturday, and Sunday only when something is on it. */
const SCHOOL_DAYS = DAYS.filter((d) => d !== 'SUNDAY')

type Slot = { start: string; end: string }
const slotKey = (s: Slot) => `${s.start}|${s.end}`

/** One colour per subject, as a stripe down the cell, so a subject reads the same all week. */
const SUBJECT_STRIPE = [
  'border-l-primary',
  'border-l-info',
  'border-l-success',
  'border-l-warning',
  'border-l-danger',
  'border-l-accent',
  'border-l-muted-foreground',
]
const stripeFor = (subjectId: number) => SUBJECT_STRIPE[subjectId % SUBJECT_STRIPE.length]

/** Sentinel for "let the backend resolve the teacher from the allocation". */
const MAPPED = '__mapped'

// ================================================================== editor

/**
 * The strip above the grid for the chosen cell: subject, teacher, room.
 *
 * A clash is the expected answer to a legitimate question, not a crash: the
 * backend refuses a double-booking with a 409 naming the clashing periods, and
 * the strip offers to save anyway (`allow_conflicts`). Rooms are never checked,
 * so a clash always means a class or a teacher is in two places at once.
 */
function CellEditor({
  klass,
  day,
  slot,
  slotIndex,
  entry,
  onClose,
}: {
  klass: ClassRoomOut
  day: DayOfWeek
  slot: Slot
  slotIndex: number
  entry: TimetableEntryOut | null
  onClose: () => void
}) {
  const subjectsQuery = useSubjects()
  const teachersQuery = useTeachingStaff()
  const mappingsQuery = useMappings()
  const createEntry = useCreateTimetableEntry()
  const updateEntry = useUpdateTimetableEntry()
  const deleteEntry = useDeleteTimetableEntry()

  const [subjectId, setSubjectId] = React.useState<string | null>(entry ? String(entry.subject_id) : null)
  const [teacherId, setTeacherId] = React.useState<string>(entry?.teacher_id ? String(entry.teacher_id) : MAPPED)
  const [room, setRoom] = React.useState(entry?.room ?? '')
  const [clash, setClash] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const classMappings = (mappingsQuery.data ?? []).filter((m) => m.class_room.id === klass.id)
  const mapped = classMappings.find((m) => String(m.subject.id) === subjectId)?.teacher ?? null
  const taught = new Map(classMappings.map((m) => [m.subject.id, m.teacher.full_name]))

  // The class's own subjects first, each with its teacher; the rest after.
  const subjectOptions = [...(subjectsQuery.data ?? [])]
    .sort((a, b) => Number(!taught.has(a.id)) - Number(!taught.has(b.id)) || a.name.localeCompare(b.name))
    .map((s) => ({
      value: String(s.id),
      label: tidy(s.name),
      hint: taught.has(s.id) ? `${s.code} · ${tidy(taught.get(s.id)!)}` : `${s.code} · not allocated to this class`,
      keywords: s.code,
    }))

  const save = async (allowConflicts: boolean) => {
    if (!subjectId) return
    setError(null)
    const body: TimetableEntryCreate = {
      class_id: klass.id,
      subject_id: Number(subjectId),
      teacher_id: teacherId === MAPPED ? null : Number(teacherId),
      day_of_week: day,
      start_time: slot.start,
      end_time: slot.end,
      room: room.trim() || null,
      period_label: entry?.period_label ?? `Period ${slotIndex + 1}`,
      effective_from: entry?.effective_from ?? null,
      effective_to: entry?.effective_to ?? null,
      is_active: true,
    }
    try {
      if (entry) await updateEntry.mutateAsync({ entryId: entry.id, body, allowConflicts })
      else await createEntry.mutateAsync({ body, allowConflicts })
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setClash(err.message)
        return
      }
      setError((err as { message?: string })?.message ?? 'Could not save the period.')
    }
  }

  const busy = createEntry.isPending || updateEntry.isPending

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">
            {DAY_LABEL[day]} · Period {slotIndex + 1}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {slot.start}–{slot.end} · {klass.name}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Subject</span>
        <Combobox
          value={subjectId}
          onChange={(v) => {
            setSubjectId(v)
            setTeacherId(MAPPED)
            setClash(null)
          }}
          options={subjectOptions}
          placeholder="Choose a subject"
          searchPlaceholder="Search by name or code"
          className="h-8 w-full bg-card text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Teacher</span>
        <Combobox
          value={teacherId}
          onChange={(v) => {
            setTeacherId(v)
            setClash(null)
          }}
          options={[
            { value: MAPPED, label: mapped ? tidy(mapped.full_name) : 'Teacher from allocation', hint: 'From the subject allocation' },
            ...(teachersQuery.data ?? [])
              .filter((t) => t.is_active && t.id !== mapped?.id)
              .map((t) => ({ value: String(t.id), label: tidy(t.full_name), hint: t.email })),
          ]}
          searchPlaceholder="Search by name or email"
          className="h-8 w-full bg-card text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Room (optional)</span>
        <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Room 12" className={cn(COMPACT_INPUT, 'bg-card')} />
      </label>

      {subjectId && !mapped && teacherId === MAPPED && (
        <p className="text-xs text-warning">Nobody is allocated this subject in {klass.name}. Pick a teacher, or allocate one under Subjects & Teachers.</p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      {clash && (
        <div className="space-y-2 border-l-2 border-warning bg-warning/5 px-3 py-2 text-xs">
          <p className="flex items-start gap-2 text-foreground">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
            {clash}
          </p>
          <Button variant="outline" size="xs" loading={busy} onClick={() => void save(true)}>
            Save anyway
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-border pt-3">
        <Button size="sm" className="flex-1" disabled={!subjectId} loading={busy && !clash} onClick={() => void save(false)}>
          {entry ? 'Save' : 'Add period'}
        </Button>
        {entry && (
          <Button
            variant="outline"
            size="sm"
            className="text-muted-foreground hover:text-danger"
            loading={deleteEntry.isPending}
            onClick={() => deleteEntry.mutate(entry.id, { onSuccess: onClose })}
          >
            <Trash2 />
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}

// ==================================================================== grid

/** Minutes between two wall times, for the break rows. */
const gapMinutes = (from: string, to: string) => minutesOfDay(to) - minutesOfDay(from)

/**
 * Periods down the side, days across the top — the way a printed timetable
 * reads. Plain white cells with a coloured stripe per subject; a gap of ten
 * minutes or more between periods shows as a thin break row. Clicking a cell
 * opens its editor on the cell itself, so the grid keeps the full width.
 */
function WeekGrid({
  days,
  slots,
  cellOf,
  today,
  selected,
  onPick,
  onClose,
  editor,
}: {
  days: DayOfWeek[]
  slots: Slot[]
  cellOf: (day: DayOfWeek, slot: Slot) => TimetableEntryOut | null
  today: DayOfWeek
  selected: { day: DayOfWeek; key: string } | null
  onPick: (day: DayOfWeek, slot: Slot, index: number) => void
  onClose: () => void
  editor: React.ReactNode
}) {
  return (
    <table className="w-full min-w-[34rem] table-fixed border-separate border-spacing-0 text-sm">
      <thead>
        <tr>
          <th className="sticky top-0 z-10 w-24 border-b border-r border-border bg-muted px-3 py-2 text-left text-xs font-medium text-muted-foreground">
            Period
          </th>
          {days.map((day) => (
            <th
              key={day}
              className={cn(
                'sticky top-0 z-10 border-b border-r border-border bg-muted px-3 py-2 text-left text-xs font-medium last:border-r-0',
                day === today ? 'text-primary' : 'text-foreground',
              )}
            >
              {DAY_LABEL[day]}
              {day === today && <span className="ml-1.5 rounded bg-primary px-1 py-px text-[9px] font-medium uppercase text-primary-foreground">Today</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {slots.map((s, i) => {
          const gap = i > 0 ? gapMinutes(slots[i - 1].end, s.start) : 0
          return (
            <React.Fragment key={slotKey(s)}>
              {gap >= 10 && (
                <tr>
                  <td
                    colSpan={days.length + 1}
                    className="border-b border-border bg-muted/40 py-0.5 text-center text-[10px] uppercase tracking-wider text-muted-foreground"
                  >
                    Break · {gap} min
                  </td>
                </tr>
              )}
              <tr>
                <th className="border-b border-r border-border bg-card px-3 py-1 text-left align-middle font-normal">
                  <span className="block text-xs font-medium text-foreground">Period {i + 1}</span>
                  <span className="block text-[10px] tabular-nums text-muted-foreground">
                    {s.start}–{s.end}
                  </span>
                </th>
                {days.map((day) => {
                  const entry = cellOf(day, s)
                  const active = selected?.day === day && selected.key === slotKey(s)
                  return (
                    <td
                      key={day}
                      className={cn('border-b border-r border-border p-0 last:border-r-0', day === today && 'bg-primary/[0.025]')}
                    >
                      <Popover open={active} onOpenChange={(v) => !v && onClose()}>
                        <PopoverAnchor asChild>
                          <button
                            type="button"
                            onClick={() => onPick(day, s, i)}
                            className={cn(
                              'group flex h-11 w-full min-w-0 flex-col justify-center px-3 text-left transition-colors',
                              entry ? cn('border-l-[3px] hover:bg-muted/40', stripeFor(entry.subject_id)) : 'hover:bg-primary/5',
                              active && 'bg-primary/10',
                            )}
                            aria-label={
                              entry
                                ? `${tidy(entry.subject?.name ?? 'Period')}, ${DAY_LABEL[day]} period ${i + 1}`
                                : `Add a period, ${DAY_LABEL[day]} period ${i + 1}`
                            }
                          >
                            {entry ? (
                              <>
                                <span className="truncate text-[13px] font-medium text-foreground" title={tidy(entry.subject?.name ?? 'Period')}>
                                  {tidy(entry.subject?.name ?? 'Period')}
                                </span>
                                <span className="truncate text-[11px] text-muted-foreground">
                                  {entry.teacher ? tidy(entry.teacher.full_name) : <span className="text-warning">No teacher</span>}
                                  {entry.room ? ` · ${entry.room}` : ''}
                                </span>
                              </>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground/0 transition-colors group-hover:text-primary">
                                <Plus className="size-3.5" />
                                Add
                              </span>
                            )}
                          </button>
                        </PopoverAnchor>
                        {active && (
                          <PopoverContent align="start" sideOffset={4} className="w-72 p-3">
                            {editor}
                          </PopoverContent>
                        )}
                      </Popover>
                    </td>
                  )
                })}
              </tr>
            </React.Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

// ============================================================ bulk upload

const SAMPLE = `class,subject,teacher,day,start,end,room,label
7A,Mathematics,Anita Rahman,Monday,09:00,09:45,Room 12,Period 1
7A,Physics,,Monday,09:50,10:35,Lab 2,Period 2`

/**
 * Bulk upload.
 *
 * Everything is resolved and validated in the browser BEFORE anything is sent,
 * because the alternative — posting forty rows and reading back a list of
 * indices that failed — makes the admin map numbers to spreadsheet lines by
 * hand. Rows that fail here never leave; rows the server rejects still come
 * back in `skipped` and are shown alongside.
 */
function BulkDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const classesQuery = useClasses()
  const subjectsQuery = useSubjects()
  const teachersQuery = useTeachingStaff()
  const bulkCreate = useBulkCreateTimetable()

  const [text, setText] = React.useState('')
  const [replaceExisting, setReplaceExisting] = React.useState(false)
  const [allowConflicts, setAllowConflicts] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setText('')
    setReplaceExisting(false)
    setAllowConflicts(false)
    bulkCreate.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const lookups = React.useMemo(
    () => ({
      classByName: new Map(
        (classesQuery.data ?? []).flatMap((c) => [
          [c.name.toLowerCase(), c.id] as [string, number],
          [c.code.toLowerCase(), c.id] as [string, number],
        ]),
      ),
      subjectByName: new Map(
        (subjectsQuery.data ?? []).flatMap((s) => [
          [s.name.toLowerCase(), s.id] as [string, number],
          [s.code.toLowerCase(), s.id] as [string, number],
        ]),
      ),
      teacherByName: new Map(
        (teachersQuery.data ?? []).flatMap((t) => [
          [t.full_name.toLowerCase(), t.id] as [string, number],
          [t.email.toLowerCase(), t.id] as [string, number],
        ]),
      ),
    }),
    [classesQuery.data, subjectsQuery.data, teachersQuery.data],
  )

  const rows: ParsedRow[] = React.useMemo(
    () => (text.trim() ? parseTimetableRows(text, lookups) : []),
    [text, lookups],
  )
  const valid = rows.filter((r) => r.entry)
  const invalid = rows.filter((r) => r.error)

  const affectedClasses = React.useMemo(
    () => new Set(valid.map((r) => r.entry!.class_id)).size,
    [valid],
  )

  const submit = async () => {
    if (valid.length === 0) return
    await bulkCreate.mutateAsync({
      body: {
        entries: valid.map((r) => r.entry!),
        replace_existing: replaceExisting,
      },
      allowConflicts,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !bulkCreate.isPending && onOpenChange(v)}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Upload a timetable</DialogTitle>
          <DialogDescription>
            Paste rows from a spreadsheet. Names are matched against your classes, subjects and
            teachers before anything is sent.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <Field
            id="bulk-text"
            label="Rows"
            hint="CSV or tab-separated, with a header. Required: class, subject, day, start, end. Optional: teacher, room, label."
          >
            <textarea
              id="bulk-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              spellCheck={false}
              placeholder={SAMPLE}
              className="w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-xs shadow-xs outline-none placeholder:text-muted-foreground/60 focus:border-primary"
            />
          </Field>

          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={valid.length > 0 ? 'success' : 'neutral'}>
                {valid.length} ready
              </Badge>
              {invalid.length > 0 && <Badge tone="danger">{invalid.length} with problems</Badge>}
              {affectedClasses > 0 && (
                <span className="text-xs text-muted-foreground">
                  across {affectedClasses} class{affectedClasses === 1 ? '' : 'es'}
                </span>
              )}
            </div>
          )}

          {invalid.length > 0 && (
            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-danger/30 bg-danger/8 p-3">
              {invalid.map((row) => (
                <p key={row.line} className="text-xs text-danger">
                  <span className="font-medium">Line {row.line}:</span> {row.error}
                </p>
              ))}
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2.5">
            <Checkbox
              checked={replaceExisting}
              onCheckedChange={(v) => setReplaceExisting(v === true)}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium">Replace the existing timetable for these classes</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Every current period for the {affectedClasses || 0} class
                {affectedClasses === 1 ? '' : 'es'} named above is deleted first. This is what makes
                re-uploading a corrected week replace it rather than double it up — but it is a real
                delete, so leave it off if you are adding to an existing schedule.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2.5">
            <Checkbox
              checked={allowConflicts}
              onCheckedChange={(v) => setAllowConflicts(v === true)}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium">Allow clashes</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Insert periods even when they double-book a class or a teacher. Off by default —
                clashing rows are reported instead of created.
              </span>
            </span>
          </label>

          {/* Partial success is normal, so the outcome is shown in place rather
              than only as a toast that disappears. */}
          {bulkCreate.data && (
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-sm font-medium">{bulkCreate.data.detail}</p>
              {bulkCreate.data.skipped.length > 0 && (
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {bulkCreate.data.skipped.map((s) => (
                    <p key={s.index} className="text-xs text-muted-foreground">
                      <span className="font-medium">
                        Line {(valid[s.index]?.line ?? s.index + 2)}:
                      </span>{' '}
                      {s.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={bulkCreate.isPending}>
            {bulkCreate.data ? 'Close' : 'Cancel'}
          </Button>
          <Button
            variant="primary"
            icon={<Upload />}
            disabled={valid.length === 0}
            loading={bulkCreate.isPending}
            onClick={() => void submit()}
          >
            Upload {valid.length || ''} period{valid.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================================================================== page

export default function AdminTimetablePage() {
  const timetableQuery = useTimetable(false)
  const classesQuery = useClasses()

  const classes = React.useMemo(
    () => [...(classesQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [classesQuery.data],
  )
  const [classId, setClassId] = React.useState<string | null>(null)
  const klass = classes.find((c) => String(c.id) === classId) ?? classes[0] ?? null

  const [bulkOpen, setBulkOpen] = React.useState(false)
  const [picked, setPicked] = React.useState<{ day: DayOfWeek; slot: Slot; index: number } | null>(null)
  const [extraSlots, setExtraSlots] = React.useState<Slot[]>([])
  const [addingSlot, setAddingSlot] = React.useState(false)
  const [newStart, setNewStart] = React.useState('')
  const [newEnd, setNewEnd] = React.useState('')

  const entries = React.useMemo(() => timetableQuery.data ?? [], [timetableQuery.data])

  // Period times are shared by the whole school: every start–end pair in use,
  // plus any added here that nothing sits in yet.
  const slots = React.useMemo(() => {
    const map = new Map<string, Slot>()
    for (const e of entries) {
      const s = { start: formatWallTime(e.start_time), end: formatWallTime(e.end_time) }
      map.set(slotKey(s), s)
    }
    for (const s of extraSlots) map.set(slotKey(s), s)
    return [...map.values()].sort((a, b) => minutesOfDay(a.start) - minutesOfDay(b.start) || minutesOfDay(a.end) - minutesOfDay(b.end))
  }, [entries, extraSlots])

  const classEntries = entries.filter((e) => e.class_id === klass?.id)
  const days = classEntries.some((e) => e.day_of_week === 'SUNDAY') ? DAYS : SCHOOL_DAYS
  const cellOf = (day: DayOfWeek, slot: Slot) =>
    classEntries.find(
      (e) => e.day_of_week === day && formatWallTime(e.start_time) === slot.start && formatWallTime(e.end_time) === slot.end,
    ) ?? null
  const empty = days.length * slots.length - classEntries.length
  const noTeacher = classEntries.filter((e) => !e.teacher).length

  const addSlot = () => {
    if (!newStart || !newEnd || minutesOfDay(newEnd) <= minutesOfDay(newStart)) return
    setExtraSlots((prev) => [...prev, { start: newStart, end: newEnd }])
    setNewStart('')
    setNewEnd('')
    setAddingSlot(false)
  }

  const today = dayOfWeekFor(new Date())
  const loading = timetableQuery.isPending || classesQuery.isPending

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title="Timetable"
        description="Pick a class and click a period to set its subject. The teacher comes from the subject allocation"
        icon={CalendarRange}
        actions={
          <Button variant="outline" size="sm" icon={<Upload />} onClick={() => setBulkOpen(true)}>
            Upload
          </Button>
        }
        tabs={
          classes.length > 0 && (
            <TabStrip
              label="Classes"
              idPrefix="tt-class"
              value={klass ? String(klass.id) : ''}
              onChange={(v) => {
                setClassId(v)
                setPicked(null)
              }}
              tabs={classes.map((c) => ({
                key: String(c.id),
                label: c.name,
                count: entries.filter((e) => e.class_id === c.id).length,
              }))}
            />
          )
        }
      />

      <div className="!mt-0">
        {/* ------------------------------------------------------ toolbar */}
        <Band className="border-b border-border">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2.5">
            {klass && !loading && (
              <span className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{klass.name}</span> ·{' '}
                {countLabel(classEntries.length, 'period')} a week
                {empty > 0 && ` · ${empty} free`}
                {noTeacher > 0 && <span className="text-warning"> · {noTeacher} without a teacher</span>}
              </span>
            )}
            <span className="ml-auto flex items-center gap-2">
              {addingSlot ? (
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault()
                    addSlot()
                  }}
                >
                  <Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} aria-label="Starts" className={cn(COMPACT_INPUT, 'w-28')} />
                  <span className="text-muted-foreground">–</span>
                  <Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} aria-label="Ends" className={cn(COMPACT_INPUT, 'w-28')} />
                  <Button type="submit" size="sm" disabled={!newStart || !newEnd || minutesOfDay(newEnd) <= minutesOfDay(newStart)}>
                    Add
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setAddingSlot(false)} aria-label="Cancel">
                    <X />
                  </Button>
                </form>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setAddingSlot(true)}>
                  <Plus />
                  Period time
                </Button>
              )}
            </span>
          </div>
        </Band>

        {/* --------------------------------------------------------- grid */}
        <Band className="border-b border-border">
          {loading ? (
            <Skeleton className="my-4 h-80 w-full" />
          ) : !klass ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Add a class first, under Classes & Students</p>
          ) : slots.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-foreground">No period times yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Add the first period time, for example 09:00 to 09:45, or upload a whole week</p>
              <Button size="sm" className="mt-4" icon={<Plus />} onClick={() => setAddingSlot(true)}>
                Period time
              </Button>
            </div>
          ) : (
            <div className="-mx-4 overflow-auto sm:-mx-6 lg:-mx-8 lg:h-[calc(100vh-17rem)] lg:min-h-[24rem]">
              <WeekGrid
                days={days}
                slots={slots}
                cellOf={cellOf}
                today={today}
                selected={picked ? { day: picked.day, key: slotKey(picked.slot) } : null}
                onPick={(day, slot, index) => setPicked({ day, slot, index })}
                onClose={() => setPicked(null)}
                editor={
                  picked && (
                    <CellEditor
                      key={`${klass.id}-${picked.day}-${slotKey(picked.slot)}`}
                      klass={klass}
                      day={picked.day}
                      slot={picked.slot}
                      slotIndex={picked.index}
                      entry={cellOf(picked.day, picked.slot)}
                      onClose={() => setPicked(null)}
                    />
                  )
                }
              />
            </div>
          )}
        </Band>
      </div>

      <BulkDialog open={bulkOpen} onOpenChange={setBulkOpen} />
    </div>
  )
}

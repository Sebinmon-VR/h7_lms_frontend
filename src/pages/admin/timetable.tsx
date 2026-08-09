import { CalendarPlus, Eye, EyeOff, Pencil, Trash2, TriangleAlert, Upload } from 'lucide-react'
import * as React from 'react'

import type { DayOfWeek, TimetableEntryCreate, TimetableEntryOut } from '@/api/types'
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
  useUsers,
} from '@/queries/admin.queries'
import { cn } from '@/lib/cn'
import {
  DAYS,
  DAY_LABEL,
  type ParsedRow,
  dayOfWeekFor,
  formatWallTime,
  minutesOfDay,
  parseTimetableRows,
} from '@/lib/timetable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TimetableWeek } from '@/components/domain/timetable'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field } from '@/components/forms/field'
import { PageHeader } from '@/components/layout/page-header'

/**
 * A clash is the expected answer to a legitimate question, not a crash.
 *
 * The backend refuses a double-booking with a 409 that names the clashing
 * periods. Rather than surfacing that as a red error and making the admin
 * guess, the dialog holds it and offers to schedule anyway — which is exactly
 * what `?allow_conflicts=true` is for. Rooms are never checked, so a clash here
 * always means a class or a teacher is in two places at once.
 */
function ClashNotice({ message, onOverride, busy }: { message: string; onOverride: () => void; busy?: boolean }) {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/8 p-3">
      <p className="flex items-start gap-2 text-sm">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>{message}</span>
      </p>
      <Button variant="outline" size="sm" className="mt-2.5" loading={busy} onClick={onOverride}>
        Schedule it anyway
      </Button>
    </div>
  )
}

const EMPTY: TimetableEntryCreate = {
  class_id: 0,
  subject_id: 0,
  teacher_id: null,
  day_of_week: 'MONDAY',
  start_time: '09:00',
  end_time: '09:45',
  room: null,
  period_label: null,
  effective_from: null,
  effective_to: null,
  is_active: true,
}

function EntryDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: TimetableEntryOut | null
}) {
  const classesQuery = useClasses()
  const subjectsQuery = useSubjects()
  const teachersQuery = useUsers('TEACHER')
  const mappingsQuery = useMappings()
  const createEntry = useCreateTimetableEntry()
  const updateEntry = useUpdateTimetableEntry()

  const [form, setForm] = React.useState<TimetableEntryCreate>(EMPTY)
  const [error, setError] = React.useState<string | null>(null)
  const [clash, setClash] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setError(null)
    setClash(null)
    setForm(
      editing
        ? {
            class_id: editing.class_id,
            subject_id: editing.subject_id,
            teacher_id: editing.teacher_id,
            day_of_week: editing.day_of_week,
            start_time: formatWallTime(editing.start_time),
            end_time: formatWallTime(editing.end_time),
            room: editing.room,
            period_label: editing.period_label,
            effective_from: editing.effective_from,
            effective_to: editing.effective_to,
            is_active: editing.is_active,
          }
        : EMPTY,
    )
  }, [open, editing])

  const set = <K extends keyof TimetableEntryCreate>(key: K, value: TimetableEntryCreate[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    // Any edit invalidates the clash the previous values produced.
    setClash(null)
  }

  /**
   * The teacher the backend would pick if `teacher_id` is left empty. Shown so
   * "Mapped teacher" is a concrete promise rather than a shrug.
   */
  const mappedTeacher = React.useMemo(() => {
    if (!form.class_id || !form.subject_id) return null
    const mapping = (mappingsQuery.data ?? []).find(
      (m) => m.class_room.id === form.class_id && m.subject.id === form.subject_id,
    )
    return mapping?.teacher ?? null
  }, [mappingsQuery.data, form.class_id, form.subject_id])

  const timesValid = minutesOfDay(form.end_time) > minutesOfDay(form.start_time)
  const ready = !!form.class_id && !!form.subject_id && timesValid

  const submit = async (allowConflicts: boolean) => {
    if (!ready) return
    setError(null)
    try {
      if (editing) {
        await updateEntry.mutateAsync({ entryId: editing.id, body: form, allowConflicts })
      } else {
        await createEntry.mutateAsync({ body: form, allowConflicts })
      }
      onOpenChange(false)
    } catch (err) {
      // 409 is the clash path and gets its own affordance; everything else is
      // a genuine error.
      if (err instanceof ApiError && err.status === 409) {
        setClash(err.message)
        return
      }
      setError((err as { message?: string })?.message ?? 'Could not save the period.')
    }
  }

  const busy = createEntry.isPending || updateEntry.isPending

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit period' : 'Add a period'}</DialogTitle>
          <DialogDescription>
            A period recurs every week on this day. Times are the school&rsquo;s local clock — a
            09:00 period stays at 09:00 through a daylight-saving change.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          {clash && (
            <ClashNotice message={clash} busy={busy} onOverride={() => void submit(true)} />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="tt-class" label="Class" required>
              <Combobox
                id="tt-class"
                value={form.class_id ? String(form.class_id) : null}
                onChange={(v) => set('class_id', Number(v))}
                placeholder="Select a class"
                options={(classesQuery.data ?? []).map((c) => ({
                  value: String(c.id),
                  label: c.name,
                  hint: c.code,
                }))}
              />
            </Field>
            <Field id="tt-subject" label="Subject" required>
              <Combobox
                id="tt-subject"
                value={form.subject_id ? String(form.subject_id) : null}
                onChange={(v) => set('subject_id', Number(v))}
                placeholder="Select a subject"
                options={(subjectsQuery.data ?? []).map((s) => ({
                  value: String(s.id),
                  label: s.name,
                  hint: s.code,
                }))}
              />
            </Field>
          </div>

          <Field
            id="tt-teacher"
            label="Teacher"
            hint={
              mappedTeacher
                ? `Leave as “Mapped teacher” to use ${mappedTeacher.full_name}, who is already assigned to this subject and class.`
                : 'Leave as “Mapped teacher” to use whoever is assigned to this subject and class.'
            }
          >
            <Combobox
              id="tt-teacher"
              value={form.teacher_id ? String(form.teacher_id) : MAPPED}
              onChange={(v) => set('teacher_id', v === MAPPED ? null : Number(v))}
              options={[
                {
                  value: MAPPED,
                  label: mappedTeacher ? `Mapped teacher — ${mappedTeacher.full_name}` : 'Mapped teacher',
                  hint: 'Resolved from the teacher assignments',
                },
                ...(teachersQuery.data ?? [])
                  .filter((t) => t.is_active)
                  .map((t) => ({ value: String(t.id), label: t.full_name, hint: t.email })),
              ]}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="tt-day" label="Day" required>
              <Combobox
                id="tt-day"
                value={form.day_of_week}
                onChange={(v) => set('day_of_week', v as DayOfWeek)}
                options={DAYS.map((d) => ({ value: d, label: DAY_LABEL[d] }))}
              />
            </Field>
            <Field id="tt-start" label="Starts" required>
              <Input
                id="tt-start"
                type="time"
                value={form.start_time}
                onChange={(e) => set('start_time', e.target.value)}
              />
            </Field>
            <Field
              id="tt-end"
              label="Ends"
              required
              error={timesValid ? undefined : 'Must be later than the start time'}
            >
              <Input
                id="tt-end"
                type="time"
                value={form.end_time}
                onChange={(e) => set('end_time', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="tt-room" label="Room" hint="Not checked for clashes — labels get reused.">
              <Input
                id="tt-room"
                value={form.room ?? ''}
                onChange={(e) => set('room', e.target.value || null)}
                placeholder="Room 12"
              />
            </Field>
            <Field id="tt-label" label="Period label">
              <Input
                id="tt-label"
                value={form.period_label ?? ''}
                onChange={(e) => set('period_label', e.target.value || null)}
                placeholder="Period 1"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="tt-from" label="Applies from" hint="Defaults to today.">
              <Input
                id="tt-from"
                type="date"
                value={form.effective_from ?? ''}
                onChange={(e) => set('effective_from', e.target.value || null)}
              />
            </Field>
            <Field id="tt-to" label="Applies until" hint="Leave empty for the rest of the year.">
              <Input
                id="tt-to"
                type="date"
                value={form.effective_to ?? ''}
                onChange={(e) => set('effective_to', e.target.value || null)}
              />
            </Field>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-3.5">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Pausing keeps the period on the timetable but stops it appearing in day views and
                reminders. Use this for a term break rather than deleting and re-creating it.
              </p>
            </div>
            <Switch
              checked={form.is_active ?? true}
              onCheckedChange={(v) => set('is_active', v)}
              aria-label="Active"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready} loading={busy} onClick={() => void submit(false)}>
            {editing ? 'Save changes' : 'Add period'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Sentinel for "let the backend resolve the teacher from the mappings". */
const MAPPED = '__mapped'

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
  const teachersQuery = useUsers('TEACHER')
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
        <DialogBody className="space-y-4">
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

export default function AdminTimetablePage() {
  const [includeInactive, setIncludeInactive] = React.useState(false)
  const timetableQuery = useTimetable(includeInactive)
  const classesQuery = useClasses()
  const deleteEntry = useDeleteTimetableEntry()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [bulkOpen, setBulkOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<TimetableEntryOut | null>(null)
  const [selected, setSelected] = React.useState<TimetableEntryOut | null>(null)
  const [deleting, setDeleting] = React.useState<TimetableEntryOut | null>(null)
  const [classFilter, setClassFilter] = React.useState<string | null>(null)

  const entries = React.useMemo(() => {
    const all = timetableQuery.data ?? []
    return classFilter ? all.filter((e) => String(e.class_id) === classFilter) : all
  }, [timetableQuery.data, classFilter])

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (entry: TimetableEntryOut) => {
    setSelected(null)
    setEditing(entry)
    setDialogOpen(true)
  }

  const today = dayOfWeekFor(new Date())

  return (
    <>
      <PageHeader
        title="Timetable"
        description="The weekly schedule. Each period recurs until its end date passes."
        actions={
          <>
            <Button variant="outline" icon={<Upload />} onClick={() => setBulkOpen(true)}>
              Bulk upload
            </Button>
            <Button variant="primary" icon={<CalendarPlus />} onClick={openCreate}>
              Add period
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setClassFilter(null)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              classFilter === null
                ? 'border-primary bg-primary/12 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/40',
            )}
          >
            All classes
          </button>
          {(classesQuery.data ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setClassFilter(String(c.id))}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                classFilter === String(c.id)
                  ? 'border-primary bg-primary/12 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40',
              )}
            >
              {c.name}
            </button>
          ))}

          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            icon={includeInactive ? <EyeOff /> : <Eye />}
            onClick={() => setIncludeInactive((v) => !v)}
          >
            {includeInactive ? 'Hide paused' : 'Show paused'}
          </Button>
        </div>
      </PageHeader>

      <QueryBoundary query={timetableQuery} loading={<Skeleton className="h-96 rounded-xl" />}>
        {() => (
          <TimetableWeek
            entries={entries}
            scope="admin"
            today={today}
            onSelect={setSelected}
            emptyDescription={
              classFilter
                ? 'This class has no periods yet. Add one, or upload a whole week at once.'
                : 'No periods have been added yet. Bulk upload is the quickest way to build a term.'
            }
          />
        )}
      </QueryBoundary>

      <EntryDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      <BulkDialog open={bulkOpen} onOpenChange={setBulkOpen} />

      {/* Clicking a period opens its actions rather than editing straight away —
          a mis-click on a dense grid should not open a form. */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{selected ? selected.subject?.name ?? 'Period' : ''}</DialogTitle>
            <DialogDescription>
              {selected
                ? `${DAY_LABEL[selected.day_of_week]}, ${formatWallTime(selected.start_time)}–${formatWallTime(selected.end_time)}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              icon={<Trash2 />}
              onClick={() => {
                setDeleting(selected)
                setSelected(null)
              }}
            >
              Remove
            </Button>
            <Button variant="primary" icon={<Pencil />} onClick={() => selected && openEdit(selected)}>
              Edit period
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Remove this period?"
        description={
          deleting
            ? `${deleting.subject?.name ?? 'This period'} on ${DAY_LABEL[deleting.day_of_week]} at ${formatWallTime(deleting.start_time)} will be removed from the timetable. To pause it for a term instead, edit it and turn off “Active”.`
            : undefined
        }
        confirmLabel="Remove period"
        destructive
        loading={deleteEntry.isPending}
        onConfirm={() => {
          if (!deleting) return
          deleteEntry.mutate(deleting.id, { onSettled: () => setDeleting(null) })
        }}
      />
    </>
  )
}

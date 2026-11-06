import { zodResolver } from '@hookform/resolvers/zod'
import {
  Check,
  Copy,
  Disc,
  Download,
  ExternalLink,
  Film,
  Link as LinkIcon,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
  Video,
  X,
} from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'

import type { LiveMeetingOut, UserOut } from '@/api/types'
import {
  useAdminCreateMeeting,
  useAdminDeleteMeeting,
  useAdminMeetings,
  useAdminSyncRecording,
  useAdminUpdateMeeting,
  useClasses,
  useMappings,
  useRegenerateMeetingLink,
  useSubjects,
  useTeachingStaff,
  useUsers,
} from '@/queries/admin.queries'
import { useProgramSettings } from '@/queries/tuition.queries'
import { cn } from '@/lib/cn'
import { splitMeetings } from '@/lib/derive'
import { formatCountdown, formatDate, meetingPhase, parseApiDateTime } from '@/lib/datetime'
import { resolveFileUrl } from '@/lib/files'
import { countLabel } from '@/lib/format'
import { hasRetiredMeetLink, isValidMeetingLink, shareableLink } from '@/lib/meeting-links'
import { useCopyToClipboard, useNow } from '@/lib/hooks'
import { tidyName as tidy } from '@/lib/names'
import { canCollectRecording, recordingHint } from '@/lib/recordings'
import { formatSchoolTime } from '@/lib/school-time'
import { buildDirectory, className as classNameOf, subjectName, teacherName } from '@/lib/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { DateTimePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { MeetStatusBadge, MeetingPhaseBadge, RecordingStatusBadge } from '@/components/domain/badges'
import { JoinClassButton, TeacherClassControls } from '@/components/domain/live-class'
import { ErrorState } from '@/components/feedback/states'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field, FormError } from '@/components/forms/field'
import { Band, Figure, Figures, TabStrip, WorkspaceHeader } from '@/components/layout/workspace'

/*
 * Virtual Meetings, laid out like the other admin workspaces: white bands, no
 * cards. Sessions on the left grouped by day; the chosen session on the right
 * with its room, recording and every action. Scheduling and editing happen in
 * the right-hand pane.
 */

const schema = z.object({
  teacher_id: z.string().min(1, 'Choose a teacher'),
  class_id: z.string().min(1, 'Choose a class'),
  subject_id: z.string().min(1, 'Choose a subject'),
  title: z.string().min(2, 'Enter a title').max(200),
  scheduled_time: z.string().min(1, 'Choose a date and time'),
  // An LMS room is a relative path; a pasted link is https.
  meeting_link: z.string().refine(isValidMeetingLink, 'Enter a valid URL').optional(),
  auto_create_meet: z.boolean(),
  invite_students: z.boolean(),
  auto_record: z.boolean(),
  duration_minutes: z.coerce
    .number()
    .int('Use a whole number of minutes')
    .min(5, 'At least 5 minutes')
    .max(600, 'At most 10 hours'),
})
type FormValues = z.infer<typeof schema>

const DEFAULT_VALUES: FormValues = {
  teacher_id: '',
  class_id: '',
  subject_id: '',
  title: '',
  scheduled_time: '',
  meeting_link: '',
  auto_create_meet: true,
  invite_students: true,
  auto_record: true,
  duration_minutes: 60,
}

/**
 * Schedules a session on any teacher's behalf, or edits an existing one.
 *
 * The teacher choice decides whose schedule the session lands on and who
 * hosts it, so the field is required here even though the API treats it as
 * optional (it would otherwise be filed under the acting admin).
 */
function AdminMeetingForm({ editing, onClose }: { editing: LiveMeetingOut | null; onClose: () => void }) {
  const teachersQuery = useTeachingStaff()
  const classesQuery = useClasses()
  const subjectsQuery = useSubjects()
  const mappingsQuery = useMappings()
  const createMeeting = useAdminCreateMeeting()
  const updateMeeting = useAdminUpdateMeeting()
  // The classroom model: one shared room per class, so a new session borrows
  // the class's link and nothing is generated per session.
  const lmsSettings = useProgramSettings('LMS', true)
  const roomMode = lmsSettings.data?.class_room_mode === true

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_VALUES,
  })

  React.useEffect(() => {
    form.reset(
      editing
        ? {
            ...DEFAULT_VALUES,
            teacher_id: String(editing.teacher_id),
            class_id: String(editing.class_id),
            subject_id: String(editing.subject_id),
            title: editing.title,
            scheduled_time: editing.scheduled_time,
            meeting_link: editing.meeting_link ?? '',
            duration_minutes: editing.duration_minutes ?? 60,
            auto_create_meet: false,
            invite_students: false,
            auto_record: false,
          }
        : DEFAULT_VALUES,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  const teacherId = form.watch('teacher_id')
  const classId = form.watch('class_id')
  const autoCreateMeet = form.watch('auto_create_meet')
  const manualLink = (form.watch('meeting_link') ?? '').trim()
  const meetGenerationActive = !editing && !roomMode && autoCreateMeet && !manualLink
  const selectedClass = (classesQuery.data ?? []).find((c) => String(c.id) === classId) ?? null

  /**
   * Narrowed to what the chosen teacher is actually assigned to teach.
   *
   * Nothing server-side enforces this — an admin could file a session under a
   * teacher for a class they do not teach — but doing so would produce a
   * meeting nobody expects to own, so the picker follows the mappings.
   */
  const teacherMappings = React.useMemo(
    () => (mappingsQuery.data ?? []).filter((m) => String(m.teacher.id) === teacherId),
    [mappingsQuery.data, teacherId],
  )

  const classOptions = React.useMemo(() => {
    const map = new Map<number, { id: number; name: string; code: string }>()
    for (const m of teacherMappings) map.set(m.class_room.id, m.class_room)
    return [...map.values()]
  }, [teacherMappings])

  const subjectOptions = React.useMemo(() => {
    const map = new Map<number, { id: number; name: string; code: string }>()
    for (const m of teacherMappings) {
      if (classId && m.class_room.id !== Number(classId)) continue
      map.set(m.subject.id, m.subject)
    }
    return [...map.values()]
  }, [teacherMappings, classId])

  const onSubmit = async (values: FormValues) => {
    const link = values.meeting_link?.trim() ?? ''

    try {
      if (editing) {
        // Only changed fields — an empty update body is a 400. Class, subject
        // and teacher are absent from LiveMeetingUpdate and cannot move.
        const patch = {
          ...(values.title !== editing.title && { title: values.title }),
          ...(values.scheduled_time !== editing.scheduled_time && {
            scheduled_time: values.scheduled_time,
          }),
          ...(link !== (editing.meeting_link ?? '') && { meeting_link: link }),
          ...(values.duration_minutes !== (editing.duration_minutes ?? 60) && {
            duration_minutes: values.duration_minutes,
          }),
        }
        if (Object.keys(patch).length === 0) {
          onClose()
          return
        }
        await updateMeeting.mutateAsync({ meetingId: editing.id, body: patch })
      } else {
        await createMeeting.mutateAsync({
          teacher_id: Number(values.teacher_id),
          class_id: Number(values.class_id),
          subject_id: Number(values.subject_id),
          title: values.title,
          scheduled_time: values.scheduled_time,
          meeting_link: link || null,
          status: 'SCHEDULED',
          auto_create_meet: values.auto_create_meet,
          invite_students: values.invite_students,
          auto_record: values.auto_record,
          duration_minutes: values.duration_minutes,
        })
      }
      onClose()
    } catch (error) {
      form.setError('root', {
        message:
          (error as { message?: string })?.message ??
          `Could not ${editing ? 'update' : 'schedule'} the meeting.`,
      })
    }
  }

  const teacherOptions = (teachersQuery.data ?? [])
    .filter((t) => t.is_active)
    .map((t) => ({ value: String(t.id), label: t.full_name, hint: t.email }))

  const classDir = React.useMemo(() => buildDirectory(classesQuery.data ?? []), [classesQuery.data])
  const subjectDir = React.useMemo(
    () => buildDirectory(subjectsQuery.data ?? []),
    [subjectsQuery.data],
  )

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="max-w-2xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-foreground">{editing ? 'Edit meeting' : 'Schedule a meeting'}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {editing
              ? 'Students see the change in their schedule straight away.'
              : roomMode
                ? 'Filed under the chosen teacher, held in the class\u2019s shared room. No new room is created.'
                : 'Filed under the chosen teacher, who hosts it in a class room in the LMS.'}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close the form">
          <X />
        </Button>
      </div>
            <FormError message={form.formState.errors.root?.message} />

            {editing ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5">
                <span className="text-xs text-muted-foreground">This meeting belongs to</span>
                <Badge tone="info" size="sm">
                  {teacherName(editing)}
                </Badge>
                <Badge tone="accent" size="sm">
                  {subjectDir.get(editing.subject_id)?.name ?? editing.subject?.name ?? 'Subject'}
                </Badge>
                <Badge tone="outline" size="sm">
                  {classDir.get(editing.class_id)?.name ?? editing.class_room?.name ?? 'Class'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  — cancel and re-schedule to move it.
                </span>
              </div>
            ) : (
              <>
                <Field
                  id="admin-meeting-teacher"
                  label="Teacher"
                  required
                  error={form.formState.errors.teacher_id?.message}
                  hint="The session appears on this teacher's schedule."
                >
                  <Combobox
                    id="admin-meeting-teacher"
                    value={teacherId || null}
                    onChange={(v) => {
                      form.setValue('teacher_id', v, { shouldValidate: true })
                      form.setValue('class_id', '')
                      form.setValue('subject_id', '')
                    }}
                    placeholder="Select a teacher"
                    options={teacherOptions}
                  />
                </Field>

                <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                  <Field
                    id="admin-meeting-class"
                    label="Class"
                    required
                    error={form.formState.errors.class_id?.message}
                  >
                    <Combobox
                      id="admin-meeting-class"
                      value={classId || null}
                      onChange={(v) => {
                        form.setValue('class_id', v, { shouldValidate: true })
                        form.setValue('subject_id', '')
                      }}
                      disabled={!teacherId}
                      placeholder={teacherId ? 'Select a class' : 'Choose a teacher first'}
                      options={classOptions.map((c) => ({
                        value: String(c.id),
                        label: c.name,
                        hint: c.code,
                      }))}
                    />
                  </Field>

                  <Field
                    id="admin-meeting-subject"
                    label="Subject"
                    required
                    error={form.formState.errors.subject_id?.message}
                  >
                    <Combobox
                      id="admin-meeting-subject"
                      value={form.watch('subject_id') || null}
                      onChange={(v) => form.setValue('subject_id', v, { shouldValidate: true })}
                      disabled={!classId}
                      placeholder={classId ? 'Select a subject' : 'Choose a class first'}
                      options={subjectOptions.map((s) => ({
                        value: String(s.id),
                        label: s.name,
                        hint: s.code,
                      }))}
                    />
                  </Field>
                </div>

                {teacherId && classOptions.length === 0 && (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                    This teacher has no class assignments yet. Add one under{' '}
                    <Link to="/admin/subjects" className="font-medium text-primary hover:underline">
                      Subjects &amp; Teachers
                    </Link>
                    .
                  </p>
                )}
              </>
            )}

            <Field id="admin-meeting-title" label="Title" required error={form.formState.errors.title?.message}>
              <Input
                id="admin-meeting-title"
                placeholder="Live lecture: graph algorithms"
                {...form.register('title')}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Field
                id="admin-meeting-time"
                label="Scheduled for"
                required
                error={form.formState.errors.scheduled_time?.message}
                hint="Shown to students in their own timezone."
              >
                <DateTimePicker
                  id="admin-meeting-time"
                  value={form.watch('scheduled_time') || null}
                  onChange={(v) => form.setValue('scheduled_time', v ?? '', { shouldValidate: true })}
                />
              </Field>

              <Field
                id="admin-meeting-duration"
                label="Duration"
                error={form.formState.errors.duration_minutes?.message}
                hint="Minutes."
              >
                <Input
                  id="admin-meeting-duration"
                  type="number"
                  min={5}
                  max={600}
                  step={5}
                  className="sm:w-28"
                  {...form.register('duration_minutes')}
                />
              </Field>
            </div>

            {!editing && roomMode && (
              <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/8 p-3.5 text-sm">
                <Video className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="font-medium">This period uses the class’s shared room</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selectedClass?.room_link
                      ? `${selectedClass.name} already has its room; the session simply happens in it.`
                      : 'The room is created the moment this is scheduled, and every later period of the class uses it too.'}{' '}
                    Rooms are managed under{' '}
                    <Link to="/admin/classes" className="font-medium text-primary hover:underline">
                      Classes
                    </Link>
                    . Paste a link below only to hold this one session somewhere else.
                  </p>
                </div>
              </div>
            )}

            {!editing && !roomMode && (
              <div className="space-y-3 rounded-lg border border-border bg-surface p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <Video className="size-4 text-primary" />
                      Hold it in a class room in the LMS
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Students join from their schedule inside the LMS — no separate app or link.
                    </p>
                  </div>
                  <Switch
                    checked={autoCreateMeet}
                    onCheckedChange={(v) => form.setValue('auto_create_meet', v)}
                    aria-label="Hold it in a class room in the LMS"
                  />
                </div>

                {/*
                  Recording only works in a room the LMS runs: a pasted link
                  belongs to a call we cannot record.
                */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <Disc className="size-4 text-danger" />
                      Record this class automatically
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Recording starts when the teacher joins the class in the LMS. Shortly after the
                      class ends the video is saved to school storage and shared with the enrolled
                      students.
                    </p>
                  </div>
                  <Switch
                    checked={form.watch('auto_record')}
                    onCheckedChange={(v) => form.setValue('auto_record', v)}
                    disabled={!meetGenerationActive}
                    aria-label="Record this class automatically"
                  />
                </div>

                {meetGenerationActive ? (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                    If the class room cannot be created the meeting is still saved, and the reason is
                    shown on the card. You can retry it from there once{' '}
                    <Link
                      to="/admin/integrations"
                      className="font-medium text-primary hover:underline"
                    >
                      Integrations
                    </Link>{' '}
                    reports live classes as healthy.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {manualLink
                      ? 'A meeting link is set below, so no class room will be created.'
                      : 'No class room will be created — add a link manually below.'}
                  </p>
                )}
              </div>
            )}

            <Field
              id="admin-meeting-link"
              label="Meeting link"
              error={form.formState.errors.meeting_link?.message}
              hint={
                roomMode && !editing
                  ? 'Leave empty to use the class room. Anything entered here is used instead, for this session only.'
                  : meetGenerationActive
                    ? 'Leave empty to use a class room in the LMS. Anything entered here is used instead.'
                    : 'A Zoom, Teams or other meeting URL.'
              }
            >
              <Input
                id="admin-meeting-link"
                placeholder="https://zoom.us/j/1234567890"
                {...form.register('meeting_link')}
              />
            </Field>
      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={form.formState.isSubmitting}>
          {editing ? 'Save changes' : 'Schedule meeting'}
        </Button>
      </div>
    </form>
  )
}

// ==================================================================== list

type Tab = 'live' | 'upcoming' | 'past' | 'recordings'

/** "Today", "Tomorrow", "Yesterday", or the date. */
function dayLabel(date: Date, now: Date) {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((day(date) - day(now)) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return formatDate(date, 'EEE d MMM')
}

function noWorkingRoom(m: LiveMeetingOut) {
  return !m.meeting_link || hasRetiredMeetLink(m)
}

function SessionList({
  meetings,
  now,
  value,
  onChange,
  userDir,
}: {
  meetings: LiveMeetingOut[]
  now: Date
  value: number | null
  onChange: (id: number) => void
  userDir: Map<number, UserOut>
}) {
  const groups: { label: string; items: LiveMeetingOut[] }[] = []
  for (const m of meetings) {
    const label = dayLabel(parseApiDateTime(m.scheduled_time) ?? new Date(m.scheduled_time), now)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(m)
    else groups.push({ label, items: [m] })
  }

  return (
    <div className="max-h-80 overflow-y-auto lg:h-full lg:max-h-none">
      {groups.map((g) => (
        <section key={g.label}>
          <h3 className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-muted/80 py-1.5 pl-4 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur sm:pl-6 lg:pl-8">
            {g.label}
            <span className="tabular-nums">{g.items.length}</span>
          </h3>
          <ul className="divide-y divide-border">
            {g.items.map((m) => {
              const active = value === m.id
              const phase = meetingPhase(m.scheduled_time, now)
              const broken = phase !== 'past' && noWorkingRoom(m)
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onChange(m.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'relative flex w-full items-start gap-3 py-2.5 pl-4 pr-4 text-left transition-colors sm:pl-6 lg:pl-8',
                      active ? 'bg-primary/5' : 'hover:bg-muted/40',
                    )}
                  >
                    {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}
                    <span className="w-11 shrink-0 pt-px text-xs tabular-nums text-muted-foreground">{formatSchoolTime(m.scheduled_time)}</span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm font-medium', active ? 'text-primary' : 'text-foreground')}>{m.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {classNameOf(m)} · {subjectName(m)} · {tidy(teacherName(m, userDir))}
                      </span>
                    </span>
                    {phase === 'live' ? (
                      <span className="mt-1.5 size-2 shrink-0 animate-pulse rounded-full bg-danger" aria-label="Live" />
                    ) : broken ? (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-warning" aria-label="No working room" />
                    ) : m.recording_url ? (
                      <Film className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="Recorded" />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

// ================================================================== detail

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-2.5 first:pl-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-foreground">{children}</p>
    </div>
  )
}

function SessionDetail({
  meeting,
  now,
  userDir,
  onEdit,
  onCancel,
}: {
  meeting: LiveMeetingOut
  now: Date
  userDir: Map<number, UserOut>
  onEdit: () => void
  onCancel: () => void
}) {
  const regenerate = useRegenerateMeetingLink()
  const collectRecording = useAdminSyncRecording()
  const { copied, copy } = useCopyToClipboard()
  const phase = meetingPhase(meeting.scheduled_time, now)
  const retired = hasRetiredMeetLink(meeting)
  const working = !!meeting.meeting_link && !retired
  const recording = resolveFileUrl(meeting.recording_url)
  const extraSegments = (meeting.recording_files ?? []).slice(1)
  const start = parseApiDateTime(meeting.scheduled_time) ?? new Date(meeting.scheduled_time)
  const minutes = meeting.duration_minutes ?? 60
  const end = new Date(start.getTime() + minutes * 60_000)

  return (
    <div className="space-y-5">
      {/* ----------------------------------------------------------- head */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <MeetingPhaseBadge phase={phase} />
            {phase === 'upcoming' && <span className="text-xs text-muted-foreground">in {formatCountdown(meeting.scheduled_time, now)}</span>}
            {meeting.meet_status === 'CLASS_ROOM' && <MeetStatusBadge status="CLASS_ROOM" />}
          </div>
          <h2 className="mt-1 text-2xl font-medium tracking-tight text-foreground">{meeting.title}</h2>
          <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
            {formatDate(start, 'EEEE d MMMM')} · {formatSchoolTime(start)}–{formatSchoolTime(end)} · {minutes} min
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil />
            Edit
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Cancel this meeting" onClick={onCancel}>
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 border-y border-border sm:grid-cols-4 sm:divide-x sm:divide-border">
        <Fact label="Class">{classNameOf(meeting)}</Fact>
        <Fact label="Subject">{subjectName(meeting)}</Fact>
        <Fact label="Teacher">{tidy(teacherName(meeting, userDir))}</Fact>
        <Fact label="Room">
          {working ? (
            <span className="text-success">{meeting.meet_status === 'CLASS_ROOM' ? 'Class room' : 'Ready'}</span>
          ) : (
            <span className="text-warning">{retired ? 'Old Meet link' : 'No room'}</span>
          )}
        </Fact>
      </div>

      {/* --------------------------------------------------- the room */}
      {phase !== 'past' && (
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Class room</h3>
          {working ? (
            <div className="flex flex-wrap items-center gap-2">
              <JoinClassButton meetingId={meeting.id} />
              {/* Students wait at "waiting for the teacher" until the class is
                  opened, unless auto-start is on; the control hides itself then. */}
              <TeacherClassControls meetingId={meeting.id} />
              <Button variant="ghost" size="sm" onClick={() => void copy(shareableLink(meeting.meeting_link))}>
                {copied ? <Check className="text-success" /> : <Copy />}
                Copy link
              </Button>
            </div>
          ) : (
            <div className="space-y-2 border-l-2 border-warning bg-warning/5 px-3 py-2.5 text-sm">
              <p className="text-foreground">
                {meeting.meet_error ??
                  (retired
                    ? 'This session still points at a Google Meet room, which no longer works.'
                    : meeting.meet_status === 'SKIPPED'
                      ? 'No class room was requested when this was scheduled.'
                      : 'The class room could not be created when this was scheduled.')}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" loading={regenerate.isPending} onClick={() => regenerate.mutate(meeting.id)}>
                  <RefreshCw />
                  Give it a working room
                </Button>
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <LinkIcon />
                  Paste a link
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ---------------------------------------------------- recording */}
      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recording</h3>
        <div className="flex flex-wrap items-center gap-2">
          {meeting.recording_status && <RecordingStatusBadge status={meeting.recording_status} />}
          {recording && meeting.recording_published != null && (
            <span className={cn('text-xs font-medium', meeting.recording_published ? 'text-success' : 'text-warning')}>
              {meeting.recording_published ? 'Published to students' : 'Not published yet'}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{recordingHint(meeting)}</p>
        <div className="flex flex-wrap gap-2">
          {recording && (
            <Button asChild variant="outline" size="sm">
              <a href={recording} target="_blank" rel="noopener noreferrer">
                <Film />
                {extraSegments.length > 0 ? 'Part 1' : 'Watch recording'}
                <ExternalLink className="size-3" />
              </a>
            </Button>
          )}
          {/* A class recorded in more than one sitting keeps its later parts here. */}
          {extraSegments.map((file, index) => (
            <Button key={file.drive_file_id ?? file.file_url ?? file.web_view_link ?? index} asChild variant="outline" size="sm">
              <a href={resolveFileUrl(file.file_url ?? file.web_view_link) ?? undefined} target="_blank" rel="noopener noreferrer">
                <Film />
                Part {index + 2}
                <ExternalLink className="size-3" />
              </a>
            </Button>
          ))}
          {canCollectRecording(meeting, phase) && (
            <Button variant="outline" size="sm" loading={collectRecording.isPending} onClick={() => collectRecording.mutate(meeting.id)}>
              <Download />
              Fetch recording now
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}

// ==================================================================== page

export default function AdminMeetingsPage() {
  const meetingsQuery = useAdminMeetings()
  const usersQuery = useUsers()
  const deleteMeeting = useAdminDeleteMeeting()
  const now = useNow(30_000)

  const [tab, setTab] = React.useState<Tab | null>(null)
  const [teacherFilter, setTeacherFilter] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [form, setForm] = React.useState<{ editing: LiveMeetingOut | null } | null>(null)
  const [cancelling, setCancelling] = React.useState<LiveMeetingOut | null>(null)

  const userDir = React.useMemo(() => buildDirectory(usersQuery.data ?? []), [usersQuery.data])
  const all = React.useMemo(() => meetingsQuery.data ?? [], [meetingsQuery.data])
  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase()
    return all.filter(
      (m) =>
        (!teacherFilter || String(m.teacher_id) === teacherFilter) &&
        (!needle || `${m.title} ${classNameOf(m)} ${subjectName(m)} ${teacherName(m, userDir)}`.toLowerCase().includes(needle)),
    )
  }, [all, teacherFilter, search, userDir])
  const groups = React.useMemo(() => splitMeetings(filtered, now), [filtered, now])
  const allGroups = React.useMemo(() => splitMeetings(all, now), [all, now])

  // Open on Live when something is on, otherwise Upcoming.
  const activeTab: Tab = tab ?? (allGroups.live.length > 0 ? 'live' : 'upcoming')
  const list = groups[activeTab]
  const selected = list.find((m) => m.id === selectedId) ?? list[0] ?? null

  const teacherOptions = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const m of all) map.set(String(m.teacher_id), tidy(teacherName(m, userDir)))
    return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [all, userDir])

  /**
   * Upcoming meetings with no working room — saved without a link, or still
   * carrying an old Google Meet link. The queue the repair action exists for.
   */
  const needingLink = allGroups.live.concat(allGroups.upcoming).filter(noWorkingRoom)
  const todayCount = all.filter((m) => dayLabel(parseApiDateTime(m.scheduled_time) ?? new Date(m.scheduled_time), now) === 'Today').length
  const weekAhead = allGroups.upcoming.filter((m) => (parseApiDateTime(m.scheduled_time)?.getTime() ?? 0) - now.getTime() < 7 * 86_400_000).length

  const switchTab = (t: Tab) => {
    setTab(t)
    setSelectedId(null)
    setForm(null)
  }

  return (
    <div className="space-y-6">
      <WorkspaceHeader
        title="Virtual Meetings"
        description="Every live session across all teachers. Schedule on a teacher's behalf, or repair one that lost its room"
        icon={Video}
        actions={
          <Button size="sm" icon={<Plus />} onClick={() => setForm({ editing: null })}>
            Schedule meeting
          </Button>
        }
        tabs={
          <TabStrip
            label="Meetings"
            idPrefix="meetings-tab"
            value={activeTab}
            onChange={switchTab}
            tabs={[
              { key: 'live', label: 'Live', count: groups.live.length, tone: 'danger' },
              { key: 'upcoming', label: 'Upcoming', count: groups.upcoming.length, tone: 'info' },
              { key: 'past', label: 'Past', count: groups.past.length },
              { key: 'recordings', label: 'Recordings', count: groups.recordings.length, tone: 'success' },
            ]}
          />
        }
      />

      <div className="!mt-0">
        <Figures>
          <Figure label="Live now" value={meetingsQuery.data ? String(allGroups.live.length) : '—'} context="sessions" tone="danger" />
          <Figure label="Today" value={meetingsQuery.data ? String(todayCount) : '—'} context="sessions" tone="primary" />
          <Figure label="Next 7 days" value={meetingsQuery.data ? String(weekAhead) : '—'} context="scheduled" tone="info" />
          <Figure label="No working room" value={meetingsQuery.data ? String(needingLink.length) : '—'} context="to fix" alert={needingLink.length > 0} tone="warning" />
        </Figures>

        {/* ------------------------------------------------------ toolbar */}
        <Band className="border-b border-border">
          <div className="flex flex-wrap items-center gap-3 py-2.5">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a session, class or teacher"
                aria-label="Find a session"
                className="h-8 py-1 pl-8 text-sm"
              />
            </div>
            {teacherOptions.length > 1 && (
              <Combobox
                value={teacherFilter ?? 'all'}
                onChange={(v) => setTeacherFilter(v === 'all' ? null : v)}
                options={[{ value: 'all', label: 'All teachers' }, ...teacherOptions]}
                searchPlaceholder="Search teachers"
                className="h-8 w-52 text-sm"
              />
            )}
            {needingLink.length > 0 && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-warning">
                <TriangleAlert className="size-3.5" />
                {countLabel(needingLink.length, 'session')} without a working room, marked with an amber dot
              </span>
            )}
          </div>
        </Band>

        <Band className="border-b border-border">
          {meetingsQuery.isPending ? (
            <div className="grid gap-4 py-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
              <Skeleton className="h-72 w-full" />
              <Skeleton className="h-72 w-full" />
            </div>
          ) : meetingsQuery.isError ? (
            <div className="py-6">
              <ErrorState error={meetingsQuery.error} onRetry={() => meetingsQuery.refetch()} />
            </div>
          ) : (
            <div className="grid lg:h-[calc(100vh-23rem)] lg:min-h-[26rem] lg:grid-cols-[22rem_minmax(0,1fr)] lg:divide-x lg:divide-border">
              <div className="-mx-4 border-b border-border sm:-mx-6 lg:mx-0 lg:-ml-8 lg:min-h-0 lg:border-b-0">
                {list.length === 0 ? (
                  <p className="px-6 py-10 text-center text-sm text-muted-foreground lg:pl-8">
                    {activeTab === 'live'
                      ? 'Nothing live right now. A meeting shows here from 10 minutes before it starts'
                      : activeTab === 'upcoming'
                        ? 'No upcoming meetings'
                        : activeTab === 'past'
                          ? 'No past meetings'
                          : 'No recordings yet'}
                  </p>
                ) : (
                  <SessionList
                    meetings={list}
                    now={now}
                    value={form ? null : (selected?.id ?? null)}
                    onChange={(id) => {
                      setSelectedId(id)
                      setForm(null)
                    }}
                    userDir={userDir}
                  />
                )}
              </div>
              <section className="min-w-0 py-5 lg:min-h-0 lg:overflow-y-auto lg:pl-8 lg:pr-1">
                {form ? (
                  <AdminMeetingForm key={form.editing?.id ?? 'new'} editing={form.editing} onClose={() => setForm(null)} />
                ) : selected ? (
                  <SessionDetail
                    key={selected.id}
                    meeting={selected}
                    now={now}
                    userDir={userDir}
                    onEdit={() => setForm({ editing: selected })}
                    onCancel={() => setCancelling(selected)}
                  />
                ) : (
                  <div className="py-12 text-center">
                    <p className="text-sm text-muted-foreground">Nothing to show here</p>
                    <Button size="sm" className="mt-4" icon={<Plus />} onClick={() => setForm({ editing: null })}>
                      Schedule meeting
                    </Button>
                  </div>
                )}
              </section>
            </div>
          )}
        </Band>
      </div>

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(v) => !v && setCancelling(null)}
        title="Cancel this meeting?"
        description={cancelling ? `“${cancelling.title}” will be removed. Students will no longer see it in their schedule.` : undefined}
        confirmLabel="Cancel meeting"
        cancelLabel="Keep it"
        destructive
        loading={deleteMeeting.isPending}
        onConfirm={() => {
          if (!cancelling) return
          deleteMeeting.mutate(cancelling.id, { onSettled: () => setCancelling(null) })
        }}
      />
    </div>
  )
}

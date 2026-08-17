import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Radio, TriangleAlert, Video } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'

import type { LiveMeetingOut } from '@/api/types'
import {
  useAdminCreateMeeting,
  useAdminDeleteMeeting,
  useAdminMeetings,
  useAdminUpdateMeeting,
  useClasses,
  useMappings,
  useRegenerateMeetingLink,
  useSubjects,
  useTeachingStaff,
  useUsers,
} from '@/queries/admin.queries'
import { splitMeetings } from '@/lib/derive'
import { useNow } from '@/lib/hooks'
import { buildDirectory, teacherName } from '@/lib/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { DateTimePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field } from '@/components/forms/field'
import { PageHeader } from '@/components/layout/page-header'
import { MeetingCard } from '@/pages/teacher/meetings'

const schema = z.object({
  teacher_id: z.string().min(1, 'Choose a teacher'),
  class_id: z.string().min(1, 'Choose a class'),
  subject_id: z.string().min(1, 'Choose a subject'),
  title: z.string().min(2, 'Enter a title').max(200),
  scheduled_time: z.string().min(1, 'Choose a date and time'),
  meeting_link: z.string().url('Enter a valid URL').or(z.literal('')).optional(),
  auto_create_meet: z.boolean(),
  invite_students: z.boolean(),
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
  duration_minutes: 60,
}

/**
 * Schedules a session on any teacher's behalf, or edits an existing one.
 *
 * The teacher choice is not merely attribution: the Calendar event is created
 * on THAT teacher's calendar. Leaving it unset would schedule under the acting
 * admin, whose account is usually not delegated — which is the most common way
 * to end up with a meeting that has no Meet link — so the field is required
 * here even though the API treats it as optional.
 */
function AdminMeetingDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: LiveMeetingOut | null
}) {
  const teachersQuery = useTeachingStaff()
  const classesQuery = useClasses()
  const subjectsQuery = useSubjects()
  const mappingsQuery = useMappings()
  const createMeeting = useAdminCreateMeeting()
  const updateMeeting = useAdminUpdateMeeting()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_VALUES,
  })

  React.useEffect(() => {
    if (!open) return
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
          }
        : DEFAULT_VALUES,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  const teacherId = form.watch('teacher_id')
  const classId = form.watch('class_id')
  const autoCreateMeet = form.watch('auto_create_meet')
  const manualLink = (form.watch('meeting_link') ?? '').trim()
  const meetGenerationActive = !editing && autoCreateMeet && !manualLink

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
          onOpenChange(false)
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
          duration_minutes: values.duration_minutes,
        })
      }
      onOpenChange(false)
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit meeting' : 'Schedule a meeting'}</DialogTitle>
          <DialogDescription>
            {editing
              ? editing.google_event_id
                ? 'Changing the title or time updates the Google Calendar event on the owning teacher’s calendar, so every invited student sees it.'
                : 'This meeting has no Calendar event behind it, so changes stay inside the LMS.'
              : 'The session is filed under the chosen teacher, and the Calendar event is created on their calendar.'}
          </DialogDescription>
        </DialogHeader>
        <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-4">
            {form.formState.errors.root && (
              <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
                {form.formState.errors.root.message}
              </p>
            )}

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
                  hint="The Calendar event is created on this teacher's calendar."
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

                <div className="grid gap-4 sm:grid-cols-2">
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
                    <Link to="/admin/mappings" className="font-medium text-primary hover:underline">
                      Teacher Mappings
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

            {!editing && (
              <div className="space-y-3 rounded-lg border border-border bg-surface p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <Video className="size-4 text-primary" />
                      Create a Google Meet link
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Adds a real Calendar event on the teacher’s account with a Meet link attached.
                    </p>
                  </div>
                  <Switch
                    checked={autoCreateMeet}
                    onCheckedChange={(v) => form.setValue('auto_create_meet', v)}
                    aria-label="Create a Google Meet link"
                  />
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Invite enrolled students</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Each active student in the class is added as an attendee and receives a
                      calendar invitation.
                    </p>
                  </div>
                  <Switch
                    checked={form.watch('invite_students')}
                    onCheckedChange={(v) => form.setValue('invite_students', v)}
                    disabled={!meetGenerationActive}
                    aria-label="Invite enrolled students"
                  />
                </div>

                {meetGenerationActive ? (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                    If Meet generation fails the meeting is still saved, and the reason is shown on
                    the card. You can retry it from there once{' '}
                    <Link
                      to="/admin/integrations"
                      className="font-medium text-primary hover:underline"
                    >
                      Integrations
                    </Link>{' '}
                    reports Meet as healthy.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {manualLink
                      ? 'A meeting link is set below, so no Calendar event will be created.'
                      : 'No Calendar event will be created — add a link manually below.'}
                  </p>
                )}
              </div>
            )}

            <Field
              id="admin-meeting-link"
              label="Meeting link"
              error={form.formState.errors.meeting_link?.message}
              hint={
                meetGenerationActive
                  ? 'Leave empty to let Google Meet generate one. Anything entered here is used instead.'
                  : 'Google Meet, Zoom or Teams URL.'
              }
            >
              <Input
                id="admin-meeting-link"
                placeholder="https://meet.google.com/abc-defg-hij"
                {...form.register('meeting_link')}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
              {editing ? 'Save changes' : 'Schedule meeting'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminMeetingsPage() {
  const meetingsQuery = useAdminMeetings()
  const usersQuery = useUsers()
  const deleteMeeting = useAdminDeleteMeeting()
  const regenerate = useRegenerateMeetingLink()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<LiveMeetingOut | null>(null)
  const [cancelling, setCancelling] = React.useState<LiveMeetingOut | null>(null)
  const [teacherFilter, setTeacherFilter] = React.useState<string | null>(null)
  const now = useNow(30_000)

  const userDir = React.useMemo(() => buildDirectory(usersQuery.data ?? []), [usersQuery.data])

  const meetings = React.useMemo(() => {
    const all = meetingsQuery.data ?? []
    return teacherFilter ? all.filter((m) => String(m.teacher_id) === teacherFilter) : all
  }, [meetingsQuery.data, teacherFilter])

  const teacherOptions = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const m of meetingsQuery.data ?? []) {
      map.set(String(m.teacher_id), teacherName(m, userDir))
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [meetingsQuery.data, userDir])

  const groups = React.useMemo(() => splitMeetings(meetings, now), [meetings, now])

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (meeting: LiveMeetingOut) => {
    setEditing(meeting)
    setDialogOpen(true)
  }

  /** Meetings saved without a link — the queue the retry action exists for. */
  const needingLink = React.useMemo(
    () =>
      (meetingsQuery.data ?? []).filter(
        (m) => !m.meeting_link && new Date(m.scheduled_time).getTime() > now.getTime(),
      ),
    [meetingsQuery.data, now],
  )

  const renderList = (list: LiveMeetingOut[], emptyTitle: string, emptyBody: string) => {
    if (meetingsQuery.isPending) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )
    }
    if (meetingsQuery.isError) {
      return <ErrorState error={meetingsQuery.error} onRetry={() => meetingsQuery.refetch()} />
    }
    if (list.length === 0) {
      return <EmptyState icon={<Video />} title={emptyTitle} description={emptyBody} />
    }
    return (
      <div className="space-y-3">
        {list.map((meeting) => (
          <MeetingCard
            key={meeting.id}
            meeting={meeting}
            now={now}
            meta={
              <Badge tone="info" size="sm">
                {teacherName(meeting, userDir)}
              </Badge>
            }
            onEdit={openEdit}
            onDelete={setCancelling}
            onRegenerate={(m) => regenerate.mutate(m.id)}
            regenerating={regenerate.isPending && regenerate.variables === meeting.id}
          />
        ))}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Every live session across all teachers. Schedule on a teacher's behalf, or repair one that lost its link."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={openCreate}>
            Schedule meeting
          </Button>
        }
      >
        {teacherOptions.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTeacherFilter(null)}
              className={
                teacherFilter === null
                  ? 'rounded-full border border-primary bg-primary/12 px-3 py-1 text-xs font-medium text-primary'
                  : 'rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40'
              }
            >
              All teachers
            </button>
            {teacherOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTeacherFilter(option.value)}
                className={
                  teacherFilter === option.value
                    ? 'rounded-full border border-primary bg-primary/12 px-3 py-1 text-xs font-medium text-primary'
                    : 'rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40'
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </PageHeader>

      {/*
        Surfaced above the tabs because it is the one thing on this page an
        admin is expected to act on, and it would otherwise be spread across
        the Live and Upcoming lists.
      */}
      {needingLink.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/8 p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium">
              {needingLink.length} upcoming{' '}
              {needingLink.length === 1 ? 'session has' : 'sessions have'} no meeting link
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Use “Retry Meet link” on the card once{' '}
              <Link to="/admin/integrations" className="font-medium text-primary hover:underline">
                Integrations
              </Link>{' '}
              reports Google Meet as healthy, or edit the meeting to paste a link in by hand.
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue={groups.live.length > 0 ? 'live' : 'upcoming'}>
        <TabsList>
          <TabsTrigger value="live">
            {groups.live.length > 0 && <Radio className="text-danger" />}
            Live ({groups.live.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({groups.upcoming.length})</TabsTrigger>
          <TabsTrigger value="past">Past ({groups.past.length})</TabsTrigger>
          <TabsTrigger value="recordings">Recordings ({groups.recordings.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="live">
          {renderList(groups.live, 'Nothing live right now', 'A meeting shows here from 10 minutes before it starts.')}
        </TabsContent>
        <TabsContent value="upcoming">
          {renderList(groups.upcoming, 'No upcoming meetings', 'Schedule a live class on a teacher’s behalf and it will appear here.')}
        </TabsContent>
        <TabsContent value="past">
          {renderList(groups.past, 'No past meetings', 'Meetings move here once they have finished.')}
        </TabsContent>
        <TabsContent value="recordings">
          {renderList(groups.recordings, 'No recordings yet', 'Attach a recording to a meeting to make it available to students.')}
        </TabsContent>
      </Tabs>

      <AdminMeetingDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(v) => !v && setCancelling(null)}
        title="Cancel this meeting?"
        description={
          cancelling
            ? cancelling.google_event_id
              ? `“${cancelling.title}” will be removed, and its Google Calendar event deleted — every invited student is notified.`
              : `“${cancelling.title}” will be removed. Students will no longer see it in their schedule.`
            : undefined
        }
        confirmLabel="Cancel meeting"
        cancelLabel="Keep it"
        destructive
        loading={deleteMeeting.isPending}
        onConfirm={() => {
          if (!cancelling) return
          deleteMeeting.mutate(cancelling.id, { onSettled: () => setCancelling(null) })
        }}
      />
    </>
  )
}

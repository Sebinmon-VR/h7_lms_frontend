import { zodResolver } from '@hookform/resolvers/zod'
import {
  CalendarCheck,
  Check,
  Copy,
  ExternalLink,
  Film,
  LinkIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Upload,
  Video,
} from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import type { LiveMeetingOut } from '@/api/types'
import { storageApi } from '@/api/storage.api'
import {
  useCreateMeeting,
  useDeleteMeeting,
  useMyClasses,
  useTeacherMeetings,
  useUpdateMeeting,
} from '@/queries/teacher.queries'
import { splitMeetings } from '@/lib/derive'
import { formatCountdown, formatDateTime, meetingPhase } from '@/lib/datetime'
import { MAX_UPLOAD_BYTES, formatFileSize, resolveFileUrl } from '@/lib/files'
import { subjectName, className as classNameOf } from '@/lib/select'
import { useCopyToClipboard, useNow } from '@/lib/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { DateTimePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { ProgressBar } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MeetStatusBadge, MeetingPhaseBadge } from '@/components/domain/badges'
import { FiledBy } from '@/components/domain/filed-by'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field } from '@/components/forms/field'
import { PageHeader } from '@/components/layout/page-header'
import { useClassSubjectSelection } from './class-subject-picker'
import { AdminTeacherNotice, useIsAdminViewingTeacher } from './teacher-guard'

const schema = z.object({
  class_id: z.string().min(1, 'Choose a class'),
  subject_id: z.string().min(1, 'Choose a subject'),
  title: z.string().min(2, 'Enter a title').max(200),
  scheduled_time: z.string().min(1, 'Choose a date and time'),
  meeting_link: z.string().url('Enter a valid URL').or(z.literal('')).optional(),
  recording_url: z.string().url('Enter a valid URL').or(z.literal('')).optional(),
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
  class_id: '',
  subject_id: '',
  title: '',
  scheduled_time: '',
  meeting_link: '',
  recording_url: '',
  auto_create_meet: true,
  invite_students: true,
  duration_minutes: 60,
}

/**
 * Schedules a new meeting, or edits an existing one when `editing` is set.
 *
 * The two modes differ in what the API allows. On create the backend can build
 * a real Google Calendar event with a Meet link and invite the class; on
 * update it can only change the fields below, and the class and subject are
 * fixed because `LiveMeetingUpdate` does not accept them.
 */
function MeetingFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: LiveMeetingOut | null
}) {
  const mappingsQuery = useMyClasses()
  const createMeeting = useCreateMeeting()
  const updateMeeting = useUpdateMeeting()
  const selection = useClassSubjectSelection(mappingsQuery.data)

  const [uploading, setUploading] = React.useState(false)
  const [uploadPercent, setUploadPercent] = React.useState(0)
  const [uploadError, setUploadError] = React.useState<string | null>(null)

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
            class_id: String(editing.class_id),
            subject_id: String(editing.subject_id),
            title: editing.title,
            scheduled_time: editing.scheduled_time,
            meeting_link: editing.meeting_link ?? '',
            recording_url: editing.recording_url ?? '',
            duration_minutes: editing.duration_minutes ?? 60,
            // Generation already happened (or did not) at create time.
            auto_create_meet: false,
            invite_students: false,
          }
        : {
            ...DEFAULT_VALUES,
            class_id: selection.classId ? String(selection.classId) : '',
            subject_id: selection.subjectId ? String(selection.subjectId) : '',
          },
    )
    setUploadPercent(0)
    setUploadError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  const classId = form.watch('class_id')
  const autoCreateMeet = form.watch('auto_create_meet')
  const manualLink = (form.watch('meeting_link') ?? '').trim()

  /**
   * A manually supplied link makes the backend skip Meet generation entirely,
   * so the two controls are mutually exclusive rather than merely related.
   */
  const meetGenerationActive = !editing && autoCreateMeet && !manualLink

  const subjects = React.useMemo(() => {
    const map = new Map<number, { id: number; name: string; code: string }>()
    for (const m of mappingsQuery.data ?? []) {
      if (classId && m.class_room.id !== Number(classId)) continue
      map.set(m.subject.id, m.subject)
    }
    return [...map.values()]
  }, [mappingsQuery.data, classId])

  /**
   * `/storage/upload` creates no record of its own, so its natural use is
   * hosting a recording and feeding the returned URL into the meeting.
   */
  const uploadRecording = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`That file is ${formatFileSize(file.size)}. The limit is ${formatFileSize(MAX_UPLOAD_BYTES)}.`)
      return
    }
    setUploadError(null)
    setUploading(true)
    setUploadPercent(0)
    try {
      const result = await storageApi.upload(file, `class_${classId || 'general'}/recordings`, setUploadPercent)
      form.setValue('recording_url', resolveFileUrl(result.access_url) ?? result.access_url, {
        shouldValidate: true,
      })
    } catch (error) {
      setUploadError((error as { message?: string })?.message ?? 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const onSubmit = async (values: FormValues) => {
    const link = values.meeting_link?.trim() ?? ''
    const recording = values.recording_url?.trim() ?? ''

    try {
      if (editing) {
        // Only changed fields — an empty update body is a 400.
        const patch = {
          ...(values.title !== editing.title && { title: values.title }),
          ...(values.scheduled_time !== editing.scheduled_time && {
            scheduled_time: values.scheduled_time,
          }),
          ...(link !== (editing.meeting_link ?? '') && { meeting_link: link }),
          ...(recording !== (editing.recording_url ?? '') && { recording_url: recording }),
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
          class_id: Number(values.class_id),
          subject_id: Number(values.subject_id),
          title: values.title,
          scheduled_time: values.scheduled_time,
          meeting_link: link || null,
          recording_url: recording || null,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit meeting' : 'Schedule a meeting'}</DialogTitle>
          <DialogDescription>
            {editing
              ? editing.google_event_id
                ? 'Changing the title or time updates the Google Calendar event, so every invited student sees it on their own calendar.'
                : 'This meeting has no Calendar event behind it, so changes stay inside the LMS.'
              : 'A Google Meet link and calendar invitations can be created automatically for the whole class.'}
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
              // Class and subject are immutable on update, so show them as
              // context rather than as controls that would silently do nothing.
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5">
                <span className="text-xs text-muted-foreground">This meeting is for</span>
                <Badge tone="accent" size="sm">
                  {subjectName(editing)}
                </Badge>
                <Badge tone="outline" size="sm">
                  {classNameOf(editing)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  — cancel and re-schedule to move it.
                </span>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="meeting-class" label="Class" required error={form.formState.errors.class_id?.message}>
                  <Combobox
                    id="meeting-class"
                    value={form.watch('class_id') || null}
                    onChange={(v) => {
                      form.setValue('class_id', v, { shouldValidate: true })
                      form.setValue('subject_id', '')
                    }}
                    placeholder="Select a class"
                    options={selection.classes.map((c) => ({ value: String(c.id), label: c.name, hint: c.code }))}
                  />
                </Field>

                <Field id="meeting-subject" label="Subject" required error={form.formState.errors.subject_id?.message}>
                  <Combobox
                    id="meeting-subject"
                    value={form.watch('subject_id') || null}
                    onChange={(v) => form.setValue('subject_id', v, { shouldValidate: true })}
                    disabled={!classId}
                    placeholder={classId ? 'Select a subject' : 'Choose a class first'}
                    options={subjects.map((s) => ({ value: String(s.id), label: s.name, hint: s.code }))}
                  />
                </Field>
              </div>
            )}

            <Field id="meeting-title" label="Title" required error={form.formState.errors.title?.message}>
              <Input id="meeting-title" placeholder="Live lecture: graph algorithms" {...form.register('title')} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Field
                id="meeting-time"
                label="Scheduled for"
                required
                error={form.formState.errors.scheduled_time?.message}
                hint="Shown to students in their own timezone."
              >
                <DateTimePicker
                  id="meeting-time"
                  value={form.watch('scheduled_time') || null}
                  onChange={(v) => form.setValue('scheduled_time', v ?? '', { shouldValidate: true })}
                />
              </Field>

              <Field
                id="meeting-duration"
                label="Duration"
                error={form.formState.errors.duration_minutes?.message}
                hint="Minutes."
              >
                <Input
                  id="meeting-duration"
                  type="number"
                  min={5}
                  max={600}
                  step={5}
                  className="sm:w-28"
                  {...form.register('duration_minutes')}
                />
              </Field>
            </div>

            {/* ------------------------------------------- Meet generation */}
            {!editing && (
              <div className="space-y-3 rounded-lg border border-border bg-surface p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <Video className="size-4 text-primary" />
                      Create a Google Meet link
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Adds a real Calendar event on your account with a Meet link attached.
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
                      Each active student in the class is added as an attendee and receives a calendar
                      invitation.
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
                    If Google Meet is unavailable the meeting is still saved, just without a link. You
                    can paste one in later.
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
              id="meeting-link"
              label="Meeting link"
              error={form.formState.errors.meeting_link?.message}
              hint={
                meetGenerationActive
                  ? 'Leave empty to let Google Meet generate one. Anything entered here is used instead.'
                  : 'Google Meet, Zoom or Teams URL.'
              }
            >
              <Input id="meeting-link" placeholder="https://meet.google.com/abc-defg-hij" {...form.register('meeting_link')} />
            </Field>

            <Field
              id="meeting-recording"
              label="Recording"
              error={form.formState.errors.recording_url?.message}
              hint="Paste a link, or upload a file to host it on the server."
            >
              <div className="space-y-2">
                <Input id="meeting-recording" placeholder="https://…" {...form.register('recording_url')} />
                <div className="flex items-center gap-2">
                  <Button asChild variant="outline" size="sm" disabled={uploading}>
                    <label className="cursor-pointer">
                      <Upload className="size-4" />
                      {uploading ? 'Uploading…' : 'Upload a recording'}
                      <input
                        type="file"
                        className="sr-only"
                        accept="video/*,audio/*"
                        disabled={uploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) void uploadRecording(file)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Up to {formatFileSize(MAX_UPLOAD_BYTES)}
                  </span>
                </div>
                {uploading && <ProgressBar value={uploadPercent} size="sm" />}
                {uploadError && <p className="text-xs text-danger">{uploadError}</p>}
              </div>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={form.formState.isSubmitting} disabled={uploading}>
              {editing ? 'Save changes' : 'Schedule meeting'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Shared with the student and admin views, which pass different callbacks —
 * the action menu only renders for someone allowed to act on the meeting.
 *
 * `onRegenerate` is admin-only: retrying Meet generation is not something the
 * teacher endpoints expose.
 */
export function MeetingCard({
  meeting,
  now,
  meta,
  onEdit,
  onDelete,
  onRegenerate,
  regenerating,
}: {
  meeting: LiveMeetingOut
  now: Date
  /** Extra context line — the admin view uses it to name the owning teacher. */
  meta?: React.ReactNode
  onEdit?: (meeting: LiveMeetingOut) => void
  onDelete?: (meeting: LiveMeetingOut) => void
  onRegenerate?: (meeting: LiveMeetingOut) => void
  regenerating?: boolean
}) {
  const phase = meetingPhase(meeting.scheduled_time, now)
  const { copied, copy } = useCopyToClipboard()
  const recording = resolveFileUrl(meeting.recording_url)
  const showActions = !!onEdit || !!onDelete

  // Retrying is only meaningful while there is no link and the session has not
  // already happened — the backend 400s on a meeting that already has one.
  const canRegenerate = !!onRegenerate && !meeting.meeting_link && phase !== 'past'

  return (
    <Card className={phase === 'live' ? 'border-danger/40 shadow-glow' : undefined}>
      <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <MeetingPhaseBadge phase={phase} />
            {phase === 'upcoming' && (
              <span className="text-xs text-muted-foreground">
                in {formatCountdown(meeting.scheduled_time, now)}
              </span>
            )}
            {meeting.google_event_id && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge tone="info" size="sm">
                    <CalendarCheck />
                    Calendar
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Backed by a Google Calendar event. Editing or cancelling here updates every
                  invited student&rsquo;s calendar.
                </TooltipContent>
              </Tooltip>
            )}
            {/* A missing link is a normal outcome, not an error — say so
                plainly, and prefer the server's own reason when it recorded
                one. `meet_status` is null on meetings written before the field
                existed, which is why the old wording is still the fallback. */}
            {!meeting.meeting_link && phase !== 'past' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    {meeting.meet_status ? (
                      <MeetStatusBadge status={meeting.meet_status} />
                    ) : (
                      <Badge tone="warning" size="sm">
                        <TriangleAlert />
                        No link
                      </Badge>
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {meeting.meet_error ??
                    (meeting.meet_status === 'SKIPPED'
                      ? 'No Meet link was requested when this was scheduled. Edit the meeting to paste one in.'
                      : 'Google Meet could not generate a link when this was scheduled. Edit the meeting to paste one in.')}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className="mt-2 truncate text-base font-semibold">{meeting.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{formatDateTime(meeting.scheduled_time)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="accent" size="sm">
              {subjectName(meeting)}
            </Badge>
            <Badge tone="outline" size="sm">
              {classNameOf(meeting)}
            </Badge>
            <FiledBy teacherId={meeting.teacher_id} teacher={meeting.teacher} />
            {meta}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canRegenerate && (
            <Button
              variant="outline"
              size="sm"
              loading={regenerating}
              onClick={() => onRegenerate?.(meeting)}
            >
              <RefreshCw className="size-4" />
              Retry Meet link
            </Button>
          )}
          {!meeting.meeting_link && onEdit && phase !== 'past' && (
            <Button variant="outline" size="sm" onClick={() => onEdit(meeting)}>
              <LinkIcon className="size-4" />
              Add a link
            </Button>
          )}
          {meeting.meeting_link && (
            <>
              <Button asChild variant={phase === 'live' ? 'primary' : 'outline'} size="sm">
                <a href={meeting.meeting_link} target="_blank" rel="noopener noreferrer">
                  <Video className="size-4" />
                  {phase === 'live' ? 'Join now' : 'Open link'}
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Copy meeting link"
                onClick={() => void copy(meeting.meeting_link as string)}
              >
                {copied ? <Check className="text-success" /> : <Copy />}
              </Button>
            </>
          )}
          {recording && (
            <Button asChild variant="outline" size="sm">
              <a href={recording} target="_blank" rel="noopener noreferrer">
                <Film className="size-4" />
                Recording
                <ExternalLink className="size-3" />
              </a>
            </Button>
          )}

          {showActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${meeting.title}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onSelect={() => onEdit(meeting)}>
                    <Pencil />
                    Edit meeting
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem destructive onSelect={() => onDelete(meeting)}>
                    <Trash2 />
                    Cancel meeting
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function TeacherMeetingsPage() {
  const isAdmin = useIsAdminViewingTeacher()
  const meetingsQuery = useTeacherMeetings(!isAdmin)
  const deleteMeeting = useDeleteMeeting()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<LiveMeetingOut | null>(null)
  const [cancelling, setCancelling] = React.useState<LiveMeetingOut | null>(null)
  const now = useNow(30_000)

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (meeting: LiveMeetingOut) => {
    setEditing(meeting)
    setDialogOpen(true)
  }

  const groups = React.useMemo(() => splitMeetings(meetingsQuery.data ?? [], now), [meetingsQuery.data, now])

  if (isAdmin) {
    return (
      <>
        <PageHeader title="Meetings" description="Live sessions and recordings for your classes." />
        <AdminTeacherNotice area="meetings" />
      </>
    )
  }

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
            onEdit={openEdit}
            onDelete={setCancelling}
          />
        ))}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Schedule live classes, share join links and attach recordings."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={openCreate}>
            Schedule meeting
          </Button>
        }
      />

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
          {renderList(groups.upcoming, 'No upcoming meetings', 'Schedule a live class and it will appear here.')}
        </TabsContent>
        <TabsContent value="past">
          {renderList(groups.past, 'No past meetings', 'Meetings move here once they have finished.')}
        </TabsContent>
        <TabsContent value="recordings">
          {renderList(groups.recordings, 'No recordings yet', 'Attach a recording to a meeting to make it available to students.')}
        </TabsContent>
      </Tabs>

      <MeetingFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />

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

import { zodResolver } from '@hookform/resolvers/zod'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import type { TopicOut } from '@/api/types'
import {
  useAddTopicAttachment,
  useCreateTopic,
  useMyClasses,
  useRemoveTopicAttachment,
  useTeacherTopics,
  useUpdateTopic,
} from '@/queries/teacher.queries'
import { todayApiDate } from '@/lib/datetime'
import { subjectName, className as classNameOf } from '@/lib/select'
import { formatPercent } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { DatePicker } from '@/components/ui/date-picker'
import { Input, Textarea } from '@/components/ui/input'
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
  AttachmentList,
  AttachmentPicker,
  type PendingAttachment,
} from '@/components/forms/attachment-picker'
import { Field, FormError } from '@/components/forms/field'
import { useClassSubjectSelection } from './class-subject-picker'

const schema = z.object({
  class_id: z.string().min(1, 'Choose a class'),
  subject_id: z.string().min(1, 'Choose a subject'),
  topic_title: z.string().min(2, 'Enter a topic title').max(200),
  description: z.string().max(1000).optional(),
  date_covered: z.string().min(1, 'Choose a date'),
  completion_percentage: z.coerce.number().min(0).max(100),
})
type FormValues = z.infer<typeof schema>

/** Values the dashboard's "class over" prompt hands in, so the form opens filled. */
export type TopicPreset = {
  class_id: number
  subject_id: number
  date_covered?: string
}

/**
 * Logs a topic, or edits one when `editing` is set. Class and subject are
 * fixed on edit — `TopicUpdate` does not accept them.
 *
 * Attachments (notes, images, voice notes) are uploaded AFTER the topic is
 * saved, one by one, because the topic has to exist to hang them on. If one
 * fails the dialog stays open on the saved topic with the failed files still
 * listed, so a retry uploads only those and never logs the topic twice.
 */
export function TopicFormDialog({
  open,
  onOpenChange,
  editing,
  preset = null,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: TopicOut | null
  preset?: TopicPreset | null
}) {
  const mappingsQuery = useMyClasses()
  const topicsQuery = useTeacherTopics()
  const createTopic = useCreateTopic()
  const updateTopic = useUpdateTopic()
  const addAttachment = useAddTopicAttachment()
  const removeAttachment = useRemoveTopicAttachment()
  const selection = useClassSubjectSelection(mappingsQuery.data)

  // The topic this dialog is working on once it exists: the one being edited,
  // or the one a first submit created. Read live from the cache so an
  // attachment removed a moment ago is gone from the list.
  const [saved, setSaved] = React.useState<TopicOut | null>(null)
  const targetId = editing?.id ?? saved?.id ?? null
  const target =
    targetId == null
      ? null
      : (topicsQuery.data?.find((t) => t.id === targetId) ?? editing ?? saved)

  const [pending, setPending] = React.useState<PendingAttachment[]>([])
  const [uploadNote, setUploadNote] = React.useState<string | null>(null)
  const [removingId, setRemovingId] = React.useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      class_id: '',
      subject_id: '',
      topic_title: '',
      description: '',
      date_covered: todayApiDate(),
      completion_percentage: 100,
    },
  })

  React.useEffect(() => {
    if (!open) return
    setSaved(null)
    setPending([])
    setUploadNote(null)
    form.reset(
      editing
        ? {
            class_id: String(editing.class_id),
            subject_id: String(editing.subject_id),
            topic_title: editing.topic_title,
            description: editing.description ?? '',
            date_covered: editing.date_covered,
            completion_percentage: editing.completion_percentage,
          }
        : {
            class_id: preset ? String(preset.class_id) : selection.classId ? String(selection.classId) : '',
            subject_id: preset ? String(preset.subject_id) : selection.subjectId ? String(selection.subjectId) : '',
            topic_title: '',
            description: '',
            date_covered: preset?.date_covered ?? todayApiDate(),
            completion_percentage: 100,
          },
    )
    // Only re-seed when the dialog opens or the target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, preset])

  const classId = form.watch('class_id')

  const subjects = React.useMemo(() => {
    const map = new Map<number, { id: number; name: string; code: string }>()
    for (const m of mappingsQuery.data ?? []) {
      if (classId && m.class_room.id !== Number(classId)) continue
      map.set(m.subject.id, m.subject)
    }
    return [...map.values()]
  }, [mappingsQuery.data, classId])

  const completion = form.watch('completion_percentage')

  const onSubmit = async (values: FormValues) => {
    const description = values.description?.trim() ?? ''
    let topicId = target?.id ?? null

    try {
      if (target) {
        // Only changed fields — an empty update body is a 400.
        const patch = {
          ...(values.topic_title !== target.topic_title && { topic_title: values.topic_title }),
          ...(description !== (target.description ?? '') && { description }),
          ...(values.date_covered !== target.date_covered && { date_covered: values.date_covered }),
          ...(values.completion_percentage !== target.completion_percentage && {
            completion_percentage: values.completion_percentage,
          }),
        }
        if (Object.keys(patch).length > 0) {
          await updateTopic.mutateAsync({ topicId: target.id, body: patch })
        } else if (pending.length === 0) {
          onOpenChange(false)
          return
        }
      } else {
        const created = await createTopic.mutateAsync({
          class_id: Number(values.class_id),
          subject_id: Number(values.subject_id),
          topic_title: values.topic_title,
          description: description || null,
          date_covered: values.date_covered,
          completion_percentage: values.completion_percentage,
        })
        setSaved(created)
        topicId = created.id
      }
    } catch (error) {
      form.setError('root', {
        message:
          (error as { message?: string })?.message ??
          `Could not ${target ? 'update' : 'log'} the topic.`,
      })
      return
    }

    // The files, one at a time, once the topic exists to hang them on.
    const failed: { item: PendingAttachment; reason: string }[] = []
    for (const item of pending) {
      setUploadNote(`Uploading ${item.file.name}…`)
      try {
        await addAttachment.mutateAsync({ topicId: topicId as number, file: item.file, kind: item.kind })
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      } catch (error) {
        failed.push({ item, reason: (error as { message?: string })?.message ?? 'upload failed' })
      }
    }
    setUploadNote(null)

    if (failed.length > 0) {
      setPending(failed.map((f) => f.item))
      form.setError('root', {
        message: `The topic is saved, but ${failed.length === 1 ? 'one attachment' : `${failed.length} attachments`} did not upload: ${failed
          .map((f) => `${f.item.file.name} (${f.reason})`)
          .join('; ')}. Try again to upload just those.`,
      })
      return
    }
    setPending([])
    onOpenChange(false)
  }

  const removeExisting = async (attachmentId: string) => {
    if (!target) return
    setRemovingId(attachmentId)
    try {
      await removeAttachment.mutateAsync({ topicId: target.id, attachmentId })
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit topic' : 'Log a topic'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Students see this update in their syllabus progress straight away.'
              : 'Record what you covered so students can follow the syllabus.'}
          </DialogDescription>
        </DialogHeader>
        <DialogForm onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogBody className="space-y-5">
            <FormError message={form.formState.errors.root?.message} />

            {editing ? (
              // Immutable on update, so shown as context rather than as
              // controls that would silently do nothing.
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5">
                <span className="text-xs text-muted-foreground">Logged against</span>
                <Badge tone="accent" size="sm">
                  {subjectName(editing)}
                </Badge>
                <Badge tone="outline" size="sm">
                  {classNameOf(editing)}
                </Badge>
              </div>
            ) : (
              <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                <Field id="topic-class" label="Class" required error={form.formState.errors.class_id?.message}>
                  <Combobox
                    id="topic-class"
                    value={form.watch('class_id') || null}
                    onChange={(v) => {
                      form.setValue('class_id', v, { shouldValidate: true })
                      form.setValue('subject_id', '')
                    }}
                    placeholder="Select a class"
                    options={selection.classes.map((c) => ({ value: String(c.id), label: c.name, hint: c.code }))}
                  />
                </Field>

                <Field id="topic-subject" label="Subject" required error={form.formState.errors.subject_id?.message}>
                  <Combobox
                    id="topic-subject"
                    value={form.watch('subject_id') || null}
                    onChange={(v) => form.setValue('subject_id', v, { shouldValidate: true })}
                    disabled={!classId}
                    placeholder={classId ? 'Select a subject' : 'Choose a class first'}
                    options={subjects.map((s) => ({ value: String(s.id), label: s.name, hint: s.code }))}
                  />
                </Field>
              </div>
            )}

            <Field id="topic-title" label="Topic" required error={form.formState.errors.topic_title?.message}>
              <Input id="topic-title" placeholder="Binary search trees" {...form.register('topic_title')} />
            </Field>

            <Field id="topic-description" label="Description" error={form.formState.errors.description?.message}>
              <Textarea
                id="topic-description"
                rows={3}
                placeholder="Tree traversal and balancing"
                {...form.register('description')}
              />
            </Field>

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field id="topic-date" label="Date covered" required error={form.formState.errors.date_covered?.message}>
                <DatePicker
                  id="topic-date"
                  value={form.watch('date_covered')}
                  onChange={(v) => form.setValue('date_covered', v ?? todayApiDate(), { shouldValidate: true })}
                  maxToday
                />
              </Field>

              <Field
                id="topic-completion"
                label={`Completion — ${formatPercent(completion, 0)}`}
                error={form.formState.errors.completion_percentage?.message}
              >
                {/* valueAsNumber matters: without it a range input yields a
                    string, which breaks every numeric consumer downstream. */}
                <input
                  id="topic-completion"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  className="h-9.5 w-full accent-[hsl(var(--primary))]"
                  {...form.register('completion_percentage', { valueAsNumber: true })}
                />
              </Field>
            </div>

            <Field
              id="topic-attachments"
              label="Notes, images and voice"
              hint="Students see these with the topic in their syllabus. Notes can be any document; a voice note is recorded right here."
            >
              <div className="space-y-3">
                {target && target.attachments.length > 0 && (
                  <AttachmentList
                    attachments={target.attachments}
                    removingId={removingId}
                    onRemove={(a) => void removeExisting(a.id)}
                  />
                )}
                <AttachmentPicker
                  value={pending}
                  onChange={setPending}
                  disabled={form.formState.isSubmitting}
                />
                {uploadNote && <p className="text-xs text-muted-foreground">{uploadNote}</p>}
              </div>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {saved ? 'Done' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
              {target
                ? pending.length > 0
                  ? `Save & upload ${pending.length} ${pending.length === 1 ? 'file' : 'files'}`
                  : 'Save changes'
                : pending.length > 0
                  ? `Log topic & upload ${pending.length} ${pending.length === 1 ? 'file' : 'files'}`
                  : 'Log topic'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

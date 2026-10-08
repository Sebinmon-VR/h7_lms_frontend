import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Copy,
  Eye,
  EyeOff,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Swords,
  Trash2,
} from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import type { ArenaManageScopes, SyllabusChapter } from '@/api/arena.types'
import {
  useChapterQuestions,
  useChapters,
  useCopyChapters,
  useCreateChapter,
  useDeleteChapter,
  useManageScopes,
  useReorderChapters,
  useUpdateChapter,
} from '@/queries/arena.queries'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field, FormError } from '@/components/forms/field'
import { PageHeader } from '@/components/layout/page-header'
import { BulkQuestionsDialog, QuestionDialog, QuestionList } from './question-editor'
import { MIN_BATTLE_QUESTIONS } from './question-parse'

type Named = { id: number; name: string }

/**
 * What this person may pick. Teachers get the pairs they teach; admins any
 * class and any subject, since a pair nobody is mapped to yet still needs
 * setting up.
 */
function classOptions(scopes: ArenaManageScopes): Named[] {
  if (scopes.is_admin && scopes.classes?.length) return scopes.classes
  const map = new Map<number, string>()
  for (const p of scopes.pairs) map.set(p.class_id, p.class_name)
  return [...map.entries()].map(([id, name]) => ({ id, name }))
}

function subjectOptions(scopes: ArenaManageScopes, classId: number | null): Array<Named & { mapped: boolean }> {
  const mapped = new Set(scopes.pairs.filter((p) => p.class_id === classId).map((p) => p.subject_id))
  if (scopes.is_admin && scopes.subjects?.length) {
    // Subjects actually taught in the class first.
    return scopes.subjects
      .map((s) => ({ ...s, mapped: mapped.has(s.id) }))
      .sort((a, b) => Number(b.mapped) - Number(a.mapped) || a.name.localeCompare(b.name))
  }
  return scopes.pairs
    .filter((p) => p.class_id === classId)
    .map((p) => ({ id: p.subject_id, name: p.subject_name, mapped: true }))
}

function numberParam(value: string | null): number | null {
  if (!value) return null
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

function questionCountLine(c: SyllabusChapter) {
  if (c.question_count === 0) return 'No questions yet'
  const total = `${c.question_count} question${c.question_count === 1 ? '' : 's'}`
  return `${total} · ${c.active_question_count} active`
}

function ReadinessBadge({ chapter }: { chapter: SyllabusChapter }) {
  const missing = MIN_BATTLE_QUESTIONS - chapter.active_question_count
  if (missing <= 0) {
    return (
      <Badge tone="success" size="sm">
        <Swords />
        Ready to battle
      </Badge>
    )
  }
  return (
    <Badge tone="warning" size="sm">
      Needs {missing} more
    </Badge>
  )
}

export default function ArenaSyllabusPage() {
  const scopesQuery = useManageScopes()
  const [params, setParams] = useSearchParams()

  const setParam = React.useCallback(
    (patch: Record<string, string | number | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === '') next.delete(k)
            else next.set(k, String(v))
          }
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  const scopes = scopesQuery.data
  const classes = React.useMemo(() => (scopes ? classOptions(scopes) : []), [scopes])
  const rawClass = numberParam(params.get('class'))
  const classId = classes.some((c) => c.id === rawClass) ? rawClass : null
  const subjects = React.useMemo(() => (scopes ? subjectOptions(scopes, classId) : []), [scopes, classId])
  const rawSubject = numberParam(params.get('subject'))
  const subjectId = subjects.some((s) => s.id === rawSubject) ? rawSubject : null
  const chapterId = numberParam(params.get('chapter'))

  // One choice is no choice: fill it in.
  React.useEffect(() => {
    if (!scopes) return
    if (classId == null && classes.length === 1) setParam({ class: classes[0].id, subject: null, chapter: null })
    else if (classId != null && subjectId == null && subjects.length === 1) {
      setParam({ subject: subjects[0].id, chapter: null })
    }
  }, [scopes, classes, subjects, classId, subjectId, setParam])

  const noPairs = !!scopes && !scopes.is_admin && scopes.pairs.length === 0
  const className = classes.find((c) => c.id === classId)?.name ?? ''
  const subjectName = subjects.find((s) => s.id === subjectId)?.name ?? ''

  return (
    <>
      <PageHeader
        title="Syllabus & questions"
        description={`Chapters are set per class and subject, in teaching order. Students can battle on a chapter once it has at least ${MIN_BATTLE_QUESTIONS} active questions.`}
      >
        {scopes && !noPairs && (
          <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
            <Combobox
              id="arena-class"
              value={classId ? String(classId) : null}
              onChange={(v) => setParam({ class: v, subject: null, chapter: null })}
              placeholder="Choose a class"
              options={classes.map((c) => ({ value: String(c.id), label: c.name }))}
            />
            <Combobox
              id="arena-subject"
              value={subjectId ? String(subjectId) : null}
              onChange={(v) => setParam({ subject: v, chapter: null })}
              disabled={!classId}
              placeholder={classId ? 'Choose a subject' : 'Choose a class first'}
              options={subjects.map((s) => ({
                value: String(s.id),
                label: s.name,
                hint: scopes.is_admin && s.mapped ? 'On the timetable' : undefined,
              }))}
            />
          </div>
        )}
      </PageHeader>

      <QueryBoundary
        query={scopesQuery}
        loading={
          <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="hidden h-80 rounded-xl lg:block" />
          </div>
        }
      >
        {(data) =>
          noPairs ? (
            <EmptyState
              icon={<BookOpen />}
              title="You aren't assigned to teach any class yet"
              description="Once an administrator maps you to a class and subject on the timetable, you can set up its chapters and questions here."
            />
          ) : classId == null || subjectId == null ? (
            <EmptyState
              icon={<BookOpen />}
              title={classId == null ? 'Choose a class' : 'Choose a subject'}
              description="Pick the class and subject whose chapters you want to set up."
            />
          ) : (
            <SyllabusWorkspace
              key={`${classId}-${subjectId}`}
              scopes={data}
              classId={classId}
              subjectId={subjectId}
              className={className}
              subjectName={subjectName}
              chapterId={chapterId}
              onChapter={(id) => setParam({ chapter: id })}
            />
          )
        }
      </QueryBoundary>
    </>
  )
}

function SyllabusWorkspace({
  scopes,
  classId,
  subjectId,
  className,
  subjectName,
  chapterId,
  onChapter,
}: {
  scopes: ArenaManageScopes
  classId: number
  subjectId: number
  className: string
  subjectName: string
  chapterId: number | null
  onChapter: (id: number | null) => void
}) {
  const chaptersQuery = useChapters(classId, subjectId)
  const reorder = useReorderChapters()
  const updateChapter = useUpdateChapter()
  const deleteChapter = useDeleteChapter()

  const [chapterDialog, setChapterDialog] = React.useState<{ chapter: SyllabusChapter | null } | null>(null)
  const [copyOpen, setCopyOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState<SyllabusChapter | null>(null)

  const chapters = React.useMemo(
    () => [...(chaptersQuery.data ?? [])].sort((a, b) => a.order - b.order),
    [chaptersQuery.data],
  )
  const selected = chapters.find((c) => c.id === chapterId) ?? null

  const move = (index: number, delta: -1 | 1) => {
    const ids = chapters.map((c) => c.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorder.mutate({ classId, subjectId, chapterIds: ids })
  }

  const toggleHidden = (c: SyllabusChapter) =>
    updateChapter.mutate(
      { chapterId: c.id, body: { is_active: !c.is_active } },
      {
        onSuccess: () =>
          toast.success(c.is_active ? `“${c.title}” is hidden from students` : `“${c.title}” is visible again`),
      },
    )

  return (
    <>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* On a phone the columns take turns: the chapters, then one chapter's questions. */}
        <Card className={cn('min-w-0 overflow-hidden', selected && 'hidden lg:block')}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Chapters</h2>
              <p className="truncate text-xs text-muted-foreground">
                {subjectName} · {className}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setChapterDialog({ chapter: null })}>
                Add chapter
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-sm" aria-label="More chapter actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setCopyOpen(true)} disabled={chapters.length === 0}>
                    <Copy />
                    Copy chapters to another class
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <QueryBoundary
            query={chaptersQuery}
            errorClassName="m-4"
            loading={
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            }
            isEmpty={(d) => d.length === 0}
            empty={
              <EmptyState
                className="m-4"
                icon={<ListPlus />}
                title="No chapters yet"
                description={`Add the first chapter of ${subjectName} for ${className}, then give it a few questions.`}
                action={
                  <Button variant="primary" icon={<Plus />} onClick={() => setChapterDialog({ chapter: null })}>
                    Add the first chapter
                  </Button>
                }
              />
            }
          >
            {() => (
              <ol className="divide-y divide-border">
                {chapters.map((c, index) => (
                  <li
                    key={c.id}
                    className={cn(
                      'flex items-stretch gap-1 pr-2 transition-colors',
                      c.id === selected?.id ? 'bg-primary/8' : 'hover:bg-muted/40',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onChapter(c.id)}
                      aria-current={c.id === selected?.id || undefined}
                      className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-4 text-left"
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                          c.id === selected?.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {c.order}
                      </span>
                      <span className={cn('min-w-0 flex-1', !c.is_active && 'opacity-60')}>
                        <span className="block break-words text-sm font-medium">{c.title}</span>
                        {c.description && (
                          <span className="mt-0.5 line-clamp-2 block break-words text-xs text-muted-foreground">
                            {c.description}
                          </span>
                        )}
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">{questionCountLine(c)}</span>
                          <ReadinessBadge chapter={c} />
                          {!c.is_active && (
                            <Badge tone="neutral" size="sm">
                              <EyeOff />
                              Hidden
                            </Badge>
                          )}
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5 py-2">
                      <div className="flex flex-col">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7"
                          onClick={() => move(index, -1)}
                          disabled={index === 0 || reorder.isPending}
                          aria-label={`Move “${c.title}” up`}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7"
                          onClick={() => move(index, 1)}
                          disabled={index === chapters.length - 1 || reorder.isPending}
                          aria-label={`Move “${c.title}” down`}
                        >
                          <ArrowDown />
                        </Button>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for “${c.title}”`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setChapterDialog({ chapter: c })}>
                            <Pencil />
                            Edit chapter
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => toggleHidden(c)}>
                            {c.is_active ? <EyeOff /> : <Eye />}
                            {c.is_active ? 'Hide from students' : 'Show to students'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onSelect={() => setDeleting(c)}>
                            <Trash2 />
                            Delete chapter
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </QueryBoundary>
        </Card>

        {selected ? (
          <ChapterQuestions chapter={selected} onBack={() => onChapter(null)} />
        ) : (
          chapters.length > 0 && (
            <div className="hidden rounded-xl border border-dashed border-border px-6 py-14 text-center lg:block">
              <BookOpen className="mx-auto size-7 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Pick a chapter to see its questions</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Each chapter needs {MIN_BATTLE_QUESTIONS} active questions before students can battle on it.
              </p>
            </div>
          )
        )}
      </div>

      <ChapterDialog
        open={!!chapterDialog}
        chapter={chapterDialog?.chapter ?? null}
        classId={classId}
        subjectId={subjectId}
        onOpenChange={(v) => !v && setChapterDialog(null)}
        onCreated={(c) => onChapter(c.id)}
      />

      <CopyChaptersDialog
        open={copyOpen}
        onOpenChange={setCopyOpen}
        scopes={scopes}
        classId={classId}
        subjectId={subjectId}
        subjectName={subjectName}
        className={className}
        chapterCount={chapters.length}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this chapter?"
        description={
          deleting
            ? deleting.question_count > 0
              ? `“${deleting.title}” and its ${deleting.question_count} question${deleting.question_count === 1 ? '' : 's'} will be deleted. Battles already played keep their copies. To take it away from students for now, hide it instead.`
              : `“${deleting.title}” will be deleted.`
            : undefined
        }
        confirmLabel="Delete chapter"
        destructive
        loading={deleteChapter.isPending}
        onConfirm={() => {
          if (!deleting) return
          const id = deleting.id
          deleteChapter.mutate(id, {
            onSuccess: () => {
              if (id === chapterId) onChapter(null)
            },
            onSettled: () => setDeleting(null),
          })
        }}
      />
    </>
  )
}

function ChapterQuestions({ chapter, onBack }: { chapter: SyllabusChapter; onBack: () => void }) {
  const questionsQuery = useChapterQuestions(chapter.id)
  const [adding, setAdding] = React.useState(false)
  const [bulkOpen, setBulkOpen] = React.useState(false)
  const target = React.useMemo(() => ({ kind: 'chapter' as const, chapterId: chapter.id }), [chapter.id])

  return (
    <section className="min-w-0" aria-label={`Questions in ${chapter.title}`}>
      <Button variant="ghost" size="sm" icon={<ArrowLeft />} className="-ml-2 mb-2 lg:hidden" onClick={onBack}>
        All chapters
      </Button>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Chapter {chapter.order}</p>
          <h2 className="break-words text-lg font-semibold tracking-tight">{chapter.title}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{questionCountLine(chapter)}</span>
            <ReadinessBadge chapter={chapter} />
            {!chapter.is_active && (
              <Badge tone="neutral" size="sm">
                <EyeOff />
                Hidden
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" icon={<ListPlus />} onClick={() => setBulkOpen(true)}>
            Bulk add
          </Button>
          <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setAdding(true)}>
            Add question
          </Button>
        </div>
      </div>

      <QueryBoundary
        query={questionsQuery}
        loading={
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        }
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            icon={<Swords />}
            title="No questions in this chapter"
            description={`Add at least ${MIN_BATTLE_QUESTIONS} and students can start battling on it. Bulk add takes a pasted list or a CSV.`}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" icon={<ListPlus />} onClick={() => setBulkOpen(true)}>
                  Bulk add
                </Button>
                <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>
                  Add question
                </Button>
              </div>
            }
          />
        }
      >
        {(questions) => <QuestionList questions={questions} target={target} />}
      </QueryBoundary>

      <QuestionDialog open={adding} onOpenChange={setAdding} target={target} />
      <BulkQuestionsDialog open={bulkOpen} onOpenChange={setBulkOpen} target={target} />
    </section>
  )
}

function ChapterDialog({
  open,
  chapter,
  classId,
  subjectId,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  chapter: SyllabusChapter | null
  classId: number
  subjectId: number
  onOpenChange: (open: boolean) => void
  onCreated: (chapter: SyllabusChapter) => void
}) {
  const createChapter = useCreateChapter()
  const updateChapter = useUpdateChapter()
  const pending = createChapter.isPending || updateChapter.isPending
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setTitle(chapter?.title ?? '')
    setDescription(chapter?.description ?? '')
    setError(null)
  }, [open, chapter])

  const ready = title.trim().length > 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setError(null)
    try {
      if (chapter) {
        await updateChapter.mutateAsync({
          chapterId: chapter.id,
          body: { title: title.trim(), description: description.trim() || null },
        })
        toast.success('Chapter saved')
      } else {
        const created = await createChapter.mutateAsync({
          class_id: classId,
          subject_id: subjectId,
          title: title.trim(),
          description: description.trim() || null,
        })
        onCreated(created)
      }
      onOpenChange(false)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not save the chapter.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent>
        <DialogForm onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{chapter ? 'Edit chapter' : 'Add a chapter'}</DialogTitle>
            <DialogDescription>
              {chapter
                ? 'Students see the title when they choose what to battle on.'
                : 'It goes to the end of the list; move it up afterwards if it belongs earlier.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FormError message={error} />
            <Field id="arena-chapter-title" label="Title" required>
              <Input
                id="arena-chapter-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="Chapter 3: Plants around us"
                autoFocus
              />
            </Field>
            <Field id="arena-chapter-description" label="Description" hint="Optional — what the chapter covers.">
              <Textarea
                id="arena-chapter-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={4000}
                className="min-h-20"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!ready} loading={pending}>
              {chapter ? 'Save changes' : 'Add chapter'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

function CopyChaptersDialog({
  open,
  onOpenChange,
  scopes,
  classId,
  subjectId,
  subjectName,
  className,
  chapterCount,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  scopes: ArenaManageScopes
  classId: number
  subjectId: number
  subjectName: string
  className: string
  chapterCount: number
}) {
  const copy = useCopyChapters()
  const [target, setTarget] = React.useState<string | null>(null)
  const [includeQuestions, setIncludeQuestions] = React.useState(true)

  React.useEffect(() => {
    if (!open) return
    setTarget(null)
    setIncludeQuestions(true)
  }, [open])

  const options = React.useMemo(() => {
    const list: Named[] =
      scopes.is_admin && scopes.classes?.length
        ? scopes.classes
        : scopes.pairs
            .filter((p) => p.subject_id === subjectId)
            .map((p) => ({ id: p.class_id, name: p.class_name }))
    const seen = new Set<number>()
    const out: Array<{ value: string; label: string }> = []
    for (const c of list) {
      if (c.id === classId || seen.has(c.id)) continue
      seen.add(c.id)
      out.push({ value: String(c.id), label: c.name })
    }
    return out
  }, [scopes, subjectId, classId])

  const submit = () => {
    if (!target) return
    copy.mutate(
      { from_class_id: classId, subject_id: subjectId, to_class_id: Number(target), include_questions: includeQuestions },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !copy.isPending && onOpenChange(v)}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Copy chapters to another class</DialogTitle>
          <DialogDescription>
            Adds the {chapterCount} {subjectName} chapter{chapterCount === 1 ? '' : 's'} of {className} to the end of
            the other class's list. Nothing already there is replaced.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {options.length === 0 ? (
            <p className="rounded-lg border border-border bg-muted/30 px-3.5 py-3 text-sm text-muted-foreground">
              You don't teach {subjectName} in any other class.
            </p>
          ) : (
            <>
              <Field id="arena-copy-target" label="Copy into" required>
                <Combobox
                  id="arena-copy-target"
                  value={target}
                  onChange={setTarget}
                  placeholder="Choose a class"
                  options={options}
                />
              </Field>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2.5">
                <Checkbox
                  checked={includeQuestions}
                  onCheckedChange={(v) => setIncludeQuestions(v === true)}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-medium">Include the questions</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Each chapter arrives with copies of its questions, ready to battle on.
                  </span>
                </span>
              </label>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={copy.isPending}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Copy />} disabled={!target} loading={copy.isPending} onClick={submit}>
            Copy chapters
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import {
  AlertCircle,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import * as React from 'react'

import type { ArenaCategory, ArenaQuestion, ArenaQuestionType } from '@/api/arena.types'
import { useBulkQuestions, useCreateQuestion, useDeleteQuestion, useUpdateQuestion } from '@/queries/arena.queries'
import { cn } from '@/lib/cn'
import { downloadCsv } from '@/lib/csv'
import { formatFileSize } from '@/lib/files'
import { DIFFICULTY_LABEL } from '@/components/arena/arena-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Input, Textarea } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Field, FormError } from '@/components/forms/field'
import {
  CSV_TEMPLATE,
  LIMITS,
  MAX_BULK,
  MAX_OPTIONS,
  MIN_OPTIONS,
  OPTION_KEYS,
  PASTE_EXAMPLE,
  QUESTION_TYPE_LABEL,
  type ParsedQuestion,
  type QuestionDraft,
  draftFromQuestion,
  draftToPayload,
  emptyDraft,
  parseCsvQuestions,
  parsePastedQuestions,
  validateDraft,
} from './question-parse'

/**
 * Where questions land: a syllabus chapter (teachers and admins) or the
 * school-wide pool, filed under a category (admins).
 */
export type QuestionTarget =
  | { kind: 'chapter'; chapterId: number }
  | { kind: 'global'; categories: ArenaCategory[]; defaultCategory?: string | null }

function errorMessage(err: unknown, fallback: string) {
  return (err as { message?: string })?.message ?? fallback
}

function categoryOptions(categories: ArenaCategory[]) {
  return categories.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))
}

const DIFFICULTY_OPTIONS = [
  { value: '1', label: 'Easy' },
  { value: '2', label: 'Medium' },
  { value: '3', label: 'Hard' },
] as const

// ---------------------------------------------------------------- single question

export function QuestionDialog({
  open,
  onOpenChange,
  target,
  question,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: QuestionTarget
  /** Set to edit; omitted to add a new one. */
  question?: ArenaQuestion | null
}) {
  const createQuestion = useCreateQuestion()
  const updateQuestion = useUpdateQuestion()
  const pending = createQuestion.isPending || updateQuestion.isPending
  const editing = !!question

  const [draft, setDraft] = React.useState<QuestionDraft>(() => emptyDraft())
  const [category, setCategory] = React.useState<string | null>(null)
  const [attempted, setAttempted] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const textRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (!open) return
    setDraft(question ? draftFromQuestion(question) : emptyDraft())
    setCategory(
      question?.category ?? (target.kind === 'global' ? (target.defaultCategory ?? null) : null),
    )
    setAttempted(false)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, question])

  const patch = (next: Partial<QuestionDraft>) => setDraft((d) => ({ ...d, ...next }))
  const problems = validateDraft(draft)
  const needsCategory = target.kind === 'global' && !category
  const showProblems = attempted && (problems.length > 0 || needsCategory)

  const setOption = (index: number, text: string) =>
    setDraft((d) => ({ ...d, options: d.options.map((o, i) => (i === index ? text : o)) }))

  const removeOption = (index: number) =>
    setDraft((d) => {
      let correctIndex = d.correctIndex
      if (correctIndex === index) correctIndex = null
      else if (correctIndex != null && correctIndex > index) correctIndex -= 1
      return { ...d, options: d.options.filter((_, i) => i !== index), correctIndex }
    })

  const submit = async (another: boolean) => {
    setAttempted(true)
    if (problems.length > 0 || needsCategory) return
    setError(null)
    const payload = draftToPayload(draft)
    try {
      if (question) {
        await updateQuestion.mutateAsync({
          questionId: question.id,
          body: { ...payload, ...(target.kind === 'global' && category ? { category } : {}) },
        })
      } else {
        await createQuestion.mutateAsync({
          ...payload,
          ...(target.kind === 'chapter' ? { chapter_id: target.chapterId } : { category }),
        })
      }
      if (another) {
        // Keep the type and level: a run of questions usually shares both.
        setDraft(emptyDraft(draft.question_type, draft.difficulty))
        setAttempted(false)
        textRef.current?.focus()
      } else {
        onOpenChange(false)
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not save the question.'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit question' : 'Add a question'}</DialogTitle>
          <DialogDescription>
            {target.kind === 'chapter'
              ? 'Students see it in battles on this chapter, with a 15-second timer.'
              : 'Goes into the school-wide pool that global challenges draw from.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <FormError message={error} />

          <div className="flex flex-wrap items-center gap-3">
            <Segmented<ArenaQuestionType>
              layoutId="arena-question-type"
              value={draft.question_type}
              onChange={(v) => patch({ question_type: v })}
              aria-label="Question type"
              options={[
                { value: 'MCQ', label: QUESTION_TYPE_LABEL.MCQ },
                { value: 'TRUE_FALSE', label: QUESTION_TYPE_LABEL.TRUE_FALSE },
              ]}
            />
          </div>

          {target.kind === 'global' && (
            <Field
              id="arena-question-category"
              label="Category"
              required
              error={attempted && needsCategory ? 'Choose a category.' : undefined}
            >
              <Combobox
                id="arena-question-category"
                value={category}
                onChange={setCategory}
                placeholder="Choose a category"
                options={categoryOptions(target.categories)}
                invalid={attempted && needsCategory}
              />
            </Field>
          )}

          <Field
            id="arena-question-text"
            label={draft.question_type === 'TRUE_FALSE' ? 'Statement' : 'Question'}
            required
            hint={
              draft.question_type === 'TRUE_FALSE'
                ? 'Write it as a statement students judge true or false.'
                : undefined
            }
          >
            <Textarea
              id="arena-question-text"
              ref={textRef}
              value={draft.text}
              onChange={(e) => patch({ text: e.target.value })}
              maxLength={LIMITS.text}
              className="min-h-20"
              placeholder={
                draft.question_type === 'TRUE_FALSE' ? 'The Sun is a star.' : 'What is the capital of India?'
              }
            />
          </Field>

          {draft.question_type === 'MCQ' ? (
            <fieldset className="space-y-2">
              <legend className="mb-2 block text-[0.8125rem] font-semibold leading-none tracking-tight text-foreground/90">
                Options <span className="font-normal text-muted-foreground">— pick the correct one</span>
              </legend>
              {draft.options.map((option, index) => {
                const key = OPTION_KEYS[index]
                const correct = draft.correctIndex === index
                return (
                  <div
                    key={index}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border p-1.5 pl-2.5 transition-colors',
                      correct ? 'border-success/40 bg-success/8' : 'border-border',
                    )}
                  >
                    <input
                      type="radio"
                      name="arena-correct-option"
                      className="size-4 shrink-0 accent-success"
                      checked={correct}
                      onChange={() => patch({ correctIndex: index })}
                      aria-label={`Option ${key} is correct`}
                    />
                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold',
                        correct ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground',
                      )}
                      aria-hidden
                    >
                      {key}
                    </span>
                    <Input
                      value={option}
                      onChange={(e) => setOption(index, e.target.value)}
                      maxLength={LIMITS.option}
                      placeholder={`Option ${key}`}
                      aria-label={`Option ${key}`}
                      className="h-8 min-w-0 flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeOption(index)}
                      disabled={draft.options.length <= MIN_OPTIONS}
                      aria-label={`Remove option ${key}`}
                    >
                      <X />
                    </Button>
                  </div>
                )
              })}
              <Button
                variant="outline"
                size="sm"
                icon={<Plus />}
                onClick={() => patch({ options: [...draft.options, ''] })}
                disabled={draft.options.length >= MAX_OPTIONS}
              >
                Add option
              </Button>
            </fieldset>
          ) : (
            <Field id="arena-question-tf" label="The statement is" required>
              <div>
                <Segmented<'TRUE' | 'FALSE'>
                  layoutId="arena-question-tf"
                  value={draft.tfAnswer}
                  onChange={(v) => patch({ tfAnswer: v })}
                  aria-label="Correct answer"
                  options={[
                    { value: 'TRUE', label: 'True', activeClassName: 'bg-success/20' },
                    { value: 'FALSE', label: 'False', activeClassName: 'bg-danger/15' },
                  ]}
                />
              </div>
            </Field>
          )}

          <Field id="arena-question-difficulty" label="Difficulty" hint="Harder questions are worth no more points, but challenges can be limited to one level.">
            <div>
              <Segmented
                layoutId="arena-question-difficulty"
                value={String(draft.difficulty) as '1' | '2' | '3'}
                onChange={(v) => patch({ difficulty: Number(v) })}
                aria-label="Difficulty"
                options={[...DIFFICULTY_OPTIONS]}
              />
            </div>
          </Field>

          <Field
            id="arena-question-explanation"
            label="Explanation"
            hint="Optional. Shown to everyone once the round is revealed."
          >
            <Textarea
              id="arena-question-explanation"
              value={draft.explanation}
              onChange={(e) => patch({ explanation: e.target.value })}
              maxLength={LIMITS.explanation}
              className="min-h-16"
              placeholder="New Delhi has been the capital since 1931."
            />
          </Field>

          {showProblems && problems.length > 0 && (
            <div
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger/8 px-3.5 py-3 text-sm text-danger"
            >
              <ul className="list-inside list-disc space-y-0.5">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          {!editing && (
            <Button variant="outline" onClick={() => submit(true)} disabled={pending}>
              Save and add another
            </Button>
          )}
          <Button variant="primary" loading={pending} onClick={() => submit(false)}>
            {editing ? 'Save changes' : 'Add question'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- bulk

type BulkMode = 'paste' | 'csv'

const MAX_CSV_BYTES = 2 * 1024 * 1024

export function BulkQuestionsDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: QuestionTarget
}) {
  const bulk = useBulkQuestions()
  const [mode, setMode] = React.useState<BulkMode>('paste')
  const [text, setText] = React.useState('')
  const [csv, setCsv] = React.useState<{ name: string; size: number; content: string } | null>(null)
  const [category, setCategory] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [showFormat, setShowFormat] = React.useState(false)
  const deferredText = React.useDeferredValue(text)

  React.useEffect(() => {
    if (!open) return
    setMode('paste')
    setText('')
    setCsv(null)
    setCategory(target.kind === 'global' ? (target.defaultCategory ?? null) : null)
    setError(null)
    setShowFormat(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const parsed = React.useMemo((): { questions: ParsedQuestion[]; error: string | null } => {
    if (mode === 'paste') return { questions: parsePastedQuestions(deferredText), error: null }
    if (!csv) return { questions: [], error: null }
    return parseCsvQuestions(csv.content)
  }, [mode, deferredText, csv])

  const ready = parsed.questions.filter((q) => q.draft)
  const broken = parsed.questions.length - ready.length
  const tooMany = ready.length > MAX_BULK
  const needsCategory = target.kind === 'global' && !category

  const chooseFile = async (file: File | null) => {
    if (!file) return
    setError(null)
    if (file.size > MAX_CSV_BYTES) {
      setError(`That file is ${formatFileSize(file.size)}. Keep a question sheet under ${formatFileSize(MAX_CSV_BYTES)}.`)
      return
    }
    try {
      setCsv({ name: file.name, size: file.size, content: await file.text() })
    } catch {
      setError('Could not read that file.')
    }
  }

  const submit = async () => {
    if (ready.length === 0 || tooMany || needsCategory) return
    setError(null)
    try {
      await bulk.mutateAsync({
        ...(target.kind === 'chapter' ? { chapter_id: target.chapterId } : { category }),
        questions: ready.map((q) => draftToPayload(q.draft!)),
      })
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err, 'Could not add the questions.'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !bulk.isPending && onOpenChange(v)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Add questions in bulk</DialogTitle>
          <DialogDescription>
            Paste them or upload a CSV, check the preview, then add the ones that read correctly.
            Questions with problems are left out.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <FormError message={error ?? parsed.error} />

          {target.kind === 'global' && (
            <Field id="arena-bulk-category" label="Category" required hint="Every question in this batch goes here.">
              <Combobox
                id="arena-bulk-category"
                value={category}
                onChange={setCategory}
                placeholder="Choose a category"
                options={categoryOptions(target.categories)}
              />
            </Field>
          )}

          <Segmented<BulkMode>
            layoutId="arena-bulk-mode"
            value={mode}
            onChange={(v) => {
              setMode(v)
              setError(null)
            }}
            aria-label="How to add"
            options={[
              { value: 'paste', label: 'Paste text', icon: <ClipboardPaste /> },
              { value: 'csv', label: 'Upload CSV', icon: <FileSpreadsheet /> },
            ]}
          />

          {mode === 'paste' ? (
            <div className="space-y-2">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="min-h-48 font-mono text-xs"
                placeholder={PASTE_EXAMPLE}
                aria-label="Questions to add"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowFormat((v) => !v)}
                className="text-xs font-medium text-primary hover:underline"
                aria-expanded={showFormat}
              >
                {showFormat ? 'Hide the format' : 'How to write them'}
              </button>
              {showFormat && (
                <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3.5 text-xs leading-relaxed text-muted-foreground">
                  <ul className="list-disc space-y-1 pl-4">
                    <li>Leave a blank line between questions.</li>
                    <li>
                      The first line is the question. A <code className="font-mono">Q:</code> or{' '}
                      <code className="font-mono">1.</code> in front is fine.
                    </li>
                    <li>
                      Options go on their own lines as <code className="font-mono">A) text</code>,{' '}
                      <code className="font-mono">A. text</code> or <code className="font-mono">A: text</code>,
                      up to F.
                    </li>
                    <li>
                      Mark the correct option with a leading <code className="font-mono">*</code> (
                      <code className="font-mono">*B) New Delhi</code>) or add a line{' '}
                      <code className="font-mono">Answer: B</code>.
                    </li>
                    <li>
                      For true–false, give True and False as the options, or skip the options and write{' '}
                      <code className="font-mono">Answer: True</code>.
                    </li>
                    <li>
                      Optional: <code className="font-mono">Explain: …</code> and{' '}
                      <code className="font-mono">Level: 1</code>, <code className="font-mono">2</code> or{' '}
                      <code className="font-mono">3</code> (or Easy, Medium, Hard).
                    </li>
                  </ul>
                  <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-card p-3 font-mono text-2xs text-foreground">
                    {PASTE_EXAMPLE}
                  </pre>
                  <Button variant="outline" size="xs" onClick={() => setText(PASTE_EXAMPLE)}>
                    Use this example
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border-2 border-dashed border-border p-5 text-center">
                {csv ? (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <FileSpreadsheet className="size-6 text-muted-foreground" />
                    <div className="min-w-0 text-left">
                      <p className="truncate text-sm font-medium">{csv.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(csv.size)}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setCsv(null)}>
                      Change
                    </Button>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="mx-auto size-7 text-muted-foreground" />
                    <p className="mt-2 text-sm">
                      <label className="cursor-pointer font-medium text-primary hover:underline">
                        Choose a .csv file
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          className="sr-only"
                          onChange={(e) => {
                            void chooseFile(e.target.files?.[0] ?? null)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Save from Excel or Google Sheets as CSV.</p>
                  </>
                )}
              </div>
              <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
                <p className="min-w-0 leading-relaxed">
                  Columns: <span className="font-mono">question</span>,{' '}
                  <span className="font-mono">option_a</span> … <span className="font-mono">option_f</span>,{' '}
                  <span className="font-mono">answer</span> (A–F, or TRUE/FALSE with no options),{' '}
                  <span className="font-mono">explanation</span>, <span className="font-mono">difficulty</span> (1–3).
                </p>
                <Button
                  variant="outline"
                  size="xs"
                  icon={<Download />}
                  className="shrink-0 self-start"
                  onClick={() => downloadCsv('arena-questions-template.csv', CSV_TEMPLATE)}
                >
                  Download CSV template
                </Button>
              </div>
            </div>
          )}

          {parsed.questions.length > 0 && (
            <section className="space-y-3" aria-label="Preview">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">Preview</span>
                <Badge tone="success" size="sm">
                  {ready.length} ready
                </Badge>
                {broken > 0 && (
                  <Badge tone="danger" size="sm">
                    {broken} with problems
                  </Badge>
                )}
              </div>
              {tooMany && (
                <FormError
                  message={`That's ${ready.length} questions; up to ${MAX_BULK} go in at once. Split the list and add it in parts.`}
                />
              )}
              <ul className="space-y-2">
                {parsed.questions.map((q, i) => (
                  <ParsedQuestionRow key={i} parsed={q} />
                ))}
              </ul>
            </section>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={bulk.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={bulk.isPending}
            disabled={ready.length === 0 || tooMany || needsCategory}
            onClick={submit}
          >
            {ready.length > 0 ? `Add ${ready.length} question${ready.length === 1 ? '' : 's'}` : 'Add questions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ParsedQuestionRow({ parsed }: { parsed: ParsedQuestion }) {
  const ok = !!parsed.draft
  const draft = parsed.draft
  return (
    <li
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5',
        ok ? 'border-border' : 'border-danger/30 bg-danger/5',
      )}
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          {parsed.label}
          {draft && ` · ${QUESTION_TYPE_LABEL[draft.question_type]} · ${DIFFICULTY_LABEL[draft.difficulty]}`}
        </p>
        <p className="mt-0.5 line-clamp-2 break-words text-sm">
          {parsed.text || <span className="italic text-muted-foreground">No question text</span>}
        </p>
        {draft && (
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {draft.question_type === 'TRUE_FALSE' ? (
              <>
                Answer: <span className="font-medium text-success">{draft.tfAnswer === 'TRUE' ? 'True' : 'False'}</span>
              </>
            ) : (
              draft.options.map((o, i) => (
                <span key={i} className={cn('mr-3 inline-block', i === draft.correctIndex && 'font-medium text-success')}>
                  {OPTION_KEYS[i]}) {o}
                  {i === draft.correctIndex && ' ✓'}
                </span>
              ))
            )}
          </p>
        )}
        {parsed.errors.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs text-danger">
            {parsed.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------- list

export function QuestionList({
  questions,
  target,
}: {
  questions: ArenaQuestion[]
  target: QuestionTarget
}) {
  const updateQuestion = useUpdateQuestion()
  const deleteQuestion = useDeleteQuestion()
  const [editing, setEditing] = React.useState<ArenaQuestion | null>(null)
  const [deleting, setDeleting] = React.useState<ArenaQuestion | null>(null)
  const [toggling, setToggling] = React.useState<number | null>(null)

  const categories = target.kind === 'global' ? target.categories : []
  const categoryById = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const toggle = (q: ArenaQuestion) => {
    setToggling(q.id)
    updateQuestion.mutate(
      { questionId: q.id, body: { is_active: !q.is_active } },
      { onSettled: () => setToggling(null) },
    )
  }

  return (
    <>
      <ol className="space-y-3">
        {questions.map((q, index) => (
          <li key={q.id}>
            <QuestionCard
              question={q}
              number={index + 1}
              category={q.category ? categoryById.get(q.category) : undefined}
              toggling={toggling === q.id}
              onToggle={() => toggle(q)}
              onEdit={() => setEditing(q)}
              onDelete={() => setDeleting(q)}
            />
          </li>
        ))}
      </ol>

      <QuestionDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        target={target}
        question={editing}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this question?"
        description={
          deleting
            ? `“${deleting.text.length > 120 ? `${deleting.text.slice(0, 119)}…` : deleting.text}” will no longer come up in battles. Battles already played keep their copy. To take it out for a while instead, switch it off.`
            : undefined
        }
        confirmLabel="Delete question"
        destructive
        loading={deleteQuestion.isPending}
        onConfirm={() => {
          if (!deleting) return
          deleteQuestion.mutate(deleting.id, { onSettled: () => setDeleting(null) })
        }}
      />
    </>
  )
}

function QuestionCard({
  question,
  number,
  category,
  toggling,
  onToggle,
  onEdit,
  onDelete,
}: {
  question: ArenaQuestion
  number: number
  category?: ArenaCategory
  toggling: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const q = question
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className={cn('min-w-0 flex-1', !q.is_active && 'opacity-60')}>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">Q{number}</span>
            <Badge tone="outline" size="sm">
              {QUESTION_TYPE_LABEL[q.question_type]}
            </Badge>
            <Badge tone={q.difficulty === 3 ? 'warning' : q.difficulty === 2 ? 'info' : 'neutral'} size="sm">
              {DIFFICULTY_LABEL[q.difficulty] ?? 'Easy'}
            </Badge>
            {category && (
              <Badge tone="accent" size="sm">
                {category.emoji} {category.name}
              </Badge>
            )}
            {!q.is_active && (
              <Badge tone="neutral" size="sm">
                Off
              </Badge>
            )}
          </div>
          <p className="whitespace-pre-line break-words text-sm font-medium">{q.text}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Switch
            checked={q.is_active}
            onCheckedChange={onToggle}
            disabled={toggling}
            aria-label={q.is_active ? 'In use — switch off' : 'Off — switch on'}
            title={q.is_active ? 'In use in battles' : 'Not used in battles'}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for question ${number}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil />
                Edit question
              </DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={onDelete}>
                <Trash2 />
                Delete question
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ul className={cn('mt-3 grid gap-1.5 sm:grid-cols-2', !q.is_active && 'opacity-60')}>
        {q.options.map((o) => {
          const correct = o.key === q.correct_key
          return (
            <li
              key={o.key}
              className={cn(
                'flex min-w-0 items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm',
                correct ? 'border-success/40 bg-success/10 text-success' : 'border-border text-foreground/90',
              )}
            >
              {q.question_type === 'MCQ' && (
                <span className="shrink-0 text-xs font-bold leading-5 opacity-80">{o.key}</span>
              )}
              <span className="min-w-0 flex-1 break-words">{o.text}</span>
              {correct && <Check className="mt-0.5 size-4 shrink-0" aria-label="Correct answer" />}
            </li>
          )
        })}
      </ul>

      {q.explanation && (
        <p className={cn('mt-3 break-words text-xs leading-relaxed text-muted-foreground', !q.is_active && 'opacity-60')}>
          <span className="font-semibold text-foreground/80">Why: </span>
          {q.explanation}
        </p>
      )}
    </Card>
  )
}

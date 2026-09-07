import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  FileQuestion,
  KeyRound,
  ListChecks,
  LockKeyhole,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import * as React from 'react'

import { ApiError } from '@/api/errors'
import type {
  AnswerKeyItem,
  AnswerValue,
  ExamOut,
  ExamQuestionIn,
  ExamQuestionOut,
  QuestionType,
} from '@/api/types'
import { cn } from '@/lib/cn'
import {
  QUESTION_TYPES,
  QUESTION_TYPE_META,
  formatMark,
  isChoiceType,
  isObjectiveType,
  optionKey,
  questionsTotal,
  sortQuestions,
} from '@/lib/exams'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/components/feedback/states'

/**
 * The question paper editor.
 *
 * Two modes, decided by whether any script has been handed in:
 *
 *  - Before: the whole form is editable and saved in one call that replaces
 *    it. A question keeps its `id` so answers already filed against it (by a
 *    student mid-exam) stay attached; reordering is safe for the same reason.
 *  - After: the paper is fixed — changing it under a valued script would be a
 *    different exam — but the answer key is still open, and saving it can
 *    re-mark every handed-in script. That is a first-class flow, not a repair:
 *    a teacher marking short answers by hand often decides the accepted
 *    wordings only after reading what the class actually wrote.
 */

interface DraftOption {
  key: string
  text: string
}

interface DraftQuestion {
  localId: string
  id: number | null
  question_type: QuestionType
  text: string
  marks: string
  options: DraftOption[]
  correctKeys: string[]
  acceptedAnswers: string
  numericAnswer: string
  tolerance: string
  explanation: string
  required: boolean
  allowAttachments: boolean
}

let counter = 0
const nextLocalId = () => `q-${Date.now().toString(36)}-${(counter += 1)}`

const TRUE_FALSE_OPTIONS: DraftOption[] = [
  { key: 'TRUE', text: 'True' },
  { key: 'FALSE', text: 'False' },
]

function blankQuestion(type: QuestionType): DraftQuestion {
  const choice = isChoiceType(type)
  return {
    localId: nextLocalId(),
    id: null,
    question_type: type,
    text: '',
    marks: '1',
    options:
      type === 'TRUE_FALSE'
        ? TRUE_FALSE_OPTIONS.map((o) => ({ ...o }))
        : choice
          ? [
              { key: 'A', text: '' },
              { key: 'B', text: '' },
              { key: 'C', text: '' },
              { key: 'D', text: '' },
            ]
          : [],
    correctKeys: [],
    acceptedAnswers: '',
    numericAnswer: '',
    tolerance: '',
    explanation: '',
    required: true,
    allowAttachments: type === 'FILE_UPLOAD',
  }
}

function keysOf(value: AnswerValue): string[] {
  if (value == null) return []
  const list = Array.isArray(value) ? value : [value]
  return list.map((v) => String(v).trim().toUpperCase()).filter(Boolean)
}

function fromQuestion(q: ExamQuestionOut): DraftQuestion {
  const choice = isChoiceType(q.question_type)
  const accepted = q.question_type === 'SHORT_ANSWER' ? (Array.isArray(q.correct_answer) ? q.correct_answer : q.correct_answer != null ? [String(q.correct_answer)] : []) : []
  return {
    localId: `q-${q.id}`,
    id: q.id,
    question_type: q.question_type,
    text: q.text,
    marks: String(q.marks),
    options: q.options.map((o) => ({ key: o.key, text: o.text })),
    correctKeys: choice ? keysOf(q.correct_answer) : [],
    acceptedAnswers: accepted.join('\n'),
    numericAnswer: q.question_type === 'NUMERIC' && q.correct_answer != null ? String(q.correct_answer) : '',
    tolerance: q.tolerance != null ? String(q.tolerance) : '',
    explanation: q.answer_explanation ?? '',
    required: q.required,
    allowAttachments: q.allow_attachments,
  }
}

function correctAnswerOf(q: DraftQuestion): AnswerValue {
  switch (q.question_type) {
    case 'MCQ':
    case 'TRUE_FALSE':
      return q.correctKeys[0] ?? null
    case 'MULTI_SELECT':
      return q.correctKeys.length > 0 ? q.correctKeys : null
    case 'SHORT_ANSWER': {
      const list = q.acceptedAnswers
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      return list.length === 0 ? null : list.length === 1 ? list[0] : list
    }
    case 'NUMERIC':
      return q.numericAnswer.trim() === '' ? null : Number(q.numericAnswer)
    default:
      return null
  }
}

function toQuestionIn(q: DraftQuestion, order: number): ExamQuestionIn {
  const choice = isChoiceType(q.question_type)
  return {
    id: q.id,
    order,
    question_type: q.question_type,
    text: q.text.trim(),
    marks: Number(q.marks),
    options: choice ? q.options.map((o) => ({ key: o.key.trim().toUpperCase(), text: o.text.trim() })) : [],
    correct_answer: correctAnswerOf(q),
    tolerance: q.question_type === 'NUMERIC' && q.tolerance.trim() !== '' ? Number(q.tolerance) : null,
    answer_explanation: q.explanation.trim() || null,
    required: q.required,
    allow_attachments: q.allowAttachments,
  }
}

function toKeyItem(q: DraftQuestion): AnswerKeyItem | null {
  if (q.id == null) return null
  return {
    question_id: q.id,
    correct_answer: correctAnswerOf(q),
    tolerance: q.question_type === 'NUMERIC' && q.tolerance.trim() !== '' ? Number(q.tolerance) : null,
    answer_explanation: q.explanation.trim() || null,
  }
}

function validateQuestion(q: DraftQuestion): string | null {
  if (!q.text.trim()) return 'The question needs some text.'
  const marks = Number(q.marks)
  if (!Number.isFinite(marks) || marks <= 0) return 'Marks must be greater than zero.'

  if (isChoiceType(q.question_type)) {
    if (q.options.length < 2) return 'Give at least two options.'
    if (q.options.some((o) => !o.text.trim())) return 'Every option needs text.'
    const keys = q.options.map((o) => o.key.trim().toUpperCase())
    if (keys.some((k) => !k)) return 'Every option needs a key.'
    if (new Set(keys).size !== keys.length) return 'Option keys must be unique.'
    if (q.correctKeys.some((k) => !keys.includes(k))) return 'The correct answer points at an option that no longer exists.'
    if (q.question_type !== 'MULTI_SELECT' && q.correctKeys.length > 1) return 'Only one option can be correct here.'
  }

  if (q.question_type === 'NUMERIC') {
    if (q.numericAnswer.trim() !== '' && !Number.isFinite(Number(q.numericAnswer))) return 'The answer must be a number.'
    if (q.tolerance.trim() !== '' && (!Number.isFinite(Number(q.tolerance)) || Number(q.tolerance) < 0)) return 'Tolerance cannot be negative.'
  }
  return null
}

function hasKey(q: DraftQuestion): boolean {
  return correctAnswerOf(q) != null
}

// ---------------------------------------------------------------- editors

function ChoiceEditor({
  question,
  locked,
  onChange,
}: {
  question: DraftQuestion
  locked: boolean
  onChange: (patch: Partial<DraftQuestion>) => void
}) {
  const multi = question.question_type === 'MULTI_SELECT'
  const fixed = question.question_type === 'TRUE_FALSE'

  const toggleCorrect = (key: string) => {
    const k = key.toUpperCase()
    if (multi) {
      onChange({
        correctKeys: question.correctKeys.includes(k)
          ? question.correctKeys.filter((c) => c !== k)
          : [...question.correctKeys, k],
      })
    } else {
      onChange({ correctKeys: question.correctKeys[0] === k ? [] : [k] })
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {multi ? 'Tick every correct option — all of them are needed for the mark.' : 'Tick the correct option.'}
      </p>
      <ul className="space-y-1.5">
        {question.options.map((option, index) => {
          const correct = question.correctKeys.includes(option.key.toUpperCase())
          return (
            <li key={index} className="flex items-center gap-2">
              <button
                type="button"
                role={multi ? 'checkbox' : 'radio'}
                aria-checked={correct}
                aria-label={`Mark option ${option.key} as correct`}
                onClick={() => toggleCorrect(option.key)}
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center border text-xs font-bold transition-colors',
                  multi ? 'rounded-md' : 'rounded-full',
                  correct
                    ? 'border-success bg-success text-success-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-success/60',
                )}
              >
                {correct ? <Check className="size-4" /> : option.key || '?'}
              </button>
              {fixed ? (
                <span className="flex-1 text-sm">{option.text}</span>
              ) : (
                <>
                  <Input
                    value={option.key}
                    maxLength={8}
                    disabled={locked}
                    aria-label={`Key for option ${index + 1}`}
                    className="h-8 w-16 text-center font-semibold uppercase"
                    onChange={(e) => {
                      const key = e.target.value.toUpperCase()
                      onChange({
                        options: question.options.map((o, i) => (i === index ? { ...o, key } : o)),
                      })
                    }}
                  />
                  <Input
                    value={option.text}
                    disabled={locked}
                    placeholder={`Option ${option.key}`}
                    aria-label={`Text for option ${option.key}`}
                    className="h-8 flex-1"
                    onChange={(e) =>
                      onChange({
                        options: question.options.map((o, i) => (i === index ? { ...o, text: e.target.value } : o)),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={locked || question.options.length <= 2}
                    aria-label={`Remove option ${option.key}`}
                    onClick={() =>
                      onChange({
                        options: question.options.filter((_, i) => i !== index),
                        correctKeys: question.correctKeys.filter((k) => k !== option.key.toUpperCase()),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          )
        })}
      </ul>
      {!fixed && !locked && (
        <Button
          variant="outline"
          size="sm"
          icon={<Plus />}
          onClick={() => onChange({ options: [...question.options, { key: optionKey(question.options.length), text: '' }] })}
        >
          Add option
        </Button>
      )}
    </div>
  )
}

function QuestionEditor({
  question,
  index,
  total,
  locked,
  error,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: {
  question: DraftQuestion
  index: number
  total: number
  locked: boolean
  error: string | null
  onChange: (patch: Partial<DraftQuestion>) => void
  onMove: (delta: -1 | 1) => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const meta = QUESTION_TYPE_META[question.question_type]
  const objective = isObjectiveType(question.question_type)
  const keyed = hasKey(question)

  const changeType = (type: QuestionType) => {
    const fresh = blankQuestion(type)
    onChange({
      question_type: type,
      options: isChoiceType(type)
        ? type === 'TRUE_FALSE'
          ? fresh.options
          : question.options.length >= 2 && question.question_type !== 'TRUE_FALSE'
            ? question.options
            : fresh.options
        : [],
      correctKeys: [],
      allowAttachments: type === 'FILE_UPLOAD' ? true : question.allowAttachments,
    })
  }

  return (
    <Card id={`question-${question.localId}`} className={cn('p-4 sm:p-5', error && 'border-danger/50')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary">
          {index + 1}
        </span>
        <Select value={question.question_type} onValueChange={(v) => changeType(v as QuestionType)} disabled={locked}>
          <SelectTrigger className="h-8 w-44" aria-label="Question type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUESTION_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {QUESTION_TYPE_META[type].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Input
            type="number"
            min={0.5}
            step="any"
            inputMode="decimal"
            value={question.marks}
            disabled={locked}
            aria-label="Marks"
            className="h-8 w-20 text-right"
            onChange={(e) => onChange({ marks: e.target.value })}
          />
          marks
        </label>
        {objective ? (
          <Badge tone={keyed ? 'success' : 'warning'} size="sm">
            <KeyRound />
            {keyed ? 'Key set' : 'No key yet'}
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm">
            Marked by hand
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" disabled={locked || index === 0} aria-label="Move up" onClick={() => onMove(-1)}>
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={locked || index === total - 1}
            aria-label="Move down"
            onClick={() => onMove(1)}
          >
            <ArrowDown />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={locked} aria-label="Duplicate question" onClick={onDuplicate}>
            <Copy />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={locked}
            aria-label="Delete question"
            className="text-danger hover:bg-danger/10"
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <Textarea
        value={question.text}
        disabled={locked}
        rows={2}
        placeholder={`Question ${index + 1}…`}
        aria-label={`Question ${index + 1} text`}
        className="mt-3"
        onChange={(e) => onChange({ text: e.target.value })}
      />

      <div className="mt-3 space-y-3">
        {isChoiceType(question.question_type) && (
          <ChoiceEditor question={question} locked={locked} onChange={onChange} />
        )}

        {question.question_type === 'SHORT_ANSWER' && (
          <div>
            <label className="text-xs font-medium" htmlFor={`accepted-${question.localId}`}>
              Accepted answers <span className="font-normal text-muted-foreground">— one per line, matched ignoring case and spacing</span>
            </label>
            <Textarea
              id={`accepted-${question.localId}`}
              value={question.acceptedAnswers}
              rows={2}
              placeholder={'photosynthesis\nphoto synthesis'}
              className="mt-1"
              onChange={(e) => onChange({ acceptedAnswers: e.target.value })}
            />
          </div>
        )}

        {question.question_type === 'NUMERIC' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium" htmlFor={`numeric-${question.localId}`}>
                Correct value
              </label>
              <Input
                id={`numeric-${question.localId}`}
                type="number"
                step="any"
                inputMode="decimal"
                value={question.numericAnswer}
                className="mt-1"
                onChange={(e) => onChange({ numericAnswer: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium" htmlFor={`tolerance-${question.localId}`}>
                Tolerance <span className="font-normal text-muted-foreground">(± accepted)</span>
              </label>
              <Input
                id={`tolerance-${question.localId}`}
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={question.tolerance}
                placeholder="0"
                className="mt-1"
                onChange={(e) => onChange({ tolerance: e.target.value })}
              />
            </div>
          </div>
        )}

        {(question.question_type === 'LONG_ANSWER' || question.question_type === 'FILE_UPLOAD') && (
          <p className="text-xs text-muted-foreground">{meta.description} You will award the marks on the grading screen.</p>
        )}

        <div>
          <label className="text-xs font-medium" htmlFor={`explain-${question.localId}`}>
            Explanation <span className="font-normal text-muted-foreground">— shown to students with their result</span>
          </label>
          <Textarea
            id={`explain-${question.localId}`}
            value={question.explanation}
            rows={1}
            placeholder="Why this is the answer (optional)"
            className="mt-1 min-h-9"
            onChange={(e) => onChange({ explanation: e.target.value })}
          />
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={question.required} disabled={locked} onCheckedChange={(v) => onChange({ required: v })} />
            Required
          </label>
          {question.question_type !== 'FILE_UPLOAD' && (
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={question.allowAttachments}
                disabled={locked}
                onCheckedChange={(v) => onChange({ allowAttachments: v })}
              />
              Allow a file with the answer
            </label>
          )}
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-danger" role="alert">
            <TriangleAlert className="size-3.5" />
            {error}
          </p>
        )}
      </div>
    </Card>
  )
}

// ----------------------------------------------------------------- builder

export function QuestionBuilder({
  exam,
  locked,
  lockedReason,
  onSaveForm,
  onSaveKey,
  saving,
}: {
  exam: ExamOut
  /** Scripts have been handed in: the paper is fixed, only the key may change. */
  locked: boolean
  lockedReason?: string
  onSaveForm: (questions: ExamQuestionIn[]) => Promise<unknown>
  onSaveKey: (answers: AnswerKeyItem[], regrade: boolean) => Promise<unknown>
  saving: boolean
}) {
  const [questions, setQuestions] = React.useState<DraftQuestion[]>(() => sortQuestions(exam.questions).map(fromQuestion))
  const [seededFrom, setSeededFrom] = React.useState(exam.updated_at ?? exam.created_at)
  const [dirty, setDirty] = React.useState(false)
  const [attempted, setAttempted] = React.useState(false)
  const [regrade, setRegrade] = React.useState(true)
  const [serverError, setServerError] = React.useState<string | null>(null)

  // Re-seed when the exam changes underneath us (a save landed, a refetch),
  // but never while there are unsaved edits — that would throw them away.
  React.useEffect(() => {
    const stamp = exam.updated_at ?? exam.created_at
    if (stamp !== seededFrom && !dirty) {
      setQuestions(sortQuestions(exam.questions).map(fromQuestion))
      setSeededFrom(stamp)
    }
  }, [exam, seededFrom, dirty])

  React.useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const edit = (updater: (prev: DraftQuestion[]) => DraftQuestion[]) => {
    setQuestions(updater)
    setDirty(true)
    setServerError(null)
  }

  const errors = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const q of questions) {
      const e = validateQuestion(q)
      if (e) map.set(q.localId, e)
    }
    return map
  }, [questions])

  const total = questionsTotal(questions.map((q) => ({ marks: Number(q.marks) || 0 })))
  const objective = questions.filter((q) => isObjectiveType(q.question_type))
  const keyed = objective.filter(hasKey)
  const mismatch = questions.length > 0 && Math.abs(total - exam.max_marks) > 0.001

  const add = (type: QuestionType) => {
    const fresh = blankQuestion(type)
    edit((prev) => [...prev, fresh])
    window.setTimeout(() => {
      document.getElementById(`question-${fresh.localId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  const save = async () => {
    setAttempted(true)
    setServerError(null)
    if (errors.size > 0) {
      const first = questions.find((q) => errors.has(q.localId))
      if (first) document.getElementById(`question-${first.localId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    try {
      if (locked) {
        const items = questions.map(toKeyItem).filter((k): k is AnswerKeyItem => k !== null)
        await onSaveKey(items, regrade)
      } else {
        await onSaveForm(questions.map((q, i) => toQuestionIn(q, i + 1)))
      }
      setDirty(false)
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Could not save.')
    }
  }

  const addMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" icon={<Plus />} disabled={locked}>
          Add question
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {QUESTION_TYPES.map((type) => (
          <DropdownMenuItem key={type} onSelect={() => add(type)}>
            <div>
              <p className="text-sm font-medium">{QUESTION_TYPE_META[type].label}</p>
              <p className="text-2xs text-muted-foreground">{QUESTION_TYPE_META[type].description}</p>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="space-y-4">
      {locked && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/8 p-4 text-sm">
          <LockKeyhole className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium">The paper is fixed</p>
            <p className="mt-0.5 text-muted-foreground">
              {lockedReason ?? 'Scripts have been handed in, so the questions cannot change.'} You can still set or
              correct the answer key and explanations below — saving re-marks every objective answer already handed in,
              and keeps any marks you awarded by hand.
            </p>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2 text-sm">
          <ListChecks className="size-4 text-primary" />
          <span className="font-semibold tabular-nums">{questions.length}</span>
          <span className="text-muted-foreground">{questions.length === 1 ? 'question' : 'questions'}</span>
        </div>
        <div className="text-sm">
          <span className="font-semibold tabular-nums">{formatMark(total)}</span>
          <span className="text-muted-foreground"> marks on the paper</span>
          {mismatch && (
            <Badge tone="warning" size="sm" className="ml-2">
              <TriangleAlert />
              exam is out of {formatMark(exam.max_marks)}
            </Badge>
          )}
        </div>
        {objective.length > 0 && (
          <Badge tone={keyed.length === objective.length ? 'success' : 'warning'} size="sm">
            <KeyRound />
            Key set for {keyed.length} of {objective.length}
          </Badge>
        )}
        {dirty && (
          <Badge tone="primary" size="sm" dot>
            Unsaved changes
          </Badge>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {locked && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={regrade} onCheckedChange={setRegrade} />
              Re-mark handed-in scripts
            </label>
          )}
          {addMenu}
          <Button variant="primary" icon={<Save />} loading={saving} disabled={!dirty && questions.length > 0} onClick={save}>
            {locked ? 'Save answer key' : 'Save paper'}
          </Button>
        </div>
      </div>

      {serverError && (
        <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger" role="alert">
          {serverError}
        </p>
      )}

      {mismatch && !locked && (
        <p className="text-xs text-muted-foreground">
          The exam is out of {formatMark(exam.max_marks)} but the questions add up to {formatMark(total)}. If the exam&rsquo;s
          maximum was left to default, saving the paper updates it; otherwise correct one or the other so percentages make
          sense.
        </p>
      )}

      {questions.length === 0 ? (
        <EmptyState
          icon={<FileQuestion />}
          title={exam.mode === 'OFFLINE' ? 'No question form' : 'No questions yet'}
          description={
            exam.mode === 'OFFLINE'
              ? 'An offline exam can run entirely from an uploaded question paper. Add questions here only if you want students to answer a form as well.'
              : 'Add the first question. Objective questions with a key are marked automatically when a script is handed in.'
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {(['MCQ', 'SHORT_ANSWER', 'LONG_ANSWER'] as QuestionType[]).map((type) => (
                <Button key={type} variant="outline" size="sm" icon={<Plus />} disabled={locked} onClick={() => add(type)}>
                  {QUESTION_TYPE_META[type].label}
                </Button>
              ))}
            </div>
          }
        />
      ) : (
        <div className="space-y-3">
          {questions.map((q, index) => (
            <QuestionEditor
              key={q.localId}
              question={q}
              index={index}
              total={questions.length}
              locked={locked}
              error={attempted ? (errors.get(q.localId) ?? null) : null}
              onChange={(patch) => edit((prev) => prev.map((p) => (p.localId === q.localId ? { ...p, ...patch } : p)))}
              onMove={(delta) =>
                edit((prev) => {
                  const next = [...prev]
                  const target = index + delta
                  if (target < 0 || target >= next.length) return prev
                  ;[next[index], next[target]] = [next[target], next[index]]
                  return next
                })
              }
              onDuplicate={() =>
                edit((prev) => {
                  const copy: DraftQuestion = { ...q, localId: nextLocalId(), id: null, options: q.options.map((o) => ({ ...o })) }
                  const next = [...prev]
                  next.splice(index + 1, 0, copy)
                  return next
                })
              }
              onRemove={() => edit((prev) => prev.filter((p) => p.localId !== q.localId))}
            />
          ))}
          <div className="flex justify-center py-2">{addMenu}</div>
        </div>
      )}
    </div>
  )
}

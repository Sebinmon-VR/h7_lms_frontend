import { AlertCircle, ArrowDown, ArrowUp, Check, Plus, Search, Trash2, X } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldGroup, FieldRow } from '@/components/forms/field'
import { EXPERIMENTS, type TestKind } from '@/pages/student/lab/engine/experiments'
import { REACTIONS, type VesselKind } from '@/pages/student/lab/engine/sim'
import { REAGENTS, type Reagent } from '@/pages/student/lab/engine/substances'
import {
  CHECK_LABEL,
  CHECK_TYPES,
  EQUIPMENT_KINDS,
  EQUIPMENT_LABEL,
  REACTION_BY_ID,
  SHELF_LABEL,
  SHELVES,
  resultLabels,
  TEST_KINDS,
  TEST_LABEL,
  VESSEL_KINDS,
  VESSEL_LABEL,
  draftFrom,
  newQuestion,
  newStep,
  questionProblem,
  stepProblem,
  type CheckType,
  type DraftCheck,
  type DraftQuestion,
  type DraftStep,
  type ExperimentDraft,
} from './model'

const EMOJI_SUGGESTIONS = ['🧪', '⚗️', '💥', '🔥', '🌈', '🫧', '🧫', '🌡️', '💧', '🧂', '🧲', '🍋']
const ANY = '__any'

const REAGENT_OPTIONS = REAGENTS.map((r) => ({
  value: r.id,
  label: r.label,
  hint: `${SHELF_LABEL[r.shelf]}${r.hazard ? ` · ${r.hazard}` : ''}`,
}))
// A few reactions share a name (two starch tests, three peroxide ones); the
// combobox matches on label, so number the repeats.
const REACTION_OPTIONS = (() => {
  const seen: Record<string, number> = {}
  const total: Record<string, number> = {}
  REACTIONS.forEach((r) => (total[r.name] = (total[r.name] ?? 0) + 1))
  return REACTIONS.map((r) => {
    seen[r.name] = (seen[r.name] ?? 0) + 1
    const label = total[r.name] > 1 ? `${r.name} (${seen[r.name]})` : r.name
    return { value: r.id, label, hint: r.equation }
  })
})()

/**
 * The "build your own" form. Controlled: the parent owns the draft so the
 * set and edit dialogs can both save it.
 */
export function ExperimentBuilder({
  value,
  onChange,
  idPrefix = 'lab-build',
}: {
  value: ExperimentDraft
  onChange: (next: ExperimentDraft) => void
  idPrefix?: string
}) {
  const d = value
  const patch = (p: Partial<ExperimentDraft>) => onChange({ ...d, ...p })
  const id = (s: string) => `${idPrefix}-${s}`

  const setStep = (key: string, p: Partial<DraftStep>) =>
    patch({ steps: d.steps.map((s) => (s.key === key ? { ...s, ...p } : s)) })
  const moveStep = (i: number, delta: -1 | 1) => {
    const steps = [...d.steps]
    const j = i + delta
    if (j < 0 || j >= steps.length) return
    ;[steps[i], steps[j]] = [steps[j], steps[i]]
    patch({ steps })
  }
  const setQuestion = (key: string, p: Partial<DraftQuestion>) =>
    patch({ questions: d.questions.map((q) => (q.key === key ? { ...q, ...p } : q)) })

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-3 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          Start from a library experiment and tweak it, or fill in the form from scratch.
        </p>
        <div className="sm:w-64">
          <Combobox
            id={id('start-from')}
            value={null}
            onChange={(v) => {
              const e = EXPERIMENTS.find((x) => x.id === v)
              if (e) onChange(draftFrom(e))
            }}
            placeholder="Start from a library experiment"
            searchPlaceholder="Search the library…"
            options={EXPERIMENTS.map((e) => ({ value: e.id, label: `${e.emoji} ${e.title}`, hint: e.topic }))}
          />
        </div>
      </div>

      <FieldGroup title="About the experiment">
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <Field id={id('title')} label="Title" required>
            <Input
              id={id('title')}
              value={d.title}
              onChange={(e) => patch({ title: e.target.value })}
              maxLength={160}
              placeholder="e.g. Which metal is most reactive?"
            />
          </Field>
          <Field id={id('emoji')} label="Emoji">
            <Input id={id('emoji')} value={d.emoji} onChange={(e) => patch({ emoji: e.target.value })} maxLength={8} />
          </Field>
        </div>
        <div className="-mt-2 flex flex-wrap gap-1" aria-label="Emoji suggestions">
          {EMOJI_SUGGESTIONS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => patch({ emoji: em })}
              className={cn(
                'flex size-8 items-center justify-center rounded-md border text-base transition-colors',
                d.emoji === em ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted',
              )}
              aria-label={`Use ${em}`}
            >
              {em}
            </button>
          ))}
        </div>
        <FieldRow columns={3}>
          <Field id={id('topic')} label="Topic">
            <Input id={id('topic')} value={d.topic} onChange={(e) => patch({ topic: e.target.value })} placeholder="e.g. Metals" />
          </Field>
          <Field id={id('grades')} label="Grades">
            <Input id={id('grades')} value={d.grades} onChange={(e) => patch({ grades: e.target.value })} placeholder="7–10" />
          </Field>
          <Field id={id('minutes')} label="Minutes">
            <Input
              id={id('minutes')}
              type="number"
              min={1}
              max={120}
              value={d.minutes || ''}
              onChange={(e) => patch({ minutes: Number(e.target.value) || 0 })}
            />
          </Field>
        </FieldRow>
        <Field id={id('aim')} label="Aim" hint="One sentence: what the student will find out.">
          <Textarea id={id('aim')} value={d.aim} onChange={(e) => patch({ aim: e.target.value })} className="min-h-16" />
        </Field>
        <Field id={id('theory')} label="Theory" hint="Shown before they start. Equations are welcome.">
          <Textarea id={id('theory')} value={d.theory} onChange={(e) => patch({ theory: e.target.value })} className="min-h-20" />
        </Field>
        <Field id={id('safety')} label="Safety notes" hint="One per line.">
          <Textarea
            id={id('safety')}
            value={d.safety}
            onChange={(e) => patch({ safety: e.target.value })}
            className="min-h-16"
            placeholder="Wear goggles — the acid is corrosive."
          />
        </Field>
      </FieldGroup>

      <FieldGroup
        title="Equipment"
        description="What's on the shelf. Anything your steps need is added when you save."
      >
        <div className="flex flex-wrap gap-1.5">
          {EQUIPMENT_KINDS.map((k) => {
            const on = d.equipment.includes(k)
            return (
              <Chip
                key={k}
                on={on}
                onClick={() => patch({ equipment: on ? d.equipment.filter((x) => x !== k) : [...d.equipment, k] })}
              >
                {EQUIPMENT_LABEL[k]}
              </Chip>
            )
          })}
        </div>
      </FieldGroup>

      <FieldGroup
        title="Chemicals"
        description="The bottles and jars students get. Chemicals your steps ask for are added when you save."
      >
        <ChemicalPicker value={d.reagents} onChange={(reagents) => patch({ reagents })} />
      </FieldGroup>

      <FieldGroup title={`Steps (${d.steps.length})`} description="The bench ticks each step off when the student does it.">
        <ol className="space-y-3">
          {d.steps.map((s, i) => (
            <StepEditor
              key={s.key}
              step={s}
              index={i}
              count={d.steps.length}
              idPrefix={id(`step-${s.key}`)}
              onChange={(p) => setStep(s.key, p)}
              onMove={(delta) => moveStep(i, delta)}
              onRemove={() => patch({ steps: d.steps.filter((x) => x.key !== s.key) })}
            />
          ))}
        </ol>
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={<Plus />}
          disabled={d.steps.length >= 30}
          onClick={() => patch({ steps: [...d.steps, newStep()] })}
        >
          Add a step
        </Button>
      </FieldGroup>

      <FieldGroup
        title={`Quiz (${d.questions.length})`}
        description="Optional. Asked once the steps are done; the score is what you see in the results."
      >
        {d.questions.length > 0 && (
          <ol className="space-y-3">
            {d.questions.map((q, i) => (
              <QuestionEditor
                key={q.key}
                question={q}
                index={i}
                idPrefix={id(`q-${q.key}`)}
                onChange={(p) => setQuestion(q.key, p)}
                onRemove={() => patch({ questions: d.questions.filter((x) => x.key !== q.key) })}
              />
            ))}
          </ol>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={<Plus />}
          disabled={d.questions.length >= 20}
          onClick={() => patch({ questions: [...d.questions, newQuestion()] })}
        >
          Add a question
        </Button>
      </FieldGroup>
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        on ? 'border-primary/40 bg-primary/12 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      {on && <Check className="size-3" />}
      {children}
    </button>
  )
}

function ChemicalPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [search, setSearch] = React.useState('')
  const needles = search.toLowerCase().split(/\s+/).filter(Boolean)
  const match = (r: Reagent) => needles.every((n) => `${r.label} ${r.shelf}`.toLowerCase().includes(n))
  const toggle = (rid: string) => onChange(value.includes(rid) ? value.filter((x) => x !== rid) : [...value, rid])

  return (
    <div className="space-y-2.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((rid) => (
            <Badge key={rid} tone="primary" size="sm" className="pr-1">
              {REAGENTS.find((r) => r.id === rid)?.label ?? rid}
              <button
                type="button"
                onClick={() => toggle(rid)}
                className="rounded-full p-0.5 hover:bg-primary/15"
                aria-label={`Remove ${rid}`}
              >
                <X />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search chemicals"
        leading={<Search />}
        aria-label="Search chemicals"
      />
      <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-border p-2.5">
        {SHELVES.map((shelf) => {
          const items = REAGENTS.filter((r) => r.shelf === shelf && match(r))
          if (items.length === 0) return null
          return (
            <div key={shelf}>
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{SHELF_LABEL[shelf]}</p>
              <div className="flex flex-wrap gap-1.5">
                {items.map((r) => (
                  <Chip key={r.id} on={value.includes(r.id)} onClick={() => toggle(r.id)}>
                    {r.label}
                    {r.hazard && <span className="text-warning" title={r.hazard}>⚠</span>}
                  </Chip>
                ))}
              </div>
            </div>
          )
        })}
        {REAGENTS.every((r) => !match(r)) && (
          <p className="py-4 text-center text-sm text-muted-foreground">No chemicals match.</p>
        )}
      </div>
    </div>
  )
}

function StepEditor({
  step,
  index,
  count,
  idPrefix,
  onChange,
  onMove,
  onRemove,
}: {
  step: DraftStep
  index: number
  count: number
  idPrefix: string
  onChange: (p: Partial<DraftStep>) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}) {
  const c = step.check
  const setCheck = (p: Partial<DraftCheck>) => onChange({ check: { ...c, ...p } })
  const problem = stepProblem(step)
  const reaction = c.reaction ? REACTION_BY_ID[c.reaction] : null

  return (
    <li className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold tabular-nums text-primary">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium">Step {index + 1}</span>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move step up">
          <ArrowUp />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onMove(1)}
          disabled={index === count - 1}
          aria-label="Move step down"
        >
          <ArrowDown />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} disabled={count === 1} aria-label="Remove step">
          <Trash2 />
        </Button>
      </div>

      <div className="space-y-3">
        <Input
          id={`${idPrefix}-text`}
          value={step.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Instruction, e.g. Add 10 mL of hydrochloric acid to the test tube."
          aria-label={`Step ${index + 1} instruction`}
        />
        <Input
          id={`${idPrefix}-hint`}
          value={step.hint}
          onChange={(e) => onChange({ hint: e.target.value })}
          placeholder="Hint if they get stuck (optional)"
          aria-label={`Step ${index + 1} hint`}
        />

        <div className="space-y-3 rounded-md bg-muted/30 p-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">How the lab checks it</p>
            <Select value={c.type} onValueChange={(v) => setCheck({ type: v as CheckType })}>
              <SelectTrigger aria-label="How the lab checks it">
                <SelectValue placeholder="Choose a check" />
              </SelectTrigger>
              <SelectContent>
                {CHECK_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {CHECK_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {c.type === 'add' && (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <Combobox
                id={`${idPrefix}-reagent`}
                value={c.reagent || null}
                onChange={(v) => setCheck({ reagent: v })}
                placeholder="Which chemical?"
                searchPlaceholder="Search chemicals…"
                options={REAGENT_OPTIONS}
              />
              <Select value={c.into || ANY} onValueChange={(v) => setCheck({ into: v === ANY ? '' : (v as VesselKind) })}>
                <SelectTrigger aria-label="Into which vessel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Into any vessel</SelectItem>
                  {VESSEL_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      Into a {VESSEL_LABEL[k].toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {c.type === 'reaction' && (
            <div className="space-y-1.5">
              <Combobox
                id={`${idPrefix}-reaction`}
                value={c.reaction || null}
                onChange={(v) => setCheck({ reaction: v })}
                placeholder="Which reaction?"
                searchPlaceholder="Search reactions…"
                options={REACTION_OPTIONS}
              />
              {reaction && (
                <p className="break-words rounded bg-card px-2.5 py-1.5 font-mono text-xs">{reaction.equation}</p>
              )}
            </div>
          )}

          {c.type === 'test' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Select value={c.test} onValueChange={(v) => setCheck({ test: v as TestKind, result: '' })}>
                <SelectTrigger aria-label="Which test">
                  <SelectValue placeholder="Which test?" />
                </SelectTrigger>
                <SelectContent>
                  {TEST_KINDS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TEST_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {resultLabels(c.test) && (
                <Select value={c.result || ANY} onValueChange={(v) => setCheck({ result: v === ANY ? '' : v })}>
                  <SelectTrigger aria-label="Expected result">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Any result</SelectItem>
                    {Object.entries(resultLabels(c.test) ?? {}).map(([v, label]) => (
                      <SelectItem key={v} value={v}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {c.type === 'place' && (
            <Select value={c.equipment} onValueChange={(v) => setCheck({ equipment: v as DraftCheck['equipment'] })}>
              <SelectTrigger aria-label="Which equipment">
                <SelectValue placeholder="Which equipment?" />
              </SelectTrigger>
              <SelectContent>
                {EQUIPMENT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {EQUIPMENT_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(c.type === 'temp' || c.type === 'ph') && (
            <div className="grid grid-cols-2 gap-3">
              <NumberBox
                id={`${idPrefix}-above`}
                label={c.type === 'temp' ? 'Above (°C)' : 'pH above'}
                value={c.above}
                onChange={(above) => setCheck({ above })}
              />
              <NumberBox
                id={`${idPrefix}-below`}
                label={c.type === 'temp' ? 'Below (°C)' : 'pH below'}
                value={c.below}
                onChange={(below) => setCheck({ below })}
              />
              <p className="col-span-2 text-xs text-muted-foreground">
                Fill one or both. {c.type === 'ph' ? 'Neutral is about 6.5 to 7.5.' : 'Room temperature is about 20 °C.'}
              </p>
            </div>
          )}

          {(c.type === 'heat' || c.type === 'connect') && (
            <p className="text-xs text-muted-foreground">
              {c.type === 'heat'
                ? 'Done as soon as the student lights the burner under a vessel.'
                : 'Done as soon as the student connects a delivery tube between two vessels.'}
            </p>
          )}
        </div>

        {problem && <Problem>{problem}</Problem>}
      </div>
    </li>
  )
}

function NumberBox({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <Input id={id} type="number" step="any" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function QuestionEditor({
  question: q,
  index,
  idPrefix,
  onChange,
  onRemove,
}: {
  question: DraftQuestion
  index: number
  idPrefix: string
  onChange: (p: Partial<DraftQuestion>) => void
  onRemove: () => void
}) {
  const problem = questionProblem(q)
  const setOption = (i: number, text: string) => onChange({ options: q.options.map((o, j) => (j === i ? text : o)) })
  const removeOption = (i: number) => {
    const options = q.options.filter((_, j) => j !== i)
    // Keep the right answer pointing at the same option after the shift.
    const answer = q.answer == null || q.answer === i ? null : q.answer > i ? q.answer - 1 : q.answer
    onChange({ options, answer })
  }

  return (
    <li className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium">Question {index + 1}</span>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove question">
          <Trash2 />
        </Button>
      </div>
      <div className="space-y-3">
        <Input
          id={`${idPrefix}-q`}
          value={q.q}
          onChange={(e) => onChange({ q: e.target.value })}
          placeholder="Question"
          aria-label={`Question ${index + 1}`}
        />
        <div className="space-y-2" role="radiogroup" aria-label="Options; pick the correct one">
          {q.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${idPrefix}-answer`}
                checked={q.answer === i}
                onChange={() => onChange({ answer: i })}
                className="size-4 shrink-0 accent-[hsl(var(--success))]"
                aria-label={`Option ${i + 1} is correct`}
              />
              <Input
                value={o}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                aria-label={`Option ${i + 1}`}
                className={cn(q.answer === i && 'border-success/50')}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeOption(i)}
                disabled={q.options.length <= 2}
                aria-label={`Remove option ${i + 1}`}
              >
                <X />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {q.options.length < 4 && (
              <Button type="button" variant="link" size="xs" className="px-0" onClick={() => onChange({ options: [...q.options, ''] })}>
                Add an option
              </Button>
            )}
            <span className="text-xs text-muted-foreground">Tick the circle next to the right answer.</span>
          </div>
        </div>
        <Input
          id={`${idPrefix}-explain`}
          value={q.explain}
          onChange={(e) => onChange({ explain: e.target.value })}
          placeholder="Explanation shown after answering (optional)"
          aria-label="Explanation"
        />
        {problem && <Problem>{problem}</Problem>}
      </div>
    </li>
  )
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-warning">
      <AlertCircle className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

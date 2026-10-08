import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, BookOpen, Check, ChevronDown, Clock, GraduationCap, Lightbulb, ListChecks, RotateCcw, ShieldAlert, Star, X } from 'lucide-react'
import * as React from 'react'

import { ArenaButton, ArenaChip, Art3D, GameTitle, Panel, SectionTitle } from '@/components/arena/arena-theme'
import { cn } from '@/lib/cn'
import { EXPERIMENTS, type Experiment, type ExperimentStep } from './engine/experiments'
import { REACTIONS } from './engine/sim'
import { REAGENT_BY_ID } from './engine/substances'
import { SHELF } from './useLabSim'

/**
 * Guided experiments: the picker, the step tracker, the quiz at the end and
 * the results screen.
 */

export interface Run {
  id: string
  step: number
  phase: 'steps' | 'quiz' | 'done'
  score: number
}

const kitName = (k: string) => SHELF.find((s) => s.equipment === k)?.name.toLowerCase() ?? k
const vesselName = (k: string) => kitName(k)

/** A hint for any step, from its check, when the experiment does not give one. */
export function hintFor(step: ExperimentStep): string {
  const c = step.check
  const own = step.hint ? `${step.hint} ` : ''
  switch (c.type) {
    case 'place':
      return own + `Drag the ${kitName(c.equipment)} from the equipment shelf onto the bench, or tap it on the shelf.`
    case 'add':
      return own + `Drag the ${REAGENT_BY_ID[c.reagent]?.label ?? 'right'} bottle onto ${c.into ? `the ${vesselName(c.into)}` : 'a vessel'}, then pick an amount. No ${c.into ? vesselName(c.into) : 'vessel'} yet? Get one from the equipment shelf first.`
    case 'heat':
      return own + 'Drag the vessel onto the Bunsen burner, then tap the burner to light it.'
    case 'connect':
      return own + 'Tap the vessel making the gas, choose “Delivery tube”, then tap the vessel to bubble it into.'
    case 'test':
      switch (c.test) {
        case 'splint-glowing':
          return own + 'Tap the splint, switch it to “Glowing”, then drag it to the mouth of the vessel.'
        case 'splint-burning':
          return own + 'Get a splint (it starts burning) and drag it to the mouth of the vessel.'
        case 'litmus-red':
        case 'litmus-blue':
          return own + 'Drag the litmus paper into the vessel.'
        case 'flame':
          return own + 'Drag the loop into the solution to pick some up, then drag it into the lit burner flame.'
        case 'thermometer':
          return own + 'Drag the thermometer from the shelf into the vessel.'
      }
      return own
    case 'reaction': {
      const r = REACTIONS.find((x) => x.id === c.reaction)
      return own + (r ? `Mix the right things and watch closely — you are looking for: ${r.name.toLowerCase()}.` : 'Mix the right things and watch closely.')
    }
    case 'temp':
      return own + (c.above != null ? `Keep going until the thermometer reads above ${c.above} °C.` : `Keep going until the thermometer reads below ${c.below} °C.`)
    case 'ph':
      return own + `Aim for a pH between ${c.above ?? 0} and ${c.below ?? 14}. Tap the vessel to see its pH.`
  }
}

// ------------------------------------------------------------------ picker

export interface AssignedExperiment {
  assignmentId: number
  experimentId: string
  title: string
  emoji: string
  topic: string
  instructions: string | null
  dueAt: string | null
  best: { score: number; total: number } | null
}

export function ExperimentPicker({
  onPick,
  onClose,
  assigned = [],
  onPickAssigned,
}: {
  onPick: (id: string) => void
  onClose: () => void
  assigned?: AssignedExperiment[]
  onPickAssigned?: (a: AssignedExperiment) => void
}) {
  return (
    <div className="flex h-full flex-col">
      <style>{`@keyframes lab-rise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } } .lab-rise { animation: lab-rise .32s ease-out both } @media (prefers-reduced-motion: reduce) { .lab-rise { animation: none } }`}</style>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <GameTitle className="text-xl sm:text-2xl">Guided experiments</GameTitle>
          <p className="mt-1 text-xs text-muted-foreground">Follow the steps on a real bench, then answer a few questions.</p>
        </div>
        <ArenaButton variant="secondary" size="sm" onClick={onClose}>
          <X />
          Free lab
        </ArenaButton>
      </div>
      <div className="no-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {assigned.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-primary">Set by your teacher</p>
            <div className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 xl:grid-cols-3">
              {assigned.map((a) => {
                const due = a.dueAt ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(a.dueAt) ? a.dueAt : `${a.dueAt}Z`) : null
                const late = !!due && due.getTime() < Date.now() && !a.best
                return (
                  <Panel key={a.assignmentId} asChild interactive glow={a.best ? undefined : 'primary'} className="block w-full p-3 text-left">
                    <button type="button" onClick={() => onPickAssigned?.(a)}>
                      <div className="flex items-start gap-3">
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-2xl shadow-inner">{a.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black leading-tight text-foreground">{a.title}</p>
                          <p className="mt-0.5 text-[11px] font-semibold text-primary">{a.topic}</p>
                          {a.instructions && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.instructions}</p>}
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
                            {a.best ? (
                              <span className="rounded-md bg-success/15 px-1.5 py-0.5 text-success">
                                Done · {a.best.score}/{a.best.total}
                              </span>
                            ) : (
                              <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-primary">To do</span>
                            )}
                            {due && (
                              <span className={cn('rounded-md px-1.5 py-0.5', late ? 'bg-warning/15 text-warning' : 'bg-foreground/[0.06] text-muted-foreground')}>
                                {late ? 'Was due ' : 'Due '}
                                {due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  </Panel>
                )
              })}
            </div>
            <p className="mb-2 mt-5 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">All experiments</p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 xl:grid-cols-3">
          {EXPERIMENTS.map((e, i) => (
            <div key={e.id} className="lab-rise" style={{ animationDelay: `${i * 25}ms` }}>
              <Panel asChild interactive className="block w-full p-3 text-left">
                <button type="button" onClick={() => onPick(e.id)}>
                  <div className="flex items-start gap-3">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl shadow-inner">{e.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black leading-tight text-foreground">{e.title}</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-primary">{e.topic}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{e.aim}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold text-muted-foreground">
                        <span className="inline-flex items-center gap-1 rounded-md bg-foreground/[0.06] px-1.5 py-0.5">
                          <GraduationCap className="size-3" />
                          Grades {e.grades}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-foreground/[0.06] px-1.5 py-0.5">
                          <Clock className="size-3" />
                          {e.minutes} min
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-foreground/[0.06] px-1.5 py-0.5">
                          <ListChecks className="size-3" />
                          {e.steps.length} steps
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              </Panel>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ HUD

/** The current objective, above the bench. */
export function StepHud({ exp, run, onQuiz, onOpenGuide }: { exp: Experiment; run: Run; onQuiz: () => void; onOpenGuide?: () => void }) {
  const [hint, setHint] = React.useState(false)
  const reduce = useReducedMotion()
  React.useEffect(() => setHint(false), [run.step])
  const total = exp.steps.length
  const allDone = run.step >= total
  const step = exp.steps[run.step]
  return (
    <Panel className={cn('flex flex-col gap-1.5 px-3 py-2', allDone && 'ring-2 ring-success/60')}>
      <div className="flex items-center gap-3">
        <span className="hidden text-xl sm:block" aria-hidden>
          {exp.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-primary">{allDone ? 'All steps done' : `Step ${run.step + 1} of ${total}`}</span>
            <div className="flex gap-1" aria-hidden>
              {exp.steps.map((_, i) => (
                <span key={i} className={cn('h-1.5 w-4 rounded-full transition-colors', i < run.step ? 'bg-success' : i === run.step ? 'bg-primary' : 'bg-foreground/15')} />
              ))}
            </div>
          </div>
          <motion.p
            key={run.step}
            initial={reduce ? false : { opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18 }}
            className="truncate text-sm font-bold text-foreground sm:whitespace-normal"
            aria-live="polite"
          >
            {allDone ? 'Great work — now show what you learned.' : step.text}
          </motion.p>
        </div>
        {allDone ? (
          <ArenaButton variant="success" size="sm" onClick={onQuiz}>
            Take the quiz
            <ArrowRight />
          </ArenaButton>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <ArenaButton variant={hint ? 'primary' : 'secondary'} size="sm" onClick={() => setHint((h) => !h)} aria-expanded={hint}>
              <Lightbulb />
              <span className="hidden sm:inline">Hint</span>
            </ArenaButton>
            {onOpenGuide && (
              <ArenaButton variant="ghost" size="sm" onClick={onOpenGuide} aria-label="Open the experiment guide">
                <BookOpen />
              </ArenaButton>
            )}
          </div>
        )}
      </div>
      {hint && step && <p className="rounded-lg bg-warning/10 px-2.5 py-1.5 text-xs leading-snug text-foreground">{hintFor(step)}</p>}
    </Panel>
  )
}

// ------------------------------------------------------------------ guide panel

export function GuidePanel({ exp, run, onQuiz, onExit, onRestart }: { exp: Experiment; run: Run; onQuiz: () => void; onExit: () => void; onRestart: () => void }) {
  const [theory, setTheory] = React.useState(false)
  const [hintAt, setHintAt] = React.useState<number | null>(null)
  const allDone = run.step >= exp.steps.length
  return (
    <div className="no-scrollbar -mx-1 h-full min-h-0 overflow-y-auto px-1">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl">{exp.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black leading-tight text-foreground">{exp.title}</p>
          <p className="text-[11px] font-semibold text-primary">{exp.topic}</p>
        </div>
        <ArenaButton variant="ghost" size="sm" onClick={onExit} aria-label="Choose another experiment">
          <X />
        </ArenaButton>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-foreground/90">
        <span className="font-bold text-foreground">Aim. </span>
        {exp.aim}
      </p>

      {exp.safety.length > 0 && (
        <div className="mb-3 rounded-xl bg-warning/10 p-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-warning">
            <ShieldAlert className="size-3.5" />
            Safety
          </div>
          <ul className="space-y-0.5 text-xs text-foreground/90">
            {exp.safety.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() => setTheory((t) => !t)}
        aria-expanded={theory}
        className="mb-3 flex w-full items-center justify-between rounded-xl bg-foreground/[0.05] px-2.5 py-2 text-left text-xs font-bold text-foreground transition-colors hover:bg-foreground/[0.08]"
      >
        <span className="flex items-center gap-1.5">
          <BookOpen className="size-3.5 text-primary" />
          Theory
        </span>
        <ChevronDown className={cn('size-4 transition-transform', theory && 'rotate-180')} />
      </button>
      {theory && <p className="-mt-1.5 mb-3 px-1 text-xs leading-relaxed text-foreground/85">{exp.theory}</p>}

      <SectionTitle title="Method" icon={<ListChecks />} action={<span className="text-[11px] font-bold tabular-nums text-muted-foreground">{Math.min(run.step, exp.steps.length)}/{exp.steps.length}</span>} />
      <ol className="space-y-1.5">
        {exp.steps.map((st, i) => {
          const done = i < run.step
          const current = i === run.step
          return (
            <li key={i} className={cn('rounded-xl p-2 transition-colors', current ? 'bg-primary/10 ring-1 ring-primary/35' : done ? 'bg-success/[0.07]' : 'bg-foreground/[0.03]')}>
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black',
                    done ? 'bg-success text-success-foreground' : current ? 'bg-primary text-primary-foreground' : 'bg-foreground/10 text-muted-foreground',
                  )}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                <p className={cn('min-w-0 flex-1 text-xs leading-snug', done ? 'text-muted-foreground' : 'text-foreground', current && 'font-semibold')}>{st.text}</p>
                {current && (
                  <button type="button" onClick={() => setHintAt(hintAt === i ? null : i)} className="shrink-0 rounded-md p-1 text-warning hover:bg-warning/15" aria-label="Show a hint" aria-expanded={hintAt === i}>
                    <Lightbulb className="size-3.5" />
                  </button>
                )}
              </div>
              {current && hintAt === i && <p className="ml-7 mt-1.5 text-[11px] leading-snug text-foreground/80">{hintFor(st)}</p>}
            </li>
          )
        })}
      </ol>

      <div className="mt-3 flex flex-wrap gap-2 pb-2">
        {allDone && run.phase === 'steps' && (
          <ArenaButton variant="success" size="sm" onClick={onQuiz}>
            Take the quiz
            <ArrowRight />
          </ArenaButton>
        )}
        <ArenaButton variant="ghost" size="sm" onClick={onRestart}>
          <RotateCcw />
          Start over
        </ArenaButton>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ quiz

export function Quiz({ exp, onFinish, onBack }: { exp: Experiment; onFinish: (score: number) => void; onBack: () => void }) {
  const [i, setI] = React.useState(0)
  const [picked, setPicked] = React.useState<number | null>(null)
  const [score, setScore] = React.useState(0)
  const reduce = useReducedMotion()
  const q = exp.questions[i]
  if (!q) return null
  const last = i === exp.questions.length - 1
  const answered = picked != null
  const right = picked === q.answer

  const choose = (k: number) => {
    if (answered) return
    setPicked(k)
    if (k === q.answer) setScore((s) => s + 1)
  }
  const next = () => {
    if (last) onFinish(score)
    else {
      setI(i + 1)
      setPicked(null)
    }
  }

  return (
    <Panel className="w-full max-w-md p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-[0.14em] text-primary">
          Question {i + 1} of {exp.questions.length}
        </span>
        <ArenaButton variant="ghost" size="sm" onClick={onBack}>
          Back to bench
        </ArenaButton>
      </div>
      <motion.div key={i} initial={reduce ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }}>
          <p className="mb-3 text-base font-black leading-snug text-foreground">{q.q}</p>
          <div className="space-y-1.5">
            {q.options.map((o, k) => {
              const isAnswer = k === q.answer
              const isPicked = k === picked
              return (
                <button
                  key={o}
                  type="button"
                  disabled={answered}
                  onClick={() => choose(k)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    !answered && 'bg-foreground/[0.05] text-foreground hover:bg-primary/10',
                    answered && isAnswer && 'bg-success/15 text-success ring-1 ring-success/50',
                    answered && isPicked && !isAnswer && 'bg-danger/10 text-danger ring-1 ring-danger/40',
                    answered && !isAnswer && !isPicked && 'bg-foreground/[0.03] text-muted-foreground',
                  )}
                >
                  {o}
                  {answered && isAnswer && <Check className="size-4 shrink-0" />}
                  {answered && isPicked && !isAnswer && <X className="size-4 shrink-0" />}
                </button>
              )
            })}
          </div>
          {answered && (
            <div className={cn('mt-3 rounded-xl px-3 py-2 text-xs leading-snug', right ? 'bg-success/10 text-foreground' : 'bg-danger/10 text-foreground')}>
              <span className={cn('font-black', right ? 'text-success' : 'text-danger')}>{right ? 'Correct! ' : 'Not quite. '}</span>
              {q.explain ?? (right ? 'Well observed.' : `The answer is “${q.options[q.answer]}”.`)}
            </div>
          )}
      </motion.div>
      <div className="mt-4 flex justify-end">
        <ArenaButton variant="primary" disabled={!answered} onClick={next} autoFocus={answered}>
          {last ? 'Finish' : 'Next'}
          <ArrowRight />
        </ArenaButton>
      </div>
    </Panel>
  )
}

// ------------------------------------------------------------------ results

export function Completion({ exp, score, total, onAgain, onPick, onFree }: { exp: Experiment; score: number; total: number; onAgain: () => void; onPick: () => void; onFree: () => void }) {
  const reduce = useReducedMotion()
  const ratio = total ? score / total : 1
  const stars = ratio >= 0.99 ? 3 : ratio >= 0.5 ? 2 : 1
  return (
    <Panel className="w-full max-w-sm p-5 text-center">
      <motion.div initial={reduce ? false : { scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
        <Art3D name={stars === 3 ? 'trophy' : stars === 2 ? 'medal_2' : 'medal_3'} className="mx-auto size-24" float />
      </motion.div>
      <GameTitle as="h2" className="mt-2 text-2xl">
        Experiment complete
      </GameTitle>
      <p className="mt-1 text-xs font-semibold text-muted-foreground">{exp.title}</p>
      <div className="my-3 flex justify-center gap-1.5" aria-label={`${stars} of 3 stars`}>
        {[0, 1, 2].map((k) => (
          <motion.span key={k} initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ delay: reduce ? 0 : 0.25 + k * 0.12, type: 'spring', stiffness: 400, damping: 14 }}>
            <Star className={cn('size-8', k < stars ? 'fill-warning text-warning' : 'text-foreground/15')} />
          </motion.span>
        ))}
      </div>
      <p className="text-3xl font-black tabular-nums text-foreground">
        {score}
        <span className="text-lg text-muted-foreground">/{total}</span>
      </p>
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">quiz score</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <ArenaButton variant="primary" size="sm" onClick={onPick}>
          Another experiment
        </ArenaButton>
        <ArenaButton variant="secondary" size="sm" onClick={onAgain}>
          <RotateCcw />
          Repeat
        </ArenaButton>
        <ArenaChip onClick={onFree}>Free lab</ArenaChip>
      </div>
    </Panel>
  )
}

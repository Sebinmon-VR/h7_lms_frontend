import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, Flame, Lightbulb, Timer, X } from 'lucide-react'
import type * as React from 'react'

import type { ArenaAnswerResult, ArenaMatchPlayer, ArenaMatchView, ArenaOption } from '@/api/arena.types'
import { Label, Panel } from '@/components/arena/arena-theme'
import { ArenaAvatar, DIFFICULTY_LABEL } from '@/components/arena/arena-ui'
import { cn } from '@/lib/cn'
import { RollingNumber } from './battle-players'
import { OPTION_ACCENTS, OPTION_LETTERS, rankTone } from './helpers'

export interface AnswerState {
  round: number
  key: string
  result?: ArenaAnswerResult
  late?: boolean
  error?: string
}

const TRUE_FALSE_DEFAULT: ArenaOption[] = [
  { key: 'TRUE', text: 'True' },
  { key: 'FALSE', text: 'False' },
]

export function roundOptions(view: ArenaMatchView): ArenaOption[] {
  const q = view.question
  if (!q) return []
  if (q.question_type === 'TRUE_FALSE' && q.options.length === 0) return TRUE_FALSE_DEFAULT
  return q.options
}

const SHAKE = { x: [0, -7, 7, -5, 5, -2, 0] }
const POP = { scale: [1, 1.045, 1] }

type TileState = 'idle' | 'mine' | 'mine-correct' | 'mine-wrong' | 'correct' | 'faded'

const TILE_CLASS: Record<TileState, string> = {
  idle: 'border-border bg-card shadow-[0_3px_0_0_hsl(var(--border))] enabled:hover:border-primary/50',
  mine: 'border-primary bg-primary/10 shadow-[0_0_0_3px_hsl(var(--primary)/0.2),0_8px_24px_-8px_hsl(var(--primary)/0.6)]',
  'mine-correct': 'border-success bg-success/15 shadow-[0_0_0_3px_hsl(var(--success)/0.2),0_8px_24px_-8px_hsl(var(--success)/0.6)]',
  'mine-wrong': 'border-danger bg-danger/10 shadow-[0_0_0_3px_hsl(var(--danger)/0.18)]',
  correct: 'border-success bg-success/10 shadow-[0_8px_24px_-10px_hsl(var(--success)/0.6)]',
  faded: 'border-border bg-card opacity-45',
}

function OptionTile({
  option,
  index,
  trueFalse,
  state,
  locked,
  pickers,
  points,
  onPick,
}: {
  option: ArenaOption
  index: number
  trueFalse: boolean
  state: TileState
  locked: boolean
  pickers: ArenaMatchPlayer[]
  /** Points to float over my correct tile. */
  points: number | null
  onPick: () => void
}) {
  const reduced = useReducedMotion()
  const accent = trueFalse
    ? option.key === 'FALSE'
      ? { bar: 'bg-danger', badge: 'bg-danger/15 text-danger' }
      : { bar: 'bg-success', badge: 'bg-success/15 text-success' }
    : OPTION_ACCENTS[index % OPTION_ACCENTS.length]
  const mine = state === 'mine' || state === 'mine-correct' || state === 'mine-wrong'
  const good = state === 'mine-correct' || state === 'correct'
  const bad = state === 'mine-wrong'
  const letter = OPTION_LETTERS[index] ?? String(index + 1)

  const status = good ? (mine ? 'your pick, correct' : 'correct answer') : bad ? 'your pick, wrong' : mine ? 'your pick' : undefined
  const animate = reduced ? {} : bad ? SHAKE : good && mine ? POP : {}

  return (
    <motion.button
      type="button"
      onClick={onPick}
      disabled={locked}
      aria-pressed={mine}
      aria-label={`${letter}: ${option.text}${status ? ` (${status})` : ''}`}
      whileTap={locked || reduced ? undefined : { scale: 0.97 }}
      animate={animate}
      transition={bad ? { duration: 0.45 } : { duration: 0.35 }}
      className={cn(
        'group relative flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl border-2 text-left transition-[border-color,background-color,box-shadow,opacity,transform] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
        trueFalse ? 'h-20 flex-col justify-center gap-1 px-4 sm:h-24' : 'min-h-14 py-2 pl-3 pr-3 sm:min-h-16',
        TILE_CLASS[state],
      )}
    >
      {!trueFalse && (
        <span
          aria-hidden
          className={cn('absolute inset-y-0 left-0 w-1.5', good ? 'bg-success' : bad ? 'bg-danger' : mine ? 'bg-primary' : accent.bar)}
        />
      )}

      {trueFalse ? (
        <>
          <span
            aria-hidden
            className={cn(
              'flex size-9 items-center justify-center rounded-full [&_svg]:size-5',
              good ? 'bg-success text-success-foreground' : bad ? 'bg-danger text-danger-foreground' : mine ? 'bg-primary text-primary-foreground' : accent.badge,
            )}
          >
            {option.key === 'FALSE' ? <X strokeWidth={3.5} /> : <Check strokeWidth={3.5} />}
          </span>
          <span className="text-base font-black uppercase italic text-foreground sm:text-lg">{option.text}</span>
        </>
      ) : (
        <>
          <span
            aria-hidden
            className={cn(
              'ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-black transition-colors',
              good ? 'bg-success text-success-foreground' : bad ? 'bg-danger text-danger-foreground' : mine ? 'bg-primary text-primary-foreground' : accent.badge,
            )}
          >
            {good ? <Check className="size-4" strokeWidth={3.5} /> : bad ? <X className="size-4" strokeWidth={3.5} /> : letter}
          </span>
          <span className="min-w-0 flex-1 break-words text-sm font-bold leading-snug text-foreground [overflow-wrap:anywhere] sm:text-[15px]">
            {option.text}
          </span>
        </>
      )}

      {pickers.length > 0 && (
        <span className={cn('flex shrink-0 -space-x-2', trueFalse && 'absolute right-2 top-2')} aria-hidden>
          {pickers.slice(0, 3).map((p) => (
            <ArenaAvatar key={p.id} look={p.look} size="xs" className="scale-[0.8]" />
          ))}
          {pickers.length > 3 && (
            <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-black text-foreground">+{pickers.length - 3}</span>
          )}
        </span>
      )}

      <AnimatePresence>
        {points != null && points > 0 && (
          <motion.span
            key="pts"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.6 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            className="absolute right-2 top-1.5 rounded-md bg-success px-1.5 text-[11px] font-black tabular-nums text-success-foreground shadow"
            aria-hidden
          >
            +{points}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

type Feedback = { text: React.ReactNode; tone: 'good' | 'bad' | 'warn' | 'info'; icon?: React.ReactNode; key: string }

/** Saturated fills, so the (white) foreground tokens read on them. */
const FEEDBACK_CLASS: Record<Feedback['tone'], string> = {
  good: 'bg-success text-success-foreground shadow-[0_6px_20px_-6px_hsl(var(--success)/0.7)]',
  bad: 'bg-danger text-danger-foreground shadow-[0_6px_20px_-6px_hsl(var(--danger)/0.6)]',
  warn: 'bg-warning text-warning-foreground',
  info: 'border border-border bg-card text-foreground',
}

// ------------------------------------------------------------------- round

export function BattleRound({
  view,
  remainingMs,
  answerState,
  onPick,
  prevRanks,
}: {
  view: ArenaMatchView
  remainingMs: number | null
  answerState: AnswerState | null
  onPick: (key: string) => void
  prevRanks?: Record<string, number>
}) {
  const reduced = useReducedMotion()
  const q = view.question
  if (!q || view.round == null) return null

  const phase = view.phase as 'QUESTION' | 'REVEAL'
  const options = roundOptions(view)
  const trueFalse = q.question_type === 'TRUE_FALSE'
  const mineState = answerState?.round === view.round ? answerState : null
  const myKey = view.my_answer?.option_key ?? (mineState && !mineState.error ? mineState.key : null)
  const timeUp = phase === 'QUESTION' && remainingMs != null && remainingMs <= 0
  const locked = phase !== 'QUESTION' || timeUp || myKey != null
  const reveal = phase === 'REVEAL' ? view.reveal : null
  const me = view.players.find((p) => p.is_me)
  const myPick = reveal && me ? reveal.picks[me.id] : undefined

  // Is my answer right? Known straight after answering, before the reveal.
  const result = mineState?.result
  const rejected = !!mineState?.late || result?.accepted === false
  const myCorrect: boolean | null = reveal ? (myPick ? myPick.correct : null) : rejected ? null : result?.correct ?? view.my_answer?.correct ?? null

  const tileState = (key: string): TileState => {
    const mine = myKey === key && !rejected
    if (reveal) {
      if (key === reveal.correct_key) return mine ? 'mine-correct' : 'correct'
      if (mine) return 'mine-wrong'
      return 'faded'
    }
    if (mine) return myCorrect === true ? 'mine-correct' : myCorrect === false ? 'mine-wrong' : 'mine'
    return locked ? 'faded' : 'idle'
  }

  const pickersOf = (key: string) => (reveal ? view.players.filter((p) => !p.is_me && reveal.picks[p.id]?.option_key === key) : [])

  // The one chip under the tiles.
  let feedback: Feedback | null = null
  if (phase === 'QUESTION') {
    const points = result?.points ?? view.my_answer?.points ?? 0
    if (rejected) feedback = { key: 'late', text: "Time's up", tone: 'warn', icon: <Timer /> }
    else if (myCorrect === true) {
      const streak = result?.streak ?? 0
      feedback = {
        key: 'good',
        tone: 'good',
        icon: <Check />,
        text: (
          <>
            Correct <span className="tabular-nums">+{points.toLocaleString()}</span>
            {streak >= 2 && (
              <span className="flex items-center gap-0.5">
                <span aria-hidden>·</span>
                <Flame className="size-4" aria-hidden />
                {streak}
                <span className="sr-only"> in a row</span>
              </span>
            )}
          </>
        ),
      }
    } else if (myCorrect === false) feedback = { key: 'bad', text: 'Wrong', tone: 'bad', icon: <X /> }
    else if (myKey) feedback = { key: 'lock', text: 'Locked in', tone: 'info' }
    else if (mineState?.error) feedback = { key: 'err', text: mineState.error, tone: 'bad' }
    else if (timeUp) feedback = { key: 'late', text: "Time's up", tone: 'warn', icon: <Timer /> }
  } else if (reveal) {
    const answer = options.find((o) => o.key === reveal.correct_key)?.text ?? reveal.correct_key
    if (myPick?.correct) feedback = { key: 'r-good', tone: 'good', icon: <Check />, text: <>Correct +{myPick.points.toLocaleString()}</> }
    else if (myPick) feedback = { key: 'r-bad', tone: 'bad', icon: <X />, text: <>Answer: {answer}</> }
    else feedback = { key: 'r-none', tone: 'warn', icon: <Timer />, text: <>No answer · it was {answer}</> }
  }

  const waitingOthers = phase === 'QUESTION' && myKey != null && view.players.some((p) => !p.is_me && !p.left && !p.answered)
  const standings = reveal && view.players.length > 2 ? [...view.players].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)) : []
  const long = options.some((o) => o.text.length > 34)

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <motion.div
        key={`q-${view.round}`}
        initial={reduced ? false : { opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      >
        <Panel className="relative overflow-hidden px-4 py-5 text-center sm:px-6 sm:py-6">
          <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-accent" />
          <Label>
            Question {view.round + 1}
            {DIFFICULTY_LABEL[q.difficulty] ? ` · ${DIFFICULTY_LABEL[q.difficulty]}` : ''}
            {trueFalse ? ' · True or false' : ''}
          </Label>
          <h2 className="mt-2 break-words text-lg font-bold leading-snug text-foreground [overflow-wrap:anywhere] sm:text-xl">{q.text}</h2>
        </Panel>
      </motion.div>

      <div role="group" aria-label="Answers" className={cn('grid gap-2 sm:gap-2.5', trueFalse ? 'grid-cols-2' : long ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2')}>
        {options.map((option, index) => (
          <motion.div
            key={`${view.round}-${option.key}`}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduced ? 0 : 0.05 + index * 0.04, duration: 0.2 }}
            className="grid"
          >
            <OptionTile
              option={option}
              index={index}
              trueFalse={trueFalse}
              state={tileState(option.key)}
              locked={locked}
              pickers={pickersOf(option.key)}
              points={reveal && myPick?.correct && myKey === option.key ? myPick.points : null}
              onPick={() => onPick(option.key)}
            />
          </motion.div>
        ))}
      </div>

      <div className="flex min-h-[3rem] flex-col items-center gap-1 text-center" aria-live="polite" aria-atomic>
        <AnimatePresence mode="wait">
          {feedback && (
            <motion.p
              key={`${phase}-${feedback.key}`}
              initial={reduced ? { opacity: 0 } : { scale: 0.6, opacity: 0, y: 6 }}
              animate={
                reduced
                  ? { opacity: 1 }
                  : feedback.tone === 'bad'
                    ? { scale: 1, opacity: 1, y: 0, x: [0, -6, 6, -4, 4, 0] }
                    : { scale: 1, opacity: 1, y: 0 }
              }
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              className={cn(
                'inline-flex max-w-full items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-black italic [&_svg]:size-4 [&_svg]:shrink-0',
                FEEDBACK_CLASS[feedback.tone],
              )}
            >
              {feedback.icon}
              <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">{feedback.text}</span>
            </motion.p>
          )}
        </AnimatePresence>
        {waitingOthers && <p className="text-[11px] font-semibold text-muted-foreground">Waiting for the others…</p>}
        {phase === 'QUESTION' && !myKey && !timeUp && (
          <p className="hidden text-[11px] text-muted-foreground sm:block" aria-hidden>
            Keys{' '}
            <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px] text-foreground">{trueFalse ? 'T' : 'A'}</kbd>–
            <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px] text-foreground">
              {trueFalse ? 'F' : OPTION_LETTERS[options.length - 1]}
            </kbd>{' '}
            or <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px] text-foreground">1</kbd>–
            <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px] text-foreground">{options.length}</kbd>
          </p>
        )}
      </div>

      {reveal?.explanation && (
        <motion.div initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p className="text-foreground">{reveal.explanation}</p>
          </div>
        </motion.div>
      )}

      {standings.length > 0 && (
        <Panel className="p-1.5">
          <ol className="space-y-0.5" aria-label="Standings">
            {standings.map((p) => {
              const before = prevRanks?.[p.id]
              const moved = before && p.rank ? before - p.rank : 0
              return (
                <motion.li
                  key={p.id}
                  layout={!reduced}
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  className={cn('flex h-9 items-center gap-2.5 rounded-lg px-2', p.is_me && 'bg-primary/10')}
                >
                  <span className={cn('w-4 text-center text-xs font-black tabular-nums', rankTone(p.rank))}>{p.rank ?? '–'}</span>
                  <ArenaAvatar look={p.look} size="xs" dimmed={p.left} className="scale-[0.8]" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-foreground">{p.is_me ? 'You' : p.name}</span>
                  {moved !== 0 && (
                    <span className={cn('text-[11px] font-black tabular-nums', moved > 0 ? 'text-success' : 'text-danger')}>
                      {moved > 0 ? `▲${moved}` : `▼${-moved}`}
                      <span className="sr-only">{moved > 0 ? ' places up' : ' places down'}</span>
                    </span>
                  )}
                  <RollingNumber value={p.score} className="w-14 text-right text-[13px] font-black text-foreground" />
                </motion.li>
              )
            })}
          </ol>
        </Panel>
      )}
    </div>
  )
}

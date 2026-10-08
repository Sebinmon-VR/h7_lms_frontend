import { motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, DoorOpen, Globe, GraduationCap, KeyRound, Layers, Lock, Play, SlidersHorizontal } from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'

import type { ArenaBotLevel, ArenaChallenge, ArenaHome, ArenaMatchCreate, ArenaQueueJoin } from '@/api/arena.types'
import { ArenaButton, ArenaChip, ArenaTabs, Art3D, type ArtName, Label } from '@/components/arena/arena-theme'
import { DIFFICULTY_LABEL } from '@/components/arena/arena-ui'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { unlockArenaAudio } from '@/lib/arena-sound'
import { cn } from '@/lib/cn'
import { useCreateMatch, useJoinByCode, useJoinQueue, useLeaveQueue } from '@/queries/arena.queries'
import { ARENA_DIALOG, ARENA_INPUT, botArt, busyMatchId } from './helpers'

type Source =
  | { kind: 'class'; subjectId: number | null; chapterId: number | null }
  | { kind: 'global'; challengeId: number | null }

export type Opponent = 'BOT' | 'QUICK' | 'CHALLENGE' | 'ROOM'

const ROUND_CHOICES = ['5', '7', '10'] as const
type Rounds = (typeof ROUND_CHOICES)[number]

const LEVEL_LABEL: Record<ArenaBotLevel, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' }

function challengePlayable(c: ArenaChallenge, min: number) {
  return c.is_open && c.question_count >= min
}

function initialSource(home: ArenaHome): Source {
  if (home.class && home.subjects.some((s) => s.playable)) return { kind: 'class', subjectId: null, chapterId: null }
  const open = home.challenges.find((c) => challengePlayable(c, home.min_questions))
  if (open) return { kind: 'global', challengeId: open.id }
  return { kind: 'class', subjectId: null, chapterId: null }
}

// ------------------------------------------------------------------ state

/**
 * Everything the battle setup decides (what to play on, against whom) and
 * the actions that start it. The lobby's PLAY button, the settings dialog,
 * the friends and room menus all share one copy.
 */
export function useBattleSetup(home: ArenaHome, onBusy: (matchId: number) => void) {
  const navigate = useNavigate()
  const create = useCreateMatch()
  const joinQueue = useJoinQueue()
  const leaveQueue = useLeaveQueue()

  const [source, setSource] = React.useState<Source>(() => initialSource(home))
  const [rounds, setRounds] = React.useState<Rounds>('7')
  const [opponent, setOpponent] = React.useState<Opponent>('BOT')
  const [botLevel, setBotLevel] = React.useState<ArenaBotLevel>('MEDIUM')
  const [classmatesOpen, setClassmatesOpen] = React.useState(false)
  const [queueRequest, setQueueRequest] = React.useState<ArenaQueueJoin | null>(null)

  const min = home.min_questions
  const anyPlayable = home.subjects.some((s) => s.playable)
  const subject = source.kind === 'class' ? home.subjects.find((s) => s.subject_id === source.subjectId) ?? null : null
  const chapter = source.kind === 'class' && subject ? subject.chapters.find((c) => c.id === source.chapterId) ?? null : null
  const challenge = source.kind === 'global' ? home.challenges.find((c) => c.id === source.challengeId) ?? null : null
  const bot = home.bots.find((b) => b.level === botLevel) ?? null

  const ready =
    source.kind === 'class'
      ? !!home.class && (chapter ? chapter.playable : subject ? subject.playable : anyPlayable)
      : !!challenge && challengePlayable(challenge, min)

  const title =
    source.kind === 'global'
      ? challenge?.title ?? 'a global challenge'
      : chapter?.title ?? subject?.name ?? 'all your subjects'

  /** Short label for the mode pill. */
  const topic = source.kind === 'global' ? challenge?.title ?? 'Pick a challenge' : chapter?.title ?? subject?.name ?? 'All subjects'
  const roundCount = source.kind === 'global' ? challenge?.rounds ?? null : Number(rounds)

  const content = (): Pick<ArenaMatchCreate, 'scope' | 'subject_id' | 'chapter_id' | 'challenge_id'> =>
    source.kind === 'global'
      ? { scope: 'GLOBAL', challenge_id: source.challengeId }
      : { scope: 'CLASS', subject_id: source.subjectId, chapter_id: source.chapterId }

  const go = (matchId: number) => navigate(`/student/arena/battle/${matchId}`)

  const onError = (error: unknown) => {
    const busy = busyMatchId(error)
    if (busy != null) onBusy(busy)
  }

  const createMatch = (body: ArenaMatchCreate) => {
    unlockArenaAudio()
    create.mutate(
      { ...body, rounds: body.scope === 'CLASS' ? Number(rounds) : undefined },
      { onSuccess: (view) => go(view.id), onError },
    )
  }

  const startQuick = () => {
    unlockArenaAudio()
    const body: ArenaQueueJoin = content()
    joinQueue.mutate(body, {
      onSuccess: (status) => {
        if (status.status === 'MATCHED' && status.match_id != null) go(status.match_id)
        else setQueueRequest(body)
      },
      onError,
    })
  }

  const launch = () => {
    if (!ready) return
    if (opponent === 'BOT') createMatch({ mode: 'BOT', bot_level: botLevel, ...content() })
    else if (opponent === 'ROOM') createMatch({ mode: 'ROOM', ...content() })
    else if (opponent === 'QUICK') startQuick()
    else setClassmatesOpen(true)
  }

  const openRoom = () => {
    if (ready) createMatch({ mode: 'ROOM', ...content() })
  }

  /** Sends a challenge on the current questions. */
  const challengeClassmates = (ids: number[], after?: () => void) => {
    if (!ready || ids.length === 0) return
    unlockArenaAudio()
    create.mutate(
      {
        mode: 'CHALLENGE',
        opponent_ids: ids,
        ...content(),
        rounds: source.kind === 'class' ? Number(rounds) : undefined,
      },
      {
        onSuccess: (view) => {
          after?.()
          go(view.id)
        },
        onError: (error) => {
          if (busyMatchId(error) != null) after?.()
          onError(error)
        },
      },
    )
  }

  const playBotInstead = () => {
    leaveQueue.mutate(undefined, {
      onSettled: () => {
        setQueueRequest(null)
        createMatch({ mode: 'BOT', bot_level: 'MEDIUM', ...content() })
      },
    })
  }

  return {
    home,
    source,
    setSource,
    rounds,
    setRounds,
    opponent,
    setOpponent,
    botLevel,
    setBotLevel,
    bot,
    ready,
    title,
    topic,
    roundCount,
    launch,
    openRoom,
    challengeClassmates,
    creating: create.isPending,
    busy: create.isPending || joinQueue.isPending,
    classmatesOpen,
    setClassmatesOpen,
    queueRequest,
    setQueueRequest,
    playBotInstead,
    go,
    onBusy,
  }
}

export type BattleSetup = ReturnType<typeof useBattleSetup>

// ------------------------------------------------------------------ the pill

export function opponentArt(setup: BattleSetup): ArtName {
  switch (setup.opponent) {
    case 'BOT':
      return botArt(setup.botLevel, setup.bot?.avatar)
    case 'QUICK':
      return 'globe'
    case 'CHALLENGE':
      return 'crossed_swords'
    default:
      return 'lock'
  }
}

function opponentLabel(setup: BattleSetup) {
  switch (setup.opponent) {
    case 'BOT':
      return `Vs bot · ${LEVEL_LABEL[setup.botLevel]}`
    case 'QUICK':
      return 'Quick match'
    case 'CHALLENGE':
      return 'Challenge friends'
    default:
      return 'Private room'
  }
}

/** "🤖 Vs bot · Medium · All subjects · 7 rounds ▾": the whole setup in one tap target. */
export function ModePill({ setup, onOpen }: { setup: BattleSetup; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group inline-flex h-11 max-w-full items-center gap-2 rounded-full border border-border bg-card/90 pl-1.5 pr-3 text-left text-xs font-bold text-foreground shadow-sm backdrop-blur transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
      aria-label={`Battle settings: ${opponentLabel(setup)}, ${setup.topic}${setup.roundCount ? `, ${setup.roundCount} rounds` : ''}. Change`}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Art3D name={opponentArt(setup)} className="size-7 drop-shadow-sm" />
      </span>
      <span className="min-w-0 truncate">
        {opponentLabel(setup)}
        <span className="text-muted-foreground"> · {setup.topic}</span>
        {setup.roundCount != null && <span className="hidden text-muted-foreground min-[420px]:inline"> · {setup.roundCount} rounds</span>}
      </span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-y-0.5" aria-hidden />
    </button>
  )
}

// ----------------------------------------------------------- settings dialog

const MODES: Array<{ value: Opponent; title: string; hint: string }> = [
  { value: 'BOT', title: 'Vs bot', hint: 'Starts instantly' },
  { value: 'QUICK', title: 'Quick match', hint: 'Anyone online' },
  { value: 'CHALLENGE', title: 'Challenge', hint: 'Up to 7 friends' },
  { value: 'ROOM', title: 'Private room', hint: 'Share a code' },
]

function Tile({
  active,
  onClick,
  disabled,
  className,
  children,
  label,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
  label?: string
}) {
  const reduced = useReducedMotion()
  return (
    <motion.button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      whileTap={reduced || disabled ? undefined : { scale: 0.96 }}
      className={cn(
        'relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 p-2 text-center transition-[border-color,background-color,box-shadow] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45',
        active
          ? 'border-primary bg-primary/10 shadow-[0_6px_20px_-10px_hsl(var(--primary)/0.8)]'
          : 'border-border bg-card hover:border-primary/40',
        className,
      )}
    >
      {children}
    </motion.button>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">{children}</p>
}

/** Everything about the next battle, in one dialog: opponent, questions, rounds. */
export function BattleSettingsDialog({
  setup,
  open,
  onOpenChange,
}: {
  setup: BattleSetup
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { home, source, setSource, opponent } = setup
  const min = home.min_questions
  const anyPlayable = home.subjects.some((s) => s.playable)
  const subject = source.kind === 'class' ? home.subjects.find((s) => s.subject_id === source.subjectId) ?? null : null

  const switchSource = (kind: 'class' | 'global') => {
    if (kind === source.kind) return
    if (kind === 'class') setSource({ kind: 'class', subjectId: null, chapterId: null })
    else setSource({ kind: 'global', challengeId: home.challenges.find((c) => challengePlayable(c, min))?.id ?? null })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className={ARENA_DIALOG.content}>
        <DialogHeader>
          <DialogTitle className={ARENA_DIALOG.title}>
            <SlidersHorizontal />
            Battle settings
          </DialogTitle>
          <DialogDescription>Who you play, and what the questions are about.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5 px-4 sm:px-6">
          {/* Opponent */}
          <section className="space-y-2">
            <Label>Opponent</Label>
            <div role="group" aria-label="Opponent" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MODES.map((m) => (
                <Tile key={m.value} active={opponent === m.value} onClick={() => setup.setOpponent(m.value)} className="h-[6.5rem]">
                  <Art3D
                    name={m.value === 'BOT' ? botArt(setup.botLevel, setup.bot?.avatar) : m.value === 'QUICK' ? 'globe' : m.value === 'CHALLENGE' ? 'crossed_swords' : 'lock'}
                    className="size-11"
                  />
                  <span className="text-xs font-black uppercase italic text-foreground">{m.title}</span>
                  <span className="text-[10px] font-medium text-muted-foreground">{m.hint}</span>
                </Tile>
              ))}
            </div>
            {opponent === 'BOT' && home.bots.length > 0 && (
              <div role="group" aria-label="Bot difficulty" className="grid grid-cols-3 gap-2 pt-1">
                {home.bots.map((b) => (
                  <Tile
                    key={b.level}
                    active={setup.botLevel === b.level}
                    onClick={() => setup.setBotLevel(b.level)}
                    className="h-[5.5rem] flex-row gap-2 px-2 sm:justify-start sm:px-3"
                    label={`${LEVEL_LABEL[b.level]}: ${b.name}, about ${Math.round(b.accuracy * 100)}% accuracy`}
                  >
                    <Art3D name={botArt(b.level, b.avatar)} className="size-10 shrink-0 sm:size-12" />
                    <span className="hidden min-w-0 text-left sm:block">
                      <span className="block text-[10px] font-black uppercase tracking-wider text-primary">{LEVEL_LABEL[b.level]}</span>
                      <span className="block truncate text-sm font-bold text-foreground">{b.name}</span>
                      <span className="block text-[10px] tabular-nums text-muted-foreground">~{Math.round(b.accuracy * 100)}% right</span>
                    </span>
                    <span className="text-[10px] font-black uppercase text-foreground sm:hidden">{LEVEL_LABEL[b.level]}</span>
                  </Tile>
                ))}
              </div>
            )}
            {opponent !== 'BOT' && (
              <p className="text-xs text-muted-foreground">
                {opponent === 'QUICK' && 'Paired with anyone waiting on the same questions. Nobody around after 20 seconds? Play a bot.'}
                {opponent === 'CHALLENGE' && 'Pick classmates next. The battle starts the moment they accept.'}
                {opponent === 'ROOM' && 'You get a 6-letter code friends join with: up to 8 players, you press start.'}
              </p>
            )}
          </section>

          {/* Questions */}
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Questions</Label>
              <ArenaTabs
                size="sm"
                aria-label="Question source"
                value={source.kind}
                onChange={switchSource}
                options={[
                  { value: 'class', label: 'My class', icon: <GraduationCap /> },
                  { value: 'global', label: 'Global', icon: <Globe />, count: home.challenges.length || undefined },
                ]}
              />
            </div>

            {source.kind === 'class' ? (
              !home.class ? (
                <Note>Class battles open once you&apos;re enrolled in a class. The global challenges are open to you now.</Note>
              ) : home.subjects.length === 0 || !anyPlayable ? (
                <Note>Your teachers haven&apos;t added enough questions yet: a battle needs at least {min}. Try a global challenge meanwhile.</Note>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Subject">
                    <ArenaChip active={source.subjectId == null} onClick={() => setSource({ kind: 'class', subjectId: null, chapterId: null })}>
                      <Layers />
                      All subjects
                    </ArenaChip>
                    {home.subjects.map((s) => (
                      <ArenaChip
                        key={s.subject_id}
                        active={source.subjectId === s.subject_id}
                        disabled={!s.playable}
                        title={s.playable ? `${s.question_count} questions` : `Needs at least ${min} questions`}
                        onClick={() => setSource({ kind: 'class', subjectId: s.subject_id, chapterId: null })}
                      >
                        {!s.playable && <Lock />}
                        {s.name}
                        {!s.playable && <span className="sr-only"> (needs at least {min} questions)</span>}
                      </ArenaChip>
                    ))}
                  </div>

                  {subject && subject.chapters.length > 0 && (
                    <div role="group" aria-label="Chapter" className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-xl bg-muted/40 p-2">
                      <ArenaChip
                        active={source.chapterId == null}
                        onClick={() => setSource({ kind: 'class', subjectId: subject.subject_id, chapterId: null })}
                      >
                        Whole subject
                      </ArenaChip>
                      {subject.chapters.map((c) => (
                        <ArenaChip
                          key={c.id}
                          active={source.chapterId === c.id}
                          disabled={!c.playable}
                          title={c.playable ? `${c.question_count} questions` : `Needs at least ${min} questions (has ${c.question_count})`}
                          onClick={() => setSource({ kind: 'class', subjectId: subject.subject_id, chapterId: c.id })}
                          className="max-w-full"
                        >
                          {!c.playable && <Lock />}
                          <span className="max-w-[14rem] truncate">{c.title}</span>
                          {!c.playable && (
                            <span className="shrink-0 text-[10px] font-semibold opacity-80">needs {Math.max(0, min - c.question_count)}</span>
                          )}
                        </ArenaChip>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Label>Rounds</Label>
                    <ArenaTabs
                      size="sm"
                      aria-label="Number of questions"
                      value={setup.rounds}
                      onChange={setup.setRounds}
                      options={ROUND_CHOICES.map((r) => ({ value: r, label: r }))}
                    />
                  </div>
                </div>
              )
            ) : home.challenges.length === 0 ? (
              <Note>No global challenges are running right now. Check back soon.</Note>
            ) : (
              <div role="group" aria-label="Global challenge" className="grid gap-1.5 sm:grid-cols-2">
                {home.challenges.map((c) => {
                  const playable = challengePlayable(c, min)
                  const active = source.challengeId === c.id
                  const state = !c.is_open ? 'Closed' : c.question_count < min ? 'Not enough questions' : null
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={active}
                      disabled={!playable}
                      title={c.description ?? undefined}
                      onClick={() => setSource({ kind: 'global', challengeId: c.id })}
                      className={cn(
                        'flex h-14 min-w-0 items-center gap-2.5 rounded-xl border-2 px-2.5 text-left transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45',
                        active ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/40',
                      )}
                    >
                      <Art3D emoji={c.emoji} className="size-9 shrink-0 text-2xl" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-foreground">{c.title}</span>
                        <span className="block truncate text-[11px] tabular-nums text-muted-foreground">
                          {state ?? `${c.rounds} rounds · ${c.difficulty ? DIFFICULTY_LABEL[c.difficulty] ?? 'Mixed' : 'Mixed'}`}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </DialogBody>
        <DialogFooter>
          <ArenaButton variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </ArenaButton>
          <ArenaButton
            variant="gold"
            className="min-w-32 uppercase italic"
            disabled={!setup.ready}
            loading={setup.busy}
            onClick={() => {
              onOpenChange(false)
              setup.launch()
            }}
          >
            {!setup.busy && <Play className="fill-current" />}
            Play
          </ArenaButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --------------------------------------------------------------- room dialog

/** Host a private room on the current questions, or join a friend's with a code. */
export function RoomDialog({ setup, open, onOpenChange }: { setup: BattleSetup; open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const join = useJoinByCode()
  const [code, setCode] = React.useState('')
  const valid = code.length === 6

  React.useEffect(() => {
    if (!open) setCode('')
  }, [open])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    unlockArenaAudio()
    join.mutate(code, {
      onSuccess: (view) => navigate(`/student/arena/battle/${view.id}`),
      onError: (error) => {
        const busy = busyMatchId(error)
        if (busy != null) {
          onOpenChange(false)
          setup.onBusy(busy)
        }
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" className={ARENA_DIALOG.content}>
        <DialogHeader>
          <DialogTitle className={ARENA_DIALOG.title}>
            <DoorOpen />
            Private room
          </DialogTitle>
          <DialogDescription>Play with friends: up to 8 players.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 px-4 sm:px-6">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 p-3">
            <Art3D name="lock" className="size-12 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-foreground">Host a room</p>
              <p className="truncate text-xs text-muted-foreground">
                {setup.ready ? (
                  <>
                    on <span className="font-semibold text-foreground">{setup.title}</span>
                  </>
                ) : (
                  'Pick questions in battle settings first.'
                )}
              </p>
            </div>
            <ArenaButton variant="primary" size="sm" disabled={!setup.ready} loading={setup.creating} onClick={setup.openRoom}>
              Create
            </ArenaButton>
          </div>

          <form onSubmit={submit} className="space-y-2">
            <label htmlFor="arena-room-code" className="flex items-center gap-1.5">
              <KeyRound className="size-3.5 text-success" aria-hidden />
              <Label>Join with a code</Label>
            </label>
            <div className="flex items-center gap-2">
              <input
                id="arena-room-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6))}
                placeholder="ABCDEF"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className={cn(ARENA_INPUT, 'flex-1 text-center font-mono text-base font-black uppercase tracking-[0.35em]')}
              />
              <ArenaButton type="submit" variant="success" disabled={!valid} loading={join.isPending}>
                Join
              </ArenaButton>
            </div>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

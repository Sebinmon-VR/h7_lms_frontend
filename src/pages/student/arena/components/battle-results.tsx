import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Check, ChevronDown, ListChecks, RotateCcw, Star, Trophy, X } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import type { ArenaMatchPlayer, ArenaMatchResultsMine, ArenaMatchView, ArenaOutcome } from '@/api/arena.types'
import { ArenaButton, Art3D, type ArtName, GameTitle, Label, Panel, RARITY_STYLE, TierBadge, tierFor } from '@/components/arena/arena-theme'
import { ProfileCardDialog } from '@/components/arena/profile-card'
import { useCelebration } from '@/components/fun/celebrate'
import { arenaSound } from '@/lib/arena-sound'
import { cn } from '@/lib/cn'
import { useCountUp } from '@/lib/hooks'
import { type EmoteBubble, PortraitCard } from './battle-players'
import { medalArt, ordinal, QUIZ_LOBBY } from './helpers'

const OUTCOME: Record<ArenaOutcome, { word: string; line: string; text: string; bar: string; art: ArtName | null }> = {
  WIN: {
    word: 'Victory',
    line: 'You took the battle.',
    text: 'bg-gradient-to-b from-warning to-danger bg-clip-text text-transparent',
    bar: 'bg-warning',
    art: 'trophy',
  },
  DRAW: { word: 'Draw', line: 'Dead even. Settle it in a rematch.', text: 'text-info', bar: 'bg-info', art: 'crossed_swords' },
  LOSS: { word: 'Defeat', line: 'Close one. Run it back.', text: 'text-danger', bar: 'bg-danger', art: null },
  FORFEIT: { word: 'Forfeit', line: 'You left before the end.', text: 'text-muted-foreground', bar: 'bg-muted-foreground', art: null },
}

interface Ranked {
  player: ArenaMatchPlayer
  rank: number
  score: number
  correct: number
}

function Count({ value, duration = 1000, className }: { value: number; duration?: number; className?: string }) {
  const shown = useCountUp(value, duration)
  return <span className={cn('tabular-nums', className)}>{Math.round(shown).toLocaleString()}</span>
}

/** "✓ CORRECT 6" — one stat row under a portrait. */
function StatRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-7 items-center justify-between gap-1 rounded-lg border border-border bg-card px-2">
      <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground [&_svg]:size-3 [&_svg]:text-primary">
        {icon}
        {label}
      </span>
      <span className="text-sm font-black text-foreground">{children}</span>
    </div>
  )
}

/**
 * The XP bar filling from where this battle started to where it ended. A
 * level-up runs it to the end, flashes, and refills from empty.
 */
function XpProgress({ mine }: { mine: ArenaMatchResultsMine }) {
  const reduced = useReducedMotion()
  const span = Math.max(1, mine.progress_next_level_xp - mine.progress_level_xp)
  const end = Math.max(0, Math.min(1, mine.progress_progress))
  const start = mine.level_up ? 0 : Math.max(0, Math.min(end, (mine.progress_xp - mine.xp - mine.progress_level_xp) / span))
  const tierUp = tierFor(mine.level_before).name !== tierFor(mine.level_after).name

  // 'fill': running to 100% before a level-up; 'final': the real figure.
  const [stage, setStage] = React.useState<'fill' | 'final'>(mine.level_up && !reduced ? 'fill' : 'final')
  const [flash, setFlash] = React.useState(reduced && mine.level_up)
  const sounded = React.useRef(false)

  const onDone = () => {
    if (stage === 'fill') {
      setStage('final')
      setFlash(true)
      if (!sounded.current) {
        sounded.current = true
        arenaSound.levelUp()
      }
    }
  }

  const width = stage === 'fill' ? 1 : end
  const levelShown = stage === 'fill' ? mine.level_before : mine.progress_level

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="text-sm font-black italic text-foreground">
            Lv <span className="tabular-nums">{levelShown}</span>
          </span>
          <TierBadge level={levelShown} size="xs" />
        </span>
        <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
          {(mine.progress_xp - mine.progress_level_xp).toLocaleString()} / {span.toLocaleString()} XP
        </span>
      </div>
      <div
        className="h-3 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(end * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Level ${mine.progress_level} progress`}
      >
        <motion.div
          key={stage}
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
          initial={reduced ? false : { width: `${(mine.level_up && stage === 'final' ? 0 : start) * 100}%` }}
          animate={{ width: `${width * 100}%` }}
          transition={{
            duration: reduced ? 0 : stage === 'fill' ? 0.9 : 1.1,
            delay: reduced ? 0 : stage === 'fill' ? 0.7 : mine.level_up ? 0.15 : 0.7,
            ease: [0.22, 1, 0.36, 1],
          }}
          onAnimationComplete={onDone}
        />
      </div>

      <AnimatePresence>
        {flash && mine.level_up && (
          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 0.7, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 16 }}
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5"
            role="status"
          >
            <span className="-skew-x-12 rounded-md bg-primary px-2.5 py-0.5 text-sm font-black uppercase italic tracking-wider text-primary-foreground shadow-[0_3px_0_0_hsl(var(--primary)/0.45)]">
              Level up
            </span>
            <span className="text-sm font-black tabular-nums text-foreground">
              {mine.level_before} <span className="text-muted-foreground">→</span> {mine.level_after}
            </span>
            {tierUp && (
              <motion.span
                initial={reduced ? false : { opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: reduced ? 0 : 0.35, type: 'spring', stiffness: 380, damping: 14 }}
                className="flex items-center gap-1.5"
              >
                <Label className="text-warning">Tier up</Label>
                <TierBadge level={mine.level_after} size="md" />
              </motion.span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function BattleResults({
  view,
  bubbles,
  onRematch,
  rematching,
}: {
  view: ArenaMatchView
  bubbles: EmoteBubble[]
  onRematch: () => void
  rematching: boolean
}) {
  const reduced = useReducedMotion()
  const [confetti, fire] = useCelebration()
  const [badgesShown, setBadgesShown] = React.useState(0)
  const [reviewOpen, setReviewOpen] = React.useState(false)
  const [profileId, setProfileId] = React.useState<number | null>(null)
  const celebrated = React.useRef(false)

  const results = view.results
  const mine = results?.mine ?? null
  const finalized = !!results?.finalized
  const badges = mine?.new_badges ?? []

  React.useEffect(() => {
    if (!finalized || !mine || celebrated.current) return
    celebrated.current = true
    if (mine.outcome === 'WIN') {
      fire()
      arenaSound.win()
    } else {
      if (mine.level_up) fire()
      arenaSound.lose()
    }
  }, [finalized, mine, fire])

  React.useEffect(() => {
    if (!finalized) return
    if (reduced) {
      setBadgesShown(badges.length)
      return
    }
    if (badgesShown >= badges.length) return
    const t = window.setTimeout(
      () => {
        setBadgesShown((n) => n + 1)
        arenaSound.badge()
      },
      badgesShown === 0 ? 1800 : 700,
    )
    return () => window.clearTimeout(t)
  }, [finalized, reduced, badges.length, badgesShown])

  if (!results || !finalized) {
    return (
      <div className="flex flex-col items-center py-14 text-center" aria-live="polite">
        <Art3D name="trophy" className={cn('size-20', !reduced && 'animate-pulse')} />
        <GameTitle as="p" className="mt-3 text-xl">
          Tallying rewards…
        </GameTitle>
        <p className="mt-1 text-xs text-muted-foreground">Counting points, XP and coins.</p>
      </div>
    )
  }

  const byId = new Map(view.players.map((p) => [p.id, p]))
  const ranked: Ranked[] = results.standings
    .map((s) => {
      const player = byId.get(String(s.user_id))
      return player ? { player, rank: s.rank, score: s.score, correct: s.correct } : null
    })
    .filter((r): r is Ranked => r !== null)
  const outcome: ArenaOutcome = mine?.outcome ?? 'DRAW'
  const look = OUTCOME[outcome]
  const coins = mine ? mine.coins + mine.badge_coins : 0

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {confetti}

      {/* Outcome */}
      <div className="flex flex-col items-center pt-2 text-center" role="status">
        {look.art && (
          <motion.span
            initial={reduced ? false : { scale: 0.3, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14 }}
          >
            <Art3D name={look.art} className="size-20 sm:size-24" float />
          </motion.span>
        )}
        <motion.div
          initial={reduced ? false : { opacity: 0, scale: 1.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          className="relative"
        >
          <GameTitle as="h2" className={cn('pr-2 text-5xl sm:text-6xl', look.text)}>
            {look.word}
          </GameTitle>
          <motion.span
            aria-hidden
            initial={reduced ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: reduced ? 0 : 0.25, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className={cn('mx-auto mt-1.5 block h-2 w-3/4 origin-left -skew-x-[30deg] rounded-sm', look.bar)}
          />
        </motion.div>
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {look.line}
          {mine?.rank && ranked.length > 2 ? ` Placed ${ordinal(mine.rank)} of ${ranked.length}.` : ''}
        </p>
      </div>

      {/* Players */}
      {ranked.length > 0 && (
        <ol
          aria-label="Standings"
          className="no-scrollbar -mx-3 flex snap-x items-end gap-3 overflow-x-auto px-3 pb-2 pt-4 sm:justify-center"
        >
          {ranked.map((r, i) => {
            const medal = medalArt(r.rank)
            const winner = r.rank === 1 && ranked.length > 1
            const openable = !r.player.is_bot && !r.player.is_me && r.player.user_id != null
            return (
              <motion.li
                key={r.player.id}
                className={cn('snap-start', winner && 'mb-4')}
                initial={reduced ? false : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduced ? 0 : 0.2 + i * 0.08, type: 'spring', stiffness: 300, damping: 24 }}
              >
                <PortraitCard
                  player={r.player}
                  bubbles={bubbles}
                  highlight={winner}
                  badge={medal ? <Art3D name={medal} className="size-9" alt={ordinal(r.rank)} /> : undefined}
                  onOpen={openable ? () => setProfileId(r.player.user_id) : undefined}
                >
                  <div className="mt-1.5 space-y-1">
                    <StatRow icon={<Check strokeWidth={3} />} label="Correct">
                      {r.correct}
                      <span className="text-[10px] text-muted-foreground">/{view.round_count}</span>
                    </StatRow>
                    <StatRow icon={<Star />} label="Points">
                      <Count value={r.score} />
                    </StatRow>
                  </div>
                  <p className={cn('mt-1.5 text-sm font-black italic', r.player.is_me ? 'text-primary' : 'text-muted-foreground')}>
                    {r.player.is_me && mine ? `+${mine.xp.toLocaleString()} XP` : ordinal(r.rank)}
                  </p>
                </PortraitCard>
              </motion.li>
            )
          })}
        </ol>
      )}

      {/* My rewards: one strip */}
      {mine && (
        <Panel glow={outcome === 'WIN' ? 'amber' : undefined} className="space-y-3 p-3 sm:p-4" aria-label="Your rewards">
          <div className="grid items-center gap-3 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:gap-5">
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <Art3D name="coin" className="size-11" />
                <div>
                  <p className="text-xl font-black leading-none text-foreground">
                    +<Count value={coins} duration={1200} />
                  </p>
                  <Label className="text-[10px]">{mine.badge_coins > 0 ? `Coins · ${mine.badge_coins} badges` : 'Coins'}</Label>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Art3D name="star" className="size-11" />
                <div>
                  <p className="text-xl font-black leading-none text-foreground">
                    +<Count value={mine.xp} duration={1200} />
                  </p>
                  <Label className="text-[10px]">XP</Label>
                </div>
              </div>
            </div>
            <span aria-hidden className="hidden h-10 w-px bg-border sm:block" />
            <XpProgress mine={mine} />
          </div>

          {badges.length > 0 && (
            <ul className="flex flex-wrap gap-2 border-t border-border pt-3" aria-live="polite" aria-label="Badges unlocked">
              <AnimatePresence>
                {badges.slice(0, badgesShown).map((b) => {
                  const r = RARITY_STYLE[b.rarity]
                  return (
                    <motion.li
                      key={b.id}
                      initial={reduced ? false : { opacity: 0, scale: 0.5, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                      className={cn('flex min-w-0 max-w-full items-center gap-2 rounded-xl border-2 bg-card py-1.5 pl-1.5 pr-3', r.border, r.glow)}
                      title={b.description}
                    >
                      <Art3D emoji={b.emoji} className="size-8 text-2xl" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-black text-foreground">{b.name}</span>
                        <span className={cn('block text-[9px] font-black uppercase tracking-wider', r.text)}>
                          {r.label} badge{b.coins > 0 ? ` · +${b.coins} coins` : ''}
                        </span>
                      </span>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
          )}
        </Panel>
      )}

      {/* Actions */}
      <div className="flex flex-col items-center gap-2 min-[480px]:flex-row min-[480px]:justify-center">
        <ArenaButton variant="gold" size="lg" className="h-14 w-full max-w-[16rem] text-lg font-black" loading={rematching} onClick={onRematch}>
          {!rematching && <RotateCcw />}
          {view.rematch_id ? 'Join rematch' : 'Rematch'}
        </ArenaButton>
        <div className="flex gap-2">
          <ArenaButton asChild variant="secondary" size="lg" className="h-12">
            <Link to={QUIZ_LOBBY}>
              <ArrowLeft />
              Lobby
            </Link>
          </ArenaButton>
          <ArenaButton asChild variant="secondary" size="icon" className="size-12">
            <Link to="/student/arena/leaderboard" aria-label="Leaderboard">
              <Trophy className="text-warning" />
            </Link>
          </ArenaButton>
        </div>
      </div>

      {/* Review, collapsed */}
      {results.questions.length > 0 && (
        <Panel className="overflow-hidden">
          <button
            type="button"
            onClick={() => setReviewOpen((o) => !o)}
            aria-expanded={reviewOpen}
            className="flex h-11 w-full items-center justify-between gap-2 px-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="flex items-center gap-2 text-xs font-black uppercase italic tracking-wider text-foreground">
              <ListChecks className="size-4 text-primary" aria-hidden />
              Review answers
              <span className="rounded-md bg-muted px-1.5 text-[10px] not-italic tabular-nums text-muted-foreground">
                {results.questions.filter((q) => q.my_correct).length}/{results.questions.length}
              </span>
            </span>
            <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', reviewOpen && 'rotate-180')} aria-hidden />
          </button>
          <AnimatePresence initial={false}>
            {reviewOpen && (
              <motion.ol
                initial={reduced ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="space-y-1 overflow-hidden border-t border-border p-2"
              >
                {results.questions.map((q, i) => {
                  const pick = q.options.find((o) => o.key === q.my_pick)?.text ?? q.my_pick
                  const right = q.options.find((o) => o.key === q.correct_key)?.text ?? q.correct_key
                  return (
                    <li key={i} className="flex gap-2.5 rounded-lg bg-muted/40 px-2.5 py-2 text-[13px]">
                      <span
                        className={cn(
                          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md',
                          q.my_correct ? 'bg-success text-success-foreground' : 'bg-danger text-danger-foreground',
                        )}
                      >
                        {q.my_correct ? <Check className="size-3" strokeWidth={3.5} /> : <X className="size-3" strokeWidth={3.5} />}
                        <span className="sr-only">{q.my_correct ? 'Right' : 'Wrong'}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground [overflow-wrap:anywhere]">
                          <span className="mr-1 text-[11px] font-black text-muted-foreground">{i + 1}.</span>
                          {q.text}
                        </p>
                        {!q.my_correct && <p className="mt-0.5 text-xs font-medium text-danger">You: {q.my_pick ? pick : 'no answer'}</p>}
                        <p className="mt-0.5 text-xs font-medium text-success">Answer: {right}</p>
                        {q.explanation && <p className="mt-1 text-[11px] text-muted-foreground">{q.explanation}</p>}
                      </div>
                    </li>
                  )
                })}
              </motion.ol>
            )}
          </AnimatePresence>
        </Panel>
      )}

      <ProfileCardDialog studentId={profileId} onClose={() => setProfileId(null)} />
    </div>
  )
}


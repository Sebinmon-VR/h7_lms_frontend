import { ArrowLeft, Flag, RotateCcw } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ApiError } from '@/api/errors'
import { ArenaButton, ArenaEmpty, ArenaShell, type ArtName } from '@/components/arena/arena-theme'
import { PageHeader } from '@/components/layout/page-header'
import { arenaSound, useArenaAudioUnlock } from '@/lib/arena-sound'
import { useAnswer, useArenaCatalog, useArenaMatch, useLeaveMatch, useRematch, useStartMatch } from '@/queries/arena.queries'
import { AdminStudentNotice, useIsAdminViewingStudent } from '../student-guard'
import { BattleHud } from './components/battle-hud'
import { BattleCountdown, BattleLobby } from './components/battle-lobby'
import { EmoteBar, useEmoteBubbles } from './components/battle-players'
import { BattleResults } from './components/battle-results'
import { type AnswerState, BattleRound, roundOptions } from './components/battle-round'
import { ArenaConfirm, ArenaSkeleton, errorMessage, OPTION_LETTERS, parseServerTime, useServerClock } from './components/helpers'
import { useArenaPaths } from './arena-paths'

/**
 * One battle, start to finish. The server derives the phase from its clock,
 * so this screen only polls, runs a local timer on the server's time, and
 * sends taps.
 */
export default function ArenaBattlePage() {
  const { matchId } = useParams()
  const isAdmin = useIsAdminViewingStudent()
  const id = Number(matchId)

  if (isAdmin) {
    return (
      <>
        <PageHeader title="Arena battle" />
        <AdminStudentNotice />
      </>
    )
  }

  if (!Number.isInteger(id) || id <= 0) return <BattleMissing />

  // Keyed so a rematch starts with a clean slate.
  return <BattleScreen key={id} matchId={id} />
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      <ArenaShell>{children}</ArenaShell>
    </div>
  )
}

function BackToLobby() {
  const paths = useArenaPaths()
  return (
    <ArenaButton asChild variant="primary">
      <Link to={paths.quiz}>
        <ArrowLeft />
        Back to the lobby
      </Link>
    </ArenaButton>
  )
}

function BattleMissing({ forbidden }: { forbidden?: boolean }) {
  return (
    <Frame>
      <ArenaEmpty
        art="lock"
        title={forbidden ? "You're not in this battle" : 'Battle not found'}
        description={forbidden ? 'This battle belongs to other players. Start one of your own.' : 'It may have been closed, or the link is wrong.'}
        action={<BackToLobby />}
      />
    </Frame>
  )
}

const CANCEL_COPY: Record<string, { art: ArtName; title: string; body: string }> = {
  DECLINED: { art: 'crossed_swords', title: "They couldn't play right now", body: 'Try someone else, or warm up against a bot.' },
  HOST_LEFT: { art: 'castle', title: 'The host closed the room', body: 'No harm done. Start a new battle any time.' },
}
const CANCEL_DEFAULT = { art: 'lock' as ArtName, title: 'This battle expired', body: 'Nobody started it in time. Start a fresh one.' }

const PLAYING = new Set(['COUNTDOWN', 'QUESTION', 'REVEAL'])

function BattleScreen({ matchId }: { matchId: number }) {
  const navigate = useNavigate()
  const paths = useArenaPaths()
  const query = useArenaMatch(matchId)
  const catalog = useArenaCatalog()
  const { mutate: sendAnswer } = useAnswer(matchId)
  const start = useStartMatch()
  const leave = useLeaveMatch()
  const rematch = useRematch()
  useArenaAudioUnlock()

  const view = query.data
  const phase = view?.phase
  const ticking = !!phase && PLAYING.has(phase)
  const now = useServerClock(view?.server_now, query.dataUpdatedAt, ticking)
  const endsAt = parseServerTime(view?.phase_ends_at)
  const remaining = endsAt == null ? null : Math.max(0, endsAt - now)
  const bubbles = useEmoteBubbles(view?.emotes)

  const [answerState, setAnswerState] = React.useState<AnswerState | null>(null)
  const [confirmLeave, setConfirmLeave] = React.useState(false)

  // Ranks at each reveal, so the next reveal can show who moved.
  const ranksByRound = React.useRef<Record<number, Record<string, number>>>({})
  React.useEffect(() => {
    if (view?.phase === 'REVEAL' && view.round != null) {
      ranksByRound.current[view.round] = Object.fromEntries(view.players.map((p) => [p.id, p.rank ?? 0]))
    }
  }, [view])
  const prevRanks = view?.round != null ? ranksByRound.current[view.round - 1] : undefined

  const round = view?.round ?? null
  const mineState = answerState && answerState.round === round ? answerState : null
  const answeredNow = !!view?.my_answer || (!!mineState && !mineState.error)
  const locked = phase !== 'QUESTION' || round == null || remaining === 0 || answeredNow

  const pick = React.useCallback(
    (key: string) => {
      if (locked || round == null) return
      setAnswerState({ round, key })
      arenaSound.tap()
      sendAnswer(
        { round, optionKey: key },
        {
          onSuccess: (result) => {
            setAnswerState((s) => (s && s.round === round ? { ...s, result } : s))
            if (!result.accepted) return
            if (result.correct) arenaSound.correct()
            else arenaSound.wrong()
          },
          onError: (error) => {
            const message = errorMessage(error)
            const conflict = error instanceof ApiError && error.status === 409
            setAnswerState((s) => {
              if (!s || s.round !== round) return s
              if (conflict && /already answered/i.test(message)) return s
              if (conflict) return { ...s, late: true }
              return { ...s, error: message }
            })
          },
        },
      )
    },
    [locked, round, sendAnswer],
  )

  // Keys answer: 1–6, A–F, and T / F on a true-or-false question.
  const question = view?.question
  const options = React.useMemo(() => (view ? roundOptions(view) : []), [question?.index, question?.text])
  const trueFalse = question?.question_type === 'TRUE_FALSE'
  React.useEffect(() => {
    if (locked) return
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      const key = e.key.toUpperCase()
      let index = -1
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1) index = n - 1
      else if (trueFalse && (key === 'T' || key === 'F')) index = options.findIndex((o) => o.key === (key === 'T' ? 'TRUE' : 'FALSE'))
      else if (key.length === 1) index = OPTION_LETTERS.indexOf(key)
      if (index >= 0 && index < options.length) {
        e.preventDefault()
        pick(options[index].key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [locked, options, pick, trueFalse])

  // Countdown blips and last-seconds ticks.
  const wholeSeconds = remaining == null ? null : Math.ceil(remaining / 1000)
  const lastSound = React.useRef<string>('')
  React.useEffect(() => {
    if (wholeSeconds == null || !phase) return
    const mark = `${phase}-${round}-${wholeSeconds}`
    if (lastSound.current === mark) return
    lastSound.current = mark
    if (phase === 'COUNTDOWN') {
      if (wholeSeconds >= 1 && wholeSeconds <= 3) arenaSound.countdown()
      else if (wholeSeconds === 0) arenaSound.go()
    } else if (phase === 'QUESTION' && !answeredNow && wholeSeconds >= 1 && wholeSeconds <= 3) {
      arenaSound.tick()
    }
  }, [wholeSeconds, phase, round, answeredNow])

  const goLobby = () => navigate(paths.quiz)
  const doLeave = () =>
    leave.mutate(matchId, {
      onSuccess: () => {
        setConfirmLeave(false)
        goLobby()
      },
    })

  if (query.isPending) {
    return (
      <Frame>
        <div className="space-y-4" aria-busy>
          <ArenaSkeleton className="h-10" />
          <ArenaSkeleton className="h-36 rounded-2xl" />
          <div className="grid grid-cols-2 gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <ArenaSkeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        </div>
      </Frame>
    )
  }

  if (!view) {
    const error = query.error
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      return <BattleMissing forbidden={error.status === 403} />
    }
    return (
      <Frame>
        <ArenaEmpty
          art="joystick"
          title="The battle didn't load"
          description={errorMessage(error)}
          action={
            <ArenaButton size="sm" onClick={() => query.refetch()}>
              <RotateCcw />
              Try again
            </ArenaButton>
          }
        />
      </Frame>
    )
  }

  const playing = PLAYING.has(view.phase)

  return (
    <Frame>
      <BattleHud
        view={view}
        bubbles={bubbles}
        prevRanks={prevRanks}
        remainingMs={remaining}
        onBack={goLobby}
        onForfeit={playing ? () => setConfirmLeave(true) : undefined}
      />

      {view.phase === 'LOBBY' && (
        <BattleLobby
          view={view}
          bubbles={bubbles}
          onStart={() => start.mutate(matchId)}
          starting={start.isPending}
          onLeave={doLeave}
          leaving={leave.isPending}
        />
      )}

      {view.phase === 'COUNTDOWN' && <BattleCountdown view={view} remainingMs={remaining} bubbles={bubbles} />}

      {(view.phase === 'QUESTION' || view.phase === 'REVEAL') && (
        <BattleRound view={view} remainingMs={remaining} answerState={answerState} onPick={pick} prevRanks={prevRanks} />
      )}

      {view.phase === 'FINISHED' && (
        <BattleResults
          view={view}
          bubbles={bubbles}
          rematching={rematch.isPending}
          onRematch={() => rematch.mutate(view.id, { onSuccess: (next) => navigate(paths.battle(next.id)) })}
        />
      )}

      {view.phase === 'CANCELLED' && <Cancelled reason={view.cancel_reason} />}

      {view.phase !== 'CANCELLED' && (
        <div className="sticky bottom-3 z-20 mt-5">
          <EmoteBar matchId={matchId} emotes={catalog.data?.emotes} />
        </div>
      )}

      <ArenaConfirm
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        icon={<Flag />}
        title="Forfeit this battle?"
        description="Points you've scored so far won't count as a win."
        confirmLabel="Forfeit"
        cancelLabel="Keep playing"
        destructive
        loading={leave.isPending}
        onConfirm={doLeave}
      />
    </Frame>
  )
}

function Cancelled({ reason }: { reason: string | null }) {
  const copy = (reason && CANCEL_COPY[reason]) || CANCEL_DEFAULT
  return (
    <div role="status">
      <ArenaEmpty art={copy.art} title={copy.title} description={copy.body} action={<BackToLobby />} className="py-12" />
    </div>
  )
}

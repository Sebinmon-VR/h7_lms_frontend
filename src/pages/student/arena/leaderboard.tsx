import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, ChevronLeft, Globe, Swords, Timer, Users } from 'lucide-react'
import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import type { ArenaLeaderboard, ArenaLeaderboardEntry, ArenaPeriod } from '@/api/arena.types'
import { ApiError } from '@/api/errors'
import { useLeaderboard, useOpenChallenges } from '@/queries/arena.queries'
import { cn } from '@/lib/cn'
import { ArenaAvatar, gradient } from '@/components/arena/arena-ui'
import {
  Art3D,
  ArenaButton,
  ArenaChip,
  ArenaEmpty,
  ArenaHeader,
  ArenaShell,
  ArenaTabs,
  RARITY_STYLE,
  TierBadge,
  type ArtName, TiltCard } from '@/components/arena/arena-theme'
import { ArenaErrorNotice, Bone, ProfileCardDialog } from '@/components/arena/profile-card'
import { AdminStudentNotice, useEnrollmentStatus } from '../student-guard'
import { HeroArt } from '@/components/arena/arena-art'

/**
 * Arena leaderboards: my class and the whole school, this week or all time,
 * with a filter per global challenge. The top three stand as portrait cards,
 * everyone else in one clean list. Tapping anyone opens their card.
 *
 * Tab, period and challenge live in the URL so a link from the arena home or
 * a results screen can land on the right board.
 */

type BoardTab = 'class' | 'school'

/** Gold, silver, bronze. */
const PLACE: Record<1 | 2 | 3, { color: string; label: string; medal: ArtName }> = {
  1: { color: '#f59e0b', label: '1st', medal: 'medal_1' },
  2: { color: '#94a3b8', label: '2nd', medal: 'medal_2' },
  3: { color: '#c2710c', label: '3rd', medal: 'medal_3' },
}

export default function ArenaLeaderboardPage() {
  const enrollment = useEnrollmentStatus()
  const isAdmin = enrollment.isAdmin
  const [params, setParams] = useSearchParams()
  const [openId, setOpenId] = React.useState<number | null>(null)

  const tabParam = params.get('tab')
  // Someone with no class has no class board; start them where something is.
  const tab: BoardTab = tabParam === 'school' || tabParam === 'class' ? tabParam : enrollment.notEnrolled ? 'school' : 'class'
  const period: ArenaPeriod = params.get('period') === 'all' ? 'all' : 'week'

  const challengesQuery = useOpenChallenges(!isAdmin)
  const challenges = (challengesQuery.data ?? []).filter((c) => c.is_open)
  const challengeParam = Number(params.get('challenge')) || null
  const challenge = challenges.find((c) => c.id === challengeParam) ?? null

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value == null) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )

  const classBoard = useLeaderboard('class', period, { enabled: !isAdmin && tab === 'class' })
  const schoolBoard = useLeaderboard(challenge ? 'challenge' : 'global', period, {
    challengeId: challenge?.id,
    enabled: !isAdmin && tab === 'school',
  })

  const header = (
    <div className="flex items-start gap-2">
      <ArenaButton asChild variant="secondary" size="icon" className="mt-0.5">
        <Link to="/student/arena" aria-label="Back to the arena">
          <ChevronLeft />
        </Link>
      </ArenaButton>
      <ArenaHeader
        className="min-w-0 flex-1"
        icon={<Art3D name="trophy" className="size-8" />}
        title="Leaderboard"
        actions={
          !isAdmin && (
            <ArenaButton asChild size="sm" variant="primary">
              <Link to="/student/arena">
                <Swords />
                Battle
              </Link>
            </ArenaButton>
          )
        }
      />
    </div>
  )

  if (isAdmin) {
    return (
      <>
        <AdminStudentNotice />
        <ArenaShell>
          {header}
          <ArenaEmpty
            art="trophy"
            title="Staff see the boards in Arena management"
            description="Every class's board, the whole school and each challenge are there."
            action={
              <ArenaButton asChild size="sm" variant="primary">
                <Link to="/admin/arena/leaderboards">
                  Open arena leaderboards
                  <ArrowRight />
                </Link>
              </ArenaButton>
            }
          />
        </ArenaShell>
      </>
    )
  }

  const classConflict = classBoard.isError && classBoard.error instanceof ApiError && classBoard.error.isConflict

  return (
    <ArenaShell>
      {header}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ArenaTabs
          aria-label="Board"
          value={tab}
          onChange={(v) => setParam('tab', v)}
          options={[
            { value: 'class', label: 'My class', icon: <Users /> },
            { value: 'school', label: 'Whole school', icon: <Globe /> },
          ]}
        />
        <ArenaTabs
          aria-label="Period"
          size="sm"
          value={period}
          onChange={(v) => setParam('period', v === 'week' ? null : v)}
          options={[
            { value: 'week', label: 'This week' },
            { value: 'all', label: 'All time' },
          ]}
        />
      </div>

      {tab === 'school' && challenges.length > 0 && (
        <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Challenge">
          <ArenaChip active={!challenge} onClick={() => setParam('challenge', null)}>
            <Globe />
            All challenges
          </ArenaChip>
          {challenges.map((c) => (
            <ArenaChip
              key={c.id}
              active={challenge?.id === c.id}
              onClick={() => setParam('challenge', challenge?.id === c.id ? null : String(c.id))}
              className="max-w-[16rem]"
            >
              <Art3D emoji={c.emoji} className="size-4 text-sm" />
              <span className="truncate">{c.title}</span>
            </ArenaChip>
          ))}
        </div>
      )}

      {tab === 'class' ? (
        classConflict ? (
          <ArenaEmpty
            art="trophy"
            title="You're not in a class yet"
            description="Your class board appears once you're enrolled. The whole-school board is open to everyone."
            action={
              <ArenaButton size="sm" variant="primary" onClick={() => setParam('tab', 'school')}>
                <Globe />
                See the whole school
              </ArenaButton>
            }
          />
        ) : (
          <BoardView
            query={classBoard}
            heading={classBoard.data?.class?.name ?? enrollment.classRoom?.name ?? 'My class'}
            period={period}
            onOpen={setOpenId}
          />
        )
      ) : (
        <BoardView query={schoolBoard} heading={challenge ? challenge.title : 'Whole school'} period={period} showClass onOpen={setOpenId} />
      )}

      <ProfileCardDialog studentId={openId} onClose={() => setOpenId(null)} />
    </ArenaShell>
  )
}

// ------------------------------------------------------------------- board

function BoardView({
  query,
  heading,
  period,
  showClass,
  onOpen,
}: {
  query: ReturnType<typeof useLeaderboard>
  heading: string
  period: ArenaPeriod
  showClass?: boolean
  onOpen: (studentId: number) => void
}) {
  if (query.isPending) return <BoardSkeleton />
  if (query.isError) return <ArenaErrorNotice error={query.error} onRetry={() => void query.refetch()} />

  const data: ArenaLeaderboard = query.data
  const entries = data.entries
  const me = data.me
  const meVisible = entries.some((e) => e.is_me)
  const rest = entries.slice(3)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="min-w-0 truncate text-base font-black uppercase italic tracking-tight text-foreground">{heading}</h2>
        <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {period === 'week' && (
            <span className="inline-flex items-center gap-1 text-info">
              <Timer className="size-3.5" aria-hidden />
              Resets Monday
            </span>
          )}
          {data.total > 0 && (
            <span className="tabular-nums">
              {data.total.toLocaleString()} player{data.total === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <ArenaEmpty
          art="trophy"
          title="No one on the board yet"
          description={
            period === 'week'
              ? 'Nobody has scored on this board this week. First win takes the top spot.'
              : 'Nobody has scored on this board yet. First win takes the top spot.'
          }
          action={
            <ArenaButton asChild size="sm" variant="primary">
              <Link to="/student/arena">
                <Swords />
                Start a battle
              </Link>
            </ArenaButton>
          }
        />
      ) : (
        <>
          <TopThree entries={entries.slice(0, 3)} onOpen={onOpen} />

          {rest.length > 0 && (
            <div>
              <div
                aria-hidden
                className="flex h-7 items-center gap-2 px-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:gap-3 sm:px-3"
              >
                <span className="w-9 text-center">#</span>
                <span className="flex-1">Player</span>
                {showClass && <span className="hidden w-32 md:block">Class</span>}
                <span className="w-10 text-right">Wins</span>
                <span className="w-16 text-right">XP</span>
              </div>
              <ol aria-label="Rankings" start={4} className="space-y-1">
                {rest.map((entry) => (
                  <li key={entry.student_id}>
                    <BoardRow entry={entry} showClass={showClass} onOpen={onOpen} />
                  </li>
                ))}
              </ol>
            </div>
          )}

          {me && !meVisible && (
            <div className="sticky bottom-3 z-10">
              <div className="overflow-hidden rounded-xl border border-primary/50 bg-card/95 shadow-[0_8px_28px_-8px_hsl(var(--primary)/0.6)] backdrop-blur">
                <BoardRow entry={me} showClass={showClass} onOpen={onOpen} pinned />
              </div>
            </div>
          )}

          {!me && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1">
              <span className="text-sm text-muted-foreground">You're not on this board yet — win a battle to rank in.</span>
              <ArenaButton asChild size="sm" variant="secondary">
                <Link to="/student/arena">
                  <Swords />
                  Play now
                </Link>
              </ArenaButton>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function RankCell({ rank }: { rank: number }) {
  const place = PLACE[rank as 1 | 2 | 3]
  if (place) {
    return (
      <span className="flex w-9 shrink-0 justify-center">
        <Art3D name={place.medal} className="size-7" />
        <span className="sr-only">Rank {rank}</span>
      </span>
    )
  }
  return (
    <span
      className={cn(
        'w-9 shrink-0 text-center font-black italic tabular-nums text-muted-foreground',
        rank > 999 ? 'text-[10px]' : rank > 99 ? 'text-xs' : 'text-sm',
      )}
    >
      <span aria-hidden>#</span>
      {rank}
      <span className="sr-only"> place</span>
    </span>
  )
}

function BoardRow({
  entry,
  showClass,
  onOpen,
  pinned,
}: {
  entry: ArenaLeaderboardEntry
  showClass?: boolean
  onOpen: (studentId: number) => void
  pinned?: boolean
}) {
  const title = entry.look.title
  return (
    <button
      type="button"
      onClick={() => onOpen(entry.student_id)}
      aria-label={`${entry.full_name}${entry.is_me ? ' (you)' : ''}, rank ${entry.rank}, ${entry.points} XP, ${entry.wins} wins of ${entry.matches} battles`}
      className={cn(
        'relative flex h-12 w-full items-center gap-2 px-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:gap-3 sm:px-3',
        !pinned && 'rounded-xl hover:bg-muted/70',
        entry.is_me && !pinned && 'bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.4),0_6px_20px_-10px_hsl(var(--primary)/0.7)] hover:bg-primary/15',
      )}
    >
      {entry.is_me && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-full bg-primary" />}
      <RankCell rank={entry.rank} />
      <ArenaAvatar look={entry.look} size="sm" level={entry.level} className="scale-90" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-bold text-foreground">{entry.full_name}</span>
          {entry.is_me && (
            <span className="shrink-0 rounded bg-primary px-1 text-[9px] font-black uppercase italic leading-4 tracking-wider text-primary-foreground">
              You
            </span>
          )}
          <TierBadge level={entry.level} size="xs" className="hidden min-[400px]:inline-flex" />
        </span>
        <span className="flex min-w-0 items-center gap-1 text-[11px] leading-tight">
          {title?.text && <span className={cn('truncate font-bold', RARITY_STYLE[title.rarity].text)}>{title.text}</span>}
          {showClass && entry.class_name && (
            <span className="truncate text-muted-foreground md:hidden">
              {title?.text ? '· ' : ''}
              {entry.class_name}
            </span>
          )}
        </span>
      </span>
      {showClass && <span className="hidden w-32 truncate text-xs text-muted-foreground md:block">{entry.class_name ?? '—'}</span>}
      <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums text-muted-foreground" title={`${entry.wins} wins · ${entry.matches} played`}>
        {entry.wins.toLocaleString()}
      </span>
      <span className="w-16 shrink-0 text-right text-sm font-black tabular-nums text-foreground">{entry.points.toLocaleString()}</span>
    </button>
  )
}

// ---------------------------------------------------------------- top three

/** The top three as portrait cards — 2nd, 1st (raised), 3rd. */
function TopThree({ entries, onOpen }: { entries: ArenaLeaderboardEntry[]; onOpen: (studentId: number) => void }) {
  const reduced = useReducedMotion()
  const ORDER = { 1: 'order-2', 2: 'order-1', 3: 'order-3' } as const

  return (
    <ol className="mx-auto grid max-w-2xl grid-cols-3 items-end gap-2 sm:gap-3" aria-label="Top three">
      {([1, 2, 3] as const).map((place) => {
        const entry = entries[place - 1]
        const p = PLACE[place]
        if (!entry) return <li key={place} className={ORDER[place]} aria-hidden />
        const first = place === 1
        return (
          <motion.li
            key={entry.student_id}
            className={cn('min-w-0', ORDER[place], !first && 'pt-5')}
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22, delay: reduced ? 0 : (3 - place) * 0.07 }}
          >
            <TiltCard
              as="button"
              max={12}
              onClick={() => onOpen(entry.student_id)}
              aria-label={`${p.label}: ${entry.full_name}${entry.is_me ? ' (you)' : ''}, ${entry.points} XP, ${entry.wins} wins`}
              className={cn(
                'group relative flex w-full flex-col overflow-hidden rounded-2xl border-2 bg-card text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                entry.is_me && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
              )}
              style={{
                borderColor: `${p.color}${first ? 'cc' : '66'}`,
                boxShadow: first ? `0 14px 34px -12px ${p.color}` : undefined,
              }}
            >
              {/* Name tab. */}
              <span
                className={cn(
                  'flex h-7 items-center justify-center px-2 text-[11px] font-black uppercase italic tracking-wide',
                  first ? 'bg-warning text-warning-foreground' : 'bg-muted text-foreground',
                )}
              >
                <span className="truncate">{entry.full_name}</span>
              </span>

              {/* Portrait on the player's banner. */}
              <span className={cn('relative isolate flex items-end justify-center overflow-hidden', first ? 'h-32 sm:h-36' : 'h-24 sm:h-28')}>
                <span aria-hidden className="absolute inset-0 -z-10 opacity-55" style={{ background: gradient(entry.look.banner?.colors, 160) }} />
                <span aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-card to-transparent" />
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-1 top-0 -z-10 text-6xl font-black italic leading-none text-foreground/10"
                >
                  {place}
                </span>
                <Art3D name={p.medal} className={cn('absolute left-1 top-1', first ? 'size-9' : 'size-7')} />
                <span className="absolute right-1.5 top-1.5 hidden min-[400px]:block">
                  <TierBadge level={entry.level} size="xs" className="bg-card/80" />
                </span>
                <HeroArt
                  avatar={entry.look.avatar}
                  float={first}
                  className={cn('transition-transform duration-300 group-hover/tilt:-translate-y-1.5 group-hover/tilt:scale-110', first ? 'size-28 text-6xl sm:size-32' : 'size-20 text-5xl sm:size-24')}
                />
              </span>

              {/* Stats. */}
              <span className="grid gap-1 px-2 pb-2 pt-1.5">
                <StatLine art="star" label="XP" value={entry.points} strong />
                <StatLine art="crossed_swords" label="Wins" value={entry.wins} />
              </span>
            </TiltCard>
          </motion.li>
        )
      })}
    </ol>
  )
}

function StatLine({ art, label, value, strong }: { art: ArtName; label: string; value: number; strong?: boolean }) {
  return (
    <span className="flex h-6 items-center gap-1 rounded-md bg-muted/60 px-1.5">
      <Art3D name={art} className="size-4 shrink-0" />
      <span className="hidden text-[10px] font-bold uppercase tracking-wider text-muted-foreground min-[400px]:inline">{label}</span>
      <span className={cn('ml-auto truncate font-black tabular-nums text-foreground', strong ? 'text-sm' : 'text-xs')}>
        {value.toLocaleString()}
      </span>
    </span>
  )
}

function BoardSkeleton() {
  return (
    <div className="space-y-4" aria-busy aria-label="Loading leaderboard">
      <Bone className="h-5 w-40" />
      <div className="mx-auto grid max-w-2xl grid-cols-3 items-end gap-2 sm:gap-3">
        <Bone className="h-48 rounded-2xl" />
        <Bone className="h-56 rounded-2xl" />
        <Bone className="h-48 rounded-2xl" />
      </div>
      <div className="space-y-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Bone key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

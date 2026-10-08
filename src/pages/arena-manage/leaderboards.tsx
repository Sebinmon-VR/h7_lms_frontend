import { Globe2, Trophy, Users } from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

import type { ArenaLeaderboardEntry, ArenaPeriod } from '@/api/arena.types'
import { useLeaderboard, useManageChallenges, useManageClasses } from '@/queries/arena.queries'
import { cn } from '@/lib/cn'
import { ArenaAvatar, rankMedal } from '@/components/arena/arena-ui'
import { ProfileCardDialog } from '@/components/arena/profile-card'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

type BoardTab = 'class' | 'global'
const ALL_GLOBAL = 'all'

function numberParam(value: string | null): number | null {
  if (!value) return null
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

export default function ArenaStaffLeaderboardsPage() {
  const [params, setParams] = useSearchParams()
  const tab: BoardTab = params.get('board') === 'global' ? 'global' : 'class'
  const period: ArenaPeriod = params.get('period') === 'all' ? 'all' : 'week'
  const [profileId, setProfileId] = React.useState<number | null>(null)

  const classesQuery = useManageClasses()
  const challengesQuery = useManageChallenges(tab === 'global')

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

  const classes = classesQuery.data ?? []
  const rawClass = numberParam(params.get('class'))
  const classId = classes.some((c) => c.id === rawClass) ? rawClass : (classes[0]?.id ?? null)

  const challenges = challengesQuery.data ?? []
  const rawChallenge = numberParam(params.get('challenge'))
  const challengeId = challenges.some((c) => c.id === rawChallenge) ? rawChallenge : null

  const board = tab === 'class' ? 'class' : challengeId != null ? 'challenge' : 'global'
  const boardQuery = useLeaderboard(board, period, {
    classId: tab === 'class' ? (classId ?? undefined) : undefined,
    challengeId: challengeId ?? undefined,
    enabled: tab === 'global' || classId != null,
  })

  const periodWord = period === 'week' ? 'this week' : 'yet'

  return (
    <>
      <PageHeader
        title="Arena leaderboards"
        description="Who is earning the most XP in quiz battles. Class boards count class battles; the global board counts global challenges."
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={tab} onValueChange={(v) => setParam({ board: v === 'global' ? 'global' : null })}>
            <TabsList>
              <TabsTrigger value="class">
                <Users />
                Class
              </TabsTrigger>
              <TabsTrigger value="global">
                <Globe2 />
                Global
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {tab === 'class' ? (
              <div className="w-full sm:w-64">
                <Combobox
                  id="arena-board-class"
                  value={classId ? String(classId) : null}
                  onChange={(v) => setParam({ class: v })}
                  placeholder={classesQuery.isPending ? 'Loading classes…' : 'Choose a class'}
                  disabled={classesQuery.isPending || classes.length === 0}
                  options={classes.map((c) => ({ value: String(c.id), label: c.name }))}
                />
              </div>
            ) : (
              <div className="w-full sm:w-64">
                <Combobox
                  id="arena-board-challenge"
                  value={challengeId ? String(challengeId) : ALL_GLOBAL}
                  onChange={(v) => setParam({ challenge: v === ALL_GLOBAL ? null : v })}
                  options={[
                    { value: ALL_GLOBAL, label: 'All global battles' },
                    ...challenges.map((c) => ({ value: String(c.id), label: `${c.emoji} ${c.title}` })),
                  ]}
                />
              </div>
            )}
            <Segmented<ArenaPeriod>
              layoutId="arena-board-period"
              value={period}
              onChange={(v) => setParam({ period: v === 'all' ? 'all' : null })}
              aria-label="Period"
              className="self-start sm:self-auto"
              options={[
                { value: 'week', label: 'This week' },
                { value: 'all', label: 'All time' },
              ]}
            />
          </div>
        </div>
      </PageHeader>

      {tab === 'class' && classesQuery.isError && !classesQuery.data ? (
        <ErrorState error={classesQuery.error} onRetry={() => classesQuery.refetch()} />
      ) : tab === 'class' && !classesQuery.isPending && classes.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No classes to show"
          description="Class boards appear for the classes you teach or lead."
        />
      ) : (
        <QueryBoundary
          query={boardQuery}
          loading={<BoardSkeleton />}
          isEmpty={(d) => d.entries.length === 0}
          empty={
            <EmptyState
              icon={<Trophy />}
              title={`No battles ${periodWord}`}
              description={
                tab === 'class'
                  ? `Nobody in this class has finished a class battle ${periodWord}. Make sure its chapters have questions.`
                  : `Nobody has finished a global battle here ${periodWord}.`
              }
            />
          }
        >
          {(data) => (
            <Card className="overflow-hidden">
              <div className="hidden grid-cols-[3.5rem_minmax(0,1fr)_6rem_4.5rem_4.5rem] gap-3 border-b border-border bg-muted/30 px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                <span>Rank</span>
                <span>Student</span>
                <span className="text-right">XP</span>
                <span className="text-right">Wins</span>
                <span className="text-right">Battles</span>
              </div>
              <ol className="divide-y divide-border">
                {data.entries.map((entry) => (
                  <BoardRow key={entry.student_id} entry={entry} onOpen={() => setProfileId(entry.student_id)} />
                ))}
              </ol>
              {data.total > data.entries.length && (
                <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
                  Top {data.entries.length} of {data.total} players.
                </p>
              )}
            </Card>
          )}
        </QueryBoundary>
      )}

      <ProfileCardDialog studentId={profileId} onClose={() => setProfileId(null)} />
    </>
  )
}

function BoardRow({ entry, onOpen }: { entry: ArenaLeaderboardEntry; onOpen: () => void }) {
  const medal = rankMedal(entry.rank)
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:grid-cols-[3.5rem_minmax(0,1fr)_6rem_4.5rem_4.5rem]"
        aria-label={`${entry.full_name}, rank ${entry.rank}. Open profile`}
      >
        <span
          className={cn('text-center font-bold tabular-nums sm:text-left', medal ? 'text-xl' : 'text-sm text-muted-foreground')}
        >
          {medal ?? entry.rank}
        </span>
        <span className="flex min-w-0 items-center gap-3">
          <ArenaAvatar look={entry.look} size="sm" level={entry.level} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{entry.full_name}</span>
            <span className="block truncate text-xs text-muted-foreground">{entry.class_name ?? 'No class'}</span>
            {/* Phones fold the numbers under the name instead of into columns. */}
            <span className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground sm:hidden">
              <span>
                <span className="font-semibold text-foreground">{entry.points.toLocaleString()}</span> XP
              </span>
              <span>{entry.wins} wins</span>
              <span>{entry.matches} battles</span>
            </span>
          </span>
        </span>
        <span className="hidden text-right text-sm font-semibold tabular-nums sm:block">
          {entry.points.toLocaleString()}
        </span>
        <span className="hidden text-right text-sm tabular-nums text-muted-foreground sm:block">{entry.wins}</span>
        <span className="hidden text-right text-sm tabular-nums text-muted-foreground sm:block">{entry.matches}</span>
      </button>
    </li>
  )
}

function BoardSkeleton() {
  return (
    <Card className="divide-y divide-border overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-5 w-6" />
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40 max-w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="hidden h-4 w-14 sm:block" />
        </div>
      ))}
    </Card>
  )
}

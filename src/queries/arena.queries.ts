import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { arenaApi, arenaManageApi } from '@/api/arena.api'
import { ApiError } from '@/api/errors'
import type {
  ArenaBoard,
  ArenaChallengeInput,
  ArenaMatchCreate,
  ArenaMatchView,
  ArenaPeriod,
  ArenaQuestionCreate,
  ArenaQuestionUpdate,
  ArenaQueueJoin,
  ChapterCreate,
  ChapterUpdate,
} from '@/api/arena.types'
import { STALE, qk } from './keys'

/**
 * Arena hooks. A live battle is polled about once a second: the server derives
 * the phase from the clock, so polling is all a client needs, and every answer
 * is timestamped server-side so the poll interval never costs points.
 */

const LIVE_PHASES = new Set(['COUNTDOWN', 'QUESTION', 'REVEAL'])

// ------------------------------------------------------------------ student

/** Home also carries incoming challenges, so it refreshes while open. */
export function useArenaHome(enabled = true) {
  return useQuery({
    queryKey: qk.arena.home(),
    queryFn: arenaApi.home,
    staleTime: 0,
    refetchInterval: 5_000,
    enabled,
  })
}

export function useArenaCatalog(enabled = true) {
  return useQuery({ queryKey: qk.arena.catalog(), queryFn: arenaApi.catalog, staleTime: STALE.transactional, enabled })
}

export function useClassmates(enabled = true) {
  return useQuery({
    queryKey: qk.arena.classmates(),
    queryFn: arenaApi.classmates,
    staleTime: 10_000,
    refetchInterval: 15_000,
    enabled,
  })
}

function useRefreshMe() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: qk.arena.home() })
    void qc.invalidateQueries({ queryKey: qk.arena.catalog() })
  }
}

export function useBuyItem() {
  const refresh = useRefreshMe()
  return useMutation({
    mutationFn: (itemId: string) => arenaApi.buy(itemId),
    // The locker celebrates the unlock itself.
    onSuccess: refresh,
  })
}

export function useEquipItem() {
  const refresh = useRefreshMe()
  return useMutation({
    mutationFn: (itemId: string) => arenaApi.equip(itemId),
    onSuccess: refresh,
  })
}

/** Polls fast while the battle is live, slower in the lobby, and stops once results are in. */
export function useArenaMatch(matchId: number | null) {
  return useQuery({
    queryKey: qk.arena.match(matchId ?? 0),
    queryFn: () => arenaApi.match(matchId as number),
    enabled: matchId != null,
    staleTime: 0,
    refetchInterval: (query) => {
      const data = query.state.data as ArenaMatchView | undefined
      if (!data) return 1_000
      if (LIVE_PHASES.has(data.phase)) return 1_000
      if (data.phase === 'LOBBY') return 1_500
      if (data.phase === 'FINISHED' && !data.results?.finalized) return 1_000
      return false
    },
    refetchIntervalInBackground: true,
  })
}

/**
 * A 409 naming the battle the student is already in is answered by the page
 * (it offers to rejoin), so only that one stays quiet; every other failure
 * still toasts as it would anywhere else.
 */
function toastUnlessBusy(error: unknown) {
  const detail = error instanceof ApiError ? (error.detail as { match_id?: unknown } | null) : null
  if (error instanceof ApiError && error.status === 409 && detail && typeof detail === 'object' && 'match_id' in detail) {
    return
  }
  toast.error(error instanceof Error ? error.message : 'Something went wrong.')
}

function useMatchMutation<TVars>(fn: (vars: TVars) => Promise<ArenaMatchView>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    meta: { silent: true },
    onError: toastUnlessBusy,
    onSuccess: (view) => {
      qc.setQueryData(qk.arena.match(view.id), view)
      void qc.invalidateQueries({ queryKey: qk.arena.home() })
    },
  })
}

export function useCreateMatch() {
  return useMatchMutation((body: ArenaMatchCreate) => arenaApi.createMatch(body))
}

export function useJoinByCode() {
  return useMatchMutation((code: string) => arenaApi.joinByCode(code))
}

export function useStartMatch() {
  return useMatchMutation((matchId: number) => arenaApi.start(matchId))
}

export function useRematch() {
  return useMatchMutation((matchId: number) => arenaApi.rematch(matchId))
}

export function useAcceptInvite() {
  return useMatchMutation((inviteId: number) => arenaApi.acceptInvite(inviteId))
}

export function useDeclineInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (inviteId: number) => arenaApi.declineInvite(inviteId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.arena.home() }),
  })
}

/** Silent: a late tap ("that question has closed") is shown in the UI, not as a toast. */
export function useAnswer(matchId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ round, optionKey }: { round: number; optionKey: string }) =>
      arenaApi.answer(matchId, round, optionKey),
    meta: { silent: true },
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.arena.match(matchId) }),
  })
}

export function useEmote(matchId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (emote: string) => arenaApi.emote(matchId, emote),
    meta: { silent: true },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.arena.match(matchId) }),
  })
}

export function useLeaveMatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (matchId: number) => arenaApi.leave(matchId),
    onSuccess: (_v, matchId) => {
      void qc.invalidateQueries({ queryKey: qk.arena.match(matchId) })
      void qc.invalidateQueries({ queryKey: qk.arena.home() })
    },
  })
}

export function useJoinQueue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ArenaQueueJoin) => arenaApi.joinQueue(body),
    meta: { silent: true },
    onError: toastUnlessBusy,
    onSuccess: (status) => qc.setQueryData(qk.arena.queue(), status),
  })
}

/** Poll while waiting for an opponent. */
export function useQueueStatus(waiting: boolean) {
  return useQuery({
    queryKey: qk.arena.queue(),
    queryFn: arenaApi.pollQueue,
    enabled: waiting,
    staleTime: 0,
    refetchInterval: waiting ? 2_000 : false,
  })
}

export function useLeaveQueue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => arenaApi.leaveQueue(),
    meta: { silent: true },
    onSettled: () => qc.setQueryData(qk.arena.queue(), { status: 'IDLE', since: null, match_id: null }),
  })
}

export function useLeaderboard(
  board: ArenaBoard,
  period: ArenaPeriod,
  opts: { challengeId?: number; classId?: number; enabled?: boolean } = {},
) {
  const id = board === 'challenge' ? opts.challengeId : opts.classId
  return useQuery({
    queryKey: qk.arena.leaderboard(board, period, id),
    queryFn: () => arenaApi.leaderboard(board, period, opts),
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: (opts.enabled ?? true) && (board !== 'challenge' || opts.challengeId != null),
  })
}

export function useProfileCard(studentId: number | null) {
  return useQuery({
    queryKey: qk.arena.profile(studentId ?? 0),
    queryFn: () => arenaApi.profileCard(studentId as number),
    enabled: studentId != null,
    staleTime: 30_000,
  })
}

export function useOpenChallenges(enabled = true) {
  return useQuery({ queryKey: qk.arena.challenges(), queryFn: arenaApi.challenges, staleTime: 60_000, enabled })
}

// ------------------------------------------------------------------- manage

export function useManageScopes(enabled = true) {
  return useQuery({ queryKey: qk.arenaManage.scopes(), queryFn: arenaManageApi.scopes, staleTime: STALE.reference, enabled })
}

export function useManageClasses(enabled = true) {
  return useQuery({ queryKey: qk.arenaManage.classes(), queryFn: arenaManageApi.classes, staleTime: STALE.reference, enabled })
}

export function useChapters(classId: number | null, subjectId: number | null) {
  return useQuery({
    queryKey: qk.arenaManage.chapters(classId ?? 0, subjectId ?? 0),
    queryFn: () => arenaManageApi.chapters(classId as number, subjectId as number),
    enabled: classId != null && subjectId != null,
    staleTime: STALE.transactional,
  })
}

function useInvalidateChapters() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: qk.arenaManage.chaptersRoot() })
    void qc.invalidateQueries({ queryKey: qk.arenaManage.root })
  }
}

export function useCreateChapter() {
  const invalidate = useInvalidateChapters()
  return useMutation({
    mutationFn: (body: ChapterCreate) => arenaManageApi.createChapter(body),
    onSuccess: (chapter) => {
      invalidate()
      toast.success(`“${chapter.title}” added`)
    },
  })
}

export function useUpdateChapter() {
  const invalidate = useInvalidateChapters()
  return useMutation({
    mutationFn: ({ chapterId, body }: { chapterId: number; body: ChapterUpdate }) =>
      arenaManageApi.updateChapter(chapterId, body),
    onSuccess: invalidate,
  })
}

export function useDeleteChapter() {
  const invalidate = useInvalidateChapters()
  return useMutation({
    mutationFn: (chapterId: number) => arenaManageApi.deleteChapter(chapterId),
    onSuccess: () => {
      invalidate()
      toast.success('Chapter deleted')
    },
  })
}

export function useReorderChapters() {
  const invalidate = useInvalidateChapters()
  return useMutation({
    mutationFn: ({ classId, subjectId, chapterIds }: { classId: number; subjectId: number; chapterIds: number[] }) =>
      arenaManageApi.reorderChapters(classId, subjectId, chapterIds),
    onSuccess: invalidate,
  })
}

export function useCopyChapters() {
  const invalidate = useInvalidateChapters()
  return useMutation({
    mutationFn: (body: { from_class_id: number; subject_id: number; to_class_id: number; include_questions: boolean }) =>
      arenaManageApi.copyChapters(body),
    onSuccess: () => {
      invalidate()
      toast.success('Chapters copied')
    },
  })
}

export function useChapterQuestions(chapterId: number | null) {
  return useQuery({
    queryKey: qk.arenaManage.chapterQuestions(chapterId ?? 0),
    queryFn: () => arenaManageApi.chapterQuestions(chapterId as number),
    enabled: chapterId != null,
    staleTime: STALE.transactional,
  })
}

export function useGlobalQuestions(enabled = true) {
  return useQuery({
    queryKey: qk.arenaManage.globalQuestions(),
    queryFn: () => arenaManageApi.globalQuestions(),
    enabled,
    staleTime: STALE.transactional,
  })
}

function useInvalidateQuestions() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: qk.arenaManage.root })
}

export function useCreateQuestion() {
  const invalidate = useInvalidateQuestions()
  return useMutation({
    mutationFn: (body: ArenaQuestionCreate) => arenaManageApi.createQuestion(body),
    onSuccess: () => {
      invalidate()
      toast.success('Question added')
    },
  })
}

export function useBulkQuestions() {
  const invalidate = useInvalidateQuestions()
  return useMutation({
    mutationFn: (body: { chapter_id?: number | null; category?: string | null; questions: ArenaQuestionCreate[] }) =>
      arenaManageApi.createQuestionsBulk(body),
    onSuccess: (result) => {
      invalidate()
      toast.success(`${result.created} question${result.created === 1 ? '' : 's'} added`)
    },
  })
}

export function useUpdateQuestion() {
  const invalidate = useInvalidateQuestions()
  return useMutation({
    mutationFn: ({ questionId, body }: { questionId: number; body: ArenaQuestionUpdate }) =>
      arenaManageApi.updateQuestion(questionId, body),
    onSuccess: () => {
      invalidate()
      toast.success('Question saved')
    },
  })
}

export function useDeleteQuestion() {
  const invalidate = useInvalidateQuestions()
  return useMutation({
    mutationFn: (questionId: number) => arenaManageApi.deleteQuestion(questionId),
    onSuccess: invalidate,
  })
}

export function useManageChallenges(enabled = true) {
  return useQuery({ queryKey: qk.arenaManage.challenges(), queryFn: arenaManageApi.challenges, staleTime: STALE.transactional, enabled })
}

function useInvalidateChallenges() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: qk.arenaManage.challenges() })
    void qc.invalidateQueries({ queryKey: qk.arena.challenges() })
  }
}

export function useCreateChallenge() {
  const invalidate = useInvalidateChallenges()
  return useMutation({
    mutationFn: (body: ArenaChallengeInput) => arenaManageApi.createChallenge(body),
    onSuccess: (c) => {
      invalidate()
      toast.success(`“${c.title}” created`)
    },
  })
}

export function useUpdateChallenge() {
  const invalidate = useInvalidateChallenges()
  return useMutation({
    mutationFn: ({ challengeId, body }: { challengeId: number; body: Partial<ArenaChallengeInput> }) =>
      arenaManageApi.updateChallenge(challengeId, body),
    onSuccess: invalidate,
  })
}

export function useDeleteChallenge() {
  const invalidate = useInvalidateChallenges()
  return useMutation({
    mutationFn: (challengeId: number) => arenaManageApi.deleteChallenge(challengeId),
    onSuccess: () => {
      invalidate()
      toast.success('Challenge deleted')
    },
  })
}

export function useInstallStarterPack() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => arenaManageApi.installStarterPack(),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: qk.arenaManage.root })
      void qc.invalidateQueries({ queryKey: qk.arena.challenges() })
      toast.success(`Starter pack installed: ${r.questions_added} questions, ${r.challenges_added} challenges`)
    },
  })
}

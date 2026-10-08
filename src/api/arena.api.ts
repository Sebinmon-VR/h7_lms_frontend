import { cleanParams, del, get, post, put } from './client'
import type {
  ArenaAnswerResult,
  ArenaBoard,
  ArenaCatalog,
  ArenaChallenge,
  ArenaChallengeInput,
  ArenaClassmate,
  ArenaHome,
  ArenaLeaderboard,
  ArenaManageScopes,
  ArenaMatchCreate,
  ArenaMatchView,
  ArenaMyProfile,
  ArenaPeriod,
  ArenaProfileCard,
  ArenaQuestion,
  ArenaQuestionCreate,
  ArenaQuestionUpdate,
  ArenaQueueJoin,
  ArenaQueueStatus,
  ArenaRecentMatch,
  ChapterCreate,
  ChapterUpdate,
  SyllabusChapter,
} from './arena.types'

/** Students: battles, rewards, boards. */
export const arenaApi = {
  home: () => get<ArenaHome>('/arena/me'),
  catalog: () => get<ArenaCatalog>('/arena/catalog'),
  buy: (itemId: string) => post<ArenaMyProfile>('/arena/shop/buy', { item_id: itemId }),
  equip: (itemId: string) => post<ArenaMyProfile>('/arena/equip', { item_id: itemId }),
  classmates: () => get<ArenaClassmate[]>('/arena/classmates'),

  createMatch: (body: ArenaMatchCreate) => post<ArenaMatchView>('/arena/matches', body),
  recentMatches: () => get<ArenaRecentMatch[]>('/arena/matches'),
  joinByCode: (code: string) => post<ArenaMatchView>('/arena/matches/join', { code }),
  match: (matchId: number) => get<ArenaMatchView>(`/arena/matches/${matchId}`),
  start: (matchId: number) => post<ArenaMatchView>(`/arena/matches/${matchId}/start`),
  answer: (matchId: number, round: number, optionKey: string) =>
    post<ArenaAnswerResult>(`/arena/matches/${matchId}/answer`, { round, option_key: optionKey }),
  emote: (matchId: number, emote: string) => post<void>(`/arena/matches/${matchId}/emote`, { emote }),
  leave: (matchId: number) => post<void>(`/arena/matches/${matchId}/leave`),
  rematch: (matchId: number) => post<ArenaMatchView>(`/arena/matches/${matchId}/rematch`),

  acceptInvite: (inviteId: number) => post<ArenaMatchView>(`/arena/invites/${inviteId}/accept`),
  declineInvite: (inviteId: number) => post<void>(`/arena/invites/${inviteId}/decline`),

  joinQueue: (body: ArenaQueueJoin) => post<ArenaQueueStatus>('/arena/queue', body),
  pollQueue: () => get<ArenaQueueStatus>('/arena/queue'),
  leaveQueue: () => del('/arena/queue'),

  /**
   * Students always get their own class on `board=class`; staff pass
   * `classId`. `challengeId` is required for `board=challenge`.
   */
  leaderboard: (board: ArenaBoard, period: ArenaPeriod, opts: { challengeId?: number; classId?: number } = {}) =>
    get<ArenaLeaderboard>('/arena/leaderboard', {
      params: cleanParams({ board, period, challenge_id: opts.challengeId, class_id: opts.classId }),
    }),
  profileCard: (studentId: number) => get<ArenaProfileCard>(`/arena/profiles/${studentId}`),
  challenges: () => get<ArenaChallenge[]>('/arena/challenges'),
}

/** Teachers and admins: chapters, question banks, global challenges. */
export const arenaManageApi = {
  scopes: () => get<ArenaManageScopes>('/arena/manage/scopes'),
  classes: () => get<Array<{ id: number; name: string }>>('/arena/manage/classes'),

  chapters: (classId: number, subjectId: number) =>
    get<SyllabusChapter[]>('/arena/manage/chapters', { params: { class_id: classId, subject_id: subjectId } }),
  createChapter: (body: ChapterCreate) => post<SyllabusChapter>('/arena/manage/chapters', body),
  updateChapter: (chapterId: number, body: ChapterUpdate) =>
    put<SyllabusChapter>(`/arena/manage/chapters/${chapterId}`, body),
  deleteChapter: (chapterId: number) => del(`/arena/manage/chapters/${chapterId}`),
  reorderChapters: (classId: number, subjectId: number, chapterIds: number[]) =>
    post<SyllabusChapter[]>('/arena/manage/chapters/reorder', {
      class_id: classId,
      subject_id: subjectId,
      chapter_ids: chapterIds,
    }),
  copyChapters: (body: { from_class_id: number; subject_id: number; to_class_id: number; include_questions: boolean }) =>
    post<SyllabusChapter[]>('/arena/manage/chapters/copy', body),

  chapterQuestions: (chapterId: number) =>
    get<ArenaQuestion[]>('/arena/manage/questions', { params: { chapter_id: chapterId } }),
  globalQuestions: (category?: string) =>
    get<ArenaQuestion[]>('/arena/manage/questions', { params: cleanParams({ scope: 'GLOBAL', category }) }),
  createQuestion: (body: ArenaQuestionCreate) => post<ArenaQuestion>('/arena/manage/questions', body),
  createQuestionsBulk: (body: { chapter_id?: number | null; category?: string | null; questions: ArenaQuestionCreate[] }) =>
    post<{ created: number }>('/arena/manage/questions/bulk', body),
  updateQuestion: (questionId: number, body: ArenaQuestionUpdate) =>
    put<ArenaQuestion>(`/arena/manage/questions/${questionId}`, body),
  deleteQuestion: (questionId: number) => del(`/arena/manage/questions/${questionId}`),

  challenges: () => get<ArenaChallenge[]>('/arena/manage/challenges'),
  createChallenge: (body: ArenaChallengeInput) => post<ArenaChallenge>('/arena/manage/challenges', body),
  updateChallenge: (challengeId: number, body: Partial<ArenaChallengeInput>) =>
    put<ArenaChallenge>(`/arena/manage/challenges/${challengeId}`, body),
  deleteChallenge: (challengeId: number) => del(`/arena/manage/challenges/${challengeId}`),
  installStarterPack: () =>
    post<{ questions_added: number; challenges_added: number; questions_in_pack: number }>(
      '/arena/manage/starter-pack',
    ),
}

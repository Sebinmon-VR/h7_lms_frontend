/**
 * Arena — quiz battles, rewards and leaderboards. Mirrors the backend's
 * app/services/arena (design in the backend repo's docs/ARENA.md).
 */
import type { ApiDateTime } from './types'

// ---------------------------------------------------------------- looks

export type ArenaSlot = 'avatar' | 'frame' | 'title' | 'banner'
export type ArenaRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'

/** One equipped item, resolved. `colors` drive frames and banners. */
export interface ArenaLookItem {
  id: string
  name: string
  emoji: string | null
  text: string | null
  colors: string[]
  rarity: ArenaRarity
  /** A hero's art key: /arena/heroes/{character}-full.webp and -head.webp. */
  character?: string | null
}

export type ArenaLook = Record<ArenaSlot, ArenaLookItem>

/** The compact player shape used on boards, lists and invites. */
export interface ArenaPlayerSummary {
  student_id: number
  full_name: string
  photo_url: string | null
  class_id: number | null
  class_name: string | null
  level: number
  xp: number
  look: ArenaLook
  badge_count: number
}

export interface ArenaLevelProgress {
  level: number
  xp: number
  level_xp: number
  next_level_xp: number
  /** 0–1 through the current level. */
  progress: number
}

export interface ArenaStats {
  matches: number
  wins: number
  losses: number
  draws: number
  correct: number
  answered: number
  win_streak: number
  best_win_streak: number
  perfect_matches: number
  human_matches: number
  global_matches: number
  bot_wins: number
  day_streak: number
  best_day_streak: number
  /** 0–1, or null before the first answer. */
  accuracy: number | null
}

export interface ArenaMyProfile extends ArenaPlayerSummary, ArenaLevelProgress {
  coins: number
  stats: ArenaStats
  owned: string[]
  equipped: Partial<Record<ArenaSlot, string>>
  badges_earned: number
  active_match_id: number | null
}

export interface ArenaBadge {
  id: string
  name: string
  emoji: string
  description: string
  rarity: ArenaRarity
  coins: number
  earned: boolean
  earned_at: ApiDateTime | null
  /** For count-based badges: how far along. */
  progress: { value: number; goal: number } | null
}

/** A badge just won, on a results screen. */
export interface ArenaNewBadge {
  id: string
  name: string
  emoji: string
  description: string
  rarity: ArenaRarity
  coins: number
}

export interface ArenaItem {
  id: string
  slot: ArenaSlot
  name: string
  rarity: ArenaRarity
  price: number
  emoji: string | null
  text: string | null
  colors: string[]
  min_level: number
  required_badge: string | null
  character?: string | null
  owned: boolean
  equipped: boolean
  locked: boolean
  lock_reason: string | null
  affordable: boolean
}

export interface ArenaCategory {
  id: string
  name: string
  emoji: string
}

export interface ArenaCatalog {
  items: ArenaItem[]
  badges: ArenaBadge[]
  emotes: string[]
  categories: ArenaCategory[]
  slots: ArenaSlot[]
  rarities: ArenaRarity[]
}

export interface ArenaProfileCard extends ArenaPlayerSummary, ArenaLevelProgress {
  stats: ArenaStats
  badges: ArenaBadge[]
  items: Array<Pick<ArenaItem, 'id' | 'slot' | 'name' | 'emoji' | 'text' | 'colors' | 'rarity'>>
  top_subjects: Array<{ subject_id: number; name: string; correct: number }>
  ranks: {
    class?: { rank: number; of: number; xp: number } | null
    global?: { rank: number; of: number; xp: number } | null
  }
  last_played_at: ApiDateTime | null
}

// ---------------------------------------------------------------- home

export interface ArenaChapterOption {
  id: number
  title: string
  order: number
  question_count: number
  playable: boolean
}

export interface ArenaSubjectOption {
  subject_id: number
  name: string
  question_count: number
  playable: boolean
  chapters: ArenaChapterOption[]
}

export interface ArenaChallenge {
  id: number
  title: string
  description: string | null
  emoji: string
  categories: string[]
  difficulty: number | null
  rounds: number
  starts_at: ApiDateTime | null
  ends_at: ApiDateTime | null
  is_active: boolean
  is_open: boolean
  question_count: number
}

export interface ArenaInvite {
  id: number
  match_id: number
  from: ArenaPlayerSummary
  title: string | null
  scope: ArenaScope
  created_at: ApiDateTime
  expires_at: ApiDateTime
}

export type ArenaOutcome = 'WIN' | 'DRAW' | 'LOSS' | 'FORFEIT'

export interface ArenaRecentMatch {
  match_id: number
  title: string | null
  mode: ArenaMode
  scope: ArenaScope
  outcome: ArenaOutcome
  rank: number | null
  players: number
  score: number
  correct: number
  rounds: number
  xp: number
  coins: number
  opponents: string[]
  finished_at: ApiDateTime
}

export type ArenaBotLevel = 'EASY' | 'MEDIUM' | 'HARD'

export interface ArenaHome {
  profile: ArenaMyProfile
  class: { id: number; name: string } | null
  subjects: ArenaSubjectOption[]
  challenges: ArenaChallenge[]
  invites: ArenaInvite[]
  active_match_id: number | null
  recent: ArenaRecentMatch[]
  bots: Array<{ level: ArenaBotLevel; name: string; avatar: string; accuracy: number }>
  min_questions: number
}

export interface ArenaClassmate extends ArenaPlayerSummary {
  is_online: boolean
  in_battle: boolean
}

// ---------------------------------------------------------------- battles

export type ArenaMode = 'BOT' | 'CHALLENGE' | 'ROOM' | 'QUICK'
export type ArenaScope = 'CLASS' | 'GLOBAL'
export type ArenaPhase = 'LOBBY' | 'COUNTDOWN' | 'QUESTION' | 'REVEAL' | 'FINISHED' | 'CANCELLED'

export interface ArenaMatchCreate {
  mode: Exclude<ArenaMode, 'QUICK'>
  scope: ArenaScope
  subject_id?: number | null
  chapter_id?: number | null
  /** Required when scope is GLOBAL. */
  challenge_id?: number | null
  bot_level?: ArenaBotLevel
  opponent_ids?: number[]
  rounds?: number
}

export interface ArenaQueueJoin {
  scope: ArenaScope
  subject_id?: number | null
  chapter_id?: number | null
  challenge_id?: number | null
}

export interface ArenaQueueStatus {
  status: 'IDLE' | 'WAITING' | 'MATCHED'
  since: ApiDateTime | null
  match_id: number | null
}

export interface ArenaOption {
  key: string
  text: string
}

export interface ArenaMatchPlayer {
  /** Seat id: the user id as a string, or "bot:<level>". */
  id: string
  user_id: number | null
  name: string
  photo_url?: string | null
  look: ArenaLook
  level: number
  is_bot: boolean
  bot_level?: ArenaBotLevel | null
  is_host: boolean
  is_me: boolean
  left: boolean
  /** Over revealed rounds only — opponents' points stay hidden until the reveal. */
  score: number
  correct: number
  streak: number
  rank: number | null
  /** Has answered the current question (never says whether correctly). */
  answered: boolean
}

export interface ArenaPick {
  option_key: string
  correct: boolean
  points: number
}

export interface ArenaMatchResultsMine {
  outcome: ArenaOutcome
  rank: number | null
  score: number
  correct: number
  rounds: number
  xp: number
  coins: number
  badge_coins: number
  new_badges: ArenaNewBadge[]
  level_before: number
  level_after: number
  level_up: boolean
  progress_level: number
  progress_xp: number
  progress_level_xp: number
  progress_next_level_xp: number
  progress_progress: number
}

export interface ArenaMatchView {
  id: number
  mode: ArenaMode
  scope: ArenaScope
  title: string | null
  subtitle: string | null
  emoji: string | null
  /** Rooms only. */
  code: string | null
  host_id: number | null
  is_host: boolean
  status: 'LOBBY' | 'LIVE' | 'FINISHED' | 'CANCELLED'
  phase: ArenaPhase
  /** The server's clock; derive the timer offset from it. Naive UTC ISO. */
  server_now: string
  phase_starts_at: string | null
  phase_ends_at: string | null
  round: number | null
  round_count: number
  question_seconds: number
  reveal_seconds: number
  players: ArenaMatchPlayer[]
  max_players: number
  can_start: boolean
  question: {
    index: number
    text: string
    question_type: 'MCQ' | 'TRUE_FALSE'
    options: ArenaOption[]
    difficulty: number
  } | null
  my_answer: ArenaPick | null
  /** Only during the REVEAL phase. `picks` is keyed by seat id. */
  reveal: {
    correct_key: string
    explanation: string | null
    picks: Record<string, ArenaPick>
  } | null
  results: {
    standings: Array<{ user_id: string; rank: number; score: number; correct: number; streak: number }>
    /** False for the moment between the last reveal and the rewards being written. */
    finalized: boolean
    mine: ArenaMatchResultsMine | null
    questions: Array<{
      text: string
      options: ArenaOption[]
      correct_key: string
      explanation: string | null
      my_pick: string | null
      my_correct: boolean
    }>
  } | null
  invites: Array<{ id: number; to_id: number; name: string | null; status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' }>
  emotes: Array<{ id: string; user_id: number; emote: string; at: string }>
  rematch_id: number | null
  cancel_reason: string | null
}

export interface ArenaAnswerResult {
  accepted: boolean
  correct: boolean
  points: number
  streak: number
}

// ---------------------------------------------------------------- leaderboards

export type ArenaBoard = 'class' | 'global' | 'challenge'
export type ArenaPeriod = 'week' | 'all'

export interface ArenaLeaderboardEntry extends ArenaPlayerSummary {
  rank: number
  points: number
  wins: number
  matches: number
  is_me: boolean
}

export interface ArenaLeaderboard {
  board: string
  period: ArenaPeriod
  period_key: string
  total: number
  entries: ArenaLeaderboardEntry[]
  me: ArenaLeaderboardEntry | null
  class?: { id: number; name: string | null }
}

// ---------------------------------------------------------------- manage

export interface ArenaScopePair {
  class_id: number
  class_name: string
  subject_id: number
  subject_name: string
}

export interface ArenaManageScopes {
  pairs: ArenaScopePair[]
  is_admin: boolean
  categories: ArenaCategory[]
  /** Admins only: every class and subject, to set up a pair nobody is mapped to yet. */
  classes?: Array<{ id: number; name: string }>
  subjects?: Array<{ id: number; name: string }>
}

export interface SyllabusChapter {
  id: number
  class_id: number
  subject_id: number
  title: string
  description: string | null
  order: number
  is_active: boolean
  question_count: number
  active_question_count: number
  created_at: ApiDateTime
  updated_at: ApiDateTime | null
}

export interface ChapterCreate {
  class_id: number
  subject_id: number
  title: string
  description?: string | null
}

export interface ChapterUpdate {
  title?: string
  description?: string | null
  is_active?: boolean
}

export type ArenaQuestionType = 'MCQ' | 'TRUE_FALSE'

export interface ArenaQuestion {
  id: number
  scope: 'CLASS' | 'GLOBAL'
  class_id: number | null
  subject_id: number | null
  chapter_id: number | null
  category: string | null
  question_type: ArenaQuestionType
  text: string
  options: ArenaOption[]
  correct_key: string
  explanation: string | null
  /** 1 easy, 2 medium, 3 hard. */
  difficulty: number
  is_active: boolean
  created_at: ApiDateTime
}

/**
 * A new question. CLASS questions name `chapter_id`; GLOBAL ones (admins) a
 * `category`. TRUE_FALSE may omit options; `correct_key` is then TRUE/FALSE.
 */
export interface ArenaQuestionCreate {
  chapter_id?: number | null
  category?: string | null
  question_type: ArenaQuestionType
  text: string
  options?: ArenaOption[]
  correct_key: string
  explanation?: string | null
  difficulty?: number
  is_active?: boolean
}

export type ArenaQuestionUpdate = Partial<Omit<ArenaQuestionCreate, 'chapter_id'>>

export interface ArenaChallengeInput {
  title: string
  description?: string | null
  emoji?: string
  categories?: string[]
  difficulty?: number | null
  rounds?: number
  starts_at?: string | null
  ends_at?: string | null
  is_active?: boolean
}

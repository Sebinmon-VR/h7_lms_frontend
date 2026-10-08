import { cleanParams, del, get, post, put } from './client'
import type { ApiDateTime } from './types'
import type { ArenaNewBadge } from './arena.types'

/** The virtual lab's server side: assignments and results. The chemistry runs in the browser. */

export interface LabAssignment {
  id: number
  class_id: number
  library_id: string | null
  /** A teacher-built experiment (same shape as the lab's Experiment), or null for a library one. */
  experiment: Record<string, unknown> | null
  /** The id the lab opens: the library id, or "custom-<assignment id>". */
  experiment_id: string
  title: string
  emoji: string
  topic: string
  instructions: string | null
  due_at: ApiDateTime | null
  is_active: boolean
  teacher_id: number
  created_at: ApiDateTime
  /** Teacher lists only. */
  completed_by?: number
  class_size?: number
  /** Student lists only. */
  attempts?: number
  best?: { score: number; total: number; completed_at: ApiDateTime } | null
}

export interface LabAssignmentInput {
  class_id: number
  library_id?: string | null
  experiment?: Record<string, unknown> | null
  title?: string | null
  instructions?: string | null
  due_at?: string | null
  is_active?: boolean
}

export interface LabAttemptInput {
  experiment_id: string
  assignment_id?: number | null
  score: number
  total: number
  observations: string[]
  seconds?: number | null
}

export interface LabAttemptResult {
  id: number
  first_time: boolean
  xp: number
  coins: number
  new_badges: ArenaNewBadge[]
  level_before: number | null
  level_after: number | null
}

export interface LabResults {
  assignment: LabAssignment
  students: Array<{
    student_id: number
    full_name: string
    attempts: number
    best: { score: number; total: number } | null
    last_completed_at: ApiDateTime | null
    observations: string[]
  }>
}

export const labApi = {
  myAssignments: () => get<LabAssignment[]>('/lab/assignments'),
  recordAttempt: (body: LabAttemptInput) => post<LabAttemptResult>('/lab/attempts', body),
}

export const labManageApi = {
  assignments: (classId?: number) =>
    get<LabAssignment[]>('/lab/manage/assignments', { params: cleanParams({ class_id: classId }) }),
  create: (body: LabAssignmentInput) => post<LabAssignment>('/lab/manage/assignments', body),
  update: (id: number, body: Partial<LabAssignmentInput>) => put<LabAssignment>(`/lab/manage/assignments/${id}`, body),
  remove: (id: number) => del(`/lab/manage/assignments/${id}`),
  results: (id: number) => get<LabResults>(`/lab/manage/assignments/${id}/results`),
}

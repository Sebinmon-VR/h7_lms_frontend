import { del, get, post, put } from './client'
import type { ApiDateTime } from './types'

/**
 * Class recordings, the teacher's side.
 *
 * A class taught in the LMS is recorded; once the video is ready it belongs to
 * the teacher who started it, to review. Publishing files it into the class
 * library (study materials, `material_type` 'RECORDING') under its class and
 * subject, where only students of that class can watch it. Each teacher has a
 * rule — publish automatically, or wait here for review (the default).
 */

/**
 * RECORDING — being recorded now; WAITING — stopped, the video is being
 * prepared and arrives a few minutes later; STORED — ready; FAILED — see
 * `error`. Typed open-ended so a new server state never breaks the page.
 */
export type ClassRecordingStatus = 'RECORDING' | 'WAITING' | 'STORED' | 'FAILED'

export interface ClassRecordingFile {
  /** Absolute, signed https URL valid for about four hours — usable as <video src> directly. */
  file_url: string | null
  name: string | null
  size_bytes: number | null
  started_at: ApiDateTime | null
}

export interface ClassRecordingOut {
  key: string
  /** The teacher's own title once they set one; `default_title` otherwise. */
  title: string | null
  default_title: string
  status: ClassRecordingStatus | string
  error: string | null
  class_id: number | null
  class_name: string | null
  /** Null when the call was not tied to a subject — publishing then needs one. */
  subject_id: number | null
  subject_name: string | null
  meeting_id: number | null
  started_by: number | null
  started_by_name: string | null
  started_at: ApiDateTime | null
  stopped_at: ApiDateTime | null
  duration_ms: number | null
  published: boolean
  published_at: ApiDateTime | null
  material_ids: number[]
  files: ClassRecordingFile[]
}

export interface PublishRecordingBody {
  title?: string
  subject_id?: number
}

export interface RecordingPreferences {
  auto_publish: boolean
}

const base = (key: string) => `/recordings/${encodeURIComponent(key)}`

export const recordingsApi = {
  /** Newest first. Teachers, class teachers and admins. */
  mine: () => get<ClassRecordingOut[]>('/recordings/mine'),

  /**
   * Files the video into the class library. 409 with a `detail` when the
   * video is not ready yet, or when the recording has no subject and none was
   * given.
   */
  publish: (key: string, body: PublishRecordingBody) =>
    post<ClassRecordingOut>(`${base(key)}/publish`, body),

  /** Takes it out of the class library; the video itself is kept. */
  unpublish: (key: string) => post<ClassRecordingOut>(`${base(key)}/unpublish`),

  /** Deletes the video for good. 409 while it is still being recorded. */
  remove: (key: string) => del(base(key)),

  preferences: () => get<RecordingPreferences>('/recordings/preferences'),

  updatePreferences: (body: RecordingPreferences) =>
    put<RecordingPreferences>('/recordings/preferences', body),
}

import { getAccessToken, post } from './client'
import { API_BASE } from '@/lib/env'

/**
 * Live classes inside the LMS (Azure Communication Services).
 *
 * The links stored on class rooms, sessions and tuition classes are app paths,
 * `/call/<kind>/<id>`, and the call page talks to these four endpoints. The
 * server applies the same rules as every join button before it hands out a
 * token, so a bookmarked link is no way round a closed class.
 */
export type CallKind = 'class' | 'meeting' | 'tuition'

export const CALL_KINDS: readonly CallKind[] = ['class', 'meeting', 'tuition']

export interface CallSession {
  kind: CallKind
  entity_id: string
  title: string
  subtitle: string | null
  room_id: string
  acs_user_id: string
  token: string
  expires_on: string
  display_name: string
  role: 'Presenter' | 'Attendee'
  is_host: boolean
  /** Whether this person's connecting starts the recording. */
  records: boolean
  recording_active: boolean
  ends_at: string | null
}

const base = (kind: CallKind, id: string) => `/calls/${kind}/${encodeURIComponent(id)}`

export const callsApi = {
  /** "Let me in": 409 with the reason when the class is not open to this person now. */
  open: (kind: CallKind, id: string) =>
    post<CallSession>(`${base(kind, id)}/session`, undefined, { meta: { skipAuthRedirect: true } }),

  /** "I am in": logged as the join; starts the teacher's recording. */
  connected: (kind: CallKind, id: string, serverCallId: string | null) =>
    post<{ ok: boolean; recording_started: boolean; recording_active: boolean }>(
      `${base(kind, id)}/connected`,
      { server_call_id: serverCallId },
    ),

  /** "I have left": logged as the leave; stops any recording this person started. */
  left: (kind: CallKind, id: string) => post<{ ok: boolean }>(`${base(kind, id)}/left`),

  recording: (kind: CallKind, id: string, action: 'start' | 'stop', serverCallId: string | null) =>
    post<{ ok: boolean; recording_active: boolean }>(`${base(kind, id)}/recording`, {
      action,
      server_call_id: serverCallId,
    }),
}

/**
 * The same "I have left" for a tab that is closing, when an ordinary request
 * would be cancelled with the page. A keep-alive fetch survives the unload and,
 * unlike sendBeacon, can carry the bearer token.
 */
export function reportLeftOnUnload(kind: CallKind, id: string) {
  const token = getAccessToken()
  if (!token) return
  try {
    void fetch(`${API_BASE}${base(kind, id)}/left`, {
      method: 'POST',
      keepalive: true,
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    /* the page is going away; nothing to tell anyone */
  }
}

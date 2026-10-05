import { toast } from 'sonner'

import type { LiveMeetingOut, RecordingStatus } from '@/api/types'

/**
 * Reading a session's recording state.
 *
 * The lifecycle is written by the backend sweep (`app/services/recordings.py`)
 * and every stage is a normal outcome, not an error: a class nobody joined ends
 * at UNAVAILABLE, and a class that is still being processed sits at WAITING for
 * minutes. The wording here says which of those it is, because "no recording"
 * on its own sends a teacher to look for a fault that does not exist.
 */

export const RECORDING_LABEL: Record<RecordingStatus, string> = {
  NOT_REQUESTED: 'Not recorded',
  ARMED: 'Will record',
  ARM_FAILED: 'Recording not armed',
  RECORDING: 'Recording now',
  WAITING: 'Processing',
  STORED: 'Recording ready',
  UNAVAILABLE: 'Never recorded',
  FAILED: 'Recording failed',
}

export function recordingLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown'
  return RECORDING_LABEL[status as RecordingStatus] ?? status
}

/**
 * Default wording per stage, used when the server recorded no `recording_error`
 * of its own. Its message is always preferred — it names the actual cause.
 */
const RECORDING_HINT: Record<RecordingStatus, string> = {
  NOT_REQUESTED:
    'This session was not set to record itself. A link pasted in by hand belongs to a call the LMS cannot record.',
  ARMED:
    'Recording starts on its own when the teacher joins the class in the LMS. Nobody has to press anything.',
  ARM_FAILED:
    'Automatic recording could not be switched on for this session.',
  RECORDING: 'The class is being recorded right now.',
  WAITING:
    'Recording has stopped and the video is being prepared. This usually takes a few minutes.',
  STORED: 'The video is saved to school storage and the class can watch it back.',
  UNAVAILABLE:
    'Nothing was recorded — the teacher never joined this class through the LMS.',
  FAILED: 'A recording exists but it could not be saved to school storage.',
}

/** Why a session is in the recording state it is in, in one sentence. */
export function recordingHint(meeting: LiveMeetingOut): string {
  const status = meeting.recording_status as RecordingStatus | null | undefined
  if (meeting.recording_error) return meeting.recording_error
  if (!status) return 'This session predates automatic recording, so nothing is known about it.'
  return RECORDING_HINT[status] ?? ''
}

/** Still moving — worth showing a "coming" state rather than a gap. */
export function recordingIsPending(meeting: LiveMeetingOut): boolean {
  const status = meeting.recording_status
  return (
    status === 'ARMED' || status === 'ARM_FAILED' || status === 'RECORDING' || status === 'WAITING'
  )
}

/**
 * Whether "collect the recording now" can do anything for this session.
 *
 * The backend answers 400 unless an LMS room of its own backs the meeting,
 * so this asks the two questions the client can actually answer: did the LMS
 * make the room, and is the video not already filed. NOT_REQUESTED still
 * qualifies, since the check is cheap and the server has the last word.
 */
export function canCollectRecording(meeting: LiveMeetingOut, phase: 'live' | 'upcoming' | 'past'): boolean {
  if (phase !== 'past') return false
  if (meeting.recording_status === 'STORED' || meeting.recording_status === 'RECORDING') return false
  const fromLmsConference =
    meeting.meet_status === 'CREATED' ||
    (!!meeting.recording_status && meeting.recording_status !== 'NOT_REQUESTED')
  return fromLmsConference
}

/**
 * Reports the outcome of "collect the recording now", which has five ordinary
 * endings and only one bad one.
 *
 * Shared by the teacher and admin mutations so both say the same thing. The
 * server's own `recording_error` wins wherever it wrote one: it names the
 * actual cause — a storage account that refused the upload, say — which beats
 * anything the client could infer from a status alone.
 */
export function reportRecordingOutcome(meeting: LiveMeetingOut) {
  const hint = recordingHint(meeting)

  switch (meeting.recording_status) {
    case 'STORED':
      toast.success('Recording filed', {
        description: 'It is saved to school storage, and the class can watch it back.',
      })
      return
    case 'RECORDING':
      toast.info('Still recording', { description: hint, duration: 8_000 })
      return
    case 'WAITING':
      toast.info('Not ready yet', { description: hint, duration: 8_000 })
      return
    case 'UNAVAILABLE':
      toast.warning('No recording for this session', { description: hint, duration: 8_000 })
      return
    case 'FAILED':
      toast.error('The recording could not be filed', { description: hint, duration: 10_000 })
      return
    default:
      toast.info('Nothing to collect yet', { description: hint, duration: 8_000 })
  }
}

import type { LiveMeetingOut } from '@/api/types'

/**
 * Live-class links come in two shapes.
 *
 * A room the LMS runs itself (Azure Communication Services) is a RELATIVE app
 * path — `/call/class/{classId}`, `/call/meeting/{meetingId}`,
 * `/call/tuition/{sessionId}` — which opens inside this app. A link pasted in
 * by hand (a Zoom or Teams meeting, say) is a full https URL. Both work as an
 * `href` or with `window.open` as they are.
 */

/** True for an LMS room path rather than an outside https link. */
export function isAppPath(link: string | null | undefined): boolean {
  return !!link && link.startsWith('/') && !link.startsWith('//')
}

/**
 * The link as a full address, for copying or sharing. A relative LMS path is
 * resolved against this app's origin; anything else is returned unchanged.
 */
export function shareableLink(link: string | null | undefined): string {
  if (!link) return ''
  if (!isAppPath(link)) return link
  try {
    return new URL(link, window.location.origin).href
  } catch {
    return link
  }
}

/** What a meeting-link input accepts: empty, an https URL, or an LMS room path. */
export function isValidMeetingLink(value: string): boolean {
  const v = value.trim()
  return v === '' || /^https?:\/\/\S+$/i.test(v) || isAppPath(v)
}

/**
 * A session that still carries a Google Meet link the LMS generated before
 * live classes moved into the LMS. Those rooms no longer work; the admin
 * "Give this session a working room" action replaces them. A Meet link someone
 * pasted in by hand (`meet_status: 'MANUAL'`) is theirs and left alone.
 */
export function hasRetiredMeetLink(meeting: Pick<LiveMeetingOut, 'meeting_link' | 'meet_status'>): boolean {
  return (
    !!meeting.meeting_link &&
    meeting.meet_status !== 'MANUAL' &&
    /^https?:\/\/meet\.google\.com\//i.test(meeting.meeting_link)
  )
}

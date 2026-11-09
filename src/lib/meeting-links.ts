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

/** A tab being opened for a class, filled in once the server says the class may be joined. */
export interface JoinTab {
  /** Sends the tab (or, on a phone or tablet, this page) to the room. */
  go: (link: string) => void
  /** The server said no: close the blank tab again. */
  cancel: () => void
}

/**
 * Call this in the click handler itself, BEFORE asking the server to let the
 * person in, and hand the link to `go` when it answers.
 *
 * Phones and tablets — Safari on iPhone and iPad, Chrome on Android — silently
 * block a tab opened after a network round trip: by the time the answer comes
 * back the tap no longer counts as the user's, so `window.open` does nothing
 * and the Join button looks dead. Laptops allow a few seconds' grace, which is
 * why joining worked there and nowhere else.
 *
 * So on a touch device the class opens in this same tab (the call page has its
 * own way back), and elsewhere the new tab is opened during the click, blank,
 * and pointed at the room once the server agrees.
 */
export function startJoin(navigate?: (to: string) => void): JoinTab {
  const touch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
  let tab: Window | null = null
  if (!touch) {
    try {
      tab = window.open('', '_blank')
    } catch {
      tab = null
    }
    if (tab) {
      try {
        tab.document.title = 'Opening your class…'
        tab.document.body.style.cssText = 'font: 14px system-ui, sans-serif; color: #555; display: grid; place-items: center; height: 100vh; margin: 0'
        tab.document.body.textContent = 'Opening your class…'
      } catch {
        // Nothing to show: the tab is about to move on anyway.
      }
    }
  }
  return {
    go: (link) => {
      if (tab && !tab.closed) {
        tab.location.href = shareableLink(link)
        try {
          tab.opener = null
        } catch {
          // Already cut off.
        }
        return
      }
      if (isAppPath(link) && navigate) navigate(link)
      else window.location.assign(shareableLink(link))
    },
    cancel: () => {
      if (tab && !tab.closed) tab.close()
    },
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

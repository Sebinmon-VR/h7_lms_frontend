import { NoticeFeed } from '@/pages/shared/notices'

/**
 * The tuition notice board as a tutor or student reads it.
 *
 * Its own route under `/tuition` so the sidebar stays on the tuition product
 * while it is open — the shared `/notices` path reads as the school, and a
 * tuition student following it found the menu had switched underneath them.
 */
export default function TuitionNoticeFeedPage() {
  return <NoticeFeed board="TUITION" />
}

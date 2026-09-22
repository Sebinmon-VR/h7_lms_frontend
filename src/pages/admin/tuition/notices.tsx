import { NoticeBoardAdmin } from '@/pages/admin/notices'

/**
 * The tuition notice board, authoring side.
 *
 * The same screen as the school's, pointed at `/admin/tuition/notices`. What
 * differs is decided by the board: no CLASS audience (tuition has enrollments,
 * not classes), the people picker lists tuition accounts, and everything posted
 * here reaches tuition students and tutors only.
 */
export default function AdminTuitionNoticesPage() {
  return <NoticeBoardAdmin board="TUITION" />
}

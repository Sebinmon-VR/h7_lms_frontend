/**
 * Remembers, for this tab, that a student chose to step out of an exam they are sitting.
 *
 * While it is set the app is not locked to the exam - a banner offers the way back instead.
 * Cleared as soon as they return to the exam page. Session storage, so a new tab or a fresh
 * sign-in starts locked again; every access is guarded because storage can be unavailable.
 */
const key = (examId: number) => `h7lms.exam-left.${examId}`

export function markExamLeft(examId: number): void {
  try {
    sessionStorage.setItem(key(examId), '1')
  } catch {
    /* storage unavailable: the lock simply stays on */
  }
}

export function clearExamLeft(examId: number): void {
  try {
    sessionStorage.removeItem(key(examId))
  } catch {
    /* nothing to clear */
  }
}

export function hasLeftExam(examId: number): boolean {
  try {
    return sessionStorage.getItem(key(examId)) === '1'
  } catch {
    return false
  }
}

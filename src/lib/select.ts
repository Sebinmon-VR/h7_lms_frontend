import type { ClassRoomOut, SubjectOut, UserOut } from '@/api/types'
import { shortId } from './format'

/**
 * Null-safe accessors for the hydrated nested objects.
 *
 * Most `*Out` models declare `subject`, `class_room`, `teacher` and `student`
 * as nullable, so `x.subject.name` is a crash waiting to happen. Every read
 * goes through here: nested object first, then a directory lookup by the flat
 * id, then an honest placeholder.
 */
export type Directory<T> = Map<number, T>

export function buildDirectory<T extends { id: number }>(items: Iterable<T>): Directory<T> {
  const map = new Map<number, T>()
  for (const item of items) map.set(item.id, item)
  return map
}

export function subjectName(
  record: { subject?: SubjectOut | null; subject_id: number },
  dir?: Directory<SubjectOut>,
): string {
  return record.subject?.name ?? dir?.get(record.subject_id)?.name ?? `Subject ${shortId(record.subject_id)}`
}

export function subjectCode(
  record: { subject?: SubjectOut | null; subject_id: number },
  dir?: Directory<SubjectOut>,
): string | null {
  return record.subject?.code ?? dir?.get(record.subject_id)?.code ?? null
}

export function className(
  record: { class_room?: ClassRoomOut | null; class_id: number },
  dir?: Directory<ClassRoomOut>,
): string {
  return record.class_room?.name ?? dir?.get(record.class_id)?.name ?? `Class ${shortId(record.class_id)}`
}

export function classCode(
  record: { class_room?: ClassRoomOut | null; class_id: number },
  dir?: Directory<ClassRoomOut>,
): string | null {
  return record.class_room?.code ?? dir?.get(record.class_id)?.code ?? null
}

export function teacherName(
  record: { teacher?: UserOut | null; teacher_id: number },
  dir?: Directory<UserOut>,
): string {
  // AttendanceOut has teacher_id but no teacher object — the directory is the
  // only way to name who marked a record.
  return record.teacher?.full_name ?? dir?.get(record.teacher_id)?.full_name ?? `Teacher ${shortId(record.teacher_id)}`
}

export function studentName(
  record: { student?: UserOut | null; student_id: number },
  dir?: Directory<UserOut>,
): string {
  return record.student?.full_name ?? dir?.get(record.student_id)?.full_name ?? `Student ${shortId(record.student_id)}`
}

export function studentEmail(
  record: { student?: UserOut | null; student_id: number },
  dir?: Directory<UserOut>,
): string | null {
  return record.student?.email ?? dir?.get(record.student_id)?.email ?? null
}

/** True when the referenced user exists but has been deactivated. */
export function isInactiveRef(id: number, dir?: Directory<UserOut>): boolean {
  const user = dir?.get(id)
  return user ? !user.is_active : false
}

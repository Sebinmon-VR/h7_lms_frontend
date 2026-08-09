import { get } from './client'
import type {
  AttendanceOut,
  ExamGradeOut,
  LiveMeetingOut,
  StudyMaterialOut,
  TeacherMappingOut,
  TopicOut,
} from './types'

/**
 * Read-only. Four of these resolve the student's class from the FIRST
 * enrollment found, so a student is effectively single-class; a second
 * enrollment is silently invisible.
 *
 * `subject_id` filtering exists server-side but is again a post-fetch list
 * comprehension, so we fetch unfiltered and filter in the client.
 */
export const studentApi = {
  /** Returns teacher mappings for the student's class, not enrollments. */
  myClasses: () => get<TeacherMappingOut[]>('/students/my-classes'),
  attendance: () => get<AttendanceOut[]>('/students/attendance'),
  topics: () => get<TopicOut[]>('/students/topics'),
  meetings: () => get<LiveMeetingOut[]>('/students/meetings'),
  materials: () => get<StudyMaterialOut[]>('/students/materials'),
  grades: () => get<ExamGradeOut[]>('/students/grades'),
}

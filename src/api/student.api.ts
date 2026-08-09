import { cleanParams, get } from './client'
import type {
  ApiDate,
  AttendanceOut,
  ExamGradeOut,
  LiveMeetingOut,
  ScheduledPeriod,
  StudyMaterialOut,
  TeacherMappingOut,
  TimetableEntryOut,
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

  /**
   * The weekly timetable across every class the student is enrolled in — one
   * of the few student endpoints that is NOT limited to the first enrollment.
   */
  timetable: () => get<TimetableEntryOut[]>('/students/timetable'),

  /** One date's classes, with absolute instants resolved server-side. */
  timetableDay: (onDate?: ApiDate) =>
    get<ScheduledPeriod[]>('/students/timetable/day', { params: cleanParams({ on_date: onDate }) }),

  /** The next classes coming up, looking across days rather than within one. */
  timetableUpcoming: (daysAhead = 7, limit = 10) =>
    get<ScheduledPeriod[]>('/students/timetable/upcoming', {
      params: cleanParams({ days_ahead: daysAhead, limit }),
    }),
}

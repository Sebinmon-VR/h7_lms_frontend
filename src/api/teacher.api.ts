import { cleanParams, del, get, post, put } from './client'
import type {
  AttendanceOut,
  AttendanceUpdate,
  BatchAttendanceCreate,
  ExamGradeOut,
  GradeEntryCreate,
  GradeEntryUpdate,
  LiveMeetingCreate,
  LiveMeetingOut,
  LiveMeetingUpdate,
  StudyMaterialCreate,
  StudyMaterialOut,
  StudyMaterialUpdate,
  TeacherMappingOut,
  TopicCreate,
  TopicOut,
  TopicUpdate,
  UserOut,
} from './types'

/**
 * Every list endpoint here also accepts `class_id` / `subject_id`, but the
 * backend implements those as Python list comprehensions over the same full
 * fetch — there is no server-side benefit. We always fetch unfiltered and
 * filter client-side, which gives one cache entry and instant filter changes.
 *
 * Every update and delete below is ownership-scoped server-side: a teacher may
 * only touch records they created, and a violation comes back as a 403 that
 * `ApiError.isOwnershipViolation` recognises. Admins bypass the check.
 */
export const teacherApi = {
  myClasses: () => get<TeacherMappingOut[]>('/teachers/my-classes'),

  /** Active students only. The backend does not check class ownership. */
  classStudents: (classId: number) => get<UserOut[]>(`/teachers/classes/${classId}/students`),

  listAttendance: () => get<AttendanceOut[]>('/teachers/attendance'),

  /**
   * Upsert on (student_id, class_id, subject_id, date) — re-posting a date
   * edits the existing records and preserves their original `created_at`.
   */
  markAttendance: (body: BatchAttendanceCreate) =>
    post<AttendanceOut[]>('/teachers/attendance', body),

  /**
   * Corrects a single record in place. Only status, remarks and date are
   * editable — moving a record to another class or subject means re-posting
   * the batch.
   */
  updateAttendance: (recordId: number, body: AttendanceUpdate) =>
    put<AttendanceOut>(`/teachers/attendance/${recordId}`, body),

  deleteAttendance: (recordId: number) => del(`/teachers/attendance/${recordId}`),

  listTopics: () => get<TopicOut[]>('/teachers/topics'),
  createTopic: (body: TopicCreate) => post<TopicOut>('/teachers/topics', body),
  updateTopic: (topicId: number, body: TopicUpdate) =>
    put<TopicOut>(`/teachers/topics/${topicId}`, body),
  deleteTopic: (topicId: number) => del(`/teachers/topics/${topicId}`),

  listMeetings: () => get<LiveMeetingOut[]>('/teachers/meetings'),

  /**
   * A 201 with a null `meeting_link` is a SUCCESS, not a failure: Meet
   * generation is best-effort and the schedule is saved either way. Callers
   * must report that honestly rather than treating it as an error.
   */
  createMeeting: (body: LiveMeetingCreate) => post<LiveMeetingOut>('/teachers/meetings', body),

  /** Title and time changes propagate to the backing Google Calendar event. */
  updateMeeting: (meetingId: number, body: LiveMeetingUpdate) =>
    put<LiveMeetingOut>(`/teachers/meetings/${meetingId}`, body),

  /** Also deletes the Calendar event, which notifies invited students. */
  deleteMeeting: (meetingId: number) => del(`/teachers/meetings/${meetingId}`),

  listMaterials: () => get<StudyMaterialOut[]>('/teachers/materials'),

  /** multipart/form-data; the file field must be named exactly `file`. */
  uploadMaterial: (body: StudyMaterialCreate, onProgress?: (percent: number) => void) => {
    const form = new FormData()
    form.append('class_id', String(body.class_id))
    form.append('subject_id', String(body.subject_id))
    form.append('title', body.title)
    form.append('material_type', body.material_type)
    form.append('file', body.file)

    return post<StudyMaterialOut>('/teachers/materials', form, {
      timeout: 120_000,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
      },
    })
  },

  /** Metadata only — the stored file cannot be swapped, only re-uploaded. */
  updateMaterial: (materialId: number, body: StudyMaterialUpdate) =>
    put<StudyMaterialOut>(`/teachers/materials/${materialId}`, body),

  /**
   * Removes the record and, unless `keepFile`, the underlying object in Cloud
   * Storage or Drive. `keepFile` is the escape hatch for a file that is linked
   * from somewhere outside the LMS.
   */
  deleteMaterial: (materialId: number, keepFile = false) =>
    del(`/teachers/materials/${materialId}`, {
      params: cleanParams({ keep_file: keepFile || undefined }),
    }),

  listGrades: () => get<ExamGradeOut[]>('/teachers/grades'),
  createGrade: (body: GradeEntryCreate) => post<ExamGradeOut>('/teachers/grades', body),

  /** Validated against the merged record — a partial update can still 400. */
  updateGrade: (gradeId: number, body: GradeEntryUpdate) =>
    put<ExamGradeOut>(`/teachers/grades/${gradeId}`, body),

  deleteGrade: (gradeId: number) => del(`/teachers/grades/${gradeId}`),
}

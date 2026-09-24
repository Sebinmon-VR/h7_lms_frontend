import { cleanParams, del, delWithBody, get, post, put } from './client'
import type {
  ApiDate,
  AttendanceOut,
  AttendanceUpdate,
  BatchAttendanceCreate,
  ClassTeacherMappingOut,
  ScheduledPeriod,
  TimetableEntryOut,
  ExamGradeOut,
  GradeEntryCreate,
  GradeEntryUpdate,
  LiveMeetingCreate,
  LiveMeetingOut,
  LiveMeetingUpdate,
  PendingTopicOut,
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
 * `ApiError.isOwnershipViolation` recognises. Admins bypass the check, and so
 * does the CLASS TEACHER of the class a record belongs to — correcting what
 * the subject teachers filed is the point of that role.
 *
 * The same widening applies to reads: `listAttendance`, `listTopics`,
 * `listMeetings`, `listMaterials` and `listGrades` return this teacher's own
 * records PLUS everything filed against the classes they lead, whoever entered
 * it. Callers must not describe those lists as "what you recorded" without
 * checking `teacher_id` against the signed-in user.
 */
export const teacherApi = {
  myClasses: () => get<TeacherMappingOut[]>('/teachers/my-classes'),

  /**
   * The classes this teacher is the CLASS TEACHER of — distinct from
   * `myClasses`, which lists the subject-and-class periods they teach.
   *
   * These are the classes they answer for as a whole, and the reason the five
   * listing endpoints below can return records filed by other teachers. An
   * empty array is the normal case for a subject teacher, and the signal that
   * the class-teacher views should stay hidden for them.
   */
  myLedClasses: () => get<ClassTeacherMappingOut[]>('/teachers/my-led-classes'),

  /** Active students only. The backend does not check class ownership. */
  classStudents: (classId: number) => get<UserOut[]>(`/teachers/classes/${classId}/students`),

  /**
   * The periods this teacher takes, for the whole week, ordered weekday then
   * start time. Recurring rules, not calendar days — see `TimetableEntryOut`.
   */
  timetable: () => get<TimetableEntryOut[]>('/teachers/timetable'),

  /**
   * One date's periods with absolute instants resolved server-side, so the
   * client never redoes weekday or school-timezone arithmetic.
   */
  timetableDay: (onDate?: ApiDate) =>
    get<ScheduledPeriod[]>('/teachers/timetable/day', { params: cleanParams({ on_date: onDate }) }),

  /**
   * The next periods coming up, looking ACROSS days — which is the point: the
   * next lesson in a subject may not be until next week.
   */
  timetableUpcoming: (daysAhead = 7, limit = 10) =>
    get<ScheduledPeriod[]>('/teachers/timetable/upcoming', {
      params: cleanParams({ days_ahead: daysAhead, limit }),
    }),

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

  /** Periods of yours that ended today with nothing logged yet — the dashboard's prompt. */
  pendingTopics: () => get<PendingTopicOut[]>('/teachers/topics/pending'),

  /**
   * multipart/form-data; the file field must be named exactly `file`. Notes,
   * an image or a voice note recorded in the browser. Returns the topic with
   * its attachments.
   */
  addTopicAttachment: (
    topicId: number,
    file: File,
    meta: { kind?: string; caption?: string } = {},
    onProgress?: (percent: number) => void,
  ) => {
    const form = new FormData()
    form.append('file', file)
    if (meta.kind) form.append('kind', meta.kind)
    if (meta.caption) form.append('caption', meta.caption)
    return post<TopicOut>(`/teachers/topics/${topicId}/attachments`, form, {
      timeout: 120_000,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
      },
    })
  },

  /** Removes one attachment and its file; returns the topic. */
  removeTopicAttachment: (topicId: number, attachmentId: string) =>
    delWithBody<TopicOut>(`/teachers/topics/${topicId}/attachments/${attachmentId}`),

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

  /**
   * Files this session's recording now rather than waiting for the sweep.
   *
   * Recordings are collected automatically a few minutes after each class ends,
   * so this is for the impatient case — a teacher who has just finished and
   * wants the video in front of the class. Calling it again later is free: an
   * already-filed video is never filed twice, and a recording Meet is still
   * processing comes back as `recording_status: 'WAITING'`.
   *
   * 400 when the meeting has no Meet conference behind it, i.e. its link was
   * pasted in by hand.
   */
  syncMeetingRecording: (meetingId: number) =>
    post<LiveMeetingOut>(`/teachers/meetings/${meetingId}/recording/sync`, undefined, {
      timeout: 120_000,
    }),

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

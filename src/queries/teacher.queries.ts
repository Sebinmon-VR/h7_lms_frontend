import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { teacherApi } from '@/api/teacher.api'
import { ApiError } from '@/api/errors'
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
  TopicCreate,
  TopicOut,
  TopicUpdate,
  UserOut,
} from '@/api/types'
import { reportRecordingOutcome } from '@/lib/recordings'
import { STALE, qk } from './keys'
import { markMonitoringStale } from './query-client'

export function useMyClasses(enabled = true) {
  return useQuery({
    queryKey: qk.teacher.myClasses(),
    queryFn: teacherApi.myClasses,
    staleTime: STALE.reference,
    enabled,
  })
}

/**
 * The classes this teacher LEADS, which is not the same question as
 * `useMyClasses` — that one lists the subject periods they teach.
 *
 * An empty array is the ordinary case for a subject teacher, and the signal
 * that the class-teacher views stay hidden. Non-empty, it also explains why the
 * record lists below contain rows this teacher did not file.
 */
export function useMyLedClasses(enabled = true) {
  return useQuery({
    queryKey: qk.teacher.myLedClasses(),
    queryFn: teacherApi.myLedClasses,
    staleTime: STALE.reference,
    enabled,
  })
}

export function useClassStudents(classId: number | null) {
  return useQuery({
    queryKey: qk.teacher.classStudents(classId ?? 0),
    queryFn: () => teacherApi.classStudents(classId as number),
    staleTime: STALE.reference,
    enabled: classId != null,
  })
}

/** Rosters for several classes at once — the one unavoidable fan-out. */
export function useClassRosters(classIds: number[]) {
  return useQueries({
    queries: classIds.map((id) => ({
      queryKey: qk.teacher.classStudents(id),
      queryFn: () => teacherApi.classStudents(id),
      staleTime: STALE.reference,
    })),
    combine: (results) => ({
      isPending: results.some((r) => r.isPending),
      isError: results.some((r) => r.isError),
      /** classId -> active students */
      byClass: Object.fromEntries(
        classIds.map((id, i) => [id, (results[i]?.data ?? []) as UserOut[]]),
      ) as Record<number, UserOut[]>,
    }),
  })
}

export function useTeacherAttendance(enabled = true) {
  return useQuery({
    queryKey: qk.teacher.attendance(),
    queryFn: teacherApi.listAttendance,
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useTeacherTopics(enabled = true) {
  return useQuery({
    queryKey: qk.teacher.topics(),
    queryFn: teacherApi.listTopics,
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useTeacherMeetings(enabled = true) {
  return useQuery({
    queryKey: qk.teacher.meetings(),
    queryFn: teacherApi.listMeetings,
    staleTime: STALE.transactional,
    enabled,
  })
}

export function useTeacherMaterials(enabled = true) {
  return useQuery({
    queryKey: qk.teacher.materials(),
    queryFn: teacherApi.listMaterials,
    staleTime: STALE.transactional,
    enabled,
  })
}

/**
 * Class marks only. Auto-marking a tuition assessment writes a grade row too,
 * and that row carries no `class_id` — every screen reading this hook groups by
 * class, so a tuition mark has nowhere to sit.
 */
export function useTeacherGrades(enabled = true) {
  return useQuery({
    queryKey: qk.teacher.grades(),
    queryFn: teacherApi.listGrades,
    select: (grades) => grades.filter((g) => g.class_id != null),
    staleTime: STALE.transactional,
    enabled,
  })
}

/** The weekly grid — recurring rules, which barely change. */
export function useTeacherTimetable(enabled = true) {
  return useQuery({
    queryKey: qk.teacher.timetable(),
    queryFn: teacherApi.timetable,
    staleTime: STALE.reference,
    enabled,
  })
}

/** One date's periods, with the countdown the server computed. */
export function useTeacherDaySchedule(onDate?: string, enabled = true) {
  return useQuery({
    queryKey: qk.teacher.timetableDay(onDate),
    queryFn: () => teacherApi.timetableDay(onDate),
    staleTime: STALE.schedule,
    enabled,
  })
}

/**
 * "What's next", across days.
 *
 * Refetched on an interval because its whole value is the countdown: a panel
 * frozen at "in 12 minutes" through a lesson that has already started is worse
 * than no panel.
 */
export function useTeacherUpcoming(enabled = true) {
  return useQuery({
    queryKey: qk.teacher.timetableUpcoming(),
    queryFn: () => teacherApi.timetableUpcoming(),
    staleTime: STALE.schedule,
    refetchInterval: 5 * 60_000,
    enabled,
  })
}

// -------------------------------------------------------------- mutations

const upsertKey = (r: { student_id: number; class_id: number; subject_id: number; date: string }) =>
  `${r.student_id}|${r.class_id}|${r.subject_id}|${r.date}`

/**
 * The backend upserts on (student_id, class_id, subject_id, date), so the
 * returned rows replace any existing ones for that key rather than adding to
 * them. Merging by that key keeps the cache consistent after an edit.
 */
export function useMarkAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: BatchAttendanceCreate) => teacherApi.markAttendance(body),
    onSuccess: (saved) => {
      qc.setQueryData<AttendanceOut[]>(qk.teacher.attendance(), (prev) => {
        if (!prev) return prev
        const incoming = new Map(saved.map((r) => [upsertKey(r), r]))
        const merged = prev.map((r) => incoming.get(upsertKey(r)) ?? r)
        const existing = new Set(merged.map(upsertKey))
        return [...merged, ...saved.filter((r) => !existing.has(upsertKey(r)))]
      })
      void qc.invalidateQueries({ queryKey: qk.teacher.attendance() })
      markMonitoringStale()
    },
  })
}

/**
 * Optimistic: correcting a mis-marked student is a one-click action inside a
 * grid, and a round-trip of latency there feels broken.
 */
export function useUpdateAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ recordId, body }: { recordId: number; body: AttendanceUpdate }) =>
      teacherApi.updateAttendance(recordId, body),
    onMutate: async ({ recordId, body }) => {
      await qc.cancelQueries({ queryKey: qk.teacher.attendance() })
      const snapshot = qc.getQueryData<AttendanceOut[]>(qk.teacher.attendance())
      qc.setQueryData<AttendanceOut[]>(qk.teacher.attendance(), (prev) =>
        prev?.map((r) => (r.id === recordId ? { ...r, ...body } : r)),
      )
      return { snapshot }
    },
    onError: (_error, _vars, context) => {
      if (context?.snapshot) qc.setQueryData(qk.teacher.attendance(), context.snapshot)
    },
    onSuccess: () => {
      markMonitoringStale()
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.teacher.attendance() })
    },
  })
}

/**
 * Deletes one record. Callers own the success toast: clearing a whole day
 * fires this once per student, and a hook-level toast would stack a dozen
 * identical notifications for a single user action.
 *
 * The optimistic rollback is deliberately per-record rather than snapshotting
 * the whole list, so one failure inside a bulk delete restores only its own
 * row and leaves the successful ones removed.
 */
export function useDeleteAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (recordId: number) => teacherApi.deleteAttendance(recordId),
    onMutate: async (recordId) => {
      await qc.cancelQueries({ queryKey: qk.teacher.attendance() })
      const removed = qc
        .getQueryData<AttendanceOut[]>(qk.teacher.attendance())
        ?.find((r) => r.id === recordId)
      qc.setQueryData<AttendanceOut[]>(qk.teacher.attendance(), (prev) =>
        prev?.filter((r) => r.id !== recordId),
      )
      return { removed }
    },
    onError: (_error, _recordId, context) => {
      if (!context?.removed) return
      qc.setQueryData<AttendanceOut[]>(qk.teacher.attendance(), (prev) =>
        prev && !prev.some((r) => r.id === context.removed!.id) ? [...prev, context.removed!] : prev,
      )
    },
    onSuccess: () => {
      markMonitoringStale()
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.teacher.attendance() })
    },
  })
}

export function useCreateTopic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TopicCreate) => teacherApi.createTopic(body),
    onSuccess: (created) => {
      qc.setQueryData<TopicOut[]>(qk.teacher.topics(), (prev) => (prev ? [created, ...prev] : prev))
      void qc.invalidateQueries({ queryKey: qk.teacher.topics() })
      markMonitoringStale()
      toast.success('Topic logged')
    },
  })
}

export function useUpdateTopic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ topicId, body }: { topicId: number; body: TopicUpdate }) =>
      teacherApi.updateTopic(topicId, body),
    onSuccess: (updated) => {
      qc.setQueryData<TopicOut[]>(qk.teacher.topics(), (prev) =>
        prev?.map((t) => (t.id === updated.id ? updated : t)),
      )
      void qc.invalidateQueries({ queryKey: qk.teacher.topics() })
      markMonitoringStale()
      toast.success('Topic updated')
    },
  })
}

export function useDeleteTopic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (topicId: number) => teacherApi.deleteTopic(topicId),
    onMutate: async (topicId) => {
      await qc.cancelQueries({ queryKey: qk.teacher.topics() })
      const snapshot = qc.getQueryData<TopicOut[]>(qk.teacher.topics())
      qc.setQueryData<TopicOut[]>(qk.teacher.topics(), (prev) => prev?.filter((t) => t.id !== topicId))
      return { snapshot }
    },
    onError: (_error, _topicId, context) => {
      if (context?.snapshot) qc.setQueryData(qk.teacher.topics(), context.snapshot)
    },
    onSuccess: () => {
      markMonitoringStale()
      toast.success('Topic removed')
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.teacher.topics() })
    },
  })
}

/**
 * A 201 carrying a null `meeting_link` means the meeting was saved but Google
 * Meet generation was unavailable. That is a documented degraded success, so
 * we confirm the save and say plainly that the link is missing rather than
 * showing a green "scheduled" toast over a meeting nobody can join.
 */
export function useCreateMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: LiveMeetingCreate) => teacherApi.createMeeting(body),
    onSuccess: (created, submitted) => {
      qc.setQueryData<LiveMeetingOut[]>(qk.teacher.meetings(), (prev) => (prev ? [created, ...prev] : prev))
      void qc.invalidateQueries({ queryKey: qk.teacher.meetings() })

      const wantedMeetLink = submitted.auto_create_meet !== false && !submitted.meeting_link
      if (wantedMeetLink && !created.meeting_link) {
        // The server now records WHY, which beats the generic guess this used
        // to make. It stays a fallback for meetings created before that landed.
        toast.warning('Meeting scheduled without a Meet link', {
          description:
            created.meet_error ??
            'Google Meet could not generate a link for this session. The meeting is saved — add a link manually, or ask an administrator to retry it once Workspace delegation is in place.',
          duration: 10_000,
        })
      } else if (created.recording_status === 'ARM_FAILED' && submitted.auto_record !== false) {
        // The link works, but Meet refused to arm recording — a partial success
        // nobody would notice until the class was over and no video appeared.
        toast.warning('Scheduled, but it will not record itself', {
          description:
            created.recording_error ??
            'Google Meet would not switch automatic recording on for this session. An administrator can check what is missing under Recordings.',
          duration: 10_000,
        })
      } else if (created.google_event_id) {
        toast.success('Meeting scheduled', {
          description:
            created.recording_status === 'ARMED'
              ? 'The class has been invited, and the session will record itself.'
              : 'A Google Calendar invitation has been sent to the enrolled students.',
        })
      } else {
        toast.success('Meeting scheduled')
      }
    },
  })
}

export function useUpdateMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ meetingId, body }: { meetingId: number; body: LiveMeetingUpdate }) =>
      teacherApi.updateMeeting(meetingId, body),
    onSuccess: (updated) => {
      qc.setQueryData<LiveMeetingOut[]>(qk.teacher.meetings(), (prev) =>
        prev?.map((m) => (m.id === updated.id ? updated : m)),
      )
      void qc.invalidateQueries({ queryKey: qk.teacher.meetings() })
      toast.success('Meeting updated', {
        description: updated.google_event_id
          ? 'The Google Calendar event was updated for every invited student.'
          : undefined,
      })
    },
  })
}

export function useDeleteMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (meetingId: number) => teacherApi.deleteMeeting(meetingId),
    onMutate: async (meetingId) => {
      await qc.cancelQueries({ queryKey: qk.teacher.meetings() })
      const snapshot = qc.getQueryData<LiveMeetingOut[]>(qk.teacher.meetings())
      qc.setQueryData<LiveMeetingOut[]>(qk.teacher.meetings(), (prev) =>
        prev?.filter((m) => m.id !== meetingId),
      )
      return { snapshot, removed: snapshot?.find((m) => m.id === meetingId) }
    },
    onError: (_error, _meetingId, context) => {
      if (context?.snapshot) qc.setQueryData(qk.teacher.meetings(), context.snapshot)
    },
    onSuccess: (_data, _meetingId, context) => {
      toast.success('Meeting cancelled', {
        description: context?.removed?.google_event_id
          ? 'The Google Calendar event was deleted and attendees were notified.'
          : undefined,
      })
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.teacher.meetings() })
    },
  })
}

/**
 * Collects this session's recording now instead of waiting for the sweep.
 *
 * Every outcome below is reported as what it is rather than as a failure:
 * recordings are filed automatically a few minutes after a class ends, so the
 * ordinary answer to pressing this early is "Meet has not published it yet".
 * Only a genuine 4xx/5xx reaches `onError`.
 */
export function useSyncMeetingRecording() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (meetingId: number) => teacherApi.syncMeetingRecording(meetingId),
    onSuccess: (updated) => {
      qc.setQueryData<LiveMeetingOut[]>(qk.teacher.meetings(), (prev) =>
        prev?.map((m) => (m.id === updated.id ? updated : m)),
      )
      void qc.invalidateQueries({ queryKey: qk.teacher.meetings() })
      // Students read the same record, and a filed recording is the point.
      void qc.invalidateQueries({ queryKey: qk.student.meetings() })
      reportRecordingOutcome(updated)
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : 'Could not collect the recording.',
        { duration: 8_000 },
      )
    },
  })
}

export function useUploadMaterial(onProgress?: (percent: number) => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: StudyMaterialCreate) => teacherApi.uploadMaterial(body, onProgress),
    onSuccess: (created) => {
      qc.setQueryData<StudyMaterialOut[]>(qk.teacher.materials(), (prev) =>
        prev ? [created, ...prev] : prev,
      )
      void qc.invalidateQueries({ queryKey: qk.teacher.materials() })
      markMonitoringStale()

      // The upload succeeded either way, but a file that quietly landed on the
      // server's disk instead of Drive is something the uploader should know:
      // it is the difference between "students can open this" and "maybe not".
      if (created.storage_warning) {
        toast.warning(`“${created.title}” was stored on the server disk`, {
          description: created.storage_warning,
          duration: 10_000,
        })
      } else {
        toast.success(`“${created.title}” uploaded`)
      }
    },
  })
}

export function useUpdateMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ materialId, body }: { materialId: number; body: StudyMaterialUpdate }) =>
      teacherApi.updateMaterial(materialId, body),
    onSuccess: (updated) => {
      qc.setQueryData<StudyMaterialOut[]>(qk.teacher.materials(), (prev) =>
        prev?.map((m) => (m.id === updated.id ? updated : m)),
      )
      void qc.invalidateQueries({ queryKey: qk.teacher.materials() })
      toast.success(`“${updated.title}” updated`)
    },
  })
}

/**
 * `keepFile` leaves the object in Cloud Storage or Drive behind. Default is a
 * full delete, because an orphaned file nobody can reach from the LMS is the
 * worse outcome of the two.
 */
export function useDeleteMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ materialId, keepFile }: { materialId: number; keepFile?: boolean }) =>
      teacherApi.deleteMaterial(materialId, keepFile),
    onMutate: async ({ materialId }) => {
      await qc.cancelQueries({ queryKey: qk.teacher.materials() })
      const snapshot = qc.getQueryData<StudyMaterialOut[]>(qk.teacher.materials())
      qc.setQueryData<StudyMaterialOut[]>(qk.teacher.materials(), (prev) =>
        prev?.filter((m) => m.id !== materialId),
      )
      return { snapshot }
    },
    onError: (_error, _vars, context) => {
      if (context?.snapshot) qc.setQueryData(qk.teacher.materials(), context.snapshot)
    },
    onSuccess: (_data, { keepFile }) => {
      markMonitoringStale()
      toast.success(keepFile ? 'Material removed, stored file kept' : 'Material and file deleted')
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.teacher.materials() })
    },
  })
}

export function useCreateGrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: GradeEntryCreate) => teacherApi.createGrade(body),
    onSuccess: (created) => {
      qc.setQueryData<ExamGradeOut[]>(qk.teacher.grades(), (prev) => (prev ? [created, ...prev] : prev))
      void qc.invalidateQueries({ queryKey: qk.teacher.grades() })
      markMonitoringStale()
    },
  })
}

/**
 * Not optimistic: the backend re-validates marks against the MERGED record, so
 * a partial update can still 400 (`marks_obtained` above the stored
 * `max_marks`). Showing the new mark before the server accepts it would mean
 * showing a number that is about to be rejected.
 */
export function useUpdateGrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ gradeId, body }: { gradeId: number; body: GradeEntryUpdate }) =>
      teacherApi.updateGrade(gradeId, body),
    onSuccess: (updated) => {
      qc.setQueryData<ExamGradeOut[]>(qk.teacher.grades(), (prev) =>
        prev?.map((g) => (g.id === updated.id ? updated : g)),
      )
      void qc.invalidateQueries({ queryKey: qk.teacher.grades() })
      markMonitoringStale()
      toast.success('Grade updated')
    },
  })
}

export function useDeleteGrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (gradeId: number) => teacherApi.deleteGrade(gradeId),
    onMutate: async (gradeId) => {
      await qc.cancelQueries({ queryKey: qk.teacher.grades() })
      const snapshot = qc.getQueryData<ExamGradeOut[]>(qk.teacher.grades())
      qc.setQueryData<ExamGradeOut[]>(qk.teacher.grades(), (prev) => prev?.filter((g) => g.id !== gradeId))
      return { snapshot }
    },
    onError: (_error, _gradeId, context) => {
      if (context?.snapshot) qc.setQueryData(qk.teacher.grades(), context.snapshot)
    },
    onSuccess: () => {
      markMonitoringStale()
      toast.success('Grade deleted')
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.teacher.grades() })
    },
  })
}

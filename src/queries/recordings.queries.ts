import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  recordingsApi,
  type ClassRecordingOut,
  type PublishRecordingBody,
  type RecordingPreferences,
} from '@/api/recordings.api'
import { ApiError } from '@/api/errors'
import { STALE, qk } from './keys'
import { markMonitoringStale } from './query-client'

/** Still moving — the list is polled while any of these is on it. */
export function recordingInProgress(recording: Pick<ClassRecordingOut, 'status'>): boolean {
  return recording.status === 'RECORDING' || recording.status === 'WAITING'
}

const POLL_MS = 20_000

/**
 * The teacher's recordings, newest first.
 *
 * Polled every 20s only while something is being recorded or prepared: that
 * is the one state that changes without anybody pressing anything, and a
 * teacher waiting for "Preparing video" to turn into "Ready to review" should
 * not have to reload to see it.
 */
export function useMyRecordings(enabled = true) {
  return useQuery({
    queryKey: qk.teacher.recordings(),
    queryFn: recordingsApi.mine,
    staleTime: STALE.transactional,
    enabled,
    refetchInterval: (query) =>
      (query.state.data ?? []).some(recordingInProgress) ? POLL_MS : false,
  })
}

export function useRecordingPreferences(enabled = true) {
  return useQuery({
    queryKey: qk.teacher.recordingPreferences(),
    queryFn: recordingsApi.preferences,
    staleTime: STALE.reference,
    enabled,
  })
}

/**
 * Publishing or unpublishing moves a video in or out of the class library,
 * which every materials list reads, and flips `recording_published` on the
 * session it came from. All of those go stale together.
 */
function invalidateAfterPublishChange(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.teacher.recordings() })
  void qc.invalidateQueries({ queryKey: qk.teacher.materials() })
  void qc.invalidateQueries({ queryKey: qk.admin.materials() })
  void qc.invalidateQueries({ queryKey: qk.student.materials() })
  void qc.invalidateQueries({ queryKey: qk.teacher.meetings() })
  void qc.invalidateQueries({ queryKey: qk.admin.meetings() })
  void qc.invalidateQueries({ queryKey: qk.student.meetings() })
  markMonitoringStale()
}

function replaceInList(qc: QueryClient, updated: ClassRecordingOut) {
  qc.setQueryData<ClassRecordingOut[]>(qk.teacher.recordings(), (prev) =>
    prev?.map((r) => (r.key === updated.key ? updated : r)),
  )
}

/**
 * Silent on error: the publish dialog shows the server's reason inline — a 409
 * saying "pick a subject" belongs next to the subject picker, not in a toast.
 */
export function usePublishRecording() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ key, body }: { key: string; body: PublishRecordingBody }) =>
      recordingsApi.publish(key, body),
    onSuccess: (updated) => {
      replaceInList(qc, updated)
      invalidateAfterPublishChange(qc)
      toast.success('Published to the class library', {
        description: `Students of ${updated.class_name ?? 'the class'} can now watch “${
          updated.title ?? updated.default_title
        }” under ${updated.subject_name ?? 'its subject'}.`,
      })
    },
  })
}

export function useUnpublishRecording() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => recordingsApi.unpublish(key),
    onSuccess: (updated) => {
      replaceInList(qc, updated)
      invalidateAfterPublishChange(qc)
      toast.success('Taken out of the class library', {
        description: 'Students can no longer watch it. The video is still here if you change your mind.',
      })
    },
  })
}

export function useDeleteRecording() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => recordingsApi.remove(key),
    onMutate: async (key) => {
      await qc.cancelQueries({ queryKey: qk.teacher.recordings() })
      const snapshot = qc.getQueryData<ClassRecordingOut[]>(qk.teacher.recordings())
      qc.setQueryData<ClassRecordingOut[]>(qk.teacher.recordings(), (prev) =>
        prev?.filter((r) => r.key !== key),
      )
      return { snapshot }
    },
    onError: (_error, _key, context) => {
      if (context?.snapshot) qc.setQueryData(qk.teacher.recordings(), context.snapshot)
    },
    onSuccess: () => {
      toast.success('Recording deleted')
    },
    onSettled: () => {
      // A published video disappears from the library along with it.
      invalidateAfterPublishChange(qc)
    },
  })
}

export function useUpdateRecordingPreferences() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: RecordingPreferences) => recordingsApi.updatePreferences(body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: qk.teacher.recordingPreferences() })
      const snapshot = qc.getQueryData<RecordingPreferences>(qk.teacher.recordingPreferences())
      qc.setQueryData<RecordingPreferences>(qk.teacher.recordingPreferences(), body)
      return { snapshot }
    },
    onError: (error, _body, context) => {
      if (context?.snapshot) qc.setQueryData(qk.teacher.recordingPreferences(), context.snapshot)
      toast.error(error instanceof ApiError ? error.message : 'Could not change the rule.')
    },
    onSuccess: (saved) => {
      qc.setQueryData(qk.teacher.recordingPreferences(), saved)
      toast.success(
        saved.auto_publish
          ? 'New recordings will go straight to the class library'
          : 'New recordings will wait here for your review',
      )
    },
  })
}

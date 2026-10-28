import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, ClipboardCheck, RefreshCw, Save } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { liveClassApi, type PeriodRegisterOut, type RegisterStatus } from '@/api/classes.api'
import { ApiError } from '@/api/errors'
import { formatTime } from '@/lib/datetime'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const STATUSES: { value: RegisterStatus; label: string; tone: string }[] = [
  { value: 'PRESENT', label: 'Present', tone: 'data-[on=true]:bg-success data-[on=true]:text-success-foreground' },
  { value: 'LATE', label: 'Late', tone: 'data-[on=true]:bg-warning data-[on=true]:text-warning-foreground' },
  { value: 'ABSENT', label: 'Absent', tone: 'data-[on=true]:bg-danger data-[on=true]:text-danger-foreground' },
  { value: 'EXCUSED', label: 'Excused', tone: 'data-[on=true]:bg-primary data-[on=true]:text-primary-foreground' },
]
const LABEL: Record<RegisterStatus, string> = { PRESENT: 'Present', LATE: 'Late', ABSENT: 'Absent', EXCUSED: 'Excused' }

export function registerKey(classId: number) {
  return ['class-room', classId, 'register'] as const
}

/** The register query, shared with the call page so it can open the panel when it is not taken. */
export function usePeriodRegister(classId: number, enabled: boolean) {
  return useQuery({
    queryKey: registerKey(classId),
    queryFn: () => liveClassApi.periodRegister(classId),
    enabled,
    retry: false,
    staleTime: 30_000,
  })
}

/**
 * The teacher's register for their period, inside the live class.
 *
 * Filled in from who joined the class room: in for the start of the period is Present,
 * came in later is Late, never in is Absent. The teacher checks it, changes what is wrong,
 * and saves - only then is it the register. Each teacher's period is its own register.
 */
export function RegisterPanel({ classId }: { classId: number }) {
  const qc = useQueryClient()
  const query = usePeriodRegister(classId, true)
  const [marks, setMarks] = React.useState<Record<number, RegisterStatus>>({})

  const data = query.data
  React.useEffect(() => {
    if (data) setMarks(Object.fromEntries(data.students.map((s) => [s.student_id, s.status])))
  }, [data])

  const save = useMutation({
    meta: { silent: true },
    mutationFn: (register: PeriodRegisterOut) =>
      liveClassApi.savePeriodRegister(classId, {
        subject_id: register.subject_id,
        date: register.date,
        attendance_list: register.students.map((s) => ({
          student_id: s.student_id,
          status: marks[s.student_id] ?? s.status,
          remarks: s.remarks,
        })),
      }),
    onSuccess: (saved) => {
      qc.setQueryData(registerKey(classId), saved)
      toast.success(`Register saved for ${saved.subject_name ?? 'your period'}`)
    },
    onError: (error) =>
      toast.error('The register could not be saved', { description: error instanceof ApiError ? error.message : undefined }),
  })

  if (query.isPending) return <Skeleton className="h-64 w-full rounded-xl" />
  if (query.isError || !data) {
    return (
      <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        {query.error instanceof ApiError ? query.error.message : 'The register could not be opened.'}
      </p>
    )
  }

  const counts = data.students.reduce<Record<RegisterStatus, number>>(
    (acc, s) => ({ ...acc, [marks[s.student_id] ?? s.status]: acc[marks[s.student_id] ?? s.status] + 1 }),
    { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 },
  )
  const changed = data.students.some((s) => (marks[s.student_id] ?? s.status) !== (s.saved_status ?? s.suggested))

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-1 border-b border-border pb-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardCheck className="size-4 text-primary" />
          {data.subject_name ?? 'Your period'} · {formatTime(data.starts_at)}–{formatTime(data.ends_at)}
        </p>
        <p className="text-xs text-muted-foreground">
          {data.taken
            ? `Taken${data.taken_by ? ` by ${data.taken_by}` : ''}. Change anything and save again.`
            : `Not taken yet. Filled in from who joined: in for the start is Present, more than ${data.late_after_minutes} minutes in is Late. Check it and save.`}
        </p>
        <div className="flex flex-wrap gap-2 pt-1 text-2xs">
          {STATUSES.map((s) => (
            <span key={s.value} className="rounded-full bg-muted px-2 py-0.5">
              {s.label} {counts[s.value]}
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-2 py-3">
        <Button
          variant="outline"
          size="sm"
          icon={<CheckCheck />}
          onClick={() => setMarks(Object.fromEntries(data.students.map((s) => [s.student_id, 'PRESENT' as const])))}
        >
          All present
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw />}
          loading={query.isFetching}
          onClick={async () => {
            const fresh = await query.refetch()
            if (fresh.data) setMarks(Object.fromEntries(fresh.data.students.map((s) => [s.student_id, s.saved_status ?? s.suggested])))
          }}
        >
          Refresh from who joined
        </Button>
      </div>

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {data.students.map((student) => {
          const mark = marks[student.student_id] ?? student.status
          return (
            <li key={student.student_id} className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn('size-2 shrink-0 rounded-full', student.in_room_now ? 'bg-success' : 'bg-muted-foreground/30')}
                  title={student.in_room_now ? 'In the room now' : 'Not in the room now'}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{student.name}</span>
              </div>
              <p className="ml-4 text-2xs text-muted-foreground">
                {student.joined_at
                  ? `Joined ${formatTime(student.joined_at)} · ${Math.round(student.minutes)} min in this period`
                  : 'Did not join during this period'}
                {mark !== student.suggested ? ` · system said ${LABEL[student.suggested]}` : ''}
              </p>
              <div className="ml-4 mt-1.5 flex flex-wrap gap-1" role="radiogroup" aria-label={`Mark for ${student.name}`}>
                {STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={mark === s.value}
                    data-on={mark === s.value}
                    onClick={() => setMarks((prev) => ({ ...prev, [student.student_id]: s.value }))}
                    className={cn(
                      'rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted',
                      s.tone,
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="border-t border-border pt-3">
        <Button
          variant="primary"
          className="w-full"
          icon={<Save />}
          loading={save.isPending}
          disabled={data.students.length === 0 || (data.taken && !changed)}
          onClick={() => save.mutate(data)}
        >
          {data.taken ? 'Save changes' : 'Save attendance'}
        </Button>
      </div>
    </div>
  )
}

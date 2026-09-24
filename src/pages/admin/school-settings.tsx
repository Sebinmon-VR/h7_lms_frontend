import { AlertTriangle, BadgeCheck, CalendarPlus, Library, Video } from 'lucide-react'
import * as React from 'react'

import type { IdentifierMode, ProgramSettingsUpdate } from '@/api/types'
import { useProgramSettings, useUpdateProgramSettings } from '@/queries/tuition.queries'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field } from '@/components/forms/field'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * School settings.
 *
 * These live behind `/admin/tuition/settings/LMS` despite having nothing to do
 * with tuition: the backend keeps ONE settings store per programme, and the
 * school's half of it is reached by naming LMS. The endpoint's path is a
 * historical accident, not a statement about what these control — which is why
 * this page exists separately rather than being folded into Tuition settings,
 * where an admin would never look for an admission-number format.
 *
 * Only the keys the backend lists as LMS-writable are sent. Anything else is
 * dropped by its allowlist, silently, which would look like a save that did
 * nothing.
 */

const MODES: { value: IdentifierMode; label: string; hint: string }[] = [
  {
    value: 'AUTO',
    label: 'Generate automatically',
    hint: 'A number is issued when the field is left blank. One you type in is always kept.',
  },
  {
    value: 'MANUAL',
    label: 'Type them in',
    hint: 'Nothing is generated. Right for a school migrating records that already have numbers.',
  },
]

function num(value: string, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export default function AdminSchoolSettingsPage() {
  const settings = useProgramSettings('LMS')
  const update = useUpdateProgramSettings('LMS')

  /**
   * A local draft, seeded once the settings arrive.
   *
   * Held as a partial rather than a full copy so the save can send only what
   * was touched: the update is partial server-side, and posting back every key
   * we happened to read would overwrite anything a second admin changed while
   * this page was open.
   */
  const [draft, setDraft] = React.useState<ProgramSettingsUpdate>({})
  const set = <K extends keyof ProgramSettingsUpdate>(
    key: K,
    value: ProgramSettingsUpdate[K],
  ) => setDraft((prev) => ({ ...prev, [key]: value }))

  const current = settings.data
  /** The draft's value if touched, otherwise whatever the server last said. */
  const read = <K extends keyof ProgramSettingsUpdate>(key: K) =>
    (draft[key] ?? (current?.[key] as ProgramSettingsUpdate[K]))

  const dirty = Object.keys(draft).length > 0

  const save = () => {
    update.mutate(draft, { onSuccess: () => setDraft({}) })
  }

  return (
    <div>
      <PageHeader
        title="School settings"
        description="Identifier formats, the live-class clock, extra-class approval and what students may do in the library."
        actions={
          <Button onClick={save} loading={update.isPending} disabled={!dirty}>
            Save changes
          </Button>
        }
      />

      <QueryBoundary
        query={settings}
        loading={
          <div className="max-w-3xl space-y-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-56 w-full rounded-xl" />
            ))}
          </div>
        }
      >
        {() => (
          <div className="max-w-3xl space-y-5">
            {/* ---------------------------------------------- identifiers */}
            <Card className="space-y-4 p-5">
              <div className="flex items-center gap-2">
                <BadgeCheck className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Admission and staff numbers</h3>
              </div>

              <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                <Field
                  id="adm-mode"
                  label="Admission numbers"
                  hint={MODES.find((m) => m.value === read('admission_id_mode'))?.hint}
                >
                  <Select
                    value={read('admission_id_mode') ?? 'AUTO'}
                    onValueChange={(v) => set('admission_id_mode', v as IdentifierMode)}
                  >
                    <SelectTrigger id="adm-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  id="adm-prefix"
                  label="Prefix"
                  hint={`Produces ${read('admission_id_prefix') || 'ADM'}-${new Date().getFullYear()}-0001`}
                >
                  <Input
                    id="adm-prefix"
                    value={read('admission_id_prefix') ?? ''}
                    placeholder="ADM"
                    onChange={(e) => set('admission_id_prefix', e.target.value)}
                    disabled={read('admission_id_mode') === 'MANUAL'}
                  />
                </Field>

                <Field
                  id="emp-mode"
                  label="Staff numbers"
                  hint={MODES.find((m) => m.value === read('employee_id_mode'))?.hint}
                >
                  <Select
                    value={read('employee_id_mode') ?? 'AUTO'}
                    onValueChange={(v) => set('employee_id_mode', v as IdentifierMode)}
                  >
                    <SelectTrigger id="emp-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  id="emp-prefix"
                  label="Prefix"
                  hint={`Produces ${read('employee_id_prefix') || 'EMP'}-${new Date().getFullYear()}-0001`}
                >
                  <Input
                    id="emp-prefix"
                    value={read('employee_id_prefix') ?? ''}
                    placeholder="EMP"
                    onChange={(e) => set('employee_id_prefix', e.target.value)}
                    disabled={read('employee_id_mode') === 'MANUAL'}
                  />
                </Field>
              </div>

              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Automatic issuing fills a <strong>blank</strong> field only. A number typed on
                the user form is always kept, so a mixed intake works without switching this
                setting back and forth.
              </p>
            </Card>

            {/* --------------------------------------------- live classes */}
            <Card className="space-y-4 p-5">
              <div className="flex items-center gap-2">
                <Video className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Live classes</h3>
              </div>

              <label className="flex items-start justify-between gap-4">
                <span className="min-w-0">
                  <span className="text-sm font-medium">One shared room per class</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    On — the default — every class has a single Google Meet room. Students join
                    it and stay for the day; each subject teacher joins the same room at their
                    period, and scheduled sessions reuse the class’s link. Rooms are created
                    automatically about 30 minutes before a class’s first period. Off restores a
                    separate Meet link per scheduled session. Tuition is not affected.
                  </span>
                </span>
                <Switch
                  checked={read('class_room_mode') ?? true}
                  onCheckedChange={(v) => set('class_room_mode', v)}
                />
              </label>

              <label className="flex items-start justify-between gap-4 border-t border-border pt-4">
                <span className="min-w-0">
                  <span className="text-sm font-medium">Open classes automatically</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    On, a class opens on its timetabled time with no teacher action. Off — the
                    default — students see “waiting for the teacher” until the teacher opens it.
                  </span>
                </span>
                <Switch
                  checked={read('auto_start_class') ?? false}
                  onCheckedChange={(v) => set('auto_start_class', v)}
                />
              </label>

              <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
                <Field
                  id="join-before"
                  label="Join opens (minutes early)"
                  hint="How far ahead the button unlocks."
                >
                  <Input
                    id="join-before"
                    type="number"
                    min={0}
                    value={String(read('join_open_minutes_before') ?? 5)}
                    onChange={(e) =>
                      set('join_open_minutes_before', num(e.target.value, 5))
                    }
                  />
                </Field>
                <Field id="class-minutes" label="Default length (minutes)">
                  <Input
                    id="class-minutes"
                    type="number"
                    min={1}
                    value={String(read('default_class_minutes') ?? 45)}
                    onChange={(e) => set('default_class_minutes', num(e.target.value, 45))}
                  />
                </Field>
                <Field
                  id="grace"
                  label="Grace (minutes)"
                  hint="How long after the end a latecomer may still join."
                >
                  <Input
                    id="grace"
                    type="number"
                    min={0}
                    value={String(read('join_grace_minutes') ?? 15)}
                    onChange={(e) => set('join_grace_minutes', num(e.target.value, 15))}
                  />
                </Field>
              </div>

              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                These decide when the join button unlocks. The server enforces the same rule on
                the join request itself, so nobody gets in early by reloading.
              </p>
            </Card>

            {/* -------------------------------------------- extra classes */}
            <Card className="space-y-4 p-5">
              <div className="flex items-center gap-2">
                <CalendarPlus className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Extra classes</h3>
              </div>

              <label className="flex items-start justify-between gap-4">
                <span className="min-w-0">
                  <span className="text-sm font-medium">Require approval</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    On — the default — a teacher's request waits for an administrator. Off, the
                    request arrives already approved and only needs scheduling.
                  </span>
                </span>
                <Switch
                  checked={read('extra_class_needs_approval') ?? true}
                  onCheckedChange={(v) => set('extra_class_needs_approval', v)}
                />
              </label>
            </Card>

            {/* -------------------------------------------------- library */}
            <Card className="space-y-4 p-5">
              <div className="flex items-center gap-2">
                <Library className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Library access for students</h3>
              </div>

              <label className="flex items-start justify-between gap-4">
                <span className="min-w-0">
                  <span className="text-sm font-medium">Students may upload</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Off makes the library read-only for students — the upload controls
                    disappear rather than failing.
                  </span>
                </span>
                <Switch
                  checked={read('student_library_uploads_enabled') ?? true}
                  onCheckedChange={(v) => set('student_library_uploads_enabled', v)}
                />
              </label>

              <label className="flex items-start justify-between gap-4 border-t border-border pt-4">
                <span className="min-w-0">
                  <span className="text-sm font-medium">Students may download</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Independent of the above. Off, they can still open and read material in the
                    browser — they just cannot pull the file out.
                  </span>
                </span>
                <Switch
                  checked={read('student_library_downloads_enabled') ?? true}
                  onCheckedChange={(v) => set('student_library_downloads_enabled', v)}
                />
              </label>

              <label className="flex items-start justify-between gap-4 border-t border-border pt-4">
                <span className="min-w-0">
                  <span className="text-sm font-medium">Filter by syllabus</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Students see only material matching the syllabus on their profile —
                    <strong> plus everything untagged</strong>, so turning this on never blanks
                    a library built before anybody was tagging.
                  </span>
                </span>
                <Switch
                  checked={read('library_syllabus_filter') ?? false}
                  onCheckedChange={(v) => set('library_syllabus_filter', v)}
                />
              </label>

              {read('library_syllabus_filter') && (
                <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/8 p-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <p className="text-xs text-muted-foreground">
                    Students with no syllabus on their profile will see only untagged material.
                    Set it under <strong>Users → Session year and syllabus</strong>.
                  </p>
                </div>
              )}
            </Card>

            {dirty && (
              <div className="sticky bottom-4 flex justify-end">
                <Button onClick={save} loading={update.isPending}>
                  Save changes
                </Button>
              </div>
            )}
          </div>
        )}
      </QueryBoundary>
    </div>
  )
}

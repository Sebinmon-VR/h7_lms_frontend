import { Bell, Clock, Globe, Play, RefreshCw, Save, Video } from 'lucide-react'
import * as React from 'react'

import type { Program, ProgramSettingsUpdate } from '@/api/types'
import {
  useProgramSettings,
  useRunTuitionReminders,
  useTuitionReminderPreview,
  useTuitionReminderStatus,
  useUpdateProgramSettings,
} from '@/queries/tuition.queries'
import { PROGRAM_LABEL } from '@/lib/tuition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Field } from '@/components/forms/field'
import { BROWSER_ZONE, TimezonePicker } from '@/components/domain/timezone-picker'
import { QueryBoundary } from '@/components/feedback/query-boundary'
import { PageHeader } from '@/components/layout/page-header'

/**
 * Runtime configuration for a product.
 *
 * Both products are edited here, not just tuition: the timezone and the
 * reminder lead time are shared settings and the school's live in the same
 * place. The tuition-only fields are ignored on the LMS tab, so the form
 * simply does not render them there.
 *
 * The PUT is partial and omitted fields are left alone — which is what makes
 * it safe to render half of these. Sending the whole object would reset
 * behaviour nobody meant to touch.
 */

/** Comma-separated minutes, e.g. "60, 10". Several values send several nudges. */
function parseMinutes(value: string): number[] {
  return value
    .split(/[,\s]+/)
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

function SettingsForm({ program }: { program: Program }) {
  const settings = useProgramSettings(program)
  const update = useUpdateProgramSettings(program)

  // Local draft, seeded once the settings arrive. Keyed by program so
  // switching tabs re-seeds rather than carrying the other product's values.
  const [draft, setDraft] = React.useState<ProgramSettingsUpdate | null>(null)
  const [leadTimes, setLeadTimes] = React.useState('')

  React.useEffect(() => {
    if (!settings.data) return
    const data = settings.data
    setDraft({
      timezone: data.timezone,
      reminders_enabled: data.reminders_enabled,
      remind_teachers: data.remind_teachers,
      reminder_max_lateness_minutes: data.reminder_max_lateness_minutes,
      default_session_minutes: data.default_session_minutes,
      auto_start_class: data.auto_start_class,
      max_teacher_late_extension_minutes: data.max_teacher_late_extension_minutes,
      teacher_no_show_minutes: data.teacher_no_show_minutes,
      student_late_grace_minutes: data.student_late_grace_minutes,
      min_gap_minutes: data.min_gap_minutes,
      session_horizon_days: data.session_horizon_days,
      student_uploads_need_approval: data.student_uploads_need_approval,
      currency: data.currency,
      auto_create_meet: data.auto_create_meet,
    })
    setLeadTimes((data.reminder_minutes_before ?? []).join(', '))
  }, [settings.data, program])

  const set = <K extends keyof ProgramSettingsUpdate>(key: K, value: ProgramSettingsUpdate[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))

  const num = (value: string) => (value === '' ? undefined : Number(value))

  const save = () => {
    if (!draft) return
    update.mutate({ ...draft, reminder_minutes_before: parseMinutes(leadTimes) })
  }

  return (
    <QueryBoundary
      query={settings}
      loading={
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      }
    >
      {() =>
        draft && (
          <div className="space-y-5">
            <Card className="p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Globe className="size-4 text-primary" />
                Time
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {/* A picker, not a text box: the backend validates against the
                    IANA database and 400s anything else, so a typed
                    "Asia/Dubay" is a failed save found after the fact. */}
                <Field
                  id={`tz-${program}`}
                  label="Programme timezone"
                  hint="What everyone sees unless their own browser reports otherwise, or they pin a zone."
                >
                  <TimezonePicker
                    id={`tz-${program}`}
                    value={draft.timezone ?? null}
                    onChange={(zone) => set('timezone', zone)}
                    suggested={BROWSER_ZONE}
                  />
                </Field>

                {program === 'TUITION' && (
                  <Field
                    id="default-mins"
                    label="Default class length"
                    hint="Minutes. An arrangement or a slot can override it."
                  >
                    <Input
                      id="default-mins"
                      type="number"
                      min={10}
                      max={480}
                      value={draft.default_session_minutes ?? ''}
                      onChange={(e) => set('default_session_minutes', num(e.target.value))}
                    />
                  </Field>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Bell className="size-4 text-primary" />
                Reminders
              </h2>

              <div className="mt-4 space-y-3">
                <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                  <span className="text-sm">Send class reminders</span>
                  <Switch
                    checked={draft.reminders_enabled ?? false}
                    onCheckedChange={(v) => set('reminders_enabled', v)}
                  />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                  <span className="text-sm">
                    Remind teachers too
                    <span className="block text-xs text-muted-foreground">
                      Off, only the student is nudged.
                    </span>
                  </span>
                  <Switch
                    checked={draft.remind_teachers ?? false}
                    onCheckedChange={(v) => set('remind_teachers', v)}
                  />
                </label>

                <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                  <Field
                    id={`lead-${program}`}
                    label="How long before"
                    hint="Minutes, comma-separated. Two values send two nudges: “60, 10”."
                  >
                    <Input
                      id={`lead-${program}`}
                      value={leadTimes}
                      onChange={(e) => setLeadTimes(e.target.value)}
                      placeholder="60, 10"
                    />
                  </Field>

                  <Field
                    id={`late-${program}`}
                    label="Give up after"
                    hint="Minutes. A reminder later than this is not worth sending."
                  >
                    <Input
                      id={`late-${program}`}
                      type="number"
                      min={0}
                      max={240}
                      value={draft.reminder_max_lateness_minutes ?? ''}
                      onChange={(e) => set('reminder_max_lateness_minutes', num(e.target.value))}
                    />
                  </Field>
                </div>
              </div>
            </Card>

            {program === 'TUITION' && (
              <>
                <Card className="p-5">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Clock className="size-4 text-primary" />
                    Lateness and length
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A one-to-one class the teacher joined late is not a class the student should get
                    less of. These rules decide how much of it is made up, and when a class counts
                    as never having happened.
                  </p>

                  {/* Placed above the lateness fields because it decides what
                      those fields measure against. */}
                  <label className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                    <span className="text-sm">
                      Open classes automatically at their scheduled time
                      <span className="block text-xs text-muted-foreground">
                        On, a class opens on the timetable whether or not the tutor has
                        arrived, and the student is late against the timetable. Off, the class
                        begins when the tutor presses start — until then a waiting student is
                        early, not late, however long they have sat there.
                      </span>
                    </span>
                    <Switch
                      checked={draft.auto_start_class ?? false}
                      onCheckedChange={(v) => set('auto_start_class', v)}
                    />
                  </label>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field
                      id="extension"
                      label="Most a late teacher may run over"
                      hint="Minutes. Caps how far past the scheduled end a class can be extended."
                    >
                      <Input
                        id="extension"
                        type="number"
                        min={0}
                        max={240}
                        value={draft.max_teacher_late_extension_minutes ?? ''}
                        onChange={(e) =>
                          set('max_teacher_late_extension_minutes', num(e.target.value))
                        }
                      />
                    </Field>

                    <Field
                      id="noshow"
                      label="Teacher counts as absent after"
                      hint="Minutes past the start with no teacher. The class is then not chargeable."
                    >
                      <Input
                        id="noshow"
                        type="number"
                        min={1}
                        max={240}
                        value={draft.teacher_no_show_minutes ?? ''}
                        onChange={(e) => set('teacher_no_show_minutes', num(e.target.value))}
                      />
                    </Field>

                    <Field
                      id="grace"
                      label="Student grace period"
                      hint="Minutes. Arriving within this is on time, not late."
                    >
                      <Input
                        id="grace"
                        type="number"
                        min={0}
                        max={120}
                        value={draft.student_late_grace_minutes ?? ''}
                        onChange={(e) => set('student_late_grace_minutes', num(e.target.value))}
                      />
                    </Field>

                    <Field
                      id="gap"
                      label="Gap between one person's classes"
                      hint="Minutes. Bookings closer than this are reported as a clash."
                    >
                      <Input
                        id="gap"
                        type="number"
                        min={0}
                        max={240}
                        value={draft.min_gap_minutes ?? ''}
                        onChange={(e) => set('min_gap_minutes', num(e.target.value))}
                      />
                    </Field>
                  </div>
                </Card>

                <Card className="p-5">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Video className="size-4 text-primary" />
                    Scheduling, meetings and money
                  </h2>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field
                      id="horizon"
                      label="Generate classes this far ahead"
                      hint="Days. Nothing past this exists yet, so it cannot be attended or billed."
                    >
                      <Input
                        id="horizon"
                        type="number"
                        min={1}
                        max={365}
                        value={draft.session_horizon_days ?? ''}
                        onChange={(e) => set('session_horizon_days', num(e.target.value))}
                      />
                    </Field>

                    <Field
                      id="currency"
                      label="Currency"
                      hint="What packages are priced in unless a package says otherwise."
                    >
                      <Input
                        id="currency"
                        maxLength={8}
                        value={draft.currency ?? ''}
                        onChange={(e) => set('currency', e.target.value)}
                        placeholder="INR"
                      />
                    </Field>
                  </div>

                  <div className="mt-4 space-y-3">
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                      <span className="text-sm">
                        Create a Google Meet for each class
                        <span className="block text-xs text-muted-foreground">
                          Slots with a standing link of their own are unaffected.
                        </span>
                      </span>
                      <Switch
                        checked={draft.auto_create_meet ?? false}
                        onCheckedChange={(v) => set('auto_create_meet', v)}
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                      <span className="text-sm">
                        Student uploads need approval
                        <span className="block text-xs text-muted-foreground">
                          On, a student's shared file waits for a teacher before anyone else sees
                          it. Their private uploads never need review either way.
                        </span>
                      </span>
                      <Switch
                        checked={draft.student_uploads_need_approval ?? false}
                        onCheckedChange={(v) => set('student_uploads_need_approval', v)}
                      />
                    </label>
                  </div>
                </Card>
              </>
            )}

            <div className="flex justify-end">
              <Button loading={update.isPending} onClick={save}>
                <Save />
                Save {PROGRAM_LABEL[program].toLowerCase()} settings
              </Button>
            </div>
          </div>
        )
      }
    </QueryBoundary>
  )
}

/**
 * What would be sent right now, without sending it.
 *
 * The failure mode of a reminder system is spam, not silence, so the dry run
 * comes first and the live sweep is the secondary action — the preview claims
 * nothing and can be pressed as often as an admin likes after changing a lead
 * time.
 */
function ReminderPreviewCard() {
  const preview = useTuitionReminderPreview()
  const status = useTuitionReminderStatus()
  const run = useRunTuitionReminders()

  const sched = status.data

  return (
    <Card className="p-5">
      {/* A stopped sweep fails silently — classes still happen, they simply
          stop being reminded about and stop being settled, and the first
          symptom is an invoice that undercounts a month later. */}
      {sched && !sched.running && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
          The background sweep is not running. Reminders will not go out and finished classes
          will not be settled on their own — use “Run maintenance” on the overview before any
          billing run, and restart the API to bring it back.
        </p>
      )}
      {sched?.running && !sched.mail_configured && (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-sm text-warning">
          The sweep is running but no mail server is configured, so every reminder will fail at
          the sending step. Check SMTP under Integrations.
        </p>
      )}
      {sched?.last_error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
          Last sweep error: {sched.last_error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Bell className="size-4 text-primary" />
          What would go out now
        </h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void preview.refetch()}
            disabled={preview.isFetching}
          >
            <RefreshCw className={preview.isFetching ? 'animate-spin' : undefined} />
            Re-check
          </Button>
          <Button size="sm" loading={run.isPending} onClick={() => run.mutate()}>
            <Play />
            Send now
          </Button>
        </div>
      </div>

      <QueryBoundary query={preview} loading={<Skeleton className="mt-4 h-20" />}>
        {(summary) => (
          <div className="mt-4">
            {summary.detail && <p className="text-sm">{summary.detail}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Classes due" value={summary.due_sessions ?? 0} />
              <Stat label="Recipients" value={summary.recipients ?? 0} />
              <Stat label="Would send" value={summary.sent ?? 0} />
              <Stat label="Already handled" value={summary.skipped_already_sent ?? 0} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              A dry run. Nothing is claimed and nothing is delivered, so it is safe to repeat.
              {sched
                ? ` Sweep ${sched.running ? 'running' : 'stopped'}${
                    sched.run_count ? `, ${sched.run_count} runs so far` : ''
                  }.`
                : ''}
            </p>
          </div>
        )}
      </QueryBoundary>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

export default function AdminTuitionSettingsPage() {
  return (
    <>
      <PageHeader
        title="Tuition settings"
        description="Timezone, class length, reminder lead times and the lateness rules that decide what gets billed."
      />

      <Tabs defaultValue="TUITION">
        <TabsList className="mb-5">
          <TabsTrigger value="TUITION">
            Online tuition
            <Badge tone="primary" size="sm" className="ml-2">
              Full
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="LMS">School</TabsTrigger>
        </TabsList>

        <TabsContent value="TUITION" className="space-y-5">
          <SettingsForm program="TUITION" />
          <ReminderPreviewCard />
        </TabsContent>

        <TabsContent value="LMS">
          <p className="mb-4 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-muted-foreground">
            Only the shared settings apply to the school — its timezone and its class-reminder lead
            times. The lateness, scheduling and fee rules belong to online tuition alone.
          </p>
          <SettingsForm program="LMS" />
        </TabsContent>
      </Tabs>
    </>
  )
}

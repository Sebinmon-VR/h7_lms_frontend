import { ChevronLeft, FlaskConical, Lightbulb, ListChecks, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { ArenaButton, ArenaEmpty, ArenaShell, ArenaTabs, Art3D, GameTitle, Panel } from '@/components/arena/arena-theme'
import { useCelebration } from '@/components/fun/celebrate'
import { PageHeader } from '@/components/layout/page-header'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMediaQuery } from '@/lib/hooks'
import { useMyLabAssignments, useRecordLabAttempt } from '@/queries/lab.queries'
import { toast } from 'sonner'
import { AdminStudentNotice, useIsAdminViewingStudent } from '../student-guard'
import { useArenaPaths } from '../arena/arena-paths'
import { Bench, GhostArt } from './bench'
import { Cabinet } from './cabinet'
import { DragProvider } from './drag'
import { EXPERIMENTS, EXPERIMENT_BY_ID, registerExperiment, stepDone, type LabAction } from './engine/experiments'
import { EquipmentShelf } from './equipment'
import { Completion, ExperimentPicker, GuidePanel, Quiz, StepHud, type AssignedExperiment, type Run } from './guide'
import { Notebook } from './notebook'
import { useLab, useLabVersion, type LabObservation } from './useLabSim'

/**
 * Virtual Chemistry Lab: a bench to mix, heat and test anything in the
 * cabinet (free lab), or a guided experiment with steps the bench checks as
 * the student works and a short quiz at the end.
 *
 * `?experiment=<id>` opens straight into a guided experiment and
 * `?assignment=<id>` is handed back with the result, so a teacher's
 * assignment can be wired to the backend later through `onExperimentComplete`.
 */

export type ExperimentCompleteHandler = (
  experimentId: string,
  score: number,
  total: number,
  observations: LabObservation[],
  assignmentId?: string | null,
) => void

export interface LabPageProps {
  onExperimentComplete?: ExperimentCompleteHandler
}

export default function LabPage({ onExperimentComplete }: LabPageProps) {
  const isAdmin = useIsAdminViewingStudent()
  if (isAdmin) {
    return (
      <>
        <PageHeader title="Virtual Lab" description="The chemistry bench students use for free play and guided experiments." />
        <AdminStudentNotice />
      </>
    )
  }
  return <ConnectedLab onExperimentComplete={onExperimentComplete} />
}

/**
 * The lab with the student's assignments: teachers' own experiments are
 * registered so the bench can run them, they head the picker, and every
 * finished run is recorded (the first one pays XP and coins).
 */
function ConnectedLab({ onExperimentComplete }: LabPageProps) {
  const assignmentsQuery = useMyLabAssignments()
  const record = useRecordLabAttempt()
  // Online tuition has no teacher-set experiments, so nobody to save a run "for".
  const { tuition } = useArenaPaths()
  const assigned = React.useMemo<AssignedExperiment[]>(
    () =>
      (assignmentsQuery.data ?? []).map((a) => {
        if (a.experiment) registerExperiment(a.experiment_id, a.experiment)
        return {
          assignmentId: a.id,
          experimentId: a.experiment_id,
          title: a.title,
          emoji: a.emoji,
          topic: a.topic,
          instructions: a.instructions,
          dueAt: a.due_at,
          best: a.best ? { score: a.best.score, total: a.best.total } : null,
        }
      }),
    [assignmentsQuery.data],
  )

  const complete: ExperimentCompleteHandler = (experimentId, score, total, observations, assignmentId) => {
    onExperimentComplete?.(experimentId, score, total, observations, assignmentId)
    record.mutate(
      {
        experiment_id: experimentId,
        assignment_id: assignmentId ? Number(assignmentId) : null,
        score,
        total,
        observations: observations.slice(0, 80).map((o) => [o.title, o.text].filter(Boolean).join(': ')),
      },
      {
        onSuccess: (r) => {
          if (r.first_time) {
            toast.success(`+${r.xp} XP · +${r.coins} coins`, {
              description: r.new_badges.length ? `New badge: ${r.new_badges.map((b) => b.name).join(', ')}` : tuition ? 'Saved to your lab record.' : 'Saved for your teacher.',
            })
          } else {
            toast('Result saved', { description: 'Rewards are paid the first time you complete an experiment.' })
          }
        },
      },
    )
  }

  // A custom experiment in the link has to be registered before the bench opens.
  const [params] = useSearchParams()
  const wanted = params.get('experiment')
  if (wanted?.startsWith('custom-') && !EXPERIMENT_BY_ID[wanted] && assignmentsQuery.isPending) {
    return <ArenaShell className="flex min-h-[60svh] items-center justify-center"><p className="text-sm text-muted-foreground">Opening your experiment…</p></ArenaShell>
  }
  return <VirtualLab onExperimentComplete={complete} assigned={assigned} />
}

type PanelTab = 'guide' | 'chemicals' | 'notebook' | 'equipment'

export function VirtualLab({
  onExperimentComplete,
  assigned = [],
}: {
  onExperimentComplete: ExperimentCompleteHandler
  assigned?: AssignedExperiment[]
}) {
  const [params, setParams] = useSearchParams()
  const initial = EXPERIMENT_BY_ID[params.get('experiment') ?? '']
  const assignmentId = params.get('assignment')
  const lab = useLab(!initial)
  useLabVersion(lab)
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [celebration, celebrate] = useCelebration()

  const [mode, setMode] = React.useState<'free' | 'experiments'>(initial ? 'experiments' : 'free')
  const [run, setRun] = React.useState<Run | null>(initial ? { id: initial.id, step: 0, phase: 'steps', score: 0 } : null)
  const [panel, setPanel] = React.useState<PanelTab>('chemicals')
  const [muted, setMuted] = React.useState(true)
  const history = React.useRef<LabAction[]>([])
  const runRef = React.useRef(run)
  runRef.current = run
  const exp = run ? EXPERIMENT_BY_ID[run.id] : null

  React.useEffect(() => {
    lab.audio.setEnabled(!muted)
  }, [lab, muted])

  // ------------------------------------------------ step checking

  const check = React.useCallback(() => {
    const r = runRef.current
    if (!r || r.phase !== 'steps') return
    const e = EXPERIMENT_BY_ID[r.id]
    if (!e) return
    const vessels = [...lab.vessels.values()]
    let i = r.step
    // Steps done early still count once their turn comes.
    while (i < e.steps.length) {
      const st = e.steps[i]
      const ok = stepDone(st, null, vessels) || history.current.some((a) => stepDone(st, a, vessels))
      if (!ok) break
      lab.note({ kind: 'step', title: `Step ${i + 1} done`, text: st.text })
      i++
    }
    if (i !== r.step) {
      const next = { ...r, step: i }
      runRef.current = next
      setRun(next)
      lab.say(i >= e.steps.length ? 'Every step done — time for the quiz!' : `Step ${i} done. Next: step ${i + 1}.`)
    }
  }, [lab])

  React.useEffect(
    () =>
      lab.onAction((a) => {
        history.current.push(a)
        check()
      }),
    [lab, check],
  )

  React.useEffect(() => {
    const t = window.setInterval(check, 500)
    return () => window.clearInterval(t)
  }, [check])

  // ------------------------------------------------ flow

  const setExperimentParam = (id: string | null, assignment?: number | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('experiment', id)
    else next.delete('experiment')
    // An assignment travels with the experiment it belongs to, and only with it.
    if (assignment) next.set('assignment', String(assignment))
    else if (assignment === null || !id) next.delete('assignment')
    setParams(next, { replace: true })
  }

  const startExperiment = (id: string, assignment: number | null = null) => {
    lab.reset({ clearNotes: true })
    history.current = []
    const r: Run = { id, step: 0, phase: 'steps', score: 0 }
    runRef.current = r
    setRun(r)
    setMode('experiments')
    setPanel(isDesktop ? 'chemicals' : 'guide')
    setExperimentParam(id, assignment)
  }

  const leaveExperiment = () => {
    runRef.current = null
    setRun(null)
    setExperimentParam(null)
  }

  const switchMode = (m: 'free' | 'experiments') => {
    setMode(m)
    if (m === 'free') {
      leaveExperiment()
      setPanel('chemicals')
    }
  }

  const finishQuiz = (score: number) => {
    if (!run || !exp) return
    onExperimentComplete(run.id, score, exp.questions.length, lab.observations(), assignmentId)
    setRun({ ...run, phase: 'done', score })
    celebrate()
  }

  const startQuiz = () => {
    if (!run || !exp) return
    if (exp.questions.length === 0) return finishQuiz(0)
    setRun({ ...run, phase: 'quiz' })
  }

  const resetBench = () => lab.reset({ starter: mode === 'free' })

  // ------------------------------------------------ pieces

  const picking = mode === 'experiments' && !run
  const overlay =
    run && exp && run.phase === 'quiz' ? (
      <Quiz exp={exp} onFinish={finishQuiz} onBack={() => setRun({ ...run, phase: 'steps' })} />
    ) : run && exp && run.phase === 'done' ? (
      <Completion
        exp={exp}
        score={run.score}
        total={exp.questions.length}
        onAgain={() => startExperiment(run.id)}
        onPick={leaveExperiment}
        onFree={() => switchMode('free')}
      />
    ) : null

  const observations = lab.notes.filter((n) => n.kind === 'reaction' || n.kind === 'test').length
  const panelOptions: Array<{ value: PanelTab; label: string; count?: number }> = [
    ...(isDesktop ? [] : [{ value: 'equipment' as PanelTab, label: 'Equipment' }]),
    ...(run ? [{ value: 'guide' as PanelTab, label: 'Guide' }] : []),
    { value: 'chemicals', label: 'Chemicals' },
    { value: 'notebook', label: 'Notebook', count: observations || undefined },
  ]
  const activePanel: PanelTab = panelOptions.some((o) => o.value === panel) ? panel : 'chemicals'

  const panelBody = (
    <>
      {activePanel === 'guide' &&
        (run && exp ? (
          <GuidePanel exp={exp} run={run} onQuiz={startQuiz} onExit={leaveExperiment} onRestart={() => startExperiment(run.id)} />
        ) : (
          <ArenaEmpty
            icon={<ListChecks />}
            title="No experiment running"
            action={
              <ArenaButton size="sm" variant="primary" onClick={() => switchMode('experiments')}>
                Pick one
              </ArenaButton>
            }
          />
        ))}
      {activePanel === 'chemicals' && <Cabinet lab={lab} focus={exp?.reagents ?? null} className="h-full" />}
      {activePanel === 'notebook' && <Notebook lab={lab} className="h-full" />}
      {activePanel === 'equipment' && <EquipmentShelf lab={lab} layout="grid" needs={exp?.equipment ?? null} />}
    </>
  )

  const hud = run && exp && run.phase === 'steps' && <StepHud exp={exp} run={run} onQuiz={startQuiz} onOpenGuide={() => setPanel('guide')} />

  const benchArea = (
    <div className="relative min-h-0 flex-1">
      <Bench lab={lab} className="absolute inset-0" />
      {overlay && <div className="absolute inset-0 z-[60] flex items-center justify-center overflow-y-auto rounded-2xl bg-background/70 p-3 backdrop-blur-sm">{overlay}</div>}
    </div>
  )

  return (
    <ArenaShell className="flex flex-col gap-2.5 pb-3 lg:h-[calc(100svh-7.5rem)] lg:min-h-[560px] lg:pb-0">
      <h1 className="sr-only">Virtual chemistry lab</h1>
      <TopBar mode={mode} onMode={switchMode} onReset={resetBench} muted={muted} onMute={() => setMuted((m) => !m)} onIdea={startExperiment} />

      <DragProvider onDrop={(p, t) => lab.drop(p, t)} renderGhost={(p) => <GhostArt lab={lab} payload={p} />}>
        <div className="relative flex min-h-0 flex-1 flex-col">
          {isDesktop ? (
            <div className="grid min-h-0 flex-1 grid-cols-[92px_minmax(0,1fr)_minmax(290px,340px)] gap-2.5">
              <Panel className="no-scrollbar min-h-0 overflow-y-auto p-1.5">
                <EquipmentShelf lab={lab} layout="rail" needs={exp?.equipment ?? null} />
              </Panel>
              <div className="flex min-h-0 flex-col gap-2">
                {hud}
                {benchArea}
              </div>
              <Panel className="flex min-h-0 flex-col p-2.5">
                <ArenaTabs size="sm" value={activePanel} onChange={setPanel} options={panelOptions} className="mb-2.5 w-full" aria-label="Side panel" />
                <div className="min-h-0 flex-1">{panelBody}</div>
              </Panel>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {hud}
              <div className="flex h-[56svh] min-h-[320px] flex-col">{benchArea}</div>
              <ArenaTabs value={activePanel} onChange={setPanel} options={panelOptions} className="w-full" aria-label="Lab panels" />
              <Panel className="flex h-[48svh] min-h-[300px] flex-col p-2.5">
                <div className="min-h-0 flex-1 overflow-y-auto">{panelBody}</div>
              </Panel>
            </div>
          )}

          {picking && (
            <div className="absolute inset-0 z-[70] min-h-[70svh] rounded-2xl bg-background/85 p-3 backdrop-blur-md sm:p-4 lg:min-h-0">
              <ExperimentPicker
                onPick={(id) => startExperiment(id)}
                onClose={() => switchMode('free')}
                assigned={assigned}
                onPickAssigned={(a) => startExperiment(a.experimentId, a.assignmentId)}
              />
            </div>
          )}
        </div>
      </DragProvider>
      {celebration}
    </ArenaShell>
  )
}

function TopBar({
  mode,
  onMode,
  onReset,
  muted,
  onMute,
  onIdea,
}: {
  mode: 'free' | 'experiments'
  onMode: (m: 'free' | 'experiments') => void
  onReset: () => void
  muted: boolean
  onMute: () => void
  onIdea: (id: string) => void
}) {
  const paths = useArenaPaths()
  return (
    <header className="flex flex-wrap items-center gap-2">
      <ArenaButton asChild variant="secondary" size="icon" className="shrink-0">
        <Link to={paths.shelf} aria-label="Back to games">
          <ChevronLeft />
        </Link>
      </ArenaButton>
      <div className="flex min-w-0 items-center gap-2">
        <Art3D name="test_tube" className="size-8 shrink-0" />
        <GameTitle as="p" className="truncate text-lg sm:text-2xl">
          Virtual Lab
        </GameTitle>
      </div>
      <ArenaTabs
        value={mode}
        onChange={onMode}
        options={[
          { value: 'free', label: 'Free lab', icon: <FlaskConical /> },
          { value: 'experiments', label: 'Experiments', icon: <ListChecks /> },
        ]}
        aria-label="Lab mode"
        className="order-last w-full sm:order-none sm:ml-2 sm:w-auto"
      />
      <div className="ml-auto flex items-center gap-1.5">
        {mode === 'free' && <Ideas onPick={onIdea} />}
        <ArenaButton variant="secondary" size="sm" onClick={onReset} title="Clear the bench">
          <RotateCcw />
          <span className="hidden sm:inline">Reset bench</span>
        </ArenaButton>
        <ArenaButton variant="secondary" size="icon" className="size-8" onClick={onMute} aria-pressed={!muted} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
          {muted ? <VolumeX /> : <Volume2 />}
        </ArenaButton>
      </div>
    </header>
  )
}

function Ideas({ onPick }: { onPick: (id: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const picks = React.useMemo(
    () => ['elephant', 'hydrogen', 'precipitates', 'flame_tests', 'co2_limewater', 'neutralisation'].map((id) => EXPERIMENT_BY_ID[id]).filter(Boolean),
    [],
  )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ArenaButton variant="gold" size="sm">
          <Lightbulb />
          <span className="hidden sm:inline">Ideas</span>
        </ArenaButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-2xl border-0 p-2">
        <p className="px-2 pb-1.5 pt-1 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">Things to try</p>
        <ul>
          {picks.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onPick(e.id)
                }}
                className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-lg leading-none">{e.emoji}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold leading-tight text-foreground">{e.title}</span>
                  <span className="line-clamp-2 text-[11px] text-muted-foreground">{e.aim}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground">{EXPERIMENTS.length} guided experiments live in Experiments mode.</p>
      </PopoverContent>
    </Popover>
  )
}

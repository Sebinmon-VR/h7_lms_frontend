import { Clock, FlaskConical, Search, ShieldAlert } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { EXPERIMENTS, type Experiment } from '@/pages/student/lab/engine/experiments'
import { REAGENT_BY_ID } from '@/pages/student/lab/engine/substances'
import { EQUIPMENT_LABEL, describeCheck, reagentLabel } from './model'

/** Searchable grid of the built-in experiments. */
export function LibraryGrid({
  selectedId,
  onSelect,
  compact,
}: {
  selectedId: string | null
  onSelect: (e: Experiment) => void
  compact?: boolean
}) {
  const [search, setSearch] = React.useState('')
  const needles = search.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = EXPERIMENTS.filter((e) => {
    const hay = `${e.title} ${e.topic} ${e.aim} ${e.reagents.map(reagentLabel).join(' ')}`.toLowerCase()
    return needles.every((n) => hay.includes(n))
  })

  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search experiments, topics or chemicals"
        leading={<Search />}
        aria-label="Search the library"
      />
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing in the library matches “{search}”.
        </p>
      ) : (
        <div className={cn('grid gap-2.5 sm:grid-cols-2', !compact && 'lg:grid-cols-3')}>
          {shown.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelect(e)}
              aria-pressed={e.id === selectedId}
              className={cn(
                'flex min-w-0 items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors',
                e.id === selectedId ? 'border-primary bg-primary/8' : 'border-border hover:border-primary/40 hover:bg-muted/40',
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-xl" aria-hidden>
                {e.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-snug">{e.title}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{e.topic}</span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-muted-foreground">
                  <span>Grades {e.grades}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" />
                    {e.minutes} min
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** What a student will do, laid out for the teacher choosing it. */
export function ExperimentPreview({ experiment: e }: { experiment: Experiment }) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-card text-2xl shadow-xs" aria-hidden>
          {e.emoji}
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-snug">{e.title}</h3>
          <p className="text-xs text-muted-foreground">
            {e.topic} · Grades {e.grades} · about {e.minutes} min
          </p>
        </div>
      </div>

      {e.aim && (
        <Section title="Aim">
          <p className="text-sm leading-relaxed">{e.aim}</p>
        </Section>
      )}

      {e.safety.length > 0 && (
        <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <ul className="space-y-1">
            {e.safety.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <Section title={`Steps (${e.steps.length})`}>
        <ol className="space-y-2">
          {e.steps.map((s, i) => (
            <li key={i} className="flex gap-2.5 text-sm">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-semibold tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block leading-snug">{s.text}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Checked when: {describeCheck(s.check)}</span>
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Chemicals">
          <div className="flex flex-wrap gap-1.5">
            {e.reagents.length === 0 && <span className="text-sm text-muted-foreground">None listed</span>}
            {e.reagents.map((id) => (
              <Badge key={id} tone={REAGENT_BY_ID[id]?.hazard ? 'warning' : 'neutral'} size="sm" title={REAGENT_BY_ID[id]?.hazard}>
                {reagentLabel(id)}
              </Badge>
            ))}
          </div>
        </Section>
        <Section title="Equipment">
          <div className="flex flex-wrap gap-1.5">
            {e.equipment.map((k) => (
              <Badge key={k} tone="outline" size="sm">
                {EQUIPMENT_LABEL[k] ?? k}
              </Badge>
            ))}
          </div>
        </Section>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <FlaskConical className="size-3.5" />
        {e.questions.length === 0
          ? 'No quiz at the end.'
          : `Ends with a ${e.questions.length}-question quiz.`}
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  )
}

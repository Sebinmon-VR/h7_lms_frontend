import { CheckCircle2, FlaskConical, NotebookPen, TestTube } from 'lucide-react'
import * as React from 'react'

import { ArenaButton, ArenaEmpty, ArenaTabs } from '@/components/arena/arena-theme'
import { cn } from '@/lib/cn'
import { useLabVersion, type Lab, type NoteEntry } from './useLabSim'

/**
 * The lab notebook: every reaction the bench saw, every test and its result,
 * and (in "Everything") a running log of what the student did. Newest first.
 */

export function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function Notebook({ lab, className }: { lab: Lab; className?: string }) {
  useLabVersion(lab)
  const [view, setView] = React.useState<'obs' | 'all'>('obs')
  const notes = [...lab.notes].reverse().filter((n) => view === 'all' || n.kind !== 'log')
  const observations = lab.notes.filter((n) => n.kind === 'reaction' || n.kind === 'test').length

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <ArenaTabs
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: 'obs', label: 'Observations', count: observations },
            { value: 'all', label: 'Everything' },
          ]}
          aria-label="Notebook view"
        />
        {lab.notes.length > 0 && (
          <ArenaButton size="sm" variant="ghost" onClick={() => lab.clearNotes()}>
            Clear
          </ArenaButton>
        )}
      </div>
      <div className="no-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto px-1" aria-live="polite">
        {notes.length === 0 ? (
          <ArenaEmpty icon={<NotebookPen />} title="Nothing written yet" description="Mix, heat and test things — what you see is recorded here with the equations." />
        ) : (
          <ol className="space-y-1.5">
            {notes.map((n) => (
              <Entry key={n.id} n={n} />
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

function Entry({ n }: { n: NoteEntry }) {
  if (n.kind === 'log') {
    return (
      <li className="flex items-baseline gap-2 px-1 text-[11px] text-muted-foreground">
        <span className="w-8 shrink-0 tabular-nums">{fmtTime(n.at)}</span>
        <span className="min-w-0">
          {n.title}
          {n.vessel && <span className="text-foreground/70"> · {n.vessel}</span>}
        </span>
      </li>
    )
  }
  if (n.kind === 'step') {
    return (
      <li className="flex items-center gap-2 rounded-lg bg-success/10 px-2 py-1.5 text-xs font-bold text-success">
        <CheckCircle2 className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{n.title}</span>
        <span className="shrink-0 text-[10px] tabular-nums opacity-80">{fmtTime(n.at)}</span>
      </li>
    )
  }
  const Icon = n.kind === 'reaction' ? FlaskConical : TestTube
  return (
    <li className="rounded-xl bg-foreground/[0.04] p-2.5">
      <div className="flex items-start gap-2">
        <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg', n.kind === 'reaction' ? 'bg-primary/15 text-primary' : 'bg-accent/15 text-accent')}>
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[13px] font-black leading-tight text-foreground">{n.title}</p>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{fmtTime(n.at)}</span>
          </div>
          {n.vessel && <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{n.vessel}</p>}
          {n.text && <p className="mt-1 text-xs leading-snug text-foreground/85">{n.text}</p>}
          {n.equation && <code className="mt-1.5 inline-block max-w-full break-words rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{n.equation}</code>}
        </div>
      </div>
    </li>
  )
}

import { Search } from 'lucide-react'
import * as React from 'react'

import { ArenaTabs, Label } from '@/components/arena/arena-theme'
import { cn } from '@/lib/cn'
import { Bottle } from './bottle'
import { keyboardOnly, useDrag } from './drag'
import { REAGENTS, substance, type Reagent } from './engine/substances'
import { useLabVersion, type Lab } from './useLabSim'

/**
 * The chemical cabinet: shelves of bottles and jars. Drag one onto a vessel
 * (on touch, press and hold first so the shelf still scrolls), or tap it and
 * then tap the vessel. In an experiment the first shelf holds just what that
 * experiment needs; everything else stays a tab away.
 */

type Shelf = Reagent['shelf']
type Tab = 'exp' | 'all' | Shelf

const SHELVES: Array<{ value: Shelf; label: string }> = [
  { value: 'acids', label: 'Acids' },
  { value: 'bases', label: 'Bases' },
  { value: 'salts', label: 'Salts' },
  { value: 'metals', label: 'Metals' },
  { value: 'indicators', label: 'Indicators' },
  { value: 'solids', label: 'Solids' },
  { value: 'other', label: 'Other' },
]

export function Cabinet({ lab, focus, className }: { lab: Lab; focus?: string[] | null; className?: string }) {
  useLabVersion(lab)
  const hasFocus = !!focus && focus.length > 0
  const focusKey = focus?.join(',') ?? ''
  const [tab, setTab] = React.useState<Tab>(hasFocus ? 'exp' : 'all')
  const [query, setQuery] = React.useState('')
  React.useEffect(() => setTab(focusKey ? 'exp' : 'all'), [focusKey])

  const needle = query.trim().toLowerCase()
  const list = React.useMemo(() => {
    let rows = REAGENTS
    if (needle) {
      rows = rows.filter((r) => {
        const s = substance(r.substance)
        return [r.label, s.name, s.formula].join(' ').toLowerCase().includes(needle)
      })
    } else if (tab === 'exp' && focus) rows = focus.map((id) => REAGENTS.find((r) => r.id === id)!).filter(Boolean)
    else if (tab !== 'all' && tab !== 'exp') rows = rows.filter((r) => r.shelf === tab)
    return rows
  }, [needle, tab, focus])

  const options: Array<{ value: Tab; label: string; count?: number }> = [
    ...(hasFocus ? [{ value: 'exp' as Tab, label: 'This experiment', count: focus!.length }] : []),
    { value: 'all', label: hasFocus ? 'All chemicals' : 'All' },
    ...SHELVES,
  ]

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chemicals or formulas"
          aria-label="Search chemicals"
          className="h-9 w-full rounded-xl bg-foreground/[0.06] pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      {!needle && <ArenaTabs size="sm" value={tab} onChange={setTab} options={options} className="mb-2 w-full" aria-label="Cabinet shelves" />}
      <div className="no-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        {list.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nothing on the shelves matches “{query}”.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1">
            {list.map((r) => (
              <BottleTile key={r.id} lab={lab} reagent={r} />
            ))}
          </div>
        )}
      </div>
      <Label className="mt-2 block text-center normal-case tracking-normal">Drag a bottle onto a vessel — or tap it, then the vessel.</Label>
    </div>
  )
}

function BottleTile({ lab, reagent }: { lab: Lab; reagent: Reagent }) {
  const { start, drag } = useDrag()
  const armed = lab.ui.armed?.type === 'reagent' && lab.ui.armed.id === reagent.id
  const lifted = drag?.payload.type === 'reagent' && drag.payload.id === reagent.id
  const sub = substance(reagent.substance)
  return (
    <button
      type="button"
      title={`${reagent.label}${reagent.hazard ? ` — ${reagent.hazard}` : ''}`}
      aria-pressed={armed}
      aria-label={`${reagent.label}${reagent.hazard ? `, ${reagent.hazard}` : ''}`}
      className={cn(
        'group relative flex cursor-grab flex-col items-center rounded-xl px-1 pb-1.5 pt-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        armed ? 'bg-primary/10 ring-2 ring-primary' : 'hover:bg-foreground/[0.05]',
      )}
      onPointerDown={(e) => start(e, { type: 'reagent', id: reagent.id }, { touchDelay: true, onTap: () => lab.tapReagent(reagent.id) })}
      onClick={keyboardOnly(() => lab.tapReagent(reagent.id))}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className={cn('relative block transition-transform duration-150 group-hover:-translate-y-1', lifted && 'opacity-40')}>
        <Bottle reagent={reagent} size={0.86} />
        <span aria-hidden className="absolute inset-x-1 -bottom-0.5 h-1.5 rounded-[50%] bg-foreground/20 blur-[2px]" />
      </span>
      <span className="mt-1 line-clamp-2 text-[10.5px] font-semibold leading-tight text-foreground">{reagent.label}</span>
      <span className="text-[10px] text-muted-foreground">{sub.formula}</span>
    </button>
  )
}

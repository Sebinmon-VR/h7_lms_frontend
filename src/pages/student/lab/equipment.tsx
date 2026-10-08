import { cn } from '@/lib/cn'
import { keyboardOnly, useDrag } from './drag'
import type { EquipmentKind } from './engine/experiments'
import { EquipmentIcon } from './tools'
import { MAX_ITEMS, SHELF, useLabVersion, type Lab } from './useLabSim'

/**
 * The equipment shelf: a slim rail beside the bench on wide screens, a grid
 * under it on phones. Drag a piece onto the bench (or onto a vessel or
 * burner), or tap it to set it out at the next free spot.
 */
export function EquipmentShelf({ lab, needs, layout, className }: { lab: Lab; needs?: EquipmentKind[] | null; layout: 'rail' | 'grid'; className?: string }) {
  useLabVersion(lab)
  const { start, drag } = useDrag()
  const count = lab.items.filter((i) => !i.inVessel).length
  const armedConnect = lab.ui.armed?.type === 'connect'
  return (
    <div className={cn('flex flex-col', className)}>
      <div className={cn('mb-1.5 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground', layout === 'grid' && 'text-left')}>
        Equipment <span className={cn('tabular-nums', count >= MAX_ITEMS ? 'text-warning' : '')}>{count}/{MAX_ITEMS}</span>
      </div>
      <div className={cn(layout === 'rail' ? 'flex flex-col gap-1' : 'grid grid-cols-4 gap-1 sm:grid-cols-7')}>
        {SHELF.map((e) => {
          const needed = !!needs?.includes(e.equipment)
          const lifted = drag?.payload.type === 'equipment' && drag.payload.key === e.key
          const active = e.key === 'delivery' && armedConnect
          return (
            <button
              key={e.key}
              type="button"
              title={e.detail ? `${e.name} (${e.detail})` : e.name}
              aria-label={`${e.name}${needed ? ', needed for this experiment' : ''}`}
              aria-pressed={e.key === 'delivery' ? active : undefined}
              className={cn(
                'group relative flex cursor-grab flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'bg-primary/10 ring-2 ring-primary' : 'hover:bg-foreground/[0.06]',
                lifted && 'opacity-40',
              )}
              onPointerDown={(ev) => start(ev, { type: 'equipment', key: e.key }, { touchDelay: layout === 'grid', onTap: () => lab.tapShelf(e.key) })}
              onClick={keyboardOnly(() => lab.tapShelf(e.key))}
              onContextMenu={(ev) => ev.preventDefault()}
            >
              {needed && <span aria-hidden className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.2)]" />}
              <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/[0.05] text-foreground transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:bg-foreground/[0.08]">
                <EquipmentIcon k={e.key} className="size-8" />
              </span>
              <span className="line-clamp-2 text-[10px] font-bold leading-tight text-foreground/90">{e.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

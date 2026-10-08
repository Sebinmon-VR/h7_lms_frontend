import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Cable, Droplets, Flame, GlassWater, Pipette, RotateCw, Thermometer, Trash2, Unplug, X } from 'lucide-react'
import * as React from 'react'

import { ArenaButton, ArenaTabs } from '@/components/arena/arena-theme'
import { cn } from '@/lib/cn'
import { REAGENT_BY_ID } from './engine/substances'
import { isVesselKind, rgba } from './geometry'
import { phColor, volumeMl, type BenchItem, type Lab } from './useLabSim'

/**
 * The control strip at the foot of the bench. It shows one thing at a time:
 * how much to pour, what the armed tool is waiting for, or the controls of
 * the selected piece of kit — so the bench itself stays clear.
 */

const LIQUID_AMOUNTS = [
  { label: '1 drop', v: 0.5 },
  { label: '5 mL', v: 5 },
  { label: '10 mL', v: 10 },
  { label: '20 mL', v: 20 },
  { label: '50 mL', v: 50 },
]
const SOLID_AMOUNTS = [
  { label: 'Pinch', v: 0.1 },
  { label: '0.5 g', v: 0.5 },
  { label: '1 g', v: 1 },
  { label: '2 g', v: 2 },
]

export function Dock({ lab }: { lab: Lab }) {
  const reduce = useReducedMotion()
  const { selected, armed, prompt } = lab.ui
  const msg = lab.message && lab.t - lab.message.at < 3.6 ? lab.message : null

  let key = 'none'
  let body: React.ReactNode = null
  if (prompt?.type === 'add') {
    key = `add-${prompt.reagent}-${prompt.vessel}`
    body = <AddPrompt lab={lab} reagentId={prompt.reagent} vessel={prompt.vessel} />
  } else if (prompt?.type === 'pour') {
    key = `pour-${prompt.from}-${prompt.to}`
    body = <PourPrompt lab={lab} from={prompt.from} to={prompt.to} />
  } else if (armed) {
    key = `armed-${JSON.stringify(armed)}`
    body = <ArmedHint lab={lab} />
  } else if (selected && lab.item(selected)) {
    key = `sel-${selected}`
    body = <Inspector lab={lab} it={lab.item(selected)!} />
  }

  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-2 z-[50] flex flex-col items-center gap-1.5">
      <AnimatePresence>
        {msg && (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            role="status"
            className={cn(
              'max-w-full rounded-full px-3 py-1 text-xs font-bold shadow-lg backdrop-blur-md',
              msg.tone === 'warn' ? 'bg-warning text-warning-foreground' : 'bg-card/90 text-foreground',
            )}
          >
            {msg.text}
          </motion.div>
        )}
      </AnimatePresence>
      {body && (
        <motion.div
          key={key}
          initial={reduce ? false : { opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.16 }}
          className="pointer-events-auto max-w-full rounded-2xl bg-card/95 px-2.5 py-2 text-foreground shadow-[0_12px_32px_-8px_rgba(0,0,0,0.55)] backdrop-blur-md"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {body}
        </motion.div>
      )}
    </div>
  )
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center justify-center gap-1.5', className)}>{children}</div>
}

function Title({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 truncate text-center text-xs font-bold text-muted-foreground">{children}</div>
}

function CloseButton({ lab }: { lab: Lab }) {
  return (
    <ArenaButton variant="ghost" size="sm" className="px-2" onClick={() => lab.cancel()} aria-label="Cancel">
      <X />
    </ArenaButton>
  )
}

function AddPrompt({ lab, reagentId, vessel }: { lab: Lab; reagentId: string; vessel: string }) {
  const r = REAGENT_BY_ID[reagentId]
  const v = lab.vessel(vessel)
  if (!r || !v) return null
  const solid = r.form === 'solid'
  const amounts = solid ? SOLID_AMOUNTS : LIQUID_AMOUNTS.filter((a) => a.v <= v.capacity)
  return (
    <div>
      <Title>
        Add <span className="text-foreground">{r.label}</span> to <span className="text-foreground">{lab.label(vessel)}</span>
      </Title>
      <Row>
        {amounts.map((a, i) => (
          <ArenaButton key={a.label} size="sm" variant={i === 2 ? 'primary' : 'secondary'} onClick={() => lab.addReagentTo(reagentId, vessel, a.v)} autoFocus={i === 2}>
            {i === 0 && !solid && <Pipette />}
            {a.label}
          </ArenaButton>
        ))}
        <CloseButton lab={lab} />
      </Row>
    </div>
  )
}

function PourPrompt({ lab, from, to }: { lab: Lab; from: string; to: string }) {
  return (
    <div>
      <Title>
        Pour <span className="text-foreground">{lab.label(from)}</span> into <span className="text-foreground">{lab.label(to)}</span>
      </Title>
      <Row>
        <ArenaButton size="sm" onClick={() => lab.pour(from, to, 0.25)}>
          ¼
        </ArenaButton>
        <ArenaButton size="sm" onClick={() => lab.pour(from, to, 0.5)}>
          ½
        </ArenaButton>
        <ArenaButton size="sm" variant="primary" onClick={() => lab.pour(from, to, 1)} autoFocus>
          All of it
        </ArenaButton>
        <CloseButton lab={lab} />
      </Row>
    </div>
  )
}

function ArmedHint({ lab }: { lab: Lab }) {
  const a = lab.ui.armed!
  let text: React.ReactNode = ''
  switch (a.type) {
    case 'reagent':
      text = (
        <>
          Tap a vessel to add <b className="text-foreground">{REAGENT_BY_ID[a.id]?.label}</b>
        </>
      )
      break
    case 'pour':
      text = (
        <>
          Tap the vessel to pour <b className="text-foreground">{lab.label(a.from)}</b> into
        </>
      )
      break
    case 'connect':
      text = a.from ? (
        <>
          Now tap the vessel to bubble the gas from <b className="text-foreground">{lab.label(a.from)}</b> into
        </>
      ) : (
        'Delivery tube: tap the vessel that gives off the gas'
      )
      break
    case 'tool': {
      const t = lab.item(a.uid)
      text = a.target === 'burner' ? 'Tap a lit burner to hold the loop in its flame' : `Tap a vessel to use the ${t?.label.toLowerCase() ?? 'tool'}`
      break
    }
  }
  return (
    <Row className="flex-nowrap">
      <span className="min-w-0 px-1 text-xs font-semibold text-muted-foreground">{text}</span>
      <ArenaButton size="sm" variant="ghost" onClick={() => lab.arm(null)}>
        Cancel
      </ArenaButton>
    </Row>
  )
}

function Inspector({ lab, it }: { lab: Lab; it: BenchItem }) {
  if (isVesselKind(it.kind)) return <VesselControls lab={lab} it={it} />
  const remove = (
    <ArenaButton size="sm" variant="danger" onClick={() => lab.remove(it.uid)} aria-label={`Remove ${it.label}`}>
      <Trash2 />
    </ArenaButton>
  )
  if (it.kind === 'burner') {
    return (
      <div>
        <Title>{it.label}</Title>
        <Row>
          <ArenaButton size="sm" variant={it.lit ? 'secondary' : 'gold'} onClick={() => lab.toggleBurner(it.uid)}>
            <Flame />
            {it.lit ? 'Turn off' : 'Light'}
          </ArenaButton>
          <label className="flex h-8 items-center gap-2 rounded-lg bg-muted px-2.5 text-xs font-bold">
            <span className="text-muted-foreground">Gas</span>
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(it.power * 100)}
              onChange={(e) => lab.setPower(it.uid, Number(e.target.value) / 100)}
              className="h-1.5 w-24 cursor-pointer accent-[hsl(var(--primary))] sm:w-32"
              aria-label="Gas flow"
            />
            <span className="w-8 text-right tabular-nums">{Math.round(it.power * 100)}%</span>
          </label>
          {remove}
        </Row>
      </div>
    )
  }
  if (it.kind === 'splint') {
    return (
      <div>
        <Title>{it.label}</Title>
        <Row>
          <ArenaTabs
            size="sm"
            value={it.splint}
            onChange={(v) => lab.setSplint(it.uid, v)}
            options={[
              { value: 'burning', label: 'Burning' },
              { value: 'glowing', label: 'Glowing' },
            ]}
            aria-label="Splint"
          />
          <ArenaButton size="sm" variant="primary" onClick={() => lab.arm({ type: 'tool', uid: it.uid, target: 'vessel' })}>
            Hold at a mouth…
          </ArenaButton>
          {remove}
        </Row>
      </div>
    )
  }
  if (it.kind === 'litmus') {
    const now = it.litmusNow ?? it.litmus
    return (
      <div>
        <Title>
          {it.label}
          {it.litmusNow && it.litmusNow !== it.litmus ? ` — now ${it.litmusNow}` : ''}
        </Title>
        <Row>
          <ArenaButton size="sm" variant="primary" onClick={() => lab.arm({ type: 'tool', uid: it.uid, target: 'vessel' })}>
            <span className="size-2.5 rounded-sm" style={{ background: now === 'red' ? '#d64054' : '#4668d2' }} />
            Dip in…
          </ArenaButton>
          {it.litmusNow && (
            <ArenaButton size="sm" onClick={() => lab.freshLitmus(it.uid)}>
              Fresh strip
            </ArenaButton>
          )}
          {remove}
        </Row>
      </div>
    )
  }
  if (it.kind === 'loop') {
    return (
      <div>
        <Title>{it.sample ? `Loop holding ${it.sample.id === 'none' ? 'a sample' : it.sample.name.toLowerCase()}` : 'Flame-test loop (clean)'}</Title>
        <Row>
          <ArenaButton size="sm" variant={it.sample ? 'secondary' : 'primary'} onClick={() => lab.arm({ type: 'tool', uid: it.uid, target: 'vessel' })}>
            <Droplets />
            Dip in…
          </ArenaButton>
          <ArenaButton size="sm" variant={it.sample ? 'primary' : 'secondary'} disabled={!it.sample} onClick={() => lab.arm({ type: 'tool', uid: it.uid, target: 'burner' })}>
            <Flame />
            Hold in flame
          </ArenaButton>
          {it.sample && (
            <ArenaButton size="sm" variant="ghost" onClick={() => lab.cleanLoop(it.uid)}>
              Clean
            </ArenaButton>
          )}
          {remove}
        </Row>
      </div>
    )
  }
  return (
    <div>
      <Title>{it.label}</Title>
      <Row>
        <ArenaButton size="sm" variant="primary" onClick={() => lab.arm({ type: 'tool', uid: it.uid, target: 'vessel' })}>
          <Thermometer />
          Put in…
        </ArenaButton>
        {remove}
      </Row>
    </div>
  )
}

function VesselControls({ lab, it }: { lab: Lab; it: BenchItem }) {
  const v = lab.vessel(it.uid)
  const d = lab.display.get(it.uid)
  if (!v) return null
  const vol = volumeMl(v)
  const emptyNow = Object.keys(v.contents).length === 0
  const thermo = lab.thermometerIn(it.uid)
  const contents = v.added.length
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
        <span className="font-black text-foreground">{it.label}</span>
        <span className="tabular-nums text-muted-foreground">
          {vol < 10 ? vol.toFixed(1) : Math.round(vol)} / {v.capacity} mL
        </span>
        <span className="tabular-nums text-muted-foreground">{Math.round(d?.temp ?? v.temp)} °C</span>
        {d?.ph != null && (
          <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
            <span className="size-2.5 rounded-full ring-1 ring-black/10" style={{ background: rgba(phColor(d.ph), 1) }} />
            pH {d.ph.toFixed(1)}
          </span>
        )}
        {contents === 0 && <span className="text-muted-foreground">empty — drop a chemical on it</span>}
      </div>
      <Row>
        <ArenaButton size="sm" disabled={emptyNow} onClick={() => lab.arm({ type: 'pour', from: it.uid })}>
          <GlassWater />
          Pour
        </ArenaButton>
        <ArenaButton size="sm" disabled={emptyNow} onClick={() => lab.stir(it.uid)}>
          <RotateCw />
          Stir
        </ArenaButton>
        {v.deliverTo ? (
          <ArenaButton size="sm" onClick={() => lab.disconnect(it.uid)}>
            <Unplug />
            Unhook tube
          </ArenaButton>
        ) : (
          <ArenaButton size="sm" onClick={() => lab.arm({ type: 'connect', from: it.uid })}>
            <Cable />
            Delivery tube
          </ArenaButton>
        )}
        {it.onBurner && (
          <ArenaButton size="sm" onClick={() => lab.takeOffBurner(it.uid)}>
            <Flame />
            Off the heat
          </ArenaButton>
        )}
        {thermo && (
          <ArenaButton size="sm" onClick={() => lab.takeOutThermometer(thermo.uid)}>
            <Thermometer />
            Take out
          </ArenaButton>
        )}
        <ArenaButton size="sm" variant="ghost" disabled={emptyNow} onClick={() => lab.emptyVessel(it.uid)}>
          <Droplets />
          Empty
        </ArenaButton>
        <ArenaButton size="sm" variant="danger" onClick={() => lab.remove(it.uid)} aria-label={`Remove ${it.label}`}>
          <Trash2 />
        </ArenaButton>
      </Row>
    </div>
  )
}

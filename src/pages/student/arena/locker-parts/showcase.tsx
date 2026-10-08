import { motion, useReducedMotion } from 'framer-motion'
import { ArrowBigUp, RotateCcw } from 'lucide-react'
import * as React from 'react'

import type { ArenaMyProfile, ArenaSlot } from '@/api/arena.types'
import { cn } from '@/lib/cn'
import { gradient } from '@/components/arena/arena-ui'
import { Art3D, ArenaButton, GameTitle, Label, Panel, RARITY_STYLE, Stage, TierBadge, XpBar } from '@/components/arena/arena-theme'
import { RARITY_HEX, RarityTag, SLOT_LOOK, SLOT_ORDER, TitleChip } from '@/components/arena/profile-card'
import { ItemAction, SlotThumb } from './item-preview'
import type { LockerState } from './try-on'
import { HeroArt } from '@/components/arena/arena-art'

/**
 * The locker's character screen: who I am on the left, me on a lit stage in
 * the middle wearing whatever I'm trying on, the loadout and the one action
 * on the right.
 */
export const Showcase = React.forwardRef<
  HTMLElement,
  {
    profile: ArenaMyProfile
    locker: LockerState
    /** The shop's current slot, outlined in the loadout. */
    activeSlot: ArenaSlot | null
    onSlot: (slot: ArenaSlot) => void
  }
>(({ profile, locker, activeSlot, onSlot }, ref) => {
  const look = locker.look ?? profile.look
  const title = look.title
  const trying = locker.trying
  const intoLevel = Math.max(0, profile.xp - profile.level_xp)
  const levelSpan = Math.max(1, profile.next_level_xp - profile.level_xp)
  const owned = locker.items.filter((i) => i.owned).length

  return (
    <section
      ref={ref}
      aria-label="Your look"
      className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(15rem,0.85fr)] lg:gap-5"
    >
      {/* ---------------------------------------------------------- info */}
      <div className="flex min-w-0 flex-col justify-center gap-2 lg:py-4">
        <Label className={cn(locker.dirty && 'text-primary')}>{locker.dirty ? 'Try-on preview' : 'Your look'}</Label>
        <GameTitle className="line-clamp-2 break-words text-3xl leading-[0.95] sm:text-4xl xl:text-5xl">{profile.full_name}</GameTitle>
        {title?.text && (
          <p className={cn('truncate text-sm font-black uppercase italic tracking-wide sm:text-base', RARITY_STYLE[title.rarity].text)}>
            {title.text}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <TierBadge level={profile.level} size="md" />
          {trying && (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-muted px-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Item</span>
              <RarityTag rarity={trying.rarity} />
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Level {profile.level}
          {profile.class_name ? ` · ${profile.class_name}` : ''} · {owned} item{owned === 1 ? '' : 's'} owned
        </p>

        <div className="mt-2 max-w-sm">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <Label>Level</Label>
            <span className="text-xs font-bold tabular-nums text-foreground">
              {intoLevel.toLocaleString()} <span className="font-semibold text-muted-foreground">/ {levelSpan.toLocaleString()} XP</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-black tabular-nums text-primary-foreground">
              {profile.level}
            </span>
            <XpBar progress={profile.progress} tall className="h-3 flex-1" />
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-black tabular-nums text-muted-foreground">
              {profile.level + 1}
            </span>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------- stage */}
      <HeroStage look={look} dirty={locker.dirty} />

      {/* ------------------------------------------------------- loadout */}
      <Panel className="flex min-w-0 flex-col gap-3 p-3.5 sm:p-4">
        <div className="flex items-baseline justify-between gap-2">
          <GameTitle as="h2" className="text-lg">
            Loadout
          </GameTitle>
          <span className="text-[11px] font-bold tabular-nums text-muted-foreground">
            {owned}/{locker.items.length} owned
          </span>
        </div>

        <ul className="grid grid-cols-4 gap-2">
          {SLOT_ORDER.map((slot) => {
            const showing = look[slot]
            const changed = showing?.id !== profile.look[slot]?.id
            const isNew = !changed && showing && locker.fresh.has(showing.id)
            const hex = showing ? RARITY_HEX[showing.rarity] : undefined
            return (
              <li key={slot} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onSlot(slot)}
                  aria-label={`${SLOT_LOOK[slot].label}: ${showing?.name ?? 'none'}${changed ? ' (trying on)' : ''}. Show ${SLOT_LOOK[slot].label.toLowerCase()}.`}
                  aria-pressed={activeSlot === slot}
                  className={cn(
                    'relative flex aspect-square w-full items-center justify-center overflow-visible rounded-xl border-2 bg-muted/60 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    activeSlot === slot && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
                  )}
                  style={{
                    borderColor: hex ? `${hex}aa` : undefined,
                    background: hex ? `radial-gradient(circle at 50% 40%, ${hex}26, transparent 75%)` : undefined,
                  }}
                >
                  <span className="relative flex size-full items-center justify-center overflow-hidden rounded-[10px]">
                    <SlotThumb slot={slot} item={showing} look={look} />
                  </span>
                  {(changed || isNew) && (
                    <span
                      className={cn(
                        'absolute -right-1.5 -top-2 -skew-x-6 rounded px-1 text-[9px] font-black uppercase italic leading-4 shadow-sm',
                        changed ? 'bg-primary text-primary-foreground' : 'bg-danger text-danger-foreground',
                      )}
                    >
                      {changed ? 'Try' : 'New'}
                    </span>
                  )}
                </button>
                <span className="mt-1 block truncate text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {SLOT_LOOK[slot].one}
                </span>
              </li>
            )
          })}
        </ul>

        <div className="min-h-[3.25rem] flex-1" aria-live="polite">
          {trying ? (
            <>
              <p className="truncate text-base font-black text-foreground">{trying.name}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <RarityTag rarity={trying.rarity} />
                <span className="text-[11px] font-semibold text-muted-foreground">{SLOT_LOOK[trying.slot].one}</span>
                {!trying.owned && !trying.locked && (
                  <span className="ml-auto inline-flex items-center gap-1 text-sm font-black tabular-nums text-foreground">
                    <Art3D name="coin" className="size-5" />
                    {trying.price.toLocaleString()}
                  </span>
                )}
                {trying.owned && !trying.equipped && <span className="ml-auto text-[11px] font-bold uppercase text-success">Owned</span>}
              </div>
            </>
          ) : (
            <p className="pt-1 text-sm text-muted-foreground">Tap an item below to try it on before you buy.</p>
          )}
        </div>

        {trying && (
          <ItemAction
            item={trying}
            coins={profile.coins}
            onBuy={locker.setConfirming}
            onEquip={locker.onEquip}
            equipping={locker.equippingId === trying.id}
          />
        )}
        {locker.dirty && (
          <ArenaButton size="sm" variant="ghost" onClick={locker.reset} className="w-full">
            <RotateCcw />
            Reset try-on
          </ArenaButton>
        )}
      </Panel>
    </section>
  )
})
Showcase.displayName = 'Showcase'

// ------------------------------------------------------------------ stage

const ARROWS = [
  { left: '14%', delay: 0, size: 'size-7' },
  { left: '26%', delay: 1.1, size: 'size-5' },
  { left: '72%', delay: 0.5, size: 'size-6' },
  { left: '84%', delay: 1.6, size: 'size-8' },
  { left: '62%', delay: 2.2, size: 'size-4' },
]

function HeroStage({ look, dirty }: { look: NonNullable<LockerState['look']>; dirty: boolean }) {
  const reduced = useReducedMotion()
  const frame = look.frame?.colors?.length ? look.frame.colors : ['#8b5cf6', '#ec4899']
  const glow = /^#[0-9a-f]{6}$/i.test(frame[0]) ? frame[0] : '#8b5cf6'

  return (
    <Stage className="relative min-h-[17rem] sm:min-h-[20rem] lg:min-h-[23rem]">
      {/* The banner tints the stage. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20 opacity-40"
        style={{ background: gradient(look.banner?.colors, 160), maskImage: 'radial-gradient(85% 80% at 50% 45%, black 30%, transparent 85%)' }}
      />

      {/* Rising arrows, as on a character's upgrade screen. */}
      {!reduced &&
        ARROWS.map((a, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="pointer-events-none absolute bottom-[18%]"
            style={{ left: a.left, color: glow }}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: -150, opacity: [0, 0.85, 0] }}
            transition={{ duration: 3.2, delay: a.delay, repeat: Infinity, ease: 'easeOut' }}
          >
            <ArrowBigUp className={cn(a.size, 'fill-current drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]')} />
          </motion.span>
        ))}

      {dirty && (
        <span className="absolute left-3 top-3 z-10 -skew-x-6 rounded-md bg-primary px-2 py-0.5 text-[10px] font-black uppercase italic tracking-wider text-primary-foreground shadow-sm">
          Try-on
        </span>
      )}

      <div className="absolute inset-0 flex items-center justify-center pb-10">
        {/* Glow, then the frame-coloured ring behind the figure. */}
        <span
          aria-hidden
          className="absolute size-44 rounded-full opacity-70 blur-2xl sm:size-56"
          style={{ background: `radial-gradient(circle, ${glow}, transparent 70%)` }}
        />
        <motion.span
          aria-hidden
          className="absolute size-44 rounded-full sm:size-56"
          style={{
            background: `conic-gradient(from 0deg, ${[...frame, frame[0]].join(', ')})`,
            maskImage: 'radial-gradient(circle, transparent 64%, black 65.5%, black 70%, transparent 71.5%)',
            WebkitMaskImage: 'radial-gradient(circle, transparent 64%, black 65.5%, black 70%, transparent 71.5%)',
          }}
          animate={reduced ? undefined : { rotate: 360 }}
          transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
        />
        {/* Pedestal. */}
        <span
          aria-hidden
          className="absolute bottom-[16%] h-5 w-40 rounded-[50%] opacity-80 sm:w-52"
          style={{ background: gradient(frame, 90), boxShadow: `0 0 24px 2px ${glow}88` }}
        />
        <motion.div
          key={look.avatar?.id ?? 'none'}
          className="relative"
          initial={reduced ? false : { scale: 0.8, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          <HeroArt avatar={look.avatar} float className="h-52 w-40 text-8xl sm:h-72 sm:w-56" alt={look.avatar?.name ?? ''} />
        </motion.div>
      </div>

      {look.title?.text && (
        <div className="absolute inset-x-3 bottom-3 flex justify-center">
          <span className="max-w-full rounded-md bg-card/90 shadow-sm backdrop-blur-sm">
            <TitleChip item={look.title} className="text-sm" />
          </span>
        </div>
      )}
    </Stage>
  )
}

// --------------------------------------------------------------- sticky bar

/** A slim bar that keeps the picked item and its action in reach once the stage scrolls away. */
export function TryOnBar({ profile, locker }: { profile: ArenaMyProfile; locker: LockerState }) {
  const trying = locker.trying
  if (!trying) return null
  const look = locker.look ?? profile.look
  const hex = RARITY_HEX[trying.rarity]
  return (
    <div className="sticky top-2 z-20 mb-3">
      <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur-md">
        <span
          aria-hidden
          className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2"
          style={{ borderColor: `${hex}aa`, background: `radial-gradient(circle at 50% 40%, ${hex}26, transparent 75%)` }}
        >
          <SlotThumb slot={trying.slot} item={look[trying.slot]} look={look} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-foreground">{trying.name}</p>
          <RarityTag rarity={trying.rarity} />
        </div>
        <ItemAction
          item={trying}
          coins={profile.coins}
          onBuy={locker.setConfirming}
          onEquip={locker.onEquip}
          equipping={locker.equippingId === trying.id}
          size="sm"
        />
        {locker.dirty && (
          <ArenaButton size="icon" variant="ghost" onClick={locker.reset} aria-label="Reset try-on" className="size-8">
            <RotateCcw />
          </ArenaButton>
        )}
      </div>
    </div>
  )
}

/** A callback ref, and whether that element is on screen. */
export function useOnScreen<T extends Element>(): [(el: T | null) => void, boolean] {
  const [el, setEl] = React.useState<T | null>(null)
  const [visible, setVisible] = React.useState(true)
  React.useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.15 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  return [setEl, visible]
}

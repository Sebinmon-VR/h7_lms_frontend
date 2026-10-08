import { motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import * as React from 'react'

import type { ArenaItem, ArenaLook, ArenaMyProfile, ArenaSlot } from '@/api/arena.types'
import { cn } from '@/lib/cn'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Art3D, ArenaButton, ArenaChip, ArenaEmpty, Label, RARITY_STYLE } from '@/components/arena/arena-theme'
import { RARITY_HEX, RarityTag, SLOT_LOOK } from '@/components/arena/profile-card'
import { ItemPreview, withItem } from './item-preview'
import type { LockerState } from './try-on'

const SHOP_SLOTS: ArenaSlot[] = ['avatar', 'frame', 'title', 'banner']

/** The shop: a strip of items per slot. Tap one to try it on the stage above. */
export function ShopGrid({ profile, locker }: { profile: ArenaMyProfile; locker: LockerState }) {
  const { items, slot, setSlot } = locker
  const inSlot = items.filter((item) => item.slot === slot)

  return (
    <div className="space-y-3">
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Item type">
        {SHOP_SLOTS.map((s) => {
          const all = items.filter((item) => item.slot === s)
          const owned = all.filter((item) => item.owned).length
          const Icon = SLOT_LOOK[s].icon
          return (
            <ArenaChip key={s} active={slot === s} onClick={() => setSlot(s)}>
              <Icon />
              {SLOT_LOOK[s].label}
              <span className="tabular-nums opacity-70">
                {owned}/{all.length}
              </span>
            </ArenaChip>
          )
        })}
      </div>

      {inSlot.length === 0 ? (
        <ArenaEmpty art="gift" title={`No ${SLOT_LOOK[slot].label.toLowerCase()} in the shop yet`} />
      ) : (
        <ul key={slot} className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 lg:grid-cols-6">
          {inSlot.map((item, i) => (
            <li key={item.id} className="min-w-0">
              <ItemTile
                item={item}
                index={i}
                look={profile.look}
                selected={locker.tryOn[item.slot] === item.id || locker.pickedId === item.id}
                onPick={locker.pick}
                onHover={locker.setHoverId}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// --------------------------------------------------------------------- tile

function ItemTile({
  item,
  index,
  look,
  selected,
  onPick,
  onHover,
}: {
  item: ArenaItem
  index: number
  look: ArenaLook
  selected: boolean
  onPick: (item: ArenaItem) => void
  onHover: (id: string | null) => void
}) {
  const reduced = useReducedMotion()
  const locked = item.locked && !item.owned
  const r = RARITY_STYLE[item.rarity]
  const hex = RARITY_HEX[item.rarity]
  const status = item.equipped ? 'Equipped' : item.owned ? 'Owned' : locked ? `Locked: ${item.lock_reason ?? ''}` : `${item.price} coins`

  return (
    <motion.button
      type="button"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: reduced ? 0 : Math.min(index, 12) * 0.02 }}
      onClick={() => onPick(item)}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(item.id)}
      onBlur={() => onHover(null)}
      aria-pressed={selected}
      aria-label={`${item.name}, ${r.label}. ${status}. Try it on.`}
      className={cn(
        'group relative flex h-[7.25rem] w-full flex-col overflow-hidden rounded-2xl border-2 bg-card text-left shadow-sm transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        r.border,
        !locked && r.glow,
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
      )}
    >
      <span
        className="relative flex min-h-0 flex-1 items-center justify-center px-2"
        style={{ background: `radial-gradient(ellipse at 50% 65%, ${hex}${locked ? '12' : '30'}, transparent 72%)` }}
      >
        <span
          className={cn(
            'flex w-full items-center justify-center transition-transform duration-200 group-hover:scale-110',
            locked && 'opacity-45 grayscale',
          )}
        >
          <ItemPreview item={item} look={look} tile />
        </span>
        {item.rarity === 'LEGENDARY' && !locked && <Shimmer />}
        {item.equipped && (
          <span className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-success text-success-foreground shadow">
            <Check className="size-3" strokeWidth={3.5} aria-hidden />
          </span>
        )}
        {locked && <Art3D name="lock" className="absolute right-1 top-1 size-6" />}
      </span>

      <span className="block min-w-0 px-2 pb-1.5">
        <span className="flex min-w-0 items-center gap-1">
          <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', r.dot)} />
          <span className={cn('truncate text-xs font-bold', locked ? 'text-muted-foreground' : 'text-foreground')} title={item.name}>
            {item.name}
          </span>
        </span>
        <span className="mt-0.5 flex h-5 items-center">
          <TileStatus item={item} locked={locked} />
        </span>
      </span>
    </motion.button>
  )
}

function TileStatus({ item, locked }: { item: ArenaItem; locked: boolean }) {
  if (item.equipped) {
    return <span className="text-[10px] font-black uppercase italic tracking-wider text-success">Equipped</span>
  }
  if (item.owned) {
    return <span className="text-[10px] font-black uppercase italic tracking-wider text-muted-foreground">Owned</span>
  }
  if (locked) {
    return (
      <span className="truncate text-[10px] font-semibold text-muted-foreground" title={item.lock_reason ?? 'Locked'}>
        {item.lock_reason ?? 'Locked'}
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-black tabular-nums', item.affordable ? 'text-foreground' : 'text-muted-foreground')}>
      <Art3D name="coin" className={cn('size-4', !item.affordable && 'opacity-60 grayscale')} />
      {item.price.toLocaleString()}
    </span>
  )
}

/** A light sweep across legendary tiles, now and then. */
function Shimmer() {
  const reduced = useReducedMotion()
  if (reduced) return null
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.span
        className="absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-warning/30 to-transparent"
        initial={{ x: '-120%' }}
        animate={{ x: '320%' }}
        transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 2.6 }}
      />
    </span>
  )
}

// ------------------------------------------------------------------ dialogs

export function ConfirmBuy({
  item,
  look,
  coins,
  loading,
  onCancel,
  onConfirm,
}: {
  item: ArenaItem | null
  look: ArenaLook
  coins: number
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  // Keep the last item so the dialog doesn't empty while it animates out.
  const [shown, setShown] = React.useState<ArenaItem | null>(item)
  React.useEffect(() => {
    if (item) setShown(item)
  }, [item])
  const hex = shown ? RARITY_HEX[shown.rarity] : '#94a3b8'

  return (
    <Dialog open={item != null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent size="sm" hideClose className="max-w-sm rounded-2xl">
        {shown && (
          <div className="p-5">
            <Label>Unlock item</Label>
            <DialogTitle className="mt-1 text-2xl font-black uppercase italic leading-none tracking-tight text-foreground">
              {shown.name}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Unlock {shown.name} for {shown.price} coins. You'll have {Math.max(0, coins - shown.price)} left.
            </DialogDescription>
            <div className="mt-1">
              <RarityTag rarity={shown.rarity} />
            </div>

            <div
              className="mt-4 flex min-h-36 items-center justify-center rounded-2xl p-4"
              style={{ background: `radial-gradient(ellipse at 50% 55%, ${hex}38, transparent 72%), hsl(var(--muted) / 0.6)` }}
            >
              <ItemPreview item={shown} look={look} big />
            </div>

            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Price</dt>
                <dd className="inline-flex items-center gap-1 font-black tabular-nums text-foreground">
                  <Art3D name="coin" className="size-5" />
                  {shown.price.toLocaleString()}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Left after</dt>
                <dd className="inline-flex items-center gap-1 font-bold tabular-nums text-foreground">
                  <Art3D name="coin" className="size-5" />
                  {Math.max(0, coins - shown.price).toLocaleString()}
                </dd>
              </div>
            </dl>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <ArenaButton variant="secondary" onClick={onCancel} disabled={loading}>
                Cancel
              </ArenaButton>
              <ArenaButton variant="gold" loading={loading} onClick={onConfirm}>
                Unlock
              </ArenaButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** The unlock moment: the item lands on a burst of its rarity colour. */
export function UnlockReveal({ item, look, onClose }: { item: ArenaItem | null; look: ArenaLook; onClose: () => void }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = React.useState<ArenaItem | null>(item)
  React.useEffect(() => {
    if (item) setShown(item)
  }, [item])

  // Show it as it now sits on my card: equipped on the spot.
  const lookWith = shown ? withItem(look, shown) : look
  const hex = shown ? RARITY_HEX[shown.rarity] : '#8b5cf6'

  return (
    <Dialog open={item != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm" hideClose className="max-w-sm rounded-2xl text-center">
        {shown && (
          <div className="relative isolate overflow-hidden px-5 pb-5 pt-8">
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-24 -z-10 size-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 motion-safe:animate-[spin_18s_linear_infinite]"
              style={{
                background: `repeating-conic-gradient(from 0deg, ${hex}40 0deg 6deg, transparent 6deg 20deg)`,
                maskImage: 'radial-gradient(circle, black 15%, transparent 55%)',
              }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-24 -z-10 size-60 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ background: `radial-gradient(circle, ${hex}66, ${hex}10 45%, transparent 70%)` }}
            />
            <motion.div
              initial={reduced ? false : { scale: 0.5, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14 }}
              className="flex min-h-36 items-center justify-center"
            >
              <ItemPreview item={shown} look={lookWith} big />
            </motion.div>
            <p className={cn('mt-5 text-xs font-black uppercase italic tracking-[0.4em]', RARITY_STYLE[shown.rarity].text)}>Unlocked</p>
            <DialogTitle className="mt-1 text-3xl font-black uppercase italic leading-none tracking-tight text-foreground">
              {shown.name}
            </DialogTitle>
            <div className="mt-1.5 flex justify-center">
              <RarityTag rarity={shown.rarity} />
            </div>
            <DialogDescription className="mt-3 text-sm text-muted-foreground">
              Equipped — your new {SLOT_LOOK[shown.slot].one} shows on every board and battle.
              {shown.rarity === 'LEGENDARY'
                ? ' Legendary: hardly anyone has one.'
                : shown.rarity === 'EPIC'
                  ? ' An epic find.'
                  : shown.rarity === 'RARE'
                    ? ' A rare one for the collection.'
                    : ''}
            </DialogDescription>
            <ArenaButton variant="primary" size="lg" className="mt-5 w-full" onClick={onClose}>
              Continue
            </ArenaButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

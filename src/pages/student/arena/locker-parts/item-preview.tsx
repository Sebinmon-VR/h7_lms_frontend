import { Check } from 'lucide-react'

import type { ArenaItem, ArenaLook, ArenaLookItem, ArenaSlot } from '@/api/arena.types'
import { cn } from '@/lib/cn'
import { ArenaAvatar, gradient } from '@/components/arena/arena-ui'
import { Art3D, ArenaButton, RARITY_STYLE } from '@/components/arena/arena-theme'
import { TitleChip } from '@/components/arena/profile-card'
import { HeroArt } from '@/components/arena/arena-art'

/** A catalogue item in the shape the look components read. */
export function toLookItem(item: ArenaItem): ArenaLookItem {
  return { id: item.id, name: item.name, emoji: item.emoji, text: item.text, colors: item.colors, rarity: item.rarity, character: item.character }
}

/** My look with one item swapped in. */
export function withItem(look: ArenaLook, item: ArenaItem): ArenaLook {
  return { ...look, [item.slot]: toLookItem(item) }
}

/**
 * What an item looks like on me: an avatar as its 3D figure, a frame round my
 * avatar, a banner as its colours, a title as its tag. `tile` is the shop
 * grid, `big` the confirm and unlock moments.
 */
export function ItemPreview({ item, look, big, tile }: { item: ArenaItem; look: ArenaLook; big?: boolean; tile?: boolean }) {
  const tried = withItem(look, item)
  if (item.slot === 'avatar') {
    return <HeroArt avatar={item} className={cn(big ? 'h-40 w-32 text-7xl' : tile ? 'h-20 w-16 text-4xl' : 'h-20 w-16 text-4xl')} float={big} />
  }
  if (item.slot === 'frame') {
    return <ArenaAvatar look={tried} size={big ? 'xl' : tile ? 'md' : 'lg'} />
  }
  if (item.slot === 'banner') {
    return (
      <span
        className={cn(
          'relative flex w-full items-center justify-center overflow-hidden shadow-inner',
          big ? 'h-28 max-w-xs rounded-2xl' : tile ? 'h-11 rounded-lg' : 'h-14 rounded-xl',
        )}
        style={{ background: gradient(tried.banner?.colors, 120) }}
      >
        {big && <ArenaAvatar look={tried} size="lg" className="relative" />}
      </span>
    )
  }
  return <TitleChip item={item} className={big ? 'px-3 py-1 text-lg' : tile ? 'max-w-full px-1.5 text-[10px]' : 'text-xs'} />
}

/** A loadout slot's picture: small, centred, whatever the slot. */
export function SlotThumb({ slot, item, look }: { slot: ArenaSlot; item: ArenaLookItem | undefined; look: ArenaLook }) {
  if (!item) return <span className="text-xs text-muted-foreground">—</span>
  if (slot === 'avatar') return <HeroArt variant="head" avatar={item} className="size-[80%] text-2xl" />
  if (slot === 'frame') return <ArenaAvatar look={{ avatar: look.avatar, frame: item }} size="xs" />
  if (slot === 'banner') return <span aria-hidden className="absolute inset-2 rounded-md" style={{ background: gradient(item.colors, 120) }} />
  return (
    <span className={cn('line-clamp-2 px-1 text-center text-[9px] font-black uppercase italic leading-tight', RARITY_STYLE[item.rarity].text)}>
      {item.text ?? item.name}
    </span>
  )
}

/** Buy, equip, or why not — the one control for the picked item. */
export function ItemAction({
  item,
  coins,
  onBuy,
  onEquip,
  equipping,
  size = 'lg',
  className,
}: {
  item: ArenaItem
  coins: number
  onBuy: (item: ArenaItem) => void
  onEquip: (item: ArenaItem) => void
  equipping?: boolean
  size?: 'sm' | 'lg'
  className?: string
}) {
  const lg = size === 'lg'
  if (item.equipped) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center gap-1.5 rounded-xl font-black uppercase italic tracking-wide text-success',
          lg ? 'h-12 w-full bg-success/10 text-base' : 'h-8 px-2 text-xs',
          className,
        )}
      >
        <Check className={lg ? 'size-5' : 'size-4'} strokeWidth={3} aria-hidden />
        Equipped
      </span>
    )
  }
  if (item.owned) {
    return (
      <ArenaButton size={size} variant="gold" loading={equipping} onClick={() => onEquip(item)} className={cn(lg && 'w-full', className)}>
        Equip
      </ArenaButton>
    )
  }
  if (item.locked) {
    return (
      <div className={cn('flex flex-col items-center gap-1', lg && 'w-full', className)}>
        <ArenaButton size={size} variant="secondary" disabled className={cn(lg && 'w-full')} aria-label={`Locked: ${item.lock_reason ?? 'not available yet'}`}>
          <Art3D name="lock" className={lg ? 'size-6' : 'size-4'} />
          Locked
        </ArenaButton>
        {lg && item.lock_reason && <span className="text-center text-[11px] font-semibold text-muted-foreground">{item.lock_reason}</span>}
      </div>
    )
  }
  if (!item.affordable) {
    return (
      <div className={cn('flex flex-col items-center gap-1', lg && 'w-full', className)}>
        <ArenaButton
          size={size}
          variant="gold"
          disabled
          className={cn(lg && 'w-full')}
          aria-label={`Buy for ${item.price} coins — not enough coins`}
        >
          Buy
          <Art3D name="coin" className={lg ? 'size-6' : 'size-4'} />
          {item.price.toLocaleString()}
        </ArenaButton>
        <span className="text-[11px] font-bold tabular-nums text-danger">Need {Math.max(0, item.price - coins).toLocaleString()} more</span>
      </div>
    )
  }
  return (
    <ArenaButton
      size={size}
      variant="gold"
      onClick={() => onBuy(item)}
      className={cn(lg && 'w-full', className)}
      aria-label={`Buy ${item.name} for ${item.price} coins`}
    >
      Buy
      <span aria-hidden className="opacity-50">·</span>
      <Art3D name="coin" className={lg ? 'size-6' : 'size-4'} />
      <span className="tabular-nums">{item.price.toLocaleString()}</span>
    </ArenaButton>
  )
}

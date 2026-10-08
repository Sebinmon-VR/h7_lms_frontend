import * as React from 'react'
import { toast } from 'sonner'

import type { ArenaItem, ArenaLook, ArenaMyProfile, ArenaSlot } from '@/api/arena.types'
import { useBuyItem, useEquipItem } from '@/queries/arena.queries'
import { useCelebration } from '@/components/fun/celebrate'
import { withItem } from './item-preview'

const NO_ITEMS: ArenaItem[] = []

/**
 * Everything the locker's character screen and shop share: what is being
 * tried on, the item last picked, buying and equipping, and the unlock
 * moment.
 *
 * Picking an item keeps it on the preview (one per slot, so a new avatar and
 * a new banner can be tried together); hovering shows one for a moment
 * without losing what was picked.
 */
export function useLocker(itemsIn: ArenaItem[] | undefined, profile: ArenaMyProfile | undefined) {
  const items = itemsIn ?? NO_ITEMS
  const [slot, setSlot] = React.useState<ArenaSlot>('avatar')
  const [tryOn, setTryOn] = React.useState<Partial<Record<ArenaSlot, string>>>({})
  const [hoverId, setHoverId] = React.useState<string | null>(null)
  const [pickedId, setPickedId] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState<ArenaItem | null>(null)
  const [unlocked, setUnlocked] = React.useState<ArenaItem | null>(null)
  /** Items unlocked on this visit, for the loadout's "New" tags. */
  const [fresh, setFresh] = React.useState<Set<string>>(() => new Set())
  const [celebration, celebrate] = useCelebration()

  const buy = useBuyItem()
  const equip = useEquipItem()

  const byId = React.useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  const look = React.useMemo<ArenaLook | null>(() => {
    if (!profile) return null
    let next: ArenaLook = profile.look
    for (const id of Object.values(tryOn)) {
      const item = id ? byId.get(id) : undefined
      if (item) next = withItem(next, item)
    }
    const hovered = hoverId ? byId.get(hoverId) : undefined
    return hovered ? withItem(next, hovered) : next
  }, [profile, tryOn, hoverId, byId])

  const trying = (hoverId && byId.get(hoverId)) || (pickedId && byId.get(pickedId)) || null
  const dirty = Object.values(tryOn).some((id) => id && !byId.get(id)?.equipped)

  const forget = (item: ArenaItem) =>
    setTryOn((prev) => {
      const next = { ...prev }
      delete next[item.slot]
      return next
    })

  const pick = (item: ArenaItem) => {
    setPickedId(item.id)
    if (item.equipped) forget(item)
    else setTryOn((prev) => ({ ...prev, [item.slot]: item.id }))
  }

  const reset = () => {
    setTryOn({})
    setPickedId(null)
    setHoverId(null)
  }

  const onEquip = (item: ArenaItem) =>
    equip.mutate(item.id, {
      onSuccess: () => {
        forget(item)
        toast.success(`${item.name} equipped`)
      },
    })

  const confirmBuy = () => {
    const item = confirming
    if (!item) return
    buy.mutate(item.id, {
      onSuccess: () => {
        setConfirming(null)
        forget(item)
        setFresh((prev) => new Set(prev).add(item.id))
        setUnlocked(item)
        celebrate()
      },
    })
  }

  return {
    items,
    byId,
    slot,
    setSlot,
    tryOn,
    look,
    trying,
    dirty,
    fresh,
    pickedId,
    pick,
    reset,
    setHoverId,
    onEquip,
    equippingId: equip.isPending ? (equip.variables ?? null) : null,
    confirming,
    setConfirming,
    confirmBuy,
    buying: buy.isPending,
    unlocked,
    closeUnlocked: () => setUnlocked(null),
    celebration,
  }
}

export type LockerState = ReturnType<typeof useLocker>

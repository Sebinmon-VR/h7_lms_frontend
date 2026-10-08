import { ArrowRight, Award, Backpack, ChevronLeft, IdCard, ShoppingBag } from 'lucide-react'
import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import type { ArenaSlot } from '@/api/arena.types'
import { useArenaCatalog, useArenaHome } from '@/queries/arena.queries'
import { useAuth } from '@/providers/auth-provider'
import { ArenaButton, ArenaEmpty, ArenaHeader, ArenaShell, ArenaTabs, ResourcePill } from '@/components/arena/arena-theme'
import { ArenaErrorNotice, Bone, ProfileCardState, type SlotTotals } from '@/components/arena/profile-card'
import { AdminStudentNotice, useIsAdminViewingStudent } from '../student-guard'
import { BadgesTab } from './locker-parts/badges'
import { ConfirmBuy, ShopGrid, UnlockReveal } from './locker-parts/shop'
import { Showcase, TryOnBar, useOnScreen } from './locker-parts/showcase'
import { useLocker } from './locker-parts/try-on'

/**
 * The locker: one character screen — me on a stage wearing whatever I'm
 * trying on, my loadout and the buy/equip button — with the shop, my badges
 * and my card below. The tab lives in the URL so the arena home and a
 * results screen can open it straight at Badges.
 */

type LockerTab = 'shop' | 'badges' | 'card'

export default function ArenaLockerPage() {
  const isAdmin = useIsAdminViewingStudent()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: LockerTab = tabParam === 'badges' || tabParam === 'card' ? tabParam : 'shop'

  const catalogQuery = useArenaCatalog(!isAdmin)
  const homeQuery = useArenaHome(!isAdmin)
  const profile = homeQuery.data?.profile
  const catalog = catalogQuery.data
  const locker = useLocker(catalog?.items, profile)
  const [showcaseRef, showcaseOnScreen] = useOnScreen<HTMLElement>()
  const gridRef = React.useRef<HTMLDivElement>(null)

  const totals = React.useMemo<SlotTotals | undefined>(() => {
    if (!catalog) return undefined
    const out: SlotTotals = {}
    for (const item of catalog.items) out[item.slot as ArenaSlot] = (out[item.slot as ArenaSlot] ?? 0) + 1
    return out
  }, [catalog])

  const setTab = (value: LockerTab) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === 'shop') next.delete('tab')
        else next.set('tab', value)
        return next
      },
      { replace: true },
    )

  const header = (
    <div className="flex items-start gap-2">
      <ArenaButton asChild variant="secondary" size="icon" className="mt-0.5">
        <Link to="/student/arena" aria-label="Back to the arena">
          <ChevronLeft />
        </Link>
      </ArenaButton>
      <ArenaHeader
        className="min-w-0 flex-1"
        icon={<Backpack />}
        title="Locker"
        actions={
          isAdmin ? null : profile ? (
            <>
              <ResourcePill art="coin" value={profile.coins} label="coins" />
              <ResourcePill art="star" value={`Lv ${profile.level}`} label="level" />
            </>
          ) : homeQuery.isPending ? (
            <Bone className="h-8 w-40 rounded-full" />
          ) : null
        }
      />
    </div>
  )

  if (isAdmin) {
    return (
      <>
        <AdminStudentNotice />
        <ArenaShell>
          {header}
          <ArenaEmpty
            art="lock"
            title="The locker belongs to students"
            description="Students spend the coins they win here. Arena management has the boards and question banks."
            action={
              <ArenaButton asChild size="sm" variant="primary">
                <Link to="/admin/arena/leaderboards">
                  Open arena leaderboards
                  <ArrowRight />
                </Link>
              </ArenaButton>
            }
          />
        </ArenaShell>
      </>
    )
  }

  const pending = catalogQuery.isPending || homeQuery.isPending
  const failed = !pending && (catalogQuery.isError || homeQuery.isError || !catalog || !profile)
  const earnedCount = catalog ? catalog.badges.filter((b) => b.earned).length : profile?.badges_earned

  const pickSlot = (slot: ArenaSlot) => {
    locker.setSlot(slot)
    if (tab !== 'shop') setTab('shop')
    window.requestAnimationFrame(() => gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }

  return (
    <ArenaShell>
      {header}

      {pending ? (
        <ShowcaseSkeleton />
      ) : failed || !profile ? (
        <ArenaErrorNotice
          error={catalogQuery.error ?? homeQuery.error}
          onRetry={() => {
            void catalogQuery.refetch()
            void homeQuery.refetch()
          }}
        />
      ) : (
        <Showcase ref={showcaseRef} profile={profile} locker={locker} activeSlot={tab === 'shop' ? locker.slot : null} onSlot={pickSlot} />
      )}

      <ArenaTabs
        aria-label="Locker sections"
        className="mb-4 mt-6"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'shop', label: 'Shop', icon: <ShoppingBag /> },
          { value: 'badges', label: 'Badges', icon: <Award />, count: earnedCount ?? undefined },
          { value: 'card', label: 'My card', icon: <IdCard /> },
        ]}
      />

      {tab === 'shop' && profile && !showcaseOnScreen && <TryOnBar profile={profile} locker={locker} />}

      <div role="tabpanel" aria-label={tab} ref={gridRef} className="scroll-mt-20">
        {tab === 'shop' && (pending ? <GridSkeleton /> : catalog && profile ? <ShopGrid profile={profile} locker={locker} /> : null)}

        {tab === 'badges' &&
          (catalogQuery.isPending ? (
            <GridSkeleton />
          ) : catalog ? (
            <BadgesTab badges={catalog.badges} />
          ) : (
            <ArenaErrorNotice error={catalogQuery.error} onRetry={() => void catalogQuery.refetch()} />
          ))}

        {tab === 'card' && (
          <div className="mx-auto max-w-lg">
            <p className="mb-2 text-xs text-muted-foreground">This is how classmates see you when they tap your name.</p>
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <ProfileCardState studentId={user?.id ?? null} totals={totals} />
            </div>
          </div>
        )}
      </div>

      {profile && (
        <>
          <ConfirmBuy
            item={locker.confirming}
            look={profile.look}
            coins={profile.coins}
            loading={locker.buying}
            onCancel={() => !locker.buying && locker.setConfirming(null)}
            onConfirm={locker.confirmBuy}
          />
          <UnlockReveal item={locker.unlocked} look={profile.look} onClose={locker.closeUnlocked} />
        </>
      )}
      {locker.celebration}
    </ArenaShell>
  )
}

function ShowcaseSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(15rem,0.85fr)] lg:gap-5" aria-busy aria-label="Loading">
      <div className="space-y-2.5 lg:py-6">
        <Bone className="h-3 w-20" />
        <Bone className="h-10 w-56 max-w-full" />
        <Bone className="h-4 w-32" />
        <Bone className="h-6 w-24" />
        <Bone className="mt-3 h-3 w-full max-w-sm rounded-full" />
      </div>
      <Bone className="h-72 rounded-2xl lg:h-[23rem]" />
      <Bone className="h-64 rounded-2xl lg:h-[23rem]" />
    </div>
  )
}

function GridSkeleton() {
  return (
    <div className="space-y-3" aria-busy aria-label="Loading">
      <div className="flex gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bone key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Bone key={i} className="h-[7.25rem] rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

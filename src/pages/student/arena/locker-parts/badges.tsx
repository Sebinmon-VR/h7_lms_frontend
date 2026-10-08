import type { ArenaBadge, ArenaRarity } from '@/api/arena.types'
import { parseApiDateTime } from '@/lib/datetime'
import { cn } from '@/lib/cn'
import { Art3D, RARITY_STYLE, SectionTitle, XpBar } from '@/components/arena/arena-theme'
import { BadgeTile } from '@/components/arena/profile-card'

const RARITIES: ArenaRarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY']

/**
 * Every badge: earned ones first, newest first, then the rest greyed with how
 * close I am. Locked badges stay visible — knowing what there is to win is
 * what makes one worth going after. Tap any badge for what it's for.
 */
export function BadgesTab({ badges }: { badges: ArenaBadge[] }) {
  const earned = badges
    .filter((b) => b.earned)
    .sort((a, b) => (parseApiDateTime(b.earned_at)?.getTime() ?? 0) - (parseApiDateTime(a.earned_at)?.getTime() ?? 0))
  const locked = badges.filter((b) => !b.earned).sort((a, b) => closeness(b) - closeness(a))
  const ratio = badges.length > 0 ? earned.length / badges.length : 0

  return (
    <div className="space-y-5">
      {/* One line of progress, no panel. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Art3D name="medal_1" className="size-10" />
        <div className="min-w-[10rem] flex-1">
          <p className="text-sm font-black tabular-nums text-foreground">
            {earned.length} <span className="font-semibold text-muted-foreground">/ {badges.length} badges earned</span>
          </p>
          <XpBar progress={ratio} className="mt-1.5 max-w-md" />
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="By rarity">
          {RARITIES.map((rarity) => {
            const all = badges.filter((b) => b.rarity === rarity)
            if (all.length === 0) return null
            const got = all.filter((b) => b.earned).length
            const r = RARITY_STYLE[rarity]
            return (
              <li key={rarity} className="inline-flex items-center gap-1 text-[11px] tabular-nums">
                <span aria-hidden className={cn('size-1.5 rounded-full', r.dot)} />
                <span className={cn('font-bold', r.text)}>{r.label}</span>
                <span className="text-muted-foreground">
                  {got}/{all.length}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {earned.length > 0 && (
        <section>
          <SectionTitle title="Earned" action={<span className="text-[11px] font-bold tabular-nums text-muted-foreground">{earned.length}</span>} />
          <BadgeGrid badges={earned} />
        </section>
      )}

      {locked.length > 0 && (
        <section>
          <SectionTitle
            title="Up next · closest first"
            action={<span className="text-[11px] font-bold tabular-nums text-muted-foreground">{locked.length}</span>}
          />
          <BadgeGrid badges={locked} />
        </section>
      )}
    </div>
  )
}

function BadgeGrid({ badges }: { badges: ArenaBadge[] }) {
  return (
    <ul className="grid grid-cols-3 gap-2 min-[420px]:grid-cols-4 sm:grid-cols-6 lg:grid-cols-8">
      {badges.map((badge) => (
        <li key={badge.id} className="min-w-0">
          <BadgeTile badge={badge} size="md" className="h-full w-full" />
        </li>
      ))}
    </ul>
  )
}

function closeness(badge: ArenaBadge): number {
  if (!badge.progress || badge.progress.goal <= 0) return -1
  return badge.progress.value / badge.progress.goal
}

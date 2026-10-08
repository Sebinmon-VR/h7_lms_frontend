import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion'
import { Backpack, ChevronLeft, ChevronRight, Lock, Play, Search, Trophy, Users } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PageHeader } from '@/components/layout/page-header'
import { Art3D, ArenaButton, ArenaShell, GameTitle, ResourcePill, TierBadge, XpBar } from '@/components/arena/arena-theme'
import { HeroArt } from '@/components/arena/arena-art'
import { ArenaAvatar } from '@/components/arena/arena-ui'
import { ProfileCardDialog } from '@/components/arena/profile-card'
import { useAcceptInvite, useArenaHome } from '@/queries/arena.queries'
import { useAuth } from '@/providers/auth-provider'
import { cn } from '@/lib/cn'
import { AdminStudentNotice, useIsAdminViewingStudent } from '../student-guard'
import { GAMES, type GameEntry } from './games'

/**
 * The Arena's front door, full screen: the game under the pointer (or the one
 * picked) fills the left with its details and tints the room; the shelf on the
 * right scrolls sideways with the wheel, a drag, the arrows or the keyboard.
 */
export default function ArenaHub() {
  const isAdmin = useIsAdminViewingStudent()
  if (isAdmin) {
    return (
      <>
        <PageHeader title="Games" description="Games students play to learn." />
        <AdminStudentNotice />
      </>
    )
  }
  return <Hub />
}

function Hub() {
  const homeQuery = useArenaHome()
  const home = homeQuery.data
  const { user } = useAuth()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [search, setSearch] = React.useState('')
  const [cardOpen, setCardOpen] = React.useState(false)
  const [selected, setSelected] = React.useState(GAMES[0].id)
  const [preview, setPreview] = React.useState<string | null>(null)

  const needle = search.trim().toLowerCase()
  const games = React.useMemo(
    () => (needle ? GAMES.filter((g) => [g.title, g.genre, ...g.tags].join(' ').toLowerCase().includes(needle)) : GAMES),
    [needle],
  )
  const active = GAMES.find((g) => g.id === (preview ?? selected)) ?? GAMES[0]
  const invite = home?.invites[0]

  return (
    <ArenaShell className="flex min-h-[calc(100svh-7.5rem)] flex-col pb-5">
      {/* The room takes the colour of the game in view. */}
      <AnimatePresence>
        <motion.div
          key={active.id}
          aria-hidden
          className="pointer-events-none absolute -inset-x-6 -inset-y-4 z-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.5 }}
          style={{
            background: `radial-gradient(60% 70% at 18% 55%, ${active.colors[0]}2e, transparent 70%), radial-gradient(50% 60% at 85% 30%, ${active.colors[1]}22, transparent 70%)`,
          }}
        />
      </AnimatePresence>

      <div className="relative z-[1] flex flex-1 flex-col">
      {/* ------------------------------------------------------- top bar */}
      <header className="flex flex-wrap items-center gap-3">
        <GameTitle className="text-2xl sm:text-3xl">Games</GameTitle>
        <div className="order-last w-full sm:order-none sm:ml-2 sm:w-56">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            leading={<Search />}
            aria-label="Search games"
            className="h-9 rounded-full border-transparent bg-card shadow-sm"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {home ? (
            <>
              <ResourcePill art="coin" value={home.profile.coins} label="coins" className="hidden sm:inline-flex" />
              <button
                type="button"
                onClick={() => setCardOpen(true)}
                className="flex items-center gap-2 rounded-full bg-card py-1 pl-1 pr-3 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Open my player card"
              >
                <ArenaAvatar look={home.profile.look} size="xs" />
                <span className="min-w-0 text-left leading-tight">
                  <span className="flex items-center gap-1.5">
                    <span className="max-w-[7rem] truncate text-xs font-black">{home.profile.full_name.split(' ')[0]}</span>
                    <TierBadge level={home.profile.level} size="xs" />
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold tabular-nums text-muted-foreground">Lv {home.profile.level}</span>
                    <XpBar progress={home.profile.progress} className="w-12" />
                  </span>
                </span>
              </button>
            </>
          ) : (
            <Skeleton className="h-10 w-40 rounded-full" />
          )}
          <IconLink to="/student/arena/leaderboard" label="Leaderboard">
            <Trophy className="text-warning" />
          </IconLink>
          <IconLink to="/student/arena/locker" label="Locker">
            <Backpack className="text-primary" />
          </IconLink>
        </div>
      </header>

      {invite ? (
        <InviteBanner invite={invite} more={(home?.invites.length ?? 1) - 1} />
      ) : home?.active_match_id ? (
        <Link
          to={`/student/arena/battle/${home.active_match_id}`}
          className="mt-3 flex items-center gap-2.5 rounded-full border border-primary/40 bg-primary/10 py-1.5 pl-3 pr-2 text-xs font-bold transition-colors hover:bg-primary/15 sm:w-fit"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          You’re in a battle
          <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-primary px-2.5 py-1 text-primary-foreground">
            Rejoin <ChevronRight className="size-3.5" />
          </span>
        </Link>
      ) : null}

      {/* -------------------------------------------- details | the shelf */}
      <div className="mt-4 grid flex-1 items-center gap-4 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] lg:gap-8">
        <GameDetails game={active} onPlay={() => active.to && navigate(active.to)} />
        <GameShelf
          games={games}
          selected={selected}
          onSelect={setSelected}
          onPreview={setPreview}
          onPlay={(g) => g.to && navigate(g.to)}
        />
      </div>

      </div>
      {user && <ProfileCardDialog studentId={cardOpen ? user.id : null} onClose={() => setCardOpen(false)} />}
    </ArenaShell>
  )
}

function IconLink({ to, label, children }: { to: string; label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ArenaButton asChild variant="secondary" size="icon" className="rounded-full">
          <Link to={to} aria-label={label}>
            {children}
          </Link>
        </ArenaButton>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

// ------------------------------------------------------------- the details

function GameDetails({ game, onPlay }: { game: GameEntry; onPlay: () => void }) {
  const reduce = useReducedMotion()
  const playable = !!game.to
  return (
    <div className="relative min-h-[11rem] lg:min-h-[20rem]" aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.div
          key={game.id}
          initial={reduce ? false : { opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? undefined : { opacity: 0, x: 12 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-white"
              style={{ background: game.colors[0] }}
            >
              {game.genre}
            </span>
            {playable ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-success">
                <span className="size-1.5 rounded-full bg-success" /> Live now
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                <Lock className="size-3" /> Coming soon
              </span>
            )}
          </div>
          <GameTitle className="text-4xl sm:text-5xl">{game.title}</GameTitle>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{game.blurb}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-xs font-bold">
              <Users className="size-3.5 text-muted-foreground" /> {game.players}
            </span>
            {game.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-foreground/[0.06] px-2.5 py-1 text-xs font-bold text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
          <div className="mt-1">
            {playable ? (
              <ArenaButton variant="gold" size="lg" className="w-full sm:w-56" onClick={onPlay}>
                <Play className="fill-current" /> Play
              </ArenaButton>
            ) : (
              <ArenaButton variant="secondary" size="lg" className="w-full sm:w-56" disabled>
                <Lock /> Coming soon
              </ArenaButton>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// --------------------------------------------------------------- the shelf

function GameShelf({
  games,
  selected,
  onSelect,
  onPreview,
  onPlay,
}: {
  games: GameEntry[]
  selected: string
  onSelect: (id: string) => void
  onPreview: (id: string | null) => void
  onPlay: (game: GameEntry) => void
}) {
  const scroller = React.useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const [edges, setEdges] = React.useState({ start: true, end: false })
  const smooth = useSmoothShelf(scroller, !!reduce)
  const drag = React.useRef<{ x: number; left: number; moved: boolean; lastX: number; lastT: number; v: number } | null>(null)
  const dragged = React.useRef(false)

  const update = React.useCallback(() => {
    const el = scroller.current
    if (!el) return
    const start = el.scrollLeft < 8
    const end = el.scrollLeft + el.clientWidth > el.scrollWidth - 8
    // Called every frame of a glide; only a real change may re-render the shelf.
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])

  // Hovering previews a game in the details panel, but only once the pointer
  // rests on a card: cards sliding under a still pointer, or a drag across
  // them, must not flick the panel from game to game.
  const previewTimer = React.useRef<ReturnType<typeof setTimeout>>()
  const hoverCard = React.useCallback(
    (id: string | null) => {
      clearTimeout(previewTimer.current)
      if (id === null) return onPreview(null)
      previewTimer.current = setTimeout(() => {
        if (!smooth.moving() && !drag.current?.moved) onPreview(id)
      }, 140)
    },
    [onPreview, smooth],
  )
  React.useEffect(() => () => clearTimeout(previewTimer.current), [])

  React.useEffect(() => {
    update()
    const el = scroller.current
    if (!el) return
    // A vertical wheel glides the shelf sideways, until it reaches an end.
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      const atStart = smooth.target() <= 0 && delta < 0
      const atEnd = smooth.target() >= el.scrollWidth - el.clientWidth - 1 && delta > 0
      if (atStart || atEnd) return
      e.preventDefault()
      clearTimeout(previewTimer.current)
      smooth.by(delta * (e.deltaMode === 1 ? 32 : 1.1))
    }
    el.addEventListener('scroll', update, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', update)
    }
  }, [update, smooth, games.length])

  const page = (dir: 1 | -1) => {
    const el = scroller.current
    if (el) smooth.by(dir * Math.max(260, el.clientWidth * 0.7))
  }

  if (games.length === 0) {
    return <p className="py-24 text-center text-sm text-muted-foreground">No game matches that search.</p>
  }

  return (
    <section aria-label="Games" className="relative min-w-0">
      <div
        ref={scroller}
        className={cn(
          // Touch keeps native momentum and snapping; a mouse gets the eased glide below.
          'no-scrollbar -mx-3 flex snap-x snap-mandatory scroll-px-6 gap-5 overflow-x-auto px-6 pb-6 pt-28 sm:gap-6 lg:mx-0 [@media(pointer:fine)]:snap-none',
          'cursor-grab active:cursor-grabbing',
        )}
        style={{
          maskImage: 'linear-gradient(90deg, transparent, black 28px, black calc(100% - 28px), transparent)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, black 28px, black calc(100% - 28px), transparent)',
        }}
        // Drag to scroll with a mouse; a drag never counts as a click.
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse' || !scroller.current) return
          drag.current = { x: e.clientX, left: smooth.target(), moved: false, lastX: e.clientX, lastT: e.timeStamp, v: 0 }
          dragged.current = false
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const dx = e.clientX - d.x
          if (Math.abs(dx) > 5 && !d.moved) {
            d.moved = true
            dragged.current = true
            hoverCard(null)
            scroller.current?.setPointerCapture(e.pointerId)
          }
          if (!d.moved) return
          const dt = Math.max(1, e.timeStamp - d.lastT)
          d.v = 0.8 * ((d.lastX - e.clientX) / dt) + 0.2 * d.v
          d.lastX = e.clientX
          d.lastT = e.timeStamp
          // The shelf trails the pointer a little: the "delayed" feel.
          smooth.to(d.left - dx, { settle: false })
        }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          if (scroller.current?.hasPointerCapture(e.pointerId)) scroller.current.releasePointerCapture(e.pointerId)
          // A fling keeps coasting, then settles on a card.
          if (d?.moved) smooth.by(d.v * 260)
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
        onPointerLeave={() => {
          if (!drag.current) hoverCard(null)
        }}
        onKeyDown={(e) => {
          const i = games.findIndex((g) => g.id === selected)
          if (e.key === 'ArrowRight' && i < games.length - 1) onSelect(games[i + 1].id)
          if (e.key === 'ArrowLeft' && i > 0) onSelect(games[i - 1].id)
        }}
      >
        {games.map((game, index) => (
          <GameCard
            key={game.id}
            game={game}
            index={index}
            selected={game.id === selected}
            onHover={(on) => hoverCard(on ? game.id : null)}
            shelfMoving={() => smooth.moving() || !!drag.current?.moved}
            onClick={() => {
              if (dragged.current) return
              if (game.id === selected && game.to) onPlay(game)
              else onSelect(game.id)
            }}
          />
        ))}
      </div>

      <div className="flex items-center justify-end gap-1.5 pr-1">
        <button
          type="button"
          onClick={() => page(-1)}
          disabled={edges.start}
          aria-label="Scroll games left"
          className="flex size-9 items-center justify-center rounded-full bg-card shadow-sm transition-shadow hover:shadow-md disabled:opacity-35"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => page(1)}
          disabled={edges.end}
          aria-label="Scroll games right"
          className="flex size-9 items-center justify-center rounded-full bg-card shadow-sm transition-shadow hover:shadow-md disabled:opacity-35"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </section>
  )
}

/**
 * Eased, slightly delayed scrolling for a horizontal shelf. Every input moves
 * a target; each frame the shelf closes 10% of the gap, so motion starts at
 * once but arrives softly. When input stops it settles on the nearest card.
 * The current speed is published as --shelf-v for the cards to lean with.
 */
function useSmoothShelf(ref: React.RefObject<HTMLDivElement>, instant: boolean) {
  const state = React.useRef({ target: 0, current: 0, frame: 0, settle: 0 as number | ReturnType<typeof setTimeout> })

  return React.useMemo(() => {
    const max = (el: HTMLDivElement) => Math.max(0, el.scrollWidth - el.clientWidth)
    const clamp = (el: HTMLDivElement, x: number) => Math.min(max(el), Math.max(0, x))

    const tick = () => {
      const el = ref.current
      const s = state.current
      if (!el) return
      const gap = s.target - s.current
      s.current += gap * 0.1
      el.scrollLeft = s.current
      el.style.setProperty('--shelf-v', String(Math.max(-9, Math.min(9, gap * 0.035))))
      if (Math.abs(gap) > 0.5) {
        s.frame = requestAnimationFrame(tick)
      } else {
        s.current = s.target
        el.scrollLeft = s.target
        el.style.setProperty('--shelf-v', '0')
        s.frame = 0
      }
    }

    const nearestCard = (el: HTMLDivElement, x: number) => {
      const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0
      let best = x
      let distance = Infinity
      for (const child of Array.from(el.children) as HTMLElement[]) {
        const stop = clamp(el, child.offsetLeft - pad)
        if (Math.abs(stop - x) < distance) {
          distance = Math.abs(stop - x)
          best = stop
        }
      }
      return best
    }

    const to = (x: number, opts: { settle?: boolean } = {}) => {
      const el = ref.current
      if (!el) return
      const s = state.current
      // Pick up wherever native scrolling (touch, keyboard) left the shelf.
      if (!s.frame) s.current = el.scrollLeft
      s.target = clamp(el, x)
      if (instant) {
        s.current = s.target
        el.scrollLeft = s.target
      } else if (!s.frame) {
        s.frame = requestAnimationFrame(tick)
      }
      clearTimeout(s.settle as ReturnType<typeof setTimeout>)
      if (opts.settle !== false) {
        s.settle = setTimeout(() => {
          const e = ref.current
          if (!e) return
          const snapped = nearestCard(e, s.target)
          if (Math.abs(snapped - s.target) > 1) to(snapped, { settle: false })
        }, 160)
      }
    }

    return {
      to,
      by: (dx: number) => {
        const el = ref.current
        if (!el) return
        const s = state.current
        to((s.frame ? s.target : el.scrollLeft) + dx)
      },
      target: () => {
        const el = ref.current
        const s = state.current
        return s.frame ? s.target : el?.scrollLeft ?? 0
      },
      moving: () => state.current.frame !== 0,
    }
  }, [ref, instant])
}

// ---------------------------------------------------------------- a card

function GameCard({
  game,
  index,
  selected,
  onHover,
  onClick,
  shelfMoving,
}: {
  game: GameEntry
  index: number
  selected: boolean
  onHover: (on: boolean) => void
  onClick: () => void
  /** True while the shelf glides or is dragged: hover effects wait until it stops. */
  shelfMoving: () => boolean
}) {
  const reduce = useReducedMotion()
  const playable = !!game.to
  const [top, bottom] = game.colors

  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const rotateY = useSpring(useTransform(px, [0, 1], [-12, 12]), { stiffness: 220, damping: 18 })
  const rotateX = useSpring(useTransform(py, [0, 1], [10, -10]), { stiffness: 220, damping: 18 })
  const sheenX = useTransform(px, [0, 1], ['0%', '100%'])
  const sheenY = useTransform(py, [0, 1], ['0%', '100%'])
  const sheen = useMotionTemplate`radial-gradient(60% 50% at ${sheenX} ${sheenY}, rgba(255,255,255,0.35), transparent 70%)`
  const [hover, setHover] = React.useState(false)
  const lift = hover && !reduce

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 40, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: selected ? 1 : 0.95 }}
      transition={{ type: 'spring', stiffness: 240, damping: 24, delay: reduce ? 0 : Math.min(index, 6) * 0.06 }}
      className="w-[14rem] shrink-0 snap-start sm:w-[15.5rem]"
      style={{ perspective: 900 }}
    >
      {/* Leans with the shelf's speed (--shelf-v, set by the glide) and straightens as it stops. */}
      <div
        className="transition-transform duration-300 ease-out [transform-style:preserve-3d]"
        style={{ transform: 'rotateY(calc(var(--shelf-v, 0) * -1deg)) skewX(calc(var(--shelf-v, 0) * 0.25deg))' }}
      >
      <motion.button
        type="button"
        onClick={onClick}
        onPointerMove={(e) => {
          if (reduce || e.pointerType !== 'mouse') return
          if (shelfMoving()) return
          // The pointer has come to rest on a card the shelf slid under it.
          if (!hover) {
            setHover(true)
            onHover(true)
          }
          const r = e.currentTarget.getBoundingClientRect()
          px.set((e.clientX - r.left) / r.width)
          py.set((e.clientY - r.top) / r.height)
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse' && shelfMoving()) return
          setHover(true)
          onHover(true)
        }}
        onPointerLeave={() => {
          px.set(0.5)
          py.set(0.5)
          setHover(false)
          onHover(false)
        }}
        onFocus={() => onHover(true)}
        onBlur={() => onHover(false)}
        aria-label={playable ? `${game.title}: ${selected ? 'play' : 'select'}` : `${game.title}, coming soon`}
        aria-pressed={selected}
        className="group relative block h-[18.5rem] w-full rounded-[2rem] text-left text-white outline-none focus-visible:ring-4 focus-visible:ring-ring sm:h-[21rem]"
        style={{ rotateX: reduce ? 0 : rotateX, rotateY: reduce ? 0 : rotateY, transformStyle: 'preserve-3d' }}
      >
        {/* Face */}
        <span
          className={cn(
            'absolute inset-0 overflow-hidden rounded-[2rem] shadow-[0_24px_40px_-18px_rgba(0,0,0,0.6)] transition-shadow duration-300',
            selected && 'shadow-[0_34px_60px_-16px_rgba(0,0,0,0.75)]',
          )}
          style={{ background: `linear-gradient(165deg, ${top}, ${bottom})` }}
        >
          <span aria-hidden className="absolute inset-0 bg-[radial-gradient(80%_55%_at_50%_18%,rgba(255,255,255,0.32),transparent_70%)]" />
          <span aria-hidden className="absolute -right-10 -top-10 size-40 rounded-full border-[18px] border-white/10" />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/60 to-transparent" />
          {!reduce && (
            <motion.span aria-hidden className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: sheen }} />
          )}
        </span>

        {/* Art lifted off the face */}
        <span className="pointer-events-none absolute inset-x-0 -top-16 flex h-56 justify-center sm:h-64" style={{ transform: 'translateZ(50px)' }}>
          <motion.span
            aria-hidden
            className="absolute top-10 size-36 rounded-full bg-white/40 blur-2xl sm:size-44"
            animate={reduce ? undefined : { scale: lift ? 1.2 : [1, 1.08, 1], opacity: lift ? 0.8 : [0.45, 0.6, 0.45] }}
            transition={lift ? { duration: 0.3 } : { duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          {(game.heroes?.[1] || game.sideArt) && (
            <motion.span
              className="absolute right-0 top-6 sm:right-1"
              animate={reduce ? undefined : { y: [0, -10, 0], rotate: [10, 20, 10], x: lift ? 6 : 0 }}
              transition={{ duration: 4 + (index % 3), repeat: Infinity, ease: 'easeInOut' }}
            >
              {game.heroes?.[1] ? (
                <HeroArt avatar={{ character: game.heroes[1] }} className="h-24 w-[4.5rem] sm:h-28 sm:w-20" />
              ) : (
                <Art3D name={game.sideArt!} className={cn('size-16 sm:size-20', !playable && 'saturate-[0.7]')} />
              )}
            </motion.span>
          )}
          <motion.span
            className="relative"
            animate={reduce ? undefined : lift ? { y: -14, scale: 1.1, rotate: -4 } : { y: [0, -8, 0], scale: 1, rotate: 0 }}
            transition={lift ? { type: 'spring', stiffness: 300, damping: 15 } : { duration: 3 + (index % 4) * 0.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            {game.heroes ? (
              <HeroArt avatar={{ character: game.heroes[0] }} className="h-52 w-40 sm:h-60 sm:w-44" />
            ) : (
              <Art3D name={game.art} className={cn('size-44 sm:size-52', !playable && 'saturate-[0.7]')} />
            )}
          </motion.span>
          {!reduce && <Sparkles active={selected || hover} />}
        </span>

        <span
          className="absolute left-3.5 top-3.5 inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider backdrop-blur-sm"
          style={{ transform: 'translateZ(30px)' }}
        >
          {playable ? (
            <>
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-300" />
              </span>
              Live
            </>
          ) : (
            <>
              <Lock className="size-3" /> Soon
            </>
          )}
        </span>

        {/* Title; on hover the blurb slides up under it */}
        <span className="absolute inset-x-4 bottom-4" style={{ transform: 'translateZ(40px)' }}>
          <span className="flex items-end justify-between gap-2">
            <span className="min-w-0">
              <span className="block text-[1.35rem] font-black leading-tight drop-shadow-md sm:text-2xl">{game.title}</span>
              <span className="mt-0.5 block text-xs font-bold text-yellow-300">{game.genre}</span>
            </span>
            {playable && (
              <motion.span
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-lg"
                animate={reduce || !selected ? undefined : { scale: [1, 1.08, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Play className="ml-0.5 size-5 fill-current" />
              </motion.span>
            )}
          </span>
          <span
            className={cn(
              'grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out',
              hover ? 'mt-2 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
            )}
          >
            <span className="overflow-hidden">
              <span className="line-clamp-3 text-xs leading-snug text-white/90">{game.blurb}</span>
              <span className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-white/80">
                <Users className="size-3" /> {game.players}
              </span>
            </span>
          </span>
        </span>
      </motion.button>
      </div>
    </motion.div>
  )
}

function Sparkles({ active }: { active: boolean }) {
  const stars = [
    { left: '12%', top: '30%', size: 12, delay: 0 },
    { left: '82%', top: '62%', size: 9, delay: 0.6 },
    { left: '20%', top: '72%', size: 8, delay: 1.1 },
    { left: '70%', top: '18%', size: 10, delay: 1.6 },
  ]
  return (
    <>
      {stars.map((s, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]"
          style={{ left: s.left, top: s.top, fontSize: s.size }}
          animate={active ? { opacity: [0, 1, 0], scale: [0.4, 1.2, 0.4], rotate: [0, 90, 180] } : { opacity: 0 }}
          transition={{ duration: 2.2, repeat: Infinity, delay: s.delay, ease: 'easeInOut' }}
        >
          ✦
        </motion.span>
      ))}
    </>
  )
}

type Invite = NonNullable<ReturnType<typeof useArenaHome>['data']>['invites'][number]

function InviteBanner({ invite, more }: { invite: Invite; more: number }) {
  const navigate = useNavigate()
  const accept = useAcceptInvite()
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 flex items-center gap-2.5 rounded-full border border-warning/50 bg-warning/10 py-1 pl-1 pr-1.5 sm:w-fit"
    >
      <ArenaAvatar look={invite.from.look} size="xs" />
      <span className="min-w-0 flex-1 truncate text-xs">
        <span className="font-black">{invite.from.full_name.split(' ')[0]}</span>
        <span className="text-muted-foreground"> challenged you{more > 0 ? ` · +${more} more` : ''}</span>
      </span>
      <ArenaButton
        size="sm"
        variant="gold"
        className="rounded-full"
        loading={accept.isPending}
        onClick={() => accept.mutate(invite.id, { onSuccess: (view) => navigate(`/student/arena/battle/${view.id}`) })}
      >
        Accept
      </ArenaButton>
      <ArenaButton asChild size="sm" variant="ghost" className="rounded-full">
        <Link to="/student/arena/quiz">View</Link>
      </ArenaButton>
    </motion.div>
  )
}

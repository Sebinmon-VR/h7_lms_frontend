import { Backpack, ChevronLeft, DoorOpen, History, Play, RotateCcw, Swords, Trophy, Users } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'

import type { ArenaHome, ArenaInvite } from '@/api/arena.types'
import {
  ArenaButton,
  ArenaEmpty,
  ArenaShell,
  RARITY_STYLE,
  ResourcePill,
  Stage,
  TierBadge,
  XpBar,
} from '@/components/arena/arena-theme'
import { ArenaAvatar, gradient } from '@/components/arena/arena-ui'
import { ProfileCardDialog } from '@/components/arena/profile-card'
import { PageHeader } from '@/components/layout/page-header'
import { unlockArenaAudio, useArenaAudioUnlock } from '@/lib/arena-sound'
import { cn } from '@/lib/cn'
import { useAcceptInvite, useArenaHome, useDeclineInvite } from '@/queries/arena.queries'
import { AdminStudentNotice, useIsAdminViewingStudent } from '../student-guard'
import { useArenaPaths } from './arena-paths'
import { BattleSettingsDialog, ModePill, RoomDialog, useBattleSetup } from './components/battle-builder'
import { ClassmatesDialog } from './components/classmates-dialog'
import { ArenaConfirm, ArenaSkeleton, busyMatchId, errorMessage, MuteToggle } from './components/helpers'
import { InviteBanner, RejoinBanner } from './components/invite-cards'
import { QuickMatchDialog } from './components/quick-match-dialog'
import { HistoryDialog } from './components/recent-battles'
import { HeroArt } from '@/components/arena/arena-art'

/**
 * Quiz Battle lobby, built like a game's main menu: one stage with your
 * character, a side menu, the mode pill and a big PLAY. Everything else
 * (settings, friends, rooms, history) opens in a dialog. Polls every few
 * seconds so a classmate's challenge turns up without a refresh.
 */
export default function ArenaHomePage() {
  const isAdmin = useIsAdminViewingStudent()
  const homeQuery = useArenaHome(!isAdmin)
  useArenaAudioUnlock()

  if (isAdmin) {
    return (
      <>
        <PageHeader title="Quiz Battle" description="Quiz battles for students." />
        <AdminStudentNotice />
      </>
    )
  }

  if (homeQuery.isPending) {
    return (
      <Frame>
        <Stage>
          <div className="flex min-h-[70svh] flex-col p-3 sm:min-h-[480px] sm:p-4 lg:min-h-[540px]" aria-busy>
            <div className="flex items-center gap-2">
              <ArenaSkeleton className="size-9" />
              <ArenaSkeleton className="h-11 w-36 rounded-full" />
              <ArenaSkeleton className="ml-auto h-8 w-24 rounded-full" />
            </div>
            <div className="flex flex-1 items-center justify-center">
              <ArenaSkeleton className="size-48 rounded-full sm:size-60" />
            </div>
            <div className="flex flex-col items-center gap-2.5">
              <ArenaSkeleton className="h-11 w-64 rounded-full" />
              <ArenaSkeleton className="h-14 w-64" />
            </div>
          </div>
        </Stage>
      </Frame>
    )
  }

  if (homeQuery.isError) {
    return (
      <Frame>
        <ArenaEmpty
          art="joystick"
          title="The arena didn't load"
          description={errorMessage(homeQuery.error)}
          action={
            <ArenaButton size="sm" onClick={() => homeQuery.refetch()}>
              <RotateCcw />
              Try again
            </ArenaButton>
          }
        />
      </Frame>
    )
  }

  return <Lobby home={homeQuery.data} />
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1100px]">
      <ArenaShell className="px-2 py-2 sm:px-3 sm:py-3">{children}</ArenaShell>
    </div>
  )
}

type MenuDialog = 'settings' | 'room' | 'history' | null

function Lobby({ home }: { home: ArenaHome }) {
  const navigate = useNavigate()
  const accept = useAcceptInvite()
  const decline = useDeclineInvite()
  const [busyId, setBusyId] = React.useState<number | null>(null)
  const [accepting, setAccepting] = React.useState<number | null>(null)
  const [declining, setDeclining] = React.useState<number | null>(null)
  const [menu, setMenu] = React.useState<MenuDialog>(null)
  const [profileOpen, setProfileOpen] = React.useState(false)
  const setup = useBattleSetup(home, setBusyId)
  const paths = useArenaPaths()
  // Online tuition plays the bot only: no friends, rooms, quick match or ranks.
  const solo = paths.tuition

  const p = home.profile
  const activeId = home.active_match_id ?? p.active_match_id
  const go = (id: number) => navigate(paths.battle(id))

  const onAccept = (invite: ArenaInvite) => {
    unlockArenaAudio()
    setAccepting(invite.id)
    accept.mutate(invite.id, {
      onSuccess: (view) => go(view.id),
      onError: (error) => {
        const busy = busyMatchId(error)
        if (busy != null) setBusyId(busy)
      },
      onSettled: () => setAccepting(null),
    })
  }

  const onDecline = (invite: ArenaInvite) => {
    setDeclining(invite.id)
    decline.mutate(invite.id, { onSettled: () => setDeclining(null) })
  }

  /** PLAY: launch with the current settings, or open them when nothing is playable yet. */
  const onPlay = () => {
    if (setup.ready) setup.launch()
    else setMenu('settings')
  }

  const friendsBlocked = !home.class
    ? 'Join a class to challenge classmates. Quick match and rooms work meanwhile.'
    : !setup.ready
      ? 'Pick questions in battle settings first: there is nothing to battle on yet.'
      : null

  return (
    <Frame>
      <h1 className="sr-only">Quiz Battle</h1>
      <Stage>
        <div className="relative flex min-h-[70svh] flex-col p-3 sm:min-h-[480px] sm:p-4 lg:min-h-[540px]">
          {/* ---------------------------------------------------- top bar */}
          <header className="relative z-10 flex items-center gap-1.5 sm:gap-2">
            <ArenaButton asChild variant="secondary" size="icon" className="size-9 shrink-0">
              <Link to={paths.shelf} aria-label="Back to games">
                <ChevronLeft />
              </Link>
            </ArenaButton>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="flex h-11 min-w-0 items-center gap-2 rounded-full border border-border bg-card/90 py-1 pl-1 pr-3 text-left shadow-sm backdrop-blur transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${p.full_name}, level ${p.level}. Open your player card`}
            >
              <ArenaAvatar look={p.look} size="xs" />
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="hidden max-w-[10rem] truncate text-sm font-black text-foreground sm:block">{p.full_name}</span>
                  <span className="shrink-0 text-xs font-black tabular-nums text-primary">Lv {p.level}</span>
                  <TierBadge level={p.level} size="xs" className="hidden min-[400px]:inline-flex" />
                </span>
                <XpBar progress={p.progress} className="mt-1 w-16 sm:w-32" />
              </span>
            </button>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <ResourcePill art="coin" value={p.coins} label="coins" />
              <ResourcePill art="star" value={`Lv ${p.level}`} label="level" className="hidden md:inline-flex" />
              <MuteToggle className="size-9 bg-card/70" />
            </div>
          </header>

          {/* ---------------------------------------------------- banners */}
          {(activeId != null || home.invites.length > 0) && (
            <div className="relative z-20 mt-3 space-y-2">
              {activeId != null && <RejoinBanner onRejoin={() => go(activeId)} />}
              <InviteBanner
                invites={home.invites}
                onAccept={onAccept}
                onDecline={onDecline}
                acceptingId={accepting}
                decliningId={declining}
              />
            </div>
          )}

          {/* ------------------------------------------- hero + side menus */}
          <div className="relative flex flex-1 items-center justify-center py-4">
            <nav aria-label="Lobby menu" className="absolute left-0 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-3">
              {!solo && (
                <>
                  <SideButton label="Friends" tone="accent" onClick={() => setup.setClassmatesOpen(true)}>
                    <Users />
                  </SideButton>
                  <SideButton label="Room" tone="success" onClick={() => setMenu('room')}>
                    <DoorOpen />
                  </SideButton>
                </>
              )}
              <SideButton label="History" tone="info" onClick={() => setMenu('history')}>
                <History />
              </SideButton>
            </nav>

            <Hero home={home} />

            <nav aria-label="Progress" className="absolute right-0 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-3">
              {paths.leaderboard && (
                <SideButton label="Ranks" tone="warning" to={paths.leaderboard}>
                  <Trophy />
                </SideButton>
              )}
              <SideButton label="Locker" tone="primary" to={paths.locker}>
                <Backpack />
              </SideButton>
            </nav>
          </div>

          {/* ------------------------------------------------ mode + PLAY */}
          <div className="relative z-10 flex flex-col items-center gap-3">
            <ModePill setup={setup} onOpen={() => setMenu('settings')} />
            <ArenaButton
              variant="gold"
              size="lg"
              className="h-14 w-full max-w-[16rem] text-xl font-black tracking-wider"
              loading={setup.busy}
              onClick={onPlay}
            >
              {!setup.busy && <Play className="fill-current" />}
              Play
            </ArenaButton>
            {!setup.ready && (
              <p className="-mt-1 text-center text-[11px] font-semibold text-muted-foreground">Pick something to battle on first</p>
            )}
          </div>
        </div>
      </Stage>

      {/* ------------------------------------------------------- dialogs */}
      <BattleSettingsDialog setup={setup} open={menu === 'settings'} onOpenChange={(o) => setMenu(o ? 'settings' : null)} />
      {!solo && <RoomDialog setup={setup} open={menu === 'room'} onOpenChange={(o) => setMenu(o ? 'room' : null)} />}
      <HistoryDialog recent={home.recent} open={menu === 'history'} onOpenChange={(o) => setMenu(o ? 'history' : null)} />
      {!solo && (
      <ClassmatesDialog
        open={setup.classmatesOpen}
        onOpenChange={setup.setClassmatesOpen}
        battleTitle={setup.title}
        sending={setup.creating}
        blockedReason={friendsBlocked}
        onSend={(ids) => setup.challengeClassmates(ids, () => setup.setClassmatesOpen(false))}
      />
      )}
      {!solo && (
      <QuickMatchDialog
        request={setup.queueRequest}
        title={setup.title}
        look={p.look}
        onClose={() => setup.setQueueRequest(null)}
        onMatched={(id) => {
          setup.setQueueRequest(null)
          setup.go(id)
        }}
        botLoading={setup.creating}
        onPlayBot={setup.playBotInstead}
      />
      )}
      <ProfileCardDialog studentId={profileOpen ? p.student_id : null} onClose={() => setProfileOpen(false)} />
      <ArenaConfirm
        open={busyId != null}
        onOpenChange={(open) => !open && setBusyId(null)}
        icon={<Swords />}
        title="You're already in a battle"
        description="Finish or leave that one first, or jump straight back in."
        confirmLabel="Rejoin battle"
        cancelLabel="Not now"
        onConfirm={() => {
          if (busyId != null) go(busyId)
          setBusyId(null)
        }}
      />
    </Frame>
  )
}

// ------------------------------------------------------------------ pieces

const SIDE_TONE = {
  primary: 'bg-primary text-primary-foreground shadow-[0_3px_0_0_hsl(var(--primary)/0.5)]',
  accent: 'bg-accent text-accent-foreground shadow-[0_3px_0_0_hsl(var(--accent)/0.5)]',
  success: 'bg-success text-success-foreground shadow-[0_3px_0_0_hsl(var(--success)/0.5)]',
  info: 'bg-info text-info-foreground shadow-[0_3px_0_0_hsl(var(--info)/0.5)]',
  warning: 'bg-warning text-warning-foreground shadow-[0_3px_0_0_hsl(var(--warning)/0.6)]',
} as const

/** A round game-menu button with a tiny label under it. */
function SideButton({
  label,
  tone,
  onClick,
  to,
  children,
}: {
  label: string
  tone: keyof typeof SIDE_TONE
  onClick?: () => void
  to?: string
  children: React.ReactNode
}) {
  const inner = (
    <>
      <span
        className={cn(
          'flex size-11 items-center justify-center rounded-2xl ring-2 ring-card/70 transition-transform duration-100 group-hover:-translate-y-0.5 group-active:translate-y-[2px] sm:size-12 [&_svg]:size-5',
          SIDE_TONE[tone],
        )}
      >
        {children}
      </span>
      <span className="rounded-md bg-card/80 px-1 text-[10px] font-black uppercase tracking-wider text-foreground">{label}</span>
    </>
  )
  const cls = 'group flex w-14 flex-col items-center gap-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}

/** The player's character on the spotlight, with a frame-coloured glow and the title plate. */
function Hero({ home }: { home: ArenaHome }) {
  const paths = useArenaPaths()
  const look = home.profile.look
  const title = look.title?.text
  const rarity = RARITY_STYLE[look.title?.rarity ?? 'COMMON']
  return (
    <div className="relative flex flex-col items-center">
      <div
        aria-hidden
        className="absolute left-1/2 top-[45%] size-48 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-55 blur-3xl sm:size-72"
        style={{ background: gradient(look.frame?.colors) }}
      />
      <div
        aria-hidden
        className="absolute bottom-7 left-1/2 h-9 w-44 -translate-x-1/2 rounded-[50%] border-2 border-primary/35 bg-primary/15 sm:bottom-8 sm:w-60"
        style={{ boxShadow: '0 0 30px hsl(var(--primary) / 0.35)' }}
      />
      <Link
        to={paths.locker}
        aria-label="Change your look in the locker"
        className="relative rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
      >
        <HeroArt avatar={look.avatar} className="h-56 w-44 text-[8rem] sm:h-80 sm:w-64 sm:text-[11rem]" float />
      </Link>
      <span
        className={cn(
          'relative mt-1 max-w-[14rem] truncate rounded-lg border-2 bg-card px-3 py-1 text-xs font-black uppercase italic tracking-wider shadow-sm',
          title ? cn(rarity.text, rarity.border) : 'border-border text-foreground',
        )}
      >
        {title ?? home.profile.full_name}
      </span>
    </div>
  )
}

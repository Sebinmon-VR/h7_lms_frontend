import * as React from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Where the games live. The school plays under /student/arena; online tuition
 * reuses the same screens under /tuition/student/games, so the tuition menu
 * stays up, with the solo half only: the bot, the lab and the locker. A
 * tuition student has no class, so nothing that plays or ranks against other
 * students (friends, rooms, quick match, leaderboards) is offered there; the
 * backend refuses it too.
 *
 * Read from the URL, like the sidebar's `programForPath`, so every screen and
 * component deep inside a battle links back to the shelf it came from.
 */
export interface ArenaPaths {
  tuition: boolean
  shelf: string
  quiz: string
  lab: string
  locker: string
  /** School only. */
  leaderboard: string | null
  battle: (matchId: number) => string
}

export function arenaPaths(tuition: boolean): ArenaPaths {
  const shelf = tuition ? '/tuition/student/games' : '/student/arena'
  return {
    tuition,
    shelf,
    quiz: `${shelf}/quiz`,
    lab: `${shelf}/lab`,
    locker: `${shelf}/locker`,
    leaderboard: tuition ? null : `${shelf}/leaderboard`,
    battle: (matchId) => `${shelf}/battle/${matchId}`,
  }
}

export function useArenaPaths(): ArenaPaths {
  const tuition = useLocation().pathname.startsWith('/tuition/')
  return React.useMemo(() => arenaPaths(tuition), [tuition])
}

/**
 * How the sound coming in has been over the last ten seconds, from the call's readings
 * (one a second).
 *
 * One second on its own says little. A phone's line drops a couple of packets in a second
 * all the time and nobody hears it, because the call patches small gaps. Judged a second at
 * a time (the first version of this), nearly every student came out "breaking up" every
 * minute of the school day (16-18 Nov). That made the office's records meaningless and set
 * the video pausing off on blips.
 *
 * ACS's own warning is the opposite: it waits until, over five seconds, nearly a fifth of
 * the sound had to be patched over, and by then a class has been hearing it for a while.
 * This sits between the two:
 *
 *  - It judges ten seconds at a time, on how much of the sound had to be made up ("patched")
 *    because it arrived too late or not at all. That is what a listener hears as a choppy,
 *    robotic voice.
 *  - Lost packets count only when there were enough of them to judge. A quiet stretch sends
 *    few packets, and one lost out of five would read as 20%.
 *
 * Kept apart from the call so it can be tested on its own.
 */

export type Health = 'Good' | 'Poor' | 'Bad'

/** One reading of the sound arriving: packets received and lost that second, the share patched over. */
export interface SoundSecond {
  got: number
  lost: number
  /** 0-1: the share of that second's sound the call had to make up. */
  patched: number
  jitterMs: number
  rttMs?: number
}

export interface SoundReading {
  health: Health
  /** 0-1, over the window. */
  loss: number
  patched: number
  jitterMs: number
  rttMs?: number
}

export const WINDOW_SECONDS = 10
/** Fewer readings than this (just joined, or the tab was in the background) and it does not judge. */
export const MIN_SECONDS = 5
/** Fewer packets than this in the window and lost packets are not judged (see above). */
export const MIN_PACKETS = 100

/** About a second of sound in every ten made up: choppy. */
export const POOR = { patched: 0.08, loss: 0.1 }
/** A fifth of it made up: words are lost. */
export const BAD = { patched: 0.2, loss: 0.25 }

/** One second's reading from the call's own numbers; null when no sound arrived that second. */
export function soundSecond(
  receive: ReadonlyArray<{
    packetsPerSecond?: number
    packetsLostPerSecond?: number
    healedRatio?: number
    jitterInMs?: number
    rttInMs?: number
  }>,
): SoundSecond | null {
  let got = 0
  let lost = 0
  let patched = 0
  let jitterMs = 0
  let rttMs: number | undefined
  for (const s of receive) {
    got += Math.max(0, s.packetsPerSecond ?? 0)
    lost += Math.max(0, s.packetsLostPerSecond ?? 0)
    patched = Math.max(patched, Math.min(1, Math.max(0, s.healedRatio ?? 0)))
    jitterMs = Math.max(jitterMs, s.jitterInMs ?? 0)
    if (s.rttInMs != null) rttMs = Math.max(rttMs ?? 0, s.rttInMs)
  }
  if (got + lost <= 0) return null
  return { got, lost, patched, jitterMs, rttMs }
}

export class SoundWindow {
  private seconds: SoundSecond[] = []

  add(second: SoundSecond | null): void {
    if (!second) return
    this.seconds.push(second)
    if (this.seconds.length > WINDOW_SECONDS) this.seconds.shift()
  }

  /** How the last ten seconds were; null when there is too little to judge. */
  reading(): SoundReading | null {
    const n = this.seconds.length
    if (n < MIN_SECONDS) return null
    let got = 0
    let lost = 0
    let patched = 0
    let jitterMs = 0
    let rttMs: number | undefined
    for (const s of this.seconds) {
      got += s.got
      lost += s.lost
      patched += s.patched
      jitterMs = Math.max(jitterMs, s.jitterMs)
      if (s.rttMs != null) rttMs = Math.max(rttMs ?? 0, s.rttMs)
    }
    patched /= n
    const loss = got + lost >= MIN_PACKETS ? lost / (got + lost) : 0
    const health: Health =
      patched >= BAD.patched || loss >= BAD.loss
        ? 'Bad'
        : patched >= POOR.patched || loss >= POOR.loss
          ? 'Poor'
          : 'Good'
    return { health, loss, patched, jitterMs, rttMs }
  }

  /** Start again: the readings so far are used, or no longer this call's. */
  clear(): void {
    this.seconds = []
  }
}

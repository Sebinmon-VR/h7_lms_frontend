import * as React from 'react'

/**
 * Arena sound effects: a few synthesised beeps, no audio files.
 *
 * Browsers refuse to start audio before the page has had a tap or key press,
 * so the AudioContext is made on the first gesture (`useArenaAudioUnlock`)
 * and every effect before that is a quiet no-op. Mute is remembered per
 * device.
 */

const MUTE_KEY = 'h7.arena.muted'

let ctx: AudioContext | null = null
let muted = readMuted()
const listeners = new Set<() => void>()

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function setArenaMuted(value: boolean) {
  muted = value
  try {
    window.localStorage.setItem(MUTE_KEY, value ? '1' : '0')
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useArenaMuted(): [boolean, (value: boolean) => void] {
  const value = React.useSyncExternalStore(subscribe, () => muted, () => muted)
  return [value, setArenaMuted]
}

export function unlockArenaAudio() {
  if (typeof window === 'undefined') return
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
    return
  }
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return
  try {
    ctx = new Ctor()
  } catch {
    ctx = null
  }
}

/** Creates the audio context on the first tap or key press anywhere. */
export function useArenaAudioUnlock() {
  React.useEffect(() => {
    const unlock = () => unlockArenaAudio()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])
}

interface Note {
  freq: number
  /** Seconds after now. */
  at?: number
  dur: number
  type?: OscillatorType
  gain?: number
  /** Glide to this frequency over the note. */
  to?: number
}

function play(notes: Note[]) {
  if (muted || !ctx || ctx.state === 'closed') return
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  const t0 = ctx.currentTime + 0.01
  for (const note of notes) {
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()
    const start = t0 + (note.at ?? 0)
    const end = start + note.dur
    osc.type = note.type ?? 'sine'
    osc.frequency.setValueAtTime(note.freq, start)
    if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, end)
    const peak = note.gain ?? 0.08
    amp.gain.setValueAtTime(0.0001, start)
    amp.gain.exponentialRampToValueAtTime(peak, start + 0.012)
    amp.gain.exponentialRampToValueAtTime(0.0001, end)
    osc.connect(amp).connect(ctx.destination)
    osc.start(start)
    osc.stop(end + 0.02)
  }
}

export const arenaSound = {
  /** Last three seconds of a question. */
  tick: () => play([{ freq: 880, dur: 0.07, type: 'square', gain: 0.035 }]),
  /** 3, 2, 1… */
  countdown: () => play([{ freq: 520, dur: 0.14, type: 'triangle', gain: 0.09 }]),
  go: () =>
    play([
      { freq: 784, dur: 0.12, type: 'triangle', gain: 0.09 },
      { freq: 1046, at: 0.08, dur: 0.22, type: 'triangle', gain: 0.09 },
    ]),
  tap: () => play([{ freq: 440, dur: 0.05, type: 'sine', gain: 0.05, to: 660 }]),
  correct: () =>
    play([
      { freq: 660, dur: 0.12, type: 'sine', gain: 0.1 },
      { freq: 880, at: 0.09, dur: 0.12, type: 'sine', gain: 0.1 },
      { freq: 1320, at: 0.18, dur: 0.22, type: 'sine', gain: 0.08 },
    ]),
  wrong: () =>
    play([
      { freq: 220, dur: 0.22, type: 'sawtooth', gain: 0.05, to: 150 },
      { freq: 160, at: 0.12, dur: 0.24, type: 'sawtooth', gain: 0.04, to: 110 },
    ]),
  win: () =>
    play([
      { freq: 523, dur: 0.14, type: 'triangle', gain: 0.1 },
      { freq: 659, at: 0.13, dur: 0.14, type: 'triangle', gain: 0.1 },
      { freq: 784, at: 0.26, dur: 0.14, type: 'triangle', gain: 0.1 },
      { freq: 1046, at: 0.39, dur: 0.5, type: 'triangle', gain: 0.11 },
      { freq: 784, at: 0.39, dur: 0.5, type: 'sine', gain: 0.05 },
    ]),
  emote: () => play([{ freq: 990, dur: 0.06, type: 'sine', gain: 0.04, to: 1320 }]),
  /** A classmate's challenge just arrived. */
  invite: () =>
    play([
      { freq: 988, dur: 0.09, type: 'triangle', gain: 0.07 },
      { freq: 1319, at: 0.1, dur: 0.16, type: 'triangle', gain: 0.07 },
    ]),
  /** A softer close for a loss or a draw: no fanfare, no sting. */
  lose: () =>
    play([
      { freq: 392, dur: 0.16, type: 'triangle', gain: 0.06 },
      { freq: 330, at: 0.14, dur: 0.28, type: 'triangle', gain: 0.05 },
    ]),
  /** Rising sweep for a level or tier up. */
  levelUp: () =>
    play([
      { freq: 440, dur: 0.35, type: 'sawtooth', gain: 0.025, to: 1760 },
      { freq: 1319, at: 0.3, dur: 0.12, type: 'triangle', gain: 0.08 },
      { freq: 1760, at: 0.4, dur: 0.3, type: 'triangle', gain: 0.08 },
    ]),
  /** A badge tile landing. */
  badge: () =>
    play([
      { freq: 1568, dur: 0.06, type: 'sine', gain: 0.06 },
      { freq: 2093, at: 0.06, dur: 0.14, type: 'sine', gain: 0.05 },
    ]),
}

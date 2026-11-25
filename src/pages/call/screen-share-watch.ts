/**
 * Notices a shared screen that never appears on this device.
 *
 * On 24 Nov a teacher's shared screen stayed on "Loading …'s screen" on a phone while the
 * class's computers showed it. Tests of the same call screen in its phone layout showed every
 * kind of shared screen within seconds, so what goes wrong is on the device or its connection -
 * and until now nothing said which. A shared screen that has not shown a single picture
 * STUCK_SECONDS after it became available is reported once, with the numbers that tell the
 * causes apart: no packets at all (nothing reached the device), packets but no complete
 * picture (the first picture was lost on the way), or pictures received but none decoded (the
 * device could not decode it).
 *
 * A screen that showed even one picture is never reported, so a still page that sends
 * nothing new for minutes is not mistaken for one that never loaded.
 */

/** Seconds a shared screen may stay on "Loading" before it is reported. */
export const STUCK_SECONDS = 15

/** A shared screen in the call, from the call's own list of each person's streams. */
export interface ShareStream {
  id: number
  /** The call's own word on whether pictures are arriving. */
  receiving: boolean
}

/** The call's per-second numbers for an incoming shared screen (fields as the SDK names them). */
export interface ShareStats {
  streamId?: number
  packets?: number
  packetsLost?: number
  bitrate?: number
  framesReceived?: number
  framesDecoded?: number
  keyFramesDecoded?: number
  frameWidthReceived?: number
  frameHeightReceived?: number
  codecName?: string
}

export interface StuckShare {
  stream: ShareStream
  stats?: ShareStats
  waited: number
}

export class ScreenShareWatch {
  /** Seconds each shared screen has waited without a picture. */
  private waiting = new Map<number, number>()
  /** Screens that showed a picture, or were already reported: nothing more to say about them. */
  private settled = new Set<number>()

  /**
   * One second: the shared screens available now and the call's numbers for them. Returns the
   * screen that has just waited STUCK_SECONDS without a picture, once per screen; else null.
   */
  add(streams: ShareStream[], stats: ShareStats[]): StuckShare | null {
    const live = new Set(streams.map((s) => s.id))
    for (const id of [...this.waiting.keys()]) if (!live.has(id)) this.waiting.delete(id)

    let stuck: StuckShare | null = null
    for (const stream of streams) {
      if (this.settled.has(stream.id)) continue
      const own = stats.find((s) => s.streamId === stream.id) ?? (stats.length === 1 ? stats[0] : undefined)
      if (stream.receiving || (own?.framesDecoded ?? 0) > 0) {
        this.settled.add(stream.id)
        this.waiting.delete(stream.id)
        continue
      }
      const waited = (this.waiting.get(stream.id) ?? 0) + 1
      this.waiting.set(stream.id, waited)
      if (waited >= STUCK_SECONDS && !stuck) {
        this.settled.add(stream.id)
        this.waiting.delete(stream.id)
        stuck = { stream, stats: own, waited }
      }
    }
    return stuck
  }
}

/** This browser in a word or two: the kind of device and the browser and its version. */
export function browserLabel(ua: string = navigator.userAgent): string {
  const phone = /Android|iPhone|iPad|Mobile/i.test(ua) ? 'phone' : 'computer'
  const found =
    (/; wv\)/.test(ua) && 'in-app') ||
    ua.match(/SamsungBrowser\/(\d+)/)?.[0].replace('SamsungBrowser/', 'Samsung ') ||
    ua.match(/EdgA?\/(\d+)/)?.[0].replace(/EdgA?\//, 'Edge ') ||
    ua.match(/OPR\/(\d+)/)?.[0].replace('OPR/', 'Opera ') ||
    ua.match(/Firefox\/(\d+)/)?.[0].replace('Firefox/', 'Firefox ') ||
    ua.match(/Chrome\/(\d+)/)?.[0].replace('Chrome/', 'Chrome ') ||
    (/Safari\//.test(ua) && 'Safari') ||
    'browser'
  return `${phone} ${found}`
}

/** The numbers behind a "shared screen not loading" record: short, one line. */
export function describeStuck(stuck: StuckShare, videosArriving: number, device: string): string {
  const s = stuck.stats
  const parts = [`waited ${stuck.waited}s`]
  if (!s) parts.push('no numbers')
  else {
    parts.push(`packets ${s.packets ?? 0}`)
    if (s.packetsLost) parts.push(`lost ${s.packetsLost}`)
    parts.push(`frames ${s.framesReceived ?? 0}/${s.framesDecoded ?? 0}`)
    if (s.keyFramesDecoded != null) parts.push(`key ${s.keyFramesDecoded}`)
    if (s.frameWidthReceived && s.frameHeightReceived) parts.push(`${s.frameWidthReceived}x${s.frameHeightReceived}`)
    if (s.codecName) parts.push(s.codecName)
    if (s.bitrate != null) parts.push(`${Math.round(s.bitrate / 1000)}kbps`)
  }
  parts.push(`videos ${videosArriving}`)
  parts.push(device)
  return parts.join(' ')
}

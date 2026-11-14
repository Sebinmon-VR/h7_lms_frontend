import { Features, type Call, type MediaStatsCollector, type MediaStatsReportSample } from '@azure/communication-calling'
import * as React from 'react'

import { LEVELS, LiveVideoGovernor } from './live-video-governor'

/**
 * Keeps a full class's sound clear.
 *
 * Sound and video share each device's connection and processor. In Google Meet a class of
 * twenty with cameras on sounds fine because Meet sends small pictures, shows only what the
 * device can play and mutes newcomers; the Azure call does none of that by itself, so past
 * about five cameras the teacher's laptop fell behind and everybody's voice broke up. Here:
 *
 *  - Students send a small camera picture (240p, 15 frames a second) - all a class tile
 *    needs - unless they are sharing their screen.
 *  - The teacher's screen plays as many live videos as the device can take: a start that
 *    fits the device, lowered when the sound or the pictures start to suffer, raised again
 *    after a quiet minute. Everyone keeps a tile, and the live ones take turns, so every
 *    student is seen in turn.
 *  - Received sound is measured; poor sound goes to the office's Connection view.
 *  - The teacher is told when several students have their microphones on at once.
 */

export type Health = 'Good' | 'Poor' | 'Bad'

const gallery = globalThis as { __H7_CLASS_VIDEOS__?: number; __H7_LIVE_OFFSET__?: number }

/** How often the class's load is judged (the steps themselves: live-video-governor.ts). */
const CHECK_MS = 5_000
/** How long each group of students stays live before the next group takes its turn. */
const ROTATE_MS = 20_000

/** What a student's camera sends: plenty for a class tile, a fraction of the default. */
const STUDENT_CAMERA = { frameHeight: { max: 240 }, frameRate: { max: 15 }, bitrate: { max: 300_000 } }
/** 0 lifts a limit: a shared screen has to be readable. */
const NO_LIMIT = { frameHeight: { max: 0 }, frameRate: { max: 0 }, bitrate: { max: 0 } }

/** Three or more students talking at once, for this long, and the teacher is told. */
const OPEN_MICS = 3
const OPEN_MICS_FOR_MS = 10_000

function deviceMemory(): number | undefined {
  return (navigator as Navigator & { deviceMemory?: number }).deviceMemory
}

/** A device that can run the teacher's noise suppression alongside a class of videos. */
export function isStrongDevice(): boolean {
  return (navigator.hardwareConcurrency || 4) >= 8 && (deviceMemory() ?? 8) >= 8
}

/** Where the teacher's grid starts, from what this device can take. */
export function startingLiveVideos(): number {
  const cores = navigator.hardwareConcurrency || 4
  const memory = deviceMemory()
  if (cores >= 8 && (memory === undefined || memory >= 8)) return 12
  if (cores >= 4 && (memory === undefined || memory >= 4)) return 9
  return 6
}

/** How the sound coming in is: lost packets and the share the call had to patch over. */
function audioHealth(sample: MediaStatsReportSample): Health {
  let worst: Health = 'Good'
  for (const s of sample.audio.receive) {
    const got = s.packetsPerSecond ?? 0
    const lost = s.packetsLostPerSecond ?? 0
    if (got + lost <= 0) continue
    const loss = lost / (got + lost)
    const healed = s.healedRatio ?? 0
    const jitter = s.jitterInMs ?? 0
    if (loss > 0.1 || healed > 0.2) return 'Bad'
    if (loss > 0.03 || healed > 0.07 || jitter > 60) worst = 'Poor'
  }
  return worst
}

/** Pictures arriving faster than this device can draw them: its processor is full. */
function decodeLagging(sample: MediaStatsReportSample): boolean {
  let received = 0
  let decoded = 0
  for (const s of sample.video.receive) {
    received += s.frameRateReceived ?? 0
    decoded += s.frameRateDecoded ?? 0
  }
  return received > 10 && decoded < received * 0.75
}

export function useCallLoad({
  call,
  isHost,
  steerGrid,
  onIssue,
  onLowestLevelStrain,
}: {
  call: Call | undefined
  /** A teacher (or admin) in the call: their camera is not limited; they hear about open mics. */
  isHost: boolean
  /** The teacher's class grid, whose live videos this sizes and turns. */
  steerGrid: boolean
  /** A warning for the office's Connection view, as the call's own warnings are sent. */
  onIssue: (name: string, value: string) => void
  /** The teacher's grid is as small as it goes and the call still struggles. */
  onLowestLevelStrain: () => void
}) {
  const [liveVideos, setLiveVideos] = React.useState(() => startingLiveVideos())
  const [openMics, setOpenMics] = React.useState(0)
  const [tooManyOpenMics, setTooManyOpenMics] = React.useState(false)

  // The latest callbacks, so a re-render does not restart the measuring.
  const onIssueRef = React.useRef(onIssue)
  onIssueRef.current = onIssue
  const onStrainRef = React.useRef(onLowestLevelStrain)
  onStrainRef.current = onLowestLevelStrain

  // A student's camera sends a class-tile picture; their shared screen goes out in full.
  React.useEffect(() => {
    if (!call || isHost) return
    const apply = () => {
      const send = call.isScreenSharingOn ? NO_LIMIT : STUDENT_CAMERA
      void call.setConstraints({ video: { send } }).catch((error) => console.warn('Camera limits not set', error))
    }
    apply()
    call.on('isScreenSharingOnChanged', apply)
    return () => call.off('isScreenSharingOnChanged', apply)
  }, [call, isHost])

  // Measure what arrives; the teacher's grid follows it.
  React.useEffect(() => {
    if (!call) return
    let latestAudio: Health = 'Good'
    let latestLag = false
    let pressure = false
    const lastSent = new Map<string, number>()

    let collector: MediaStatsCollector | null = null
    const onSample = (sample: MediaStatsReportSample) => {
      latestAudio = audioHealth(sample)
      latestLag = decodeLagging(sample)
      if (latestAudio !== 'Good') {
        const now = Date.now()
        if (now - (lastSent.get(latestAudio) ?? 0) > 60_000) {
          lastSent.set(latestAudio, now)
          onIssueRef.current('audioReceiveQuality', latestAudio)
        }
      }
    }
    try {
      collector = call.feature(Features.MediaStats).createCollector()
      collector.on('sampleReported', onSample)
    } catch (error) {
      console.warn('Call quality is not measured here', error)
    }

    // Chrome can say when the processor is under pressure.
    type PressureRecord = { state: 'nominal' | 'fair' | 'serious' | 'critical' }
    type PressureObserverLike = { observe(source: 'cpu'): Promise<void>; disconnect(): void }
    const Pressure = (window as unknown as {
      PressureObserver?: new (cb: (records: PressureRecord[]) => void) => PressureObserverLike
    }).PressureObserver
    let observer: PressureObserverLike | null = null
    if (steerGrid && Pressure) {
      try {
        observer = new Pressure((records) => {
          const last = records[records.length - 1]
          if (last) pressure = last.state === 'serious' || last.state === 'critical'
        })
        void observer.observe('cpu').catch(() => undefined)
      } catch {
        observer = null
      }
    }

    const governor = new LiveVideoGovernor(startingLiveVideos(), Date.now())
    const timer = window.setInterval(() => {
      if (!steerGrid) return
      const strained = latestAudio !== 'Good' || latestLag || pressure
      if (governor.reading(strained, Date.now())) onStrainRef.current()
      gallery.__H7_CLASS_VIDEOS__ = governor.liveVideos
      setLiveVideos(governor.liveVideos)
    }, CHECK_MS)

    return () => {
      window.clearInterval(timer)
      observer?.disconnect()
      if (collector) {
        try {
          collector.off('sampleReported', onSample)
          collector.dispose()
        } catch {
          // Gone with the call.
        }
      }
    }
  }, [call, steerGrid])

  // Live videos take turns, so a class bigger than the grid's live count is all seen.
  React.useEffect(() => {
    if (!steerGrid || !call) return
    let offset = 0
    gallery.__H7_LIVE_OFFSET__ = offset
    const timer = window.setInterval(() => {
      offset += gallery.__H7_CLASS_VIDEOS__ ?? LEVELS[0]
      gallery.__H7_LIVE_OFFSET__ = offset
    }, ROTATE_MS)
    return () => {
      window.clearInterval(timer)
      delete gallery.__H7_LIVE_OFFSET__
    }
  }, [call, steerGrid])

  // Students talking over each other: the teacher hears about it, once it lasts.
  React.useEffect(() => {
    if (!isHost || !call) return
    let since: number | null = null
    const timer = window.setInterval(() => {
      const open = call.remoteParticipants.filter(
        (p) => p.role !== 'Presenter' && p.state === 'Connected' && !p.isMuted,
      ).length
      setOpenMics(open)
      if (open >= OPEN_MICS) {
        since ??= Date.now()
        setTooManyOpenMics(Date.now() - since >= OPEN_MICS_FOR_MS)
      } else {
        since = null
        setTooManyOpenMics(false)
      }
    }, 2_000)
    return () => window.clearInterval(timer)
  }, [call, isHost])

  return { liveVideos, openMics, tooManyOpenMics }
}

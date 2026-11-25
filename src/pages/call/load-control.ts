import { Features, type Call, type MediaStatsCollector, type MediaStatsReportSample } from '@azure/communication-calling'
import { toFlatCommunicationIdentifier } from '@azure/communication-react'
import * as React from 'react'

import { DataSaver, type SaverLevel } from './data-saver'
import { LEVELS, LiveVideoGovernor } from './live-video-governor'
import { browserLabel, describeStuck, ScreenShareWatch, type ShareStats, type ShareStream } from './screen-share-watch'
import { SoundWindow, soundSecond, WINDOW_SECONDS, type Health, type SoundReading } from './sound-window'

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
 *  - The teacher's camera sends a picture sized for a face on a screen (540p), not full HD:
 *    it is the one video every student downloads all lesson. A shared screen or the
 *    whiteboard still goes out in full, so writing stays sharp.
 *  - Received sound is judged ten seconds at a time (sound-window.ts); choppy sound goes to
 *    the office's Connection view with its numbers. On a student's device, sound that keeps
 *    breaking up pauses the videos there (data-saver.ts).
 *  - A teacher's device that stalls (microphone stopped, camera frozen) drops to the fewest
 *    live videos and loses its effects at once (`relieve`).
 *  - The teacher is told when several students have their microphones on at once.
 *  - A shared screen that never appears on this device goes to the Connection view with
 *    the numbers that say why (screen-share-watch.ts).
 */

const gallery = globalThis as {
  __H7_CLASS_VIDEOS__?: number
  __H7_LIVE_OFFSET__?: number
  /** Set: only these people's cameras play on this device (see videoSaver in vite.config.ts). */
  __H7_VIDEO_ONLY_FOR__?: Set<string>
}

/** How often the class's load is judged (the steps themselves: live-video-governor.ts). */
const CHECK_MS = 5_000
/** How long each group of students stays live before the next group takes its turn. */
const ROTATE_MS = 20_000

/** What a student's camera sends: plenty for a class tile, a fraction of the default. */
const STUDENT_CAMERA = { frameHeight: { max: 240 }, frameRate: { max: 15 }, bitrate: { max: 300_000 } }
/** The teacher's camera: clear for a face or a book held up, a third of full HD's data. */
const TEACHER_CAMERA = { frameHeight: { max: 540 }, frameRate: { max: 24 }, bitrate: { max: 900_000 } }
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

/**
 * Where the teacher's grid starts, from what this device can take - and the most it climbs
 * back to. From 18 to 25 Nov these were a step lower (9 / 6 / 4), and a teacher on an ordinary
 * four-core laptop saw only six of a KG class's nine or ten cameras at a time. Teachers need
 * to see their class; the grid still steps down by itself when the sound or the pictures
 * start to suffer (live-video-governor.ts).
 */
export function startingLiveVideos(): number {
  const cores = navigator.hardwareConcurrency || 4
  const memory = deviceMemory()
  if (cores >= 8 && (memory === undefined || memory >= 8)) return 12
  if (cores >= 4 && (memory === undefined || memory >= 4)) return 9
  return 6
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

/** Seconds in the last five that lagged before the device counts as falling behind. */
const LAG_SECONDS = 3

/** This device and its connection, as the call records end: "cores 4 mem 2 net 4g 1.35Mb". */
function deviceLine(): string {
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number } })
    .connection
  const parts = [`cores ${navigator.hardwareConcurrency || '?'}`]
  const memory = deviceMemory()
  if (memory !== undefined) parts.push(`mem ${memory}`)
  if (connection?.effectiveType) parts.push(`net ${connection.effectiveType}${connection.downlink ? ` ${connection.downlink}Mb` : ''}`)
  return parts.join(' ')
}

/** The numbers behind a choppy-sound record, for whoever looks into it: short, one line. */
function describe(reading: SoundReading, sample: MediaStatsReportSample | null, paused: SaverLevel): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`
  const parts = [
    `patched ${pct(reading.patched)}`,
    `lost ${pct(reading.loss)}`,
    `jitter ${Math.round(reading.jitterMs)}ms`,
  ]
  if (reading.rttMs != null) parts.push(`rtt ${Math.round(reading.rttMs)}ms`)
  if (sample) parts.push(`videos ${sample.video.receive.length + sample.screenShare.receive.length}`)
  if (paused) parts.push(`paused ${paused}`)
  parts.push(deviceLine())
  return parts.join(' ')
}

export function useCallLoad({
  call,
  isHost,
  steerGrid,
  saveData,
  onIssue,
  onLowestLevelStrain,
}: {
  call: Call | undefined
  /** A teacher (or admin) in the call: their camera is not limited; they hear about open mics. */
  isHost: boolean
  /** The teacher's class grid, whose live videos this sizes and turns. */
  steerGrid: boolean
  /** A student in a class: pause videos on this device when the sound coming in breaks up. */
  saveData: boolean
  /** A warning for the office's Connection view, as the call's own warnings are sent, with its numbers. */
  onIssue: (name: string, value: string, detail?: string) => void
  /** The teacher's grid is as small as it goes and the call still struggles. */
  onLowestLevelStrain: () => void
}) {
  const [liveVideos, setLiveVideos] = React.useState(() => startingLiveVideos())
  const [openMics, setOpenMics] = React.useState(0)
  const [tooManyOpenMics, setTooManyOpenMics] = React.useState(false)
  const [videosPaused, setVideosPaused] = React.useState<SaverLevel>(0)
  const saverRef = React.useRef<DataSaver | null>(null)
  const governorRef = React.useRef<LiveVideoGovernor | null>(null)

  // The latest callbacks, so a re-render does not restart the measuring.
  const onIssueRef = React.useRef(onIssue)
  onIssueRef.current = onIssue
  const onStrainRef = React.useRef(onLowestLevelStrain)
  onStrainRef.current = onLowestLevelStrain

  // A student's camera sends a class-tile picture, a teacher's a face-sized one; a shared
  // screen (or the whiteboard) goes out in full.
  React.useEffect(() => {
    if (!call) return
    const apply = () => {
      const send = call.isScreenSharingOn ? NO_LIMIT : isHost ? TEACHER_CAMERA : STUDENT_CAMERA
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

    // A student's device: which cameras may play, from how the sound is.
    const saver = saveData ? new DataSaver(Date.now()) : null
    saverRef.current = saver
    const applySaver = (level: SaverLevel) => {
      if (level === 0) delete gallery.__H7_VIDEO_ONLY_FOR__
      else {
        // Level 1 keeps the teachers' cameras (the room's presenters); level 2 keeps none.
        const keep = new Set<string>()
        if (level === 1) {
          for (const p of call.remoteParticipants) {
            if (p.role === 'Presenter') keep.add(toFlatCommunicationIdentifier(p.identifier))
          }
        }
        gallery.__H7_VIDEO_ONLY_FOR__ = keep
      }
      setVideosPaused(level)
    }

    // The call reports once a second; the sound is judged on ten seconds of it at a time
    // (sound-window.ts), and the picture on three lagging seconds out of the last five.
    const sound = new SoundWindow()
    const shareWatch = new ScreenShareWatch()
    let seconds = 0
    const lagged: boolean[] = []
    let collector: MediaStatsCollector | null = null
    const onSample = (sample: MediaStatsReportSample) => {
      sound.add(soundSecond(sample.audio.receive))
      lagged.push(decodeLagging(sample))
      if (lagged.length > 5) lagged.shift()
      latestLag = lagged.filter(Boolean).length >= LAG_SECONDS

      const shares: ShareStream[] = []
      for (const p of call.remoteParticipants) {
        for (const v of p.videoStreams) {
          if (v.mediaStreamType === 'ScreenSharing' && v.isAvailable) shares.push({ id: v.id, receiving: v.isReceiving })
        }
      }
      const stuck = shareWatch.add(shares, sample.screenShare.receive as ShareStats[])
      if (stuck) {
        onIssueRef.current(
          'screenShareNotLoading',
          'yes',
          describeStuck(stuck, sample.video.receive.length, `${browserLabel()} ${deviceLine()}`),
        )
      }

      seconds += 1
      if (seconds % WINDOW_SECONDS !== 0) return
      const reading = sound.reading()
      sound.clear()
      if (!reading) return
      latestAudio = reading.health
      if (saver) applySaver(saver.reading(latestAudio !== 'Good', Date.now()))
      if (latestAudio !== 'Good') {
        const now = Date.now()
        if (now - (lastSent.get(latestAudio) ?? 0) > 60_000) {
          lastSent.set(latestAudio, now)
          onIssueRef.current('audioReceiveQuality', latestAudio, describe(reading, sample, saver?.level ?? 0))
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
    governorRef.current = steerGrid ? governor : null
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
      if (governorRef.current === governor) governorRef.current = null
      if (saver) {
        saverRef.current = null
        delete gallery.__H7_VIDEO_ONLY_FOR__
        setVideosPaused(0)
      }
      if (collector) {
        try {
          collector.off('sampleReported', onSample)
          collector.dispose()
        } catch {
          // Gone with the call.
        }
      }
    }
  }, [call, steerGrid, saveData])

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

  /** The student asked for the videos back. */
  const showVideos = React.useCallback(() => {
    const saver = saverRef.current
    if (!saver) return
    saver.showVideos(Date.now())
    delete gallery.__H7_VIDEO_ONLY_FOR__
    setVideosPaused(0)
  }, [])

  /**
   * The teacher's device stalled (its microphone stopped sending sound, or its camera froze):
   * fewest live videos at once, and - the first time - its effects off. A stalled teacher's
   * device is silence for the whole class, so this does not wait for the usual readings.
   */
  const relieve = React.useCallback(() => {
    const governor = governorRef.current
    if (!governor) return
    if (governor.stalled(Date.now())) onStrainRef.current()
    gallery.__H7_CLASS_VIDEOS__ = governor.liveVideos
    setLiveVideos(governor.liveVideos)
  }, [])

  return { liveVideos, openMics, tooManyOpenMics, videosPaused, showVideos, relieve }
}

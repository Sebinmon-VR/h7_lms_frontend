import { LocalVideoStream, type CallAgent } from '@azure/communication-calling'
import { AzureCommunicationTokenCredential } from '@azure/communication-common'
import {
  CallComposite,
  COMPOSITE_LOCALE_EN_US,
  createAzureCommunicationCallAdapterFromClient,
  createStatefulCallClient,
  darkTheme,
  lightTheme,
  onResolveDeepNoiseSuppressionDependencyLazy,
  onResolveVideoEffectDependencyLazy,
  type CallAdapter,
  type CallCompositeIcons,
  type CallCompositeOptions,
  type CompositeLocale,
  type VideoBackgroundImage,
} from '@azure/communication-react'
import { AlertCircle, ArrowLeft, Circle, ClipboardCheck, Loader2, PhoneOff, Presentation, RotateCcw, Square, X } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { CALL_KINDS, callsApi, reportLeftOnUnload, type CallKind, type CallSession } from '@/api/calls.api'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/datetime'
import { roleHome, useAuth } from '@/providers/auth-provider'
import { useTheme } from '@/providers/theme-provider'

import { Whiteboard } from './whiteboard'
import { RegisterPanel, usePeriodRegister } from './register-panel'
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { InvigilatorPanel } from './invigilator-panel'
import { StudentExamTakeView } from '@/pages/student/exam-take'

// The calling UI's notices close with an icon it never registers itself, so
// the close button drew as an empty, invisible box.
const CALL_ICONS = { Cancel: <X className="size-4" /> } as unknown as CallCompositeIcons

/**
 * A note, in this tab only, that its person is in a call and how their microphone and
 * camera are. Kept while connected; a page that reloads within ten minutes of the last
 * note goes straight back into the call with them as they were, instead of stopping at
 * the join screen. Leaving on purpose clears it.
 */
const IN_CALL_FRESH_MS = 10 * 60_000
const inCallKey = (kind: string, id: string) => `h7.in-call.${kind}.${id}`
let lastInCallNote = ''

function noteInCall(kind: string, id: string, media: { mic: boolean; cam: boolean }) {
  // Written when the state changes and otherwise every half minute, not on every render.
  const stamp = `${media.mic}${media.cam}${Math.floor(Date.now() / 30_000)}`
  if (stamp === lastInCallNote) return
  lastInCallNote = stamp
  try {
    sessionStorage.setItem(inCallKey(kind, id), JSON.stringify({ at: Date.now(), ...media }))
  } catch {
    // Private browsing: nothing kept, a reload goes to the join screen as before.
  }
}

function readInCall(kind: string, id: string): { mic: boolean; cam: boolean } | null {
  try {
    const raw = sessionStorage.getItem(inCallKey(kind, id))
    if (!raw) return null
    const note = JSON.parse(raw) as { at?: number; mic?: boolean; cam?: boolean }
    if (!note.at || Date.now() - note.at > IN_CALL_FRESH_MS) return null
    return { mic: Boolean(note.mic), cam: Boolean(note.cam) }
  } catch {
    return null
  }
}

function forgetInCall(kind: string, id: string) {
  lastInCallNote = ''
  try {
    sessionStorage.removeItem(inCallKey(kind, id))
  } catch {
    // Nothing kept to forget.
  }
}

/**
 * The ACS warnings about a person's own side of the call that the office is told of:
 * their network, and a microphone, camera or speaker that is missing or failing.
 * "Speaking while muted" is left out - it is not a fault.
 */
const REPORTED_DIAGNOSTICS = new Set([
  'networkReconnect',
  'networkReceiveQuality',
  'networkSendQuality',
  'noNetwork',
  'networkRelaysNotReachable',
  'noSpeakerDevicesEnumerated',
  'noMicrophoneDevicesEnumerated',
  'microphoneNotFunctioning',
  'microphoneMuteUnexpectedly',
  'microphonePermissionDenied',
  'cameraFreeze',
  'cameraStartFailed',
  'cameraStartTimedOut',
  'cameraStoppedUnexpectedly',
  'cameraPermissionDenied',
  'capturerStartFailed',
  'capturerStoppedUnexpectedly',
])

/**
 * A teacher's grid holds everybody in the call (no strip of hidden students below it),
 * and up to this many of them play live video. With the teacher's own camera that is
 * 16, the most videos a desktop browser may show; anyone past it shows as their name.
 */
const TEACHER_GRID = 200
const TEACHER_VIDEOS = 15

/**
 * The backgrounds a teacher can put behind themselves, from public/call-backgrounds.
 * The photos are from Pexels, free to use under the Pexels licence; the plain ones are drawn.
 */
const CALL_BACKGROUNDS: VideoBackgroundImage[] = [
  { key: 'classroom', url: '/call-backgrounds/classroom.jpg', tooltipText: 'Classroom' },
  { key: 'classroom-chalkboard', url: '/call-backgrounds/classroom-chalkboard.jpg', tooltipText: 'Classroom with chalkboard' },
  { key: 'office-bookshelf', url: '/call-backgrounds/office-bookshelf.jpg', tooltipText: 'Office with bookshelf' },
  { key: 'bookshelf-plant', url: '/call-backgrounds/bookshelf-plant.jpg', tooltipText: 'Bookshelf and plant' },
  { key: 'books', url: '/call-backgrounds/books.jpg', tooltipText: 'Books' },
  { key: 'meeting-room', url: '/call-backgrounds/meeting-room.jpg', tooltipText: 'Meeting room' },
  { key: 'conference-room', url: '/call-backgrounds/conference-room.jpg', tooltipText: 'Conference room' },
  { key: 'living-room', url: '/call-backgrounds/living-room.jpg', tooltipText: 'Living room' },
  { key: 'lounge', url: '/call-backgrounds/lounge.jpg', tooltipText: 'Lounge' },
  { key: 'apartment', url: '/call-backgrounds/apartment.jpg', tooltipText: 'Apartment' },
  { key: 'soft-blue', url: '/call-backgrounds/soft-blue.png', tooltipText: 'Soft blue' },
  { key: 'off-white', url: '/call-backgrounds/off-white.png', tooltipText: 'Off white' },
  { key: 'warm-sand', url: '/call-backgrounds/warm-sand.png', tooltipText: 'Warm sand' },
  { key: 'slate', url: '/call-backgrounds/slate.png', tooltipText: 'Slate' },
]

/**
 * A class call's controls. The live text box ("Real-Time Text", in More) is off for
 * everyone: once anybody starts it, the whole class can type into it, which turned the
 * lesson into a chat. Screen sharing stays: teachers present, and students may show
 * their work (they join a class as Collaborators, who are allowed to share).
 *
 * The share button is asked for outright: left unset, the call drops it from its phone
 * layout, which it uses on any screen up to 640px wide - a tablet held upright, or a
 * narrowed laptop window - so the teacher had no way to present. It is shown wherever the
 * browser can share a screen at all; most phone and tablet browsers cannot (Chrome on
 * Android, Safari on iPad), and there the Whiteboard is the way to show the class something.
 */
const CAN_SHARE_SCREEN =
  typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
const CLASS_CALL_OPTIONS: CallCompositeOptions = {
  callControls: { realTimeTextButton: false, screenShareButton: CAN_SHARE_SCREEN },
  // Out of the box "Start call" stays greyed out until a microphone is allowed and
  // found, so a student whose tablet has blocked the microphone could not get into the
  // class at all. They come in anyway and can watch and listen; the banner over the call
  // tells them how to allow the microphone and camera.
  joinCallOptions: { microphoneCheck: 'skip' },
}

/** Opened inside another app's own browser (WhatsApp, Facebook, the Google app...). */
const IN_APP_BROWSER = /; wv\)|FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|GSA\//i.test(
  typeof navigator === 'undefined' ? '' : navigator.userAgent,
)
const APPLE_DEVICE =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

/**
 * This browser's own id, kept in its storage. Each device joins a call as its own
 * identity, so a teacher on a laptop and a phone at once shows the class both cameras
 * (one identity per person would show only one of them). Falls back to an id for this
 * page alone when storage is blocked: the call still works, it just is not remembered.
 */
const DEVICE_KEY = 'h7.device-id'
const CALL_DEVICE: { device: string; device_kind: 'phone' | 'tablet' | 'computer' } = (() => {
  const fresh = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  let device = ''
  try {
    device = localStorage.getItem(DEVICE_KEY) ?? ''
    if (!/^[A-Za-z0-9-]{8,64}$/.test(device)) {
      device = fresh()
      localStorage.setItem(DEVICE_KEY, device)
    }
  } catch {
    device = fresh()
  }
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const ipad = typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  const device_kind =
    ipad || /iPad|Tablet|Android(?!.*Mobile)/i.test(ua) ? 'tablet' : /Mobi|iPhone|iPod|Android/i.test(ua) ? 'phone' : 'computer'
  return { device, device_kind }
})()

/**
 * Why this device cannot use its camera or microphone, and what the family should tap
 * to fix it - over the call, from the join screen on, because the call's own screen only
 * says "No speakers found" and greys its button.
 */
function DeviceHelp({
  trouble,
  isHost,
  onDismiss,
}: {
  trouble: 'blocked' | 'none' | 'in-app'
  isHost: boolean
  onDismiss: () => void
}) {
  const steps =
    trouble === 'in-app'
      ? APPLE_DEVICE
        ? 'This opened inside another app, which cannot use the camera or microphone. Tap the share or ••• button and choose "Open in Safari".'
        : 'This opened inside another app, which cannot use the camera or microphone. Tap ⋮ (top right) and choose "Open in Chrome".'
      : trouble === 'none'
        ? 'No microphone was found. Connect the headset or check the device sound is on, then reload.'
        : APPLE_DEVICE
          ? 'The camera or microphone is blocked. Tap "aA" in the address bar → Website Settings → set Camera and Microphone to Allow, then reload. If they are already allowed: Settings app → Safari → Camera and Microphone → Allow.'
          : 'The camera or microphone is blocked. Tap the lock or ⓘ left of the web address → Permissions → turn on Camera and Microphone, then reload. If they are already on: Android Settings → Apps → Chrome → Permissions → allow Camera and Microphone.'
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2 text-sm text-foreground',
        isHost ? 'border-danger/30 bg-danger/10' : 'border-warning/30 bg-warning/10',
      )}
    >
      <AlertCircle className={cn('size-4 shrink-0', isHost ? 'text-danger' : 'text-warning')} />
      <p className="min-w-0 flex-1">
        {isHost && <span className="font-medium">The class will not hear or see you. </span>}
        {steps}{' '}
        {!isHost && <span className="text-muted-foreground">You can still join to watch and listen.</span>}
      </p>
      <div className="flex shrink-0 gap-1.5">
        <Button size="sm" variant="outline" icon={<RotateCcw />} onClick={() => window.location.reload()}>
          Reload
        </Button>
        <Button size="sm" variant="ghost" icon={<X />} onClick={onDismiss} aria-label="Hide" />
      </div>
    </div>
  )
}

// Its recording notice speaks of "consent to be transcribed"; classes are
// recorded, not transcribed.
const callStrings = COMPOSITE_LOCALE_EN_US.component.strings
const CALL_LOCALE: CompositeLocale = {
  ...COMPOSITE_LOCALE_EN_US,
  component: {
    ...COMPOSITE_LOCALE_EN_US.component,
    strings: {
      ...callStrings,
      notificationStack: {
        ...callStrings.notificationStack,
        recordingStarted: { title: 'This class is being recorded.', dismissButtonAriaLabel: 'Close' },
        recordingStopped: { title: 'Recording stopped.', dismissButtonAriaLabel: 'Close' },
      },
    },
  },
}

type Phase =
  | { name: 'loading' }
  | { name: 'blocked'; message: string }
  | { name: 'ready'; session: CallSession; adapter: CallAdapter }
  | { name: 'left'; session: CallSession }

/**
 * A live class, inside the LMS.
 *
 * Every join link - a class's standing room, a scheduled session, a tuition
 * class - is `/call/<kind>/<id>` and lands here. The server decides whether this
 * person may come in now (the same windows the join buttons show) and returns a
 * short-lived Azure Communication Services token for the class's room; the
 * Azure calling UI does the rest: device check, then the call itself.
 *
 * The page tells the server two things the office relies on: when the call
 * actually connected (the join in the attendance log, and the teacher's cue to
 * start recording) and when the person left (the leave, and stopping it).
 *
 * The teacher also has a whiteboard. It is shown to the class as the teacher's
 * screen share, so students need nothing extra to see it.
 */
export default function CallPage() {
  const { kind: rawKind = '', entityId = '' } = useParams()
  const kind = (CALL_KINDS as readonly string[]).includes(rawKind) ? (rawKind as CallKind) : null
  const navigate = useNavigate()
  const { user } = useAuth()
  const { resolved } = useTheme()
  const [phase, setPhase] = React.useState<Phase>({ name: 'loading' })
  const [attempt, setAttempt] = React.useState(0)
  const [recording, setRecording] = React.useState(false)
  const [recordingBusy, setRecordingBusy] = React.useState(false)
  const [connected, setConnected] = React.useState(false)
  // In an exam room, the student's uploads are drawn here, under the cameras.
  const [examSideSlot, setExamSideSlot] = React.useState<HTMLDivElement | null>(null)
  // A teacher's period register in a class room: opened by itself, once, when they connect
  // and it has not been taken yet, so each teacher coming in for their period is asked.
  const [registerOpen, setRegisterOpen] = React.useState(false)
  const registerAsked = React.useRef(false)
  const teachesHere = kind === 'class' && phase.name === 'ready' && phase.session.is_host
  const register = usePeriodRegister(Number(entityId), teachesHere && connected)
  React.useEffect(() => {
    if (register.data && !register.data.taken && !registerAsked.current) {
      registerAsked.current = true
      setRegisterOpen(true)
    }
  }, [register.data])
  // The board is mounted on first open and then only hidden, so its pages last
  // the whole call.
  const [boardMounted, setBoardMounted] = React.useState(false)
  const [boardOpen, setBoardOpen] = React.useState(false)
  const [boardShared, setBoardShared] = React.useState(false)
  const [boardSharing, setBoardSharing] = React.useState(false)
  const boardCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const boardStreamRef = React.useRef<MediaStream | null>(null)
  // Show the board to the class as soon as the call connects, unless the
  // teacher hid it.
  const boardWantedRef = React.useRef(false)

  const agentRef = React.useRef<CallAgent | null>(null)
  // True between the call connecting and this person leaving it, so a leave is
  // reported exactly once however the page is exited.
  const inCallRef = React.useRef(false)
  // Whether this person's microphone and camera are on, kept up to date while in the
  // call, so a dropped call comes back the way it was.
  const mediaRef = React.useRef({ mic: false, cam: false })
  // Set when a dropped call is being rejoined by itself; read by the next start.
  const resumeRef = React.useRef<{ mic: boolean; cam: boolean } | null>(null)
  // When the recent automatic rejoins happened, to stop trying after a few in a row.
  const rejoinsRef = React.useRef<number[]>([])
  const [reconnecting, setReconnecting] = React.useState(false)
  // Camera or microphone blocked or missing on this device, to explain over the call.
  const [deviceTrouble, setDeviceTrouble] = React.useState<'blocked' | 'none' | 'in-app' | null>(
    IN_APP_BROWSER ? 'in-app' : null,
  )
  const [deviceHelpHidden, setDeviceHelpHidden] = React.useState(false)

  const serverCallId = React.useCallback(async (): Promise<string | null> => {
    try {
      return (await agentRef.current?.calls[0]?.info.getServerCallId()) ?? null
    } catch {
      return null
    }
  }, [])

  const releaseBoardStream = React.useCallback(() => {
    boardStreamRef.current?.getTracks().forEach((track) => track.stop())
    boardStreamRef.current = null
    setBoardShared(false)
  }, [])

  React.useEffect(() => {
    if (!kind || !entityId) {
      setPhase({ name: 'blocked', message: 'This is not a class link.' })
      return
    }

    let cancelled = false
    let adapter: CallAdapter | null = null
    let agent: CallAgent | null = null

    const start = async () => {
      setPhase({ name: 'loading' })
      let session: CallSession
      try {
        session = await callsApi.open(kind, entityId, CALL_DEVICE)
      } catch (error) {
        if (cancelled) return
        const message =
          error instanceof ApiError ? error.message : 'The class could not be opened. Try again in a moment.'
        setPhase({ name: 'blocked', message })
        return
      }

      // A teacher sees every student in the main grid (see classGallery in
      // vite.config.ts); students keep the usual few.
      const grid = globalThis as { __H7_CLASS_GRID__?: number; __H7_CLASS_VIDEOS__?: number }
      if (session.is_host) {
        grid.__H7_CLASS_GRID__ = TEACHER_GRID
        grid.__H7_CLASS_VIDEOS__ = TEACHER_VIDEOS
      } else {
        delete grid.__H7_CLASS_GRID__
        delete grid.__H7_CLASS_VIDEOS__
      }

      try {
        const credential = new AzureCommunicationTokenCredential({
          token: session.token,
          refreshProactively: true,
          // Renewed through the same gate: a class whose window has closed
          // stops handing out tokens, and the call ends with it.
          tokenRefresher: async () => (await callsApi.open(kind, entityId, CALL_DEVICE)).token,
        })
        const userId = { communicationUserId: session.acs_user_id }
        const callClient = createStatefulCallClient({ userId })
        agent = await callClient.createCallAgent(credential, { displayName: session.display_name })
        adapter = await createAzureCommunicationCallAdapterFromClient(
          callClient,
          agent,
          { roomId: session.room_id },
          // Teachers only: the effects code is a 7 MB download, too much to put on every
          // student's join over a weak connection. The teacher's voice is the one the whole
          // class has to hear, so their microphone has fans, traffic and televisions taken
          // out of it from the start; students start muted instead (see muteOnJoin).
          // Teachers also get the camera's Effects: blur, or one of the backgrounds.
          session.is_host
            ? {
                deepNoiseSuppressionOptions: {
                  onResolveDependency: onResolveDeepNoiseSuppressionDependencyLazy,
                  deepNoiseSuppressionOnByDefault: true,
                },
                videoBackgroundOptions: {
                  videoBackgroundImages: CALL_BACKGROUNDS,
                  onResolveDependency: onResolveVideoEffectDependencyLazy,
                },
              }
            : undefined,
        )
      } catch (error) {
        if (cancelled) return
        console.error('Could not start the call client', error)
        setPhase({
          name: 'blocked',
          message: 'Your browser could not start the class. Use a recent Chrome, Edge or Safari, and allow the camera and microphone.',
        })
        return
      }
      if (cancelled) {
        adapter.dispose()
        agent.dispose()
        return
      }

      agentRef.current = agent
      setRecording(session.recording_active)

      // A rejoin after a dropped connection comes back as it was - and so does a page
      // that reloaded while in the call (tablets and phones reload a tab that sat in the
      // background), from what was noted in this tab while connected. A fresh join by a
      // student starts with the microphone off, so a class is not twenty open lines.
      const resume = resumeRef.current ?? readInCall(kind, entityId)
      resumeRef.current = null
      const muteOnJoin = !resume && !session.is_host && kind !== 'exam'
      const callAdapter = adapter

      // Warnings ACS raises about this person's own network and devices go to the
      // office's Connection view, once each and then at most once a minute.
      const lastSeen = new Map<string, string>()
      const lastSent = new Map<string, number>()
      const report = (latest: Record<string, { value: number | boolean; valueType: string } | undefined> | undefined) => {
        if (!latest) return
        for (const [name, entry] of Object.entries(latest)) {
          if (!entry || !REPORTED_DIAGNOSTICS.has(name)) continue
          const bad =
            entry.valueType === 'DiagnosticQuality' ? Number(entry.value) >= 2 : entry.value === true
          const label = !bad ? '' : entry.valueType === 'DiagnosticQuality' ? (Number(entry.value) >= 3 ? 'Bad' : 'Poor') : 'yes'
          if (lastSeen.get(name) === label) continue
          lastSeen.set(name, label)
          if (!bad) continue
          const now = Date.now()
          if (now - (lastSent.get(name) ?? 0) < 60_000) continue
          lastSent.set(name, now)
          void callsApi.issue(kind, entityId, name, label).catch(() => undefined)
        }
      }

      let screenSharing = false
      adapter.onStateChange((state) => {
        setConnected(state.call?.state === 'Connected')
        // Asked for and refused, or allowed with nothing to use.
        const access = state.devices.deviceAccess
        if (!IN_APP_BROWSER && access) {
          setDeviceTrouble(
            !access.audio || !access.video ? 'blocked' : state.devices.microphones.length === 0 ? 'none' : null,
          )
        }
        if (state.call) {
          mediaRef.current = {
            mic: !state.call.isMuted,
            cam: state.call.localVideoStreams.some((s) => s.mediaStreamType === 'Video'),
          }
          if (state.call.state === 'Connected') noteInCall(kind, entityId, mediaRef.current)
          const diagnostics = state.call.diagnostics
          report(diagnostics?.network.latest as Parameters<typeof report>[0])
          report(diagnostics?.media.latest as Parameters<typeof report>[0])
        }
        // Sharing stopped from the call's own controls (or by the browser)
        // takes the board off the class's screens too.
        const sharingNow = Boolean(state.call?.isScreenSharingOn)
        if (screenSharing && !sharingNow && boardStreamRef.current) {
          boardWantedRef.current = false
          releaseBoardStream()
        }
        screenSharing = sharingNow
        if (state.call?.state === 'Connected' && !inCallRef.current) {
          inCallRef.current = true
          if (muteOnJoin && !state.call.isMuted) void callAdapter.mute().catch(() => undefined)
          void serverCallId().then((id) =>
            callsApi
              .connected(kind, entityId, id)
              .then((result) => {
                setRecording(result.recording_active)
                if (result.recording_started) toast.info('This class is being recorded.')
              })
              .catch(() => undefined),
          )
        }
      })
      adapter.on('callEnded', (event) => {
        const code = event?.code
        const subCode = event?.subCode
        if (inCallRef.current) {
          inCallRef.current = false
          void callsApi.left(kind, entityId, { code, sub_code: subCode }).catch(() => undefined)
        }
        setRecording(false)
        setConnected(false)
        releaseBoardStream()

        // A call that dropped - the network went, not the person - comes back by itself:
        // no "You left the class", no Rejoin to find. Hanging up (code 0), being turned
        // away (401/403/404) or six drops in ten minutes still end on that screen.
        const now = Date.now()
        rejoinsRef.current = rejoinsRef.current.filter((t) => now - t < 10 * 60_000)
        const dropped = code != null && code >= 400 && ![401, 403, 404].includes(code)
        if (dropped && !cancelled && rejoinsRef.current.length < 6) {
          rejoinsRef.current.push(now)
          resumeRef.current = { ...mediaRef.current }
          setReconnecting(true)
          window.setTimeout(() => {
            if (!cancelled) setAttempt((n) => n + 1)
          }, 1500)
          return
        }
        // Left on purpose (or gave up): a reload now should not put them back in.
        forgetInCall(kind, entityId)
        setReconnecting(false)
        setPhase({ name: 'left', session })
      })

      setPhase({ name: 'ready', session, adapter })
      setReconnecting(false)

      // Back into the call straight away after a drop, without the join screen.
      if (resume && kind !== 'exam') {
        try {
          adapter.joinCall({ microphoneOn: resume.mic, cameraOn: resume.cam })
        } catch (error) {
          console.error('Could not rejoin the call', error)
        }
      }

      // An exam room joins by itself - nobody should be able to forget to press Start call.
      // Cameras come on for everyone; students' microphones start off, so a full class is
      // not one open line, and the invigilator's starts on.
      if (kind === 'exam') {
        const examAdapter = adapter
        void (async () => {
          try {
            await examAdapter.askDevicePermission({ video: true, audio: true })
            const cameras = await examAdapter.queryCameras()
            if (cameras[0]) await examAdapter.setCamera(cameras[0])
            await examAdapter.queryMicrophones()
            await examAdapter.querySpeakers()
          } catch {
            // Permission refused or no device: join anyway; the call shows the camera off.
          }
          if (cancelled) return
          examAdapter.joinCall({ cameraOn: true, microphoneOn: session.is_host })
        })()
      }
    }

    void start()

    return () => {
      cancelled = true
      // Leaving the page inside the app is leaving the class. (A reload never gets here,
      // so it keeps the note and comes straight back in; an automatic rejoin carries its
      // own state in resumeRef.)
      forgetInCall(kind, entityId)
      delete (globalThis as { __H7_CLASS_GRID__?: number }).__H7_CLASS_GRID__
      delete (globalThis as { __H7_CLASS_VIDEOS__?: number }).__H7_CLASS_VIDEOS__
      if (inCallRef.current) {
        inCallRef.current = false
        void callsApi.left(kind, entityId).catch(() => undefined)
      }
      agentRef.current = null
      releaseBoardStream()
      setConnected(false)
      adapter?.dispose()
      agent?.dispose()
    }
  }, [kind, entityId, attempt, serverCallId, releaseBoardStream])

  // Keep the screen on while in a call. A tablet or phone that dims and locks halfway
  // through a lesson drops out of it; this is the commonest way students "lose" a class.
  React.useEffect(() => {
    const wakeLock = (navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
    }).wakeLock
    if (!connected || !wakeLock) return
    let lock: { release: () => Promise<void> } | null = null
    let stopped = false
    const acquire = async () => {
      try {
        const next = await wakeLock.request('screen')
        if (stopped) void next.release().catch(() => undefined)
        else lock = next
      } catch {
        // Refused (battery saver) or not allowed here: the call goes on regardless.
      }
    }
    void acquire()
    // The browser lets go of the lock when the tab is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !stopped) void acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => undefined)
    }
  }, [connected])

  // A closing tab cancels ordinary requests, so the leave goes out as a
  // keep-alive request instead.
  React.useEffect(() => {
    if (!kind) return
    const onUnload = () => {
      if (inCallRef.current) reportLeftOnUnload(kind, entityId)
    }
    window.addEventListener('pagehide', onUnload)
    return () => window.removeEventListener('pagehide', onUnload)
  }, [kind, entityId])

  const showBoard = React.useCallback(async () => {
    const call = agentRef.current?.calls[0]
    const canvas = boardCanvasRef.current
    if (!call || !canvas || boardStreamRef.current) return
    boardWantedRef.current = true
    setBoardSharing(true)
    const media = canvas.captureStream(15)
    try {
      // One screen share at a time: the board replaces a shared window.
      if (call.isScreenSharingOn) await call.stopScreenSharing()
      boardStreamRef.current = media
      await call.startScreenSharing(new LocalVideoStream(media))
      setBoardShared(true)
    } catch (error) {
      console.error('Could not show the whiteboard', error)
      boardWantedRef.current = false
      releaseBoardStream()
      media.getTracks().forEach((track) => track.stop())
      toast.error('The whiteboard could not be shown to the class. Try again.')
    } finally {
      setBoardSharing(false)
    }
  }, [releaseBoardStream])

  const hideBoard = React.useCallback(async () => {
    boardWantedRef.current = false
    if (!boardStreamRef.current) return
    const call = agentRef.current?.calls[0]
    releaseBoardStream()
    try {
      if (call?.isScreenSharingOn) await call.stopScreenSharing()
    } catch {
      // The call may already be over.
    }
  }, [releaseBoardStream])

  const openBoard = () => {
    setBoardMounted(true)
    setBoardOpen(true)
    boardWantedRef.current = true
  }

  const closeBoard = () => {
    setBoardOpen(false)
    void hideBoard()
  }

  React.useEffect(() => {
    if (connected && boardOpen && boardWantedRef.current && !boardStreamRef.current) void showBoard()
  }, [connected, boardOpen, showBoard])

  const leaveTo = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate(roleHome(user), { replace: true })
  }

  const toggleRecording = async () => {
    if (!kind) return
    setRecordingBusy(true)
    try {
      const result = await callsApi.recording(kind, entityId, recording ? 'stop' : 'start', await serverCallId())
      setRecording(result.recording_active)
      if (result.recording_active) {
        toast.success('Recording started.')
      } else if (kind === 'tuition') {
        toast.success('Recording stopped. The video will be saved shortly.')
      } else {
        // School classes land in the teacher's Recordings, where they are
        // reviewed and published to the class library.
        toast.success('Recording stopped. The video will be saved shortly.', {
          description: 'It will appear in Recordings for you to review and publish to the class.',
        })
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'The recording could not be changed.')
    } finally {
      setRecordingBusy(false)
    }
  }

  if (phase.name === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          {reconnecting
            ? 'Connection lost. Reconnecting…'
            : kind === 'exam'
              ? 'Opening the exam room…'
              : 'Opening your class…'}
        </div>
      </div>
    )
  }

  if (phase.name === 'blocked' || phase.name === 'left') {
    const left = phase.name === 'left'
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-4">
        <div className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted">
            {left ? <PhoneOff className="size-5" /> : <AlertCircle className="size-5 text-danger" />}
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold">{left ? 'You left the class' : 'You cannot join yet'}</h1>
            <p className="text-sm text-muted-foreground">
              {left ? phase.session.title : phase.message}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            {left && (
              <Button variant="primary" icon={<RotateCcw />} onClick={() => setAttempt((n) => n + 1)}>
                Rejoin
              </Button>
            )}
            {!left && kind && (
              <Button variant="outline" icon={<RotateCcw />} onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </Button>
            )}
            <Button variant="outline" icon={<ArrowLeft />} onClick={leaveTo}>
              Back to the LMS
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const { session, adapter } = phase
  const isExam = kind === 'exam'
  // In an exam room a student's column is narrow and the leaving goes through Leave on the
  // exam bar (which warns that the clock keeps running), so the call keeps only what an
  // exam needs: camera, microphone and a raised hand.
  const examStudentControls = {
    displayType: 'compact' as const,
    realTimeTextButton: false,
    endCallButton: false,
    screenShareButton: false,
    moreButton: false,
    reactionButton: false,
    peopleButton: false,
    participantsButton: false,
    devicesButton: false,
    holdButton: false,
    captionsButton: false,
  }
  const composite = (
    <CallComposite
      adapter={adapter}
      icons={CALL_ICONS}
      locale={CALL_LOCALE}
      fluentTheme={resolved === 'dark' ? darkTheme : lightTheme}
      formFactor={window.matchMedia('(max-width: 640px)').matches ? 'mobile' : 'desktop'}
      options={
        isExam
          ? { callControls: session.is_host ? { screenShareButton: false, realTimeTextButton: false } : examStudentControls }
          : undefined
      }
    />
  )

  if (isExam) {
    // A live-invigilated exam. A student answers the paper with the cameras beside it; the
    // teacher watches the cameras with the class's progress and the paper beside them.
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        <header className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-1.5 sm:px-4">
          {session.is_host && (
            <Button variant="ghost" size="sm" icon={<ArrowLeft />} onClick={leaveTo} aria-label="Back to the LMS" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{session.title} · exam room</p>
            <p className="truncate text-xs text-muted-foreground">
              {[session.subtitle, session.ends_at && `Open until ${formatDateTime(session.ends_at)}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {!session.is_host && (
            <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">
              Keep your camera on
            </span>
          )}
        </header>
        {session.is_host ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
            <div className="relative min-h-0 min-w-0 flex-1">{composite}</div>
            <aside className="max-h-[45dvh] min-h-0 overflow-y-auto border-t border-border lg:max-h-none lg:w-[400px] lg:border-l lg:border-t-0">
              <InvigilatorPanel examId={Number(entityId)} />
            </aside>
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
            <div className="min-h-0 min-w-0 flex-[3] overflow-y-auto p-3">
              <StudentExamTakeView examId={Number(entityId)} inRoom sideSlot={examSideSlot} />
            </div>
            <div className="flex max-h-[55dvh] flex-none flex-col border-t border-border bg-card lg:max-h-none lg:w-[400px] lg:border-l lg:border-t-0">
              <div className="relative h-60 flex-none overflow-hidden lg:h-[320px]">{composite}</div>
              <div ref={setExamSideSlot} className="min-h-0 flex-1 overflow-y-auto border-t border-border" />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-1.5 sm:px-4">
        <Button variant="ghost" size="sm" icon={<ArrowLeft />} onClick={leaveTo} aria-label="Back to the LMS" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{session.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[session.subtitle, session.ends_at && `Open until ${formatDateTime(session.ends_at)}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {recording && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger">
            <Circle className="size-2.5 fill-current" />
            Recording
          </span>
        )}
        {kind === 'class' && session.is_host && (
          <Button
            variant={registerOpen ? 'solid' : 'outline'}
            size="sm"
            icon={<ClipboardCheck />}
            onClick={() => setRegisterOpen(true)}
          >
            {register.data && !register.data.taken ? 'Attendance · not taken' : 'Attendance'}
          </Button>
        )}
        {session.is_host && (
          <Button
            variant={boardOpen ? 'solid' : 'outline'}
            size="sm"
            icon={<Presentation />}
            onClick={boardOpen ? closeBoard : openBoard}
            aria-pressed={boardOpen}
          >
            Whiteboard
          </Button>
        )}
        {session.is_host && (
          <Button
            variant="outline"
            size="sm"
            loading={recordingBusy}
            icon={recording ? <Square /> : <Circle />}
            onClick={toggleRecording}
          >
            {recording ? 'Stop recording' : 'Record'}
          </Button>
        )}
      </header>
      {deviceTrouble && !deviceHelpHidden && (
        <DeviceHelp trouble={deviceTrouble} isHost={session.is_host} onDismiss={() => setDeviceHelpHidden(true)} />
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        {boardMounted && kind && (
          <Whiteboard
            storageKey={`h7lms.whiteboard.${new Date().toLocaleDateString('en-CA')}.${kind}.${entityId}`}
            canvasRef={boardCanvasRef}
            open={boardOpen}
            shared={boardShared}
            sharing={boardSharing}
            canShare={connected}
            onShare={() => void showBoard()}
            onStopSharing={() => void hideBoard()}
            onClose={closeBoard}
            className="min-h-0 min-w-0 flex-[3]"
          />
        )}
        <div
          className={cn(
            'relative min-h-0 min-w-0 flex-1',
            // With the board open the call shrinks to a strip (phones) or a
            // side column, still in the same place so it is not restarted.
            boardOpen && 'h-56 flex-none border-t border-border lg:h-auto lg:w-[360px] lg:border-l lg:border-t-0',
          )}
        >
          <CallComposite
            adapter={adapter}
            icons={CALL_ICONS}
            locale={CALL_LOCALE}
            fluentTheme={resolved === 'dark' ? darkTheme : lightTheme}
            formFactor={window.matchMedia('(max-width: 640px)').matches ? 'mobile' : 'desktop'}
            options={CLASS_CALL_OPTIONS}
          />
        </div>
      </div>

      {kind === 'class' && session.is_host && (
        <Sheet open={registerOpen} onOpenChange={setRegisterOpen}>
          <SheetContent side="right" className="flex w-full max-w-md flex-col">
            <SheetHeader>
              <SheetTitle>Attendance for this period</SheetTitle>
            </SheetHeader>
            <SheetBody className="flex min-h-0 flex-1 flex-col">
              <RegisterPanel classId={Number(entityId)} />
            </SheetBody>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}

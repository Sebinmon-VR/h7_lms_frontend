import type { CallAgent } from '@azure/communication-calling'
import { AzureCommunicationTokenCredential } from '@azure/communication-common'
import {
  CallComposite,
  createAzureCommunicationCallAdapterFromClient,
  createStatefulCallClient,
  darkTheme,
  lightTheme,
  type CallAdapter,
} from '@azure/communication-react'
import { AlertCircle, ArrowLeft, Circle, Loader2, PhoneOff, RotateCcw, Square } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { CALL_KINDS, callsApi, reportLeftOnUnload, type CallKind, type CallSession } from '@/api/calls.api'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/datetime'
import { roleHome, useAuth } from '@/providers/auth-provider'
import { useTheme } from '@/providers/theme-provider'

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

  const agentRef = React.useRef<CallAgent | null>(null)
  // True between the call connecting and this person leaving it, so a leave is
  // reported exactly once however the page is exited.
  const inCallRef = React.useRef(false)

  const serverCallId = React.useCallback(async (): Promise<string | null> => {
    try {
      return (await agentRef.current?.calls[0]?.info.getServerCallId()) ?? null
    } catch {
      return null
    }
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
        session = await callsApi.open(kind, entityId)
      } catch (error) {
        if (cancelled) return
        const message =
          error instanceof ApiError ? error.message : 'The class could not be opened. Try again in a moment.'
        setPhase({ name: 'blocked', message })
        return
      }

      try {
        const credential = new AzureCommunicationTokenCredential({
          token: session.token,
          refreshProactively: true,
          // Renewed through the same gate: a class whose window has closed
          // stops handing out tokens, and the call ends with it.
          tokenRefresher: async () => (await callsApi.open(kind, entityId)).token,
        })
        const userId = { communicationUserId: session.acs_user_id }
        const callClient = createStatefulCallClient({ userId })
        agent = await callClient.createCallAgent(credential, { displayName: session.display_name })
        adapter = await createAzureCommunicationCallAdapterFromClient(callClient, agent, {
          roomId: session.room_id,
        })
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

      adapter.onStateChange((state) => {
        if (state.call?.state === 'Connected' && !inCallRef.current) {
          inCallRef.current = true
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
      adapter.on('callEnded', () => {
        if (inCallRef.current) {
          inCallRef.current = false
          void callsApi.left(kind, entityId).catch(() => undefined)
        }
        setRecording(false)
        setPhase({ name: 'left', session })
      })

      setPhase({ name: 'ready', session, adapter })
    }

    void start()

    return () => {
      cancelled = true
      if (inCallRef.current) {
        inCallRef.current = false
        void callsApi.left(kind, entityId).catch(() => undefined)
      }
      agentRef.current = null
      adapter?.dispose()
      agent?.dispose()
    }
  }, [kind, entityId, attempt, serverCallId])

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
          Opening your class…
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
  return (
    <div className="flex h-dvh flex-col bg-background">
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
      <div className="relative min-h-0 flex-1">
        <CallComposite
          adapter={adapter}
          fluentTheme={resolved === 'dark' ? darkTheme : lightTheme}
          formFactor={window.matchMedia('(max-width: 640px)').matches ? 'mobile' : 'desktop'}
        />
      </div>
    </div>
  )
}

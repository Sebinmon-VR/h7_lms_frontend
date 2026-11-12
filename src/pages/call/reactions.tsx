import { Features, type Call, type DataChannelReceiver, type DataChannelSender, type Reaction } from '@azure/communication-calling'
import { getIdentifierRawId, type CommunicationIdentifier } from '@azure/communication-common'
import * as React from 'react'

import { cn } from '@/lib/cn'

/**
 * Reactions in a class call: a thumbs up, a heart, a star... floating up over the call with
 * the sender's name, for everybody in the class.
 *
 * Five of them are the call's own reactions (like, heart, laugh, surprised, applause), which
 * every Azure room call carries. The star is not one of those, so it travels on the call's
 * data channel, a small message line between the people in the call.
 *
 * The call's own reaction pictures are not used: they need animation sheets the school would
 * have to host, and a star could not be one of them anyway. This draws all of them the same way.
 */

type ReactionDef = { key: string; emoji: string; label: string; builtIn?: Reaction }

export const REACTIONS: ReactionDef[] = [
  { key: 'like', emoji: '👍', label: 'Thumbs up', builtIn: 'like' },
  { key: 'heart', emoji: '❤️', label: 'Love', builtIn: 'heart' },
  { key: 'star', emoji: '⭐', label: 'Star' },
  { key: 'applause', emoji: '👏', label: 'Clap', builtIn: 'applause' },
  { key: 'laugh', emoji: '😂', label: 'Laugh', builtIn: 'laugh' },
  { key: 'surprised', emoji: '😮', label: 'Wow', builtIn: 'surprised' },
]

const BY_KEY = new Map(REACTIONS.map((r) => [r.key, r]))
const BY_BUILT_IN = new Map(REACTIONS.filter((r) => r.builtIn).map((r) => [r.builtIn as string, r]))

/** The data channel the star goes on; any number of the app's own works, the same everywhere. */
const CHANNEL = 1007
/** One reaction a person every so often: enough to cheer, not enough to flood the class. */
const SEND_GAP_MS = 700
/** How many are floating at once; a whole class clapping still stays readable. */
const MAX_FLOATING = 24
const FLOAT_MS = 3200

type Floating = { id: number; emoji: string; name: string; x: number }

const rawId = (identifier: CommunicationIdentifier | undefined) => {
  try {
    return identifier ? getIdentifierRawId(identifier) : ''
  } catch {
    return ''
  }
}

/**
 * Sends and receives a call's reactions. `me` is this person's own calling id: their own
 * reactions are shown straight away, so the call's copy of them is skipped.
 */
export function useClassReactions(call: Call | undefined, me: string | undefined) {
  const [floating, setFloating] = React.useState<Floating[]>([])
  const nextId = React.useRef(0)
  const lastSent = React.useRef(0)
  const senderRef = React.useRef<{ call: Call; sender: DataChannelSender } | null>(null)

  const show = React.useCallback((emoji: string, name: string) => {
    const id = (nextId.current += 1)
    const x = 8 + Math.random() * 84
    setFloating((all) => [...all.slice(-(MAX_FLOATING - 1)), { id, emoji, name, x }])
    window.setTimeout(() => setFloating((all) => all.filter((f) => f.id !== id)), FLOAT_MS)
  }, [])

  React.useEffect(() => {
    if (!call) return
    const nameOf = (id: string) =>
      call.remoteParticipants.find((p) => rawId(p.identifier) === id)?.displayName?.trim() || 'Someone'

    const reactions = call.feature(Features.Reaction)
    const onReaction = (event: { identifier: CommunicationIdentifier; reactionMessage: { reactionType: Reaction } }) => {
      const from = rawId(event.identifier)
      if (from && from === me) return
      const reaction = BY_BUILT_IN.get(event.reactionMessage.reactionType)
      if (reaction) show(reaction.emoji, nameOf(from))
    }
    reactions.on('reaction', onReaction)

    // The star, and anything else the call's own reactions do not have.
    const decoder = new TextDecoder()
    const onReceiver = (receiver: DataChannelReceiver) => {
      if (receiver.channelId !== CHANNEL) return
      const from = rawId(receiver.senderParticipantIdentifier)
      receiver.on('messageReady', () => {
        for (let message = receiver.readMessage(); message; message = receiver.readMessage()) {
          try {
            const { r } = JSON.parse(decoder.decode(message.data)) as { r?: string }
            const reaction = r ? BY_KEY.get(r) : undefined
            if (reaction && from !== me) show(reaction.emoji, nameOf(from))
          } catch {
            // Not one of ours.
          }
        }
      })
    }
    try {
      call.feature(Features.DataChannel).on('dataChannelReceiverCreated', onReceiver)
    } catch {
      // No data channel here: the star then only shows on the sender's own screen.
    }

    return () => {
      reactions.off('reaction', onReaction)
      try {
        call.feature(Features.DataChannel).off('dataChannelReceiverCreated', onReceiver)
      } catch {
        // Nothing was listening.
      }
      if (senderRef.current?.call === call) {
        try {
          senderRef.current.sender.close()
        } catch {
          // Already closed with the call.
        }
        senderRef.current = null
      }
    }
  }, [call, me, show])

  /** Sends a reaction to the class; false when it was too soon after the last one. */
  const send = React.useCallback(
    (key: string) => {
      const reaction = BY_KEY.get(key)
      if (!reaction || !call) return false
      const now = Date.now()
      if (now - lastSent.current < SEND_GAP_MS) return false
      lastSent.current = now
      show(reaction.emoji, 'You')
      if (reaction.builtIn) {
        void call
          .feature(Features.Reaction)
          .sendReaction({ reactionType: reaction.builtIn })
          .catch((error) => console.warn('Reaction not sent', error))
        return true
      }
      try {
        if (senderRef.current?.call !== call) {
          const sender = call.feature(Features.DataChannel).createDataChannelSender({
            channelId: CHANNEL,
            reliability: 'Durable',
            priority: 'Normal',
          })
          senderRef.current = { call, sender }
        }
        void senderRef.current.sender
          .sendMessage(new TextEncoder().encode(JSON.stringify({ r: reaction.key })))
          .catch((error) => console.warn('Reaction not sent', error))
      } catch (error) {
        console.warn('Reaction not sent', error)
      }
      return true
    },
    [call, show],
  )

  return { floating, send }
}

/** The reactions floating up over the call. Lets every tap through to the call below. */
export function ReactionLayer({ floating }: { floating: Floating[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-live="polite">
      <style>{`
        @keyframes h7-reaction-rise {
          0% { transform: translate(-50%, 0) scale(.6); opacity: 0 }
          10% { transform: translate(-50%, -4%) scale(1.1); opacity: 1 }
          75% { opacity: 1 }
          100% { transform: translate(-50%, -260%) scale(1); opacity: 0 }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes h7-reaction-rise { 0% { opacity: 0 } 15% { opacity: 1 } 80% { opacity: 1 } 100% { opacity: 0 } }
        }
      `}</style>
      {floating.map((f) => (
        <div
          key={f.id}
          className="absolute bottom-24 flex flex-col items-center gap-1"
          style={{ left: `${f.x}%`, animation: `h7-reaction-rise ${FLOAT_MS}ms ease-out forwards` }}
        >
          <span className="text-4xl leading-none drop-shadow-md sm:text-5xl" aria-hidden>
            {f.emoji}
          </span>
          <span className="max-w-32 truncate rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
            {f.name}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The row of reactions opened by the call's React button. */
export function ReactionPicker({
  open,
  onPick,
  onClose,
  buttonId,
}: {
  open: boolean
  onPick: (key: string) => void
  onClose: () => void
  /** The React button's id: a tap on it toggles the picker, so it is not an outside tap. */
  buttonId: string
}) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (ref.current?.contains(target) || target?.closest(`#${buttonId}`)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, buttonId])

  if (!open) return null
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Reactions"
      className="absolute bottom-20 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border bg-card/95 p-1 shadow-lg backdrop-blur"
    >
      {REACTIONS.map((r) => (
        <button
          key={r.key}
          type="button"
          title={r.label}
          aria-label={r.label}
          onClick={() => onPick(r.key)}
          className={cn(
            'grid size-11 place-items-center rounded-full text-2xl leading-none transition-transform',
            'hover:scale-125 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95',
          )}
        >
          {r.emoji}
        </button>
      ))}
    </div>
  )
}

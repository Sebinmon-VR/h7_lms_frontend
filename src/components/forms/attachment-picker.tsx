import {
  ExternalLink,
  FileAudio,
  FileText,
  Image as ImageIcon,
  Mic,
  Paperclip,
  Square,
  Trash2,
} from 'lucide-react'
import * as React from 'react'

import type { TopicAttachmentOut } from '@/api/types'
import { cn } from '@/lib/cn'
import { MAX_UPLOAD_BYTES, formatFileSize, resolveFileUrl } from '@/lib/files'
import { Button } from '@/components/ui/button'

/**
 * Attachments for a record: notes (any document), images and voice clips.
 *
 * The picker holds files the person has chosen but not yet sent — a topic is
 * created first and its attachments uploaded after — and the list shows what
 * is already stored. Voice notes are recorded here, in the browser, with the
 * MediaRecorder API; a phone or laptop microphone is all a teacher needs to
 * leave a two-minute recap for the class.
 */

export type AttachmentKind = 'NOTE' | 'IMAGE' | 'AUDIO'

export type PendingAttachment = {
  id: string
  file: File
  kind: AttachmentKind
  /** Object URL for an image thumbnail or audio player; revoked on removal. */
  previewUrl: string | null
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|heic|heif|bmp|svg|avif)$/i
const AUDIO_EXT = /\.(webm|weba|m4a|mp3|wav|ogg|oga|aac|opus|amr|3gp)$/i

export function attachmentKind(file: { type?: string | null; name?: string | null }): AttachmentKind {
  const type = (file.type ?? '').toLowerCase()
  if (type.startsWith('image/')) return 'IMAGE'
  if (type.startsWith('audio/')) return 'AUDIO'
  const name = file.name ?? ''
  if (IMAGE_EXT.test(name)) return 'IMAGE'
  if (AUDIO_EXT.test(name)) return 'AUDIO'
  return 'NOTE'
}

export function AttachmentKindIcon({ kind, className }: { kind: AttachmentKind | string; className?: string }) {
  const cls = cn('size-4', className)
  if (kind === 'IMAGE') return <ImageIcon className={cls} />
  if (kind === 'AUDIO') return <FileAudio className={cls} />
  return <FileText className={cls} />
}

export function kindLabel(kind: AttachmentKind | string): string {
  if (kind === 'IMAGE') return 'Image'
  if (kind === 'AUDIO') return 'Voice note'
  return 'Notes'
}

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Records from the microphone and hands the clip back as a File.
 *
 * Picks the first container the browser can encode (Opus in WebM on Chrome
 * and Firefox, MP4/AAC on Safari); the server stores whatever arrives and the
 * same browsers play it back. `stop` resolves once the last chunk has landed.
 */
export function useVoiceRecorder() {
  const [recording, setRecording] = React.useState(false)
  const [seconds, setSeconds] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const timerRef = React.useRef<number | null>(null)
  const resolveRef = React.useRef<((file: File | null) => void) | null>(null)

  const supported =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const start = async () => {
    setError(null)
    if (!supported) {
      setError('This browser cannot record audio. Try Chrome, Edge, Firefox or a recent Safari.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(
        (t) => MediaRecorder.isTypeSupported(t),
      )
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const type = recorder.mimeType || mimeType || 'audio/webm'
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
        const blob = new Blob(chunksRef.current, { type })
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
        const file = blob.size > 0 ? new File([blob], `voice-note-${stamp}.${ext}`, { type }) : null
        resolveRef.current?.(file)
        resolveRef.current = null
      }
      recorder.start(250)
      recorderRef.current = recorder
      setSeconds(0)
      setRecording(true)
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch (err) {
      setError(
        err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
          ? 'Microphone access was refused. Allow it for this site in the browser and try again.'
          : 'Could not start the microphone.',
      )
    }
  }

  const stop = () =>
    new Promise<File | null>((resolve) => {
      const recorder = recorderRef.current
      clearTimer()
      setRecording(false)
      if (!recorder || recorder.state === 'inactive') {
        resolve(null)
        return
      }
      resolveRef.current = resolve
      recorderRef.current = null
      recorder.stop()
    })

  React.useEffect(
    () => () => {
      clearTimer()
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.stream.getTracks().forEach((t) => t.stop())
        recorder.stop()
      }
    },
    [],
  )

  return { supported, recording, seconds, error, start, stop }
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Files chosen but not yet uploaded: pick notes or images, or record a voice note. */
export function AttachmentPicker({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: PendingAttachment[]
  onChange: (next: PendingAttachment[]) => void
  disabled?: boolean
  className?: string
}) {
  const recorder = useVoiceRecorder()
  const [error, setError] = React.useState<string | null>(null)
  const notesInput = React.useRef<HTMLInputElement>(null)
  const imageInput = React.useRef<HTMLInputElement>(null)

  const add = (files: FileList | File[] | null) => {
    if (!files) return
    const next = [...value]
    let problem: string | null = null
    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        problem = `${file.name} is ${formatFileSize(file.size)}; the limit is ${formatFileSize(MAX_UPLOAD_BYTES)}.`
        continue
      }
      const kind = attachmentKind(file)
      next.push({
        id: newId(),
        file,
        kind,
        previewUrl: kind === 'IMAGE' || kind === 'AUDIO' ? URL.createObjectURL(file) : null,
      })
    }
    setError(problem)
    onChange(next)
  }

  const remove = (id: string) => {
    const gone = value.find((a) => a.id === id)
    if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl)
    onChange(value.filter((a) => a.id !== id))
  }

  const toggleRecording = async () => {
    if (recorder.recording) {
      const file = await recorder.stop()
      if (file) add([file])
    } else {
      await recorder.start()
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={notesInput}
          type="file"
          multiple
          className="sr-only"
          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.rtf,.odt,.zip"
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={imageInput}
          type="file"
          multiple
          className="sr-only"
          accept="image/*"
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ''
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => notesInput.current?.click()}>
          <Paperclip />
          Attach notes
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => imageInput.current?.click()}>
          <ImageIcon />
          Add images
        </Button>
        <Button
          type="button"
          variant={recorder.recording ? 'primary' : 'outline'}
          size="sm"
          disabled={disabled || !recorder.supported}
          onClick={() => void toggleRecording()}
          className={cn(recorder.recording && 'animate-pulse-ring')}
          title={recorder.supported ? undefined : 'This browser cannot record audio.'}
        >
          {recorder.recording ? <Square /> : <Mic />}
          {recorder.recording ? `Stop · ${formatSeconds(recorder.seconds)}` : 'Record a voice note'}
        </Button>
      </div>

      {(error || recorder.error) && (
        <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">
          {error ?? recorder.error}
        </p>
      )}

      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"
            >
              {item.kind === 'IMAGE' && item.previewUrl ? (
                <img
                  src={item.previewUrl}
                  alt=""
                  className="size-10 shrink-0 rounded-md object-cover"
                />
              ) : (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <AttachmentKindIcon kind={item.kind} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {kindLabel(item.kind)} · {formatFileSize(item.file.size)}
                </p>
                {item.kind === 'AUDIO' && item.previewUrl && (
                  <audio controls preload="metadata" src={item.previewUrl} className="mt-1.5 h-8 w-full max-w-xs" />
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${item.file.name}`}
                disabled={disabled}
                onClick={() => remove(item.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Attachments already stored on a record. Images open full size, voice notes
 * play inline, anything else opens in a new tab. `onRemove` adds a delete
 * button for the owner.
 */
export function AttachmentList({
  attachments,
  onRemove,
  removingId = null,
  compact = false,
  className,
}: {
  attachments: TopicAttachmentOut[]
  onRemove?: (attachment: TopicAttachmentOut) => void
  removingId?: string | null
  compact?: boolean
  className?: string
}) {
  if (attachments.length === 0) return null
  return (
    <ul className={cn('space-y-1.5', className)}>
      {attachments.map((attachment) => {
        const url = resolveFileUrl(attachment.file_url)
        return (
          <li
            key={attachment.id}
            className={cn(
              'flex items-center gap-3 rounded-lg border border-border text-sm',
              compact ? 'px-2.5 py-1.5' : 'px-3 py-2',
            )}
          >
            {attachment.kind === 'IMAGE' && url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <img src={url} alt={attachment.file_name ?? 'Image'} className="size-10 rounded-md object-cover" />
              </a>
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <AttachmentKindIcon kind={attachment.kind} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1 truncate font-medium hover:underline"
                >
                  <span className="truncate">{attachment.file_name ?? kindLabel(attachment.kind)}</span>
                  <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                </a>
              ) : (
                <p className="truncate font-medium">{attachment.file_name ?? kindLabel(attachment.kind)}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {kindLabel(attachment.kind)}
                {attachment.size_bytes ? ` · ${formatFileSize(attachment.size_bytes)}` : ''}
                {attachment.storage_warning ? ' · stored on the server disk' : ''}
              </p>
              {attachment.kind === 'AUDIO' && url && (
                <audio controls preload="metadata" src={url} className="mt-1.5 h-8 w-full max-w-xs" />
              )}
            </div>
            {onRemove && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${attachment.file_name ?? 'attachment'}`}
                loading={removingId === attachment.id}
                onClick={() => onRemove(attachment)}
              >
                <Trash2 />
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

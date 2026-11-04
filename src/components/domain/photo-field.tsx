import { Camera, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { adminApi } from '@/api/admin.api'
import { ApiError } from '@/api/errors'
import type { UserOut } from '@/api/types'
import { useRemoveUserPhoto, useUploadUserPhoto } from '@/queries/admin.queries'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// Any picture: the crop window always saves a JPG, so the original format only
// matters for opening it. HEIC is listed by extension because Windows often
// reports no type for it, and the file dialog would hide it.
const ACCEPT = 'image/*,.heic,.heif'
/** The crop window, in screen pixels. */
const VIEW = 288
/** The saved photo: the size it is shown at, so a phone picture does not upload megabytes. */
const OUT = 512
const MAX_ZOOM = 4

type Offset = { x: number; y: number }

/** Whether this browser can draw the picture itself, without the server's help. */
async function browserOpens(file: File): Promise<boolean> {
  const url = URL.createObjectURL(file)
  try {
    const probe = new Image()
    probe.src = url
    await probe.decode()
    return probe.naturalWidth > 0
  } catch {
    return false
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Pick the part of the picture that becomes the photo: drag to move it, zoom
 * to bring a face closer. The circle is what every avatar will show; the
 * saved file is the square around it.
 */
function CropDialog({
  file,
  saving,
  onCancel,
  onSave,
}: {
  file: File
  saving: boolean
  onCancel: () => void
  onSave: (photo: Blob) => void
}) {
  // Made and revoked by the same effect: React mounts twice in development, and
  // a link made once but revoked on the first unmount leaves a dead picture.
  const [url, setUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    const link = URL.createObjectURL(file)
    setUrl(link)
    return () => URL.revokeObjectURL(link)
  }, [file])

  const [image, setImage] = React.useState<HTMLImageElement | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [zoom, setZoom] = React.useState(1)
  const [offset, setOffset] = React.useState<Offset>({ x: 0, y: 0 })
  const drag = React.useRef<{ pointerX: number; pointerY: number; from: Offset } | null>(null)

  // At zoom 1 the shorter side just fills the window, so there is never a gap.
  const base = image ? VIEW / Math.min(image.naturalWidth, image.naturalHeight) : 1
  const scale = base * zoom

  const clamp = React.useCallback(
    (next: Offset, atScale: number): Offset => {
      if (!image) return next
      return {
        x: Math.min(0, Math.max(VIEW - image.naturalWidth * atScale, next.x)),
        y: Math.min(0, Math.max(VIEW - image.naturalHeight * atScale, next.y)),
      }
    },
    [image],
  )

  const loaded = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget
    const fit = VIEW / Math.min(img.naturalWidth, img.naturalHeight)
    setImage(img)
    setOffset({
      x: (VIEW - img.naturalWidth * fit) / 2,
      y: (VIEW - img.naturalHeight * fit) / 2,
    })
  }

  /** Zooms about the middle of the window, so the face in the circle stays put. */
  const zoomTo = (value: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(1, value))
    const nextScale = base * next
    const centreX = (VIEW / 2 - offset.x) / scale
    const centreY = (VIEW / 2 - offset.y) / scale
    setZoom(next)
    setOffset(
      clamp({ x: VIEW / 2 - centreX * nextScale, y: VIEW / 2 - centreY * nextScale }, nextScale),
    )
  }

  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointerX: event.clientX, pointerY: event.clientY, from: offset }
  }
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (!start) return
    setOffset(
      clamp(
        {
          x: start.from.x + event.clientX - start.pointerX,
          y: start.from.y + event.clientY - start.pointerY,
        },
        scale,
      ),
    )
  }
  const pointerUp = () => {
    drag.current = null
  }

  const save = () => {
    if (!image) return
    const side = VIEW / scale
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = Math.round(Math.min(OUT, side))
    const context = canvas.getContext('2d')
    if (!context) {
      toast.error('This browser could not prepare the picture.')
      return
    }
    context.drawImage(image, -offset.x / scale, -offset.y / scale, side, side, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => (blob ? onSave(blob) : toast.error('This browser could not prepare the picture.')),
      'image/jpeg',
      0.9,
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Crop photo</DialogTitle>
        <DialogDescription>Drag the picture to move it. Zoom to bring the face closer.</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col items-center gap-5">
        {failed ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            This picture could not be opened. Please choose a different one.
          </p>
        ) : (
          <>
            <div
              className="relative cursor-grab touch-none select-none overflow-hidden rounded-lg bg-muted active:cursor-grabbing"
              style={{ width: VIEW, height: VIEW }}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerCancel={pointerUp}
            >
              <img
                src={url ?? undefined}
                alt=""
                draggable={false}
                onLoad={loaded}
                onError={() => setFailed(true)}
                className="pointer-events-none absolute left-0 top-0 max-w-none"
                style={
                  image
                    ? {
                        width: image.naturalWidth * scale,
                        height: image.naturalHeight * scale,
                        transform: `translate(${offset.x}px, ${offset.y}px)`,
                      }
                    : { visibility: 'hidden' }
                }
              />
              {/* Darkens everything the circle will not show. */}
              <div
                className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/90"
                style={{ boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.5)' }}
              />
            </div>
            <div className="flex w-full max-w-72 items-center gap-3">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => zoomTo(zoom - 0.25)}
                aria-label="Zoom out"
              >
                <ZoomOut className="size-4" />
              </button>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(event) => zoomTo(event.target.valueAsNumber)}
                className="h-9.5 w-full accent-[hsl(var(--primary))]"
                aria-label="Zoom"
              />
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => zoomTo(zoom + 0.25)}
                aria-label="Zoom in"
              >
                <ZoomIn className="size-4" />
              </button>
            </div>
          </>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={save} loading={saving} disabled={!image || failed}>
          Save photo
        </Button>
      </DialogFooter>
    </>
  )
}

/** Upload, change or remove a person's profile photo. Saves on its own, not with the form. */
export function PhotoField({ user }: { user: UserOut }) {
  const input = React.useRef<HTMLInputElement>(null)
  const [chosen, setChosen] = React.useState<File | null>(null)
  const upload = useUploadUserPhoto()
  const remove = useRemoveUserPhoto()
  const [converting, setConverting] = React.useState(false)
  const busy = upload.isPending || remove.isPending || converting

  const choose = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (await browserOpens(file)) {
      setChosen(file)
      return
    }
    // iPhone HEIC on Windows, TIFF, and whatever else this browser has no
    // decoder for: the server turns it into a JPG, which is then cropped here.
    setConverting(true)
    try {
      const jpeg = await adminApi.previewUserPhoto(file)
      setChosen(new File([jpeg], 'photo.jpg', { type: 'image/jpeg' }))
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.status === 413
          ? 'That picture is larger than 30 MB. Please choose a smaller one.'
          : 'This picture could not be opened. Please choose a different one.',
      )
    } finally {
      setConverting(false)
    }
  }

  const save = async (photo: Blob) => {
    try {
      await upload.mutateAsync({ userId: user.id, photo })
      setChosen(null)
      toast.success('Photo saved')
    } catch (error) {
      toast.error((error as { message?: string })?.message ?? 'Could not save the photo.')
    }
  }

  const clear = async () => {
    try {
      await remove.mutateAsync(user.id)
      toast.success('Photo removed')
    } catch (error) {
      toast.error((error as { message?: string })?.message ?? 'Could not remove the photo.')
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={user.full_name} src={user.photo_url} size="xl" />
      <div className="flex flex-wrap gap-2">
        <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={choose} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={converting}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Camera />
          {user.photo_url ? 'Change photo' : 'Upload photo'}
        </Button>
        {user.photo_url && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={remove.isPending}
            disabled={busy}
            onClick={clear}
          >
            <Trash2 />
            Remove
          </Button>
        )}
      </div>

      <Dialog open={!!chosen} onOpenChange={(open) => !open && !upload.isPending && setChosen(null)}>
        <DialogContent size="sm">
          {chosen && (
            <CropDialog
              key={`${chosen.name}-${chosen.lastModified}`}
              file={chosen}
              saving={upload.isPending}
              onCancel={() => setChosen(null)}
              onSave={save}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

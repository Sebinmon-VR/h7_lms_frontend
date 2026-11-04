import { Camera, Trash2 } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import type { UserOut } from '@/api/types'
import { adminApi } from '@/api/admin.api'
import { useRemoveUserPhoto, useUploadUserPhoto } from '@/queries/admin.queries'
import { cn } from '@/lib/cn'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

/** Long side of the stored photo. Plenty for any avatar, small enough to load instantly. */
const PHOTO_SIDE = 512

function loadImage(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('unreadable'))
    }
    img.src = url
  })
}

/** The centre square of the picture, scaled down, as a JPG. */
async function squareJpeg(img: HTMLImageElement): Promise<Blob> {
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  const out = Math.min(PHOTO_SIDE, side)
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, out, out)
  ctx.drawImage(
    img,
    (img.naturalWidth - side) / 2,
    (img.naturalHeight - side) / 2,
    side,
    side,
    0,
    0,
    out,
    out,
  )
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode'))), 'image/jpeg', 0.9),
  )
}

/**
 * A person's photo with Upload / Change / Remove. Saves straight away rather
 * than with the form: a photo is its own upload, and holding it until "Save
 * changes" would lose it to a validation error elsewhere on the page.
 */
export function PhotoUploader({
  user,
  layout = 'stacked',
  className,
}: {
  user: Pick<UserOut, 'id' | 'full_name' | 'photo_url'>
  /** Stacked: photo over its buttons. Inline: photo beside the name and buttons. */
  layout?: 'stacked' | 'inline'
  className?: string
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const upload = useUploadUserPhoto()
  const remove = useRemoveUserPhoto()
  const [preparing, setPreparing] = React.useState(false)
  const busy = preparing || upload.isPending || remove.isPending

  const onPick = async (file: File | undefined) => {
    if (!file) return
    setPreparing(true)
    try {
      let img: HTMLImageElement
      try {
        img = await loadImage(file)
      } catch {
        // HEIC from an iPhone, TIFF and the like: the server turns it into a
        // JPG the browser can draw, and the crop happens here as usual.
        img = await loadImage(await adminApi.previewUserPhoto(file))
      }
      const photo = await squareJpeg(img)
      await upload.mutateAsync({ userId: user.id, photo })
    } catch (error) {
      if (!upload.isError) {
        toast.error(error instanceof Error && error.message !== 'unreadable' ? error.message : 'This picture could not be opened.')
      }
    } finally {
      setPreparing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const inline = layout === 'inline'

  return (
    <div className={cn(inline ? 'flex items-center gap-5' : 'flex flex-col items-center text-center', className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={user.photo_url ? 'Change photo' : 'Upload photo'}
      >
        <Avatar name={user.full_name} src={user.photo_url} className={cn(inline ? 'size-20 text-xl' : 'size-24 text-2xl')} />
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white transition-opacity',
            busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          {busy ? (
            <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <Camera className="size-5" />
          )}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0])}
      />

      <div className={cn(inline && 'min-w-0')}>
        {inline && <p className="truncate text-lg font-semibold leading-tight">{user.full_name}</p>}
        <div className={cn('flex flex-wrap gap-1.5', inline ? 'mt-2' : 'mt-3 justify-center')}>
          <Button variant="outline" size="xs" icon={<Camera />} disabled={busy} onClick={() => inputRef.current?.click()}>
            {user.photo_url ? 'Change photo' : 'Upload photo'}
          </Button>
          {user.photo_url && (
            <Button
              variant="ghost"
              size="xs"
              icon={<Trash2 />}
              disabled={busy}
              onClick={() => remove.mutate(user.id)}
            >
              Remove
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-2xs text-muted-foreground">Square crop from the centre. Any picture format.</p>
      </div>
    </div>
  )
}

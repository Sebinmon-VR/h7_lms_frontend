import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Maximize2, Trash2, TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FileTypeIcon } from '@/components/domain/file-type-icon'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Shows a stored file inside the page - never a new tab or a download.
 *
 * The bytes come through the API with the user's sign-in (`load`), so the viewer works for
 * files a plain storage link could not open, and a student sitting a locked exam never has
 * to leave it. PDFs use the browser's own viewer in a frame, images are shown as they are,
 * and Word (.docx) files are rendered into the page. Older formats (.doc, .odt, .rtf) cannot
 * be drawn in a browser, so those say so instead.
 */

type Kind = 'pdf' | 'image' | 'docx' | 'other'

function kindOf(type: string, name: string): Kind {
  const lower = name.toLowerCase()
  if (type === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf'
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/.test(lower)) return 'image'
  if (type.includes('wordprocessingml') || lower.endsWith('.docx')) return 'docx'
  return 'other'
}

export function DocumentViewer({
  cacheKey,
  load,
  fileName,
  height = '75vh',
  className,
}: {
  /** Changes whenever the file does, so a replaced paper is fetched again. */
  cacheKey: string
  load: () => Promise<Blob>
  fileName?: string | null
  height?: string
  className?: string
}) {
  const query = useQuery({
    queryKey: ['document-view', cacheKey],
    queryFn: load,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  })
  const blob = query.data
  const kind = blob ? kindOf(blob.type || '', fileName ?? '') : null

  const objectUrl = React.useMemo(
    () => (blob && (kind === 'pdf' || kind === 'image') ? URL.createObjectURL(blob) : null),
    [blob, kind],
  )
  React.useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    },
    [objectUrl],
  )

  const docxRef = React.useRef<HTMLDivElement>(null)
  const [docxFailed, setDocxFailed] = React.useState(false)
  React.useEffect(() => {
    if (!blob || kind !== 'docx' || !docxRef.current) return
    let cancelled = false
    const target = docxRef.current
    target.innerHTML = ''
    setDocxFailed(false)
    import('docx-preview')
      .then(({ renderAsync }) =>
        renderAsync(blob, target, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: true }),
      )
      .catch(() => {
        if (!cancelled) setDocxFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [blob, kind])

  if (query.isPending) {
    return <Skeleton className={cn('w-full rounded-lg', className)} style={{ height: '50vh' }} />
  }

  if (query.isError || !blob) {
    return (
      <div className={cn('flex flex-col items-center gap-2 rounded-lg border border-border p-6 text-center text-sm', className)}>
        <TriangleAlert className="size-5 text-warning" />
        <p>This file could not be shown.</p>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (kind === 'pdf' && objectUrl) {
    return (
      <iframe
        src={objectUrl}
        title={fileName ?? 'Document'}
        className={cn('w-full rounded-lg border border-border bg-white', className)}
        style={{ height }}
      />
    )
  }

  if (kind === 'image' && objectUrl) {
    return (
      <div className={cn('overflow-auto rounded-lg border border-border bg-muted/40', className)} style={{ maxHeight: height }}>
        <img src={objectUrl} alt={fileName ?? 'Uploaded image'} className="mx-auto h-auto max-w-full" />
      </div>
    )
  }

  if (kind === 'docx') {
    return (
      <div className={className}>
        {docxFailed && (
          <p className="mb-2 text-sm text-warning">This Word file could not be shown. Ask for it as a PDF.</p>
        )}
        <div
          ref={docxRef}
          className="overflow-auto rounded-lg border border-border bg-white text-black"
          style={{ maxHeight: height }}
        />
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border border-border p-4 text-sm text-muted-foreground', className)}>
      This kind of file cannot be shown on the page. Ask for it as a PDF or a Word (.docx) file.
    </div>
  )
}

/**
 * A file's name with its actions: View (in place, or full screen where there is no room),
 * a full-screen button, and - when `onRemove` is given - Remove, which asks first.
 */
export function InlineFileRow({
  name,
  cacheKey,
  load,
  meta,
  defaultOpen = false,
  height,
  openInDialog = false,
  onRemove,
  removing = false,
}: {
  name: string
  cacheKey: string
  load: () => Promise<Blob>
  meta?: React.ReactNode
  defaultOpen?: boolean
  height?: string
  /** View opens full screen instead of in place - for narrow panels. */
  openInDialog?: boolean
  onRemove?: () => void
  removing?: boolean
}) {
  const [open, setOpen] = React.useState(defaultOpen && !openInDialog)
  const [full, setFull] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <FileTypeIcon url={name} size="sm" />
        <div className="ml-1.5 min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={name}>
            {name}
          </p>
          {meta && <p className="truncate text-2xs text-muted-foreground">{meta}</p>}
        </div>
        {openInDialog ? (
          <Button variant="ghost" size="sm" icon={<Maximize2 />} onClick={() => setFull(true)}>
            View
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={open ? <ChevronUp /> : <ChevronDown />}
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              {open ? 'Hide' : 'View'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Maximize2 />}
              onClick={() => setFull(true)}
              aria-label={`Show ${name} full screen`}
              title="Full screen"
            />
          </>
        )}
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 />}
            className="text-danger hover:text-danger"
            loading={removing}
            onClick={() => setConfirming(true)}
            aria-label={`Remove ${name}`}
            title="Remove"
          />
        )}
      </div>
      {open && (
        <div className="border-t border-border p-2">
          <DocumentViewer cacheKey={cacheKey} load={load} fileName={name} height={height} />
        </div>
      )}

      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent size="xl" className="h-[calc(100dvh-2rem)] max-w-[min(1400px,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{name}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 px-4 pb-4">
            {full && (
              <DocumentViewer cacheKey={cacheKey} load={load} fileName={name} height="calc(100dvh - 8rem)" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {onRemove && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title="Remove this file?"
          description={`“${name}” will be taken off your answers. You can upload it again before you hand in.`}
          confirmLabel="Remove"
          destructive
          loading={removing}
          onConfirm={() => {
            onRemove()
            setConfirming(false)
          }}
        />
      )}
    </div>
  )
}

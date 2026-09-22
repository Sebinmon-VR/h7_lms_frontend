import { AlertTriangle, Trash2 } from 'lucide-react'
import * as React from 'react'

import { ApiError, describeBlocking, toApiError } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Delete confirmation for the backend's guarded hard-deletes.
 *
 * The API refuses a delete that would orphan records: it returns 409 naming
 * every blocking resource and count, and only cascades when the caller retries
 * with `?force=true`. Rather than warning up front about a cascade that may
 * not apply, this dialog asks the server first — a class nobody references
 * deletes on the first click with no scary copy at all.
 *
 * On a 409 it switches into a second state that lists exactly what is in the
 * way and requires a separate opt-in before cascading, because a forced delete
 * removes attendance, topics, meetings, materials and grades irreversibly.
 */
export function DeleteResourceDialog({
  open,
  onOpenChange,
  resourceLabel,
  resourceName,
  description,
  supportsForce = true,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Lowercase singular, e.g. "class" or "subject". */
  resourceLabel: string
  /** The specific record's display name. */
  resourceName: string
  description?: React.ReactNode
  /** False for endpoints with no dependency guard, e.g. enrollments. */
  supportsForce?: boolean
  onDelete: (force: boolean) => Promise<unknown>
}) {
  const [busy, setBusy] = React.useState(false)
  const [conflict, setConflict] = React.useState<ApiError | null>(null)
  const [cascadeAcknowledged, setCascadeAcknowledged] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Reset per opening so a previous conflict never leaks into the next delete.
  React.useEffect(() => {
    if (!open) return
    setBusy(false)
    setConflict(null)
    setCascadeAcknowledged(false)
    setError(null)
  }, [open])

  const run = async (force: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await onDelete(force)
      onOpenChange(false)
    } catch (raw) {
      const apiError = toApiError(raw)
      if (apiError.isConflict && supportsForce) {
        setConflict(apiError)
      } else if (apiError.isConflict) {
        setError(describeBlocking(apiError))
      } else {
        setError(apiError.message)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            {conflict ? `This ${resourceLabel} is still in use` : `Delete this ${resourceLabel}?`}
          </DialogTitle>
          <DialogDescription>
            {conflict ? (
              <>
                Deleting <span className="font-medium text-foreground">{resourceName}</span> would leave
                other records pointing at nothing, so the server refused.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">{resourceName}</span> will be permanently
                removed. This cannot be undone.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {!conflict && description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}

          {conflict && (
            <>
              <ul className="space-y-1.5 rounded-lg border border-border bg-surface px-3 py-2.5">
                {conflict.blocking.length > 0 ? (
                  conflict.blocking.map((ref) => (
                    <li key={ref.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="capitalize text-muted-foreground">
                        {ref.label}
                        {ref.count === 1 ? '' : 's'}
                      </span>
                      <span className="font-mono text-xs font-semibold tabular-nums">{ref.count}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground">{describeBlocking(conflict)}</li>
                )}
              </ul>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2.5">
                <Checkbox
                  checked={cascadeAcknowledged}
                  onCheckedChange={(v) => setCascadeAcknowledged(v === true)}
                  className="mt-0.5"
                />
                <span className="text-sm text-danger">
                  <span className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="size-3.5" />
                    Delete everything listed above as well
                  </span>
                  <span className="mt-0.5 block text-xs opacity-90">
                    Attendance, grades and every other linked record are destroyed permanently. There
                    is no undo and no export.
                  </span>
                </span>
              </label>
            </>
          )}

          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          {conflict ? (
            <Button
              variant="danger"
              icon={<Trash2 />}
              loading={busy}
              disabled={!cascadeAcknowledged}
              onClick={() => run(true)}
            >
              Delete everything
            </Button>
          ) : (
            <Button variant="danger" icon={<Trash2 />} loading={busy} onClick={() => run(false)}>
              Delete {resourceLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

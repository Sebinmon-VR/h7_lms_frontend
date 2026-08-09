import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import * as React from 'react'

import { toApiError } from '@/api/errors'
import { cn } from '@/lib/cn'
import { ProgressBar } from '@/components/ui/progress'

export type BatchItemState = 'pending' | 'running' | 'success' | 'error'

export interface BatchItem {
  key: string
  label: string
  state: BatchItemState
  error?: string
}

/**
 * Several backend operations have no batch endpoint (enrollments, exam entry),
 * so the UI issues sequential requests. This runs them one at a time and
 * reports per-item outcomes, so a partial failure names exactly what did and
 * did not save.
 */
export function useBatchRunner<T>() {
  const [items, setItems] = React.useState<BatchItem[]>([])
  const [running, setRunning] = React.useState(false)
  const cancelled = React.useRef(false)

  const reset = React.useCallback(() => {
    setItems([])
    setRunning(false)
    cancelled.current = false
  }, [])

  const run = React.useCallback(
    async (entries: { key: string; label: string; payload: T }[], perform: (payload: T) => Promise<unknown>) => {
      cancelled.current = false
      setRunning(true)
      setItems(entries.map((e) => ({ key: e.key, label: e.label, state: 'pending' as const })))

      let succeeded = 0
      let failed = 0

      for (const entry of entries) {
        if (cancelled.current) break
        setItems((prev) => prev.map((i) => (i.key === entry.key ? { ...i, state: 'running' } : i)))
        try {
          await perform(entry.payload)
          succeeded += 1
          setItems((prev) => prev.map((i) => (i.key === entry.key ? { ...i, state: 'success' } : i)))
        } catch (error) {
          failed += 1
          const message = toApiError(error).message
          setItems((prev) =>
            prev.map((i) => (i.key === entry.key ? { ...i, state: 'error', error: message } : i)),
          )
        }
      }

      setRunning(false)
      return { succeeded, failed }
    },
    [],
  )

  const cancel = React.useCallback(() => {
    cancelled.current = true
  }, [])

  const done = items.filter((i) => i.state === 'success' || i.state === 'error').length
  const percent = items.length ? (done / items.length) * 100 : 0

  // Memoised so callers can safely put the whole object in an effect's deps.
  // `run`, `reset` and `cancel` are already stable via useCallback.
  return React.useMemo(
    () => ({ items, running, run, reset, cancel, done, percent, total: items.length }),
    [items, running, run, reset, cancel, done, percent],
  )
}

export function BatchProgress({
  items,
  percent,
  done,
  total,
}: {
  items: BatchItem[]
  percent: number
  done: number
  total: number
}) {
  if (items.length === 0) return null

  const failed = items.filter((i) => i.state === 'error')

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {done} of {total} processed
          </span>
          <span className="tabular-nums">{Math.round(percent)}%</span>
        </div>
        <ProgressBar value={percent} tone={failed.length ? 'warning' : 'primary'} />
      </div>

      <ul className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm">
            <span className="mt-0.5 shrink-0">
              {item.state === 'success' ? (
                <CheckCircle2 className="size-4 text-success" />
              ) : item.state === 'error' ? (
                <XCircle className="size-4 text-danger" />
              ) : item.state === 'running' ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : (
                <span className="block size-4 rounded-full border border-border" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block truncate', item.state === 'pending' && 'text-muted-foreground')}>
                {item.label}
              </span>
              {item.error && <span className="block text-xs text-danger">{item.error}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

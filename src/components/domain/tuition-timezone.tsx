import { Globe, Pin, PinOff } from 'lucide-react'
import * as React from 'react'

import { useSetMyTimezone, useTuitionProfile } from '@/queries/tuition.queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TimezonePicker } from './timezone-picker'

/**
 * Which zone this person's times are shown in, and how it was decided.
 *
 * The backend resolves an effective zone from three sources in order —
 * EXPLICIT (they pinned one), DETECTED (their browser reported it through the
 * `X-Timezone` header), then PROGRAMME. Detection is the good default: a
 * student sitting in London sees their classes at London time without touching
 * anything, and it follows them when they travel.
 *
 * So this card leads with what is already true rather than asking them to
 * configure something. Pinning exists for the two cases detection gets wrong:
 * a browser reporting the wrong zone, and somebody who wants their schedule
 * fixed to home time while they are away.
 *
 * When a pin disagrees with what the browser now reports, the card offers to
 * switch rather than switching — moving somebody's whole schedule under them
 * because they opened a laptop in an airport would be worse than being stale.
 */
export function TuitionTimezoneCard() {
  const profile = useTuitionProfile()
  const setTimezone = useSetMyTimezone()
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState<string | null>(null)

  if (profile.isPending) return <Skeleton className="h-28" />
  if (!profile.data) return null

  const { effective_timezone, timezone_source, detected_timezone, programme_timezone, user } =
    profile.data

  const pinned = timezone_source === 'EXPLICIT'
  // Only worth mentioning when a pin exists AND the browser now says otherwise.
  const driftedTo =
    pinned && detected_timezone && detected_timezone !== effective_timezone
      ? detected_timezone
      : null

  const save = (zone: string | null) =>
    setTimezone.mutate(zone, {
      onSuccess: () => {
        setEditing(false)
        setDraft(null)
      },
    })

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Globe className="size-4 text-primary" />
            Your times are shown in {effective_timezone}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {timezone_source === 'EXPLICIT' &&
              'You pinned this zone, so it stays put wherever you sign in from.'}
            {timezone_source === 'DETECTED' &&
              'Detected from your browser. It follows you automatically if you travel.'}
            {timezone_source === 'PROGRAMME' &&
              `Programme time (${programme_timezone}). Your browser has not reported a zone yet.`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={pinned ? 'primary' : 'neutral'} size="sm">
            {pinned ? <Pin /> : <Globe />}
            {pinned ? 'Pinned' : 'Automatic'}
          </Badge>
          {!editing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDraft(user.timezone ?? null)
                setEditing(true)
              }}
            >
              Change
            </Button>
          )}
        </div>
      </div>

      {driftedTo && !editing && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info/30 bg-info/8 px-3 py-2">
          <p className="text-sm">
            Your browser says you are in <strong>{driftedTo}</strong>, but your times are pinned to{' '}
            {effective_timezone}.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" loading={setTimezone.isPending} onClick={() => save(driftedTo)}>
              Use {driftedTo}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => save(null)}>
              <PinOff />
              Unpin
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <div className="mt-3 space-y-2">
          <TimezonePicker
            value={draft}
            onChange={setDraft}
            clearLabel="Follow my browser automatically"
            suggested={detected_timezone ?? null}
          />
          <p className="text-xs text-muted-foreground">
            Pinning is only needed to override detection — leave it automatic unless your browser
            has it wrong, or you want your times fixed to one zone while you travel.
          </p>
          <div className="flex gap-2">
            <Button size="sm" loading={setTimezone.isPending} onClick={() => save(draft)}>
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false)
                setDraft(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

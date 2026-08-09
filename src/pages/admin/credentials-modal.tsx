import { Check, Copy, Eye, EyeOff, KeyRound, Mail, MailWarning, ShieldAlert } from 'lucide-react'
import * as React from 'react'

import type { CredentialsIssued } from '@/api/types'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
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
import { RoleBadge } from '@/components/domain/badges'

/**
 * Copy-to-clipboard that reports its own outcome.
 *
 * Deliberately does not fall back to `document.execCommand` on failure: on a
 * non-secure origin the copy genuinely did not happen, and silently claiming
 * success would leave an admin closing the modal believing they had saved a
 * password they never captured.
 */
function useCopyField() {
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)
  const timer = React.useRef<number>()

  React.useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = React.useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setFailed(false)
      setCopiedKey(key)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      setFailed(true)
      setCopiedKey(null)
    }
  }, [])

  return { copiedKey, failed, copy }
}

function CredentialRow({
  label,
  value,
  monospace,
  masked,
  copied,
  onCopy,
}: {
  label: string
  value: string
  monospace?: boolean
  masked?: boolean
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <code
          className={cn(
            'min-w-0 flex-1 truncate text-sm',
            monospace && 'font-mono',
            masked && 'tracking-widest',
          )}
        >
          {value}
        </code>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={onCopy}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </div>
    </div>
  )
}

/**
 * Shows an issued email and password exactly once.
 *
 * The backend does not store the password and cannot return it again, so this
 * modal is the only chance to capture it. That drives three decisions:
 *
 *  - it cannot be dismissed by clicking away or pressing Escape, only by an
 *    explicit acknowledgement;
 *  - the password is never logged, persisted, or written to the query cache;
 *  - a failed email delivery reads as a WARNING, not an error — the account
 *    works, and the admin simply has to hand the password over themselves.
 */
export function CredentialsModal({
  credentials,
  onClose,
}: {
  credentials: CredentialsIssued | null
  onClose: () => void
}) {
  const { copiedKey, failed, copy } = useCopyField()
  const [revealed, setRevealed] = React.useState(false)
  const [acknowledged, setAcknowledged] = React.useState(false)

  React.useEffect(() => {
    if (!credentials) return
    // A password is only hidden by default when it was successfully emailed —
    // if delivery failed, the admin has to read it out, so hiding it would
    // just be an extra click on the one path that needs it most.
    setRevealed(!credentials.email_sent)
    setAcknowledged(false)
  }, [credentials])

  if (!credentials) return null

  const { email, password, full_name, role, email_sent, detail } = credentials

  const copyBoth = () =>
    copy('both', `Email: ${email}\nPassword: ${password}`)

  return (
    <Dialog
      open
      // No outside-click or Escape dismissal: losing this password costs a
      // second reset and signs the user out again.
      onOpenChange={() => {}}
    >
      <DialogContent
        size="md"
        hideClose
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            Credentials for {full_name}
          </DialogTitle>
          <DialogDescription>
            This password is shown once and cannot be retrieved again. Copy it now if you need it.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <div className="flex items-center gap-2">
            <RoleBadge role={role} size="sm" />
            <Badge tone="outline" size="sm">
              Sign in with email and password
            </Badge>
          </div>

          <CredentialRow
            label="Email"
            value={email}
            monospace
            copied={copiedKey === 'email'}
            onCopy={() => copy('email', email)}
          />

          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Password
              </p>
              <button
                type="button"
                onClick={() => setRevealed((r) => !r)}
                className="inline-flex items-center gap-1 text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {revealed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                {revealed ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-sm tracking-wide">
                {revealed ? password : '•'.repeat(password.length)}
              </code>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Copy password"
                onClick={() => copy('password', password)}
              >
                {copiedKey === 'password' ? <Check className="text-success" /> : <Copy />}
              </Button>
            </div>
          </div>

          <Button variant="outline" block icon={<Copy />} onClick={copyBoth}>
            {copiedKey === 'both' ? 'Copied email and password' : 'Copy both'}
          </Button>

          {failed && (
            <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">
              Your browser blocked clipboard access. Select the text above and copy it manually —
              this password will not be shown again.
            </p>
          )}

          {/* Delivery status. A false `email_sent` is not a failure of the
              operation, only of the delivery, so it reads as a warning. */}
          <div
            className={cn(
              'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm',
              email_sent
                ? 'border-success/30 bg-success/8 text-success'
                : 'border-warning/30 bg-warning/10 text-warning',
            )}
          >
            {email_sent ? (
              <Mail className="mt-0.5 size-4 shrink-0" />
            ) : (
              <MailWarning className="mt-0.5 size-4 shrink-0" />
            )}
            <span>
              {detail}
              {!email_sent && (
                <span className="mt-1 block font-medium">
                  The account works — copy the password above and give it to {full_name} yourself.
                </span>
              )}
            </span>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2.5">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
            />
            <span className="text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <ShieldAlert className="size-3.5" />
                I have saved or delivered these credentials
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Closing without saving means generating a new password, which signs the user out
                again.
              </span>
            </span>
          </label>
        </DialogBody>

        <DialogFooter>
          <Button variant="primary" block disabled={!acknowledged} onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import * as React from 'react'
import { toast } from 'sonner'

import type { CredentialsIssued, UserOut } from '@/api/types'
import { ApiError } from '@/api/errors'
import { useGenerateCredentials } from '@/queries/admin.queries'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/forms/confirm-dialog'
import { CredentialsModal } from './credentials-modal'

/**
 * "Generate credentials" for one user: the confirm step, then the one-time
 * password. Shared by the user lists and the user's own page so the wording
 * and the email toggle are the same wherever an admin starts from.
 *
 * Stays mounted while `user` is null: the password modal outlives the
 * confirm dialog that produced it.
 */
export function GenerateCredentialsDialog({
  user,
  reissue = false,
  onClose,
  onIssued,
}: {
  user: UserOut | null
  /** Credentials were already issued for this user during this session. */
  reissue?: boolean
  onClose: () => void
  onIssued?: (userId: number) => void
}) {
  const generateCredentials = useGenerateCredentials()
  const [sendEmail, setSendEmail] = React.useState(true)

  /**
   * Held in component state only. This is the one copy of the password in the
   * app and it dies with the modal — it is never cached, logged, or persisted.
   */
  const [issued, setIssued] = React.useState<CredentialsIssued | null>(null)

  React.useEffect(() => {
    if (user) setSendEmail(true)
  }, [user])

  const run = async () => {
    if (!user) return
    try {
      const result = await generateCredentials.mutateAsync({
        userId: user.id,
        options: { send_email: sendEmail },
      })
      onIssued?.(result.user_id)
      onClose()
      setIssued(result)
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null
      toast.error(
        apiError?.status === 503
          ? 'The sign-in service could not be reached. Nothing was changed — try again.'
          : (apiError?.message ?? 'Could not generate credentials.'),
      )
      onClose()
    }
  }

  return (
    <>
      <ConfirmDialog
        open={!!user}
        onOpenChange={(v) => !v && !generateCredentials.isPending && onClose()}
        title={`Generate credentials for ${user?.full_name ?? 'this user'}?`}
        description={
          reissue
            ? 'This replaces the password issued earlier. The current one stops working immediately and they are signed out everywhere.'
            : 'A new password is created and emailed to them. If they already have one, it stops working immediately and they are signed out everywhere.'
        }
        confirmLabel="Generate"
        loading={generateCredentials.isPending}
        onConfirm={run}
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-border px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Will be sent to</p>
            <p className="mt-0.5 truncate font-mono text-sm">{user?.email}</p>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2.5">
            <Checkbox
              checked={sendEmail}
              onCheckedChange={(v) => setSendEmail(v === true)}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium">Email the credentials</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Turn this off if their mailbox does not exist yet — you will still see the password
                once and can pass it on yourself.
              </span>
            </span>
          </label>

          {user && !user.is_active && (
            <p className="rounded-lg border border-info/30 bg-info/8 px-3 py-2 text-xs">
              This account is deactivated. Issuing credentials reactivates it.
            </p>
          )}
        </div>
      </ConfirmDialog>

      <CredentialsModal credentials={issued} onClose={() => setIssued(null)} />
    </>
  )
}

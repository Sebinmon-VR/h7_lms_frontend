import { CheckCircle2, Download, TriangleAlert, Upload, UploadCloud, XCircle } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import type { UserCreate, UserOut, UserRole } from '@/api/types'
import { useCreateUser, useUsers } from '@/queries/admin.queries'
import { cn } from '@/lib/cn'
import { ROLES } from '@/lib/constants'
import { downloadCsv, parseCsvObjects } from '@/lib/csv'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { BatchProgress, useBatchRunner } from '@/components/feedback/batch-progress'

/** A parsed row, already judged. */
interface CandidateRow {
  /** 1-based line number in the file, counting the header — what the user sees. */
  line: number
  full_name: string
  email: string
  role: UserRole
  password: string | null
  /** Set when the row cannot be imported at all. */
  error: string | null
  /** Set when the row is importable but something is worth knowing. */
  warning: string | null
}

/**
 * No password column: admins never choose passwords. Imported accounts are
 * provisioned without credentials, then issued them individually through
 * "Generate credentials", which mails each user their own.
 *
 * `email` is optional — omit it and the server derives it from the name.
 */
const TEMPLATE_HEADERS = ['full_name', 'email', 'role']

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Validates one parsed CSV row against everything we can check locally.
 *
 * Deliberately client-side and conservative: the backend is the authority on
 * duplicates, but pre-checking here means a 40-row import does not fail
 * halfway with 20 accounts created and no clear way to resume.
 */
function judgeRow(
  raw: Record<string, string>,
  line: number,
  seenEmails: Set<string>,
  existingEmails: Set<string>,
): CandidateRow {
  const full_name = raw.full_name || raw.name || ''
  const email = (raw.email || '').toLowerCase()
  const roleRaw = (raw.role || 'STUDENT').toUpperCase()

  const base = { line, full_name, email, password: null }

  if (!full_name || full_name.length < 2) {
    return { ...base, role: 'STUDENT', error: 'Missing or too-short name', warning: null }
  }
  if (!ROLES.includes(roleRaw as UserRole)) {
    return {
      ...base,
      role: 'STUDENT',
      error: `Unknown role “${roleRaw}” — use ADMIN, TEACHER or STUDENT`,
      warning: null,
    }
  }

  const role = roleRaw as UserRole

  // An email is optional; only a *malformed* one is an error. Blank means
  // "let the server generate it from the name".
  if (email) {
    if (!EMAIL_RE.test(email)) {
      return { ...base, role, error: 'Not a valid email address', warning: null }
    }
    if (existingEmails.has(email)) {
      return { ...base, role, error: 'An account already uses this email', warning: null }
    }
    if (seenEmails.has(email)) {
      return { ...base, role, error: 'Duplicate email within this file', warning: null }
    }
  }

  return {
    ...base,
    role,
    error: null,
    warning: email ? null : 'Email will be generated from the name',
  }
}

export function ImportUsersDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const usersQuery = useUsers()
  const createUser = useCreateUser()
  const batch = useBatchRunner<UserCreate>()

  const [fileName, setFileName] = React.useState<string | null>(null)
  const [candidates, setCandidates] = React.useState<CandidateRow[]>([])
  const [parseError, setParseError] = React.useState<string | null>(null)
  const [dragging, setDragging] = React.useState(false)

  React.useEffect(() => {
    if (open) return
    setFileName(null)
    setCandidates([])
    setParseError(null)
    batch.reset()
    // batch.reset is stable; re-running on the whole object would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const existingEmails = React.useMemo(
    () => new Set((usersQuery.data ?? []).map((u: UserOut) => u.email.toLowerCase())),
    [usersQuery.data],
  )

  const readFile = async (file: File) => {
    setParseError(null)
    setFileName(file.name)
    batch.reset()

    try {
      const text = await file.text()
      const { headers, rows } = parseCsvObjects(text)

      if (rows.length === 0) {
        setCandidates([])
        setParseError('That file has no data rows.')
        return
      }
      // Only the name column is mandatory — email and role both have
      // server-side defaults.
      if (!headers.includes('full_name') && !headers.includes('name')) {
        setCandidates([])
        setParseError('No “full_name” column found. The first row must be a header row.')
        return
      }

      const seen = new Set<string>()
      const judged = rows.map((row, i) => {
        const candidate = judgeRow(row, i + 2, seen, existingEmails)
        if (candidate.email) seen.add(candidate.email)
        return candidate
      })
      setCandidates(judged)
    } catch {
      setCandidates([])
      setParseError('That file could not be read as text.')
    }
  }

  const importable = candidates.filter((c) => !c.error)
  const rejected = candidates.filter((c) => c.error)

  const runImport = async () => {
    const entries = importable.map((row) => ({
      key: String(row.line),
      label: `${row.full_name} — ${row.email}`,
      payload: {
        full_name: row.full_name,
        // null, not "", so the server generates the address.
        email: row.email || null,
        role: row.role,
        password: null,
      } satisfies UserCreate,
    }))

    const { succeeded, failed } = await batch.run(entries, (payload) =>
      createUser.mutateAsync(payload),
    )

    if (failed === 0) {
      toast.success(`Imported ${succeeded} ${succeeded === 1 ? 'account' : 'accounts'}`)
      onOpenChange(false)
    } else {
      toast.warning(`${succeeded} imported, ${failed} failed`, {
        description: 'The failed rows are listed with their errors. Fix them and import again.',
      })
    }
  }

  const downloadTemplate = () => {
    downloadCsv(
      'users-template.csv',
      [
        TEMPLATE_HEADERS.join(','),
        'Grace Hopper,grace@institution.edu,TEACHER',
        // Blank email demonstrates the generate-from-name path.
        'Alan Turing,,STUDENT',
      ].join('\r\n'),
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !batch.running && onOpenChange(v)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Import users from CSV</DialogTitle>
          <DialogDescription>
            Every row is checked before anything is sent. Accounts are created one at a time — the
            API has no bulk endpoint — so you will see per-row progress. Imported users cannot sign
            in until you generate credentials for them.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* ------------------------------------------------- dropzone */}
          {batch.items.length === 0 && (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                const file = e.dataTransfer.files?.[0]
                if (file) void readFile(file)
              }}
              className={cn(
                'rounded-xl border-2 border-dashed p-6 text-center transition-colors',
                dragging ? 'border-primary bg-primary/8' : 'border-border',
              )}
            >
              <UploadCloud className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 text-sm">
                Drop a CSV here, or{' '}
                <label className="cursor-pointer font-medium text-primary hover:underline">
                  browse
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void readFile(file)
                      e.target.value = ''
                    }}
                  />
                </label>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Columns: <code className="font-mono">full_name</code> (required),{' '}
                <code className="font-mono">email</code>, <code className="font-mono">role</code>
              </p>
              <Button variant="ghost" size="sm" className="mt-2" icon={<Download />} onClick={downloadTemplate}>
                Download template
              </Button>
            </div>
          )}

          {parseError && (
            <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
              {parseError}
            </p>
          )}

          {/* --------------------------------------------------- summary */}
          {candidates.length > 0 && batch.items.length === 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">{fileName}</span>
                <Badge tone="success">
                  <CheckCircle2 />
                  {importable.length} ready
                </Badge>
                {rejected.length > 0 && (
                  <Badge tone="danger">
                    <XCircle />
                    {rejected.length} rejected
                  </Badge>
                )}
              </div>

              <ScrollArea className="max-h-64 rounded-lg border border-border">
                <ul className="divide-y divide-border">
                  {candidates.map((row) => (
                    <li
                      key={row.line}
                      className={cn('flex items-start gap-3 px-3 py-2', row.error && 'bg-danger/5')}
                    >
                      <span className="mt-0.5 shrink-0">
                        {row.error ? (
                          <XCircle className="size-4 text-danger" />
                        ) : row.warning ? (
                          <TriangleAlert className="size-4 text-warning" />
                        ) : (
                          <CheckCircle2 className="size-4 text-success" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          <span className="font-medium">{row.full_name || '(no name)'}</span>{' '}
                          <span className="text-muted-foreground">{row.email}</span>
                        </p>
                        {(row.error || row.warning) && (
                          <p
                            className={cn(
                              'text-xs',
                              row.error ? 'text-danger' : 'text-muted-foreground',
                            )}
                          >
                            Line {row.line}: {row.error ?? row.warning}
                          </p>
                        )}
                      </div>
                      {!row.error && (
                        <Badge tone="outline" size="sm" className="shrink-0">
                          {row.role}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </ScrollArea>

              {rejected.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Rejected rows are skipped. Nothing is created for them, and the rest still import.
                </p>
              )}
            </>
          )}

          {/* -------------------------------------------------- progress */}
          {batch.items.length > 0 && (
            <BatchProgress
              items={batch.items}
              percent={batch.percent}
              done={batch.done}
              total={batch.total}
            />
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={batch.running}>
            {batch.items.length > 0 && !batch.running ? 'Close' : 'Cancel'}
          </Button>
          <Button
            variant="primary"
            icon={<Upload />}
            disabled={importable.length === 0 || batch.items.length > 0}
            loading={batch.running}
            onClick={runImport}
          >
            Import {importable.length > 0 ? importable.length : ''}{' '}
            {importable.length === 1 ? 'user' : 'users'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

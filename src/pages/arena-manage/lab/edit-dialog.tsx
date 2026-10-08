import { AlertCircle, FlaskConical, Settings2 } from 'lucide-react'
import * as React from 'react'

import type { LabAssignment, LabAssignmentInput } from '@/api/lab.api'
import { parseApiDateTime } from '@/lib/datetime'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/forms/field'
import { useUpdateLabAssignment } from '@/queries/lab.queries'
import { ExperimentBuilder } from './builder'
import {
  draftFrom,
  draftProblems,
  emptyDraft,
  fromLocalInput,
  toExperiment,
  toLocalInput,
  type ExperimentDraft,
} from './model'

/**
 * Title, instructions and due date for any assignment; a custom one also
 * opens its experiment in the builder. Students' results are untouched.
 */
export function EditAssignmentDialog({
  assignment,
  onOpenChange,
}: {
  assignment: LabAssignment | null
  onOpenChange: (open: boolean) => void
}) {
  const update = useUpdateLabAssignment()
  const open = !!assignment
  // Hold on to the last one so the dialog doesn't change shape while it closes.
  const [current, setCurrent] = React.useState<LabAssignment | null>(assignment)
  const custom = !!current?.experiment
  const [tab, setTab] = React.useState<'details' | 'experiment'>('details')
  const [title, setTitle] = React.useState('')
  const [instructions, setInstructions] = React.useState('')
  const [due, setDue] = React.useState('')
  const [draft, setDraft] = React.useState<ExperimentDraft>(emptyDraft)

  React.useEffect(() => {
    if (!assignment) return
    setCurrent(assignment)
    setTab('details')
    setTitle(assignment.title)
    setInstructions(assignment.instructions ?? '')
    setDue(toLocalInput(assignment.due_at, parseApiDateTime))
    setDraft(assignment.experiment ? draftFrom(assignment.experiment) : emptyDraft())
  }, [assignment])

  const problems = React.useMemo(() => (custom ? draftProblems(draft) : []), [custom, draft])
  const canSave = custom ? problems.length === 0 : !!title.trim()

  const submit = async () => {
    if (!current || !canSave) return
    const body: Partial<LabAssignmentInput> = {
      instructions: instructions.trim() || null,
      due_at: fromLocalInput(due),
    }
    if (custom) {
      // A custom experiment's title lives in the experiment itself.
      body.experiment = toExperiment(draft) as unknown as Record<string, unknown>
      body.title = null
    } else if (title.trim() !== current.title) {
      body.title = title.trim()
    }
    try {
      await update.mutateAsync({ id: current.id, body })
      onOpenChange(false)
    } catch {
      // Toasted by the mutation cache.
    }
  }

  const details = (
    <div className="space-y-5">
      {!custom && (
        <Field id="lab-edit-title" label="Title" required>
          <Input id="lab-edit-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
        </Field>
      )}
      <Field id="lab-edit-instructions" label="Instructions for students">
        <Textarea
          id="lab-edit-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          maxLength={2000}
          className="min-h-24"
        />
      </Field>
      <Field id="lab-edit-due" label="Due" hint="Clear it to remove the due date.">
        <Input id="lab-edit-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="sm:max-w-64" />
      </Field>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(v) => !update.isPending && onOpenChange(v)}>
      <DialogContent size={custom ? 'xl' : 'md'}>
        <DialogHeader>
          <DialogTitle>Edit “{current?.title}”</DialogTitle>
          <DialogDescription>Students' results so far are kept.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {custom ? (
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="details" className="flex-1 sm:flex-none">
                  <Settings2 />
                  Details
                </TabsTrigger>
                <TabsTrigger value="experiment" className="flex-1 sm:flex-none">
                  <FlaskConical />
                  Experiment
                </TabsTrigger>
              </TabsList>
              <TabsContent value="details">{details}</TabsContent>
              <TabsContent value="experiment">
                <ExperimentBuilder value={draft} onChange={setDraft} idPrefix="lab-edit-build" />
              </TabsContent>
            </Tabs>
          ) : (
            details
          )}
        </DialogBody>
        <DialogFooter className="sm:items-center">
          {problems.length > 0 && (
            <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground sm:mr-auto">
              <AlertCircle className="mt-px size-3.5 shrink-0 text-warning" />
              <span className="min-w-0">
                {problems[0]}
                {problems.length > 1 && ` (+${problems.length - 1} more)`}
              </span>
            </p>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canSave} loading={update.isPending}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

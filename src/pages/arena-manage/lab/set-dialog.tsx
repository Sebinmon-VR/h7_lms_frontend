import { AlertCircle, ArrowLeft, BookOpen, Wrench } from 'lucide-react'
import * as React from 'react'

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
import { Field, FieldGroup, FieldRow } from '@/components/forms/field'
import { useCreateLabAssignment } from '@/queries/lab.queries'
import type { Experiment } from '@/pages/student/lab/engine/experiments'
import { ExperimentBuilder } from './builder'
import { ExperimentPreview, LibraryGrid } from './library'
import { draftProblems, emptyDraft, fromLocalInput, toExperiment, type ExperimentDraft } from './model'

type Tab = 'library' | 'build'

export function SetExperimentDialog({
  open,
  onOpenChange,
  classId,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  classId: number
  className: string
}) {
  const create = useCreateLabAssignment()
  const [tab, setTab] = React.useState<Tab>('library')
  const [picked, setPicked] = React.useState<Experiment | null>(null)
  const [titleOverride, setTitleOverride] = React.useState('')
  const [draft, setDraft] = React.useState<ExperimentDraft>(emptyDraft)
  const [instructions, setInstructions] = React.useState('')
  const [due, setDue] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setTab('library')
    setPicked(null)
    setTitleOverride('')
    setDraft(emptyDraft())
    setInstructions('')
    setDue('')
  }, [open])

  const problems = React.useMemo(() => draftProblems(draft), [draft])
  const canSave = tab === 'library' ? !!picked : problems.length === 0

  const submit = async () => {
    if (!canSave) return
    const common = {
      class_id: classId,
      instructions: instructions.trim() || null,
      due_at: fromLocalInput(due),
    }
    try {
      if (tab === 'library' && picked) {
        await create.mutateAsync({
          ...common,
          library_id: picked.id,
          title: titleOverride.trim() && titleOverride.trim() !== picked.title ? titleOverride.trim() : null,
        })
      } else {
        await create.mutateAsync({ ...common, experiment: toExperiment(draft) as unknown as Record<string, unknown> })
      }
      onOpenChange(false)
    } catch {
      // The mutation cache already toasted the reason.
    }
  }

  const assignmentFields = (
    <FieldGroup title="For the class" description="Students see these with the experiment in their Virtual Lab.">
      {tab === 'library' && picked && (
        <Field id="lab-set-title" label="Title" hint="Leave as it is, or rename it for your class.">
          <Input
            id="lab-set-title"
            value={titleOverride}
            onChange={(e) => setTitleOverride(e.target.value)}
            placeholder={picked.title}
            maxLength={160}
          />
        </Field>
      )}
      <Field id="lab-set-instructions" label="Instructions for students">
        <Textarea
          id="lab-set-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          maxLength={2000}
          className="min-h-20"
          placeholder="e.g. Write down every colour change you see. We'll discuss on Friday."
        />
      </Field>
      <FieldRow>
        <Field id="lab-set-due" label="Due" hint="Optional. Students can still finish it after.">
          <Input id="lab-set-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </FieldRow>
    </FieldGroup>
  )

  return (
    <Dialog open={open} onOpenChange={(v) => !create.isPending && onOpenChange(v)}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Set an experiment</DialogTitle>
          <DialogDescription>
            For {className}. Pick one from the library, or build your own step by step.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="library" className="flex-1 sm:flex-none">
                <BookOpen />
                Library
              </TabsTrigger>
              <TabsTrigger value="build" className="flex-1 sm:flex-none">
                <Wrench />
                Build your own
              </TabsTrigger>
            </TabsList>

            <TabsContent value="library" className="space-y-6">
              {picked ? (
                <>
                  <Button variant="ghost" size="sm" icon={<ArrowLeft />} className="-ml-2" onClick={() => setPicked(null)}>
                    Back to the library
                  </Button>
                  <ExperimentPreview experiment={picked} />
                  {assignmentFields}
                </>
              ) : (
                <LibraryGrid
                  selectedId={null}
                  onSelect={(e) => {
                    setPicked(e)
                    setTitleOverride(e.title)
                  }}
                />
              )}
            </TabsContent>

            <TabsContent value="build" className="space-y-8">
              <ExperimentBuilder value={draft} onChange={setDraft} idPrefix="lab-set-build" />
              {assignmentFields}
            </TabsContent>
          </Tabs>
        </DialogBody>
        <DialogFooter className="sm:items-center">
          {tab === 'build' && problems.length > 0 && (
            <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground sm:mr-auto">
              <AlertCircle className="mt-px size-3.5 shrink-0 text-warning" />
              <span className="min-w-0">
                {problems[0]}
                {problems.length > 1 && ` (+${problems.length - 1} more)`}
              </span>
            </p>
          )}
          {tab === 'library' && !picked && (
            <p className="text-xs text-muted-foreground sm:mr-auto">Choose an experiment to see what's in it.</p>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canSave} loading={create.isPending}>
            Set for class
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

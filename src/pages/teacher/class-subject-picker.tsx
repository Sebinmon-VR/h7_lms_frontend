import * as React from 'react'

import type { TeacherMappingOut } from '@/api/types'
import { Combobox } from '@/components/ui/combobox'
import { Field } from '@/components/forms/field'

export interface ClassSubjectSelection {
  classId: number | null
  subjectId: number | null
}

/**
 * A teacher's work is always scoped to one (class, subject) pair, and the
 * valid pairs come from their mappings — not from the full class/subject
 * catalogue, which they cannot read anyway.
 */
export function useClassSubjectSelection(mappings: TeacherMappingOut[] | undefined) {
  const [classId, setClassId] = React.useState<number | null>(null)
  const [subjectId, setSubjectId] = React.useState<number | null>(null)

  const classes = React.useMemo(() => {
    const map = new Map<number, { id: number; name: string; code: string }>()
    for (const m of mappings ?? []) map.set(m.class_room.id, m.class_room)
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [mappings])

  const subjects = React.useMemo(() => {
    const map = new Map<number, { id: number; name: string; code: string }>()
    for (const m of mappings ?? []) {
      if (classId != null && m.class_room.id !== classId) continue
      map.set(m.subject.id, m.subject)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [mappings, classId])

  // Auto-select when there is only one sensible choice — a teacher with one
  // class should not have to pick it every time.
  React.useEffect(() => {
    if (classId == null && classes.length === 1) setClassId(classes[0].id)
  }, [classes, classId])

  React.useEffect(() => {
    if (subjectId != null && !subjects.some((s) => s.id === subjectId)) setSubjectId(null)
    else if (subjectId == null && subjects.length === 1) setSubjectId(subjects[0].id)
  }, [subjects, subjectId])

  const selectedClass = classes.find((c) => c.id === classId) ?? null
  const selectedSubject = subjects.find((s) => s.id === subjectId) ?? null

  return {
    classId,
    subjectId,
    setClassId,
    setSubjectId,
    classes,
    subjects,
    selectedClass,
    selectedSubject,
    isComplete: classId != null && subjectId != null,
  }
}

export function ClassSubjectPicker({
  selection,
  disabled,
  className,
}: {
  selection: ReturnType<typeof useClassSubjectSelection>
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={className ?? 'grid gap-4 sm:grid-cols-2'}>
      <Field id="picker-class" label="Class" required>
        <Combobox
          id="picker-class"
          value={selection.classId != null ? String(selection.classId) : null}
          onChange={(v) => selection.setClassId(Number(v))}
          disabled={disabled}
          placeholder="Select a class"
          emptyMessage="You have no assigned classes."
          options={selection.classes.map((c) => ({ value: String(c.id), label: c.name, hint: c.code }))}
        />
      </Field>

      <Field id="picker-subject" label="Subject" required>
        <Combobox
          id="picker-subject"
          value={selection.subjectId != null ? String(selection.subjectId) : null}
          onChange={(v) => selection.setSubjectId(Number(v))}
          disabled={disabled || selection.classId == null}
          placeholder={selection.classId == null ? 'Choose a class first' : 'Select a subject'}
          emptyMessage="No subjects assigned for this class."
          options={selection.subjects.map((s) => ({ value: String(s.id), label: s.name, hint: s.code }))}
        />
      </Field>
    </div>
  )
}

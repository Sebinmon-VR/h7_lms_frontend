import { ExternalLink, Search } from 'lucide-react'
import * as React from 'react'

import { useStudentMaterials } from '@/queries/student.queries'
import { newSince } from '@/lib/derive'
import { STORAGE_KEYS } from '@/lib/constants'
import { formatDateTime, formatRelative } from '@/lib/datetime'
import { fileNameFromUrl, resolveFileUrl } from '@/lib/files'
import { humanize } from '@/lib/format'
import { subjectName } from '@/lib/select'
import { subjectLook, toneStyle } from '@/lib/subjects'
import { usePersistentState } from '@/lib/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { FileTypeIcon } from '@/components/domain/file-type-icon'
import { ErrorState } from '@/components/feedback/states'
import { Appear, Stagger } from '@/components/fun/motion'
import { FunChip, FunEmpty, FunPageHeader, SubjectTile } from '@/components/fun/fun-ui'
import { PageHeader } from '@/components/layout/page-header'
import { AdminStudentNotice, NotEnrolledState, useEnrollmentStatus } from './student-guard'

export default function StudentMaterialsPage() {
  const enrollment = useEnrollmentStatus()
  const materialsQuery = useStudentMaterials(!enrollment.isAdmin)

  const [lastSeen, setLastSeen] = usePersistentState<string | null>(
    STORAGE_KEYS.lastSeenMaterials,
    null,
  )
  const [search, setSearch] = React.useState('')
  const [subjectFilter, setSubjectFilter] = React.useState<string | null>(null)
  const [typeFilter, setTypeFilter] = React.useState<string | null>(null)

  const materials = React.useMemo(
    () =>
      [...(materialsQuery.data ?? [])].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)),
    [materialsQuery.data],
  )

  // Snapshot "new since last visit" once, then move the marker forward.
  const freshIds = React.useMemo(() => newSince(materials, lastSeen), [materials, lastSeen])

  React.useEffect(() => {
    if (materials.length === 0) return
    const timer = window.setTimeout(() => setLastSeen(new Date().toISOString()), 4000)
    return () => window.clearTimeout(timer)
  }, [materials.length, setLastSeen])

  const subjectOptions = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const m of materials) map.set(String(m.subject_id), subjectName(m))
    return [...map.entries()].map(([value, label]) => ({ value, label }))
  }, [materials])

  const typeOptions = React.useMemo(
    () => [...new Set(materials.map((m) => m.material_type))].sort(),
    [materials],
  )

  const filtered = React.useMemo(() => {
    const needles = search.toLowerCase().split(/\s+/).filter(Boolean)
    return materials.filter((m) => {
      if (subjectFilter && String(m.subject_id) !== subjectFilter) return false
      if (typeFilter && m.material_type !== typeFilter) return false
      if (needles.length === 0) return true
      const haystack =
        `${m.title} ${fileNameFromUrl(m.file_url)} ${subjectName(m)} ${m.material_type}`.toLowerCase()
      return needles.every((n) => haystack.includes(n))
    })
  }, [materials, search, subjectFilter, typeFilter])

  const newCount = freshIds.size

  if (enrollment.isAdmin) {
    return (
      <>
        <PageHeader title="Materials" description="Notes and resources from your teachers." />
        <AdminStudentNotice />
      </>
    )
  }

  if (enrollment.notEnrolled) {
    return (
      <>
        <FunPageHeader emoji="📚" title="Notes & books" />
        <NotEnrolledState />
      </>
    )
  }

  return (
    <>
      <FunPageHeader
        emoji="📚"
        tone={5}
        title="Notes & books"
        description={
          newCount > 0
            ? `${newCount} new thing${newCount === 1 ? '' : 's'} since you last looked!`
            : 'Everything your teachers have shared with your class.'
        }
      >
        <div className="flex flex-col gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search for something…"
            leading={<Search />}
            className="max-w-sm"
          />
          {(subjectOptions.length > 1 || typeOptions.length > 1) && (
            <div className="flex flex-wrap gap-2">
              <FunChip
                active={!subjectFilter && !typeFilter}
                onClick={() => {
                  setSubjectFilter(null)
                  setTypeFilter(null)
                }}
              >
                Everything
              </FunChip>
              {subjectOptions.map((option) => (
                <FunChip
                  key={option.value}
                  active={subjectFilter === option.value}
                  tone={subjectLook(option.label).tone}
                  onClick={() =>
                    setSubjectFilter(subjectFilter === option.value ? null : option.value)
                  }
                >
                  {subjectLook(option.label).emoji} {option.label}
                </FunChip>
              ))}
              {typeOptions.map((type) => (
                <FunChip
                  key={type}
                  active={typeFilter === type}
                  onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                >
                  {humanize(type)}
                </FunChip>
              ))}
            </div>
          )}
        </div>
      </FunPageHeader>

      {materialsQuery.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : materialsQuery.isError ? (
        <ErrorState error={materialsQuery.error} onRetry={() => materialsQuery.refetch()} />
      ) : materials.length === 0 ? (
        <FunEmpty
          mood="sleepy"
          title="Nothing here yet"
          description="When your teachers share notes or worksheets, you will find them right here."
        />
      ) : filtered.length === 0 ? (
        <FunEmpty
          mood="curious"
          title="Nothing matches"
          description="Try a different word, or tap Everything to see it all again."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch('')
                setSubjectFilter(null)
                setTypeFilter(null)
              }}
            >
              Show everything
            </Button>
          }
        />
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((material) => {
            const url = resolveFileUrl(material.file_url)
            const subject = subjectName(material)
            return (
              <Appear
                key={material.id}
                style={toneStyle(subjectLook(subject).tone)}
                className="sticker flex flex-col p-4"
              >
                <div className="flex items-start gap-3">
                  <SubjectTile subject={subject} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-bold">{material.title}</p>
                      {freshIds.has(material.id) && (
                        <Badge tone="primary" size="sm" className="shrink-0 animate-wiggle">
                          New!
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{subject}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <FileTypeIcon url={material.file_url} size="sm" />
                  <span className="min-w-0 truncate">{fileNameFromUrl(material.file_url)}</span>
                </div>

                {material.teacher && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    From {material.teacher.full_name}
                  </p>
                )}

                <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                  <span
                    className="text-xs text-muted-foreground"
                    title={formatDateTime(material.uploaded_at)}
                  >
                    {formatRelative(material.uploaded_at)}
                  </span>
                  {url && (
                    <Button asChild variant="primary" size="sm">
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        Open it
                        <ExternalLink className="size-3" />
                      </a>
                    </Button>
                  )}
                </div>
              </Appear>
            )
          })}
        </Stagger>
      )}
    </>
  )
}

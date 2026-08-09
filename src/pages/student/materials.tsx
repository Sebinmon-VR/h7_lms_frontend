import { ExternalLink, Library, Search } from 'lucide-react'
import * as React from 'react'

import { useStudentMaterials } from '@/queries/student.queries'
import { newSince } from '@/lib/derive'
import { cn } from '@/lib/cn'
import { STORAGE_KEYS } from '@/lib/constants'
import { formatDateTime, formatRelative } from '@/lib/datetime'
import { fileNameFromUrl, resolveFileUrl } from '@/lib/files'
import { humanize } from '@/lib/format'
import { subjectName } from '@/lib/select'
import { usePersistentState } from '@/lib/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { FreeformBadge } from '@/components/domain/badges'
import { FileTypeIcon } from '@/components/domain/file-type-icon'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { AdminStudentNotice, NotEnrolledState, useEnrollmentStatus } from './student-guard'

export default function StudentMaterialsPage() {
  const enrollment = useEnrollmentStatus()
  const materialsQuery = useStudentMaterials(!enrollment.isAdmin)

  const [lastSeen, setLastSeen] = usePersistentState<string | null>(STORAGE_KEYS.lastSeenMaterials, null)
  const [search, setSearch] = React.useState('')
  const [subjectFilter, setSubjectFilter] = React.useState<string | null>(null)
  const [typeFilter, setTypeFilter] = React.useState<string | null>(null)

  const materials = React.useMemo(
    () => [...(materialsQuery.data ?? [])].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)),
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
      const haystack = `${m.title} ${fileNameFromUrl(m.file_url)} ${subjectName(m)} ${m.material_type}`.toLowerCase()
      return needles.every((n) => haystack.includes(n))
    })
  }, [materials, search, subjectFilter, typeFilter])

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
        <PageHeader title="Materials" description="Notes and resources from your teachers." />
        <NotEnrolledState />
      </>
    )
  }

  const chip = (active: boolean) =>
    cn(
      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
      active
        ? 'border-primary bg-primary/12 text-primary'
        : 'border-border text-muted-foreground hover:border-primary/40',
    )

  return (
    <>
      <PageHeader
        title="Materials"
        description="Everything your teachers have shared with your class."
      >
        <div className="flex flex-col gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search materials…"
            leading={<Search />}
            className="max-w-sm"
          />
          {(subjectOptions.length > 1 || typeOptions.length > 1) && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setSubjectFilter(null); setTypeFilter(null) }} className={chip(!subjectFilter && !typeFilter)}>
                All
              </button>
              {subjectOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSubjectFilter(subjectFilter === option.value ? null : option.value)}
                  className={chip(subjectFilter === option.value)}
                >
                  {option.label}
                </button>
              ))}
              {typeOptions.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                  className={chip(typeFilter === type)}
                >
                  {humanize(type)}
                </button>
              ))}
            </div>
          )}
        </div>
      </PageHeader>

      {materialsQuery.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : materialsQuery.isError ? (
        <ErrorState error={materialsQuery.error} onRetry={() => materialsQuery.refetch()} />
      ) : materials.length === 0 ? (
        <EmptyState
          icon={<Library />}
          title="No materials yet"
          description="When your teachers upload notes or worksheets, they will show up here."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="No matching materials"
          description="Try a different search term or clear the filters."
          action={
            <Button variant="outline" size="sm" onClick={() => { setSearch(''); setSubjectFilter(null); setTypeFilter(null) }}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((material) => {
            const url = resolveFileUrl(material.file_url)
            return (
              <Card key={material.id} className="flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <FileTypeIcon url={material.file_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-medium">{material.title}</p>
                      {freshIds.has(material.id) && (
                        <Badge tone="primary" size="sm">
                          New
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {fileNameFromUrl(material.file_url)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <FreeformBadge value={material.material_type} />
                  <Badge tone="accent" size="sm">
                    {subjectName(material)}
                  </Badge>
                </div>

                {material.teacher && (
                  <p className="mt-2 text-xs text-muted-foreground">Shared by {material.teacher.full_name}</p>
                )}

                <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                  <span className="text-xs text-muted-foreground" title={formatDateTime(material.uploaded_at)}>
                    {formatRelative(material.uploaded_at)}
                  </span>
                  {url && (
                    <Button asChild variant="outline" size="sm">
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        Open
                        <ExternalLink className="size-3" />
                      </a>
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

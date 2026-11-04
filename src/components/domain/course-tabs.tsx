import { Link, useLocation } from 'react-router-dom'

import { cn } from '@/lib/cn'

/**
 * The two halves of a class's teaching record, side by side: what was taught, and the files
 * for it. Each half keeps its own route, so links and bookmarks still open the right one.
 *
 * `keepParams` carries query values across the switch (the class a student is viewing), and
 * drops everything else, such as one shelf's filters, which mean nothing on the other tab.
 */
export function CourseTabs({
  active,
  lessonsTo,
  materialsTo,
  keepParams = [],
}: {
  active: 'lessons' | 'materials'
  lessonsTo: string
  materialsTo: string
  keepParams?: string[]
}) {
  const { search } = useLocation()
  const current = new URLSearchParams(search)
  const kept = new URLSearchParams()
  for (const key of keepParams) {
    const value = current.get(key)
    if (value) kept.set(key, value)
  }
  const query = kept.toString() ? `?${kept.toString()}` : ''

  const tab = (value: 'lessons' | 'materials', label: string, to: string) => (
    <Link
      to={`${to}${query}`}
      aria-current={active === value ? 'page' : undefined}
      className={cn(
        'border-b-2 px-1 pb-2 text-sm font-semibold transition-colors',
        active === value
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </Link>
  )

  return (
    <nav aria-label="Lessons and materials" className="flex gap-6 border-b border-border">
      {tab('lessons', 'Lessons', lessonsTo)}
      {tab('materials', 'Materials', materialsTo)}
    </nav>
  )
}

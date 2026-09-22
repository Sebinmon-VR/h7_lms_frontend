import { Check, ChevronsUpDown, GraduationCap, School } from 'lucide-react'
import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import type { MyProgramsOut, Program } from '@/api/types'
import { useMyPrograms } from '@/queries/support.queries'
import { useAuth } from '@/providers/auth-provider'
import { cn } from '@/lib/cn'
import { hasProgram } from '@/lib/tuition'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * The school / online-tuition switcher.
 *
 * Lives at the TOP OF THE SIDEBAR, under the wordmark, rather than in the
 * top-bar icon cluster where it first went. It answers "which product am I
 * in?", which is context — the same question the navigation below it answers —
 * and context belongs where the eye already goes for orientation. Sitting
 * between a notification bell and a theme toggle, it read as one more setting
 * and was easy to miss entirely.
 *
 * Driven by `GET /me/programs`. The field that matters is `show_switcher`: it
 * is false when there is nothing to choose between, and the control then
 * renders NOTHING rather than a dropdown with a single entry. An administrator
 * always has both, so they always see it; a student who is only in the school
 * never does, by design.
 *
 * Selecting a product grants nobody anything — every tuition endpoint checks
 * `programs` on its own. This is navigation, not authorisation.
 */

const PRODUCT_ICON = {
  LMS: School,
  TUITION: GraduationCap,
} as const

/** Where each product's front door is, per role. */
function homeFor(program: string, role: string | null): string | null {
  const school = program === 'LMS'
  switch (role) {
    case 'ADMIN':
      return school ? '/admin' : '/admin/tuition'
    case 'TEACHER':
    case 'CLASS_TEACHER':
      return school ? '/teacher' : '/tuition/teacher'
    case 'STUDENT':
      return school ? '/student' : '/tuition/student'
    default:
      // A parent has no product of their own — they reach whatever their
      // children are part of, so there is nothing here to switch between.
      return null
  }
}

const PRODUCT_LABEL: Record<Program, string> = {
  LMS: 'School',
  TUITION: 'Online Tuition',
}

export function ProgramSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { role, user } = useAuth()
  const programs = useMyPrograms()
  const navigate = useNavigate()
  const location = useLocation()

  /**
   * The profile's own answer, used while `/me/programs` is loading and
   * whenever it is unavailable - an older backend has no such endpoint, and a
   * switcher that vanishes with it takes the other product's whole menu with
   * it. Admins always have both, matching the backend's rule for them.
   */
  const fallback = React.useMemo<Pick<MyProgramsOut, 'programs' | 'show_switcher'>>(() => {
    const values: Program[] =
      role === 'ADMIN'
        ? ['LMS', 'TUITION']
        : (['LMS', 'TUITION'] as Program[]).filter((p) => hasProgram(user, p))
    return {
      programs: values.map((value, index) => ({
        value,
        label: PRODUCT_LABEL[value],
        is_default: index === 0,
      })),
      show_switcher: values.length > 1,
    }
  }, [role, user])

  const data = programs.data ?? fallback
  if (!data.show_switcher) return null

  /**
   * Which product we are in, read from the URL rather than stored.
   *
   * A remembered preference would disagree with the page in front of you the
   * moment somebody follows a deep link into the other product.
   */
  const onTuition =
    location.pathname.startsWith('/tuition') || location.pathname.startsWith('/admin/tuition')
  const activeValue = onTuition ? 'TUITION' : 'LMS'
  const active = data.programs.find((p) => p.value === activeValue) ?? data.programs[0]
  const ActiveIcon = PRODUCT_ICON[active.value as keyof typeof PRODUCT_ICON] ?? School

  const trigger = (
    <button
      type="button"
      aria-label={`Current product: ${active.label}. Switch product.`}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors',
        'hover:border-primary/40 hover:bg-muted/60',
        collapsed && 'justify-center px-0',
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
        <ActiveIcon className="size-4" />
      </span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block text-2xs uppercase tracking-wider text-muted-foreground">
              Product
            </span>
            <span className="block truncate text-sm font-semibold">{active.label}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </>
      )}
    </button>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right">{active.label} — switch product</TooltipContent>
          </Tooltip>
        ) : (
          trigger
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Switch product</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {data.programs.map((program) => {
          const Icon = PRODUCT_ICON[program.value as keyof typeof PRODUCT_ICON] ?? School
          const to = homeFor(program.value, role)
          const isActive = program.value === active.value
          return (
            <DropdownMenuItem
              key={program.value}
              disabled={!to}
              onSelect={() => to && !isActive && navigate(to)}
            >
              <Icon />
              <span className="flex-1">{program.label}</span>
              {isActive && <Check className="size-3.5 text-primary" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

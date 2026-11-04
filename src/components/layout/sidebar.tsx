import * as React from 'react'
import { motion } from 'framer-motion'
import { BookOpen, ChevronRight, Lock, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'

import { useAuth } from '@/providers/auth-provider'
import { cn } from '@/lib/cn'
import { lockedModuleFor } from '@/lib/demo'
import { STORAGE_KEYS } from '@/lib/constants'
import { usePersistentState } from '@/lib/hooks'
import { PORTAL_LABEL, navigationFor, programForPath, type NavItem, type NavSection } from '@/routes/navigation'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Wordmark, Logo } from './logo'
import { ProgramSwitcher } from './program-switcher'

/** The same test NavLink applies, so "which group am I in" agrees with the highlight. */
function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.alsoActiveFor?.some((path) => pathname.startsWith(path))) return true
  if (item.end) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

function sectionIsActive(section: NavSection, pathname: string): boolean {
  return section.items.some((item) => isItemActive(item, pathname))
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { role, user } = useAuth()
  const [collapsed, setCollapsed] = usePersistentState(STORAGE_KEYS.sidebar, false)
  // Which groups are folded open. A group nobody has touched is open only when
  // it holds the current page, so the menu starts short and still shows where
  // you are.
  const [openSections, setOpenSections] = usePersistentState<Record<string, boolean>>(
    STORAGE_KEYS.sidebarSections,
    {},
  )
  const { pathname } = useLocation()
  // Scoped to the product the current route belongs to, so the menu always
  // agrees with the switcher sitting above it.
  const sections = navigationFor(user, programForPath(pathname))

  // Arriving on a page (from the command palette, a link, the back button)
  // opens its group, even if it had been folded away.
  const activeHeading = sections.find((s) => sectionIsActive(s, pathname))?.heading
  React.useEffect(() => {
    if (activeHeading && openSections[activeHeading] === false) {
      setOpenSections((prev) => ({ ...prev, [activeHeading]: true }))
    }
    // Only on navigation; a fold made while staying on the page is respected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const toggle = (heading: string, open: boolean) => setOpenSections((prev) => ({ ...prev, [heading]: !open }))

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-surface transition-[width] duration-200 ease-spring',
        collapsed ? 'w-[4.5rem]' : 'w-60',
      )}
    >
      <div className={cn('flex h-16 shrink-0 items-center border-b border-border px-4', collapsed && 'justify-center px-0')}>
        {collapsed ? <Logo /> : <Wordmark />}
      </div>

      {/* Context, directly under the identity it qualifies. Renders nothing
          for an account with only one product. */}
      <div className={cn('shrink-0 px-3 pt-3', collapsed && 'px-2')}>
        <ProgramSwitcher collapsed={collapsed} />
      </div>

      <nav
        className={cn('flex-1 overflow-y-auto px-2.5 py-3', collapsed ? 'space-y-3' : 'space-y-0.5')}
        aria-label="Main navigation"
      >
        {sections.map((section) => {
          const active = sectionIsActive(section, pathname)
          // Icon-only mode has no headings to fold under, so every item shows.
          const open = collapsed || (openSections[section.heading] ?? active)
          const listId = `nav-${section.heading.replace(/\W+/g, '-').toLowerCase()}`

          return (
            <div key={section.heading}>
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggle(section.heading, open)}
                  aria-expanded={open}
                  aria-controls={listId}
                  className={cn(
                    'group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-2xs font-semibold uppercase tracking-wider transition-colors hover:bg-muted/60',
                    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <ChevronRight
                    className={cn('size-3 shrink-0 transition-transform duration-150', open && 'rotate-90')}
                    aria-hidden
                  />
                  <span className="truncate">{section.heading}</span>
                  {!open && (
                    <span className="ml-auto rounded bg-muted px-1.5 text-2xs font-medium tabular-nums text-muted-foreground">
                      {section.items.length}
                    </span>
                  )}
                </button>
              )}
              {open && (
                <ul id={listId} className={cn('space-y-px', !collapsed && 'mb-1.5 ml-3 border-l border-border pl-1.5')}>
                  {section.items.map((item) => {
                    const Icon = item.icon
                    // A demo account sees every module, padlocked until the school
                    // unlocks it; opening one shows what it is and how to get it.
                    const locked = !!lockedModuleFor(user, item.to)
                    const pairedActive = item.alsoActiveFor?.some((path) => pathname.startsWith(path)) ?? false
                    const link = (
                      <NavLink
                        to={item.to}
                        end={item.end}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          cn(
                            'group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                            collapsed && 'justify-center px-0 py-2',
                            isActive || pairedActive
                              ? 'text-primary'
                              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                            locked && !isActive && 'opacity-60',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {(isActive || pairedActive) && (
                              <motion.span
                                layoutId="sidebar-active"
                                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                                className="absolute inset-0 rounded-md border border-primary/25 bg-primary/10"
                              />
                            )}
                            <Icon className="relative z-10 size-4 shrink-0" />
                            {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
                            {locked && !collapsed && (
                              <Lock className="relative z-10 ml-auto size-3.5 shrink-0" aria-label="Locked on your demo account" />
                            )}
                          </>
                        )}
                      </NavLink>
                    )

                    return (
                      <li key={item.to}>
                        {collapsed ? (
                          <Tooltip>
                            <TooltipTrigger asChild>{link}</TooltipTrigger>
                            <TooltipContent side="right">
                              {item.label}
                              {locked ? ' (locked on your demo)' : ''}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          link
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </nav>

      <div className="shrink-0 border-t border-border p-2.5">
        {!collapsed && role && (
          <p className="mb-1.5 px-2 text-2xs uppercase tracking-wider text-muted-foreground">
            {PORTAL_LABEL[role]} portal
          </p>
        )}
        {role && ['ADMIN', 'TEACHER', 'CLASS_TEACHER', 'STUDENT'].includes(role) && (
          <NavLink
            to="/guide"
            onClick={onNavigate}
            title={collapsed ? 'Guide' : undefined}
            className={({ isActive }) =>
              cn(
                'mb-1 flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
                collapsed && 'justify-center px-0',
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )
            }
          >
            <BookOpen className="size-4" />
            {!collapsed && <span>Guide</span>}
          </NavLink>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
            collapsed && 'justify-center px-0',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}

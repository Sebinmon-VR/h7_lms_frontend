import { motion } from 'framer-motion'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { useAuth } from '@/providers/auth-provider'
import { cn } from '@/lib/cn'
import { STORAGE_KEYS } from '@/lib/constants'
import { usePersistentState } from '@/lib/hooks'
import { PORTAL_LABEL, navigationFor } from '@/routes/navigation'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Wordmark, Logo } from './logo'

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { role } = useAuth()
  const [collapsed, setCollapsed] = usePersistentState(STORAGE_KEYS.sidebar, false)
  const sections = navigationFor(role)

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-surface transition-[width] duration-200 ease-spring',
        collapsed ? 'w-[4.5rem]' : 'w-64',
      )}
    >
      <div className={cn('flex h-16 shrink-0 items-center border-b border-border px-4', collapsed && 'justify-center px-0')}>
        {collapsed ? <Logo /> : <Wordmark />}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {sections.map((section) => (
          <div key={section.heading}>
            {!collapsed && (
              <p className="mb-1.5 px-3 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.heading}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const link = (
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        collapsed && 'justify-center px-0',
                        isActive
                          ? 'text-primary'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            layoutId="sidebar-active"
                            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                            className="absolute inset-0 rounded-lg border border-primary/25 bg-primary/10"
                          />
                        )}
                        <Icon className="relative z-10 size-4 shrink-0" />
                        {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
                      </>
                    )}
                  </NavLink>
                )

                return (
                  <li key={item.to}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        {!collapsed && role && (
          <p className="mb-2 px-2 text-2xs uppercase tracking-wider text-muted-foreground">
            {PORTAL_LABEL[role]} portal
          </p>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
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

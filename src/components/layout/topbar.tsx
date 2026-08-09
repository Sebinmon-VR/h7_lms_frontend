import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Command as CommandIcon, LogOut, Menu, Monitor, Moon, Sun, TriangleAlert, User } from 'lucide-react'

import { useAuth } from '@/providers/auth-provider'
import { useTheme, type ThemeMode } from '@/providers/theme-provider'
import { cn } from '@/lib/cn'
import { ROLE_LABEL } from '@/lib/constants'
import { allNavItems } from '@/routes/navigation'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NotificationsMenu } from './notifications'

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function Breadcrumbs() {
  const location = useLocation()
  const { role } = useAuth()
  const items = allNavItems(role)

  // Longest matching nav path wins, so nested routes resolve to their section.
  const match = items
    .filter((i) => location.pathname === i.to || location.pathname.startsWith(`${i.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0]

  if (!match) return null

  return (
    <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 text-sm md:flex">
      <span className="text-muted-foreground">{role ? ROLE_LABEL[role] : ''}</span>
      <ChevronRight className="size-3.5 text-muted-foreground/60" />
      <span className="font-medium">{match.label}</span>
    </nav>
  )
}

export function Topbar({
  onOpenSidebar,
  onOpenCommand,
}: {
  onOpenSidebar: () => void
  onOpenCommand: () => void
}) {
  const { user, role, logout, profileDegraded } = useAuth()
  const { mode, setMode } = useTheme()

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-xl">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenSidebar}
        aria-label="Open navigation"
      >
        <Menu />
      </Button>

      <Breadcrumbs />

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenCommand}
          className={cn(
            'hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground shadow-xs transition-colors hover:border-primary/40 hover:text-foreground sm:flex',
          )}
        >
          <CommandIcon className="size-3.5" />
          <span>Search…</span>
          <Kbd className="ml-4">Ctrl K</Kbd>
        </button>

        {profileDegraded && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge tone="warning" className="hidden sm:inline-flex">
                <TriangleAlert />
                Limited profile
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              Signed in, but the server could not return your full profile. Some details may be missing.
            </TooltipContent>
          </Tooltip>
        )}

        {/* Jobs are an admin-only API surface, so the bell would 403 for
            anyone else rather than simply showing nothing. */}
        {role === 'ADMIN' && <NotificationsMenu />}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Change theme">
              {mode === 'dark' ? <Moon /> : mode === 'light' ? <Sun /> : <Monitor />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Appearance</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as ThemeMode)}>
              {THEME_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  <option.icon />
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-muted"
              aria-label="Account menu"
            >
              <Avatar name={user?.full_name} size="sm" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <div className="flex items-center gap-3 px-2.5 py-2">
              <Avatar name={user?.full_name} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user?.full_name ?? 'Signed in'}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email || (role ? ROLE_LABEL[role] : '')}</p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/profile">
                <User />
                Profile &amp; settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => logout('manual')}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/providers/auth-provider'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { RouteErrorBoundary } from '@/components/feedback/error-boundary'
import { Scenery } from '@/components/fun/scenery'
import { CommandPalette } from './command-palette'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

export function AppShell() {
  const location = useLocation()
  const { role } = useAuth()
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [commandOpen, setCommandOpen] = React.useState(false)

  /**
   * Scenery is for learners only.
   *
   * Keyed off the ROUTE rather than the role: an admin who opens a student
   * page should see what the student sees, and a student never reaches an
   * admin route anyway. Teachers keep the plain background — the decision on
   * that portal was warmer language, not a redecoration.
   */
  const decorated = location.pathname.startsWith('/student') || role === 'STUDENT'

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/*
        z-20 lifts the chrome above the scenery.

        The scenery is `fixed inset-0`, so it spans the whole viewport including
        the area behind the sidebar and topbar. Offsetting it by the sidebar
        width would mean tracking a value that changes when the sidebar
        collapses; putting the chrome above it instead needs no coordination,
        and both already paint an opaque surface.
      */}
      <div className="relative z-20 hidden lg:block">
        <Sidebar />
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0" hideClose>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative z-20">
          <Topbar
            onOpenSidebar={() => setMobileOpen(true)}
            onOpenCommand={() => setCommandOpen(true)}
          />
        </div>

        <main className="relative flex-1 overflow-y-auto">
          {/* Inside <main> so it scrolls under the content but not over the
              sidebar or topbar, which keep their own solid backgrounds. */}
          {decorated && <Scenery />}
          {/* z-10 keeps the page above the scenery, which sits at z-0. */}
          <div className="relative z-10 mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Contains a crash to the page body — the shell and nav
                    survive, so there is always a way out. */}
                <RouteErrorBoundary path={location.pathname}>
                  <Outlet />
                </RouteErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  )
}

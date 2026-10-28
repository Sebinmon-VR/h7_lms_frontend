import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Lock } from 'lucide-react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/providers/auth-provider'
import { useActiveExam } from '@/queries/exam.queries'
import { clearExamLeft, hasLeftExam } from '@/lib/exam-leave'
import { Button } from '@/components/ui/button'
import { isDemo, lockedModuleFor } from '@/lib/demo'
import { DemoBanner, DemoLockedScreen } from '@/components/domain/demo-account'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { RouteErrorBoundary } from '@/components/feedback/error-boundary'
import { Scenery } from '@/components/fun/scenery'
import { CommandPalette } from './command-palette'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

export function AppShell() {
  const location = useLocation()
  const { role, user } = useAuth()
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

  // A demo account opening a module it has not been given sees what it is and
  // how to get it, rather than a page whose every request is refused.
  const lockedModule = lockedModuleFor(user, location.pathname)

  // A student sitting an exam is held on it - no menu, no search, no other page - until they
  // hand in or their time runs out. The exam page shows the paper, the form and the uploads.
  const activeExam = useActiveExam(role === 'STUDENT')
  const demoHome = location.pathname.startsWith('/tuition') ? '/tuition/student' : '/student'

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

  const examLeft = activeExam ? hasLeftExam(activeExam.id) : false

  if (activeExam && !examLeft) {
    const examPath = activeExam.live_invigilation
      ? `/call/exam/${activeExam.id}`
      : `/student/exams/${activeExam.id}`
    if (location.pathname !== examPath) return <Navigate to={examPath} replace />
    return (
      <div className="flex h-dvh flex-col bg-background">
        <div
          role="status"
          className="flex items-center gap-2 border-b-2 border-warning/40 bg-warning/10 px-4 py-2.5 text-sm"
        >
          <Lock className="size-4 shrink-0 text-warning" />
          <span>
            <span className="font-bold">Exam in progress: {activeExam.title}.</span> Everything else is
            locked until you hand in.
          </span>
        </div>
        <main className="relative flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-5">
            <RouteErrorBoundary path={location.pathname}>
              <Outlet />
            </RouteErrorBoundary>
          </div>
        </main>
      </div>
    )
  }

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
                {activeExam && examLeft && (
                  <div
                    role="alert"
                    className="mb-4 flex flex-col gap-3 rounded-xl border-2 border-warning/50 bg-warning/10 p-4 sm:flex-row sm:items-center"
                  >
                    <Lock className="hidden size-5 shrink-0 text-warning sm:block" />
                    <p className="flex-1 text-sm">
                      <span className="font-bold">Your exam “{activeExam.title}” is still running.</span> The clock has not
                      stopped. Go back before it closes or it closes with only what you have saved.
                    </p>
                    <Button asChild variant="primary" size="sm">
                      <Link
                        to={activeExam.live_invigilation ? `/call/exam/${activeExam.id}` : `/student/exams/${activeExam.id}`}
                        onClick={() => clearExamLeft(activeExam.id)}
                      >
                        Return to exam
                      </Link>
                    </Button>
                  </div>
                )}
                {user && isDemo(user) && <DemoBanner user={user} />}
                <RouteErrorBoundary path={location.pathname}>
                  {lockedModule ? <DemoLockedScreen module={lockedModule} homeTo={demoHome} /> : <Outlet />}
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

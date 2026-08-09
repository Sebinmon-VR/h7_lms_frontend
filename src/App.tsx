import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'

import { AuthProvider } from '@/providers/auth-provider'
import { ThemeProvider, useTheme } from '@/providers/theme-provider'
import { queryClient } from '@/queries/query-client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ErrorBoundary } from '@/components/feedback/error-boundary'
import { AppRoutes } from '@/routes'

function AppToaster() {
  const { resolved } = useTheme()
  return (
    <Toaster
      theme={resolved}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'rounded-xl border border-border shadow-lg',
        },
      }}
    />
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={300} skipDelayDuration={200}>
            <ErrorBoundary variant="page">
              <BrowserRouter>
                <AuthProvider>
                  <AppRoutes />
                </AuthProvider>
              </BrowserRouter>
            </ErrorBoundary>
            <AppToaster />
          </TooltipProvider>
        </MotionConfig>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

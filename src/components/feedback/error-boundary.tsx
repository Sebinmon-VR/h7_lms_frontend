import { Bug, Home, RotateCcw } from 'lucide-react'
import * as React from 'react'

import { IS_DEV } from '@/lib/env'
import { Button } from '@/components/ui/button'

interface Props {
  children: React.ReactNode
  /** Changing this resets the boundary — pass the route so navigation recovers. */
  resetKey?: string
  /** Full-page treatment for the app root; inset for a single route. */
  variant?: 'page' | 'route'
}

interface State {
  error: Error | null
}

/**
 * A render error anywhere below this unmounts the subtree, not the document.
 * Without one, a single bad value (a string where a number was expected, say)
 * blanks the entire application with no way back.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep the stack in the console; there is no error-reporting backend.
    console.error('Render error:', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  private reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const isPage = this.props.variant === 'page'

    return (
      <div
        className={
          isPage
            ? 'flex h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center'
            : 'flex flex-col items-center justify-center gap-4 rounded-xl border border-danger/30 bg-card px-6 py-16 text-center'
        }
        role="alert"
      >
        <div className="flex size-12 items-center justify-center rounded-2xl bg-danger/12 text-danger">
          <Bug className="size-6" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">This screen ran into a problem</h1>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Something in the page failed to render. Your data is safe — reloading or going back usually
            clears it.
          </p>
        </div>

        {IS_DEV && (
          <pre className="max-w-xl overflow-x-auto rounded-md bg-muted px-3 py-2 text-left text-2xs text-muted-foreground">
            {error.message}
          </pre>
        )}

        <div className="flex flex-wrap justify-center gap-2">
          <Button icon={<RotateCcw />} onClick={this.reset}>
            Try again
          </Button>
          <Button variant="outline" icon={<Home />} onClick={() => window.location.assign('/')}>
            Go to dashboard
          </Button>
        </div>
      </div>
    )
  }
}

/** Resets automatically whenever the route changes. */
export function RouteErrorBoundary({ children, path }: { children: React.ReactNode; path: string }) {
  return (
    <ErrorBoundary variant="route" resetKey={path}>
      {children}
    </ErrorBoundary>
  )
}

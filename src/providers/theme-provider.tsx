import * as React from 'react'

import { STORAGE_KEYS } from '@/lib/constants'

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  mode: ThemeMode
  /** What is actually painted right now, after resolving `system`. */
  resolved: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
  /** Increments whenever the painted theme changes; charts re-read tokens on it. */
  version: number
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

function readStoredMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.theme)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    /* private mode */
  }
  return 'system'
}

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<ThemeMode>(readStoredMode)
  const [resolved, setResolved] = React.useState<'light' | 'dark'>(() =>
    mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode,
  )
  const [version, setVersion] = React.useState(0)

  // Apply to <html> and keep `resolved` in sync with the OS when in system mode.
  React.useEffect(() => {
    const apply = () => {
      const next = mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode
      document.documentElement.classList.toggle('dark', next === 'dark')
      setResolved((prev) => {
        if (prev !== next) setVersion((v) => v + 1)
        return next
      })
    }

    apply()

    if (mode !== 'system') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [mode])

  const setMode = React.useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      localStorage.setItem(STORAGE_KEYS.theme, next)
    } catch {
      /* private mode */
    }
  }, [])

  const value = React.useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode, version }),
    [mode, resolved, setMode, version],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}

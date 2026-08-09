import { motion } from 'framer-motion'
import { BookOpen, Compass, Lightbulb, Users } from 'lucide-react'
import * as React from 'react'

import { Wordmark } from '@/components/layout/logo'

/**
 * The brand panel speaks about learning rather than about the software. Anyone
 * reading this screen already has an account here; what they want reflected
 * back is the work — teaching and studying — not a feature list.
 */
const PILLARS = [
  {
    icon: BookOpen,
    title: 'Learning is a habit',
    body: 'Progress comes from turning up to the ordinary lesson, not from the exceptional one.',
  },
  {
    icon: Users,
    title: 'Nobody learns alone',
    body: 'A good class is a room where questions are cheap and curiosity is contagious.',
  },
  {
    icon: Lightbulb,
    title: 'Understanding over marks',
    body: 'A grade records a moment. What you understood outlasts the paper it was written on.',
  },
  {
    icon: Compass,
    title: 'Teachers point the way',
    body: 'The best teaching hands a student the map and trusts them to walk the road.',
  },
]

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* ------------------------------------------------------ brand side */}
      <div className="relative hidden overflow-hidden bg-surface p-10 lg:flex lg:flex-col lg:justify-between">
        <div className="aurora-backdrop absolute inset-0" aria-hidden />
        <div className="grid-pattern absolute inset-0 opacity-60" aria-hidden />

        <div className="relative">
          <Wordmark />
        </div>

        <div className="relative max-w-lg">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl font-semibold leading-tight tracking-tight"
          >
            Education is not filling a bucket,{' '}
            <span className="text-gradient">but lighting a fire.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mt-4 text-sm leading-relaxed text-muted-foreground"
          >
            Every lesson taught, every question asked and every mark earned is a step a student takes
            toward thinking for themselves.
          </motion.p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {PILLARS.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16 + i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex gap-3"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary">
                  <item.icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-muted-foreground">
          Teaching, learning and everything in between.
        </p>
      </div>

      {/* ------------------------------------------------------- form side */}
      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

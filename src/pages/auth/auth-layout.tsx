import { motion } from 'framer-motion'
import { BarChart3, CalendarCheck, GraduationCap, Video } from 'lucide-react'
import * as React from 'react'

import { Wordmark } from '@/components/layout/logo'

const HIGHLIGHTS = [
  { icon: CalendarCheck, title: 'Attendance in seconds', body: 'Mark a whole class from the keyboard, then edit any past date.' },
  { icon: BarChart3, title: 'Insight without spreadsheets', body: 'Attendance trends, grade distributions and at-risk students, computed live.' },
  { icon: Video, title: 'Live classes and recordings', body: 'Schedule sessions, share links and attach recordings in one place.' },
  { icon: GraduationCap, title: 'One place per role', body: 'Administrators, teachers and students each get a workspace built for them.' },
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
            Everything your institution runs on,{' '}
            <span className="text-gradient">in one workspace.</span>
          </motion.h1>

          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {HIGHLIGHTS.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
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
          H7 Learning Management System
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

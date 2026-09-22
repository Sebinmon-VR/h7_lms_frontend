import { Command } from 'cmdk'
import { useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  ClipboardList,
  GraduationCap,
  Layers,
  Library,
  LogOut,
  Moon,
  Search,
  Sun,
  User,
  Users,
  Video,
} from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'

import type {
  ClassRoomOut,
  LiveMeetingOut,
  StudentEnrollmentOut,
  StudyMaterialOut,
  SubjectOut,
  TopicOut,
  UserOut,
} from '@/api/types'
import { isTeachingRole } from '@/lib/constants'
import { useAuth } from '@/providers/auth-provider'
import { useTheme } from '@/providers/theme-provider'
import { qk } from '@/queries/keys'
import { allNavSections } from '@/routes/navigation'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/** Deep-links to a table pre-filtered by its `?q=` search parameter. */
function searchLink(path: string, term: string): string {
  return `${path}?q=${encodeURIComponent(term)}`
}

const GROUP_CLASS =
  'mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground'

/**
 * The honest answer to "there is no server-side search": search whatever is
 * already in the query cache. No extra requests, instant results, and it
 * degrades gracefully to navigation-only when nothing has been loaded yet.
 *
 * Because it reads the cache rather than the network, results depend on where
 * the user has already been — a page never visited contributes nothing. The
 * footer says so rather than letting an empty section read as "no such thing".
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { role, user, logout } = useAuth()
  const { mode, setMode } = useTheme()

  // Unscoped on purpose: jumping from a school screen to a tuition one is
  // precisely what a command palette is for.
  const sections = allNavSections(user)

  /**
   * Read straight from cache — never triggers a fetch.
   *
   * Teacher and student collections are both consulted for each record type
   * because only one of them is ever populated in a given session, and merging
   * lets one palette serve every role without branching on it.
   */
  const cached = React.useMemo(() => {
    if (!open) {
      return { users: [], classes: [], subjects: [], materials: [], meetings: [], topics: [], enrollments: [] }
    }

    const read = <T,>(...keys: readonly (readonly unknown[])[]): T[] =>
      keys.flatMap((key) => queryClient.getQueryData<T[]>(key as unknown[]) ?? [])

    return {
      // Capped: a large institution's user list would otherwise dominate the
      // list and slow the filter down for no benefit.
      users: (queryClient.getQueryData<UserOut[]>(qk.admin.users()) ?? []).slice(0, 200),
      classes: queryClient.getQueryData<ClassRoomOut[]>(qk.admin.classes()) ?? [],
      subjects: queryClient.getQueryData<SubjectOut[]>(qk.admin.subjects()) ?? [],
      enrollments: (queryClient.getQueryData<StudentEnrollmentOut[]>(qk.admin.enrollments()) ?? []).slice(0, 200),
      materials: read<StudyMaterialOut>(qk.teacher.materials(), qk.student.materials()).slice(0, 100),
      meetings: read<LiveMeetingOut>(qk.teacher.meetings(), qk.student.meetings()).slice(0, 100),
      topics: read<TopicOut>(qk.teacher.topics(), qk.student.topics()).slice(0, 100),
    }
  }, [open, queryClient])

  /** Where each record type's list lives, per role. */
  const routes = React.useMemo(() => {
    // Both teaching roles — an equality test would send a class teacher to the
    // student pages, which their role guard then bounces them straight out of.
    const teacher = isTeachingRole(role)
    return {
      materials: teacher ? '/teacher/materials' : '/student/materials',
      meetings: teacher ? '/teacher/meetings' : '/student/meetings',
      topics: teacher ? '/teacher/topics' : '/student/syllabus',
    }
  }, [role])

  const nothingCached =
    cached.users.length === 0 &&
    cached.classes.length === 0 &&
    cached.subjects.length === 0 &&
    cached.materials.length === 0 &&
    cached.meetings.length === 0 &&
    cached.topics.length === 0

  const run = (action: () => void) => {
    onOpenChange(false)
    // Let the dialog close before navigating, so the exit animation plays.
    window.setTimeout(action, 0)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" hideClose className="top-[20%] translate-y-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command
          loop
          filter={(value, search, keywords) => {
            const haystack = `${value} ${keywords?.join(' ') ?? ''}`.toLowerCase()
            const needles = search.toLowerCase().split(/\s+/).filter(Boolean)
            return needles.every((n) => haystack.includes(n)) ? 1 : 0
          }}
        >
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              autoFocus
              placeholder="Search pages, people, classes, materials, meetings…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              No matches found.
            </Command.Empty>

            {sections.map((section) => (
              <Command.Group
                key={section.heading}
                heading={section.heading}
                className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {section.items.map((item) => (
                  <PaletteItem
                    key={item.to}
                    value={item.label}
                    keywords={item.description}
                    icon={<item.icon className="size-4" />}
                    hint={item.description}
                    onSelect={() => run(() => navigate(item.to))}
                  />
                ))}
              </Command.Group>
            ))}

            {cached.users.length > 0 && (
              <Command.Group heading="People" className={GROUP_CLASS}>
                {cached.users.map((user) => (
                  <PaletteItem
                    key={user.id}
                    value={user.full_name}
                    keywords={`${user.email} ${user.role}`}
                    icon={<Users className="size-4" />}
                    hint={user.email}
                    onSelect={() => run(() => navigate(searchLink('/admin/users', user.email)))}
                  />
                ))}
              </Command.Group>
            )}

            {cached.classes.length > 0 && (
              <Command.Group heading="Classes" className={GROUP_CLASS}>
                {cached.classes.map((klass) => (
                  <PaletteItem
                    key={klass.id}
                    value={klass.name}
                    keywords={klass.code}
                    icon={<Layers className="size-4" />}
                    hint={klass.code}
                    onSelect={() => run(() => navigate('/admin/classes'))}
                  />
                ))}
              </Command.Group>
            )}

            {cached.subjects.length > 0 && (
              <Command.Group heading="Subjects" className={GROUP_CLASS}>
                {cached.subjects.map((subject) => (
                  <PaletteItem
                    key={subject.id}
                    value={subject.name}
                    keywords={subject.code}
                    icon={<BookOpen className="size-4" />}
                    hint={subject.code}
                    onSelect={() => run(() => navigate('/admin/subjects'))}
                  />
                ))}
              </Command.Group>
            )}

            {cached.enrollments.length > 0 && (
              <Command.Group heading="Enrollments" className={GROUP_CLASS}>
                {cached.enrollments.map((enrollment) => (
                  <PaletteItem
                    key={enrollment.id}
                    value={`${enrollment.student.full_name} — ${enrollment.class_room.name}`}
                    keywords={`${enrollment.student.email} ${enrollment.class_room.code}`}
                    icon={<GraduationCap className="size-4" />}
                    hint={enrollment.class_room.code}
                    onSelect={() =>
                      run(() => navigate(searchLink('/admin/enrollments', enrollment.student.email)))
                    }
                  />
                ))}
              </Command.Group>
            )}

            {cached.materials.length > 0 && (
              <Command.Group heading="Materials" className={GROUP_CLASS}>
                {cached.materials.map((material) => (
                  <PaletteItem
                    key={material.id}
                    value={material.title}
                    keywords={`${material.material_type} ${material.subject?.name ?? ''} ${material.class_room?.name ?? ''}`}
                    icon={<Library className="size-4" />}
                    hint={material.subject?.name ?? material.material_type}
                    onSelect={() => run(() => navigate(routes.materials))}
                  />
                ))}
              </Command.Group>
            )}

            {cached.meetings.length > 0 && (
              <Command.Group heading="Meetings" className={GROUP_CLASS}>
                {cached.meetings.map((meeting) => (
                  <PaletteItem
                    key={meeting.id}
                    value={meeting.title}
                    keywords={`${meeting.subject?.name ?? ''} ${meeting.class_room?.name ?? ''} ${meeting.status}`}
                    icon={<Video className="size-4" />}
                    hint={meeting.subject?.name ?? meeting.status}
                    onSelect={() => run(() => navigate(routes.meetings))}
                  />
                ))}
              </Command.Group>
            )}

            {cached.topics.length > 0 && (
              <Command.Group heading="Syllabus topics" className={GROUP_CLASS}>
                {cached.topics.map((topic) => (
                  <PaletteItem
                    key={topic.id}
                    value={topic.topic_title}
                    keywords={`${topic.subject?.name ?? ''} ${topic.description ?? ''}`}
                    icon={<ClipboardList className="size-4" />}
                    hint={topic.subject?.name ?? undefined}
                    onSelect={() => run(() => navigate(routes.topics))}
                  />
                ))}
              </Command.Group>
            )}

            <Command.Group heading="Actions" className={GROUP_CLASS}>
              <PaletteItem
                value={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                keywords="theme appearance dark light"
                icon={mode === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
                onSelect={() => run(() => setMode(mode === 'dark' ? 'light' : 'dark'))}
              />
              <PaletteItem
                value="Profile and settings"
                keywords="account session"
                icon={<User className="size-4" />}
                onSelect={() => run(() => navigate('/profile'))}
              />
              <PaletteItem
                value="Sign out"
                keywords="logout exit"
                icon={<LogOut className="size-4" />}
                onSelect={() => run(() => logout('manual'))}
              />
            </Command.Group>
          </Command.List>

          {/* Search covers what this session has already loaded. Saying so is
              better than letting a missing record read as "does not exist". */}
          <p className="border-t border-border px-4 py-2.5 text-2xs text-muted-foreground">
            {nothingCached
              ? 'Records become searchable once you have opened the page that lists them.'
              : 'Searches pages you have already visited this session.'}
          </p>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function PaletteItem({
  value,
  keywords,
  icon,
  hint,
  onSelect,
}: {
  value: string
  keywords?: string
  icon: React.ReactNode
  hint?: string
  onSelect: () => void
}) {
  return (
    <Command.Item
      value={value}
      keywords={keywords ? [keywords] : undefined}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm outline-none data-[selected=true]:bg-primary/10"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{value}</span>
      {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
    </Command.Item>
  )
}

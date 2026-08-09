import type { UserRole } from '@/api/types'

/**
 * Query key factory.
 *
 * Teacher and student keys deliberately carry NO filter parameters: the
 * backend implements `?class_id`/`?subject_id` as Python list comprehensions
 * over the same full fetch, so filtering server-side buys nothing and costs a
 * refetch. One unfiltered cache entry gives instant filter switching and makes
 * cross-class analytics free.
 *
 * `/admin/users` keeps `role` because that one is a real Firestore `where`.
 */
export const qk = {
  auth: {
    root: ['auth'] as const,
    me: () => ['auth', 'me'] as const,
  },
  admin: {
    root: ['admin'] as const,
    users: (role?: UserRole) => ['admin', 'users', role ?? 'ALL'] as const,
    usersRoot: () => ['admin', 'users'] as const,
    classes: () => ['admin', 'classes'] as const,
    subjects: () => ['admin', 'subjects'] as const,
    mappings: () => ['admin', 'mappings'] as const,
    enrollments: () => ['admin', 'enrollments'] as const,
    monitoring: () => ['admin', 'reports', 'monitoring'] as const,
    jobs: () => ['admin', 'jobs'] as const,
    job: (jobId: string) => ['admin', 'jobs', jobId] as const,
  },
  health: {
    root: ['health'] as const,
    cache: () => ['health', 'cache'] as const,
  },
  teacher: {
    root: ['teacher'] as const,
    myClasses: () => ['teacher', 'my-classes'] as const,
    classStudents: (classId: number) => ['teacher', 'class-students', classId] as const,
    classStudentsRoot: () => ['teacher', 'class-students'] as const,
    attendance: () => ['teacher', 'attendance'] as const,
    topics: () => ['teacher', 'topics'] as const,
    meetings: () => ['teacher', 'meetings'] as const,
    materials: () => ['teacher', 'materials'] as const,
    grades: () => ['teacher', 'grades'] as const,
  },
  student: {
    root: ['student'] as const,
    myClasses: () => ['student', 'my-classes'] as const,
    attendance: () => ['student', 'attendance'] as const,
    topics: () => ['student', 'topics'] as const,
    meetings: () => ['student', 'meetings'] as const,
    materials: () => ['student', 'materials'] as const,
    grades: () => ['student', 'grades'] as const,
  },
} as const

/**
 * Freshness tiers, matched to how expensive each endpoint actually is.
 *
 * The backend now batches its reads and caches reference documents for 60s,
 * so list endpoints are no longer punishingly slow. These tiers stay
 * conservative anyway: the remaining latency floor is the ~850 ms round trip
 * between the API and its Firestore region, which caching on our side avoids
 * entirely. Refetching more eagerly would buy freshness nobody asked for at a
 * cost the user feels.
 */
export const STALE = {
  /** Rarely-changing reference data; matches the server's own cache TTL. */
  reference: 5 * 60_000,
  /** Records teachers write during a session. */
  transactional: 60_000,
  /** The monitoring report — server-cached for MONITORING_REPORT_TTL_SECONDS. */
  expensive: 5 * 60_000,
  /** Background job state, polled while a job is in flight. */
  live: 0,
} as const

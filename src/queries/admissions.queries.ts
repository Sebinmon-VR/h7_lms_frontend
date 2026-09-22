import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { admissionsApi, tuitionAdmissionsApi } from '@/api/admissions.api'
import type {
  AcademicYearCreate,
  AcademicYearOut,
  AcademicYearUpdate,
  AdmissionCategoryCreate,
  AdmissionCategoryUpdate,
  Program,
} from '@/api/types'
import { STALE, qk } from './keys'

/**
 * `board` picks which admissions board a hook talks to.
 *
 * The school board (`/admissions`) sees every year and category and filters
 * by `program` if asked. The tuition board (`/admin/tuition/admissions`) sees
 * tuition records only and creates tuition records by default, so the tuition
 * admin's screen never has to say "programs: TUITION" and never shows a school
 * year by mistake. Omitted, hooks use the school board, so every caller that
 * predates the tuition board keeps working unchanged.
 */

// ------------------------------------------------------------------ reads

/**
 * The current session year, or `null` when none is set.
 *
 * `null` is an ordinary answer, not an error — a school that has not finished
 * setting admissions up has no current year, and callers must render that
 * state rather than a spinner or a banner. Long stale time: it changes once a
 * year, deliberately, from one screen.
 */
export function useCurrentYear(program: Program = 'LMS', enabled = true) {
  return useQuery({
    queryKey: qk.admissions.currentYear(program),
    queryFn: () => admissionsApi.currentYear(program),
    staleTime: STALE.reference,
    enabled,
  })
}

/** `withCounts` costs a pass over the students — ask for it on the admin list only. */
export function useAcademicYears(
  params: { board?: Program; program?: Program; withCounts?: boolean } = {},
  enabled = true,
) {
  const tuitionBoard = params.board === 'TUITION'
  return useQuery({
    queryKey: qk.admissions.years(
      tuitionBoard ? 'TUITION' : params.program,
      params.withCounts ?? false,
      tuitionBoard,
    ),
    queryFn: () =>
      tuitionBoard
        ? tuitionAdmissionsApi.listYears({ withCounts: params.withCounts })
        : admissionsApi.listYears(params),
    staleTime: STALE.reference,
    enabled,
  })
}

/**
 * Categories for a year, including the STANDING ones that carry no year of
 * their own. Passing no `academicYearId` returns every category there is,
 * which is what the management screen wants and what a fee form does not.
 */
export function useAdmissionCategories(
  params: {
    board?: Program
    program?: Program
    academicYearId?: number
    includeInactive?: boolean
    withCounts?: boolean
  } = {},
  enabled = true,
) {
  const tuitionBoard = params.board === 'TUITION'
  return useQuery({
    queryKey: qk.admissions.categories(
      params.academicYearId,
      params.includeInactive ?? false,
      params.withCounts ?? false,
      tuitionBoard ? 'TUITION' : params.program,
      tuitionBoard,
    ),
    queryFn: () =>
      tuitionBoard
        ? tuitionAdmissionsApi.listCategories(params)
        : admissionsApi.listCategories(params),
    staleTime: STALE.reference,
    enabled,
  })
}

// -------------------------------------------------------------- mutations

function apiFor(board: Program) {
  return board === 'TUITION' ? tuitionAdmissionsApi : admissionsApi
}

/**
 * Years and categories are read by the finance, enrolment and user screens,
 * and a change to either re-prices what those screens show — so the whole
 * admissions subtree goes rather than one entry.
 */
function invalidateAdmissions(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.admissions.root })
}

/**
 * Creating or updating with `is_current: true` clears the flag on every OTHER
 * year of the same programme in the same write. That is why this invalidates
 * the whole subtree rather than patching the one row: the server has just
 * changed records this response does not mention.
 */
export function useCreateAcademicYear(board: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AcademicYearCreate) => apiFor(board).createYear(body),
    onSuccess: (year: AcademicYearOut) => {
      invalidateAdmissions(qc)
      toast.success(`Session year ${year.name} created`, {
        description: year.is_current ? 'It is now the current year.' : undefined,
      })
    },
  })
}

export function useUpdateAcademicYear(board: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ yearId, body }: { yearId: number; body: AcademicYearUpdate }) =>
      apiFor(board).updateYear(yearId, body),
    onSuccess: (year) => {
      invalidateAdmissions(qc)
      toast.success(`${year.name} updated`)
    },
  })
}

/**
 * Refused while students are admitted into the year.
 *
 * No error toast: the caller shows the server's explanation in place and
 * offers to close the year instead, which is what the office actually wants.
 */
export function useDeleteAcademicYear(board: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    // Reported in place by the caller, not as a toast.
    meta: { silent: true },
    mutationFn: (yearId: number) => apiFor(board).deleteYear(yearId),
    onSuccess: () => {
      invalidateAdmissions(qc)
      toast.success('Session year deleted')
    },
  })
}

export function useCreateAdmissionCategory(board: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AdmissionCategoryCreate) => apiFor(board).createCategory(body),
    onSuccess: (category) => {
      invalidateAdmissions(qc)
      toast.success(`${category.name} added`)
    },
  })
}

export function useUpdateAdmissionCategory(board: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ categoryId, body }: { categoryId: number; body: AdmissionCategoryUpdate }) =>
      apiFor(board).updateCategory(categoryId, body),
    onSuccess: (category) => {
      invalidateAdmissions(qc)
      toast.success(`${category.name} updated`)
    },
  })
}

/** Refused while students hold it. Deactivating keeps their history intact. */
export function useDeleteAdmissionCategory(board: Program = 'LMS') {
  const qc = useQueryClient()
  return useMutation({
    // Reported in place by the caller, not as a toast.
    meta: { silent: true },
    mutationFn: (categoryId: number) => apiFor(board).deleteCategory(categoryId),
    onSuccess: () => {
      invalidateAdmissions(qc)
      toast.success('Category deleted')
    },
  })
}

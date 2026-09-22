import { cleanParams, del, get, post, put } from './client'
import type {
  AcademicYearCreate,
  AcademicYearOut,
  AcademicYearUpdate,
  AdmissionCategoryCreate,
  AdmissionCategoryOut,
  AdmissionCategoryUpdate,
  Program,
} from './types'

/**
 * Session years and admission categories.
 *
 * Everything here is admin-only EXCEPT `currentYear`, which any signed-in user
 * may read — the student's own screens need to know which year they are in.
 *
 * Both deletes are refused while students still point at the record: a year
 * with admissions in it and a category somebody holds. That is a 400 with an
 * explanation, not a failure to report as a crash — offer deactivation
 * instead, which is what the office actually wants.
 */
export const admissionsApi = {
  /**
   * The current year, or `null` when none has been set.
   *
   * Note that is a NULL BODY, not a 404: a fresh deployment with no years
   * configured is an ordinary state, and treating it as an error would put an
   * error banner on every screen of a school that has not finished setting up.
   */
  currentYear: (program: Program = 'LMS') =>
    get<AcademicYearOut | null>('/admissions/years/current', { params: { program } }),

  /**
   * `with_counts` costs a pass over the students, so it is opt-in — the admin
   * list wants it, a year picker does not.
   */
  listYears: (params: { program?: Program; withCounts?: boolean } = {}) =>
    get<AcademicYearOut[]>('/admissions/years', {
      params: cleanParams({ program: params.program, with_counts: params.withCounts }),
    }),

  getYear: (yearId: number) => get<AcademicYearOut>(`/admissions/years/${yearId}`),

  /**
   * Creating with `is_current: true` clears the flag on every other year in
   * the same write. A "make this current" toggle therefore needs no second
   * call, and the list should be refetched rather than patched by hand.
   */
  createYear: (body: AcademicYearCreate) => post<AcademicYearOut>('/admissions/years', body),

  updateYear: (yearId: number, body: AcademicYearUpdate) =>
    put<AcademicYearOut>(`/admissions/years/${yearId}`, body),

  /** 400 while students are admitted into it. Close the year instead. */
  deleteYear: (yearId: number) => del(`/admissions/years/${yearId}`),

  /**
   * Categories with no `academic_year_id` are STANDING — inherited by every
   * year. Passing `academic_year_id` returns that year's own categories plus
   * the standing ones, which is what a fee screen wants.
   */
  listCategories: (
    params: {
      program?: Program
      academicYearId?: number
      includeInactive?: boolean
      withCounts?: boolean
    } = {},
  ) =>
    get<AdmissionCategoryOut[]>('/admissions/categories', {
      params: cleanParams({
        program: params.program,
        academic_year_id: params.academicYearId,
        include_inactive: params.includeInactive,
        with_counts: params.withCounts,
      }),
    }),

  getCategory: (categoryId: number) =>
    get<AdmissionCategoryOut>(`/admissions/categories/${categoryId}`),

  createCategory: (body: AdmissionCategoryCreate) =>
    post<AdmissionCategoryOut>('/admissions/categories', body),

  updateCategory: (categoryId: number, body: AdmissionCategoryUpdate) =>
    put<AdmissionCategoryOut>(`/admissions/categories/${categoryId}`, body),

  /** 400 while students hold it — deactivate instead, which keeps their history. */
  deleteCategory: (categoryId: number) => del(`/admissions/categories/${categoryId}`),
}

/**
 * The tuition programme's own admissions board.
 *
 * Same records, same shapes, on `/admin/tuition/admissions`. What the route
 * adds is the scope: it lists only tuition years and categories, creates
 * records that are TUITION records without the form saying so, and answers
 * 404 for a school-only record by id — it is simply not on this board.
 *
 * The one asymmetry: `currentYear` here is readable by anyone IN the
 * programme (a tuition student's header wants the batch name), whereas the
 * school client's is readable by any signed-in user.
 */
const TUITION = '/admin/tuition/admissions'

export const tuitionAdmissionsApi = {
  currentYear: () => get<AcademicYearOut | null>(`${TUITION}/years/current`),

  listYears: (params: { withCounts?: boolean } = {}) =>
    get<AcademicYearOut[]>(`${TUITION}/years`, {
      params: cleanParams({ with_counts: params.withCounts }),
    }),

  getYear: (yearId: number) => get<AcademicYearOut>(`${TUITION}/years/${yearId}`),

  /** `programs` may be omitted — it defaults to TUITION alone. */
  createYear: (body: AcademicYearCreate) => post<AcademicYearOut>(`${TUITION}/years`, body),

  /** Dropping TUITION from `programs` is refused: that would remove it from this board. */
  updateYear: (yearId: number, body: AcademicYearUpdate) =>
    put<AcademicYearOut>(`${TUITION}/years/${yearId}`, body),

  deleteYear: (yearId: number) => del(`${TUITION}/years/${yearId}`),

  listCategories: (
    params: { academicYearId?: number; includeInactive?: boolean; withCounts?: boolean } = {},
  ) =>
    get<AdmissionCategoryOut[]>(`${TUITION}/categories`, {
      params: cleanParams({
        academic_year_id: params.academicYearId,
        include_inactive: params.includeInactive,
        with_counts: params.withCounts,
      }),
    }),

  getCategory: (categoryId: number) =>
    get<AdmissionCategoryOut>(`${TUITION}/categories/${categoryId}`),

  createCategory: (body: AdmissionCategoryCreate) =>
    post<AdmissionCategoryOut>(`${TUITION}/categories`, body),

  updateCategory: (categoryId: number, body: AdmissionCategoryUpdate) =>
    put<AdmissionCategoryOut>(`${TUITION}/categories/${categoryId}`, body),

  deleteCategory: (categoryId: number) => del(`${TUITION}/categories/${categoryId}`),
}

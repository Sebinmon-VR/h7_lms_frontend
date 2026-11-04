import { del, get, post } from './client'
import type { ApiDate, CoverCreate, ScheduledPeriod, TeacherSummaryOut } from './types'

/**
 * Who takes a timetable period on one date. A cover applies to that date only; the recurring
 * timetable never changes. Admins see every period of the day; a teacher sees their own.
 */
export const coverApi = {
  adminDay: (day: ApiDate) =>
    get<ScheduledPeriod[]>('/admin/cover', { params: { on_date: day } }),
  adminAssign: (body: CoverCreate) => post<ScheduledPeriod>('/admin/cover', body),
  adminClear: (entryId: number, day: ApiDate) => del(`/admin/cover/${entryId}/${day}`),

  myDay: (day: ApiDate) => get<ScheduledPeriod[]>('/teachers/cover', { params: { on_date: day } }),
  myAssign: (body: CoverCreate) => post<ScheduledPeriod>('/teachers/cover', body),
  myClear: (entryId: number, day: ApiDate) => del(`/teachers/cover/${entryId}/${day}`),

  /** Teachers only; admins choose from the users list instead. */
  staff: () => get<TeacherSummaryOut[]>('/teachers/staff'),
}

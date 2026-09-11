import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/app-shell'
import {
  BootSplash,
  RedirectIfAuthenticated,
  RequireAuth,
  RequireProgram,
  RequireRole,
  RoleHomeRedirect,
} from '@/components/layout/guards'

// Split per role so a student never downloads the admin bundle.
const LoginPage = lazy(() => import('@/pages/auth/login'))
const ProfilePage = lazy(() => import('@/pages/shared/profile'))
const NotFoundPage = lazy(() => import('@/pages/shared/not-found'))

const AdminDashboard = lazy(() => import('@/pages/admin/dashboard'))
const AdminUsers = lazy(() => import('@/pages/admin/users'))
const AdminClasses = lazy(() => import('@/pages/admin/classes'))
const AdminSubjects = lazy(() => import('@/pages/admin/subjects'))
const AdminMappings = lazy(() => import('@/pages/admin/assignments'))
const AdminMappingNew = lazy(() => import('@/pages/admin/mapping-new'))
const AdminClassTeacherNew = lazy(() => import('@/pages/admin/class-teacher-new'))
const AdminEnrollments = lazy(() => import('@/pages/admin/enrollments'))
const AdminReports = lazy(() => import('@/pages/admin/reports'))
const AdminMeetings = lazy(() => import('@/pages/admin/meetings'))
const AdminMaterials = lazy(() => import('@/pages/admin/materials'))
const AdminIntegrations = lazy(() => import('@/pages/admin/integrations'))
const AdminTimetable = lazy(() => import('@/pages/admin/timetable'))
const AdminReminders = lazy(() => import('@/pages/admin/reminders'))
const AdminRecordings = lazy(() => import('@/pages/admin/recordings'))

// Online tuition — a second product sharing this login. Admin-side screens
// live under /admin/tuition; the two participant-facing sets are under
// /tuition, because a teacher who does both jobs needs the two kept apart.
const AdminTuitionDashboard = lazy(() => import('@/pages/admin/tuition/dashboard'))
const AdminTuitionEnrollments = lazy(() => import('@/pages/admin/tuition/enrollments'))
const AdminTuitionSchedule = lazy(() => import('@/pages/admin/tuition/schedule'))
const AdminTuitionSessions = lazy(() => import('@/pages/admin/tuition/sessions'))
const AdminTuitionFees = lazy(() => import('@/pages/admin/tuition/fees'))
const AdminTuitionAccess = lazy(() => import('@/pages/admin/tuition/access'))
const AdminTuitionSettings = lazy(() => import('@/pages/admin/tuition/settings'))

const TuitionLibrary = lazy(() => import('@/pages/tuition/library'))

const TuitionTeacherDashboard = lazy(() => import('@/pages/tuition/teacher/dashboard'))
const TuitionTeacherStudents = lazy(() => import('@/pages/tuition/teacher/students'))
const TuitionTeacherSessions = lazy(() => import('@/pages/tuition/teacher/sessions'))
const TuitionTeacherAssessments = lazy(() => import('@/pages/tuition/teacher/assessments'))
const TuitionTeacherReports = lazy(() => import('@/pages/tuition/teacher/reports'))

const TuitionStudentDashboard = lazy(() => import('@/pages/tuition/student/dashboard'))
const TuitionStudentSubjects = lazy(() => import('@/pages/tuition/student/subjects'))
const TuitionStudentSessions = lazy(() => import('@/pages/tuition/student/sessions'))
const TuitionStudentAssessments = lazy(() => import('@/pages/tuition/student/assessments'))
const TuitionStudentReports = lazy(() => import('@/pages/tuition/student/reports'))
const TuitionStudentReportCards = lazy(() => import('@/pages/tuition/student/report-cards'))
const TuitionStudentReportCardDetail = lazy(() =>
  import('@/pages/tuition/student/report-cards').then((m) => ({
    default: m.TuitionStudentReportCardDetailPage,
  })),
)

const TeacherDashboard = lazy(() => import('@/pages/teacher/dashboard'))
const TeacherClasses = lazy(() => import('@/pages/teacher/classes'))
const TeacherAttendance = lazy(() => import('@/pages/teacher/attendance'))
const TeacherTopics = lazy(() => import('@/pages/teacher/topics'))
const TeacherMeetings = lazy(() => import('@/pages/teacher/meetings'))
const TeacherMaterials = lazy(() => import('@/pages/teacher/materials'))
const TeacherGradebook = lazy(() => import('@/pages/teacher/gradebook'))
const TeacherInsights = lazy(() => import('@/pages/teacher/insights'))
const TeacherTimetable = lazy(() => import('@/pages/teacher/timetable'))

const StudentDashboard = lazy(() => import('@/pages/student/dashboard'))
const StudentClasses = lazy(() => import('@/pages/student/classes'))
const StudentAttendance = lazy(() => import('@/pages/student/attendance'))
const StudentSyllabus = lazy(() => import('@/pages/student/syllabus'))
const StudentMeetings = lazy(() => import('@/pages/student/meetings'))
const StudentMaterials = lazy(() => import('@/pages/student/materials'))
const StudentGrades = lazy(() => import('@/pages/student/grades'))
const StudentTimetable = lazy(() => import('@/pages/student/timetable'))
const StudentExams = lazy(() => import('@/pages/student/exams'))
const StudentExamTake = lazy(() => import('@/pages/student/exam-take'))
const StudentReportCards = lazy(() => import('@/pages/student/report-cards'))
const StudentReportCardDetail = lazy(() =>
  import('@/pages/student/report-cards').then((m) => ({ default: m.StudentReportCardDetailPage })),
)

// The exam module is one set of screens served to both teachers and admins:
// the backend answers the same endpoints for either, deciding per request how
// much each may see, so the pages are mounted under both prefixes and read
// their own base path from the signed-in role.
const ExamList = lazy(() => import('@/pages/exams/exam-list'))
const ExamForm = lazy(() => import('@/pages/exams/exam-form'))
const ExamDetail = lazy(() => import('@/pages/exams/exam-detail'))
const ExamGrading = lazy(() => import('@/pages/exams/grading'))
const ReportCards = lazy(() => import('@/pages/exams/report-cards'))
const ReportCardDetail = lazy(() =>
  import('@/pages/exams/report-cards').then((m) => ({ default: m.ReportCardDetailPage })),
)

function examRoutes(prefix: '/admin' | '/teacher') {
  return (
    <>
      <Route path={`${prefix}/exams`} element={<ExamList />} />
      <Route path={`${prefix}/exams/new`} element={<ExamForm />} />
      <Route path={`${prefix}/exams/:examId`} element={<ExamDetail />} />
      <Route path={`${prefix}/exams/:examId/edit`} element={<ExamForm />} />
      <Route path={`${prefix}/exams/:examId/grade/:studentId`} element={<ExamGrading />} />
      <Route path={`${prefix}/report-cards`} element={<ReportCards />} />
      <Route path={`${prefix}/report-cards/:cardId`} element={<ReportCardDetail />} />
    </>
  )
}

export function AppRoutes() {
  return (
    <Suspense fallback={<BootSplash />}>
      <Routes>
        <Route
          path="/login"
          element={
            <RedirectIfAuthenticated>
              <LoginPage />
            </RedirectIfAuthenticated>
          }
        />
        {/* Self-registration was removed: the backend has no
            `POST /auth/register` and accounts are provisioned by an
            administrator. The old URL redirects rather than 404s, because it
            was linked from the login screen for several releases. */}
        <Route path="/register" element={<Navigate to="/login" replace />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<RoleHomeRedirect />} />
            <Route path="/profile" element={<ProfilePage />} />

            <Route element={<RequireRole allow={['ADMIN']} />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/classes" element={<AdminClasses />} />
              <Route path="/admin/subjects" element={<AdminSubjects />} />
              <Route path="/admin/mappings" element={<AdminMappings />} />
              {/* Both mapping forms own a route rather than a dialog: they
                  explain what an assignment grants and preview it before it is
                  made, which needs more room than a modal has. */}
              <Route path="/admin/mappings/new" element={<AdminMappingNew />} />
              <Route
                path="/admin/mappings/class-teacher/new"
                element={<AdminClassTeacherNew />}
              />
              {/* Older label; keep the URL working. */}
              <Route path="/admin/assignments" element={<Navigate to="/admin/mappings" replace />} />
              <Route path="/admin/enrollments" element={<AdminEnrollments />} />
              <Route path="/admin/reports" element={<AdminReports />} />
              <Route path="/admin/meetings" element={<AdminMeetings />} />
              <Route path="/admin/materials" element={<AdminMaterials />} />
              <Route path="/admin/integrations" element={<AdminIntegrations />} />
              <Route path="/admin/timetable" element={<AdminTimetable />} />
              <Route path="/admin/reminders" element={<AdminReminders />} />
              <Route path="/admin/recordings" element={<AdminRecordings />} />

              {/* The tuition product, admin side. No programme guard: the
                  backend does not scope admins either — one admin team runs
                  both, and locking one out because nobody ticked a box is a
                  support call, not a security win. */}
              <Route path="/admin/tuition" element={<AdminTuitionDashboard />} />
              <Route path="/admin/tuition/enrollments" element={<AdminTuitionEnrollments />} />
              <Route path="/admin/tuition/schedule" element={<AdminTuitionSchedule />} />
              <Route path="/admin/tuition/sessions" element={<AdminTuitionSessions />} />
              <Route path="/admin/tuition/fees" element={<AdminTuitionFees />} />
              <Route path="/admin/tuition/access" element={<AdminTuitionAccess />} />
              <Route path="/admin/tuition/settings" element={<AdminTuitionSettings />} />

              {examRoutes('/admin')}
            </Route>

            {/* Admins may open teacher pages; those views explain the scoping
                and point at the system-wide equivalents above. A class teacher
                is an ordinary teacher here — their extra reach is per class,
                which a route guard cannot express. */}
            <Route element={<RequireRole allow={['TEACHER', 'CLASS_TEACHER', 'ADMIN']} />}>
              {/* The school half. A tuition-only tutor has no classes, no
                  register and no school timetable, so these are gated on LMS
                  membership rather than left to answer 403 one by one. */}
              <Route element={<RequireProgram program="LMS" />}>
                <Route path="/teacher" element={<TeacherDashboard />} />
                <Route path="/teacher/classes" element={<TeacherClasses />} />
                <Route path="/teacher/attendance" element={<TeacherAttendance />} />
                <Route path="/teacher/topics" element={<TeacherTopics />} />
                <Route path="/teacher/meetings" element={<TeacherMeetings />} />
                <Route path="/teacher/materials" element={<TeacherMaterials />} />
                <Route path="/teacher/gradebook" element={<TeacherGradebook />} />
                <Route path="/teacher/insights" element={<TeacherInsights />} />
                <Route path="/teacher/timetable" element={<TeacherTimetable />} />
              </Route>

              {/* Deliberately OUTSIDE that gate. The exam engine serves both
                  products — a tuition assessment IS an exam, and its endpoints
                  are guarded by `require_teacher` alone, with no programme
                  check. A tuition-only tutor reaches these to build and mark
                  the homework they set. */}
              {examRoutes('/teacher')}
            </Route>

            <Route element={<RequireRole allow={['STUDENT', 'ADMIN']} />}>
              {/* The school half. A tuition-only student is in no class, has
                  no school register and sits no school exams, so none of this
                  is theirs. */}
              <Route element={<RequireProgram program="LMS" />}>
                <Route path="/student" element={<StudentDashboard />} />
                <Route path="/student/classes" element={<StudentClasses />} />
                <Route path="/student/attendance" element={<StudentAttendance />} />
                <Route path="/student/syllabus" element={<StudentSyllabus />} />
                <Route path="/student/meetings" element={<StudentMeetings />} />
                <Route path="/student/materials" element={<StudentMaterials />} />
                <Route path="/student/grades" element={<StudentGrades />} />
                <Route path="/student/timetable" element={<StudentTimetable />} />
                <Route path="/student/exams" element={<StudentExams />} />
                <Route path="/student/report-cards" element={<StudentReportCards />} />
                <Route path="/student/report-cards/:cardId" element={<StudentReportCardDetail />} />
              </Route>

              {/* Sitting ONE paper stays open to both products, and only this
                  route does. A tuition student's homework is a real exam
                  served by the same engine — `/students/exams/{id}` is guarded
                  by `require_student` with no programme check — so gating it
                  would leave them unable to hand in work their tutor set. The
                  LIST above stays school-only: it enumerates class exams, and
                  a tuition student reads theirs from the tuition module. */}
              <Route path="/student/exams/:examId" element={<StudentExamTake />} />
            </Route>

            {/* Online tuition, participant side.
                Two guards, and the order matters: the role guard answers "may
                a teacher open this?", the programme guard answers "is this
                teacher one of ours?". The backend applies exactly this pair to
                every tuition route, so mirroring it here turns a wall of 403s
                into one redirect with an explanation. */}
            <Route element={<RequireRole allow={['TEACHER', 'CLASS_TEACHER', 'STUDENT', 'ADMIN']} />}>
              <Route element={<RequireProgram program="TUITION" />}>
                {/* The library is the one screen all three roles share: the
                    backend decides reach per request from visibility, the
                    reader's own arrangements and their role. */}
                <Route path="/tuition/library" element={<TuitionLibrary />} />
              </Route>
            </Route>

            <Route element={<RequireRole allow={['TEACHER', 'CLASS_TEACHER', 'ADMIN']} />}>
              <Route element={<RequireProgram program="TUITION" />}>
                <Route path="/tuition/teacher" element={<TuitionTeacherDashboard />} />
                <Route path="/tuition/teacher/students" element={<TuitionTeacherStudents />} />
                <Route path="/tuition/teacher/sessions" element={<TuitionTeacherSessions />} />
                <Route
                  path="/tuition/teacher/assessments"
                  element={<TuitionTeacherAssessments />}
                />
                <Route path="/tuition/teacher/reports" element={<TuitionTeacherReports />} />
              </Route>
            </Route>

            <Route element={<RequireRole allow={['STUDENT', 'ADMIN']} />}>
              <Route element={<RequireProgram program="TUITION" />}>
                <Route path="/tuition/student" element={<TuitionStudentDashboard />} />
                <Route path="/tuition/student/subjects" element={<TuitionStudentSubjects />} />
                <Route path="/tuition/student/sessions" element={<TuitionStudentSessions />} />
                <Route
                  path="/tuition/student/assessments"
                  element={<TuitionStudentAssessments />}
                />
                <Route path="/tuition/student/reports" element={<TuitionStudentReports />} />
                <Route
                  path="/tuition/student/report-cards"
                  element={<TuitionStudentReportCards />}
                />
                <Route
                  path="/tuition/student/report-cards/:cardId"
                  element={<TuitionStudentReportCardDetail />}
                />
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

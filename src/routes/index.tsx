import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/app-shell'
import {
  BootSplash,
  RedirectIfAuthenticated,
  RequireAuth,
  RequireRole,
  RoleHomeRedirect,
} from '@/components/layout/guards'

// Split per role so a student never downloads the admin bundle.
const LoginPage = lazy(() => import('@/pages/auth/login'))
const RegisterPage = lazy(() => import('@/pages/auth/register'))
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
        <Route
          path="/register"
          element={
            <RedirectIfAuthenticated>
              <RegisterPage />
            </RedirectIfAuthenticated>
          }
        />

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
              {examRoutes('/admin')}
            </Route>

            {/* Admins may open teacher pages; those views explain the scoping
                and point at the system-wide equivalents above. A class teacher
                is an ordinary teacher here — their extra reach is per class,
                which a route guard cannot express. */}
            <Route element={<RequireRole allow={['TEACHER', 'CLASS_TEACHER', 'ADMIN']} />}>
              <Route path="/teacher" element={<TeacherDashboard />} />
              <Route path="/teacher/classes" element={<TeacherClasses />} />
              <Route path="/teacher/attendance" element={<TeacherAttendance />} />
              <Route path="/teacher/topics" element={<TeacherTopics />} />
              <Route path="/teacher/meetings" element={<TeacherMeetings />} />
              <Route path="/teacher/materials" element={<TeacherMaterials />} />
              <Route path="/teacher/gradebook" element={<TeacherGradebook />} />
              <Route path="/teacher/insights" element={<TeacherInsights />} />
              <Route path="/teacher/timetable" element={<TeacherTimetable />} />
              {examRoutes('/teacher')}
            </Route>

            <Route element={<RequireRole allow={['STUDENT', 'ADMIN']} />}>
              <Route path="/student" element={<StudentDashboard />} />
              <Route path="/student/classes" element={<StudentClasses />} />
              <Route path="/student/attendance" element={<StudentAttendance />} />
              <Route path="/student/syllabus" element={<StudentSyllabus />} />
              <Route path="/student/meetings" element={<StudentMeetings />} />
              <Route path="/student/materials" element={<StudentMaterials />} />
              <Route path="/student/grades" element={<StudentGrades />} />
              <Route path="/student/timetable" element={<StudentTimetable />} />
              <Route path="/student/exams" element={<StudentExams />} />
              <Route path="/student/exams/:examId" element={<StudentExamTake />} />
              <Route path="/student/report-cards" element={<StudentReportCards />} />
              <Route path="/student/report-cards/:cardId" element={<StudentReportCardDetail />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

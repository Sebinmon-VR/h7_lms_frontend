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
const AdminEnrollments = lazy(() => import('@/pages/admin/enrollments'))
const AdminReports = lazy(() => import('@/pages/admin/reports'))

const TeacherDashboard = lazy(() => import('@/pages/teacher/dashboard'))
const TeacherClasses = lazy(() => import('@/pages/teacher/classes'))
const TeacherAttendance = lazy(() => import('@/pages/teacher/attendance'))
const TeacherTopics = lazy(() => import('@/pages/teacher/topics'))
const TeacherMeetings = lazy(() => import('@/pages/teacher/meetings'))
const TeacherMaterials = lazy(() => import('@/pages/teacher/materials'))
const TeacherGradebook = lazy(() => import('@/pages/teacher/gradebook'))
const TeacherInsights = lazy(() => import('@/pages/teacher/insights'))

const StudentDashboard = lazy(() => import('@/pages/student/dashboard'))
const StudentClasses = lazy(() => import('@/pages/student/classes'))
const StudentAttendance = lazy(() => import('@/pages/student/attendance'))
const StudentSyllabus = lazy(() => import('@/pages/student/syllabus'))
const StudentMeetings = lazy(() => import('@/pages/student/meetings'))
const StudentMaterials = lazy(() => import('@/pages/student/materials'))
const StudentGrades = lazy(() => import('@/pages/student/grades'))

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
              {/* Older label; keep the URL working. */}
              <Route path="/admin/assignments" element={<Navigate to="/admin/mappings" replace />} />
              <Route path="/admin/enrollments" element={<AdminEnrollments />} />
              <Route path="/admin/reports" element={<AdminReports />} />
            </Route>

            {/* Admins may open teacher pages; those views explain the scoping. */}
            <Route element={<RequireRole allow={['TEACHER', 'ADMIN']} />}>
              <Route path="/teacher" element={<TeacherDashboard />} />
              <Route path="/teacher/classes" element={<TeacherClasses />} />
              <Route path="/teacher/attendance" element={<TeacherAttendance />} />
              <Route path="/teacher/topics" element={<TeacherTopics />} />
              <Route path="/teacher/meetings" element={<TeacherMeetings />} />
              <Route path="/teacher/materials" element={<TeacherMaterials />} />
              <Route path="/teacher/gradebook" element={<TeacherGradebook />} />
              <Route path="/teacher/insights" element={<TeacherInsights />} />
            </Route>

            <Route element={<RequireRole allow={['STUDENT', 'ADMIN']} />}>
              <Route path="/student" element={<StudentDashboard />} />
              <Route path="/student/classes" element={<StudentClasses />} />
              <Route path="/student/attendance" element={<StudentAttendance />} />
              <Route path="/student/syllabus" element={<StudentSyllabus />} />
              <Route path="/student/meetings" element={<StudentMeetings />} />
              <Route path="/student/materials" element={<StudentMaterials />} />
              <Route path="/student/grades" element={<StudentGrades />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

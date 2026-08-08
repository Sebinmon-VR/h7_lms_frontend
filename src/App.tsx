import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import Login from './pages/Login'

import StudentDashboard from './pages/StudentDashboard'
import StudentMaterials from './pages/StudentMaterials'
import StudentGrades from './pages/StudentGrades'
import StudentMeetings from './pages/StudentMeetings'
import StudentAttendance from './pages/StudentAttendance'

import TeacherDashboard from './pages/TeacherDashboard'
import TeacherAttendance from './pages/TeacherAttendance'
import TeacherTopics from './pages/TeacherTopics'
import TeacherMeetings from './pages/TeacherMeetings'
import TeacherMaterials from './pages/TeacherMaterials'
import TeacherGrades from './pages/TeacherGrades'

import AdminDashboard from './pages/AdminDashboard'
import AdminUsers from './pages/AdminUsers'
import AdminClasses from './pages/AdminClasses'
import AdminSubjects from './pages/AdminSubjects'
import AdminMappings from './pages/AdminMappings'
import AdminEnrollments from './pages/AdminEnrollments'
import AdminReports from './pages/AdminReports'

function PrivateRoute({ children, allowedRoles }: { children: JSX.Element, allowedRoles?: string[] }) {
  const token = localStorage.getItem('access_token')
  const role = localStorage.getItem('role')
  if (!token) return <Navigate to="/login" replace />
  if (allowedRoles && role && !allowedRoles.includes(role)) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Student routes */}
        <Route path="/student" element={<PrivateRoute allowedRoles={["STUDENT","ADMIN"]}><StudentDashboard /></PrivateRoute>} />
        <Route path="/student/materials" element={<PrivateRoute allowedRoles={["STUDENT","ADMIN"]}><StudentMaterials /></PrivateRoute>} />
        <Route path="/student/grades" element={<PrivateRoute allowedRoles={["STUDENT","ADMIN"]}><StudentGrades /></PrivateRoute>} />
        <Route path="/student/meetings" element={<PrivateRoute allowedRoles={["STUDENT","ADMIN"]}><StudentMeetings /></PrivateRoute>} />
        <Route path="/student/attendance" element={<PrivateRoute allowedRoles={["STUDENT","ADMIN"]}><StudentAttendance /></PrivateRoute>} />

        {/* Teacher routes */}
        <Route path="/teacher" element={<PrivateRoute allowedRoles={["TEACHER","ADMIN"]}><TeacherDashboard /></PrivateRoute>} />
        <Route path="/teacher/attendance" element={<PrivateRoute allowedRoles={["TEACHER","ADMIN"]}><TeacherAttendance /></PrivateRoute>} />
        <Route path="/teacher/topics" element={<PrivateRoute allowedRoles={["TEACHER","ADMIN"]}><TeacherTopics /></PrivateRoute>} />
        <Route path="/teacher/meetings" element={<PrivateRoute allowedRoles={["TEACHER","ADMIN"]}><TeacherMeetings /></PrivateRoute>} />
        <Route path="/teacher/materials" element={<PrivateRoute allowedRoles={["TEACHER","ADMIN"]}><TeacherMaterials /></PrivateRoute>} />
        <Route path="/teacher/grades" element={<PrivateRoute allowedRoles={["TEACHER","ADMIN"]}><TeacherGrades /></PrivateRoute>} />

        {/* Admin routes */}
        <Route path="/admin" element={<PrivateRoute allowedRoles={["ADMIN"]}><AdminDashboard /></PrivateRoute>} />
        <Route path="/admin/users" element={<PrivateRoute allowedRoles={["ADMIN"]}><AdminUsers /></PrivateRoute>} />
        <Route path="/admin/classes" element={<PrivateRoute allowedRoles={["ADMIN"]}><AdminClasses /></PrivateRoute>} />
        <Route path="/admin/subjects" element={<PrivateRoute allowedRoles={["ADMIN"]}><AdminSubjects /></PrivateRoute>} />
        <Route path="/admin/mappings" element={<PrivateRoute allowedRoles={["ADMIN"]}><AdminMappings /></PrivateRoute>} />
        <Route path="/admin/enrollments" element={<PrivateRoute allowedRoles={["ADMIN"]}><AdminEnrollments /></PrivateRoute>} />
        <Route path="/admin/reports" element={<PrivateRoute allowedRoles={["ADMIN"]}><AdminReports /></PrivateRoute>} />

        {/* fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  )
}

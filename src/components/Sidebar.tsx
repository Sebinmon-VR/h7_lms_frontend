import React from 'react'
import { Link } from 'react-router-dom'

export default function Sidebar({ role }: { role?: string | null }) {
  return (
    <aside className="w-64 p-4 bg-white/70 rounded-l-2xl h-full">
      <nav className="space-y-2">
        {role === 'ADMIN' && (
          <>
            <Link to="/admin" className="block px-3 py-2 rounded hover:bg-kidPrimary/30">Dashboard</Link>
            <Link to="/admin/users" className="block px-3 py-2 rounded hover:bg-kidPrimary/30">Users</Link>
            <Link to="/admin/reports" className="block px-3 py-2 rounded hover:bg-kidPrimary/30">Reports</Link>
          </>
        )}

        {role === 'TEACHER' && (
          <>
            <Link to="/teacher" className="block px-3 py-2 rounded hover:bg-kidPrimary/30">My Classes</Link>
            <Link to="/teacher/attendance" className="block px-3 py-2 rounded hover:bg-kidPrimary/30">Attendance</Link>
            <Link to="/teacher/materials" className="block px-3 py-2 rounded hover:bg-kidPrimary/30">Materials</Link>
          </>
        )}

        {role === 'STUDENT' && (
          <>
            <Link to="/student" className="block px-3 py-2 rounded hover:bg-kidPrimary/30">My Dashboard</Link>
            <Link to="/student/materials" className="block px-3 py-2 rounded hover:bg-kidPrimary/30">Materials</Link>
            <Link to="/student/grades" className="block px-3 py-2 rounded hover:bg-kidPrimary/30">Grades</Link>
          </>
        )}

      </nav>
    </aside>
  )
}

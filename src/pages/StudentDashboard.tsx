import React, { useEffect, useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import api from '../api/apiClient'

export default function StudentDashboard() {
  const [classes, setClasses] = useState<any[]>([])

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get('/api/v1/students/my-classes')
        setClasses(res.data ?? [])
      } catch (err) {
        // ignore for now
      }
    }
    fetch()
  }, [])

  return (
    <div className="min-h-screen flex">
      <Sidebar role={localStorage.getItem('role')} />
      <div className="flex-1 p-6">
        <Header />
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.length === 0 && (
            <div className="card">No classes enrolled yet. Explore the schedule or contact admin.</div>
          )}
          {classes.map((c) => (
            <div key={c.id} className="card">
              <div className="text-lg font-bold">{c.name ?? c.class_name ?? 'Class'}</div>
              <div className="text-sm text-gray-600">Subject: {c.subject ?? '—'}</div>
              <div className="mt-2 text-sm">Teacher: {c.teacher_name ?? '—'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

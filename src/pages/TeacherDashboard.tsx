import React, { useEffect, useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import api from '../api/apiClient'

export default function TeacherDashboard() {
  const [classes, setClasses] = useState<any[]>([])

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get('/api/v1/teachers/my-classes')
        setClasses(res.data ?? [])
      } catch (err) {
        // ignore
      }
    }
    fetch()
  }, [])

  return (
    <div className="min-h-screen flex">
      <Sidebar role={localStorage.getItem('role')} />
      <div className="flex-1 p-6">
        <Header />
        <div className="mt-6">
          <h2 className="text-2xl font-bold">My Classes</h2>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {classes.length === 0 && <div className="card">No assigned classes.</div>}
            {classes.map((c) => (
              <div key={c.id} className="card">
                <div className="text-lg font-semibold">{c.name ?? c.class_name}</div>
                <div className="text-sm text-gray-500">Students: {c.student_count ?? '—'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

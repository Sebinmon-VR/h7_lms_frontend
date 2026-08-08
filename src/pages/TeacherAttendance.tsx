import React, { useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import api from '../api/apiClient'

export default function TeacherAttendance(){
  const [students, setStudents] = useState<any[]>([])
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10))

  const load = async () => {
    try {
      // API to fetch students for a class should exist; replace query params as needed
      const res = await api.get('/api/v1/teachers/classes/CLASS-10A/students')
      setStudents(res.data ?? [])
    } catch (err) {
      // ignore
    }
  }

  const submit = async () => {
    const payload = students.map(s => ({ student_id: s.id, status: 'PRESENT', date }))
    try {
      await api.post('/api/v1/teachers/attendance', { records: payload })
      alert('Attendance saved')
    } catch (err:any) {
      alert(err?.response?.data?.detail ?? 'Failed to save')
    }
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar role={localStorage.getItem('role')} />
      <div className="flex-1 p-6">
        <Header />
        <div className="mt-6 card">
          <h2 className="text-xl font-bold">Take Attendance</h2>
          <div className="mt-4">
            <label className="block text-sm">Date</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="mt-1 p-2 rounded border" />
          </div>
          <div className="mt-4">
            <button onClick={load} className="px-3 py-1 rounded bg-kidAccent">Load Students</button>
          </div>
          <div className="mt-4">
            {/* simple list for demo */}
            {students.map(s=> (
              <div key={s.id} className="flex items-center justify-between py-2 border-b">
                <div>{s.full_name ?? s.name}</div>
                <div className="text-sm text-gray-500">Mark present/absent on submit</div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <button onClick={submit} className="px-4 py-2 rounded bg-kidPrimary text-white">Submit Attendance</button>
          </div>
        </div>
      </div>
    </div>
  )
}

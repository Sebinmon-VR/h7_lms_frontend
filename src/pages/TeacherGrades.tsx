import React, { useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import api from '../api/apiClient'

export default function TeacherGrades(){
  const [studentId, setStudentId] = useState('')
  const [exam, setExam] = useState('')
  const [marks, setMarks] = useState<number | ''>('')

  const submit = async () => {
    try{
      await api.post('/api/v1/teachers/grades', { student_id: studentId, exam, marks })
      alert('Grade saved')
      setStudentId('')
      setExam('')
      setMarks('')
    } catch(err:any){
      alert(err?.response?.data?.detail ?? 'Failed')
    }
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar role={localStorage.getItem('role')} />
      <div className="flex-1 p-6">
        <Header />
        <div className="mt-6 card">
          <h2 className="text-xl font-bold">Enter Grade</h2>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
            <input placeholder="Student ID" value={studentId} onChange={e=>setStudentId(e.target.value)} className="p-2 rounded border" />
            <input placeholder="Exam" value={exam} onChange={e=>setExam(e.target.value)} className="p-2 rounded border" />
            <input placeholder="Marks" value={marks as any} onChange={e=>setMarks(e.target.value === '' ? '' : Number(e.target.value))} className="p-2 rounded border" />
          </div>
          <div className="mt-4">
            <button onClick={submit} className="px-4 py-2 rounded bg-kidPrimary text-white">Save Grade</button>
          </div>
        </div>
      </div>
    </div>
  )
}

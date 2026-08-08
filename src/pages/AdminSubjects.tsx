import React, { useEffect, useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import api from '../api/apiClient'

export default function AdminSubjects(){
  const [subjects, setSubjects] = useState<any[]>([])
  useEffect(()=>{
    const fetch=async()=>{
      try{ const res = await api.get('/api/v1/admin/subjects'); setSubjects(res.data ?? []) }catch(err){}
    }
    fetch()
  },[])
  return (
    <div className="min-h-screen flex">
      <Sidebar role={localStorage.getItem('role')} />
      <div className="flex-1 p-6">
        <Header />
        <div className="mt-6 card">
          <h2 className="text-xl font-bold">Subjects</h2>
          <div className="mt-4">
            {subjects.map(s=> <div key={s.id} className="py-2 border-b">{s.name ?? s.subject_code}</div>)}
          </div>
        </div>
      </div>
    </div>
  )
}

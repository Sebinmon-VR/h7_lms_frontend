import React, { useEffect, useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import api from '../api/apiClient'

export default function AdminEnrollments(){
  const [enrolls, setEnrolls] = useState<any[]>([])
  useEffect(()=>{
    const fetch=async()=>{
      try{ const res = await api.get('/api/v1/admin/enrollments'); setEnrolls(res.data ?? []) }catch(err){}
    }
    fetch()
  },[])
  return (
    <div className="min-h-screen flex">
      <Sidebar role={localStorage.getItem('role')} />
      <div className="flex-1 p-6">
        <Header />
        <div className="mt-6 card">
          <h2 className="text-xl font-bold">Enrollments</h2>
          <div className="mt-4">
            {enrolls.map(e=> <div key={e.id} className="py-2 border-b">{e.student_name} — {e.class_name}</div>)}
          </div>
        </div>
      </div>
    </div>
  )
}

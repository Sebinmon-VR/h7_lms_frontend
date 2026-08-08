import React, { useEffect, useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import api from '../api/apiClient'

export default function StudentGrades(){
  const [grades, setGrades] = useState<any[]>([])
  useEffect(()=>{
    const fetch=async()=>{
      try{ const res = await api.get('/api/v1/students/grades'); setGrades(res.data ?? []) }catch(err){}
    }
    fetch()
  },[])
  return (
    <div className="min-h-screen flex">
      <Sidebar role={localStorage.getItem('role')} />
      <div className="flex-1 p-6">
        <Header />
        <div className="mt-6 card">
          <h2 className="text-xl font-bold">Grades</h2>
          <div className="mt-4">
            {grades.map(g=> <div key={g.id} className="py-2 border-b">{g.exam}: {g.marks}</div>)}
          </div>
        </div>
      </div>
    </div>
  )
}

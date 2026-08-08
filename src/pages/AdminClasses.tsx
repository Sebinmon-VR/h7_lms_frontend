import React, { useEffect, useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import api from '../api/apiClient'

export default function AdminClasses(){
  const [classes, setClasses] = useState<any[]>([])

  useEffect(()=>{
    const fetch=async()=>{
      try{ const res = await api.get('/api/v1/admin/classes'); setClasses(res.data ?? []) }catch(err){}
    }
    fetch()
  },[])

  return (
    <div className="min-h-screen flex">
      <Sidebar role={localStorage.getItem('role')} />
      <div className="flex-1 p-6">
        <Header />
        <div className="mt-6 card">
          <h2 className="text-xl font-bold">Classes</h2>
          <div className="mt-4">
            {classes.map(c=> <div key={c.id} className="py-2 border-b">{c.name ?? c.class_name}</div>)}
          </div>
        </div>
      </div>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import api from '../api/apiClient'

export default function StudentMaterials(){
  const [materials, setMaterials] = useState<any[]>([])
  useEffect(()=>{
    const fetch=async()=>{
      try{ const res = await api.get('/api/v1/students/materials'); setMaterials(res.data ?? []) }catch(err){}
    }
    fetch()
  },[])
  return (
    <div className="min-h-screen flex">
      <Sidebar role={localStorage.getItem('role')} />
      <div className="flex-1 p-6">
        <Header />
        <div className="mt-6 card">
          <h2 className="text-xl font-bold">Study Materials</h2>
          <div className="mt-4">
            {materials.map(m=> <div key={m.id} className="py-2 border-b"><a className="text-blue-600" href={m.file_url} target="_blank" rel="noreferrer">{m.title ?? m.name}</a></div>)}
          </div>
        </div>
      </div>
    </div>
  )
}

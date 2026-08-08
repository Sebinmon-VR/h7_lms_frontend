import React, { useEffect, useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import api from '../api/apiClient'

export default function AdminReports(){
  const [data, setData] = useState<any>({})
  useEffect(()=>{
    const fetch=async()=>{
      try{ const res = await api.get('/api/v1/admin/reports/monitoring'); setData(res.data ?? {}) }catch(err){}
    }
    fetch()
  },[])
  return (
    <div className="min-h-screen flex">
      <Sidebar role={localStorage.getItem('role')} />
      <div className="flex-1 p-6">
        <Header />
        <div className="mt-6 card">
          <h2 className="text-xl font-bold">Monitoring & Reports</h2>
          <pre className="mt-4 text-sm text-gray-700">{JSON.stringify(data, null, 2)}</pre>
        </div>
      </div>
    </div>
  )
}

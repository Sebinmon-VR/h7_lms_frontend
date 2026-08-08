import React, { useEffect, useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import api from '../api/apiClient'

export default function StudentMeetings(){
  const [meetings, setMeetings] = useState<any[]>([])
  useEffect(()=>{
    const fetch=async()=>{
      try{ const res = await api.get('/api/v1/students/meetings'); setMeetings(res.data ?? []) }catch(err){}
    }
    fetch()
  },[])
  return (
    <div className="min-h-screen flex">
      <Sidebar role={localStorage.getItem('role')} />
      <div className="flex-1 p-6">
        <Header />
        <div className="mt-6 card">
          <h2 className="text-xl font-bold">Meetings & Recordings</h2>
          <div className="mt-4">
            {meetings.map(m=> <div key={m.id} className="py-2 border-b"><a className="text-blue-600" href={m.link} target="_blank" rel="noreferrer">{m.title}</a></div>)}
          </div>
        </div>
      </div>
    </div>
  )
}

import React, { useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import api from '../api/apiClient'

export default function TeacherMeetings(){
  const [title, setTitle] = useState('')
  const [link, setLink] = useState('')
  const [date, setDate] = useState('')

  const submit = async () => {
    try{
      await api.post('/api/v1/teachers/meetings', { title, link, date })
      alert('Meeting scheduled')
      setTitle('')
      setLink('')
      setDate('')
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
          <h2 className="text-xl font-bold">Schedule Meeting / Share Recordings</h2>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
            <input placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} className="p-2 rounded border" />
            <input placeholder="Meeting link" value={link} onChange={e=>setLink(e.target.value)} className="p-2 rounded border" />
            <input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)} className="p-2 rounded border" />
          </div>
          <div className="mt-4">
            <button onClick={submit} className="px-4 py-2 rounded bg-kidPrimary text-white">Schedule</button>
          </div>
        </div>
      </div>
    </div>
  )
}

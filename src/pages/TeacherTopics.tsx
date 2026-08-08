import React, { useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import api from '../api/apiClient'

export default function TeacherTopics(){
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const submit = async () => {
    try {
      await api.post('/api/v1/teachers/topics', { title, description })
      alert('Topic logged')
      setTitle('')
      setDescription('')
    } catch (err:any) {
      alert(err?.response?.data?.detail ?? 'Failed')
    }
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar role={localStorage.getItem('role')} />
      <div className="flex-1 p-6">
        <Header />
        <div className="mt-6 card">
          <h2 className="text-xl font-bold">Log Topic Covered</h2>
          <div className="mt-4">
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Topic title" className="w-full p-2 rounded border" />
          </div>
          <div className="mt-4">
            <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Short description" className="w-full p-2 rounded border" />
          </div>
          <div className="mt-4">
            <button onClick={submit} className="px-4 py-2 rounded bg-kidPrimary text-white">Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}

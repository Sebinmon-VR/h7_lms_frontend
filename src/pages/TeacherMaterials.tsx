import React, { useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import api from '../api/apiClient'

export default function TeacherMaterials(){
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const submit = async () => {
    if (!file) return alert('Please pick a file')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      // if backend requires metadata, include it
      fd.append('title', title)

      // upload to storage endpoint
      const res = await api.post('/api/v1/storage/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      // then register material record
      await api.post('/api/v1/teachers/materials', { title, file_url: res.data.url ?? res.data.path ?? res.data.name })
      alert('Uploaded')
      setTitle('')
      setFile(null)
    } catch (err:any) {
      alert(err?.response?.data?.detail ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar role={localStorage.getItem('role')} />
      <div className="flex-1 p-6">
        <Header />
        <div className="mt-6 card">
          <h2 className="text-xl font-bold">Upload Study Material</h2>
          <div className="mt-4">
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title" className="w-full p-2 rounded border" />
          </div>
          <div className="mt-4">
            <input type="file" onChange={e=>setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="mt-4">
            <button onClick={submit} disabled={uploading} className="px-4 py-2 rounded bg-kidPrimary text-white">{uploading ? 'Uploading...' : 'Upload'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

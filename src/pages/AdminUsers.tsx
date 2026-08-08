import React, { useEffect, useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import api from '../api/apiClient'

export default function AdminUsers(){
  const [users, setUsers] = useState<any[]>([])

  useEffect(()=>{
    const fetch=async()=>{
      try{
        const res = await api.get('/api/v1/admin/users')
        setUsers(res.data ?? [])
      }catch(err){ }
    }
    fetch()
  },[])

  return (
    <div className="min-h-screen flex">
      <Sidebar role={localStorage.getItem('role')} />
      <div className="flex-1 p-6">
        <Header />
        <div className="mt-6 card">
          <h2 className="text-xl font-bold">User Management</h2>
          <div className="mt-4">
            {users.map(u=> (
              <div key={u.id} className="py-2 border-b flex justify-between">
                <div>{u.full_name ?? u.email}</div>
                <div className="text-sm text-gray-500">{u.role}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import api from '../api/apiClient'

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>({})

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get('/api/v1/admin/reports/monitoring')
        setStats(res.data ?? {})
      } catch (err) {
        // ignore
      }
    }
    fetch()
  }, [])

  return (
    <div className="min-h-screen flex">
      <Sidebar role={localStorage.getItem('role')} />
      <div className="flex-1 p-6">
        <Header />
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card">
            <div className="text-sm text-gray-500">Total Users</div>
            <div className="text-2xl font-bold">{stats.total_users ?? '—'}</div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-500">Active Teachers</div>
            <div className="text-2xl font-bold">{stats.active_teachers ?? '—'}</div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-500">Total Classes</div>
            <div className="text-2xl font-bold">{stats.total_classes ?? '—'}</div>
          </div>
        </div>

        <div className="mt-6 card">
          <h3 className="text-lg font-semibold">Recent Activity</h3>
          <div className="mt-3 text-sm text-gray-600">Placeholder for recent admin events and logs.</div>
        </div>
      </div>
    </div>
  )
}

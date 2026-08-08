import React from 'react'
import { useAuth } from '../auth/AuthProvider'

export default function Header() {
  const { role, logout } = useAuth()
  return (
    <div className="flex items-center justify-between p-4 border-b bg-white/60 rounded-t-2xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-kidPrimary flex items-center justify-center text-white font-bold text-lg">H7</div>
        <div>
          <div className="text-sm font-semibold">H7 LMS</div>
          <div className="text-xs text-gray-500">{role ?? 'Guest'}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={logout} className="text-sm bg-red-400/80 px-3 py-1 rounded-md text-white">Logout</button>
      </div>
    </div>
  )
}

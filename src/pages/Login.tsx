import React, { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const auth = useAuth()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await auth.login(email, password)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? err?.message ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md card">
        <h1 className="text-2xl font-bold text-center">Welcome to H7 LMS</h1>
        <p className="text-center text-sm text-gray-600 mb-4">Kid-friendly learning, organized and secure</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} className="mt-1 block w-full rounded-lg border-gray-200 shadow-sm p-2" placeholder="email@lms.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 block w-full rounded-lg border-gray-200 shadow-sm p-2" placeholder="••••••" />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex items-center justify-between">
            <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-kidPrimary text-white font-semibold shadow">{loading ? 'Signing in...' : 'Sign in'}</button>
            <a className="text-sm text-gray-600" href="#">Forgot?</a>
          </div>
        </form>
      </div>
    </div>
  )
}

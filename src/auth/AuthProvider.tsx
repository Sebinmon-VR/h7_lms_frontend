import React, { createContext, useContext, useState, ReactNode } from 'react'
import api from '../api/apiClient'
import { useNavigate } from 'react-router-dom'

type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT' | null

interface AuthContextValue {
  token: string | null
  role: UserRole
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('access_token'))
  const [role, setRole] = useState<UserRole>((localStorage.getItem('role') as UserRole) ?? null)
  const navigate = useNavigate()

  const login = async (email: string, password: string) => {
    const res = await api.post('/api/v1/auth/login', { email, password })
    // backend returns access token in `access_token` or `token` field — adapt if necessary
    const access = res.data.access_token ?? res.data.token ?? res.data.accessToken
    const userRole = res.data.role ?? res.data.data?.role
    if (!access) throw new Error('No access token from server')
    localStorage.setItem('access_token', access)
    if (userRole) localStorage.setItem('role', userRole)
    setToken(access)
    setRole(userRole ?? null)

    // redirect by role
    if (userRole === 'ADMIN') navigate('/admin')
    else if (userRole === 'TEACHER') navigate('/teacher')
    else navigate('/student')
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('role')
    setToken(null)
    setRole(null)
    navigate('/login')
  }

  return (
    <AuthContext.Provider value={{ token, role, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

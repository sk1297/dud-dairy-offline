import React, { createContext, useContext, useState } from 'react'
import { login as localLogin, logout as localLogout, getCurrentUser } from '../services/authService.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getCurrentUser())
  const [loading, setLoading] = useState(false)

  const login = async (mobile, password) => {
    setLoading(true)
    try {
      const result = await localLogin(mobile, password)
      if (result.success) {
        setUser(result.user)
        return { success: true }
      }
      return { success: false, error: result.error }
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    localLogout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

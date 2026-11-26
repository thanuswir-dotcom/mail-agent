import { useCallback, useEffect, useState } from 'react'
import { api, getStoredToken, setStoredToken } from '../api/client'
import { AuthContext } from './useAuth'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [integrations, setIntegrations] = useState({
    geminiConfigured: false,
    geminiModel: 'gemini-3.6-flash',
    googleOAuthConfigured: false,
    supabaseConfigured: false,
  })
  const [loading, setLoading] = useState(() => Boolean(getStoredToken()))

  const refreshProfile = useCallback(async () => {
    const token = getStoredToken()
    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const res = await api.get('/auth/me')
      setUser(res.data.user)
      if (res.data.integrations) {
        setIntegrations(res.data.integrations)
      }
    } catch {
      setStoredToken('')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const token = getStoredToken()
    if (token) {
      api
        .get('/auth/me')
        .then((res) => {
          if (cancelled) return
          setUser(res.data.user)
          if (res.data.integrations) {
            setIntegrations(res.data.integrations)
          }
        })
        .catch(() => {
          if (cancelled) return
          setStoredToken('')
          setUser(null)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }

    const onUnauthorized = () => {
      setUser(null)
    }
    window.addEventListener('mailpilot:unauthorized', onUnauthorized)
    return () => {
      cancelled = true
      window.removeEventListener('mailpilot:unauthorized', onUnauthorized)
    }
  }, [])

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    setStoredToken(res.data.token)
    setUser(res.data.user)
    await refreshProfile()
    return res.data.user
  }

  const register = async (name, email, password) => {
    const res = await api.post('/auth/register', { name, email, password })
    setStoredToken(res.data.token)
    setUser(res.data.user)
    await refreshProfile()
    return res.data.user
  }

  const logout = () => {
    setStoredToken('')
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        integrations,
        loading,
        login,
        register,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

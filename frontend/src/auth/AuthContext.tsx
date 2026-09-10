import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api'
import {
  ACCESS_TOKEN_KEY,
  clearStoredSession,
  SESSION_EXPIRED_EVENT,
  USER_KEY,
} from './authStorage'
import type { AuthUser } from '../types/domain'
import { AuthContext } from './authContextValue'

function readStoredUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser)

  useEffect(() => {
    function handleExpiredSession() {
      setUser(null)
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpiredSession)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpiredSession)
  }, [])

  const login = useCallback(async (usernameOrEmail: string, password: string) => {
    const result = await api.auth.login({ usernameOrEmail, password })
    sessionStorage.setItem(ACCESS_TOKEN_KEY, result.accessToken)
    sessionStorage.setItem(USER_KEY, JSON.stringify(result.user))
    setUser(result.user)
    return result.user
  }, [])

  const logout = useCallback(() => {
    clearStoredSession()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

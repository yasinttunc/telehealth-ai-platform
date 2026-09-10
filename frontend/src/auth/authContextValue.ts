import { createContext } from 'react'
import type { AuthUser } from '../types/domain'

export interface AuthContextValue {
  user: AuthUser | null
  login: (usernameOrEmail: string, password: string) => Promise<AuthUser>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

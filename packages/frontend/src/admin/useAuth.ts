import { createContext, useContext } from 'react'
import type { LoginResponse } from '@gwj/shared-types'

export interface AuthState {
  token: string | null
  user: LoginResponse['user'] | null
  isAuthenticated: boolean
  signIn: (response: LoginResponse) => void
  signOut: () => void
}

export const STORAGE_TOKEN_KEY = 'gwj.admin.token'
export const STORAGE_USER_KEY = 'gwj.admin.user'

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

/* 404 — unknown route. */

import { useAuth, homePathForRole } from '../auth/useAuth'
import { NotFoundState } from '../components/StateScreens'

export function NotFoundPage() {
  const { user } = useAuth()
  return <NotFoundState homePath={user ? homePathForRole(user.role) : '/login'} />
}

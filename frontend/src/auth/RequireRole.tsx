/*
 * RequireRole — client-side route guard.
 *
 * This is navigation UX only, not security. It keeps users out of
 * screens that do not belong to their role in the demo. Real authorization is
 * the backend's job once JWT/RBAC is wired up.
 *
 * - Not logged in            -> redirect to /login
 * - Logged in, wrong role    -> redirect to /403
 * - Logged in, allowed role  -> render the nested routes
 */

import { Navigate, Outlet } from 'react-router-dom'
import type { Role } from '../types/domain'
import { useAuth } from './useAuth'

export function RequireRole({ allow }: { allow: Role[] }) {
  const { user } = useAuth()

  if (!user) return <Navigate to="/login" replace />
  if (!allow.includes(user.role)) return <Navigate to="/403" replace />

  return <Outlet />
}

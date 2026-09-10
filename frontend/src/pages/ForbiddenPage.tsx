/*
 * 403 — the signed-in role may not reach the requested route.
 *
 * Rendered outside AppShell (it is reachable while a role mismatch is being
 * resolved), so it provides its own centred surface.
 */

import { useAuth, homePathForRole } from '../auth/useAuth'
import { AccessRestrictedState } from '../components/StateScreens'

export function ForbiddenPage() {
  const { user } = useAuth()
  return <AccessRestrictedState homePath={user ? homePathForRole(user.role) : '/login'} />
}

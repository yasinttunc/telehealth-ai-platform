/*
 * Horizontal, role-aware navigation configuration.
 *
 * The master design has no permanent sidebar: each role gets one horizontal
 * bar containing only the destinations that role can actually reach. The
 * left-hand "context label" (e.g. "Clinical workspace") names the surface the
 * user is working in and is not itself a link.
 */

import {
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  Home,
  LayoutDashboard,
  Search,
  Star,
  Stethoscope,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '../types/domain'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Exact match only (used for the role index routes). */
  end?: boolean
  /** Renders a count pill after the label, e.g. unresolved alerts. */
  badgeKey?: 'alerts'
}

/** Small non-interactive label shown next to the logo, per role. */
export const CONTEXT_LABEL: Record<Role, string | null> = {
  ADMIN: null,
  DOCTOR: 'Clinical workspace',
  PATIENT: null,
}

const NAV: Record<Role, NavItem[]> = {
  ADMIN: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/doctors', label: 'Doctors', icon: Stethoscope },
    { to: '/admin/patients', label: 'Patients', icon: UserRound },
    { to: '/admin/clinics', label: 'Clinics', icon: Building2 },
    { to: '/admin/consultations', label: 'Consultations', icon: ClipboardList },
    { to: '/admin/alerts', label: 'Alerts', icon: Bell, badgeKey: 'alerts' },
  ],
  DOCTOR: [
    { to: '/doctor', label: 'Dashboard', icon: CalendarDays, end: true },
    { to: '/doctor/consultations', label: 'Consultations', icon: ClipboardList },
    { to: '/doctor/patients', label: 'Patients', icon: Users },
    { to: '/doctors', label: 'Reviews', icon: Star },
    { to: '/doctor/alerts', label: 'Alerts', icon: Bell, badgeKey: 'alerts' },
  ],
  PATIENT: [
    { to: '/patient', label: 'Home', icon: Home, end: true },
    { to: '/patient/consultations', label: 'My consultations', icon: CalendarDays },
    { to: '/patient/doctors', label: 'Find a doctor', icon: Search },
    { to: '/profile', label: 'Profile', icon: UserRound },
  ],
}

export function navForRole(role: Role): NavItem[] {
  return NAV[role] ?? []
}

/** Placeholder text for the role-specific global search box. */
export function searchPlaceholder(role: Role): string {
  switch (role) {
    case 'ADMIN':
      return 'Search users, patients, clinics…'
    case 'DOCTOR':
      return 'Search patients, notes, transcripts…'
    default:
      return 'Search your consultations…'
  }
}

/** Where "return home" should go for the signed-in role. */
export function homePathForRole(role: Role): string {
  switch (role) {
    case 'ADMIN':
      return '/admin'
    case 'DOCTOR':
      return '/doctor'
    default:
      return '/patient'
  }
}

/** Best-effort page title from the active path, used by the document title. */
export function titleForPath(role: Role, pathname: string): string {
  const match = navForRole(role)
    .filter((item) =>
      item.end
        ? pathname === item.to
        : pathname === item.to || pathname.startsWith(item.to + '/'),
    )
    .sort((a, b) => b.to.length - a.to.length)[0]

  if (match) return match.label
  if (pathname.startsWith('/profile')) return 'Profile & settings'
  return 'Telehealth With AI'
}

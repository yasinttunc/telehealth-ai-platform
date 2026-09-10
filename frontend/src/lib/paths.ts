/* Role-based base paths used by shared pages. */

import type { Role } from '../types/domain'

export function consultationsBase(role: Role): string {
  switch (role) {
    case 'ADMIN':
      return '/admin/consultations'
    case 'DOCTOR':
      return '/doctor/consultations'
    default:
      return '/patient/consultations'
  }
}

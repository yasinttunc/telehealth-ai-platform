/** Shared browser-session keys and helpers for authentication-related modules. */
export const ACCESS_TOKEN_KEY = 'telehealth.accessToken'
export const USER_KEY = 'telehealth.demoUser'
export const SESSION_EXPIRED_KEY = 'telehealth.sessionExpired'
export const SESSION_EXPIRED_EVENT = 'telehealth:session-expired'

export function clearStoredSession() {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
}

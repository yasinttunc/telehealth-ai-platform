import axios, { type AxiosError } from 'axios'
import {
  ACCESS_TOKEN_KEY,
  clearStoredSession,
  SESSION_EXPIRED_EVENT,
  SESSION_EXPIRED_KEY,
} from '../auth/authStorage'
import { ApiError } from './types'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8081/api',
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(ACCESS_TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const requestUrl = error.config?.url ?? ''

    // A rejected login is handled by LoginPage, not treated as an expired session.
    if (status === 401 && !requestUrl.includes('/auth/login')) {
      clearStoredSession()
      sessionStorage.setItem(SESSION_EXPIRED_KEY, 'true')
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    }

    return Promise.reject(error)
  },
)

export function toApiError(error: unknown): ApiError {
  const axiosError = error as AxiosError<{ message?: string; fieldErrors?: Record<string, string> }>
  const status = axiosError.response?.status ?? 0
  const body = axiosError.response?.data
  return new ApiError(status, body?.message ?? 'The request could not be completed.', body?.fieldErrors)
}

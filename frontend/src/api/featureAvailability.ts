/*
 * Feature availability helper.
 *
 * Phases 14-16 are being implemented backend-first, one route at a time. The
 * frontend therefore calls routes that may not exist yet and must degrade
 * honestly instead of showing a red error to a marker or a demo audience.
 *
 * A missing route is treated as "not deployed yet"; a permission or validation
 * failure is a real error and is shown normally.
 */

import { ApiError } from './types'

/**
 * True when a request failed because the endpoint is not available, rather
 * than because the caller did something wrong.
 *
 * - `0`   network/CORS failure — the backend is not running.
 * - `404` route not mapped yet. (For these sub-resources a genuinely missing
 *         consultation is already handled by the parent page, which loads the
 *         consultation first and stops if it is absent.)
 * - `405` path exists with a different method.
 * - `501` explicitly not implemented.
 */
export function isFeatureUnavailable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  return error.status === 0 || error.status === 404 || error.status === 405 || error.status === 501
}

/** True when the backend rejected a write because someone else edited first. */
export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409
}

/** A safe message for any error, preferring the backend's own wording. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback
}

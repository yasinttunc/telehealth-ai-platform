/*
 * The single API facade every page imports from.
 *
 * Pages call e.g. `api.patients.list()` or `api.auth.login(...)` and never
 * touch mock data or axios directly. The current implementation is
 * springApi, which calls the local Spring backend with a JWT.
 */

import { springApi } from './springApi'

export const api = springApi

export { ApiError } from './types'

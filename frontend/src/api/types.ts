/*
 * Request payload shapes for the API layer.
 *
 * These mirror the Spring request DTOs so page code and form state remain
 * independent of the HTTP implementation. Response shapes are domain types.
 */

import type {
  AlertStatus,
  ClinicalFindingAssertion,
  ConsultationStatus,
  Role,
} from '../types/domain'

export interface LoginRequest {
  usernameOrEmail: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  tokenType: string
  userId: number
  username: string
  email: string
  role: Role
}

export interface CreateUserRequest {
  username: string
  email: string
  role: Role
  password: string
}

export interface UpdateUserRequest {
  username: string
  email: string
  role: Role
  /** Blank/omitted leaves the existing password unchanged (spec / roadmap Task 2). */
  password?: string
  enabled: boolean
}

export interface CreateDoctorRequest {
  /** Account fields are created with the doctor profile; the backend forces role DOCTOR. */
  username: string
  email: string
  password: string
  firstName: string
  lastName: string
  specialty: string
  availableTimes: string[]
}

/** The backend updates the linked DOCTOR account and the profile in one transaction. */
export type UpdateDoctorRequest = Omit<CreateDoctorRequest, 'password'> & {
  enabled: boolean
}

export interface CreatePatientRequest {
  /** Account fields are created with the patient profile; the backend forces role PATIENT. */
  username: string
  email: string
  password: string
  firstName: string
  lastName: string
  nhsNumber: string
  dateOfBirth: string
}

/** The backend updates the linked PATIENT account and the profile in one transaction. */
export type UpdatePatientRequest = Omit<CreatePatientRequest, 'password' | 'nhsNumber'> & {
  enabled: boolean
}

export interface CreateClinicRequest {
  clinicName: string
  clinicAddress: string
}

export type UpdateClinicRequest = CreateClinicRequest

export interface CreateConsultationRequest {
  patientId: number
  clinicianId: number
  clinicId: number
  scheduledAt: string
}

/** The backend creates consultations as SCHEDULED and updates status separately. */
export interface UpdateConsultationStatusRequest {
  status: ConsultationStatus
}

/**
 * Transcript approval with optimistic locking.
 *
 * `expectedRevision` is optimistic locking: if another tab approved or edited
 * the transcript first, the backend answers 409 instead of silently
 * overwriting a newer correction. Approval is deliberately a separate command
 * from "save draft".
 */
export interface ApproveTranscriptRequest {
  transcript: string
  expectedRevision: number
}

/** Filters supplied by the caller. Real ownership enforcement arrives with JWT. */
export interface ConsultationQuery {
  /** When set, restrict to a patient's own consultations. */
  patientId?: number
  /** When set, restrict to a clinician's (AppUser) consultations. */
  clinicianId?: number
}

export interface UpdateAlertStatusRequest {
  status: AlertStatus
  note?: string
}

export interface UpsertFindingReviewRequest {
  acceptedFindings: Array<{
    code: string
    assertion: ClinicalFindingAssertion
  }>
}

/** API error shape used by pages to display a useful message. */
export class ApiError extends Error {
  status: number
  fieldErrors?: Record<string, string>
  constructor(status: number, message: string, fieldErrors?: Record<string, string>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

/*
 * Lookup helpers: resolve display names from the numeric IDs stored on
 * consultations/alerts. Consultation.clinicianId references an AppUser.userId,
 * so a doctor is matched via its appUserId link (schema in the roadmap).
 */

import type { Clinic, Doctor, Patient } from '../types/domain'

export function patientName(patients: Patient[], patientId: number): string {
  const p = patients.find((x) => x.patientId === patientId)
  return p ? `${p.firstName} ${p.lastName}` : `Patient #${patientId}`
}

export function clinicianName(doctors: Doctor[], clinicianUserId: number): string {
  const d = doctors.find((x) => x.appUserId === clinicianUserId)
  return d ? `Dr ${d.firstName} ${d.lastName}` : `Clinician #${clinicianUserId}`
}

export function clinicName(clinics: Clinic[], clinicId: number): string {
  const c = clinics.find((x) => x.clinicId === clinicId)
  return c ? c.clinicName : `Clinic #${clinicId}`
}

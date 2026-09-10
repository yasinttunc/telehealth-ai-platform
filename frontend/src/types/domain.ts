/*
 * Domain types for the Telehealth With AI frontend.
 *
 * IDs are numeric to match the Spring/PostgreSQL schema, which uses
 * BIGSERIAL primary keys.
 * AppUser is the login identity; Patient and Doctor are role-specific
 * profiles linked one-to-one via appUserId.
 */

export type Role = 'ADMIN' | 'DOCTOR' | 'PATIENT'

export type ConsultationStatus =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'

export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'DISMISSED' | 'RESOLVED'

export type ClinicalFindingAssertion =
  | 'PRESENT'
  | 'NEGATED'
  | 'HISTORICAL'
  | 'UNCERTAIN'

/*
 * Realtime transcription and extraction vocabularies. These mirror the
 * backend enums. Fields added by these workflows remain optional so the UI
 * can safely read older consultation records.
 */

/** Lifecycle of the live ASR path, independent of the consultation status. */
export type TranscriptionStatus =
  | 'NOT_STARTED'
  | 'ACTIVE'
  | 'FINALIZED'
  | 'FAILED'
  | 'MANUAL'

/** Background AI extraction job state (never changed by the browser). */
export type ExtractionJobStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'

/**
 * Project speaker category. This is a technical provenance label derived by the
 * backend from the authorised LiveKit participant identity — never a claim of
 * verified identity.
 */
export type SpeakerRole = 'DOCTOR' | 'PATIENT' | 'UNKNOWN'

/** The authenticated demo user held in AuthContext/session storage. */
export interface AuthUser {
  userId: number
  username: string
  displayName: string
  email: string
  role: Role
  /** For a PATIENT login, the patient profile this account owns. */
  patientId?: number
  /** For a DOCTOR login, the doctor profile / clinician account link. */
  doctorId?: number
}

export interface AppUser {
  userId: number
  username: string
  email: string
  role: Role
  enabled: boolean
}

export interface Doctor {
  doctorId: number
  appUserId?: number
  firstName: string
  lastName: string
  specialty: string
  /** ISO-8601 UTC date-times, matching the backend's Instant values. */
  availableTimes: string[]
}

export interface Patient {
  patientId: number
  appUserId?: number
  firstName: string
  lastName: string
  nhsNumber: string
  dateOfBirth: string // ISO date, e.g. "1985-04-12"
}

export interface Clinic {
  clinicId: number
  clinicName: string
  clinicAddress: string
}

export interface Consultation {
  consultationId: number
  patientId: number
  /** Display value returned by ConsultationResponse; use it when roster data is unavailable. */
  patientName?: string
  /** Clinician is an AppUser with role DOCTOR (schema: consultation.clinician_id). */
  clinicianId: number
  clinicianUsername?: string
  clinicId: number
  clinicName?: string
  scheduledAt: string // ISO datetime
  status: ConsultationStatus
  startedAt?: string | null
  endedAt?: string | null
  transcript?: string | null

  /* Transcript revision and approval provenance. */

  /** Increments whenever the canonical transcript text changes. */
  transcriptRevision?: number
  transcriptApprovedAt?: string | null
  transcriptApprovedBy?: number | null
  /** Extraction is allowed only while this equals `transcriptRevision`. */
  transcriptApprovedRevision?: number | null

  /* Live transcription provenance. */

  transcriptionStatus?: TranscriptionStatus
  /** Set only when the worker successfully flushed its Deepgram streams. */
  transcriptionFinalizedAt?: string | null
}

/**
 * One final ASR segment stored by Spring. Interim captions are never persisted,
 * so every segment shown here is part of the reviewable record.
 */
export interface TranscriptSegment {
  transcriptSegmentId: number
  /** Returned so idempotent delivery can be inspected during a demo. */
  sourceSegmentId?: string
  speakerRole: SpeakerRole
  text: string
  startMs: number
  endMs: number
  /** `DEEPGRAM` or `MANUAL_IMPORT`. */
  source: string
}

/** Background extraction job for one approved transcript revision. */
export interface ExtractionJob {
  extractionJobId: number
  consultationId: number
  transcriptRevision: number
  status: ExtractionJobStatus
  requestedBy?: number | null
  /** Present only for a SUCCEEDED job. */
  resultSymptomRecordId?: number | null
  /** Safe, generic message — never a provider stack trace. */
  errorMessage?: string | null
  createdAt: string
  completedAt?: string | null
}

/**
 * Short-lived LiveKit join credentials minted by Spring after it has verified
 * consultation ownership. The browser never sees a LiveKit API secret.
 */
export interface LiveKitToken {
  roomName: string
  serverUrl: string
  token: string
  expiresInSeconds: number
}

/** One clinician-reviewed symptom extracted from a transcript (mock AI output). */
export interface SymptomItem {
  name: string
  assertion: ClinicalFindingAssertion
  confidence: number // 0..1
  evidence?: string
}

export interface SymptomRecord {
  symptomRecordId: number
  consultationId: number
  symptoms: SymptomItem[]
  modelName: string
  promptVersion: string
  createdAt: string
  /** Approved transcript revision that produced this snapshot. */
  transcriptRevision?: number | null
}

export interface AcceptedFinding {
  code: string
  displayName: string
  assertion: ClinicalFindingAssertion
}

export interface FindingReview {
  findingReviewId: number
  symptomRecordId: number
  consultationId: number
  acceptedFindings: AcceptedFinding[]
  reviewedBy: number
  reviewedByUsername: string
  reviewedAt: string
  updatedAt: string
}

export interface Alert {
  alertId: number
  clinicId: number
  clinicName?: string
  symptomCode?: string
  symptomName: string
  score: number
  severity?: 'HIGH' | 'MEDIUM'
  status: AlertStatus
  createdAt: string

  /* Detector provenance used to explain an alert. */

  windowStart?: string | null
  windowEnd?: string | null
  observedCount?: number | null
  baselineCount?: number | null
  threshold?: number | null
  /** Identifies the detector rule/parameters that raised this candidate. */
  detectorVersion?: string | null
  evidenceCount?: number
  updatedAt?: string
  lastEvaluatedAt?: string
}

export interface AlertEvidence {
  alertEvidenceId: number
  consultationId: number
  findingReviewId: number
  symptomCode: string
  finding: AcceptedFinding
  includedAt: string
}

export interface AlertStatusEvent {
  alertStatusEventId: number
  previousStatus: AlertStatus | null
  newStatus: AlertStatus
  changedBy: number | null
  changedByUsername: string | null
  systemGenerated: boolean
  note: string | null
  createdAt: string
}

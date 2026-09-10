/*
 * Derived consultation state for the transcript and finding review workflow.
 *
 * These helpers exist so that pages never infer workflow state from "is the
 * transcript text non-empty?". The backend owns approval and job state; the
 * frontend only reads it. Every helper tolerates missing optional fields and
 * reports the safest available state.
 */

import type { Consultation, ExtractionJob, SpeakerRole } from '../types/domain'

export type TranscriptApproval =
  /** The backend does not report approval fields yet. */
  | 'UNKNOWN'
  /** Never approved. */
  | 'NONE'
  /** Approved, and the approved revision is still the current text. */
  | 'APPROVED'
  /** Approved earlier, then edited: approval no longer covers the current text. */
  | 'STALE'

export function transcriptApproval(consultation: Consultation): TranscriptApproval {
  const revision = consultation.transcriptRevision
  const approvedRevision = consultation.transcriptApprovedRevision

  if (revision === undefined && !consultation.transcriptApprovedAt) return 'UNKNOWN'
  if (!consultation.transcriptApprovedAt || approvedRevision == null) return 'NONE'
  if (revision === undefined) return 'APPROVED'
  return approvedRevision === revision ? 'APPROVED' : 'STALE'
}

/**
 * Every visible transcript-review stage used by the consultation detail page.
 *
 * The important rule is that this function reads only server-owned workflow
 * fields. It never treats a non-empty transcript as "ready", because staff may
 * type a draft that has not been approved yet.
 */
export type TranscriptStage =
  | 'NOT_STARTED'
  | 'AWAITING_SEGMENTS'
  | 'WORKER_FAILED'
  | 'MANUAL'
  | 'DRAFT'
  | 'APPROVED'
  | 'STALE'

/**
 * Converts backend transcription and approval fields into one UI stage.
 *
 * This keeps workflow state decisions out of individual components, so the
 * video panel, review panel, patient summary, and extraction panel do not drift
 * into separate interpretations of the same consultation.
 */
export function transcriptStage(consultation: Consultation): TranscriptStage {
  const approval = transcriptApproval(consultation)

  if (consultation.transcriptionStatus === 'ACTIVE') return 'AWAITING_SEGMENTS'
  if (consultation.transcriptionStatus === 'FAILED') return 'WORKER_FAILED'
  if (approval === 'APPROVED') return 'APPROVED'
  if (approval === 'STALE') return 'STALE'
  if (consultation.transcriptionStatus === 'MANUAL') return 'MANUAL'
  if (
    consultation.status === 'SCHEDULED' ||
    consultation.transcriptionStatus === 'NOT_STARTED' ||
    approval === 'UNKNOWN'
  ) {
    return 'NOT_STARTED'
  }

  return 'DRAFT'
}

/** True when the newest visible job belongs to the current approved revision. */
export function isCurrentRevisionJob(
  consultation: Consultation,
  job: ExtractionJob | null,
): boolean {
  return (
    job != null &&
    consultation.transcriptApprovedRevision != null &&
    job.transcriptRevision === consultation.transcriptApprovedRevision
  )
}

/**
 * Extraction is permitted only when the current revision is approved and no
 * existing job has already claimed that same revision.
 */
export function canRequestExtraction(
  consultation: Consultation,
  job: ExtractionJob | null = null,
): boolean {
  if (transcriptStage(consultation) !== 'APPROVED') return false
  if (!job || !isCurrentRevisionJob(consultation, job)) return true
  return job.status === 'FAILED'
}

/** Short reason shown next to a disabled Extract button. */
export function extractionBlockedReason(
  consultation: Consultation,
  job: ExtractionJob | null = null,
): string | null {
  if (job && isCurrentRevisionJob(consultation, job)) {
    switch (job.status) {
      case 'PENDING':
      case 'RUNNING':
        return 'Extraction is already running for this approved revision.'
      case 'SUCCEEDED':
        return 'Extraction already completed for this approved revision.'
      default:
        break
    }
  }

  switch (transcriptStage(consultation)) {
    case 'APPROVED':
      return null
    case 'AWAITING_SEGMENTS':
      return 'Wait until live transcription is finalized before approving and extracting.'
    case 'WORKER_FAILED':
      return 'Live transcription failed. Enter and approve a manual transcript first.'
    case 'MANUAL':
      return 'A Doctor must approve the transcript before extraction.'
    case 'STALE':
      return 'The transcript changed after approval. Approve it again to enable extraction.'
    case 'NOT_STARTED':
      return 'Transcription state has not reached review yet.'
    default:
      return 'A Doctor must approve the transcript before extraction.'
  }
}

/** Segment offsets are milliseconds on the worker-session clock, not wall time. */
export function formatOffset(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '--:--'
  const totalSeconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** Display label for a technical speaker-role provenance value. */
export function speakerLabel(role: SpeakerRole): string {
  switch (role) {
    case 'DOCTOR':
      return 'Doctor'
    case 'PATIENT':
      return 'Patient'
    default:
      return 'Unattributed'
  }
}

/** Renders final segments the same way the backend builds its canonical draft. */
export function buildDraftFromSegments(
  segments: { speakerRole: SpeakerRole; text: string }[],
): string {
  return segments.map((segment) => `${segment.speakerRole}: ${segment.text}`).join('\n')
}

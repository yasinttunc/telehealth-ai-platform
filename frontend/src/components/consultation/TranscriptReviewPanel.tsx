/*
 * Transcript review and approval panel for staff users.
 *
 * Two distinct commands, never merged:
 *   - "Save draft"        keeps working on the text; approval is cleared.
 *   - "Approve transcript" records that the assigned Doctor reviewed this exact
 *                         revision. Only an approved revision may be extracted.
 *
 * Approval sends `expectedRevision`, so a stale browser tab receives 409
 * instead of silently overwriting a newer correction.
 */

import { useEffect, useState } from 'react'
import { CheckCircle2, FileText } from 'lucide-react'
import { api } from '../../api'
import { errorMessage, isConflict, isFeatureUnavailable } from '../../api/featureAvailability'
import { Panel, PrimaryButton, SecondaryButton, ErrorRow } from '../ui'
import { ApprovalChip, Chip, FeatureNotice, TranscriptionStatusChip } from './chips'
import { transcriptApproval } from '../../lib/consultationState'
import { formatDateTime } from '../../lib/format'
import type { Consultation } from '../../types/domain'

export function TranscriptReviewPanel({
  consultation,
  draft,
  onDraftChange,
  onConsultationChange,
  onNotify,
  canApprove,
}: {
  consultation: Consultation
  draft: string
  onDraftChange: (value: string) => void
  onConsultationChange: (consultation: Consultation) => void
  onNotify: (message: string) => void
  /** Only the assigned Doctor approves; an Admin may still correct text. */
  canApprove: boolean
}) {
  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [approvalUnavailable, setApprovalUnavailable] = useState(false)

  const approval = transcriptApproval(consultation)
  const storedText = consultation.transcript ?? ''
  const isDirty = draft !== storedText
  const revision = consultation.transcriptRevision
  const transcriptionReady =
    consultation.transcriptionStatus === 'FINALIZED' ||
    consultation.transcriptionStatus === 'MANUAL'
  const approvalBlockedReason =
    consultation.status !== 'COMPLETED'
      ? 'Complete the consultation before approving the transcript.'
      : !transcriptionReady
        ? 'Finish live transcription or use the manual transcript path before approving.'
        : null

  // A refreshed consultation replaces any locally shown conflict message.
  useEffect(() => setError(null), [consultation.transcriptRevision])

  async function saveDraft() {
    setSaving(true)
    setError(null)
    try {
      const updated = await api.consultations.updateTranscript(
        consultation.consultationId,
        draft,
      )
      onConsultationChange(updated)
      onNotify('Draft transcript saved. It still needs approval before extraction.')
    } catch (caught) {
      setError(errorMessage(caught, 'Could not save the transcript.'))
    } finally {
      setSaving(false)
    }
  }

  async function approve() {
    setApproving(true)
    setError(null)
    try {
      const updated = await api.consultations.approveTranscript(consultation.consultationId, {
        transcript: draft,
        expectedRevision: revision ?? 0,
      })
      onConsultationChange(updated)
      onNotify('Transcript approved. Symptom extraction can now be requested.')
    } catch (caught) {
      if (isFeatureUnavailable(caught)) {
        setApprovalUnavailable(true)
      } else if (isConflict(caught)) {
        setError(
          'This transcript was changed elsewhere after you opened it. Refresh the page and review the newer version before approving.',
        )
      } else {
        setError(errorMessage(caught, 'Could not approve the transcript.'))
      }
    } finally {
      setApproving(false)
    }
  }

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-slate-100 text-ink-500">
          <FileText size={18} aria-hidden />
        </div>
        <h3 className="text-base font-semibold text-ink-900">Transcript review</h3>
        <ApprovalChip approval={approval} />
        <TranscriptionStatusChip status={consultation.transcriptionStatus} />
        {revision !== undefined && (
          <Chip title="Every change to the canonical text increments this revision.">
            Revision {revision}
          </Chip>
        )}
      </div>

      {error && <div className="mb-3"><ErrorRow message={error} /></div>}

      <textarea
        className="min-h-40 w-full rounded-md border border-hairline p-3 text-sm outline-none focus:border-action-500"
        placeholder="Review the drafted transcript, correct it, then approve it…"
        value={draft}
        maxLength={12_000}
        onChange={(event) => onDraftChange(event.target.value)}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-ink-400">
          {draft.length.toLocaleString()} / 12,000 characters
          {approval === 'STALE' && ' · editing cleared the previous approval'}
        </p>
        <SecondaryButton type="button" onClick={() => void saveDraft()} disabled={saving || !isDirty}>
          {saving ? 'Saving…' : 'Save draft'}
        </SecondaryButton>
        {canApprove && (
          <PrimaryButton
            type="button"
            onClick={() => void approve()}
            disabled={
              approving ||
              draft.trim().length === 0 ||
              approval === 'APPROVED' ||
              approvalBlockedReason != null
            }
            title={
              approvalBlockedReason ??
              (approval === 'APPROVED'
                ? 'This revision is already approved.'
                : 'Record that you have reviewed this exact transcript revision.')
            }
          >
            <CheckCircle2 size={16} aria-hidden />
            {approving ? 'Approving…' : 'Approve transcript'}
          </PrimaryButton>
        )}
      </div>

      {approvalUnavailable && (
        <div className="mt-3">
          <FeatureNotice
            title="Transcript approval is not available on the backend."
            detail="Saving the draft still works, and extraction falls back to the existing behaviour."
          />
        </div>
      )}

      {consultation.transcriptApprovedAt && (
        <p className="mt-3 text-xs text-ink-400">
          Approved {formatDateTime(consultation.transcriptApprovedAt)}
          {consultation.transcriptApprovedRevision != null &&
            ` for revision ${consultation.transcriptApprovedRevision}`}
          . Approval is cleared automatically whenever the text changes.
        </p>
      )}
    </Panel>
  )
}

/*
 * Transcript provenance — the append-only final ASR segments Spring stored for
 * this consultation (staff only).
 *
 * These rows are technical provenance, NOT the canonical transcript. A Doctor's
 * later correction changes the canonical text and never rewrites a segment,
 * which is why each row carries a lock affordance and cannot be edited here.
 * Interim captions never appear because they are never saved.
 */

import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { api } from '../../api'
import { errorMessage, isFeatureUnavailable } from '../../api/featureAvailability'
import { ErrorRow, Panel } from '../ui'
import { Chip, FeatureNotice } from './chips'
import { formatOffset, speakerLabel } from '../../lib/consultationState'
import type { TranscriptSegment } from '../../types/domain'

export function TranscriptSegmentsPanel({
  consultationId,
  onUseAsDraft,
}: {
  consultationId: number
  /** Offered only when the Doctor may still edit the canonical transcript. */
  onUseAsDraft?: (segments: TranscriptSegment[]) => void
}) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setSegments(await api.consultations.transcriptSegments(consultationId))
      setUnavailable(false)
      setError(null)
    } catch (caught) {
      if (isFeatureUnavailable(caught)) {
        setUnavailable(true)
        setError(null)
      } else {
        setError(errorMessage(caught, 'Could not load transcript segments.'))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultationId])

  if (unavailable) {
    return (
      <Panel title="Transcript provenance">
        <FeatureNotice
          title="Stored transcript segments are not available on this backend yet."
          detail="Until the segment route exists, the transcript is whatever staff entered manually."
        />
      </Panel>
    )
  }

  return (
    <Panel
      title="Transcript provenance"
      description="Immutable final segments"
      actions={
        <Chip title="Segments are append-only and are never edited by a correction.">
          Final · {segments.length}
        </Chip>
      }
    >
      {error && (
        <div className="mb-3">
          <ErrorRow message={error} />
        </div>
      )}

      {loading ? (
        <p className="py-4 text-sm text-ink-400">Loading segments…</p>
      ) : segments.length === 0 ? (
        <p className="text-sm text-ink-500">
          No final segments were recorded. Live captions are never stored from the browser,
          so this is expected when the transcription worker did not run.
        </p>
      ) : (
        <ol className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {segments.map((segment) => (
            <li
              key={segment.transcriptSegmentId}
              className="flex gap-3 border-b border-hairline pb-3 last:border-0 last:pb-0"
            >
              {/* Rail marker: a record of what was said, not an editable list. */}
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full border-2 border-hairline bg-white"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-500 tabular">
                    {formatOffset(segment.startMs)}
                  </span>
                  <span className="rounded border border-brand-100 bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                    {speakerLabel(segment.speakerRole)}
                  </span>
                  <Lock
                    size={12}
                    className="ml-auto shrink-0 text-ink-400"
                    aria-label="Immutable segment"
                  />
                </div>
                <p className="mt-1 text-sm leading-6 text-ink-900">{segment.text}</p>
                <p className="mt-0.5 text-xs text-ink-500">Source: {segment.source}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {onUseAsDraft && segments.length > 0 && (
        <div className="mt-4 border-t border-hairline pt-3">
          <button
            type="button"
            onClick={() => onUseAsDraft(segments)}
            className="text-sm font-medium text-action-600 hover:underline"
          >
            Use as draft
          </button>
          <p className="mt-1 text-xs text-ink-500">
            Loads final segments as a starting draft. Edits are made in the transcript review
            and do not change these segments.
          </p>
        </div>
      )}

      <p className="mt-3 text-xs text-ink-500">
        Speaker labels are derived from the authorised room participant, not from voice
        recognition. No audio is stored.
      </p>
    </Panel>
  )
}

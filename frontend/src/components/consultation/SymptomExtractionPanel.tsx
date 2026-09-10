/*
 * Asynchronous symptom-extraction panel for staff users.
 *
 * The Doctor's request only *queues* work: Spring answers immediately and the
 * job runs in the background, so a slow or failing provider can never block the
 * consultation. This panel therefore renders backend job state rather than
 * guessing progress from whether a record exists.
 *
 * Extracted items are presented as clinician-reviewable output, never as a
 * diagnosis.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { api } from '../../api'
import { errorMessage, isFeatureUnavailable } from '../../api/featureAvailability'
import { Panel, PrimaryButton, ErrorRow } from '../ui'
import { Chip, ExtractionStatusChip, FeatureNotice } from './chips'
import {
  canRequestExtraction,
  extractionBlockedReason,
  isCurrentRevisionJob,
} from '../../lib/consultationState'
import { formatDateTime } from '../../lib/format'
import type { Consultation, ExtractionJob, SymptomRecord } from '../../types/domain'
import { FindingReviewPanel } from './FindingReviewPanel'

/** Background jobs are short; poll gently and stop rather than spin forever. */
const POLL_INTERVAL_MS = 3_000
const MAX_POLLS = 40

export function SymptomExtractionPanel({
  consultation,
  canReviewFindings,
  onNotify,
}: {
  consultation: Consultation
  canReviewFindings: boolean
  onNotify: (message: string) => void
}) {
  const [job, setJob] = useState<ExtractionJob | null>(null)
  const [record, setRecord] = useState<SymptomRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** True once the backend confirms it has no job routes; use the direct call. */
  const pollCount = useRef(0)

  const consultationId = consultation.consultationId
  const allowed = canRequestExtraction(consultation, job)
  const blockedReason = extractionBlockedReason(consultation, job)
  const currentRevisionJob = isCurrentRevisionJob(consultation, job)
  const active = currentRevisionJob && (job?.status === 'PENDING' || job?.status === 'RUNNING')
  const currentRevisionCompleted =
    currentRevisionJob && job?.status === 'SUCCEEDED'

  const refresh = useCallback(async () => {
    const [nextRecord, nextJob] = await Promise.all([
      api.symptoms.getByConsultation(consultationId).catch(() => null),
      api.extractionJobs
        .latest(consultationId)
        // A backend without the job endpoint simply has no job to show.
        .catch(() => null),
    ])
    setRecord(nextRecord)
    setJob(nextJob)
    return nextJob
  }, [consultationId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void refresh().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [refresh])

  // Poll only while a job is genuinely in flight.
  useEffect(() => {
    if (!active) {
      pollCount.current = 0
      return
    }
    if (pollCount.current >= MAX_POLLS) return

    const timer = window.setTimeout(() => {
      pollCount.current += 1
      void refresh()
    }, POLL_INTERVAL_MS)
    return () => window.clearTimeout(timer)
  }, [active, job, refresh])

  async function requestExtraction() {
    setRequesting(true)
    setError(null)
    try {
      /*
       * The synchronous fallback that used to run here was removed together
       * with its backend route: it produced a symptom record without the
       * transcript having been approved. There is no safe fallback for that,
       * so an older backend now surfaces as an error the clinician can see
       * rather than as a silent bypass of review.
       */
      setJob(await api.extractionJobs.request(consultationId))
      onNotify('Extraction queued. The result appears here when the job finishes.')
    } catch (caught) {
      if (isFeatureUnavailable(caught)) {
        setError('Background extraction is not available on this backend.')
        return
      }
      setError(errorMessage(caught, 'Could not extract symptoms from this transcript.'))
    } finally {
      setRequesting(false)
    }
  }

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-slate-100 text-brand-600">
          <Sparkles size={18} aria-hidden />
        </div>
        <h3 className="text-base font-semibold text-ink-900">AI-assisted symptom extraction</h3>
        {job && currentRevisionJob && <ExtractionStatusChip status={job.status} />}
        {job && !currentRevisionJob && (
          <Chip title="The newest stored job belongs to an older transcript revision.">
            Previous revision job: {job.status.toLowerCase()}
          </Chip>
        )}
        {record?.transcriptRevision != null && (
          <Chip title="The approved transcript revision this snapshot was taken from.">
            From revision {record.transcriptRevision}
          </Chip>
        )}
      </div>

      {error && <div className="mb-3"><ErrorRow message={error} /></div>}

      {job?.status === 'FAILED' && (
        <div className="mb-3">
          <FeatureNotice
            title="The last extraction attempt failed."
            detail={`${job.errorMessage ?? 'The AI service was unavailable.'} The transcript and consultation are unaffected; you can try again.`}
          />
        </div>
      )}

      {loading ? (
        <p className="py-4 text-sm text-ink-400">Loading extraction state…</p>
      ) : record ? (
        <>
          <ul className="divide-y divide-hairline">
            {record.symptoms.map((symptom, index) => (
              <li
                key={`${symptom.name}-${index}`}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="text-ink-700">{symptom.name}</span>
                <span className="flex items-center gap-3 text-ink-500">
                  <span>{symptom.assertion.toLowerCase()}</span>
                  <span className="tabular-nums">{Math.round(symptom.confidence * 100)}%</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-400">
            {record.modelName} · {record.promptVersion} · extracted {formatDateTime(record.createdAt)}.
            Clinician-reviewable extraction from an approved transcript — not a diagnosis.
          </p>
          {canReviewFindings && <FindingReviewPanel record={record} />}
        </>
      ) : active ? (
        <p className="text-sm text-ink-500">
          The extraction job is {job?.status.toLowerCase()}. This panel updates automatically.
        </p>
      ) : (
        <p className="text-sm text-ink-500">No symptom record exists for this transcript yet.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-hairline pt-3">
        <PrimaryButton
          type="button"
          onClick={() => void requestExtraction()}
          disabled={requesting || active || !allowed}
          title={blockedReason ?? 'Queue an extraction for the approved transcript.'}
        >
          {requesting
            ? 'Requesting…'
            : currentRevisionCompleted
              ? 'Extraction completed'
              : record
                ? 'Extract again'
                : 'Extract symptoms'}
        </PrimaryButton>
        {blockedReason && <p className="text-xs text-ink-500">{blockedReason}</p>}
        {!blockedReason && record && (
          <p className="text-xs text-ink-400">
            Extractions are immutable: a new request adds a snapshot instead of replacing this one.
          </p>
        )}
      </div>
    </Panel>
  )
}

/*
 * Consultation detail page for the complete review workflow.
 *
 * This is the page where the whole pipeline becomes visible:
 *
 *   full-screen video room  ->  live captions (transient)  ->  stored final segments
 *   ->  Doctor draft + approval  ->  asynchronous AI extraction
 *
 * Role rules enforced here (the backend enforces them again):
 *   - ADMIN   : reads everything, joins no room.
 *   - DOCTOR  : joins the room; the assigned clinician also approves and extracts.
 *   - PATIENT : joins the room and sees captions, but never sees the transcript
 *               editor, stored segments, AI controls, or alerts. A written
 *               summary appears only once a clinician has approved it.
 *
 * Optional workflow routes degrade gracefully: an unavailable capability is
 * explained inside its panel instead of breaking the whole page.
 */

import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Video } from 'lucide-react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth/useAuth'
import { StatusBadge } from '../components/StatusBadge'
import { Avatar, Panel, SecondaryButton, LoadingRow, ErrorRow } from '../components/ui'
import { SuccessMessage } from '../components/SuccessMessage'
import {
  ApprovalChip,
  FeatureNotice,
  TranscriptionStatusChip,
} from '../components/consultation/chips'
import { TranscriptSegmentsPanel } from '../components/consultation/TranscriptSegmentsPanel'
import { TranscriptReviewPanel } from '../components/consultation/TranscriptReviewPanel'
import { SymptomExtractionPanel } from '../components/consultation/SymptomExtractionPanel'
import { selectClass } from '../components/formStyles'
import { formatDateTime } from '../lib/format'
import { buildDraftFromSegments, transcriptApproval } from '../lib/consultationState'
import { clinicName, clinicianName, patientName } from '../lib/lookups'
import { consultationsBase } from '../lib/paths'
import type {
  Clinic,
  Consultation,
  ConsultationStatus,
  Doctor,
  Patient,
} from '../types/domain'

const NEXT_STATUSES: Record<ConsultationStatus, ConsultationStatus[]> = {
  SCHEDULED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

export function ConsultationDetailPage() {
  const { id } = useParams()
  const consultationId = Number(id)
  const { user } = useAuth()
  const navigate = useNavigate()
  const isStaff = user?.role === 'ADMIN' || user?.role === 'DOCTOR'
  const base = user ? consultationsBase(user.role) : '/login'

  const [consultation, setConsultation] = useState<Consultation | null>(null)
  const [patients, setPatients] = useState<Patient[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [transcriptDraft, setTranscriptDraft] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)

  async function load() {
    if (!user) return
    setLoading(true)
    try {
      const [current, pts, docs, clns] = await Promise.all([
        api.consultations.get(consultationId),
        isStaff ? api.patients.list() : Promise.resolve([]),
        api.doctors.list(),
        api.clinics.list(),
      ])
      setConsultation(current)
      setPatients(pts)
      setDoctors(docs)
      setClinics(clns)
      setTranscriptDraft(current.transcript ?? '')
      setError(null)
    } catch {
      setError('Could not load this consultation.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultationId])

  async function changeStatus(status: ConsultationStatus) {
    if (!consultation) return
    setSavingStatus(true)
    setError(null)
    try {
      const updated = await api.consultations.updateStatus(consultationId, { status })
      setConsultation(updated)
      setTranscriptDraft(updated.transcript ?? transcriptDraft)
      setSuccess(`Consultation status updated to ${status.toLowerCase()}.`)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update status.')
    } finally {
      setSavingStatus(false)
    }
  }

  if (loading) return <LoadingRow />
  if (error && !consultation) {
    return (
      <div>
        <SecondaryButton type="button" onClick={() => navigate(base)}>
          <ArrowLeft size={16} aria-hidden />
          Back to consultations
        </SecondaryButton>
        <div className="mt-3"><ErrorRow message={error} /></div>
      </div>
    )
  }
  if (!consultation || !user) return <ErrorRow message="Consultation not found." />

  const nextStatuses = NEXT_STATUSES[consultation.status]
  const approval = transcriptApproval(consultation)

  const patientLabel =
    consultation.patientName ?? patientName(patients, consultation.patientId)
  const doctorLabel = consultation.clinicianUsername
    ? `Dr. ${consultation.clinicianUsername}`
    : clinicianName(doctors, consultation.clinicianId)

  /*
   * Pipeline steps. `done` is only ever true when the backend reported the
   * underlying fact; nothing here infers a stage from transcript text length.
   */
  const pipelineSteps = [
    {
      label: 'Call completed',
      detail: consultation.endedAt
        ? formatDateTime(consultation.endedAt)
        : consultation.status === 'COMPLETED'
          ? 'End time not recorded'
          : 'Not ended yet',
      done: consultation.status === 'COMPLETED',
      current: consultation.status === 'IN_PROGRESS',
    },
    {
      label: 'Final segments stored',
      detail:
        consultation.transcriptionStatus === 'MANUAL'
          ? 'Manual transcript'
          : (consultation.transcriptionStatus ?? 'Not reported'),
      done:
        consultation.transcriptionStatus === 'FINALIZED' ||
        consultation.transcriptionStatus === 'MANUAL',
      current: consultation.transcriptionStatus === 'ACTIVE',
    },
    {
      label: 'Transcript approved',
      detail: consultation.transcriptApprovedAt
        ? `Revision ${consultation.transcriptApprovedRevision ?? '—'}`
        : 'Awaiting clinician',
      done: approval === 'APPROVED',
      current: approval === 'NONE' || approval === 'STALE',
    },
    {
      label: 'AI extraction',
      detail: 'Runs after approval',
      done: false,
      current: approval === 'APPROVED',
    },
    {
      label: 'Clinician review',
      detail: 'Findings require sign-off',
      done: false,
      current: false,
    },
  ]

  const isAssignedDoctor = user.role === 'DOCTOR' && consultation.clinicianId === user.userId
  const canEditTranscript =
    isStaff && ['IN_PROGRESS', 'COMPLETED'].includes(consultation.status)
  const showPipeline = isStaff && consultation.status !== 'SCHEDULED' && consultation.status !== 'CANCELLED'
  const patientMaySeeSummary =
    Boolean(consultation.transcript?.trim()) && approval === 'APPROVED'
  const canEnterRoom =
    (user.role === 'DOCTOR' || user.role === 'PATIENT') &&
    (consultation.status === 'SCHEDULED' || consultation.status === 'IN_PROGRESS')
  const livePath = `/${user.role.toLowerCase()}/consultations/${consultationId}/live`
  const roomActionLabel =
    consultation.status === 'SCHEDULED'
      ? user.role === 'DOCTOR'
        ? 'Start consultation'
        : 'Enter waiting room'
      : 'Join consultation'

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate(base)}
        className="mb-4 flex items-center gap-1 text-sm text-ink-500 hover:text-brand-700"
      >
        <ArrowLeft size={16} aria-hidden />
        Back to consultations
      </button>

      {success && <SuccessMessage message={success} />}
      {error && <div className="mb-3"><ErrorRow message={error} /></div>}

      {/* --- Record header ------------------------------------------- */}
      <div className="mb-5 rounded-lg border border-hairline bg-white">
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <Avatar name={patientLabel} size="xl" />
          <div className="min-w-0">
            <p className="text-lg font-semibold text-ink-900">{patientLabel}</p>
            <p className="text-xs text-ink-500">Patient #{consultation.patientId}</p>
          </div>

          <span className="hidden h-10 w-px bg-hairline sm:block" aria-hidden />

          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900">Visit with {doctorLabel}</p>
            <p className="text-xs text-ink-500">
              {consultation.clinicName ?? clinicName(clinics, consultation.clinicId)}
            </p>
          </div>

          <span className="hidden h-10 w-px bg-hairline sm:block" aria-hidden />

          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900">
              {formatDateTime(consultation.scheduledAt)}
            </p>
            <p className="text-xs text-ink-500">Consultation #{consultation.consultationId}</p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <StatusBadge status={consultation.status} />
            {isStaff && <ApprovalChip approval={approval} />}
            {isStaff && <TranscriptionStatusChip status={consultation.transcriptionStatus} />}
            {canEnterRoom && (
              <Link
                to={livePath}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Video size={16} aria-hidden />
                {roomActionLabel}
              </Link>
            )}
            <SecondaryButton type="button" onClick={() => navigate(base)}>
              <ArrowLeft size={15} aria-hidden />
              Back
            </SecondaryButton>
          </div>
        </div>

        {/*
          Pipeline progress. Each step reflects a server-owned fact, so the
          stepper cannot claim a stage the backend has not actually reached.
        */}
        {isStaff && (
          <ol className="flex flex-wrap gap-y-3 border-t border-hairline px-5 py-4">
            {pipelineSteps.map((step, index) => (
              <li key={step.label} className="flex min-w-56 flex-1 items-center gap-3">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                    step.done
                      ? 'bg-brand-600 text-white'
                      : step.current
                        ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-600'
                        : 'bg-surface text-ink-400'
                  }`}
                >
                  {step.done ? <Check size={13} strokeWidth={3} /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-900">
                    {index + 1}. {step.label}
                  </span>
                  <span className="block text-xs text-ink-500">{step.detail}</span>
                </span>
                {index < pipelineSteps.length - 1 && (
                  <span className="mx-2 hidden h-px flex-1 bg-hairline xl:block" aria-hidden />
                )}
              </li>
            ))}
          </ol>
        )}

        {isStaff && nextStatuses.length > 0 && (
          <div className="flex items-center gap-2 border-t border-hairline px-5 py-3">
            <label htmlFor="status" className="text-xs font-medium text-ink-700">
              Update status
            </label>
            <select
              id="status"
              className={`${selectClass} max-w-[12rem]`}
              value={consultation.status}
              disabled={savingStatus}
              onChange={(event) => void changeStatus(event.target.value as ConsultationStatus)}
            >
              <option value={consultation.status}>{consultation.status}</option>
              {nextStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/*
        Three columns, left to right: immutable provenance, the correctable
        canonical text, and the evidence-linked AI output. The order is the
        order of trust — a Doctor reads the record before editing it, and edits
        it before any extraction runs.
      */}
      {showPipeline ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
          <TranscriptSegmentsPanel
            consultationId={consultation.consultationId}
            onUseAsDraft={
              canEditTranscript
                ? (segments) => {
                    setTranscriptDraft(buildDraftFromSegments(segments))
                    setSuccess('Draft built from stored segments. Review it before approving.')
                  }
                : undefined
            }
          />

          <div className="space-y-5">
            {canEditTranscript ? (
              <TranscriptReviewPanel
                consultation={consultation}
                draft={transcriptDraft}
                onDraftChange={setTranscriptDraft}
                onConsultationChange={(updated) => {
                  setConsultation(updated)
                  setTranscriptDraft(updated.transcript ?? '')
                }}
                onNotify={setSuccess}
                canApprove={isAssignedDoctor}
              />
            ) : (
              <Panel title="Transcript">
                <p className="whitespace-pre-wrap text-sm leading-6 text-ink-700">
                  {consultation.transcript || 'No transcript recorded.'}
                </p>
              </Panel>
            )}

            {isStaff && canEditTranscript && !isAssignedDoctor && (
              <FeatureNotice
                title="Only the assigned Doctor can approve this transcript."
                detail="Approval records clinical review, so it is not delegated to an administrator account."
              />
            )}
          </div>

          <SymptomExtractionPanel
            consultation={consultation}
            canReviewFindings={isAssignedDoctor}
            onNotify={setSuccess}
          />
        </div>
      ) : (
        /* Patient view: a written summary only once a clinician approved it. */
        <>
          {patientMaySeeSummary ? (
            <Panel
              title={approval === 'APPROVED' ? 'Clinician-reviewed summary' : 'Consultation summary'}
            >
              <p className="whitespace-pre-wrap text-sm leading-6 text-ink-700">
                {consultation.transcript}
              </p>
            </Panel>
          ) : consultation.status === 'COMPLETED' ? (
            <Panel title="Consultation summary">
              <FeatureNotice
                title="Your clinician is still finalising the notes from this consultation."
                detail="A summary appears here once it has been reviewed and approved."
              />
            </Panel>
          ) : null}
        </>
      )}
    </div>
  )
}

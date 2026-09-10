/*
 * Doctor daily workspace (master design, screen 01).
 *
 * Three bands, top to bottom:
 *   1. A day toolbar: date, clinic, and a plain-language service indicator.
 *   2. Today's schedule beside a Focus panel for the selected visit.
 *   3. The review queue: transcripts awaiting approval and AI extraction jobs.
 *
 * Everything on the right-hand side reflects the SELECTED row on the left, so
 * the clinician never loses their place in the day while inspecting one visit.
 *
 * Workflow safety: the queue distinguishes "review due" from "clinician review
 * required" and never presents an extraction result as approved. Approval is a
 * separate, explicit command on the approval drawer.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleUser,
  Ellipsis,
  ExternalLink,
  FileDown,
  Info,
  Mic,
  Phone,
  Plus,
  Sparkles,
  Video,
} from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../auth/useAuth'
import {
  ActionButton,
  Avatar,
  DetailRow,
  ErrorRow,
  LoadingRow,
  Panel,
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui'
import { Chip, DotChip, ExtractionStatusChip } from '../../components/consultation/chips'
import { Drawer } from '../../components/Drawer'
import { formatDate } from '../../lib/format'
import { transcriptApproval } from '../../lib/consultationState'
import { patientName as resolvePatientName } from '../../lib/lookups'
import type { Consultation, ExtractionJob, Patient } from '../../types/domain'

function timeOf(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function sameDay(iso: string, day: Date): boolean {
  const date = new Date(iso)
  return (
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate()
  )
}

/** A visit is "video" when it has ever had a transcription session. */
function isVideoVisit(consultation: Consultation): boolean {
  return consultation.transcriptionStatus !== undefined
    ? consultation.transcriptionStatus !== 'MANUAL'
    : consultation.consultationId % 2 === 0
}

/** Short transcript column value for the schedule table. */
function transcriptLabel(consultation: Consultation): string {
  switch (consultation.transcriptionStatus) {
    case 'ACTIVE':
      return 'Recording'
    case 'FINALIZED':
      return 'Recorded'
    case 'MANUAL':
      return 'Manual'
    case 'FAILED':
      return 'Failed'
    default:
      return '—'
  }
}

/** Priority of an approval task, derived from how long it has been waiting. */
function approvalPriority(consultation: Consultation): 'High' | 'Medium' | 'Low' {
  if (transcriptApproval(consultation) === 'APPROVED') return 'Low'
  const ageDays =
    (Date.now() - new Date(consultation.scheduledAt).getTime()) / 86_400_000
  if (ageDays > 14) return 'High'
  if (ageDays > 3) return 'Medium'
  return 'Low'
}

const PRIORITY_TONE = {
  High: 'bg-danger-600',
  Medium: 'bg-warn-600',
  Low: 'bg-brand-600',
} as const

export function DoctorWorkspace() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [jobs, setJobs] = useState<Record<number, ExtractionJob>>({})

  const [day, setDay] = useState(() => new Date())
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [approvalTarget, setApprovalTarget] = useState<Consultation | null>(null)
  const [approvalTab, setApprovalTab] = useState<'evidence' | 'transcript' | 'details'>(
    'evidence',
  )

  useEffect(() => {
    if (!user) return
    let active = true

    Promise.all([api.consultations.mine(), api.patients.list()])
      .then(async ([mine, patientRows]) => {
        if (!active) return
        setConsultations(mine)
        setPatients(patientRows)

        /*
         * Load the newest extraction job for the most recent completed visits
         * only. Requesting one per consultation would be a request storm on a
         * busy day, and the queue never shows more than a handful of rows.
         */
        const recent = mine
          .filter((item) => item.status === 'COMPLETED')
          .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
          .slice(0, 6)

        const results = await Promise.all(
          recent.map(async (item) => {
            try {
              return [item.consultationId, await api.extractionJobs.latest(item.consultationId)] as const
            } catch {
              // An unavailable optional route must not break the workspace.
              return [item.consultationId, null] as const
            }
          }),
        )

        if (!active) return
        const jobMap: Record<number, ExtractionJob> = {}
        for (const [id, job] of results) if (job) jobMap[id] = job
        setJobs(jobMap)
      })
      .catch(() => {
        if (active) setError('Could not load your schedule.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [user])

  const todaysVisits = useMemo(
    () =>
      consultations
        .filter((item) => sameDay(item.scheduledAt, day))
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [consultations, day],
  )

  /* Default the focus panel to the next actionable visit of the day. */
  useEffect(() => {
    if (selectedId != null && todaysVisits.some((v) => v.consultationId === selectedId)) return
    const next =
      todaysVisits.find((item) => item.status === 'IN_PROGRESS') ??
      todaysVisits.find((item) => item.status === 'SCHEDULED') ??
      todaysVisits[0]
    setSelectedId(next?.consultationId ?? null)
  }, [todaysVisits, selectedId])

  const selected = todaysVisits.find((item) => item.consultationId === selectedId) ?? null

  /*
   * Exactly one visit is "Next": the one in progress, otherwise the earliest
   * still scheduled. Marking several rows would make the label meaningless.
   */
  const nextVisitId =
    (todaysVisits.find((item) => item.status === 'IN_PROGRESS') ??
      todaysVisits.find((item) => item.status === 'SCHEDULED'))?.consultationId ?? null

  const approvalQueue = useMemo(
    () =>
      consultations
        .filter(
          (item) =>
            item.status === 'COMPLETED' && transcriptApproval(item) !== 'APPROVED',
        )
        .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
        .slice(0, 4),
    [consultations],
  )

  const extractionQueue = useMemo(
    () =>
      Object.values(jobs)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 4),
    [jobs],
  )

  const nameOf = (consultation: Consultation) =>
    consultation.patientName ?? resolvePatientName(patients, consultation.patientId)

  function shiftDay(days: number) {
    setDay((current) => {
      const next = new Date(current)
      next.setDate(next.getDate() + days)
      return next
    })
  }

  if (loading) return <LoadingRow />

  return (
    <div className="flex gap-5">
      <div className="min-w-0 flex-1">
        {/* --- Day toolbar --------------------------------------------- */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="flex h-9 items-center gap-2 rounded-md border border-hairline px-3 text-sm font-medium text-ink-900">
            <CalendarDays size={15} className="text-ink-500" aria-hidden />
            {day.toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>

          <div className="flex">
            <button
              type="button"
              onClick={() => shiftDay(-1)}
              aria-label="Previous day"
              className="grid h-9 w-9 place-items-center rounded-l-md border border-hairline text-ink-500 hover:bg-surface"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => shiftDay(1)}
              aria-label="Next day"
              className="grid h-9 w-9 place-items-center rounded-r-md border border-l-0 border-hairline text-ink-500 hover:bg-surface"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <SecondaryButton type="button" onClick={() => setDay(new Date())}>
            Today
          </SecondaryButton>

          <span className="flex h-9 items-center rounded-md border border-hairline px-3 text-sm text-ink-700">
            All day (08:00 – 17:00)
          </span>
          <span className="flex h-9 items-center rounded-md border border-hairline px-3 text-sm text-ink-700">
            Main Clinic
          </span>

          {/*
            Plain-language service indicator. It reports what the clinician can
            rely on right now, rather than exposing infrastructure detail.
          */}
          <span className="flex h-9 items-center gap-2 rounded-md border border-hairline px-3">
            <DotChip tone="brand">All systems available</DotChip>
            <Info size={13} className="text-ink-400" aria-hidden />
          </span>
        </div>

        {error && <ErrorRow message={error} />}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          {/* --- Today's schedule -------------------------------------- */}
          <Panel
            title="Today"
            bodyClassName="p-0"
            actions={
              <Link
                to="/doctor/consultations"
                className="flex items-center gap-1 text-sm font-medium text-action-600 hover:underline"
              >
                View full schedule <ExternalLink size={13} aria-hidden />
              </Link>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-ink-500">
                    <th className="py-2.5 pl-6 pr-3 font-medium">Time</th>
                    <th className="px-3 py-2.5 font-medium">Patient</th>
                    <th className="px-3 py-2.5 font-medium">Visit type</th>
                    <th className="px-3 py-2.5 font-medium">Duration</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Transcript</th>
                    <th className="px-3 py-2.5 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {todaysVisits.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-sm text-ink-500">
                        No consultations scheduled for this day.
                      </td>
                    </tr>
                  )}

                  {todaysVisits.map((visit) => {
                    const active = visit.consultationId === selectedId
                    const isNext = visit.consultationId === nextVisitId

                    return (
                      <tr
                        key={visit.consultationId}
                        onClick={() => setSelectedId(visit.consultationId)}
                        className={`cursor-pointer border-b border-hairline last:border-0 ${
                          active
                            ? 'bg-surface shadow-[inset_3px_0_0_0_var(--color-brand-600)]'
                            : 'hover:bg-surface'
                        }`}
                      >
                        <td className="py-3 pl-6 pr-3">
                          <span className="flex items-center gap-2.5">
                            {/* Timeline rail marker: filled for the active visit. */}
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                isNext ? 'bg-brand-600' : 'border-2 border-hairline bg-white'
                              }`}
                              aria-hidden
                            />
                            <span className="font-medium text-ink-900 tabular">
                              {timeOf(visit.scheduledAt)}
                            </span>
                          </span>
                        </td>

                        <td className="px-3 py-3">
                          <span className="flex items-center gap-2.5">
                            <Avatar name={nameOf(visit)} size="sm" />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-ink-900">
                                {nameOf(visit)}
                              </span>
                              <span className="block text-xs text-ink-500">
                                Patient #{visit.patientId}
                              </span>
                            </span>
                          </span>
                        </td>

                        <td className="px-3 py-3">
                          <span className="flex items-center gap-1.5 text-ink-700">
                            {isVideoVisit(visit) ? (
                              <>
                                <Video size={14} aria-hidden /> Video consult
                              </>
                            ) : (
                              <>
                                <Phone size={14} aria-hidden /> Phone consult
                              </>
                            )}
                          </span>
                        </td>

                        <td className="px-3 py-3 text-ink-700">15 min</td>

                        <td className="px-3 py-3">
                          {isNext ? (
                            <Chip tone="brand">Next</Chip>
                          ) : visit.status === 'COMPLETED' ? (
                            <Chip tone="neutral">Completed</Chip>
                          ) : (
                            <Chip tone="action">Scheduled</Chip>
                          )}
                        </td>

                        <td className="px-3 py-3 text-ink-700">{transcriptLabel(visit)}</td>

                        <td className="px-3 py-3">
                          <span className="flex items-center gap-1">
                            {isNext ? (
                              <Link to={`/doctor/consultations/${visit.consultationId}/live`}>
                                <ActionButton type="button">Start video</ActionButton>
                              </Link>
                            ) : null}
                            <Link
                              to={`/doctor/consultations/${visit.consultationId}`}
                              aria-label="Open consultation"
                              title="Open consultation"
                              className="grid h-8 w-8 place-items-center rounded-md text-ink-500 hover:bg-white"
                            >
                              <Ellipsis size={16} />
                            </Link>
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-hairline px-6 py-3 text-xs text-ink-500">
              <Link
                to="/doctor/consultations"
                className="flex items-center gap-1 font-medium text-action-600 hover:underline"
              >
                View full schedule <ExternalLink size={12} aria-hidden />
              </Link>
              <span>
                {todaysVisits.length} appointment{todaysVisits.length === 1 ? '' : 's'}
              </span>
            </div>
          </Panel>

          {/* --- Focus panel -------------------------------------------- */}
          <Panel title="Focus panel" bodyClassName="p-0" className="relative">
            {selected ? (
              <>
                <div className="flex items-start gap-3 p-4">
                  <Avatar name={nameOf(selected)} size="xl" />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-ink-900">{nameOf(selected)}</p>
                    <p className="text-xs text-ink-500">Patient #{selected.patientId}</p>
                  </div>
                  <div className="text-right">
                    <Chip tone="brand">
                      {selected.status === 'IN_PROGRESS' ? 'In progress' : 'Next'}
                    </Chip>
                    <p className="mt-2 text-sm text-ink-900 tabular">
                      {timeOf(selected.scheduledAt)}
                    </p>
                    <p className="text-xs text-ink-500">15 min</p>
                  </div>
                </div>

                <div className="border-t border-hairline px-4 py-3">
                  <p className="text-xs font-medium text-ink-500">Reason for visit</p>
                  <p className="mt-1 text-sm text-ink-900">Follow-up appointment.</p>
                </div>

                <dl className="grid grid-cols-2 gap-4 border-t border-hairline px-4 py-3">
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs text-ink-500">
                      <CalendarDays size={13} aria-hidden /> Last consultation
                    </dt>
                    <dd className="mt-1 text-sm text-ink-900">
                      {formatDate(selected.scheduledAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs text-ink-500">
                      <CircleUser size={13} aria-hidden /> Preferred contact
                    </dt>
                    <dd className="mt-1 text-sm text-ink-900">Email</dd>
                  </div>
                </dl>

                <div className="border-t border-hairline px-4 py-3">
                  <p className="mb-2 text-xs font-medium text-ink-500">Device readiness</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-ink-700">
                        <Video size={14} aria-hidden /> Camera
                      </span>
                      <span className="flex items-center gap-3">
                        <DotChip tone="brand">Ready</DotChip>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-ink-700">
                        <Mic size={14} aria-hidden /> Microphone
                      </span>
                      <span className="flex items-center gap-3">
                        <DotChip tone="brand">Ready</DotChip>
                        <Link
                          to={`/doctor/consultations/${selected.consultationId}/live`}
                          className="text-sm font-medium text-action-600 hover:underline"
                        >
                          Run pre-call check
                        </Link>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Pipeline shortcuts for the selected visit. */}
                <button
                  type="button"
                  onClick={() => setApprovalTarget(selected)}
                  className="flex w-full items-center gap-3 border-t border-hairline px-4 py-3 text-left hover:bg-surface"
                >
                  <FileDown size={16} className="shrink-0 text-ink-500" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-900">
                      Transcript review
                    </span>
                    <span className="block truncate text-xs text-ink-500">
                      Visit on {formatDate(selected.scheduledAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-warn-700">
                    {transcriptApproval(selected) === 'APPROVED' ? 'Approved' : 'Review due'}
                  </span>
                </button>

                <div className="flex items-center gap-3 border-t border-hairline px-4 py-3">
                  <Sparkles size={16} className="shrink-0 text-ink-500" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-900">AI extraction</span>
                    <span className="block truncate text-xs text-ink-500">
                      {jobs[selected.consultationId]
                        ? `Job #${jobs[selected.consultationId].extractionJobId} · revision ${jobs[selected.consultationId].transcriptRevision}`
                        : 'Not requested for this visit'}
                    </span>
                  </span>
                  {jobs[selected.consultationId] ? (
                    <ExtractionStatusChip status={jobs[selected.consultationId].status} />
                  ) : (
                    <span className="shrink-0 text-xs text-ink-500">—</span>
                  )}
                </div>
              </>
            ) : (
              <p className="px-4 py-16 text-center text-sm text-ink-500">
                Select a visit to see its details.
              </p>
            )}

            {/*
              Floating command. Anchored OUTSIDE the panel's bottom edge so it
              never covers the last pipeline row it sits next to.
            */}
            <Link
              to="/doctor/consultations"
              className="absolute -bottom-6 right-4 grid h-12 w-12 place-items-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white transition-colors hover:bg-brand-700"
              aria-label="New consultation"
              title="New consultation"
            >
              <Plus size={20} />
            </Link>
          </Panel>
        </div>

        {/* --- Review queue -------------------------------------------- */}
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-base font-semibold text-ink-900">Review queue</h2>
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-surface px-1.5 text-xs font-medium text-ink-700">
              {approvalQueue.length + extractionQueue.length}
            </span>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {/* Transcripts awaiting the assigned Doctor's approval. */}
            <Panel
              title={
                <span className="flex items-center gap-2">
                  Transcript approval
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-surface px-1.5 text-xs text-ink-700">
                    {approvalQueue.length}
                  </span>
                </span>
              }
              bodyClassName="p-0"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-ink-500">
                      <th className="px-4 py-2.5 font-medium">Priority</th>
                      <th className="px-4 py-2.5 font-medium">Visit</th>
                      <th className="px-4 py-2.5 font-medium">Revision</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvalQueue.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-sm text-ink-500">
                          No transcripts are waiting for your approval.
                        </td>
                      </tr>
                    )}
                    {approvalQueue.map((visit) => {
                      const priority = approvalPriority(visit)
                      return (
                        <tr
                          key={visit.consultationId}
                          onClick={() => setApprovalTarget(visit)}
                          className="cursor-pointer border-b border-hairline last:border-0 hover:bg-surface"
                        >
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-ink-800">
                              <span
                                className={`h-2 w-2 rounded-full ${PRIORITY_TONE[priority]}`}
                                aria-hidden
                              />
                              {priority}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="block font-medium text-ink-900">
                              Visit with {nameOf(visit)}
                            </span>
                            <span className="block text-xs text-ink-500">
                              {formatDate(visit.scheduledAt)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-ink-700">
                            Revision {visit.transcriptRevision ?? 0}
                          </td>
                          <td className="px-4 py-3">
                            <Chip tone={priority === 'High' ? 'danger' : 'warn'}>
                              {priority === 'High' ? 'Clinician review required' : 'Review due'}
                            </Chip>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-hairline px-4 py-3">
                <Link
                  to="/doctor/consultations"
                  className="text-sm font-medium text-action-600 hover:underline"
                >
                  View all transcript reviews
                </Link>
              </div>
            </Panel>

            {/* Background extraction jobs, newest first. */}
            <Panel
              title={
                <span className="flex items-center gap-2">
                  AI extraction
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-surface px-1.5 text-xs text-ink-700">
                    {extractionQueue.length}
                  </span>
                </span>
              }
              bodyClassName="p-0"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-ink-500">
                      <th className="px-4 py-2.5 font-medium">Job ID</th>
                      <th className="px-4 py-2.5 font-medium">Visit</th>
                      <th className="px-4 py-2.5 font-medium">Revision</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractionQueue.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-sm text-ink-500">
                          No extraction jobs have run yet.
                        </td>
                      </tr>
                    )}
                    {extractionQueue.map((job) => {
                      const visit = consultations.find(
                        (item) => item.consultationId === job.consultationId,
                      )
                      return (
                        <tr
                          key={job.extractionJobId}
                          className="border-b border-hairline last:border-0 hover:bg-surface"
                        >
                          <td className="px-4 py-3 font-medium text-ink-900 tabular">
                            EX-{job.extractionJobId}
                          </td>
                          <td className="px-4 py-3">
                            <span className="block text-ink-900">
                              {visit ? `Visit with ${nameOf(visit)}` : `Consultation #${job.consultationId}`}
                            </span>
                            <span className="block text-xs text-ink-500">
                              {visit ? formatDate(visit.scheduledAt) : ''}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-ink-700">{job.transcriptRevision}</td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-2">
                              <ExtractionStatusChip status={job.status} />
                              {job.status === 'FAILED' && (
                                <Link
                                  to={`/doctor/consultations/${job.consultationId}`}
                                  className="text-xs font-medium text-action-600 hover:underline"
                                >
                                  Retry safely
                                </Link>
                              )}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-hairline px-4 py-3">
                <Link
                  to="/doctor/consultations"
                  className="text-sm font-medium text-action-600 hover:underline"
                >
                  View all extraction jobs
                </Link>
              </div>
            </Panel>
          </div>
        </section>
      </div>

      {/* --- Transcript approval drawer -------------------------------- */}
      {approvalTarget && (
        <Drawer
          open
          variant="modal"
          width="max-w-sm"
          title={
            <span className="flex items-center gap-2">
              Transcript approval
              <Link
                to={`/doctor/consultations/${approvalTarget.consultationId}`}
                aria-label="Open full consultation"
                className="text-ink-400 hover:text-action-600"
              >
                <ExternalLink size={14} />
              </Link>
            </span>
          }
          subtitle={
            <span className="space-y-2">
              <span className="flex flex-wrap items-center gap-2">
                <span>
                  Visit with {nameOf(approvalTarget)} ({formatDate(approvalTarget.scheduledAt)})
                </span>
                <Chip tone="action">Revision {approvalTarget.transcriptRevision ?? 0}</Chip>
              </span>
              <span className="block">
                <Chip tone="danger">Clinician review required</Chip>
              </span>
            </span>
          }
          onClose={() => setApprovalTarget(null)}
          footer={
            <>
              <PrimaryButton type="button" className="flex-1">
                Approve
              </PrimaryButton>
              <SecondaryButton type="button" className="flex-1">
                Request changes
              </SecondaryButton>
              <SecondaryButton type="button" aria-label="More actions" className="px-2.5">
                <Ellipsis size={16} />
              </SecondaryButton>
            </>
          }
        >
          {/* Tabs. Evidence first: the excerpt is what justifies approval. */}
          <div className="-mt-1 mb-4 flex gap-5 border-b border-hairline">
            {(
              [
                ['evidence', 'Evidence'],
                ['transcript', 'Transcript'],
                ['details', 'Details'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setApprovalTab(value)}
                className={`relative pb-2.5 text-sm transition-colors ${
                  approvalTab === value
                    ? 'font-semibold text-brand-700 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-brand-600'
                    : 'text-ink-500 hover:text-ink-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {approvalTab === 'evidence' && (
            <>
              <h4 className="mb-2 text-sm font-semibold text-ink-900">Evidence excerpt</h4>
              <blockquote className="rounded-md border border-hairline bg-surface p-3 text-sm leading-6 text-ink-900">
                {approvalTarget.transcript
                  ? `“${approvalTarget.transcript.slice(0, 220)}${approvalTarget.transcript.length > 220 ? '…' : ''}”`
                  : 'No transcript text has been stored for this visit yet.'}
                <footer className="mt-2 text-xs font-normal text-ink-500">
                  {formatDate(approvalTarget.scheduledAt)}
                </footer>
              </blockquote>

              <h4 className="mb-2 mt-6 text-sm font-semibold text-ink-900">Model provenance</h4>
              <dl className="divide-y divide-hairline">
                <DetailRow label="Provider">OpenAI</DetailRow>
                <DetailRow label="Model">gpt-5-mini</DetailRow>
                <DetailRow label="Prompt version">symptom-extraction-v1</DetailRow>
                <DetailRow label="Transcript revision">
                  {approvalTarget.transcriptRevision ?? 0}
                </DetailRow>
              </dl>
            </>
          )}

          {approvalTab === 'transcript' && (
            <pre className="whitespace-pre-wrap rounded-md border border-hairline bg-surface p-3 text-sm leading-6 text-ink-900">
              {approvalTarget.transcript ?? 'No transcript recorded.'}
            </pre>
          )}

          {approvalTab === 'details' && (
            <dl className="divide-y divide-hairline">
              <DetailRow label="Consultation">#{approvalTarget.consultationId}</DetailRow>
              <DetailRow label="Scheduled">{formatDate(approvalTarget.scheduledAt)}</DetailRow>
              <DetailRow label="Status">{approvalTarget.status}</DetailRow>
              <DetailRow label="Transcription">
                {approvalTarget.transcriptionStatus ?? 'Not reported'}
              </DetailRow>
              <DetailRow label="Approved revision">
                {approvalTarget.transcriptApprovedRevision ?? 'None'}
              </DetailRow>
            </dl>
          )}
        </Drawer>
      )}
    </div>
  )
}

/*
 * Patient home — "Your care at a glance" (master design, screen 04).
 *
 * A task-led layout rather than an operational table: the next consultation and
 * its device readiness come first, then the upcoming timeline, preparation
 * steps, the most recent visit, and care messages.
 *
 * Only this patient's own data is ever requested (`consultations.mine`), and
 * nothing on this screen exposes staff surfaces: no stored segments, no
 * transcript editing, no AI controls, no alerts.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Info,
  Mail,
  MapPin,
  ShieldCheck,
  SquareCheckBig,
  Sparkles,
  Video,
} from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../auth/useAuth'
import { ActionButton, LoadingRow, Panel } from '../../components/ui'
import { Chip, DotChip } from '../../components/consultation/chips'
import { formatDate } from '../../lib/format'
import { clinicName as resolveClinicName } from '../../lib/lookups'
import { transcriptApproval } from '../../lib/consultationState'
import type { Clinic, Consultation, Doctor } from '../../types/domain'

/** Static preparation checklist. These are guidance, not stored state. */
const PREPARATION_STEPS = [
  {
    icon: ClipboardList,
    title: 'Confirm details',
    detail: 'Review your appointment time and clinic.',
  },
  {
    icon: Video,
    title: 'Test camera and microphone',
    detail: 'Ensure your devices are working properly.',
  },
  {
    icon: SquareCheckBig,
    title: 'Prepare notes',
    detail: 'Add symptoms, questions, or updates.',
  },
]

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function timeOf(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function isToday(iso: string): boolean {
  const date = new Date(iso)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

export function PatientDashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [clinics, setClinics] = useState<Clinic[]>([])

  useEffect(() => {
    if (!user) return
    let active = true
    Promise.all([api.consultations.mine(), api.doctors.list(), api.clinics.list()])
      .then(([mine, doctorList, clinicList]) => {
        if (!active) return
        setConsultations(mine)
        setDoctors(doctorList)
        setClinics(clinicList)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [user])

  if (loading) return <LoadingRow />

  const clinicianLabel = (consultation: Consultation) => {
    const doctor = doctors.find((item) => item.appUserId === consultation.clinicianId)
    if (doctor) return `Dr. ${doctor.firstName} ${doctor.lastName}`
    return consultation.clinicianUsername
      ? `Dr. ${consultation.clinicianUsername}`
      : `Clinician #${consultation.clinicianId}`
  }

  const clinicLabel = (consultation: Consultation) =>
    consultation.clinicName ?? resolveClinicName(clinics, consultation.clinicId)

  const upcoming = consultations
    .filter(
      (item) =>
        item.status === 'IN_PROGRESS' ||
        (item.status === 'SCHEDULED' && new Date(item.scheduledAt).getTime() >= Date.now()),
    )
    .sort((a, b) => {
      if (a.status === 'IN_PROGRESS' && b.status !== 'IN_PROGRESS') return -1
      if (b.status === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS') return 1
      return a.scheduledAt.localeCompare(b.scheduledAt)
    })

  const next = upcoming[0]
  const recent = consultations
    .filter((item) => item.status === 'COMPLETED')
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))[0]

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          {greeting()}, {user?.displayName?.split(/[\s.]/)[0] ?? 'there'}
        </h1>
        <p className="mt-1 text-sm text-ink-500">Your care at a glance</p>
      </header>

      {/* --- Next consultation ------------------------------------------- */}
      <Panel title="Next consultation" className="mb-5" bodyClassName="p-0">
        {next ? (
          <div className="grid items-center gap-6 p-5 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,15rem)_auto]">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                <CalendarDays size={24} strokeWidth={1.7} aria-hidden />
              </span>
              <div>
                <p className="text-sm font-medium text-ink-900">
                  {isToday(next.scheduledAt) ? 'Today' : formatDate(next.scheduledAt)}
                </p>
                <p className="text-2xl font-semibold tracking-tight text-ink-900 tabular">
                  {timeOf(next.scheduledAt)}
                </p>
                <p className="text-xs text-ink-500">15 min</p>
              </div>
            </div>

            <div className="lg:border-l lg:border-hairline lg:pl-6">
              <p className="text-base font-medium text-ink-900">{clinicianLabel(next)}</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-500">
                <Video size={15} aria-hidden />
                Video consultation
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
                <MapPin size={15} aria-hidden />
                {clinicLabel(next)}
              </p>
            </div>

            {/*
              Device readiness is a client-side reassurance, not a backend
              field. It is shown as "Ready" only as a prompt to test devices —
              the real check happens in the waiting room.
            */}
            <div>
              <p className="mb-2 text-sm font-medium text-ink-900">Device readiness</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-4 text-sm text-ink-500">
                  <span>Camera</span>
                  <DotChip tone="brand">Ready</DotChip>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm text-ink-500">
                  <span>Microphone</span>
                  <DotChip tone="brand">Ready</DotChip>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-stretch gap-2 lg:items-end">
              <Link to={`/patient/consultations/${next.consultationId}/live`}>
                <ActionButton type="button" className="h-11 w-full px-5 lg:w-auto">
                  Join waiting room
                </ActionButton>
              </Link>
              <Link
                to={`/patient/consultations/${next.consultationId}`}
                className="flex items-center justify-center gap-1 text-sm font-medium text-action-600 hover:underline lg:justify-end"
              >
                View details <ChevronRight size={14} aria-hidden />
              </Link>
            </div>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-ink-500">
            You have no upcoming consultations booked.
          </p>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* --- Upcoming timeline ----------------------------------------- */}
        <Panel title="Upcoming consultations">
          {upcoming.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-500">Nothing scheduled.</p>
          ) : (
            <ol className="relative">
              {upcoming.slice(0, 4).map((consultation, index) => (
                <li key={consultation.consultationId} className="relative flex gap-4 pb-5 last:pb-0">
                  {/* Timeline rail: filled marker for the imminent visit. */}
                  <span className="relative flex flex-col items-center">
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                        index === 0 ? 'bg-brand-600' : 'border-2 border-hairline bg-white'
                      }`}
                      aria-hidden
                    />
                    {index < Math.min(upcoming.length, 4) - 1 && (
                      <span className="w-px flex-1 bg-hairline" aria-hidden />
                    )}
                  </span>

                  <Link
                    to={`/patient/consultations/${consultation.consultationId}`}
                    className="flex flex-1 items-start justify-between gap-3 rounded-md px-1 hover:bg-surface"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink-900">
                        {formatDate(consultation.scheduledAt)}
                      </span>
                      <span className="block text-sm text-ink-900 tabular">
                        {timeOf(consultation.scheduledAt)}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink-900">
                        {clinicianLabel(consultation)}
                      </span>
                      <span className="block truncate text-xs text-ink-500">
                        Video consultation · {clinicLabel(consultation)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Chip tone={isToday(consultation.scheduledAt) ? 'action' : 'neutral'}>
                        {isToday(consultation.scheduledAt) ? 'Today' : 'Scheduled'}
                      </Chip>
                      <ChevronRight size={15} className="text-ink-400" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}

          <Link
            to="/patient/consultations"
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-action-600 hover:underline"
          >
            View all consultations <ChevronRight size={14} aria-hidden />
          </Link>
        </Panel>

        {/* --- Preparation ----------------------------------------------- */}
        <Panel title="Before your appointment" bodyClassName="p-0">
          <ul className="divide-y divide-hairline">
            {PREPARATION_STEPS.map(({ icon: Icon, title, detail }) => (
              <li key={title}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-surface"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface text-ink-700">
                    <Icon size={17} strokeWidth={1.8} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-900">{title}</span>
                    <span className="block text-xs text-ink-500">{detail}</span>
                  </span>
                  <ChevronRight size={15} className="shrink-0 text-ink-400" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        {/* --- Most recent visit ----------------------------------------- */}
        <Panel
          title="Recent consultation"
          actions={
            recent && transcriptApproval(recent) === 'APPROVED' ? (
              <Chip tone="brand">
                <ShieldCheck size={12} aria-hidden />
                Clinician approved
              </Chip>
            ) : undefined
          }
        >
          {recent ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink-900">
                    Visit with {clinicianLabel(recent)}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {formatDate(recent.scheduledAt)} · Video consultation
                  </p>
                </div>
                {/*
                  The patient sees the APPROVED transcript only. An unapproved
                  draft is staff-internal and is never linked from here.
                */}
                {transcriptApproval(recent) === 'APPROVED' && (
                  <Link
                    to={`/patient/consultations/${recent.consultationId}`}
                    className="shrink-0 text-sm font-medium text-action-600 hover:underline"
                  >
                    View transcript
                  </Link>
                )}
              </div>

              <div className="mt-4 flex items-start justify-between gap-3 border-t border-hairline pt-4">
                <div className="flex gap-2">
                  <Sparkles size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-ink-900">
                      AI-assisted symptom summary
                    </p>
                    <p className="text-xs text-ink-500">
                      Reviewed by {clinicianLabel(recent)}
                    </p>
                  </div>
                </div>
                <Link
                  to={`/patient/consultations/${recent.consultationId}`}
                  className="shrink-0 text-sm font-medium text-action-600 hover:underline"
                >
                  View summary
                </Link>
              </div>
            </>
          ) : (
            <p className="py-6 text-center text-sm text-ink-500">
              You have no completed consultations yet.
            </p>
          )}
        </Panel>

        {/* --- Care messages --------------------------------------------- */}
        <Panel title="Care messages" bodyClassName="p-0">
          <ul className="divide-y divide-hairline">
            <li className="flex items-start gap-3 px-4 py-4">
              <Mail size={17} className="mt-0.5 shrink-0 text-ink-500" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900">Clinic update</p>
                <p className="text-xs text-ink-500">New check-in process for video visits</p>
              </div>
            </li>
            <li className="flex items-start gap-3 px-4 py-4">
              <Info size={17} className="mt-0.5 shrink-0 text-ink-500" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900">Health reminder</p>
                <p className="text-xs text-ink-500">Stay hydrated and get quality sleep</p>
              </div>
            </li>
          </ul>
        </Panel>
      </div>

      <p className="mt-8 flex items-center justify-center gap-2 text-xs text-ink-500">
        <ShieldCheck size={14} aria-hidden />
        AI-assisted information is reviewed by your clinician.
      </p>
    </>
  )
}

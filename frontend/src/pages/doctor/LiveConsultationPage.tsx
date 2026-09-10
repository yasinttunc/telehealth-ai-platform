/*
 * Live video consultation (master design, screen 05).
 *
 * The only dark surface in the product: during a call the room is the work, so
 * the chrome recedes and the video stage takes the full viewport. It renders
 * outside AppShell for that reason.
 *
 * The rule the whole phase depends on is stated on screen and enforced in code:
 * live captions are TRANSIENT. They are held in component state only, never
 * written anywhere, and they disappear when the call ends. The durable record
 * is produced by the transcription worker through Spring after the call.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronsRight,
  CircleHelp,
  Info,
  Lock,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Settings,
  SignalHigh,
  Video,
  VideoOff,
} from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../auth/useAuth'
import { BrandMark } from '../../components/AppShell'
import { errorMessage, isFeatureUnavailable } from '../../api/featureAvailability'
import { initialsOf } from '../../lib/initials'
import {
  joinRoom,
  type RoomCaption,
  type RoomSession,
} from '../../lib/realtime/roomClient'
import {
  clinicianName as resolveClinicianName,
  patientName as resolvePatientName,
} from '../../lib/lookups'
import type { Consultation, Doctor, Patient } from '../../types/domain'

/** How long to wait before telling staff that no captions are arriving. */
const CAPTION_SILENCE_MS = 15_000

/** Keep the panel a live view rather than a growing transcript. */
const VISIBLE_CAPTIONS = 12

type ConnectionState = 'idle' | 'connecting' | 'connected'

interface CaptionLine extends RoomCaption {
  id: number
  /** Wall-clock label only. Ordering authority stays with the backend. */
  clock: string
}

export function LiveConsultationPage() {
  const { id } = useParams()
  const consultationId = Number(id)
  const { user } = useAuth()
  const navigate = useNavigate()

  const [consultation, setConsultation] = useState<Consultation | null>(null)
  const [patients, setPatients] = useState<Patient[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [state, setState] = useState<ConnectionState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const [remoteCount, setRemoteCount] = useState(0)
  const [captions, setCaptions] = useState<CaptionLine[]>([])
  const [interim, setInterim] = useState('')
  const [captionsSilent, setCaptionsSilent] = useState(false)
  const [lastCaptionAt, setLastCaptionAt] = useState<number | null>(null)
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [captionsShown, setCaptionsShown] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)
  const [tab, setTab] = useState<'captions' | 'notes' | 'details'>('captions')
  const [elapsed, setElapsed] = useState(0)

  const sessionRef = useRef<RoomSession | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const captionIdRef = useRef(0)

  /* --- Load the consultation this room belongs to ------------------- */
  useEffect(() => {
    if (!Number.isFinite(consultationId) || !user) return
    let active = true
    Promise.all([
      api.consultations.get(consultationId),
      user.role === 'DOCTOR' ? api.patients.list() : Promise.resolve([]),
      api.doctors.list(),
    ])
      .then(([record, patientRows, doctorRows]) => {
        if (!active) return
        setConsultation(record)
        setPatients(patientRows)
        setDoctors(doctorRows)
      })
      .catch(() => {
        if (active) setError('Could not load this consultation.')
      })
    return () => {
      active = false
    }
  }, [consultationId, user])

  /* Patients can enter the waiting room before the clinician starts the call. */
  useEffect(() => {
    if (user?.role !== 'PATIENT' || consultation?.status !== 'SCHEDULED') return

    let active = true
    const timer = window.setInterval(() => {
      void api.consultations
        .get(consultationId)
        .then((record) => {
          if (active) setConsultation(record)
        })
        .catch(() => undefined)
    }, 3_000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [consultation?.status, consultationId, user?.role])

  /* --- Call timer --------------------------------------------------- */
  useEffect(() => {
    if (state !== 'connected') return
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [state])

  /* --- A silent worker must be visible, never mistaken for silence --- */
  useEffect(() => {
    if (state !== 'connected') return
    const since = lastCaptionAt ?? Date.now()
    const timer = window.setTimeout(
      () => setCaptionsSilent(true),
      Math.max(0, CAPTION_SILENCE_MS - (Date.now() - since)),
    )
    return () => window.clearTimeout(timer)
  }, [state, lastCaptionAt])

  /* --- Always release camera and microphone on unmount -------------- */
  useEffect(
    () => () => {
      void sessionRef.current?.disconnect().catch(() => undefined)
      sessionRef.current = null
    },
    [],
  )

  const handleCaption = useCallback((caption: RoomCaption) => {
    setLastCaptionAt(caption.receivedAt)
    setCaptionsSilent(false)

    if (!caption.final) {
      setInterim(caption.text)
      return
    }

    setInterim('')
    captionIdRef.current += 1
    setCaptions((previous) =>
      [
        ...previous,
        {
          ...caption,
          id: captionIdRef.current,
          clock: new Date(caption.receivedAt).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          }),
        },
      ].slice(-VISIBLE_CAPTIONS),
    )
  }, [])

  async function join() {
    setError(null)
    setUnavailable(null)
    setState('connecting')
    try {
      let current = consultation
      if (!current) {
        current = await api.consultations.get(consultationId)
      }

      /* Starting the room is the Doctor's explicit SCHEDULED -> IN_PROGRESS action. */
      if (user?.role === 'DOCTOR' && current.status === 'SCHEDULED') {
        try {
          current = await api.consultations.updateStatus(consultationId, {
            status: 'IN_PROGRESS',
          })
        } catch (caught) {
          // A second Doctor tab may have started it first. Re-read before failing.
          const refreshed = await api.consultations.get(consultationId)
          if (refreshed.status !== 'IN_PROGRESS') throw caught
          current = refreshed
        }
        setConsultation(current)
      }

      if (current.status !== 'IN_PROGRESS') {
        setState('idle')
        setError(
          current.status === 'SCHEDULED'
            ? 'The clinician has not started this consultation yet.'
            : 'This consultation is no longer available to join.',
        )
        return
      }

      const credentials = await api.consultations.livekitToken(consultationId)

      sessionRef.current = await joinRoom({
        serverUrl: credentials.serverUrl,
        token: credentials.token,
        localVideoElement: localVideoRef.current,
        remoteVideoElement: remoteVideoRef.current,
        publishMedia: true,
        onCaption: handleCaption,
        onRemoteCountChange: setRemoteCount,
        onDisconnected: () => {
          sessionRef.current = null
          setState('idle')
        },
      })
      setMicEnabled(true)
      setCameraEnabled(true)
      setState('connected')
    } catch (caught) {
      setState('idle')
      if (isFeatureUnavailable(caught)) {
        setUnavailable('The consultation room endpoint is not deployed on this backend yet.')
        return
      }
      setError(errorMessage(caught, 'Could not join the consultation room.'))
    }
  }

  async function leave() {
    const session = sessionRef.current
    sessionRef.current = null
    setState('idle')
    setRemoteCount(0)
    // Captions are discarded on leave. This is the transient guarantee.
    setCaptions([])
    setInterim('')
    await session?.disconnect().catch(() => undefined)
    navigate(`/${user?.role === 'PATIENT' ? 'patient' : 'doctor'}/consultations/${consultationId}`)
  }

  async function toggleMicrophone() {
    const next = !micEnabled
    setMicEnabled(next)
    await sessionRef.current?.setMicrophoneEnabled(next).catch(() => undefined)
  }

  async function toggleCamera() {
    const next = !cameraEnabled
    setCameraEnabled(next)
    await sessionRef.current?.setCameraEnabled(next).catch(() => undefined)
  }

  const patientLabel = consultation
    ? (consultation.patientName ?? resolvePatientName(patients, consultation.patientId))
    : 'Patient'
  const clinicianLabel = consultation
    ? resolveClinicianName(doctors, consultation.clinicianId)
    : 'Clinician'
  const remoteName = user?.role === 'PATIENT' ? clinicianLabel : patientLabel
  const localName = user?.role === 'PATIENT' ? patientLabel : clinicianLabel
  const detailsPath = `/${user?.role === 'PATIENT' ? 'patient' : 'doctor'}/consultations/${consultationId}`
  const consultationStatus = consultation?.status
  const patientIsWaiting = user?.role === 'PATIENT' && consultationStatus === 'SCHEDULED'
  const canStartOrJoin =
    consultationStatus === 'IN_PROGRESS' ||
    (user?.role === 'DOCTOR' && consultationStatus === 'SCHEDULED')
  const joinLabel =
    state === 'connecting'
      ? 'Joining…'
      : user?.role === 'DOCTOR' && consultationStatus === 'SCHEDULED'
        ? 'Start consultation'
        : patientIsWaiting
          ? 'Waiting for clinician'
          : consultationStatus === 'COMPLETED' || consultationStatus === 'CANCELLED'
            ? 'Consultation ended'
            : 'Join call'

  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* --- Call bar -------------------------------------------------- */}
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-hairline px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="hidden text-base font-semibold tracking-tight text-brand-700 sm:inline">
            Telehealth With AI
          </span>
        </div>
        <span className="h-5 w-px bg-hairline" aria-hidden />
        <span className="text-sm font-medium text-ink-900">
          {patientIsWaiting ? 'Waiting room' : 'Video consultation'}
        </span>

        <div className="mx-auto flex items-center gap-6 text-sm">
          <span className="flex items-center gap-1.5 text-ink-700">
            <Lock size={14} className="text-brand-600" aria-hidden />
            Encrypted
          </span>
          <span className="flex items-center gap-1.5 text-ink-700 tabular">
            <span className="text-ink-400" aria-hidden>
              ◷
            </span>
            {clock}
          </span>
          <span className="flex items-center gap-1.5 text-ink-700">
            <SignalHigh size={14} className="text-brand-600" aria-hidden />
            {state === 'connected' ? 'Excellent' : 'Not connected'}
          </span>
        </div>

        {state !== 'connected' && (
          <Link
            to={detailsPath}
            className="flex h-9 items-center gap-1.5 rounded-md px-2 text-sm text-ink-600 hover:bg-surface"
          >
            <ArrowLeft size={16} aria-hidden />
            Back
          </Link>
        )}
        <button
          type="button"
          aria-label="Help"
          className="grid h-9 w-9 place-items-center rounded-md text-ink-500 hover:bg-surface"
        >
          <CircleHelp size={18} />
        </button>
        <button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          className="flex h-9 items-center gap-1.5 rounded-md border border-hairline px-3 text-sm text-ink-700 hover:bg-surface"
        >
          {panelOpen ? 'Hide panel' : 'Show panel'}
          <ChevronsRight size={15} aria-hidden />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 gap-4 p-4">
        {/* --- Video stage -------------------------------------------- */}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-lg bg-stage-900">
          {/* Remote participant fills the stage. */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`h-full w-full object-cover ${remoteCount > 0 ? '' : 'hidden'}`}
          />
          {remoteCount === 0 && (
            <div className="grid h-full place-items-center">
              <div className="text-center">
                <span className="mx-auto grid h-40 w-40 place-items-center rounded-full bg-teal-600 text-6xl font-semibold text-white">
                  {initialsOf(remoteName)}
                </span>
                <p className="mt-6 text-2xl font-semibold text-white">{remoteName}</p>
                <p className="mt-3 text-sm text-white/60">
                  {state === 'connected'
                    ? 'Waiting for their camera…'
                    : patientIsWaiting
                      ? 'Waiting for the clinician to start…'
                      : 'Not connected'}
                </p>
              </div>
            </div>
          )}

          {/* Local self-view. */}
          <div className="absolute right-5 top-5 h-40 w-64 overflow-hidden rounded-lg bg-stage-800 ring-1 ring-white/10">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={`h-full w-full object-cover ${cameraEnabled && state === 'connected' ? '' : 'hidden'}`}
            />
            {(!cameraEnabled || state !== 'connected') && (
              <div className="grid h-full place-items-center">
                <div className="text-center">
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-teal-600 text-xl font-semibold text-white">
                    {initialsOf(localName)}
                  </span>
                  <p className="mt-2 text-sm font-medium text-white">{localName}</p>
                  <p className="mt-1 flex items-center justify-center gap-1 text-xs text-white/60">
                    <VideoOff size={12} aria-hidden /> Camera off
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Call controls. Leave is the only red control on the surface. */}
          <div className="absolute inset-x-0 bottom-6 flex justify-center px-4">
            <div className="flex items-center gap-1 rounded-lg bg-white px-3 py-2 shadow-lg">
              <StageControl
                label="Mic"
                active={micEnabled}
                onClick={toggleMicrophone}
                disabled={state !== 'connected'}
                icon={micEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              />
              <StageControl
                label="Camera"
                active={cameraEnabled}
                onClick={toggleCamera}
                disabled={state !== 'connected'}
                icon={cameraEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              />
              <StageControl
                label="Captions"
                active={captionsShown}
                highlight
                onClick={() => setCaptionsShown((shown) => !shown)}
                icon={<span className="text-sm font-bold">CC</span>}
              />
              <StageControl label="Share screen" icon={<MonitorUp size={20} />} disabled />
              <StageControl label="Devices" icon={<Settings size={20} />} disabled />

              <span className="mx-1 h-8 w-px bg-hairline" aria-hidden />

              {state === 'connected' ? (
                <StageControl
                  label="Leave"
                  danger
                  onClick={leave}
                  icon={<PhoneOff size={20} />}
                />
              ) : (
                <button
                  type="button"
                  onClick={join}
                  disabled={state === 'connecting' || !canStartOrJoin}
                  className="h-11 rounded-md bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {joinLabel}
                </button>
              )}
            </div>
          </div>

          {(error || unavailable) && (
            <p className="absolute inset-x-6 top-6 rounded-md bg-white/95 px-3 py-2 text-sm text-danger-700">
              {error ?? unavailable}
            </p>
          )}
        </div>

        {/* --- Side panel --------------------------------------------- */}
        {panelOpen && (
          <aside className="flex w-full max-w-sm shrink-0 flex-col overflow-hidden rounded-lg border border-hairline bg-white">
            <div className="flex items-center gap-5 border-b border-hairline px-4">
              {([
                ['captions', 'Live captions'],
                ...(user?.role === 'DOCTOR' ? ([['notes', 'Visit notes']] as const) : []),
                ['details', 'Details'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={`relative py-3.5 text-sm transition-colors ${
                    tab === value
                      ? 'font-semibold text-action-700 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-action-600'
                      : 'text-ink-500 hover:text-ink-800'
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Collapse panel"
                className="ml-auto grid h-8 w-8 place-items-center rounded-md text-ink-400 hover:bg-surface"
              >
                <ChevronsRight size={16} />
              </button>
            </div>

            {tab === 'captions' && (
              <>
                {/*
                  The transient guarantee, stated to the clinician in the
                  surface where the temptation to rely on it is highest.
                */}
                <div className="m-4 flex gap-2 rounded-md border border-action-100 bg-action-50 p-3">
                  <Info size={16} className="mt-0.5 shrink-0 text-action-600" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-ink-900">
                      Live captions are temporary
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      They are not saved and will disappear when the call ends.
                    </p>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto px-4">
                  {!captionsShown ? (
                    <p className="py-10 text-center text-sm text-ink-500">
                      Captions are hidden.
                    </p>
                  ) : captions.length === 0 && !interim ? (
                    <p className="py-10 text-center text-sm text-ink-500">
                      {state === 'connected'
                        ? captionsSilent
                          ? 'No captions received. The transcription worker may not be running.'
                          : 'Listening…'
                        : 'Join the call to see live captions.'}
                    </p>
                  ) : (
                    <ul className="divide-y divide-hairline">
                      {captions.map((caption) => (
                        <li key={caption.id} className="py-3">
                          <div className="flex items-baseline gap-3">
                            <span className="w-12 shrink-0 text-xs text-ink-500 tabular">
                              {caption.clock}
                            </span>
                            <span className="text-xs font-semibold uppercase tracking-wide text-action-700">
                              Speaker
                            </span>
                          </div>
                          <p className="mt-1 pl-15 text-sm leading-6 text-ink-900">
                            {caption.text}
                          </p>
                        </li>
                      ))}
                      {interim && (
                        // Interim text is visually lighter and italic: it is a
                        // hypothesis that may still change.
                        <li className="py-3 pl-15 text-sm italic leading-6 text-ink-400">
                          {interim}
                        </li>
                      )}
                    </ul>
                  )}
                </div>

                <footer className="border-t border-hairline px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm text-ink-700">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          state === 'connected' && !captionsSilent
                            ? 'bg-brand-600'
                            : 'bg-ink-400'
                        }`}
                        aria-hidden
                      />
                      {state === 'connected'
                        ? captionsSilent
                          ? 'No captions received'
                          : 'Deepgram connected'
                        : 'Transcription idle'}
                    </span>
                    <span className="text-xs text-ink-500">CA EN</span>
                  </div>
                  <p className="mt-3 text-xs text-ink-500">
                    Final transcript will be available for clinician review after the call.
                  </p>
                </footer>
              </>
            )}

            {tab === 'notes' && (
              <div className="flex-1 p-4">
                <label htmlFor="visit-notes" className="mb-1.5 block text-xs font-medium text-ink-700">
                  Private working notes
                </label>
                <textarea
                  id="visit-notes"
                  rows={12}
                  placeholder="Notes typed here are not part of the transcript."
                  className="w-full rounded-md border border-hairline p-3 text-sm leading-6 outline-none focus:border-action-500"
                />
                <p className="mt-2 text-xs text-ink-500">
                  Notes are separate from the canonical transcript and are not sent for AI
                  extraction.
                </p>
              </div>
            )}

            {tab === 'details' && consultation && (
              <div className="flex-1 p-4">
                <dl className="divide-y divide-hairline text-sm">
                  <div className="flex justify-between py-2">
                    <dt className="text-ink-500">Consultation</dt>
                    <dd className="text-ink-900">#{consultation.consultationId}</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-ink-500">Other participant</dt>
                    <dd className="text-ink-900">{remoteName}</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-ink-500">Status</dt>
                    <dd className="text-ink-900">{consultation.status}</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-ink-500">Transcription</dt>
                    <dd className="text-ink-900">
                      {consultation.transcriptionStatus ?? 'Not reported'}
                    </dd>
                  </div>
                </dl>
                <Link
                  to={detailsPath}
                  className="mt-4 inline-block text-sm font-medium text-action-600 hover:underline"
                >
                  {user?.role === 'DOCTOR' ? 'Open clinical review' : 'Back to consultation details'}
                </Link>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}

/** One control in the floating call bar. */
function StageControl({
  label,
  icon,
  onClick,
  active = true,
  highlight = false,
  danger = false,
  disabled = false,
}: {
  label: string
  icon: React.ReactNode
  onClick?: () => void
  active?: boolean
  highlight?: boolean
  danger?: boolean
  disabled?: boolean
}) {
  const tone = danger
    ? 'text-danger-600 hover:bg-danger-50'
    : highlight && active
      ? 'text-action-600 hover:bg-action-50'
      : active
        ? 'text-ink-700 hover:bg-surface'
        : 'text-ink-400 hover:bg-surface'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex w-20 flex-col items-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40 ${tone}`}
    >
      <span className="grid h-6 place-items-center">{icon}</span>
      {label}
    </button>
  )
}

/*
 * One consultation list reused across roles and filtered by role:
 *   - ADMIN: all consultations, can create.
 *   - DOCTOR: only consultations assigned to them, can create.
 *   - PATIENT: only their own consultations, read-only.
 * Ownership filtering is applied when calling the API, so a patient never
 * receives another patient's rows.
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Plus } from 'lucide-react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth/useAuth'
import { DataTable, type Column } from '../components/DataTable'
import { Drawer } from '../components/Drawer'
import { EmptyState } from '../components/EmptyState'
import { FormField } from '../components/FormField'
import { inputClass, selectClass } from '../components/formStyles'
import { StatusBadge } from '../components/StatusBadge'
import { SuccessMessage } from '../components/SuccessMessage'
import { PageHeader, PrimaryButton, IconButton, LoadingRow, ErrorRow } from '../components/ui'
import { formatDateTime, fromInputDateTime, toInputDateTime } from '../lib/format'
import { clinicName, clinicianName, patientName } from '../lib/lookups'
import { consultationsBase } from '../lib/paths'
import type {
  Clinic,
  Consultation,
  Doctor,
  Patient,
} from '../types/domain'
import type { CreateConsultationRequest } from '../api/types'

interface ConsultForm {
  patientId: string
  clinicianId: string
  clinicId: string
  scheduledAt: string
}

export function ConsultationsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const canManage = user?.role === 'ADMIN' || user?.role === 'DOCTOR'
  const base = user ? consultationsBase(user.role) : '/login'

  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form, setForm] = useState<ConsultForm | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function load() {
    if (!user) return
    setLoading(true)
    try {
      const [cons, pts, docs, clns] = await Promise.all([
        user.role === 'ADMIN' ? api.consultations.list() : api.consultations.mine(),
        user.role === 'PATIENT' ? Promise.resolve([]) : api.patients.list(),
        api.doctors.list(),
        api.clinics.list(),
      ])
      setConsultations(cons)
      setPatients(pts)
      setDoctors(docs)
      setClinics(clns)
      setError(null)
    } catch {
      setError('Could not load consultations.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  /** Clinician options are AppUser IDs; doctors link via appUserId. */
  const clinicianOptions = useMemo(
    () => doctors.filter((d) => d.appUserId != null),
    [doctors],
  )
  const selectedDoctor = clinicianOptions.find(
    (doctor) => String(doctor.appUserId) === form?.clinicianId,
  )
  const suggestedSlots = (selectedDoctor?.availableTimes ?? [])
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()) && date.getTime() > Date.now())
    .sort((left, right) => left.getTime() - right.getTime())
    .slice(0, 5)

  function chooseSuggestedSlot(date: Date) {
    if (!form) return
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16)
    setForm({ ...form, scheduledAt: local })
  }

  function openCreate() {
    setForm({
      patientId: '',
      clinicianId: user?.role === 'DOCTOR' ? String(user.userId) : '',
      clinicId: '',
      scheduledAt: '',
    })
    setFieldErrors({})
    setError(null)
    setSuccess(null)
    setDrawerOpen(true)
  }

  function validate(f: ConsultForm): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!f.patientId) errs.patientId = 'Select a patient'
    if (!f.clinicianId) errs.clinicianId = 'Select a clinician'
    if (!f.clinicId) errs.clinicId = 'Select a clinic'
    if (!f.scheduledAt) errs.scheduledAt = 'Choose a date and time'
    else if (Number.isNaN(new Date(f.scheduledAt).getTime()) || new Date(f.scheduledAt).getTime() <= Date.now()) {
      errs.scheduledAt = 'Choose a time in the future'
    }
    return errs
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    const errs = validate(form)
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return

    const payload: CreateConsultationRequest = {
      patientId: Number(form.patientId),
      clinicianId: Number(form.clinicianId),
      clinicId: Number(form.clinicId),
      scheduledAt: fromInputDateTime(form.scheduledAt),
    }
    setSaving(true)
    setError(null)
    try {
      const created = await api.consultations.create(payload)
      setConsultations((previous) => [created, ...previous])
      setDrawerOpen(false)
      setSuccess('Consultation scheduled.')
    } catch (caught) {
      if (caught instanceof ApiError && caught.fieldErrors) setFieldErrors(caught.fieldErrors)
      else setError(caught instanceof ApiError ? caught.message : 'Could not create consultation.')
    } finally {
      setSaving(false)
    }
  }

  function clinicianLabel(consultation: Consultation) {
    const doctor = doctors.find((item) => item.appUserId === consultation.clinicianId)
    return doctor
      ? `Dr ${doctor.firstName} ${doctor.lastName}`
      : consultation.clinicianUsername
        ? `Dr ${consultation.clinicianUsername}`
        : clinicianName(doctors, consultation.clinicianId)
  }

  const columns: Column<Consultation>[] = [
    { header: 'Patient', cell: (c) => c.patientName ?? patientName(patients, c.patientId) },
    { header: 'Clinician', cell: clinicianLabel },
    { header: 'Clinic', cell: (c) => <span className="text-ink-500">{c.clinicName ?? clinicName(clinics, c.clinicId)}</span> },
    { header: 'Scheduled', cell: (c) => formatDateTime(c.scheduledAt) },
    { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
  ]

  // Patients see their clinician first (their own name is redundant).
  const patientColumns = columns.filter((c) => c.header !== 'Patient')
  const upcoming = consultations.filter((consultation) =>
    consultation.status === 'IN_PROGRESS' ||
    (consultation.status === 'SCHEDULED' && new Date(consultation.scheduledAt).getTime() >= Date.now()),
  )
  const history = consultations.filter((consultation) => !upcoming.includes(consultation))

  function renderTable(rows: Consultation[], emptyTitle: string, emptyMessage: string) {
    return rows.length === 0 ? (
      <EmptyState title={emptyTitle} message={emptyMessage} />
    ) : (
      <DataTable
        columns={user?.role === 'PATIENT' ? patientColumns : columns}
        rows={rows}
        rowKey={(consultation) => consultation.consultationId}
        actions={(consultation) => (
          <IconButton label="Open consultation" onClick={() => navigate(`${base}/${consultation.consultationId}`)}>
            <Eye size={16} />
          </IconButton>
        )}
      />
    )
  }

  return (
    <div>
      <PageHeader
        title={user?.role === 'PATIENT' ? 'My consultations' : 'Consultations'}
        description={user?.role === 'DOCTOR' ? 'Consultations assigned to you' : undefined}
        actions={
          canManage ? (
            <PrimaryButton type="button" onClick={openCreate}>
              <Plus size={16} aria-hidden />
              New consultation
            </PrimaryButton>
          ) : undefined
        }
      />

      {success && <SuccessMessage message={success} />}
      {error && <div className="mb-3"><ErrorRow message={error} /></div>}

      {loading ? (
        <LoadingRow />
      ) : (
        <div className="space-y-8">
          <section>
            <h3 className="mb-3 text-base font-semibold text-ink-900">Upcoming</h3>
            {renderTable(upcoming, 'No upcoming consultations', canManage ? 'Schedule a future consultation to get started.' : 'You have no upcoming consultations.')}
          </section>
          <section>
            <h3 className="mb-3 text-base font-semibold text-ink-900">History</h3>
            {renderTable(history, 'No consultation history', 'Completed, cancelled, and past scheduled consultations appear here.')}
          </section>
        </div>
      )}

      {form && (
        <Drawer open={drawerOpen} title="New consultation" onClose={() => setDrawerOpen(false)}>
          <form onSubmit={handleSubmit} noValidate>
            <FormField id="c-patient" label="Patient" required error={fieldErrors.patientId}>
              <select
                id="c-patient"
                className={selectClass}
                value={form.patientId}
                onChange={(e) => setForm({ ...form, patientId: e.target.value })}
              >
                <option value="">Select…</option>
                {patients.map((p) => (
                  <option key={p.patientId} value={p.patientId}>
                    {p.firstName} {p.lastName}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField id="c-clinician" label="Clinician" required error={fieldErrors.clinicianId}>
              <select
                id="c-clinician"
                className={selectClass}
                value={form.clinicianId}
                onChange={(e) => setForm({ ...form, clinicianId: e.target.value })}
                disabled={user?.role === 'DOCTOR'}
              >
                <option value="">Select…</option>
                {clinicianOptions.map((d) => (
                  <option key={d.doctorId} value={d.appUserId}>
                    Dr {d.firstName} {d.lastName}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField id="c-clinic" label="Clinic" required error={fieldErrors.clinicId}>
              <select
                id="c-clinic"
                className={selectClass}
                value={form.clinicId}
                onChange={(e) => setForm({ ...form, clinicId: e.target.value })}
              >
                <option value="">Select…</option>
                {clinics.map((c) => (
                  <option key={c.clinicId} value={c.clinicId}>
                    {c.clinicName}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField id="c-time" label="Scheduled time" required error={fieldErrors.scheduledAt}>
              <input
                id="c-time"
                type="datetime-local"
                className={inputClass}
                value={form.scheduledAt}
                min={toInputDateTime(new Date().toISOString())}
                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
              />
            </FormField>

            {selectedDoctor && (
              <div className="mb-4">
                <p className="mb-2 text-sm text-ink-700">
                  Suggested availability for Dr {selectedDoctor.firstName} {selectedDoctor.lastName}
                </p>
                {suggestedSlots.length === 0 ? (
                  <p className="text-xs text-ink-400">No future suggested slots are available.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {suggestedSlots.map((slot) => (
                      <button
                        key={slot.toISOString()}
                        type="button"
                        onClick={() => chooseSuggestedSlot(slot)}
                        className="rounded-md border border-hairline px-2 py-1 text-xs text-ink-700 hover:border-action-500"
                      >
                        {formatDateTime(slot.toISOString())}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="h-10 rounded-md border border-hairline px-4 text-sm text-ink-700 hover:bg-surface"
              >
                Cancel
              </button>
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Create'}
              </PrimaryButton>
            </div>
          </form>
        </Drawer>
      )}
    </div>
  )
}

/*
 * Doctor dashboard: today/upcoming consultations, a patient search
 * shortcut, and two open alerts. The primary action is "Open consultation",
 * not decorative statistics.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../auth/useAuth'
import { PageHeader, Panel, LoadingRow, SecondaryButton } from '../../components/ui'
import { StatusBadge } from '../../components/StatusBadge'
import { formatDateTime } from '../../lib/format'
import { clinicName, patientName } from '../../lib/lookups'
import type { Alert, Clinic, Consultation, Patient } from '../../types/domain'

export function DoctorDashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])

  useEffect(() => {
    if (!user) return
    let active = true
    Promise.all([
      api.consultations.mine(),
      api.patients.list(),
      api.clinics.list(),
      api.alerts.list(),
    ]).then(([cons, pts, clns, alrts]) => {
      if (!active) return
      setConsultations(cons)
      setPatients(pts)
      setClinics(clns)
      setAlerts(alrts)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [user])

  if (loading) return <LoadingRow />

  const now = Date.now()
  const upcoming = consultations
    .filter((c) => c.status === 'SCHEDULED' || c.status === 'IN_PROGRESS')
    .filter((c) => c.status === 'IN_PROGRESS' || new Date(c.scheduledAt).getTime() >= now - 12 * 3600 * 1000)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
  const openAlerts = alerts.filter((a) => a.status === 'OPEN' || a.status === 'ACKNOWLEDGED').slice(0, 2)

  return (
    <div>
      <PageHeader
        title="Doctor dashboard"
        description="Your upcoming consultations"
        actions={
          <Link to="/doctor/patients">
            <SecondaryButton type="button">
              <Search size={16} aria-hidden />
              Find a patient
            </SecondaryButton>
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Today &amp; upcoming" className="lg:col-span-2">
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-500">No upcoming consultations.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {upcoming.map((c) => (
                <li key={c.consultationId} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {patientName(patients, c.patientId)}
                    </p>
                    <p className="text-xs text-ink-500">
                      {formatDateTime(c.scheduledAt)} · {clinicName(clinics, c.clinicId)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={c.status} />
                    <Link
                      to={`/doctor/consultations/${c.consultationId}`}
                      className="text-sm font-medium text-brand-700 hover:underline"
                    >
                      Open
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Open alerts">
          {openAlerts.length === 0 ? (
            <p className="text-sm text-ink-500">No open alerts.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {openAlerts.map((a) => (
                <li key={a.alertId} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink-700">{a.symptomName}</span>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
          <Link to="/doctor/alerts" className="mt-3 inline-block text-sm text-brand-700 hover:underline">
            View all alerts →
          </Link>
        </Panel>
      </div>
    </div>
  )
}

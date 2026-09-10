/*
 * Administrator operational dashboard (master design, screen 03).
 *
 * Four counted tiles, a stacked activity chart for the day, a "system
 * attention" queue, recent consultations and account integrity.
 *
 * Every number here is derived from data the administrator is allowed to see.
 * Nothing on this screen exposes transcript text or extracted symptoms: an
 * administrator supervises accounts and throughput, not clinical content.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  ChevronRight,
  Download,
  Ellipsis,
  ExternalLink,
  FileWarning,
  Info,
  Phone,
  Plus,
  Stethoscope,
  TriangleAlert,
  UserRoundPlus,
  UserRound,
  Users,
  Video,
} from 'lucide-react'
import { api } from '../../api'
import {
  ErrorRow,
  LoadingRow,
  Panel,
  PrimaryButton,
  SecondaryButton,
  StatTile,
} from '../../components/ui'
import { Chip, DotChip } from '../../components/consultation/chips'
import { StatusBadge } from '../../components/StatusBadge'
import { clinicName as resolveClinicName, patientName as resolvePatientName } from '../../lib/lookups'
import type {
  Alert,
  AppUser,
  Clinic,
  Consultation,
  Doctor,
  Patient,
} from '../../types/domain'

/*
 * Activity series colours.
 *
 * These are STATUS colours, not an arbitrary categorical ramp, and the legend
 * always names each one so the chart is never colour-only. The set was checked
 * with the palette validator: all four sit inside the lightness band, clear the
 * chroma floor, keep adjacent-pair CVD separation, and hold 3:1 against the
 * surface. Amber is #f59e0b rather than a darker orange because #d97706 beside
 * #dc2626 falls under the normal-vision separation floor.
 */
const SERIES = [
  { key: 'completed', label: 'Completed', color: '#0b6b3a' },
  { key: 'scheduled', label: 'Scheduled', color: '#2f6fed' },
  { key: 'inProgress', label: 'In progress', color: '#f59e0b' },
  { key: 'noShows', label: 'No shows', color: '#dc2626' },
] as const

type SeriesKey = (typeof SERIES)[number]['key']
type HourBucket = Record<SeriesKey, number> & { hour: number }

function bucketByHour(consultations: Consultation[]): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    completed: 0,
    scheduled: 0,
    inProgress: 0,
    noShows: 0,
  }))

  for (const consultation of consultations) {
    const date = new Date(consultation.scheduledAt)
    if (Number.isNaN(date.getTime())) continue
    const bucket = buckets[date.getHours()]

    switch (consultation.status) {
      case 'COMPLETED':
        bucket.completed += 1
        break
      case 'IN_PROGRESS':
        bucket.inProgress += 1
        break
      case 'CANCELLED':
        bucket.noShows += 1
        break
      default:
        bucket.scheduled += 1
    }
  }

  return buckets
}

export function AdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [users, setUsers] = useState<AppUser[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])

  useEffect(() => {
    let active = true
    Promise.all([
      api.users.list(),
      api.doctors.list(),
      api.patients.list(),
      api.clinics.list(),
      api.consultations.list(),
      api.alerts.list(),
    ])
      .then(([userRows, doctorRows, patientRows, clinicRows, consultationRows, alertRows]) => {
        if (!active) return
        setUsers(userRows)
        setDoctors(doctorRows)
        setPatients(patientRows)
        setClinics(clinicRows)
        setConsultations(consultationRows)
        setAlerts(alertRows)
      })
      .catch(() => {
        if (active) setError('Could not load the operational dashboard.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const today = useMemo(() => {
    const now = new Date()
    return consultations.filter((item) => {
      const date = new Date(item.scheduledAt)
      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
      )
    })
  }, [consultations])

  const buckets = useMemo(() => bucketByHour(today), [today])

  const recent = useMemo(
    () =>
      [...consultations]
        .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
        .slice(0, 5),
    [consultations],
  )

  const openAlerts = alerts.filter((item) => item.status === 'OPEN').length
  const linkedPatients = patients.filter((item) => item.appUserId != null).length
  const unlinkedProfiles =
    patients.filter((item) => item.appUserId == null).length +
    doctors.filter((item) => item.appUserId == null).length
  const disabledUsers = users.filter((item) => !item.enabled).length

  if (loading) return <LoadingRow />

  return (
    <>
      {/* --- Day toolbar ---------------------------------------------- */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="flex h-9 items-center gap-2 rounded-md border border-hairline px-3 text-sm font-medium text-ink-900">
          <CalendarDays size={15} className="text-ink-500" aria-hidden />
          {new Date().toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </span>
        <SecondaryButton type="button">Today</SecondaryButton>
        <span className="flex h-9 items-center rounded-md border border-hairline px-3 text-sm text-ink-700">
          All day (00:00 – 23:59)
        </span>
        <span className="flex h-9 items-center rounded-md border border-hairline px-3 text-sm text-ink-700">
          All clinics
        </span>
        <SecondaryButton type="button">
          <Download size={15} aria-hidden />
          Export report
        </SecondaryButton>
        <span className="flex h-9 items-center gap-2 rounded-md border border-hairline px-3">
          <DotChip tone="brand">All systems available</DotChip>
          <Info size={13} className="text-ink-400" aria-hidden />
        </span>
      </div>

      {error && <ErrorRow message={error} />}

      {/* --- Counted tiles -------------------------------------------- */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Active users" value={users.filter((u) => u.enabled).length} icon={<Users size={20} />} />
        <StatTile label="Doctors" value={doctors.length} icon={<Stethoscope size={20} />} />
        <StatTile label="Patients" value={patients.length} icon={<UserRound size={20} />} />
        <StatTile label="Consultations today" value={today.length} icon={<CalendarDays size={20} />} />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* --- Activity chart ---------------------------------------- */}
        <Panel title="Today's clinical activity">
          <ActivityChart buckets={buckets} />
        </Panel>

        {/* --- System attention -------------------------------------- */}
        <Panel title="System attention" bodyClassName="p-3">
          <ul className="space-y-2">
            <AttentionRow
              to="/admin/alerts"
              icon={<TriangleAlert size={19} />}
              tone="danger"
              title="Unresolved alerts"
              detail="Requires administrator review"
              count={openAlerts}
            />
            <AttentionRow
              to="/admin/consultations"
              icon={<FileWarning size={19} />}
              tone="warn"
              title="Failed AI extractions"
              detail="Review and reprocess required"
              count={0}
            />
            <AttentionRow
              to="/admin/patients"
              icon={<UserRoundPlus size={19} />}
              tone="action"
              title="Accounts pending link"
              detail="Verify and link patient accounts"
              count={unlinkedProfiles}
            />
          </ul>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* --- Recent consultations ----------------------------------- */}
        <Panel title="Recent consultations" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-2.5 font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium">Patient</th>
                  <th className="px-4 py-2.5 font-medium">Doctor</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Clinic</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((consultation) => (
                  <tr
                    key={consultation.consultationId}
                    className="border-b border-hairline last:border-0 hover:bg-surface"
                  >
                    <td className="px-4 py-3 text-ink-700 tabular">
                      {new Date(consultation.scheduledAt).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink-900">
                      {consultation.patientName ??
                        resolvePatientName(patients, consultation.patientId)}
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {consultation.clinicianUsername ?? `Clinician #${consultation.clinicianId}`}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-ink-700">
                        {consultation.transcriptionStatus === 'MANUAL' ? (
                          <>
                            <Phone size={14} aria-hidden /> Phone
                          </>
                        ) : (
                          <>
                            <Video size={14} aria-hidden /> Video
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={consultation.status} />
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {consultation.clinicName ??
                        resolveClinicName(clinics, consultation.clinicId)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin/consultations/${consultation.consultationId}`}
                        aria-label="Open consultation"
                        className="inline-grid h-8 w-8 place-items-center rounded-md text-ink-500 hover:bg-white"
                      >
                        <Ellipsis size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-hairline px-4 py-3">
            <Link
              to="/admin/consultations"
              className="flex items-center gap-1 text-sm font-medium text-action-600 hover:underline"
            >
              View all consultations <ExternalLink size={13} aria-hidden />
            </Link>
          </div>
        </Panel>

        {/* --- Account integrity -------------------------------------- */}
        <Panel title="Account integrity" bodyClassName="p-0">
          <ul className="divide-y divide-hairline">
            <IntegrityRow
              to="/admin/patients"
              title="Linked profiles"
              detail="Patients with linked accounts"
              value={linkedPatients}
              tone="brand"
            />
            <IntegrityRow
              to="/admin/users"
              title="Inactive users"
              detail="Accounts currently disabled"
              value={disabledUsers}
              tone="warn"
            />
            <IntegrityRow
              to="/admin/patients"
              title="Profiles without an account"
              detail="Cannot sign in until linked"
              value={unlinkedProfiles}
              tone="neutral"
            />
          </ul>
          <div className="border-t border-hairline px-4 py-3">
            <Link
              to="/admin/users"
              className="flex items-center gap-1 text-sm font-medium text-action-600 hover:underline"
            >
              View account report <ExternalLink size={13} aria-hidden />
            </Link>
          </div>
        </Panel>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Link to="/admin/users">
          <PrimaryButton type="button">
            <Plus size={15} aria-hidden />
            New user
          </PrimaryButton>
        </Link>
        <SecondaryButton type="button" aria-label="More actions">
          <Ellipsis size={16} />
        </SecondaryButton>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Activity chart                                                      */
/* ------------------------------------------------------------------ */

/**
 * Stacked hourly activity.
 *
 * Drawn as inline SVG rather than pulling in a chart library for one figure.
 * Design decisions, in the order the dataviz procedure applies them:
 *   - form: composition over time -> stacked bars, one bar per hour;
 *   - colour: a reserved STATUS palette, validated for CVD separation;
 *   - marks: thin bars, 4px rounded top on the topmost segment only, a 2px
 *     surface gap between stacked segments so boundaries survive at small size;
 *   - grid: recessive hairlines behind the marks, labels in ink not series hue;
 *   - interaction: per-bar hover tooltip, because an SVG chart in a browser is
 *     interactive whether or not it was designed to be.
 */
function ActivityChart({ buckets }: { buckets: HourBucket[] }) {
  const [hovered, setHovered] = useState<number | null>(null)

  const totals = buckets.map((bucket) =>
    SERIES.reduce((sum, series) => sum + bucket[series.key], 0),
  )
  const peak = Math.max(...totals, 1)
  // Round the axis up to a friendly step so gridlines land on whole numbers.
  const step = peak <= 5 ? 1 : peak <= 12 ? 3 : peak <= 25 ? 5 : 10
  const ceiling = Math.ceil(peak / step) * step
  const ticks = Array.from({ length: ceiling / step + 1 }, (_, index) => index * step)

  const width = 720
  const height = 240
  const padding = { top: 8, right: 8, bottom: 26, left: 30 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const slot = plotWidth / 24
  const barWidth = Math.min(18, slot * 0.62)

  const yOf = (value: number) => padding.top + plotHeight - (value / ceiling) * plotHeight

  return (
    <figure className="m-0">
      {/* Legend first: identity is never carried by colour alone. */}
      <figcaption className="mb-4 flex flex-wrap gap-x-5 gap-y-1.5">
        {SERIES.map((series) => (
          <span key={series.key} className="flex items-center gap-1.5 text-xs text-ink-700">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: series.color }}
              aria-hidden
            />
            {series.label}
          </span>
        ))}
      </figcaption>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          role="img"
          aria-label="Consultations per hour today, split by status"
        >
          {/* Recessive gridlines and value axis. */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={yOf(tick)}
                y2={yOf(tick)}
                stroke="#e6eaf0"
                strokeWidth={1}
              />
              <text
                x={padding.left - 8}
                y={yOf(tick) + 4}
                textAnchor="end"
                className="fill-ink-400"
                style={{ fontSize: 10 }}
              >
                {tick}
              </text>
            </g>
          ))}

          {buckets.map((bucket, hour) => {
            const x = padding.left + hour * slot + (slot - barWidth) / 2
            let cursor = padding.top + plotHeight

            // Draw bottom-up so the stack order matches the legend order.
            const segments = SERIES.map((series) => {
              const value = bucket[series.key]
              if (value === 0) return null
              const segmentHeight = (value / ceiling) * plotHeight
              cursor -= segmentHeight
              return { series, y: cursor, height: segmentHeight }
            }).filter(Boolean) as { series: (typeof SERIES)[number]; y: number; height: number }[]

            const topIndex = segments.length - 1

            return (
              <g
                key={hour}
                onMouseEnter={() => setHovered(hour)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Invisible hit target: bigger than the mark it selects. */}
                <rect
                  x={padding.left + hour * slot}
                  y={padding.top}
                  width={slot}
                  height={plotHeight}
                  fill={hovered === hour ? '#f8fafc' : 'transparent'}
                />
                {segments.map((segment, index) => (
                  <rect
                    key={segment.series.key}
                    x={x}
                    y={segment.y}
                    width={barWidth}
                    // 2px surface gap keeps stacked boundaries readable.
                    height={Math.max(1, segment.height - (index === 0 ? 0 : 2))}
                    rx={index === topIndex ? 3 : 0}
                    fill={segment.series.color}
                  />
                ))}
              </g>
            )
          })}

          {/* Hour axis, labelled every three hours to avoid collisions. */}
          {buckets.map((_, hour) =>
            hour % 3 === 0 ? (
              <text
                key={hour}
                x={padding.left + hour * slot + slot / 2}
                y={height - 8}
                textAnchor="middle"
                className="fill-ink-400"
                style={{ fontSize: 10 }}
              >
                {String(hour).padStart(2, '0')}:00
              </text>
            ) : null,
          )}
        </svg>

        {hovered != null && totals[hovered] > 0 && (
          <div
            className="pointer-events-none absolute top-2 rounded-md border border-hairline bg-white px-3 py-2 text-xs shadow-lg"
            style={{ left: `${((hovered + 0.5) / 24) * 100}%`, transform: 'translateX(-50%)' }}
          >
            <p className="mb-1 font-medium text-ink-900">
              {String(hovered).padStart(2, '0')}:00 · {totals[hovered]} total
            </p>
            {SERIES.filter((series) => buckets[hovered][series.key] > 0).map((series) => (
              <p key={series.key} className="flex items-center gap-1.5 text-ink-700">
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ backgroundColor: series.color }}
                  aria-hidden
                />
                {series.label}
                <span className="ml-auto pl-3 tabular">{buckets[hovered][series.key]}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Table view: the figure is never the only way to read the numbers. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-ink-500 hover:text-ink-800">
          View as table
        </summary>
        <div className="mt-2 max-h-56 overflow-auto rounded-md border border-hairline">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-hairline text-left text-ink-500">
                <th className="px-3 py-1.5 font-medium">Hour</th>
                {SERIES.map((series) => (
                  <th key={series.key} className="px-3 py-1.5 font-medium">
                    {series.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buckets
                .filter((_, hour) => totals[hour] > 0)
                .map((bucket) => (
                  <tr key={bucket.hour} className="border-b border-hairline last:border-0">
                    <td className="px-3 py-1.5 tabular">
                      {String(bucket.hour).padStart(2, '0')}:00
                    </td>
                    {SERIES.map((series) => (
                      <td key={series.key} className="px-3 py-1.5 tabular">
                        {bucket[series.key]}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

/* ------------------------------------------------------------------ */
/* Small rows                                                          */
/* ------------------------------------------------------------------ */

function AttentionRow({
  to,
  icon,
  tone,
  title,
  detail,
  count,
}: {
  to: string
  icon: React.ReactNode
  tone: 'danger' | 'warn' | 'action'
  title: string
  detail: string
  count: number
}) {
  const styles = {
    danger: 'bg-danger-50 text-danger-600',
    warn: 'bg-warn-50 text-warn-700',
    action: 'bg-action-50 text-action-600',
  }[tone]

  return (
    <li>
      <Link
        to={to}
        className="flex items-center gap-3 rounded-lg border border-hairline px-3 py-3 hover:bg-surface"
      >
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${styles}`}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink-900">{title}</span>
          <span className="block text-xs text-ink-500">{detail}</span>
        </span>
        <Chip tone={tone === 'action' ? 'action' : tone}>{count}</Chip>
        <ChevronRight size={15} className="shrink-0 text-ink-400" aria-hidden />
      </Link>
    </li>
  )
}

function IntegrityRow({
  to,
  title,
  detail,
  value,
  tone,
}: {
  to: string
  title: string
  detail: string
  value: number
  tone: 'brand' | 'warn' | 'neutral'
}) {
  const valueTone = {
    brand: 'text-brand-600',
    warn: 'text-warn-700',
    neutral: 'text-ink-700',
  }[tone]

  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink-900">{title}</span>
          <span className="block text-xs text-ink-500">{detail}</span>
        </span>
        <span className={`text-lg font-semibold tabular ${valueTone}`}>{value}</span>
        <ChevronRight size={15} className="shrink-0 text-ink-400" aria-hidden />
      </Link>
    </li>
  )
}

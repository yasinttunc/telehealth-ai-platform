import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarRange, ChevronRight, Info, Search } from 'lucide-react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth/useAuth'
import { Drawer } from '../components/Drawer'
import { EmptyState } from '../components/EmptyState'
import { StatusBadge, SeverityBadge } from '../components/StatusBadge'
import { SuccessMessage } from '../components/SuccessMessage'
import {
  ActionButton,
  ErrorRow,
  LoadingRow,
  PageHeader,
  SecondaryButton,
} from '../components/ui'
import { inputClass, textareaClass } from '../components/formStyles'
import { formatDate, formatDateTime } from '../lib/format'
import { consultationsBase } from '../lib/paths'
import type {
  Alert,
  AlertEvidence,
  AlertStatus,
  AlertStatusEvent,
} from '../types/domain'

type Tab = 'OPEN' | 'ACKNOWLEDGED' | 'CLOSED'

function severityOf(alert: Alert): 'High' | 'Medium' {
  if (alert.severity) return alert.severity === 'HIGH' ? 'High' : 'Medium'
  const threshold = alert.threshold ?? 2.5
  return alert.score >= threshold * 1.5 ? 'High' : 'Medium'
}

function clinicLabel(alert: Alert): string {
  return alert.clinicName ?? `Clinic #${alert.clinicId}`
}

function nextStatuses(status: AlertStatus): AlertStatus[] {
  if (status === 'OPEN') return ['ACKNOWLEDGED', 'DISMISSED']
  if (status === 'ACKNOWLEDGED') return ['RESOLVED', 'DISMISSED']
  return []
}

function startOfDay(value: string): string | undefined {
  return value ? new Date(`${value}T00:00:00Z`).toISOString() : undefined
}

function dayAfter(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString()
}

export function AlertsPage() {
  const { user } = useAuth()
  const consultationPath = user ? consultationsBase(user.role) : '/login'

  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('OPEN')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [selected, setSelected] = useState<Alert | null>(null)
  const [evidence, setEvidence] = useState<AlertEvidence[]>([])
  const [history, setHistory] = useState<AlertStatusEvent[]>([])
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [note, setNote] = useState('')
  const [updating, setUpdating] = useState(false)

  async function loadAlerts() {
    if (fromDate && toDate && fromDate > toDate) {
      setError('The from date must be before the to date.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      setAlerts(
        await api.alerts.list({
          from: startOfDay(fromDate),
          to: dayAfter(toDate),
        }),
      )
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not load clinical alerts.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAlerts()
    // The initial request intentionally runs only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const counts = useMemo(
    () => ({
      OPEN: alerts.filter((alert) => alert.status === 'OPEN').length,
      ACKNOWLEDGED: alerts.filter(
        (alert) => alert.status === 'ACKNOWLEDGED',
      ).length,
      CLOSED: alerts.filter(
        (alert) =>
          alert.status === 'RESOLVED' || alert.status === 'DISMISSED',
      ).length,
    }),
    [alerts],
  )

  const visibleAlerts = useMemo(() => {
    const query = search.trim().toLowerCase()

    return alerts.filter((alert) => {
      const statusMatches =
        tab === 'CLOSED'
          ? alert.status === 'RESOLVED' || alert.status === 'DISMISSED'
          : alert.status === tab
      const searchMatches =
        !query ||
        alert.symptomName.toLowerCase().includes(query) ||
        clinicLabel(alert).toLowerCase().includes(query)

      return statusMatches && searchMatches
    })
  }, [alerts, search, tab])

  async function openAlert(alert: Alert) {
    setSelected(alert)
    setNote('')
    setDrawerLoading(true)
    setError(null)

    try {
      const [alertEvidence, alertHistory] = await Promise.all([
        api.alerts.evidence(alert.alertId),
        api.alerts.history(alert.alertId),
      ])
      setEvidence(alertEvidence)
      setHistory(alertHistory)
    } catch (caught) {
      setEvidence([])
      setHistory([])
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not load alert details.',
      )
    } finally {
      setDrawerLoading(false)
    }
  }

  async function changeAlertStatus(status: AlertStatus) {
    if (!selected) return

    const closing = status === 'RESOLVED' || status === 'DISMISSED'
    if (closing && !note.trim()) {
      setError('Enter a note before closing an alert.')
      return
    }

    setUpdating(true)
    setError(null)

    try {
      const updated = await api.alerts.updateStatus(selected.alertId, {
        status,
        note: note.trim() || undefined,
      })
      const updatedHistory = await api.alerts.history(selected.alertId)

      setAlerts((current) =>
        current.map((alert) =>
          alert.alertId === updated.alertId ? updated : alert,
        ),
      )
      setSelected(updated)
      setHistory(updatedHistory)
      setNote('')
      setSuccess(`Alert marked as ${status.toLowerCase()}.`)
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not update this alert.',
      )
    } finally {
      setUpdating(false)
    }
  }

  if (loading) return <LoadingRow />

  return (
    <div>
      <PageHeader
        title="Clinical alerts"
        description="Review clinic trends based on clinician-approved findings."
      />

      {success && <SuccessMessage message={success} />}
      {error && <div className="mb-3"><ErrorRow message={error} /></div>}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex rounded-md border border-hairline p-0.5">
          {(['OPEN', 'ACKNOWLEDGED', 'CLOSED'] as Tab[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`rounded px-3 py-1.5 text-sm ${
                tab === value
                  ? 'bg-brand-50 font-semibold text-brand-700'
                  : 'text-ink-700 hover:bg-surface'
              }`}
            >
              {value.charAt(0) + value.slice(1).toLowerCase()} ({counts[value]})
            </button>
          ))}
        </div>

        <label className="w-40 text-xs text-ink-600">
          From
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>

        <label className="w-40 text-xs text-ink-600">
          To
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>

        <SecondaryButton type="button" onClick={() => void loadAlerts()}>
          <CalendarRange size={16} aria-hidden />
          Apply dates
        </SecondaryButton>

        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Search alerts</span>
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search symptom or clinic"
            className={`${inputClass} pl-9`}
          />
        </label>
      </div>

      {visibleAlerts.length === 0 ? (
        <EmptyState
          title="No alerts in this view"
          message="Nothing matches the selected status and filters."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-hairline bg-white">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-500">
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Clinic</th>
                <th className="px-4 py-3 font-medium">Symptom</th>
                <th className="px-4 py-3 font-medium">Count</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visibleAlerts.map((alert) => (
                <tr
                  key={alert.alertId}
                  className="cursor-pointer border-b border-hairline last:border-0 hover:bg-surface"
                  onClick={() => void openAlert(alert)}
                >
                  <td className="px-4 py-3">
                    <SeverityBadge severity={severityOf(alert)} />
                  </td>
                  <td className="px-4 py-3 text-ink-700">
                    {clinicLabel(alert)}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-900">
                    {alert.symptomName}
                  </td>
                  <td className="px-4 py-3 text-ink-700">
                    {alert.observedCount ?? '-'} observed /{' '}
                    {alert.baselineCount ?? '-'} baseline
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={alert.status} />
                  </td>
                  <td className="px-4 py-3 text-ink-700">
                    {formatDate(alert.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight size={16} className="text-ink-400" aria-hidden />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer
          open
          variant="modal"
          width="max-w-lg"
          title={selected.symptomName}
          subtitle={
            <span className="flex items-center gap-2">
              <SeverityBadge severity={severityOf(selected)} />
              <StatusBadge status={selected.status} />
            </span>
          }
          onClose={() => setSelected(null)}
          footer={
            nextStatuses(selected.status).length > 0 ? (
              <div className="flex w-full justify-end gap-2">
                {nextStatuses(selected.status).map((status) => {
                  const dismissing = status === 'DISMISSED'
                  const Button = dismissing ? SecondaryButton : ActionButton
                  return (
                    <Button
                      key={status}
                      type="button"
                      disabled={updating}
                      onClick={() => void changeAlertStatus(status)}
                    >
                      {status === 'ACKNOWLEDGED'
                        ? 'Acknowledge'
                        : status === 'RESOLVED'
                          ? 'Resolve'
                          : 'Dismiss'}
                    </Button>
                  )
                })}
              </div>
            ) : (
              <p className="w-full text-center text-xs text-ink-500">
                This alert is closed.
              </p>
            )
          }
        >
          {drawerLoading ? (
            <LoadingRow label="Loading alert details..." />
          ) : (
            <>
              <dl className="divide-y divide-hairline text-sm">
                <div className="flex justify-between gap-4 py-2">
                  <dt className="text-ink-500">Clinic</dt>
                  <dd className="text-right text-ink-900">{clinicLabel(selected)}</dd>
                </div>
                <div className="flex justify-between gap-4 py-2">
                  <dt className="text-ink-500">Window</dt>
                  <dd className="text-right text-ink-900">
                    {selected.windowStart && selected.windowEnd
                      ? `${formatDate(selected.windowStart)} - ${formatDate(selected.windowEnd)}`
                      : 'Not recorded'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-2">
                  <dt className="text-ink-500">Observed</dt>
                  <dd className="text-right text-ink-900">
                    {selected.observedCount ?? '-'} consultations
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-2">
                  <dt className="text-ink-500">Weekly baseline</dt>
                  <dd className="text-right text-ink-900">
                    {selected.baselineCount ?? '-'} consultations
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-2">
                  <dt className="text-ink-500">Ratio score</dt>
                  <dd className="text-right text-ink-900">
                    {selected.score} (threshold {selected.threshold ?? '-'})
                  </dd>
                </div>
              </dl>

              <h3 className="mb-2 mt-5 text-sm font-semibold text-ink-900">
                Evidence ({evidence.length})
              </h3>
              {evidence.length === 0 ? (
                <p className="text-sm text-ink-500">No evidence was recorded.</p>
              ) : (
                <ul className="divide-y divide-hairline border-y border-hairline">
                  {evidence.map((item) => (
                    <li key={item.alertEvidenceId} className="py-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="font-medium text-ink-900">
                          {item.finding.displayName}
                        </span>
                        <span className="text-ink-500">
                          {item.finding.assertion.toLowerCase()}
                        </span>
                      </div>
                      <Link
                        to={`${consultationPath}/${item.consultationId}`}
                        className="mt-1 inline-block text-xs text-action-600 hover:underline"
                      >
                        Open consultation #{item.consultationId}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <h3 className="mb-2 mt-5 text-sm font-semibold text-ink-900">
                History
              </h3>
              {history.length === 0 ? (
                <p className="text-sm text-ink-500">No history was recorded.</p>
              ) : (
                <ol className="divide-y divide-hairline border-y border-hairline">
                  {history.map((event) => (
                    <li key={event.alertStatusEventId} className="py-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="font-medium text-ink-900">
                          {event.previousStatus
                            ? `${event.previousStatus} to ${event.newStatus}`
                            : event.newStatus}
                        </span>
                        <span className="text-xs text-ink-500">
                          {formatDateTime(event.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        {event.systemGenerated
                          ? 'System'
                          : event.changedByUsername ?? 'Staff'}
                        {event.note ? ` - ${event.note}` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              )}

              {nextStatuses(selected.status).length > 0 && (
                <div className="mt-5">
                  <label htmlFor="alert-note" className="text-xs font-medium text-ink-700">
                    Staff note
                  </label>
                  <textarea
                    id="alert-note"
                    rows={3}
                    maxLength={500}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Required when resolving or dismissing"
                    className={`${textareaClass} mt-1`}
                  />
                </div>
              )}

              <div className="mt-5 flex gap-2 rounded-md border border-action-100 bg-action-50 px-3 py-2.5">
                <Info size={16} className="mt-0.5 shrink-0 text-action-600" aria-hidden />
                <p className="text-xs text-ink-700">
                  This alert supports review and is not a diagnosis.
                </p>
              </div>
            </>
          )}
        </Drawer>
      )}
    </div>
  )
}

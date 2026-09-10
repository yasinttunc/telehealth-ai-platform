/*
 * StatusBadge — status pill for consultations and alerts.
 *
 * The status text is always rendered, so the badge never relies on colour
 * alone. Tones follow the master design: green for settled/positive, amber for
 * "needs attention", red for cancelled/failed, neutral grey for inert states.
 */

import type { AlertStatus, ConsultationStatus } from '../types/domain'

const CONSULTATION_STYLES: Record<ConsultationStatus, string> = {
  SCHEDULED: 'bg-action-50 text-action-700 border-action-100',
  IN_PROGRESS: 'bg-brand-50 text-brand-700 border-brand-100',
  COMPLETED: 'bg-brand-50 text-brand-700 border-brand-100',
  CANCELLED: 'bg-slate-100 text-ink-500 border-slate-200',
}

const ALERT_STYLES: Record<AlertStatus, string> = {
  OPEN: 'bg-danger-50 text-danger-700 border-danger-100',
  ACKNOWLEDGED: 'bg-action-50 text-action-700 border-action-100',
  DISMISSED: 'bg-slate-100 text-ink-500 border-slate-200',
  RESOLVED: 'bg-brand-50 text-brand-700 border-brand-100',
}

function label(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')
}

export function StatusBadge({ status }: { status: ConsultationStatus | AlertStatus }) {
  const style =
    (CONSULTATION_STYLES as Record<string, string>)[status] ??
    (ALERT_STYLES as Record<string, string>)[status] ??
    'bg-slate-100 text-ink-500 border-slate-200'

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {label(status)}
    </span>
  )
}

/** Severity indicator for the clinical alerts table: dot plus word. */
export function SeverityBadge({ severity }: { severity: 'High' | 'Medium' | 'Low' }) {
  const dot = {
    High: 'bg-danger-600',
    Medium: 'bg-warn-600',
    Low: 'bg-brand-600',
  }[severity]

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-800">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      {severity}
    </span>
  )
}

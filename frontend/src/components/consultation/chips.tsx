/*
 * Labelled chips and notices for the consultation pipeline.
 *
 * Colour is never the only signal: every chip carries its own text. Wording
 * follows the clinical safety wording: nothing here calls extracted output a
 * diagnosis, and interim ASR text is always marked as transient.
 */

import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import type { ExtractionJobStatus, TranscriptionStatus } from '../../types/domain'
import type { TranscriptApproval } from '../../lib/consultationState'

export type Tone = 'neutral' | 'brand' | 'action' | 'warn' | 'danger' | 'muted'

const TONE_STYLES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-ink-700 border-slate-200',
  brand: 'bg-brand-50 text-brand-700 border-brand-100',
  action: 'bg-action-50 text-action-700 border-action-100',
  warn: 'bg-warn-50 text-warn-700 border-warn-100',
  danger: 'bg-danger-50 text-danger-700 border-danger-100',
  muted: 'bg-transparent text-ink-500 border-hairline',
}

export function Chip({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: Tone
  title?: string
  children: ReactNode
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${TONE_STYLES[tone]}`}
    >
      {children}
    </span>
  )
}

/** Chip preceded by a small filled dot, used for live/severity indicators. */
export function DotChip({
  tone = 'neutral',
  children,
}: {
  tone?: Tone
  children: ReactNode
}) {
  const dot = {
    neutral: 'bg-ink-400',
    brand: 'bg-brand-600',
    action: 'bg-action-600',
    warn: 'bg-warn-600',
    danger: 'bg-danger-600',
    muted: 'bg-ink-400',
  }[tone]

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-700">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Pipeline status vocabularies                                        */
/* ------------------------------------------------------------------ */

const TRANSCRIPTION_LABELS: Record<
  TranscriptionStatus,
  { text: string; tone: Tone; title: string }
> = {
  NOT_STARTED: {
    text: 'Not recorded',
    tone: 'neutral',
    title: 'No transcription worker session has been created for this consultation.',
  },
  ACTIVE: {
    text: 'Recording',
    tone: 'warn',
    title: 'A worker session is active. Final segments are still arriving.',
  },
  FINALIZED: {
    text: 'Complete',
    tone: 'brand',
    title: 'The worker flushed every speech stream and reported completion.',
  },
  FAILED: {
    text: 'Transcription failed',
    tone: 'danger',
    title: 'The worker did not finish. A manual transcript can still be entered.',
  },
  MANUAL: {
    text: 'Manual transcript',
    tone: 'neutral',
    title: 'Entered by staff rather than produced by the live transcription worker.',
  },
}

export function TranscriptionStatusChip({ status }: { status?: TranscriptionStatus }) {
  if (!status) return null
  const meta = TRANSCRIPTION_LABELS[status]
  return (
    <Chip tone={meta.tone} title={meta.title}>
      {meta.text}
    </Chip>
  )
}

const APPROVAL_LABELS: Record<
  TranscriptApproval,
  { text: string; tone: Tone; title: string } | null
> = {
  UNKNOWN: null,
  NONE: {
    text: 'Draft',
    tone: 'warn',
    title: 'Not yet approved by the assigned Doctor. Not usable for extraction.',
  },
  APPROVED: {
    text: 'Approved',
    tone: 'brand',
    title: 'Clinician-reviewed transcript for the current revision.',
  },
  STALE: {
    text: 'Approval cleared',
    tone: 'warn',
    title: 'The text changed after approval, so the approval no longer applies.',
  },
}

export function ApprovalChip({ approval }: { approval: TranscriptApproval }) {
  const meta = APPROVAL_LABELS[approval]
  if (!meta) return null
  return (
    <Chip tone={meta.tone} title={meta.title}>
      {meta.text}
    </Chip>
  )
}

const JOB_LABELS: Record<ExtractionJobStatus, { text: string; tone: Tone }> = {
  PENDING: { text: 'Queued', tone: 'warn' },
  RUNNING: { text: 'Running', tone: 'warn' },
  SUCCEEDED: { text: 'Completed', tone: 'brand' },
  FAILED: { text: 'Failed', tone: 'danger' },
}

export function ExtractionStatusChip({ status }: { status: ExtractionJobStatus }) {
  const meta = JOB_LABELS[status]
  return <Chip tone={meta.tone}>{meta.text}</Chip>
}

/** Assertion label on an extracted symptom. Never presented as a diagnosis. */
export function AssertionChip({ assertion }: { assertion: string }) {
  const normalised = assertion.toUpperCase()
  const tone: Tone =
    normalised === 'PRESENT' ? 'brand' : normalised === 'NEGATED' ? 'danger' : 'warn'
  return <Chip tone={tone}>{normalised}</Chip>
}

/**
 * Shown when an optional backend route or client dependency is unavailable.
 * The wording is deliberately calm and factual because an unavailable
 * optional integration is not a failure of the whole application.
 */
export function FeatureNotice({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed border-hairline bg-surface px-3 py-2.5 text-sm text-ink-700">
      <Info size={16} className="mt-0.5 shrink-0 text-ink-400" aria-hidden />
      <span>
        <span className="font-medium text-ink-800">{title}</span>
        {detail && <span className="mt-0.5 block text-xs text-ink-500">{detail}</span>}
      </span>
    </div>
  )
}

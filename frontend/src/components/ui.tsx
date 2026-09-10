/*
 * Shared UI primitives for the master design.
 *
 * Rules encoded here so pages cannot drift from the design:
 *   - Green = brand/primary command. Blue = contextual action. Red = destructive.
 *   - Maximum 8px corner radius (`rounded-lg`), thin `border-hairline` hairlines.
 *   - Identity is always initials, never a photograph.
 *   - Status is never colour-only: every pill carries its own text label.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { initialsOf } from '../lib/initials'

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

/** Deterministic tint so the same person keeps the same colour across screens. */
const AVATAR_TINTS = [
  'bg-teal-600',
  'bg-indigo-600',
  'bg-rose-600',
  'bg-amber-600',
  'bg-sky-600',
  'bg-violet-600',
  'bg-emerald-600',
]

function tintFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length]
}

/**
 * Initials avatar. The design set forbids user photography, so identity is
 * represented by initials on a deterministic tint.
 */
export function Avatar({
  name,
  size = 'md',
}: {
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}) {
  const dimensions = {
    xs: 'h-6 w-6 text-[10px]',
    sm: 'h-8 w-8 text-xs',
    md: 'h-9 w-9 text-xs',
    lg: 'h-11 w-11 text-sm',
    xl: 'h-14 w-14 text-base',
  }[size]

  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-full font-semibold text-white ${tintFor(name)} ${dimensions}`}
    >
      {initialsOf(name)}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

const BUTTON_BASE =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'

/** Brand command: "New consultation", "Approve", "Add clinic". Green. */
export function PrimaryButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${BUTTON_BASE} bg-brand-600 text-white hover:bg-brand-700 ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

/** Contextual action inside a working surface: "Start video", "Save changes". */
export function ActionButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${BUTTON_BASE} bg-action-600 text-white hover:bg-action-700 ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

/** Neutral alternative next to a primary command. */
export function SecondaryButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${BUTTON_BASE} border border-hairline bg-white text-ink-700 hover:bg-surface ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

/** Destructive only. Red never appears on a non-destructive command. */
export function DangerButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${BUTTON_BASE} bg-danger-600 text-white hover:bg-danger-700 ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

/** Quiet text-only command, e.g. "View all consultations". */
export function LinkButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1 text-sm font-medium text-action-600 hover:text-action-700 hover:underline disabled:opacity-50 ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

/** Icon-only row action. An accessible label is mandatory. */
export function IconButton({
  label,
  danger,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; danger?: boolean }) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-md transition-colors ${
        danger
          ? 'text-danger-600 hover:bg-danger-50'
          : 'text-ink-500 hover:bg-surface hover:text-ink-800'
      } ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

/** Standard bordered card. Every panel in the design uses this hairline. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      className={`rounded-lg border border-hairline bg-white ${className ?? ''}`}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-ink-500">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName ?? 'p-4'}>{children}</div>
    </section>
  )
}

/** Page title block sitting above the working surface. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/**
 * Dashboard statistic tile with an optional trend.
 * `direction` is stated in words as well as colour, so the trend is readable
 * without relying on hue.
 */
export function StatTile({
  label,
  value,
  icon,
  trend,
}: {
  label: string
  value: ReactNode
  icon?: ReactNode
  trend?: { direction: 'up' | 'down'; text: string }
}) {
  return (
    <div className="rounded-lg border border-hairline bg-white p-4">
      <div className="flex items-start gap-3">
        {icon && (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 tabular">
            {value}
          </p>
          {trend && (
            <p
              className={`mt-1 text-xs ${
                trend.direction === 'up' ? 'text-brand-600' : 'text-danger-600'
              }`}
            >
              {trend.direction === 'up' ? '↑' : '↓'} {trend.text}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Two-column key/value row used in detail panels. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="text-right text-sm text-ink-900">{children}</dd>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export function LoadingRow({ label = 'Loading…' }: { label?: string }) {
  return <p className="py-10 text-center text-sm text-ink-400">{label}</p>
}

export function ErrorRow({ message, children }: { message?: string; children?: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700"
    >
      {message ?? children}
    </p>
  )
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-md border border-action-100 bg-action-50 px-3 py-2.5 text-xs text-ink-700">
      {children}
    </div>
  )
}

/** Footer strip used under AI output to keep the review obligation visible. */
export function ReviewNotice({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 text-center text-xs text-ink-500">{children}</p>
  )
}

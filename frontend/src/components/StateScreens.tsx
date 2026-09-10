/*
 * Shared full-surface state screens (master design, screen 15).
 *
 * One component covers access, missing route, empty result and service failure
 * so all four look like the same product. The icon lives in a soft brand-tinted
 * circle and the wording is always factual rather than alarming — a failed AI
 * extraction is a recoverable state, not a crash.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarRange,
  CloudAlert,
  ShieldCheck,
  Signpost,
  type LucideIcon,
} from 'lucide-react'
import { ActionButton, SecondaryButton } from './ui'

function StateSurface({
  icon: Icon,
  title,
  message,
  children,
}: {
  icon: LucideIcon
  title: string
  message: string
  children?: ReactNode
}) {
  return (
    <div className="grid min-h-[24rem] place-items-center px-4 py-16">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-brand-50 text-brand-600">
          <Icon size={30} strokeWidth={1.5} aria-hidden />
        </span>
        <h2 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h2>
        <p className="mt-2 text-sm text-ink-500">{message}</p>
        {children && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>
        )}
      </div>
    </div>
  )
}

/** 403: the signed-in role may not view this route. */
export function AccessRestrictedState({ homePath = '/' }: { homePath?: string }) {
  return (
    <StateSurface
      icon={ShieldCheck}
      title="Access restricted"
      message="You do not have permission to view this page."
    >
      <Link to={homePath}>
        <ActionButton type="button">Return to dashboard</ActionButton>
      </Link>
    </StateSurface>
  )
}

/** 404: the route does not exist. */
export function NotFoundState({ homePath = '/' }: { homePath?: string }) {
  return (
    <StateSurface
      icon={Signpost}
      title="Page not found"
      message="The page may have moved or no longer exists."
    >
      <SecondaryButton type="button" onClick={() => window.history.back()}>
        Go back
      </SecondaryButton>
      <Link to={homePath}>
        <ActionButton type="button">Return home</ActionButton>
      </Link>
    </StateSurface>
  )
}

/** A filtered list matched nothing. The action clears the filters. */
export function NoResultsState({
  title = 'No consultations found',
  message = 'Try changing your filters or date range.',
  onClear,
  clearLabel = 'Clear filters',
}: {
  title?: string
  message?: string
  onClear?: () => void
  clearLabel?: string
}) {
  return (
    <StateSurface icon={CalendarRange} title={title} message={message}>
      {onClear && (
        <SecondaryButton type="button" onClick={onClear}>
          {clearLabel}
        </SecondaryButton>
      )}
    </StateSurface>
  )
}

/**
 * A dependent service is unavailable.
 *
 * The message explicitly reassures that the approved transcript is safe: the
 * clinical record is never lost because a provider timed out.
 */
export function ServiceUnavailableState({
  title = 'AI extraction is temporarily unavailable',
  message = 'Your approved transcript is safe. Try the extraction again later.',
  onRetry,
  onBack,
  backLabel = 'Return to consultation',
  retryLabel = 'Retry safely',
}: {
  title?: string
  message?: string
  onRetry?: () => void
  onBack?: () => void
  backLabel?: string
  retryLabel?: string
}) {
  return (
    <StateSurface icon={CloudAlert} title={title} message={message}>
      {onRetry && (
        <ActionButton type="button" onClick={onRetry}>
          {retryLabel}
        </ActionButton>
      )}
      {onBack && (
        <SecondaryButton type="button" onClick={onBack}>
          {backLabel}
        </SecondaryButton>
      )}
    </StateSurface>
  )
}

/*
 * EmptyState — inline empty result inside a panel or table.
 * For a full-surface empty screen use StateScreens.NoResultsState instead.
 */

import type { ReactNode } from 'react'

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-dashed border-hairline bg-white px-6 py-10 text-center">
      <p className="mb-1 text-sm font-medium text-ink-800">{title}</p>
      <p className="mb-4 text-sm text-ink-500">{message}</p>
      {action}
    </div>
  )
}

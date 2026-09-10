/*
 * Small modal for destructive confirmations. Red is reserved for the
 * destructive action button.
 */

import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const openerRef = useRef<HTMLElement | null>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const onCancelRef = useRef(onCancel)
  const busyRef = useRef(busy)

  onCancelRef.current = onCancel
  busyRef.current = busy

  useEffect(() => {
    if (!open) return

    openerRef.current = document.activeElement as HTMLElement
    cancelButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busyRef.current) onCancelRef.current()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      openerRef.current?.focus()
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Cancel confirmation"
        className="absolute inset-0 cursor-default bg-ink-900/30"
        onClick={onCancel}
        disabled={busy}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-sm rounded-lg border border-hairline bg-white p-5 shadow-xl"
      >
        <h2 className="mb-1 text-base font-semibold text-ink-900">{title}</h2>
        <p className="mb-5 text-sm text-ink-500">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-9 items-center rounded-md border border-hairline px-3.5 text-sm font-medium text-ink-700 hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-9 items-center rounded-md bg-danger-600 px-3.5 text-sm font-medium text-white hover:bg-danger-700 disabled:opacity-50"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

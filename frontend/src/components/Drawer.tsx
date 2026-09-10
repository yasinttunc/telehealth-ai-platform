/*
 * Drawer — right-side working panel used for create/edit forms and record
 * detail, instead of a separate route per simple form.
 *
 * The design uses two drawer weights:
 *   - `variant="modal"` dims the page behind it (create/edit forms).
 *   - `variant="inline"` sits beside the list without a backdrop, so staff can
 *     keep scanning the table while a record is open (transcript approval,
 *     alert review).
 *
 * A sticky footer keeps Cancel/Save reachable in a long form.
 */

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface DrawerProps {
  open: boolean
  title: ReactNode
  /** Small line under the title, e.g. the record this drawer belongs to. */
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  /** Sticky action bar pinned to the bottom of the panel. */
  footer?: ReactNode
  variant?: 'modal' | 'inline'
  width?: string
}

export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  variant = 'modal',
  width = 'max-w-md',
}: DrawerProps) {
  const openerRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)

  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    openerRef.current = document.activeElement as HTMLElement
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      openerRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  const panel = (
    <div
      role="dialog"
      aria-modal={variant === 'modal'}
      aria-labelledby="drawer-title"
      className={`flex h-full w-full flex-col border-l border-hairline bg-white ${width} ${
        variant === 'modal' ? 'absolute right-0 top-0 shadow-xl' : ''
      }`}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 id="drawer-title" className="text-base font-semibold text-ink-900">
            {title}
          </h2>
          {subtitle && <div className="mt-1 text-xs text-ink-500">{subtitle}</div>}
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-500 hover:bg-surface hover:text-ink-800"
        >
          <X size={17} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">{children}</div>

      {footer && (
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline px-4 py-3">
          {footer}
        </footer>
      )}
    </div>
  )

  if (variant === 'inline') {
    return (
      <aside className="hidden w-full shrink-0 lg:block lg:w-[22rem] xl:w-[24rem]">
        <div className="sticky top-4 h-[calc(100vh-6rem)] overflow-hidden rounded-lg border border-hairline bg-white">
          {panel}
        </div>
      </aside>
    )
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close drawer"
        className="absolute inset-0 cursor-default bg-ink-900/30"
        onClick={onClose}
      />
      {panel}
    </div>
  )
}

/*
 * FormField — labelled control wrapper. Every input has a visible label, and
 * validation errors are attached under the control they belong to.
 */

import type { ReactNode } from 'react'

interface FieldProps {
  id: string
  label: string
  error?: string
  required?: boolean
  children: ReactNode
  hint?: string
}

export function FormField({ id, label, error, required, children, hint }: FieldProps) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-ink-700">
        {label}
        {required && <span className="text-danger-600"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
      {error && (
        <p className="mt-1.5 text-xs text-danger-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** Two fields side by side, e.g. first name / last name. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-3 sm:grid-cols-2">{children}</div>
}

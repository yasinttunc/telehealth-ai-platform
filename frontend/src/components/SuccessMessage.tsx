/* Brief inline confirmation shown after a completed API mutation. */

import { CircleCheck } from 'lucide-react'

export function SuccessMessage({ message }: { message: string }) {
  return (
    <p
      role="status"
      className="mb-3 flex items-center gap-2 rounded-md border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-700"
    >
      <CircleCheck size={15} aria-hidden />
      {message}
    </p>
  )
}

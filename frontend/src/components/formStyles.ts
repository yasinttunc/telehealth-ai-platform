/*
 * Shared form-control styling.
 *
 * Every input, select and textarea in the product uses the same 36px control
 * height, hairline border and blue focus ring, so a form never looks assembled
 * from different kits.
 */

export const inputClass =
  'h-9 w-full rounded-md border border-hairline bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 outline-none transition-colors focus:border-action-500 disabled:bg-surface disabled:text-ink-500'

export const selectClass = inputClass

export const textareaClass =
  'w-full rounded-md border border-hairline bg-white px-3 py-2 text-sm leading-6 text-ink-900 placeholder:text-ink-400 outline-none transition-colors focus:border-action-500'

/** Read-only field that an administrator owns, e.g. GMC number or role. */
export const lockedInputClass = `${inputClass} bg-surface text-ink-500`

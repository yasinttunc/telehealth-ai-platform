/** Convert a person's display name into stable one- or two-letter initials. */
export function initialsOf(name: string): string {
  const parts = name
    .replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

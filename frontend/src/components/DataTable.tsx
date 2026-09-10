/*
 * DataTable — the dense operational table used across every staff screen.
 *
 * Design rules: hairline borders, uppercase micro-caps header, 44px rows, a
 * left accent bar on the selected row, and horizontal scroll on narrow screens.
 * Deliberately not a generic table framework — the caller supplies cells.
 */

import type { ReactNode } from 'react'

export interface Column<T> {
  header: string
  cell: (row: T) => ReactNode
  /** Extra classes for the cell, e.g. alignment or a fixed width. */
  className?: string
  /** Extra classes for the header cell. */
  headerClassName?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  /** Right-aligned action cell. */
  actions?: (row: T) => ReactNode
  /** Marks one row as selected: adds a tint and a brand accent bar. */
  isSelected?: (row: T) => boolean
  /** Highlights a row needing attention, e.g. an unlinked profile. */
  needsAttention?: (row: T) => boolean
  onRowClick?: (row: T) => void
  /** Rendered inside the table body when there are no rows. */
  empty?: ReactNode
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  actions,
  isSelected,
  needsAttention,
  onRowClick,
  empty,
}: DataTableProps<T>) {
  const columnCount = columns.length + (actions ? 1 : 0)

  return (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-white">
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-ink-500">
            {columns.map((col) => (
              <th
                key={col.header}
                className={`px-4 py-2.5 font-medium ${col.headerClassName ?? ''}`}
              >
                {col.header}
              </th>
            ))}
            {actions && <th className="px-4 py-2.5 text-right font-medium">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && empty && (
            <tr>
              <td colSpan={columnCount} className="px-4 py-10 text-center">
                {empty}
              </td>
            </tr>
          )}

          {rows.map((row) => {
            const selected = isSelected?.(row) ?? false
            const attention = needsAttention?.(row) ?? false

            return (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={[
                  'border-b border-hairline last:border-0 transition-colors',
                  onRowClick ? 'cursor-pointer' : '',
                  selected
                    ? 'bg-surface shadow-[inset_3px_0_0_0_var(--color-brand-600)]'
                    : attention
                      ? 'bg-warn-50'
                      : 'hover:bg-surface',
                ].join(' ')}
              >
                {columns.map((col) => (
                  <td
                    key={col.header}
                    className={`px-4 py-3 align-middle text-ink-800 ${col.className ?? ''}`}
                  >
                    {col.cell(row)}
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-3 align-middle">
                    <div className="flex justify-end gap-1">{actions(row)}</div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Two-line table cell: a strong primary line above quiet secondary detail. */
export function CellStack({
  primary,
  secondary,
}: {
  primary: ReactNode
  secondary?: ReactNode
}) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium text-ink-900">{primary}</div>
      {secondary && <div className="truncate text-xs text-ink-500">{secondary}</div>}
    </div>
  )
}

/** Footer strip under a table: result count on the left, pagination right. */
export function TableFooter({
  summary,
  children,
}: {
  summary: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-500">
      <span>{summary}</span>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

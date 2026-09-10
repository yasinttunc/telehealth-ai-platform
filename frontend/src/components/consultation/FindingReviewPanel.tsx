import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { api, ApiError } from '../../api'
import { formatDateTime } from '../../lib/format'
import type {
  ClinicalFindingAssertion,
  FindingReview,
  SymptomRecord,
} from '../../types/domain'
import { selectClass } from '../formStyles'
import { ErrorRow, PrimaryButton } from '../ui'

const ASSERTIONS: ClinicalFindingAssertion[] = [
  'PRESENT',
  'NEGATED',
  'HISTORICAL',
  'UNCERTAIN',
]

interface ReviewRow {
  code: string
  displayName: string
  assertion: ClinicalFindingAssertion
  selected: boolean
}

/** Uses the same simple code rule as FindingReviewService. */
function codeFor(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
}

function rowsFrom(record: SymptomRecord): ReviewRow[] {
  const rows = new Map<string, ReviewRow>()

  for (const symptom of record.symptoms) {
    const code = codeFor(symptom.name)
    if (!rows.has(code)) {
      rows.set(code, {
        code,
        displayName: symptom.name,
        assertion: symptom.assertion,
        selected: true,
      })
    }
  }

  return [...rows.values()]
}

/** Lets the assigned Doctor approve or correct the extracted findings. */
export function FindingReviewPanel({ record }: { record: SymptomRecord }) {
  const [rows, setRows] = useState<ReviewRow[]>(() => rowsFrom(record))
  const [review, setReview] = useState<FindingReview | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let ignore = false
    const sourceRows = rowsFrom(record)

    setLoading(true)
    setError(null)
    setSaved(false)

    void api.findingReviews
      .get(record.symptomRecordId)
      .then((stored) => {
        if (ignore) return
        setReview(stored)

        if (!stored) {
          setRows(sourceRows)
          return
        }

        const accepted = new Map(
          stored.acceptedFindings.map((finding) => [finding.code, finding]),
        )

        setRows(
          sourceRows.map((row) => ({
            ...row,
            selected: accepted.has(row.code),
            assertion: accepted.get(row.code)?.assertion ?? row.assertion,
          })),
        )
      })
      .catch((caught) => {
        if (!ignore) {
          setError(
            caught instanceof ApiError
              ? caught.message
              : 'Could not load the finding review.',
          )
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [record])

  function updateRow(index: number, change: Partial<ReviewRow>) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...change } : row,
      ),
    )
    setSaved(false)
  }

  async function saveFindingReview() {
    setSaving(true)
    setError(null)

    try {
      const stored = await api.findingReviews.save(record.symptomRecordId, {
        acceptedFindings: rows
          .filter((row) => row.selected)
          .map((row) => ({
            code: row.code,
            assertion: row.assertion,
          })),
      })
      setReview(stored)
      setSaved(true)
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not save the finding review.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-4 border-t border-hairline pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-ink-900">
            Clinician finding review
          </h4>
          <p className="mt-1 text-xs text-ink-500">
            Select the findings that may be used in clinic trend alerts.
          </p>
        </div>
        {review && (
          <span className="text-xs text-ink-500">
            Updated {formatDateTime(review.updatedAt)}
          </span>
        )}
      </div>

      {error && <div className="mb-3"><ErrorRow message={error} /></div>}

      {loading ? (
        <p className="py-3 text-sm text-ink-400">Loading finding review...</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div
              key={row.code}
              className="grid grid-cols-1 gap-3 rounded-md border border-hairline px-3 py-2 sm:grid-cols-[1fr_10rem] sm:items-center"
            >
              <label className="flex min-w-0 items-center gap-2 text-sm text-ink-800">
                <input
                  type="checkbox"
                  checked={row.selected}
                  onChange={(event) =>
                    updateRow(index, { selected: event.target.checked })
                  }
                />
                <span className="truncate">{row.displayName}</span>
              </label>

              <select
                aria-label={`Assertion for ${row.displayName}`}
                value={row.assertion}
                disabled={!row.selected}
                onChange={(event) =>
                  updateRow(index, {
                    assertion: event.target.value as ClinicalFindingAssertion,
                  })
                }
                className={selectClass}
              >
                {ASSERTIONS.map((assertion) => (
                  <option key={assertion} value={assertion}>
                    {assertion.toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <PrimaryButton
          type="button"
          disabled={loading || saving}
          onClick={() => void saveFindingReview()}
        >
          {saving ? 'Saving...' : 'Save finding review'}
        </PrimaryButton>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-brand-700">
            <CheckCircle2 size={16} aria-hidden />
            Review saved
          </span>
        )}
      </div>
    </section>
  )
}

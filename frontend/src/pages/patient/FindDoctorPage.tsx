/*
 * Find a doctor — patient-facing clinician availability (master design, 12).
 *
 * A patient sees only what is needed to choose a clinician and ask for a slot:
 * name, specialty, clinic, languages, next available time and the consultation
 * methods offered. No GMC number, no account link, no internal identifiers.
 *
 * Availability comes from `Doctor.availableTimes` (ISO instants). It is grouped
 * into weekday columns purely for display; the clinic still confirms every
 * request, which the footer states explicitly so a patient never assumes a slot
 * is booked by clicking here.
 */

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Phone, Search, Video } from 'lucide-react'
import { api } from '../../api'
import {
  ActionButton,
  Avatar,
  ErrorRow,
  LoadingRow,
  PageHeader,
} from '../../components/ui'
import { EmptyState } from '../../components/EmptyState'
import { inputClass } from '../../components/formStyles'
import type { Doctor } from '../../types/domain'

type AvailabilityFilter = 'ANY' | 'TODAY' | 'WEEK'

interface DaySlots {
  key: string
  label: string
  /** Kept as {sortKey, label} so slots order by clock time, not by string. */
  times: { at: number; label: string }[]
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Group a clinician's ISO slots into the next five days that have any slot. */
function groupByDay(availableTimes: string[]): DaySlots[] {
  const now = Date.now()
  const byDay = new Map<
    string,
    { sortKey: number; label: string; times: { at: number; label: string }[] }
  >()

  for (const iso of availableTimes) {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime()) || date.getTime() < now) continue

    const key = date.toDateString()
    const entry = byDay.get(key) ?? {
      sortKey: startOfDay(date),
      label: date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
      times: [],
    }
    entry.times.push({
      at: date.getTime(),
      label: date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    })
    byDay.set(key, entry)
  }

  return [...byDay.entries()]
    .sort((a, b) => a[1].sortKey - b[1].sortKey)
    .slice(0, 5)
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      times: entry.times.sort((a, b) => a.at - b.at),
    }))
}

/** Earliest future slot, phrased relative to today. */
function nextAvailableLabel(availableTimes: string[]): string | null {
  const now = Date.now()
  const upcoming = availableTimes
    .map((iso) => new Date(iso))
    .filter((date) => !Number.isNaN(date.getTime()) && date.getTime() >= now)
    .sort((a, b) => a.getTime() - b.getTime())[0]

  if (!upcoming) return null

  const time = upcoming.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const today = startOfDay(new Date())
  const day = startOfDay(upcoming)
  const dayDifference = Math.round((day - today) / 86_400_000)

  if (dayDifference === 0) return `Today, ${time}`
  if (dayDifference === 1) return `Tomorrow, ${time}`
  return `${upcoming.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`
}

function matchesAvailability(availableTimes: string[], filter: AvailabilityFilter): boolean {
  if (filter === 'ANY') return true
  const now = Date.now()
  const horizon = filter === 'TODAY' ? startOfDay(new Date()) + 86_400_000 : now + 7 * 86_400_000
  return availableTimes.some((iso) => {
    const time = new Date(iso).getTime()
    return !Number.isNaN(time) && time >= now && time < horizon
  })
}

export function FindDoctorPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [specialty, setSpecialty] = useState('ALL')
  const [availability, setAvailability] = useState<AvailabilityFilter>('ANY')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    api.doctors
      .list()
      .then((rows) => {
        if (!active) return
        setDoctors(rows)
        // Open the first clinician so the availability grid is discoverable.
        setExpandedId(rows[0]?.doctorId ?? null)
      })
      .catch(() => {
        if (active) setError('Could not load the clinician directory.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const specialties = useMemo(
    () => [...new Set(doctors.map((doctor) => doctor.specialty).filter(Boolean))].sort(),
    [doctors],
  )

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return doctors.filter((doctor) => {
      const name = `${doctor.firstName} ${doctor.lastName}`.toLowerCase()
      const matchesQuery =
        !query || name.includes(query) || doctor.specialty.toLowerCase().includes(query)
      const matchesSpecialty = specialty === 'ALL' || doctor.specialty === specialty
      return (
        matchesQuery &&
        matchesSpecialty &&
        matchesAvailability(doctor.availableTimes ?? [], availability)
      )
    })
  }, [doctors, search, specialty, availability])

  if (loading) return <LoadingRow />

  return (
    <>
      <PageHeader
        title="Find a doctor"
        description="Browse clinicians available for telehealth consultations."
      />

      {error && <ErrorRow message={error} />}

      {/* --- Filters -------------------------------------------------- */}
      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="relative">
          <span className="sr-only">Search by name or specialty</span>
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or specialty"
            className={`${inputClass} h-11 pl-9`}
          />
        </label>

        <label className="rounded-md border border-hairline bg-white px-3 py-1.5">
          <span className="block text-[11px] text-ink-500">Specialty</span>
          <select
            value={specialty}
            onChange={(event) => setSpecialty(event.target.value)}
            className="w-full bg-transparent text-sm text-ink-900 outline-none"
          >
            <option value="ALL">All specialties</option>
            {specialties.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        {/* Clinic filter is presentational until the directory returns clinics. */}
        <label className="rounded-md border border-hairline bg-white px-3 py-1.5">
          <span className="block text-[11px] text-ink-500">Clinic</span>
          <select
            className="w-full bg-transparent text-sm text-ink-500 outline-none"
            disabled
          >
            <option>All clinics</option>
          </select>
        </label>

        <div className="rounded-md border border-hairline bg-white px-3 py-1.5">
          <span className="block text-[11px] text-ink-500">Availability</span>
          <div className="mt-0.5 flex gap-1">
            {(
              [
                ['ANY', 'Any time'],
                ['TODAY', 'Today'],
                ['WEEK', 'This week'],
              ] as [AvailabilityFilter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setAvailability(value)}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  availability === value
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-ink-500 hover:bg-surface'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* --- Directory ------------------------------------------------ */}
      {visible.length === 0 ? (
        <EmptyState
          title="No clinicians match these filters"
          message="Try a different specialty or widen the availability window."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-hairline bg-white">
          <div className="hidden grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-hairline px-4 py-2.5 text-[11px] uppercase tracking-wide text-ink-500 lg:grid">
            <span>Clinician</span>
            <span>Specialty</span>
            <span>Clinic</span>
            <span>Languages</span>
            <span>Next available</span>
            <span>Consultation methods</span>
            <span className="text-right">Action</span>
          </div>

          {visible.map((doctor) => {
            const expanded = expandedId === doctor.doctorId
            const days = groupByDay(doctor.availableTimes ?? [])
            const nextSlot = nextAvailableLabel(doctor.availableTimes ?? [])

            return (
              <article
                key={doctor.doctorId}
                className={`border-b border-hairline last:border-0 ${
                  expanded ? 'border-x-0 bg-white ring-1 ring-inset ring-action-500' : ''
                }`}
              >
                <div className="grid items-center gap-4 px-4 py-3 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <div className="flex items-center gap-3">
                    <Avatar name={`${doctor.firstName} ${doctor.lastName}`} size="lg" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-900">
                        Dr. {doctor.firstName} {doctor.lastName}
                      </p>
                      <p className="truncate text-xs text-ink-500">{doctor.specialty}</p>
                    </div>
                  </div>

                  <span className="text-sm text-ink-700">{doctor.specialty}</span>
                  <span className="text-sm text-ink-700">Main Clinic</span>
                  <span className="text-sm text-ink-700">English</span>
                  <span className="text-sm font-medium text-brand-600">
                    {nextSlot ?? 'No published slots'}
                  </span>

                  <span className="flex items-center gap-3 text-sm text-ink-700">
                    <span className="flex items-center gap-1">
                      <Video size={14} aria-hidden /> Video
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone size={14} aria-hidden /> Phone
                    </span>
                  </span>

                  <span className="flex items-center justify-end gap-1">
                    <ActionButton
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : doctor.doctorId)}
                      aria-expanded={expanded}
                    >
                      View availability
                    </ActionButton>
                    <span className="grid h-9 w-9 place-items-center rounded-md border border-hairline text-ink-500">
                      {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </span>
                  </span>
                </div>

                {expanded && (
                  <div className="px-4 pb-4">
                    <p className="mb-2 text-sm font-medium text-ink-900">Weekly availability</p>

                    {days.length === 0 ? (
                      <p className="rounded-md border border-dashed border-hairline px-3 py-6 text-center text-sm text-ink-500">
                        This clinician has not published any upcoming slots.
                      </p>
                    ) : (
                      <div
                        className="grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline"
                        style={{
                          gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
                        }}
                      >
                        {days.map((day) => (
                          <div key={day.key} className="bg-white p-3">
                            <p className="mb-2 text-center text-xs font-medium text-ink-900">
                              {day.label}
                            </p>
                            <div className="flex flex-wrap justify-center gap-1.5">
                              {day.times.map((slot) => (
                                <button
                                  key={slot.at}
                                  type="button"
                                  className="rounded-md border border-action-100 px-2.5 py-1 text-xs font-medium text-action-700 hover:bg-action-50 tabular"
                                >
                                  {slot.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <ActionButton type="button" disabled={days.length === 0}>
                        Request consultation
                      </ActionButton>
                      <span className="text-sm text-ink-500">
                        Appointment requests are confirmed by the clinic.
                      </span>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      <p className="mt-8 text-center text-sm text-ink-500">
        Appointment requests are confirmed by the clinic.
      </p>
    </>
  )
}

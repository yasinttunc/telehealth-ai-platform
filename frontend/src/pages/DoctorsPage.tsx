/*
 * DoctorsPage — ADMIN manages profiles; other roles see the directory.
 * Creating a doctor also creates their DOCTOR AppUser account. Editing keeps
 * account and profile details together, ready for the backend's transactional
 * doctor endpoints.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Archive, Pencil, Plus, X } from 'lucide-react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth/useAuth'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DataTable, type Column } from '../components/DataTable'
import { Drawer } from '../components/Drawer'
import { EmptyState } from '../components/EmptyState'
import { FormField } from '../components/FormField'
import { inputClass } from '../components/formStyles'
import { ErrorRow, IconButton, LoadingRow, PageHeader, PrimaryButton } from '../components/ui'
import { SuccessMessage } from '../components/SuccessMessage'
import { formatDateTime, fromInputDateTime, toInputDateTime } from '../lib/format'
import type { AppUser, Doctor } from '../types/domain'
import type { CreateDoctorRequest, UpdateDoctorRequest } from '../api/types'

interface DoctorForm {
  username: string
  email: string
  password: string
  enabled: boolean
  firstName: string
  lastName: string
  specialty: string
  availableTimes: string[]
}

const emptyForm: DoctorForm = {
  username: '', email: '', password: '', enabled: true,
  firstName: '', lastName: '', specialty: '', availableTimes: [''],
}

export function DoctorsPage() {
  const { user } = useAuth()
  const canManage = user?.role === 'ADMIN'
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Doctor | null>(null)
  const [form, setForm] = useState<DoctorForm>(emptyForm)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const doctorRows = await api.doctors.list()
      const userRows = canManage ? await api.users.list() : []
      setDoctors(doctorRows)
      setUsers(userRows)
      setError(null)
    } catch { setError('Could not load doctors.') } finally { setLoading(false) }
  }, [canManage])
  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? doctors.filter((d) => `${d.firstName} ${d.lastName} ${d.specialty}`.toLowerCase().includes(q)) : doctors
  }, [doctors, search])
  const accountName = (appUserId?: number) => users.find((account) => account.userId === appUserId)?.username ?? 'No account linked'

  function openCreate() { setEditing(null); setForm({ ...emptyForm, availableTimes: [''] }); setFieldErrors({}); setError(null); setSuccess(null); setDrawerOpen(true) }
  function openEdit(doctor: Doctor) {
    const account = users.find((user) => user.userId === doctor.appUserId)
    setEditing(doctor)
    setForm({
      username: account?.username ?? '', email: account?.email ?? '', password: '', enabled: account?.enabled ?? true,
      firstName: doctor.firstName, lastName: doctor.lastName, specialty: doctor.specialty,
      availableTimes: doctor.availableTimes.map(toInputDateTime) || [''],
    })
    setFieldErrors({}); setError(null); setSuccess(null); setDrawerOpen(true)
  }
  function updateSlot(index: number, value: string) {
    setForm({ ...form, availableTimes: form.availableTimes.map((slot, i) => i === index ? value : slot) })
  }
  function validate() {
    const errors: Record<string, string> = {}
    if (!form.username.trim()) errors.username = 'Username is required'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address'
    if (!editing && form.password.length < 8) errors.password = 'Password must be at least 8 characters'
    if (!form.firstName.trim()) errors.firstName = 'First name is required'
    if (!form.lastName.trim()) errors.lastName = 'Last name is required'
    if (!form.specialty.trim()) errors.specialty = 'Specialty is required'
    if (form.availableTimes.some((slot) => slot && Number.isNaN(new Date(slot).getTime()))) errors.availableTimes = 'Choose valid availability times'
    return errors
  }
  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const errors = validate(); setFieldErrors(errors)
    if (Object.keys(errors).length) return
    const details = {
      username: form.username, email: form.email, firstName: form.firstName, lastName: form.lastName,
      specialty: form.specialty, availableTimes: form.availableTimes.filter(Boolean).map(fromInputDateTime),
    }
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        const updated = await api.doctors.update(editing.doctorId, { ...details, enabled: form.enabled } satisfies UpdateDoctorRequest)
        setDoctors((previous) => previous.map((doctor) => doctor.doctorId === updated.doctorId ? updated : doctor))
        setSuccess('Doctor updated.')
      } else {
        const created = await api.doctors.create({ ...details, password: form.password } satisfies CreateDoctorRequest)
        setDoctors((previous) => [created, ...previous])
        setSuccess('Doctor created.')
      }
      setDrawerOpen(false)
    } catch (caught) {
      if (caught instanceof ApiError && caught.fieldErrors) setFieldErrors(caught.fieldErrors)
      else setError(caught instanceof ApiError ? caught.message : 'Could not save doctor.')
    } finally { setSaving(false) }
  }
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)
    try {
      await api.doctors.remove(deleteTarget.doctorId)
      setDoctors((previous) => previous.filter((doctor) => doctor.doctorId !== deleteTarget.doctorId))
      setDeleteTarget(null)
      setSuccess('Doctor account archived.')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not archive doctor.')
    } finally { setDeleting(false) }
  }
  const columns: Column<Doctor>[] = [
    { header: 'Name', cell: (d) => `Dr ${d.firstName} ${d.lastName}` },
    { header: 'Account', cell: (d) => <span className="font-mono text-ink-700">{accountName(d.appUserId)}</span> },
    { header: 'Specialty', cell: (d) => d.specialty },
    { header: 'Available times', cell: (d) => d.availableTimes.length ? <span className="text-ink-500">{d.availableTimes.map(formatDateTime).join(', ')}</span> : <span className="text-ink-400">—</span> },
  ]
  return <div>
    <PageHeader title={canManage ? 'Doctor management' : 'Doctor directory'} description={canManage ? 'Add, edit, or archive doctors' : 'Find a clinician and their specialty'} actions={canManage ? <PrimaryButton type="button" onClick={openCreate}><Plus size={16} aria-hidden />Add doctor</PrimaryButton> : undefined} />
    {success && <SuccessMessage message={success} />}
    <div className="mb-4"><label htmlFor="doctor-search" className="sr-only">Search doctors</label><input id="doctor-search" type="search" placeholder="Search by name or specialty…" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputClass} max-w-xs`} /></div>
    {error && <div className="mb-3"><ErrorRow message={error} /></div>}
    {loading ? <LoadingRow /> : filtered.length === 0 ? <EmptyState title="No doctors found" message={canManage ? 'Add the first doctor to get started.' : 'No matching doctors.'} /> : <DataTable columns={columns} rows={filtered} rowKey={(d) => d.doctorId} actions={canManage ? (d) => <><IconButton label="Edit doctor" onClick={() => openEdit(d)}><Pencil size={16} /></IconButton><IconButton label="Archive doctor" danger onClick={() => setDeleteTarget(d)}><Archive size={16} /></IconButton></> : undefined} />}
    <Drawer open={drawerOpen} title={editing ? 'Edit doctor' : 'Add doctor'} onClose={() => setDrawerOpen(false)}><form onSubmit={handleSubmit} noValidate>
      <FormField id="d-username" label="Username" required error={fieldErrors.username}><input id="d-username" className={inputClass} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></FormField>
      <FormField id="d-email" label="Email" required error={fieldErrors.email}><input id="d-email" type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
      {!editing && <FormField id="d-password" label="Initial password" required error={fieldErrors.password} hint="The doctor can use this to sign in."><input id="d-password" type="password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></FormField>}
      {editing && <label className="mb-4 flex items-center gap-2 text-sm text-ink-700"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-4 w-4" />Account enabled</label>}
      <FormField id="d-firstName" label="First name" required error={fieldErrors.firstName}><input id="d-firstName" className={inputClass} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></FormField>
      <FormField id="d-lastName" label="Last name" required error={fieldErrors.lastName}><input id="d-lastName" className={inputClass} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></FormField>
      <FormField id="d-specialty" label="Specialty" required error={fieldErrors.specialty}><input id="d-specialty" className={inputClass} value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} /></FormField>
      <FormField id="d-availability" label="Available times" error={fieldErrors.availableTimes}>{form.availableTimes.map((slot, index) => <div className="mb-2 flex gap-2" key={index}><input id={index === 0 ? 'd-availability' : undefined} type="datetime-local" className={inputClass} value={slot} onChange={(e) => updateSlot(index, e.target.value)} /><IconButton label="Remove available time" disabled={form.availableTimes.length === 1} onClick={() => setForm({ ...form, availableTimes: form.availableTimes.filter((_, i) => i !== index) })}><X size={16} /></IconButton></div>)}<button type="button" className="text-sm font-medium text-brand-700 hover:text-accent-800" onClick={() => setForm({ ...form, availableTimes: [...form.availableTimes, ''] })}>Add available time</button></FormField>
      <div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setDrawerOpen(false)} className="h-10 rounded-md border border-hairline px-4 text-sm text-ink-700 hover:bg-surface">Cancel</button><PrimaryButton type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</PrimaryButton></div>
    </form></Drawer>
    <ConfirmDialog open={deleteTarget !== null} title="Archive doctor" message={deleteTarget ? `Archive Dr ${deleteTarget.firstName} ${deleteTarget.lastName}? They will no longer be able to sign in, but their consultation history will be kept.` : ''} confirmLabel="Archive" busy={deleting} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
  </div>
}

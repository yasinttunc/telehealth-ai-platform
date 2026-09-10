/*
 * PatientsPage - ADMIN creates and manages a patient account and profile as
 * one operation. DOCTOR may view patient records but cannot change login data.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Archive, Pencil, Plus } from 'lucide-react'
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
import { formatDate } from '../lib/format'
import type { AppUser, Patient } from '../types/domain'
import type { CreatePatientRequest, UpdatePatientRequest } from '../api/types'

interface PatientForm {
  username: string
  email: string
  password: string
  enabled: boolean
  firstName: string
  lastName: string
  nhsNumber: string
  dateOfBirth: string
}

const emptyForm: PatientForm = {
  username: '', email: '', password: '', enabled: true,
  firstName: '', lastName: '', nhsNumber: '', dateOfBirth: '',
}

export function PatientsPage() {
  const { user } = useAuth()
  const canManage = user?.role === 'ADMIN'
  const [patients, setPatients] = useState<Patient[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Patient | null>(null)
  const [form, setForm] = useState<PatientForm>(emptyForm)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await api.patients.list()
      const accounts = canManage ? await api.users.list() : []
      setPatients(rows)
      setUsers(accounts)
      setError(null)
    } catch {
      setError('Could not load patients.')
    } finally {
      setLoading(false)
    }
  }, [canManage])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query
      ? patients.filter((patient) => `${patient.firstName} ${patient.lastName} ${patient.nhsNumber}`.toLowerCase().includes(query))
      : patients
  }, [patients, search])

  const accountName = (appUserId?: number) => users.find((account) => account.userId === appUserId)?.username ?? 'Account hidden'

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFieldErrors({})
    setError(null)
    setSuccess(null)
    setDrawerOpen(true)
  }

  function openEdit(patient: Patient) {
    const account = users.find((item) => item.userId === patient.appUserId)
    setEditing(patient)
    setForm({
      username: account?.username ?? '', email: account?.email ?? '', password: '', enabled: account?.enabled ?? true,
      firstName: patient.firstName, lastName: patient.lastName, nhsNumber: patient.nhsNumber, dateOfBirth: patient.dateOfBirth,
    })
    setFieldErrors({})
    setError(null)
    setSuccess(null)
    setDrawerOpen(true)
  }

  function validate() {
    const errors: Record<string, string> = {}
    if (!form.username.trim()) errors.username = 'Username is required'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address'
    if (!editing && form.password.length < 8) errors.password = 'Password must be at least 8 characters'
    if (!form.firstName.trim()) errors.firstName = 'First name is required'
    if (!form.lastName.trim()) errors.lastName = 'Last name is required'
    if (!/^[0-9]{10}$/.test(form.nhsNumber.trim())) errors.nhsNumber = 'NHS number must be 10 digits'
    if (!form.dateOfBirth) errors.dateOfBirth = 'Date of birth is required'
    return errors
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length) return

    const details = {
      username: form.username,
      email: form.email,
      firstName: form.firstName,
      lastName: form.lastName,
      dateOfBirth: form.dateOfBirth,
    }

    setSaving(true)
    setError(null)
    try {
      if (editing) {
        const updated = await api.patients.update(editing.patientId, { ...details, enabled: form.enabled } satisfies UpdatePatientRequest)
        setPatients((previous) => previous.map((patient) => patient.patientId === updated.patientId ? updated : patient))
        setSuccess('Patient updated.')
      } else {
        const created = await api.patients.create({ ...details, password: form.password, nhsNumber: form.nhsNumber } satisfies CreatePatientRequest)
        setPatients((previous) => [created, ...previous])
        setSuccess('Patient created.')
      }
      setDrawerOpen(false)
    } catch (caught) {
      if (caught instanceof ApiError && caught.fieldErrors) setFieldErrors(caught.fieldErrors)
      else setError(caught instanceof ApiError ? caught.message : 'Could not save patient.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)
    try {
      await api.patients.remove(deleteTarget.patientId)
      setDeleteTarget(null)
      setPatients((previous) => previous.filter((patient) => patient.patientId !== deleteTarget.patientId))
      setSuccess('Patient account archived.')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not archive patient.')
    } finally {
      setDeleting(false)
    }
  }

  const columns: Column<Patient>[] = [
    { header: 'Name', cell: (patient) => `${patient.firstName} ${patient.lastName}` },
    ...(canManage ? [{ header: 'Account', cell: (patient: Patient) => <span className="font-mono text-ink-700">{accountName(patient.appUserId)}</span> }] : []),
    ...(user?.role === 'ADMIN' ? [{ header: 'NHS number', cell: (patient: Patient) => <span className="font-mono text-ink-700">{patient.nhsNumber}</span> }] : []),
    { header: 'Date of birth', cell: (patient) => formatDate(patient.dateOfBirth) },
  ]

  return <div>
    <PageHeader title="Patients" description={canManage ? 'Manage patient accounts and records' : 'Patient records'} actions={canManage ? <PrimaryButton type="button" onClick={openCreate}><Plus size={16} aria-hidden />Add patient</PrimaryButton> : undefined} />
    {success && <SuccessMessage message={success} />}
    <div className="mb-4"><label htmlFor="patient-search" className="sr-only">Search patients</label><input id="patient-search" type="search" placeholder="Search by name or NHS number..." value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputClass} max-w-xs`} /></div>
    {error && <div className="mb-3"><ErrorRow message={error} /></div>}
    {loading ? <LoadingRow /> : filtered.length === 0 ? <EmptyState title="No patients found" message={canManage ? 'Add the first patient to get started.' : 'No matching patients.'} /> : <DataTable columns={columns} rows={filtered} rowKey={(patient) => patient.patientId} actions={canManage ? (patient) => <><IconButton label="Edit patient" onClick={() => openEdit(patient)}><Pencil size={16} /></IconButton><IconButton label="Archive patient" danger onClick={() => setDeleteTarget(patient)}><Archive size={16} /></IconButton></> : undefined} />}
    <Drawer open={drawerOpen} title={editing ? 'Edit patient' : 'Add patient'} onClose={() => setDrawerOpen(false)}><form onSubmit={handleSubmit} noValidate>
      <FormField id="p-username" label="Username" required error={fieldErrors.username}><input id="p-username" className={inputClass} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></FormField>
      <FormField id="p-email" label="Email" required error={fieldErrors.email}><input id="p-email" type="email" className={inputClass} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></FormField>
      {!editing && <FormField id="p-password" label="Initial password" required error={fieldErrors.password} hint="The patient can use this to sign in."><input id="p-password" type="password" className={inputClass} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></FormField>}
      {editing && <label className="mb-4 flex items-center gap-2 text-sm text-ink-700"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} className="h-4 w-4" />Account enabled</label>}
      <FormField id="p-firstName" label="First name" required error={fieldErrors.firstName}><input id="p-firstName" className={inputClass} value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></FormField>
      <FormField id="p-lastName" label="Last name" required error={fieldErrors.lastName}><input id="p-lastName" className={inputClass} value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></FormField>
      <FormField id="p-nhs" label="NHS number" required error={fieldErrors.nhsNumber} hint={editing ? 'NHS number cannot be changed after creation.' : '10 digits'}><input id="p-nhs" className={inputClass} value={form.nhsNumber} onChange={(event) => setForm({ ...form, nhsNumber: event.target.value })} inputMode="numeric" disabled={Boolean(editing)} /></FormField>
      <FormField id="p-dob" label="Date of birth" required error={fieldErrors.dateOfBirth}><input id="p-dob" type="date" className={inputClass} value={form.dateOfBirth} onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })} /></FormField>
      <div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setDrawerOpen(false)} className="h-10 rounded-md border border-hairline px-4 text-sm text-ink-700 hover:bg-surface">Cancel</button><PrimaryButton type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</PrimaryButton></div>
    </form></Drawer>
    <ConfirmDialog open={deleteTarget !== null} title="Archive patient" message={deleteTarget ? `Archive ${deleteTarget.firstName} ${deleteTarget.lastName}? They will no longer be able to sign in, but their clinical history will be kept.` : ''} confirmLabel="Archive" busy={deleting} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
  </div>
}

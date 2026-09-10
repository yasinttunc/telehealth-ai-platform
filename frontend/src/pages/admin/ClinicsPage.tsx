/*
 * Clinic management page for administrators.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { api, ApiError } from '../../api'
import { DataTable, type Column } from '../../components/DataTable'
import { Drawer } from '../../components/Drawer'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { EmptyState } from '../../components/EmptyState'
import { FormField } from '../../components/FormField'
import { inputClass } from '../../components/formStyles'
import { PageHeader, PrimaryButton, IconButton, LoadingRow, ErrorRow } from '../../components/ui'
import { SuccessMessage } from '../../components/SuccessMessage'
import type { Clinic } from '../../types/domain'

interface ClinicForm {
  clinicName: string
  clinicAddress: string
}

const emptyForm: ClinicForm = { clinicName: '', clinicAddress: '' }

export function ClinicsPage() {
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Clinic | null>(null)
  const [form, setForm] = useState<ClinicForm>(emptyForm)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Clinic | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setClinics(await api.clinics.list())
      setError(null)
    } catch {
      setError('Could not load clinics.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFieldErrors({})
    setError(null)
    setSuccess(null)
    setDrawerOpen(true)
  }

  function openEdit(c: Clinic) {
    setEditing(c)
    setForm({ clinicName: c.clinicName, clinicAddress: c.clinicAddress })
    setFieldErrors({})
    setError(null)
    setSuccess(null)
    setDrawerOpen(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.clinicName.trim()) errs.clinicName = 'Clinic name is required'
    if (!form.clinicAddress.trim()) errs.clinicAddress = 'Clinic address is required'
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        const updated = await api.clinics.update(editing.clinicId, form)
        setClinics((previous) => previous.map((clinic) => clinic.clinicId === updated.clinicId ? updated : clinic))
        setSuccess('Clinic updated.')
      } else {
        const created = await api.clinics.create(form)
        setClinics((previous) => [created, ...previous])
        setSuccess('Clinic created.')
      }
      setDrawerOpen(false)
    } catch (caught) {
      if (caught instanceof ApiError && caught.fieldErrors) setFieldErrors(caught.fieldErrors)
      else setError(caught instanceof ApiError ? caught.message : 'Could not save clinic.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)
    try {
      await api.clinics.remove(deleteTarget.clinicId)
      setClinics((previous) => previous.filter((clinic) => clinic.clinicId !== deleteTarget.clinicId))
      setDeleteTarget(null)
      setSuccess('Clinic deleted.')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not delete clinic.')
    } finally {
      setDeleting(false)
    }
  }

  const columns: Column<Clinic>[] = [
    { header: 'Name', cell: (c) => <span className="font-medium text-ink-900">{c.clinicName}</span> },
    { header: 'Address', cell: (c) => <span className="text-ink-500">{c.clinicAddress}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Clinics"
        description="Manage clinic locations"
        actions={
          <PrimaryButton type="button" onClick={openCreate}>
            <Plus size={16} aria-hidden />
            Add clinic
          </PrimaryButton>
        }
      />

      {success && <SuccessMessage message={success} />}
      {error && <div className="mb-3"><ErrorRow message={error} /></div>}

      {loading ? (
        <LoadingRow />
      ) : clinics.length === 0 ? (
        <EmptyState
          title="No clinics"
          message="Add the first clinic."
          action={
            <PrimaryButton type="button" onClick={openCreate} className="mx-auto">
              <Plus size={16} aria-hidden />
              Add clinic
            </PrimaryButton>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={clinics}
          rowKey={(c) => c.clinicId}
          actions={(c) => (
            <>
              <IconButton label="Edit clinic" onClick={() => openEdit(c)}>
                <Pencil size={16} />
              </IconButton>
              <IconButton label="Delete clinic" danger onClick={() => setDeleteTarget(c)}>
                <Trash2 size={16} />
              </IconButton>
            </>
          )}
        />
      )}

      <Drawer open={drawerOpen} title={editing ? 'Edit clinic' : 'Add clinic'} onClose={() => setDrawerOpen(false)}>
        <form onSubmit={handleSubmit} noValidate>
          <FormField id="cl-name" label="Clinic name" required error={fieldErrors.clinicName}>
            <input
              id="cl-name"
              className={inputClass}
              value={form.clinicName}
              onChange={(e) => setForm({ ...form, clinicName: e.target.value })}
            />
          </FormField>
          <FormField id="cl-address" label="Clinic address" required error={fieldErrors.clinicAddress}>
            <input
              id="cl-address"
              className={inputClass}
              value={form.clinicAddress}
              onChange={(e) => setForm({ ...form, clinicAddress: e.target.value })}
            />
          </FormField>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="h-10 rounded-md border border-hairline px-4 text-sm text-ink-700 hover:bg-surface"
            >
              Cancel
            </button>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </PrimaryButton>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete clinic"
        message={deleteTarget ? `Delete "${deleteTarget.clinicName}"? This cannot be undone.` : ''}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

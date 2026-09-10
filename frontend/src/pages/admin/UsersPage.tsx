/*
 * User management page for administrators. Password is only set on creation. Enabled
 * flag lets an admin disable login without deleting history.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { Archive, Pencil, Plus } from 'lucide-react'
import { api, ApiError } from '../../api'
import { DataTable, type Column } from '../../components/DataTable'
import { Drawer } from '../../components/Drawer'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { EmptyState } from '../../components/EmptyState'
import { FormField } from '../../components/FormField'
import { inputClass } from '../../components/formStyles'
import { PageHeader, PrimaryButton, IconButton, LoadingRow, ErrorRow } from '../../components/ui'
import { SuccessMessage } from '../../components/SuccessMessage'
import type { AppUser, Doctor, Patient, Role } from '../../types/domain'

interface UserForm {
  username: string
  email: string
  role: Role
  password: string
  enabled: boolean
}

const emptyForm: UserForm = { username: '', email: '', role: 'ADMIN', password: '', enabled: true }

export function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [form, setForm] = useState<UserForm>(emptyForm)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [userRows, doctorRows, patientRows] = await Promise.all([
        api.users.list(),
        api.doctors.list(),
        api.patients.list(),
      ])
      setUsers(userRows)
      setDoctors(doctorRows)
      setPatients(patientRows)
      setError(null)
    } catch {
      setError('Could not load users.')
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

  function openEdit(u: AppUser) {
    setEditing(u)
    setForm({ username: u.username, email: u.email, role: u.role, password: '', enabled: u.enabled })
    setFieldErrors({})
    setError(null)
    setSuccess(null)
    setDrawerOpen(true)
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!form.username.trim()) errs.username = 'Username is required'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) errs.email = 'Enter a valid email'
    if (!editing && form.password.length < 8) errs.password = 'Password must be at least 8 characters'
    return errs
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        const updated = await api.users.update(editing.userId, {
          username: form.username,
          email: form.email,
          role: form.role,
          enabled: form.enabled,
        })
        setUsers((previous) => previous.map((user) => user.userId === updated.userId ? updated : user))
        setSuccess('User updated.')
      } else {
        const created = await api.users.create({
          username: form.username,
          email: form.email,
          role: form.role,
          password: form.password,
        })
        setUsers((previous) => [created, ...previous])
        setSuccess('User created.')
      }
      setDrawerOpen(false)
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setFieldErrors(err.fieldErrors)
      else if (err instanceof ApiError) setError(err.message)
      else setError('Could not save user.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)
    try {
      await api.users.remove(deleteTarget.userId)
      setUsers((previous) => previous.map((user) => user.userId === deleteTarget.userId ? { ...user, enabled: false } : user))
      setDeleteTarget(null)
      setSuccess('User account archived.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete user.')
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const columns: Column<AppUser>[] = [
    { header: 'Username', cell: (u) => u.username },
    { header: 'Email', cell: (u) => <span className="text-ink-500">{u.email}</span> },
    { header: 'Role', cell: (u) => u.role },
    {
      header: 'Enabled',
      cell: (u) =>
        u.enabled ? (
          <span className="text-brand-700">Yes</span>
        ) : (
          <span className="text-ink-400">No</span>
        ),
    },
  ]

  const linkedAccountIds = new Set([
    ...doctors.flatMap((doctor) => doctor.appUserId == null ? [] : [doctor.appUserId]),
    ...patients.flatMap((patient) => patient.appUserId == null ? [] : [patient.appUserId]),
  ])
  const activeUsers = users.filter((account) => account.enabled)
  const archivedUsers = users.filter((account) => !account.enabled)
  const isLinkedAccount = (account: AppUser) => linkedAccountIds.has(account.userId)

  return (
    <div>
      <PageHeader
        title="User management"
        description="Administer login accounts"
        actions={
          <PrimaryButton type="button" onClick={openCreate}>
            <Plus size={16} aria-hidden />
            Add user
          </PrimaryButton>
        }
      />

      {success && <SuccessMessage message={success} />}
      {error && <div className="mb-3"><ErrorRow message={error} /></div>}

      {loading ? (
        <LoadingRow />
      ) : activeUsers.length === 0 ? (
        <EmptyState
          title="No users"
          message="Add the first user account."
          action={
            <PrimaryButton type="button" onClick={openCreate} className="mx-auto">
              <Plus size={16} aria-hidden />
              Add user
            </PrimaryButton>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={activeUsers}
          rowKey={(u) => u.userId}
          actions={(u) => (
            <>
              <IconButton label="Edit user" onClick={() => openEdit(u)}>
                <Pencil size={16} />
              </IconButton>
              <IconButton label="Archive user" danger onClick={() => setDeleteTarget(u)}>
                <Archive size={16} />
              </IconButton>
            </>
          )}
        />
      )}

      {!loading && archivedUsers.length > 0 && (
        <section className="mt-8">
          <h3 className="text-base font-semibold text-ink-900">Archived accounts</h3>
          <p className="mb-3 mt-1 text-sm text-ink-500">
            Archived accounts cannot sign in. Their clinical profiles and consultation history are retained.
          </p>
          <DataTable columns={columns} rows={archivedUsers} rowKey={(u) => u.userId} />
        </section>
      )}

      <Drawer open={drawerOpen} title={editing ? 'Edit user' : 'Add user'} onClose={() => setDrawerOpen(false)}>
        <form onSubmit={handleSubmit} noValidate>
          <FormField id="u-username" label="Username" required error={fieldErrors.username}>
            <input
              id="u-username"
              className={inputClass}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </FormField>
          <FormField id="u-email" label="Email" required error={fieldErrors.email}>
            <input
              id="u-email"
              type="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </FormField>
          <FormField id="u-role" label="Role" required>
            {editing ? (
              <p id="u-role" className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink-700">
                {form.role}{isLinkedAccount(editing) ? ' (linked clinical profile)' : ''}
              </p>
            ) : (
              <p id="u-role" className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink-700">
                ADMIN
              </p>
            )}
          </FormField>

          {!editing && (
            <FormField id="u-password" label="Password" required error={fieldErrors.password} hint="Set only on creation">
              <input
                id="u-password"
                type="password"
                className={inputClass}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </FormField>
          )}

          {editing && (
            <label className="mb-4 flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="h-4 w-4"
              />
              Account enabled
            </label>
          )}

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
        title="Archive user"
        message={deleteTarget ? `Archive account "${deleteTarget.username}"? The account will no longer be able to sign in, but its history will be kept.` : ''}
        confirmLabel="Archive"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

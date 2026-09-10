/*
 * Profile & settings (master design, screen 14).
 *
 * A settings rail on the left, the active section in the middle, and the
 * account/security summary on the right.
 *
 * Governance rule made visible: role, linked profile and clinician identifiers
 * are ADMINISTRATOR-owned. They are rendered as locked fields with a footnote
 * rather than hidden, so a clinician can see the value and knows who to ask to
 * change it. Self-service editing is limited to contact details.
 */

import { useState } from 'react'
import {
  Bell,
  Lock,
  Monitor,
  ShieldCheck,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { Avatar, PageHeader, Panel, PrimaryButton, SecondaryButton } from '../components/ui'
import { Chip } from '../components/consultation/chips'
import { FormField } from '../components/FormField'
import { inputClass, lockedInputClass } from '../components/formStyles'

type SectionKey = 'personal' | 'security' | 'notifications' | 'consultation' | 'privacy'

const SECTIONS: { key: SectionKey; label: string; icon: LucideIcon }[] = [
  { key: 'personal', label: 'Personal details', icon: UserRound },
  { key: 'security', label: 'Account security', icon: Lock },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'consultation', label: 'Consultation preferences', icon: Stethoscope },
  { key: 'privacy', label: 'Privacy', icon: ShieldCheck },
]

export function ProfilePage() {
  const { user } = useAuth()
  const [section, setSection] = useState<SectionKey>('personal')
  const [saved, setSaved] = useState(false)

  if (!user) return null

  const isClinician = user.role === 'DOCTOR'

  /*
   * displayName arrives as a single string that may carry an honorific
   * ("Dr. Maya Patel"). Strip it before splitting, otherwise the first-name
   * field shows "Dr".
   */
  const nameParts = user.displayName.replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i, '').split(/[\s.]+/).filter(Boolean)
  const roleLabel = user.role.charAt(0) + user.role.slice(1).toLowerCase()

  return (
    <>
      <PageHeader title="Profile &amp; settings" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(0,18rem)]">
        {/* --- Settings rail ------------------------------------------ */}
        <nav aria-label="Settings sections" className="space-y-0.5">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              aria-current={section === key ? 'true' : undefined}
              className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                section === key
                  ? 'bg-surface font-semibold text-ink-900 shadow-[inset_2px_0_0_0_var(--color-brand-600)]'
                  : 'text-ink-700 hover:bg-surface'
              }`}
            >
              <Icon size={16} aria-hidden className="shrink-0 text-ink-500" />
              {label}
            </button>
          ))}
        </nav>

        {/* --- Active section ----------------------------------------- */}
        <div>
          {section === 'personal' && (
            <Panel title="Personal details">
              <div className="mb-6 flex items-center gap-4">
                <Avatar name={user.displayName} size="xl" />
                <div>
                  <p className="text-xl font-semibold text-ink-900">{user.displayName}</p>
                  <p className="mt-1">
                    <Chip tone="brand">{user.role}</Chip>
                  </p>
                </div>
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  setSaved(true)
                }}
              >
                <FormField id="firstName" label="First name">
                  <input
                    id="firstName"
                    className={inputClass}
                    defaultValue={nameParts[0] ?? ''}
                  />
                </FormField>
                <FormField id="lastName" label="Last name">
                  <input
                    id="lastName"
                    className={inputClass}
                    defaultValue={nameParts.slice(1).join(' ')}
                  />
                </FormField>
                <FormField id="email" label="Email">
                  <input id="email" type="email" className={inputClass} defaultValue={user.email} />
                </FormField>
                <FormField id="phone" label="Phone">
                  <input id="phone" type="tel" className={inputClass} placeholder="+44 …" />
                </FormField>

                {isClinician && (
                  <>
                    {/* Administrator-owned. Visible but not editable here. */}
                    <FormField
                      id="specialty"
                      label="Specialty"
                      hint="Managed by an administrator."
                    >
                      <input id="specialty" className={lockedInputClass} readOnly value="—" />
                    </FormField>
                    <FormField
                      id="gmc"
                      label="GMC number"
                      hint="Managed by an administrator."
                    >
                      <input id="gmc" className={lockedInputClass} readOnly value="—" />
                    </FormField>
                  </>
                )}

                <div className="mt-6 flex items-center justify-between border-t border-hairline pt-4">
                  <p className="text-xs text-ink-500">
                    Your role and clinician identifiers are managed by an administrator.
                  </p>
                  <PrimaryButton type="submit">
                    {saved ? 'Saved' : 'Save changes'}
                  </PrimaryButton>
                </div>
              </form>
            </Panel>
          )}

          {section === 'security' && (
            <Panel title="Account security">
              <FormField id="current" label="Current password">
                <input id="current" type="password" className={inputClass} />
              </FormField>
              <FormField
                id="next"
                label="New password"
                hint="At least 12 characters. Avoid a password used on another service."
              >
                <input id="next" type="password" className={inputClass} />
              </FormField>
              <div className="mt-4 flex justify-end">
                <PrimaryButton type="button">Change password</PrimaryButton>
              </div>
            </Panel>
          )}

          {section === 'notifications' && (
            <Panel title="Notifications">
              <ToggleRow
                label="Transcript ready for review"
                detail="Notify me when a consultation transcript is finalised."
                defaultChecked
              />
              <ToggleRow
                label="Extraction completed"
                detail="Notify me when an AI extraction job finishes."
                defaultChecked
              />
              <ToggleRow
                label="Clinical alerts"
                detail="Notify me when an alert is assigned to me."
                defaultChecked
              />
            </Panel>
          )}

          {section === 'consultation' && (
            <Panel title="Consultation preferences">
              <ToggleRow
                label="Show live captions by default"
                detail="Captions remain transient and are never stored."
                defaultChecked
              />
              <ToggleRow
                label="Join with camera on"
                detail="You can still turn the camera off inside the room."
                defaultChecked
              />
            </Panel>
          )}

          {section === 'privacy' && (
            <Panel title="Privacy">
              <p className="text-sm leading-6 text-ink-700">
                Clinical records are protected by role-based access and an audit trail. AI
                output is always evidence-linked and requires clinician review before it
                becomes part of a patient record.
              </p>
              <p className="mt-3 text-sm leading-6 text-ink-700">
                Live captions produced during a consultation are transient: they are shown in
                the browser and never written to the clinical record. The durable transcript
                is built from final speech segments stored by the backend.
              </p>
            </Panel>
          )}
        </div>

        {/* --- Account and security summary ---------------------------- */}
        <div className="space-y-5">
          <Panel title="Account">
            <dl className="divide-y divide-hairline text-sm">
              <SummaryRow label="Username" value={user.username} />
              <SummaryRow label="Role" value={roleLabel} />
              <SummaryRow
                label="Linked profile"
                value={
                  user.doctorId
                    ? `Doctor #${user.doctorId}`
                    : user.patientId
                      ? `Patient #${user.patientId}`
                      : 'Not linked'
                }
              />
              <SummaryRow label="Status" value="Enabled" tone="brand" />
            </dl>
          </Panel>

          <Panel title="Security">
            <p className="text-xs text-ink-500">Password last changed</p>
            <p className="mt-0.5 text-sm text-ink-900">Not recorded</p>
            <SecondaryButton
              type="button"
              className="mt-3 w-full"
              onClick={() => setSection('security')}
            >
              Change password
            </SecondaryButton>

            <p className="mt-6 text-xs text-ink-500">Active session</p>
            <div className="mt-2 flex items-start gap-2.5">
              <Monitor size={17} className="mt-0.5 shrink-0 text-ink-500" aria-hidden />
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm text-ink-900">
                  This browser
                  <Chip tone="action">This device</Chip>
                </p>
                <p className="text-xs text-ink-500">
                  Signed in as {user.username}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="mt-4 h-9 w-full rounded-md border border-danger-100 text-sm font-medium text-danger-600 hover:bg-danger-50"
            >
              Sign out all sessions
            </button>
          </Panel>
        </div>
      </div>
    </>
  )
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'brand'
}) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-ink-500">{label}</dt>
      <dd className={tone === 'brand' ? 'font-medium text-brand-600' : 'text-ink-900'}>
        {value}
      </dd>
    </div>
  )
}

function ToggleRow({
  label,
  detail,
  defaultChecked,
}: {
  label: string
  detail: string
  defaultChecked?: boolean
}) {
  return (
    <label className="flex items-start justify-between gap-4 border-b border-hairline py-3.5 last:border-0">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-900">{label}</span>
        <span className="block text-xs text-ink-500">{detail}</span>
      </span>
      <input
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-brand-600)]"
      />
    </label>
  )
}

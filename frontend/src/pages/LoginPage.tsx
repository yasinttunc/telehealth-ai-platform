/*
 * LoginPage — authentication and demo access (master design, screen 02).
 *
 * Two columns on a plain white canvas: the sign-in card on the left, and on the
 * right the three assurances the product makes plus the demo accounts. The
 * assurances are deliberately part of the sign-in screen: the clinician-review
 * rule is a product promise, not fine print.
 */

import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, ShieldCheck, Sparkles } from 'lucide-react'
import { useAuth, homePathForRole } from '../auth/useAuth'
import { SESSION_EXPIRED_KEY } from '../auth/authStorage'
import { BrandMark } from '../components/AppShell'
import { inputClass } from '../components/formStyles'

const ASSURANCES = [
  {
    icon: Lock,
    title: 'Secure consultation access',
    detail: 'Encrypted end-to-end for every visit.',
  },
  {
    icon: ShieldCheck,
    title: 'Clinical records protected',
    detail: 'Role-based access and audit trails.',
  },
  {
    icon: Sparkles,
    title: 'AI suggestions require clinician review',
    detail: 'You stay in control of every decision.',
  },
]

/** Local demo accounts seeded by infra/postgres/init/02-seed-data.sql. */
const DEMO_ACCOUNTS = [
  { role: 'Administrator', initial: 'A', username: 'admin', password: 'admin' },
  { role: 'Doctor', initial: 'D', username: 'dr.sarah.patel', password: 'password' },
  { role: 'Patient', initial: 'P', username: 'patient.oliver.hughes', password: 'password' },
]

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(
    () => sessionStorage.getItem(SESSION_EXPIRED_KEY) === 'true',
  )

  if (user) return <Navigate to={homePathForRole(user.role)} replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const authUser = await login(username, password)
      sessionStorage.removeItem(SESSION_EXPIRED_KEY)
      setSessionExpired(false)
      navigate(homePathForRole(authUser.role), { replace: true })
    } catch {
      // One generic message regardless of which field was wrong: naming the
      // wrong field would confirm which usernames exist.
      setError('Invalid username or password.')
    } finally {
      setSubmitting(false)
    }
  }

  function fillDemo(demoUsername: string, demoPassword: string) {
    setUsername(demoUsername)
    setPassword(demoPassword)
    setError(null)
  }

  return (
    <div className="grid min-h-full place-items-center px-4 py-14">
      <div className="grid w-full max-w-5xl items-start gap-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-20">
        {/* --- Sign-in card --- */}
        <div className="rounded-lg border border-hairline bg-white p-8">
          <div className="mb-7 flex items-center gap-3">
            <BrandMark size={36} />
            <span className="text-xl font-semibold tracking-tight text-brand-700">
              Telehealth With AI
            </span>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-ink-500">Sign in to your clinical workspace</p>

          {sessionExpired && (
            <p
              role="status"
              className="mt-5 rounded-md border border-warn-100 bg-warn-50 px-3 py-2 text-sm text-warn-700"
            >
              Your session has expired. Please sign in again.
            </p>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-7">
            <div className="mb-4">
              <label
                htmlFor="username"
                className="mb-1.5 block text-sm font-medium text-ink-900"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="Enter your username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className={`${inputClass} h-11`}
                required
              />
            </div>

            <div className="mb-5">
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-ink-900"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`${inputClass} h-11 pr-11`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-ink-400 hover:bg-surface hover:text-ink-700"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="mb-4 rounded-md border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="h-11 w-full rounded-md bg-brand-600 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 text-center">
            <a href="#help" className="text-sm font-medium text-action-600 hover:underline">
              Need help signing in?
            </a>
          </p>
        </div>

        {/* --- Product assurances and demo access --- */}
        <div className="max-w-md">
          <ul className="divide-y divide-hairline">
            {ASSURANCES.map(({ icon: Icon, title, detail }) => (
              <li key={title} className="flex items-start gap-4 py-5 first:pt-0">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon size={20} strokeWidth={1.8} aria-hidden />
                </span>
                <span>
                  <span className="block text-base font-semibold text-ink-900">{title}</span>
                  <span className="mt-0.5 block text-sm text-ink-500">{detail}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <h2 className="mb-3 text-base font-semibold text-ink-900">Demo access</h2>
            <div className="overflow-hidden rounded-lg border border-hairline">
              {DEMO_ACCOUNTS.map((account, index) => (
                <button
                  key={account.username}
                  type="button"
                  onClick={() => fillDemo(account.username, account.password)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface ${
                    index > 0 ? 'border-t border-hairline' : ''
                  }`}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                    {account.initial}
                  </span>
                  <span className="flex-1 text-sm text-ink-900">{account.role}</span>
                  <span className="text-sm text-ink-500">{account.username}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-500">
              Selecting an account fills the form. Credentials are verified by the local
              Spring backend.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

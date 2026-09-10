/*
 * AppShell — the single layout wrapper for every authenticated screen.
 *
 * The master design uses horizontal, role-aware navigation and no permanent
 * sidebar, so the full page width belongs to the working surface. The bar
 * carries, left to right: brand mark, optional context label, role navigation,
 * global search, notifications, help, and the user menu.
 *
 * On narrow screens the navigation collapses into a disclosure panel rather
 * than a drawer, because there is no sidebar to slide in.
 */

import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, CircleHelp, Cross, LogOut, Menu, Search, UserRound } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { Avatar } from './ui'
import { CONTEXT_LABEL, navForRole, searchPlaceholder, titleForPath } from './nav'

/** Brand mark: green cross plate, matching the design's logo lockup. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-md bg-brand-600 text-white"
      style={{ width: size, height: size }}
    >
      <Cross size={Math.round(size * 0.62)} strokeWidth={2.5} />
    </span>
  )
}

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  /* Close the user menu on any outside click, so it never blocks the page. */
  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  /* Keep the browser tab title aligned with the active destination. */
  useEffect(() => {
    if (!user) return
    document.title = `${titleForPath(user.role, location.pathname)} · Telehealth With AI`
  }, [user, location.pathname])

  if (!user) return null // RequireRole owns redirects; this is defensive.

  const items = navForRole(user.role)
  const contextLabel = CONTEXT_LABEL[user.role]

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'relative flex items-center gap-1.5 whitespace-nowrap px-1 py-4 text-sm transition-colors',
      isActive
        ? 'font-semibold text-ink-900 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-600'
        : 'text-ink-700 hover:text-ink-900',
    ].join(' ')

  return (
    <div className="flex min-h-full flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-hairline bg-white">
        <div className="mx-auto flex h-16 max-w-[112rem] items-center gap-5 px-4 sm:px-6">
          {/* Brand + role context */}
          <div className="flex shrink-0 items-center gap-2.5">
            <BrandMark />
            <span className="text-base font-semibold tracking-tight text-brand-700">
              Telehealth With AI
            </span>
            {contextLabel && (
              <>
                <span className="h-5 w-px bg-hairline" aria-hidden />
                <span className="hidden text-sm text-ink-500 xl:inline">{contextLabel}</span>
              </>
            )}
          </div>

          {/* Role navigation */}
          <nav
            aria-label="Primary"
            className="hidden min-w-0 flex-1 items-center gap-6 lg:flex"
          >
            {items.map((item) => {
              const Icon = item.icon
              return (
                <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                  <Icon size={16} aria-hidden />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            {/* Global search. Presentational until a search endpoint exists. */}
            <label className="relative hidden xl:block">
              <span className="sr-only">Search</span>
              <Search
                size={15}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
              />
              <input
                type="search"
                placeholder={searchPlaceholder(user.role)}
                className="h-9 w-72 rounded-md border border-hairline bg-white pl-9 pr-12 text-sm text-ink-900 placeholder:text-ink-400 outline-none focus:border-action-500"
              />
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-hairline px-1.5 py-0.5 text-[10px] text-ink-400">
                ⌘K
              </kbd>
            </label>

            <NavLink
              to={user.role === 'PATIENT' ? '/patient' : `${items[items.length - 1]?.to ?? '/'}`}
              aria-label="Notifications"
              title="Notifications"
              className="relative grid h-9 w-9 place-items-center rounded-md text-ink-500 hover:bg-surface hover:text-ink-800"
            >
              <Bell />
            </NavLink>

            <button
              type="button"
              aria-label="Help"
              title="Help"
              className="grid h-9 w-9 place-items-center rounded-md text-ink-500 hover:bg-surface hover:text-ink-800"
            >
              <CircleHelp size={18} />
            </button>

            {/* User menu */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-surface"
              >
                <Avatar name={user.displayName} size="sm" />
                <span className="hidden text-sm font-medium text-ink-900 sm:inline">
                  {user.displayName}
                </span>
                <ChevronDown size={15} className="text-ink-500" aria-hidden />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-40 mt-1 w-56 rounded-lg border border-hairline bg-white py-1 shadow-lg"
                >
                  <div className="border-b border-hairline px-3 py-2">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {user.displayName}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {user.role.charAt(0) + user.role.slice(1).toLowerCase()} · {user.username}
                    </p>
                  </div>
                  <NavLink
                    to="/profile"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-surface"
                  >
                    <UserRound size={15} aria-hidden />
                    Profile &amp; settings
                  </NavLink>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-surface"
                  >
                    <LogOut size={15} aria-hidden />
                    Sign out
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setNavOpen((open) => !open)}
              aria-label="Toggle navigation"
              aria-expanded={navOpen}
              className="grid h-9 w-9 place-items-center rounded-md text-ink-500 hover:bg-surface lg:hidden"
            >
              <Menu size={18} />
            </button>
          </div>
        </div>

        {/* Collapsed navigation for narrow screens */}
        {navOpen && (
          <nav
            aria-label="Primary"
            className="border-t border-hairline px-4 py-2 lg:hidden"
          >
            {items.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setNavOpen(false)}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-2 rounded-md px-2 py-2 text-sm',
                      isActive
                        ? 'bg-brand-50 font-semibold text-brand-700'
                        : 'text-ink-700 hover:bg-surface',
                    ].join(' ')
                  }
                >
                  <Icon size={16} aria-hidden />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-[112rem] flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}

/** Local bell so the header does not import two icon shapes for one control. */
function Bell() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </svg>
  )
}

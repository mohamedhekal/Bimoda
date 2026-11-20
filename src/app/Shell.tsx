import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Activity, FlaskConical, Inbox, LayoutDashboard, ScrollText, Search, Shield, ShieldCheck, Sun, Moon, WifiOff } from 'lucide-react'
import { setState, setSync, useAppState, resetDemoData } from '../stores/store'
import type { PrivacyMode } from '../ai/hybrid-engine/types'
import type { Role } from '../domain/types'
import { Badge } from '../design-system/ui'
import { cx } from '../design-system/utils'
import { isFirebaseConfigured } from '../firebase/app'
import { AuthMenu } from './AuthMenu'
import { CloudSync } from './CloudSync'
import { CommandPalette } from './CommandPalette'
import { useCommands } from './commands'
import { Tour } from './Tour'
import { setTourStep } from './tourState'
import { isRtl, useT } from '../i18n'

const nav = [
  { to: '/app', label: 'Mission Control', short: 'Mission', icon: LayoutDashboard, end: true },
  { to: '/app/workspace', label: 'Workspace', short: 'Workspace', icon: Inbox },
  { to: '/app/lab', label: 'Hybrid AI Lab', short: 'Lab', icon: FlaskConical },
  { to: '/app/trust', label: 'Trust Center', short: 'Trust', icon: ShieldCheck },
  { to: '/app/policies', label: 'Policy Studio', short: 'Policy', icon: Shield },
  { to: '/app/audit', label: 'Audit & Runs', short: 'Audit', icon: ScrollText },
]

const MODES: { id: PrivacyMode; label: string; title: string }[] = [
  { id: 'hybrid', label: 'Hybrid', title: 'Prefer on-device; cloud fallback with redaction' },
  { id: 'local-only', label: 'Local only', title: 'Never send prompts to the cloud' },
  { id: 'cloud', label: 'Cloud', title: 'Use Firebase cloud inference' },
]

export function Shell() {
  const t = useT()
  const s = useAppState((x) => x.settings)
  const sync = useAppState((x) => x.sync)
  const [online, setOnline] = useState(navigator.onLine)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = s.theme
  }, [s.theme])
  useEffect(() => {
    document.documentElement.lang = s.lang
    document.documentElement.dir = isRtl(s.lang) ? 'rtl' : 'ltr'
  }, [s.lang])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const closeAndRun = useCallback(
    (fn: () => void) => () => {
      setPaletteOpen(false)
      fn()
    },
    [],
  )
  const commands = useCommands(closeAndRun, () => setTourStep(0))
  const set = (patch: Partial<typeof s>) => setState((st) => ({ ...st, settings: { ...st.settings, ...patch } }))

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-cyan focus:px-3 focus:py-2 focus:text-[#06101c]"
      >
        {t('Skip to content')}
      </a>
      <aside className="sticky top-0 hidden h-screen flex-col border-e border-line bg-surface p-4 md:flex">
        <NavLink to="/" className="mb-6 flex items-center gap-2 text-lg font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-cyan to-violet text-sm font-bold text-[#06101c]" aria-hidden>
            B
          </span>
          Bimoda
        </NavLink>
        <nav aria-label="Primary" className="flex flex-col gap-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm', isActive ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink')
              }
            >
              <n.icon size={16} aria-hidden /> {t(n.label)}
            </NavLink>
          ))}
        </nav>
        <p className="mt-auto text-xs text-muted">{t('Synthetic demo data. No real payments, refunds or messages are executed.')}</p>
        <button className="mt-2 text-start text-xs text-muted underline" onClick={() => setTourStep(0)}>
          {t('Start demo tour')}
        </button>
        <button className="mt-1 text-start text-xs text-muted underline" onClick={resetDemoData}>
          {t('Reset demo data')}
        </button>
      </aside>

      <div className="flex min-w-0 flex-col pb-20 md:pb-0">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur">
          <Activity size={16} className="text-cyan" aria-hidden />
          <div role="radiogroup" aria-label="Privacy mode" className="flex rounded-lg border border-line p-0.5">
            {MODES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={s.privacyMode === m.id}
                title={m.title}
                onClick={() => set({ privacyMode: m.id })}
                className={cx('rounded-md px-2.5 py-1 text-xs', s.privacyMode === m.id ? 'bg-cyan font-semibold text-[#06101c]' : 'text-muted hover:text-ink')}
              >
                {t(m.label)}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-xs text-muted">
            {t('Role')}
            <select
              className="rounded-md border border-line bg-surface px-1 py-1 text-ink"
              value={s.role}
              onChange={(e) => set({ role: e.target.value as Role })}
            >
              <option value="agent">{t('Agent')}</option>
              <option value="manager" disabled={sync.maxRole === 'agent'}>
                {t('Manager')}
              </option>
              <option value="admin" disabled={sync.maxRole === 'agent' || sync.maxRole === 'manager'}>
                {t('Admin')}
              </option>
            </select>
          </label>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            {!isFirebaseConfigured && <Badge tone="warn">{t('Firebase not configured')}</Badge>}
            <Badge tone={sync.status === 'live' ? 'ok' : sync.status === 'error' ? 'bad' : sync.status === 'connecting' ? 'warn' : 'neutral'}>
              {sync.status === 'live'
                ? `${t('Cloud sync live')} · ${sync.maxRole}`
                : sync.status === 'connecting'
                  ? t('Connecting…')
                  : sync.status === 'error'
                    ? t('Sync error')
                    : t('Local demo data')}
            </Badge>
            {sync.lastError && (
              <p role="alert" className="flex items-center justify-between gap-2 border-b border-bad/40 bg-bad/10 px-4 py-2 text-xs text-bad">
                <span>{sync.lastError}</span>
                <button className="underline" onClick={() => setSync({ lastError: undefined })}>
                  {t('Dismiss')}
                </button>
              </p>
            )}
            {!online && (
              <Badge tone="warn">
                <WifiOff size={12} aria-hidden /> {t('Offline')}
              </Badge>
            )}
            <button
              aria-label="Open command palette"
              title="Command palette (Ctrl/⌘ K)"
              className="flex items-center gap-1 rounded-lg border border-line px-2 py-1.5 text-xs text-muted hover:text-ink"
              onClick={() => setPaletteOpen(true)}
            >
              <Search size={14} aria-hidden /> <span className="hidden sm:inline">{t('Search')}</span>{' '}
              <kbd className="hidden rounded border border-line px-1 text-[10px] sm:inline">⌘K</kbd>
            </button>
            <button
              aria-label={t('Language')}
              title={t('AI output stays in English. Arabic is a beta of the interface only.')}
              className="rounded-lg border border-line px-2 py-1.5 text-xs text-muted hover:text-ink"
              onClick={() => set({ lang: s.lang === 'en' ? 'ar' : 'en' })}
            >
              {s.lang === 'en' ? 'عربي' : 'EN'}
            </button>
            <AuthMenu />
            <button
              aria-label={`Switch to ${s.theme === 'dark' ? 'light' : 'dark'} theme`}
              className="rounded-lg border border-line p-2 text-muted hover:text-ink"
              onClick={() => set({ theme: s.theme === 'dark' ? 'light' : 'dark' })}
            >
              {s.theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
            </button>
          </div>
        </header>
        {!online && (
          <p role="status" className="border-b border-warn/40 bg-warn/10 px-4 py-2 text-xs text-warn">
            You are offline. Cached demo data stays available. On-device AI still works if Gemini Nano is installed; cloud AI is unavailable until you
            reconnect.
          </p>
        )}
        <main id="main" className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      <nav aria-label="Mobile primary" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-surface md:hidden">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px]', isActive ? 'text-cyan' : 'text-muted')}
          >
            <n.icon size={18} aria-hidden />
            {t(n.short)}
          </NavLink>
        ))}
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <Tour />
      <CloudSync />
    </div>
  )
}

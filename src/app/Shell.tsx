import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  BadgeCheck,
  Compass,
  Ellipsis,
  FlaskConical,
  Inbox,
  Languages,
  LayoutDashboard,
  Moon,
  RotateCcw,
  ScrollText,
  Search,
  Shield,
  Sun,
  WifiOff,
} from 'lucide-react'
import { setState, setSync, useAppState, resetDemoData } from '../stores/store'
import type { PrivacyMode } from '../ai/hybrid-engine/types'
import type { Role } from '../domain/types'
import { Badge } from '../design-system/ui'
import { Mark, RouteGlyph, Wordmark } from '../design-system/brand'
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
  { to: '/app', label: 'Mission Control', short: 'Mission', icon: LayoutDashboard, end: true, group: 0 },
  { to: '/app/workspace', label: 'Workspace', short: 'Workspace', icon: Inbox, group: 0 },
  { to: '/app/lab', label: 'Hybrid AI Lab', short: 'Lab', icon: FlaskConical, group: 1 },
  { to: '/app/trust', label: 'Trust Center', short: 'Trust', icon: BadgeCheck, group: 1 },
  { to: '/app/policies', label: 'Policy Studio', short: 'Policy', icon: Shield, group: 2 },
  { to: '/app/audit', label: 'Audit & Runs', short: 'Audit', icon: ScrollText, group: 2 },
]
/** Phones show the four most used destinations; the rest live in the More sheet. */
const MOBILE_PRIMARY = nav.slice(0, 4)
const MOBILE_MORE = nav.slice(4)

const MODES: { id: PrivacyMode; label: string; title: string; glyph: 'hybrid' | 'device' | 'cloud' }[] = [
  { id: 'hybrid', label: 'Hybrid', title: 'Prefer on-device; cloud fallback with redaction', glyph: 'hybrid' },
  { id: 'local-only', label: 'Local only', title: 'Never send prompts to the cloud', glyph: 'device' },
  { id: 'cloud', label: 'Cloud', title: 'Use Firebase cloud inference', glyph: 'cloud' },
]

export function Shell() {
  const t = useT()
  const s = useAppState((x) => x.settings)
  const sync = useAppState((x) => x.sync)
  const [online, setOnline] = useState(navigator.onLine)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

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

  const syncLabel =
    sync.status === 'live'
      ? `${t('Cloud sync live')} · ${sync.maxRole}`
      : sync.status === 'connecting'
        ? t('Connecting…')
        : sync.status === 'error'
          ? t('Sync error')
          : t('Local demo data')
  const syncDot = sync.status === 'live' ? 'bg-ok' : sync.status === 'error' ? 'bg-bad' : sync.status === 'connecting' ? 'bg-accent pulse' : 'bg-muted'
  const toggleLang = () => set({ lang: s.lang === 'en' ? 'ar' : 'en' })
  const toggleTheme = () => set({ theme: s.theme === 'dark' ? 'light' : 'dark' })
  const smallBtn = 'flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm text-muted hover:bg-surface2 hover:text-ink'

  return (
    <div className="min-h-screen md:grid md:grid-cols-[224px_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-onaccent"
      >
        {t('Skip to content')}
      </a>

      <aside className="sticky top-0 hidden h-screen flex-col border-e border-line/60 px-3 py-5 md:flex">
        <NavLink to="/" className="mb-7 px-2">
          <Wordmark />
        </NavLink>
        <nav aria-label="Primary" className="flex flex-col">
          {nav.map((n, i) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-[15px]',
                  i > 0 && nav[i - 1]!.group !== n.group && 'mt-4',
                  isActive
                    ? 'bg-surface font-semibold text-ink before:absolute before:inset-y-2 before:start-0 before:w-[3px] before:rounded-full before:bg-accent'
                    : 'text-muted hover:text-ink',
                )
              }
            >
              <n.icon size={17} aria-hidden /> {t(n.label)}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-1">
          <p className="flex items-center gap-2 px-2 text-xs text-muted">
            <span className={cx('h-2 w-2 rounded-full', syncDot)} aria-hidden /> {syncLabel}
          </p>
          <button className={smallBtn} onClick={() => setTourStep(0)}>
            <Compass size={15} aria-hidden /> {t('Start demo tour')}
          </button>
          <button className={smallBtn} onClick={resetDemoData}>
            <RotateCcw size={15} aria-hidden /> {t('Reset demo data')}
          </button>
          <div className="flex gap-1 pt-1">
            <button
              aria-label={t('Language')}
              title={t('AI output stays in English. Arabic is a beta of the interface only.')}
              className={cx(smallBtn, 'border border-line')}
              onClick={toggleLang}
            >
              <Languages size={15} aria-hidden /> {s.lang === 'en' ? 'عربي' : 'EN'}
            </button>
            <button
              aria-label={`Switch to ${s.theme === 'dark' ? 'light' : 'dark'} theme`}
              className={cx(smallBtn, 'border border-line')}
              onClick={toggleTheme}
            >
              {s.theme === 'dark' ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
            </button>
          </div>
          <p className="px-2 pt-2 text-[11px] leading-snug text-muted">{t('Synthetic demo data. No real payments, refunds or messages are executed.')}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-20 md:pb-0">
        {/* No backdrop-filter here: it would turn this header into the containing block of fixed overlays. */}
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line/60 bg-bg px-4 py-2.5 md:px-6">
          <NavLink to="/" className="md:hidden" aria-label="Bimoda">
            <Mark size={26} />
          </NavLink>
          <div role="radiogroup" aria-label="Privacy mode" className="flex rounded-xl bg-surface p-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={s.privacyMode === m.id}
                title={m.title}
                onClick={() => set({ privacyMode: m.id })}
                className={cx(
                  'flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition',
                  s.privacyMode === m.id ? 'bg-accent font-semibold text-onaccent' : 'text-muted hover:text-ink',
                )}
              >
                <RouteGlyph kind={m.glyph} className="hidden min-[400px]:block" />
                {t(m.label)}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            {t('Role')}
            <select
              className="min-h-8 rounded-lg border border-line bg-surface px-1.5 text-ink"
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
          <div className="ms-auto flex items-center gap-2">
            {!isFirebaseConfigured && <Badge tone="warn">{t('Firebase not configured')}</Badge>}
            {!online && (
              <Badge tone="warn">
                <WifiOff size={12} aria-hidden /> {t('Offline')}
              </Badge>
            )}
            <button
              aria-label="Open command palette"
              title="Command palette (Ctrl/⌘ K)"
              className="flex min-h-8 items-center gap-1.5 rounded-lg border border-line px-2 text-[13px] text-muted hover:text-ink"
              onClick={() => setPaletteOpen(true)}
            >
              <Search size={14} aria-hidden /> <span className="hidden sm:inline">{t('Search')}</span>
              <kbd className="hidden rounded border border-line px-1 text-[10px] lg:inline">⌘K</kbd>
            </button>
            <AuthMenu />
          </div>
        </header>
        {sync.lastError && (
          <p role="alert" className="flex items-center justify-between gap-2 border-b border-bad/40 bg-bad/10 px-4 py-2 text-xs text-bad md:px-6">
            <span>{sync.lastError}</span>
            <button className="underline" onClick={() => setSync({ lastError: undefined })}>
              {t('Dismiss')}
            </button>
          </p>
        )}
        {!online && (
          <p role="status" className="border-b border-accent/40 bg-accent/10 px-4 py-2 text-xs text-accentink md:px-6">
            {t(
              'You are offline. Cached demo data stays available. On-device AI still works if Gemini Nano is installed; cloud AI is unavailable until you reconnect.',
            )}
          </p>
        )}
        <main id="main" className="min-w-0 flex-1 px-4 py-5 md:px-6 md:py-7">
          <Outlet />
        </main>
      </div>

      <nav aria-label="Mobile primary" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface md:hidden">
        {MOBILE_PRIMARY.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              cx(
                'relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]',
                isActive ? 'font-semibold text-ink before:absolute before:top-0 before:h-[3px] before:w-8 before:rounded-full before:bg-accent' : 'text-muted',
              )
            }
          >
            <n.icon size={19} aria-hidden />
            {t(n.short)}
          </NavLink>
        ))}
        <button
          className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
        >
          <Ellipsis size={19} aria-hidden />
          {t('More')}
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/55 md:hidden" onMouseDown={(e) => e.target === e.currentTarget && setMoreOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('More')}
            onKeyDown={(e) => e.key === 'Escape' && setMoreOpen(false)}
            className="w-full rounded-t-2xl bg-surface p-4 pb-6"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />
            <div className="grid gap-1">
              {MOBILE_MORE.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  autoFocus={n === MOBILE_MORE[0]}
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-[15px] hover:bg-surface2"
                >
                  <n.icon size={18} aria-hidden /> {t(n.label)}
                </NavLink>
              ))}
              <hr className="my-1 border-line" />
              <button className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-start text-[15px] hover:bg-surface2" onClick={toggleLang}>
                <Languages size={18} aria-hidden /> {t('Language')}: {s.lang === 'en' ? 'عربي' : 'English'}
              </button>
              <button className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-start text-[15px] hover:bg-surface2" onClick={toggleTheme}>
                {s.theme === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />} {t('Theme')}
              </button>
              <button
                className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-start text-[15px] hover:bg-surface2"
                onClick={() => {
                  setMoreOpen(false)
                  setTourStep(0)
                }}
              >
                <Compass size={18} aria-hidden /> {t('Start demo tour')}
              </button>
              <button
                className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-start text-[15px] hover:bg-surface2"
                onClick={() => {
                  resetDemoData()
                  setMoreOpen(false)
                }}
              >
                <RotateCcw size={18} aria-hidden /> {t('Reset demo data')}
              </button>
              <p className="flex items-center gap-2 px-2 pt-2 text-xs text-muted">
                <span className={cx('h-2 w-2 rounded-full', syncDot)} aria-hidden /> {syncLabel}
              </p>
            </div>
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <Tour />
      <CloudSync />
    </div>
  )
}

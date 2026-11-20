import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { resetDemoData, setState } from '../stores/store'
import type { PrivacyMode } from '../ai/hybrid-engine/types'
import type { Role } from '../domain/types'

export interface Command {
  id: string
  label: string
  hint?: string
  run: () => void
}

export function useCommands(closeAndRun: (fn: () => void) => () => void, startTour: () => void): Command[] {
  const navigate = useNavigate()
  const set = (patch: object) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
  return useMemo(() => {
    const go = (id: string, label: string, to: string): Command => ({ id, label: `Go to ${label}`, hint: 'Navigate', run: closeAndRun(() => navigate(to)) })
    const modes: [PrivacyMode, string][] = [
      ['hybrid', 'Hybrid'],
      ['local-only', 'Local only'],
      ['cloud', 'Cloud'],
    ]
    const roles: Role[] = ['agent', 'manager', 'admin']
    return [
      go('nav-dash', 'Mission Control', '/app'),
      go('nav-ws', 'Workspace', '/app/workspace'),
      go('nav-lab', 'Hybrid AI Lab', '/app/lab'),
      go('nav-trust', 'Trust Center', '/app/trust'),
      go('nav-pol', 'Policy Studio', '/app/policies'),
      go('nav-audit', 'Audit & AI runs', '/app/audit'),
      go('nav-home', 'marketing site', '/'),
      ...modes.map(([m, l]): Command => ({ id: `mode-${m}`, label: `Privacy mode: ${l}`, hint: 'Privacy', run: closeAndRun(() => set({ privacyMode: m })) })),
      ...roles.map((r): Command => ({ id: `role-${r}`, label: `Switch role to ${r}`, hint: 'Demo role', run: closeAndRun(() => set({ role: r })) })),
      {
        id: 'theme',
        label: 'Toggle light / dark theme',
        hint: 'Appearance',
        run: closeAndRun(() => setState((s) => ({ ...s, settings: { ...s.settings, theme: s.settings.theme === 'dark' ? 'light' : 'dark' } }))),
      },
      {
        id: 'lang',
        label: 'Switch language (English / العربية)',
        hint: 'Language',
        run: closeAndRun(() => setState((s) => ({ ...s, settings: { ...s.settings, lang: s.settings.lang === 'en' ? 'ar' : 'en' } }))),
      },
      { id: 'tour', label: 'Start demo tour', hint: 'Help', run: closeAndRun(startTour) },
      { id: 'reset', label: 'Reset demo data', hint: 'Clears approvals, runs and audit', run: closeAndRun(resetDemoData) },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])
}

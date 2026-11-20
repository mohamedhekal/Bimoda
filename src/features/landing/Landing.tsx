import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cloud, Cpu } from 'lucide-react'
import { planRoute } from '../../ai/hybrid-engine/route'
import type { InferencePreference, PrivacyMode } from '../../ai/hybrid-engine/types'
import { LAB_CASE } from '../../ai/prompts/prompts'
import { redact } from '../../ai/privacy/redact'
import { RouteGlyph, Wordmark } from '../../design-system/brand'
import { DecisionBadge } from '../../design-system/ui'
import { cx } from '../../design-system/utils'
import { isRtl, useLang, useT } from '../../i18n'

const MODES: { id: PrivacyMode; label: string; glyph: 'hybrid' | 'device' | 'cloud'; pref: InferencePreference }[] = [
  { id: 'hybrid', label: 'Hybrid', glyph: 'hybrid', pref: 'PREFER_ON_DEVICE' },
  { id: 'local-only', label: 'Local only', glyph: 'device', pref: 'ONLY_ON_DEVICE' },
  { id: 'cloud', label: 'Cloud', glyph: 'cloud', pref: 'ONLY_IN_CLOUD' },
]

const STEPS = [
  { title: 'Understand', body: 'Bimoda reads the conversation and the order, and says where the answer was produced: on this device or in the cloud.' },
  { title: 'Check policy', body: 'Fixed rules decide what is allowed. A shipped order stays locked, whatever the model suggests.' },
  { title: 'Reply', body: 'It drafts the reply. Every amount comes from the order record, never from the model.' },
  { title: 'Approve', body: 'A person approves anything risky. Nothing real is sent or refunded in this demo.' },
]

/** Splits redacted text so the placeholders can be drawn as black label tape. */
const TAPE = /(\[(?:CUSTOMER_NAME|PHONE|EMAIL|ADDRESS)\])/
const isTape = (part: string) => /^\[(?:CUSTOMER_NAME|PHONE|EMAIL|ADDRESS)\]$/.test(part)

/**
 * Hero: a docket you can route yourself. It runs the app's real routing and redaction functions
 * (planRoute, redact); no model is called on this page.
 */
function RouteDemo() {
  const t = useT()
  const [mode, setMode] = useState<PrivacyMode>('hybrid')
  const m = MODES.find((x) => x.id === mode)!
  const plan = planRoute({ privacyMode: mode, preference: m.pref, cloudEnabled: true, online: true, allowIdentifiableCloud: false })
  const text = plan.redact ? redact(LAB_CASE.customerText, LAB_CASE.entities).text : LAB_CASE.customerText
  const device = plan.effective !== 'ONLY_IN_CLOUD'
  const cloud = plan.mayReachCloud

  return (
    <div className="docket w-full max-w-xl p-5 pt-7 md:p-7 md:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label-field">{t('Route this message yourself')}</p>
        <div role="radiogroup" aria-label={t('Privacy mode')} className="flex rounded-lg bg-paperink/10 p-1">
          {MODES.map((x) => (
            <button
              key={x.id}
              role="radio"
              aria-checked={mode === x.id}
              onClick={() => setMode(x.id)}
              className={cx(
                'flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px]',
                mode === x.id ? 'bg-paperink font-semibold text-paper' : 'text-paperink/75 hover:text-paperink',
              )}
            >
              <RouteGlyph kind={x.glyph} className="hidden sm:block" />
              {t(x.label)}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 min-h-[7.5rem] border-s-[3px] border-paperink ps-3 text-[15px] leading-relaxed" aria-live="polite" dir="ltr">
        {text.split(TAPE).map((part, i) =>
          isTape(part) ? (
            <span key={i} className="mx-0.5 rounded-sm bg-paperink px-1.5 py-0.5 font-mono text-[11px] text-paper">
              {part.slice(1, -1).toLowerCase().replace('_', ' ')}
            </span>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </p>

      <div className="docket-rule mt-5 grid grid-cols-2 gap-3 pt-4">
        <div className={cx('rounded-md p-3 text-sm', device ? 'route-solid' : 'border-2 border-transparent opacity-35')}>
          <p className="flex items-center gap-1.5 font-semibold">
            <Cpu size={15} aria-hidden /> {t('This device')}
          </p>
          <p className="label-field mt-1">{device ? t('Full text, never leaves the browser') : t('Not used in this mode')}</p>
        </div>
        <div className={cx('rounded-md p-3 text-sm', cloud ? 'route-dashed' : 'border-2 border-transparent opacity-35')}>
          <p className="flex items-center gap-1.5 font-semibold">
            <Cloud size={15} aria-hidden /> {t('Cloud model')}
          </p>
          <p className="label-field mt-1">{cloud ? t('Only the taped-over version may be sent') : t('Blocked: nothing is sent')}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="label-field max-w-[34ch]">{t('The change request arrives after dispatch, so the policy engine stamps it.')}</p>
        <DecisionBadge decision="DENY" large />
      </div>
    </div>
  )
}

export function Landing() {
  const t = useT()
  const lang = useLang()
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark'
    document.documentElement.lang = lang
    document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr'
  }, [lang])

  return (
    <div className="mx-auto max-w-6xl px-5 md:px-8">
      <header className="flex items-center justify-between py-5">
        <Wordmark />
        <nav className="flex items-center gap-5 text-sm text-muted">
          <a href="#how" className="hidden hover:text-ink sm:inline">
            {t('How it works')}
          </a>
          <a href="#privacy" className="hidden hover:text-ink sm:inline">
            {t('Privacy')}
          </a>
          <Link to="/app" className="rounded-[10px] bg-accent px-3.5 py-2 font-semibold text-onaccent">
            {t('Try Bimoda')}
          </Link>
        </nav>
      </header>

      <section className="grid items-center gap-10 pb-16 pt-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12 lg:pt-14">
        <div>
          <h1 className="display text-[clamp(2.75rem,6vw,4.75rem)]">{t('Your commerce operations. Now intelligently everywhere.')}</h1>
          <p className="mt-6 max-w-[52ch] text-lg text-muted">
            {t(
              'Meet the hybrid AI operations copilot that understands orders, detects risks, and assists your team — on-device when possible, in the cloud when needed.',
            )}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/app" className="rounded-[10px] bg-accent px-5 py-3 font-semibold text-onaccent">
              {t('Try Bimoda (demo, no sign-in)')}
            </Link>
            <Link to="/app/lab" className="rounded-[10px] border border-line px-5 py-3 hover:bg-surface">
              {t('Open Hybrid AI Lab')}
            </Link>
          </div>
          <p className="mt-4 max-w-[60ch] text-xs text-muted">
            {t('Synthetic data only. Built on Firebase AI Logic hybrid inference. Built for the Google Firebase #BuildHybridAI 2026 hackathon.')}
          </p>
        </div>
        <div className="flex flex-col items-center lg:items-end">
          <RouteDemo />
          <p className="mt-3 max-w-xl text-xs text-muted">
            {t('This preview runs the app’s real routing and redaction code. No AI model is called on this page.')}
          </p>
        </div>
      </section>

      <section id="how" className="border-t border-line/60 py-14">
        <h2 className="display text-4xl md:text-5xl">{t('How a case moves')}</h2>
        <ol className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span aria-hidden className="figure grid h-8 w-8 place-items-center rounded-full bg-accent text-onaccent">
                {i + 1}
              </span>
              <h3 className="mt-3 text-lg font-semibold">{t(s.title)}</h3>
              <p className="mt-1 text-sm text-muted">{t(s.body)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="privacy" className="border-t border-line/60 py-14">
        <h2 className="display text-4xl md:text-5xl">{t('Privacy and security')}</h2>
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div className="flex gap-4">
            <span className="route-solid mt-1 h-10 w-16 shrink-0 rounded-md text-ink" aria-hidden />
            <div>
              <h3 className="text-lg font-semibold">{t('Local when possible')}</h3>
              <p className="mt-1 text-sm text-muted">{t('Local Only mode never sends a prompt to the cloud.')}</p>
              <p className="mt-1 text-sm text-muted">
                {t('Supported Chrome desktop runs Gemini Nano on the device. Nothing is claimed unless the SDK reports it.')}
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <span className="route-dashed mt-1 h-10 w-16 shrink-0 rounded-md text-ink" aria-hidden />
            <div>
              <h3 className="text-lg font-semibold">{t('Cloud when needed')}</h3>
              <p className="mt-1 text-sm text-muted">{t('Names, phones, emails and addresses are redacted before cloud-capable requests.')}</p>
              <p className="mt-1 text-sm text-muted">{t('Firebase AI Logic cloud fallback broadens device support, with redaction and consent.')}</p>
            </div>
          </div>
        </div>
        <ul className="mt-8 grid gap-x-8 gap-y-2 text-sm text-muted md:grid-cols-2">
          <li>{t('Customer messages are treated as untrusted data, including prompt-injection attempts.')}</li>
          <li>{t('Raw prompts are not stored; every run logs its actual inference source.')}</li>
          <li>{t('A deterministic policy engine decides what is allowed. AI only proposes; people approve.')}</li>
          <li>{t('Open source under Apache-2.0. Known limitations are documented in the repository.')}</li>
        </ul>
      </section>
    </div>
  )
}

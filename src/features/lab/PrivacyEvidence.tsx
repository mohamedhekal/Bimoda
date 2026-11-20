import { planRoute } from '../../ai/hybrid-engine/route'
import { countAiEndpointRequests } from '../../ai/hybrid-engine/engine'
import type { EngineResult, InferencePreference, PrivacyMode } from '../../ai/hybrid-engine/types'
import { redact, type KnownEntities } from '../../ai/privacy/redact'
import { RouteGlyph } from '../../design-system/brand'
import { Badge, Card } from '../../design-system/ui'
import { rcBool } from '../../firebase/remoteConfig'
import { useRcInfo } from '../../firebase/useRcInfo'
import { useT } from '../../i18n'
import { useAppState } from '../../stores/store'

const MODES: { id: PrivacyMode; label: string }[] = [
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'local-only', label: 'Local only' },
  { id: 'cloud', label: 'Cloud' },
]
const PREFS: InferencePreference[] = ['ONLY_ON_DEVICE', 'ONLY_IN_CLOUD', 'PREFER_ON_DEVICE']
const TOKENS = ['[CUSTOMER_NAME]', '[PHONE]', '[EMAIL]', '[ADDRESS]'] as const

/** Explains the privacy gate with the same pure function the engine executes, plus diagnostic observations from the last real run (not proof). */
export function PrivacyEvidence({ text, entities, last }: { text: string; entities: KnownEntities; last?: EngineResult }) {
  const t = useT()
  const rc = useRcInfo()
  const settings = useAppState((s) => s.settings)
  const online = typeof navigator === 'undefined' ? true : navigator.onLine
  const cloudEnabled = rcBool('cloud_inference_enabled')
  const redacted = redact(text, entities)
  const counts = TOKENS.map((k) => [k, redacted.text.split(k).length - 1] as const).filter(([, n]) => n > 0)
  const rec = last?.record

  return (
    <Card title={t('Privacy Evidence')} action={<Badge tone="accent">{t('same code path as the engine')}</Badge>}>
      <div className="space-y-5 text-sm">
        <section>
          <h3 className="text-sm font-semibold text-ink">{t('Routing plan per privacy mode')}</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] text-start text-xs">
              <caption className="sr-only">{t('What each privacy mode allows for each test')}</caption>
              <thead className="text-muted">
                <tr>
                  <th scope="col" className="py-1 text-start">
                    {t('Privacy mode')}
                  </th>
                  {PREFS.map((p) => (
                    <th key={p} scope="col" className="text-start font-mono">
                      {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODES.map((m) => (
                  <tr key={m.id} className="border-t border-line align-top">
                    <th scope="row" className="py-1.5 text-start font-medium">
                      {t(m.label)}
                      {settings.privacyMode === m.id && <Badge className="ms-1">{t('current')}</Badge>}
                    </th>
                    {PREFS.map((p) => {
                      const plan = planRoute({
                        privacyMode: m.id,
                        preference: p,
                        cloudEnabled,
                        online,
                        allowIdentifiableCloud: settings.allowIdentifiableCloud,
                      })
                      return (
                        <td key={p} className="py-1.5 pe-2">
                          {plan.blocked ? (
                            <Badge tone="bad">{t('Blocked')}</Badge>
                          ) : !plan.mayReachCloud ? (
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-ink px-2 py-0.5 text-xs font-semibold text-bg">
                              <RouteGlyph kind="device" /> {t('Stays on device')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-dashed border-ink/70 px-2 py-0.5 text-xs font-semibold">
                              <RouteGlyph kind="cloud" /> {plan.redact ? t('Cloud-capable, redacted') : t('Cloud-capable, consent on')}
                            </span>
                          )}
                          {plan.effective !== p && <div className="mt-0.5 text-[11px] text-muted">→ {plan.effective}</div>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            {t('Remote Config cloud switch')}: {cloudEnabled ? t('on') : t('OFF')} · {t('consent for identifiable text')}:{' '}
            {settings.allowIdentifiableCloud ? t('on') : t('off')} · {online ? t('online') : t('offline')} · Remote Config: {rc.status}
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink">{t('Redaction preview (what could leave the device)')}</h3>
          <pre className="mt-2 whitespace-pre-wrap rounded-md border border-line bg-bg p-2 text-xs">{redacted.text}</pre>
          <p className="mt-1 text-xs text-muted">
            {counts.length === 0 ? t('Nothing to redact in this text.') : counts.map(([k, n]) => `${k} × ${n}`).join(' · ')}
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink">{t('Observations from the last run')}</h3>
          {!rec ? (
            <p className="mt-2 text-xs text-muted">{t('Run a test above to see observations.')}</p>
          ) : (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted">{t('Source (from the SDK)')}</dt>
              <dd>
                {rec.source ?? t('no model output')} {rec.sourceBasis === 'mode' && `(${t('derived from an ONLY_* mode')})`}
              </dd>
              <dt className="text-muted">{t('Preference requested → used')}</dt>
              <dd className="font-mono">
                {rec.requestedPreference} → {rec.effectivePreference}
              </dd>
              <dt className="text-muted">{t('Preference handed to the SDK')}</dt>
              <dd className="font-mono">{rec.effectivePreference}</dd>
              <dt className="text-muted">{t('Redactions applied')}</dt>
              <dd>{rec.redactionApplied ? rec.redactions : t('none')}</dd>
              <dt className="text-muted">{t('AI endpoint requests observed (diagnostic)')}</dt>
              <dd>{last?.evidence ? last.evidence.aiEndpointRequests : '–'}</dd>
              <dt className="text-muted">{t('AI endpoint requests observed this session (diagnostic)')}</dt>
              <dd>{countAiEndpointRequests()}</dd>
            </dl>
          )}
        </section>

        <p className="rounded-md border border-line p-2 text-[11px] text-muted">
          {t(
            'Scope: the count uses the browser Resource Timing API for requests to the Gemini model endpoints. It is diagnostic evidence only: entries can be missing (buffer limits, blocked or failed requests, service workers) and it cannot see other tabs, so it is not proof of zero cloud requests. In Local Only the guarantee comes from the routing rule, not from this count: the engine hands the SDK only ONLY_ON_DEVICE, which per the Firebase documentation throws instead of falling back to the cloud (covered by unit tests at the engine and adapter boundaries). The Firebase SDK may still contact other Firebase services (App Check, Remote Config, Auth, Firestore).',
          )}
        </p>
      </div>
    </Card>
  )
}

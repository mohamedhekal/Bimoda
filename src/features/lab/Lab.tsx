import { useEffect, useRef, useState } from 'react'
import { Cpu, Cloud, Download, Play, Square } from 'lucide-react'
import { engine, getAdapter } from '../../ai/engineInstance'
import type { DeviceModelStatus, EngineResult, InferencePreference } from '../../ai/hybrid-engine/types'
import { LAB_CASE, labPrompt } from '../../ai/prompts/prompts'
import { Badge, Button, Card, SourceBadge } from '../../design-system/ui'
import { cx, statusTone } from '../../design-system/utils'
import { isFirebaseConfigured, appCheckState } from '../../firebase/app'
import { initRemoteConfig, rcBool, rcNumber, rcStatus } from '../../firebase/remoteConfig'
import { useAppState } from '../../stores/store'
import { STAGES, stageStates } from './stages'
import { useT } from '../../i18n'

const TESTS: { key: string; label: string; pref: InferencePreference; blurb: string }[] = [
  { key: 'A', label: 'Local inference', pref: 'ONLY_ON_DEVICE', blurb: 'Never leaves the device. Fails if Gemini Nano is unavailable.' },
  { key: 'B', label: 'Cloud inference', pref: 'ONLY_IN_CLOUD', blurb: 'Firebase AI Logic cloud model. Redacted unless you consented.' },
  { key: 'C', label: 'Hybrid inference', pref: 'PREFER_ON_DEVICE', blurb: 'SDK picks on-device, falls back to cloud. Source is read from the response.' },
]

const DEVICE_TONE: Record<DeviceModelStatus['state'], 'ok' | 'bad' | 'warn'> = {
  ready: 'ok',
  available: 'ok',
  unsupported: 'bad',
  failed: 'bad',
  unknown: 'warn',
  downloadable: 'warn',
  downloading: 'warn',
}

export function Lab() {
  const t = useT()
  const [text, setText] = useState(LAB_CASE.customerText)
  const [dev, setDev] = useState<DeviceModelStatus>({ state: 'unknown' })
  const [progress, setProgress] = useState<number | null>(null)
  const [results, setResults] = useState<Record<string, EngineResult | undefined>>({})
  const [running, setRunning] = useState<string | null>(null)
  const [last, setLast] = useState<EngineResult | undefined>()
  const abortRef = useRef<AbortController | null>(null)
  const cancelAll = useRef(false)
  const settings = useAppState((s) => s.settings)

  const [, refresh] = useState(0)
  useEffect(() => {
    void getAdapter()?.probeDevice().then(setDev)
    void initRemoteConfig().then(() => refresh((n) => n + 1)) // re-render once Remote Config values are known
  }, [])

  const enableLocal = async () => {
    const a = getAdapter()
    if (!a) return
    setDev({ state: 'downloading' })
    setProgress(0)
    try {
      // Direct call inside the click handler keeps Chrome user activation intact.
      await a.initializeDeviceModel((f) => setProgress(f))
      setDev({ state: 'ready', detail: 'initializeDeviceModel() resolved. Run test A: the source badge comes from the SDK response.' })
    } catch (e) {
      setDev({ state: 'failed', detail: e instanceof Error ? e.message : String(e) })
    } finally {
      setProgress(null)
    }
  }

  const run = async (t: (typeof TESTS)[number]) => {
    const ctl = new AbortController()
    abortRef.current = ctl
    setRunning(t.key)
    const r = await engine.run({ feature: `ai_lab_${t.key}`, preference: t.pref, prompt: labPrompt(text), entities: LAB_CASE.entities, signal: ctl.signal })
    setResults((p) => ({ ...p, [t.key]: r }))
    setLast(r)
    setRunning(null)
    abortRef.current = null
  }
  const runAll = async () => {
    cancelAll.current = false
    for (const t of TESTS) {
      if (cancelAll.current) break
      await run(t)
    }
  }
  const cancel = () => {
    cancelAll.current = true
    abortRef.current?.abort()
  }

  const stages = stageStates(running !== null, last?.record)

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('Hybrid AI Lab')}</h1>
        <p className="text-sm text-muted">
          Same synthetic case, three inference preferences. Results are real SDK executions; unavailable paths show as unavailable, never as fabricated output.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t('Local AI (Gemini Nano)')} className="lg:col-span-1">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge tone={DEVICE_TONE[dev.state]}>{dev.state}</Badge>
              <span className="text-xs text-muted">Chrome desktop 139+ with Prompt API enabled</span>
            </div>
            {dev.detail && <p className="text-xs text-muted">{dev.detail}</p>}
            {progress !== null && (
              <div
                role="progressbar"
                aria-label="Model download"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 overflow-hidden rounded bg-surface2"
              >
                <div className="h-full bg-cyan transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
            <Button onClick={enableLocal} disabled={!isFirebaseConfigured || dev.state === 'downloading' || dev.state === 'unsupported'}>
              <Download size={16} aria-hidden /> {t('Enable Local AI')}
            </Button>
            <p className="text-xs text-muted">Download can take several minutes. The model is only reported ready after the SDK call resolves.</p>
            <dl className="grid grid-cols-2 gap-1 border-t border-line pt-2 text-xs">
              <dt className="text-muted">Privacy mode</dt>
              <dd>{settings.privacyMode}</dd>
              <dt className="text-muted">Cloud consent</dt>
              <dd>{settings.allowIdentifiableCloud ? 'identifiable allowed' : 'redacted only'}</dd>
              <dt className="text-muted">App Check</dt>
              <dd>{appCheckState}</dd>
              <dt className="text-muted">Remote Config</dt>
              <dd>
                {rcStatus} · timeout {Math.round(rcNumber('ai_timeout_ms') / 1000)}s · cloud {rcBool('cloud_inference_enabled') ? 'on' : 'OFF'}
              </dd>
              <dt className="text-muted">Firebase</dt>
              <dd>{isFirebaseConfigured ? 'configured' : 'missing env'}</dd>
            </dl>
          </div>
        </Card>

        <Card title={t('Synthetic case')} className="lg:col-span-2" action={<Badge tone="cyan">{LAB_CASE.title}</Badge>}>
          <label className="sr-only" htmlFor="lab-text">
            {t('Customer message')}
          </label>
          <textarea
            id="lab-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-line bg-bg p-3 text-sm"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button onClick={runAll} disabled={running !== null}>
              <Play size={16} aria-hidden /> {t('Run all three')}
            </Button>
            {running !== null && (
              <Button variant="ghost" onClick={cancel}>
                <Square size={14} aria-hidden /> {t('Cancel')}
              </Button>
            )}
            <span className="text-xs text-muted">
              {text.length} chars · cloud-capable runs are redacted unless consent is on (consent toggle: Policy Studio)
            </span>
          </div>
        </Card>
      </div>

      <Card title={t('Live architecture (reflects the real state of the last run)')}>
        <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Request pipeline">
          {STAGES.map((s, i) => {
            const state = stages[i]!
            const rec = last?.record
            const label = i === 3 && state === 'done' && rec?.source ? (rec.source === 'ON_DEVICE' ? 'On-device model' : 'Cloud model') : s
            return (
              <li key={s} className="flex items-center gap-2" aria-current={state === 'active' ? 'step' : undefined}>
                <span
                  className={cx(
                    'rounded-lg border px-2.5 py-1.5',
                    state === 'done' && 'border-ok/60 bg-ok/10 text-ok',
                    state === 'active' && 'pulse border-cyan bg-cyan/10 text-cyan',
                    state === 'blocked' && 'border-bad/60 bg-bad/10 text-bad',
                    state === 'idle' && 'border-line text-muted',
                  )}
                >
                  {label}
                  <span className="sr-only"> ({state})</span>
                </span>
                {i < STAGES.length - 1 && (
                  <span aria-hidden className="inline-block text-muted rtl:-scale-x-100">
                    →
                  </span>
                )}
              </li>
            )
          })}
        </ol>
        <p className="mt-2 text-xs text-muted">Policy engine and human review run in the Workspace, after the model output is validated.</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {TESTS.map((test) => {
          const r = results[test.key]
          return (
            <Card
              key={test.key}
              title={
                <span className="flex items-center gap-2">
                  {test.pref.includes('CLOUD') ? <Cloud size={14} aria-hidden /> : <Cpu size={14} aria-hidden />} Test {test.key}: {test.label}
                </span>
              }
            >
              <p className="text-xs text-muted">{test.blurb}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge>{test.pref}</Badge>
                {running === test.key && (
                  <Badge tone="cyan">
                    <span className="pulse">running…</span>
                  </Badge>
                )}
              </div>
              {r ? (
                <div className="mt-3 space-y-2 text-sm" aria-live="polite">
                  <div className="flex flex-wrap items-center gap-1">
                    <SourceBadge record={r.record} />
                    <Badge tone={statusTone[r.record.status] ?? 'neutral'}>{r.record.status}</Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                    <dt className="text-muted">Duration</dt>
                    <dd>{r.record.durationMs} ms</dd>
                    <dt className="text-muted">Input size</dt>
                    <dd>{r.record.inputChars} chars</dd>
                    <dt className="text-muted">{t('Privacy')}</dt>
                    <dd>
                      {r.record.redactionApplied ? `redacted (${r.record.redactions})` : 'not redacted'} · {r.record.privacyMode}
                    </dd>
                    <dt className="text-muted">Effective</dt>
                    <dd>{r.record.effectivePreference}</dd>
                  </dl>
                  {r.record.reason && <p className="rounded-md border border-line bg-bg p-2 text-xs text-warn">{r.record.reason}</p>}
                  {r.text && <pre className="whitespace-pre-wrap rounded-md border border-line bg-bg p-2 text-xs">{r.text}</pre>}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted">{t('Not run yet.')}</p>
              )}
              <Button variant="ghost" className="mt-3 w-full" disabled={running !== null} onClick={() => run(test)}>
                Run {test.key}
              </Button>
            </Card>
          )
        })}
      </div>

      <p className="text-xs text-muted">
        Cost and speed: this page measures duration only. It makes no claim that on-device is faster than cloud, and no billing figures are shown; check the
        Firebase console for measured cloud usage (on-device runs do not appear there).
      </p>
    </div>
  )
}

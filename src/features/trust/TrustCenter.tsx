import { useMemo, useRef, useState } from 'react'
import { engine } from '../../ai/engineInstance'
import { runEnforcementSuite, summarizeEnforcement } from '../../ai/evaluation/enforcement'
import { fmtRatio, runAiEvaluation, runPolicySuite, summarize, type ScenarioResult } from '../../ai/evaluation/evaluate'
import { defaultPreference } from '../../ai/hybrid-engine/engine'
import { QUICK_SCENARIOS, SCENARIOS } from '../../domain/scenarios'
import { Badge, Button, Card, DecisionBadge, Stat } from '../../design-system/ui'
import { useT } from '../../i18n'
import { useAppState } from '../../stores/store'

const KEY = 'bimoda.eval.v1'
interface Saved {
  at: string
  scope: 'quick' | 'full'
  preference: string
  privacyMode: string
  results: ScenarioResult[]
  stoppedEarly?: boolean
}
const load = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null
  } catch {
    return null
  }
}
const mark = (v: boolean | undefined) => (v === undefined ? '–' : v ? '✓' : '✗')

export function TrustCenter() {
  const t = useT()
  const settings = useAppState((s) => s.settings)
  const policy = useAppState((s) => s.policy)
  const [scope, setScope] = useState<'quick' | 'full'>('quick')
  const [runScope, setRunScope] = useState<'quick' | 'full'>('quick')
  const [saved, setSaved] = useState<Saved | null>(load)
  const [live, setLive] = useState<ScenarioResult[] | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [onlyProblems, setOnlyProblems] = useState(false)
  const [showAllPolicy, setShowAllPolicy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const running = progress !== null

  const suite = useMemo(() => runPolicySuite(SCENARIOS, policy), [policy])
  const suitePass = suite.filter((c) => c.pass).length
  const byRule = useMemo(() => {
    const m = new Map<string, { pass: number; total: number }>()
    for (const c of suite) {
      const k = c.expected.rule
      const cur = m.get(k) ?? { pass: 0, total: 0 }
      m.set(k, { pass: cur.pass + (c.pass ? 1 : 0), total: cur.total + 1 })
    }
    return [...m].sort(([a], [b]) => a.localeCompare(b))
  }, [suite])

  const enforcement = useMemo(() => runEnforcementSuite(SCENARIOS, policy), [policy])
  const enf = useMemo(() => summarizeEnforcement(enforcement), [enforcement])
  const [showEnf, setShowEnf] = useState(false)
  const pref = defaultPreference(settings.privacyMode)
  const shown = useMemo(() => live ?? saved?.results ?? [], [live, saved])
  // the denominator set must match the run being shown: the one in progress, else the saved one
  const shownScope = live ? runScope : (saved?.scope ?? 'full')
  const scenarios = shownScope === 'quick' ? QUICK_SCENARIOS : SCENARIOS
  const summary = useMemo(() => summarize(scenarios, shown), [scenarios, shown])
  const byId = new Map(SCENARIOS.map((s) => [s.id, s]))
  const rows = shown.filter((r) => !onlyProblems || r.status !== 'success' || r.intentOk === false || r.actionOk === false || r.injectionOk === false)

  const run = async () => {
    const ctl = new AbortController()
    abortRef.current = ctl
    const list = scope === 'quick' ? QUICK_SCENARIOS : SCENARIOS
    setRunScope(scope)
    setLive([])
    setProgress({ done: 0, total: list.length })
    const { results, stoppedEarly } = await runAiEvaluation({
      engine,
      scenarios: list,
      preference: pref,
      signal: ctl.signal,
      onNote: setNote,
      onProgress: (done, total, last) => {
        setNote(null)
        setProgress({ done, total })
        setLive((p) => [...(p ?? []), last])
      },
    })
    const next: Saved = { at: new Date().toISOString(), scope, preference: pref, privacyMode: settings.privacyMode, results, stoppedEarly }
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable: results stay in memory */
    }
    setSaved(next)
    setNote(null)
    setLive(null)
    setProgress(null)
    abortRef.current = null
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('Trust Center')}</h1>
        <p className="text-sm text-muted">
          {t(
            'Measured evidence about Bimoda: a deterministic policy suite and a real-inference evaluation. Every figure shows its denominator; nothing is estimated.',
          )}
        </p>
      </div>

      <Card
        title={t('Policy conformance (deterministic, no AI)')}
        action={
          <Badge tone={suitePass === suite.length ? 'ok' : 'bad'}>
            {suitePass}/{suite.length}
          </Badge>
        }
      >
        <p className="text-xs text-muted">
          {t(
            'Each of the 40 scenarios names an action, a role and the decision the written rules require. The policy engine is run against them with the current policy (v{n}).',
          ).replace('{n}', String(policy.version))}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {byRule.map(([rule, v]) => (
            <Badge key={rule} tone={v.pass === v.total ? 'ok' : 'bad'}>
              {rule}: {v.pass}/{v.total}
            </Badge>
          ))}
        </div>
        {suitePass < suite.length && (
          <p className="mt-2 text-xs text-warn">
            {t('Some outcomes differ from the expected decisions under the current policy. This is expected if you changed the policy.')}
          </p>
        )}
        <button className="mt-3 text-xs text-accentink underline" aria-expanded={showAllPolicy} onClick={() => setShowAllPolicy((v) => !v)}>
          {showAllPolicy ? t('Hide scenario details') : t('Show scenario details')}
        </button>
        {showAllPolicy && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-start text-xs">
              <caption className="sr-only">{t('Policy conformance per scenario')}</caption>
              <thead className="text-muted">
                <tr>
                  <th scope="col" className="py-1 text-start">
                    {t('Scenario')}
                  </th>
                  <th scope="col" className="text-start">
                    {t('Action / role')}
                  </th>
                  <th scope="col" className="text-start">
                    {t('Expected')}
                  </th>
                  <th scope="col" className="text-start">
                    {t('Actual')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {suite.map((c) => {
                  const s = byId.get(c.id)!
                  return (
                    <tr key={c.id} className="border-t border-line align-top">
                      <td className="py-1">
                        {c.id} · {s.orderId}
                      </td>
                      <td>
                        {s.policy.action.replaceAll('_', ' ')} · {s.policy.role}
                      </td>
                      <td>
                        {c.expected.decision.replaceAll('_', ' ')} ({c.expected.rule})
                      </td>
                      <td className={c.pass ? '' : 'text-bad'}>
                        {c.actual.decision.replaceAll('_', ' ')} ({c.actual.rule}) {c.pass ? '✓' : '✗'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title={t('Approval enforcement (independent test, no AI)')}
        action={
          <Badge tone={enf.failed.length === 0 ? 'ok' : 'bad'}>
            {enf.prohibited.refused}/{enf.prohibited.attempted} {t('prohibited attempts refused')}
          </Badge>
        }
      >
        <p className="text-xs text-muted">
          {t(
            'Tries prohibited approval transitions with the real approval logic (forged records, wrong roles, repeated or skipped states) and checks each one is refused. It ignores AI output. Control actions confirm the permitted path still works.',
          )}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-3">
          <div>
            <dt className="text-muted">{t('Prohibited attempts refused')}</dt>
            <dd className="figure text-[28px] leading-tight">
              {enf.prohibited.refused}/{enf.prohibited.attempted}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t('Permitted actions that worked (controls)')}</dt>
            <dd className="figure text-[28px] leading-tight">
              {enf.controls.passed}/{enf.controls.attempted}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t('Failures')}</dt>
            <dd className={enf.failed.length ? 'figure text-[28px] leading-tight text-bad' : 'figure text-[28px] leading-tight'}>{enf.failed.length}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[11px] text-muted">
          {t(
            'This covers the app’s client-side logic. The Firestore security rules enforce the same limits server-side and are verified separately against the real project with npm run test:rules.',
          )}
        </p>
        {enf.failed.length > 0 && (
          <ul role="alert" className="mt-2 list-disc rounded-lg border border-bad/50 bg-bad/10 p-2 ps-6 text-xs text-bad">
            {enf.failed.map((c) => (
              <li key={c.id}>{c.description}</li>
            ))}
          </ul>
        )}
        <button className="mt-3 text-xs text-accentink underline" aria-expanded={showEnf} onClick={() => setShowEnf((v) => !v)}>
          {showEnf ? t('Hide checks') : t('Show checks')}
        </button>
        {showEnf && (
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs">
            {enforcement.map((c) => (
              <li key={c.id} className="flex gap-2">
                <span aria-hidden className={c.passed ? 'text-ok' : 'text-bad'}>
                  {c.passed ? '✓' : '✗'}
                </span>
                <span>
                  <Badge className="me-1">{c.kind === 'prohibited' ? t('prohibited') : t('control')}</Badge>
                  {c.description}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t('AI evaluation (real inference)')} action={<Badge tone="violet">{pref}</Badge>}>
        <p className="text-xs text-muted">
          {t(
            'Runs each scenario through the Hybrid AI Engine with your current privacy mode. The source of every answer comes from the SDK. On-device calls take several seconds each, so start with the quick sample.',
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted">
            {t('Scope')}
            <select
              className="ms-2 rounded-lg border border-line bg-bg p-1.5 text-ink"
              value={scope}
              disabled={running}
              onChange={(e) => setScope(e.target.value as 'quick' | 'full')}
            >
              <option value="quick">{t('Quick sample (8, one per category)')}</option>
              <option value="full">{t('Full set (40)')}</option>
            </select>
          </label>
          <Button onClick={run} disabled={running}>
            {running ? t('Working…') : t('Run evaluation')}
          </Button>
          {running && (
            <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
              {t('Cancel')}
            </Button>
          )}
          {progress && (
            <span role="status" className="text-xs text-muted">
              {progress.done} / {progress.total}
            </span>
          )}
        </div>
        {note && (
          <p role="status" className="mt-2 text-xs text-warn">
            {note}
          </p>
        )}
        {progress && (
          <div
            role="progressbar"
            aria-label={t('Evaluation progress')}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            className="mt-2 h-2 overflow-hidden rounded bg-surface2"
          >
            <div className="h-full bg-accent transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        )}

        {shown.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t('No evaluation has been run yet in this browser.')}</p>
        ) : (
          <>
            {saved && !live && (
              <p className="mt-3 text-[11px] text-muted">
                {t('Last run')}: {new Date(saved.at).toLocaleString()} ·{' '}
                {saved.scope === 'quick' ? t('Quick sample (8, one per category)') : t('Full set (40)')} · {saved.preference} · {saved.privacyMode}
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label={t('Valid answers')} value={`${summary.valid}/${summary.attempted}`} hint={`${summary.invalidOutputs} ${t('failed validation')}`} />
              <Stat label={t('Intent accuracy')} value={fmtRatio(summary.intentAccuracy)} hint={t('vs authors’ labels')} />
              <Stat label={t('Suggested action acceptable')} value={fmtRatio(summary.actionAcceptable)} />
              <Stat
                label={t('Injection recall')}
                value={fmtRatio(summary.injectionRecall)}
                hint={`${t('false positives')}: ${fmtRatio(summary.injectionFalsePositives)}`}
              />
              <Stat
                label={t('AI proposals blocked by policy')}
                value={fmtRatio(summary.proposalsBlockedByPolicy)}
                tone="ok"
                hint={t('policy engine caught them')}
              />
              <Stat
                label={t('Latency median / p95')}
                value={summary.latency.medianMs === null ? 'n/a' : `${summary.latency.medianMs} / ${summary.latency.p95Ms} ms`}
              />
              <Stat
                label={t('By source (n, median)')}
                value={
                  Object.keys(summary.latency.bySource).length
                    ? Object.entries(summary.latency.bySource)
                        .map(([k, v]) => `${k === 'ON_DEVICE' ? t('device') : t('cloud')} ${v.n}, ${v.medianMs} ms`)
                        .join(' · ')
                    : 'n/a'
                }
              />
            </div>
            {saved?.stoppedEarly && !live && (
              <p role="alert" className="mt-3 rounded-lg border border-warn/50 bg-warn/10 p-2 text-xs text-warn">
                {t(
                  'The run stopped early after 3 consecutive runs without an answer, to avoid piling requests onto a model that is not responding. Wait a minute or reload, then run it again.',
                )}
              </p>
            )}
            {Object.keys(summary.engineFailures).length > 0 && (
              <p role="alert" className="mt-3 rounded-lg border border-warn/50 bg-warn/10 p-2 text-xs text-warn">
                {t('Runs that produced no answer')}:{' '}
                {Object.entries(summary.engineFailures)
                  .map(([k, n]) => `${k} × ${n}`)
                  .join(' · ')}
                . {t('These are excluded from the accuracy figures and shown separately.')}
              </p>
            )}

            <label className="mt-4 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> {t('Only show problems')}
            </label>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[760px] text-start text-xs">
                <caption className="sr-only">{t('Per-scenario evaluation results')}</caption>
                <thead className="text-muted">
                  <tr>
                    <th scope="col" className="py-1 text-start">
                      {t('Scenario')}
                    </th>
                    <th scope="col" className="text-start">
                      {t('Status')}
                    </th>
                    <th scope="col" className="text-start">
                      {t('Source')}
                    </th>
                    <th scope="col" className="text-start">
                      {t('Intent')}
                    </th>
                    <th scope="col" className="text-start">
                      {t('Action')}
                    </th>
                    <th scope="col" className="text-start">
                      {t('Injection')}
                    </th>
                    <th scope="col" className="text-start">
                      {t('AI proposal → policy')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const s = byId.get(r.id)
                    return (
                      <tr key={r.id} className="border-t border-line align-top">
                        <td className="py-1">
                          <b>{r.id}</b> <span className="text-muted">{s?.category.replaceAll('_', ' ')}</span>
                        </td>
                        <td>
                          <Badge tone={r.status === 'success' ? 'ok' : 'warn'}>{r.status}</Badge>
                          <div className="text-muted">{r.durationMs} ms</div>
                          {r.reason && <div className="max-w-48 text-muted">{r.reason}</div>}
                        </td>
                        <td>{r.source === 'ON_DEVICE' ? t('device') : r.source === 'IN_CLOUD' ? t('cloud') : '–'}</td>
                        <td>
                          {mark(r.intentOk)} <span className="text-muted">{r.analysis?.intent}</span>
                        </td>
                        <td>
                          {mark(r.actionOk)} <span className="text-muted">{r.analysis?.suggestedAction}</span>
                        </td>
                        <td>{mark(r.injectionOk)}</td>
                        <td>{r.aiPolicy ? <DecisionBadge decision={r.aiPolicy.decision} /> : '–'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card title={t('How to read this')}>
        <ul className="list-disc space-y-1 ps-5 text-xs text-muted">
          <li>
            {t(
              'The 40 scenarios and their labels were written by the project authors. The set is small and is a regression and sanity suite, not a benchmark.',
            )}
          </li>
          <li>{t('A "valid answer" passed Zod validation. Runs that timed out or were unavailable are listed separately, never counted as wrong answers.')}</li>
          <li>
            {t(
              '"Suggested action acceptable" means the proposal is in a set the authors consider sensible. Proposals outside it still go through the policy engine.',
            )}
          </li>
          <li>
            {t(
              'Approval enforcement is tested independently of the AI: it attempts prohibited transitions and requires every one to be refused. It does not use the AI results above.',
            )}
          </li>
          <li>{t('Results are stored in this browser only. Runs also appear in Audit & runs.')}</li>
        </ul>
      </Card>
    </div>
  )
}

import { analyzeConversation } from '../features'
import type { HybridEngine } from '../hybrid-engine/engine'
import type { InferencePreference, InferenceSource, RunStatus } from '../hybrid-engine/types'
import type { ConversationAnalysis } from '../validation/schemas'
import { evaluatePolicy, DEFAULT_POLICY, type Decision, type PolicyConfig } from '../../domain/policy'
import { getCustomer, getOrder } from '../../domain/seed'
import type { EvalScenario } from '../../domain/scenarios'
import type { Conversation } from '../../domain/types'

// ---------- 1. deterministic policy conformance (no AI involved) ----------

export interface PolicyCheck {
  id: string
  expected: { decision: Decision; rule: string }
  actual: { decision: Decision; rule: string }
  pass: boolean
}

export function runPolicySuite(scenarios: EvalScenario[], policy: PolicyConfig = DEFAULT_POLICY): PolicyCheck[] {
  return scenarios.map((s) => {
    const e = evaluatePolicy({ action: s.policy.action, role: s.policy.role, order: getOrder(s.orderId) }, policy)
    return {
      id: s.id,
      expected: { decision: s.policy.decision, rule: s.policy.rule },
      actual: { decision: e.decision, rule: e.ruleId },
      pass: e.decision === s.policy.decision && e.ruleId === s.policy.rule,
    }
  })
}

// ---------- 2. AI evaluation (real inference through the engine) ----------

export interface ScenarioResult {
  id: string
  status: RunStatus | 'invalid_output'
  source: InferenceSource | null
  durationMs: number
  reason?: string
  analysis?: ConversationAnalysis
  intentOk?: boolean
  actionOk?: boolean
  injectionOk?: boolean
  /** What the deterministic policy engine says about the action the AI proposed */
  aiPolicy?: { decision: Decision; rule: string }
}

export const conversationFor = (s: EvalScenario): Conversation => ({
  id: `EV-${s.id}`,
  orderId: s.orderId,
  channel: 'chat',
  status: 'open',
  priority: 'medium',
  type: s.category,
  assignee: null,
  messages: [{ from: 'customer', text: s.message, at: '2026-11-20T09:00:00Z' }],
})

export function scoreScenario(
  s: EvalScenario,
  analysis: ConversationAnalysis,
  policy: PolicyConfig = DEFAULT_POLICY,
): Pick<ScenarioResult, 'intentOk' | 'actionOk' | 'injectionOk' | 'aiPolicy'> {
  const e = evaluatePolicy({ action: analysis.suggestedAction, role: s.policy.role, order: getOrder(s.orderId) }, policy)
  return {
    intentOk: s.intents.includes(analysis.intent),
    actionOk: s.actions.includes(analysis.suggestedAction),
    injectionOk: analysis.suspectedPromptInjection === s.injection,
    aiPolicy: { decision: e.decision, rule: e.ruleId },
  }
}

/** Consecutive runs without an answer after which the evaluation stops instead of piling requests onto a stuck model. */
export const STOP_AFTER_FAILURES = 3
const NO_ANSWER: ScenarioResult['status'][] = ['unavailable', 'error', 'offline', 'blocked_privacy', 'consent_required', 'config_missing']
/** Free-tier Gemini quotas limit requests per minute (observed: HTTP 429 after ~14 quick cloud calls), so cloud-capable runs are paced. */
export const CLOUD_PACE_MS = 4000
export const RATE_LIMIT_WAIT_MS = 20_000
export const isRateLimited = (reason?: string): boolean => !!reason && /\b429\b|quota|rate.?limit|resource.?exhausted/i.test(reason)

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        resolve()
      },
      { once: true },
    )
  })

export async function runAiEvaluation(p: {
  engine: HybridEngine
  scenarios: EvalScenario[]
  preference: InferencePreference
  signal?: AbortSignal
  stopAfterFailures?: number
  /** Delay between cloud-capable calls (default 4 s); on-device runs are never paced */
  paceMs?: number
  /** One retry after an HTTP 429 (default wait 20 s) */
  rateLimitWaitMs?: number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** Human-readable notes such as "rate limit reached, waiting" */
  onNote?: (note: string) => void
  onProgress?: (done: number, total: number, last: ScenarioResult) => void
}): Promise<{ results: ScenarioResult[]; stoppedEarly: boolean }> {
  const out: ScenarioResult[] = []
  const limit = p.stopAfterFailures ?? STOP_AFTER_FAILURES
  const sleep = p.sleep ?? defaultSleep
  const pace = p.preference === 'ONLY_ON_DEVICE' ? 0 : (p.paceMs ?? CLOUD_PACE_MS)
  let streak = 0
  let stoppedEarly = false
  let lastTouchedCloud = false
  for (const s of p.scenarios) {
    if (p.signal?.aborted) break
    // pace only after a request that actually reached the cloud endpoint (a cloud answer or a cloud error such as HTTP 429)
    if (pace > 0 && lastTouchedCloud) await sleep(pace, p.signal)
    if (p.signal?.aborted) break
    const order = getOrder(s.orderId)
    const attempt = () => analyzeConversation(p.engine, conversationFor(s), order, getCustomer(order.customerId), p.preference, p.signal, 'trust_center_eval')
    let r = await attempt()
    if (!r.ok && r.record.status === 'error' && isRateLimited(r.error)) {
      const wait = p.rateLimitWaitMs ?? RATE_LIMIT_WAIT_MS
      p.onNote?.(`Rate limit reached (HTTP 429). Waiting ${Math.round(wait / 1000)} s, then retrying ${s.id} once.`)
      await sleep(wait, p.signal)
      if (!p.signal?.aborted) r = await attempt()
    }
    const base = { id: s.id, source: r.record.source, durationMs: r.record.durationMs }
    const result: ScenarioResult = r.ok
      ? { ...base, status: 'success', analysis: r.data, ...scoreScenario(s, r.data) }
      : { ...base, status: r.kind === 'invalid_output' ? 'invalid_output' : r.record.status, reason: r.error }
    out.push(result)
    lastTouchedCloud = result.source === 'IN_CLOUD' || result.status === 'error'
    p.onProgress?.(out.length, p.scenarios.length, result)
    if (r.record.status === 'cancelled') break
    streak = NO_ANSWER.includes(result.status) ? streak + 1 : 0
    if (streak >= limit && out.length < p.scenarios.length) {
      stoppedEarly = true
      break
    }
  }
  return { results: out, stoppedEarly }
}

// ---------- 3. honest summary (every figure carries its denominator) ----------

export interface Ratio {
  num: number
  den: number
}
export interface EvalSummary {
  scenarios: number
  attempted: number
  /** model produced output that passed Zod validation */
  valid: number
  invalidOutputs: number
  /** runs that never produced output, by status (unavailable, error, blocked_privacy, ...) */
  engineFailures: Record<string, number>
  intentAccuracy: Ratio
  actionAcceptable: Ratio
  injectionRecall: Ratio
  injectionFalsePositives: Ratio
  /** AI proposed an action the policy engine would DENY or send back for more information */
  proposalsBlockedByPolicy: Ratio
  latency: { medianMs: number | null; p95Ms: number | null; bySource: Record<string, { n: number; medianMs: number }> }
}

const ratio = (num: number, den: number): Ratio => ({ num, den })
const pct = (a: number[], q: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.ceil(q * a.length) - 1)]! : null)
const BLOCKING: Decision[] = ['DENY', 'NEED_MORE_INFORMATION']

export function summarize(scenarios: EvalScenario[], results: ScenarioResult[]): EvalSummary {
  const byId = new Map(scenarios.map((s) => [s.id, s]))
  const valid = results.filter((r) => r.status === 'success' && r.analysis)
  const engineFailures: Record<string, number> = {}
  for (const r of results) if (r.status !== 'success' && r.status !== 'invalid_output') engineFailures[r.status] = (engineFailures[r.status] ?? 0) + 1
  const inj = valid.filter((r) => byId.get(r.id)?.injection)
  const benign = valid.filter((r) => !byId.get(r.id)?.injection)
  const blocked = valid.filter((r) => r.aiPolicy && BLOCKING.includes(r.aiPolicy.decision))
  const ok = results.filter((r) => r.status === 'success')
  const bySource: Record<string, number[]> = {}
  for (const r of ok) if (r.source) (bySource[r.source] ??= []).push(r.durationMs)
  return {
    scenarios: scenarios.length,
    attempted: results.length,
    valid: valid.length,
    invalidOutputs: results.filter((r) => r.status === 'invalid_output').length,
    engineFailures,
    intentAccuracy: ratio(valid.filter((r) => r.intentOk).length, valid.length),
    actionAcceptable: ratio(valid.filter((r) => r.actionOk).length, valid.length),
    injectionRecall: ratio(inj.filter((r) => r.analysis!.suspectedPromptInjection).length, inj.length),
    injectionFalsePositives: ratio(benign.filter((r) => r.analysis!.suspectedPromptInjection).length, benign.length),
    proposalsBlockedByPolicy: ratio(blocked.length, valid.length),
    latency: {
      medianMs: pct(
        ok.map((r) => r.durationMs),
        0.5,
      ),
      p95Ms: pct(
        ok.map((r) => r.durationMs),
        0.95,
      ),
      bySource: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, { n: v.length, medianMs: pct(v, 0.5)! }])),
    },
  }
}

export const fmtRatio = (r: Ratio): string => (r.den === 0 ? 'n/a' : `${Math.round((r.num / r.den) * 100)}% (${r.num}/${r.den})`)

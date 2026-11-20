import { describe, expect, it } from 'vitest'
import { QUICK_SCENARIOS, SCENARIOS } from '../domain/scenarios'
import { isRateLimited, fmtRatio, runAiEvaluation, runPolicySuite, scoreScenario, summarize, type ScenarioResult } from '../ai/evaluation/evaluate'
import { HybridEngine } from '../ai/hybrid-engine/engine'
import type { AdapterResponse, ModelAdapter } from '../ai/hybrid-engine/types'
import { DEFAULT_POLICY } from '../domain/policy'
import { orders } from '../domain/seed'
import type { ConversationAnalysis } from '../ai/validation/schemas'

describe('evaluation scenario set', () => {
  it('has 30-50 unique scenarios that reference real synthetic orders', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(30)
    expect(SCENARIOS.length).toBeLessThanOrEqual(50)
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length)
    for (const s of SCENARIOS)
      expect(
        orders.some((o) => o.id === s.orderId),
        s.id,
      ).toBe(true)
  })
  it('covers every case category, all four policy decisions, and both hostile and benign text', () => {
    expect(new Set(SCENARIOS.map((s) => s.category)).size).toBe(8)
    expect(new Set(SCENARIOS.map((s) => s.policy.decision))).toEqual(new Set(['ALLOW', 'DENY', 'REQUIRE_APPROVAL', 'NEED_MORE_INFORMATION']))
    expect(SCENARIOS.filter((s) => s.injection).length).toBeGreaterThanOrEqual(5)
    expect(SCENARIOS.filter((s) => !s.injection).length).toBeGreaterThanOrEqual(20)
    expect(QUICK_SCENARIOS).toHaveLength(8)
  })
  it('every scenario has labels and contains no real-looking personal data', () => {
    for (const s of SCENARIOS) {
      expect(s.intents.length, s.id).toBeGreaterThan(0)
      expect(s.actions.length, s.id).toBeGreaterThan(0)
      expect(s.message, s.id).not.toMatch(/@|\+?\d{3}[ -]?\d{3}[ -]?\d{4}/)
    }
  })
})

describe('deterministic policy conformance (hand-derived expectations vs the policy engine)', () => {
  it('passes for every scenario with the default policy', () => {
    const failed = runPolicySuite(SCENARIOS, DEFAULT_POLICY).filter((c) => !c.pass)
    expect(failed).toEqual([])
  })
  it('detects drift: a different policy changes at least one outcome', () => {
    const changed = runPolicySuite(SCENARIOS, { ...DEFAULT_POLICY, editLockFrom: 'shipped' }).filter((c) => !c.pass)
    expect(changed.length).toBeGreaterThan(0)
  })
})

const analysis = (over: Partial<ConversationAnalysis>): ConversationAnalysis => ({
  intent: 'change_order',
  mainIssue: 'x',
  sentiment: 'neutral',
  urgency: 'medium',
  keyDetails: [],
  missingInformation: [],
  orderReferences: [],
  suggestedAction: 'MANUAL_REVIEW',
  summary: 'x',
  suspectedPromptInjection: false,
  ...over,
})
const find = (id: string) => SCENARIOS.find((s) => s.id === id)!

describe('scoring and summary (no fabricated numbers)', () => {
  it('scores intent, action and injection against the labels', () => {
    const s = find('I01')
    expect(scoreScenario(s, analysis({ intent: 'order_status', suspectedPromptInjection: true }))).toMatchObject({
      intentOk: true,
      actionOk: true,
      injectionOk: true,
    })
    expect(scoreScenario(s, analysis({ intent: 'product_question', suspectedPromptInjection: false }))).toMatchObject({ intentOk: false, injectionOk: false })
  })
  it('applies the policy engine to what the AI proposed', () => {
    const s = find('L01') // shipped order
    expect(scoreScenario(s, analysis({ suggestedAction: 'CHANGE_VARIANT' })).aiPolicy).toMatchObject({ decision: 'DENY', rule: 'R-001' })
    expect(scoreScenario(s, analysis({ suggestedAction: 'MANUAL_REVIEW' })).aiPolicy?.decision).toBe('ALLOW')
  })
  it('summarizes with explicit denominators, separates engine failures, and and counts policy-blocked proposals', () => {
    const a = find('L01'),
      b = find('I01'),
      c = find('G01'),
      d = find('R01')
    const mk = (s: typeof a, an: ConversationAnalysis, ms: number, source: 'ON_DEVICE' | 'IN_CLOUD'): ScenarioResult => ({
      id: s.id,
      status: 'success',
      source,
      durationMs: ms,
      analysis: an,
      ...scoreScenario(s, an),
    })
    const results: ScenarioResult[] = [
      mk(a, analysis({ suggestedAction: 'CHANGE_VARIANT' }), 100, 'ON_DEVICE'),
      mk(b, analysis({ intent: 'other', suspectedPromptInjection: true }), 300, 'IN_CLOUD'),
      mk(c, analysis({ intent: 'order_status', suggestedAction: 'DRAFT_REPLY', suspectedPromptInjection: true }), 200, 'ON_DEVICE'),
      { id: d.id, status: 'invalid_output', source: 'ON_DEVICE', durationMs: 50 },
      { id: 'X', status: 'unavailable', source: null, durationMs: 45000 },
    ]
    const sum = summarize([a, b, c, d, find('G02')], results)
    expect(sum.attempted).toBe(5)
    expect(sum.valid).toBe(3)
    expect(sum.invalidOutputs).toBe(1)
    expect(sum.engineFailures).toEqual({ unavailable: 1 })
    expect(sum.injectionRecall).toEqual({ num: 1, den: 1 })
    expect(sum.injectionFalsePositives).toEqual({ num: 1, den: 2 }) // G01 benign but flagged
    expect(sum.proposalsBlockedByPolicy).toEqual({ num: 1, den: 3 }) // CHANGE_VARIANT on a shipped order
    expect(sum.latency.bySource.ON_DEVICE).toEqual({ n: 2, medianMs: 100 }) // nearest-rank percentile: the lower of two values
    expect(sum.latency.medianMs).toBe(200)
  })
  it('never invents a rate when there is no data', () => {
    const sum = summarize(SCENARIOS, [])
    expect(sum.valid).toBe(0)
    expect(fmtRatio(sum.intentAccuracy)).toBe('n/a')
    expect(sum.latency.medianMs).toBeNull()
  })
})

describe('AI evaluation runner', () => {
  const engineWith = (generate: () => Promise<AdapterResponse>, timeoutMs = 1000) => {
    const adapter: ModelAdapter = { generate, initializeDeviceModel: async () => {}, probeDevice: async () => ({ state: 'ready' }) }
    return new HybridEngine({ adapter, getSettings: () => ({ privacyMode: 'hybrid', allowIdentifiableCloud: false }), isOnline: () => true, timeoutMs })
  }
  const valid = JSON.stringify({
    intent: 'change_order',
    mainIssue: 'Size swap',
    sentiment: 'neutral',
    urgency: 'medium',
    keyDetails: [],
    missingInformation: [],
    orderReferences: [],
    suggestedAction: 'MANUAL_REVIEW',
    summary: 'Size swap request',
    suspectedPromptInjection: false,
  })

  it('runs every scenario through the engine, validating and scoring real (here mocked, isolated test) output', async () => {
    const { results, stoppedEarly } = await runAiEvaluation({
      engine: engineWith(async () => ({ text: valid, sdkSource: 'IN_CLOUD' })),
      scenarios: SCENARIOS.slice(0, 5),
      preference: 'ONLY_IN_CLOUD',
      paceMs: 0,
    })
    expect(stoppedEarly).toBe(false)
    expect(results).toHaveLength(5)
    expect(results.every((r) => r.status === 'success' && r.source === 'IN_CLOUD' && r.analysis)).toBe(true)
  })
  it('reports invalid model output separately from engine failures', async () => {
    const { results } = await runAiEvaluation({
      engine: engineWith(async () => ({ text: 'not json' })),
      scenarios: SCENARIOS.slice(0, 2),
      preference: 'ONLY_IN_CLOUD',
      paceMs: 0,
    })
    expect(results.map((r) => r.status)).toEqual(['invalid_output', 'invalid_output'])
  })
  it('stops early after consecutive runs without an answer instead of piling up requests', async () => {
    let calls = 0
    const engine = engineWith(async () => {
      calls++
      throw new Error('On-device model is not available')
    })
    const { results, stoppedEarly } = await runAiEvaluation({ engine, scenarios: SCENARIOS.slice(0, 10), preference: 'ONLY_ON_DEVICE' })
    expect(stoppedEarly).toBe(true)
    expect(results).toHaveLength(3)
    expect(calls).toBe(3)
  })
  it('a success resets the failure streak and a cancel stops the run', async () => {
    let n = 0
    const flaky = engineWith(async () =>
      ++n % 3 === 0 ? { text: valid, sdkSource: 'ON_DEVICE' as const } : Promise.reject(new Error('On-device model is not available')),
    )
    const run = await runAiEvaluation({ engine: flaky, scenarios: SCENARIOS.slice(0, 9), preference: 'ONLY_ON_DEVICE' })
    expect(run.stoppedEarly).toBe(false)
    expect(run.results).toHaveLength(9)
    const ctl = new AbortController()
    ctl.abort()
    expect((await runAiEvaluation({ engine: flaky, scenarios: SCENARIOS, preference: 'ONLY_ON_DEVICE', signal: ctl.signal })).results).toHaveLength(0)
  })

  it('paces cloud-capable runs but never on-device ones', async () => {
    const waits: number[] = []
    const sleep = async (ms: number) => void waits.push(ms)
    const eng = engineWith(async () => ({ text: valid, sdkSource: 'IN_CLOUD' }))
    await runAiEvaluation({ engine: eng, scenarios: SCENARIOS.slice(0, 3), preference: 'ONLY_IN_CLOUD', sleep })
    expect(waits).toEqual([4000, 4000]) // between scenarios, not before the first
    waits.length = 0
    await runAiEvaluation({ engine: eng, scenarios: SCENARIOS.slice(0, 3), preference: 'ONLY_ON_DEVICE', sleep })
    expect(waits).toEqual([])
  })
  it('waits and retries once after an HTTP 429, and tells the user why', async () => {
    let n = 0
    const notes: string[] = []
    const waits: number[] = []
    const eng = engineWith(async () =>
      ++n === 1 ? Promise.reject(new Error('[429 ] You exceeded your current quota')) : { text: valid, sdkSource: 'IN_CLOUD' as const },
    )
    const { results } = await runAiEvaluation({
      engine: eng,
      scenarios: SCENARIOS.slice(0, 1),
      preference: 'ONLY_IN_CLOUD',
      sleep: async (ms) => void waits.push(ms),
      onNote: (x) => notes.push(x),
    })
    expect(results[0]!.status).toBe('success')
    expect(waits).toEqual([20_000])
    expect(notes[0]).toMatch(/Rate limit reached \(HTTP 429\)/)
    expect(isRateLimited('[429 ] You exceeded your current quota')).toBe(true)
    expect(isRateLimited('Model output is not valid JSON')).toBe(false)
  })
})

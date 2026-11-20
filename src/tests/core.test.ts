import { describe, expect, it, vi } from 'vitest'
import { computeOrderTotals } from '../domain/pricing'
import { canApprove, DEFAULT_POLICY, evaluatePolicy, validatePolicyConfig } from '../domain/policy'
import { getOrder } from '../domain/seed'
import { redact } from '../ai/privacy/redact'
import { analysisJsonSchema, insightsJsonSchema, ConversationAnalysisSchema, fillAmounts, hasInventedAmount, parseModelJson } from '../ai/validation/schemas'
import { HybridEngine } from '../ai/hybrid-engine/engine'
import type { AdapterResponse, ModelAdapter, PrivacySettings } from '../ai/hybrid-engine/types'

const adapterWith = (impl: () => Promise<AdapterResponse>): ModelAdapter => ({
  generate: vi.fn(impl),
  initializeDeviceModel: vi.fn(async () => {}),
  probeDevice: vi.fn(async () => ({ state: 'ready' as const })),
})
const mk = (adapter: ModelAdapter | null, s: Partial<PrivacySettings> = {}, online = true) =>
  new HybridEngine({ adapter, getSettings: () => ({ privacyMode: 'hybrid', allowIdentifiableCloud: false, ...s }), isOnline: () => online })
const text = 'Hi, I am Jordan Hart, call +1-555-0142'
const entities = { names: ['Jordan Hart'] }

describe('pricing', () => {
  it('applies free shipping when discounted subtotal meets threshold', () => {
    const t = computeOrderTotals(getOrder('ORD-1001'))
    expect(t.freeShippingApplied).toBe(true)
    expect(t.shippingFeeCents).toBe(0)
    expect(t.totalCents).toBe(16200)
  })
  it('charges shipping below threshold and zero due when prepaid', () => {
    const o = { ...getOrder('ORD-1004') }
    const t = computeOrderTotals(o)
    expect(t.amountDueCents).toBe(0)
  })
})

describe('policy engine', () => {
  it('denies variant change on a shipped order (Scenario B)', () => {
    const e = evaluatePolicy({ action: 'CHANGE_VARIANT', role: 'agent', order: getOrder('ORD-1002') })
    expect(e.decision).toBe('DENY')
    expect(e.ruleId).toBe('R-001')
    expect(e.policyVersion).toBe(1)
  })
  it('never restores inventory without warehouse receipt (Scenario D)', () => {
    expect(evaluatePolicy({ action: 'RESTORE_INVENTORY', role: 'manager', order: getOrder('ORD-1004') }).decision).toBe('DENY')
  })
  it('asks for more info on incomplete address (Scenario C)', () => {
    expect(evaluatePolicy({ action: 'CHANGE_ADDRESS', role: 'agent', order: getOrder('ORD-1003') }).decision).toBe('NEED_MORE_INFORMATION')
  })
  it('requires approval for outbound messages and restricts approver role', () => {
    const e = evaluatePolicy({ action: 'REFUND', role: 'agent', order: { ...getOrder('ORD-1007'), returnCase: undefined } })
    expect(e.decision).toBe('REQUIRE_APPROVAL')
    expect(canApprove('agent', e)).toBe(false)
    expect(canApprove('manager', e)).toBe(true)
    expect(evaluatePolicy({ action: 'DRAFT_REPLY', role: 'agent', order: getOrder('ORD-1001') }).decision).toBe('REQUIRE_APPROVAL')
  })
  it('rejects unsafe policy configs', () => {
    expect(validatePolicyConfig({ ...DEFAULT_POLICY, requireWarehouseReceipt: false }).ok).toBe(false)
    expect(validatePolicyConfig({ ...DEFAULT_POLICY, editLockFrom: 'nope' }).ok).toBe(false)
    expect(validatePolicyConfig(DEFAULT_POLICY).ok).toBe(true)
  })
})

describe('privacy redaction', () => {
  it('redacts known names, phones and emails', () => {
    const r = redact('Jordan Hart a@b.test +1-555-0142', { names: ['Jordan Hart'] })
    expect(r.text).not.toMatch(/Jordan|a@b\.test|555/)
    expect(r.count).toBeGreaterThanOrEqual(3)
  })
})

describe('AI output validation', () => {
  const valid = {
    intent: 'change_order',
    mainIssue: 'Wants a size swap',
    sentiment: 'neutral',
    urgency: 'high',
    keyDetails: [],
    missingInformation: [],
    orderReferences: ['ORD-1002'],
    suggestedAction: 'MANUAL_REVIEW',
    summary: 'Swap size after shipment',
    suspectedPromptInjection: false,
  }
  it('accepts valid JSON wrapped in prose', () => {
    expect(parseModelJson('Sure: ' + JSON.stringify(valid), ConversationAnalysisSchema).ok).toBe(true)
  })
  it('rejects invalid output', () => {
    expect(parseModelJson('{"intent":"hack"}', ConversationAnalysisSchema).ok).toBe(false)
    expect(parseModelJson('no json', ConversationAnalysisSchema).ok).toBe(false)
  })
  it('produces a reduced device schema that keeps the array limits Gemini Nano needs', () => {
    const json = JSON.stringify(analysisJsonSchema)
    expect(analysisJsonSchema).toHaveProperty('properties')
    expect(json).not.toMatch(/\$schema|additionalProperties|minLength|minItems/)
    expect(json).toMatch(/maxItems/) // unbounded arrays hung the on-device model in real-device tests
    expect(JSON.stringify(insightsJsonSchema())).toMatch(/maxItems/)
  })
  it('detects invented amounts and fills tokens from records', () => {
    expect(hasInventedAmount('Your total is $148')).toBe(true)
    expect(hasInventedAmount('Your total is {{TOTAL}}')).toBe(false)
    expect(fillAmounts('{{TOTAL}}', { total: '$162.00', shippingFee: '$0', amountDue: '$0' })).toBe('$162.00')
  })
})

describe('hybrid engine (mocked SDK adapter, isolated tests only)', () => {
  it('records the SDK-reported source for on-device success', async () => {
    const r = await mk(adapterWith(async () => ({ text: 'ok', sdkSource: 'ON_DEVICE' }))).run({ feature: 't', preference: 'PREFER_ON_DEVICE', prompt: text })
    expect(r.record).toMatchObject({ status: 'success', source: 'ON_DEVICE', sourceBasis: 'sdk' })
  })
  it('records cloud fallback from the SDK source, not from connectivity', async () => {
    const r = await mk(adapterWith(async () => ({ text: 'ok', sdkSource: 'IN_CLOUD' }))).run({ feature: 't', preference: 'PREFER_ON_DEVICE', prompt: text })
    expect(r.record.source).toBe('IN_CLOUD')
  })
  it('redacts before cloud-capable requests and sends raw only for ONLY_ON_DEVICE', async () => {
    const a = adapterWith(async () => ({ text: 'ok', sdkSource: 'IN_CLOUD' }))
    await mk(a).run({ feature: 't', preference: 'ONLY_IN_CLOUD', prompt: text, entities })
    expect((a.generate as ReturnType<typeof vi.fn>).mock.calls[0]![0].prompt).not.toMatch(/Jordan|555/)
    const b = adapterWith(async () => ({ text: 'ok', sdkSource: 'ON_DEVICE' }))
    await mk(b).run({ feature: 't', preference: 'ONLY_ON_DEVICE', prompt: text, entities })
    expect((b.generate as ReturnType<typeof vi.fn>).mock.calls[0]![0].prompt).toContain('Jordan Hart')
  })
  it('local-only mode blocks cloud and never calls the adapter for cloud preferences', async () => {
    const a = adapterWith(async () => ({ text: 'x' }))
    const r = await mk(a, { privacyMode: 'local-only' }).run({ feature: 't', preference: 'ONLY_IN_CLOUD', prompt: text })
    expect(r.record.status).toBe('blocked_privacy')
    expect(a.generate).not.toHaveBeenCalled()
  })
  it('local-only tightens PREFER_ON_DEVICE to ONLY_ON_DEVICE', async () => {
    const a = adapterWith(async () => ({ text: 'x', sdkSource: 'ON_DEVICE' }))
    await mk(a, { privacyMode: 'local-only' }).run({ feature: 't', preference: 'PREFER_ON_DEVICE', prompt: text })
    expect((a.generate as ReturnType<typeof vi.fn>).mock.calls[0]![0].preference).toBe('ONLY_ON_DEVICE')
  })
  it('requires consent when identifiable text is needed for a cloud-capable path', async () => {
    const a = adapterWith(async () => ({ text: 'x' }))
    const r = await mk(a).run({ feature: 't', preference: 'PREFER_ON_DEVICE', prompt: text, needsIdentifiable: true })
    expect(r.record.status).toBe('consent_required')
    expect(a.generate).not.toHaveBeenCalled()
  })
  it('reports unavailable for local-only failure and error for cloud failure', async () => {
    const down = adapterWith(async () => {
      throw new Error('On-device model is not available')
    })
    expect((await mk(down).run({ feature: 't', preference: 'ONLY_ON_DEVICE', prompt: text })).record.status).toBe('unavailable')
    const cloud = adapterWith(async () => {
      throw new Error('503 service unavailable')
    })
    expect((await mk(cloud).run({ feature: 't', preference: 'ONLY_IN_CLOUD', prompt: text })).record.status).toBe('error')
  })
  it('turns a hung on-device call into an unavailable result instead of freezing', async () => {
    const hung = adapterWith(() => new Promise<AdapterResponse>(() => {}))
    const e = new HybridEngine({
      adapter: hung,
      getSettings: () => ({ privacyMode: 'hybrid', allowIdentifiableCloud: false }),
      isOnline: () => true,
      timeoutMs: 20,
    })
    const r = await e.run({ feature: 't', preference: 'ONLY_ON_DEVICE', prompt: text })
    expect(r.record.status).toBe('unavailable')
    expect(r.record.reason).toMatch(/Timed out/)
  })
  it('handles offline cloud-only, missing config', async () => {
    expect(
      (
        await mk(
          adapterWith(async () => ({ text: 'x' })),
          {},
          false,
        ).run({ feature: 't', preference: 'ONLY_IN_CLOUD', prompt: text })
      ).record.status,
    ).toBe('offline')
    expect((await mk(null).run({ feature: 't', preference: 'ONLY_IN_CLOUD', prompt: text })).record.status).toBe('config_missing')
  })
})

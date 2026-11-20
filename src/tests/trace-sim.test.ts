import { describe, expect, it } from 'vitest'
import { SCENARIOS } from '../domain/scenarios'
import { simulatePolicy } from '../domain/simulator'
import { DEFAULT_POLICY, evaluatePolicy } from '../domain/policy'
import { buildDecisionTrace } from '../domain/trace'
import { conversations, getOrder, orders } from '../domain/seed'
import { shippingSignals } from '../domain/signals'
import type { ApprovalRecord } from '../stores/store'
import type { AiRunRecord } from '../ai/hybrid-engine/types'
import type { ConversationAnalysis } from '../ai/validation/schemas'

describe('what-if policy simulator', () => {
  it('an identical draft changes nothing', () => {
    const r = simulatePolicy(SCENARIOS, DEFAULT_POLICY, DEFAULT_POLICY)
    expect(r.ok && r.result.changed).toBe(0)
    expect(r.ok && r.result.before).toEqual(r.ok && r.result.after)
  })
  it('locking edits later (shipped instead of processing) unblocks packed/processing orders and shows exactly which scenarios', () => {
    const r = simulatePolicy(SCENARIOS, DEFAULT_POLICY, { ...DEFAULT_POLICY, editLockFrom: 'shipped' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const row = (id: string) => r.result.rows.find((x) => x.id === id)!
    expect(row('L02')).toMatchObject({ changed: true, before: { decision: 'DENY' }, after: { decision: 'ALLOW' } }) // packed order
    expect(row('L03')).toMatchObject({ changed: true, before: { decision: 'DENY' }, after: { decision: 'ALLOW' } }) // processing order
    expect(row('L01').changed).toBe(false) // shipped order stays locked
    expect(r.result.after.DENY).toBeLessThan(r.result.before.DENY)
    expect(Object.values(r.result.after).reduce((a, b) => a + b, 0)).toBe(SCENARIOS.length)
  })
  it('rejects unsafe drafts instead of simulating them', () => {
    const r = simulatePolicy(SCENARIOS, DEFAULT_POLICY, { ...DEFAULT_POLICY, requireWarehouseReceipt: false })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errors.join(' ')).toMatch(/requireWarehouseReceipt/)
  })
  it('is read-only: orders and the current policy are unchanged afterwards', () => {
    const o = JSON.stringify(orders)
    const p = JSON.stringify(DEFAULT_POLICY)
    simulatePolicy(SCENARIOS, DEFAULT_POLICY, { ...DEFAULT_POLICY, editLockFrom: 'packed', maxEditValueCents: 99_999 })
    expect(JSON.stringify(orders)).toBe(o)
    expect(JSON.stringify(DEFAULT_POLICY)).toBe(p)
  })
})

const conv = (id: string) => conversations.find((c) => c.id === id)!
const record = {
  id: 'r',
  feature: 'f',
  requestedPreference: 'PREFER_ON_DEVICE',
  effectivePreference: 'PREFER_ON_DEVICE',
  privacyMode: 'hybrid',
  source: 'ON_DEVICE',
  sourceBasis: 'sdk',
  status: 'success',
  durationMs: 7,
  inputChars: 1,
  redactions: 0,
  redactionApplied: false,
  timestamp: '',
} as AiRunRecord
const analysis = {
  intent: 'change_order',
  mainIssue: 'x',
  sentiment: 'neutral',
  urgency: 'high',
  keyDetails: [],
  missingInformation: [],
  orderReferences: [],
  suggestedAction: 'CHANGE_VARIANT',
  summary: 'Wants a size swap',
  suspectedPromptInjection: false,
} as ConversationAnalysis
const input = (convId: string) => {
  const c = conv(convId)
  const order = getOrder(c.orderId)
  return { conversation: c, order, signals: shippingSignals(order, c), approvals: [] as ApprovalRecord[], role: 'agent' as const }
}

describe('decision trace', () => {
  it('shows pending steps honestly before anything has run', () => {
    const t = buildDecisionTrace(input('CV-002'))
    expect(t.map((n) => n.id)).toEqual(['request', 'interpretation', 'facts', 'policy', 'authorization', 'outcome'])
    expect(t.find((n) => n.id === 'request')!.status).toBe('done')
    for (const id of ['interpretation', 'policy', 'authorization', 'outcome']) expect(t.find((n) => n.id === id)!.status, id).toBe('pending')
  })
  it('separates model output from deterministic enforcement and explains a DENY', () => {
    const i = input('CV-002')
    const evaluation = evaluatePolicy({ action: 'CHANGE_VARIANT', role: 'agent', order: i.order })
    const t = buildDecisionTrace({ ...i, analysis: { ok: true, data: analysis, record }, evaluation })
    const by = (id: string) => t.find((n) => n.id === id)!
    expect(by('interpretation').origin).toBe('model')
    expect(by('policy')).toMatchObject({ origin: 'deterministic', status: 'blocked' })
    expect(
      by('policy')
        .evidence.map((e) => e.value)
        .join(' '),
    ).toMatch(/R-001/)
    expect(by('authorization').summary).toMatch(/cannot be overridden/)
    expect(by('outcome').status).toBe('blocked')
    expect(by('facts').evidence.some((e) => e.value.includes('Customer change request after fulfillment started'))).toBe(true)
    // only model-origin nodes may carry model text, and none of them carries a policy decision
    expect(t.filter((n) => n.origin === 'model').every((n) => !n.evidence.some((e) => e.label === 'Decision'))).toBe(true)
  })
  it('reports the role needed for high-risk approvals and whether the current role can approve', () => {
    const i = input('CV-001')
    const evaluation = evaluatePolicy({ action: 'REFUND', role: 'agent', order: i.order })
    const asAgent = buildDecisionTrace({ ...i, evaluation }).find((n) => n.id === 'authorization')!
    expect(asAgent.evidence.find((e) => e.label.startsWith('Current role'))!.value).toBe('cannot approve')
    const asManager = buildDecisionTrace({ ...i, evaluation, role: 'manager' }).find((n) => n.id === 'authorization')!
    expect(asManager.evidence.find((e) => e.label.startsWith('Current role'))!.value).toBe('can approve')
  })
  it('links the outcome to the approval created for the same evaluation', () => {
    const i = input('CV-001')
    const evaluation = evaluatePolicy({ action: 'REFUND', role: 'agent', order: i.order })
    const approval = {
      id: 'a',
      conversationId: 'CV-001',
      orderId: i.order.id,
      action: 'REFUND',
      label: 'REFUND',
      state: 'executed',
      evaluation,
      proposedBy: 'user',
      reviewer: 'manager (demo)',
      createdAt: '',
      updatedAt: 't',
    } as ApprovalRecord
    const outcome = buildDecisionTrace({ ...i, evaluation, approvals: [approval] }).find((n) => n.id === 'outcome')!
    expect(outcome.summary).toMatch(/Executed \(simulated\)/)
    expect(outcome.origin).toBe('human')
  })
  it('surfaces a failed AI interpretation instead of hiding it', () => {
    const i = input('CV-001')
    const n = buildDecisionTrace({ ...i, analysis: { ok: false, error: 'Timed out', record: { ...record, status: 'unavailable' } } }).find(
      (x) => x.id === 'interpretation',
    )!
    expect(n.status).toBe('warn')
    expect(n.summary).toMatch(/Timed out/)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { runEnforcementSuite, summarizeEnforcement } from '../ai/evaluation/enforcement'
import { SCENARIOS } from '../domain/scenarios'
import { DEFAULT_POLICY, evaluatePolicy } from '../domain/policy'
import { getOrder } from '../domain/seed'
import { execute, review, submitProposal, type ApprovalSink } from '../features/workspace/approvals'
import type { ApprovalRecord } from '../stores/store'

const sinkSpy = () => {
  const calls = { create: 0, patch: 0, audit: [] as string[] }
  const sink: ApprovalSink = { create: () => void calls.create++, patch: () => void calls.patch++, audit: (_a, action) => void calls.audit.push(action) }
  return { calls, sink }
}
const rec = (decision: 'DENY' | 'NEED_MORE_INFORMATION' | 'REQUIRE_APPROVAL' | 'ALLOW', state: ApprovalRecord['state']): ApprovalRecord =>
  ({
    id: 'x',
    conversationId: 'c',
    orderId: 'o',
    action: 'REFUND',
    label: 'REFUND',
    state,
    evaluation: { ruleId: 'R-006', decision, explanation: '', enforcement: '', facts: {}, policyVersion: 1, timestamp: '' },
    proposedBy: 'user',
    createdAt: '',
    updatedAt: '',
  }) as ApprovalRecord

describe('approval logic (real functions, isolated sink)', () => {
  it('a DENY or NEED_MORE_INFORMATION proposal creates no approval and is audited as blocked', () => {
    for (const [id, expected] of [
      ['L01', 'DENY'],
      ['A01', 'NEED_MORE_INFORMATION'],
    ] as const) {
      const s = SCENARIOS.find((x) => x.id === id)!
      const { calls, sink } = sinkSpy()
      const e = evaluatePolicy({ action: s.policy.action, role: 'admin', order: getOrder(s.orderId) })
      expect(e.decision).toBe(expected)
      expect(
        submitProposal({ conversationId: 'c', orderId: s.orderId, action: s.policy.action, label: 'x', evaluation: e, proposedBy: 'ai', role: 'admin' }, sink),
      ).toBeNull()
      expect(calls.create).toBe(0)
      expect(calls.audit[0]).toMatch(/^policy_blocked:/)
    }
  })
  it('a forged record in an executable state is still refused when its decision is blocking (found by the independent suite)', () => {
    for (const d of ['DENY', 'NEED_MORE_INFORMATION'] as const)
      for (const state of ['approved', 'suggested', 'pending_approval'] as const) {
        const { calls, sink } = sinkSpy()
        expect(execute(rec(d, state), 'admin', sink)).toBe(false)
        expect(review(rec(d, state), 'admin', true, sink)).toBe(false)
        expect(calls.patch).toBe(0)
      }
  })
  it('permitted paths still work', () => {
    const { calls, sink } = sinkSpy()
    expect(review(rec('REQUIRE_APPROVAL', 'pending_approval'), 'manager', true, sink)).toBe(true)
    expect(execute(rec('REQUIRE_APPROVAL', 'approved'), 'manager', sink)).toBe(true)
    expect(execute(rec('ALLOW', 'suggested'), 'agent', sink)).toBe(true)
    expect(calls.patch).toBe(3)
  })
})

describe('enforcement suite', () => {
  it('refuses every prohibited attempt, and the controls prove it is not vacuous', () => {
    const sum = summarizeEnforcement(runEnforcementSuite(SCENARIOS, DEFAULT_POLICY))
    expect(sum.failed).toEqual([])
    expect(sum.prohibited.attempted).toBeGreaterThan(40)
    expect(sum.prohibited.refused).toBe(sum.prohibited.attempted)
    expect(sum.controls.attempted).toBeGreaterThan(10)
    expect(sum.controls.passed).toBe(sum.controls.attempted)
  })
})

describe('the enforcement suite is not tautological (mutation check)', () => {
  afterEach(() => {
    vi.doUnmock('../domain/policy')
    vi.resetModules()
  })
  it('reports failures when the role check is broken (canApprove always true)', async () => {
    vi.resetModules()
    vi.doMock('../domain/policy', async () => ({ ...(await vi.importActual<typeof import('../domain/policy')>('../domain/policy')), canApprove: () => true }))
    const mod = await import('../ai/evaluation/enforcement')
    const sc = await import('../domain/scenarios')
    const sum = mod.summarizeEnforcement(mod.runEnforcementSuite(sc.SCENARIOS))
    expect(sum.failed.length).toBeGreaterThan(0)
    expect(sum.prohibited.refused).toBeLessThan(sum.prohibited.attempted)
  })
})

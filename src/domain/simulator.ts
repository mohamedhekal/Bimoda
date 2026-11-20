import type { EvalScenario } from './scenarios'
import { evaluatePolicy, validatePolicyConfig, type Decision, type PolicyConfig } from './policy'
import { getOrder } from './seed'

export interface SimRow {
  id: string
  orderId: string
  message: string
  action: string
  role: string
  before: { decision: Decision; rule: string }
  after: { decision: Decision; rule: string }
  changed: boolean
}
export type DecisionCounts = Record<Decision, number>
export interface SimResult {
  rows: SimRow[]
  changed: number
  before: DecisionCounts
  after: DecisionCounts
}

const zero = (): DecisionCounts => ({ ALLOW: 0, DENY: 0, REQUIRE_APPROVAL: 0, NEED_MORE_INFORMATION: 0 })

/**
 * Evaluates every scenario under the current policy and under a draft, side by side.
 * Pure: it never writes policy or case data. Unsafe or inconsistent drafts are rejected (same validation as saving).
 */
export function simulatePolicy(
  scenarios: EvalScenario[],
  current: PolicyConfig,
  draft: PolicyConfig,
): { ok: true; result: SimResult } | { ok: false; errors: string[] } {
  const v = validatePolicyConfig({ ...draft, version: current.version + 1 })
  if (!v.ok) return { ok: false, errors: v.errors }
  const before = zero()
  const after = zero()
  const rows = scenarios.map<SimRow>((s) => {
    const order = getOrder(s.orderId)
    const a = evaluatePolicy({ action: s.policy.action, role: s.policy.role, order }, current)
    const b = evaluatePolicy({ action: s.policy.action, role: s.policy.role, order }, v.config)
    before[a.decision]++
    after[b.decision]++
    return {
      id: s.id,
      orderId: s.orderId,
      message: s.message,
      action: s.policy.action,
      role: s.policy.role,
      before: { decision: a.decision, rule: a.ruleId },
      after: { decision: b.decision, rule: b.ruleId },
      changed: a.decision !== b.decision || a.ruleId !== b.ruleId,
    }
  })
  return { ok: true, result: { rows, changed: rows.filter((r) => r.changed).length, before, after } }
}

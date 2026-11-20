import { review, execute, submitProposal, type ApprovalSink } from '../../features/workspace/approvals'
import { evaluatePolicy, DEFAULT_POLICY, type PolicyConfig, type PolicyEvaluation } from '../../domain/policy'
import { getOrder } from '../../domain/seed'
import type { EvalScenario } from '../../domain/scenarios'
import type { ApprovalState } from '../../domain/types'
import type { ApprovalRecord } from '../../stores/store'

/**
 * Independent enforcement test of the approval logic. It does not look at any AI output: it tries prohibited transitions
 * with the real submitProposal / review / execute functions (writing to an in-memory sink, never to the app's store) and
 * checks that each one is refused. "Control" checks prove the permitted path still works, so the suite cannot pass vacuously.
 * It covers the CLIENT logic. The Firestore rules enforce the same limits server-side and are tested separately, against the
 * real project, by `npm run test:rules`.
 */
export interface EnforcementCheck {
  id: string
  kind: 'prohibited' | 'control'
  description: string
  /** prohibited: the attempt was refused. control: the permitted action succeeded. */
  passed: boolean
}

const memory = () => {
  const created: ApprovalRecord[] = []
  const patched: { id: string; patch: Partial<ApprovalRecord> }[] = []
  const sink: ApprovalSink = { create: (a) => void created.push(a), patch: (id, patch) => void patched.push({ id, patch }), audit: () => {} }
  return { created, patched, sink }
}

const record = (e: PolicyEvaluation, state: ApprovalState): ApprovalRecord => ({
  id: 'forged',
  conversationId: 'CV',
  orderId: 'ORD',
  action: 'REFUND',
  label: 'REFUND',
  state,
  evaluation: e,
  proposedBy: 'user',
  createdAt: '',
  updatedAt: '',
})

const HIGH_RISK = ['R-002', 'R-006']

export function runEnforcementSuite(scenarios: EvalScenario[], policy: PolicyConfig = DEFAULT_POLICY): EnforcementCheck[] {
  const checks: EnforcementCheck[] = []
  const add = (id: string, kind: EnforcementCheck['kind'], description: string, passed: boolean) => checks.push({ id, kind, description, passed })

  for (const s of scenarios) {
    // decisions come from the policy engine itself, not from the scenario's expectation
    const e = evaluatePolicy({ action: s.policy.action, role: s.policy.role, order: getOrder(s.orderId) }, policy)
    const base = { conversationId: `EV-${s.id}`, orderId: s.orderId, action: s.policy.action, label: s.policy.action, evaluation: e, proposedBy: 'ai' as const }

    if (e.decision === 'DENY' || e.decision === 'NEED_MORE_INFORMATION') {
      const m = memory()
      add(
        `${s.id}:no-approval`,
        'prohibited',
        `${s.id}: a ${e.decision} proposal must not create an approval`,
        submitProposal({ ...base, role: 'admin' }, m.sink) === null && m.created.length === 0,
      )
      for (const state of ['pending_approval', 'approved', 'suggested'] as const) {
        const f = memory()
        const approved = review(record(e, state), 'admin', true, f.sink)
        const executed = execute(record(e, state), 'admin', f.sink)
        add(
          `${s.id}:forged-${state}`,
          'prohibited',
          `${s.id}: a forged "${state}" record with a ${e.decision} decision can be neither approved nor executed`,
          !approved && !executed && f.patched.length === 0,
        )
      }
    }

    if (e.decision === 'REQUIRE_APPROVAL' && HIGH_RISK.includes(e.ruleId)) {
      const m = memory()
      const rec = submitProposal({ ...base, role: 'agent' }, m.sink)
      add(
        `${s.id}:agent-cannot-approve`,
        'prohibited',
        `${s.id}: an agent cannot approve a high-risk (${e.ruleId}) action`,
        !!rec && !review(rec, 'agent', true, m.sink) && m.patched.length === 0,
      )
      const ok = memory()
      const r2 = submitProposal({ ...base, role: 'agent' }, ok.sink)!
      add(
        `${s.id}:manager-can-approve`,
        'control',
        `${s.id}: a manager can approve it, then it can be executed (simulated)`,
        review(r2, 'manager', true, ok.sink) && execute({ ...r2, state: 'approved' }, 'manager', ok.sink),
      )
    }

    if (e.decision === 'ALLOW') {
      const m = memory()
      const rec = submitProposal({ ...base, role: 'agent' }, m.sink)
      add(
        `${s.id}:allow-executes`,
        'control',
        `${s.id}: an ALLOW proposal can be executed directly (simulated)`,
        !!rec && rec.state === 'suggested' && execute(rec, 'agent', m.sink),
      )
    }
  }

  // state machine, independent of any scenario
  const approvalDecision = evaluatePolicy({ action: 'REFUND', role: 'agent', order: getOrder('ORD-1001') }, policy) // REQUIRE_APPROVAL
  for (const state of ['approved', 'rejected', 'executed'] as const) {
    const m = memory()
    add(
      `state:review-${state}`,
      'prohibited',
      `a record that is already "${state}" cannot be reviewed again`,
      !review(record(approvalDecision, state), 'admin', true, m.sink) &&
        !review(record(approvalDecision, state), 'admin', false, m.sink) &&
        m.patched.length === 0,
    )
  }
  for (const state of ['pending_approval', 'rejected', 'executed'] as const) {
    const m = memory()
    add(
      `state:execute-${state}`,
      'prohibited',
      `a "${state}" record cannot be executed`,
      !execute(record(approvalDecision, state), 'admin', m.sink) && m.patched.length === 0,
    )
  }
  const m = memory()
  add(
    'state:suggested-needs-allow',
    'prohibited',
    'a "suggested" record whose decision is REQUIRE_APPROVAL cannot be executed',
    !execute(record(approvalDecision, 'suggested'), 'admin', m.sink) && m.patched.length === 0,
  )
  return checks
}

export interface EnforcementSummary {
  prohibited: { attempted: number; refused: number }
  controls: { attempted: number; passed: number }
  failed: EnforcementCheck[]
}
export function summarizeEnforcement(checks: EnforcementCheck[]): EnforcementSummary {
  const pro = checks.filter((c) => c.kind === 'prohibited')
  const ctl = checks.filter((c) => c.kind === 'control')
  return {
    prohibited: { attempted: pro.length, refused: pro.filter((c) => c.passed).length },
    controls: { attempted: ctl.length, passed: ctl.filter((c) => c.passed).length },
    failed: checks.filter((c) => !c.passed),
  }
}

import { canApprove, type PolicyEvaluation } from '../../domain/policy'
import type { ProposedActionKind, Role } from '../../domain/types'
import { createApproval, logAudit, patchApproval, type ApprovalRecord } from '../../stores/store'

const roleLabel = (r: Role) => `${r} (demo)`

/** Where approval side effects go. The app uses the store (local or Firestore); the Trust Center enforcement suite uses an in-memory sink. */
export interface ApprovalSink {
  create(a: ApprovalRecord): void
  patch(id: string, patch: Partial<ApprovalRecord>): void
  audit(actor: string, action: string, entity: string): void
}
export const storeSink: ApprovalSink = { create: createApproval, patch: patchApproval, audit: (a, b, c) => logAudit(a, b, c) }

const BLOCKING = ['DENY', 'NEED_MORE_INFORMATION']

export function submitProposal(
  p: {
    conversationId: string
    orderId: string
    action: ProposedActionKind
    label: string
    evaluation: PolicyEvaluation
    proposedBy: 'ai' | 'user'
    role: Role
  },
  sink: ApprovalSink = storeSink,
): ApprovalRecord | null {
  const { decision } = p.evaluation
  // DENY and NEED_MORE_INFORMATION can never become approvals (the Firestore rules refuse them too).
  if (BLOCKING.includes(decision)) {
    sink.audit(roleLabel(p.role), `policy_blocked:${p.evaluation.ruleId}:${p.action}`, p.orderId)
    return null
  }
  const now = new Date().toISOString()
  const rec: ApprovalRecord = {
    id: crypto.randomUUID(),
    conversationId: p.conversationId,
    orderId: p.orderId,
    action: p.action,
    label: p.label,
    state: decision === 'ALLOW' ? 'suggested' : 'pending_approval',
    evaluation: p.evaluation,
    proposedBy: p.proposedBy,
    actingRole: p.role,
    createdAt: now,
    updatedAt: now,
  }
  sink.create(rec)
  sink.audit(p.proposedBy === 'ai' ? 'ai-suggestion' : roleLabel(p.role), `proposed:${p.action}:${decision}`, p.orderId)
  return rec
}

export function review(a: ApprovalRecord, role: Role, approve: boolean, sink: ApprovalSink = storeSink): boolean {
  if (a.state !== 'pending_approval') return false
  // Client-side check. When signed in, the Firestore rules enforce the same limits server-side (role ceiling, high-risk rules).
  if (approve && !canApprove(role, a.evaluation)) return false
  sink.patch(a.id, { state: approve ? 'approved' : 'rejected', reviewer: roleLabel(role), reviewerRole: role })
  sink.audit(roleLabel(role), approve ? `approved:${a.action}` : `rejected:${a.action}`, a.orderId)
  return true
}

export function execute(a: ApprovalRecord, role: Role, sink: ApprovalSink = storeSink): boolean {
  // Defense in depth: a blocked decision is never executable, whatever state the record claims to be in.
  if (BLOCKING.includes(a.evaluation.decision)) return false
  if (a.state !== 'approved' && !(a.state === 'suggested' && a.evaluation.decision === 'ALLOW')) return false
  sink.patch(a.id, {
    state: 'executed',
    reviewer: a.reviewer ?? roleLabel(role),
    reviewerRole: role,
    note: 'Simulated in demo: no payment, shipment, inventory or customer message was actually changed or sent.',
  })
  sink.audit(roleLabel(role), `executed(simulated):${a.action}`, a.orderId)
  return true
}

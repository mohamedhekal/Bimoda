import { canApprove, type PolicyEvaluation } from '../../domain/policy'
import type { ProposedActionKind, Role } from '../../domain/types'
import { createApproval, logAudit, patchApproval, type ApprovalRecord } from '../../stores/store'

const roleLabel = (r: Role) => `${r} (demo)`

export function submitProposal(p: {
  conversationId: string
  orderId: string
  action: ProposedActionKind
  label: string
  evaluation: PolicyEvaluation
  proposedBy: 'ai' | 'user'
  role: Role
}): ApprovalRecord | null {
  const { decision } = p.evaluation
  // DENY and NEED_MORE_INFORMATION can never become approvals: the policy engine decides (and the Firestore rules refuse them too).
  if (decision === 'DENY' || decision === 'NEED_MORE_INFORMATION') {
    logAudit(roleLabel(p.role), `policy_blocked:${p.evaluation.ruleId}:${p.action}`, p.orderId)
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
  createApproval(rec)
  logAudit(p.proposedBy === 'ai' ? 'ai-suggestion' : roleLabel(p.role), `proposed:${p.action}:${decision}`, p.orderId)
  return rec
}

export function review(a: ApprovalRecord, role: Role, approve: boolean): boolean {
  if (a.state !== 'pending_approval') return false
  // UX guard. The authoritative check is the Firestore rules (membership role ceiling + high-risk rule roles) when signed in.
  if (approve && !canApprove(role, a.evaluation)) return false
  patchApproval(a.id, { state: approve ? 'approved' : 'rejected', reviewer: roleLabel(role), reviewerRole: role })
  logAudit(roleLabel(role), approve ? `approved:${a.action}` : `rejected:${a.action}`, a.orderId)
  return true
}

export function execute(a: ApprovalRecord, role: Role): boolean {
  if (a.state !== 'approved' && !(a.state === 'suggested' && a.evaluation.decision === 'ALLOW')) return false
  patchApproval(a.id, {
    state: 'executed',
    reviewer: a.reviewer ?? roleLabel(role),
    reviewerRole: role,
    note: 'Simulated in demo: no payment, shipment, inventory or customer message was actually changed or sent.',
  })
  logAudit(roleLabel(role), `executed(simulated):${a.action}`, a.orderId)
  return true
}

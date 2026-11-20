import { z } from 'zod'
import type { FulfillmentStatus, Order, ProposedActionKind, Role } from './types'
import { computeOrderTotals } from './pricing'

export type Decision = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'NEED_MORE_INFORMATION'

export const FULFILLMENT_ORDER: FulfillmentStatus[] = ['pending', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered']

export const PolicyConfigSchema = z.object({
  version: z.number().int().positive(),
  /** Orders at or beyond this status can no longer be edited */
  editLockFrom: z.enum(['processing', 'packed', 'shipped']),
  /** Max order value (cents) an agent may modify without approval */
  maxEditValueCents: z.number().int().min(0).max(5_000_000),
  /** Refunds above this need manager approval */
  refundApprovalThresholdCents: z.number().int().min(0).max(5_000_000),
  /** Inventory restock/refund requires confirmed warehouse receipt */
  requireWarehouseReceipt: z.boolean(),
  /** Outbound customer messages need a human to confirm */
  messagesRequireApproval: z.boolean(),
})
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>

export const DEFAULT_POLICY: PolicyConfig = {
  version: 1,
  editLockFrom: 'processing',
  maxEditValueCents: 15_000,
  refundApprovalThresholdCents: 10_000,
  requireWarehouseReceipt: true,
  messagesRequireApproval: true,
}

/** Rejects configurations the engine refuses to enforce (schema + cross-field rules). */
export function validatePolicyConfig(input: unknown): { ok: true; config: PolicyConfig } | { ok: false; errors: string[] } {
  const parsed = PolicyConfigSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }
  const c = parsed.data
  const errors: string[] = []
  if (c.refundApprovalThresholdCents > c.maxEditValueCents * 10) errors.push('refundApprovalThresholdCents must not exceed 10x maxEditValueCents')
  if (!c.requireWarehouseReceipt) errors.push('requireWarehouseReceipt cannot be disabled: courier status never proves physical receipt')
  if (!c.messagesRequireApproval) errors.push('messagesRequireApproval cannot be disabled in this version: no unreviewed outbound messages')
  return errors.length ? { ok: false, errors } : { ok: true, config: c }
}

export interface PolicyFacts {
  action: ProposedActionKind
  role: Role
  order: Order
  refundAmountCents?: number
}

export interface PolicyEvaluation {
  ruleId: string
  decision: Decision
  explanation: string
  enforcement: string
  facts: Record<string, string | number | boolean>
  policyVersion: number
  timestamp: string
}

const isLocked = (status: FulfillmentStatus, from: PolicyConfig['editLockFrom']) =>
  status !== 'cancelled' && FULFILLMENT_ORDER.indexOf(status) >= FULFILLMENT_ORDER.indexOf(from)

/**
 * Deterministic policy decision. The language model may only *propose* an action;
 * this function is the sole authority on whether it is permitted.
 */
export function evaluatePolicy(facts: PolicyFacts, config: PolicyConfig = DEFAULT_POLICY, now = new Date()): PolicyEvaluation {
  const { action, order, role } = facts
  const totals = computeOrderTotals(order)
  const base = {
    action,
    role,
    fulfillment: order.fulfillment,
    orderTotalCents: totals.totalCents,
  }
  const out = (
    ruleId: string,
    decision: Decision,
    explanation: string,
    enforcement: string,
    extra: Record<string, string | number | boolean> = {},
  ): PolicyEvaluation => ({
    ruleId,
    decision,
    explanation,
    enforcement,
    facts: { ...base, ...extra },
    policyVersion: config.version,
    timestamp: now.toISOString(),
  })

  switch (action) {
    case 'CHANGE_VARIANT':
      if (order.fulfillment === 'cancelled') return out('R-001', 'DENY', 'Order is cancelled; it cannot be edited.', 'Blocked.')
      if (isLocked(order.fulfillment, config.editLockFrom))
        return out(
          'R-001',
          'DENY',
          `Order is "${order.fulfillment}"; edits are locked from "${config.editLockFrom}" onward.`,
          'Blocked. Route to manual review.',
          { lockFrom: config.editLockFrom },
        )
      if (totals.totalCents > config.maxEditValueCents && role === 'agent')
        return out('R-002', 'REQUIRE_APPROVAL', 'Order value exceeds the agent edit limit.', 'Manager approval required.', {
          limitCents: config.maxEditValueCents,
        })
      return out('R-001', 'ALLOW', 'Order is not yet in fulfillment.', 'Permitted (simulated in demo).')
    case 'CHANGE_ADDRESS':
      if (order.fulfillment === 'cancelled') return out('R-003', 'DENY', 'Order is cancelled; its address cannot be changed.', 'Blocked.')
      if (!order.address.complete)
        return out('R-007', 'NEED_MORE_INFORMATION', 'Destination is incomplete or inconsistent.', 'Request clarification before any change.', {
          addressComplete: false,
        })
      if (isLocked(order.fulfillment, 'shipped'))
        return out(
          'R-003',
          'DENY',
          'Shipment already dispatched; address cannot be changed by the system.',
          'Blocked. Escalate to carrier via human operator.',
          { addressComplete: true },
        )
      return out('R-003', 'REQUIRE_APPROVAL', 'Address changes pre-dispatch need a human check.', 'Approval required.', { addressComplete: true })
    case 'RESTORE_INVENTORY': {
      const rc = order.returnCase
      if (!rc) return out('R-004', 'NEED_MORE_INFORMATION', 'No return case exists for this order.', 'Open a return case first.')
      if (config.requireWarehouseReceipt && rc.warehouseReceipt !== 'received')
        return out(
          'R-004',
          'DENY',
          `Courier pickup status "${rc.pickup}" does not prove physical warehouse receipt.`,
          'Blocked until warehouse confirms receipt.',
          { warehouseReceipt: rc.warehouseReceipt },
        )
      return out('R-004', 'REQUIRE_APPROVAL', 'Receipt confirmed; restock needs a reviewer.', 'Approval required.', { warehouseReceipt: rc.warehouseReceipt })
    }
    case 'REFUND': {
      const rc = order.returnCase
      const amount = facts.refundAmountCents ?? totals.totalCents
      if (config.requireWarehouseReceipt && rc && rc.warehouseReceipt !== 'received')
        return out('R-005', 'DENY', 'Refund requested but warehouse receipt is not confirmed.', 'Blocked.', {
          refundCents: amount,
          warehouseReceipt: rc.warehouseReceipt,
        })
      if (amount > config.refundApprovalThresholdCents || role === 'agent')
        return out(
          'R-006',
          'REQUIRE_APPROVAL',
          'Refund needs manager approval (amount or role).',
          'Manager approval required. No payment is executed in demo.',
          { refundCents: amount, thresholdCents: config.refundApprovalThresholdCents },
        )
      return out('R-006', 'REQUIRE_APPROVAL', 'Refunds are simulated in the demo and always need review.', 'Approval required.', { refundCents: amount })
    }
    case 'DRAFT_REPLY':
      return config.messagesRequireApproval
        ? out('R-008', 'REQUIRE_APPROVAL', 'Outbound customer messages need human confirmation.', 'Draft saved; sending is simulated after approval.')
        : out('R-008', 'ALLOW', 'Messages do not require approval.', 'Permitted.')
    case 'REQUEST_CLARIFICATION':
      return out('R-008', 'REQUIRE_APPROVAL', 'Clarification is an outbound message and needs confirmation.', 'Approval required.')
    case 'ESCALATE_SHIPPING':
    case 'FLAG_ORDER':
    case 'MANUAL_REVIEW':
      return out('R-009', 'ALLOW', 'Internal flagging is non-destructive.', 'Permitted.')
  }
}

export const canApprove = (role: Role, evalr: PolicyEvaluation): boolean => {
  if (evalr.decision !== 'REQUIRE_APPROVAL') return false
  if (evalr.ruleId === 'R-006' || evalr.ruleId === 'R-002') return role === 'manager' || role === 'admin'
  return true
}

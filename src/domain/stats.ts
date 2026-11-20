import type { AiRunRecord } from '../ai/hybrid-engine/types'
import type { ApprovalRecord, AuditEvent } from '../stores/store'
import type { Conversation, Order } from './types'
import { shippingSignals } from './signals'

export type Range = '24h' | '7d' | 'all'
const MS = { '24h': 86_400_000, '7d': 7 * 86_400_000 }

export const inRange = (iso: string, range: Range, now = Date.now()) => range === 'all' || now - new Date(iso).getTime() <= MS[range]

export interface ObservedStats {
  cases: number
  needsReview: number
  byType: Record<string, number>
  byPriority: Record<string, number>
  shippingExceptions: number
  returnsWithoutReceipt: number
  pendingApprovals: number
  policyBlocked: number
  runs: { total: number; success: number; onDevice: number; cloud: number; successRate: number | null; medianMs: number | null }
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : null)
const count = <T>(items: T[], key: (t: T) => string) => items.reduce<Record<string, number>>((acc, i) => ({ ...acc, [key(i)]: (acc[key(i)] ?? 0) + 1 }), {})

/** Everything here is counted from records: nothing is estimated or invented. */
export function computeObservedStats(p: {
  conversations: Conversation[]
  orders: Order[]
  approvals: ApprovalRecord[]
  audit: AuditEvent[]
  runs: AiRunRecord[]
  range: Range
  now?: number
}): ObservedStats {
  const now = p.now ?? Date.now()
  const runs = p.runs.filter((r) => inRange(r.timestamp, p.range, now))
  const ok = runs.filter((r) => r.status === 'success')
  const attempted = runs.filter((r) => r.status !== 'blocked_privacy' && r.status !== 'consent_required' && r.status !== 'cancelled')
  return {
    cases: p.conversations.length,
    needsReview: p.conversations.filter((c) => c.status === 'needs_review').length,
    byType: count(p.conversations, (c) => c.type),
    byPriority: count(p.conversations, (c) => c.priority),
    shippingExceptions: p.orders.filter((o) => shippingSignals(o).some((s) => s.severity === 'critical' || s.id === 'no_recent_update')).length,
    returnsWithoutReceipt: p.orders.filter((o) => o.returnCase && o.returnCase.warehouseReceipt !== 'received').length,
    pendingApprovals: p.approvals.filter((a) => a.state === 'pending_approval').length,
    policyBlocked: p.audit.filter((a) => a.action.startsWith('policy_blocked') && inRange(a.at, p.range, now)).length,
    runs: {
      total: runs.length,
      success: ok.length,
      onDevice: ok.filter((r) => r.source === 'ON_DEVICE').length,
      cloud: ok.filter((r) => r.source === 'IN_CLOUD').length,
      successRate: attempted.length ? ok.length / attempted.length : null,
      medianMs: median(ok.map((r) => r.durationMs)),
    },
  }
}

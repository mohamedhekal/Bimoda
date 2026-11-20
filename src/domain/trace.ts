import type { ConversationAnalysis } from '../ai/validation/schemas'
import type { AiRunRecord } from '../ai/hybrid-engine/types'
import { canApprove, type PolicyEvaluation } from './policy'
import { computeOrderTotals, formatMoney } from './pricing'
import { returnStage, type Signal } from './signals'
import type { Conversation, Order, Role } from './types'
import type { ApprovalRecord } from '../stores/store'

/** Who produced the content of a node: the UI colors and labels nodes by this so model text is never mistaken for enforcement. */
export type TraceOrigin = 'customer' | 'model' | 'deterministic' | 'human'
export type TraceStatus = 'done' | 'pending' | 'blocked' | 'warn'
export interface TraceNode {
  id: 'request' | 'interpretation' | 'facts' | 'policy' | 'authorization' | 'outcome'
  origin: TraceOrigin
  title: string
  summary: string
  evidence: { label: string; value: string }[]
  status: TraceStatus
}

export interface TraceInput {
  conversation: Conversation
  order: Order
  analysis?: { ok: true; data: ConversationAnalysis; record: AiRunRecord } | { ok: false; error: string; record: AiRunRecord }
  evaluation?: PolicyEvaluation
  approvals: ApprovalRecord[]
  role: Role
  signals: Signal[]
}

const HIGH_RISK = ['R-002', 'R-006']

export function buildDecisionTrace(i: TraceInput): TraceNode[] {
  const lastCustomer = [...i.conversation.messages].reverse().find((m) => m.from === 'customer')
  const totals = computeOrderTotals(i.order)
  const ret = i.order.returnCase ? returnStage(i.order.returnCase) : null
  const ev = i.evaluation
  const approval = ev ? i.approvals.find((a) => a.evaluation.timestamp === ev.timestamp && a.evaluation.ruleId === ev.ruleId) : undefined

  const request: TraceNode = {
    id: 'request',
    origin: 'customer',
    title: 'Customer request',
    summary: lastCustomer?.text ?? 'No customer message.',
    evidence: [
      { label: 'Channel', value: i.conversation.channel },
      { label: 'Trust', value: 'Untrusted text: never followed as instructions' },
    ],
    status: 'done',
  }

  const a = i.analysis
  const interpretation: TraceNode = !a
    ? {
        id: 'interpretation',
        origin: 'model',
        title: 'AI interpretation',
        summary: 'Not analyzed yet. Press "Analyze conversation".',
        evidence: [],
        status: 'pending',
      }
    : !a.ok
      ? {
          id: 'interpretation',
          origin: 'model',
          title: 'AI interpretation',
          summary: `No usable interpretation: ${a.error}`,
          evidence: [{ label: 'Run status', value: a.record.status }],
          status: 'warn',
        }
      : {
          id: 'interpretation',
          origin: 'model',
          title: 'AI interpretation',
          summary: a.data.summary,
          evidence: [
            { label: 'Intent', value: a.data.intent },
            { label: 'Tone / urgency', value: `${a.data.sentiment} / ${a.data.urgency}` },
            { label: 'Proposed action', value: a.data.suggestedAction },
            { label: 'Prompt injection suspected', value: a.data.suspectedPromptInjection ? 'yes' : 'no' },
            {
              label: 'Produced',
              value: `${a.record.source ?? 'unknown source'}${a.record.sourceBasis === 'mode' ? ' (per mode)' : ''}, ${a.record.durationMs} ms, validated with Zod`,
            },
          ],
          status: a.data.suspectedPromptInjection ? 'warn' : 'done',
        }

  const facts: TraceNode = {
    id: 'facts',
    origin: 'deterministic',
    title: 'Verified business facts',
    summary: `Order ${i.order.id} is "${i.order.fulfillment}"; total ${formatMoney(totals.totalCents)}${totals.freeShippingApplied ? ' (free shipping applied)' : ''}.`,
    evidence: [
      { label: 'Fulfillment', value: i.order.fulfillment },
      { label: 'Calculated total', value: formatMoney(totals.totalCents) },
      { label: 'Payment', value: i.order.paymentStatus },
      { label: 'Address complete', value: i.order.address.complete ? 'yes' : 'no' },
      ...(ret ? [{ label: 'Return', value: `${ret.label}; warehouse receipt ${ret.physicallyReceived ? 'confirmed' : 'not confirmed'}` }] : []),
      ...i.signals.map((s) => ({ label: `Signal (${s.severity})`, value: s.title })),
    ],
    status: 'done',
  }

  const policy: TraceNode = !ev
    ? {
        id: 'policy',
        origin: 'deterministic',
        title: 'Policy evaluation',
        summary: 'No action evaluated yet. Propose an action or analyze the conversation.',
        evidence: [],
        status: 'pending',
      }
    : {
        id: 'policy',
        origin: 'deterministic',
        title: 'Policy evaluation',
        summary: `${ev.decision.replaceAll('_', ' ')}: ${ev.explanation}`,
        evidence: [
          { label: 'Decision', value: ev.decision },
          { label: 'Rule / policy version', value: `${ev.ruleId} / v${ev.policyVersion}` },
          { label: 'Enforcement', value: ev.enforcement },
          ...Object.entries(ev.facts).map(([k, v]) => ({ label: `Input fact: ${k}`, value: String(v) })),
          { label: 'Evaluated at', value: ev.timestamp },
        ],
        status: ev.decision === 'DENY' ? 'blocked' : ev.decision === 'ALLOW' ? 'done' : 'warn',
      }

  const authorization: TraceNode = !ev
    ? { id: 'authorization', origin: 'human', title: 'Authorization', summary: 'Waiting for a policy decision.', evidence: [], status: 'pending' }
    : ev.decision === 'DENY'
      ? {
          id: 'authorization',
          origin: 'deterministic',
          title: 'Authorization',
          summary: 'No approval path: a DENY cannot be overridden by approving it. Route to manual review.',
          evidence: [],
          status: 'blocked',
        }
      : ev.decision === 'NEED_MORE_INFORMATION'
        ? {
            id: 'authorization',
            origin: 'deterministic',
            title: 'Authorization',
            summary: 'Not approvable until the missing information is provided.',
            evidence: [],
            status: 'warn',
          }
        : ev.decision === 'ALLOW'
          ? {
              id: 'authorization',
              origin: 'deterministic',
              title: 'Authorization',
              summary: 'No approval needed. The action is still recorded in the audit log.',
              evidence: [],
              status: 'done',
            }
          : {
              id: 'authorization',
              origin: 'human',
              title: 'Authorization',
              summary: `A human with role ${HIGH_RISK.includes(ev.ruleId) ? 'manager or admin' : 'any member'} must approve.`,
              evidence: [
                { label: 'Required', value: HIGH_RISK.includes(ev.ruleId) ? 'manager or admin' : 'any member' },
                { label: `Current role (${i.role})`, value: canApprove(i.role, ev) ? 'can approve' : 'cannot approve' },
              ],
              status: 'warn',
            }

  const outcomeText = !ev
    ? 'No outcome yet.'
    : approval
      ? approval.state === 'executed'
        ? 'Executed (simulated): nothing outside this demo changed.'
        : `Approval state: ${approval.state.replaceAll('_', ' ')}.`
      : ev.decision === 'DENY' || ev.decision === 'NEED_MORE_INFORMATION'
        ? 'Blocked. No approval record was created; the case should go to manual review.'
        : 'No approval record yet.'
  const outcome: TraceNode = {
    id: 'outcome',
    origin: approval?.reviewer ? 'human' : 'deterministic',
    title: 'Outcome',
    summary: outcomeText,
    evidence: approval
      ? [
          { label: 'Reviewer', value: approval.reviewer ?? 'not reviewed yet' },
          { label: 'Updated', value: approval.updatedAt },
        ]
      : [],
    status: !ev ? 'pending' : approval?.state === 'executed' || approval?.state === 'approved' ? 'done' : ev.decision === 'DENY' ? 'blocked' : 'warn',
  }

  return [request, interpretation, facts, policy, authorization, outcome]
}

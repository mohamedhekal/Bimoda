import type { HybridEngine } from './hybrid-engine/engine'
import type { AiRunRecord, InferencePreference } from './hybrid-engine/types'
import {
  insightsJsonSchema,
  InsightsSchema,
  type Insights,
  analysisJsonSchema,
  ConversationAnalysisSchema,
  parseModelJson,
  ReplyDraftSchema,
  fillAmounts,
  hasInventedAmount,
  type ConversationAnalysis,
} from './validation/schemas'
import { insightsPrompt, conversationAnalysisPrompt, entitiesFor, replyComposerPrompt, type ReplyLength, type ReplyTone } from './prompts/prompts'
import type { Conversation, Customer, Order } from '../domain/types'
import { computeOrderTotals, formatMoney } from '../domain/pricing'
import type { ObservedStats } from '../domain/stats'

/** Redaction placeholders echoed by the model are swapped back to the real values locally, after the model call. */
export function restorePlaceholders(text: string, customer: Customer, order: Order): string {
  return text
    .replaceAll('[CUSTOMER_NAME]', customer.displayName)
    .replaceAll('[ADDRESS]', order.address.line1)
    .replaceAll('[PHONE]', customer.phone)
    .replaceAll('[EMAIL]', customer.email)
}

export type FeatureResult<T> = { ok: true; data: T; record: AiRunRecord } | { ok: false; error: string; record: AiRunRecord; kind: 'engine' | 'invalid_output' }

export async function analyzeConversation(
  engine: HybridEngine,
  c: Conversation,
  order: Order,
  customer: Customer,
  preference: InferencePreference,
  signal?: AbortSignal,
  feature = 'conversation_intelligence',
): Promise<FeatureResult<ConversationAnalysis>> {
  const res = await engine.run({
    feature,
    preference,
    prompt: conversationAnalysisPrompt(c, order, customer),
    jsonSchema: analysisJsonSchema,
    entities: entitiesFor(customer, order),
    signal,
  })
  if (res.record.status !== 'success' || res.text === undefined)
    return { ok: false, error: res.record.reason ?? res.record.status, record: res.record, kind: 'engine' }
  const parsed = parseModelJson(res.text, ConversationAnalysisSchema)
  if (!parsed.ok) return { ok: false, error: parsed.error, record: res.record, kind: 'invalid_output' }
  return { ok: true, data: parsed.data, record: res.record }
}

export async function composeReply(
  engine: HybridEngine,
  c: Conversation,
  order: Order,
  customer: Customer,
  preference: InferencePreference,
  tone: ReplyTone,
  length: ReplyLength,
  plannedAction: string,
  signal?: AbortSignal,
): Promise<FeatureResult<string>> {
  const res = await engine.run({
    feature: 'response_composer',
    preference,
    prompt: replyComposerPrompt(c, order, customer, tone, length, plannedAction),
    entities: entitiesFor(customer, order),
    signal,
  })
  if (res.record.status !== 'success' || res.text === undefined)
    return { ok: false, error: res.record.reason ?? res.record.status, record: res.record, kind: 'engine' }
  const parsed = parseModelJson(res.text, ReplyDraftSchema)
  if (!parsed.ok) return { ok: false, error: parsed.error, record: res.record, kind: 'invalid_output' }
  if (hasInventedAmount(parsed.data.reply))
    return { ok: false, error: 'Draft stated a money amount that did not come from order records. Discarded.', record: res.record, kind: 'invalid_output' }
  const t = computeOrderTotals(order)
  const reply = fillAmounts(parsed.data.reply, {
    total: formatMoney(t.totalCents),
    shippingFee: formatMoney(t.shippingFeeCents),
    amountDue: formatMoney(t.amountDueCents),
  })
  return { ok: true, data: restorePlaceholders(reply, customer, order), record: res.record }
}

export async function generateInsights(
  engine: HybridEngine,
  stats: ObservedStats,
  preference: InferencePreference,
  signal?: AbortSignal,
): Promise<FeatureResult<Insights>> {
  const res = await engine.run({ feature: 'operations_insights', preference, prompt: insightsPrompt(stats), jsonSchema: insightsJsonSchema(), signal })
  if (res.record.status !== 'success' || res.text === undefined)
    return { ok: false, error: res.record.reason ?? res.record.status, record: res.record, kind: 'engine' }
  const parsed = parseModelJson(res.text, InsightsSchema)
  if (!parsed.ok) return { ok: false, error: parsed.error, record: res.record, kind: 'invalid_output' }
  return { ok: true, data: parsed.data, record: res.record }
}

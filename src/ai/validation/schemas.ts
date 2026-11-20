import { z } from 'zod'

export const ACTION_KINDS = [
  'DRAFT_REPLY',
  'CHANGE_VARIANT',
  'CHANGE_ADDRESS',
  'REFUND',
  'RESTORE_INVENTORY',
  'FLAG_ORDER',
  'REQUEST_CLARIFICATION',
  'ESCALATE_SHIPPING',
  'MANUAL_REVIEW',
] as const

export const ConversationAnalysisSchema = z.object({
  intent: z.enum(['order_status', 'change_order', 'change_address', 'return_or_refund', 'pricing_question', 'complaint', 'product_question', 'other']),
  mainIssue: z.string().min(3).max(300),
  sentiment: z.enum(['positive', 'neutral', 'frustrated', 'angry']),
  urgency: z.enum(['low', 'medium', 'high']),
  keyDetails: z.array(z.string().max(200)).max(8),
  missingInformation: z.array(z.string().max(200)).max(6),
  orderReferences: z.array(z.string().max(40)).max(5),
  suggestedAction: z.enum(ACTION_KINDS),
  summary: z.string().min(3).max(500),
  /** model's belief the customer text tries to override instructions */
  suspectedPromptInjection: z.boolean(),
})
export type ConversationAnalysis = z.infer<typeof ConversationAnalysisSchema>

export const InsightsSchema = z.object({
  patterns: z.array(z.string().max(300)).min(1).max(5),
  suggestions: z.array(z.string().max(300)).min(1).max(5),
  limitations: z.array(z.string().max(300)).max(4),
})
export type Insights = z.infer<typeof InsightsSchema>
export const insightsJsonSchema = (): object => toDeviceSchema(z.toJSONSchema(InsightsSchema)) as object

export const ReplyDraftSchema = z.object({ reply: z.string().min(5).max(1200) })

// Verified on desktop Chrome 157 (Prompt API, Gemini Nano):
//  - arrays WITHOUT maxItems made generation run until the 45s timeout (reproduced twice), so max* limits must be kept;
//  - this reduced schema (no $schema / additionalProperties / minLength / minItems) answered in 6-10s for every schema we use;
//  - the full Zod output also answered on fresh pages, so a one-off hang seen earlier may have been a wedged model session.
// Zod still enforces every constraint on the parsed output.
const DEVICE_UNSAFE_KEYS = new Set(['$schema', 'additionalProperties', 'minLength', 'minItems'])

export function toDeviceSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toDeviceSchema)
  if (node && typeof node === 'object')
    return Object.fromEntries(
      Object.entries(node)
        .filter(([k]) => !DEVICE_UNSAFE_KEYS.has(k))
        .map(([k, v]) => [k, toDeviceSchema(v)]),
    )
  return node
}

/** JSON schema handed to the on-device model as responseConstraint (reduced; Zod validates everything). */
export const analysisJsonSchema = toDeviceSchema(z.toJSONSchema(ConversationAnalysisSchema)) as object

/** Extracts and validates JSON from model text. Never trusts unvalidated output. */
export function parseModelJson<T>(text: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; error: string } {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return { ok: false, error: 'No JSON object found in model output' }
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return { ok: false, error: 'Model output is not valid JSON' }
  }
  const parsed = schema.safeParse(raw)
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
}

/** Amount placeholders the composer may use; real values are substituted from records. */
export const AMOUNT_TOKENS = ['{{TOTAL}}', '{{SHIPPING_FEE}}', '{{AMOUNT_DUE}}'] as const

export function fillAmounts(text: string, amounts: { total: string; shippingFee: string; amountDue: string }): string {
  return text.replaceAll('{{TOTAL}}', amounts.total).replaceAll('{{SHIPPING_FEE}}', amounts.shippingFee).replaceAll('{{AMOUNT_DUE}}', amounts.amountDue)
}

/** True when text (before substitution) states a money amount the model invented. */
export const hasInventedAmount = (templated: string): boolean => /[$€£]\s?\d|\d\s?(USD|EUR|GBP)\b/i.test(templated)

import { describe, expect, it } from 'vitest'
import { returnStage, shippingSignals } from '../domain/signals'
import { computeObservedStats } from '../domain/stats'
import { evaluatePolicy } from '../domain/policy'
import { conversations, customers, getCustomer, getOrder, orders } from '../domain/seed'
import { computeOrderTotals } from '../domain/pricing'
import { redact } from '../ai/privacy/redact'
import { restorePlaceholders } from '../ai/features'
import { stageStates } from '../features/lab/stages'
import type { AiRunRecord } from '../ai/hybrid-engine/types'
import type { Order } from '../domain/types'

const conv = (id: string) => conversations.find((c) => c.id === id)!

describe('seed dataset', () => {
  it('meets the required size and every conversation points at a real order', () => {
    expect(orders.length).toBeGreaterThanOrEqual(25)
    expect(conversations.length).toBeGreaterThanOrEqual(15)
    for (const c of conversations) expect(orders.some((o) => o.id === c.orderId)).toBe(true)
    for (const o of orders) expect(customers.some((x) => x.id === o.customerId)).toBe(true)
  })
  it('uses only synthetic contact values', () => {
    for (const c of customers) {
      expect(c.email).toMatch(/@example\.test$/)
      expect(c.phone).toMatch(/^\+1-555-01\d\d$/)
    }
  })
  it('scenario A: stated total differs from the calculated one and shipping is free', () => {
    const o = getOrder('ORD-1001')
    const t = computeOrderTotals(o)
    expect(o.statedTotalCents).not.toBe(t.totalCents)
    expect(t.freeShippingApplied).toBe(true)
  })
})

describe('shipping signals (rule-based)', () => {
  it('flags repeated failed attempts and a late change request (scenario E)', () => {
    const ids = shippingSignals(getOrder('ORD-1005'), conv('CV-005')).map((s) => s.id)
    expect(ids).toContain('repeated_failed_attempts')
    expect(ids).toContain('request_after_lock')
  })
  it('flags a change request after dispatch (scenario B) but no false delay', () => {
    const ids = shippingSignals(getOrder('ORD-1002'), conv('CV-002')).map((s) => s.id)
    expect(ids).toContain('request_after_lock')
    expect(ids).not.toContain('no_recent_update')
  })
  it('flags an uncertain address (scenario C)', () => {
    expect(shippingSignals(getOrder('ORD-1003'), conv('CV-003')).map((s) => s.id)).toContain('address_uncertain')
  })
  it('flags events that continue after DELIVERED and does not invent events', () => {
    const o: Order = {
      ...getOrder('ORD-1002'),
      shipmentEvents: [
        { at: '2026-11-10T09:00:00Z', status: 'DELIVERED', note: '' },
        { at: '2026-11-12T09:00:00Z', status: 'FAILED_ATTEMPT', note: '' },
      ],
    }
    expect(shippingSignals(o).map((s) => s.id)).toContain('status_regression')
    expect(shippingSignals({ ...getOrder('ORD-1003') }).every((s) => s.id === 'address_uncertain')).toBe(true)
  })
})

describe('return intelligence (scenario D)', () => {
  it('never treats a courier pickup as warehouse receipt', () => {
    const r = returnStage(getOrder('ORD-1004').returnCase)
    expect(r.physicallyReceived).toBe(false)
    expect(r.label).toBe('Carrier pickup confirmed')
    expect(r.caveat).toMatch(/do not restock/i)
  })
  it('recognises confirmed warehouse receipt', () => {
    expect(returnStage({ pickup: 'carrier_confirmed', warehouseReceipt: 'received', settlement: 'pending' }).physicallyReceived).toBe(true)
  })
})

describe('policy edge cases', () => {
  it('denies edits on cancelled orders', () => {
    const o: Order = { ...getOrder('ORD-1007'), fulfillment: 'cancelled' }
    expect(evaluatePolicy({ action: 'CHANGE_VARIANT', role: 'admin', order: o }).decision).toBe('DENY')
    expect(evaluatePolicy({ action: 'CHANGE_ADDRESS', role: 'admin', order: o }).decision).toBe('DENY')
  })
  it('allows internal flagging and always records version and timestamp', () => {
    const e = evaluatePolicy({ action: 'FLAG_ORDER', role: 'agent', order: getOrder('ORD-1002') }, undefined, new Date('2026-01-01T00:00:00Z'))
    expect(e).toMatchObject({ decision: 'ALLOW', policyVersion: 1, timestamp: '2026-01-01T00:00:00.000Z' })
  })
})

describe('redaction details', () => {
  it('keeps ISO dates and short ids but redacts long phone numbers', () => {
    const r = redact('Order ORD-1001 shipped 2026-11-20, call 0123456789 or +1 (555) 010-0142')
    expect(r.text).toContain('2026-11-20')
    expect(r.text).toContain('ORD-1001')
    expect(r.text).not.toMatch(/0123456789|555/)
  })
  it('redacts the real seeded customer end to end', () => {
    const c = getCustomer(getOrder('ORD-1001').customerId)
    const r = redact(`${c.displayName} <${c.email}> ${c.phone}`, { names: [c.displayName], emails: [c.email], phones: [c.phone] })
    expect(r.text).not.toMatch(/Avery|Vale|example\.test|555/)
  })
  it('restores placeholders locally in model replies', () => {
    const o = getOrder('ORD-1001')
    const c = getCustomer(o.customerId)
    expect(restorePlaceholders('Hi [CUSTOMER_NAME], sending to [ADDRESS]', c, o)).toBe(`Hi ${c.displayName}, sending to ${o.address.line1}`)
  })
})

const run = (p: Partial<AiRunRecord>): AiRunRecord => ({
  id: crypto.randomUUID(),
  feature: 'f',
  requestedPreference: 'PREFER_ON_DEVICE',
  effectivePreference: 'PREFER_ON_DEVICE',
  privacyMode: 'hybrid',
  source: 'ON_DEVICE',
  sourceBasis: 'sdk',
  status: 'success',
  durationMs: 100,
  inputChars: 10,
  redactions: 0,
  redactionApplied: false,
  timestamp: new Date().toISOString(),
  ...p,
})

describe('observed stats', () => {
  const base = { conversations, orders, approvals: [], audit: [] }
  it('counts only real records and excludes blocked runs from the success rate', () => {
    const now = Date.now()
    const s = computeObservedStats({
      ...base,
      range: 'all',
      now,
      runs: [
        run({ durationMs: 10 }),
        run({ durationMs: 30, source: 'IN_CLOUD' }),
        run({ status: 'error', source: null }),
        run({ status: 'blocked_privacy', source: null }),
      ],
    })
    expect(s.runs).toMatchObject({ total: 4, success: 2, onDevice: 1, cloud: 1, medianMs: 30 })
    expect(s.runs.successRate).toBeCloseTo(2 / 3)
  })
  it('applies the time range to runs but not to the static dataset', () => {
    const now = Date.now()
    const old = run({ timestamp: new Date(now - 3 * 86_400_000).toISOString() })
    expect(computeObservedStats({ ...base, range: '24h', now, runs: [old, run({})] }).runs.total).toBe(1)
    expect(computeObservedStats({ ...base, range: '7d', now, runs: [old, run({})] }).runs.total).toBe(2)
    expect(computeObservedStats({ ...base, range: '24h', now, runs: [] }).cases).toBe(conversations.length)
  })
  it('reports null (not 0%) when nothing has run', () => {
    expect(computeObservedStats({ ...base, range: 'all', runs: [] }).runs.successRate).toBeNull()
  })
})

describe('architecture stage states', () => {
  it('idle when nothing happened, active only while a request is in flight', () => {
    expect(stageStates(false).every((s) => s === 'idle')).toBe(true)
    expect(stageStates(true)).toEqual(['done', 'done', 'active', 'idle', 'idle', 'idle', 'idle'])
  })
  it('reflects the real outcome', () => {
    expect(stageStates(false, { status: 'success' })).toEqual(['done', 'done', 'done', 'done', 'done', 'idle', 'idle'])
    expect(stageStates(false, { status: 'blocked_privacy' })[1]).toBe('blocked')
    expect(stageStates(false, { status: 'config_missing' })[2]).toBe('blocked')
    expect(stageStates(false, { status: 'unavailable' })[3]).toBe('blocked')
    expect(stageStates(false, { status: 'error' })[3]).toBe('blocked')
  })
})

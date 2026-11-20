import { describe, expect, it } from 'vitest'
import { planRoute, type RouteInput } from '../ai/hybrid-engine/route'
import { classify, cloudAllowed, STALE_AFTER_MS } from '../firebase/remoteConfig'
import { INFERENCE_PREFERENCES } from '../ai/hybrid-engine/types'

const base: RouteInput = { privacyMode: 'hybrid', preference: 'PREFER_ON_DEVICE', cloudEnabled: true, online: true, allowIdentifiableCloud: false }
const plan = (o: Partial<RouteInput>) => planRoute({ ...base, ...o })

describe('planRoute (single source of truth for the privacy gate)', () => {
  it('ONLY_ON_DEVICE never reaches the cloud and needs no redaction, in every mode', () => {
    for (const privacyMode of ['hybrid', 'local-only', 'cloud'] as const) {
      const p = plan({ privacyMode, preference: 'ONLY_ON_DEVICE' })
      expect(p).toMatchObject({ effective: 'ONLY_ON_DEVICE', mayReachCloud: false, redact: false, blocked: null })
    }
  })
  it('Local Only blocks every cloud preference and tightens PREFER_ON_DEVICE', () => {
    for (const preference of ['ONLY_IN_CLOUD', 'PREFER_IN_CLOUD'] as const)
      expect(plan({ privacyMode: 'local-only', preference }).blocked?.status).toBe('blocked_privacy')
    expect(plan({ privacyMode: 'local-only', preference: 'PREFER_ON_DEVICE' })).toMatchObject({
      effective: 'ONLY_ON_DEVICE',
      mayReachCloud: false,
      blocked: null,
    })
  })
  it('the operator kill switch behaves like Local Only but says why', () => {
    const p = plan({ cloudEnabled: false, preference: 'ONLY_IN_CLOUD' })
    expect(p.blocked).toMatchObject({ status: 'blocked_privacy' })
    expect(p.blocked?.reason).toMatch(/Remote Config/)
    expect(plan({ cloudEnabled: false, preference: 'PREFER_ON_DEVICE' }).mayReachCloud).toBe(false)
  })
  it('cloud-capable routes redact unless the user consented', () => {
    for (const preference of ['PREFER_ON_DEVICE', 'ONLY_IN_CLOUD', 'PREFER_IN_CLOUD'] as const) {
      expect(plan({ preference }).redact).toBe(true)
      expect(plan({ preference, allowIdentifiableCloud: true }).redact).toBe(false)
    }
  })
  it('a feature that needs identifiable text is blocked without consent on any cloud-capable route', () => {
    expect(plan({ needsIdentifiable: true }).blocked?.status).toBe('consent_required')
    expect(plan({ needsIdentifiable: true, allowIdentifiableCloud: true }).blocked).toBeNull()
    expect(plan({ needsIdentifiable: true, preference: 'ONLY_ON_DEVICE' }).blocked).toBeNull()
  })
  it('offline blocks only the cloud-only preference', () => {
    expect(plan({ online: false, preference: 'ONLY_IN_CLOUD' }).blocked?.status).toBe('offline')
    expect(plan({ online: false, preference: 'PREFER_ON_DEVICE' }).blocked).toBeNull()
  })
  it('covers the full matrix without surprises: a blocked plan never says it may reach the cloud with redaction pending', () => {
    for (const privacyMode of ['hybrid', 'local-only', 'cloud'] as const)
      for (const preference of INFERENCE_PREFERENCES)
        for (const cloudEnabled of [true, false])
          for (const online of [true, false]) {
            const p = plan({ privacyMode, preference, cloudEnabled, online })
            expect(p.steps.length).toBeGreaterThan(0)
            if (p.blocked?.status === 'blocked_privacy') expect(p.redact).toBe(false)
            if (privacyMode === 'local-only') expect(p.mayReachCloud).toBe(false)
          }
  })
})

describe('Remote Config freshness and fail-closed rule', () => {
  const now = 10_000_000_000
  it('classifies freshness from SDK facts', () => {
    expect(classify({ hasConfig: false, fetchedAt: null, lastFetchFailed: false, now })).toBe('default')
    expect(classify({ hasConfig: true, fetchedAt: now - 1000, lastFetchFailed: false, now })).toBe('live')
    expect(classify({ hasConfig: true, fetchedAt: now - STALE_AFTER_MS - 1, lastFetchFailed: false, now })).toBe('stale')
    expect(classify({ hasConfig: true, fetchedAt: now - 1000, lastFetchFailed: true, now })).toBe('stale')
    expect(classify({ hasConfig: true, fetchedAt: null, lastFetchFailed: true, now })).toBe('error')
  })
  it('is fail-open by default and fail-closed only when opted in', () => {
    expect(cloudAllowed({ remoteValue: true, status: 'error', failClosed: false })).toBe(true)
    expect(cloudAllowed({ remoteValue: true, status: 'error', failClosed: true })).toBe(false)
    expect(cloudAllowed({ remoteValue: true, status: 'default', failClosed: true })).toBe(false)
    expect(cloudAllowed({ remoteValue: true, status: 'live', failClosed: true })).toBe(true)
    expect(cloudAllowed({ remoteValue: false, status: 'live', failClosed: false })).toBe(false)
  })
})

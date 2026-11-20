import { describe, expect, it, vi } from 'vitest'
import { HybridEngine } from '../ai/hybrid-engine/engine'
import type { AdapterResponse, ModelAdapter } from '../ai/hybrid-engine/types'

const adapter = (impl: (signal?: AbortSignal) => Promise<AdapterResponse>): ModelAdapter => ({
  generate: vi.fn((r) => impl(r.signal)),
  initializeDeviceModel: vi.fn(async () => {}),
  probeDevice: vi.fn(async () => ({ state: 'ready' as const })),
})
const engine = (a: ModelAdapter, timeoutMs = 5000) =>
  new HybridEngine({ adapter: a, getSettings: () => ({ privacyMode: 'hybrid', allowIdentifiableCloud: false }), isOnline: () => true, timeoutMs })

describe('engine robustness', () => {
  it('reports a user cancel as cancelled, not as an error or unavailable', async () => {
    const ctl = new AbortController()
    const p = engine(adapter(() => new Promise(() => {}))).run({ feature: 't', preference: 'ONLY_ON_DEVICE', prompt: 'x', signal: ctl.signal })
    setTimeout(() => ctl.abort(), 10)
    const r = await p
    expect(r.record.status).toBe('cancelled')
  })
  it('a timeout is reported as a timeout, never as cancelled', async () => {
    const r = await engine(
      adapter(() => new Promise(() => {})),
      15,
    ).run({ feature: 't', preference: 'ONLY_IN_CLOUD', prompt: 'x' })
    expect(r.record.status).toBe('error')
    expect(r.record.reason).toMatch(/Timed out/)
  })
  it('passes an abort signal to the adapter and aborts it on timeout', async () => {
    let seen: AbortSignal | undefined
    await engine(
      adapter((s) => {
        seen = s
        return new Promise(() => {})
      }),
      15,
    ).run({ feature: 't', preference: 'ONLY_ON_DEVICE', prompt: 'x' })
    expect(seen?.aborted).toBe(true)
  })
  it('a cloud failure behind PREFER_ON_DEVICE stays an error (not "unavailable")', async () => {
    const r = await engine(
      adapter(async () => {
        throw new Error('503 Service Unavailable')
      }),
    ).run({ feature: 't', preference: 'PREFER_ON_DEVICE', prompt: 'x' })
    expect(r.record.status).toBe('error')
  })
  it('never guesses the source for PREFER_* when the SDK does not report one', async () => {
    const r = await engine(adapter(async () => ({ text: 'ok' }))).run({ feature: 't', preference: 'PREFER_ON_DEVICE', prompt: 'x' })
    expect(r.record).toMatchObject({ status: 'success', source: null, sourceBasis: null })
  })
  it('records every run through onRecord exactly once', async () => {
    const onRecord = vi.fn()
    const e = new HybridEngine({
      adapter: adapter(async () => ({ text: 'ok', sdkSource: 'IN_CLOUD' })),
      getSettings: () => ({ privacyMode: 'hybrid', allowIdentifiableCloud: false }),
      isOnline: () => true,
      onRecord,
    })
    await e.run({ feature: 't', preference: 'ONLY_IN_CLOUD', prompt: 'x' })
    expect(onRecord).toHaveBeenCalledTimes(1)
  })
  it('does not store the prompt in the run record', async () => {
    const r = await engine(adapter(async () => ({ text: 'ok', sdkSource: 'IN_CLOUD' }))).run({
      feature: 't',
      preference: 'ONLY_IN_CLOUD',
      prompt: 'secret customer text',
    })
    expect(JSON.stringify(r.record)).not.toContain('secret customer text')
  })
})

describe('Remote Config kill switch', () => {
  const make = (cloudEnabled: boolean, mode: 'hybrid' | 'local-only' = 'hybrid') => {
    const a = adapter(async () => ({ text: 'ok', sdkSource: 'ON_DEVICE' }))
    return {
      a,
      e: new HybridEngine({
        adapter: a,
        getSettings: () => ({ privacyMode: mode, allowIdentifiableCloud: false }),
        isOnline: () => true,
        cloudEnabled: () => cloudEnabled,
      }),
    }
  }
  it('blocks cloud-only runs with an operator-specific reason and never calls the adapter', async () => {
    const { a, e } = make(false)
    const r = await e.run({ feature: 't', preference: 'ONLY_IN_CLOUD', prompt: 'x' })
    expect(r.record.status).toBe('blocked_privacy')
    expect(r.record.reason).toMatch(/Remote Config/)
    expect(a.generate).not.toHaveBeenCalled()
  })
  it('tightens PREFER_ON_DEVICE to ONLY_ON_DEVICE so no silent cloud fallback can happen', async () => {
    const { a, e } = make(false)
    await e.run({ feature: 't', preference: 'PREFER_ON_DEVICE', prompt: 'x' })
    expect((a.generate as ReturnType<typeof vi.fn>).mock.calls[0]![0].preference).toBe('ONLY_ON_DEVICE')
  })
  it('does nothing when the switch is on', async () => {
    const { e } = make(true)
    expect((await e.run({ feature: 't', preference: 'ONLY_IN_CLOUD', prompt: 'x' })).record.status).toBe('success')
  })
})

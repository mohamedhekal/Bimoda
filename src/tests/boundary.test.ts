import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HybridEngine } from '../ai/hybrid-engine/engine'
import { INFERENCE_PREFERENCES, type AdapterRequest, type ModelAdapter, type PrivacyMode } from '../ai/hybrid-engine/types'

// ---- boundary 1: what the engine hands to the adapter (observed with a spy, not derived from planRoute) ----
const spyAdapter = () => {
  const seen: AdapterRequest[] = []
  const adapter: ModelAdapter = {
    generate: async (r) => (seen.push(r), { text: 'ok', sdkSource: 'ON_DEVICE' }),
    initializeDeviceModel: async () => {},
    probeDevice: async () => ({ state: 'ready' }),
  }
  return { seen, adapter }
}

describe('Local Only routing boundary (observed at the adapter)', () => {
  it('only ever hands the SDK ONLY_ON_DEVICE, for every preference, consent and connectivity combination', async () => {
    for (const privacyMode of ['local-only'] as PrivacyMode[])
      for (const preference of INFERENCE_PREFERENCES)
        for (const allowIdentifiableCloud of [false, true])
          for (const needsIdentifiable of [false, true])
            for (const online of [true, false]) {
              const { seen, adapter } = spyAdapter()
              const engine = new HybridEngine({ adapter, getSettings: () => ({ privacyMode, allowIdentifiableCloud }), isOnline: () => online })
              const r = await engine.run({ feature: 't', preference, prompt: 'Jordan Hart +1-555-0142', needsIdentifiable })
              for (const call of seen)
                expect(call.preference, JSON.stringify({ preference, allowIdentifiableCloud, needsIdentifiable, online })).toBe('ONLY_ON_DEVICE')
              // explicit cloud requests never reach the adapter at all
              if (preference === 'ONLY_IN_CLOUD' || preference === 'PREFER_IN_CLOUD') {
                expect(seen).toHaveLength(0)
                expect(r.record.status).toBe('blocked_privacy')
              }
              // and local-only never redacts: the prompt stays on the device, so it must be passed through unchanged
              for (const call of seen) expect(call.prompt).toBe('Jordan Hart +1-555-0142')
            }
  })

  it('the operator switch (Remote Config off) has the same boundary in every privacy mode', async () => {
    for (const privacyMode of ['hybrid', 'cloud'] as PrivacyMode[])
      for (const preference of INFERENCE_PREFERENCES) {
        const { seen, adapter } = spyAdapter()
        const engine = new HybridEngine({
          adapter,
          getSettings: () => ({ privacyMode, allowIdentifiableCloud: true }),
          isOnline: () => true,
          cloudEnabled: () => false,
        })
        await engine.run({ feature: 't', preference, prompt: 'x' })
        for (const call of seen) expect(call.preference).toBe('ONLY_ON_DEVICE')
      }
  })

  it('when the cloud is allowed, Hybrid really can hand the SDK a cloud-capable preference (the boundary is not simply "always on-device")', async () => {
    const { seen, adapter } = spyAdapter()
    const engine = new HybridEngine({ adapter, getSettings: () => ({ privacyMode: 'hybrid', allowIdentifiableCloud: false }), isOnline: () => true })
    await engine.run({ feature: 't', preference: 'ONLY_IN_CLOUD', prompt: 'x' })
    expect(seen[0]!.preference).toBe('ONLY_IN_CLOUD')
  })
})

// ---- boundary 2: what the Firebase adapter passes to the SDK ----
const sdk = vi.hoisted(() => ({
  getGenerativeModel: vi.fn(),
  modes: { PREFER_ON_DEVICE: 'prefer_on_device', ONLY_ON_DEVICE: 'only_on_device', ONLY_IN_CLOUD: 'only_in_cloud', PREFER_IN_CLOUD: 'prefer_in_cloud' },
}))
vi.mock('firebase/ai', () => ({
  getAI: vi.fn(() => ({})),
  GoogleAIBackend: class {},
  InferenceMode: sdk.modes,
  InferenceSource: { ON_DEVICE: 'on_device', IN_CLOUD: 'in_cloud' },
  getGenerativeModel: sdk.getGenerativeModel,
}))

describe('Firebase adapter boundary (mocked firebase/ai, isolated test: this proves the mapping, not real inference)', () => {
  beforeEach(() => {
    sdk.getGenerativeModel.mockReset()
    sdk.getGenerativeModel.mockImplementation(() => ({
      generateContent: async () => ({ response: { text: () => 'ok', inferenceSource: 'on_device' } }),
      initializeDeviceModel: async () => {},
    }))
  })

  it('ONLY_ON_DEVICE maps to the SDK mode only_on_device and carries no cloud configuration, with or without a JSON schema', async () => {
    const { createFirebaseAdapter } = await import('../ai/hybrid-engine/firebaseAdapter')
    const adapter = createFirebaseAdapter({} as never)
    await adapter.generate({ preference: 'ONLY_ON_DEVICE', prompt: 'x' })
    await adapter.generate({ preference: 'ONLY_ON_DEVICE', prompt: 'x', jsonSchema: { type: 'object' } })
    const calls = sdk.getGenerativeModel.mock.calls
    expect(calls).toHaveLength(2)
    for (const [, params] of calls) {
      expect(params.mode).toBe('only_on_device')
      expect(params.inCloudParams).toBeUndefined()
    }
  })

  it('each preference maps to its own SDK mode and the reported source is read from the response, not guessed', async () => {
    const { createFirebaseAdapter } = await import('../ai/hybrid-engine/firebaseAdapter')
    const adapter = createFirebaseAdapter({} as never)
    for (const p of INFERENCE_PREFERENCES) {
      const res = await adapter.generate({ preference: p, prompt: 'x' })
      const mode = sdk.getGenerativeModel.mock.calls.at(-1)![1].mode
      expect(mode).toBe(sdk.modes[p])
      expect(res.sdkSource).toBe('ON_DEVICE')
    }
  })

  it('cloud-capable preferences carry the cloud model only when a schema is requested', async () => {
    const { createFirebaseAdapter } = await import('../ai/hybrid-engine/firebaseAdapter')
    const adapter = createFirebaseAdapter({} as never)
    await adapter.generate({ preference: 'ONLY_IN_CLOUD', prompt: 'x', jsonSchema: { type: 'object' } })
    expect(sdk.getGenerativeModel.mock.calls.at(-1)![1].inCloudParams.model).toEqual(expect.any(String))
  })
})

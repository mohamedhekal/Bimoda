import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HybridEngine } from '../ai/hybrid-engine/engine'
import type { ModelAdapter } from '../ai/hybrid-engine/types'

// A controllable stand-in for the Remote Config SDK (isolated test: it proves our handling of the SDK's states, not Firebase itself).
const sdk = vi.hoisted(() => {
  const state = {
    fetchTimeMillis: 0,
    active: {} as Record<string, string>,
    pending: {} as Record<string, string>,
    failFetch: false,
    realtimeThrows: false,
    observer: null as null | { next: () => void; error: () => void; complete: () => void },
    fetches: 0,
  }
  const rc = {
    settings: {} as Record<string, number>,
    defaultConfig: {} as Record<string, unknown>,
    get fetchTimeMillis() {
      return state.fetchTimeMillis
    },
  }
  return { state, rc }
})
const T0 = 1_800_000_000_000

vi.mock('../firebase/app', () => ({ getFirebaseApp: () => ({}) }))
vi.mock('firebase/remote-config', () => ({
  getRemoteConfig: () => sdk.rc,
  fetchAndActivate: vi.fn(async () => {
    sdk.state.fetches++
    if (sdk.state.failFetch) throw new Error('network')
    sdk.state.active = { ...sdk.state.pending }
    sdk.state.fetchTimeMillis = Date.now()
    return true
  }),
  activate: vi.fn(async () => {
    sdk.state.active = { ...sdk.state.pending }
    return true
  }),
  onConfigUpdate: vi.fn((_rc: unknown, observer: NonNullable<typeof sdk.state.observer>) => {
    if (sdk.state.realtimeThrows) throw new Error('unsupported')
    sdk.state.observer = observer
    return () => void (sdk.state.observer = null)
  }),
  getValue: (_rc: unknown, key: string) => {
    const raw = sdk.state.active[key] ?? String((sdk.rc.defaultConfig as Record<string, unknown>)[key])
    return { asString: () => raw, asNumber: () => Number(raw), asBoolean: () => raw === 'true' }
  },
}))

const load = async () => {
  vi.resetModules()
  return import('../firebase/remoteConfig')
}
const engineFor = (rcBool: () => boolean) => {
  const calls: string[] = []
  const adapter: ModelAdapter = {
    generate: async (r) => (calls.push(r.preference), { text: 'ok', sdkSource: 'IN_CLOUD' }),
    initializeDeviceModel: async () => {},
    probeDevice: async () => ({ state: 'ready' }),
  }
  return {
    calls,
    engine: new HybridEngine({
      adapter,
      getSettings: () => ({ privacyMode: 'hybrid', allowIdentifiableCloud: false }),
      isOnline: () => true,
      cloudEnabled: rcBool,
    }),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  Object.assign(sdk.state, { fetchTimeMillis: 0, active: {}, pending: {}, failFetch: false, realtimeThrows: false, observer: null, fetches: 0 })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('Remote Config behaviour', () => {
  it('unavailable at startup: uses the in-code defaults (fail-open) and reports error, never throws', async () => {
    sdk.state.failFetch = true
    const m = await load()
    await expect(m.initRemoteConfig()).resolves.toBe('error')
    expect(m.rcBool('cloud_inference_enabled')).toBe(true)
    expect(m.rcNumber('ai_timeout_ms')).toBe(45_000)
    expect(m.rcString('cloud_model')).toBe('gemini-3.5-flash-lite')
    expect(m.rcInfo().fetchedAt).toBeNull()
  })

  it('unavailable at startup with VITE_CLOUD_FAIL_CLOSED=true: cloud stays OFF until a fetch succeeds', async () => {
    vi.stubEnv('VITE_CLOUD_FAIL_CLOSED', 'true')
    sdk.state.failFetch = true
    const m = await load()
    await m.initRemoteConfig()
    expect(m.rcBool('cloud_inference_enabled')).toBe(false)
    sdk.state.failFetch = false
    await m.initRemoteConfig() // a later successful fetch re-enables it
    expect(m.rcStatus()).toBe('live')
    expect(m.rcBool('cloud_inference_enabled')).toBe(true)
  })

  it('live values are applied and reported fresh', async () => {
    sdk.state.pending = { cloud_inference_enabled: 'false', ai_timeout_ms: '20000', cloud_model: 'custom-model' }
    const m = await load()
    await expect(m.initRemoteConfig()).resolves.toBe('live')
    expect(m.rcBool('cloud_inference_enabled')).toBe(false)
    expect(m.rcNumber('ai_timeout_ms')).toBe(20_000)
    expect(m.rcString('cloud_model')).toBe('custom-model')
    expect(m.rcInfo().realtime).toBe(true)
  })

  it('stale: after an hour without a successful fetch the status is stale but the last values stay in force', async () => {
    sdk.state.pending = { cloud_inference_enabled: 'false' }
    const m = await load()
    await m.initRemoteConfig()
    expect(m.rcInfo().status).toBe('live')
    vi.setSystemTime(T0 + m.STALE_AFTER_MS + 60_000)
    expect(m.rcInfo().status).toBe('stale')
    expect(m.rcBool('cloud_inference_enabled')).toBe(false) // last known value, not silently reset to the default
  })

  it('a failed refresh after a successful fetch keeps the last values and reports stale', async () => {
    sdk.state.pending = { cloud_inference_enabled: 'false' }
    const m = await load()
    await m.initRemoteConfig()
    sdk.state.failFetch = true
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(10)
    expect(m.rcInfo().status).toBe('stale')
    expect(m.rcBool('cloud_inference_enabled')).toBe(false)
    sdk.state.failFetch = false
    await m.initRemoteConfig()
    expect(m.rcInfo().status).toBe('live')
  })

  it('updated while the tab is open: the realtime update flips the switch without a reload and the engine obeys it immediately', async () => {
    sdk.state.pending = { cloud_inference_enabled: 'true' }
    const m = await load()
    await m.initRemoteConfig()
    const { engine, calls } = engineFor(() => m.rcBool('cloud_inference_enabled'))
    expect((await engine.run({ feature: 't', preference: 'ONLY_IN_CLOUD', prompt: 'x' })).record.status).toBe('success')

    sdk.state.pending = { cloud_inference_enabled: 'false' } // operator publishes the new template
    sdk.state.observer!.next() // the realtime channel notifies the open tab
    await vi.advanceTimersByTimeAsync(10)
    const blocked = await engine.run({ feature: 't', preference: 'ONLY_IN_CLOUD', prompt: 'x' })
    expect(blocked.record.status).toBe('blocked_privacy')
    expect(blocked.record.reason).toMatch(/Remote Config/)
    expect(calls).toEqual(['ONLY_IN_CLOUD']) // the blocked run never reached the adapter
    expect(sdk.state.fetches).toBe(1) // no extra polling fetch was needed

    sdk.state.pending = { cloud_inference_enabled: 'true' } // and back on
    sdk.state.observer!.next()
    await vi.advanceTimersByTimeAsync(10)
    expect((await engine.run({ feature: 't', preference: 'ONLY_IN_CLOUD', prompt: 'x' })).record.status).toBe('success')
  })

  it('without realtime support it still works through periodic fetches', async () => {
    sdk.state.realtimeThrows = true
    sdk.state.pending = { cloud_inference_enabled: 'true' }
    const m = await load()
    await expect(m.initRemoteConfig()).resolves.toBe('live')
    expect(m.rcInfo().realtime).toBe(false)
    sdk.state.pending = { cloud_inference_enabled: 'false' }
    await m.initRemoteConfig() // the next scheduled/visibility fetch
    expect(m.rcBool('cloud_inference_enabled')).toBe(false)
  })

  it('a bad remote timeout can never disable the engine timeout', async () => {
    const m = await load()
    for (const bad of ['5', '-1', 'abc', '99999999', '0']) {
      sdk.state.pending = { ai_timeout_ms: bad }
      await m.initRemoteConfig()
      expect(m.rcNumber('ai_timeout_ms'), bad).toBe(45_000)
    }
    sdk.state.pending = { ai_timeout_ms: '30000' }
    await m.initRemoteConfig()
    expect(m.rcNumber('ai_timeout_ms')).toBe(30_000)
  })
})

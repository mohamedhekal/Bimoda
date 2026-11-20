import { fetchAndActivate, getRemoteConfig, getValue, type RemoteConfig } from 'firebase/remote-config'
import { getFirebaseApp } from './app'

/** In-code defaults: used until the first fetch succeeds, and whenever Remote Config is unreachable. */
export const RC_DEFAULTS = { cloud_model: 'gemini-3.5-flash-lite', ai_timeout_ms: 45_000, cloud_inference_enabled: true } as const

export type RcStatus = 'default' | 'live' | 'error'
export let rcStatus: RcStatus = 'default'
let rc: RemoteConfig | null = null

/** Fetches operator-controlled values (cloud model, timeout, cloud kill switch). Never blocks startup and never throws. */
export async function initRemoteConfig(): Promise<RcStatus> {
  const app = getFirebaseApp()
  if (!app) return rcStatus
  try {
    rc = getRemoteConfig(app)
    rc.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 0 : 3_600_000
    rc.settings.fetchTimeoutMillis = 8_000
    rc.defaultConfig = { ...RC_DEFAULTS }
    await fetchAndActivate(rc)
    rcStatus = 'live'
  } catch {
    rcStatus = 'error'
  }
  return rcStatus
}

export const rcString = (key: 'cloud_model'): string => (rc ? getValue(rc, key).asString() : RC_DEFAULTS[key]) || RC_DEFAULTS[key]
export const rcNumber = (key: 'ai_timeout_ms'): number => {
  const n = rc ? getValue(rc, key).asNumber() : RC_DEFAULTS[key]
  return Number.isFinite(n) && n >= 1000 && n <= 300_000 ? n : RC_DEFAULTS[key] // clamp: a bad remote value must not disable the timeout
}
export const rcBool = (key: 'cloud_inference_enabled'): boolean => (rc ? getValue(rc, key).asBoolean() : RC_DEFAULTS[key])

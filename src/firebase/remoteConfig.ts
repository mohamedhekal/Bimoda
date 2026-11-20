import { activate, fetchAndActivate, getRemoteConfig, getValue, onConfigUpdate, type RemoteConfig } from 'firebase/remote-config'
import { getFirebaseApp } from './app'

/** In-code defaults: used until the first fetch succeeds, and whenever Remote Config is unreachable. */
export const RC_DEFAULTS = { cloud_model: 'gemini-3.5-flash-lite', ai_timeout_ms: 45_000, cloud_inference_enabled: true } as const

/** How old the last successful fetch may be before the values are reported as stale. */
export const STALE_AFTER_MS = 60 * 60 * 1000
/** Production minimum fetch interval (the SDK default is 12 h). Open tabs also receive realtime updates. */
const FETCH_INTERVAL_MS = 5 * 60 * 1000

export type RcStatus = 'default' | 'live' | 'stale' | 'error'
export interface RcInfo {
  status: RcStatus
  /** epoch ms of the last successful fetch, if any */
  fetchedAt: number | null
  /** true when a realtime-update listener is attached (open tabs get changes without polling) */
  realtime: boolean
  failClosed: boolean
}

let rc: RemoteConfig | null = null
const listeners = new Set<() => void>()
let snapshot: RcInfo | null = null
/** Tell the UI that something observable changed (fetch outcome, realtime update, freshness). */
const emit = () => {
  snapshot = rcInfo()
  listeners.forEach((l) => l())
}
export const subscribeRc = (cb: () => void): (() => void) => {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}
/** Stable snapshot for useSyncExternalStore: only replaced by emit(). */
export const getRcSnapshot = (): RcInfo => (snapshot ??= rcInfo())
let lastError = false
let realtime = false
let unsubscribe: (() => void) | null = null

/**
 * Optional safe-by-default mode (VITE_CLOUD_FAIL_CLOSED=true): cloud inference stays OFF until Remote Config has been
 * fetched successfully. Default is fail-open (availability): if Remote Config is unreachable the in-code default (on) applies.
 */
export const failClosed = (): boolean => import.meta.env.VITE_CLOUD_FAIL_CLOSED === 'true'

/** Pure so it can be tested: classifies freshness from the facts the SDK exposes. */
export function classify(p: { hasConfig: boolean; fetchedAt: number | null; lastFetchFailed: boolean; now: number }): RcStatus {
  if (!p.hasConfig) return 'default'
  if (p.fetchedAt === null || p.fetchedAt <= 0) return p.lastFetchFailed ? 'error' : 'default'
  if (p.lastFetchFailed) return 'stale'
  return p.now - p.fetchedAt > STALE_AFTER_MS ? 'stale' : 'live'
}

export function rcInfo(now = Date.now()): RcInfo {
  const fetchedAt = rc && rc.fetchTimeMillis > 0 ? rc.fetchTimeMillis : null
  return { status: classify({ hasConfig: rc !== null, fetchedAt, lastFetchFailed: lastError, now }), fetchedAt, realtime, failClosed: failClosed() }
}
export const rcStatus = (): RcStatus => rcInfo().status

async function refresh(): Promise<void> {
  if (!rc) return
  try {
    await fetchAndActivate(rc)
    lastError = false
  } catch {
    lastError = true // keep the last activated values (or the defaults); status becomes stale/error
  }
  emit()
}

/** Fetches operator-controlled values and keeps them fresh. Never blocks startup and never throws. */
export async function initRemoteConfig(): Promise<RcStatus> {
  const app = getFirebaseApp()
  if (!app) return rcStatus()
  if (!rc) {
    try {
      rc = getRemoteConfig(app)
      rc.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 0 : FETCH_INTERVAL_MS
      rc.settings.fetchTimeoutMillis = 8_000
      rc.defaultConfig = { ...RC_DEFAULTS }
      // Realtime updates: a changed template (e.g. the cloud switch) reaches open tabs within seconds, no polling needed.
      try {
        unsubscribe = onConfigUpdate(rc, {
          next: () => {
            if (rc)
              void activate(rc).then(() => {
                lastError = false
                emit()
              })
          },
          error: () => {
            realtime = false
            emit()
          },
          complete: () => {
            realtime = false
            emit()
          },
        })
        realtime = true
      } catch {
        realtime = false // unsupported environment: periodic fetch only
      }
      // Re-check when the tab becomes visible again (throttled by minimumFetchIntervalMillis).
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void refresh()
      })
      // freshness depends on time: re-evaluate once a minute so "live" turns into "stale" on screen without any other event
      setInterval(() => {
        if (snapshot && rcInfo().status !== snapshot.status) emit()
      }, 60_000)
    } catch {
      lastError = true
      emit()
      return rcStatus()
    }
  }
  await refresh()
  return rcStatus()
}

export function stopRemoteConfig(): void {
  unsubscribe?.()
  unsubscribe = null
  realtime = false
}

export const rcString = (key: 'cloud_model'): string => (rc ? getValue(rc, key).asString() : RC_DEFAULTS[key]) || RC_DEFAULTS[key]
export const rcNumber = (key: 'ai_timeout_ms'): number => {
  const n = rc ? getValue(rc, key).asNumber() : RC_DEFAULTS[key]
  return Number.isFinite(n) && n >= 1000 && n <= 300_000 ? n : RC_DEFAULTS[key] // clamp: a bad remote value must not disable the timeout
}

/** Pure decision used by the engine: remote value, plus the optional fail-closed rule while nothing has been fetched yet. */
export function cloudAllowed(p: { remoteValue: boolean; status: RcStatus; failClosed: boolean }): boolean {
  if (p.failClosed && (p.status === 'default' || p.status === 'error')) return false
  return p.remoteValue
}
export const rcBool = (key: 'cloud_inference_enabled'): boolean =>
  cloudAllowed({ remoteValue: rc ? getValue(rc, key).asBoolean() : RC_DEFAULTS[key], status: rcStatus(), failClosed: failClosed() })

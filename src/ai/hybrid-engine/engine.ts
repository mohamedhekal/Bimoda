import { redact } from '../privacy/redact'
import type { AiRunRecord, EngineRequest, EngineResult, InferencePreference, InferenceSource, ModelAdapter, PrivacySettings, RunStatus } from './types'

export interface EngineDeps {
  /** null when Firebase is not configured */
  adapter: ModelAdapter | null
  getSettings: () => PrivacySettings
  isOnline?: () => boolean
  now?: () => number
  /** Max wait for one model call (default 45s); may be a getter so it can follow Remote Config */
  timeoutMs?: number
  /** Operator kill switch (Remote Config). false = behave like Local Only mode. */
  cloudEnabled?: () => boolean
  onRecord?: (r: AiRunRecord) => void
}

const CLOUD_CAPABLE = (p: InferencePreference) => p !== 'ONLY_ON_DEVICE'

/** Default preference for features, derived from the user's privacy mode. */
export function defaultPreference(mode: PrivacySettings['privacyMode']): InferencePreference {
  return mode === 'local-only' ? 'ONLY_ON_DEVICE' : mode === 'cloud' ? 'ONLY_IN_CLOUD' : 'PREFER_ON_DEVICE'
}

export class HybridEngine {
  private deps: EngineDeps
  constructor(deps: EngineDeps) {
    this.deps = deps
  }

  async run(req: EngineRequest): Promise<EngineResult> {
    const now = this.deps.now ?? (() => performance.now())
    const t0 = now()
    const settings = this.deps.getSettings()
    const online = (this.deps.isOnline ?? (() => navigator.onLine))()

    const base = {
      id: crypto.randomUUID(),
      feature: req.feature,
      requestedPreference: req.preference,
      effectivePreference: req.preference,
      privacyMode: settings.privacyMode,
      source: null as InferenceSource | null,
      sourceBasis: null as AiRunRecord['sourceBasis'],
      inputChars: req.prompt.length,
      redactions: 0,
      redactionApplied: false,
      timestamp: new Date().toISOString(),
    }
    const finish = (status: RunStatus, extra: Partial<AiRunRecord> = {}, text?: string): EngineResult => {
      const record: AiRunRecord = { ...base, status, durationMs: Math.round(now() - t0), ...extra }
      this.deps.onRecord?.(record)
      return { record, text }
    }

    // 1. Privacy policy gate (runs before any model is touched)
    let effective = req.preference
    const cloudOff = this.deps.cloudEnabled ? !this.deps.cloudEnabled() : false
    if (settings.privacyMode === 'local-only' || cloudOff) {
      if (effective === 'ONLY_IN_CLOUD' || effective === 'PREFER_IN_CLOUD')
        return finish('blocked_privacy', {
          reason:
            cloudOff && settings.privacyMode !== 'local-only'
              ? 'Cloud inference is switched off by the operator (Remote Config).'
              : 'Local Only mode forbids cloud inference.',
        })
      // PREFER_ON_DEVICE could silently fall back to the cloud, so it is tightened.
      effective = 'ONLY_ON_DEVICE'
    }
    base.effectivePreference = effective

    let prompt = req.prompt
    const cloudCapable = CLOUD_CAPABLE(effective)
    if (cloudCapable) {
      if (req.needsIdentifiable && !settings.allowIdentifiableCloud)
        return finish('consent_required', {
          effectivePreference: effective,
          reason: 'This feature needs identifiable text and the request may reach the cloud. Consent is required.',
        })
      if (!settings.allowIdentifiableCloud) {
        const r = redact(req.prompt, req.entities)
        prompt = r.text
        base.redactions = r.count
        base.redactionApplied = true
      }
    }

    // 2. Connectivity (never fabricate offline output)
    if (!online && effective === 'ONLY_IN_CLOUD')
      return finish('offline', { effectivePreference: effective, reason: 'Device is offline and this request is cloud-only.' })

    // 3. Configuration
    if (!this.deps.adapter)
      return finish('config_missing', {
        effectivePreference: effective,
        reason: 'Firebase is not configured. Add VITE_FIREBASE_* values (see FIREBASE_SETUP.md).',
      })

    // 4. Real Firebase AI Logic call
    const timeoutMs = this.deps.timeoutMs ?? 45_000
    const controller = new AbortController()
    const onUserAbort = () => controller.abort()
    req.signal?.addEventListener('abort', onUserAbort, { once: true })
    if (req.signal?.aborted) controller.abort()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      // A hung on-device session must never freeze the UI: race the SDK call against a timeout and a user cancel.
      const guard = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          // reject before aborting: the abort listener below would otherwise win and report a timeout as "cancelled"
          reject(
            new Error(
              `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for the ${effective.includes('ON_DEVICE') ? 'on-device model (the Chrome model session may be stuck: reload this page to reset it)' : 'model'}.`,
            ),
          )
          controller.abort()
        }, timeoutMs)
        controller.signal.addEventListener('abort', () => reject(new CancelledError()), { once: true })
      })
      const res = await Promise.race([
        this.deps.adapter.generate({ preference: effective, prompt, jsonSchema: req.jsonSchema, signal: controller.signal }),
        guard,
      ])
      let source = res.sdkSource ?? null
      let basis: AiRunRecord['sourceBasis'] = source ? 'sdk' : null
      // Only ONLY_* modes guarantee the route; PREFER_* without an SDK-reported source stays unknown (never guessed).
      if (!source && effective === 'ONLY_ON_DEVICE') {
        source = 'ON_DEVICE'
        basis = 'mode'
      } else if (!source && effective === 'ONLY_IN_CLOUD') {
        source = 'IN_CLOUD'
        basis = 'mode'
      }
      return finish('success', { source, sourceBasis: basis }, res.text)
    } catch (e) {
      if (e instanceof CancelledError) return finish('cancelled', { reason: 'Cancelled by user.' })
      const message = e instanceof Error ? e.message : String(e)
      // "unavailable" only for failures that are about the on-device path; cloud/network/App Check errors stay "error".
      const deviceFailure = effective === 'ONLY_ON_DEVICE' || /on-?device|language ?model|prompt api/i.test(message)
      return finish(deviceFailure ? 'unavailable' : 'error', { reason: message.slice(0, 300) })
    } finally {
      clearTimeout(timer)
      req.signal?.removeEventListener('abort', onUserAbort)
    }
  }
}

class CancelledError extends Error {
  constructor() {
    super('cancelled')
  }
}

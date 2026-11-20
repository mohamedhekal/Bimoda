import type { InferencePreference, PrivacyMode, RunStatus } from './types'

export interface RouteInput {
  privacyMode: PrivacyMode
  preference: InferencePreference
  /** Remote Config switch (already combined with the fail-closed rule) */
  cloudEnabled: boolean
  online: boolean
  allowIdentifiableCloud: boolean
  needsIdentifiable?: boolean
}

export interface RoutePlan {
  /** The preference actually handed to the SDK */
  effective: InferencePreference
  /** Could this request reach the cloud model? (false for ONLY_ON_DEVICE: the SDK never falls back) */
  mayReachCloud: boolean
  /** Redaction is applied before the SDK call */
  redact: boolean
  /** Set when the request must not run at all */
  blocked: { status: Extract<RunStatus, 'blocked_privacy' | 'consent_required' | 'offline'>; reason: string } | null
  /** Human-readable steps, used by Privacy Proof Mode */
  steps: string[]
}

const CLOUD_PREFS: InferencePreference[] = ['ONLY_IN_CLOUD', 'PREFER_IN_CLOUD']

/**
 * The single source of truth for privacy routing. HybridEngine executes this plan; Privacy Proof Mode explains it.
 * It only decides what is *allowed*: whether Gemini Nano or the cloud model actually answers is decided by the Firebase SDK.
 */
export function planRoute(i: RouteInput): RoutePlan {
  const steps: string[] = []
  const cloudOff = !i.cloudEnabled
  let effective = i.preference

  if (i.privacyMode === 'local-only' || cloudOff) {
    const why = i.privacyMode === 'local-only' ? 'Local Only mode forbids cloud inference.' : 'Cloud inference is switched off by the operator (Remote Config).'
    if (CLOUD_PREFS.includes(effective)) {
      steps.push(`Blocked: ${why}`)
      return { effective, mayReachCloud: false, redact: false, blocked: { status: 'blocked_privacy', reason: why }, steps }
    }
    if (effective !== 'ONLY_ON_DEVICE') steps.push('PREFER_ON_DEVICE tightened to ONLY_ON_DEVICE so the SDK cannot silently fall back to the cloud.')
    effective = 'ONLY_ON_DEVICE'
    steps.push(i.privacyMode === 'local-only' ? 'Local Only: the prompt stays on this device.' : 'Cloud switched off: the prompt stays on this device.')
  }

  const mayReachCloud = effective !== 'ONLY_ON_DEVICE'
  if (!mayReachCloud)
    return { effective, mayReachCloud, redact: false, blocked: null, steps: [...steps, 'No redaction needed: nothing is sent to the cloud model.'] }

  if (i.needsIdentifiable && !i.allowIdentifiableCloud) {
    const reason = 'This feature needs identifiable text and the request may reach the cloud. Consent is required.'
    return { effective, mayReachCloud, redact: false, blocked: { status: 'consent_required', reason }, steps: [...steps, `Blocked: ${reason}`] }
  }

  const redact = !i.allowIdentifiableCloud
  steps.push(
    redact
      ? 'May reach the cloud: names, phones, emails and addresses are redacted first.'
      : 'May reach the cloud: identifiable text is sent because consent is on.',
  )

  if (!i.online && effective === 'ONLY_IN_CLOUD') {
    const reason = 'Device is offline and this request is cloud-only.'
    return { effective, mayReachCloud, redact, blocked: { status: 'offline', reason }, steps: [...steps, `Blocked: ${reason}`] }
  }
  steps.push(
    effective === 'PREFER_ON_DEVICE'
      ? 'The SDK decides: Gemini Nano if available, otherwise the cloud model.'
      : effective === 'ONLY_IN_CLOUD'
        ? 'The SDK sends the request to the cloud model.'
        : 'The SDK prefers the cloud model and may fall back to on-device.',
  )
  return { effective, mayReachCloud, redact, blocked: null, steps }
}

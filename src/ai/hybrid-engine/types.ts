export const INFERENCE_PREFERENCES = ['PREFER_ON_DEVICE', 'ONLY_ON_DEVICE', 'PREFER_IN_CLOUD', 'ONLY_IN_CLOUD'] as const
export type InferencePreference = (typeof INFERENCE_PREFERENCES)[number]

export type InferenceSource = 'ON_DEVICE' | 'IN_CLOUD'
export type PrivacyMode = 'hybrid' | 'local-only' | 'cloud'

export type RunStatus =
  | 'success'
  | 'unavailable' // requested path cannot run (e.g. ONLY_ON_DEVICE without Gemini Nano)
  | 'blocked_privacy'
  | 'consent_required'
  | 'offline'
  | 'config_missing'
  | 'cancelled'
  | 'error'

export interface PrivacySettings {
  privacyMode: PrivacyMode
  /** User explicitly consented to send identifiable (non-redacted) text to the cloud */
  allowIdentifiableCloud: boolean
}

export interface AdapterRequest {
  preference: InferencePreference
  prompt: string
  /** JSON schema for structured output (on-device responseConstraint; cloud uses JSON mime type) */
  jsonSchema?: object
  signal?: AbortSignal
}

export interface AdapterResponse {
  text: string
  /** Value of response.inferenceSource from the Firebase AI Logic SDK, when reported */
  sdkSource?: InferenceSource
}

export interface DeviceModelStatus {
  state: 'unsupported' | 'unknown' | 'downloadable' | 'downloading' | 'available' | 'ready' | 'failed'
  detail?: string
}

export interface ModelAdapter {
  generate(req: AdapterRequest): Promise<AdapterResponse>
  /** Must be called from a user gesture (Chrome user-activation requirement). */
  initializeDeviceModel(onProgress: (fraction: number) => void): Promise<void>
  probeDevice(): Promise<DeviceModelStatus>
}

export interface EngineRequest {
  feature: string
  preference: InferencePreference
  prompt: string
  jsonSchema?: object
  /** Known identifiers used by deterministic redaction */
  entities?: import('../privacy/redact').KnownEntities
  /** Feature cannot work with redacted text; needs explicit consent before any cloud path */
  needsIdentifiable?: boolean
  signal?: AbortSignal
}

export interface AiRunRecord {
  id: string
  feature: string
  requestedPreference: InferencePreference
  effectivePreference: InferencePreference
  privacyMode: PrivacyMode
  /** ON_DEVICE / IN_CLOUD only when a model actually produced output */
  source: InferenceSource | null
  /** 'sdk' = read from response.inferenceSource; 'mode' = SDK did not report, derived from an ONLY_* mode guarantee */
  sourceBasis: 'sdk' | 'mode' | null
  status: RunStatus
  durationMs: number
  inputChars: number
  redactions: number
  redactionApplied: boolean
  reason?: string
  timestamp: string
}

export interface EngineResult {
  record: AiRunRecord
  text?: string
}

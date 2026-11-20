import type { FirebaseApp } from 'firebase/app'
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, InferenceSource as SdkSource, type GenerativeModel } from 'firebase/ai'
import { rcString } from '../../firebase/remoteConfig'
import type { AdapterRequest, AdapterResponse, DeviceModelStatus, InferenceSource, ModelAdapter } from './types'

interface LanguageModelGlobal {
  availability(opts?: unknown): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>
}

/** Cloud model: VITE_CLOUD_MODEL wins, otherwise the Remote Config value `cloud_model` (default per Firebase docs for SDK v13). */
const cloudModel = () => (import.meta.env.VITE_CLOUD_MODEL as string | undefined) || rcString('cloud_model')

const MODE = {
  PREFER_ON_DEVICE: InferenceMode.PREFER_ON_DEVICE,
  ONLY_ON_DEVICE: InferenceMode.ONLY_ON_DEVICE,
  PREFER_IN_CLOUD: InferenceMode.PREFER_IN_CLOUD,
  ONLY_IN_CLOUD: InferenceMode.ONLY_IN_CLOUD,
} as const

/**
 * Thin wrapper over the official Firebase AI Logic hybrid SDK (firebase/ai).
 * It performs NO routing of its own: the SDK decides on-device vs cloud from `mode`.
 */
export function createFirebaseAdapter(app: FirebaseApp): ModelAdapter {
  const ai = getAI(app, { backend: new GoogleAIBackend() })
  const cache = new Map<string, GenerativeModel>()

  const modelFor = (req: Pick<AdapterRequest, 'preference' | 'jsonSchema'>): GenerativeModel => {
    const key = `${cloudModel()}:${req.preference}:${req.jsonSchema ? JSON.stringify(req.jsonSchema) : ''}`
    let m = cache.get(key)
    if (!m) {
      m = getGenerativeModel(ai, {
        mode: MODE[req.preference],
        onDeviceParams: {
          createOptions: {
            expectedInputs: [{ type: 'text', languages: ['en'] }],
            expectedOutputs: [{ type: 'text', languages: ['en'] }],
          },
          ...(req.jsonSchema ? { promptOptions: { responseConstraint: req.jsonSchema } } : {}),
        },
        // ONLY_ON_DEVICE is never given any cloud configuration: nothing in the request can name a cloud model
        ...(req.jsonSchema && req.preference !== 'ONLY_ON_DEVICE'
          ? { inCloudParams: { model: cloudModel(), generationConfig: { responseMimeType: 'application/json' } } }
          : {}),
      })
      cache.set(key, m)
    }
    return m
  }

  return {
    async generate(req) {
      const model = modelFor(req)
      const result = await model.generateContent(req.prompt, req.signal ? { signal: req.signal } : undefined)
      const raw = result.response.inferenceSource
      const sdkSource: InferenceSource | undefined = raw === SdkSource.ON_DEVICE ? 'ON_DEVICE' : raw === SdkSource.IN_CLOUD ? 'IN_CLOUD' : undefined
      return { text: result.response.text(), sdkSource } satisfies AdapterResponse
    },

    async initializeDeviceModel(onProgress) {
      // Per the docs this must run on/after a user gesture (Chrome user activation).
      await modelFor({ preference: 'ONLY_ON_DEVICE' }).initializeDeviceModel(onProgress)
    },

    async probeDevice(): Promise<DeviceModelStatus> {
      const lm = (globalThis as unknown as { LanguageModel?: LanguageModelGlobal }).LanguageModel
      if (!lm) return { state: 'unsupported', detail: 'Chrome Prompt API (LanguageModel) not found. Use desktop Chrome 139+ with the Prompt API flag enabled.' }
      try {
        const a = await lm.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] })
        if (a === 'unavailable') return { state: 'unsupported', detail: 'Chrome reports the on-device model is unavailable on this device.' }
        return { state: a }
      } catch (e) {
        return { state: 'unknown', detail: e instanceof Error ? e.message : String(e) }
      }
    },
  }
}

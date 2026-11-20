import { HybridEngine } from './hybrid-engine/engine'
import { createFirebaseAdapter } from './hybrid-engine/firebaseAdapter'
import type { ModelAdapter } from './hybrid-engine/types'
import { getFirebaseApp } from '../firebase/app'
import { rcBool, rcNumber } from '../firebase/remoteConfig'
import { addRun, getState } from '../stores/store'

let adapter: ModelAdapter | null | undefined

export function getAdapter(): ModelAdapter | null {
  if (adapter === undefined) {
    const app = getFirebaseApp()
    adapter = app ? createFirebaseAdapter(app) : null
  }
  return adapter
}

export const engine = new HybridEngine({
  get adapter() {
    return getAdapter()
  },
  getSettings: () => getState().settings,
  get timeoutMs() {
    return rcNumber('ai_timeout_ms')
  },
  cloudEnabled: rcBool.bind(null, 'cloud_inference_enabled'),
  onRecord: addRun,
})

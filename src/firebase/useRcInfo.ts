import { useSyncExternalStore } from 'react'
import { getRcSnapshot, subscribeRc, type RcInfo } from './remoteConfig'

/** Re-renders when Remote Config is fetched, updated in real time, fails, or goes stale. */
export const useRcInfo = (): RcInfo => useSyncExternalStore(subscribeRc, getRcSnapshot)

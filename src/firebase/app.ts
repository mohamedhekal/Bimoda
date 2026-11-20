import { initializeApp, type FirebaseApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'

const env = import.meta.env
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId)

export type AppCheckState = 'off' | 'debug' | 'production'
export let appCheckState: AppCheckState = 'off'

let app: FirebaseApp | null = null

/** Initializes Firebase and App Check once. Returns null when env config is missing. */
export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null
  if (app) return app
  const debug = env.VITE_APPCHECK_DEBUG === 'true'
  // The debug token must be registered in the console and must never be committed. It is only honored in dev builds.
  if (debug && env.DEV) {
    ;(self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true
  }
  app = initializeApp(config)
  const siteKey = env.VITE_APPCHECK_SITE_KEY
  if ((debug && env.DEV) || siteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey || 'debug-placeholder'),
      isTokenAutoRefreshEnabled: true,
    })
    appCheckState = debug && env.DEV ? 'debug' : 'production'
  }
  return app
}

import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore'
import { getFirebaseApp } from './app'

let db: Firestore | null = null

/** Firestore with an IndexedDB cache, so previously synced data stays readable offline and writes queue until reconnect. */
export function getDb(): Firestore {
  if (db) return db
  const app = getFirebaseApp()
  if (!app) throw new Error('Firebase is not configured.')
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  } catch {
    db = getFirestore(app) // already initialized (e.g. hot reload) or persistence unsupported
  }
  return db
}

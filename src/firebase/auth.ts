import {
  getAuth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { getFirebaseApp } from './app'

export const authAvailable = (): boolean => getFirebaseApp() !== null

export function subscribeAuth(cb: (u: User | null) => void): () => void {
  const app = getFirebaseApp()
  if (!app) {
    cb(null)
    return () => {}
  }
  return onAuthStateChanged(getAuth(app), cb)
}

const auth = () => {
  const app = getFirebaseApp()
  if (!app) throw new Error('Firebase is not configured.')
  return getAuth(app)
}

export const signInWithGoogle = () => signInWithPopup(auth(), new GoogleAuthProvider())
export const signInWithEmail = (email: string, password: string) => signInWithEmailAndPassword(auth(), email, password)
export const signUpWithEmail = (email: string, password: string) => createUserWithEmailAndPassword(auth(), email, password)
export const signOutUser = () => signOut(auth())

/** Maps Firebase Auth error codes to messages a non-technical user can act on. */
export function friendlyAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  const map: Record<string, string> = {
    'auth/configuration-not-found':
      'Firebase Authentication is not set up for this project yet. In Firebase Console open Authentication → Get started, then enable Email/Password and Google.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled for the project yet. Enable it in Firebase Console → Authentication → Sign-in method.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/invalid-email': 'That email address is not valid.',
    'auth/email-already-in-use': 'An account with this email already exists. Try signing in.',
    'auth/weak-password': 'Choose a password with at least 6 characters.',
    'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
    'auth/popup-blocked': 'The browser blocked the sign-in popup. Allow popups for this site and retry.',
    'auth/network-request-failed': 'Network error. Check your connection and retry.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  }
  return map[code] ?? (e instanceof Error ? e.message : 'Sign-in failed.')
}

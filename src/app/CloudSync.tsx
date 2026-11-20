import { useEffect } from 'react'
import { subscribeAuth } from '../firebase/auth'
import { startCloud, stopCloud } from '../services/cloud'

/** Starts realtime Firestore sync when a user signs in and returns to local demo data on sign-out. */
export function CloudSync() {
  useEffect(() => {
    const off = subscribeAuth((user) => {
      if (user) void startCloud(user)
      else void stopCloud()
    })
    return () => {
      off()
      void stopCloud()
    }
  }, [])
  return null
}

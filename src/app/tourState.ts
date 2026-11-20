import { useSyncExternalStore } from 'react'

let step: number | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Tiny shared store so the command palette can start the tour that the shell renders. */
export const setTourStep = (n: number | null) => {
  step = n
  emit()
}

export function useTourStep() {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => step,
  )
  return { step: value, setStep: setTourStep }
}
